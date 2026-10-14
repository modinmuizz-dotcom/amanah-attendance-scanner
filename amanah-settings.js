/* AMANAH per-account appearance & security settings (Supabase Auth). */
(function () {
  'use strict';
  if (window.__AMANAH_SETTINGS_READY__) return;
  window.__AMANAH_SETTINGS_READY__ = true;

  // Preferences are owned by Supabase Auth user ID, never by the whole browser.
  // Do not migrate the old browser-wide key: it could belong to another user.
  const ACCOUNT_CACHE_PREFIX = 'amanah_ui_preferences_user_v2:';
  const METADATA_KEY = 'amanah_appearance_v1';
  const SUPABASE_URL = 'https://bafmycjninxomufhkjvy.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
  const defaultPreferences = () => ({ theme: 'blue', mode: 'light', compact: false });
  let preferences = defaultPreferences();
  let currentUserId = null;
  let authClient = null;
  let overlay = null;
  let previouslyFocused = null;
  let sessionRevision = 0;
  let editRevision = 0;
  let refreshRevision = 0;
  let writes = Promise.resolve();

  function normalizePreferences(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.theme !== 'blue' && raw.theme !== 'gold') return null;
    return { theme: raw.theme, mode: raw.mode === 'dark' ? 'dark' : 'light', compact: raw.compact === true };
  }

  function readAccountCache(userId) {
    if (!userId) return null;
    try {
      return normalizePreferences(JSON.parse(window.localStorage.getItem(ACCOUNT_CACHE_PREFIX + userId) || 'null'));
    } catch (_) {
      return null;
    }
  }

  function writeAccountCache(userId, value) {
    if (!userId) return;
    try {
      window.localStorage.setItem(ACCOUNT_CACHE_PREFIX + userId, JSON.stringify(value));
    } catch (_) {
      // Server-side account settings still work when local storage is unavailable.
    }
  }

  function useAccount(user) {
    const userId = user && typeof user.id === 'string' ? user.id : null;
    if (userId === currentUserId) return;
    currentUserId = userId;
    sessionRevision++;
    editRevision++;
    preferences = readAccountCache(userId) || defaultPreferences();
    applyPreferences();
    setAppearanceMessage('');
  }

  function setAppearanceMessage(message, error) {
    if (!overlay) return;
    const node = overlay.querySelector('#amanahAppearanceMessage');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-error', !!error);
    node.hidden = !message;
  }

  // Loads account-specific preferences from Supabase Auth metadata. A per-user
  // cache lets the same account render offline without leaking settings to others.
  async function refreshCurrentUser() {
    const client = getClient();
    if (!client?.auth) {
      useAccount(null);
      return;
    }
    const request = ++refreshRevision;
    try {
      const { data, error } = await client.auth.getSession();
      if (request !== refreshRevision) return;
      if (error) throw error;
      useAccount(data?.session?.user || null);
      if (!currentUserId) return;
      const expectedId = currentUserId;
      const expectedEdits = editRevision;
      const { data: fresh, error: freshError } = await client.auth.getUser();
      if (request !== refreshRevision || expectedId !== currentUserId || expectedEdits !== editRevision) return;
      if (freshError || fresh?.user?.id !== expectedId) return;
      const serverPrefs = normalizePreferences(fresh.user.user_metadata?.[METADATA_KEY]);
      if (serverPrefs) {
        preferences = serverPrefs;
        writeAccountCache(expectedId, preferences);
        applyPreferences();
      }
    } catch (error) {
      // Never reuse the last account's theme when authentication fails.
      if (request === refreshRevision) console.warn('AMANAH personal theme refresh:', error);
    }
  }

  function applyPreferences() {
    document.documentElement.setAttribute('data-amanah-theme', preferences.theme);
    document.documentElement.setAttribute('data-amanah-mode', preferences.mode === 'dark' ? 'dark' : 'light');
    document.documentElement.setAttribute('data-amanah-density', preferences.compact ? 'compact' : 'comfortable');
    if (!overlay) return;
    overlay.querySelectorAll('[data-amanah-theme-choice]').forEach(button => {
      const active = button.dataset.amanahThemeChoice === preferences.theme;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-selected', active);
    });
    overlay.querySelectorAll('[data-amanah-mode-choice]').forEach(button => {
      const active = button.dataset.amanahModeChoice === preferences.mode;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-selected', active);
    });
    const compact = overlay.querySelector('#amanahCompactMode');
    if (compact) compact.checked = preferences.compact;
  }

  function savePreferences() {
    if (!currentUserId) {
      setAppearanceMessage('Sign in to change your personal appearance settings.', true);
      return;
    }
    const accountId = currentUserId;
    const version = sessionRevision;
    const snapshot = { ...preferences };
    editRevision++;
    applyPreferences();
    writeAccountCache(accountId, snapshot);
    setAppearanceMessage('Saving to your personal AMANAH account…');
    // Queue rapid palette/mode/compact changes so the latest user preference wins.
    writes = writes.catch(() => {}).then(async () => {
      if (currentUserId !== accountId || sessionRevision !== version) return;
      const client = getClient();
      if (!client?.auth) throw new Error('Authentication unavailable');
      const { data, error: identityError } = await client.auth.getUser();
      if (identityError || data?.user?.id !== accountId) {
        throw new Error('Your login has changed. Please sign in again.');
      }
      if (currentUserId !== accountId || sessionRevision !== version) return;
      const { error } = await client.auth.updateUser({
        data: { [METADATA_KEY]: snapshot }
      });
      if (error) throw error;
      if (currentUserId === accountId && sessionRevision === version) {
        setAppearanceMessage('Saved for your account only.');
      }
    }).catch(error => {
      if (currentUserId === accountId && sessionRevision === version) {
        setAppearanceMessage('Applied here, but not synced to your account: ' +
          (error?.message || 'Please try again.'), true);
      }
    });
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
      '      <p class="amanah-settings-help">Choose your colors and workspace brightness. Saved privately to your AMANAH login and synchronized across devices.</p>',
      '      <div class="amanah-settings-subheading">COLOR PALETTE</div>',
      '      <div class="amanah-settings-themes" role="group" aria-label="Color theme">',
      '        <button type="button" class="amanah-settings-theme" data-amanah-theme-choice="blue" aria-pressed="true">',
      '          <span class="amanah-settings-swatch is-blue"></span><span><strong>Classic Blue</strong><small>Current AMANAH design</small></span>',
      '        </button>',
      '        <button type="button" class="amanah-settings-theme" data-amanah-theme-choice="gold" aria-pressed="false">',
      '          <span class="amanah-settings-swatch is-gold"></span><span><strong>AMANAH Gold</strong><small>Gold, black &amp; white</small></span>',
      '        </button>',
      '      </div>',
      '      <div class="amanah-settings-subheading amanah-settings-mode-heading">WORKSPACE MODE</div>',
      '      <div class="amanah-settings-modes" role="group" aria-label="Workspace mode">',
      '        <button type="button" class="amanah-settings-mode-card" data-amanah-mode-choice="light" aria-pressed="true">',
      '          <span class="amanah-mode-preview is-light" aria-hidden="true"><span class="amanah-preview-sidebar"></span><span class="amanah-preview-window"><i></i><i></i><b></b></span></span>',
      '          <span class="amanah-mode-caption"><strong><span aria-hidden="true">☀</span> Light Mode</strong><small>Clean, bright workspace</small></span>',
      '          <span class="amanah-mode-check" aria-hidden="true">✓</span>',
      '        </button>',
      '        <button type="button" class="amanah-settings-mode-card" data-amanah-mode-choice="dark" aria-pressed="false">',
      '          <span class="amanah-mode-preview is-dark" aria-hidden="true"><span class="amanah-preview-sidebar"></span><span class="amanah-preview-window"><i></i><i></i><b></b></span></span>',
      '          <span class="amanah-mode-caption"><strong><span aria-hidden="true">☾</span> Dark Mode</strong><small>Soft contrast for low light</small></span>',
      '          <span class="amanah-mode-check" aria-hidden="true">✓</span>',
      '        </button>',
      '      </div>',
      '      <label class="amanah-settings-toggle" for="amanahCompactMode">',
      '        <span><strong>Compact tables</strong><small>Use less vertical space in management tables</small></span>',
      '        <input id="amanahCompactMode" type="checkbox">',
      '      </label>',
      '      <div id="amanahAppearanceMessage" class="amanah-settings-message" role="status" aria-live="polite" hidden></div>',
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
        if (!currentUserId) return setAppearanceMessage('Sign in before changing your theme.', true);
        preferences.theme = choice.dataset.amanahThemeChoice;
        savePreferences();
      }
      const modeChoice = event.target.closest('[data-amanah-mode-choice]');
      if (modeChoice) {
        if (!currentUserId) return setAppearanceMessage('Sign in before changing workspace mode.', true);
        preferences.mode = modeChoice.dataset.amanahModeChoice === 'dark' ? 'dark' : 'light';
        savePreferences();
      }
    });
    overlay.querySelector('#amanahCompactMode').addEventListener('change', event => {
      if (!currentUserId) {
        event.target.checked = preferences.compact;
        return setAppearanceMessage('Sign in before changing your display density.', true);
      }
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
    refreshCurrentUser().then(fillAccount);
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

  document.addEventListener('amanah:shell-removed', () => {
    ++refreshRevision;
    closeSettings();
    useAccount(null);
  });
  document.addEventListener('amanah:shell-ready', refreshCurrentUser);

  // Supabase broadcasts sign-in/sign-out changes across browser tabs. Keep the
  // currently rendered theme scoped to the authenticated account, including on
  // shared computers where different employees sign in sequentially.
  function watchAuthentication() {
    const client = getClient();
    if (!client?.auth?.onAuthStateChange) return;
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        ++refreshRevision;
        useAccount(null);
        closeSettings();
      } else if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') &&
                 session?.user?.id !== currentUserId) {
        useAccount(session?.user || null);
        // Avoid awaited Supabase calls inside its auth event callback.
        Promise.resolve().then(refreshCurrentUser);
      }
    });
  }

  window.AMANAH_SETTINGS = { refreshCurrentUser };
  applyPreferences();  // Safe default while the account identity is being resolved.
  watchAuthentication();
  refreshCurrentUser();
})();
