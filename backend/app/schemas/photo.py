import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator


class PhotoResponse(BaseModel):
    id: uuid.UUID
    filename: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PhotoListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    photos: list[PhotoResponse]


DownloadQuality = Literal["original", "web"]


class PhotoIdsRequest(BaseModel):
    photo_ids: list[uuid.UUID]

    @field_validator("photo_ids")
    @classmethod
    def validate_not_empty(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if not v:
            raise ValueError("At least one photo ID is required")
        return v


class DownloadZipRequest(PhotoIdsRequest):
    quality: DownloadQuality = "original"

    @field_validator("photo_ids")
    @classmethod
    def validate_count(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(v) > 500:
            raise ValueError("Maximum 500 photos per ZIP download")
        return v
