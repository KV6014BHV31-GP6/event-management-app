from pydantic import BaseModel, Field, ConfigDict, AliasChoices
from datetime import date
from typing import List, Optional
from src.registrations.models import UserGenderEnum, MarriageStatusTypeEnum


class OfflineApplicationItem(BaseModel):
    first_name: str = Field(..., alias="firstName", max_length=20)
    last_name: str = Field(..., alias="lastName", max_length=20)
    gender: UserGenderEnum = Field(..., alias="gender")
    age_group_code: str = Field(..., validation_alias=AliasChoices("age_group_code", "ageGroupCode", "AgeGroupCode"), min_length=1, max_length=20)
    phone: str = Field(..., alias="phone", max_length=20)
    address: Optional[str] = Field(None, alias="address")
    national_id: str = Field(..., alias="nationalId", max_length=50)
    income_band_code: Optional[str] = Field(None, validation_alias=AliasChoices("income_band_code", "incomeBandCode", "incomeLevel", "income_level"), min_length=1, max_length=20)
    medical_record: Optional[str] = Field(None, alias="medicalRecord")
    marriage_status: Optional[MarriageStatusTypeEnum] = Field(None, alias="marriageStatus")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True, extra="forbid")


class OfflineBatchSyncPayload(BaseModel):
    leader_id: str = Field(..., alias="leaderId")
    applications: List[OfflineApplicationItem] = Field(
        ..., alias="applications")

    model_config = ConfigDict(populate_by_name=True)


class OfflineSyncSuccessResponse(BaseModel):
    detail: str
    synced_records: int
