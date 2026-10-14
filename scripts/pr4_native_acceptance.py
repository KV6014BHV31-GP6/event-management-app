"""PR #4 only: native Windows runner acceptance and constrained evidence publication.

No application monkeypatches, database substitutes, branch promotion or deployment.
The caller must authorize writes to dev_fe_create_event_mvp. Never run on user data.
"""
from __future__ import annotations
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import re
import secrets
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BRANCH = 'dev_fe_create_event_mvp'
REPO = 'KV6014BHV31-GP6/event-management-app'
RUN_ID = f"{os.environ.get('GITHUB_RUN_ID', 'local')}-{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}"
TEMP = Path(os.environ.get('RUNNER_TEMP', ROOT.parent / 'pr4-runtime'))
OUT = TEMP / 'nu-pr4-evidence'
WORK = TEMP / ('nu-pr4-private-' + RUN_ID)
SECRET_VALUES: list[str] = []


def redact(value: str) -> str:
    for secret in SECRET_VALUES:
        value = value.replace(secret, '[REDACTED]')
    return re.sub(r'postgresql(?:\+asyncpg)?://[^\s\"\']+', '[REDACTED_DATABASE_URL]', value)


def run(args, name, cwd=ROOT, env=None, timeout=300):
    result = subprocess.run([str(x) for x in args], cwd=cwd, env=env, capture_output=True,
                            text=True, encoding='utf-8', errors='replace', timeout=timeout)
    (OUT / (name + '.txt')).write_text(redact(result.stdout + result.stderr), encoding='utf-8')
    print(f'{name}: exit {result.returncode}', flush=True)
    if result.returncode:
        raise RuntimeError(f'{name} failed with exit {result.returncode}; see redacted {name}.txt')
    return result.stdout.strip()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True, encoding='utf-8').strip()


def guard():
    if os.environ.get('GITHUB_REPOSITORY') != REPO or os.environ.get('GITHUB_REF') != 'refs/heads/' + BRANCH:
        raise RuntimeError('This operation is restricted to the authorized PR #4 branch on a GitHub runner.')
    if platform.system() != 'Windows':
        raise RuntimeError('This native acceptance job requires Windows, not a substitute environment.')


def fingerprint():
    paths = sorted((ROOT / 'backend/src').rglob('*.py'))
    paths += [ROOT / 'backend/requirements.txt']
    paths += [ROOT / 'frontend/live' / p for p in ['api.mjs', 'session.mjs', 'ui.mjs', 'create-event.mjs', 'create-event.html', 'styles.css', 'login.mjs', 'login.html', 'events.mjs', 'events-state.mjs', 'index.html']]
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}


def wait_http(url, processes):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if any(p.poll() is not None for p in processes):
            raise RuntimeError('An application process exited before readiness.')
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            pass
        time.sleep(0.3)
    raise RuntimeError('HTTP readiness deadline exceeded: ' + url)


