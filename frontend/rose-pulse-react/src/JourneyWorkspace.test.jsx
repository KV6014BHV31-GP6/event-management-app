import React from 'react';
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JourneyWorkspace from './JourneyWorkspace.jsx';
const response = data => ({
  ok: true,
  status: 200,
  json: async () => data
});
beforeEach(() => localStorage.clear());
it('submits all six admitted fields and explicit Direct source through the real application form', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    const body = JSON.parse(options.body);
    return response({
      contract_version: body.contract_version,
      operation_id: body.operation_id,
      outcome: 'applied',
      resource_id: 'reg',effects:{registration_id:'reg',status:'pending'}
    });
  });
  render(<JourneyWorkspace runtime={{}} auth={{
    user: null,
    revision: 1
  }} initialEvent="123456789012345678901" navigate={() => {}} />);
  const form = screen.getByRole('form', {
    name: 'Submit application'
  });
  const user = userEvent.setup();
  for (const [label, value] of [['First name', 'Siti'], ['Last name', 'Demo'], ['Phone', '00000001'], ['National ID', 'SIM-0001']]) await user.type(within(form).getByLabelText(label), value);
  fireEvent.change(within(form).getByLabelText('Date of birth'), {
    target: {
      value: '1990-01-01'
    }
  });
  await user.click(within(form).getByRole('button', {
    name: 'Submit application'
  }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const [path, options] = fetch.mock.calls[0];
  expect(path).toBe('/api/v2/operations/events/123456789012345678901/applications');
  expect(JSON.parse(options.body).data).toEqual({
    application: {
      first_name: 'Siti',
      last_name: 'Demo',
      phone: '00000001',
      national_id: 'SIM-0001',
      gender: 'male',
      date_of_birth: '1990-01-01'
    },
    source: {
      kind: 'direct',
      referral_code: null
    }
  });
  expect(await screen.findByText('Saved by server. Current information has been read again.')).toBeInTheDocument();
});
it('selects a named registration and gates review/correction to server allowed actions', async () => {
  const reg = {
    id: 'reg',
    first_name: 'Siti',
    last_name: 'Demo',
    status: 'pending',
    supporting_documents: []
  };
  const runtime = {
    withVerifiedAccount: fn => fn('token', {
      id: 'owner'
    }),
    api: {
      getOrganizerRegistrations: vi.fn(async () => [reg])
    }
  };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
    registration: reg,
    version: 3,
    review: {
      state: 'awaiting_review',
      reason: ''
    },
    booking_state: 'pending',
    offer: null,
    allowed_actions: ['reject', 'request_correction', 'cancel']
  }));
  render(<JourneyWorkspace runtime={runtime} auth={{
    user: {
      id: 'owner',
      role: 'organizer'
    },
    revision: 1
  }} navigate={() => {}} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {
    name: 'Choose a registration'
  }));
  await waitFor(() => expect(screen.getByRole('option', {
    name: 'Siti Demo · pending'
  })).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText('Participant'), 'reg');
  await user.click(screen.getByRole('button', {
    name: 'Read registration'
  }));
  const form = await screen.findByRole('form', {
    name: 'Review application'
  });
  expect(within(form).queryByRole('option', {
    name: 'approve'
  })).not.toBeInTheDocument();
  expect(within(form).getByRole('option', {
    name: 'reject'
  })).toBeInTheDocument();
  expect(screen.queryByRole('form', {
    name: 'Submit correction'
  })).not.toBeInTheDocument();
  expect(screen.getByText('No supporting documents.')).toBeInTheDocument();
});
it('clears private registration content immediately on actor change and ignores delayed read', async () => {
  let resolve;
  const later = new Promise(r => resolve = r);
  const runtime = {
    withVerifiedAccount: fn => fn('token', {
      id: 'owner'
    }),
    api: {
      getOrganizerRegistrations: vi.fn(async () => [{
        id: 'reg',
        first_name: 'Siti',
        last_name: 'Demo',
        status: 'pending'
      }])
    }
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => later);
  const view = render(<JourneyWorkspace runtime={runtime} auth={{
    user: {
      id: 'owner',
      role: 'organizer'
    },
    revision: 1
  }} navigate={() => {}} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {
    name: 'Choose a registration'
  }));
  await waitFor(() => expect(screen.getByRole('option', {
    name: 'Siti Demo · pending'
  })).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText('Participant'), 'reg');
  await user.click(screen.getByRole('button', {
    name: 'Read registration'
  }));
  view.rerender(<JourneyWorkspace runtime={runtime} auth={{
    user: {
      id: 'different',
      role: 'user'
    },
    revision: 2
  }} navigate={() => {}} />);
  resolve(response({
    registration: {
      first_name: 'SECRET',
      last_name: 'LATE'
    },
    review: {
      state: 'awaiting_review'
    },
    booking_state: 'pending',
    allowed_actions: []
  }));
  await waitFor(() => expect(screen.queryByText('SECRET LATE')).not.toBeInTheDocument());
});
it('resolves an active public referral and sends it independently of the entry operator',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(path,options)=>{if(path.includes('/referrals/'))return response({event_public_id:'123456789012345678901',active:true,leader_display_name:'Synthetic Leader'});const body=JSON.parse(options.body);return response({contract_version:body.contract_version,operation_id:body.operation_id,outcome:'applied',effects:{registration_id:'reg',status:'pending'}});});
 render(<JourneyWorkspace runtime={{}} auth={{user:null,revision:1}} initialEvent="123456789012345678901" initialRef="opaque-ref" navigate={()=>{}}/>);await screen.findByText(/Synthetic Leader/);const form=screen.getByRole('form',{name:'Submit application'});const user=userEvent.setup();for(const [label,value] of [['First name','Siti'],['Last name','Demo'],['Phone','00000001'],['National ID','SIM-0001']])await user.type(within(form).getByLabelText(label),value);fireEvent.change(within(form).getByLabelText('Date of birth'),{target:{value:'1990-01-01'}});await user.click(within(form).getByRole('button',{name:'Submit application'}));await screen.findByText('Application recorded — pending review');const body=JSON.parse(fetch.mock.calls.find(([,options])=>options.method==='POST')[1].body);expect(body.data.source).toEqual({kind:'leader_referral',referral_code:'opaque-ref'});expect(body.data.application).not.toHaveProperty('operator_id');expect(screen.getByText('reg')).toBeInTheDocument();
});
it('does not fall back to Guest after a failed authenticated identity',()=>{render(<JourneyWorkspace runtime={{}} auth={{user:null,hasToken:true,identityBlocked:true,revision:1}} initialEvent="123456789012345678901" navigate={()=>{}}/>);expect(within(screen.getByRole('form',{name:'Submit application'})).getByRole('button',{name:'Submit application'})).toBeDisabled();expect(screen.queryByRole('form',{name:'Request Demo OTP'})).not.toBeInTheDocument();});
