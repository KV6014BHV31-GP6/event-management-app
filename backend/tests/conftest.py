import pytest
import shutil
from typing import AsyncGenerator
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from src.main import app
from src.core.database import Base, get_async_db
from src.files.service import FileService

TEST_DATABASE_URL = "postgresql+asyncpg://autse:@localhost/test_db"

engine = create_async_engine(TEST_DATABASE_URL, echo=False, poolclass=NullPool)
TestingSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=True
)

pytest_plugins = [
    "tests.fixtures.users",
    "tests.fixtures.events",
    "tests.fixtures.registrations",
    "tests.fixtures.participants",
]


@pytest.fixture(autouse=True)
async def prepare_database():
    """Builds clean isolated table schemas per target validation function."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(autouse=True)
def mock_upload_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """
    Overrides the storage directory inside FileService to use a temporary directory.
    """
    test_upload_dir = tmp_path / "storage" / "uploads"
    test_upload_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(
        FileService,
        "__init__",
        lambda self, repo: setattr(self, "repo", repo) or setattr(
            self, "upload_dir", str(test_upload_dir))
    )
    yield test_upload_dir
    if test_upload_dir.exists():
        shutil.rmtree(test_upload_dir)


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provides an isolated database session for direct validation inside test blocks."""
    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """
    Provides an AsyncClient where every request spins up its own clean, isolated 
    database session, resolving the 'another operation is in progress' InterfaceError.
    """
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with TestingSessionLocal() as session:
            yield session

    app.dependency_overrides[get_async_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
