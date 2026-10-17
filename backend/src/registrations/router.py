from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import get_optional_current_user
from src.core.database import get_async_db
from src.registrations.schemas import RegistrationCreate, RegistrationResponse
from src.registrations.service import RegistrationService
from src.users.models import UserModel

router = APIRouter(tags=["Registrations"])


@router.post(
    "/events/{public_id}/registrations",
    response_model=RegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an online event registration"
)
async def create_registration_endpoint(
    public_id: str,
    payload: RegistrationCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: UserModel | None = Depends(get_optional_current_user)
):
    """
    Submits a registration request form for a specific event using its public NanoID.

    - **Data Comparison**: Dynamically patches existing participant table values if personal details have shifted.
    - **Transactional**: Fully rolls back state mutations cleanly if any validation rule check blocks fail.
    """
    if len(public_id) != 21:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid identifier structure. Expected a 21-character public NanoID ID."
        )

    operator_id = current_user.id if current_user else None

    return await RegistrationService.create_online_registration(
        db=db,
        event_public_id=public_id,
        form_in=payload,
        current_user_id=operator_id
    )
