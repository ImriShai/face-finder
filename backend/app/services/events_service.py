"""Persist the admin-defined event sections as a small JSON file in storage."""
import json
import os

from app.config import settings
from app.schemas.event import EventDef


def _config_path() -> str:
    return os.path.join(settings.STORAGE_DIR, "events_config.json")


def read_events() -> list[EventDef]:
    path = _config_path()
    if not os.path.exists(path):
        return []
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return [EventDef.model_validate(item) for item in data]
    except Exception:
        # A malformed/hand-edited file shouldn't take the app down — just means
        # "no event grouping" until it's re-saved from the admin panel.
        return []


def write_events(events: list[EventDef]) -> None:
    os.makedirs(settings.STORAGE_DIR, exist_ok=True)
    path = _config_path()
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump([e.model_dump(mode="json") for e in events], f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
