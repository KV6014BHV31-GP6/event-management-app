import { createApi } from './api.mjs';
import { createSession, browserSessionStorage } from './session.mjs';
import { mountAccount } from './ui.mjs';

const api = createApi();
const session = createSession({ api, storage: browserSessionStorage() });
const form = document.querySelector('#login-form');
const username = document.querySelector('#username');
const password = document.querySelector('#password');
const submit = document.querySelector('#login-submit');
const errorNotice = document.querySelector('#login-error');
const progress = document.querySelector('#login-progress');
const toggle = document.querySelector('#toggle-password');

function showAccount(user) {
  document.querySelector('#login-fields').hidden = Boolean(user);
  document.querySelector('#signed-in').hidden = !user;
  document.querySelector('#signed-in-user').textContent = user ? `Logged in as ${user.username}.` : '';
  document.querySelector('#memory-notice').hidden = !user || session.persistent;
  if (!user) { password.value = ''; password.type = 'password'; toggle.textContent = 'Show'; toggle.setAttribute('aria-pressed', 'false'); }
}

const account = mountAccount(session, { loginPage: true, onChange: showAccount });
document.querySelector('#panel-logout').addEventListener('click', account.logout);
toggle.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  toggle.textContent = show ? 'Hide' : 'Show';
  toggle.setAttribute('aria-pressed', String(show));
  password.focus();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled || !form.reportValidity()) return;
  submit.disabled = true;
  username.disabled = true;
  password.disabled = true;
  toggle.disabled = true;
  errorNotice.hidden = true;
  errorNotice.textContent = '';
  progress.textContent = 'Logging in and checking your account…';
  try {
    const result = await session.signIn({ username: username.value, password: password.value });
    password.value = '';
    account.render();
    if (result.persistent) { globalThis.location.replace('./index.html'); return; }
    showAccount(result.user);
    progress.textContent = '';
  } catch (error) {
    if (error.kind !== 'aborted') {
      errorNotice.textContent = error.message;
      errorNotice.hidden = false;
      errorNotice.focus();
    }
    password.value = '';
    progress.textContent = '';
  } finally {
    submit.disabled = false;
    username.disabled = false;
    password.disabled = false;
    toggle.disabled = false;
  }
});

account.check();
