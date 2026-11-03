import React, { useEffect, useMemo, useRef, useState } from 'react';
import { changeLanguage, tr } from './i18n/index.js';
import { createAccountClient, recoveryCode, validateNewPassword } from './account-api.js';

const identityKey = auth => `${auth.user?.id || 'anonymous'}:${auth.revision}`;
function Notice({ children, error = false }) {
  return children ? <p className={`notice${error ? ' notice-error' : ''}`} role={error ? 'alert' : 'status'}>{tr(children)}</p> : null;
}
function useAccount(runtime, auth) {
  const client = useMemo(() => createAccountClient({
    actorId: auth.user?.id,
    authorize: operation => runtime.withVerifiedAccount(operation),
  }), [runtime, auth.user?.id, auth.revision]);
  const active = useRef(true), lock = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; client.cancelRequests(); };
  }, [client]);
  const run = async (operation, refused) => {
    if (lock.current || !active.current) return;
    lock.current = true;
    setBusy(true);
    try { await operation(); }
    catch (error) { if (active.current) refused(error); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  };
  return { client, active, busy, run };
}
function initialMarker(read) {
  try { return { value: read(), error: '' }; }
  catch (error) { return { value: null, error: error.message }; }
}

export function AccountProfile({ runtime, auth }) {
  if (!auth.user || auth.checking) return null;
  return <div className="account-workspace" key={identityKey(auth)}>
    <ProfileEditor runtime={runtime} auth={auth} />
    {auth.user.role === 'organizer' && <AssistedRecovery runtime={runtime} auth={auth} />}
  </div>;
}
export function ProfileEditor(props) { return <ProfileSession key={identityKey(props.auth)} {...props} />; }
function ProfileSession({ runtime, auth }) {
  const { client, active, busy, run } = useAccount(runtime, auth);
  const [profile, setProfile] = useState(null), [values, setValues] = useState({ display_name: '', preferred_language: 'en' });
  const [status, setStatus] = useState('loading'), [message, setMessage] = useState('Reading your current profile…');
  const initial = useMemo(() => initialMarker(client.pendingProfile), [client]);
  const [pending, setPending] = useState(initial.value);
  const load = async (saved = false) => {
    const result = await client.getProfile();
    if (!active.current) return;
    setProfile(result.profile);
    setValues({ display_name: result.profile.display_name, preferred_language: result.profile.preferred_language });
    const unresolved = client.pendingProfile();
    setPending(unresolved);
    setStatus(unresolved ? 'unknown' : saved ? 'saved' : 'ready');
    setMessage(unresolved ? 'A profile save is unresolved. Check its original receipt before saving again.' : saved
      ? 'Your profile was saved. Current information has been read from the server.' : 'Your current profile has been read from the server.');
    if (saved) await changeLanguage(result.profile.preferred_language);
  };
  const failed = error => {
    if ([401, 403].includes(error.status)) {
      setProfile(null); setValues({ display_name: '', preferred_language: 'en' });
      setStatus('blocked'); setMessage(error.message); return;
    }
    let marker;
    try { marker = client.pendingProfile(); } catch { marker = { unknown: true }; }
    setPending(marker);
    setStatus(marker ? 'unknown' : error.code === 'STALE_VERSION' ? 'stale' : 'error');
    setMessage(error.message);
  };
  useEffect(() => {
    if (initial.error) { setStatus('error'); setMessage(initial.error); return; }
    run(() => load(), failed);
  }, [client]);
  const save = event => {
    event.preventDefault();
    if (!profile || pending || !['ready', 'saved', 'error'].includes(status)) return;
    run(async () => {
      setStatus('saving'); setMessage('Saving your profile…');
      await client.saveProfile(values, profile.version);
      if (!active.current) return;
      try { await load(true); }
      catch (error) {
        if (active.current) {
          if ([401, 403].includes(error.status)) { failed(error); return; }
          setPending(null); setStatus('read_error');
          setMessage('The save receipt is confirmed, but the current profile could not be read. Read it again before editing.');
        }
      }
    }, failed);
  };
  const reconcile = () => run(async () => {
    await client.reconcileProfile();
    if (active.current) await load(true);
  }, failed);
  return <section className="account-section" aria-labelledby="account-profile-title">
    <h2 id="account-profile-title">{tr('Personal profile')}</h2>
    <p>{tr('Display name and language belong to your account. Your username, role and existing registrations stay separate.')}</p>
    <Notice error={['error', 'stale', 'unknown', 'read_error', 'blocked'].includes(status)}>{message}</Notice>
    {pending && <button className="button button-quiet" disabled={busy} onClick={reconcile}>{tr('Check profile save result')}</button>}
    <form method="dialog" aria-label={tr('Personal profile')} onSubmit={save}>
      <fieldset disabled={busy || !profile || pending || !['ready', 'saved', 'error'].includes(status)}>
        <legend className="sr-only">{tr('Personal profile')}</legend>
        <div className="field"><label htmlFor="account-display-name">{tr('Display name')}</label>
          <input id="account-display-name" name="display_name" required autoComplete="nickname" value={values.display_name}
            onChange={event => setValues(old => ({ ...old, display_name: event.target.value }))} aria-describedby="account-name-help" />
          <small id="account-name-help">{tr('Use 1–80 characters without control characters.')}</small>
        </div>
        <div className="field"><label htmlFor="account-language">{tr('Preferred language')}</label>
          <select id="account-language" name="preferred_language" value={values.preferred_language}
            onChange={event => setValues(old => ({ ...old, preferred_language: event.target.value }))}>
            <option value="en">{tr('English')}</option><option value="ms">{tr('Bahasa Melayu')}</option>
          </select>
        </div>
        <button className="button" type="submit">{tr('Save profile')}</button>
      </fieldset>
    </form>
    <button className="text-button" disabled={busy} onClick={() => run(() => load(), failed)}>{tr('Read current profile')}</button>
  </section>;
}

