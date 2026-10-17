import pytest
from httpx import AsyncClient
from fastapi import status


import pytest
from httpx import AsyncClient
from fastapi import status


@pytest.mark.asyncio
async def test_create_user_success(client: AsyncClient):
    """Verifies that a valid payload registers an integer-ID user without an email field."""
    payload = {
        "username": "alice_test",
        "password": "SecurePassword123!",
        "first_name": "Alice",
        "last_name": "Smith",
        "gender": "female",
        "date_of_birth": "1998-11-23",
        "phone": "+886911222333",
        "address": "456 Test Lane, Taipei",
        "national_id": "B123456789",
        "role": "user"
    }

    response = await client.post("/api/v1/users", json=payload)

    # Assert HTTP 201 Created status code
    assert response.status_code == status.HTTP_201_CREATED

    data = response.json()
    assert "id" in data
    # The current user contract returns a 26-character ULID string.
    assert isinstance(data["id"], str)
    assert len(data["id"]) == 26
    assert all(character in "0123456789ABCDEFGHJKMNPQRSTVWXYZ" for character in data["id"])
    assert data["username"] == payload["username"]

    # Confirm email doesn't exist anywhere in payload response schemas
    assert "email" not in data
    assert "password" not in data
    assert "password_hash" not in data


@pytest.mark.asyncio
async def test_create_user_duplicate_username(client: AsyncClient):
    """Verifies that the API blocks registration of a duplicate username."""
    payload = {
        "username": "cloned_user",
        "password": "SecurePassword123!",
        "first_name": "User",
        "last_name": "One",
        "gender": "male",
        "date_of_birth": "2000-01-01",
        "phone": "+1234567890",
        "address": "123 Street",
        "national_id": "ID1",
        "role": "user"
    }

    # First registration passes
    res1 = await client.post("/api/v1/users", json=payload)
    assert res1.status_code == status.HTTP_201_CREATED

    # Second registration using duplicate username must fail
    payload["phone"] = "+0987654321"  # Isolates username conflict
    res2 = await client.post("/api/v1/users", json=payload)

    assert res2.status_code == status.HTTP_400_BAD_REQUEST
    assert res2.json()["detail"] == "Username is already registered."
