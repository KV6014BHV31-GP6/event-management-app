from datetime import date, datetime
from enum import Enum
from pydantic import BaseModel, Field


class UserGender(str, Enum):
    MALE = "male"
    FEMALE = "female"


class ParticipantCreate(BaseModel):
    user_id: str | None = Field(
        None, max_length=26, description="Optional associated user ID")
    first_name: str = Field(..., max_length=20)
    last_name: str = Field(..., max_length=20)
    gender: UserGender
    date_of_birth: date
    phone: str = Field(..., max_length=20)
    address: str | None = None
    national_id: str | None = Field(None, max_length=50)


class ParticipantResponse(BaseModel):
    id: str
    user_id: str | None
    first_name: str
    last_name: str
    gender: UserGender
    date_of_birth: date
    phone: str
    address: str | None
    national_id: str | None
    created_at: datetime
    updated_at: datetime
    updated_by_user_id: str | None

    class Config:
        from_attributes = True
