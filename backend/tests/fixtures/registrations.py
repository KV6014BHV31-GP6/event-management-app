import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.registrations.models import (
    RegistrationModel,
    RegistrationStatusEnum,
    RegistrationChannelEnum,
    UserGenderEnum,
    AgeGroupModel,
    IncomeBandModel
)
from src.participants.models import ParticipantModel


@pytest.fixture
def seed_registrations_factory(db_session: AsyncSession):
    """
    Factory fixture providing parametric matrix loading over registrations table.
    Ensures required lookup rows, participants, and mandatory schema constraints exist.
    """
    async def _factory(
        event_id: int,
        online_approved: int,
        offline_approved: int,
        cancelled_count: int,
        waiting_count: int,
    ):
        # 1. Ensure required foreign-key lookup records exist in the test DB
        if not (await db_session.execute(select(IncomeBandModel).filter_by(code="Band A"))).scalar_one_or_none():
            db_session.add(
                IncomeBandModel(
                    code="Band A",
                    name="Monthly income: $0 - $500",
                    display_order=1,
                    is_active=True,
                )
            )

        if not (await db_session.execute(select(AgeGroupModel).filter_by(code="18_29"))).scalar_one_or_none():
            db_session.add(
                AgeGroupModel(
                    code="18_29",
                    name="18 - 29 years old",
                    min_age=18,
                    max_age=29,
                )
            )

        await db_session.flush()

        current_id = 1

        # Base dict matching the latest registrations schema (no date_of_birth or marriage_status)
        base_attributes = {
            "gender": UserGenderEnum.male,
            "age_group_code": "18_29",
            "phone": "0912345678",
            "address": "123 Test Street",
            "income_band_code": "Band A",
        }

        async def _add_record(
            reg_prefix: str,
            first_name: str,
            last_name: str,
            channel: RegistrationChannelEnum,
            status: RegistrationStatusEnum,
        ):
            nonlocal current_id
            participant_id = f"01AN4V076Z7925ZZZZPART{current_id:04d}"
            national_id = f"A12345{current_id:04d}"

            # Create the parent Participant record first to satisfy participants(id) FK
            # and participants(national_id) UNIQUE constraint
            db_session.add(
                ParticipantModel(
                    id=participant_id,
                    first_name=first_name,
                    last_name=last_name,
                    gender=UserGenderEnum.male,
                    phone="0912345678",
                    address="123 Test Street",
                    national_id=national_id,
                )
            )
            await db_session.flush()

            db_session.add(
                RegistrationModel(
                    id=f"{reg_prefix}{current_id:04d}",  # 26-char ULID format
                    event_id=event_id,
                    participant_id=participant_id,
                    first_name=first_name,
                    last_name=last_name,
                    national_id=national_id,
                    channel=channel,
                    status=status,
                    **base_attributes,
                )
            )
            current_id += 1

        # 2. Generate Approved Online Records
        for _ in range(online_approved):
            await _add_record(
                reg_prefix="01AN4V076Z7925ZZZZREGON",
                first_name="John",
                last_name="Doe",
                channel=RegistrationChannelEnum.online,
                status=RegistrationStatusEnum.approved,
            )

        # 3. Generate Approved Offline Records
        for _ in range(offline_approved):
            await _add_record(
                reg_prefix="01AN4V076Z7925ZZZZREGOF",
                first_name="Jane",
                last_name="Smith",
                channel=RegistrationChannelEnum.offline,
                status=RegistrationStatusEnum.approved,
            )

        # 4. Generate Cancelled Records
        for _ in range(cancelled_count):
            await _add_record(
                reg_prefix="01AN4V076Z7925ZZZZREGCAN",
                first_name="Tracey",
                last_name="O",
                channel=RegistrationChannelEnum.online,
                status=RegistrationStatusEnum.cancelled,
            )

        # 5. Generate Waiting Count Records
        for _ in range(waiting_count):
            await _add_record(
                reg_prefix="01AN4V076Z7925ZZZZREGWAT",
                first_name="Waiting",
                last_name="User",
                channel=RegistrationChannelEnum.online,
                status=RegistrationStatusEnum.waiting,
            )

        await db_session.commit()

    return _factory
