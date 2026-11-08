import React from 'react';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JourneyWorkspace from './JourneyWorkspace.jsx';
import { changeLanguage, tr } from './i18n/index.js';
const response = data => ({
  ok: true,
  status: 200,
  json: async () => data
});
const scrollIntoView = vi.fn();
beforeEach(() => {
  localStorage.clear();
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  delete Element.prototype.scrollIntoView;
});
function fillApplication(form) {
  for (const [label, value] of [
    ['First name', 'Siti'], ['Last name', 'Demo'], ['Phone', '00000001'],
    ['National ID', 'SIM-0001'], ['Date of birth', '1990-01-01'],
  ]) fireEvent.change(within(form).getByLabelText(label), {target: {value}});
}
function deferApplication() {
  let finish;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_, options) => new Promise(resolve => {
    const body = JSON.parse(options.body);
    finish = () => resolve(response({
      contract_version: body.contract_version,
      operation_id: body.operation_id,
      outcome: 'applied',
      resource_id: 'reg',
      effects: {registration_id: 'reg', status: 'pending'},
    }));
  }));
  return {fetch, finish: () => finish()};
}
it('catches invalid application phone validation in the workspace without sending a POST', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(<JourneyWorkspace runtime={{}} auth={{ user: null, revision: 1 }} initialEvent="123456789012345678901" navigate={() => {}} />);
  const form = screen.getByRole('form', { name: 'Submit application' });
  for (const [label, value] of [['First name', 'Siti'], ['Last name', 'Demo'], ['Phone', '0'.repeat(21)], ['National ID', 'SIM-INVALID-PHONE']])
    fireEvent.change(within(form).getByLabelText(label), { target: { value } });
  fireEvent.change(within(form).getByLabelText('Date of birth'), { target: { value: '1990-01-01' } });
  fireEvent.submit(form);
  expect(await screen.findByRole('alert')).toHaveTextContent('Check the participant fields and their maximum lengths.');
  expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  expect(localStorage.length).toBe(0);
});
it('submits all six admitted fields and explicit Direct source through the real application form', async () => {
  const {fetch, finish} = deferApplication();
  render(<JourneyWorkspace runtime={{}} auth={{
    user: null,
    revision: 1
  }} initialEvent="123456789012345678901" navigate={() => {}} />);
  const form = screen.getByRole('form', {
    name: 'Submit application'
  });
  const user = userEvent.setup();
  fillApplication(form);
  const submit = within(form).getByRole('button', {name: 'Submit application'});
  await user.click(submit);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(submit).toBeDisabled();
  expect(scrollIntoView).not.toHaveBeenCalled();
  await user.click(submit);
  fireEvent.submit(form);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [path, options] = fetch.mock.calls[0];
  expect(path).toBe('/api/v2/operations/events/123456789012345678901/applications');
  expect(JSON.parse(options.body).data).toEqual({
    application: {
      first_name: 'Siti',
      last_name: 'Demo',
      phone: '00000001',
      national_id: 'SIM-0001',
      gender: 'male',
      date_of_birth: '1990-01-01'
    },
    source: {
      kind: 'direct',
      referral_code: null
    }
  });
  await act(async () => finish());
  expect(await screen.findByText('Saved by server. Current information has been read again.')).toBeInTheDocument();
  const receipt = screen.getByRole('region', {name: 'Application recorded — pending review'});
  expect(receipt).toHaveAccessibleDescription('Keep your application reference: reg An application does not confirm a place.');
  expect(receipt).toHaveFocus();
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({block: 'center'});
  expect(scrollIntoView.mock.contexts[0]).toBe(receipt);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('focuses a refused application result and retains entered values', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    status: 422,
    json: async () => ({detail: {code: 'INVALID_INPUT', message: 'The operation was refused. Read the current record.'}}),
  });
  render(<JourneyWorkspace runtime={{}} auth={{user: null, revision: 1}} initialEvent="123456789012345678901" navigate={() => {}} />);
  const form = screen.getByRole('form', {name: 'Submit application'});
  fillApplication(form);
  const submit = within(form).getByRole('button', {name: 'Submit application'});
  await userEvent.click(submit);
  const error = await screen.findByRole('alert');
  expect(error).toHaveTextContent('The operation was refused. Read the current record.');
  expect(error).toHaveFocus();
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({block: 'center'});
  expect(scrollIntoView.mock.contexts[0]).toBe(error);
  expect(within(form).getByLabelText('First name')).toHaveValue('Siti');
  expect(within(form).getByLabelText('National ID')).toHaveValue('SIM-0001');
  expect(submit).toBeEnabled();
  expect(screen.queryByRole('heading', {name: 'Application recorded — pending review'})).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(['actor', 'revision', 'event'])('ignores the completed application after the %s changes', async context => {
  const {fetch, finish} = deferApplication();
  const actor = {id: 'synthetic-applicant', role: 'user'};
  const event = '123456789012345678901';
  const runtime = {withVerifiedAccount: fn => fn('synthetic-token', actor)};
  const props = {runtime, auth: {user: actor, revision: 1}, initialEvent: event, navigate: () => {}};
  const view = render(<JourneyWorkspace {...props} />);
  const form = screen.getByRole('form', {name: 'Submit application'});
  fillApplication(form);
  await userEvent.click(within(form).getByRole('button', {name: 'Submit application'}));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const updated = {
    actor: {auth: {user: {...actor, id: 'other-synthetic-applicant'}, revision: 1}},
    revision: {auth: {user: actor, revision: 2}},
    event: {initialEvent: '123456789012345678902'},
  }[context];
  view.rerender(<JourneyWorkspace {...props} {...updated} />);
  const browse = screen.getByRole('button', {name: 'Browse events'});
  browse.focus();
  await act(async () => finish());
  await waitFor(() => expect(localStorage.getItem('rose.demo.synthetic.operations.synthetic-applicant')).toBe('[]'));
  expect(browse).toHaveFocus();
  expect(scrollIntoView).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', {name: 'Application recorded — pending review'})).not.toBeInTheDocument();
});
it('selects a named registration and gates review/correction to server allowed actions', async () => {
  const reg = {
    id: 'reg',
    first_name: 'Siti',
    last_name: 'Demo',
    status: 'pending',
    supporting_documents: []
  };
  const runtime = {
    withVerifiedAccount: fn => fn('token', {
      id: 'owner'
    }),
    api: {
      getOrganizerRegistrations: vi.fn(async () => [reg])
    }
  };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
    registration: reg,
    version: 3,
    review: {
      state: 'awaiting_review',
      reason: ''
    },
    booking_state: 'pending',
    offer: null,
    allowed_actions: ['reject', 'request_correction', 'cancel']
  }));
  render(<JourneyWorkspace runtime={runtime} auth={{
    user: {
      id: 'owner',
      role: 'organizer'
    },
    revision: 1
  }} navigate={() => {}} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {
    name: 'Choose a registration'
  }));
  await waitFor(() => expect(screen.getByRole('option', {
    name: 'Siti Demo · pending'
  })).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText('Participant'), 'reg');
  await user.click(screen.getByRole('button', {
    name: 'Read registration'
  }));
  const form = await screen.findByRole('form', {
    name: 'Review application'
  });
  expect(within(form).queryByRole('option', {
    name: 'approve'
  })).not.toBeInTheDocument();
  expect(within(form).getByRole('option', {
    name: 'reject'
  })).toBeInTheDocument();
  expect(screen.queryByRole('form', {
    name: 'Submit correction'
  })).not.toBeInTheDocument();
  expect(screen.getByText('No supporting documents.')).toBeInTheDocument();
});
it('clears private registration content immediately on actor change and ignores delayed read', async () => {
  let resolve;
  const later = new Promise(r => resolve = r);
  const runtime = {
    withVerifiedAccount: fn => fn('token', {
      id: 'owner'
    }),
    api: {
      getOrganizerRegistrations: vi.fn(async () => [{
        id: 'reg',
        first_name: 'Siti',
        last_name: 'Demo',
        status: 'pending'
      }])
    }
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => later);
  const view = render(<JourneyWorkspace runtime={runtime} auth={{
    user: {
      id: 'owner',
      role: 'organizer'
    },
    revision: 1
  }} navigate={() => {}} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {
    name: 'Choose a registration'
  }));
  await waitFor(() => expect(screen.getByRole('option', {
    name: 'Siti Demo · pending'
  })).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText('Participant'), 'reg');
  await user.click(screen.getByRole('button', {
    name: 'Read registration'
  }));
  view.rerender(<JourneyWorkspace runtime={runtime} auth={{
    user: {
      id: 'different',
      role: 'user'
    },
    revision: 2
  }} navigate={() => {}} />);
  resolve(response({
    registration: {
      first_name: 'SECRET',
      last_name: 'LATE'
    },
    review: {
      state: 'awaiting_review'
    },
    booking_state: 'pending',
    allowed_actions: []
  }));
  await waitFor(() => expect(screen.queryByText('SECRET LATE')).not.toBeInTheDocument());
});
it('resolves an active public referral and sends it independently of the entry operator',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(path,options)=>{if(path.includes('/referrals/'))return response({event_public_id:'123456789012345678901',active:true,leader_display_name:'Synthetic Leader'});const body=JSON.parse(options.body);return response({contract_version:body.contract_version,operation_id:body.operation_id,outcome:'applied',effects:{registration_id:'reg',status:'pending'}});});
 render(<JourneyWorkspace runtime={{}} auth={{user:null,revision:1}} initialEvent="123456789012345678901" initialRef="opaque-ref" navigate={()=>{}}/>);await screen.findByText(/Synthetic Leader/);const form=screen.getByRole('form',{name:'Submit application'});expect(within(form).getByRole('option',{name:'leader referral'})).toHaveValue('leader_referral');const user=userEvent.setup();for(const [label,value] of [['First name','Siti'],['Last name','Demo'],['Phone','00000001'],['National ID','SIM-0001']])await user.type(within(form).getByLabelText(label),value);fireEvent.change(within(form).getByLabelText('Date of birth'),{target:{value:'1990-01-01'}});await user.click(within(form).getByRole('button',{name:'Submit application'}));await screen.findByText('Application recorded — pending review');const body=JSON.parse(fetch.mock.calls.find(([,options])=>options.method==='POST')[1].body);expect(body.data.source).toEqual({kind:'leader_referral',referral_code:'opaque-ref'});expect(body.data.application).not.toHaveProperty('operator_id');expect(screen.getByText('reg')).toBeInTheDocument();
});
it('does not fall back to Guest after a failed authenticated identity',()=>{render(<JourneyWorkspace runtime={{}} auth={{user:null,hasToken:true,identityBlocked:true,revision:1}} initialEvent="123456789012345678901" navigate={()=>{}}/>);expect(within(screen.getByRole('form',{name:'Submit application'})).getByRole('button',{name:'Submit application'})).toBeDisabled();expect(screen.queryByRole('form',{name:'Request Demo OTP'})).not.toBeInTheDocument();});

