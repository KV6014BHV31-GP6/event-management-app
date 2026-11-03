"""Pinned, synthetic-only Demo CI. No publication, deployment or branch writes.

Native execution is restricted to a fresh GitHub-hosted Windows run directory.
Only sanitized evidence and explicitly selected release files may be uploaded.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = "KV6014BHV31-GP6/event-management-app"
RUNTIME = {"python": "3.14.8", "node": "24.14.0", "postgresql": "17.11",
           "playwright": "1.65.0-alpha-2026-10-30"}
PG_URL = "https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip"
PG_SHA = "80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f"
CONTRACTS = ["docs/dev/phase2/API_CONTRACT.json", "docs/dev/demo-journey/API_CONTRACT.md"]
MIGRATIONS = {"backend/scripts/migrate_phase2.py": "rose_phase2_20261102_v1",
              "backend/scripts/migrate_demo_journey.py": "rose_demo_journey_20261103_v1"}
SECRETS: list[str] = []
OUT: Path
REPORT: dict


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def redact(value: str) -> str:
    for secret in sorted(SECRETS, key=len, reverse=True):
        if secret:
            value = value.replace(secret, "[REDACTED]")
    value = re.sub(r"postgresql(?:\+asyncpg)?://[^\s\"'<>]+", "[REDACTED_DATABASE_URL]", value)
    value = re.sub(r"(?i)(bearer\s+)[A-Za-z0-9_.~-]+", r"\1[REDACTED]", value)
    value = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "[REDACTED_TOKEN]", value)
    value = re.sub(r"(?i)([\"']?(?:password|access_token|refresh_token|jwt_secret_key|grant_token|demo_access_token)[\"']?\s*[:=]\s*)[\"'][^\"'\r\n]+[\"']", r'\1"[REDACTED]"', value)
    return value


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(redact(json.dumps(value, ensure_ascii=False, indent=2, default=str)) + "\n", encoding="utf-8")


def run(args: list, name: str, *, cwd: Path = ROOT, env: dict | None = None, timeout: int = 600) -> str:
    """Never echo command arguments or raw subprocess output into Actions logs."""
    started = time.monotonic()
    try:
        result = subprocess.run([str(a) for a in args], cwd=cwd, env=env, capture_output=True,
                                text=True, encoding="utf-8", errors="replace", timeout=timeout)
        output = redact(result.stdout + "\n" + result.stderr)
        (OUT / (name + ".txt")).write_text(output, encoding="utf-8")
        REPORT["commands"].append({"name": name, "exit": result.returncode,
                                   "seconds": round(time.monotonic() - started, 3)})
        print(f"{name}: exit {result.returncode}", flush=True)
        if result.returncode:
            raise RuntimeError(f"{name} failed; see sanitized evidence")
        return result.stdout.strip()
    except subprocess.TimeoutExpired as exc:
        output = "\n".join(x.decode("utf-8", "replace") if isinstance(x, bytes) else x or ""
                           for x in [exc.stdout, exc.stderr])
        (OUT / (name + ".txt")).write_text(redact(output), encoding="utf-8")
        REPORT["commands"].append({"name": name, "exit": "TIMEOUT", "seconds": timeout})
        raise RuntimeError(f"{name} exceeded its bounded timeout") from None


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True, encoding="utf-8").strip()


def source_identity(local: bool = False) -> str:
    sha = git("rev-parse", "HEAD")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise RuntimeError("Full Git SHA required")
    if not local:
        if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_REPOSITORY") != REPO:
            raise RuntimeError("CI execution requires the named repository's GitHub Actions run")
        if os.environ.get("GITHUB_SHA") != sha or git("status", "--porcelain", "--untracked-files=no"):
            raise RuntimeError("Checkout must remain the exact clean trigger SHA")
        event = os.environ.get("GITHUB_EVENT_NAME")
        ref = os.environ.get("GITHUB_REF", "")
        if event == "pull_request":
            if os.environ.get("GITHUB_BASE_REF") != "dev_demo_ben":
                raise RuntimeError("Unexpected PR target")
        elif event not in {"push", "workflow_dispatch"} or not (
            ref == "refs/heads/dev_demo_ben" or ref.startswith("refs/heads/integration/ben-demo-release-")
        ):
            raise RuntimeError("Unexpected trigger/ref")
    REPORT.update(source_sha=sha, trigger_sha=os.environ.get("GITHUB_SHA"),
                  event=os.environ.get("GITHUB_EVENT_NAME"), ref=os.environ.get("GITHUB_REF"),
                  run_id=os.environ.get("GITHUB_RUN_ID"), run_attempt=os.environ.get("GITHUB_RUN_ATTEMPT"),
                  local_only=local)
    return sha


def require_runtime(*, node: bool = False) -> None:
    if platform.system() != "Windows" or platform.python_version() != RUNTIME["python"]:
        raise RuntimeError("CI_BLOCKED: exact Windows Python runtime unavailable")
    REPORT["runtime"] = {"python": platform.python_version(), "os": platform.platform()}
    if node:
        version = run(["node", "--version"], "node-version").removeprefix("v")
        REPORT["runtime"]["node"] = version
        if version != RUNTIME["node"]:
            raise RuntimeError("CI_BLOCKED: exact Node runtime unavailable")


def text_file(path: Path) -> str:
    data = path.read_bytes()
    return data.decode("utf-16" if data.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig")


def public_path(name: str, *, source_inventory: bool = False) -> None:
    path = PurePosixPath(name)
    if not name or "\\" in name or path.is_absolute() or ".." in path.parts or ":" in name:
        raise RuntimeError("Unsafe artifact path")
    if any(p.lower() in {"private", "private_control", "private_assets", "node_modules", ".git", ".venv", "pgdata"} for p in path.parts):
        raise RuntimeError("Private/runtime directory in public artifact")
    if path.name.startswith(".env") and path.name != ".env.example":
        raise RuntimeError("Private environment file in artifact")
    controlled_derivative = source_inventory and name in {
        "docs/dev/log-tasks/NU_Log_Task_1_Developer_Contribution_EN.docx",
        "docs/dev/log-tasks/NU_Log_Task_2_Developer_Technical_Spec_EN.docx",
    }
    if path.suffix.lower() in {".pem", ".key", ".har", ".sql", ".sqlite", ".db", ".docx", ".pdf"} and not controlled_derivative:
        raise RuntimeError("Raw private/source/database file is not an approved artifact entry")


def source_checks(local: bool) -> None:
    source_identity(local)
    if not local:
        require_runtime()
    run(["git", "diff", "--check"], "diff-check")
    # This runs before npm/pip, because document control intentionally rejects unregistered files.
    run([sys.executable, "-B", "scripts/check_dev_control.py"], "document-control")
    run([sys.executable, "-B", "-m", "unittest", "discover", "-s", "tests", "-p", "test_document_control.py"], "document-control-tests")
    tracked = list(filter(None, git("ls-files", "-z").split("\0")))
    checks = 0
    for name in tracked:
        public_path(name, source_inventory=True)
        path = ROOT / name
        if path.is_symlink():
            raise RuntimeError("Symlink in source payload")
        if path.suffix in {".yml", ".yaml", ".json", ".md", ".txt", ".js", ".jsx", ".mjs", ".py"}:
            value = text_file(path)
            if re.search(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b", value):
                raise RuntimeError("Credential pattern in tracked source: " + name)
        checks += 1
    workflow = (ROOT / ".github/workflows/demo-journey.yml").read_text(encoding="utf-8")
    if "pull_request_target" in workflow:
        raise RuntimeError("Privileged PR trigger forbidden")
    if not all(re.fullmatch(r"[0-9a-f]{40}", pin) for pin in re.findall(r"uses:\s*[^\s@]+@([^\s]+)", workflow)):
        raise RuntimeError("Every action must use an immutable full commit")
    contract = json.loads((ROOT / CONTRACTS[0]).read_text(encoding="utf-8"))
    if contract["contract_version"] != "rose.offline-sync.v2":
        raise RuntimeError("Offline contract drift")
    if "rose.demo-journey.v1" not in (ROOT / CONTRACTS[1]).read_text(encoding="utf-8"):
        raise RuntimeError("Journey contract missing")
    matrix = json.loads((ROOT / "docs/dev/demo-journey/AC_MATRIX.json").read_text(encoding="utf-8"))
    ids = [row["acceptance_id"] for row in matrix["rows"]]
    expected = {f"AC-{story:02}-{item:02}" for story in range(1, 11) for item in range(1, 5)}
    if len(ids) != 40 or set(ids) != expected:
        raise RuntimeError("The 40 original acceptance IDs must remain present exactly once")
    for name, identity in MIGRATIONS.items():
        if identity not in (ROOT / name).read_text(encoding="utf-8"):
            raise RuntimeError("Migration identity missing: " + name)
    REPORT.update(tracked_paths_scanned=checks, acceptance_ids_checked=len(ids),
                  contracts={name: file_digest(ROOT / name) for name in CONTRACTS})


def junit_counts(path: Path) -> dict:
    tree = ET.parse(path)
    suites = [tree.getroot()] if tree.getroot().tag == "testsuite" else tree.findall(".//testsuite")
    counts = {key: sum(int(s.attrib.get(key, "0")) for s in suites)
              for key in ["tests", "failures", "errors", "skipped"]}
    if counts["tests"] < 1 or any(counts[key] for key in ["failures", "errors", "skipped"]):
        raise RuntimeError("Required suite must have tests and zero failures/errors/skips")
    return counts


def frontend(local: bool) -> None:
    sha = source_identity(local)
    require_runtime(node=True)
    npm = shutil.which("npm.cmd") or "npm.cmd"
    folder = ROOT / "frontend/rose-pulse-react"
    run([npm, "ci", "--no-audit", "--no-fund"], "npm-ci", cwd=folder)
    report_path = OUT / "react-junit.xml"
    run([npm, "test", "--", "--reporter=default", "--reporter=junit", f"--outputFile.junit={report_path}"], "react-tests", cwd=folder)
    REPORT["react"] = junit_counts(report_path)
    legacy = [ROOT / "frontend/dev-server.test.mjs", *sorted((ROOT / "frontend/live/tests").glob("*.test.mjs")),
              *sorted((ROOT / "frontend/mock/v1.2.0/tests").glob("*.test.mjs"))]
    output = run(["node", "--test", "--test-reporter=tap", *legacy], "legacy-tests")
    counts = {key: int(n) for key, n in re.findall(r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)", output, re.M)}
    if not counts.get("tests") or counts.get("pass") != counts["tests"] or any(counts.get(k, 0) for k in ["fail", "cancelled", "skipped", "todo"]):
        raise RuntimeError("Legacy suite incomplete or failed")
    REPORT["legacy"] = counts
    env = os.environ.copy() | {"VITE_DEMO_PROFILE": "synthetic", "VITE_DEMO_BUILD_SHA": sha}
    run([npm, "run", "build"], "production-build", cwd=folder, env=env)
    dist = folder / "dist"
    if not (dist / "index.html").is_file() or not (dist / "sw.js").is_file():
        raise RuntimeError("Production App Shell missing")
    REPORT["build_files"] = {p.relative_to(dist).as_posix(): file_digest(p) for p in sorted(dist.rglob("*")) if p.is_file()}
    REPORT["build_digest"] = digest(json.dumps(REPORT["build_files"], sort_keys=True).encode())


def install_backend() -> None:
    run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "-r", "requirements.txt"], "pip-install", cwd=ROOT / "backend", timeout=900)
    run([sys.executable, "-m", "pip", "check"], "pip-check")
    pins = []
    for line in text_file(ROOT / "backend/requirements.txt").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        name, version = line.split("==")
        if importlib.metadata.version(name) != version:
            raise RuntimeError("Exact dependency unavailable: " + name)
        pins.append(name)
    REPORT["backend_pins_checked"] = len(pins)


def require_free(port: int) -> None:
    with socket.socket() as test:
        test.bind(("127.0.0.1", port))


def wait_http(url: str, processes: list) -> None:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if any(p.poll() is not None for p in processes):
            raise RuntimeError("Owned service exited before readiness")
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            pass
        time.sleep(0.25)
    raise RuntimeError("Owned service readiness timed out")


BROWSER_SMOKE = r'''
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(path.join(process.env.NU_BROWSER_TOOLS, 'node_modules/playwright'));
(async () => {
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1000},locale:'en-GB'});
  const page = await context.newPage();
  const observed = []; const errors = [];
  page.on('pageerror', () => errors.push('pageerror'));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) observed.push({path:url.pathname,method:response.request().method(),status:response.status()});
  });
  try {
    await page.goto(process.env.NU_BROWSER_URL + '?view=events&keyword=Synthetic%20community%20event', {waitUntil:'networkidle'});
    await page.getByText('Synthetic community event 1', {exact:true}).first().waitFor();
    await page.screenshot({path:path.join(process.env.NU_CI_OUTPUT,'public-browse.png')});
    await page.goto(process.env.NU_BROWSER_URL + '?view=signup');
    await page.getByLabel('Username',{exact:true}).fill(process.env.NU_SMOKE_USERNAME);
    await page.getByLabel('Password',{exact:true}).fill(process.env.NU_SMOKE_PASSWORD);
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    await page.getByText(/Account .* was created\. Log in to continue\./).waitFor();
    await page.goto(process.env.NU_BROWSER_URL + '?view=login');
    await page.getByLabel('Username',{exact:true}).fill(process.env.NU_SMOKE_USERNAME);
    await page.getByLabel('Password',{exact:true}).fill(process.env.NU_SMOKE_PASSWORD);
    await page.getByRole('button',{name:'Log in',exact:true}).click();
    await page.getByRole('button',{name:'Log out',exact:true}).waitFor();
    await page.reload({waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Log out',exact:true}).waitFor();
    assert(observed.some(r=>r.path==='/api/v1/users' && r.method==='POST' && r.status===201));
    assert(observed.some(r=>r.path==='/api/v1/auth/login' && r.status===200));
    assert(observed.some(r=>r.path==='/api/v1/users/me' && r.status===200));
    assert(observed.some(r=>r.path==='/api/v1/events' && r.status===200));
    assert.equal(errors.length,0);
    fs.writeFileSync(path.join(process.env.NU_CI_OUTPUT,'browser-smoke.json'),JSON.stringify({
      status:'PASS',source_sha:process.env.GITHUB_SHA,browser:browser.version(),
      browser_source:'pinned Playwright bundled Chromium; not local Chrome equivalence',
      viewport:{width:1440,height:1000},api:observed,page_errors:errors.length,
      checks:['production React browse','UI signup persisted','real login','authenticated reload'],
      document_viewer:'NOT_RUN_BY_THIS_BOUNDED_SMOKE',offline:'NOT_RUN_BY_THIS_BOUNDED_SMOKE',
      full_40ac:'REQUIRES_SEPARATE_FIXED_SHA_ACCEPTANCE'
    },null,2));
  } finally { await context.close(); await browser.close(); }
})().catch(() => { console.error('Browser smoke failed; no raw page/form/token dump retained'); process.exitCode=1; });
'''


def native_browser(build_input: Path) -> None:
    source_identity()
    require_runtime(node=True)
    install_backend()
    runner = Path(os.environ["RUNNER_TEMP"]).resolve()
    work = runner / ("nu-demo-private-" + os.environ["GITHUB_RUN_ID"] + "-" + os.environ["GITHUB_RUN_ATTEMPT"])
    if not work.is_relative_to(runner):
        raise RuntimeError("Private runtime outside runner temporary directory")
    work.mkdir(exist_ok=False)
    pgport, apiport, webport = 55441, 8901, 5801
    for port in [pgport, apiport, webport]:
        require_free(port)
    password, jwt, seed, smoke_password = [secrets.token_hex(24) for _ in range(4)]
    SECRETS.extend([password, jwt, seed, smoke_password])
    database = "nu_ci_" + re.sub(r"[^a-z0-9_]", "_", os.environ["GITHUB_RUN_ID"] + "_" + os.environ["GITHUB_RUN_ATTEMPT"]) + "_be_test"
    if not re.fullmatch(r"nu_ci_[a-z0-9_]+_be_test", database):
        raise RuntimeError("Unsafe native test database name")
    env = os.environ.copy() | {"PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1",
        "DATABASE_URL": f"postgresql://nu_ci_app:{password}@127.0.0.1:{pgport}/{database}",
        "JWT_SECRET_KEY": jwt, "ENVIRONMENT": "development", "SEED_PASSWORD": seed,
        "PRIVATE_UPLOAD_DIR": str(work / "private-assets"), "UPLOAD_DIR": str(work / "uploads"),
        "STORAGE_PROVIDER": "local", "NU_DEMO_PROFILE": "synthetic", "NU_DEMO_NAMESPACE": "ci_",
        "NU_DEMO_OWNER_IDS": "01J00000000000000000000001", "PGCONNECT_TIMEOUT": "5"}
    env.pop("NU_NATIVE_TEST_DATABASE_URL", None)
    env["NU_PHASE2_NATIVE_EVIDENCE_DIR"] = str(OUT / "native")
    tests = sorted((ROOT / "backend/tests").glob("test_*.py"))
    controlled = [p.relative_to(ROOT / "backend") for p in tests if "native" not in p.stem]
    controlled_report = OUT / "controlled-junit.xml"
    archive = work / "postgresql.zip"
    with urllib.request.urlopen(PG_URL, timeout=120) as response, archive.open("wb") as target:
        shutil.copyfileobj(response, target)
    if file_digest(archive) != PG_SHA:
        raise RuntimeError("PostgreSQL binary archive SHA256 mismatch")
    with zipfile.ZipFile(archive) as bundle:
        for entry in bundle.infolist():
            if PurePosixPath(entry.filename).is_absolute() or ".." in PurePosixPath(entry.filename).parts or "\\" in entry.filename:
                raise RuntimeError("Unsafe PostgreSQL archive member")
        bundle.extractall(work / "pgsql-tools")
    pg = work / "pgsql-tools/pgsql/bin"
    if run([pg / "postgres.exe", "--version"], "postgres-binary-version") != "postgres (PostgreSQL) 17.11":
        raise RuntimeError("CI_BLOCKED: native PostgreSQL 17.11 unavailable")
    # Windows Python has no system IANA database. Use the already verified PG archive,
    # without silently introducing tzdata or changing the product dependency pins.
    timezone_data = pg.parent / "share/timezone"
    if not (timezone_data / "Asia/Hong_Kong").is_file():
        raise RuntimeError("CI_BLOCKED: pinned IANA timezone data missing")
    env["PYTHONTZPATH"] = str(timezone_data)
    run([sys.executable, "-B", "-c", "from zoneinfo import ZoneInfo; assert ZoneInfo('Asia/Hong_Kong').key == 'Asia/Hong_Kong'; print('Pinned timezone data PASS')"], "timezone-data", env=env)
    REPORT["runtime"]["timezone_source"] = "PostgreSQL 17.11 archive share/timezone, SHA256 " + PG_SHA
    run([sys.executable, "-B", "-m", "pytest", "-q", *controlled, f"--junitxml={controlled_report}"], "backend-controlled", cwd=ROOT / "backend", env=env)
    REPORT["controlled"] = junit_counts(controlled_report)
    data = work / "pgdata"
    run([pg / "initdb.exe", "-D", data, "-U", "nu_ci_admin", "--auth=trust", "--encoding=UTF8", "--no-locale"], "initdb")
    processes, logs, started = [], [], False
    try:
        run([pg / "pg_ctl.exe", "-D", data, "-l", work / "postgres.log", "-o", f"-h 127.0.0.1 -p {pgport}", "-w", "start"], "postgres-start")
        started = True
        psql = [pg / "psql.exe", "-X", "-h", "127.0.0.1", "-p", pgport, "-U", "nu_ci_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
        sql = work / "create.sql"
        sql.write_text(f"CREATE ROLE nu_ci_app LOGIN PASSWORD '{password}' NOSUPERUSER NOCREATEDB NOCREATEROLE;\nCREATE DATABASE {database} OWNER nu_ci_app;\n", encoding="utf-8")
        run([*psql, "-f", sql], "isolated-database-create", env=env)
        sql.unlink()
        # Require password authentication after bootstrap; never alter an installed service.
        (data / "pg_hba.conf").write_text("host all all 127.0.0.1/32 scram-sha-256\n", encoding="utf-8")
        run([pg / "pg_ctl.exe", "-D", data, "reload"], "postgres-auth-reload")
        run([sys.executable, "-B", "-m", "scripts.dev_bootstrap", "--acknowledge-development"], "synthetic-bootstrap", cwd=ROOT / "backend", env=env)
        for module in ["migrate_phase2", "migrate_demo_journey"]:
            for attempt in ["first", "repeat"]:
                run([sys.executable, "-B", "-m", "scripts." + module, "--acknowledge-development", "--database", database], module + "-" + attempt, cwd=ROOT / "backend", env=env)
        env["NU_NATIVE_TEST_DATABASE_URL"] = env["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://", 1)
        native = [p.relative_to(ROOT / "backend") for p in tests if "native" in p.stem]
        if not {"test_phase2_native.py", "test_journey_native.py"}.issubset({p.name for p in native}):
            raise RuntimeError("Required native regression suites missing")
        native_report = OUT / "native-junit.xml"
        run([sys.executable, "-B", "-m", "pytest", "-q", *native, f"--junitxml={native_report}"], "backend-native", cwd=ROOT / "backend", env=env, timeout=900)
        REPORT["native"] = junit_counts(native_report)
        env.pop("NU_NATIVE_TEST_DATABASE_URL")
        dist = build_input.resolve()
        if not (dist / "index.html").is_file() or not (dist / "sw.js").is_file():
            raise RuntimeError("Actual production build input missing")
        proxy = work / "proxy.mjs"
        proxy.write_text("import {createDevServer} from " + json.dumps((ROOT / "frontend/dev-server.mjs").as_uri()) + ";\n" +
            "createDevServer({root:" + json.dumps(str(dist)) + ",upstream:'http://127.0.0.1:" + str(apiport) + "'}).listen(" + str(webport) + ",'127.0.0.1');\n", encoding="utf-8")
        for name, args, cwd in [("api", [sys.executable, "-B", "-m", "uvicorn", "src.main:app", "--host", "127.0.0.1", "--port", str(apiport), "--no-access-log"], ROOT / "backend"), ("proxy", ["node", str(proxy)], work)]:
            log = (work / (name + ".log")).open("w", encoding="utf-8")
            logs.append((name, log))
            processes.append(subprocess.Popen(args, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW))
        wait_http(f"http://127.0.0.1:{apiport}/", processes)
        wait_http(f"http://127.0.0.1:{webport}/", processes)
        tools = work / "browser-tools"
        tools.mkdir()
        (tools / "package.json").write_text(json.dumps({"private": True, "dependencies": {"playwright": RUNTIME["playwright"]}}), encoding="utf-8")
        npm = shutil.which("npm.cmd") or "npm.cmd"
        run([npm, "install", "--package-lock-only", "--no-audit", "--no-fund"], "browser-lock", cwd=tools)
        run([npm, "ci", "--no-audit", "--no-fund"], "browser-install", cwd=tools)
        if json.loads((tools / "node_modules/playwright/package.json").read_text())["version"] != RUNTIME["playwright"]:
            raise RuntimeError("Playwright package pin mismatch")
        env["PLAYWRIGHT_BROWSERS_PATH"] = str(work / "browsers")
        run(["node", tools / "node_modules/playwright/cli.js", "install", "chromium"], "browser-binary-install", cwd=tools, env=env)
        smoke = work / "smoke.cjs"
        smoke.write_text(BROWSER_SMOKE, encoding="utf-8")
        username = "ci_" + secrets.token_hex(6)
        env.update(NU_BROWSER_TOOLS=str(tools), NU_BROWSER_URL=f"http://127.0.0.1:{webport}/",
                   NU_SMOKE_USERNAME=username, NU_SMOKE_PASSWORD=smoke_password, NU_CI_OUTPUT=str(OUT))
        run(["node", smoke], "browser-smoke", env=env, timeout=180)

        async def readback():
            import asyncpg
            connection = await asyncpg.connect(env["DATABASE_URL"])
            try:
                identity = await connection.fetchrow("SELECT current_database() AS name, current_user AS role, current_setting('server_version_num')::int AS version, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser")
                if identity["name"] != database or identity["role"] != "nu_ci_app" or identity["version"] != 170011 or identity["superuser"]:
                    raise RuntimeError("Connected native database identity mismatch")
                count = await connection.fetchval("SELECT count(*) FROM users WHERE username=$1 AND role='user'", username)
                if count != 1:
                    raise RuntimeError("UI signup not persisted exactly once")
                return {"native": True, "server_version_num": identity["version"], "database_suffix": "_be_test", "non_superuser": True,
                        "synthetic_ui_user_count": count, "event_count": await connection.fetchval("SELECT count(*) FROM events"),
                        "registration_count": await connection.fetchval("SELECT count(*) FROM registrations"),
                        "migrations": [row["migration_id"] for table in ["phase2_schema_migrations", "journey_schema_migrations"]
                                       for row in await connection.fetch("SELECT migration_id FROM " + table)]}
            finally:
                await connection.close()
        REPORT["database"] = asyncio.run(readback())
        REPORT["browser"] = json.loads((OUT / "browser-smoke.json").read_text())
        REPORT["browser_lock_sha256"] = file_digest(tools / "package-lock.json")
        REPORT["runtime"].update(postgresql="17.11", playwright=RUNTIME["playwright"], browser=REPORT["browser"]["browser"])
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=20)
        for name, log in logs:
            log.close()
            (OUT / (name + ".txt")).write_text(redact((work / (name + ".log")).read_text(encoding="utf-8", errors="replace")), encoding="utf-8")
        if started:
            run([pg / "pg_ctl.exe", "-D", data, "-m", "fast", "-w", "stop"], "postgres-stop-own-cluster")


def verify_zip(archive: Path, expected_digest: str, expected_sha: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40}", expected_sha):
        raise RuntimeError("Full immutable source SHA required")
    if not re.fullmatch(r"[0-9a-f]{64}", expected_digest) or file_digest(archive) != expected_digest:
        raise RuntimeError("Release ZIP SHA256 mismatch")
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(n.casefold() for n in names)):
            raise RuntimeError("Duplicate/case-colliding artifact entries")
        for entry in entries:
            public_path(entry.filename)
            if (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise RuntimeError("Artifact symlink forbidden")
        manifest = json.loads(bundle.read("RELEASE.json"))
        if manifest.get("schema") != "nu.demo-release/1" or manifest["source_sha"] != expected_sha or manifest["runtime_contract"] != RUNTIME:
            raise RuntimeError("Artifact source/runtime identity mismatch")
        if set(names) != set(manifest["files"]) | {"RELEASE.json"}:
            raise RuntimeError("Unmanifested or missing artifact file")
        for name, checksum in manifest["files"].items():
            if digest(bundle.read(name)) != checksum:
                raise RuntimeError("Artifact file digest mismatch: " + name)
        for section in ["contracts", "migrations", "assets"]:
            for name, checksum in manifest[section].items():
                if manifest["files"].get(name) != checksum:
                    raise RuntimeError("Artifact section digest mismatch: " + section)
        return manifest


def package(inputs: Path, destination: Path) -> None:
    sha = source_identity()
    require_runtime()
    evidence = {}
    for stage in ["source", "frontend", "native-browser"]:
        report = json.loads((inputs / "evidence" / stage / (stage + ".json")).read_text(encoding="utf-8"))
        if report["status"] != "PASS" or report["source_sha"] != sha or report.get("local_only"):
            raise RuntimeError("Required immutable CI evidence missing or not PASS: " + stage)
        evidence[stage] = report
    build = inputs / "build"
    expected = evidence["frontend"]["build_files"]
    actual = {p.relative_to(build).as_posix(): file_digest(p) for p in sorted(build.rglob("*")) if p.is_file()}
    if actual != expected:
        raise RuntimeError("Downloaded production build differs from tested build")
    destination.mkdir(parents=True, exist_ok=True)
    payload = {}
    for name in git("ls-files", "-z").split("\0"):
        if name.startswith(("backend/", "frontend/", "docs/dev/demo-journey/", "docs/dev/phase2/API_CONTRACT")) or name in {"README.md", "AGENTS.md", "scripts/demo_ci.py"}:
            public_path(name)
            payload["source/" + name] = (ROOT / name).read_bytes()
    for name in actual:
        payload["frontend-dist/" + name] = (build / name).read_bytes()
    payload["CI_EVIDENCE.json"] = json.dumps(evidence, ensure_ascii=False, indent=2).encode()
    manifest = {"schema": "nu.demo-release/1", "source_sha": sha, "run_id": os.environ["GITHUB_RUN_ID"],
                "run_attempt": os.environ["GITHUB_RUN_ATTEMPT"], "runtime_contract": RUNTIME,
                "actual_native_runtime": evidence["native-browser"]["runtime"],
                "migration_identities": list(MIGRATIONS.values()), "offline_contract": "rose.offline-sync.v2",
                "journey_contract": "rose.demo-journey.v1", "synthetic_only": True,
                "scope": "CI smoke and artifact integrity; independent 40AC/local CD/merge/video gates are separate",
                "files": {name: digest(data) for name, data in sorted(payload.items())}}
    manifest["contracts"] = {"source/" + name: manifest["files"]["source/" + name] for name in CONTRACTS}
    manifest["migrations"] = {"source/" + name: manifest["files"]["source/" + name] for name in MIGRATIONS}
    manifest["assets"] = {name: checksum for name, checksum in manifest["files"].items()
                          if name.startswith("frontend-dist/") or PurePosixPath(name).suffix.lower() in {".png", ".jpg", ".webp", ".gif", ".svg"}}
    archive = destination / ("nu-demo-" + sha + ".zip")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for name, data in sorted(payload.items()):
            bundle.writestr(name, data)
        bundle.writestr("RELEASE.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    checksum = file_digest(archive)
    verify_zip(archive, checksum, sha)
    (destination / (archive.name + ".sha256")).write_text(checksum + "  " + archive.name + "\n", encoding="ascii")
    write_json(destination / "RELEASE.json", manifest)
    REPORT.update(release_zip_sha256=checksum, release_filename=archive.name, file_count=len(payload))
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"zip_sha256={checksum}\nfilename={archive.name}\n")


def self_test() -> None:
    for name in ["../secret", "C:/secret", "private/accounts.json", "source/.env", "profile.har"]:
        try:
            public_path(name)
        except RuntimeError:
            continue
        raise AssertionError("Unsafe artifact path admitted")
    SECRETS.append("unique-ci-test-secret")
    assert "unique-ci-test-secret" not in redact("unique-ci-test-secret")
    assert "testpass" not in redact('password="testpass"')
    with tempfile.TemporaryDirectory(prefix="nu-demo-verifier-") as temp:
        path = Path(temp) / "release.zip"
        sha = "a" * 40
        manifest = {"schema": "nu.demo-release/1", "source_sha": sha, "runtime_contract": RUNTIME, "files": {"source/README.md": digest(b"synthetic")}, "contracts": {}, "migrations": {}, "assets": {}}
        with zipfile.ZipFile(path, "w") as bundle:
            bundle.writestr("RELEASE.json", json.dumps(manifest))
            bundle.writestr("source/README.md", b"synthetic")
        checksum = file_digest(path)
        verify_zip(path, checksum, sha)
        for bad_digest, bad_sha in [("0" * 64, sha), (checksum, "b" * 40)]:
            try:
                verify_zip(path, bad_digest, bad_sha)
            except RuntimeError:
                continue
            raise AssertionError("Digest/source mismatch accepted")
        tampered = Path(temp) / "tampered.zip"
        with zipfile.ZipFile(tampered, "w") as bundle:
            bundle.writestr("RELEASE.json", json.dumps(manifest))
            bundle.writestr("source/README.md", b"changed")
        try:
            verify_zip(tampered, file_digest(tampered), sha)
        except RuntimeError:
            pass
        else:
            raise AssertionError("Inner file digest mismatch accepted")
        with zipfile.ZipFile(path, "a") as bundle:
            bundle.writestr("unexpected.txt", "unmanifested")
        try:
            verify_zip(path, file_digest(path), sha)
        except RuntimeError:
            pass
        else:
            raise AssertionError("Unmanifested artifact accepted")
    REPORT["checks"] = ["private/path traversal rejection", "secret redaction", "valid ZIP", "tampered digest", "wrong source SHA", "inner file digest mismatch", "unmanifested member"]


def main() -> int:
    global OUT, REPORT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=["source", "frontend", "native-browser", "package", "verify", "self-test"])
    parser.add_argument("--local", action="store_true", help="source/frontend only; never CI acceptance")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--release-dir", type=Path)
    parser.add_argument("--zip", type=Path)
    parser.add_argument("--expected-digest")
    parser.add_argument("--expected-sha")
    args = parser.parse_args()
    if args.local and args.stage not in {"source", "frontend"}:
        parser.error("--local cannot enable native execution or release publication")
    OUT = Path(os.environ.get("NU_CI_OUTPUT", Path(tempfile.gettempdir()) / "nu-demo-ci-local" / args.stage)).resolve()
    if OUT.is_relative_to(ROOT):
        parser.error("Evidence must be outside the product checkout")
    OUT.mkdir(parents=True, exist_ok=True)
    REPORT = {"schema": "nu.demo-ci/1", "stage": args.stage, "status": "FAIL", "commands": [],
              "scope": "synthetic CI evidence; not production/UAT/physical outage/device/video acceptance"}
    try:
        if args.stage == "source":
            source_checks(args.local)
        elif args.stage == "frontend":
            frontend(args.local)
        elif args.stage == "native-browser":
            if args.input is None:
                raise RuntimeError("--input production build required")
            native_browser(args.input)
        elif args.stage == "package":
            if args.input is None or args.release_dir is None:
                raise RuntimeError("--input and --release-dir required")
            package(args.input, args.release_dir)
        elif args.stage == "verify":
            if not all([args.zip, args.expected_digest, args.expected_sha]):
                raise RuntimeError("ZIP, independent expected digest and source SHA required")
            manifest = verify_zip(args.zip, args.expected_digest, args.expected_sha)
            REPORT.update(source_sha=manifest["source_sha"], verified_files=len(manifest["files"]), zip_sha256=args.expected_digest)
        else:
            self_test()
        if args.stage in {"source", "frontend", "native-browser", "package"} and not args.local:
            source_identity()
        REPORT["status"] = "PASS"
    except Exception as exc:
        REPORT["error"] = redact(str(exc))
        if "CI_BLOCKED" in str(exc):
            REPORT["status"] = "CI_BLOCKED"
    finally:
        # JUnit/native reports can contain assertion data: redact before any artifact step.
        for path in OUT.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".json", ".xml", ".txt"}:
                path.write_text(redact(path.read_text(encoding="utf-8", errors="replace")), encoding="utf-8")
        write_json(OUT / (args.stage + ".json"), REPORT)
    print(f"{args.stage}: {REPORT['status']}")
    return 0 if REPORT["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
