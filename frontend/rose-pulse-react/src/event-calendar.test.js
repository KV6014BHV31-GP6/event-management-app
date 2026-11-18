import { expect, it } from 'vitest';
import { eventCalendar } from './event-calendar.js';

const event = {
  public_id: 'ABCDEFGHIJKLMNOPQRSTU', status: 'active',
  start_time: '2027-03-15T10:00:00+08:00', end_time: '2027-03-15T12:00:00+08:00',
  title: 'Community session, ' + '你好'.repeat(28) + '\nEND:VEVENT',
  location: 'Hall; West Wing',
};

it('exports real event times in UTC with safely escaped text and UTF-8 folding', () => {
  const calendar = eventCalendar(event, 'https://rosepulse.up.railway.app/', Date.UTC(2026, 10, 18));
  for (const line of calendar.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  const unfolded = calendar.replace(/\r\n /g, '');
  expect(unfolded).toContain('DTSTART:20270315T020000Z\r\nDTEND:20270315T040000Z');
  expect(unfolded).toContain('SUMMARY:Community session\\, ');
  expect(unfolded).toContain('\\nEND:VEVENT\r\nLOCATION:Hall\\; West Wing');
  expect(unfolded.match(/\r\nEND:VEVENT/g)).toHaveLength(1);
});

it('does not export cancelled events, invalid schedule or invalid identity', () => {
  expect(eventCalendar({...event, workflow: {state:'cancelled'}})).toBeNull();
  expect(eventCalendar({...event, end_time: event.start_time})).toBeNull();
  expect(eventCalendar({...event, public_id: 'not-valid'})).toBeNull();
});