export function AssistedRecovery(props) { return <AssistedSession key={identityKey(props.auth)} {...props} />; }
function AssistedSession({ runtime, auth }) {
  const { client, active, busy, run } = useAccount(runtime, auth);
  const [accounts, setAccounts] = useState(null), [selected, setSelected] = useState('');
  const [challenge, setChallenge] = useState(null), [code, setCode] = useState('');
  const initial = useMemo(() => initialMarker(client.pendingIssue), [client]);
  const [pending, setPending] = useState(initial.value), [message, setMessage] = useState(initial.error);
  const [error, setError] = useState(!!initial.error);
  const selectionEpoch = useRef(0);
  const clearDelivery = () => { selectionEpoch.current++; setChallenge(null); setCode(''); };
  const failed = failure => {
    setCode(''); setMessage(failure.message); setError(true);
    try { setPending(client.pendingIssue()); } catch { setPending({ unknown: true }); }
    if ([401, 403].includes(failure.status)) { clearDelivery(); setAccounts(null); setSelected(''); }
  };
  const eligible = accounts?.filter(account => account.enabled && account.role === 'user') || [];
  const load = () => run(async () => {
    clearDelivery(); setError(false); setSelected(''); setAccounts(null);
    const result = await client.getDirectory();
    if (active.current) { setAccounts(result.accounts); setMessage('Select the Participant account that needs assisted recovery.'); }
  }, failed);
  const issue = event => {
    event.preventDefault();
    if (pending || !eligible.some(account => account.id === selected)) return;
    run(async () => {
      clearDelivery(); setError(false); setMessage('Creating a synthetic recovery code…');
      const epoch = selectionEpoch.current;
      const result = await client.issueChallenge(selected);
      if (active.current && epoch === selectionEpoch.current) {
        setChallenge(result.effects); setPending(null); setMessage('The synthetic recovery code is ready. Reveal it only when assisting the intended Participant.');
      }
    }, failed);
  };
  const reconcile = () => run(async () => {
    clearDelivery(); const epoch = selectionEpoch.current;
    const result = await client.reconcileIssue();
    if (active.current && epoch === selectionEpoch.current) {
      setChallenge(result.effects); setPending(null); setError(false);
      setMessage('The original recovery request was recorded. Check the intended Participant before revealing its code.');
    }
  }, failed);
  const reveal = () => run(async () => {
    setCode(''); const epoch = selectionEpoch.current;
    const result = await client.revealChallenge(challenge.challenge_id);
    if (active.current && epoch === selectionEpoch.current) {
      setCode(recoveryCode(result.challenge_id, result.recovery_secret)); setError(false);
      setMessage('Synthetic delivery is visible only on this page. Do not save or screenshot the code.');
    }
  }, failed);
  return <section className="account-section" aria-labelledby="account-assisted-title">
    <h2 id="account-assisted-title">{tr('Demo administrator assistance')}</h2>
    <p>{tr('Designated Demo administrators can assist synthetic Participant accounts. No real message or identity verification is provided.')}</p>
    <Notice error={error}>{message}</Notice>
    {pending && <><Notice error>{'An assistance request is unresolved. Check its original result before creating another code.'}</Notice>
      <button className="button button-quiet" disabled={busy} onClick={reconcile}>{tr('Check assistance request')}</button></>}
    <button className="button button-quiet" disabled={busy} onClick={load}>{tr('Load recovery accounts')}</button>
    {accounts && <form method="dialog" aria-label={tr('Participant recovery assistance')} onSubmit={issue}>
      <div className="field"><label htmlFor="recovery-participant">{tr('Participant account')}</label>
        <select id="recovery-participant" required disabled={busy || !!pending} value={selected} onChange={event => {
          clearDelivery(); setSelected(event.target.value); setMessage(''); setError(false);
        }}><option value="">{tr('Select a Participant account')}</option>
          {eligible.map(account => <option key={account.id} value={account.id}>{account.username}</option>)}
        </select>
      </div>
      {!eligible.length && <p>{tr('No eligible synthetic Participant accounts are available.')}</p>}
      <p className="small muted">{tr('Creating a new code replaces any earlier unused code for this Participant. The code is valid for five minutes.')}</p>
      <button className="button" disabled={busy || !selected || !!pending}>{tr('Create recovery code')}</button>
    </form>}
    {challenge && <div className="account-delivery">
      <p>{tr('Synthetic Demo delivery only. Share it only with the intended Participant in this local demonstration.')}</p>
      <p>{tr('Code expires at')}: <time dateTime={challenge.expires_at}>{challenge.expires_at}</time></p>
      {code ? <><div className="field"><label htmlFor="synthetic-recovery-code">{tr('Synthetic recovery code')}</label>
        <textarea id="synthetic-recovery-code" value={code} readOnly autoComplete="off" spellCheck={false} />
      </div><button className="text-button" onClick={() => { setCode(''); setMessage('The synthetic code is hidden.'); }}>{tr('Hide recovery code')}</button></>
        : <button className="button button-quiet" disabled={busy} onClick={reveal}>{tr('Reveal synthetic recovery code')}</button>}
    </div>}
  </section>;
}

