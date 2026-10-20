import { ApiError, createApi } from './api.mjs';
import { createSession, browserSessionStorage } from './session.mjs';
import { mountAccount } from './ui.mjs';
import { selectedPublicId, eventRoute, loginRoute, signupRoute } from './event-navigation.mjs';

const invalid = message => { throw new ApiError('validation', message); };
export function registrationPayload(values) {
  const limits = { first_name: 20, last_name: 20, phone: 20, address: Infinity, national_id: 50, income_band_code: 20 };
  const payload = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof values[key] !== 'string' || [...values[key]].length > limit) invalid('Check the required fields and their maximum lengths.');
    payload[key] = values[key];
  }
  if (!['male', 'female'].includes(values.gender)) invalid('Choose a gender from the available options.');
  if (!['single', 'married', 'divorced', 'widowed'].includes(values.marriage_status)) invalid('Choose a marital status from the available options.');
  if (typeof values.date_of_birth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(values.date_of_birth)) invalid('Enter a valid date of birth.');
  const date = new Date(values.date_of_birth + 'T00:00:00Z');
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== values.date_of_birth) invalid('Enter a valid date of birth.');
  if (values.medical_record != null && typeof values.medical_record !== 'string') invalid('Check the optional medical record.');
  return { ...payload, gender: values.gender, marriage_status: values.marriage_status,
    date_of_birth: values.date_of_birth, medical_record: values.medical_record || null };
}

export function createRegistrationController({ session, event, onChange = () => {} }) {
  let state = { status: 'idle', message: '', receipt: null };
  const update = next => { state = next; onChange(state); };
  return {
    get state() { return state; },
    async submit(values) {
      if (['submitting', 'success', 'uncertain'].includes(state.status)) return;
      let payload;
      try {
        if (!session.user) throw new ApiError('unauthorized', 'Please log in and verify your account first.', 401);
        if (!event || event.status.toLowerCase() !== 'active') throw new ApiError('inactive', 'This event is not accepting applications.');
        payload = registrationPayload(values);
      } catch (error) { update({ status: 'error', message: error.message, receipt: null }); return; }
      update({ status: 'submitting', message: 'Verifying your account and sending your application…', receipt: null });
      try {
        const receipt = await session.registerForEvent(event, payload);
        update({ status: 'success', message: 'Application received — pending', receipt });
      } catch (error) {
        const rejected = ['unauthorized', 'forbidden', 'verification', 'validation', 'rate_limit', 'duplicate', 'full', 'inactive', 'not_found'].includes(error.kind);
        update({ status: rejected ? 'error' : 'uncertain', receipt: null,
          message: rejected ? error.message : 'The application result is unknown. Do not submit it again. Ask the organiser to check before trying this event again.' });
      }
    },
  };
}

/** Guest is an explicit submission mode, never an authentication fallback. */
export function createGuestRegistrationController({ api, session, event, canSubmit = () => true, onChange = () => {} }) {
  let state = { status: 'idle', message: '', receipt: null };
  const update = next => { state = next; onChange(state); };
  const anonymous = () => !session.hasToken && !session.user && canSubmit();
  return {
    get state() { return state; },
    async submit(values) {
      if (['submitting', 'success', 'uncertain'].includes(state.status)) return;
      let payload;
      try {
        if (!anonymous()) throw new ApiError('unauthorized', 'Choose Continue as guest after explicitly logging out of any account.', 401);
        if (!event || typeof event.status !== 'string' || event.status.toLowerCase() !== 'active') {
          throw new ApiError('inactive', 'This event is not accepting applications.');
        }
        payload = registrationPayload(values);
      } catch (error) { update({ status: 'error', message: error.message, receipt: null }); return; }
      const revision = session.revision;
      update({ status: 'submitting', message: 'Sending your guest application…', receipt: null });
      try {
        const receipt = await api.registerGuestForEvent(event.public_id, payload, event.id);
        if (session.revision !== revision || !anonymous()
          || receipt.created_by_user_id !== null || receipt.event_id !== event.id
          || receipt.channel !== 'online' || receipt.status !== 'pending') {
          throw new ApiError('uncertain', 'The guest application result cannot be verified. Do not submit it again.');
        }
        update({ status: 'success', message: 'Application received — pending', receipt });
      } catch (error) {
        const changed = session.revision !== revision || !anonymous();
        const rejected = !changed && ['unauthorized', 'forbidden', 'verification', 'validation', 'rate_limit', 'duplicate', 'full', 'inactive', 'not_found'].includes(error.kind);
        update({ status: rejected ? 'error' : 'uncertain', receipt: null,
          message: rejected ? error.message : 'The application result is unknown. Do not submit it again. Ask the organiser to check before trying this event again.' });
      }
    },
  };
}

