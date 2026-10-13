import pytest
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from src.main import app
from src.core.database import get_async_db, Base

# 🟢 CRUCIAL FIX: Import all models here so SQLAlchemy registers them!
from src.users.models import UserModel

# Use an isolated, in-memory SQLite database for test validation
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


@pytest.fixture(autouse=True)
async def setup_database():
    """Automatically builds schemas before a test and clears them afterwards."""
    async with test_engine.begin() as conn:
        # Since the models are imported above, this will now successfully create 'users' and 'events'
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provides an isolated database session per test case context."""
    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Overwrites the production app engine dependency injection 
    and sets up an asynchronous HTTP client wrapper.
    """
    async def _override_get_async_db():
        try:
            yield db_session
        finally:
            await db_session.close()

    app.dependency_overrides[get_async_db] = _override_get_async_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
