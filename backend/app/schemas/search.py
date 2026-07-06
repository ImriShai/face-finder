import uuid

from pydantic import BaseModel


class SearchMatch(BaseModel):
    photo_id: uuid.UUID
    confidence: float


class SearchResponse(BaseModel):
    matches: list[SearchMatch]
    faces_detected: int = 1
