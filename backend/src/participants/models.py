from datetime import datetime, date, timezone
from typing import Optional
from sqlalchemy import String, DateTime, Date, ForeignKey, Enum as SQLEnum, Text
from sqlalchemy.orm import Mapped, mapped_column
from src.core.database import Base
# Imported to share enum structure cleanly
from src.registrations.models import UserGenderEnum


class ParticipantModel(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    user_id: Mapped[Optional[str]] = mapped_column(
        String(26), ForeignKey("users.id", ondelete="SET NULL"), unique=True, nullable=True
    )
    first_name: Mapped[str] = mapped_column(String(20), nullable=False)
    last_name: Mapped[str] = mapped_column(String(20), nullable=False)

    gender: Mapped[UserGenderEnum] = mapped_column(
        SQLEnum(UserGenderEnum, name="user_gender", native_enum=True), nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)

    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    national_id: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(
        timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(26), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
