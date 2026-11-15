"""Explicit, stable-key synthetic content installation for the existing NU staging.

Default is read-only dry-run. Apply requires the fixed operation, an audited manifest,
normal account passwords supplied privately, and a non-superuser nu_staging DB.
No existing account/event is reset. A repeated operation reads its original receipt.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import enum
import hashlib
import json
import os
from pathlib import Path
import re

OPERATION = 'nu-web-release-20261116-v1'
ROLES = {'member1':'user', 'member2':'user', 'leader1':'leader', 'leader2':'leader',
         'organizer1':'organizer', 'organizer2':'organizer'}
ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'


def stable_id(key):
    number = int.from_bytes(hashlib.sha256((OPERATION + ':' + key).encode()).digest()[:16], 'big')
    value = ''
    for _ in range(26):
        value = ALPHABET[number & 31] + value
        number >>= 5
    return value


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(value).hexdigest()


def timestamp(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Timezone required')
    return result


def load_manifest(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('operation_id') != OPERATION or data.get('synthetic_only') is not True:
        raise ValueError('Unexpected synthetic manifest')
    rows = data.get('events', [])
    if not rows or len({row['public_id'] for row in rows}) != len(rows):
        raise ValueError('Empty or duplicate event inventory')
    for row in rows:
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,21}', row['public_id']):
            raise ValueError('Invalid stable event ID')
        if row['organizer'] not in {'organizer1','organizer2'} or row.get('intended_public') is not True:
            raise ValueError('Unsupported event owner or publication intent')
        if not timestamp(row['start_time']) < timestamp(row['end_time']):
            raise ValueError('Invalid event time')
        if not timestamp(row['registration_opens_at']) < timestamp(row['registration_closes_at']) <= timestamp(row['end_time']):
            raise ValueError('Invalid registration window')
        if min(row['online_quota'], row['offline_quota']) < 0 or row['online_quota'] + row['offline_quota'] <= 0:
            raise ValueError('Invalid event quota')
        if not 1 <= len(row['images']) <= 3:
            raise ValueError('Expected one to three real event images')
        for image in row['images']:
            target = (path.parent / image['file']).resolve()
            if not target.is_relative_to(path.parent.resolve()) or not target.is_file():
                raise ValueError('Missing or escaping image')
            raw = target.read_bytes()
            if not raw.startswith(b'\x89PNG\r\n\x1a\n') or digest(raw) != image['sha256']:
                raise ValueError('Image source/hash mismatch')
    return data, digest(canonical(data).encode())


def serialize(value):
    if isinstance(value, datetime): return value.isoformat()
    if isinstance(value, enum.Enum): return value.value
    if isinstance(value, bytes): return {'hex':value.hex()}
    raise TypeError(type(value).__name__)


async def run(manifest_path, *, apply=False, credentials=None, backup_root=None):
    from sqlalchemy import select, text, func
    from src.main import app  # noqa: F401 - complete existing model registry
    from src.core.database import AsyncSessionLocal, Base, async_engine
    from src.core.config import settings
    from src.core.security import hash_password
    from src.users.models import UserModel, UserRoleEnum
    from src.events.models import EventModel, EventStatusEnum
    from src.phase2.models import AssetModel, EventImageModel
    from src.journey.models import JourneyState

    manifest, manifest_hash = load_manifest(Path(manifest_path))
    if os.getenv('NU_DEMO_PROFILE') != 'synthetic':
        raise ValueError('Synthetic profile required')
    receipt_key = 'release-seed:' + OPERATION
    try:
        async with AsyncSessionLocal() as db, db.begin():
            if await db.scalar(text('SELECT current_database()')) != 'nu_staging':
                raise ValueError('Refusing wrong database')
            if await db.scalar(text('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')) is not False:
                raise ValueError('Refusing privileged database role')
            await db.execute(text('SELECT pg_advisory_xact_lock(20261116, 1)'))
            previous = await db.get(JourneyState, receipt_key)
            if previous:
                if previous.data['manifest_sha256'] != manifest_hash:
                    raise ValueError('Recorded operation has different manifest; no replay')
                # The committed receipt is the authority after any lost startup acknowledgement.
                return {**previous.data, 'result':'ALREADY_APPLIED_READBACK'}
            account_plan = []
            for username, role in ROLES.items():
                identifier = stable_id('account:' + username)
                matches = (await db.scalars(select(UserModel).where(
                    (UserModel.id == identifier) | (UserModel.username == username)))).all()
                if matches and (len(matches) != 1 or matches[0].id != identifier or matches[0].username != username or matches[0].role.value != role):
                    raise ValueError('Account source-key collision; existing user preserved')
                account_plan.append({'username':username,'id':identifier,'role':role,'create':not matches})
            existing_events = {e.public_id:e for e in (await db.scalars(select(EventModel).where(
                EventModel.public_id.in_([e['public_id'] for e in manifest['events']])))).all()}
            for event in manifest['events']:
                old = existing_events.get(event['public_id'])
                if old and old.organizer_id != stable_id('account:' + event['organizer']):
                    raise ValueError('Event source-key collision; existing event preserved')
                if old:
                    raise ValueError('Event exists without original operation receipt; reconcile before write')
            plan = {'operation_id':OPERATION,'manifest_sha256':manifest_hash,
                    'accounts_to_create':sum(a['create'] for a in account_plan),
                    'events_to_create':len(manifest['events']),
                    'event_public_ids':[e['public_id'] for e in manifest['events']]}
            if not apply: return {**plan,'result':'DRY_RUN_NO_WRITES'}
            if os.getenv('NU_STAGING_CONTENT_OPERATION') != OPERATION:
                raise ValueError('Explicit staging content operation required')
            values = credentials if credentials is not None else json.loads(os.environ['NU_STAGING_ACCOUNTS_JSON'])
            if not isinstance(values,list) or len(values) != len(ROLES):
                raise ValueError('Exactly six private role credentials required')
            passwords = {v['username']:v for v in values}
            if set(passwords) != set(ROLES): raise ValueError('Unexpected private account inventory')
            for username, role in ROLES.items():
                value = passwords[username]
                if value.get('role') != role or not isinstance(value.get('password'),str) or not 12 <= len(value['password'].encode()) <= 72:
                    raise ValueError('Invalid role or password bounds')
            backup_dir = Path(backup_root or '/data/release-backups')
            backup_dir.mkdir(mode=0o700,parents=True,exist_ok=True)
            backup_file = backup_dir / (OPERATION + '-before.json')
            snapshot = {'operation_id':OPERATION,'manifest_sha256':manifest_hash,'observed_at':datetime.now(timezone.utc).isoformat(),'tables':{}}
            for table in Base.metadata.sorted_tables:
                snapshot['tables'][table.name] = [dict(r) for r in (await db.execute(select(table))).mappings()]
            raw_backup = json.dumps(snapshot,default=serialize,ensure_ascii=False).encode()
            if backup_file.exists():
                old_backup = json.loads(backup_file.read_text(encoding='utf-8'))
                if old_backup.get('operation_id') != OPERATION or old_backup.get('manifest_sha256') != manifest_hash:
                    raise ValueError('Backup identity conflict')
            else:
                descriptor = os.open(backup_file,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
                with os.fdopen(descriptor,'wb') as output: output.write(raw_backup)
            for account in account_plan:
                if account['create']:
                    db.add(UserModel(id=account['id'],username=account['username'],role=UserRoleEnum(account['role']),password_hash=hash_password(passwords[account['username']]['password'])))
            await db.flush()
            asset_root = Path(settings.PRIVATE_UPLOAD_DIR).resolve()
            asset_root.mkdir(parents=True,exist_ok=True)
            for item in manifest['events']:
                event = EventModel(public_id=item['public_id'],organizer_id=stable_id('account:'+item['organizer']),title=item['title'],overview=item['overview'],location=item['location'],online_quota=item['online_quota'],offline_quota=item['offline_quota'],start_time=timestamp(item['start_time']),end_time=timestamp(item['end_time']),status=EventStatusEnum.active)
                db.add(event); await db.flush()
                db.add(JourneyState(key='event:'+event.public_id,kind='event',event_id=event.id,version=1,data={
                    'state':'published','timezone':item['timezone'],'registration_opens_at':item['registration_opens_at'],'registration_closes_at':item['registration_closes_at'],'change_notice':None,'policy':item['policy']}))
                for position, asset in enumerate(item['images']):
                    asset_id = stable_id('image:'+event.public_id+':'+str(position))
                    storage_key = asset_id+'.png'
                    raw = (Path(manifest_path).parent / asset['file']).read_bytes()
                    target = asset_root / storage_key
                    if target.exists():
                        if digest(target.read_bytes()) != asset['sha256']: raise ValueError('Existing image byte collision')
                    else:
                        with target.open('xb') as output: output.write(raw)
                    db.add(AssetModel(id=asset_id,owner_id=event.organizer_id,purpose='event_image',name=Path(asset['file']).name,mime_type='image/png',size=len(raw),storage_key=storage_key))
                    await db.flush()
                    db.add(EventImageModel(event_id=event.id,file_id=asset_id,position=position))
                if item.get('assigned_leader'):
                    leader = stable_id('account:'+item['assigned_leader'])
                    code = digest((OPERATION+event.public_id+leader).encode())[:24]
                    key = 'leader:'+event.public_id+':'+leader
                    db.add(JourneyState(key=key,kind='leader',event_id=event.id,version=1,data={'leader_id':leader,'reserved_quota':min(5,event.offline_quota),'active':True,'referral_code':code,'public_url':'?view=event&event='+event.public_id+'&ref='+code}))
                    db.add(JourneyState(key='referral:'+code,kind='referral',event_id=event.id,version=1,data={'assignment':key}))
            result = {**plan,'result':'APPLIED','recorded_at':datetime.now(timezone.utc).isoformat(),'backup_file':str(backup_file),'backup_sha256':digest(backup_file.read_bytes()),'accounts':[{'username':a['username'],'id':a['id'],'role':a['role']} for a in account_plan]}
            db.add(JourneyState(key=receipt_key,kind='release_seed',version=1,data=result))
            await db.flush()
        return result
    finally:
        await async_engine.dispose()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    try:
        result=asyncio.run(run(args.manifest,apply=args.apply))
        print(json.dumps(result,ensure_ascii=False))
        return 0
    except Exception as error:
        print('Staging content stopped: '+type(error).__name__+'; reconcile original operation before retry.')
        return 1


if __name__=='__main__': raise SystemExit(main())
