"""Account effects and sanitized receipts share one transaction."""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import timedelta
from uuid import uuid4
from sqlalchemy import select, func, update
from src.accounts.models import AccountProfile, AccountSecurity, RecoveryChallenge
from src.accounts.schemas import ProfileEdit, RecoveryIssue, PasswordReset, VERSION
from src.accounts.security import generation
from src.core.config import settings
from src.core.security import hash_password
from src.journey.models import JourneyState, JourneyOperation
from src.journey.policy import enabled, fail, now, iso, dt
from src.users.models import UserModel


def keyed(label, value):
    raw = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()
    return hmac.new(settings.JWT_SECRET_KEY.encode(), label.encode() + b'\0' + raw, hashlib.sha256).digest()


def fingerprint(path, env, capability=None):
    return keyed('account-operation-v1', {'path': path, 'envelope': env.model_dump(),
                                         'capability_hash': capability}).hex()


def namespace(anonymous=False):
    value = os.getenv('NU_DEMO_NAMESPACE', '')
    if os.getenv('NU_DEMO_PROFILE') != 'synthetic' or not value:
        fail('RECOVERY_INVALID' if anonymous else 'FORBIDDEN', 403)
    return value


async def lock_users(db, ids):
    rows = (await db.scalars(select(UserModel).where(UserModel.id.in_(set(ids)))
                            .order_by(UserModel.id).with_for_update()
                            .execution_options(populate_existing=True))).all()
    return {user.id: user for user in rows}


async def people(db, issuer_id, target_id, anonymous=False):
    ns = namespace(anonymous)
    users = await lock_users(db, [issuer_id, target_id])
    issuer, target = users.get(issuer_id), users.get(target_id)
    code = 'RECOVERY_INVALID' if anonymous else 'FORBIDDEN'
    if not issuer or issuer.role.value != 'organizer' or issuer.id not in set(os.getenv('NU_DEMO_OWNER_IDS', '').split(',')):
        fail(code, 403)
    if not target or not target.username.startswith(ns):
        fail(code, 403)
    managed = await db.get(JourneyState, 'account:' + target_id, populate_existing=True)
    if not managed or managed.kind != 'account' or not managed.data.get('enabled', True):
        fail(code, 403)
    for person in users.values():
        # enabled also rechecks only the request's authenticated principal's generation.
        try:
            await enabled(db, person.id)
        except Exception as exc:
            from fastapi import HTTPException
            if anonymous and isinstance(exc, HTTPException):
                fail(code, 403)
            raise
    return issuer, target, ns


async def old_operation(db, env, actor, path, capability=None):
    old = await db.get(JourneyOperation, env.operation_id, populate_existing=True)
    if old:
        if old.actor != actor:
            fail('FORBIDDEN', 403)
        if not hmac.compare_digest(old.fingerprint, fingerprint(path, env, capability)):
            fail('IMMUTABLE_CONFLICT')
        return old.receipt


async def commit_receipt(db, env, actor, path, kind, resource, version, effects, capability=None):
    value = {'contract_version': VERSION, 'operation_id': env.operation_id, 'kind': kind,
             'resource_id': resource, 'resource_version': version, 'recorded_at': iso(),
             'outcome': 'applied', 'effects': effects}
    db.add(JourneyOperation(operation_id=env.operation_id, actor=actor, event_id=None,
                            fingerprint=fingerprint(path, env, capability), receipt=value))
    await db.commit()
    return value


async def own(db, user):
    if user is None:
        fail('AUTH_REQUIRED', 401)
    actor = (await lock_users(db, [user.id])).get(user.id)
    if not actor:
        fail('AUTH_REQUIRED', 401)
    await enabled(db, actor.id)
    return actor


