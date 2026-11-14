import enum
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, Text, Integer, Enum as SQLEnum, BigInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.database import Base
from src.registrations.models import RegistrationModel


class NotificationStatusEnum(enum.Enum):
    pending = "pending"
    processing = "processing"
    sent = "sent"
    failed = "failed"
    cancelled = "cancelled"


class NotificationModel(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True)

    notification_type: Mapped[str] = mapped_column(String(50), nullable=False)

    registration_id: Mapped[Optional[str]] = mapped_column(
        String(26),
        ForeignKey("registrations.id", ondelete="CASCADE"),
        nullable=True
    )

    status: Mapped[NotificationStatusEnum] = mapped_column(
        SQLEnum(NotificationStatusEnum,
                name="notification_status", native_enum=True),
        nullable=False,
        default=NotificationStatusEnum.pending
    )

    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)

    retry_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False)

    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # --- Relationships ---
    # Eagerly provides access back to registration metadata for template compilation context
    registration: Mapped[Optional["RegistrationModel"]] = relationship(
        "RegistrationModel",
        lazy="select"
    )
