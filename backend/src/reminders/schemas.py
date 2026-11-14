from datetime import datetime
from enum import Enum
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


class ReminderStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SENT = "sent"
    CANCELLED = "cancelled"
    FAILED = "failed"


# Restricts programmatic types strictly to '7d' and '1d' configurations
ReminderTypeLiteral = Literal["7d", "1d"]


class ReminderCreateInternal(BaseModel):
    """
    Schema representation utilized internally to instantiate 
    time-locked reminder record entries.
    """
    registration_id: str = Field(
        ...,
        max_length=26,
        description="The target registration record ULID identifier."
    )
    reminder_type: ReminderTypeLiteral = Field(
        ...,
        description="The exact scheduled gap duration tracking context."
    )
    scheduled_at: datetime = Field(
        ...,
        description="The precise moment calculated for notification dispatch deployment."
    )


class EventReminderResponse(BaseModel):
    """
    Schema envelope for monitoring or tracking active reminders.
    """
    id: int
    registration_id: str
    reminder_type: str
    scheduled_at: datetime
    status: ReminderStatus
    sent_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
