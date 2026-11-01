from pydantic import BaseModel, Field
from typing import Literal

class FileReference(BaseModel):
    id:str
    name:str
    mime_type:str
    size:int
    purpose:Literal['event_image','supporting_document']
    url:str


class FileUploadResponse(BaseModel):
    filename: str = Field(...,
                          description="Original name of the uploaded asset")
    url: str = Field(..., description="The accessible asset path or cloud URL to save to your database entity properties")
    provider: str = Field(
        ..., description="The structural target platform engine used (local / gcs)")
