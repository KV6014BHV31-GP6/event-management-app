import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RegistrationGroups } from './RegistrationGroups.jsx';
import { demoTransport } from './demo-transport.js';
import { changeLanguage } from './i18n/index.js';

it('uses database labels and codes, requires explicit Age choice, and leaves Income optional', async () => {
  vi.spyOn(demoTransport, 'fetch').mockResolvedValue({ok:true,json:async()=>({
    age_groups:[{code:'db-age',name:'Database age label'}],
    income_bands:[{code:'db-income',name:'Database income label'}],
  })});
  const { container } = render(<form><RegistrationGroups /></form>);
  await screen.findByRole('option', {name:'Database age label'});
  const age = screen.getByLabelText('Age group');
  const income = screen.getByLabelText('Income group (optional)');
  expect(age).toHaveValue(''); expect(age).toBeRequired();
  expect(income).toHaveValue(''); expect(income).not.toBeRequired();
  expect(container.querySelector('form').checkValidity()).toBe(false);
  fireEvent.change(age,{target:{value:'db-age'}});
  expect(container.querySelector('form').checkValidity()).toBe(true);
  expect(Object.fromEntries(new FormData(container.querySelector('form')))).toEqual({age_group_code:'db-age',income_band_code:''});
  expect(container.querySelector('[name=date_of_birth]')).toBeNull();
});

it.each(['en','ms'])('shows unset options truthfully and blocks new applications in %s', async language => {
  await changeLanguage(language);
  vi.spyOn(demoTransport, 'fetch').mockResolvedValue({ok:true,json:async()=>({age_groups:[],income_bands:[]})});
  const { container } = render(<form><RegistrationGroups /></form>);
  await waitFor(()=>expect(screen.getAllByText(language==='en'?'Options have not been configured.':'Pilihan belum ditetapkan.')).toHaveLength(2));
  expect(container.querySelector('form').checkValidity()).toBe(false);
  expect(container.querySelector('select[name=age_group_code]').options).toHaveLength(1);
  expect(container.querySelector('select[name=income_band_code]').required).toBe(false);
});
