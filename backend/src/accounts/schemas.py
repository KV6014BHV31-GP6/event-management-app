import unicodedata
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, StrictInt, StrictStr, field_validator

VERSION = 'rose.demo-journey.v1'


class Envelope(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    contract_version: Literal['rose.demo-journey.v1']
    operation_id: str
    expected_version: StrictInt | None = None
    data: dict

    @field_validator('operation_id')
    @classmethod
    def canonical(cls, value):
        if str(UUID(value)) != value:
            raise ValueError('Canonical UUID required')
        return value

    @field_validator('expected_version')
    @classmethod
    def nonnegative(cls, value):
        if value is not None and value < 0:
            raise ValueError('Nonnegative version required')
        return value


class ProfileEdit(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    display_name: StrictStr
    preferred_language: Literal['en', 'ms']

    @field_validator('display_name')
    @classmethod
    def name(cls, value):
        if any(unicodedata.category(c).startswith('C') for c in value):
            raise ValueError('Control characters forbidden')
        value = value.strip()
        if not 1 <= len(value) <= 80:
            raise ValueError('Bounded display name required')
        return value


class RecoveryIssue(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    account_id: StrictStr
    synthetic: Literal[True]


class PasswordReset(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    new_password: StrictStr

    @field_validator('new_password')
    @classmethod
    def bounded(cls, value):
        if not 12 <= len(value.encode('utf-8')) <= 72:
            raise ValueError('Password byte length invalid')
        return value
