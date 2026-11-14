from datetime import datetime
from pydantic import BaseModel, ConfigDict


class FileResponse(BaseModel):
    id: str
    original_file_name: str
    mime_type: str
    file_size: int
    storage_path: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
