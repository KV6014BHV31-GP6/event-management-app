from datetime import datetime, date
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, model_validator


class RegistrationChannel(str, Enum):
    ONLINE = "online"
    WALKIN = "walkin"
    OFFLINE = "offline"
    OCR = "ocr"


class RegistrationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    WAITING = "waiting"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


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
    income_band_code: str = Field(..., max_length=30)
    file_ids: List[str] = Field(default_factory=list, max_items=3,
                                description="List of 0 to 3 supporting document file ULIDs")


class NestedEventResponse(BaseModel):
    public_id: str
    title: str

    model_config = ConfigDict(from_attributes=True)


class RegistrationResponse(BaseModel):
    registration_id: str = Field(..., validation_alias="id",
                                 description="The ULID of the registration record")
    event: NestedEventResponse
    channel: RegistrationChannel
    status: RegistrationStatus
    created_at: datetime
    message: str = Field(
        default="Registration submitted successfully and is pending organizer review.")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# --- Schemas for GET /me/registrations endpoint ---

class UserRegistrationItem(BaseModel):
    registration_id: str = Field(..., validation_alias="id",
                                 description="The ULID of the registration record")
    event: NestedEventResponse
    channel: RegistrationChannel
    status: RegistrationStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class UserRegistrationsListResponse(BaseModel):
    data: List[UserRegistrationItem]
    total_count: int


# --- Schemas for GET /me/registrations/{registration_id} endpoint ---

class DetailedEventResponse(BaseModel):
    public_id: str
    title: str
    start_time: datetime
    end_time: datetime
    location: str

    model_config = ConfigDict(from_attributes=True)


class IncomeBandResponse(BaseModel):
    code: str
    name: str

    model_config = ConfigDict(from_attributes=True)


class RegistrationFormResponse(BaseModel):
    first_name: str
    last_name: str
    gender: UserGender
    date_of_birth: date
    phone: str
    address: str
    national_id: str
    income_band: IncomeBandResponse

    model_config = ConfigDict(from_attributes=True)


class DocumentResponse(BaseModel):
    file_id: str
    file_name: str
    uploaded_at: datetime


class ReviewDetailsResponse(BaseModel):
    status: RegistrationStatus
    reviewed_at: Optional[datetime] = None
    remarks: Optional[str] = None


class UserRegistrationDetailResponse(BaseModel):
    registration_id: str = Field(..., validation_alias="id")
    event: DetailedEventResponse
    channel: RegistrationChannel
    status: RegistrationStatus
    registration_form: RegistrationFormResponse
    uploaded_documents: List[DocumentResponse]
    review: ReviewDetailsResponse
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def construct_nested_fields(cls, data: any) -> any:
        if hasattr(data, "id"):
            # Construct registration_form nesting with the full nested income_band relationship object
            if not hasattr(data, "registration_form") or data.registration_form is None:
                setattr(data, "registration_form", {
                    "first_name": data.first_name,
                    "last_name": data.last_name,
                    "gender": data.gender,
                    "date_of_birth": data.date_of_birth,
                    "phone": data.phone,
                    "address": data.address,
                    "national_id": data.national_id,
                    "income_band": data.income_band  # Passes the IncomeBandModel object directly
                })

            # Extract and flatten assigned document attachments array mapping
            if not hasattr(data, "uploaded_documents") or data.uploaded_documents is None:
                docs = []
                if hasattr(data, "file_assignments") and data.file_assignments:
                    for assignment in data.file_assignments:
                        if assignment.file:
                            docs.append({
                                "file_id": assignment.file.id,
                                "file_name": assignment.file.original_file_name,
                                "uploaded_at": assignment.created_at
                            })
                setattr(data, "uploaded_documents", docs)

            # Construct summary review block
            if not hasattr(data, "review") or data.review is None:
                setattr(data, "review", {
                    "status": data.status,
                    "reviewed_at": data.reviewed_at,
                    "remarks": data.review_remarks
                })
        return data


# --- Schemas for GET /events/{public_id}/registrations (Organizer Only) ---

