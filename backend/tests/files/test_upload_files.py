import os
from pathlib import Path
import pytest
from fastapi import status
from httpx import AsyncClient

API_PREFIX = "/api/v1"


@pytest.mark.asyncio
async def test_upload_file_success(async_client: AsyncClient):
    """
    Test uploading a valid file via POST /api/v1/files.
    Uses conftest's isolated tmp_path storage directory.
    """
    file_payload = {
        "file": ("sample_image.png", b"fake_binary_payload", "image/png")
    }

    response = await async_client.post(
        f"{API_PREFIX}/files",
        files=file_payload
    )

    assert response.status_code == status.HTTP_201_CREATED

    data = response.json()
    assert "id" in data
    assert len(data["id"]) == 26
    assert data["original_file_name"] == "sample_image.png"
    assert data["mime_type"] == "image/png"
    assert data["file_size"] == len(b"fake_binary_payload")
    assert "storage/uploads" in Path(data["storage_path"]).as_posix()
    assert os.path.exists(data["storage_path"])


@pytest.mark.asyncio
async def test_download_file_success(async_client: AsyncClient):
    """
    Test uploading a file and streaming it back via GET /api/v1/files/{file_id}/content.
    """
    file_payload = {
        "file": ("report.pdf", b"pdf_bytes_content", "application/pdf")
    }

    upload_response = await async_client.post(
        f"{API_PREFIX}/files",
        files=file_payload
    )
    assert upload_response.status_code == status.HTTP_201_CREATED
    file_id = upload_response.json()["id"]

    download_response = await async_client.get(
        f"{API_PREFIX}/files/{file_id}/content"
    )

    assert download_response.status_code == status.HTTP_200_OK
    assert download_response.content == b"pdf_bytes_content"
    assert download_response.headers["content-type"] == "application/pdf"
    assert 'attachment; filename="report.pdf"' in download_response.headers[
        "content-disposition"]


@pytest.mark.asyncio
async def test_download_file_not_found(async_client: AsyncClient):
    """
    Test downloading content for a non-existent file ID yields a 404 error.
    """
    non_existent_id = "01ARZ3NDEKTSV4RRFFQ69G5FAV"

    response = await async_client.get(
        f"{API_PREFIX}/files/{non_existent_id}/content"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "File records not found"


@pytest.mark.asyncio
async def test_download_file_missing_on_disk(async_client: AsyncClient):
    """
    Test where a database entry exists, but the local file was deleted from disk.
    """
    file_payload = {"file": ("ghost.txt", b"ghost_data", "text/plain")}
    upload_response = await async_client.post(
        f"{API_PREFIX}/files",
        files=file_payload
    )
    assert upload_response.status_code == status.HTTP_201_CREATED
    uploaded_data = upload_response.json()

    # Delete the temporary file from disk to simulate missing storage
    os.remove(uploaded_data["storage_path"])

    download_response = await async_client.get(
        f"{API_PREFIX}/files/{uploaded_data['id']}/content"
    )

    assert download_response.status_code == status.HTTP_404_NOT_FOUND
    assert download_response.json(
    )["detail"] == "Physical file missing from storage"
