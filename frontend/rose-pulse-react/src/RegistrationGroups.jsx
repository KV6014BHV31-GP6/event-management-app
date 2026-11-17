import React, { useEffect, useState, useId } from 'react';
import { demoTransport } from './demo-transport.js';
import { tr } from './i18n/index.js';

// Match both code and the deposited staging label. Arbitrary API labels remain authoritative.
const stagingLabels = {
  '0_17': ['Demo only: under 18', 'Under 18'],
  '18_29': ['Demo only: 18-29 years', '18–29 years'],
  '30_44': ['Demo only: 30-44 years', '30–44 years'],
  '45_59': ['Demo only: 45-59 years', '45–59 years'],
  '60_plus': ['Demo only: 60 years and over', '60 years and over'],
  demo_income_a: ['Demo income category A (illustrative)', 'Illustrative income group A'],
  demo_income_b: ['Demo income category B (illustrative)', 'Illustrative income group B'],
  demo_income_c: ['Demo income category C (illustrative)', 'Illustrative income group C'],
};
const optionLabel = row => {
  const entry = Object.hasOwn(stagingLabels, row.code) && stagingLabels[row.code];
  return entry && entry[0] === row.name ? tr(entry[1]) : row.name;
};

let cachedOptions;
export async function loadRegistrationOptions() {
  const response = await demoTransport.fetch('/api/v1/registration-options');
  if (!response.ok) throw new Error('Registration options unavailable');
  const value = await response.json();
  for (const key of ['age_groups', 'income_bands']) {
    if (!Array.isArray(value[key]) || value[key].some(row =>
      typeof row.code !== 'string' || !row.code.trim() || row.code.length > 20 ||
      typeof row.name !== 'string' || !row.name.trim()) ||
      new Set(value[key].map(row => row.code)).size !== value[key].length)
      throw new Error('Invalid registration options');
  }
  cachedOptions = value;
  return value;
}

export function RegistrationGroups() {
  const prefix = useId();
  const [options, setOptions] = useState(cachedOptions);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    loadRegistrationOptions().then(value => { if (current) { setOptions(value); setFailed(false); } })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [attempt]);
  return <>
    {[['age_group_code', 'Age group', 'age_groups', true],
      ['income_band_code', 'Income group (optional)', 'income_bands', false]].map(([name, label, key, required]) =>
      <label className="field" key={name}>
        <span>{tr(label)}</span>
        <select name={name} required={required} defaultValue="" aria-label={tr(label)} aria-describedby={prefix + name + '-status'}>
          <option value="">{tr(required ? 'Choose an option' : 'Not provided')}</option>
          {(options?.[key] || []).map(row => <option value={row.code} key={row.code}>{optionLabel(row)}</option>)}
        </select>
        <small id={prefix + name + '-status'}>{tr(failed && !options ? 'Options could not be loaded.' :
          !options ? 'Loading options…' : !options[key].length ? 'Options have not been configured.' :
          required ? 'Select your age group.' : 'You may leave this blank.')}</small>
      </label>)}
    {failed && <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>{tr('Retry options')}</button>}
  </>;
}
