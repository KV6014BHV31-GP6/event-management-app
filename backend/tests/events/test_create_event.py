from datetime import datetime, timedelta, timezone
import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from src.users.models import UserModel
from src.files.models import FileModel
from src.core.config import settings


def get_valid_event_payload() -> dict:
    now = datetime.now(timezone.utc)
    return {
        "title": "Global AI Summit 2026",
        "overview": "An international convention focusing on decentralized architectures.",
        "location": "Convention Center Hall A",
        "online_quota": 500,
        "offline_quota": 150,
        "start_time": (now + timedelta(days=5)).isoformat(),
        "end_time": (now + timedelta(days=5, hours=4)).isoformat(),
        "files": []
    }


@pytest.fixture
async def sample_uploaded_file(db_session: AsyncSession) -> FileModel:
    file_record = FileModel(
        id="01KFILE001ULIDSTRING000000",
        original_file_name="banner.png",
        mime_type="image/png",
        file_size=2048,
        storage_path="storage/uploads/01KFILE001ULIDSTRING000000.png"
    )
    db_session.add(file_record)
    await db_session.commit()
    return file_record


@pytest.mark.asyncio
async def test_create_event_success_as_organizer(
    async_client: AsyncClient,
    mock_organizer_user: UserModel,
    mock_organizer_headers: dict,
    sample_uploaded_file: FileModel
):
    payload = get_valid_event_payload()
    payload["files"] = [
        {"file_id": sample_uploaded_file.id, "file_type": "flyer"}]
    url = f"{settings.API_V1_STR}/events"

    response = await async_client.post(url, json=payload, headers=mock_organizer_headers)
    assert response.status_code == status.HTTP_201_CREATED

    resp_data = response.json()
    assert set(resp_data.keys()) == {"public_id", "title", "status"}
    assert len(resp_data["public_id"]) == 21
    assert resp_data["title"] == payload["title"]
    assert resp_data["status"] == "active"


@pytest.mark.asyncio
async def test_create_event_fails_with_invalid_file_id(
    async_client: AsyncClient,
    mock_organizer_headers: dict
):
    payload = get_valid_event_payload()
    payload["files"] = [
        {"file_id": "NONEXISTENTULID00000000000", "file_type": "thumbnail"}]
    url = f"{settings.API_V1_STR}/events"

    response = await async_client.post(url, json=payload, headers=mock_organizer_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Invalid file reference(s) found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_event_forbidden_for_regular_user(
    async_client: AsyncClient,
    mock_regular_user_headers: dict
):
    payload = get_valid_event_payload()
    url = f"{settings.API_V1_STR}/events"

    response = await async_client.post(url, json=payload, headers=mock_regular_user_headers)
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert "Access denied" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_event_forbidden_for_leader(
    async_client: AsyncClient,
    mock_leader_headers: dict
):
    payload = get_valid_event_payload()
    url = f"{settings.API_V1_STR}/events"

    response = await async_client.post(url, json=payload, headers=mock_leader_headers)
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_create_event_unauthorized_if_no_token(async_client: AsyncClient):
    payload = get_valid_event_payload()
    url = f"{settings.API_V1_STR}/events"

    response = await async_client.post(url, json=payload)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invalid_field, value, expected_msg",
    [
        ("title", "X" * 256, "at most 255 characters"),
        ("online_quota", -1, "greater than or equal to 0"),
        ("offline_quota", -10, "greater than or equal to 0"),
    ]
)
async def test_create_event_validation_field_constraints(
    async_client: AsyncClient,
    mock_organizer_headers: dict,
    invalid_field: str,
    value: any,
    expected_msg: str
):
    payload = get_valid_event_payload()
    payload[invalid_field] = value
    url = f"{settings.API_V1_STR}/events"

    response = await async_client.post(url, json=payload, headers=mock_organizer_headers)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert expected_msg in response.text
