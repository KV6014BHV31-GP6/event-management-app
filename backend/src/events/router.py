from fastapi import APIRouter, Depends, status, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_async_db
from src.auth.deps import get_current_user
from src.users.models import UserModel
from src.events.models import EventStatusEnum
from src.events.schemas import (
    EventCreate,
    EventCreateResponse,
    EventDetailResponse,
    PaginatedEventResponse
)
from src.events.service import EventService

router = APIRouter(prefix="/events", tags=["Events"])


def get_event_service(db: AsyncSession = Depends(get_async_db)) -> EventService:
    return EventService(db)


@router.post("", response_model=EventCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_event_endpoint(
    payload: EventCreate,
    event_service: EventService = Depends(get_event_service),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Protected Endpoint: Restricted to system organizers.
    Creates an event record and bridges file links.
    """
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
    status_filter: str | None = Query(default=None, alias="status"),
    keyword: str | None = Query(default=None),
    event_service: EventService = Depends(get_event_service)
):
    """
    Public Endpoint: Returns a paginated listing of active system events 
    filtered by optional status and keyword criteria.
    """
    if status_filter:
        valid_statuses = {s.value for s in EventStatusEnum}
        if status_filter.lower() not in valid_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status value parameter. Expected one of: {list(valid_statuses)}."
            )

    return await event_service.get_paginated_events(
        page=page,
        page_size=page_size,
        status_filter=status_filter.lower() if status_filter else None,
        keyword=keyword
    )


@router.get("/{public_id}", response_model=EventDetailResponse, status_code=status.HTTP_200_OK)
async def get_event_by_public_id_endpoint(
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
