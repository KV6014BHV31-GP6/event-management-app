import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoControls } from './DemoControls.jsx';
import { demoTransport } from './demo-transport.js';
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
