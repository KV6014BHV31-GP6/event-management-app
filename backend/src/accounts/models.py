from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Boolean, ForeignKey, CheckConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from src.core.database import Base


class AccountSecurity(Base):
    __tablename__ = 'account_security'
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey('users.id', ondelete='RESTRICT'), primary_key=True)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    __table_args__ = (CheckConstraint('token_version >= 0', name='ck_account_security_version'),)


class AccountProfile(Base):
    __tablename__ = 'account_profiles'
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey('users.id', ondelete='RESTRICT'), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    preferred_language: Mapped[str] = mapped_column(String(2), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    __table_args__ = (CheckConstraint('version > 0', name='ck_account_profile_version'),
                      CheckConstraint("preferred_language IN ('en', 'ms')", name='ck_account_profile_language'),
                      CheckConstraint('length(display_name) BETWEEN 1 AND 80', name='ck_account_profile_name'))


class RecoveryChallenge(Base):
    __tablename__ = 'account_recovery_challenges'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    target_id: Mapped[str] = mapped_column(String(26), ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    issuer_id: Mapped[str] = mapped_column(String(26), ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    namespace: Mapped[str] = mapped_column(String(80), nullable=False)
    secret_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    nonce: Mapped[str] = mapped_column(String(43), nullable=False)
    issued_token_version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    used_operation_id: Mapped[str | None] = mapped_column(String(36), unique=True, nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invalidated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    __table_args__ = (CheckConstraint('attempts BETWEEN 0 AND 5', name='ck_account_recovery_attempts'),
                      CheckConstraint('issued_token_version >= 0', name='ck_account_recovery_version'),
                      CheckConstraint('expires_at > created_at', name='ck_account_recovery_expiry'),
                      CheckConstraint('(used_operation_id IS NULL AND used_at IS NULL) OR (used_operation_id IS NOT NULL AND used_at IS NOT NULL)', name='ck_account_recovery_used'),
                      Index('ix_account_recovery_target_created', 'target_id', 'created_at'),
                      Index('ix_account_recovery_issuer_created', 'issuer_id', 'created_at'))
