from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Required from the environment — connection strings carry credentials
    # and don't belong in source.
    DATABASE_URL: str
    STORAGE_DIR: str = "/storage"
    GALLERY_DIR: str = "/storage/gallery"
    THUMBNAILS_DIR: str = "/storage/thumbnails"
    PREVIEWS_DIR: str = "/storage/previews"
    FAISS_INDEX_PATH: str = "/storage/faiss.index"
    MAX_UPLOAD_SIZE: int = 500 * 1024 * 1024  # 500 MB
    MAX_VIDEO_UPLOAD_SIZE: int = 500 * 1024 * 1024  # 500 MB (landing background video)
    THUMBNAIL_SIZE: tuple[int, int] = (400, 400)
    MATCH_THRESHOLD: float = 0.45
    SEARCH_RATE_LIMIT: str = "10/minute"
    INSIGHTFACE_MODEL: str = "buffalo_l"
    # Required — no default, so a deployment without it fails fast instead of
    # shipping a known password (and an empty-string default would make the
    # admin check pass for a blank X-Admin-Password header).
    ADMIN_PASSWORD: str
    # Empty disables the viewer gate (see /auth/config).
    VIEWER_PASSWORD: str = ""
    model_config = {"env_file": ".env"}


settings = Settings()
