from datetime import datetime
import enum
from typing import Optional
from sqlalchemy import String, Text, DateTime, Integer, BigInteger, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from src.core.database import Base


class EventStatusEnum(enum.Enum):
    active = "active"
    cancelled = "cancelled"
    completed = "completed"


class EventModel(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True)
    # Restored to 21-character maximum constraint size parameters to handle NanoID
    public_id: Mapped[str] = mapped_column(
        String(21), unique=True, nullable=False)
    organizer_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    overview: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    online_quota: Mapped[int] = mapped_column(Integer, nullable=False)
    offline_quota: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False)

    status: Mapped[EventStatusEnum] = mapped_column(
        SQLEnum(EventStatusEnum, name="event_status", native_enum=True),
        nullable=False,
        default=EventStatusEnum.active
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    image_path: Mapped[Optional[str]] = mapped_column(
        String(512), nullable=True)
