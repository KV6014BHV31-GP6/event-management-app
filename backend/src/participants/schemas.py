from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ParticipantUpdate(BaseModel):
    first_name: Optional[str] = Field(None, max_length=50)
    last_name: Optional[str] = Field(None, max_length=50)
    phone: Optional[str] = Field(None, max_length=20)


class ParticipantResponse(BaseModel):
    id: str
    user_id: Optional[str]
    first_name: str
    last_name: str
    phone: str
    created_at: datetime
    updated_at: datetime
    updated_by_user_id: Optional[str]

    class Config:
        from_attributes = True


class PaginatedParticipantResponse(BaseModel):
    total_count: int
    page: int
    page_size: int
    total_pages: int
    data: list[ParticipantResponse]
