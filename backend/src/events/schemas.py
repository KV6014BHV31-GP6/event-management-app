from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from src.events.models import EventStatusEnum, EventFileTypeEnum


class EventFileAssociation(BaseModel):
    file_id: str = Field(..., max_length=26,
                         description="The ULID of the uploaded file")
    file_type: EventFileTypeEnum

    model_config = ConfigDict(from_attributes=True)


class EventFileResponseDetail(BaseModel):
    file_id: str
    file_type: EventFileTypeEnum
    url: str

    model_config = ConfigDict(from_attributes=True)


class QuotaDetail(BaseModel):
    approved: int = Field(..., ge=0)
    capacity: int = Field(..., ge=0)


class EventQuotaResponseDetail(BaseModel):
    online: QuotaDetail
    offline: QuotaDetail


class PoolDetail(BaseModel):
    approved_count: int = Field(..., ge=0)
    waiting_list: int = Field(..., ge=0)
    quota: int = Field(..., ge=0)


class EventQuotaDetail(BaseModel):
    online: PoolDetail
    offline: PoolDetail


class EventCreate(BaseModel):
    title: str = Field(..., max_length=255)
    overview: Optional[str] = None
    location: str = Field(..., max_length=255)
    online_quota: int = Field(..., ge=0)
    offline_quota: int = Field(..., ge=0)
    start_time: datetime
    end_time: datetime
    files: List[EventFileAssociation] = Field(default_factory=list)


class EventCreateResponse(BaseModel):
    public_id: str
    title: str
    status: EventStatusEnum

    model_config = ConfigDict(from_attributes=True)


class EventResponse(BaseModel):
    public_id: str
    title: str
    overview: Optional[str] = None
    location: str
    start_time: datetime
    end_time: datetime
    status: EventStatusEnum
    files: List[EventFileResponseDetail] = Field(default_factory=list)
    quota: EventQuotaResponseDetail

    model_config = ConfigDict(from_attributes=True)


class PaginatedEventResponse(BaseModel):
    data: List[EventResponse]
    total_count: int
    page: int
    page_size: int
    total_pages: int

    model_config = ConfigDict(from_attributes=True)


class EventDetailResponse(BaseModel):
    public_id: str
    title: str
    overview: Optional[str] = None
    location: str
    start_time: datetime
    end_time: datetime
    status: EventStatusEnum
    files: List[EventFileResponseDetail] = Field(default_factory=list)
    quota: EventQuotaDetail  # Tracks two distinct detached pool objects

    model_config = ConfigDict(from_attributes=True)