const attributionEvent = '123456789012345678901';
const attributionActor = {id:'synthetic-owner',role:'organizer'};
const eventBreakdown = () => ({
  scope:'event',basis:'all_applications',
  leaders:[
    {leader_id:'synthetic-leader-a',leader_display_name:'Synthetic Leader A',applications:3},
    {leader_id:'synthetic-leader-b',leader_display_name:null,applications:1},
  ],
  unattributed_applications:2,
});
const attributionStats = (leader_breakdown=eventBreakdown()) => ({
  as_of_utc:'2026-11-03T12:00:00Z',
  counts:{applications:6,approved:2,pending:1,waiting:1,rejected:1,cancelled:1},
  quota:{online:{approved:2,capacity:10,offer_holds:0,available:8},offline:{approved:0,capacity:5,offer_holds:0,available:5}},
  attribution:{direct:1,leader_referral:4,unknown:1},
  alert:{state:'normal',threshold:0.2,observed_ratio:0.2},instruction:{text:''},
  ...(leader_breakdown===undefined?{}:{leader_breakdown}),
});
function attributionRuntime(actor=attributionActor) {
  return {withVerifiedAccount:fn=>fn('synthetic-token',actor)};
}
async function readAttribution(stats,actor=attributionActor) {
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(response(stats));
  const runtime=attributionRuntime(actor);
  const view=render(<JourneyWorkspace runtime={runtime} auth={{user:actor,revision:1}} initialEvent={attributionEvent} navigate={()=>{}}/>);
  const user=userEvent.setup();
  await user.click(screen.getByText(tr('Demand, quota and instructions')));
  await user.click(screen.getByRole('button',{name:tr('Read current statistics')}));
  await screen.findByText(`${tr('Leader instruction')}: ${tr('No instruction yet')}`);
  return {fetch,runtime,user,view};
}
it.each([
  ['en', 'correction requested', 'offer holds', 'Attribution: direct 1 · leader referral 4 · unknown 1'],
  ['ms', 'pembetulan diminta', 'tempat ditahan untuk tawaran', 'Sumber rujukan: langsung 1 · rujukan ketua 4 · tidak diketahui 1'],
])('renders the %s statistics labels with the supplied counts', async (language, correction, holds, sources) => {
  await changeLanguage(language);
  const stats = attributionStats();
  stats.counts.correction_requested = 1;
  stats.counts.offer_holds = 1;
  await readAttribution(stats);
  expect(screen.getByText(correction).parentElement).toHaveTextContent('1' + correction);
  expect(screen.getByText(holds).parentElement).toHaveTextContent('1' + holds);
  expect(screen.getByText(sources)).toBeInTheDocument();
  expect(scrollIntoView).not.toHaveBeenCalled();
});
it('leader attribution: shows owner event rows',async()=>{
  const {fetch}=await readAttribution(attributionStats());
  const table=await screen.findByRole('table',{name:'Recorded Leader attribution — this event'});
  expect(within(table).getByRole('columnheader',{name:'Leader'})).toBeInTheDocument();
  expect(within(table).getByRole('columnheader',{name:'Applications'})).toBeInTheDocument();
  expect(within(table).getByRole('row',{name:'Synthetic Leader A 3'})).toBeInTheDocument();
  expect(within(table).getByRole('row',{name:'Leader name unavailable Recorded Leader reference: synthetic-leader-b 1'})).toBeInTheDocument();
  expect(within(table).getByRole('row',{name:'Unattributed applications 2'})).toBeInTheDocument();
  expect(within(table).getByRole('row',{name:'All event applications 6'})).toBeInTheDocument();
  expect(screen.getByText('Counts include applications in every status, not confirmed places or attendance.')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].method).toBe('GET');
});

