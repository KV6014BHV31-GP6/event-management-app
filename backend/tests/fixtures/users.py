import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from src.main import app
from src.users.models import UserModel, UserRoleEnum
from src.auth.deps import get_current_user


@pytest.fixture
async def mock_organizer_user(db_session: AsyncSession) -> UserModel:
    """Seeds an organizer user context."""
    user = UserModel(
        id="01ORGANIZER000000000000000",
        username="organizer_test",
        password_hash="fake_hash",
        role=UserRoleEnum.organizer
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.fixture
async def mock_regular_user(db_session: AsyncSession) -> UserModel:
    """Seeds a standard user with the 'user' role."""
    user = UserModel(
        id="01AN4V076Z7925ZZZZZZZZZZZX",
        username="regular_joe",
        password_hash="fake_hash",
        role=UserRoleEnum.user
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.fixture
async def mock_leader_user(db_session: AsyncSession) -> UserModel:
    """Seeds a user with the 'leader' role."""
    user = UserModel(
        id="01AN4V076Z7925ZZZZZZZZZZZY",
        username="team_leader",
        password_hash="fake_hash",
        role=UserRoleEnum.leader
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.fixture
def mock_organizer_headers(mock_organizer_user: UserModel) -> dict:
    """Overrides get_current_user dependency injection for organizers."""
    app.dependency_overrides[get_current_user] = lambda: mock_organizer_user
    return {"Authorization": "Bearer mock-organizer-token"}


@pytest.fixture
def mock_regular_user_headers(mock_regular_user: UserModel) -> dict:
    """Overrides get_current_user dependency injection for regular users."""
    app.dependency_overrides[get_current_user] = lambda: mock_regular_user
    return {"Authorization": "Bearer mock-regular-token"}


@pytest.fixture
def mock_leader_headers(mock_leader_user: UserModel) -> dict:
    """Overrides get_current_user dependency injection for leader users."""
    app.dependency_overrides[get_current_user] = lambda: mock_leader_user
    return {"Authorization": "Bearer mock-leader-token"}
