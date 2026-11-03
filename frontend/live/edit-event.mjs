import { ApiError, createApi } from './api.mjs';
import { createSession, browserSessionStorage } from './session.mjs';
import { mountAccount } from './ui.mjs';
import { selectedPublicId, validPublicId, eventRoute } from './event-navigation.mjs';
import { mountEventImageControls } from './create-event.mjs';
import { safeImagePath, createEventImage } from './image-path.mjs';

const STATES = new Set(['active', 'cancelled', 'completed']);
export function eventFormValues(event) {
  const localMinute = value => {
    const date = new Date(value);
    if (!Number.isFinite(date.valueOf())) throw new ApiError('contract', 'The event dates could not be read.');
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  return { title:event.title, overview:event.overview ?? '', location:event.location,
    start_time:localMinute(event.start_time), end_time:localMinute(event.end_time),
    online_quota:String(event.online_quota), offline_quota:String(event.offline_quota),
    status:event.status, image_path:event.image_path ?? null };
}

/** Send only edited fields from the inspected EventUpdate schema. */
export function editEventPayload(values, original) {
  const before = eventFormValues(original);
  const changed = {};
  const invalid = message => { throw new ApiError('validation', message); };
  // Validate only edits. Unchanged display minutes retain the server's seconds,
  // and an old unsupported image can be left untouched or explicitly removed.
  for (const key of Object.keys(before)) {
    if (!Object.hasOwn(values, key) || values[key] === before[key]) continue;
    let value = values[key];
    if (key === 'title' || key === 'location') {
      value = String(value ?? '').trim();
      if (!value || [...value].length > 255) invalid(`${key === 'title' ? 'Event title' : 'Location'} is required and must be at most 255 characters.`);
    } else if (key === 'overview') value = String(value ?? '').trim() || null;
    else if (key === 'online_quota' || key === 'offline_quota') {
      if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) invalid('Quotas must be whole numbers between 0 and 2147483647.');
      value = Number(value);
    } else if (key === 'status') {
      if (!STATES.has(value)) invalid('Choose an active, cancelled or completed event status.');
    } else if (key === 'image_path') {
      value = value === null || value === '' ? null : safeImagePath(value);
      if (value === null && values[key] !== null && values[key] !== '') invalid('Use the URL returned by a supported image upload.');
    } else {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) invalid('Enter a valid local date and time.');
      const date = new Date(value);
      const parts = value.match(/\d+/g).map(Number);
      if (!Number.isFinite(date.valueOf()) || date.getFullYear() !== parts[0]
        || date.getMonth() + 1 !== parts[1] || date.getDate() !== parts[2]
        || date.getHours() !== parts[3] || date.getMinutes() !== parts[4]) invalid('This date and time does not exist in your browser timezone.');
      value = date.toISOString();
    }
    if (value !== (original[key] ?? null)) changed[key] = value;
  }
  if (Object.hasOwn(changed, 'start_time') || Object.hasOwn(changed, 'end_time')) {
    const start = new Date(changed.start_time ?? original.start_time);
    const end = new Date(changed.end_time ?? original.end_time);
    if (end <= start) invalid('End date and time must be later than start date and time.');
  }
  if (!Object.keys(changed).length) throw new ApiError('validation', 'Change an event detail before saving.');
  return changed;
}

