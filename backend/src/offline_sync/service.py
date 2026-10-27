from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.events.models import EventModel, EventStatusEnum
from src.users.models import UserModel
from src.offline_sync.schemas import OfflineBatchSyncPayload
from src.registrations.service import RegistrationService


class OfflineSyncService:
    @staticmethod
    async def sync_offline_registrations(
        db: AsyncSession,
        event_public_id: str,
        payload: OfflineBatchSyncPayload,
        leader_user: UserModel
    ) -> int:
        """
        Validates basic destination availability constraints and forwards transaction loops 
        down into RegistrationService.
        """
        # Resolve target event layout constraints
        event_stmt = select(EventModel).where(
            EventModel.public_id == event_public_id)
        event_res = await db.execute(event_stmt)
        event = event_res.scalar_one_or_none()

        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Event associated with public identifier '{event_public_id}' does not exist inside central records."
            )

        if event.status != EventStatusEnum.active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Batch transfer aborted. Target event destination registry is not active."
            )

        # Delegate business updates down onto registrations/service.py inside an explicit execution boundary
        return await RegistrationService.create_from_offline(
            db=db,
            event_id=event.id,
            applications=payload.applications,
            leader_id=leader_user.id
        )