export function RecoveryWorkspace(props) { return <RecoverySession key={identityKey(props.auth)} {...props} />; }
function RecoverySession({ runtime, auth, navigate }) {
  const { client, active, busy, run } = useAccount(runtime, auth);
  const initial = useMemo(() => initialMarker(client.pendingRecovery), [client]);
  const [pending, setPending] = useState(initial.value), [code, setCode] = useState('');
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState(initial.value ? 'unknown' : initial.error ? 'blocked' : 'ready');
  const [message, setMessage] = useState(initial.error || (initial.value ? 'A reset result is unresolved. Re-enter the original recovery code and check its receipt first.' : ''));
  const signedIn = auth.user || auth.hasToken || auth.checking || auth.identityBlocked;
  const succeeded = () => {
    setCode(''); setPassword(''); setConfirmation(''); setPending(null); setStatus('success');
    setMessage('Your password change is confirmed. Log in explicitly with your new password.');
  };
  const failed = failure => {
    let marker;
    try { marker = client.pendingRecovery(); } catch { setStatus('blocked'); setMessage(failure.message); return; }
    setPending(marker);
    setStatus(marker ? failure.status === 404 ? 'missing' : 'unknown' : 'error');
    setMessage(failure.status === 404 && marker
      ? 'No committed reset receipt was found. To retry deliberately, re-enter the original password. The original request reference will be kept.' : failure.message);
  };
  const reset = (event, retry = false) => {
    event.preventDefault();
    if (signedIn || status === 'blocked' || status === 'success' || (retry ? status !== 'missing' : !!pending)) return;
    run(async () => {
      validateNewPassword(password, confirmation);
      setStatus('submitting'); setMessage('Checking your recovery request…');
      try {
        if (retry) await client.retryReset(code, password);
        else await client.resetPassword(code, password);
        if (active.current) succeeded();
      } finally { if (active.current) { setPassword(''); setConfirmation(''); } }
    }, failed);
  };
  const reconcile = () => run(async () => {
    setStatus('checking'); setMessage('Checking the original reset receipt…');
    await client.reconcileReset(code);
    if (active.current) succeeded();
  }, failed);
  const cancel = () => {
    setCode(''); setPassword(''); setConfirmation(''); client.cancelRequests();
    navigate('login');
  };
  return <section className="account-workspace account-recovery" aria-labelledby="recovery-title">
    <p className="eyebrow">ROSE · PULSE</p>
    <h1 id="recovery-title">{tr('Recover account access')}</h1>
    <p>{tr('Ask a designated Demo administrator for a recovery code for your synthetic Participant account. No real message or identity verification is provided.')}</p>
    <Notice error={['blocked', 'error', 'unknown', 'missing'].includes(status)}>{message}</Notice>
    {signedIn && <Notice error>{'Log out locally before using assisted recovery.'}</Notice>}
    {signedIn && <button className="button button-quiet" onClick={() => runtime.logout()}>{tr('Log out locally')}</button>}
    {status === 'success' ? <button className="button" onClick={() => navigate('login')}>{tr('Log in with your new password')}</button> : <>
      {pending && <p>{tr('The result is unresolved. Do not start a new reset or request a replacement code. Check the original receipt first. After a reload, enter the original code again.')}</p>}
      <form method="dialog" aria-label={tr('Recover account access')} onSubmit={reset}>
        <fieldset disabled={busy || !!signedIn || status === 'blocked'}>
          <legend className="sr-only">{tr('Recovery details')}</legend>
          <div className="field"><label htmlFor="account-recovery-code">{tr('Recovery code')}</label>
            <input id="account-recovery-code" type="password" required autoComplete="off" spellCheck={false} value={code}
              onChange={event => { setCode(event.target.value); if (pending) setStatus('unknown'); }} aria-describedby="recovery-code-help" />
            <small id="recovery-code-help">{tr('Enter the complete code exactly as supplied. It stays only in this page’s memory.')}</small>
          </div>
          {pending && <button className="button button-quiet" type="button" disabled={!code} onClick={reconcile}>{tr('Check reset result')}</button>}
          <div className="field"><label htmlFor="account-new-password">{tr(pending ? 'Original new password' : 'New password')}</label>
            <input id="account-new-password" type="password" required autoComplete="new-password" value={password}
              onChange={event => setPassword(event.target.value)} aria-describedby="recovery-password-help" />
            <small id="recovery-password-help">{tr(pending ? 'For a deliberate retry, enter the exact password from the original request. A different password is refused.' : 'Use 12–72 UTF-8 bytes. Some characters use more than one byte.')}</small>
          </div>
          <div className="field"><label htmlFor="account-password-confirmation">{tr('Confirm new password')}</label>
            <input id="account-password-confirmation" type="password" required autoComplete="new-password" value={confirmation}
              onChange={event => setConfirmation(event.target.value)} />
          </div>
          {pending ? <button type="button" className="button" disabled={status !== 'missing'} onClick={event => reset(event, true)}>{tr('Retry original reset')}</button>
            : <button className="button" type="submit">{tr('Set new password')}</button>}
        </fieldset>
      </form>
      <p className="small muted">{tr('A confirmed reset revokes earlier server sessions. Local logout only clears this device’s saved session. Recovery never logs you in automatically.')}</p>
    </>}
    <button className="text-button" disabled={busy} onClick={cancel}>{tr('Cancel and return to Login')}</button>
  </section>;
}
