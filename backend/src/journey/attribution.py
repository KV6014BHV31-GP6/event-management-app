"""One read-only, all-application attribution definition for stats and closeout."""
from sqlalchemy import select

from src.journey import allocation
from src.journey.models import JourneyState
from src.users.models import UserModel


async def aggregate(db, event, registrations):
    sources = {'direct': 0, 'leader_referral': 0, 'unknown': 0}
    applications = {}
    unattributed = 0
    for registration in registrations:
        metadata = await allocation.meta(db, registration, create=False)
        kind = metadata.data.get('source_kind')
        sources[kind if isinstance(kind, str) and kind in sources else 'unknown'] += 1
        leader = metadata.data.get('attributed_leader_id')
        if isinstance(leader, str) and leader:
            applications[leader] = applications.get(leader, 0) + 1
        else:
            unattributed += 1

    assignments = (await db.scalars(select(JourneyState).where(
        JourneyState.event_id == event.id, JourneyState.kind == 'leader'))).all()
    for assignment in assignments:
        leader = assignment.data.get('leader_id')
        if isinstance(leader, str) and leader:
            # Directory rows may enumerate zero counts; never assign a record.
            applications.setdefault(leader, 0)
    users = (await db.scalars(select(UserModel).where(UserModel.id.in_(applications)))).all() if applications else []
    labels = {user.id: user.username for user in users}
    return sources, {
        'scope': 'event', 'basis': 'all_applications',
        'leaders': [{'leader_id': leader, 'leader_display_name': labels.get(leader),
                     'applications': applications[leader]} for leader in sorted(applications)],
        'unattributed_applications': unattributed,
    }


def for_viewer(payload, actor):
    """Project only the new field; a stored snapshot and legacy body stay intact."""
    if actor.role.value != 'leader' or 'leader_breakdown' not in payload:
        return payload
    breakdown = payload['leader_breakdown']
    own = next((dict(row) for row in breakdown['leaders'] if row['leader_id'] == actor.id),
               {'leader_id': actor.id, 'leader_display_name': actor.username, 'applications': 0})
    return {**payload, 'leader_breakdown': {
        'scope': 'self', 'basis': 'all_applications', 'leaders': [own],
        'unattributed_applications': None,
    }}
