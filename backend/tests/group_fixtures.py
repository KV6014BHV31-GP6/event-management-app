"""ISOLATED TEST DATA ONLY. These codes are not approved runtime policy."""
from sqlalchemy import select
from src.registrations.models import AgeGroupModel, IncomeBandModel


async def seed_group_options(db):
    if not await db.get(AgeGroupModel, '18_29'):
        db.add(AgeGroupModel(code='18_29', name='Synthetic 18–29', min_age=18, max_age=29))
    for code in ['SYNTHETIC', 'SYNTH_TEST_ONLY', 'Band A']:
        if not await db.get(IncomeBandModel, code):
            db.add(IncomeBandModel(code=code, name='Synthetic income fixture', display_order=1, is_active=True))
    await db.flush()


async def seed_isolated_browser():
    """Explicit CI test fixture entry point, never a runtime bootstrap/policy seed."""
    from sqlalchemy import text
    from sqlalchemy.engine import make_url
    from src.core.config import settings
    from src.core.database import AsyncSessionLocal, async_engine
    target = make_url(settings.DATABASE_URL)
    if settings.ENVIRONMENT != 'development' or target.host != '127.0.0.1' or not target.database.endswith('_browser_be_test'):
        raise ValueError('Explicit loopback disposable browser test database required.')
    try:
        async with AsyncSessionLocal() as db:
            actual = (await db.execute(text('SELECT current_database(), rolsuper FROM pg_roles WHERE rolname=current_user'))).one()
            if actual[0] != target.database or actual[1]:
                raise ValueError('Exact non-superuser browser test identity required.')
            await seed_group_options(db)
            await db.commit()
    finally:
        await async_engine.dispose()


if __name__ == '__main__':
    import argparse
    import asyncio
    parser = argparse.ArgumentParser(description='Isolated synthetic Browser classification fixture only.')
    parser.add_argument('--acknowledge-isolated-browser', action='store_true', required=True)
    parser.parse_args()
    asyncio.run(seed_isolated_browser())
    print('Isolated synthetic browser classification fixture ready.')
