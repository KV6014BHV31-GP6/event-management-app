from datetime import datetime
from pydantic import BaseModel, Field, model_validator, field_validator
from typing import Optional
from src.events.models import EventStatusEnum


class EventFields(BaseModel):
    title: str = Field(..., max_length=255)
    overview: Optional[str] = None
    location: str = Field(..., max_length=255)
    online_quota: int = Field(default=0, ge=0, le=2147483647)
    offline_quota: int = Field(default=0, ge=0, le=2147483647)
    start_time: datetime
    end_time: datetime

    @model_validator(mode="after")
    def validate_timestamps(self):
        try:
            if self.end_time <= self.start_time:
                raise ValueError("end_time must be later than start_time.")
        except TypeError:
            raise ValueError("Timestamps must use matching timezones.") from None
        return self


class EventCreate(EventFields):
    @field_validator("start_time", "end_time")
    @classmethod
    def require_timezone(cls, value):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("An explicit timestamp timezone is required.")
        return value


class QuotaPool(BaseModel):
    approved: int | None
    capacity: int


class EventQuotaAggregate(BaseModel):
    online: QuotaPool
    offline: QuotaPool
    total: QuotaPool
    waitingCount: int
    allocation_supported: bool


class EventResponse(EventFields):
    id: int
    public_id: str
    organizer_id: str
    status: EventStatusEnum
    created_at: datetime
    updated_at: datetime
    quota: EventQuotaAggregate

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
