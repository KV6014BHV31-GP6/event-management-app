import { ApiError, createApi } from './api.mjs';
import { createSession, browserSessionStorage } from './session.mjs';
import { element, mountAccount } from './ui.mjs';
import { bookingStatusLabel, createBookingStateView } from './booking-state-view.mjs';

const states = new Set(['pending', 'approved', 'waiting', 'rejected', 'cancelled']);
const cancellable = new Set(['pending', 'approved', 'waiting']);
const reference = value => typeof value === 'string' && value.length > 0;
const recordShape = value => value && reference(value.id) && Number.isSafeInteger(value.event_id)
  && value.event_id > 0 && typeof value.status === 'string';
const uncertainMessage = 'The action result is unknown. Do not send it again. Refresh the records and ask the organiser to check.';

/** Private records stay in this page only. Every refresh uses the existing Session. */
export function createRegistrationsController({ session, mode = 'my', onChange = () => {} }) {
  if (!['my', 'organizer'].includes(mode)) throw new TypeError('Unknown registration page mode.');
  const role = mode === 'my' ? 'user' : 'organizer';
  const requirement = mode === 'my' ? 'Participant account required.' : 'Organizer account required.';
  let identity = null;
  let generation = 0;
  let detailGeneration = 0;
  let busy = false;
  const uncertain = new Set();
  let state = { status: 'idle', filter: '', records: [], message: '', actionMessage: '', actionError: false,
    actionId: null, detail: null, detailStatus: 'idle', detailMessage: '' };
  const emit = patch => { state = { ...state, ...patch }; onChange(state); };
  const currentIdentity = () => session.user?.role === role && reference(session.user?.id)
    ? `${session.revision}:${session.user.id}:${role}` : null;
  function accountChanged() {
    const next = currentIdentity();
    if (next !== identity || next === null) {
      identity = next; generation += 1; detailGeneration += 1; busy = false; uncertain.clear();
      emit({ status: next ? 'idle' : 'blocked', records: [], detail: null, detailStatus: 'idle', detailMessage: '',
        actionId: null, actionMessage: '', actionError: false,
        message: next ? '' : session.user ? requirement : 'Log in and verify your account to view registrations.' });
    }
    return Boolean(next);
  }
  function stillCurrent(key, request) {
    if (request !== generation) return false;
    if (currentIdentity() !== key) { accountChanged(); return false; }
    return true;
  }
  function validateRecords(records) {
    if (!Array.isArray(records) || records.some(record => !recordShape(record))
      || new Set(records.map(record => record.id)).size !== records.length
      || (mode === 'my' && records.some(record => record.created_by_user_id !== session.user.id))) {
      throw new ApiError('contract', 'The registration response could not be verified. No records are shown.');
    }
    return records;
  }
  async function load(status = state.filter, { actionMessage = state.actionMessage, actionError = state.actionError } = {}) {
    if (!accountChanged() || busy) return;
    if (status !== '' && !states.has(status)) {
      emit({ status: 'error', records: [], message: 'Choose a valid registration status.' }); return;
    }
    const request = ++generation; const key = identity;
    detailGeneration += 1;
    emit({ status: 'loading', filter: status, records: [], message: 'Loading registrations…', detail: null,
      detailStatus: 'idle', detailMessage: '', actionMessage, actionError });
    try {
      const options = status ? { status } : {};
      const records = await (mode === 'my' ? session.getMyRegistrations(options) : session.getOrganizerRegistrations(options));
      if (!stillCurrent(key, request)) return;
      validateRecords(records);
      if (status && records.some(record => record.status !== status)) throw new ApiError('contract', 'The filtered registration response could not be verified.');
      emit({ status: 'ready', records, message: records.length ? '' : 'No registrations match this status.' });
    } catch (error) {
      if (!stillCurrent(key, request)) return;
      emit({ status: 'error', records: [], message: error.message || 'Registrations could not be loaded. Refresh to try reading again.' });
    }
  }
  async function detail(id) {
    if (!accountChanged() || mode !== 'organizer' || busy || !state.records.some(record => record.id === id)) return;
    const request = ++detailGeneration; const listRequest = generation; const key = identity;
    emit({ detail: null, detailStatus: 'loading', detailMessage: 'Loading registration details…' });
    try {
      const record = await session.getRegistration(id);
      if (request !== detailGeneration || !stillCurrent(key, listRequest)) return;
      if (!recordShape(record) || record.id !== id) throw new ApiError('contract', 'The registration details could not be verified.');
      emit({ detail: record, detailStatus: 'ready', detailMessage: '' });
    } catch (error) {
      if (request !== detailGeneration || !stillCurrent(key, listRequest)) return;
      emit({ detail: null, detailStatus: 'error', detailMessage: error.message || 'Registration details could not be loaded.' });
    }
  }
  async function mutate(id, operation, confirmed) {
    if (!accountChanged() || busy || uncertain.has(id) || state.status !== 'ready') return;
    const record = state.records.find(item => item.id === id);
    const cancel = operation === 'cancel';
    if (!record || (cancel && (mode !== 'my' || !confirmed || !cancellable.has(record.status)
      || record.created_by_user_id !== session.user.id))
      || (!cancel && (mode !== 'organizer' || record.status !== 'pending'))) return;
    const key = identity; const request = generation;
    busy = true; detailGeneration += 1;
    emit({ actionId: id, actionMessage: cancel ? 'Cancelling this registration…' : 'Submitting the approval request…',
      actionError: false, detail: null, detailStatus: 'idle', detailMessage: '' });
    try {
      const result = await (cancel ? session.cancelRegistration(id) : session.approveRegistration(id));
      if (!stillCurrent(key, request)) return;
      if (!recordShape(result) || result.id !== id || result.event_id !== record.event_id
        || result.participant_id !== record.participant_id || result.created_by_user_id !== record.created_by_user_id
        || (cancel ? result.status !== 'cancelled' : !['approved', 'waiting'].includes(result.status))) {
        throw new ApiError('contract', uncertainMessage);
      }
      busy = false;
      const message = `The server returned ${bookingStatusLabel(result.status)}. Records are being read again.`;
      emit({ actionId: null, actionMessage: message });
      await load(state.filter, { actionMessage: message, actionError: false });
    } catch (error) {
      if (!stillCurrent(key, request)) return;
      const rejected = [400, 401, 403, 404, 409, 422, 429].includes(error.status)
        || ['validation', 'verification', 'unauthorized', 'forbidden'].includes(error.kind);
      if (!rejected) uncertain.add(id);
      busy = false;
      emit({ actionId: null, actionMessage: rejected ? error.message : uncertainMessage, actionError: true });
    } finally {
      if (identity === key && generation === request) busy = false;
    }
  }
  return {
    get state() { return state; }, get busy() { return busy; },
    accountChanged, load, detail,
    locked: id => busy || uncertain.has(id),
    cancel: (id, { confirmed = false } = {}) => mutate(id, 'cancel', confirmed),
    approve: id => mutate(id, 'approve', true),
  };
}

