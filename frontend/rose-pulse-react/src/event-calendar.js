const validId = id => /^[A-Za-z0-9_-]{21}$/.test(id);
const dateField = date => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const escapeText = value => String(value ?? '').replace(/\\/g, '\\\\')
  .replace(/\r\n|\r|\n/g, '\\n').replace(/[,;]/g, '\\$&');

export function canAddToCalendar(event) {
  const status = event.workflow?.state || event.status;
  return ['active', 'published'].includes(status) && validId(event.public_id) &&
    Number.isFinite(Date.parse(event.start_time)) && Date.parse(event.end_time) > Date.parse(event.start_time);
}

function foldLine(line) {
  const encoder = new TextEncoder();
  let folded = '', width = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (width + size > 75) {
      folded += '\r\n ';
      width = 1;
    }
    folded += character;
    width += size;
  }
  return folded;
}

export function eventCalendar(event, url, now = Date.now()) {
  if (!canAddToCalendar(event)) return null;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ROSE PULSE//Community events//EN',
    'BEGIN:VEVENT', 'UID:' + event.public_id + '@rose-pulse',
    'DTSTAMP:' + dateField(now), 'DTSTART:' + dateField(event.start_time),
    'DTEND:' + dateField(event.end_time), 'SUMMARY:' + escapeText(event.title),
    'LOCATION:' + escapeText(event.location),
    ...(url ? ['URL:' + url] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ].map(foldLine).join('\r\n') + '\r\n';
}

export function downloadEventCalendar(event, url) {
  const calendar = eventCalendar(event, url);
  if (!calendar) return;
  const objectUrl = URL.createObjectURL(new Blob([calendar], {type: 'text/calendar;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = 'rose-pulse-event.ics';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
