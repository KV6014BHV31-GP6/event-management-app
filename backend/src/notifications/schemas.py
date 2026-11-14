from datetime import datetime
from enum import Enum
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


class NotificationStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SENT = "sent"
    FAILED = "failed"
    CANCELLED = "cancelled"


# Define supported types as an explicit Literal type matrix for strict compile-time/runtime validation
NotificationTypeLiteral = Literal[
    "registration_submitted",
    "registration_approved",
    # "registration_rejected",
    "registration_waitlisted",
    "registration_cancelled",
    "waitlist_promoted",
    "event_reminder_7_days",
    "event_reminder_1_day"
]


class NotificationCreateInternal(BaseModel):
    """
    Schema representing properties passed down internally to initialize 
    and store notification record footprints.
    """
    notification_type: NotificationTypeLiteral = Field(
        ...,
        description="The type category governing the dispatch intent."
    )
    registration_id: Optional[str] = Field(
        None,
        max_length=26,
        description="The ULID referencing the linked target registration entity record."
    )
    scheduled_at: Optional[datetime] = Field(
        None,
        description="Execution timestamp window when dispatch is intended to fire. Defaults to current timestamp."
    )


class NotificationResponse(BaseModel):
    """
    Schema representation for serializing and tracking stored system notifications.
    """
    id: int
    notification_type: str
    registration_id: Optional[str] = None
    status: NotificationStatus
    scheduled_at: datetime
    sent_at: Optional[datetime] = None
    retry_count: int
    error_message: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class RegistrationContext(BaseModel):
    registration_id: str
    participant_id: str
    participant_name: str
    participant_phone: str
    event_id: int
    event_public_id: str
    event_title: str
    event_location: str
    event_start_time: datetime
    event_end_time: datetime
    registration_status: str

    model_config = ConfigDict(from_attributes=True)
