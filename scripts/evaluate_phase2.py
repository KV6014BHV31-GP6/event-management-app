"""Offline evaluation calculator. No networking or product/database mutation."""
import argparse
import hashlib
import json
import math
import re
from pathlib import Path
from statistics import mean, median

ERRORS = {'navigation', 'validation', 'duplicate_action', 'authorization',
          'data_mismatch', 'uncertain_recovery', 'language', 'accessibility'}
ROLES = {'participant', 'guest', 'organizer', 'leader', 'ngo_staff'}
COSTS = {'hosting', 'database', 'storage', 'support', 'training', 'notifications', 'security'}


def number(value, minimum=0, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Expected a finite number, not a boolean')
    if value < minimum or (maximum is not None and value > maximum):
        raise ValueError('Number outside declared range')
    return value


def sus(values):
    if values is None:
        return None
    if len(values) != 10:
        raise ValueError('SUS requires all ten original items; no imputation')
    for value in values:
        number(value, 1, 5)
        if not isinstance(value, int):
            raise ValueError('SUS responses must be integers1..5')
    return 2.5 * sum(v - 1 if i % 2 == 0 else 5 - v for i, v in enumerate(values))


def usability(data):
    kind = data['kind']
    if kind not in {'synthetic_pilot', 'human_study'}:
        raise ValueError('Declare synthetic_pilot or human_study')
    groups, identities = {}, set()
    for session in data['sessions']:
        anonymous_id = session['anonymous_id']
        if not anonymous_id.startswith('P') or not anonymous_id[1:].isdigit():
            raise ValueError('Use anonymous P-number identifiers only')
        key = (anonymous_id, session['version'])
        if key in identities:
            raise ValueError('Duplicate participant/version session')
        identities.add(key)
        if session['role'] not in ROLES or session['language'] not in {'en', 'ms'}:
            raise ValueError('Unknown role/language')
        if kind == 'human_study' and session.get('consent') is not True:
            raise ValueError('Human session needs recorded consent')
        group = (session['version'], session['role'], session['device'], session['language'])
        bucket = groups.setdefault(group, {'attempts': 0, 'successes': 0, 'error_tasks': 0,
                                          'error_events': 0, 'all_times': [], 'success_times': [],
                                          'seq': [], 'sus': [], 'not_run': 0})
        score = sus(session.get('sus'))
        if score is not None:
            bucket['sus'].append(score)
        seen = set()
        for task in session['tasks']:
            task_id = task['task_id']
            if task_id not in {f'U{i}' for i in range(1, 11)} or task_id in seen:
                raise ValueError('Invalid or repeated task')
            seen.add(task_id)
            if task['attempted'] is False:
                if task.get('result') is not None or task.get('seq') is not None or task.get('seconds') is not None or task.get('errors'):
                    raise ValueError('NOT_RUN cannot carry invented outcomes or ratings')
                bucket['not_run'] += 1
                continue
            if task['attempted'] is not True or task['result'] not in {'success', 'fail'}:
                raise ValueError('Attempted task requires success/fail')
            events = task['errors']
            if not isinstance(events, list) or any(e not in ERRORS for e in events):
                raise ValueError('Unknown predefined error event')
            bucket['attempts'] += 1
            success = task['result'] == 'success'
            bucket['successes'] += success
            bucket['error_tasks'] += bool(events)
            bucket['error_events'] += len(events)
            duration = task.get('seconds')
            if duration is not None:
                number(duration)
                bucket['all_times'].append(duration)
                if success:
                    bucket['success_times'].append(duration)
            seq = task.get('seq')
            if seq is not None:
                number(seq, 1, 7)
                if not isinstance(seq, int):
                    raise ValueError('SEQ must be an integer1..7')
                bucket['seq'].append(seq)
    rows = []
    for key, b in sorted(groups.items()):
        n = b['attempts']
        rows.append({'version': key[0], 'role': key[1], 'device': key[2], 'language': key[3],
                     'attempted_tasks': n, 'successes': b['successes'], 'not_run_tasks': b['not_run'],
                     'success_rate': b['successes']/n if n else None,
                     'tasks_with_error_rate': b['error_tasks']/n if n else None,
                     'error_events_per_attempt': b['error_events']/n if n else None,
                     'median_seconds_all_attempts': median(b['all_times']) if b['all_times'] else None,
                     'median_seconds_success_only': median(b['success_times']) if b['success_times'] else None,
                     'timed_attempts': len(b['all_times']), 'timed_success_attempts': len(b['success_times']), 'seq_n': len(b['seq']),
                     'seq_mean': mean(b['seq']) if b['seq'] else None,
                     'sus_n': len(b['sus']), 'sus_mean': mean(b['sus']) if b['sus'] else None})
    return {'kind': kind, 'status': 'SYNTHETIC_PILOT_NOT_HUMAN_FINDINGS' if kind == 'synthetic_pilot' else 'DECLARED_HUMAN_INPUT_NOT_INDEPENDENTLY_VERIFIED',
            'study_verified': False, 'groups': rows,
            'comparison': 'Compare matched version/role/device/language cohorts only; no causal impact claim.'}


def cost(data):
    if data.get('period', 'month') != 'month':
        raise ValueError('Costs must be explicitly normalized to month; no automatic amortization')
    entries = data['monthly_costs']
    if set(entries) != COSTS:
        raise ValueError('All seven cost categories must be explicit')
    known, unknown = 0, []
    for category, entry in entries.items():
        basis, amount = entry['basis'], entry['amount']
        if basis not in {'actual', 'quote', 'estimate', 'synthetic', 'unknown'}:
            raise ValueError('Invalid cost provenance')
        if basis == 'unknown':
            if amount is not None:
                raise ValueError('Unknown cost must remain null')
            unknown.append(category)
        else:
            number(amount)
            if not entry.get('source'):
                raise ValueError('Known amount needs its source or scenario assumption')
            known += amount
    scenarios = []
    for item in data['scenarios']:
        volume = item['registrations_per_month']
        number(volume, 1)
        if not isinstance(volume, int):
            raise ValueError('Registration volume must be a positive integer')
        variable = item['variable_cost_per_registration']
        number(variable)
        total = None if unknown else known + volume * variable
        scenarios.append({'registrations_per_month': volume, 'basis': item['basis'],
                          'monthly_cost': total, 'cost_per_registration': total/volume if total is not None else None,
                          'known_cost_subtotal': known + volume * variable})
    return {'currency': data['currency'], 'period': 'month', 'unknown_categories': unknown, 'scenarios': scenarios,
            'status': 'COST_BASELINE_INCOMPLETE' if unknown else 'SCENARIO_CALCULATED_NOT_ROI',
            'funder_review': 'NOT_RUN', 'impact_or_roi_proven': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind', choices=['usability', 'cost'])
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raw = args.input.read_bytes()
    data = json.loads(raw.decode('utf-8'))
    result = usability(data) if args.kind == 'usability' else cost(data)
    context = {key: data.get(key) for key in ['frontend_sha', 'backend_sha', 'migration_id', 'contract_version']}
    for key in ['frontend_sha', 'backend_sha']:
        if context[key] is not None and not re.fullmatch(r'[0-9a-f]{40}', context[key]):
            raise ValueError('Source SHA must be a complete lowercase40-character commit')
    result['source_context'] = context
    result['input_sha256'] = hashlib.sha256(raw).hexdigest()
    result['tool_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'status': result['status'], 'output': str(args.output)}))


if __name__ == '__main__':
    main()
