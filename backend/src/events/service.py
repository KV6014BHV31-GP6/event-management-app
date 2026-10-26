from nanoid import generate
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from src.events.models import EventModel, EventStatusEnum
from src.events.schemas import EventCreate
from src.registrations.models import RegistrationModel, RegistrationStatusEnum, RegistrationChannelEnum


class EventService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _counts():
        def count(*conditions):
            return select(func.count(RegistrationModel.id)).where(
                RegistrationModel.event_id == EventModel.id, *conditions
            ).correlate(EventModel).scalar_subquery()
        approved = RegistrationModel.status == RegistrationStatusEnum.approved
        online = RegistrationModel.channel == RegistrationChannelEnum.online
        return [count(approved, online).label("online_approved"),
                count(approved).label("all_approved"),
                count(RegistrationModel.status == RegistrationStatusEnum.waiting).label("waiting"),
                count(~online).label("unmapped")]

    @staticmethod
    def _response(row):
        event, online, total, waiting, unmapped = row[:5]
        supported = event.offline_quota == 0 and unmapped == 0
        fields = [*EventCreate.model_fields, "id", "public_id", "organizer_id", "status", "created_at", "updated_at"]
        return {**{field: getattr(event, field) for field in fields}, "quota": {
            "online": {"approved": online, "capacity": event.online_quota},
            # Walkin/OCR are not assumed to belong to an offline allocation.
            "offline": {"approved": 0 if supported else None, "capacity": event.offline_quota},
            "total": {"approved": total, "capacity": event.online_quota + event.offline_quota},
            "waitingCount": waiting, "allocation_supported": supported,
        }}

    async def create_event(self, event_in: EventCreate, organizer_id: str):
        event = EventModel(**event_in.model_dump(), public_id=generate(size=21),
                           organizer_id=organizer_id, status=EventStatusEnum.active)
        try:
            self.db.add(event)
            await self.db.commit()
            return await self.get_event_by_public_id(event.public_id)
        except Exception:
            await self.db.rollback()
            raise

    async def get_event_by_public_id(self, public_id: str):
        row = (await self.db.execute(select(EventModel, *self._counts()).where(
            EventModel.public_id == public_id))).first()
        return self._response(row) if row else None

    async def get_paginated_events(self, page=1, page_size=20, status_filter=None, keyword=None):
        filters = []
        if status_filter is not None:
            filters.append(EventModel.status == EventStatusEnum(status_filter))
        if keyword:
            filters.append(or_(EventModel.title.ilike(f"%{keyword}%"), EventModel.overview.ilike(f"%{keyword}%")))
        order = (EventModel.created_at.desc(), EventModel.id.desc())
        page_ids = select(EventModel.id).where(*filters).order_by(*order).offset((page - 1) * page_size).limit(page_size).correlate(None)
        count = select(func.count().label("total_count")).select_from(EventModel).where(*filters).cte("matches")
        # The count, selected page and per-event aggregates share one SQL snapshot.
        statement = select(EventModel, *self._counts(), count.c.total_count).select_from(
            count.outerjoin(EventModel, EventModel.id.in_(page_ids))).order_by(*order)
        rows = (await self.db.execute(statement)).all()
        total = rows[0][-1]
        return {"total_count": total, "page": page, "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size,
                "data": [self._response(row) for row in rows if row[0] is not None]}
