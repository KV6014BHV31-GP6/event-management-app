import os
from fastapi import APIRouter, Depends, status, UploadFile, File, HTTPException
from fastapi.responses import FileResponse as FastAPIFileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_async_db
from src.files.schemas import FileResponse
from src.files.repo import FileRepository
from src.files.service import FileService

router = APIRouter(prefix="/files", tags=["Files"])


@router.post(
    "",
    response_model=FileResponse,
    status_code=status.HTTP_201_CREATED
)
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Upload a file to local storage and save its metadata in the database.
    """
    repo = FileRepository(db)
    service = FileService(repo)
    return await service.upload_file(file)


@router.get(
    "/{file_id}/content",
    response_class=FastAPIFileResponse
)
async def download_file(
    file_id: str,
    db: AsyncSession = Depends(get_async_db)
):
    """
    Retrieve file metadata and stream the actual binary content from local storage.
    """
    repo = FileRepository(db)

    # 1. Fetch file record from database
    file_record = await repo.get_by_id(file_id)
    if not file_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File records not found"
        )

    # 2. Verify physical file existence on local storage
    if not os.path.exists(file_record.storage_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Physical file missing from storage"
        )

    # 3. Stream the file back with correct original filename and media type
    return FastAPIFileResponse(
        path=file_record.storage_path,
        media_type=file_record.mime_type,
        filename=file_record.original_file_name
    )