const selfBreakdown = (applications=2,label='Synthetic Leader A') => ({
  scope:'self',basis:'all_applications',
  leaders:[{leader_id:'synthetic-leader-a',leader_display_name:label,applications}],
  unattributed_applications:null,
});
const selfActor = {id:'synthetic-leader-a',role:'leader'};
const unavailable = 'Recorded Leader attribution is unavailable for this summary.';
it.each([0,2])('leader attribution: shows only the current Leader self row with %i applications',async count=>{
  const {fetch}=await readAttribution(attributionStats(selfBreakdown(count)),selfActor);
  const region=screen.getByRole('region',{name:'Recorded Leader attribution'});
  const list=within(region).getByRole('list',{name:'Your recorded attribution'});
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(list).toHaveTextContent(`Synthetic Leader A · Applications: ${count}`);
  expect(within(region).getByText('Only your recorded attribution is shown. This is not the complete event breakdown.')).toBeInTheDocument();
  expect(within(region).queryByRole('table')).not.toBeInTheDocument();
  expect(region).not.toHaveTextContent('Unattributed applications');
  expect(region).not.toHaveTextContent('synthetic-leader-b');
  expect(region).not.toHaveTextContent(unavailable);
  expect(within(region).queryByText('No applications are attributed to you in this summary.')!==null).toBe(count===0);
  expect(screen.queryByRole('button',{name:'Read closeout preview',hidden:true})).not.toBeInTheDocument();
  expect(screen.queryByRole('form',{name:'Finalize completed event',hidden:true})).not.toBeInTheDocument();
  expect(fetch.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});

it.each([
  ['event-wide response',()=>eventBreakdown()],
  ['foreign self row',()=>({...selfBreakdown(),leaders:[{leader_id:'FOREIGN-LEADER-ID',leader_display_name:'FOREIGN LEADER NAME',applications:934}]})],
  ['extra foreign self row',()=>({...selfBreakdown(),leaders:[...selfBreakdown().leaders,{leader_id:'FOREIGN-LEADER-ID',leader_display_name:'FOREIGN LEADER NAME',applications:934}]})],
  ['missing self row',()=>({...selfBreakdown(),leaders:[]})],
  ['event unattributed count',()=>({...selfBreakdown(),unattributed_applications:934})],
])('leader attribution: hides %s from a Leader',async(_name,make)=>{
  await readAttribution(attributionStats(make()),selfActor);
  const region=screen.getByRole('region',{name:'Recorded Leader attribution'});
  expect(within(region).getByText(unavailable)).toBeInTheDocument();
  expect(region).not.toHaveTextContent(/FOREIGN|934|synthetic-leader-b|Synthetic Leader A/);
  expect(within(region).queryByRole('list')).not.toBeInTheDocument();
  expect(within(region).queryByRole('table')).not.toBeInTheDocument();
});

it('leader attribution: keeps legacy self data unavailable rather than inventing zero',async()=>{
  const stats=attributionStats();delete stats.leader_breakdown;
  await readAttribution(stats,selfActor);
  const region=screen.getByRole('region',{name:'Recorded Leader attribution'});
  expect(within(region).getByText(unavailable)).toBeInTheDocument();
  expect(within(region).queryByRole('list')).not.toBeInTheDocument();
  expect(region).not.toHaveTextContent('No applications are attributed to you in this summary.');
});

it.each([
  ['legacy absent',()=>undefined],
  ['null',()=>null],
  ['wrong basis',()=>({...eventBreakdown(),basis:'confirmed_bookings'})],
  ['wrong scope',()=>({...eventBreakdown(),scope:'self'})],
  ['non-array rows',()=>({...eventBreakdown(),leaders:{PRIVATE:'RAW PAYLOAD'}})],
  ['duplicate ID',()=>({...eventBreakdown(),leaders:[eventBreakdown().leaders[0],eventBreakdown().leaders[0]]})],
  ['negative count',()=>({...eventBreakdown(),unattributed_applications:-1})],
  ['fractional count',()=>({...eventBreakdown(),leaders:[{...eventBreakdown().leaders[0],applications:1.5}]})],
  ['unsafe count',()=>({...eventBreakdown(),unattributed_applications:Number.MAX_SAFE_INTEGER+1})],
  ['unsafe sum',()=>({...eventBreakdown(),leaders:[{...eventBreakdown().leaders[0],applications:Number.MAX_SAFE_INTEGER}],unattributed_applications:2})],
  ['null event bucket',()=>({...eventBreakdown(),unattributed_applications:null})],
  ['wrong total',()=>({...eventBreakdown(),unattributed_applications:3})],
  ['empty ID',()=>({...eventBreakdown(),leaders:[{leader_id:' ',leader_display_name:'PRIVATE NAME',applications:4}]})],
  ['object label',()=>({...eventBreakdown(),leaders:[{leader_id:'PRIVATE-ID',leader_display_name:{secret:'RAW PAYLOAD'},applications:4}]})],
])('leader attribution: marks %s unavailable without raw rows',async(_name,make)=>{
  const stats=attributionStats();const breakdown=make();
  if(breakdown===undefined)delete stats.leader_breakdown;else stats.leader_breakdown=breakdown;
  await readAttribution(stats);
  const region=screen.getByRole('region',{name:'Recorded Leader attribution'});
  expect(within(region).getByText(unavailable)).toBeInTheDocument();
  expect(within(region).queryByRole('table')).not.toBeInTheDocument();
  expect(region).not.toHaveTextContent(/PRIVATE|RAW PAYLOAD|Synthetic Leader A|synthetic-leader-b/);
  expect(region).not.toHaveTextContent('No applications are recorded for this event.');
});

it.each([
  ['empty event',[],0,0,true],
  ['zero assignment',[{leader_id:'synthetic-zero',leader_display_name:'Synthetic Zero',applications:0}],0,0,true],
  ['unattributed event',[],3,3,false],
])('leader attribution: distinguishes %s from unavailable',async(_name,leaders,bucket,total,empty)=>{
  const stats=attributionStats({scope:'event',basis:'all_applications',leaders,unattributed_applications:bucket});
  stats.counts.applications=total;
  await readAttribution(stats);
  const region=screen.getByRole('region',{name:'Recorded Leader attribution'});
  const table=within(region).getByRole('table');
  expect(within(table).getByRole('row',{name:`Unattributed applications ${bucket}`})).toBeInTheDocument();
  expect(within(table).getByRole('row',{name:`All event applications ${total}`})).toBeInTheDocument();
  expect(within(region).queryByText('No applications are recorded for this event.')!==null).toBe(empty);
  expect(region).not.toHaveTextContent(unavailable);
  if(leaders.length)expect(within(table).getByRole('row',{name:'Synthetic Zero 0'})).toBeInTheDocument();
});

it('leader attribution: escapes supplied labels and keeps a long missing-name reference as text',async()=>{
  const markup='<img src=x onerror="globalThis.attributionScriptRan=true">';
  const longId='synthetic-recorded-reference-'.repeat(8);
  const breakdown=eventBreakdown();breakdown.leaders[0].leader_display_name=markup;
  breakdown.leaders[1]={leader_id:longId,leader_display_name:'  ',applications:1};
  await readAttribution(attributionStats(breakdown));
  const region=screen.getByRole('region',{name:'Recorded Leader attribution'});
  expect(within(region).getByText(markup)).toBeInTheDocument();
  expect(within(region).getByText(`Recorded Leader reference: ${longId}`)).toBeInTheDocument();
  expect(region.querySelector('img,script')).toBeNull();
  expect(globalThis.attributionScriptRan).toBeUndefined();
  expect(region).toHaveClass('journey-facts');
});

const attributionCurrentEvent = () => ({
  event:{public_id:attributionEvent,title:'Synthetic attribution event',overview:'Synthetic only',location:'Synthetic venue',
    start_time:'2026-11-03T08:00:00Z',end_time:'2026-11-03T10:00:00Z',online_quota:10,offline_quota:5,image_files:[]},
  workflow:{state:'completed',version:4,timezone:'Asia/Kuala_Lumpur',registration_opens_at:'2026-11-01T08:00:00Z',registration_closes_at:'2026-11-02T10:00:00Z'},
});
it.each(['preview','finalized','legacy'])('leader attribution: renders Owner %s closeout without recomputing history',async state=>{
  const stats=attributionStats();
  const closeout={version:4,state:state==='legacy'?'finalized':state,as_of_utc:'2026-11-03T10:01:00Z',
    totals:{applications:6,bookings:2,arrivals:1,no_show:1},attribution:stats.attribution,
    pending_attendance_count:0,active_offer_count:0,blockers:[],...(state==='legacy'?{}:{leader_breakdown:eventBreakdown()})};
  const original=JSON.stringify(closeout);
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async path=>response(path.endsWith('/closeout')?closeout:attributionCurrentEvent()));
  render(<JourneyWorkspace runtime={attributionRuntime()} auth={{user:attributionActor,revision:1}} initialEvent={attributionEvent} navigate={()=>{}}/>);
  const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Read current event'}));
  await screen.findByRole('heading',{name:'Synthetic attribution event'});
  await user.click(screen.getByText('Attendance and closeout'));
  await user.click(screen.getByRole('button',{name:'Read closeout preview'}));
  const region=await screen.findByRole('region',{name:'Recorded Leader attribution'});
  if(state==='legacy'){
    expect(within(region).getByText(unavailable)).toBeInTheDocument();
    expect(within(region).queryByRole('table')).not.toBeInTheDocument();
  }else expect(within(region).getByRole('row',{name:'Synthetic Leader A 3'})).toBeInTheDocument();
  expect(screen.getByText(`As of: 2026-11-03T10:01:00Z · ${closeout.state}`)).toBeInTheDocument();
  const totals=region.parentElement.querySelector('.journey-metrics');
  expect(totals).toHaveTextContent('6applications2bookings1arrivals1no-shows');
  expect(JSON.stringify(closeout)).toBe(original);
  expect(fetch.mock.calls.map(([path])=>path)).toEqual([
    `/api/v2/operations/events/${attributionEvent}`,`/api/v2/operations/events/${attributionEvent}/closeout`,
  ]);
  expect(fetch.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});

it.each(['actor','revision','event'])('leader attribution: clears loaded rows and rejects delayed stats after %s change',async change=>{
  const {fetch,view,runtime,user}=await readAttribution(attributionStats());
  expect(screen.getByText('Synthetic Leader A')).toBeInTheDocument();
  let resolve;const later=new Promise(r=>resolve=r);const json=vi.fn(async()=>attributionStats());
  fetch.mockReturnValueOnce(later);
  await user.click(screen.getByRole('button',{name:'Read current statistics'}));
  const actor=change==='actor'?selfActor:attributionActor;
  view.rerender(<JourneyWorkspace runtime={change==='actor'?attributionRuntime(actor):runtime}
    auth={{user:actor,revision:change==='event'?1:2}}
    initialEvent={change==='event'?'123456789012345678902':attributionEvent} navigate={()=>{}}/>);
  expect(screen.queryByText('Synthetic Leader A')).not.toBeInTheDocument();
  resolve({ok:true,status:200,json});
  await waitFor(()=>expect(json).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('Synthetic Leader A')).not.toBeInTheDocument();
  expect(screen.queryByRole('region',{name:'Recorded Leader attribution',hidden:true})).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([
  ['en','Recorded Leader attribution — this event','Recorded Leader attribution is unavailable for this summary.','No applications are recorded for this event.','Your recorded attribution','No applications are attributed to you in this summary.','Leader name unavailable'],
  ['ms','Atribusi ketua yang direkodkan — acara ini','Atribusi ketua yang direkodkan tidak tersedia untuk ringkasan ini.','Tiada permohonan direkodkan untuk acara ini.','Atribusi anda yang direkodkan','Tiada permohonan diatribusi kepada anda dalam ringkasan ini.','Nama ketua tidak tersedia'],
])('leader attribution: renders scoped, unavailable and zero copy in %s',async(language,caption,missing,empty,listName,zero,fallback)=>{
  await changeLanguage(language);
  const {fetch,view,user}=await readAttribution(attributionStats());
  expect(screen.getByRole('table',{name:caption})).toBeInTheDocument();
  expect(screen.getByText(fallback)).toBeInTheDocument();
  const legacy=attributionStats();delete legacy.leader_breakdown;fetch.mockResolvedValue(response(legacy));
  await user.click(screen.getByRole('button',{name:tr('Read current statistics')}));
  expect(await screen.findByText(missing)).toBeInTheDocument();
  const noApplications=attributionStats({scope:'event',basis:'all_applications',leaders:[],unattributed_applications:0});noApplications.counts.applications=0;
  fetch.mockResolvedValue(response(noApplications));
  await user.click(screen.getByRole('button',{name:tr('Read current statistics')}));
  expect(await screen.findByText(empty)).toBeInTheDocument();
  view.unmount();
  await readAttribution(attributionStats(selfBreakdown(0,null)),selfActor);
  expect(screen.getByRole('list',{name:listName})).toHaveTextContent('0');
  expect(screen.getByText(zero)).toBeInTheDocument();
  expect(screen.getByRole('list',{name:listName})).toHaveTextContent(fallback);
},20000);