export function createEditEventController({ api, session, onChange = () => {} }) {
  let state = { status:'idle', event:null, message:'' };
  let generation = 0;
  let owner;
  let epoch;
  const identityMatches = () => session.user?.role === 'organizer' && session.user.id === owner && session.revision === epoch;
  const emit = next => { state = next; onChange(state); };
  return {
    get state() { return state; },
    async load(id) {
      if (['submitting', 'success', 'uncertain'].includes(state.status)) return;
      const current = ++generation;
      owner = session.user?.id; epoch = session.revision;
      emit({ status:'loading', event:null, message:'Loading the event from the server…' });
      try {
        if (!validPublicId(id)) throw new ApiError('validation', 'Choose a valid event to edit.');
        if (!identityMatches()) throw new ApiError('forbidden', 'Organizer account required.', 403);
        const event = await api.getEvent(id);
        if (current !== generation || !identityMatches()) throw new ApiError('aborted', 'The account changed. Load the event again.');
        if (event.public_id !== id || event.organizer_id !== owner) throw new ApiError('forbidden', 'Only the event organizer can edit this event.', 403);
        eventFormValues(event);
        emit({ status:'ready', event, message:'' });
      } catch (error) {
        if (current === generation) emit({ status:'error', event:null,
          message:`${error.message} Event details could not be loaded; editing is unavailable.` });
      }
    },
    async submit(values) {
      if (['loading', 'submitting', 'success', 'uncertain'].includes(state.status)) return;
      const original = state.event;
      let payload;
      try {
        if (!original) throw new ApiError('verification', 'Load the current event from the server before editing.');
        if (!identityMatches()) throw new ApiError('forbidden', 'Verify the same organizer account before editing.', 403);
        payload = editEventPayload(values, original);
      } catch (error) { emit({ status:'error', event:original, message:error.message }); return; }
      emit({ status:'submitting', event:original, message:'Saving event changes…' });
      let accepted = false;
      try {
        const updated = await session.updateEvent(original.public_id, payload);
        accepted = true;
        if (!identityMatches() || updated.public_id !== original.public_id || updated.id !== original.id) throw new ApiError('contract', 'The saved event identity could not be verified.');
        const reread = await api.getEvent(original.public_id);
        if (!identityMatches() || reread.public_id !== original.public_id || reread.id !== original.id || reread.organizer_id !== owner) throw new ApiError('contract', 'The event readback identity could not be verified.');
        const matches = Object.entries(payload).every(([key, value]) =>
          ['start_time', 'end_time'].includes(key) ? new Date(reread[key]).valueOf() === new Date(value).valueOf() : reread[key] === value);
        if (!matches) throw new ApiError('contract', 'The server readback does not match the requested changes.');
        emit({ status:'success', event:reread, message:'Event updated and read back from the server.' });
      } catch (error) {
        const uncertain = accepted || !identityMatches() || !['unauthorized', 'forbidden', 'verification', 'validation', 'rate_limit'].includes(error.kind);
        emit({ status:uncertain ? 'uncertain' : 'error', event:original,
          message:uncertain ? 'The update result could not be verified. Open the event to check it. Do not submit these changes again.' : error.message });
      }
    },
  };
}

export function mountEditEvent() {
  const id = selectedPublicId(globalThis.location.search);
  const api = createApi();
  const session = createSession({ api, storage:browserSessionStorage() });
  const form = document.querySelector('#edit-event-form');
  const fields = document.querySelector('#event-fields');
  const progress = document.querySelector('#edit-progress');
  const prompt = document.querySelector('#login-prompt');
  const organizerPrompt = document.querySelector('#organizer-prompt');
  const retry = document.querySelector('#edit-retry');
  const view = document.querySelector('#edited-view');
  const removeImage = document.querySelector('#remove-image');
  let populated = null;
  const media = mountEventImageControls({ session, onChange:() => render() });
  const controller = createEditEventController({ api, session, onChange:render });
  const account = mountAccount(session, { onChange() {
    render();
    if (session.user?.role === 'organizer' && controller.state.status === 'idle') controller.load(id);
  } });
  function render() {
    const state = controller.state;
    const organizer = session.user?.role === 'organizer';
    const ownsEvent = organizer && state.event?.organizer_id === session.user.id;
    prompt.hidden = Boolean(session.user);
    organizerPrompt.hidden = !session.user || organizer;
    fields.disabled = !ownsEvent || !['ready', 'error'].includes(state.status)
      || ['submitting', 'uncertain'].includes(media.controller.state.status);
    form.hidden = !state.event || !ownsEvent;
    progress.textContent = state.status === 'success' && !ownsEvent ? '' : state.message;
    progress.hidden = !progress.textContent;
    progress.className = ['error', 'uncertain'].includes(state.status) ? 'notice notice-error' : 'notice';
    retry.hidden = !organizer || state.status !== 'error' || Boolean(state.event) || !id;
    view.hidden = !id;
    if (id) view.href = eventRoute(id);
    form.setAttribute('aria-busy', String(state.status === 'submitting'));
    if (state.event && populated !== state.event && ['ready', 'success'].includes(state.status)) {
      const values = eventFormValues(state.event);
      for (const name of ['title', 'overview', 'location', 'start_time', 'end_time', 'online_quota', 'offline_quota', 'status']) document.querySelector(`#${name}`).value = values[name];
      populated = state.event;
      const currentImage = document.querySelector('#current-event-image');
      currentImage.replaceChildren();
      const image = createEventImage(state.event.image_path);
      if (image) currentImage.append(image);
      currentImage.hidden = !image;
      document.querySelector('#remove-image-field').hidden = !state.event.image_path;
      removeImage.checked = false;
    }
    media.render();
    if (media.url) { removeImage.checked = false; removeImage.disabled = true; }
    document.querySelector('#edit-submit').disabled = fields.disabled || media.blocked;
  }
  document.querySelector('#edit-timezone').textContent = `Dates and times use your browser timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
  retry.addEventListener('click', () => controller.load(id));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (fields.disabled || media.blocked || session.user?.role !== 'organizer' || !form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    values.image_path = removeImage.checked ? null : media.url || controller.state.event.image_path || null;
    controller.submit(values);
  });
  if (!id) progress.textContent = 'Choose a valid event to edit.';
  account.check();
}

if (typeof document !== 'undefined' && document.querySelector('#edit-event-form')) mountEditEvent();
