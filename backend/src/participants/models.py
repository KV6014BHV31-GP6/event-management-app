from datetime import date, datetime, timezone
import enum
from sqlalchemy import String, DateTime, Enum as SQLEnum, ForeignKey, Date, Text
from sqlalchemy.orm import Mapped, mapped_column
from src.core.database import Base


class UserGenderEnum(enum.Enum):
    male = "male"
    female = "female"


class ParticipantModel(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("users.id"), unique=True, nullable=True
    )
    first_name: Mapped[str] = mapped_column(String(20), nullable=False)
    last_name: Mapped[str] = mapped_column(String(20), nullable=False)
    gender: Mapped[str] = mapped_column(
        SQLEnum(UserGenderEnum, name="user_gender", native_enum=True), nullable=False
    )
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    national_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_by_user_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
