import { ApiError, createApi } from './api.mjs';
import { selectedPublicId, loginRoute } from './event-navigation.mjs';

/** Match schema characters; the byte ceiling is compatibility with bcrypt, not schema policy. */
export function signupPayload(values) {
  const { username, password } = values ?? {};
  if (typeof username !== 'string' || !username.trim() || [...username].length < 3 || [...username].length > 20) {
    throw new ApiError('validation', 'Enter a username with 3–20 characters.');
  }
  if (typeof password !== 'string' || [...password].length < 6) {
    throw new ApiError('validation', 'Enter a password with at least 6 characters.');
  }
  if (new TextEncoder().encode(password).length > 72) {
    throw new ApiError('validation', 'Use a password of at most 72 UTF-8 bytes. Some characters use more than one byte.');
  }
  return { username, password };
}

export function createSignupController({ api, onChange = () => {} }) {
  let state = { status: 'idle', message: '', user: null };
  const update = next => { state = next; onChange(state); };
  return {
    get state() { return state; },
    async submit(values) {
      if (['submitting', 'success', 'uncertain'].includes(state.status)) return;
      let payload;
      try { payload = signupPayload(values); }
      catch (error) { update({ status: 'error', message: error instanceof ApiError ? error.message : 'Enter your username and password.', user: null }); return; }
      update({ status: 'submitting', message: 'Creating your account…', user: null });
      try {
        const { id, username, role, created_at, updated_at } = await api.createUser(payload);
        update({ status: 'success', message: 'Account created. Log in to continue.', user: { id, username, role, created_at, updated_at } });
      } catch (error) {
        const duplicate = error instanceof ApiError && error.kind === 'duplicate' && error.status === 400;
        const validation = error instanceof ApiError && error.kind === 'validation' && error.status === 422;
        update({ status: duplicate || validation ? 'error' : 'uncertain', user: null,
          message: duplicate ? 'This username is already registered. Log in or choose another username.'
            : validation ? 'Check your username and password before submitting again.'
              : 'We could not confirm whether your account was created. Do not submit this form again. Use Log in to check your account.' });
      } finally { payload.password = ''; }
    },
  };
}

export function mountSignup() {
  const api = createApi();
  const selected = selectedPublicId(globalThis.location.search);
  for (const link of document.querySelectorAll('[data-signup-login]')) link.href = selected ? loginRoute(selected) : './login.html';
  const form = document.querySelector('#signup-form');
  const fields = document.querySelector('#signup-fields');
  const password = document.querySelector('#password');
  const toggle = document.querySelector('#toggle-password');
  const progress = document.querySelector('#signup-progress');
  const result = document.querySelector('#signup-result');
  let initialized = false;
  const controller = createSignupController({ api, onChange: state => {
    fields.disabled = ['submitting', 'success', 'uncertain'].includes(state.status);
    form.setAttribute('aria-busy', String(state.status === 'submitting'));
    progress.textContent = state.status === 'success' ? '' : state.message;
    progress.hidden = !progress.textContent;
    progress.className = `notice${['error', 'uncertain'].includes(state.status) ? ' notice-error' : ''}`;
    result.hidden = state.status !== 'success';
    if (['error', 'success', 'uncertain'].includes(state.status)) {
      password.value = ''; password.type = 'password';
      toggle.textContent = 'Show'; toggle.setAttribute('aria-pressed', 'false');
    }
    if (state.status === 'success') {
      document.querySelector('#created-username').textContent = state.user.username;
      result.focus();
    } else if (['error', 'uncertain'].includes(state.status)) progress.focus();
  } });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!initialized || fields.disabled || !form.reportValidity()) return;
    controller.submit(Object.fromEntries(new FormData(form)));
  });
  toggle.addEventListener('click', () => {
    const show = password.type === 'password'; password.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show'; toggle.setAttribute('aria-pressed', String(show)); password.focus();
  });
  initialized = true;
  fields.disabled = false;
}

if (typeof document !== 'undefined') mountSignup();
