from datetime import datetime, date, timezone
import enum
from typing import Optional, List
from sqlalchemy import String, DateTime, Date, BigInteger, ForeignKey, Enum as SQLEnum, Text, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.database import Base
from src.events.models import EventModel
from src.files.models import FileModel
from src.users.models import UserModel


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


class UserGenderEnum(enum.Enum):
    male = "male"
    female = "female"


class IncomeBandModel(Base):
    __tablename__ = "income_bands"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False)


class RegistrationFileModel(Base):
    __tablename__ = "registration_files"

    registration_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("registrations.id", ondelete="CASCADE"), primary_key=True
    )
    file_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("files.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Relationship to cleanly pull document metadata properties from the files table
    file: Mapped["FileModel"] = relationship("FileModel", lazy="select")


class RegistrationModel(Base):
    __tablename__ = "registrations"

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
    income_band_code: Mapped[str] = mapped_column(
        String(30), ForeignKey("income_bands.code"), nullable=False)

    # --- Review & Waitlist ---
    reviewed_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(26), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)
    review_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    waitlisted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)

    # --- Cancellation Audit Log ---
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)
    cancelled_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(26), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(DateTime(
        timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )

    # --- Relationships ---
    event: Mapped["EventModel"] = relationship("EventModel", lazy="select")
    income_band: Mapped[IncomeBandModel] = relationship(
        IncomeBandModel, lazy="select")
    file_assignments: Mapped[List[RegistrationFileModel]] = relationship(
        "RegistrationFileModel", backref="registration", cascade="all, delete-orphan"
    )

    reviewer: Mapped[Optional["UserModel"]] = relationship(
        "UserModel",
        foreign_keys=[reviewed_by_user_id],
        lazy="select"
    )

    # Relationship to pull systemic cancellation actor information
    canceller: Mapped[Optional["UserModel"]] = relationship(
        "UserModel",
        foreign_keys=[cancelled_by_user_id],
        lazy="select"
    )
    