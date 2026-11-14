from pydantic import BaseModel, Field, ConfigDict
from datetime import date
from typing import List


class OfflineDocumentRef(BaseModel):
    file_ref: str = Field(..., alias="fileRef")

    model_config = ConfigDict(populate_by_name=True)


class OfflineApplicationItem(BaseModel):
    registration_id: str = Field(..., alias="registrationId", max_length=26)
    first_name: str = Field(..., alias="firstName", max_length=20)
    last_name: str = Field(..., alias="lastName", max_length=20)
    gender: str = Field(..., alias="gender")  # 'male' or 'female'
    age_group_code: str = Field(..., alias="AgeGroupCode", max_length=20)
    phone: str = Field(..., alias="phone", max_length=20)
    address: str = Field(..., alias="address")
    national_id: str = Field(..., alias="nationalId", max_length=50)
    income_band_code: str = Field(..., alias="incomeBandCode", max_length=30)
    documents: List[OfflineDocumentRef] = Field(
        default_factory=list, alias="documents")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class OfflineBatchSyncPayload(BaseModel):
    batch_id: str = Field(..., alias="batchId", max_length=26)
    applications: List[OfflineApplicationItem] = Field(
        ..., alias="applications")

    model_config = ConfigDict(populate_by_name=True)


# --- Response Layout Models ---

class SuccessfulRegistrationItem(BaseModel):
    registration_id: str = Field(..., alias="registrationId")
    status: str = "imported"

    model_config = ConfigDict(populate_by_name=True)


class FailedRegistrationItem(BaseModel):
    registration_id: str = Field(..., alias="registrationId")
    error_code: str = Field(..., alias="errorCode")
    message: str

    model_config = ConfigDict(populate_by_name=True)


class OfflineSyncBatchResponse(BaseModel):
    batch_id: str = Field(..., alias="batchId")
    total_registrations: int = Field(..., alias="totalRegistrations")
    success_count: int = Field(..., alias="successCount")
    failed_count: int = Field(..., alias="failedCount")
    successful_registrations: List[SuccessfulRegistrationItem] = Field(
        ..., alias="successfulRegistrations")
    failed_registrations: List[FailedRegistrationItem] = Field(
        ..., alias="failedRegistrations")

    model_config = ConfigDict(populate_by_name=True)
