import {downloadApprovedFlyer} from "./flyer.js";
import AttendanceWorkspace from "./AttendanceWorkspace.jsx";
import {createAttendanceStore} from "./offline/attendance.js";
import React, { useMemo, useState, useRef, useCallback, useEffect, useId } from 'react';
import { tr,locale } from './i18n/index.js';
import { createJourneyClient } from './journey-api.js';
import { minimumRegistrationPayload } from './minimum-registration.js';
import { FilePicker, PrivateDocuments } from './FilePicker.jsx';
const utc = value => value ? new Date(value).toISOString() : value;
const localInput=value=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const field = (name, label, type = 'text', extra = {}) => ({
  name,
  label,
  type,
  ...extra
});
function Fields({
  fields
}) {
  return fields.map(f => <label key={f.name}>{tr(f.label)}{f.type === 'textarea' ? <textarea name={f.name} required={f.required !== false} defaultValue={f.value || ''} /> : f.options ? <select name={f.name} defaultValue={f.value || f.options[0]}>{f.options.map(v => <option key={v} value={v}>{tr(v)}</option>)}</select> : <input name={f.name} type={f.type} required={f.required !== false} defaultValue={f.value ?? ''} min={f.min} max={f.max} autoComplete={f.type === 'password' ? 'new-password' : 'off'} />}</label>);
}
function ActionForm({
  title,
  fields = [],
  submit,
  busy,
  button = title,
  children
}) {
  return <form aria-label={tr(title)} className="journey-form" onSubmit={e => {
    e.preventDefault();
    submit(Object.fromEntries(new FormData(e.currentTarget)), e.currentTarget);
  }}><h3>{tr(title)}</h3><Fields fields={fields} />{children}<button className="button button-small" disabled={busy}>{tr(button)}</button></form>;
}
const applicationFields = [field('first_name', 'First name'), field('last_name', 'Last name'), field('gender', 'Gender', 'text', {
  options: ['male', 'female']
}), field('date_of_birth', 'Date of birth', 'date'), field('phone', 'Phone'), field('national_id', 'National ID')];
const appCopy = v => minimumRegistrationPayload(v);
export default function JourneyWorkspace(props) {
  return <JourneySession key={`${props.auth.user?.id || props.auth.offlineActor?.id || 'guest'}:${props.auth.revision}:${props.initialEvent}`} {...props} />;
}
function JourneySession({
  runtime,
  auth,
  initialEvent = '',
  initialRef = '',
  initialPublicEvent = null,
  navigate
}) {
  const [eventId, setEventId] = useState(initialEvent),
    [loaded, setLoaded] = useState({publicEvent:initialPublicEvent}),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [registrationId, setRegistrationId] = useState(''),
    [attendanceBlocked,setAttendanceBlocked]=useState(true);
  const [grant, setGrant] = useState(null),
    [challenge, setChallenge] = useState(null),
    [demoCode, setDemoCode] = useState(''),
    [files, setFiles] = useState([]),
    [filesBlocked, setFilesBlocked] = useState(false),
    [applicationFiles, setApplicationFiles] = useState([]),
    [correctionFiles, setCorrectionFiles] = useState([]),
    [attachmentBlocked, setAttachmentBlocked] = useState(false),[editFiles,setEditFiles]=useState([]),[editBlocked,setEditBlocked]=useState(false);
  const [applicationAttention, setApplicationAttention] = useState(null);
  const receiptRef = useRef(null);
  const errorRef = useRef(null);
  const receiptId = useId();
  const lock = useRef(false),
    active = useRef(true),
    recordEpoch = useRef(0),
    actorId = auth.user?.id || auth.offlineActor?.id || 'guest';
  useEffect(() => () => {
    active.current = false;
  }, []);
  useEffect(() => {
    if (!active.current || applicationAttention?.epoch !== recordEpoch.current) return;
    const target = applicationAttention.result === 'receipt' ? receiptRef.current : errorRef.current;
    target?.focus({preventScroll: true});
    target?.scrollIntoView?.({block: 'center'});
  }, [applicationAttention]);
  const guestAllowed=!auth.user&&!auth.hasToken&&!auth.identityBlocked&&!auth.checking;
  const client = useMemo(() => createJourneyClient({
    authorize: fn => (auth.user||auth.offlineActor) ? runtime.withVerifiedAccount((token,actor)=>{if(actor?.id!==(auth.user?.id||auth.offlineActor?.id))throw new Error('The selected account or record changed.');return fn(token,actor);}) : guestAllowed ? fn(null, {id:'guest'}) : Promise.reject(new Error('Verify your account or explicitly log out before Guest access.')),
    guestHeaders: () => grant ? {
      'X-Guest-Grant': grant.grant_token
    } : {}
  }), [runtime, auth.user?.id, auth.offlineActor?.id, auth.revision, guestAllowed, grant]);
  const staffActor=auth.user||auth.offlineActor;
  const owner = staffActor?.role === 'organizer',
    staff = owner || staffActor?.role === 'leader';
  const root = `/events/${eventId}`;
  const eventVersion = loaded.event?.workflow?.version;
  useEffect(()=>{if(staff||!eventId||!runtime.api?.getEvent)return;let current=true;runtime.api.getEvent(eventId).then(value=>{if(current&&active.current)setLoaded(old=>({...old,publicEvent:value}));}).catch(e=>{if(current&&active.current)setError(e.message);});return()=>{current=false;};},[runtime,staff,eventId]);
  useEffect(()=>{if(!initialRef)return;let current=true;client.publicGet('/referrals/'+encodeURIComponent(initialRef)).then(value=>{if(current&&active.current){if(!value.active||value.event_public_id!==eventId)throw new Error('This referral is inactive or does not match this event.');setLoaded(old=>({...old,referral:value}));}}).catch(e=>{if(current&&active.current)setError(e.message);});return()=>{current=false;};},[client,initialRef,eventId]);
  const run = async (fn, {focusApplicationResult = false} = {}) => {
    const operationEpoch=recordEpoch.current;
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    let result = 'receipt';
    try {
      await fn();
    } catch (e) {
      result = 'error';
      if (active.current && operationEpoch===recordEpoch.current) setError(e.message);
    } finally {
      lock.current = false;
      if (active.current) {
        setBusy(false);
        if (focusApplicationResult && operationEpoch === recordEpoch.current) {
          setApplicationAttention({result, epoch: operationEpoch});
        }
      }
    }
  };
  const read = async (key, path, epoch = recordEpoch.current) => {
    if(!active.current||epoch!==recordEpoch.current)throw new Error("The selected account or record changed.");
    const data = await client.get(path);
    if (!active.current || epoch !== recordEpoch.current) throw new Error('The selected account or record changed.');
    setLoaded(old => ({
      ...old,
      [key]: data
    }));
    return data;
  };
  const mutate = (path, data, version) => {
    const isApplication = path.endsWith('/applications');
    return run(async () => {
      const mutationEpoch=recordEpoch.current;
      const targetRegistration=registrationId;
      const payload = typeof data === 'function' ? data() : data;
      const receipt = await client.mutate(path, payload, version);
      if (!active.current || mutationEpoch!==recordEpoch.current) return;
      if (isApplication) {
        setRegistrationId(receipt.effects.registration_id);
        setLoaded(old => ({...old, applicationReceipt: receipt.effects}));
      }
      setMessage(tr('Saved by server. Current information has been read again.'));
      if (eventId && staff) await read('event', root, mutationEpoch);
      if (path.includes('/promotion')) await read('promotion', root + '/promotion', mutationEpoch);
      if (path.startsWith('/registrations/') || path.startsWith('/offers/')) await read('registration', '/registrations/' + targetRegistration, mutationEpoch);
      if (path.startsWith('/accounts')) await read('accounts', '/accounts', mutationEpoch);
    }, {focusApplicationResult: isApplication});
  };
  const loadEvent = () => run(async () => {
    setLoaded(old=>({referral:old.referral,eventOptions:old.eventOptions}));
    await read('event', root);
  });
  const refreshRegistration = () => run(() => read('registration', `/registrations/${registrationId}`));
  const registration = loaded.registration;
  const current = loaded.event;
  const promotionRaw = loaded.promotion;
  const ownAssignment=loaded.leaders?.leaders.find(row=>row.leader_id===auth.user?.id&&row.active);
  const publicLink=auth.user?.role==='leader'?ownAssignment?.public_url:promotionRaw?.public_url;
  let absolutePublicLink='';try{if(publicLink){const u=new URL(publicLink,location.origin);absolutePublicLink=new URL(u.pathname+u.search+u.hash,location.origin).href;}}catch{}
  const promotion=promotionRaw?{...promotionRaw,public_url:absolutePublicLink}:null;
  const onFiles = useCallback(v => setFiles(v), []),
    onBlocked = useCallback(v => setFilesBlocked(v), []);
  const editFilesChanged=useCallback(setEditFiles,[]),editBlockedChanged=useCallback(setEditBlocked,[]);
  const applicationChanged = useCallback(setApplicationFiles, []),
    correctionChanged = useCallback(setCorrectionFiles, []),
    attachmentChanged = useCallback(setAttachmentBlocked, []);
  const pending = (() => {
    try {
      return client.pending(actorId);
    } catch {
      return [];
    }
  })();
  return <div className="journey-workspace"><div className="page-heading"><div><p className="eyebrow">ROSE · PULSE</p><h1>{tr(staff?'Event operations':'Apply and manage booking')}</h1><p>{tr('Synthetic local journey. The server confirms permissions, places and every final result.')}</p></div><button className="button button-quiet" onClick={() => navigate('events')}>{tr('Browse events')}</button></div>
 <div aria-live="polite">
   {message && <p className="notice">{message}</p>}
   {loaded.applicationReceipt && <section className="notice" ref={receiptRef} tabIndex={-1}
     aria-labelledby={receiptId + '-title'} aria-describedby={receiptId + '-reference ' + receiptId + '-scope'}>
     <h2 id={receiptId + '-title'}>{tr('Application recorded — pending review')}</h2>
     <p id={receiptId + '-reference'}>{tr('Keep your application reference')}: <strong>{loaded.applicationReceipt.registration_id}</strong></p>
     <p id={receiptId + '-scope'}>{tr('An application does not confirm a place.')}</p>
   </section>}
   {error && <p className="notice notice-error" role="alert" ref={errorRef} tabIndex={-1}>{tr(error)}</p>}
 </div>
 {!!pending.length && <section className="notice"><h2>{tr('Unknown operations — reconcile before another send')}</h2>{pending.map(row => <div key={row.body.operation_id}><p>{row.path} · {row.body.operation_id}</p><button disabled={busy} className="button button-small" onClick={() => run(async () => {
          const recovered=await client.reconcile(row.body.operation_id);if(recovered.effects?.registration_id){setRegistrationId(recovered.effects.registration_id);setLoaded(old=>({...old,applicationReceipt:recovered.effects}));}
          setMessage(tr('Original receipt recovered. Read the current resource.'));
        })}>{tr('Reconcile')}</button>{row.missing_receipts>=2&&!row.sensitive&&!row.immutable_conflict&&<button className="button button-quiet button-small" disabled={busy} onClick={()=>run(async()=>{const recovered=await client.replayExact(row.body.operation_id);if(recovered.effects?.registration_id){setRegistrationId(recovered.effects.registration_id);setLoaded(old=>({...old,applicationReceipt:recovered.effects}));}setMessage(tr('Original immutable action recovered. Read the current record.'));})}>{tr('Retry exact saved action')}</button>}</div>)}</section>}
 <section className="journey-section"><h2>{tr('Selected event')}</h2>{!staff&&loaded.publicEvent&&<PublicEventContext event={loaded.publicEvent}/>} {(staff||!eventId)&&<><button className="button button-quiet" disabled={busy} onClick={() => run(async () => {
        const data = owner ? await runtime.withVerifiedAccount((token, actor) => runtime.api.getOrganizerEvents(token, {
          page: 1,
          pageSize: 24
        }, actor)) : await runtime.api.getEvents({
          page: 1,
          pageSize: 24
        });
        if (active.current) setLoaded(old => ({
          ...old,
          eventOptions: data.data
        }));
      })}>{tr('Choose an event')}</button><label>{tr('Event')}<select value={eventId} disabled={busy} onChange={e => {
          recordEpoch.current++;
          navigate('operations',{event:e.target.value});
          setEventId(e.target.value);
          setApplicationFiles([]);setCorrectionFiles([]);
          setLoaded(old => ({
            eventOptions: old.eventOptions
          }));
          setGrant(null);
          setChallenge(null);
          setDemoCode('');
        }}><option value="">{tr('Select event')}</option>{eventId && !loaded.eventOptions?.some(e => e.public_id === eventId) && <option value={eventId}>{current?.event.title || loaded.publicEvent?.title || tr('Selected event')}</option>}{loaded.eventOptions?.map(e => <option value={e.public_id} key={e.public_id}>{e.title}</option>)}</select></label></>}{staff && <button className="button" disabled={busy || !eventId} onClick={loadEvent}>{tr('Read current event')}</button>}{current && <><h3>{current.event.title}</h3><p>{tr('Workflow')}: {tr(current.workflow.state)}</p><p>{current.event.location} · {current.event.start_time}</p><button className="text-button" onClick={() => navigate('event', {
          event: eventId
        })}>{tr('View public event')}</button></>}</section>
 {owner && <details className="journey-section"><summary>{tr('Create managed event')}</summary><ActionForm title="Create draft" busy={busy || filesBlocked} fields={[field('title', 'Event title'), field('overview', 'Overview', 'textarea'), field('location', 'Location'), field('start_time', 'Start', 'datetime-local'), field('end_time', 'End', 'datetime-local'), field('online_quota', 'Online quota', 'number', {
        value: 10,
        min: 0
      }), field('offline_quota', 'Offline quota', 'number', {
        value: 5,
        min: 0
      }), field('timezone', 'Timezone', 'text', {
        value: 'Asia/Kuala_Lumpur'
      }), field('registration_opens_at', 'Registration opens', 'datetime-local'), field('registration_closes_at', 'Registration closes', 'datetime-local'), field('checkin_opens_at', 'Check-in opens', 'datetime-local'), field('checkin_closes_at', 'Check-in closes', 'datetime-local')]} submit={v => run(async () => {
        const receipt = await client.mutate('/events', {
          event: {
            title: v.title,
            overview: v.overview,
            location: v.location,
            start_time: utc(v.start_time),
            end_time: utc(v.end_time),
            online_quota: +v.online_quota,
            offline_quota: +v.offline_quota,
            image_file_ids: files.map(f => f.id)
          },
          timezone: v.timezone,
          registration_opens_at: utc(v.registration_opens_at),
          registration_closes_at: utc(v.registration_closes_at),
          policy: {
            allocation_mode: 'separate_pools_offer',
            offer_minutes: 30,
            walkin_pool: 'offline',
            checkin_opens_at: utc(v.checkin_opens_at),
            checkin_closes_at: utc(v.checkin_closes_at),
            reminder_hours: 24,
            low_demand_ratio: .5
          }
        });
        setEventId(receipt.resource_id);
        setLoaded({});
        setMessage(`${tr('Draft created')}: ${receipt.resource_id}`);
      })}><FilePicker runtime={runtime} purpose="event_image" onChange={onFiles} onBlocked={onBlocked} /></ActionForm></details>}
 {owner && current && <details className="journey-section"><summary>{tr('Workflow and event changes')}</summary><ActionForm key={current.workflow.version} title="Edit event" busy={busy||editBlocked} fields={[field('title', 'Event title', 'text', {
        value: current.event.title
      }), field('overview', 'Overview', 'textarea', {
        value: current.event.overview
      }), field('location', 'Location', 'text', {
        value: current.event.location
      }), field('start_time','Start','datetime-local',{value:localInput(current.event.start_time)}),field('end_time','End','datetime-local',{value:localInput(current.event.end_time)}),field('registration_opens_at','Registration opens','datetime-local',{value:localInput(current.workflow.registration_opens_at)}),field('registration_closes_at','Registration closes','datetime-local',{value:localInput(current.workflow.registration_closes_at)}),field('timezone','Timezone','text',{value:current.workflow.timezone}),field('online_quota', 'Online quota', 'number', {
        value: current.event.online_quota,
        min: 0
      }), field('offline_quota', 'Offline quota', 'number', {
        value: current.event.offline_quota,
        min: 0
      })]} submit={v => mutate(root + '/edit', {
        event: {title:v.title,overview:v.overview,location:v.location,start_time:utc(v.start_time),end_time:utc(v.end_time),online_quota:+v.online_quota,offline_quota:+v.offline_quota,image_file_ids:editFiles.map(f=>f.id)},timezone:v.timezone,registration_opens_at:utc(v.registration_opens_at),registration_closes_at:utc(v.registration_closes_at)
      }, eventVersion)}><FilePicker key={current.workflow.version} runtime={runtime} purpose="event_image" initialFiles={current.event.image_files||[]} onChange={editFilesChanged} onBlocked={editBlockedChanged}/></ActionForm><div className="form-actions"><button className="button" disabled={busy || current.workflow.state !== 'draft'} onClick={() => mutate(root + '/publish', {}, eventVersion)}>{tr('Publish')}</button><button className="button button-quiet" disabled={busy || current.workflow.state !== 'postponed'} onClick={() => mutate(root + '/resume', {
          notice: 'Synthetic event resumed.'
        }, eventVersion)}>{tr('Resume event')}</button></div><ActionForm title="Postpone event" busy={busy} fields={[field('start_time', 'New start', 'datetime-local'), field('end_time', 'New end', 'datetime-local'), field('registration_closes_at', 'Registration closes', 'datetime-local'), field('checkin_opens_at', 'Check-in opens', 'datetime-local'), field('checkin_closes_at', 'Check-in closes', 'datetime-local'), field('notice', 'Change notice', 'textarea')]} submit={v => mutate(root + '/postpone', Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'notice' ? x : utc(x)])), eventVersion)} /><ActionForm title="Cancel event" busy={busy} fields={[field('reason', 'Cancellation reason', 'textarea')]} submit={v => mutate(root + '/cancel', v, eventVersion)} /></details>}
 {staff && eventId && <details className="journey-section"><summary>{tr('Leader assignments and referral')}</summary><button className="button button-quiet" disabled={busy} onClick={() => run(() => read('leaders', root + '/leaders'))}>{tr('Read assignments')}</button>{loaded.leaders?.leaders.map(leader => <article key={leader.leader_id}><p>{tr('Reserved quota')}: {leader.reserved_quota} · {tr(leader.active ? 'Active' : 'Inactive')}</p>{leader.public_url && <a href={leader.public_url}>{tr('Public referral link')}</a>}</article>)}{owner && current && <ActionForm title="Assign leader" busy={busy} fields={[field('reserved_quota', 'Reserved quota', 'number', {
        min: 0
      })]} submit={v => mutate(root + '/leaders', {
        leader_id: v.leader_id,
        reserved_quota: +v.reserved_quota,
        active: true
      }, eventVersion)}><button type="button" className="text-button" disabled={busy} onClick={() => run(() => read('accounts', '/accounts?scope=assignable_leaders'))}>{tr('Load leader accounts')}</button><label>{tr('Leader')}<select name="leader_id" required>{loaded.accounts?.accounts.filter(a => a.role === 'leader' && a.enabled).map(a => <option key={a.id} value={a.id}>{a.username}</option>)}</select></label></ActionForm>} {owner && loaded.leaders?.leaders.map(leader => <div key={leader.leader_id}><p>{loaded.accounts?.accounts.find(a => a.id === leader.leader_id)?.username || tr('Assigned leader')} · {tr('Reserved quota')}: {leader.reserved_quota}</p><button className="button button-quiet" disabled={busy} onClick={() => mutate(root + '/leaders/' + leader.leader_id, {
          active: !leader.active
        }, leader.version)}>{tr(leader.active ? 'Revoke assignment' : 'Activate assignment')}</button></div>)}</details>}
 {staff && eventId && <details className="journey-section"><summary>{tr('Promotion and outreach')}</summary><button className="button button-quiet" disabled={busy} onClick={() => run(async()=>{await read('promotion',root+'/promotion');if(auth.user?.role==='leader')await read('leaders',root+'/leaders');})}>{tr('Read promotion')}</button><p>{tr('DEMO_TEMPLATE — editable text requires Organizer approval. WhatsApp sharing is manual.')}</p><ActionForm key={promotion?.version} title="Save promotion draft" busy={busy} fields={[field('text', 'Promotion text', 'textarea', {
        value: promotion?.text || ''
      })]} submit={v => mutate(root + '/promotion', v, promotion?.version ?? 0)} />{promotion && <><p>{tr('Status')}: {promotion.state} · {tr(promotion.paused?'Promotion paused':'Promotion active')}</p>{owner&&<button className="button button-quiet" disabled={busy} onClick={()=>mutate(root+'/promotion/pause',{paused:!promotion.paused},promotion.version)}>{tr(promotion.paused?'Resume promotion':'Pause promotion')}</button>}{owner && <button className="button" disabled={busy || promotion.state === 'approved'} onClick={() => mutate(root + '/promotion/approve', {}, promotion.version)}>{tr('Approve exact promotion text')}</button>}{promotion.state === 'approved' && !promotion.paused && !!promotion.public_url && <article className="approved-flyer"><p>{tr('Localhost demo links work only on this computer. No external delivery is claimed.')}</p><h2>{promotion.flyer_data?.title}</h2><p>{promotion.approved_text}</p><p>{promotion.flyer_data?.location} · {promotion.flyer_data?.start_time}</p><a href={promotion.public_url}>{tr('Public event link')}</a><div className="form-actions"><button className="button" onClick={()=>run(async()=>downloadApprovedFlyer(promotion))}>{tr('Download flyer')}</button><button className="button button-quiet" onClick={() => window.print()}>{tr('Print flyer')}</button><a className="button" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(promotion.approved_text + '\n' + promotion.public_url)}`}>{tr('Share on WhatsApp')}</a><button className="text-button" onClick={() => run(async () => {
              await navigator.clipboard.writeText(promotion.approved_text + '\n' + promotion.public_url);
              setMessage(tr('Approved text copied.'));
            })}>{tr('Copy approved text')}</button></div></article>}</>}{auth.user?.role === 'leader' && <ActionForm title="Report outreach" busy={busy} fields={[field('channel', 'Channel', 'text', {
        options: ['flyer', 'whatsapp_manual', 'community_visit']
      }), field('reported_at', 'Reported at', 'datetime-local'), field('quantity', 'Self-reported quantity', 'number', {
        min: 0
      }), field('notes', 'Notes', 'textarea')]} submit={v => mutate(root + '/outreach', {
        ...v,
        reported_at: utc(v.reported_at),
        quantity: +v.quantity
      })} />}<button className="button button-quiet" disabled={busy} onClick={() => run(() => read('outreach', root + '/outreach'))}>{tr('Read outreach reports')}</button>{loaded.outreach?.reports.map(report => <article className="journey-message" key={report.id}><p>{tr(report.channel)} · {report.quantity} · {report.reported_at}</p><p>{report.notes}</p></article>)}</details>}
 {staff && eventId && <details className="journey-section"><summary>{tr('Demand, quota and instructions')}</summary><button className="button button-quiet" disabled={busy} onClick={() => run(() => read('stats', root + '/stats'))}>{tr('Read current statistics')}</button>{loaded.stats && <Statistics data={loaded.stats} actor={staffActor} />} {owner && current && <><ActionForm title="Save leader instruction" busy={busy} fields={[field('text', 'Instruction', 'textarea', {
          value: loaded.stats?.instruction?.text
        })]} submit={v => mutate(root + '/instruction', v, eventVersion)} /><button className="button button-quiet" disabled={busy} onClick={() => mutate(root + '/alerts', {}, eventVersion)}>{tr('Process demand alerts')}</button></>}</details>}
 <details className="journey-section" open={!staff}><summary>{tr('Application and source')}</summary>{guestAllowed&&<p className="notice">{tr('Guest application — no account will be created.')} <button className="text-button" onClick={()=>navigate('login',{event:eventId})}>{tr('Log in')}</button></p>}<p>{tr('Pending applications do not confirm a place. Supporting documents are optional and require an authenticated connection.')}</p><ActionForm title="Submit application" busy={busy || !eventId || attachmentBlocked || (!!initialRef&&!loaded.referral) || (!auth.user&&!auth.offlineActor&&!guestAllowed) || (!staff&&!!runtime.api?.getEvent&&!loaded.publicEvent)} fields={[...applicationFields, field('source_kind', 'Source', 'text', {options:initialRef?['leader_referral']:['direct','unknown']})]} submit={v => mutate(root + '/applications', () => ({
        application: {
          ...appCopy(v),
          ...(applicationFiles.length ? {
            file_ids: applicationFiles.map(f => f.id)
          } : {})
        },
        source: {kind:initialRef?'leader_referral':v.source_kind,referral_code:initialRef||null}
      }))}>{loaded.referral&&<p>{tr('Referred by')}: {loaded.referral.leader_display_name}</p>}{auth.user && <FilePicker runtime={runtime} key={eventId+":"+registrationId} purpose="supporting_document" onChange={applicationChanged} onBlocked={attachmentChanged} />}</ActionForm></details>
 <details className="journey-section"><summary>{tr('Registration review and booking')}</summary>{auth.user ? <><button className="button button-quiet" disabled={busy} onClick={() => run(async () => {
          const data = await runtime.withVerifiedAccount(token => owner ? runtime.api.getOrganizerRegistrations(token) : runtime.api.getMyRegistrations(token));
          if (active.current) setLoaded(old => ({
            ...old,
            registrationOptions: data
          }));
        })}>{tr('Choose a registration')}</button><label>{tr('Participant')}<select value={registrationId} disabled={busy} onChange={e => {
            recordEpoch.current++;
            setError('');setMessage('');setApplicationFiles([]);
            setCorrectionFiles([]);
            setRegistrationId(e.target.value);
            setLoaded(old => ({
              ...old,
              registration: null
            }));
          }}><option value="">{tr('Select registration')}</option>{registrationId && !loaded.registrationOptions?.some(r => r.id === registrationId) && <option value={registrationId}>{tr('Selected registration')}</option>}{loaded.registrationOptions?.filter(r => !current || r.event_id === current.event.id).map(r => <option value={r.id} key={r.id}>{r.first_name} {r.last_name} · {tr(r.status)}</option>)}</select></label></> : <p>{tr('Use Demo OTP below to access your booking.')}</p>}<button className="button button-quiet" disabled={busy || !registrationId} onClick={refreshRegistration}>{tr('Read registration')}</button>{registration && <><h3>{registration.registration.first_name} {registration.registration.last_name}</h3><p>{tr('Booking')}: {tr(registration.booking_state)}</p><p>{tr('Review')}: {tr(registration.review.state)} · {registration.review.reason}</p>{registration.offer && <p>{tr('Offer expires')}: {registration.offer.expires_at}</p>}<PrivateDocuments runtime={runtime} recordId={registrationId} files={registration.registration.supporting_documents || []} />{owner && registration.allowed_actions?.some(a => ['approve', 'reject', 'request_correction'].includes(a)) && <ActionForm title="Review application" busy={busy} fields={[field('decision', 'Decision', 'text', {
          options: ['approve', 'reject', 'request_correction'].filter(a => registration.allowed_actions.includes(a))
        }), field('reason', 'Review reason', 'textarea', {
          required: false
        })]} submit={v => mutate('/registrations/' + registrationId + '/review', v, registration.version)} />}{registration.allowed_actions?.includes('correct') && <ActionForm title="Submit correction" busy={busy || attachmentBlocked} fields={[field('phone', 'Corrected phone', 'text', {
          required: false
        }), field('note', 'Correction note', 'textarea')]} submit={v => mutate('/registrations/' + registrationId + '/correction', {
          ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)),
          ...(correctionFiles.length ? {
            file_ids: correctionFiles.map(f => f.id)
          } : {})
        }, registration.version)}>{auth.user && <FilePicker runtime={runtime} key={registrationId} purpose="supporting_document" onChange={correctionChanged} onBlocked={attachmentChanged} />}</ActionForm>} {registration.allowed_actions?.includes('cancel') && <ActionForm title="Cancel booking" busy={busy} fields={[field('reason', 'Cancellation reason', 'textarea')]} submit={v => mutate('/registrations/' + registrationId + '/cancel', v, registration.version)} />} {!owner && registration.offer?.state === 'offered' && <div className="form-actions"><button className="button" disabled={busy || !registration.allowed_actions?.includes('accept_offer')} onClick={() => mutate('/offers/' + registration.offer.id + '/accept', {}, registration.offer.version)}>{tr('Accept held offer')}</button><button className="button button-quiet" disabled={busy || !registration.allowed_actions?.includes('decline_offer')} onClick={() => mutate('/offers/' + registration.offer.id + '/decline', {}, registration.offer.version)}>{tr('Decline offer')}</button></div>}</>}</details>
 {guestAllowed && <details className="journey-section"><summary>{tr('Guest booking access — DEMO OTP')}</summary><p>{tr('Simulated local delivery. This does not verify real phone ownership. Codes and grants stay in page memory.')}</p><ActionForm title="Request Demo OTP" busy={busy} fields={[field('registration_id', 'Registration reference', 'text', {
        value: registrationId
      }), field('phone', 'Phone')]} submit={v => run(async () => {
        setGrant(null);
        setDemoCode('');
        const value = await client.publicPost('/guest-access/challenges', {
          ...v,
          purpose: 'manage_booking'
        });
        setChallenge(value);
        setRegistrationId(v.registration_id);
        setMessage(tr('Demo challenge created.'));
      })} />{challenge && <><button className="button button-quiet" disabled={busy} onClick={() => run(async () => {
          const v = await client.publicGet('/guest-access/challenges/' + challenge.challenge_id + '/demo-message', {
            headers: {
              'X-Demo-Challenge': challenge.demo_access_token
            }
          });
          setDemoCode(v.code);
        })}>{tr('Show simulated message')}</button>{demoCode && <p role="status">DEMO OTP: {demoCode}</p>}<ActionForm title="Verify Demo OTP" busy={busy} fields={[field('code', 'Demo OTP')]} submit={(v, form) => run(async () => {
          const value = await client.publicPost('/guest-access/challenges/' + challenge.challenge_id + '/verify', v, {
            'X-Demo-Challenge': challenge.demo_access_token
          });
          setGrant(value);
          setChallenge(null);
          setDemoCode('');
          form.reset();
          setMessage(tr('Scoped guest access granted for this registration only.'));
        })} /></>}</details>}
 {owner && current && <details className="journey-section"><summary>{tr('Offers, reminders and Demo outbox')}</summary><div className="form-actions">{[['offers/reconcile', 'Reconcile offers'], ['reminders', 'Process due reminders']].map(([path, label]) => <button key={path} className="button button-quiet" disabled={busy} onClick={() => mutate(root + '/' + path, {}, eventVersion)}>{tr(label)}</button>)}<button className="button button-quiet" disabled={busy} onClick={() => run(() => read('outbox', '/outbox?event_public_id=' + encodeURIComponent(eventId)))}>{tr('Read Demo outbox')}</button></div><p>{tr('DEMO_OUTBOX — no external delivery.')}</p>{loaded.outbox?.messages.map(m => <article className="journey-message" key={m.id}><h3>{tr(m.kind)} · {tr(m.state)}</h3><p>{m.recipient_hint} · {m.message}</p><small>{m.scheduled_at || m.created_at}</small>{m.state === 'failed' && <button className="button button-small" disabled={busy} onClick={() => mutate('/outbox/' + m.id + '/retry', {}, m.version)}>{tr('Retry failed Demo message')}</button>}</article>)}</details>}
 {staff&&eventId&&<AttendanceWorkspace key={staffActor.id+eventId} runtime={runtime} client={client} actor={staffActor} eventId={eventId} onError={setError} onQueueState={setAttendanceBlocked}/>}
 {staff && current && <details className="journey-section"><summary>{tr('Attendance and closeout')}</summary>{owner && <><ActionForm title="Register eligible walk-in" busy={busy} fields={[...applicationFields, field('eligibility_note', 'Synthetic eligibility review note', 'textarea')]} submit={v => mutate(root + '/walkins', () => ({
          application: appCopy(v),
          eligibility_confirmed: true,
          eligibility_note: v.eligibility_note
        }), eventVersion)}><p>{tr('Submitting explicitly confirms synthetic eligibility review. A cancelled booking is not reused.')}</p></ActionForm><button className="button button-quiet" disabled={busy} onClick={() => run(() => read('closeout', root + '/closeout'))}>{tr('Read closeout preview')}</button>{loaded.closeout && <Closeout data={loaded.closeout} actor={staffActor} />} <ActionForm title="Finalize completed event" busy={busy || !loaded.closeout || attendanceBlocked || pending.some(row=>row.path.startsWith(root+"/attendance"))} fields={[field('attestation', 'Local attendance reconciliation', 'text', {
          options: ['not confirmed', 'all local actions reconciled']
        })]} submit={v => run(async()=>{
          const attendanceStore=createAttendanceStore();
          const unresolved=await attendanceStore.unresolved(staffActor,eventId);await attendanceStore.close();
          const unsyncedForms=(await runtime.offline.drafts(staffActor)).some(row=>row.event_public_id===eventId&&['draft','pending_sync','syncing','needs_review'].includes(row.state));
          if (unresolved || unsyncedForms || v.attestation !== 'all local actions reconciled' || Object.keys(localStorage).some(key=>key.startsWith(`rose.demo.synthetic.attendance.${actorId}.${eventId}.`)) || pending.some(row=>row.path.startsWith(root+'/attendance'))) {
            setError(tr('Confirm local reconciliation first.'));
            return;
          }
          const receipt=await client.mutate(root + '/closeout', {attendance_reconciled:true,no_unregistered_local_actions:true},loaded.closeout.version);await read('closeout',root+'/closeout');setMessage(tr('Saved by server. Current information has been read again.'));
        })} /></>}</details>}
 {owner && <details className="journey-section"><summary>{tr('Synthetic account management')}</summary><button className="button button-quiet" disabled={busy} onClick={() => run(() => read('accounts', '/accounts'))}>{tr('Read namespace accounts')}</button><ActionForm title="Create synthetic account" busy={busy} fields={[field('username', 'Namespace username'), field('password', 'Temporary password', 'password'), field('role', 'Role', 'text', {
        options: ['user', 'leader', 'organizer']
      })]} submit={(v, form) => {
        mutate('/accounts', {
          ...v,
          synthetic: true
        });
        form.reset();
      }} />{loaded.accounts?.accounts.map(account => <article className="journey-message" key={account.id}><strong>{account.username}</strong><p>{account.role} · {tr(account.enabled ? 'Enabled' : 'Disabled')}</p><button className="button button-quiet" disabled={busy} onClick={() => mutate('/accounts/' + account.id + '/access', {
          enabled: !account.enabled
        }, account.version)}>{tr(account.enabled ? 'Disable account' : 'Enable account')}</button></article>)}</details>}
 </div>;
}
function Statistics({
  data, actor
}) {
  return <section><p>{tr('As of')}: {data.as_of_utc}</p><div className="journey-metrics">{Object.entries(data.counts).map(([name, value]) => <div key={name}><strong>{value}</strong><span>{tr(name)}</span></div>)}</div>{['online', 'offline'].map(pool => <p key={pool}>{tr(pool)}: {tr('Approved')} {data.quota[pool].approved} / {data.quota[pool].capacity} · {tr('Offer holds')} {data.quota[pool].offer_holds} · {tr('Available')} {data.quota[pool].available}</p>)}<p>{tr('Attribution')}: {tr('direct')} {data.attribution.direct} · {tr('leader_referral')} {data.attribution.leader_referral} · {tr('unknown')} {data.attribution.unknown}</p><LeaderBreakdown data={data.leader_breakdown} actor={actor} total={data.counts.applications}/><p>{tr('Demand alert')}: {tr(data.alert.state)} · {tr('Threshold')} {data.alert.threshold} · {tr('Observed ratio')} {data.alert.observed_ratio}</p><p>{tr('Leader instruction')}: {data.instruction.text || tr('No instruction yet')}</p></section>;
}
function Closeout({
  data, actor
}) {
  return <section><p>{tr('As of')}: {data.as_of_utc} · {tr(data.state)}</p><div className="journey-metrics">{Object.entries(data.totals).map(([name, value]) => <div key={name}><strong>{value}</strong><span>{tr(name)}</span></div>)}</div><p>{tr('Attribution')}: {tr('direct')} {data.attribution?.direct??'—'} · {tr('leader_referral')} {data.attribution?.leader_referral??'—'} · {tr('unknown')} {data.attribution?.unknown??'—'}</p><LeaderBreakdown data={data.leader_breakdown} actor={actor} total={data.totals.applications}/><p>{tr('Pending attendance')}: {data.pending_attendance_count} · {tr('Active offers')}: {data.active_offer_count}</p>{data.blockers.map(code => <p role="alert" key={code}>{tr(code)}</p>)}</section>;
}

const applicationCount = value => Number.isSafeInteger(value) && value >= 0;
function validLeaderBreakdown(data, actor, total) {
  if (!data || data.basis !== 'all_applications' || !Array.isArray(data.leaders)) return false;
  const ids = new Set();
  for (const row of data.leaders) {
    if (!row || typeof row.leader_id !== 'string' || !row.leader_id.trim() || ids.has(row.leader_id) ||
      !(row.leader_display_name === null || typeof row.leader_display_name === 'string') || !applicationCount(row.applications)) return false;
    ids.add(row.leader_id);
  }
  if (actor?.role === 'leader') return data.scope === 'self' && data.unattributed_applications === null &&
    data.leaders.length === 1 && data.leaders[0].leader_id === actor.id;
  if (actor?.role !== 'organizer' || data.scope !== 'event' || !applicationCount(data.unattributed_applications) || !applicationCount(total)) return false;
  const sum = data.leaders.reduce((count, row) => count + row.applications, data.unattributed_applications);
  return applicationCount(sum) && sum === total;
}
function LeaderName({row}) {
  return row.leader_display_name?.trim() ? row.leader_display_name : <>{tr('Leader name unavailable')}<br/><small>{tr('Recorded Leader reference')}: {row.leader_id}</small></>;
}
function LeaderBreakdown({data, actor, total}) {
  const valid = validLeaderBreakdown(data, actor, total);
  return <section className="journey-facts" aria-label={tr('Recorded Leader attribution')}>
    <h3>{tr('Recorded Leader attribution')}</h3>
    {!valid ? <p>{tr('Recorded Leader attribution is unavailable for this summary.')}</p> : <>
      <p>{tr('Counts include applications in every status, not confirmed places or attendance.')}</p>
      {data.scope === 'self' ? <>
        <p>{tr('Only your recorded attribution is shown. This is not the complete event breakdown.')}</p>
        <ul aria-label={tr('Your recorded attribution')}><li><LeaderName row={data.leaders[0]}/> · {tr('Applications')}: <strong>{data.leaders[0].applications}</strong></li></ul>
        {data.leaders[0].applications === 0 && <p>{tr('No applications are attributed to you in this summary.')}</p>}
      </> : <>
        {total === 0 && <p>{tr('No applications are recorded for this event.')}</p>}
        <table style={{width:'100%',tableLayout:'fixed',textAlign:'left'}}>
          <caption>{tr('Recorded Leader attribution — this event')}</caption>
          <thead><tr><th scope="col">{tr('Leader')}</th><th scope="col">{tr('Applications')}</th></tr></thead>
          <tbody>{data.leaders.map(row => <tr key={row.leader_id}><th scope="row"><LeaderName row={row}/></th><td>{row.applications}</td></tr>)}
            <tr><th scope="row">{tr('Unattributed applications')}</th><td>{data.unattributed_applications}</td></tr></tbody>
          <tfoot><tr><th scope="row">{tr('All event applications')}</th><td>{total}</td></tr></tfoot>
        </table>
      </>}
    </>}
  </section>;
}

function PublicEventContext({event}){
 const zone=event.workflow?.timezone;const format=value=>{try{return new Intl.DateTimeFormat(locale(),{dateStyle:'medium',timeStyle:'short',...(zone?{timeZone:zone}:{})}).format(new Date(value));}catch{return '—';}};
 return <article><h2>{event.title}</h2><p>{event.overview}</p><p>{event.location} · {format(event.start_time)} — {format(event.end_time)} {zone}</p><p>{tr('Status')}: {tr(event.workflow?.state||event.status)}</p>{event.workflow?.registration_opens_at&&<p>{tr('Registration opens')}: {format(event.workflow.registration_opens_at)}</p>}{event.workflow?.registration_closes_at&&<p>{tr('Registration closes')}: {format(event.workflow.registration_closes_at)}</p>}<p>{tr('Eligibility and places require Organizer review. A pending application is not a confirmed booking.')}</p></article>;
}
