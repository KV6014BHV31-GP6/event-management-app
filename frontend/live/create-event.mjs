import { ApiError, createApi } from './api.mjs';
import { createSession, browserSessionStorage } from './session.mjs';
import { mountAccount } from './ui.mjs';

const invalid = message => { throw new ApiError('validation', message); };

export function eventPayload(values) {
  const title = String(values.title ?? '').trim();
  const location = String(values.location ?? '').trim();
  if (!title || [...title].length > 255) invalid('Event title is required and must be at most 255 characters.');
  if (!location || [...location].length > 255) invalid('Location is required and must be at most 255 characters.');
  function localDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) invalid('Enter a valid local date and time.');
    const date = new Date(value);
    const parts = value.match(/\d+/g).map(Number);
    if (!Number.isFinite(date.valueOf()) || date.getFullYear() !== parts[0]
      || date.getMonth() + 1 !== parts[1] || date.getDate() !== parts[2]
      || date.getHours() !== parts[3] || date.getMinutes() !== parts[4]) invalid('This date and time does not exist in your browser timezone.');
    return date;
  }
  const start = localDate(values.start_time);
  const end = localDate(values.end_time);
  if (end <= start) invalid('End date and time must be later than start date and time.');
  function quota(value) {
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) invalid('Quotas must be non-negative whole numbers.');
    return Number(value);
  }
  return { title, overview: String(values.overview ?? '').trim() || null, location,
    start_time: start.toISOString(), end_time: end.toISOString(),
    online_quota: quota(values.online_quota), offline_quota: quota(values.offline_quota) };
}

export function createEventController({ session, onChange = () => {} }) {
  let state = { status: 'idle', message: '', event: null };
  const emit = next => { state = next; onChange(state); };
  return {
    get state() { return state; },
    async submit(values) {
      if (['submitting', 'success', 'uncertain'].includes(state.status)) return;
      let payload;
      try {
        if (!session.user) throw new ApiError('unauthorized', 'Please log in and verify your account first.', 401);
        payload = eventPayload(values);
      } catch (error) { emit({ status: 'error', message: error.message, event: null }); return; }
      emit({ status: 'submitting', message: 'Creating event…', event: null });
      try {
        const event = await session.createEvent(payload);
        emit({ status: 'success', message: 'Event created successfully', event });
      } catch (error) {
        const uncertain = !['unauthorized', 'forbidden', 'validation', 'rate_limit'].includes(error.kind);
        emit({ status: uncertain ? 'uncertain' : 'error', event: null,
          message: uncertain ? 'The creation result is unknown. Check Events before creating again to avoid a duplicate.' : error.message });
      }
    },
  };
}

export function mountCreateEvent() {
  const session = createSession({ api: createApi(), storage: browserSessionStorage() });
  const form = document.querySelector('#create-event-form');
  const fields = document.querySelector('#event-fields');
  const progress = document.querySelector('#create-progress');
  const result = document.querySelector('#create-result');
  const prompt = document.querySelector('#login-prompt');
  const controller = createEventController({ session, onChange: () => { account.render(); render(); } });
  const account = mountAccount(session, { onChange: render });
  function render() {
    const state = controller.state;
    const success = state.status === 'success' && Boolean(session.user);
    fields.disabled = !session.user || ['submitting', 'success', 'uncertain'].includes(state.status);
    form.hidden = success;
    prompt.hidden = Boolean(session.user);
    result.hidden = !success;
    progress.textContent = state.message;
    progress.className = ['error', 'uncertain'].includes(state.status) ? 'notice notice-error' : 'notice';
    progress.hidden = !state.message;
    form.setAttribute('aria-busy', String(state.status === 'submitting'));
    if (success) {
      document.querySelector('#created-title').textContent = state.event.title;
      document.querySelector('#created-id').textContent = state.event.public_id;
    }
  }
  document.querySelector('#create-timezone').textContent = `Dates and times use your browser timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (fields.disabled || !form.reportValidity()) return;
    controller.submit(Object.fromEntries(new FormData(form)));
  });
  account.check();
}

if (typeof document !== 'undefined' && document.querySelector('#create-event-form')) mountCreateEvent();
