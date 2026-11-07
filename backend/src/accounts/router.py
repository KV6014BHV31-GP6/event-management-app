from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import ValidationError
from sqlalchemy.exc import DBAPIError, IntegrityError
from src.accounts import service
from src.accounts.schemas import Envelope
from src.auth.deps import get_current_user, auth_scope
from src.core.database import get_async_db

router = APIRouter(prefix='/api/v2/operations', tags=['Accounts'])


async def execute(db, response, action):
    response.headers['Cache-Control'] = 'no-store'
    try:
        return await action()
    except HTTPException as exc:
        await db.rollback()
        exc.headers = {**(exc.headers or {}), 'Cache-Control': 'no-store'}
        raise
    except (ValidationError, ValueError, TypeError, UnicodeError):
        await db.rollback()
        raise HTTPException(422, {'code': 'INVALID_INPUT', 'message': 'Invalid account input.'}, headers={'Cache-Control': 'no-store'}) from None
    except DBAPIError as exc:
        await db.rollback()
        state = getattr(exc.orig, 'sqlstate', None) or getattr(exc.orig, 'pgcode', None)
        if isinstance(exc, IntegrityError) or state in {'40P01', '40001'}:
            raise HTTPException(409, {'code': 'TRANSACTION_CONFLICT', 'message': 'Transaction rolled back; reconcile the original operation.'}, headers={'Cache-Control': 'no-store'}) from None
        # A connection failure during COMMIT can be indeterminate even after rollback.
        raise HTTPException(500, {'code': 'OPERATION_OUTCOME_UNKNOWN', 'message': 'Reconcile the original operation before any retry.'}, headers={'Cache-Control': 'no-store'}) from None
    except Exception:
        await db.rollback()
        raise HTTPException(500, {'code': 'OPERATION_OUTCOME_UNKNOWN', 'message': 'Reconcile the original operation before any retry.'}, headers={'Cache-Control': 'no-store'}) from None


@router.get('/me/profile')
async def read_profile(response: Response, db=Depends(get_async_db), user=Depends(get_current_user)):
    return await execute(db, response, lambda: service.profile_read(db, user))


@router.post('/me/profile')
async def save_profile(request: Request, response: Response, db=Depends(get_async_db), user=Depends(get_current_user)):
    async def action():
        return await service.profile_save(db, user, Envelope.model_validate(await request.json()))
    return await execute(db, response, action)


@router.get('/me/profile/receipts/{operation_id}')
async def read_profile_receipt(operation_id: str, response: Response, db=Depends(get_async_db), user=Depends(get_current_user)):
    return await execute(db, response, lambda: service.profile_receipt(db, user, operation_id))


@router.post('/account-recovery/challenges')
async def issue_recovery(request: Request, response: Response, db=Depends(get_async_db), user=Depends(get_current_user)):
    async def action():
        return await service.issue(db, user, Envelope.model_validate(await request.json()))
    return await execute(db, response, action)


@router.get('/account-recovery/challenges/{identifier}/demo-message')
async def recovery_delivery(identifier: str, response: Response, db=Depends(get_async_db), user=Depends(get_current_user)):
    return await execute(db, response, lambda: service.demo_message(db, user, identifier))


@router.post('/account-recovery/challenges/{identifier}/reset')
async def reset_password(identifier: str, request: Request, response: Response, db=Depends(get_async_db), scope=Depends(auth_scope)):
    async def action():
        env = Envelope.model_validate(await request.json())
        value = await service.reset(db, identifier, request.headers.get('X-Account-Recovery', ''), env)
        response.delete_cookie('refresh_token', path='/', httponly=True, secure=True, samesite='strict')
        return value
    return await execute(db, response, action)


@router.get('/account-recovery/challenges/{identifier}/receipts/{operation_id}')
async def recovery_receipt(identifier: str, operation_id: str, request: Request, response: Response, db=Depends(get_async_db), scope=Depends(auth_scope)):
    return await execute(db, response, lambda: service.reset_receipt(db, identifier, operation_id, request.headers.get('X-Account-Recovery', '')))
