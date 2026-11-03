from tests.test_demo_readiness import actors, auth, FORM, PUBLIC

async def test_v1_organizer_scope(client, actors):
    reg=(await client.post(f'/api/v1/events/{PUBLIC}/registrations',json=FORM)).json()
    other=auth(actors['other'])
    assert (await client.get('/api/v1/registrations',headers=other)).json()==[]
    assert (await client.get('/api/v1/registrations/'+reg['id'],headers=other)).status_code==403
    assert (await client.post('/api/v1/registrations/'+reg['id']+'/approve',headers=other)).status_code==403
