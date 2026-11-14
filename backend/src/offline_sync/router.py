import json
from typing import List
from fastapi import APIRouter, Depends, status, HTTPException, Form, Request
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

from src.auth.deps import get_current_user
from src.core.database import get_async_db
from src.users.models import UserModel
from src.offline_sync.schemas import OfflineBatchSyncPayload, OfflineSyncBatchResponse
from src.offline_sync.service import OfflineSyncService

router = APIRouter(tags=["Offline Synchronization"])


@router.post(
    "/events/{public_id}/offline-registrations",
    response_model=OfflineSyncBatchResponse,
    status_code=status.HTTP_200_OK,
    summary="Batch sync offline leader application data structures"
)
async def upload_offline_registrations_endpoint(
    public_id: str,
    request: Request,
    payload: str = Form(..., description="JSON serialized string matching OfflineBatchSyncPayload schema structure"),
    db: AsyncSession = Depends(get_async_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Accepts client-side batch synchronization matrices alongside supporting multi-part media documents.
    Processes each application row within its own distinct execution transaction context boundary.

    - **Authorization**: Accessible exclusively by authenticated Leaders.
    """
    # 1. Enforce strict public_id layout validation
    if len(public_id) != 21:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid public event identifier layout. String format must match a 21-character NanoID pattern."
        )

    # 2. Restrict access strictly to leaders
    if current_user.role.value != "leader":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only leaders possess explicit permission layers to submit batch offline datasets."
        )

    # 3. Parse and validate the stringified JSON Form payload
    try:
        payload_data = json.loads(payload)
        sync_payload = OfflineBatchSyncPayload.model_validate(payload_data)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload layout. Form data 'payload' field must be a valid JSON string."
        )
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=e.errors()
        )

    # 4. Extract form entries from the parsed form scope to capture dynamic keys (file_1, file_2)
    file_mapping = {}

    # Access the already parsed internal Starlette form data structure cleanly
    form_data = await request.form()
    for key, value in form_data.multi_items():
        if isinstance(value, UploadFile):
            file_mapping[key] = value

    # --- DEBUG LOGGING ---
    # print(
        # f"\n[DEBUG ROUTER] Total uploaded files detected: {len(file_mapping)}")
    # print(f"  -> Extracted form field keys: {list(file_mapping.keys())}")
    # ----------------------

    # 5. Forward down to the service layer
    response_data = await OfflineSyncService.sync_offline_registrations(
        db=db,
        event_public_id=public_id,
        payload=sync_payload,
        file_mapping=file_mapping,
        leader_user=current_user
    )

    return response_data
