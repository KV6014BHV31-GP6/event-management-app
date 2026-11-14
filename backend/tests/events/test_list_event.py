import pytest
from fastapi import status
from httpx import AsyncClient
from src.core.config import settings
from src.events.models import EventModel


@pytest.fixture
async def seed_multiple_events(db_session, mock_organizer_user):
    """
    Utility fixture to seed a predictable number of system events 
    for comprehensive listing and pagination validation.
    """
    from src.events.models import EventModel, EventStatusEnum
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    events = []

    # Seed 5 distinct system events
    for i in range(5):
        event = EventModel(
            public_id=f"v4N_J7wK9L2mP5qR8sT0{i}",  # Exactly 21 characters
            organizer_id=mock_organizer_user.id,
            title=f"Conference Summit Volume {i}",
            overview=f"Comprehensive analytics discourse part {i}.",
            location=f"Convention Complex Room {i}",
            online_quota=100 + i,
            offline_quota=50 + i,
            start_time=now + timedelta(days=2 + i),
            end_time=now + timedelta(days=2, hours=4 + i),
            status=EventStatusEnum.active
        )
        db_session.add(event)
        events.append(event)

    await db_session.commit()
    return events


@pytest.mark.asyncio
async def test_case_1_normal_response(
    async_client: AsyncClient,
    seed_multiple_events
):
    """
    Test Case 1: Test normal response
    Verifies that the endpoint successfully responds with HTTP 200 OK 
    and returns a properly filled dataset array mapping back to PaginatedEventResponse.
    """
    url = f"{settings.API_V1_STR}/events"

    response = await async_client.get(url)

    assert response.status_code == status.HTTP_200_OK
    resp_data = response.json()

    # Verified against your real PaginatedEventResponse schema fields
    assert "data" in resp_data
    assert isinstance(resp_data["data"], list)
    assert len(resp_data["data"]) == 5
    assert resp_data["total_count"] == 5


@pytest.mark.asyncio
async def test_case_2_counts_are_returned(
    async_client: AsyncClient,
    seed_multiple_events,
    seed_registrations_factory
):
    """
    Test Case 2: Test counts are returned
    Verifies that two separate quota types are isolated, computed, and cleanly returned:
    1. Online approved quotas (approved vs capacity capacity bounds)
    2. Offline approved quotas (approved vs capacity capacity bounds)
    """
    # Isolate the first event and seed exactly 15 approved online and 12 approved offline entries
    target_event = seed_multiple_events[0]
    await seed_registrations_factory(
        event_id=target_event.id,
        online_approved=15,
        offline_approved=12,
        cancelled_count=0,
        waiting_count=0
    )

    url = f"{settings.API_V1_STR}/events"
    response = await async_client.get(url)

    assert response.status_code == status.HTTP_200_OK
    resp_data = response.json()

    # Locate our targeted record node out of the response payload list flight
    target_json_node = next(
        (item for item in resp_data["data"]
         if item["public_id"] == target_event.public_id),
        None
    )

    assert target_json_node is not None
    assert "quota" in target_json_node

    quota = target_json_node["quota"]

    # 1. Comprehensive verification of the Online quota type block
    assert "online" in quota
    assert quota["online"]["approved"] == 15
    assert quota["online"]["capacity"] == target_event.online_quota

    # 2. Comprehensive verification of the Offline quota type block
    assert "offline" in quota
    assert quota["offline"]["approved"] == 12
    assert quota["offline"]["capacity"] == target_event.offline_quota

    # Verification of total combined structural summary values
    assert quota["total"]["approved"] == 27  # 15 + 12
    assert quota["total"]["capacity"] == target_event.online_quota + \
        target_event.offline_quota


@pytest.mark.asyncio
async def test_case_3_pagination(
    async_client: AsyncClient,
    seed_multiple_events
):
    """
    Test Case 3: Test pagination
    Verifies the list limit limits, offsets math, and pagination structural meta 
    attributes (page, pageSize, total_pages) are evaluated perfectly by the query.
    """
    url = f"{settings.API_V1_STR}/events"
    params = {
        "page": 2,
        "pageSize": 2  # Binds directly to the alias parameter mapping rule in the router Query config
    }

    response = await async_client.get(url, params=params)

    assert response.status_code == status.HTTP_200_OK
    resp_data = response.json()

    # Assert precise calculations bounds execution metrics
    assert resp_data["page"] == 2
    assert resp_data["page_size"] == 2
    assert resp_data["total_count"] == 5
    # 5 records total at a size limit of 2 yields 3 total pages
    assert resp_data["total_pages"] == 3
    # Page 2 should carry exactly two elements
    assert len(resp_data["data"]) == 2
