from datetime import datetime, timezone
from sqlalchemy import String, Integer, BigInteger, DateTime, ForeignKey, JSON, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from src.core.database import Base

def utcnow(): return datetime.now(timezone.utc)

class AssetModel(Base):
    __tablename__='phase2_files'
    __table_args__=(CheckConstraint("purpose IN ('event_image','supporting_document')",name='ck_phase2_file_purpose'),)
    id:Mapped[str]=mapped_column(String(26),primary_key=True)
    owner_id:Mapped[str]=mapped_column(String(26),ForeignKey('users.id',ondelete='RESTRICT'),nullable=False,index=True)
    purpose:Mapped[str]=mapped_column(String(24),nullable=False)
    name:Mapped[str]=mapped_column(String(160),nullable=False)
    mime_type:Mapped[str]=mapped_column(String(60),nullable=False)
    size:Mapped[int]=mapped_column(Integer,nullable=False)
    storage_key:Mapped[str]=mapped_column(String(60),nullable=False,unique=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=utcnow,nullable=False)

class EventImageModel(Base):
    __tablename__='phase2_event_images'
    __table_args__=(UniqueConstraint('event_id','position',name='uq_phase2_event_image_position'),CheckConstraint('position>=0 AND position<3',name='ck_phase2_event_image_position'))
    event_id:Mapped[int]=mapped_column(BigInteger,ForeignKey('events.id',ondelete='CASCADE'),primary_key=True)
    file_id:Mapped[str]=mapped_column(String(26),ForeignKey('phase2_files.id',ondelete='RESTRICT'),primary_key=True)
    position:Mapped[int]=mapped_column(Integer,nullable=False)

class RegistrationDocumentModel(Base):
    __tablename__='phase2_registration_documents'
    __table_args__=(UniqueConstraint('registration_id','position',name='uq_phase2_registration_document_position'),CheckConstraint('position>=0 AND position<3',name='ck_phase2_registration_document_position'))
    registration_id:Mapped[str]=mapped_column(String(26),ForeignKey('registrations.id',ondelete='CASCADE'),primary_key=True)
    file_id:Mapped[str]=mapped_column(String(26),ForeignKey('phase2_files.id',ondelete='RESTRICT'),primary_key=True)
    position:Mapped[int]=mapped_column(Integer,nullable=False)

class SyncBatchModel(Base):
    __tablename__='phase2_sync_batches'
    batch_id:Mapped[str]=mapped_column(String(36),primary_key=True)
    actor_id:Mapped[str]=mapped_column(String(26),ForeignKey('users.id',ondelete='RESTRICT'),nullable=False)
    event_id:Mapped[int]=mapped_column(BigInteger,ForeignKey('events.id',ondelete='RESTRICT'),nullable=False)
    fingerprint:Mapped[str]=mapped_column(String(64),nullable=False)
    receipt:Mapped[dict]=mapped_column(JSON,nullable=False)
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=utcnow,nullable=False)

class SyncSubmissionModel(Base):
    __tablename__='phase2_sync_submissions'
    client_submission_id:Mapped[str]=mapped_column(String(36),primary_key=True)
    actor_id:Mapped[str]=mapped_column(String(26),ForeignKey('users.id',ondelete='RESTRICT'),nullable=False)
    event_id:Mapped[int]=mapped_column(BigInteger,ForeignKey('events.id',ondelete='RESTRICT'),nullable=False)
    fingerprint:Mapped[str]=mapped_column(String(64),nullable=False)
    receipt:Mapped[dict]=mapped_column(JSON,nullable=False)
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=utcnow,nullable=False)
