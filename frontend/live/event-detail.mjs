import { createApi } from './api.mjs';
import { createSession, browserSessionStorage } from './session.mjs';
import { mountAccount } from './ui.mjs';
import { selectedPublicId, registrationRoute, loginRoute } from './event-navigation.mjs';
import { createEventImage } from './image-path.mjs';
import { createQuotaView } from './booking-state-view.mjs';

export function createDetailController({ api, onChange = () => {} }) {
  let state = { status: 'idle', event: null, error: null };
  let revision = 0;
  let request;
  const update = next => { state = next; onChange(state); };
  return {
    get state() { return state; },
    async load(id) {
      request?.abort(); request = new AbortController();
      const current = ++revision;
      update({ status: 'loading', event: null, error: null });
      try {
        const event = await api.getEvent(id, { signal: request.signal });
        if (current === revision) update({ status: 'ready', event, error: null });
      } catch (error) {
        if (current === revision && error.kind !== 'aborted') update({ status: 'error', event: null, error });
      }
    },
  };
}

/** Render only fields needed to choose this event; no HTML supplied by the API. */
export function renderEventDetail(event) {
  const picture = document.querySelector('#detail-image');
  if (picture) { picture.replaceChildren(); const image = createEventImage(event.image_path); if (image) picture.append(image); }
  document.querySelector('#detail-quota')?.replaceChildren(createQuotaView(event.quota));
  document.querySelector('#detail-title').textContent = event.title;
  document.querySelector('#detail-overview').textContent = event.overview || 'The organiser has not added an overview yet.';
  document.querySelector('#detail-status').textContent = event.status;
  document.querySelector('#detail-status').className = `status-badge${event.status.toLowerCase() === 'active' ? '' : ' inactive'}`;
  document.querySelector('#detail-location').textContent = event.location;
  for (const part of ['start', 'end']) {
    const target = document.querySelector(`#detail-${part}`);
    target.dateTime = event[`${part}_time`];
    target.textContent = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(event[`${part}_time`]));
  }
}

export function mountEventDetail() {
  const id = selectedPublicId(globalThis.location.search);
  const api = createApi();
  const session = createSession({ api, storage: browserSessionStorage() });
  const status = document.querySelector('#detail-message');
  const content = document.querySelector('#detail-content');
  const apply = document.querySelector('#choose-event');
  let loaded = null;
  function renderEdit() {
    const edit = document.querySelector('#edit-event-link');
    if (!edit) return;
    edit.hidden = !loaded || session.user?.role !== 'organizer' || session.user.id !== loaded.organizer_id;
    if (!edit.hidden) edit.href = `./edit-event.html?event=${encodeURIComponent(loaded.public_id)}`;
  }
  mountAccount(session, { loginHref: id ? loginRoute(id) : './login.html', onChange: renderEdit }).check();
  const controller = createDetailController({ api, onChange(state) {
    loaded = state.event; renderEdit();
    content.hidden = state.status !== 'ready';
    status.hidden = state.status === 'ready';
    status.textContent = state.status === 'loading' ? 'Loading event details…' : state.error?.message || '';
    status.className = `notice${state.status === 'error' ? ' notice-error' : ''}`;
    document.querySelector('#detail-retry').hidden = state.status !== 'error' || !id || ['validation', 'not_found'].includes(state.error?.kind);
    if (state.event) {
      renderEventDetail(state.event);
      apply.hidden = state.event.status.toLowerCase() !== 'active';
      apply.href = registrationRoute(state.event.public_id);
      document.querySelector('#not-accepting').hidden = !apply.hidden;
    }
  } });
  document.querySelector('#detail-retry').addEventListener('click', () => controller.load(id));
  controller.load(id);
}
if (typeof document !== 'undefined' && document.querySelector('#detail-content')) mountEventDetail();