export function mountRegistrationsPage({ session: providedSession = null } = {}) {
  const main = document.querySelector('[data-registration-page]');
  if (!main) return;
  const mode = main.dataset.registrationPage;
  const session = providedSession ?? createSession({ api: createApi(), storage: browserSessionStorage() });
  const list = document.querySelector('#registrations-list');
  const message = document.querySelector('#registrations-message');
  const actionMessage = document.querySelector('#registrations-action-message');
  const access = document.querySelector('#registrations-access');
  const filterForm = document.querySelector('#registrations-filter-form');
  const filter = document.querySelector('#registrations-filter');
  const refresh = document.querySelector('#registrations-refresh');
  const detailPanel = document.querySelector('#registration-detail');
  const controller = createRegistrationsController({ session, mode, onChange: render });
  const account = mountAccount(session, {
    onChange() { if (controller.accountChanged()) controller.load(filter.value); },
    onLogout() { controller.accountChanged(); },
  });
  function labelled(dl, title, value) {
    dl.append(element('dt', '', title), element('dd', '', String(value)));
  }
  function recordView(record, detailed = false) {
    const card = element('article', 'event-card application-receipt');
    card.append(element('h2', '', `Event reference: ${record.event_id}`));
    const refs = element('dl');
    labelled(refs, 'Application reference', record.id);
    if (mode === 'organizer') labelled(refs, 'Applicant', `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Name unavailable');
    if (detailed) {
      labelled(refs, 'Participant reference', record.participant_id);
      labelled(refs, 'Application channel', record.channel);
      labelled(refs, 'Submitted', typeof record.created_at === 'string' ? record.created_at : 'Unavailable');
    }
    card.append(refs, createBookingStateView({ status: record.status }));
    const actions = element('div', 'application-actions');
    if (mode === 'organizer' && !detailed) {
      const view = element('button', 'button button-quiet', 'View details'); view.type = 'button';
      view.disabled = controller.busy; view.addEventListener('click', () => controller.detail(record.id)); actions.append(view);
    }
    if (!detailed && ((mode === 'my' && cancellable.has(record.status)) || (mode === 'organizer' && record.status === 'pending'))) {
      const action = element('button', 'button button-quiet', mode === 'my' ? 'Cancel registration' : 'Approve'); action.type = 'button';
      action.disabled = controller.locked(record.id);
      action.addEventListener('click', () => {
        if (action.disabled) return;
        if (mode === 'my') {
          if (globalThis.confirm('Cancel this registration? The server will determine any change to places or waiting registrations.')) {
            controller.cancel(record.id, { confirmed: true });
          }
        } else controller.approve(record.id);
      });
      actions.append(action);
    }
    if (actions.children.length) card.append(actions);
    return card;
  }
  function render(state) {
    const allowed = session.user?.role === (mode === 'my' ? 'user' : 'organizer');
    access.hidden = allowed;
    if (!allowed) {
      access.replaceChildren();
      if (session.user) access.textContent = mode === 'my' ? 'Participant account required.' : 'Organizer account required.';
      else {
        const login = element('a', '', 'Log in'); login.href = './login.html';
        access.append(login, element('span', '', mode === 'my' ? ' with your participant account, then return to My registrations.' : ' with your organizer account, then return to Registration review.'));
      }
    }
    filterForm.hidden = !allowed;
    filter.disabled = refresh.disabled = !allowed || state.status === 'loading' || controller.busy;
    message.textContent = state.message;
    message.hidden = !state.message;
    message.className = state.status === 'error' ? 'notice notice-error' : 'notice';
    actionMessage.textContent = state.actionMessage;
    actionMessage.hidden = !state.actionMessage;
    actionMessage.className = state.actionError ? 'notice notice-error' : 'notice';
    list.setAttribute('aria-busy', String(state.status === 'loading' || controller.busy));
    list.replaceChildren();
    if (allowed) for (const record of state.records) list.append(recordView(record));
    detailPanel.replaceChildren();
    detailPanel.hidden = !allowed || state.detailStatus === 'idle';
    if (!detailPanel.hidden) {
      if (state.detail) detailPanel.append(recordView(state.detail, true));
      else detailPanel.append(element('p', state.detailStatus === 'error' ? 'notice notice-error' : 'notice', state.detailMessage));
    }
    account.render();
  }
  filterForm.addEventListener('submit', event => { event.preventDefault(); if (!refresh.disabled) controller.load(filter.value); });
  filter.addEventListener('change', () => { if (!filter.disabled) controller.load(filter.value); });
  account.check();
  return { controller, session, account };
}
if (typeof document !== 'undefined' && document.querySelector('[data-registration-page]')) mountRegistrationsPage();
