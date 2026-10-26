from fastapi import APIRouter, Depends, status, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_async_db
from src.auth.deps import get_current_user
from src.users.models import UserModel
from src.participants.schemas import ParticipantUpdate, ParticipantResponse, PaginatedParticipantResponse
from src.participants.service import ParticipantService

router = APIRouter(prefix="/participants", tags=["Participants"])


def get_participant_service(db: AsyncSession = Depends(get_async_db)) -> ParticipantService:
    return ParticipantService(db)


def require_organizer(current_user: UserModel = Depends(get_current_user)) -> UserModel:
    """
    Dependency guard to verify the authenticated user is an authorized organizer.
    Adjust the property check below (e.g., current_user.role) to fit your Auth architecture.
    """
    # Example assumption: Your UserModel has a role attribute or is_organizer boolean flag.
    # Adjust this line to match your exact user permission properties.
    if getattr(current_user, "role", None) != "organizer" and not getattr(current_user, "is_organizer", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied. Only organizers have administrative access to participant records."
        )
    return current_user


@router.get("", response_model=PaginatedParticipantResponse, status_code=status.HTTP_200_OK)
async def get_all_participants_endpoint(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    keyword: str | None = Query(
        default=None, description="Search profile by name or telephone strings"),
    participant_service: ParticipantService = Depends(get_participant_service),
    # 🔒 Enforces authenticated organizer permission role
    organizer: UserModel = Depends(require_organizer)
):
    return await participant_service.get_paginated_participants(page=page, page_size=page_size, keyword=keyword)


@router.get("/{participant_id}", response_model=ParticipantResponse, status_code=status.HTTP_200_OK)
async def get_participant_by_id_endpoint(
    participant_id: str,
    participant_service: ParticipantService = Depends(get_participant_service),
    # 🔒 Enforces authenticated organizer permission role
    organizer: UserModel = Depends(require_organizer)
):
    if len(participant_id) != 26:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature formatting structure. Expected a 26-character profile ULID ID."
        )

    participant = await participant_service.get_participant_by_id(participant_id=participant_id)
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Participant directory entity '{participant_id}' was not found."
        )
    return participant


@router.patch("/{participant_id}", response_model=ParticipantResponse, status_code=status.HTTP_200_OK)
async def update_participant_endpoint(
    participant_id: str,
    payload: ParticipantUpdate,
    participant_service: ParticipantService = Depends(get_participant_service),
    # 🔒 Enforces authenticated organizer permission role
    organizer: UserModel = Depends(require_organizer)
):
    if len(participant_id) != 26:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature formatting structure. Expected a 26-character profile ULID ID."
        )

    db_participant = await participant_service.get_participant_by_id(participant_id=participant_id)
    if not db_participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Participant profile record '{participant_id}' was not found."
        )

    return await participant_service.update_participant(
        db_participant=db_participant, update_in=payload, updater_user_id=organizer.id
    )
