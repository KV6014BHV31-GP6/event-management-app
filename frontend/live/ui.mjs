export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountAccount(session, { loginPage = false, onChange = () => {} } = {}) {
  const account = document.querySelector('#account');
  const notice = document.querySelector('#auth-notice');
  // A history-cache restore must read the current tab token and reverify identity.
  globalThis.addEventListener('pageshow', event => {
    if (event.persisted) globalThis.location.reload();
  });

  function showNotice(message) {
    notice.replaceChildren();
    notice.textContent = message;
    notice.hidden = !message;
  }

  function logout() {
    const cleared = session.logout();
    showNotice(cleared ? 'You’re logged out.' : 'You’re logged out on this page. Close this tab to clear the saved login.');
    render();
    onChange(null);
  }

  function render({ checking = false, failed = false } = {}) {
    account.replaceChildren();
    if (checking) {
      account.append(element('span', 'account-pending', 'Checking account…'));
    } else if (session.user) {
      const name = element('span', 'account-name', session.user.username);
      name.title = `Logged in as ${session.user.username}`;
      const create = element('a', 'nav-link', 'Create event');
      create.href = './create-event.html';
      account.append(create, name);
    } else if (failed) {
      const retry = element('button', 'button button-quiet', 'Retry login check');
      retry.type = 'button';
      retry.addEventListener('click', check);
      account.append(retry);
    } else if (!loginPage) {
      const login = element('a', 'button button-small', 'Log in ↗');
      login.href = './login.html';
      account.append(login);
    } else {
      const current = element('span', 'nav-link current', 'Log in');
      current.setAttribute('aria-current', 'page');
      account.append(current);
    }
    if (session.user || failed) {
      const button = element('button', 'button button-quiet', 'Log out');
      button.type = 'button';
      button.addEventListener('click', logout);
      account.append(button);
    }
  }

  async function check() {
    if (!session.hasToken) { render(); onChange(null); return; }
    render({ checking: true });
    try {
      await session.restore();
      showNotice('');
      render();
      onChange(session.user);
    } catch (error) {
      showNotice(error.status === 401 ? 'Your login has expired. Please log in again.' : 'We couldn’t verify your login. You can still browse events. Try the login check again.');
      render({ failed: session.hasToken });
      onChange(null);
    }
  }

  return { check, render, logout, showNotice };
}