export async function mountRegistration() {
  const id = selectedPublicId(globalThis.location.search);
  const api = createApi();
  const session = createSession({ api, storage: browserSessionStorage() });
  const form = document.querySelector('#registration-form');
  const fields = document.querySelector('#registration-fields');
  const prompt = document.querySelector('#registration-login');
  const message = document.querySelector('#registration-progress');
  const result = document.querySelector('#registration-result');
  const eventMessage = document.querySelector('#event-message');
  let event = null;
  const guestButton = document.querySelector('#continue-as-guest');
  const identityNotice = document.querySelector('#registration-identity-blocked');
  const clearIdentity = document.querySelector('#registration-clear-identity');
  let controller = null;
  let guestController = null;
  let initialized = false;
  let accountChecking = true;
  // A failed token check must not silently become an anonymous application.
  let identityBlocked = session.hasToken;
  let mode = null;
  let modeRevision = 0;
  let submission = null;
  let previousIdentity = session.user?.id || null;
  const locked = () => [controller, guestController].some(item => ['submitting', 'success', 'uncertain'].includes(item?.state.status));
  const activeEvent = () => event?.status.toLowerCase() === 'active';
  const canGuest = () => initialized && !accountChecking && !identityBlocked && !session.hasToken && !session.user && mode === 'guest';
  function chooseMode(next) {
    if (mode === next || locked()) return;
    mode = next;
    modeRevision += 1;
    submission = null;
    form.reset();
  }
  const account = mountAccount(session, {
    loginHref: id ? loginRoute(id) : './login.html',
    onChange() {
      accountChecking = false;
      if (session.user) chooseMode('authenticated');
      else if (mode === 'authenticated') identityBlocked = true;
      render();
    },
    onLogout() {
      accountChecking = false;
      identityBlocked = false;
      chooseMode(null);
      form.reset();
      render();
    },
  });
  if (id) {
    document.querySelector('#registration-login-link').href = loginRoute(id);
    document.querySelector('#registration-signup-link').href = signupRoute(id);
    document.querySelector('#registration-back').href = eventRoute(id);
  }
  function controllerChanged(state) {
    if (state.status === 'submitting') {
      submission = { mode, modeRevision, sessionRevision: session.revision };
    }
    if (state.status === 'success') form.reset();
    if (mode === 'authenticated' && !session.user) identityBlocked = true;
    account.render();
    render();
  }
  function render() {
    const selectedController = mode === 'guest' ? guestController : controller;
    const state = selectedController?.state || { status: 'idle', message: '', receipt: null };
    const identity = session.user?.id || null;
    if (previousIdentity !== identity) form.reset();
    previousIdentity = identity;
    const verified = session.user?.role === 'user';
    const sameSubmission = submission && submission.mode === mode && submission.modeRevision === modeRevision && submission.sessionRevision === session.revision;
    const receiptOwner = mode === 'guest' ? canGuest() && state.receipt?.created_by_user_id === null
      : verified && state.receipt?.created_by_user_id === session.user?.id;
    const success = state.status === 'success' && sameSubmission && receiptOwner;
    const permitted = mode === 'guest' ? canGuest() : mode === 'authenticated' && verified && !accountChecking;
    fields.disabled = !initialized || !permitted || !activeEvent() || locked();
    form.hidden = state.status === 'success';
    prompt.hidden = Boolean(session.user) || identityBlocked || accountChecking || mode === 'guest' || locked();
    guestButton.disabled = !initialized || !activeEvent() || accountChecking || identityBlocked || Boolean(session.hasToken || session.user) || locked();
    identityNotice.hidden = !identityBlocked || Boolean(session.user) || accountChecking;
    clearIdentity.disabled = !initialized || accountChecking;
    document.querySelector('#registration-guest-note').hidden = mode !== 'guest';
    document.querySelector('#participant-account-note').hidden = !session.user || verified;
    result.hidden = !success;
    form.setAttribute('aria-busy', String(state.status === 'submitting'));
    message.hidden = !state.message;
    message.className = `notice${['error', 'uncertain'].includes(state.status) ? ' notice-error' : ''}`;
    message.textContent = state.status === 'success' && !success ? 'The receipt is no longer shown after your session changed. Do not resubmit the same application.' : state.message;
    if (success) {
      document.querySelector('#receipt-id').textContent = state.receipt.id;
      document.querySelector('#receipt-status').textContent = state.receipt.status;
      document.querySelector('#receipt-event').textContent = event.title;
      document.querySelector('#receipt-public-id').textContent = event.public_id;
    }
  }
  form.addEventListener('submit', submission => {
    submission.preventDefault();
    const selectedController = mode === 'guest' ? guestController : controller;
    if (!initialized || fields.disabled || !form.reportValidity() || !selectedController || locked()) return;
    if (mode === 'guest' ? !canGuest() : session.user?.role !== 'user' || accountChecking) return;
    selectedController.submit(Object.fromEntries(new FormData(form)));
  });
  guestButton.addEventListener('click', () => {
    if (!initialized || !activeEvent() || accountChecking || identityBlocked || session.hasToken || session.user || locked()) return;
    chooseMode('guest');
    render();
  });
  clearIdentity.addEventListener('click', () => {
    if (!initialized || accountChecking) return;
    account.logout();
  });
  // The native fallback and disabled fieldset stay in place until every handler exists.
  initialized = true;
  const authCheck = account.check();
  try {
    event = await api.getEvent(id);
    document.querySelector('#selected-event-title').textContent = event.title;
    document.querySelector('#selected-event-location').textContent = event.location;
    eventMessage.textContent = event.status.toLowerCase() === 'active' ? '' : 'This event is not accepting applications.';
    eventMessage.hidden = !eventMessage.textContent;
    controller = createRegistrationController({ session, event, onChange: controllerChanged });
    guestController = createGuestRegistrationController({ api, session, event, canSubmit: canGuest, onChange: controllerChanged });
  } catch (error) { eventMessage.textContent = error.message; eventMessage.className = 'notice notice-error'; }
  await authCheck;
  render();
}
if (typeof document !== 'undefined' && document.querySelector('#registration-form')) mountRegistration();
