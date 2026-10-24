from datetime import datetime
from pydantic import BaseModel, Field, model_validator
from typing import Optional


class EventCreate(BaseModel):
    title: str = Field(..., max_length=255)
    overview: Optional[str] = None
    location: str = Field(..., max_length=255)
    online_quota: int = Field(default=0, ge=0)
    offline_quota: int = Field(default=0, ge=0)
    start_time: datetime
    end_time: datetime

    @model_validator(mode="after")
    def validate_timestamps(self) -> "EventCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be later than start_time.")
        return self


class EventResponse(EventCreate):
    id: int
    public_id: str
    organizer_id: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class QuotaDetailItem(BaseModel):
    approved: int
    capacity: int


class EventQuotaAggregate(BaseModel):
    online: QuotaDetailItem
    offline: QuotaDetailItem
    total: QuotaDetailItem
    waiting_count: int = Field(..., alias="waitingCount")

    model_config = {"populate_by_name": True}


class EventResponse(BaseModel):
    id: int
    public_id: str = Field(..., max_length=21,
                           description="Unique 21-character NanoID structural string")
    organizer_id: str
    title: str
    overview: Optional[str] = None
    location: str
    online_quota: int
    offline_quota: int
    start_time: datetime
    end_time: datetime
    status: EventStatus
    created_at: datetime
    updated_at: datetime
    image_path: Optional[str] = None
    quota: EventQuotaAggregate  # Real-time computed quota summary block

    class Config:
        from_attributes = True


class PaginatedEventResponse(BaseModel):
    total_count: int = Field(...,
                             description="Total number of events matching the filter criteria")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Number of items per page")
    total_pages: int = Field(..., description="Total pages available")
    data: list[EventResponse] = Field(...,
                                      description="List of events for the current page")

    class Config:
        from_attributes = True
