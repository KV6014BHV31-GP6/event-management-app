import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoControls, DemoToolsProvider } from './DemoControls.jsx';
import { demoTransport } from './demo-transport.js';
import { DemoFormTemplate, ParticipantFields } from './ApplicationFields.jsx';
import { FilePicker } from './FilePicker.jsx';
import { createSyntheticDemoPdfBytes } from './demo-assets/synthetic-demo-pdf.js';
import JourneyWorkspace from './JourneyWorkspace.jsx';
import { changeLanguage } from './i18n/index.js';

it('creates a single-page, fictional PDF fixture in memory without raw bundled PDF bytes', () => {
  const bytes = createSyntheticDemoPdfBytes();
  const pdf = new TextDecoder().decode(bytes);
  expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
  expect(pdf).toContain('Fictional attachment. No real personal data.');
  expect(pdf).toMatch(/startxref\n\d+\n%%EOF\n$/);
  expect(bytes.length).toBeLessThan(1024);
});

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

it('uses one managed submit to attach the bundled file, then retains its reference after refusal', async () => {
  vi.stubGlobal('location', new URL('http://127.0.0.1:5291'));
  const user = userEvent.setup();
  const event = {public_id: 'ABCDEFGHIJKLMNOPQRSTU', title: 'Synthetic form event'};
  const actor = {id: 'demo-participant', username: 'ac40s1_px', role: 'user'};
  const file = {id: '01K00000000000000000000001', name: 'synthetic-demo-supporting-document.pdf'};
  const reference = '01K00000000000000000000002';
  let releaseUpload;
  const uploadFile = vi.fn(() => new Promise(resolve => { releaseUpload = resolve; }));
  const appPost = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce({ok: false, status: 422, json: async () => ({detail: {code: 'INVALID_INPUT', message: 'Invalid input'}})})
    .mockImplementationOnce(async (_url, request) => {
      const body = JSON.parse(request.body);
      return {ok: true, status: 200, json: async () => ({
        contract_version: body.contract_version, operation_id: body.operation_id, outcome: 'applied',
        kind: 'application_create', resource_id: reference, effects: {registration_id: reference, status: 'pending'},
      })};
    });
  render(<JourneyWorkspace initialEvent={event.public_id} initialPublicEvent={event}
    auth={{user: actor, revision: 1}} navigate={vi.fn()}
    runtime={{api: {uploadFile}, withVerifiedAccount: fn => fn('synthetic-token', actor)}} />);
  const form = screen.getByRole('form', {name: 'Submit application'});
  const submit = within(form).getByRole('button', {name: 'Submit application'});
  await user.click(within(form).getByRole('button', {name: 'Select synthetic demo document'}));
  expect(within(form).getByText('The demo PDF will be uploaded when you submit.')).toBeVisible();
  await user.click(submit);
  expect(uploadFile).not.toHaveBeenCalled();
  await user.click(within(form).getByRole('button', {name: 'Fill synthetic demo details'}));
  expect(within(form).getByLabelText('Age group')).toHaveValue('');
  await user.selectOptions(within(form).getByLabelText('Age group'), '18_29');
  await user.click(submit);
  await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
  fireEvent.submit(form);
  expect(uploadFile).toHaveBeenCalledTimes(1);
  expect(appPost).not.toHaveBeenCalled();
  releaseUpload(file);
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid input');
  expect(JSON.parse(appPost.mock.calls[0][1].body).data.application.file_ids).toEqual([file.id]);
  expect(screen.getByText('Uploaded file')).toBeVisible();
  await user.click(submit);
  expect(await screen.findByRole('dialog', {name: 'Application submitted successfully'})).toHaveTextContent(reference);
  expect(uploadFile).toHaveBeenCalledTimes(1);
  expect(JSON.parse(appPost.mock.calls[1][1].body).data.application.file_ids).toEqual([file.id]);
});

it('blocks a filename lookalike and prevents a second upload after an unknown acknowledgement', async () => {
  vi.stubGlobal('location', new URL('http://127.0.0.1:5291'));
  const picker = React.createRef();
  const user = userEvent.setup();
  const uploadFile = vi.fn().mockRejectedValue(new Error('response lost'));
  const runtime = {api: {uploadFile}, withVerifiedAccount: fn => fn('synthetic-token')};
  render(<FilePicker runtime={runtime} ref={picker} purpose="supporting_document" allowDemoSample
    onChange={vi.fn()} onBlocked={vi.fn()} />);
  await user.upload(screen.getByLabelText(/Supporting documents/), new File(
    ['%PDF-'], 'synthetic-demo-supporting-document.pdf', {type: 'application/pdf'},
  ));
  expect(picker.current.hasDemoUpload).toBe(false);
  expect(await picker.current.prepareSubmission()).toBeNull();
  expect(uploadFile).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', {name: 'Remove file 1'}));
  await user.click(screen.getByRole('button', {name: 'Select synthetic demo document'}));
  expect(await picker.current.prepareSubmission()).toBeNull();
  expect(await screen.findByRole('alert')).toHaveTextContent(/upload result is unknown/);
  expect(await picker.current.prepareSubmission()).toBeNull();
  expect(uploadFile).toHaveBeenCalledTimes(1);
});
