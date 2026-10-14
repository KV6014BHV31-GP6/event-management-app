import { createApi } from './api.mjs';
import { createSession, browserSessionStorage } from './session.mjs';
import { createEventsController, paginationModel } from './events-state.mjs';
import { element, mountAccount } from './ui.mjs';

const api = createApi();
const session = createSession({ api, storage: browserSessionStorage() });
const account = mountAccount(session);
const content = document.querySelector('#event-content');
const summary = document.querySelector('#results-summary');
const pageSize = document.querySelector('#page-size');
const pagination = document.querySelector('#pagination');
const refresh = document.querySelector('#refresh-events');
const count = document.querySelector('#event-count');
const pageInput = document.querySelector('#page-number');
const dateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
let focusResults = false;

document.querySelector('#timezone-note').textContent = `Times shown in ${Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ')}.`;

function detailIcon(symbol) {
  const icon = element('span', 'detail-icon');
  icon.setAttribute('aria-hidden', 'true');
  if (symbol !== 'location') { icon.textContent = symbol; return icon; }
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', width: '17', height: '22', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', focusable: 'false' })) svg.setAttribute(name, value);
  const outline = document.createElementNS(namespace, 'path');
  outline.setAttribute('d', 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z');
  const center = document.createElementNS(namespace, 'circle');
  center.setAttribute('cx', '12');
  center.setAttribute('cy', '10');
  center.setAttribute('r', '3');
  svg.append(outline, center);
  icon.append(svg);
  return icon;
}

function createCard(event) {
  const article = element('article', 'event-card');
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const top = element('div', 'event-card-top');
  const tile = element('div', 'date-tile');
  tile.setAttribute('aria-hidden', 'true');
  tile.append(element('strong', '', String(start.getDate()).padStart(2, '0')), element('span', '', start.toLocaleDateString('en', { month: 'short' })));
  const status = element('span', `status-badge${event.status === 'ACTIVE' ? '' : ' inactive'}`, event.status);
  status.setAttribute('aria-label', `Event status: ${event.status}`);
  top.append(tile, status);
  article.append(top, element('h3', '', event.title || 'Untitled event'), element('p', 'event-overview', event.overview || 'The organiser hasn’t added an overview yet.'));
  const details = element('div', 'event-details');
  function row(label, symbol) {
    const wrapper = element('div', 'event-detail');
    const icon = detailIcon(symbol);
    const description = element('dl', 'event-description');
    const value = element('dd');
    description.append(element('dt', '', label), value);
    wrapper.append(icon, description);
    details.append(wrapper);
    return value;
  }
  const when = row('Date & time', '◷');
  const startLabel = element('time', '', `${dateFormat.format(start)} · ${timeFormat.format(start)}`);
  startLabel.dateTime = event.start_time;
  const sameDay = start.toDateString() === end.toDateString();
  const endLabel = element('time', '', `Until ${sameDay ? '' : `${dateFormat.format(end)} · `}${timeFormat.format(end)}`);
  endLabel.dateTime = event.end_time;
  when.append(startLabel, endLabel);
  row('Location', 'location').textContent = event.location || 'Location to be confirmed';
  article.append(details);
  return article;
}

function statePanel(title, message, { loading = false, retry = false } = {}) {
  const panel = element('div', 'state-panel');
  const symbol = element('span', loading ? 'spinner' : 'state-symbol', loading ? '' : '✳');
  symbol.setAttribute('aria-hidden', 'true');
  panel.append(symbol, element('h3', '', title), element('p', '', message));
  if (retry) {
    const button = element('button', 'button', 'Try again');
    button.type = 'button';
    button.addEventListener('click', () => controller.load());
    panel.append(button);
  }
  return panel;
}

function render(state) {
  const loading = state.status === 'loading';
  content.setAttribute('aria-busy', String(loading));
  refresh.disabled = loading;
  pageSize.disabled = loading;
  pagination.hidden = true;
  count.hidden = true;
  content.replaceChildren();
  if (loading) {
    summary.textContent = 'Loading events…';
    content.append(statePanel('Finding community events…', 'This should only take a moment.', { loading: true }));
    return;
  }
  if (state.status === 'error') {
    summary.textContent = 'Events couldn’t be loaded.';
    content.append(statePanel('Let’s try that again.', state.error.message, { retry: true }));
    return;
  }
  const model = paginationModel(state.result);
  count.textContent = String(model.total);
  count.hidden = false;
  if (model.total === 0) {
    summary.textContent = 'No events to show yet.';
    content.append(statePanel('Something to look forward to.', 'There are no community events listed yet. Check back soon, or refresh to see what’s new.'));
  } else if (state.result.data.length === 0) {
    summary.textContent = 'No events on this page.';
    content.append(statePanel('This page has changed.', 'The event list has changed since your last request. Refresh to get the latest events.', { retry: true }));
  } else {
    summary.textContent = `Showing ${model.first}–${model.last} of ${model.total} ${model.total === 1 ? 'event' : 'events'}`;
    const grid = element('div', 'event-grid');
    grid.append(...state.result.data.map(createCard));
    content.append(grid);
  }
  if (model.pages > 1) {
    pagination.hidden = false;
    document.querySelector('#first-page').disabled = !model.hasPrevious;
    document.querySelector('#previous-page').disabled = !model.hasPrevious;
    document.querySelector('#next-page').disabled = !model.hasNext;
    document.querySelector('#last-page').disabled = !model.hasNext;
    pageInput.value = String(model.page);
    pageInput.max = String(model.pages);
    document.querySelector('#page-total').textContent = `of ${model.pages}`;
  }
  if (focusResults) { document.querySelector('#events-heading').focus({ preventScroll: true }); focusResults = false; }
}

const controller = createEventsController({ api, onChange: render });
function navigate(page) { focusResults = true; controller.load(page); }
document.querySelector('#first-page').addEventListener('click', () => navigate(1));
document.querySelector('#previous-page').addEventListener('click', () => navigate(controller.state.page - 1));
document.querySelector('#next-page').addEventListener('click', () => navigate(controller.state.page + 1));
document.querySelector('#last-page').addEventListener('click', () => navigate(controller.state.result.total_pages));
document.querySelector('#page-jump').addEventListener('submit', event => { event.preventDefault(); navigate(Number(pageInput.value)); });
pageSize.addEventListener('change', () => { focusResults = true; controller.load(1, Number(pageSize.value)); });
refresh.addEventListener('click', () => controller.load());
account.check();
controller.load();