def execute():
    guard()
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=False)
    report = {'status': 'BLOCKED', 'native_ui_status': 'NOT_RUN', 'scope': 'PR4 MVP only; GitHub-hosted native Windows, not the user E: machine', 'run_id': RUN_ID,
              'tested_sha': git('rev-parse', 'HEAD'), 'git_status_before': git('status', '--porcelain'),
              'python': sys.version, 'os': platform.platform(), 'stages': {}, 'source_hashes': fingerprint()}
    processes = []
    logs = []
    service_started = False
    env = os.environ.copy()
    env['PYTHONIOENCODING'] = 'utf-8'
    env['PYTHONUNBUFFERED'] = '1'
    try:
        assert not report['git_status_before'], 'Start from the exact clean commit.'
        assert sys.version_info[:2] == (3, 14), 'Python 3.14 is required.'
        report['node'] = run(['node', '--version'], 'node-version')
        run(['git', 'diff', '--check', 'origin/dev...HEAD'], 'diff-check')
        unchanged = run(['git', 'diff', '--name-only', 'origin/dev...HEAD', '--', 'backend', 'frontend/live/login.mjs', 'frontend/live/login.html', 'frontend/live/events.mjs', 'frontend/live/events-state.mjs'], 'source-preservation')
        assert not unchanged, 'Backend, schema, pins, Login or Events changed unexpectedly.'
        files = ['frontend/dev-server.test.mjs'] + [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'frontend/live/tests').glob('*.test.mjs'))]
        tap = run(['node', '--test', *files], 'node-tests')
        counts = {k: int(v) for k, v in re.findall(r'^# (tests|pass|fail) (\d+)', tap, flags=re.M)}
        assert counts.get('fail') == 0 and counts.get('pass', 0) >= 47
        report['stages']['node_tests'] = {'status': 'PASS', **counts}
        run([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'], 'pip-install', cwd=ROOT / 'backend', env=env, timeout=600)
        run([sys.executable, '-m', 'pip', 'check'], 'pip-check')
        pins = (ROOT / 'backend/requirements.txt').read_text(encoding='utf-16').splitlines()
        checked = 0
        for line in pins:
            if not line.strip() or line.startswith('#'):
                continue
            name, version = line.strip().split('==', 1)
            assert importlib.metadata.version(name) == version, 'Dependency pin mismatch: ' + name
            checked += 1
        report['stages']['dependencies'] = {'status': 'PASS', 'exact_pins_checked': checked}

        pgbin = Path(os.environ.get('PGBIN', r'C:\Program Files\PostgreSQL\17\bin'))
        assert (pgbin / 'psql.exe').is_file(), 'Native PostgreSQL 17 tools are missing.'
        run(['pwsh', '-NoProfile', '-Command', "Set-Service postgresql-x64-17 -StartupType Manual; Start-Service postgresql-x64-17; (Get-Service postgresql-x64-17).Status"], 'postgres-start')
        service_started = True
        pg_env = env | {'PGPASSWORD': 'root', 'PGCONNECT_TIMEOUT': '10'}
        pg = [pgbin / 'psql.exe', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres']
        version = run([*pg, '-At', '-c', 'SHOW server_version_num;'], 'postgres-version', env=pg_env)
        assert 170000 <= int(version) < 180000, 'The connected server is not PostgreSQL 17.'
        database = 'nu_pr4_' + RUN_ID.replace('-', '_')
        assert re.fullmatch(r'[a-z0-9_]+', database)
        db_password, seed_password, jwt_secret = (secrets.token_hex(24) for _ in range(3))
        SECRET_VALUES.extend([db_password, seed_password, jwt_secret])
        sql = WORK / 'create-database.sql'
        sql.write_text(f"CREATE ROLE {database} LOGIN PASSWORD '{db_password}' NOSUPERUSER NOCREATEDB NOCREATEROLE;\nCREATE DATABASE {database} OWNER {database};\n", encoding='utf-8')
        run([*pg, '-f', sql], 'database-create', env=pg_env)
        sql.unlink()
        env.update(DATABASE_URL=f'postgresql://{database}:{db_password}@127.0.0.1:5432/{database}', JWT_SECRET_KEY=jwt_secret,
                   SEED_PASSWORD=seed_password, ENVIRONMENT='development', API_V1_STR='/api/v1')
        SECRET_VALUES.append(env['DATABASE_URL'])
        run([sys.executable, '-m', 'scripts.dev_bootstrap', '--acknowledge-development'], 'bootstrap', cwd=ROOT / 'backend', env=env)
        report['stages']['postgres'] = {'status': 'PASS', 'server_version_num': int(version), 'native': True, 'application_role_superuser': False}
        for name, args, cwd in [('backend', [sys.executable, '-m', 'uvicorn', 'src.main:app', '--host', '127.0.0.1', '--port', '8000'], ROOT / 'backend'), ('frontend', ['node', 'frontend/dev-server.mjs'], ROOT)]:
            log = (WORK / (name + '.log')).open('w', encoding='utf-8')
            logs.append((name, log))
            processes.append(subprocess.Popen(args, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP))
        wait_http('http://127.0.0.1:8000/', processes)
        wait_http('http://127.0.0.1:5173/api/v1/events', processes)
        tools = WORK / 'browser-tools'
        tools.mkdir()
        run([shutil.which('npm.cmd') or 'npm.cmd', 'install', '--prefix', tools, '--no-audit', '--no-fund', 'playwright@1.56.1'], 'browser-tools', env=env)
        env.update(PR4_BROWSER_TOOLS=str(tools), PR4_EVIDENCE=str(OUT), PR4_RUN_ID=RUN_ID)
        report['native_ui_status'] = 'FAIL'
        run(['node', 'tests/e2e/create-event-native.mjs'], 'browser-test', env=env, timeout=180)
        browser = json.loads((OUT / 'browser-result.json').read_text(encoding='utf-8'))
        assert browser['status'] == 'PASS'
        import asyncpg
        async def database_readback():
            connection = await asyncpg.connect(env['DATABASE_URL'])
            try:
                row = await connection.fetchrow('SELECT public_id, title, online_quota, offline_quota, start_time, end_time FROM events WHERE public_id=$1', browser['created_event']['public_id'])
                assert row and row['title'] == browser['created_event']['title']
                assert row['online_quota'] == 2 and row['offline_quota'] == 3
                count = await connection.fetchval('SELECT count(*) FROM events WHERE title=$1', row['title'])
                assert count == 1
                is_superuser = await connection.fetchval('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')
                assert not is_superuser
                result = dict(row)
                result.update(matching_title_count=count, application_role_superuser=is_superuser, server_version_num=int(await connection.fetchval('SHOW server_version_num')))
                return result
            finally:
                await connection.close()
        report['database_readback'] = asyncio.run(database_readback())
        report['native_ui_status'] = 'PASS'
        report['status'] = 'PASS'
    except Exception as exc:
        report['error'] = redact(str(exc))
        report['status'] = 'FAIL' if report['native_ui_status'] == 'FAIL' else 'BLOCKED'
    finally:
        report['cleanup'] = []
        for process in reversed(processes):
            if process.poll() is None:
                try:
                    process.send_signal(signal.CTRL_BREAK_EVENT)
                    process.wait(timeout=15)
                    report['cleanup'].append({'pid': process.pid, 'method': 'CTRL_BREAK_EVENT', 'exit': process.returncode})
                except (OSError, subprocess.TimeoutExpired):
                    process.terminate()
                    process.wait(timeout=10)
                    report['cleanup'].append({'pid': process.pid, 'method': 'terminate-own-test-process', 'exit': process.returncode})
        for name, log in logs:
            log.close()
            (OUT / (name + '.txt')).write_text(redact((WORK / (name + '.log')).read_text(encoding='utf-8', errors='replace')), encoding='utf-8')
        if service_started:
            try:
                run(['pwsh', '-NoProfile', '-Command', 'Stop-Service postgresql-x64-17'], 'postgres-stop')
            except Exception as exc:
                report['cleanup'].append({'postgres_stop_error': str(exc)})
        report['source_hashes_after'] = fingerprint()
        report['source_unchanged'] = report['source_hashes_after'] == report['source_hashes']
        report['git_status_after_tests'] = git('status', '--porcelain')
        if not report['source_unchanged'] or report['git_status_after_tests']:
            report['status'] = 'FAIL'
            report['error'] = 'The tested source checkout changed during execution.'
        report['completed_at'] = datetime.now(timezone.utc).isoformat()
        (OUT / 'execution-result.json').write_text(redact(json.dumps(report, ensure_ascii=False, indent=2, default=str)) + '\n', encoding='utf-8')
        print(json.dumps({'status': report['status'], 'native_ui_status': report['native_ui_status'], 'tested_sha': report['tested_sha'], 'stages': report['stages'], 'error': report.get('error')}, indent=2), flush=True)
    return 0 if report['status'] == 'PASS' else 1


def publish():
    guard()
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / 'execution-result.json'
    if not path.exists():
        path.write_text(json.dumps({'status': 'BLOCKED', 'native_ui_status': 'NOT_RUN', 'tested_sha': git('rev-parse', 'HEAD'), 'error': 'Runner setup failed before execution report.'}, indent=2) + '\n', encoding='utf-8')
    report = json.loads(path.read_text(encoding='utf-8'))
    expected = report['tested_sha']
    run(['git', 'fetch', 'origin', BRANCH], 'publish-fetch')
    if git('rev-parse', 'FETCH_HEAD') != expected or git('rev-parse', 'HEAD') != expected:
        raise RuntimeError('PR head advanced. Refuse to overwrite another writer; evidence remains in the artifact.')
    relative = f'docs/dev/evidence/FE-CREATE-EVENT-NATIVE-20261014/{RUN_ID}'
    destination = ROOT / relative
    destination.mkdir(parents=True, exist_ok=False)
    for name in ['execution-result.json', 'browser-result.json']:
        if (OUT / name).exists():
            shutil.copy2(OUT / name, destination / name)
    run_url = f'https://github.com/{REPO}/actions/runs/{os.environ["GITHUB_RUN_ID"]}'
    status = report['native_ui_status']
    readme = f'''# PR4 native Create Event acceptance\n\nStatus: working-baseline. Native UI result: **{status}**.\n\n- Tested commit: `{expected}`.\n- Execution: GitHub-hosted Windows runner, Python 3.14, native PostgreSQL 17 and real Chrome. Not the user E: environment.\n- Workflow: {run_url}\n- The execution and browser JSON files contain stage results, A1-A10, redacted request metadata and same-ID readbacks. Never infer PASS from the presence of this folder.\n- Screenshots and redacted process/test logs are in the workflow artifact. No passwords, tokens, HAR, traces or video are retained.\n- Unit tests deliberately mock fetch; the native browser flow does not intercept routes or replace the database.\n- Database readback is SELECT-only after one real UI submission. Full E2E, Security, UAT, restart, deployment and merge are outside scope.\n- This evidence publication changes documentation only. Reviewer sign-off is separate.\n'''
    (destination / 'README.md').write_text(readme, encoding='utf-8')
    current = ROOT / 'docs/dev/CURRENT.md'
    content = current.read_text(encoding='utf-8')
    paragraphs = content.split('\n\n')
    paragraphs[1] = f'版本：`repo-docs/0.3.2`，2026-10-14（香港）。Active task: [FE-CREATE-EVENT-20261014](tasks/FE-CREATE-EVENT-20261014.md). PR #4 quota boundary repaired. Native Create Event UI acceptance: **{status}**, [current evidence](evidence/FE-CREATE-EVENT-NATIVE-20261014/{RUN_ID}/README.md), tested `{expected}` on a GitHub-hosted Windows runner, not the user E: machine. This supersedes only the previous pending PR #4 UI result. PR #3 remains merged at `7a06f43dc30c8378d9f3c569635523b25ce556b0`; its historical evidence below is unchanged. PR #4 is not merged; no uat/main promotion or deployment.'
    current.write_text('\n\n'.join(paragraphs), encoding='utf-8')
    task = ROOT / 'docs/dev/tasks/FE-CREATE-EVENT-20261014.md'
    with task.open('a', encoding='utf-8', newline='\n') as stream:
        stream.write(f'\n## Authorized repair and native acceptance successor, {RUN_ID}\n\nThe user authorized resolving review findings and updating this PR, explicitly without merge. Quotas now match native PostgreSQL integer range 0..2147483647; both input max attributes and independent boundary tests are included. Native UI status: **{status}**, tested `{expected}` on GitHub-hosted Windows, not the user local machine. [Evidence](../evidence/FE-CREATE-EVENT-NATIVE-20261014/{RUN_ID}/README.md). Historical NOT_RUN entries describe the earlier run and are retained. No backend/schema/pin changes, alternative engine, full E2E, Security, UAT or deployment.\n')
    frontend = ROOT / 'frontend/README.md'
    with frontend.open('a', encoding='utf-8', newline='\n') as stream:
        stream.write(f'\n### PR #4 acceptance update ({RUN_ID})\n\nQuota inputs and payload validation enforce `0..2147483647`, matching the existing database integer fields. Native UI acceptance on GitHub-hosted Windows: **{status}**. This supersedes the earlier cloud-only pending status for the tested source; it does not claim execution on the user local machine. [Run evidence](../{relative}/README.md). No merge or deployment.\n')
    register_path = ROOT / 'docs/dev/DOCUMENT_REGISTER.json'
    register = json.loads(register_path.read_text(encoding='utf-8'))
    additions = ['.github/workflows/pr4-native.yml', 'scripts/pr4_native_acceptance.py', 'tests/e2e/create-event-native.mjs', 'frontend/live/tests/quota-boundary.test.mjs']
    additions += [p.relative_to(ROOT).as_posix() for p in destination.iterdir() if p.is_file()]
    existing = {entry['path'] for entry in register['documents']}
    for rel in additions:
        if rel in existing:
            continue
        data = (ROOT / rel).read_bytes()
        register['documents'].append({'document_id': 'PR4-' + hashlib.sha256(rel.encode()).hexdigest()[:16].upper(), 'path': rel, 'title': Path(rel).name, 'owner': 'Benjamin / Developer', 'status': 'working-baseline', 'revision': 1, 'sha256': hashlib.sha256(data).hexdigest(), 'size_bytes': len(data), 'dependencies': [], 'approval_record': None})
    register['document_count'] = len(register['documents'])
    register_path.write_text(json.dumps(register, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    run([sys.executable, 'scripts/refresh_document_register.py', '--reason', 'PR4 quota boundary repair and actual native Windows acceptance evidence'], 'register-refresh')
    run([sys.executable, 'scripts/check_dev_control.py'], 'document-control')
    run(['git', 'diff', '--check'], 'final-diff-check')
    assert not git('diff', '--name-only', expected, '--', 'frontend/live', 'backend'), 'Evidence publication must not modify application source.'
    allowed = ['docs/dev/CURRENT.md', 'docs/dev/DOCUMENT_REGISTER.json', 'docs/dev/tasks/FE-CREATE-EVENT-20261014.md', 'frontend/README.md', relative]
    changed = git('status', '--porcelain').splitlines()
    if any(not any(line[3:] == p or line[3:].startswith(p + '/') for p in allowed) for line in changed):
        raise RuntimeError('Unexpected file outside documentation publication scope.')
    run(['git', 'config', 'user.name', 'github-actions[bot]'], 'git-name')
    run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], 'git-email')
    run(['git', 'add', '--', *allowed], 'git-stage')
    run(['git', 'commit', '-m', f'docs: record PR4 native acceptance {RUN_ID} ({status})'], 'git-commit')
    run(['git', 'push', 'origin', 'HEAD:refs/heads/' + BRANCH], 'git-push')
    final_sha = git('rev-parse', 'HEAD')
    run(['git', 'archive', '--format=zip', '--output=' + str(OUT / 'source-tree.zip'), final_sha], 'source-archive')
    (OUT / 'publication.json').write_text(json.dumps({'tested_sha': expected, 'final_sha': final_sha, 'application_source_unchanged': True, 'native_ui_status': status, 'document_control': 'PASS', 'workflow_run': run_url, 'merged': False}, indent=2) + '\n', encoding='utf-8')
    print('PUBLISHED ' + final_sha, flush=True)
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    sys.exit(publish() if args.publish else execute())
