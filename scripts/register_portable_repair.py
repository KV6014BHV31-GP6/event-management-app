"""Register only the explicitly reviewed portable-wrapper and AC40 rerun files.

This task-scoped helper is not a general auto-admission tool. It never approves
requirements, changes acceptance verdicts, or registers an arbitrary file.
Evidence is written outside the repository; only CURRENT and the register change.
"""
from datetime import datetime, timezone
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from check_dev_control import REGISTER, validate

REVIEWED = (
    '.github/workflows/nu-portable-docker.yml',
    'deploy/portable/.dockerignore', 'deploy/portable/.env.example',
    'deploy/portable/.gitignore', 'deploy/portable/Dockerfile',
    'deploy/portable/NETWORK_FIX.md', 'deploy/portable/README.md',
    'deploy/portable/compose.yaml', 'deploy/portable/db/init-app.sh',
    'deploy/portable/inspect_vm.py', 'deploy/portable/prepare.py',
    'deploy/portable/requirements-test.txt', 'deploy/portable/runtime/entrypoint.py',
    'deploy/portable/runtime/healthcheck.py', 'deploy/portable/runtime/server.mjs',
    'deploy/portable/tests/gateway.test.mjs',
    'deploy/portable/tests/test_network_boundary.py',
    'deploy/portable/tests/test_packaging.py',
    'deploy/portable/tests/test_secret_newlines.py',
    'scripts/register_portable_repair.py',
    '.github/workflows/ac40-rerun.yml',
    'docs/dev/tasks/AC40-RERUN-20261108.md',
)
REASON = ('AC40 rerun: admit the reviewed Docker wrapper and task files omitted '
          'from PR59 registration; verify the Windows LF fix without promoting acceptance.')
CURRENT = 'docs/dev/CURRENT.md'
MARKER = '# AC40 rerun successor, 2026-11-08'
PREFIX = '''# AC40 rerun successor, 2026-11-08

Task: [AC40-RERUN-20261108](tasks/AC40-RERUN-20261108.md).
Base: merged dev_demo_ben 5479b9e1def06d1d917f7472325b4941cdca5569.
Current work is on a separate fix branch. The merged CI source gate failed on
18 unregistered Docker paths. This successor registers those reviewed files and
fixes fresh Windows secret newline generation; it does not rotate existing secrets.
The original AC40 partial/failed acceptance and restricted-probe records remain.
PC and VM were offline at intake. Hosted tests are not local Desktop acceptance.
No UAT, deployment, automatic merge, or new acceptance claim is authorized here.

Historical source-specific records below are preserved.

'''


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def apply(root, output):
    root = root.resolve()
    output = output.resolve()
    if output.is_relative_to(root):
        raise ValueError('Evidence must be outside the repository')
    output.mkdir(parents=True, exist_ok=True)
    old = json.loads((root / REGISTER).read_text(encoding='utf-8'))
    before = validate(root)
    save(output / 'register-before.json', before)
    allowed = set(REVIEWED)
    for error in before['errors']:
        kind, separator, path = error.partition(': ')
        if not separator or not (
            (kind == 'unregistered_file' and path in allowed) or
            (kind == 'fingerprint_mismatch' and path in allowed | {CURRENT})
        ):
            raise ValueError('Unreviewed source error: ' + error)
    known = {entry['path'] for entry in old['documents']}
    added = []
    statuses = {entry['document_id']: entry['status'] for entry in old['documents']}
    for index, relative in enumerate(REVIEWED, 1):
        path = root / relative
        if not path.is_file() or path.is_symlink():
            raise ValueError('Expected reviewed regular file missing: ' + relative)
        if relative in known:
            continue
        identity = f'AC40-RERUN-20261108-{index:02}'
        if any(entry['document_id'] == identity for entry in old['documents']):
            raise ValueError('Document ID collision')
        body = path.read_bytes()
        old['documents'].append({
            'document_id': identity, 'path': relative, 'revision': 1,
            'owner': 'Benjamin Dev workflow', 'status': 'working-baseline',
            'revision_history': [], 'dependencies': ['USER-PR-SCOPE'],
            'sha256': hashlib.sha256(body).hexdigest(), 'size_bytes': len(body),
        })
        added.append(relative)
    old['documents'].sort(key=lambda entry: entry['path'])
    old['document_count'] = len(old['documents'])
    old['reviewed_at'] = datetime.now(timezone.utc).isoformat()
    old['reason'] = REASON
    save(root / REGISTER, old)
    current = root / CURRENT
    text = current.read_text(encoding='utf-8')
    if not text.startswith(MARKER):
        current.write_text(PREFIX + text, encoding='utf-8', newline='\n')
    command = [sys.executable, '-B', str(root / 'scripts/refresh_document_register.py'),
               '--root', str(root), '--reason', REASON]
    result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=90)
    (output / 'register-refresh.log').write_text(result.stdout + result.stderr, encoding='utf-8')
    if result.returncode:
        raise RuntimeError('Reviewed register refresh failed')
    after = validate(root)
    save(output / 'register-after.json', after)
    if after['status'] != 'PASS':
        raise RuntimeError('Document controls did not pass')
    new = json.loads((root / REGISTER).read_text(encoding='utf-8'))
    if any(entry['status'] != statuses[entry['document_id']]
           for entry in new['documents'] if entry['document_id'] in statuses):
        raise RuntimeError('An existing approval status changed')
    save(output / 'registration-result.json', {
        'status': 'PASS_REVIEWED_REGISTRATION', 'added_paths': added,
        'existing_approval_statuses_preserved': True,
        'full_ac40_acceptance': False,
    })
    print(json.dumps({'status': 'PASS_REVIEWED_REGISTRATION', 'added': len(added),
                      'acceptance_promoted': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    options = parser.parse_args()
    apply(Path(__file__).resolve().parents[1], options.evidence)
