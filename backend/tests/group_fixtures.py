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
