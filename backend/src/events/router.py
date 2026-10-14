from fastapi import APIRouter, Depends, status, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_async_db
from src.auth.deps import get_current_user
from src.users.models import UserModel
# Added PaginatedEventResponse
from src.events.schemas import EventCreate, EventResponse, PaginatedEventResponse
from src.events.service import EventService

router = APIRouter(prefix="/events", tags=["Events"])


def get_event_service(db: AsyncSession = Depends(get_async_db)) -> EventService:
    return EventService(db)


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event_endpoint(
    payload: EventCreate,
    event_service: EventService = Depends(get_event_service),
    current_user: UserModel = Depends(get_current_user)
):
    organizer_id = current_user.id
    new_event = await event_service.create_event(event_in=payload, organizer_id=organizer_id)
    return new_event


# --- Rewritten Route Matching Exactly: GET /events?page=1&pageSize=20 ---
@router.get(
    "",
    response_model=PaginatedEventResponse,
    status_code=status.HTTP_200_OK,
    summary="Get all event records using page-based pagination"
)
async def get_all_events_endpoint(
    page: int = Query(
        default=1, ge=1, description="The target data page index number"),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize",
                           description="The maximum number of event rows per collection batch slice"),
    status: str | None = Query(
        default=None, description="Optional status lifecycle boundary filtering (e.g. ACTIVE)"),
    event_service: EventService = Depends(get_event_service)
):
    """
    Retrieves a paginated list array containing existing event registration blocks.
    - **Supports explicit page configurations**: `GET /events?page=1&pageSize=20`
    - **Protects compute loops**: Caps maximum pagination parameters at 100 entries per transaction query block.
    """
    return await event_service.get_paginated_events(
        page=page,
        page_size=page_size,
        status_filter=status
    )


@router.get(
    "/{public_id}",
    response_model=EventResponse,
    status_code=status.HTTP_200_OK,
    summary="Get event details by public string identifier"
)
async def get_event_by_public_id(
    public_id: str,
    event_service: EventService = Depends(get_event_service)
):
    if len(public_id) != 21:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid identifier structure. Expected a 21-character public ID."
        )

    event = await event_service.get_event_by_public_id(public_id=public_id)

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with public identifier '{public_id}' was not found"
        )

    return event
