import os
import uuid
import anyio
from fastapi import UploadFile
from src.files.models import FileModel
from src.files.repo import FileRepository


class FileService:
    def __init__(self, repo: FileRepository):
        self.repo = repo
        self.upload_dir = "storage/uploads"
        os.makedirs(self.upload_dir, exist_ok=True)

    async def upload_file(self, file: UploadFile) -> FileModel:
        # Generate a unique, ultra-safe 26-character alphanumeric key
        file_id = uuid.uuid4().hex[:26].upper()

        _, ext = os.path.splitext(file.filename or "")
        storage_filename = f"{file_id}{ext}"
        storage_path = os.path.join(self.upload_dir, storage_filename)

        file_size = 0
        try:
            async with await anyio.open_file(storage_path, "wb") as buffer:
                while chunk := await file.read(1024 * 1024):
                    file_size += len(chunk)
                    await buffer.write(chunk)
        finally:
            await file.close()

        file_model = FileModel(
            id=file_id,
            original_file_name=file.filename or "unknown",
            mime_type=file.content_type or "application/octet-stream",
            file_size=file_size,
            storage_path=storage_path
        )

        return await self.repo.save(file_model)
