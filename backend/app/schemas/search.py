import uuid
from datetime import datetime

from pydantic import BaseModel


class SearchMatch(BaseModel):
    photo_id: uuid.UUID
    confidence: float
    taken_at: datetime | None = None


class SearchResponse(BaseModel):
    matches: list[SearchMatch]
    faces_detected: int = 1
