import { ApiError, createApi } from './api.mjs';
import { createSession, browserSessionStorage } from './session.mjs';
import { mountAccount } from './ui.mjs';
import { selectedPublicId, eventRoute, loginRoute } from './event-navigation.mjs';

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
  let controller = null;
  let previousUser = null;
  const account = mountAccount(session, { loginHref: id ? loginRoute(id) : './login.html', onChange: render });
  if (id) {
    document.querySelector('#registration-login-link').href = loginRoute(id);
    document.querySelector('#registration-back').href = eventRoute(id);
  }
  function render() {
    const state = controller?.state || { status: 'idle', message: '', receipt: null };
    if (previousUser && previousUser !== session.user?.id) form.reset();
    previousUser = session.user?.id || null;
    const verified = session.user?.role === 'user';
    const success = state.status === 'success' && state.receipt.created_by_user_id === session.user?.id;
    fields.disabled = !verified || !event || event.status.toLowerCase() !== 'active' || ['submitting', 'success', 'uncertain'].includes(state.status);
    form.hidden = success;
    prompt.hidden = Boolean(session.user);
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
    if (fields.disabled || !form.reportValidity() || !controller) return;
    controller.submit(Object.fromEntries(new FormData(form)));
  });
  account.check();
  try {
    event = await api.getEvent(id);
    document.querySelector('#selected-event-title').textContent = event.title;
    document.querySelector('#selected-event-location').textContent = event.location;
    eventMessage.textContent = event.status.toLowerCase() === 'active' ? '' : 'This event is not accepting applications.';
    eventMessage.hidden = !eventMessage.textContent;
    controller = createRegistrationController({ session, event, onChange: () => { account.render(); render(); } });
  } catch (error) { eventMessage.textContent = error.message; eventMessage.className = 'notice notice-error'; }
  render();
}
if (typeof document !== 'undefined' && document.querySelector('#registration-form')) mountRegistration();
