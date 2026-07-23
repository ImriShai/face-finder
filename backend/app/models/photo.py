import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(String(255))
    original_path: Mapped[str] = mapped_column(String(500))
    thumbnail_path: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # When the photo was actually taken (from EXIF); NULL if unknown.
    taken_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    faces: Mapped[list["DetectedFace"]] = relationship(back_populates="photo", cascade="all, delete-orphan")
