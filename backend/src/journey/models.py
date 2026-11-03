"""Additive journey sidecars; legacy tables and wire enums remain unchanged."""
from sqlalchemy import String, Integer, BigInteger, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from src.core.database import Base

class JourneyState(Base):
    __tablename__ = 'journey_state'
    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    event_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey('events.id', ondelete='RESTRICT'), nullable=True, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)

class JourneyOperation(Base):
    __tablename__ = 'journey_operations'
    operation_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    actor: Mapped[str] = mapped_column(String(100), nullable=False)
    event_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey('events.id', ondelete='RESTRICT'), nullable=True)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    receipt: Mapped[dict] = mapped_column(JSON, nullable=False)
