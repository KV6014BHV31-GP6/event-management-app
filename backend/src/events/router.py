from fastapi import APIRouter, Depends, status, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_async_db
from src.auth.deps import require_organizer
from src.users.models import UserModel
from src.events.models import EventStatusEnum
from src.events.schemas import EventCreate, EventResponse, PaginatedEventResponse
from src.events.service import EventService

router = APIRouter(prefix="/events", tags=["Events"])


def get_event_service(db: AsyncSession = Depends(get_async_db)):
    return EventService(db)


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event_endpoint(payload: EventCreate,
                                service: EventService = Depends(get_event_service),
                                organizer: UserModel = Depends(require_organizer)):
    return await service.create_event(payload, organizer.id)


@router.get("", response_model=PaginatedEventResponse)
async def get_all_events_endpoint(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    status_filter: EventStatusEnum | None = Query(None, alias="status"),
    keyword: str | None = Query(None),
    service: EventService = Depends(get_event_service),
):
    return await service.get_paginated_events(page, page_size, status_filter, keyword)


@router.get("/{public_id}", response_model=EventResponse)
async def get_event_by_public_id(public_id: str, service: EventService = Depends(get_event_service)):
    if len(public_id) != 21:
        raise HTTPException(400, "Invalid identifier structure. Expected a 21-character public NanoID ID.")
    event = await service.get_event_by_public_id(public_id)
    if event is None:
        raise HTTPException(404, f"Event with public identifier '{public_id}' was not found")
    return event
