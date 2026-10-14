"""Test-only PGlite transport adaptation; repository application source unchanged.

Native PostgreSQL17 acceptance remains NOT_RUN. PGlite has one underlying
connection and does not fully implement native connection termination.
"""
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from src.core import database

# Apply supported SQLAlchemy/asyncpg transport settings before the application
# routers import the shared database module. SQL and ORM services are unchanged.
database.async_engine = create_async_engine(
    database.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
    pool_size=1,
    max_overflow=0,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4().hex}__",
        "command_timeout": 15,
        "timeout": 10,
    },
)
database.AsyncSessionLocal = async_sessionmaker(
    bind=database.async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)
from src.main import app  # noqa: E402,F401
