/**
 * Opens the existing Superadmin login dialog after the hidden keyboard shortcut.
 */

const HOLD_DURATION_MS = 4000;
let isInitialized = false;
let holdTimer = null;
let controlHeld = false;
let shiftHeld = false;
let shortcutKeyHeld = false;

export function initAdminShortcut() {
  if (isInitialized) return;
  isInitialized = true;

  function cancelHold() {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function resetHeldKeys() {
    cancelHold();
    controlHeld = false;
    shiftHeld = false;
    shortcutKeyHeld = false;
  }

  function openLogin() {
    holdTimer = null;
    if (document.body.dataset.page !== 'admin') {
      window.location.assign(new URL('admin.html?login=1', window.location.href));
      return;
    }

    const consoleSection = document.getElementById('adminConsoleSection');
    if (consoleSection && window.getComputedStyle(consoleSection).display !== 'none') return;

    const dialog = document.getElementById('adminLoginSection');
    if (!dialog) {
      console.error('[AdminAuth] The Superadmin login dialog is missing from admin.html.');
      return;
    }

    dialog.hidden = false;
    const emailField = document.getElementById('adminEmail');
    const loginForm = document.getElementById('superadminLoginForm');
    const focusTarget = loginForm?.hidden
      ? document.getElementById('adminLoginCloseBtn')
      : emailField;
    focusTarget?.focus();
  }

  function handleKeyDown(event) {
    if (event.isComposing) return;
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    if (event.ctrlKey) controlHeld = true;
    if (event.shiftKey) shiftHeld = true;
    if (key === 'control' ||
        event.code === 'ControlLeft' || event.code === 'ControlRight') controlHeld = true;
    if (key === 'shift' ||
        event.code === 'ShiftLeft' || event.code === 'ShiftRight') shiftHeld = true;
    if (key === 'm' || event.code === 'KeyM') shortcutKeyHeld = true;
    if (!controlHeld || !shiftHeld || !shortcutKeyHeld || event.altKey || event.metaKey) return;

    event.preventDefault();
    if (!event.repeat && holdTimer === null) {
      holdTimer = window.setTimeout(openLogin, HOLD_DURATION_MS);
    }
  }

  function handleKeyUp(event) {
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    const code = event.code;
    if (key === 'control' || code === 'ControlLeft' || code === 'ControlRight') {
      controlHeld = false;
      cancelHold();
    } else if (key === 'shift' || code === 'ShiftLeft' || code === 'ShiftRight') {
      shiftHeld = false;
      cancelHold();
    } else if (key === 'm' || code === 'KeyM') {
      shortcutKeyHeld = false;
      cancelHold();
    }
  }

  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  window.addEventListener('blur', resetHeldKeys);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetHeldKeys();
  });

  if (document.body.dataset.page === 'admin') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === '1') {
      params.delete('login');
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
      );
      openLogin();
    }

    document.getElementById('adminLoginCloseBtn')?.addEventListener('click', () => {
      const dialog = document.getElementById('adminLoginSection');
      if (dialog) dialog.hidden = true;
    });
    document.getElementById('adminLoginSection')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) {
        event.currentTarget.hidden = true;
      }
    });
  }
}
