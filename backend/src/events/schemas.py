from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field, model_validator
from typing import Optional


class EventStatus(str, Enum):
    ACTIVE = "active"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class EventCreate(BaseModel):
    title: str = Field(..., max_length=255)
    overview: Optional[str] = None
    location: str = Field(..., max_length=255)
    online_quota: int = Field(..., ge=0)
    offline_quota: int = Field(..., ge=0)
    start_time: datetime
    end_time: datetime
    image_path: Optional[str] = Field(default=None, max_length=512)

    @model_validator(mode="after")
    def validate_timestamps(self) -> "EventCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be later than start_time.")
        return self


class EventUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    overview: Optional[str] = None
    location: Optional[str] = Field(None, max_length=255)
    online_quota: Optional[int] = Field(None, ge=0)
    offline_quota: Optional[int] = Field(None, ge=0)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[EventStatus] = None
    image_path: Optional[str] = Field(None, max_length=512)

    @model_validator(mode="after")
    def validate_update_timestamps(self) -> "EventUpdate":
        if self.start_time and self.end_time:
            if self.end_time <= self.start_time:
                raise ValueError("end_time must be later than start_time.")
        return self


class EventResponse(EventCreate):
    id: int
    public_id: str = Field(..., max_length=21,
                           description="Unique 21-character NanoID structural string")
    organizer_id: str
    status: EventStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaginatedEventResponse(BaseModel):
    total_count: int
    page: int
    page_size: int
    total_pages: int
    data: list[EventResponse]

    class Config:
        from_attributes = True
