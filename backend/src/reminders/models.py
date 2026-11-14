import enum
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, Enum as SQLEnum, BigInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.database import Base
from src.registrations.models import RegistrationModel


class ReminderTypeEnum(enum.Enum):
    seven_days = "7d"
    one_day = "1d"


class ReminderStatusEnum(enum.Enum):
    pending = "pending"
    processing = "processing"
    sent = "sent"
    cancelled = "cancelled"
    failed = "failed"


class EventReminderModel(Base):
    __tablename__ = "event_reminders"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True)

    registration_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("registrations.id", ondelete="CASCADE"),
        nullable=False
    )

    reminder_type: Mapped[str] = mapped_column(String(20), nullable=False)

    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False)

    status: Mapped[ReminderStatusEnum] = mapped_column(
        SQLEnum(ReminderStatusEnum, name="reminder_status", native_enum=True),
        nullable=False,
        default=ReminderStatusEnum.pending
    )

    sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)

    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # --- Relationships ---
    # Connects to your active registrations table layout cleanly
    registration: Mapped["RegistrationModel"] = relationship(
        "RegistrationModel",
        lazy="select"
    )
