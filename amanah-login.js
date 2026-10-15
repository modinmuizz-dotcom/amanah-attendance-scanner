/* Login presentation only. Authentication and role routing remain in the existing application. */
(function () {
  'use strict';
  const screen = document.getElementById('loginScreen');
  const form = document.getElementById('loginForm');
  const password = document.getElementById('loginPassword');
  const toggle = document.getElementById('loginPasswordToggle');
  if (!screen || !form || !password || !toggle) return;

  function setVisible(visible) {
    password.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.querySelector('.am-login-eye-open').hidden = visible;
    toggle.querySelector('.am-login-eye-closed').hidden = !visible;
  }

  toggle.addEventListener('click', function () {
    const start = password.selectionStart;
    const end = password.selectionEnd;
    setVisible(password.type === 'password');
    password.focus({ preventScroll: true });
    if (start != null && end != null) password.setSelectionRange(start, end);
  });
  form.addEventListener('reset', function () { setVisible(false); });
  new MutationObserver(function () {
    if (screen.classList.contains('hidden')) {
      setVisible(false);
      password.value = '';
    }
  }).observe(screen, { attributes: true, attributeFilter: ['class'] });
})();
