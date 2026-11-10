import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoControls, DemoToolsProvider } from './DemoControls.jsx';
import { demoTransport } from './demo-transport.js';
import { DemoFormTemplate, ParticipantFields } from './ApplicationFields.jsx';
import { FilePicker } from './FilePicker.jsx';
import { changeLanguage } from './i18n/index.js';

vi.mock('./demo-transport.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    DEMO_PROFILE: true,
    demoTransport: original.createDemoTransport({ enabled: true, storage: null }),
  };
});

it('starts collapsed, remains keyboard reachable and expands without a transport action', async () => {
  const offline = vi.spyOn(demoTransport, 'offline');
  const restore = vi.spyOn(demoTransport, 'restore');
  const loseAck = vi.spyOn(demoTransport, 'loseNextAck');
  const navigate = vi.fn();
  const user = userEvent.setup();
  render(<DemoControls navigate={navigate} />);

  const disclosure = screen.getByText('Demo tools · Synthetic data');
  expect(disclosure.closest('details')).not.toHaveAttribute('open');
  expect(screen.getByText('Simulated Offline')).not.toBeVisible();
  await user.tab();
  expect(disclosure).toHaveFocus();
  await user.click(disclosure);
  expect(disclosure.closest('details')).toHaveAttribute('open');
  expect(screen.getByRole('button', {name: 'Simulated Offline'})).toBeVisible();
  expect(screen.getByRole('button', {name: 'Restore Connection'})).toBeVisible();
  expect(screen.getByRole('button', {name: 'Lose next sync acknowledgement'})).toBeVisible();
  expect(screen.getByRole('button', {name: 'Reconcile'})).toBeVisible();
  await user.click(disclosure);
  expect(disclosure.closest('details')).not.toHaveAttribute('open');
  for (const action of [offline, restore, loseAck, navigate]) expect(action).not.toHaveBeenCalled();
});

it('keeps the synthetic-data label visible in Malay while collapsed', async () => {
  await changeLanguage('ms');
  render(<DemoControls navigate={vi.fn()} />);
  expect(screen.getByText('Alat demo · Data sintetik')).toBeVisible();
  expect(screen.getByText('Alat demo · Data sintetik').closest('details')).not.toHaveAttribute('open');
});

it('fills the current application from Demo tools without submitting or replacing typed values', async () => {
  const submit = vi.fn((event) => event.preventDefault());
  const user = userEvent.setup();
  const view = render(<DemoToolsProvider><DemoControls />
    <form aria-label="Demo application" onSubmit={submit}>
      <ParticipantFields />
      <input type="checkbox" name="consent" aria-label="Consent" />
    </form>
  </DemoToolsProvider>);
  const form = screen.getByRole('form', {name: 'Demo application'});
  await user.type(within(form).getByLabelText('First name'), 'Entered');
  await user.click(screen.getByText('Demo tools · Synthetic data'));
  const tools = screen.getByText('Demo tools · Synthetic data').closest('details');
  await user.click(within(tools).getByRole('button', {name: 'Fill synthetic demo details'}));
  const values = new FormData(form);
  expect(values.get('first_name')).toBe('Entered');
  expect(values.get('last_name')).toMatch(/^Sample [a-f0-9]{8}$/);
  expect(values.get('national_id')).toMatch(/^DEMO-/);
  expect(values.get('phone')).toMatch(/^0000[0-9]{8}$/);
  expect(['female', 'male']).toContain(values.get('gender'));
  expect(values.has('consent')).toBe(false);
  expect(submit).not.toHaveBeenCalled();

  view.rerender(<DemoToolsProvider><DemoControls /></DemoToolsProvider>);
  expect(within(tools).queryByRole('button', {name: 'Fill synthetic demo details'})).not.toBeInTheDocument();
});

it('fills a native select and leaves account-linked National ID untouched', async () => {
  const user = userEvent.setup();
  render(<form>
    <DemoFormTemplate preserveNationalId />
    <input name="national_id" aria-label="National ID" defaultValue="DEMO-existing-linked-id" />
    <select name="gender" aria-label="Gender" defaultValue="">
      <option value="">Choose</option>
      <option value="male">Male</option>
      <option value="female">Female</option>
    </select>
  </form>);
  await user.click(screen.getByRole('button', {name: 'Fill synthetic demo details'}));
  expect(screen.getByLabelText('National ID')).toHaveValue('DEMO-existing-linked-id');
  expect(['male', 'female']).toContain(screen.getByLabelText('Gender').value);
});

it('preselects the bundled PDF from Demo tools without uploading or consenting', async () => {
  const user = userEvent.setup();
  const uploadFile = vi.fn();
  const onChange = vi.fn();
  render(<DemoToolsProvider><DemoControls />
    <FilePicker runtime={{api: {uploadFile}}} purpose="supporting_document" allowDemoSample
      onChange={onChange} onBlocked={vi.fn()} />
  </DemoToolsProvider>);
  await user.click(screen.getByText('Demo tools · Synthetic data'));
  const tools = screen.getByText('Demo tools · Synthetic data').closest('details');
  await user.click(within(tools).getByRole('button', {name: 'Select synthetic demo document'}));
  expect(screen.getByText('synthetic-demo-supporting-document.pdf')).toBeVisible();
  expect(screen.getByText('Selected file — awaiting upload')).toBeVisible();
  expect(screen.getByRole('link', {name: 'Download to view PDF'})).toHaveAttribute('download', 'synthetic-demo-supporting-document.pdf');
  expect(screen.getByRole('checkbox', {name: /synthetic test data only/})).not.toBeChecked();
  expect(screen.getByRole('button', {name: 'Upload selected files'})).toBeDisabled();
  expect(onChange.mock.lastCall[0]).toEqual([]);
  expect(uploadFile).not.toHaveBeenCalled();
});

it.each([
  ['http://127.0.0.1:5291', 'ac40s1_px', 'user', 'SYNTHETIC_AC40_PX'],
  ['http://127.0.0.1:5291', 'different-participant', 'user', ''],
  ['http://127.0.0.1:5291', 'ac40s1_px', 'leader', ''],
  ['https://demo.example.com', 'ac40s1_px', 'user', ''],
])('fills the linked fixture ID only for the verified local participant on %s', async (origin, username, role, expected) => {
  vi.stubGlobal('location', new URL(origin));
  render(<form><ParticipantFields preserveNationalId account={{ username, role }} /></form>);
  await userEvent.click(screen.getByRole('button', {name: 'Fill synthetic demo details'}));
  expect(screen.getByLabelText('National ID')).toHaveValue(expected);
});
