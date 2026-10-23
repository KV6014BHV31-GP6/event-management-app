from datetime import datetime, date
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class RegistrationChannel(str, Enum):
    ONLINE = "online"
    WALKIN = "walkin"
    OCR = "ocr"


class RegistrationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    WAITING = "waiting"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class MarriageStatusType(str, Enum):
    SINGLE = "single"
    MARRIED = "married"
    DIVORCED = "divorced"
    WIDOWED = "widowed"


class UserGender(str, Enum):
    MALE = "male"
    FEMALE = "female"


class RegistrationCreate(BaseModel):
    first_name: str = Field(..., max_length=20)
    last_name: str = Field(..., max_length=20)
    gender: UserGender
    date_of_birth: date
    phone: str = Field(..., max_length=20)
    address: str
    national_id: str = Field(..., max_length=50)
    income_band_code: str = Field(..., max_length=20)
    medical_record: Optional[str] = None
    marriage_status: MarriageStatusType


class RegistrationResponse(BaseModel):
    id: str
    event_id: int
    participant_id: str
    created_by_user_id: Optional[str]
    channel: RegistrationChannel
    status: RegistrationStatus
    first_name: str
    last_name: str
    gender: UserGender
    date_of_birth: date
    phone: str
    address: str
    national_id: str
    income_band_code: str
    medical_record: Optional[str]
    marriage_status: MarriageStatusType
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
