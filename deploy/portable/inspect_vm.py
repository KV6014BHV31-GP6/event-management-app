"""Read-only inventory of the exact existing Grok VM deployment. No restart/seed/login."""
from pathlib import Path
from datetime import datetime, timezone
import json, socket, subprocess
ROOT=Path('/workspace/nu-rose-pulse-demo-20261104')
EXPECTED_HOST='grok-bot-vm-153244427'
if socket.gethostname()!=EXPECTED_HOST:
    raise SystemExit('Wrong host; refusing to inspect a different computer.')
if not (ROOT/'repo/.git').exists():raise SystemExit('Existing repo not found; no creation attempted.')
def git(*args):
    return subprocess.check_output(['git','-C',str(ROOT/'repo'),*args],text=True,timeout=5).strip()
report={'at':datetime.now(timezone.utc).isoformat(),'host':socket.gethostname(),'root':str(ROOT),
        'head':git('rev-parse','HEAD'),'dirty':bool(git('status','--porcelain')),'ports':{},
        'mutations':0,'historical_receipts':[]}
for port in (5261,5262,8061,55441):
    with socket.socket() as s:
        s.settimeout(.4);report['ports'][str(port)]={'tcp_listens':s.connect_ex(('127.0.0.1',port))==0}
for name in ('POSTGRES_READY.json','SCHEMA_READY.json','VM_DEPLOY_READY.json','SEED_COMPLETE.json'):
    p=ROOT/'evidence'/name
    report['historical_receipts'].append({'name':name,'exists':p.is_file(),
      'modified_utc':datetime.fromtimestamp(p.stat().st_mtime,timezone.utc).isoformat() if p.is_file() else None})
print(json.dumps(report,indent=2))
