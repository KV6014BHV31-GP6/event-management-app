from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from src.events.models import EventModel, EventStatusEnum


@pytest.fixture
async def sample_event(db_session: AsyncSession, mock_organizer_user) -> EventModel:
    """Seeds a base active event with valid NanoID and matching organizer_id constraints."""
    now = datetime.now(timezone.utc)
    event = EventModel(
        public_id="v4N_J7wK9L2mP5qR8sT1u",  # Exactly 21 characters
        organizer_id=mock_organizer_user.id,
        title="Python Performance Architecture Workshop",
        overview="Advanced optimization insights.",
        location="Synthetics Lab Room B",
        online_quota=100,
        offline_quota=50,
        start_time=now + timedelta(days=2),
        end_time=now + timedelta(days=2, hours=4),
        status=EventStatusEnum.active
    )
    db_session.add(event)
    await db_session.commit()
    await db_session.refresh(event)
    return event
