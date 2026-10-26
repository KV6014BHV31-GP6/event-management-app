// UI preparation only: explicit component inputs, not an admitted live API contract.
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
