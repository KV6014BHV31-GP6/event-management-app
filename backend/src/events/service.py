from nanoid import generate
from fastapi import HTTPException
from sqlalchemy import func, or_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from src.events.models import EventModel, EventStatusEnum
from src.events.schemas import EventCreate, EventUpdate
from src.registrations.models import RegistrationModel, RegistrationStatusEnum, RegistrationChannelEnum


class EventService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _build_aggregate_quota_subquery(self):
        """
        Generates an optimized aggregate select configuration block matching the custom status metrics.
        Executes a single grouped count over the target registrations matrix.
        """
        return [
            func.coalesce(
                func.count().filter(
                    RegistrationModel.status == RegistrationStatusEnum.approved,
                    RegistrationModel.channel == RegistrationChannelEnum.online
                ), 0
            ).label("approved_online_count"),
            func.coalesce(
                func.count().filter(
                    RegistrationModel.status == RegistrationStatusEnum.approved,
                    RegistrationModel.channel.in_([
                        RegistrationChannelEnum.offline,
                        RegistrationChannelEnum.walkin
                    ])
                ), 0
            ).label("approved_offline_count"),
            func.coalesce(
                func.count().filter(
                    RegistrationModel.status == RegistrationStatusEnum.waiting
                ), 0
            ).label("waiting_count")
        ]

    def _format_event_quota_dict(self, event: EventModel, online_app: int, offline_app: int, waiting: int) -> dict:
        """
        Formats raw database scalars cleanly into the structured event dictionary payload.
        """
        total_approved = online_app + offline_app
        total_capacity = event.online_quota + event.offline_quota

        # Invert database row tracking parameters into schema objects dynamically
        event_dict = {c.name: getattr(event, c.name)
                      for c in event.__table__.columns}
        event_dict["status"] = event.status.value
        event_dict["quota"] = {
            "online": {"approved": online_app, "capacity": event.online_quota},
            "offline": {"approved": offline_app, "capacity": event.offline_quota},
            "total": {"approved": total_approved, "capacity": total_capacity},
            "waitingCount": waiting
        }
        return event_dict

    async def create_event(self, event_in: EventCreate, organizer_id: str) -> dict:
        """
        Creates an event record and seeds an initialized, empty quota metrics footprint.
        """
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

        return self._format_event_quota_dict(db_event, 0, 0, 0)

    async def get_event_by_public_id(self, public_id: str) -> dict | None:
        """
        Fetches event profiles combined with aggregated registration summaries in one execution.
        """
        stmt = (
            select(EventModel, *self._build_aggregate_quota_subquery())
            .outerjoin(RegistrationModel, EventModel.id == RegistrationModel.event_id)
            .where(EventModel.public_id == public_id)
            .group_by(EventModel.id)
        )

        res = await self.db.execute(stmt)
        row = res.first()
        if not row:
            return None

        event, online_app, offline_app, waiting = row
        return self._format_event_quota_dict(event, online_app, offline_app, waiting)

    async def update_event(self, public_id: str, event_update: EventUpdate) -> dict | None:
        """
        Locates the targeted profile, commits patches, and recalculates its current quotas.
        """
        stmt = select(EventModel).where(EventModel.public_id == public_id)
        res = await self.db.execute(stmt)
        db_event = res.scalar_one_or_none()

        if not db_event:
            return None

        update_data = event_update.model_dump(exclude_unset=True)
        approved = await self.db.scalar(select(func.count()).select_from(RegistrationModel).where(
            RegistrationModel.event_id == db_event.id,
            RegistrationModel.status == RegistrationStatusEnum.approved))
        capacity = update_data.get("online_quota", db_event.online_quota) + update_data.get("offline_quota", db_event.offline_quota)
        if capacity < approved:
            raise HTTPException(status_code=409, detail="Capacity cannot be lower than current approved registrations.")
        for key, value in update_data.items():
            if key == "status" and value is not None:
                setattr(db_event, key, EventStatusEnum[value.lower()])
            else:
                setattr(db_event, key, value)

        self.db.add(db_event)
        await self.db.commit()

        # Re-fetch with fresh aggregated numbers to return the modified details cleanly
        return await self.get_event_by_public_id(public_id)

    async def get_paginated_events(
        self,
        page: int = 1,
        page_size: int = 20,
        status_filter: str | None = None,
        keyword: str | None = None
    ) -> dict:
        """
        Returns a paginated bundle of all matching system event rows, pulling
        all structural quota indicators within a single database flight block.
        """
        # Build core filtering parameters
        where_conds = []
        if status_filter:
            if status_filter.lower() not in EventStatusEnum.__members__:
                raise HTTPException(status_code=422, detail="Unknown event status.")
            where_conds.append(EventModel.status ==
                               EventStatusEnum[status_filter.lower()])
        if keyword:
            where_conds.append(
                or_(
                    EventModel.title.ilike(f"%{keyword}%"),
                    EventModel.overview.ilike(f"%{keyword}%")
                )
            )

        # 1. Total records count pass
        count_stmt = select(func.count()).select_from(EventModel)
        for cond in where_conds:
            count_stmt = count_stmt.where(cond)
        count_res = await self.db.execute(count_stmt)
        total_count = count_res.scalar_one()

        # 2. Main data extraction pass utilizing unified JOIN grouping mechanics
        data_stmt = (
            select(EventModel, *self._build_aggregate_quota_subquery())
            .outerjoin(RegistrationModel, EventModel.id == RegistrationModel.event_id)
        )
        for cond in where_conds:
            data_stmt = data_stmt.where(cond)

        offset = (page - 1) * page_size
        data_stmt = (
            data_stmt.group_by(EventModel.id)
            .order_by(EventModel.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )

        data_res = await self.db.execute(data_stmt)
        rows = data_res.all()

        formatted_events = [
            self._format_event_quota_dict(event, online, offline, waiting)
            for event, online, offline, waiting in rows
        ]

        total_pages = (total_count + page_size -
                       1) // page_size if total_count > 0 else 0

        return {
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "data": formatted_events
        }
