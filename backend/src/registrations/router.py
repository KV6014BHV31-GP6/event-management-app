<<<<<<< Updated upstream
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import get_optional_current_user
from src.core.database import get_async_db
from src.registrations.schemas import RegistrationCreate, RegistrationResponse
=======
from fastapi import APIRouter, Depends, status, HTTPException, Query
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import get_current_user, get_optional_current_user
from src.core.database import get_async_db
from src.registrations.schemas import RegistrationCreate, RegistrationResponse, RegistrationStatus
>>>>>>> Stashed changes
from src.registrations.service import RegistrationService
from src.users.models import UserModel

router = APIRouter(tags=["Registrations"])


@router.post(
    "/events/{public_id}/registrations",
    response_model=RegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an online event registration"
)
async def create_registration_endpoint(
    public_id: str,
    payload: RegistrationCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: UserModel | None = Depends(get_optional_current_user)
):
    """
    Submits a registration request form for a specific event using its public NanoID.

<<<<<<< Updated upstream
    - **Data Comparison**: Dynamically patches existing participant table values if personal details have shifted.
    - **Transactional**: Fully rolls back state mutations cleanly if any validation rule check blocks fail.
=======
    - **Authentication**: Supports both authenticated users and anonymous guests. 
      If an expired token is sent, the auth layer fast-fails with 401 to trigger front-end token refresh retries.
    - **Data Comparison**: Dynamically updates participant definitions if personal profiles have changed.
    - **Transactional**: Fully encapsulated within an atomic transaction block boundary.
>>>>>>> Stashed changes
    """
    if len(public_id) != 21:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
<<<<<<< Updated upstream
            detail="Invalid identifier structure. Expected a 21-character public NanoID ID."
=======
            detail="Invalid identifier structure. Expected a 21-character public NanoID."
>>>>>>> Stashed changes
        )

    operator_id = current_user.id if current_user else None

    return await RegistrationService.create_online_registration(
        db=db,
        event_public_id=public_id,
        form_in=payload,
        current_user_id=operator_id
    )
<<<<<<< Updated upstream
=======


@router.get(
    "/me/registrations",
    response_model=List[RegistrationResponse],
    status_code=status.HTTP_200_OK,
    summary="Get all registrations of the current user"
)
async def get_my_registrations_endpoint(
    status: Optional[RegistrationStatus] = Query(
        None,
        description="Filter registrations by status (pending, approved, waiting, rejected, cancelled)"
    ),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Retrieves all event registration records created by the currently authenticated user.

    - **Filtering**: Supports optional filtering by registration status via query parameter.
    - **Authentication**: Requires a valid user access token.
    """
    return await RegistrationService.get_user_registrations(
        db=db,
        user_id=current_user.id,
        status=status
    )


@router.post(
    "/me/registrations/{registration_id}/cancel",
    response_model=RegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Cancel an active event registration"
)
async def cancel_my_registration_endpoint(
    registration_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Cancels an active event registration belonging to the currently authenticated user.

    - **Preconditions**:
      - The registration record must exist and belong to the user.
      - Current status must be pending, approved, or waiting.
    - **Queue Auto-Promotion**: If an approved registration is dropped, the oldest waiting participant 
      (sorted by waitlisted_at ascending) is automatically elevated to approved.
    """
    return await RegistrationService.cancel_user_registration(
        db=db,
        registration_id=registration_id,
        user_id=current_user.id
    )


@router.get(
    "/registrations",
    response_model=List[RegistrationResponse],
    status_code=status.HTTP_200_OK,
    summary="List all event registrations (Organizer Only)",
    description="Allows organizers to pull comprehensive event registration indices filtered by tracking states."
)
async def list_all_registrations_endpoint(
    status: Optional[RegistrationStatus] = Query(
        None,
        description="Filter global registrations by status (pending, approved, waiting, rejected, cancelled)"
    ),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Retrieves global registration records across all system events.

    - **Authorization**: Restricts access explicitly to users possessing an `organizer` role configuration.
    - **Filtering**: Supports global extraction narrowing via the optional `status` string parameter.
    """
    # Authorization Enforcement: Strict early exit guard condition check
    if current_user.role.value != "organizer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This endpoint is restricted to system organizers only."
        )

    return await RegistrationService.get_all_registrations(
        db=db,
        status=status
    )


@router.get(
    "/registrations/{registration_id}",
    response_model=RegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Get registration details by ID (Organizer Only)",
    description="Allows organizers to pull full, detailed data properties for a specific registration record."
)
async def get_registration_detail_endpoint(
    registration_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Retrieves full details of a single registration entry.

    - **Authorization**: Restricts access explicitly to users possessing an `organizer` role configuration.
    - **Error Handling**: Throws a clear 404 error if the specified `registration_id` does not exist.
    """
    # Authorization Guard: Restrict access to organizers early in the execution path
    if current_user.role.value != "organizer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This endpoint is restricted to system organizers only."
        )

    return await RegistrationService.get_registration_by_id(
        db=db,
        registration_id=registration_id
    )


@router.post(
    "/registrations/{registration_id}/approve",
    response_model=RegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Approve a registration request (Organizer Only)",
    description="Allows organizers to process a pending registration, dynamically checking event capacity to transition it to approved or waiting status."
)
async def approve_registration_endpoint(
    registration_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Processes and approves a pending registration request.

    - **Authorization**: Restricts access explicitly to users possessing an `organizer` role configuration.
    - **Capacity Checks**: Dynamically calculates current capacity metrics to decide whether to switch status to `approved` or drop into the `waiting` waitlist queue.
    """
    # Authorization Guard: Early restriction exit rule
    if current_user.role.value != "organizer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This endpoint is restricted to system organizers only."
        )

    return await RegistrationService.approve_registration(
        db=db,
        registration_id=registration_id,
        organizer_id=current_user.id
    )
>>>>>>> Stashed changes
