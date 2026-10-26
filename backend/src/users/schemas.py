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

    @field_validator("role")
    @classmethod
    def public_role(cls, value):
        if value != UserRole.USER:
            raise ValueError("Public Signup only creates user accounts.")
        return value

    @field_validator("username")
    @classmethod
    def nonblank_username(cls, value):
        if not value.strip():
            raise ValueError("Username must not be all whitespace.")
        return value

    @field_validator("password")
    @classmethod
    def bcrypt_byte_limit(cls, value):
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password exceeds the supported byte length.")
        return value


class UserResponse(BaseModel):
    id: str
    username: str
    role: UserRole
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
