from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy.ext.asyncio import AsyncSession
from src.auth.deps import get_current_user, get_optional_current_user, require_organizer
from src.core.database import get_async_db
from src.users.models import UserModel
from src.registrations.schemas import RegistrationCreate, RegistrationResponse, RegistrationStatus
from src.registrations.service import RegistrationService

router = APIRouter(tags=["Registrations"])


@router.post("/events/{public_id}/registrations", response_model=RegistrationResponse, status_code=http_status.HTTP_201_CREATED)
async def create_registration_endpoint(public_id: str, payload: RegistrationCreate,
    db: AsyncSession = Depends(get_async_db), current_user: UserModel | None = Depends(get_optional_current_user)):
    if len(public_id) != 21:
        raise HTTPException(400, "Invalid identifier structure. Expected a 21-character public NanoID ID.")
    return await RegistrationService.create_online_registration(db, public_id, payload, current_user.id if current_user else None)


@router.get("/me/registrations", response_model=list[RegistrationResponse])
async def get_my_registrations_endpoint(status: RegistrationStatus | None = Query(None),
    user: UserModel = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    return await RegistrationService.get_user_registrations(db, user.id, status)


@router.post("/me/registrations/{registration_id}/cancel", response_model=RegistrationResponse)
async def cancel_my_registration_endpoint(registration_id: str,
    user: UserModel = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    return await RegistrationService.cancel_user_registration(db, registration_id, user.id)


@router.get("/registrations", response_model=list[RegistrationResponse])
async def list_all_registrations_endpoint(status: RegistrationStatus | None = Query(None),
    organizer: UserModel = Depends(require_organizer), db: AsyncSession = Depends(get_async_db)):
    return await RegistrationService.get_all_registrations(db, status)


@router.get("/registrations/{registration_id}", response_model=RegistrationResponse)
async def get_registration_detail_endpoint(registration_id: str,
    organizer: UserModel = Depends(require_organizer), db: AsyncSession = Depends(get_async_db)):
    return await RegistrationService.get_registration_by_id(db, registration_id)


@router.post("/registrations/{registration_id}/approve", response_model=RegistrationResponse)
async def approve_registration_endpoint(registration_id: str,
    organizer: UserModel = Depends(require_organizer), db: AsyncSession = Depends(get_async_db)):
    return await RegistrationService.approve_registration(db, registration_id, organizer.id)