class OrganizerRegistrationItem(BaseModel):
    registration_id: str = Field(..., validation_alias="id",
                                 description="The ULID of the registration record")
    participant_name: str
    phone: str
    channel: RegistrationChannel
    status: RegistrationStatus
    document_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def compute_organizer_item_fields(cls, data: any) -> any:
        if hasattr(data, "id"):
            # Concatenate name parts to map 'participant_name'
            if not hasattr(data, "participant_name"):
                setattr(data, "participant_name",
                        f"{data.first_name} {data.last_name}")

            # Count elements from file_assignments collection to calculate 'document_count'
            if not hasattr(data, "document_count"):
                count = len(data.file_assignments) if hasattr(
                    data, "file_assignments") and data.file_assignments else 0
                setattr(data, "document_count", count)
        return data


class EventRegistrationsIndexResponse(BaseModel):
    event: NestedEventResponse
    data: List[OrganizerRegistrationItem]
    total_count: int


# --- Schemas for Organizer GET /registrations/{registration_id}  ---

class CompactUserResponse(BaseModel):
    id: str
    username: str

    model_config = ConfigDict(from_attributes=True)


class OrganizerReviewDetailsResponse(BaseModel):
    reviewed_by_user: Optional[CompactUserResponse] = None
    reviewed_at: Optional[datetime] = None
    remarks: Optional[str] = None


class WaitlistDetailsResponse(BaseModel):
    waitlisted_at: Optional[datetime] = None


class CancellationDetailsResponse(BaseModel):
    cancelled_at: Optional[datetime] = None
    cancelled_by_user: Optional[CompactUserResponse] = None


class OrganizerRegistrationDetailResponse(BaseModel):
    registration_id: str = Field(..., validation_alias="id")
    channel: RegistrationChannel
    status: RegistrationStatus
    registration_form: RegistrationFormResponse
    review: OrganizerReviewDetailsResponse
    created_at: datetime
    updated_at: datetime
    waitlist: WaitlistDetailsResponse
    cancellation: CancellationDetailsResponse
    uploaded_documents: List[DocumentResponse]

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def construct_organizer_nested_fields(cls, data: any) -> any:
        if hasattr(data, "id"):
            # 1. Nest Form Fields
            if not hasattr(data, "registration_form") or data.registration_form is None:
                setattr(data, "registration_form", {
                    "first_name": data.first_name,
                    "last_name": data.last_name,
                    "gender": data.gender,
                    "date_of_birth": data.date_of_birth,
                    "phone": data.phone,
                    "address": data.address,
                    "national_id": data.national_id,
                    "income_band": data.income_band
                })

            # 2. Nest Review details (resolves reviewer user relationship)
            if not hasattr(data, "review") or data.review is None:
                setattr(data, "review", {
                    "reviewed_by_user": data.reviewer if hasattr(data, "reviewer") else None,
                    "reviewed_at": data.reviewed_at,
                    "remarks": data.review_remarks
                })

            # 3. Nest Waitlist Block
            if not hasattr(data, "waitlist") or data.waitlist is None:
                setattr(data, "waitlist", {
                    "waitlisted_at": data.waitlisted_at
                })

            # 4. Nest Cancellation details (resolves canceller user relationship)
            if not hasattr(data, "cancellation") or data.cancellation is None:
                setattr(data, "cancellation", {
                    "cancelled_at": data.cancelled_at,
                    "cancelled_by_user": data.canceller if hasattr(data, "canceller") else None
                })

            # 5. Extract and flatten documents
            if not hasattr(data, "uploaded_documents") or data.uploaded_documents is None:
                docs = []
                if hasattr(data, "file_assignments") and data.file_assignments:
                    for assignment in data.file_assignments:
                        if assignment.file:
                            docs.append({
                                "file_id": assignment.file.id,
                                "file_name": assignment.file.original_file_name,
                                "uploaded_at": assignment.created_at
                            })
                setattr(data, "uploaded_documents", docs)
        return data