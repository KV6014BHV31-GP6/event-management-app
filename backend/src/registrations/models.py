from datetime import datetime, date, timezone
import enum
from typing import Optional
from sqlalchemy import String, DateTime, Date, Integer, BigInteger, ForeignKey, UniqueConstraint, Enum as SQLEnum, Text
from sqlalchemy.orm import Mapped, mapped_column
from src.core.database import Base


class RegistrationChannelEnum(enum.Enum):
    online = "online"
    offline = "offline"
    walkin = "walkin"
    ocr = "ocr"


class RegistrationStatusEnum(enum.Enum):
    pending = "pending"
    approved = "approved"
    waiting = "waiting"
    rejected = "rejected"
    cancelled = "cancelled"


class MarriageStatusTypeEnum(enum.Enum):
    single = "single"
    married = "married"
    divorced = "divorced"
    widowed = "widowed"


class UserGenderEnum(enum.Enum):
    male = "male"
    female = "female"


class RegistrationModel(Base):
    __tablename__ = "registrations"
    __table_args__ = (UniqueConstraint("event_id", "participant_id", name="uq_registration_event_participant"),)

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    event_id: Mapped[int] = mapped_column(BigInteger, ForeignKey(
        "events.id", ondelete="CASCADE"), nullable=False)
    participant_id: Mapped[str] = mapped_column(String(26), ForeignKey(
        "participants.id", ondelete="RESTRICT"), nullable=False)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(26), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    channel: Mapped[RegistrationChannelEnum] = mapped_column(
        SQLEnum(RegistrationChannelEnum, name="registration_channel", native_enum=True), nullable=False
    )
    status: Mapped[RegistrationStatusEnum] = mapped_column(
        SQLEnum(RegistrationStatusEnum,
                name="registration_status", native_enum=True),
        nullable=False,
        default=RegistrationStatusEnum.pending
    )

    # --- Registration Form Data Fields ---
    first_name: Mapped[str] = mapped_column(String(20), nullable=False)
    last_name: Mapped[str] = mapped_column(String(20), nullable=False)
    gender: Mapped[UserGenderEnum] = mapped_column(
        SQLEnum(UserGenderEnum, name="user_gender", native_enum=True), nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    national_id: Mapped[str] = mapped_column(String(50), nullable=False)
    income_band_code: Mapped[str] = mapped_column(String(20), nullable=False)
    medical_record: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    marriage_status: Mapped[MarriageStatusTypeEnum] = mapped_column(
        SQLEnum(MarriageStatusTypeEnum, name="marriage_status_type", native_enum=True), nullable=False
    )

    # --- Review & Waitlist Entities ---
    reviewed_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(26), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)
    review_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    waitlist_position: Mapped[Optional[int]
                              ] = mapped_column(Integer, nullable=True)
    waitlisted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)

    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)
    cancelled_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(26), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(
        timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )
