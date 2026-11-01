import { ApiError, createApi } from '../../live/api.mjs';
import { browserSessionStorage, createSession } from '../../live/session.mjs';
import { createEventController, createEventImageController } from '../../live/create-event.mjs';
import { createEditEventController } from '../../live/edit-event.mjs';
import { createRegistrationController, createGuestRegistrationController } from '../../live/registration.mjs';
import { createRegistrationsController } from '../../live/registrations-page.mjs';

export { ApiError };
export { eventFormValues } from '../../live/edit-event.mjs';
export { safeImagePath } from '../../live/image-path.mjs';

// The original signup module mounts DOM unconditionally. Keep its reviewed payload
// validation here without importing that side effect into React.
export function signupPayload({ username, password } = {}) {
  if (typeof username !== 'string' || !username.trim() || [...username].length < 3 || [...username].length > 20) throw new ApiError('validation', 'Enter a username with 3–20 characters.');
  if (typeof password !== 'string' || [...password].length < 6) throw new ApiError('validation', 'Enter a password with at least 6 characters.');
  if (new TextEncoder().encode(password).length > 72) throw new ApiError('validation', 'Use a password of at most 72 UTF-8 bytes. Some characters use more than one byte.');
  return { username, password };
}

export function observableController(factory, sync = () => {}) {
  const listeners = new Set();
  const controller = factory(() => { sync(); for (const listener of listeners) listener(); });
  return { controller, getSnapshot: () => controller.state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
}

export function createSignupController({ api, onChange = () => {} }) {
  let state = { status: 'idle', message: '', user: null };
  const emit = next => { state = next; onChange(); };
  return {
    get state() { return state; },
    async submit(values) {
      if (['submitting', 'success', 'uncertain'].includes(state.status)) return;
      let payload;
      try { payload = signupPayload(values); }
      catch (error) { emit({ status: 'error', message: error.message, user: null }); return; }
      emit({ status: 'submitting', message: 'Creating your account…', user: null });
      try { const user = await api.createUser(payload); emit({ status: 'success', message: 'Account created. Log in to continue.', user }); }
      catch (error) {
        const rejected = (error.kind === 'duplicate' && error.status === 400) || (error.kind === 'validation' && error.status === 422);
        emit({ status: rejected ? 'error' : 'uncertain', user: null, message: rejected ? error.message : 'We could not confirm whether your account was created. Do not submit again. Use Log in to check your account.' });
      } finally { payload.password = ''; }
    },
  };
}

/** React owns presentation; reviewed API, Session and write controllers own contracts. */
export function createRuntime({ api = createApi(), storage = browserSessionStorage() } = {}) {
  const session = createSession({ api, storage });
  const listeners = new Set(); const stores = new Map();
  let snapshot = { user: null, hasToken: session.hasToken, revision: session.revision, persistent: session.persistent, checking: true, message: '' };
  const publish = patch => {
    snapshot = { ...snapshot, user: session.user, hasToken: session.hasToken, revision: session.revision, persistent: session.persistent, ...patch };
    for (const listener of listeners) listener();
  };
  const sync = () => {
    if (snapshot.user !== session.user || snapshot.revision !== session.revision || snapshot.hasToken !== session.hasToken) publish({});
  };
  let restorePromise;
  return {
    api, session, sync,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    restore() {
      if (!restorePromise) restorePromise = session.restore().then(() => publish({ checking: false, message: '' })).catch(error => publish({ checking: false, message: error.message }));
      return restorePromise;
    },
    async signIn(values) {
      try { const result = await session.signIn(values); publish({ checking: false, message: result.persistent ? '' : 'Session storage is unavailable. Your login lasts only while this page stays open.' }); return result; }
      finally { sync(); }
    },
    logout() { const removed = session.logout(); publish({ checking: false, message: removed ? 'You have logged out on this device.' : 'Logged out in memory. Close this tab to clear unavailable browser storage.' }); },
    store(kind, { event, mode } = {}) {
      const key = kind === 'signup' ? kind : `${session.revision}:${session.user?.id ?? 'guest'}:${kind}:${event?.public_id ?? mode ?? ''}`;
      if (!stores.has(key)) {
        const factory = onChange => {
          if (kind === 'signup') return createSignupController({ api, onChange });
          if (kind === 'create') return createEventController({ session, onChange });
          if (kind === 'image') return createEventImageController({ session, onChange });
          if (kind === 'edit') return createEditEventController({ api, session, onChange });
          if (kind === 'registration') return createRegistrationController({ session, event, onChange });
          if (kind === 'guest') return createGuestRegistrationController({ api, session, event, onChange });
          if (kind === 'records') return createRegistrationsController({ session, mode, onChange });
          throw new TypeError('Unknown controller');
        };
        stores.set(key, observableController(factory, sync));
      }
      return stores.get(key);
    },
  };
}
