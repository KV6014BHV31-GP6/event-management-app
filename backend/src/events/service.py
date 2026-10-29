from fastapi import HTTPException, status
from nanoid import generate
from sqlalchemy import func, or_, inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from src.events.schemas import EventCreate
from src.registrations.models import RegistrationModel, RegistrationStatusEnum, RegistrationChannelEnum
from src.events.models import EventModel, EventStatusEnum, EventFileModel
from src.files.models import FileModel

class EventService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_event(self, event_in: EventCreate, organizer_id: str) -> dict:
        """
        Creates an event record, validates that all provided file_ids exist in the files table,
        links valid file associations directly, and returns data safely.
        """
        # 1. Isolate the core event data and incoming file details
        event_data = event_in.model_dump(exclude={"files"})
        files_data = event_in.files

        # 2. Runtime Validation: Ensure all incoming file_ids actually exist in the database
        if files_data:
            incoming_file_ids = list({f.file_id for f in files_data})

            query = select(FileModel.id).where(
                FileModel.id.in_(incoming_file_ids))
            result = await self.db.execute(query)
            existing_file_ids = set(result.scalars().all())

            missing_file_ids = set(incoming_file_ids) - existing_file_ids
            if missing_file_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid file reference(s) found: {list(missing_file_ids)}. "
                    f"Files must be uploaded first via the storage API."
                )

        # 3. Generate unique identifiers and instantiate the Event entity
        generated_public_id = generate(size=21)
        db_event = EventModel(
            **event_data,
            public_id=generated_public_id,
            organizer_id=organizer_id,
            status=EventStatusEnum.active
        )

        self.db.add(db_event)
        await self.db.flush()  # Populates db_event.id safely without triggering a commit

        # 4. FIX: Add child records directly to the session context instead of assigning to the collection property
        if files_data:
            for f in files_data:
                assoc = EventFileModel(
                    event_id=db_event.id,
                    file_id=f.file_id,
                    file_type=f.file_type
                )
                self.db.add(assoc)

        # 5. Commit everything together into the active transaction pass
        await self.db.commit()

        # 6. Return values decoupled completely from object state trackers
        return {
            "public_id": str(generated_public_id),
            "title": str(db_event.title),
            "status": "active"
        }


    def _build_list_quota_subquery(self):
        """
        Generates the aggregate select tuple for index view lookups.
        Excludes waiting list metrics to optimize collection sweeps.
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
            ).label("approved_offline_count")
        ]

    def _build_detail_quota_subquery(self):
        """
        Generates the aggregate select fields tracking separate approved and waiting 
        metrics across completely detached pools.
        """
        return [
            # Online Approved
            func.coalesce(
                func.count().filter(
                    RegistrationModel.status == RegistrationStatusEnum.approved,
                    RegistrationModel.channel == RegistrationChannelEnum.online
                ), 0
            ).label("approved_online_count"),

            # Online Waiting
            func.coalesce(
                func.count().filter(
                    RegistrationModel.status == RegistrationStatusEnum.waiting,
                    RegistrationModel.channel == RegistrationChannelEnum.online
                ), 0
            ).label("waiting_online_count"),

            # Offline Approved
            func.coalesce(
                func.count().filter(
                    RegistrationModel.status == RegistrationStatusEnum.approved,
                    RegistrationModel.channel.in_([
                        RegistrationChannelEnum.offline,
                        RegistrationChannelEnum.walkin
                    ])
                ), 0
            ).label("approved_offline_count"),

            # Offline Waiting
            func.coalesce(
                func.count().filter(
                    RegistrationModel.status == RegistrationStatusEnum.waiting,
                    RegistrationModel.channel.in_([
                        RegistrationChannelEnum.offline,
                        RegistrationChannelEnum.walkin
                    ])
                ), 0
            ).label("waiting_offline_count")
        ]

    def _format_event_detail_quota_dict(
        self,
        event: EventModel,
        online_app: int,
        online_wait: int,
        offline_app: int,
        offline_wait: int
    ) -> dict:
        """
        Formats database elements cleanly into the newly decoupled dual-pool structure.
        """
        event_dict = {
            "public_id": event.public_id,
            "title": event.title,
            "overview": event.overview,
            "location": event.location,
            "start_time": event.start_time,
            "end_time": event.end_time,
            "status": event.status.value,
        }

        event_dict["files"] = []
        for ef in getattr(event, "event_files", []) or []:
            url_path = f"/files/{ef.file_id}/content"
        
        ef_inspector = inspect(ef)
        if "file" in ef_inspector.unloaded:
            pass
        else:
            if ef.file and ef.file.storage_path:
                url_path = ef.file.storage_path

        event_dict["files"].append({
            "file_id": ef.file_id,
            "file_type": ef.file_type.value,
            "url": url_path
        })

        # Maps parameters onto independent online/offline capacity blocks
        event_dict["quota"] = {
            "online": {
                "approved_count": online_app,
                "waiting_list": online_wait,
                "quota": event.online_quota
            },
            "offline": {
                "approved_count": offline_app,
                "waiting_list": offline_wait,
                "quota": event.offline_quota
            }
        }
        return event_dict

    async def get_event_by_public_id(self, public_id: str) -> dict | None:
        """
        Fetches a standalone event profile matched to its public identifier,
        aggregating values across independent capacity pools.
        """
        stmt = (
            select(EventModel, *self._build_detail_quota_subquery())
            .outerjoin(RegistrationModel, EventModel.id == RegistrationModel.event_id)
            .options(
                selectinload(EventModel.event_files).selectinload(
                    EventFileModel.file)
            )
            .where(EventModel.public_id == public_id)
            .group_by(EventModel.id)
        )

        res = await self.db.execute(stmt)
        row = res.first()
        if not row:
            return None

        event, online_app, online_wait, offline_app, offline_wait = row
        return self._format_event_detail_quota_dict(
            event=event,
            online_app=online_app,
            online_wait=online_wait,
            offline_app=offline_app,
            offline_wait=offline_wait
        )

    async def get_paginated_events(
        self,
        page: int = 1,
        page_size: int = 20,
        status_filter: str | None = None,
        keyword: str | None = None
    ) -> dict:
        """
        Returns a paginated bundle of all matching system event rows, pulling 
        all structural quota indicators and associated file details in a clean execution block.
        """
        where_conds = []
        if status_filter:
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

        # 2. Main data extraction pass using the collection subquery configuration
        data_stmt = (
            select(EventModel, *self._build_list_quota_subquery())
            .outerjoin(RegistrationModel, EventModel.id == RegistrationModel.event_id)
            .options(
                selectinload(EventModel.event_files).selectinload(
                    EventFileModel.file)
            )
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
            self._format_event_list_quota_dict(event, online, offline)
            for event, online, offline in rows
        ]

        total_pages = (total_count + page_size -
                       1) // page_size if total_count > 0 else 0

        return {
            "data": formatted_events,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }

    def _format_event_list_quota_dict(
        self,
        event: EventModel,
        online_app: int,
        offline_app: int
    ) -> dict:
        """
        Formats paginated catalog index rows cleanly into the public 
        decoupled dual-pool capacity response.
        """
        event_dict = {
            "public_id": event.public_id,
            "title": event.title,
            "overview": event.overview,
            "location": event.location,
            "start_time": event.start_time,
            "end_time": event.end_time,
            "status": event.status.value,
        }

        # Safe serialization of files using your async-ready checker loop
        event_dict["files"] = []
        for ef in getattr(event, "event_files", []) or []:
            url_path = f"/files/{ef.file_id}/content"
            
            # Read relation fields only if cached safely in-memory
            from sqlalchemy import inspect
            ef_inspector = inspect(ef)
            if "file" not in ef_inspector.unloaded:
                if ef.file and ef.file.storage_path:
                    url_path = ef.file.storage_path

            event_dict["files"].append({
                "file_id": ef.file_id,
                "file_type": ef.file_type.value,
                "url": url_path
            })

        # Maps aggregate parameters onto independent public quota blocks
        event_dict["quota"] = {
            "online": {
                "approved": online_app,
                "capacity": event.online_quota
            },
            "offline": {
                "approved": offline_app,
                "capacity": event.offline_quota
            }
        }
        return event_dict