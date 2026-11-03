from tests.test_demo_readiness import actors, auth, FORM, PUBLIC
import pytest

@pytest.mark.parametrize('operation',['list','detail','approve'])
async def test_v1_organizer_scope(client, actors,operation):
    reg=(await client.post(f'/api/v1/events/{PUBLIC}/registrations',json=FORM)).json()
    other=auth(actors['other'])
    if operation=='list':assert (await client.get('/api/v1/registrations',headers=other)).json()==[]
    if operation=='detail':assert (await client.get('/api/v1/registrations/'+reg['id'],headers=other)).status_code==403
    if operation=='approve':assert (await client.post('/api/v1/registrations/'+reg['id']+'/approve',headers=other)).status_code==403
