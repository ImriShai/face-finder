from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "***REMOVED***"
    STORAGE_DIR: str = "/storage"
    GALLERY_DIR: str = "/storage/gallery"
    THUMBNAILS_DIR: str = "/storage/thumbnails"
    PREVIEWS_DIR: str = "/storage/previews"
    FAISS_INDEX_PATH: str = "/storage/faiss.index"
    MAX_UPLOAD_SIZE: int = 500 * 1024 * 1024  # 500 MB
    THUMBNAIL_SIZE: tuple[int, int] = (400, 400)
    MATCH_THRESHOLD: float = 0.45
    SEARCH_RATE_LIMIT: str = "10/minute"
    INSIGHTFACE_MODEL: str = "buffalo_l"
    ADMIN_PASSWORD: str = "***REMOVED***"
    VIEWER_PASSWORD: str = "***REMOVED***"  
    model_config = {"env_file": ".env"}


settings = Settings()
