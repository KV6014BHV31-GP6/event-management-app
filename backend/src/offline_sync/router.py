from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import get_current_user
from src.core.database import get_async_db
from src.users.models import UserModel
from src.offline_sync.schemas import OfflineBatchSyncPayload, OfflineSyncSuccessResponse
from src.offline_sync.service import OfflineSyncService

router = APIRouter(tags=["Offline Synchronization"])


@router.post(
    "/events/{public_id}/offline-registrations",
    response_model=OfflineSyncSuccessResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Batch sync offline leader application data structures"
)
async def upload_offline_registrations_endpoint(
    public_id: str,
    payload: OfflineBatchSyncPayload,
    db: AsyncSession = Depends(get_async_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Accepts client-side batch synchronization matrices sent from a local SQLite instance queue.
    - **Authorization**: Accessible by authenticated Leaders or Organizers.
    - **Transaction Safety**: Business execution loops happen inside an atomic database savepoint.
    """
    if len(public_id) != 21:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid public event identifier layout. String format must match a 21-character NanoID pattern."
        )

    if current_user.role.value not in ("leader", "organizer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You possess insufficient permission layers to submit batch offline datasets."
        )

    records_count = await OfflineSyncService.sync_offline_registrations(
        db=db,
        event_public_id=public_id,
        payload=payload,
        leader_user=current_user
    )

    return OfflineSyncSuccessResponse(
        detail="Offline storage array records safely synchronized.",
        synced_records=records_count
    )
