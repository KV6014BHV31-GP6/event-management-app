from datetime import datetime
from sqlalchemy import String, BigInteger, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base


class FileModel(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    original_file_name: Mapped[str] = mapped_column(
        String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False
    )
