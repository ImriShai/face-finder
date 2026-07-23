from pydantic import BaseModel


class LandingConfig(BaseModel):
    """Public landing-page branding: an optional title and whether a background
    video has been configured."""

    title: str | None = None
    has_video: bool = False


class LandingConfigUpdate(BaseModel):
    title: str | None = None