async def profile_read(db, user):
    actor = await own(db, user)
    row = await db.get(AccountProfile, actor.id, populate_existing=True)
    return {'contract_version': VERSION, 'account': {'id': actor.id, 'username': actor.username, 'role': actor.role.value},
            'profile': {'display_name': row.display_name if row else actor.username,
                        'preferred_language': row.preferred_language if row else 'en',
                        'version': row.version if row else 0, 'updated_at': iso(row.updated_at) if row else None},
            'as_of_utc': iso()}


async def profile_save(db, user, env):
    data = ProfileEdit.model_validate(env.data)
    actor = await own(db, user)
    path = 'me/profile'
    previous = await old_operation(db, env, actor.id, path)
    if previous:
        return previous
    row = await db.get(AccountProfile, actor.id, populate_existing=True)
    if env.expected_version is None or env.expected_version != (row.version if row else 0):
        fail('STALE_VERSION')
    if row is None:
        row = AccountProfile(user_id=actor.id, version=1, updated_at=now(), **data.model_dump())
        db.add(row)
    else:
        row.display_name = data.display_name
        row.preferred_language = data.preferred_language
        row.version += 1
        row.updated_at = now()
    return await commit_receipt(db, env, actor.id, path, 'account_profile_update', actor.id, row.version,
                                {'account_id': actor.id, 'profile_version': row.version})


async def profile_receipt(db, user, operation_id):
    actor = await own(db, user)
    row = await db.get(JourneyOperation, operation_id)
    if not row:
        fail('NOT_FOUND', 404)
    if row.actor != actor.id or row.receipt.get('kind') != 'account_profile_update':
        fail('FORBIDDEN', 403)
    return row.receipt


def delivery_secret(row):
    raw = keyed('account-recovery-delivery-v1', [row.nonce, row.id, row.target_id, row.issuer_id, row.namespace])
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


async def issue(db, user, env):
    data = RecoveryIssue.model_validate(env.data)
    if env.expected_version is not None or env.data.get('synthetic') is not True:
        fail('INVALID_INPUT', 422)
    issuer, target, ns = await people(db, user.id if user else '', data.account_id)
    path = 'account-recovery/challenges'
    previous = await old_operation(db, env, issuer.id, path)
    if previous:
        return previous
    cutoff = now() - timedelta(minutes=10)
    for column, identifier, limit in [(RecoveryChallenge.target_id, target.id, 3), (RecoveryChallenge.issuer_id, issuer.id, 30)]:
        count = await db.scalar(select(func.count()).select_from(RecoveryChallenge).where(column == identifier, RecoveryChallenge.created_at >= cutoff))
        if count >= limit:
            fail('RECOVERY_RATE_LIMIT', 429)
    await db.execute(update(RecoveryChallenge).where(RecoveryChallenge.target_id == target.id,
                     RecoveryChallenge.used_operation_id.is_(None)).values(invalidated=True))
    created = now()
    row = RecoveryChallenge(id=str(uuid4()), target_id=target.id, issuer_id=issuer.id, namespace=ns,
                            nonce=secrets.token_urlsafe(32), issued_token_version=await generation(db, target.id),
                            created_at=created, expires_at=created + timedelta(minutes=5), attempts=0,
                            invalidated=False, secret_hash='')
    row.secret_hash = hashlib.sha256(delivery_secret(row).encode()).hexdigest()
    db.add(row)
    return await commit_receipt(db, env, issuer.id, path, 'account_recovery_issue', row.id, 1,
                                {'challenge_id': row.id, 'expires_at': iso(row.expires_at), 'provider': 'DEMO_PROVIDER',
                                 'delivery_state': 'demo_recorded', 'external_delivery': False, 'identity_verified': False})


async def challenge(db, identifier, anonymous=False):
    row = await db.get(RecoveryChallenge, identifier, populate_existing=True)
    if not row:
        fail('RECOVERY_INVALID' if anonymous else 'FORBIDDEN', 403)
    await people(db, row.issuer_id, row.target_id, anonymous)
    row = await db.scalar(select(RecoveryChallenge).where(RecoveryChallenge.id == identifier)
                          .with_for_update().execution_options(populate_existing=True))
    if row.namespace != namespace(anonymous):
        fail('RECOVERY_INVALID' if anonymous else 'FORBIDDEN', 403)
    return row


