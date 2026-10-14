from nanoid import generate
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.events.models import EventModel
from src.events.schemas import EventCreate
from sqlalchemy import func


class EventService:
    def __init__(self, db: AsyncSession):
        """Inject the async database session into the service instance"""
        self.db = db

    async def create_event(self, event_in: EventCreate, organizer_id: str) -> EventModel:
        """
        Orchestrate event creation:
        1. Handle business logic (Generate secure 21-character public_id).
        2. Perform database entry, commit, and refresh operations.
        """
        generated_public_id = generate(size=21)

        db_event = EventModel(
            **event_in.model_dump(),
            public_id=generated_public_id,
            organizer_id=organizer_id,
            status="ACTIVE"
        )

        self.db.add(db_event)
        await self.db.commit()
        await self.db.refresh(db_event)

        return db_event

    async def get_event_by_public_id(self, public_id: str) -> EventModel | None:
        """
        Query the database for an event by its unique 21-character external string.
        Returns the EventModel instance if found, otherwise returns None.
        """
        query = select(EventModel).where(EventModel.public_id == public_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_paginated_events(
        self,
        page: int = 1,
        page_size: int = 20,
        status_filter: str | None = None
    ) -> dict:
        """
       Retrieves events using a standard page/pageSize pagination architecture.
       """
        # 1. Base query structures
        query = select(EventModel)
        count_query = select(func.count()).select_from(EventModel)

        if status_filter:
            query = query.where(EventModel.status == status_filter)
            count_query = count_query.where(EventModel.status == status_filter)

        # 2. Fetch total record counts
        count_result = await self.db.execute(count_query)
        total_count = count_result.scalar_one()

        # 3. Process offset math boundaries
        offset = (page - 1) * page_size
        query = query.order_by(EventModel.created_at.desc()
                               ).offset(offset).limit(page_size)

        data_result = await self.db.execute(query)
        events = list(data_result.scalars().all())

        # 4. Compute total ceiling page count value
        total_pages = (total_count + page_size -
                       1) // page_size if total_count > 0 else 0

        return {
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "data": events
        }
