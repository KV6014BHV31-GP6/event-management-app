import json
from datetime import datetime
from uuid import UUID
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from src.registrations.schemas import RegistrationCreate

VERSION='rose.offline-sync.v2'
FINGERPRINT_VERSION='raw-json-sortkeys-v1'
def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)
def uuid_string(value):
    if str(UUID(value))!=value: raise ValueError('Use a canonical lowercase UUID.')
    return value

class SyncItem(BaseModel):
    client_submission_id:str=Field(min_length=36,max_length=36)
    application:dict
    model_config=ConfigDict(extra='forbid')
    _uuid=field_validator('client_submission_id')(uuid_string)

class SyncBatch(BaseModel):
    contract_version:Literal['rose.offline-sync.v2']
    batch_id:str=Field(min_length=36,max_length=36)
    items:list[SyncItem]=Field(min_length=1,max_length=25)
    model_config=ConfigDict(extra='forbid')
    _uuid=field_validator('batch_id')(uuid_string)
    @model_validator(mode='after')
    def bounded(self):
        if len({x.client_submission_id for x in self.items})!=len(self.items):raise ValueError('Duplicate submission IDs in envelope.')
        if len(canonical(self.model_dump()).encode('utf-8'))>131072:raise ValueError('Batch exceeds128KiB.')
        return self

class SyncApplication(RegistrationCreate):
    model_config=ConfigDict(extra='forbid')

class ItemReceipt(BaseModel):
    client_submission_id:str
    outcome:Literal['accepted','rejected','duplicate']
    code:Literal['RECORDED','INVALID_APPLICATION','EVENT_CLOSED','EVENT_FULL','IDENTITY_CONFLICT','ALREADY_REGISTERED','FILE_NOT_OWNED']
    registration_id:str|None
    registration_status_at_recording:Literal['pending','approved','waiting','rejected','cancelled']|None
    recorded_at:datetime

class BatchReceipt(BaseModel):
    contract_version:Literal['rose.offline-sync.v2']
    fingerprint_version:Literal['raw-json-sortkeys-v1']
    batch_id:str
    event_public_id:str
    actor_id:str
    recorded_at:datetime
    items:list[ItemReceipt]
