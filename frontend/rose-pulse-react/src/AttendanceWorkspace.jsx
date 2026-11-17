import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createAttendanceStore, reconcileAttendanceAction, syncAttendance } from './offline/attendance.js';
import { demoTransport } from './demo-transport.js';
import { locale, tr } from './i18n/index.js';

const resolved = action => ['accepted', 'discarded'].includes(action.state);
const actionStatus = {
  pending: 'Saved on this device',
  accepted: 'Arrival confirmed by server',
  needs_review: 'Check server status',
};

export default function AttendanceWorkspace({ runtime, client, actor, eventId, onError, onQueueState = () => {} }) {
  const store = useMemo(() => createAttendanceStore(), []);
  const live = useRef(true);
  const locked = useRef(false);
  const [snapshot, setSnapshot] = useState(null);
  const [actions, setActions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const root = '/events/' + eventId;

  const refresh = async () => {
    const [saved, rows] = await Promise.all([store.roster(actor, eventId), store.pending(actor, eventId)]);
    if (!live.current) return;
    setSnapshot(saved);
    setActions(rows);
    onQueueState(rows.some(action => !resolved(action)));
  };
  useEffect(() => {
    live.current = true;
    refresh().catch(error => { if (live.current) onError(error.message); });
    return () => { live.current = false; store.close(); };
  }, [actor.id, eventId]);

  const run = async fn => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    try {
      await fn();
      await refresh();
    } catch (error) {
      if (live.current) onError(error.message);
    } finally {
      locked.current = false;
      if (live.current) setBusy(false);
    }
  };
  const preload = () => run(async () => {
    await runtime.freshOfflineIdentity(actor);
    const event = await client.get(root);
    const roster = await client.get(root + '/roster?query=');
    await store.saveRoster(actor, eventId, {event, rows: roster.rows});
    if (live.current) setMessage(tr('Approved roster ready.'));
  });
  const send = () => run(async () => {
    if (demoTransport.getSnapshot().mode === 'offline')
      throw new Error('Restore the connection before manual attendance sync.');
    await syncAttendance({store, actor, eventId, client,
      verify: async () => (await runtime.freshOfflineIdentity(actor)).actor});
    if (live.current) setMessage(tr('Attendance sync finished. Read each action result below.'));
  });
  const unresolved = actions.filter(action => !resolved(action));
  const participants = (snapshot?.snapshot.rows || []).filter(row =>
    [row.first_name, row.last_name, row.phone_hint, row.registration_id].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="journey-section">
    <h2>{tr('Check in')}</h2>
    <p>{tr('Find an approved participant. Saved check-ins stay on this device until the server confirms arrival.')}</p>
    <button className="button" disabled={busy} onClick={preload}>{tr('Download approved roster')}</button>
    {message && <p role="status">{message}</p>}
    {snapshot && <>
      <p>{tr('Roster saved on this device')}: {new Date(snapshot.saved_at).toLocaleString(locale())}</p>
      <label>{tr('Find approved participant')}<input value={query} onChange={event => setQuery(event.target.value)} /></label>
      {!participants.length && <p role="status">{tr(query.trim() ? 'No matching approved participants.' : 'No approved participants are on this roster yet.')}</p>}
      {participants.map(row => {
        const local = actions.find(action => action.registration_id === row.registration_id && !['rejected', 'discarded'].includes(action.state));
        const arrived = row.arrived || local?.state === 'accepted';
        return <article className="journey-message" key={row.registration_id}>
          <strong>{row.first_name} {row.last_name}</strong>
          <p>{row.phone_hint} · {tr(arrived ? 'Arrival confirmed by server' : local ? actionStatus[local.state] || local.state : 'Approved')}</p>
          <button className="button button-small" disabled={busy || arrived || !!local} onClick={() => run(async () => {
            await store.capture(actor, eventId, row.registration_id);
            if (live.current) setMessage(tr('Attendance action saved locally. Arrival is not yet confirmed.'));
          })}>{tr('Queue check-in locally')}</button>
        </article>;
      })}
    </>}
    {unresolved.length > 0 && <div className="form-actions">
      <button className="button" disabled={busy || !unresolved.some(action => ['pending', 'needs_review'].includes(action.state))} onClick={send}>{tr('Sync pending attendance')}</button>
      <button className="button button-quiet" disabled={busy} onClick={() => run(async () => {
        for (const action of unresolved) await reconcileAttendanceAction({store, actor, eventId, action, client});
      })}>{tr('Reconcile attendance')}</button>
    </div>}
    <h3>{tr('Saved attendance actions')}</h3>
    {!actions.length && <p>{tr('No saved attendance actions.')}</p>}
    {actions.map(action => <article className="journey-message" key={action.attendance_operation_id}>
      <strong>{action.participant_name}</strong>
      <p>{tr(actionStatus[action.state] || action.state)}{action.reason && <> · {tr(action.reason)}</>}</p>
      <details><summary>{tr('Action reference')}</summary><p>{action.attendance_operation_id}</p></details>
      {!resolved(action) && <button className="text-button" disabled={busy} onClick={() => run(() =>
        reconcileAttendanceAction({store, actor, eventId, action, client, discard: true})
      )}>{tr(action.no_intent_proof ? 'Discard refused local check-in' : 'Discard after server reconciliation')}</button>}
    </article>)}
  </section>;
}
