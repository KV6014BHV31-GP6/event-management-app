// Status labels are shared by live reads and the preserved UI-only component.
import { validatedQuota } from './api.mjs';
const labels = new Map([
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['waiting', 'Waiting'],
  ['rejected', 'Rejected'],
  ['cancelled', 'Cancelled'],
]);

export function bookingStatusLabel(status) {
  return typeof status === 'string' ? labels.get(status) ?? 'Unknown' : 'Unknown';
}

/** Detached display only. No trusted quota is admitted, so no count is inferred. */
export function createBookingStateView(value, document = globalThis.document) {
  const view = document.createElement('dl');
  for (const [term, text] of [
    ['Registration status', bookingStatusLabel(value?.status)],
    ['Quota', 'Unavailable'],
  ]) {
    const heading = document.createElement('dt');
    heading.textContent = term;
    const detail = document.createElement('dd');
    detail.textContent = text;
    view.append(heading, detail);
  }
  return view;
}

/** Called only with a real response's quota; absent/inconsistent counts remain unavailable. */
export function createQuotaView(value, document = globalThis.document) {
  const quota = validatedQuota(value);
  const view = document.createElement('dl');
  const entries = quota ? [
    ['Online approved / capacity', `${quota.online.approved} / ${quota.online.capacity}`],
    ['Offline approved / capacity', `${quota.offline.approved} / ${quota.offline.capacity}`],
    ['Total approved / capacity', `${quota.total.approved} / ${quota.total.capacity}`],
    ['Waiting applications', String(quota.waitingCount)],
  ] : [['Quota', 'Unavailable']];
  for (const [term, text] of entries) {
    const dt = document.createElement('dt'); dt.textContent = term;
    const dd = document.createElement('dd'); dd.textContent = text;
    view.append(dt, dd);
  }
  return view;
}
