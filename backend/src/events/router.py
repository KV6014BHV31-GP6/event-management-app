from fastapi import APIRouter, Depends, status, HTTPException, Query
from datetime import timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.events.models import EventModel
from src.core.database import get_async_db
from src.auth.deps import get_current_user
from src.users.models import UserModel
from src.events.schemas import EventCreate, EventResponse, PaginatedEventResponse, EventUpdate
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
    # Authorization Guard: Restrict access to organizers early in the execution path
    if current_user.role.value != "organizer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This endpoint is restricted to system organizers only."
        )
    return await event_service.create_event(event_in=payload, organizer_id=current_user.id)


@router.get("", response_model=PaginatedEventResponse, status_code=status.HTTP_200_OK)
async def get_all_events_endpoint(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    status: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    event_service: EventService = Depends(get_event_service)
):
    return await event_service.get_paginated_events(
        page=page,
        page_size=page_size,
        status_filter=status,
        keyword=keyword
    )


@router.get("/{public_id}", response_model=EventResponse, status_code=status.HTTP_200_OK)
async def get_event_by_public_id(
    public_id: str,
    event_service: EventService = Depends(get_event_service)
):
    if len(public_id) != 21:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid identifier structure. Expected a 21-character public NanoID ID."
        )

    event = await event_service.get_event_by_public_id(public_id=public_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with public identifier '{public_id}' was not found"
        )
    return event


@router.patch("/{public_id}", response_model=EventResponse, status_code=status.HTTP_200_OK)
async def update_event_endpoint(
    public_id: str,
    payload: EventUpdate,
    event_service: EventService = Depends(get_event_service),
    current_user: UserModel = Depends(get_current_user)
):
    if len(public_id) != 21:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid identifier structure. Expected a 21-character public NanoID ID."
        )

    if current_user.role.value != "organizer":
        raise HTTPException(status_code=403, detail="Organizer account required.")
    # Share the same event lock as approval/cancellation; re-read after waiting.
    base_event = await event_service.db.execute(select(EventModel).where(EventModel.public_id == public_id)
        .with_for_update().execution_options(populate_existing=True))
    db_event = base_event.scalar_one_or_none()

    if not db_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with identifier '{public_id}' was not found."
        )

    if db_event.organizer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied. You do not have permission to modify this event record."
        )

    proposed_start = payload.start_time or db_event.start_time
    proposed_end = payload.end_time or db_event.end_time
    # Native PG returns aware values; preserve compatibility with legacy/SQLite reads.
    if proposed_start.tzinfo is None:
        proposed_start = proposed_start.replace(tzinfo=timezone.utc)
    if proposed_end.tzinfo is None:
        proposed_end = proposed_end.replace(tzinfo=timezone.utc)
    if proposed_end <= proposed_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Timeline mismatch constraint. The end_time must be later than the start_time."
        )

    return await event_service.update_event(public_id=public_id, event_update=payload)
