from fastapi import APIRouter

from app.schemas.event import EventDef
from app.services import events_service

router = APIRouter(tags=["events"])


@router.get("/events", response_model=list[EventDef])
async def list_events() -> list[EventDef]:
    """Public: the admin-defined event sections used to group search results."""
    return events_service.read_events()
