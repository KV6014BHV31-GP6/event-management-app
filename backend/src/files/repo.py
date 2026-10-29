from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from src.files.models import FileModel


class FileRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def save(self, file_model: FileModel) -> FileModel:
        self.db.add(file_model)
        await self.db.commit()
        await self.db.refresh(file_model)
        return file_model

    async def get_by_id(self, file_id: str) -> Optional[FileModel]:
        return await self.db.get(FileModel, file_id)
