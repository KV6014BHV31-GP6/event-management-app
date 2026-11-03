from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field, field_validator


class UserRole(str, Enum):
    USER = "user"
    ORGANIZER = "organizer"
    LEADER = "leader"


class UserCreate(BaseModel):
    username: str = Field(..., max_length=20, min_length=3)
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.USER

    @field_validator("username")
    @classmethod
    def nonblank_username(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("username must not be blank.")
        return value

    @field_validator("password")
    @classmethod
    def bcrypt_length(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("password must not exceed 72 UTF-8 bytes.")
        return value


class UserResponse(BaseModel):
    id: str
    username: str
    role: UserRole
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