async def live(db, row):
    return (row.used_operation_id is None and not row.invalidated and row.attempts < 5
            and dt(row.expires_at) > now() and row.issued_token_version == await generation(db, row.target_id))


async def demo_message(db, user, identifier):
    row = await challenge(db, identifier)
    if user is None or user.id != row.issuer_id or not await live(db, row):
        fail('FORBIDDEN', 403)
    return {'challenge_id': row.id, 'provider': 'DEMO_PROVIDER', 'recovery_secret': delivery_secret(row),
            'external_delivery': False, 'identity_verified': False}


async def capability(db, row, secret, count_attempt):
    canonical = bool(re.fullmatch(r'[A-Za-z0-9_-]{43}', secret))
    if canonical:
        raw = base64.urlsafe_b64decode(secret + '=')
        canonical = len(raw) == 32 and base64.urlsafe_b64encode(raw).decode().rstrip('=') == secret
    supplied = hashlib.sha256(secret.encode()).hexdigest()
    if not canonical or not secrets.compare_digest(supplied, row.secret_hash):
        if count_attempt and await live(db, row):
            row.attempts += 1
            await db.commit()
        fail('RECOVERY_INVALID', 403)


def within_receipt_window(row):
    return row.used_at is not None and now() < dt(row.used_at) + timedelta(hours=24)


async def reset(db, identifier, secret, env):
    data = PasswordReset.model_validate(env.data)
    if env.expected_version is not None:
        fail('INVALID_INPUT', 422)
    row = await challenge(db, identifier, True)
    await capability(db, row, secret, True)
    actor = 'recovery:' + row.id
    path = 'account-recovery/challenges/' + row.id + '/reset'
    # Used/wrong-operation and deadline refusal precede any operation disclosure.
    if row.used_operation_id is not None:
        if row.used_operation_id != env.operation_id or not within_receipt_window(row):
            fail('RECOVERY_INVALID', 403)
        previous = await old_operation(db, env, actor, path, row.secret_hash)
        if not previous:
            fail('RECOVERY_INVALID', 403)
        return previous
    if not await live(db, row):
        fail('RECOVERY_INVALID', 403)
    # A foreign global UUID must refuse before any password mutation.
    previous = await old_operation(db, env, actor, path, row.secret_hash)
    if previous:
        fail('RECOVERY_INVALID', 403)
    user = await db.get(UserModel, row.target_id)
    security = await db.get(AccountSecurity, row.target_id, populate_existing=True)
    if security is None:
        security = AccountSecurity(user_id=row.target_id, token_version=0)
        db.add(security)
    user.password_hash = hash_password(data.new_password)
    security.token_version += 1
    row.used_operation_id = env.operation_id
    row.used_at = now()
    await db.execute(update(RecoveryChallenge).where(RecoveryChallenge.target_id == row.target_id,
                     RecoveryChallenge.id != row.id, RecoveryChallenge.used_operation_id.is_(None)).values(invalidated=True))
    return await commit_receipt(db, env, actor, path, 'account_password_reset', row.id, security.token_version,
                                {'credentials_changed': True, 'reauthentication_required': True}, row.secret_hash)


async def reset_receipt(db, identifier, operation_id, secret):
    row = await challenge(db, identifier, True)
    await capability(db, row, secret, False)
    if row.used_operation_id is None:
        if await live(db, row):
            fail('NOT_FOUND', 404)
        fail('RECOVERY_INVALID', 403)
    if row.used_operation_id != operation_id or not within_receipt_window(row):
        fail('RECOVERY_INVALID', 403)
    old = await db.get(JourneyOperation, operation_id)
    if not old or old.actor != 'recovery:' + row.id or old.receipt.get('kind') != 'account_password_reset':
        fail('RECOVERY_INVALID', 403)
    return old.receipt
