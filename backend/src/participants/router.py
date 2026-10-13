from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import get_optional_current_user
from src.core.database import get_async_db
from src.participants.schemas import ParticipantCreate, ParticipantResponse
from src.participants.service import ParticipantService
from src.users.models import UserModel

router = APIRouter(prefix="/participants", tags=["Participants"])


@router.post("", response_model=ParticipantResponse, status_code=status.HTTP_201_CREATED)
async def create_participant(
    participant_in: ParticipantCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: UserModel | None = Depends(get_optional_current_user)
):
    return await ParticipantService.create_participant(
        db=db,
        participant_in=participant_in,
        current_user=current_user
    )
