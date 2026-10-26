"""Schema admission guards on disposable SQLite, not native migration evidence."""
import pytest
from sqlalchemy import create_engine, text, inspect
from scripts.dev_bootstrap import require_compatible_existing_schema, BootstrapError
from src.core.database import Base


def test_bootstrap_rejects_legacy_schema_without_changing_it():
    engine = create_engine('sqlite:///:memory:')
    try:
        with engine.begin() as connection:
            connection.execute(text('CREATE TABLE events (id INTEGER PRIMARY KEY)'))
            connection.execute(text('INSERT INTO events (id) VALUES (7)'))
            with pytest.raises(BootstrapError, match='incompatible'):
                require_compatible_existing_schema(connection, Base.metadata)
            assert connection.scalar(text('SELECT id FROM events')) == 7
            assert [c['name'] for c in inspect(connection).get_columns('events')] == ['id']
    finally:
        engine.dispose()


def test_bootstrap_guard_accepts_current_schema_without_reset():
    engine = create_engine('sqlite:///:memory:')
    try:
        with engine.begin() as connection:
            Base.metadata.create_all(connection)
            before = inspect(connection).get_table_names()
            require_compatible_existing_schema(connection, Base.metadata)
            require_compatible_existing_schema(connection, Base.metadata)
            assert inspect(connection).get_table_names() == before
            assert 'registrations' in before
    finally:
        engine.dispose()
