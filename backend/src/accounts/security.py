"""Credential generations are bound only for the current dependency scope."""
from fastapi import HTTPException
from sqlalchemy import select
from src.accounts.models import AccountSecurity


def credential_error():
    return HTTPException(401, {'code': 'AUTH_REQUIRED', 'message': 'Authentication required.'},
                         headers={'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store'})


async def generation(db, user_id):
    value = await db.scalar(select(AccountSecurity.token_version).where(AccountSecurity.user_id == user_id))
    return value if value is not None else 0


async def validate_generation(db, user_id, value):
    if type(value) is not int or value < 0 or value != await generation(db, user_id):
        raise credential_error()


async def recheck_generation(db, user_id):
    bound = db.info.get('account_auth_generations', {})
    if user_id in bound:
        await validate_generation(db, user_id, bound[user_id])
