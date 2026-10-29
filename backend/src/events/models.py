import enum
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Integer, Text, DateTime, func, ForeignKey, Enum, BigInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.database import Base
from src.files.models import FileModel


class EventStatusEnum(str, enum.Enum):
    active = "active"
    cancelled = "cancelled"
    completed = "completed"


class EventFileTypeEnum(str, enum.Enum):
    thumbnail = "thumbnail"
    flyer = "flyer"
    gallery = "gallery"


class EventFileModel(Base):
    __tablename__ = "event_files"

    event_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("events.id", ondelete="CASCADE"),
        primary_key=True
    )
    file_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("files.id", ondelete="CASCADE"),
        primary_key=True
    )
    file_type: Mapped[EventFileTypeEnum] = mapped_column(
        Enum(EventFileTypeEnum, name="event_file_type"),
        nullable=False
    )

    # Relationships
    event: Mapped["EventModel"] = relationship(back_populates="event_files")
    file: Mapped[FileModel] = relationship()


class EventModel(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True
    )

    public_id: Mapped[str] = mapped_column(
        String(21),
        unique=True,
        nullable=False
    )
    organizer_id: Mapped[Optional[str]] = mapped_column(
        String(26),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    overview: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    online_quota: Mapped[int] = mapped_column(Integer, nullable=False)
    offline_quota: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )
    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )
    status: Mapped[EventStatusEnum] = mapped_column(
        Enum(EventStatusEnum, name="event_status"),
        server_default="active",
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
        nullable=False
    )

    # Relationships
    event_files: Mapped[List[EventFileModel]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan"
    )
