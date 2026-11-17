"""Database reference data only. No implicit taxonomy, defaults or policy seed."""
from fastapi import HTTPException
from sqlalchemy import select
from src.registrations.models import AgeGroupModel, IncomeBandModel


async def registration_options(db):
    return {
        'age_groups': (await db.scalars(select(AgeGroupModel).order_by(AgeGroupModel.min_age, AgeGroupModel.code))).all(),
        'income_bands': (await db.scalars(select(IncomeBandModel).where(IncomeBandModel.is_active.is_(True)).order_by(IncomeBandModel.display_order, IncomeBandModel.code))).all(),
    }


async def validate_groups(db, age_group_code, income_band_code):
    age = await db.get(AgeGroupModel, age_group_code)
    income = await db.get(IncomeBandModel, income_band_code) if income_band_code is not None else None
    if age is None or (income_band_code is not None and (income is None or not income.is_active)):
        raise HTTPException(422, {'code': 'INVALID_CLASSIFICATION', 'message': 'Choose an available age group and income band.'})
