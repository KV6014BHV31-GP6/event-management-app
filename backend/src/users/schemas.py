from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field


class UserRole(str, Enum):
    USER = "user"
    ORGANIZER = "organizer"
    LEADER = "leader"


class UserCreate(BaseModel):
    username: str = Field(..., max_length=20, min_length=3)
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.USER


class UserResponse(BaseModel):
    id: str
    username: str
    role: UserRole
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
