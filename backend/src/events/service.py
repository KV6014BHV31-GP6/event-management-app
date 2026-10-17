from nanoid import generate  # Restored NanoID generator engine import
from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from src.events.models import EventModel, EventStatusEnum
from src.events.schemas import EventCreate, EventUpdate


class EventService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_event(self, event_in: EventCreate, organizer_id: str) -> EventModel:
        """
        Creates an event record from a pure JSON payload generating an external 21-character NanoID.
        """
        # Restored: Generates a secure, cryptographically random 21-character NanoID string
        generated_public_id = generate(size=21)

        event_data = event_in.model_dump()

        db_event = EventModel(
            **event_data,
            public_id=generated_public_id,
            organizer_id=organizer_id,
            status=EventStatusEnum.active
        )

        self.db.add(db_event)
        await self.db.commit()
        await self.db.refresh(db_event)
        return db_event

    async def get_event_by_public_id(self, public_id: str) -> EventModel | None:
        query = select(EventModel).where(EventModel.public_id == public_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def update_event(self, db_event: EventModel, event_update: EventUpdate) -> EventModel:
        update_data = event_update.model_dump(exclude_unset=True)

        for key, value in update_data.items():
            if key == "status" and value is not None:
                setattr(db_event, key, EventStatusEnum[value.lower()])
            else:
                setattr(db_event, key, value)

        self.db.add(db_event)
        await self.db.commit()
        await self.db.refresh(db_event)
        return db_event

    async def get_paginated_events(
        self,
        page: int = 1,
        page_size: int = 20,
        status_filter: str | None = None,
        keyword: str | None = None
    ) -> dict:
        query = select(EventModel)
        count_query = select(func.count()).select_from(EventModel)

        if status_filter:
            enum_val = EventStatusEnum[status_filter.lower()]
            query = query.where(EventModel.status == enum_val)
            count_query = count_query.where(EventModel.status == enum_val)

        if keyword:
            search_filter = or_(
                EventModel.title.ilike(f"%{keyword}%"),
                EventModel.overview.ilike(f"%{keyword}%")
            )
            query = query.where(search_filter)
            count_query = count_query.where(search_filter)

        count_result = await self.db.execute(count_query)
        total_count = count_result.scalar_one()

        offset = (page - 1) * page_size
        query = query.order_by(EventModel.created_at.desc()).offset(
            offset).limit(page_size)

        data_result = await self.db.execute(query)
        events = list(data_result.scalars().all())

        total_pages = (total_count + page_size -
                       1) // page_size if total_count > 0 else 0

        return {
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "data": events
        }
