from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from src.participants.models import ParticipantModel
from src.participants.schemas import ParticipantUpdate


class ParticipantService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_participant_by_id(self, participant_id: str) -> ParticipantModel | None:
        query = select(ParticipantModel).where(
            ParticipantModel.id == participant_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def update_participant(
        self, db_participant: ParticipantModel, update_in: ParticipantUpdate, updater_user_id: str
    ) -> ParticipantModel:
        """
        Applies partial updates to a participant profile, tracking administrative modifiers.
        """
        update_data = update_in.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_participant, key, value)

        db_participant.updated_by_user_id = updater_user_id

        self.db.add(db_participant)
        await self.db.commit()
        await self.db.refresh(db_participant)
        return db_participant

    async def get_paginated_participants(self, page: int = 1, page_size: int = 20, keyword: str | None = None) -> dict:
        query = select(ParticipantModel)
        count_query = select(func.count()).select_from(ParticipantModel)

        if keyword:
            search_filter = or_(
                ParticipantModel.first_name.ilike(f"%{keyword}%"),
                ParticipantModel.last_name.ilike(f"%{keyword}%"),
                ParticipantModel.phone.ilike(f"%{keyword}%")
            )
            query = query.where(search_filter)
            count_query = count_query.where(search_filter)

        count_result = await self.db.execute(count_query)
        total_count = count_result.scalar_one()

        offset = (page - 1) * page_size
        query = query.order_by(ParticipantModel.created_at.desc()).offset(
            offset).limit(page_size)

        data_result = await self.db.execute(query)
        participants = list(data_result.scalars().all())
        total_pages = (total_count + page_size -
                       1) // page_size if total_count > 0 else 0

        return {
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "data": participants
        }
