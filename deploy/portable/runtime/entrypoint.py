"""Container-only supervisor. Never seeds users, events, or replaces existing DB data."""
from pathlib import Path
from urllib.parse import quote
import asyncio, json, os, re, signal, subprocess, sys, time

ROOT=Path('/opt/nu')
EXPECTED='0e8bba3863267223ede48ddca35f8bb2017a5e3a'

def read_secret(root: Path, name: str) -> str:
    path=root/name
    value=path.read_text(encoding='utf-8').strip()
    if not 32 <= len(value) <= 256 or any(ord(c)<32 for c in value):
        raise ValueError('INVALID_SECRET_'+name)
    return value

def configured_env(source=None, secret_root=Path('/run/secrets')):
    source=dict(os.environ if source is None else source)
    host=source.get('NU_DB_HOST','db');port=source.get('NU_DB_PORT','5432')
    db=source.get('NU_DB_NAME','nu_container_demo');user=source.get('NU_DB_USER','nu_app')
    if not re.fullmatch(r'[a-zA-Z0-9_.-]+',host) or not port.isdigit() or not 1<=int(port)<=65535:
        raise ValueError('INVALID_DATABASE_ADDRESS')
    if not all(re.fullmatch(r'[a-z][a-z0-9_]{0,62}',x) for x in (db,user)):
        raise ValueError('INVALID_DATABASE_IDENTITY')
    password=read_secret(secret_root,'db_app_password')
    jwt=read_secret(secret_root,'jwt_secret')
    source.update(DATABASE_URL=f'postgresql+asyncpg://{user}:{quote(password,safe="")}@{host}:{port}/{db}',
      JWT_SECRET_KEY=jwt,ENVIRONMENT='development',PYTHONDONTWRITEBYTECODE='1',
      PYTHONPATH=str(ROOT/'backend'),UPLOAD_DIR='/data/uploads',
      PRIVATE_UPLOAD_DIR='/data/private_assets',STORAGE_PROVIDER='local',
      NU_DEMO_PROFILE='synthetic',NU_DEMO_NAMESPACE=source.get('NU_DEMO_NAMESPACE','vm1104'))
    return source

def verify_identity():
    manifest=json.loads((ROOT/'RELEASE.json').read_text(encoding='utf-8'))
    if manifest['source_sha']!=EXPECTED or os.getenv('NU_EXPECTED_SOURCE_SHA',EXPECTED)!=EXPECTED:
        raise ValueError('SOURCE_IDENTITY_MISMATCH')

async def init_empty_schema(db_name: str):
    # Explicit operator action, empty named container DB only. No credentials/accounts seeded.
    if db_name!='nu_container_demo' or os.getenv('NU_DB_NAME')!=db_name:
        raise ValueError('DATABASE_ACK_MISMATCH')
    from sqlalchemy import text
    from src.main import app  # registers the existing source models
    from src.core.database import Base, async_engine
    try:
        async with async_engine.begin() as connection:
            actual=await connection.scalar(text('SELECT current_database()'))
            admin=await connection.scalar(text('SELECT rolsuper FROM pg_roles WHERE rolname=current_user'))
            tables=await connection.scalar(text("SELECT count(*) FROM pg_tables WHERE schemaname='public'"))
            if actual!=db_name or admin or tables!=0:
                raise ValueError('REFUSE_NONEMPTY_OR_PRIVILEGED_DATABASE')
            await connection.run_sync(Base.metadata.create_all)
        print('EMPTY_SYNTHETIC_SCHEMA_INITIALIZED; no accounts/events created',flush=True)
    finally:
        await async_engine.dispose()

def serve(env):
    children=[];stopping=False
    def stop(*_):
        nonlocal stopping
        if stopping:return
        stopping=True
        for child in children:
            if child.poll() is None:child.terminate()
    for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,stop)
    try:
        children.append(subprocess.Popen([sys.executable,'-B','-m','uvicorn','src.main:app',
          '--app-dir',str(ROOT/'backend'),'--host','127.0.0.1','--port','8000','--no-access-log'],env=env,cwd=ROOT/'backend'))
        # Gateway never receives database passwords or JWT signing secrets.
        node_env={key:val for key,val in env.items() if key not in ('DATABASE_URL','JWT_SECRET_KEY')}
        children.append(subprocess.Popen(['node',str(ROOT/'runtime/server.mjs')],env=node_env,cwd=ROOT))
        while not stopping and all(p.poll() is None for p in children):time.sleep(.3)
        failed=not stopping
    finally:
        stop()
        for child in children:
            try:child.wait(timeout=8)
            except subprocess.TimeoutExpired:child.kill();child.wait(timeout=2)
    return 1 if failed else 0

def main():
    verify_identity()
    env=configured_env();os.environ.update(env);sys.path.insert(0,str(ROOT/'backend'))
    if sys.argv[1:]==['serve']:return serve(env)
    if sys.argv[1:]==['init-empty-schema','--ack-new-synthetic-db','nu_container_demo']:
        asyncio.run(init_empty_schema('nu_container_demo'));return 0
    raise ValueError('UNKNOWN_OPERATION')

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as exc:
        # Exception messages may contain private connection values; never print them.
        print('NU container stopped: '+type(exc).__name__+'; inspect local configuration.',file=sys.stderr)
        raise SystemExit(1)
