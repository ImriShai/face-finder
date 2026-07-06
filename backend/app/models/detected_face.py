import uuid

from sqlalchemy import ForeignKey, Integer, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class DetectedFace(Base):
    __tablename__ = "detected_faces"
    __table_args__ = (UniqueConstraint("faiss_vector_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    photo_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("photos.id", ondelete="CASCADE"), index=True)
    face_index: Mapped[int] = mapped_column(Integer)
    faiss_vector_id: Mapped[int] = mapped_column(Integer, index=True)

    photo: Mapped["Photo"] = relationship(back_populates="faces")
