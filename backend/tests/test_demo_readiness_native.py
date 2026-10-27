"""Opt-in PostgreSQL row-lock, uniqueness and transaction regressions; no HTTP/Browser claim."""
import asyncio
import os
from datetime import datetime, timezone
import pytest
import ulid
from fastapi import HTTPException
from sqlalchemy import select, func, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from src.core.database import Base
from src.users.models import UserModel, UserRoleEnum
from src.events.models import EventModel, EventStatusEnum
from src.registrations.models import RegistrationModel, RegistrationStatusEnum
from src.registrations.schemas import RegistrationCreate
from src.registrations.service import RegistrationService


@pytest.fixture
async def native():
    url=os.environ.get('NU_NATIVE_TEST_DATABASE_URL')
    if not url:
        pytest.skip('Opt in with a dedicated PostgreSQL database ending in _test.')
    parsed=make_url(url)
    if parsed.drivername!='postgresql+asyncpg' or not parsed.database.endswith('_test'):
        pytest.fail('Refusing a non-native or non-test database.')
    engine=create_async_engine(url,echo=False)
    async with engine.begin() as conn:
        assert await conn.scalar(text("SELECT rolsuper FROM pg_roles WHERE rolname=current_user")) is False
        await conn.run_sync(Base.metadata.create_all)
    sessions=async_sessionmaker(engine,expire_on_commit=False,autoflush=False)
    stamp=str(ulid.ULID())
    async with sessions() as db:
        users=[]
        for n in range(3):
            user=UserModel(id=str(ulid.ULID()),username=stamp[-14:]+str(n),password_hash='unusable-test-fixture',role=UserRoleEnum.organizer if n==2 else UserRoleEnum.user)
            db.add(user);users.append(user)
        await db.flush()
        event=EventModel(public_id=stamp[-21:],organizer_id=users[2].id,title='Native race fixture',location='Synthetic',online_quota=1,offline_quota=0,
            start_time=datetime(2030,1,1,tzinfo=timezone.utc),end_time=datetime(2030,1,2,tzinfo=timezone.utc),status=EventStatusEnum.active)
        db.add(event);await db.commit()
    registrations=[]
    for user in users[:2]:
        async with sessions() as db:
            form=RegistrationCreate(first_name='Native',last_name='Synthetic',gender='female',date_of_birth='1990-01-01',phone='TEST',address='Test only',
                national_id='NATIVE-'+user.id,income_band_code='SYNTHETIC',marriage_status='single')
            registrations.append(await RegistrationService.create_online_registration(db,event.public_id,form,user.id))
    try:
        yield sessions,users,event,registrations
    finally:
        await engine.dispose()


async def test_native_last_slot_and_repeated_cancel_race(native):
    sessions,users,event,regs=native
    async def approve(reg):
        async with sessions() as db:
            return (await RegistrationService.approve_registration(db,reg.id,users[2].id)).status.value
    assert sorted(await asyncio.gather(*(approve(r) for r in regs)))==['approved','waiting']
    async with sessions() as db:
        rows=(await db.scalars(select(RegistrationModel).where(RegistrationModel.event_id==event.id))).all()
        winner=next(r for r in rows if r.status==RegistrationStatusEnum.approved)
        waiting=next(r for r in rows if r.status==RegistrationStatusEnum.waiting)
    async def cancel():
        async with sessions() as db:
            try:
                return (await RegistrationService.cancel_user_registration(db,winner.id,winner.created_by_user_id)).status.value
            except HTTPException as exc:
                return exc.status_code
    result=await asyncio.gather(cancel(),cancel())
    assert result.count('cancelled')==1 and result.count(400)==1
    async with sessions() as fresh:
        assert (await fresh.get(RegistrationModel,waiting.id)).status==RegistrationStatusEnum.approved
        assert (await fresh.get(RegistrationModel,winner.id)).status==RegistrationStatusEnum.cancelled
        assert await fresh.scalar(select(func.count()).select_from(RegistrationModel).where(RegistrationModel.event_id==event.id,RegistrationModel.status==RegistrationStatusEnum.approved))==1


async def test_native_cancel_promotion_rollback(native,monkeypatch):
    sessions,users,event,regs=native
    for reg in regs:
        async with sessions() as db:await RegistrationService.approve_registration(db,reg.id,users[2].id)
    async with sessions() as db:
        async def fail_commit():
            await db.flush()  # Both dirty statuses reach PG inside the uncommitted transaction.
            raise RuntimeError('controlled pre-commit fault')
        monkeypatch.setattr(db,'commit',fail_commit)
        with pytest.raises(RuntimeError,match='controlled pre-commit fault'):
            await RegistrationService.cancel_user_registration(db,regs[0].id,users[0].id)
    async with sessions() as fresh:
        a=await fresh.get(RegistrationModel,regs[0].id);b=await fresh.get(RegistrationModel,regs[1].id)
        assert a.status==RegistrationStatusEnum.approved and a.cancelled_at is None
        assert b.status==RegistrationStatusEnum.waiting


async def test_native_pair_constraint(native):
    sessions,users,event,regs=native
    async with sessions() as db:
        original=await db.get(RegistrationModel,regs[0].id)
        values={c.name:getattr(original,c.name) for c in RegistrationModel.__table__.columns}
        values['id']=str(ulid.ULID());db.add(RegistrationModel(**values))
        with pytest.raises(IntegrityError):await db.commit()
        await db.rollback()
    async with sessions() as fresh:
        assert await fresh.scalar(select(func.count()).select_from(RegistrationModel).where(RegistrationModel.event_id==event.id))==2
