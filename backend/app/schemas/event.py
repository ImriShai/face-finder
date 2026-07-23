from datetime import datetime

from pydantic import BaseModel


class EventDef(BaseModel):
    """One event section of a gallery: a label and the time it starts.

    A photo belongs to the latest event whose ``starts_at`` is at or before the
    photo's capture time — so an ordered list of these splits a timeline into
    named sections (e.g. "Ceremony", "Reception").
    """

    label: str
    starts_at: datetime
