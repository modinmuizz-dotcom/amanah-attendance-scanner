/* AMANAH account and appearance settings. Client-side preferences are device-specific. */
(function () {
  'use strict';
  if (window.__AMANAH_SETTINGS_READY__) return;
  window.__AMANAH_SETTINGS_READY__ = true;

  const PREFERENCES_KEY = 'amanah_ui_preferences_v1';
  const SUPABASE_URL = 'https://bafmycjninxomufhkjvy.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
  let preferences = { theme: 'blue', compact: false };
  let authClient = null;
  let overlay = null;
  let previouslyFocused = null;

  try {
    const saved = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) || '{}');
    if (saved.theme === 'gold' || saved.theme === 'blue') preferences.theme = saved.theme;
    preferences.compact = saved.compact === true;
  } catch (_) { /* Storage may be disabled. Defaults remain usable. */ }

  function applyPreferences() {
    document.documentElement.setAttribute('data-amanah-theme', preferences.theme);
    document.documentElement.setAttribute('data-amanah-density', preferences.compact ? 'compact' : 'comfortable');
    if (!overlay) return;
    overlay.querySelectorAll('[data-amanah-theme-choice]').forEach(button => {
      const active = button.dataset.amanahThemeChoice === preferences.theme;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-selected', active);
    });
    const compact = overlay.querySelector('#amanahCompactMode');
    if (compact) compact.checked = preferences.compact;
  }

  function savePreferences() {
    applyPreferences();
    try {
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch (_) { /* Preference still applies to the current page. */ }
  }

  function getClient() {
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    if (!authClient && window.supabase && typeof window.supabase.createClient === 'function') {
      authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return authClient;
  }

  function setMessage(message, isError) {
    if (!overlay) return;
    const node = overlay.querySelector('#amanahSettingsMessage');
    node.textContent = message;
    node.classList.toggle('is-error', !!isError);
    node.hidden = !message;
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'amanahSettingsOverlay';
    overlay.className = 'amanah-settings-backdrop';
    overlay.hidden = true;
    overlay.innerHTML = [
      '<section class="amanah-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="amanahSettingsTitle" tabindex="-1">',
      '  <header class="amanah-settings-heading">',
      '    <div><div class="amanah-settings-kicker">AMANAH CONTROL CENTER</div><h2 id="amanahSettingsTitle">Account &amp; Settings</h2>',
      '      <p>Manage your account security and personal display preferences.</p></div>',
      '    <button type="button" class="amanah-settings-close" data-amanah-settings-close aria-label="Close settings">×</button>',
      '  </header>',
      '  <div class="amanah-settings-content">',
      '    <div class="amanah-settings-section"><h3>Account Information</h3>',
      '      <div class="amanah-settings-profile">',
      '        <div><span>Name</span><strong id="amanahSettingsName">Loading…</strong></div>',
      '        <div><span>Email</span><strong id="amanahSettingsEmail">Loading…</strong></div>',
      '        <div><span>System Role</span><strong id="amanahSettingsRole">—</strong></div>',
      '      </div>',
      '    </div>',
      '    <div class="amanah-settings-section"><h3>Appearance</h3>',
      '      <p class="amanah-settings-help">Choose your display theme. Your choice is saved only in this browser.</p>',
      '      <div class="amanah-settings-themes" role="group" aria-label="Color theme">',
      '        <button type="button" class="amanah-settings-theme" data-amanah-theme-choice="blue" aria-pressed="true">',
      '          <span class="amanah-settings-swatch is-blue"></span><span><strong>Classic Blue</strong><small>Current AMANAH design</small></span>',
      '        </button>',
      '        <button type="button" class="amanah-settings-theme" data-amanah-theme-choice="gold" aria-pressed="false">',
      '          <span class="amanah-settings-swatch is-gold"></span><span><strong>AMANAH Gold</strong><small>Gold, black &amp; white</small></span>',
      '        </button>',
      '      </div>',
      '      <label class="amanah-settings-toggle" for="amanahCompactMode">',
      '        <span><strong>Compact tables</strong><small>Use less vertical space in management tables</small></span>',
      '        <input id="amanahCompactMode" type="checkbox">',
      '      </label>',
      '    </div>',
      '    <div class="amanah-settings-section"><h3>Change Password</h3>',
      '      <p class="amanah-settings-help">Updates the password for your signed-in AMANAH account.</p>',
      '      <form id="amanahChangePasswordForm">',
      '        <label for="amanahNewPassword">New password</label>',
      '        <input id="amanahNewPassword" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters">',
      '        <label for="amanahConfirmPassword">Confirm new password</label>',
      '        <input id="amanahConfirmPassword" type="password" autocomplete="new-password" minlength="8" required placeholder="Re-enter your new password">',
      '        <div class="amanah-settings-form-actions"><button id="amanahPasswordSave" type="submit">UPDATE PASSWORD</button></div>',
      '      </form>',
      '      <div id="amanahSettingsMessage" class="amanah-settings-message" role="status" aria-live="polite" hidden></div>',
      '    </div>',
      '  </div>',
      '  <footer class="amanah-settings-footer"><span>Project time zone: Asia/Manila (PHT)</span><button type="button" data-amanah-settings-close>CLOSE</button></footer>',
      '</section>'
    ].join('');
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-amanah-settings-close]')) closeSettings();
      const choice = event.target.closest('[data-amanah-theme-choice]');
      if (choice) {
        preferences.theme = choice.dataset.amanahThemeChoice;
        savePreferences();
      }
    });
    overlay.querySelector('#amanahCompactMode').addEventListener('change', event => {
      preferences.compact = event.target.checked;
      savePreferences();
    });
    overlay.querySelector('#amanahChangePasswordForm').addEventListener('submit', updatePassword);
    applyPreferences();
    return overlay;
  }

  async function fillAccount() {
    const node = ensureOverlay();
    node.querySelector('#amanahSettingsRole').textContent = window.AMANAH_CURRENT_ROLE || document.querySelector('.sidebar .user-role')?.textContent || 'Not assigned';
    node.querySelector('#amanahSettingsName').textContent = document.getElementById('amanahCurrentUserName')?.textContent || document.querySelector('.sidebar .user-name')?.textContent || 'AMANAH User';
    node.querySelector('#amanahSettingsEmail').textContent = 'Checking session…';
    const client = getClient();
    if (!client || !client.auth) {
      node.querySelector('#amanahSettingsEmail').textContent = 'Authentication unavailable';
      return;
    }
    try {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      if (node.hidden) return;
      const user = data?.user;
      const email = user?.email || 'Not signed in';
      node.querySelector('#amanahSettingsEmail').textContent = email;
      node.querySelector('#amanahSettingsName').textContent =
        user?.user_metadata?.full_name || user?.user_metadata?.name ||
        document.getElementById('amanahCurrentUserName')?.textContent || document.querySelector('.sidebar .user-name')?.textContent || email.split('@')[0];
      node.querySelector('#amanahSettingsRole').textContent = window.AMANAH_CURRENT_ROLE || document.querySelector('.sidebar .user-role')?.textContent || 'Not assigned';
    } catch (_) {
      if (!node.hidden) node.querySelector('#amanahSettingsEmail').textContent = 'Unable to load account';
    }
  }

  async function updatePassword(event) {
    event.preventDefault();
    const client = getClient();
    const password = overlay.querySelector('#amanahNewPassword').value;
    const confirm = overlay.querySelector('#amanahConfirmPassword').value;
    if (password.length < 8) return setMessage('Password must contain at least 8 characters.', true);
    if (password !== confirm) return setMessage('The two passwords do not match.', true);
    if (!client || !client.auth) return setMessage('Authentication is unavailable. Please sign in again.', true);

    const button = overlay.querySelector('#amanahPasswordSave');
    button.disabled = true;
    button.textContent = 'UPDATING…';
    setMessage('', false);
    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData?.user) throw new Error('Your session has expired. Please sign in again.');
      const { error } = await client.auth.updateUser({ password: password });
      if (error) throw error;
      overlay.querySelector('#amanahChangePasswordForm').reset();
      setMessage('Your account password was updated successfully.', false);
    } catch (error) {
      setMessage(error?.message || 'Could not update the password. Please try again.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'UPDATE PASSWORD';
    }
  }

  function openSettings() {
    const node = ensureOverlay();
    previouslyFocused = document.activeElement;
    node.hidden = false;
    document.body.classList.add('amanah-settings-open');
    node.querySelector('#amanahChangePasswordForm').reset();
    setMessage('', false);
    applyPreferences();
    node.querySelector('.amanah-settings-close').focus();
    fillAccount();
  }

  function closeSettings() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('amanah-settings-open');
    overlay.querySelector('#amanahChangePasswordForm').reset();
    if (previouslyFocused && typeof previouslyFocused.focus === 'function' && previouslyFocused.isConnected) {
      previouslyFocused.focus();
    }
  }

  document.addEventListener('click', event => {
    if (event.target.closest && event.target.closest('#amanahSettingsGear')) {
      event.preventDefault();
      openSettings();
    }
  });

  document.addEventListener('keydown', event => {
    if (!overlay || overlay.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSettings();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(overlay.querySelectorAll('button:not([disabled]), input:not([disabled])'))
      .filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault();
      focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
      event.preventDefault();
      focusable[0].focus();
    }
  });

  document.addEventListener('amanah:shell-removed', closeSettings);
  applyPreferences();
})();
