import pytest
from fastapi import status
from httpx import AsyncClient
from src.core.config import settings
from src.events.models import EventModel


@pytest.mark.asyncio
async def test_case_1_verify_event_exists(async_client: AsyncClient, sample_event: EventModel):
    """
    Test Case 1: Verify event exists
    Asserts retrieval of an active structural record using a 21-character public NanoID.
    """
    url = f"{settings.API_V1_STR}/events/{sample_event.public_id}"

    response = await async_client.get(url)

    assert response.status_code == status.HTTP_200_OK
    resp_data = response.json()
    assert resp_data["public_id"] == sample_event.public_id
    assert resp_data["title"] == sample_event.title
    assert "quota" in resp_data


@pytest.mark.asyncio
async def test_case_2_event_not_found(async_client: AsyncClient):
    """
    Test Case 2: Event not found
    Verifies that a valid 21-character NanoID structural string that doesn't 
    exist in the system correctly evaluates to an isolated 404 NOT FOUND block.
    """
    # MUST be exactly 21 characters long to bypass router structural validation
    non_existent_public_id = "nonExistentNanoID1234"
    url = f"{settings.API_V1_STR}/events/{non_existent_public_id}"

    response = await async_client.get(url)

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert f"public identifier '{non_existent_public_id}' was not found" in response.json()[
        "detail"]


@pytest.mark.asyncio
async def test_case_3_count_only_approved_registrations(
    async_client: AsyncClient,
    sample_event: EventModel,
    seed_registrations_factory
):
    """
    Test Case 3: Count only approved registrations
    Validates that non-approved registrations (cancelled records) are excluded
    from the real-time aggregate quota logic calculations block.
    """
    await seed_registrations_factory(
        event_id=sample_event.id,
        online_approved=5,
        offline_approved=0,
        cancelled_count=10,
        waiting_count=2
    )

    url = f"{settings.API_V1_STR}/events/{sample_event.public_id}"
    response = await async_client.get(url)

    assert response.status_code == status.HTTP_200_OK
    quota = response.json()["quota"]

    assert quota["online"]["approved"] == 5
    assert quota["total"]["approved"] == 5
    assert quota["waitingCount"] == 2


@pytest.mark.asyncio
async def test_case_4_online_and_offline_counts_separately(
    async_client: AsyncClient,
    sample_event: EventModel,
    seed_registrations_factory
):
    """
    Test Case 4: Online and Offline counts separately
    Verifies the system aggregates complex overlapping status values cleanly inside a single execution block.
    """
    await seed_registrations_factory(
        event_id=sample_event.id,
        online_approved=15,
        offline_approved=12,
        cancelled_count=5,
        waiting_count=0
    )

    url = f"{settings.API_V1_STR}/events/{sample_event.public_id}"
    response = await async_client.get(url)

    assert response.status_code == status.HTTP_200_OK

    quota = response.json()["quota"]

    assert quota["online"]["approved"] == 15
    assert quota["offline"]["approved"] == 12
    assert quota["total"]["approved"] == 27
