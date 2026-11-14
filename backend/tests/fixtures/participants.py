from datetime import date
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from src.participants.models import ParticipantModel
from src.registrations.models import UserGenderEnum


@pytest.fixture
def seed_participant_factory(db_session: AsyncSession):
    """Factory to seed static participants to test lookup logic pools."""
    async def _factory(id: str, national_id: str, phone: str = "+886912345678"):
        participant = ParticipantModel(
            id=id,
            first_name="Jane",
            last_name="Doe",
            gender=UserGenderEnum.female,
            date_of_birth=date(1994, 8, 12),
            phone=phone,
            address="456 Innovation Road",
            national_id=national_id
        )
        db_session.add(participant)
        await db_session.commit()
        await db_session.refresh(participant)
        return participant
    return _factory
