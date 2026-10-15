/* AMANAH per-account appearance & security settings (Supabase Auth). */
(function () {
  'use strict';
  if (window.__AMANAH_SETTINGS_READY__) return;
  window.__AMANAH_SETTINGS_READY__ = true;

  // Preferences are owned by Supabase Auth user ID, never by the whole browser.
  // Do not migrate the old browser-wide key: it could belong to another user.
  const ACCOUNT_CACHE_PREFIX = 'amanah_ui_preferences_user_v2:';
  const METADATA_KEY = 'amanah_appearance_v1';
  const PHOTO_KEY = 'amanah_avatar_path_v1';
  const PHOTO_BUCKET = 'account-avatars';
  const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
  const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const SUPABASE_URL = 'https://bafmycjninxomufhkjvy.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
  const defaultPreferences = () => ({ theme: 'blue', mode: 'light', compact: false });
  // The early bootstrap already selected this login's appearance.
  // Don't reset to Light Mode while Supabase confirms the session.
  const boot = window.__AMANAH_THEME_BOOT;
  let preferences = boot?.userId
    ? (normalizePreferences(boot.preferences) || defaultPreferences())
    : defaultPreferences();
  let currentUserId = boot?.userId || null;
  let authClient = null;
  let overlay = null;
  let previouslyFocused = null;
  let sessionRevision = 0;
  let editRevision = 0;
  let refreshRevision = 0;
  let writes = Promise.resolve();
  let accountRequest = 0;
  let profileUserId = null;
  let avatar = { userId: null, path: null, url: null, expiresAt: 0, pending: null };
  let photoEdit = { file: null, previewUrl: null, remove: false };
  let photoSelectionRevision = 0;
  let photoSelecting = false;
  let profileBusy = false;

  function photoPath(user) {
    const path = user?.user_metadata?.[PHOTO_KEY];
    // Metadata may select only a flat image in this account's private folder.
    if (typeof path !== 'string' || !user?.id || !path.startsWith(user.id + '/')) return null;
    return /^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(path.slice(user.id.length + 1)) ? path : null;
  }

  function renderAvatars() {
    const display = window.AMANAH_ACCOUNT_DISPLAY;
    const initials = display?.user_id === currentUserId ? display.initials : 'A';
    const savedUrl = avatar.userId === currentUserId ? avatar.url : null;
    document.querySelectorAll('[data-amanah-account-avatar]').forEach(node => {
      const preview = node.hasAttribute('data-amanah-avatar-preview');
      const url = preview && photoEdit.previewUrl ? photoEdit.previewUrl :
        (preview && photoEdit.remove ? null : savedUrl);
      if (!url) {
        node.textContent = initials;
        delete node.dataset.amanahAvatarSource;
      } else if (node.dataset.amanahAvatarSource !== url || !node.querySelector('img')) {
        const img = document.createElement('img');
        img.className = 'amanah-avatar-image';
        img.alt = preview ? 'Profile picture preview' : '';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => {
          if (img.parentNode === node) {
            node.textContent = initials;
            delete node.dataset.amanahAvatarSource;
          }
        }, { once: true });
        img.src = url;
        node.replaceChildren(img);
        node.dataset.amanahAvatarSource = url;
      }
    });
  }

  function loadAccountPhoto(user) {
    const userId = user?.id || null;
    const path = photoPath(user);
    const samePhoto = avatar.userId === userId && avatar.path === path;
    if (samePhoto && (avatar.pending || !path || (avatar.url && avatar.expiresAt > Date.now() + 60000))) {
      renderAvatars();
      return avatar.pending;
    }
    const state = { userId, path, url: samePhoto ? avatar.url : null, expiresAt: 0, pending: null };
    avatar = state;
    renderAvatars();
    syncPhotoControls();
    if (!path || userId !== currentUserId) return null;
    // Defer API calls so this is also safe from Supabase's auth event callback.
    state.pending = Promise.resolve().then(async () => {
      const client = getClient();
      if (!client?.storage || avatar !== state || currentUserId !== userId) return;
      const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
      if (error) throw error;
      if (typeof data?.signedUrl !== 'string') throw new Error('Photo unavailable');
      if (avatar !== state || currentUserId !== userId) return;
      state.url = data.signedUrl;
      state.expiresAt = Date.now() + 3600000;
      renderAvatars();
    }).catch(() => {
      if (avatar !== state || currentUserId !== userId) return;
      state.url = null;
      renderAvatars();
    }).finally(() => { state.pending = null; });
    return state.pending;
  }

  function syncPhotoControls() {
    if (!overlay) return;
    const ready = !!profileUserId && profileUserId === currentUserId;
    const locked = !ready || profileBusy || photoSelecting;
    const hasPhoto = !!photoEdit.file || (!photoEdit.remove && avatar.userId === currentUserId && !!avatar.path);
    overlay.querySelector('#amanahPhotoChoose').disabled = locked;
    overlay.querySelector('#amanahPhotoChoose').textContent = photoSelecting ? 'Checking photo…' : (hasPhoto ? 'Replace photo' : 'Upload photo');
    overlay.querySelector('#amanahPhotoRemove').disabled = locked || !hasPhoto;
    overlay.querySelector('#amanahProfilePhoto').disabled = locked;
    overlay.querySelector('#amanahProfileSave').disabled = locked;
  }

  function resetPhotoEditor(keepBusy) {
    ++photoSelectionRevision;
    photoSelecting = false;
    if (!keepBusy) profileBusy = false;
    if (photoEdit.previewUrl) URL.revokeObjectURL(photoEdit.previewUrl);
    photoEdit = { file: null, previewUrl: null, remove: false };
    if (overlay) overlay.querySelector('#amanahProfilePhoto').value = '';
    renderAvatars();
    syncPhotoControls();
  }

  function verifyPhotoFile(file) {
    if (!Object.prototype.hasOwnProperty.call(PHOTO_TYPES, file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
    if (!file.size) throw new Error('This image is empty. Please choose another photo.');
    if (file.size > PHOTO_MAX_BYTES) throw new Error('Your photo must be 5 MB or smaller.');
  }

  function decodePhoto(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timeout = window.setTimeout(() => finish(new Error('This image could not be opened. Please choose another photo.')), 10000);
      function finish(error) {
        window.clearTimeout(timeout);
        image.onload = image.onerror = null;
        if (error) reject(error); else resolve();
      }
      image.onload = () => finish(image.naturalWidth && image.naturalHeight ? null : new Error('This image could not be opened.'));
      image.onerror = () => finish(new Error('This image could not be opened. Please choose another photo.'));
      image.src = url;
    });
  }

  async function selectProfilePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !profileUserId || profileBusy) return;
    const owner = profileUserId;
    const request = accountRequest;
    const selection = ++photoSelectionRevision;
    let url = null;
    try {
      verifyPhotoFile(file);
      photoSelecting = true;
      syncPhotoControls();
      url = URL.createObjectURL(file);
      await decodePhoto(url);
      if (selection !== photoSelectionRevision || request !== accountRequest || owner !== currentUserId || owner !== profileUserId) return;
      if (photoEdit.previewUrl) URL.revokeObjectURL(photoEdit.previewUrl);
      photoEdit = { file, previewUrl: url, remove: false };
      url = null;
      renderAvatars();
      setProfileMessage('Photo selected. Click Save Profile to apply it.', false);
    } catch (error) {
      if (selection === photoSelectionRevision && request === accountRequest && owner === currentUserId) {
        setProfileMessage(error?.message || 'Please choose another photo.', true);
      }
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (selection === photoSelectionRevision) {
        photoSelecting = false;
        syncPhotoControls();
      }
    }
  }

  function removeProfilePhoto() {
    if (!profileUserId || profileBusy || photoSelecting) return;
    if (photoEdit.previewUrl) URL.revokeObjectURL(photoEdit.previewUrl);
    photoEdit = { file: null, previewUrl: null, remove: true };
    renderAvatars();
    syncPhotoControls();
    setProfileMessage('Photo removed from the preview. Click Save Profile to confirm.', false);
  }

  function displayName(user) {
    const metadata = user?.user_metadata || {};
    for (const value of [metadata.full_name, metadata.name]) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return typeof user?.email === 'string' ? user.email.split('@')[0] : 'AMANAH User';
  }

  // Display metadata is never used to authorize a role or grant permissions.
  function syncAccountIdentity(user) {
    const name = user ? displayName(user) : 'AMANAH USER';
    const words = name.split(/\s+/).filter(Boolean);
    const initials = user && words.length ?
      (Array.from(words[0])[0] + (words.length > 1 ? Array.from(words[words.length - 1])[0] : '')).toUpperCase() : 'A';
    window.AMANAH_ACCOUNT_DISPLAY = user ? { user_id: user.id, name, initials } : null;
    document.querySelectorAll('#amanahCurrentUserName, .sidebar .user-name').forEach(node => { node.textContent = name; });
    loadAccountPhoto(user);
    if (overlay) overlay.querySelector('#amanahSettingsName').textContent = name;
    const role = window.AMANAH_ACCOUNT_ROLE;
    const roleName = user && role?.user_id === user.id ? role.role : 'AUTHENTICATED';
    document.querySelectorAll('#amanahCurrentUserRole, .sidebar .user-role').forEach(node => { node.textContent = roleName; });
  }

  function setProfileMessage(message, isError) {
    if (!overlay) return;
    const node = overlay.querySelector('#amanahProfileMessage');
    node.textContent = message;
    node.classList.toggle('is-error', !!isError);
    node.hidden = !message;
  }

  function resetProfileEditor() {
    profileUserId = null;
    resetPhotoEditor();
    if (!overlay) return;
    const input = overlay.querySelector('#amanahProfileName');
    input.value = '';
    input.disabled = true;
    input.readOnly = false;
    const button = overlay.querySelector('#amanahProfileSave');
    button.disabled = true;
    button.textContent = 'SAVE PROFILE';
    setProfileMessage('', false);
  }

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
    if (userId === currentUserId) {
      syncAccountIdentity(user);
      return;
    }
    const previousUserId = currentUserId;
    currentUserId = userId;
    sessionRevision++;
    editRevision++;
    ++accountRequest;
    resetProfileEditor();
    if (previousUserId) closeSettings();
    syncAccountIdentity(user);
    // Use the signed-in user's session metadata immediately to avoid a
    // Light Mode flash before the fresh account preferences finish loading.
    preferences = readAccountCache(userId) ||
      normalizePreferences(user?.user_metadata?.[METADATA_KEY]) || defaultPreferences();
    if (userId) writeAccountCache(userId, preferences);
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
      syncAccountIdentity(fresh.user);
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
      '    <div><div class="amanah-settings-kicker">AMANAH CONTROL CENTER</div><h2 id="amanahSettingsTitle">User Account</h2>',
      '      <p>Manage your profile, account security, and personal preferences.</p></div>',
      '    <button type="button" class="amanah-settings-close" data-amanah-settings-close aria-label="Close settings">×</button>',
      '  </header>',
      '  <div class="amanah-settings-content">',
      '    <div class="amanah-settings-section"><h3>Your Profile</h3>',
      '      <div class="amanah-account-summary"><span class="amanah-account-avatar" data-amanah-account-avatar data-amanah-avatar-preview>A</span><div><strong id="amanahSettingsName">Loading…</strong><span>Your personal AMANAH account</span>',
      '        <div class="amanah-photo-actions"><button id="amanahPhotoChoose" type="button" disabled>Upload photo</button><button id="amanahPhotoRemove" type="button" disabled>Remove</button></div>',
      '        <input id="amanahProfilePhoto" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a profile photo" aria-describedby="amanahPhotoHelp" hidden disabled>',
      '        <p id="amanahPhotoHelp" class="amanah-settings-help">JPG, PNG or WebP · Up to 5 MB</p>',
      '      </div></div>',
      '      <div class="amanah-settings-profile">',
      '        <div><span>Email</span><strong id="amanahSettingsEmail">Loading…</strong></div>',
      '        <div><span>System Role</span><strong id="amanahSettingsRole">—</strong></div>',
      '      </div>',
      '      <form id="amanahProfileForm">',
      '        <label for="amanahProfileName">Display name</label>',
      '        <input id="amanahProfileName" name="display_name" type="text" autocomplete="name" maxlength="80" required disabled aria-describedby="amanahProfileNameHelp">',
      '        <p id="amanahProfileNameHelp" class="amanah-settings-help">Shown in your sidebar and account profile.</p>',
      '        <div class="amanah-settings-form-actions"><button id="amanahProfileSave" type="submit" disabled>SAVE PROFILE</button></div>',
      '      </form>',
      '      <div id="amanahProfileMessage" class="amanah-settings-message" role="status" aria-live="polite" hidden></div>',
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
    overlay.querySelector('#amanahProfileForm').addEventListener('submit', updateProfile);
    overlay.querySelector('#amanahPhotoChoose').addEventListener('click', () => overlay.querySelector('#amanahProfilePhoto').click());
    overlay.querySelector('#amanahProfilePhoto').addEventListener('change', selectProfilePhoto);
    overlay.querySelector('#amanahPhotoRemove').addEventListener('click', removeProfilePhoto);
    applyPreferences();
    return overlay;
  }

  async function fillAccount() {
    const node = ensureOverlay();
    const request = ++accountRequest;
    const accountId = currentUserId;
    resetProfileEditor();
    node.querySelector('#amanahSettingsRole').textContent = 'Checking role…';
    node.querySelector('#amanahSettingsEmail').textContent = 'Checking session…';
    const client = getClient();
    if (!client || !client.auth) {
      node.querySelector('#amanahSettingsEmail').textContent = 'Authentication unavailable';
      return;
    }
    try {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      if (node.hidden || request !== accountRequest || accountId !== currentUserId) return;
      const user = data?.user;
      if (!user || !accountId || user.id !== accountId) throw new Error('Your session has changed. Please sign in again.');
      syncAccountIdentity(user);
      node.querySelector('#amanahSettingsEmail').textContent = user.email || 'No email available';
      profileUserId = user.id;
      const input = node.querySelector('#amanahProfileName');
      input.value = displayName(user);
      input.disabled = false;
      syncPhotoControls();
      const { data: role, error: roleError } = await client.rpc('amanah_get_current_role');
      if (node.hidden || request !== accountRequest || accountId !== currentUserId) return;
      if (roleError) throw new Error('Your profile is ready, but the system role could not be loaded.');
      const assignedRole = typeof role === 'string' && role ? role : 'UNASSIGNED';
      window.AMANAH_ACCOUNT_ROLE = { user_id: user.id, role: assignedRole };
      node.querySelector('#amanahSettingsRole').textContent = assignedRole;
      syncAccountIdentity(user);
    } catch (_) {
      if (!node.hidden && request === accountRequest && accountId === currentUserId) {
        if (!profileUserId) node.querySelector('#amanahSettingsEmail').textContent = 'Unable to verify account';
        node.querySelector('#amanahSettingsRole').textContent = 'Unavailable';
        setProfileMessage('Could not load all account details. Close and reopen User Account to retry.', true);
      }
    }
  }

  async function updateProfile(event) {
    event.preventDefault();
    const client = getClient();
    const input = overlay.querySelector('#amanahProfileName');
    const button = overlay.querySelector('#amanahProfileSave');
    if (button.disabled) return;
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 80) return setProfileMessage('Enter a display name of 1 to 80 characters.', true);
    const accountId = profileUserId;
    const version = sessionRevision;
    const request = accountRequest;
    const photoFile = photoEdit.file;
    const removePhoto = photoEdit.remove;
    const photoChanged = !!photoFile || removePhoto;
    if (!client?.auth || !accountId || currentUserId !== accountId) {
      return setProfileMessage('Please sign in again before saving your profile.', true);
    }
    profileBusy = true;
    syncPhotoControls();
    button.textContent = 'SAVING…';
    input.readOnly = true;
    setProfileMessage('Saving your profile…', false);
    // Share the existing account metadata queue with appearance writes.
    const update = writes.catch(() => {}).then(async () => {
      if (currentUserId !== accountId || sessionRevision !== version) throw new Error('Your login has changed. Please sign in again.');
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (identityError || identity?.user?.id !== accountId || currentUserId !== accountId || sessionRevision !== version) {
        throw new Error('Your login has changed. Please sign in again.');
      }
      const oldPath = photoPath(identity.user);
      let nextPath = removePhoto ? null : oldPath;
      let uploadedPath = null;
      let confirmed = false;
      try {
        const metadata = { full_name: name };
        if (photoFile) {
          verifyPhotoFile(photoFile);
          if (!client.storage) throw new Error('Photo storage is unavailable. Please try again.');
          const photoId = window.crypto.randomUUID();
          uploadedPath = accountId + '/' + photoId + '.' + PHOTO_TYPES[photoFile.type];
          const { error: uploadError } = await client.storage.from(PHOTO_BUCKET).upload(uploadedPath, photoFile, {
            contentType: photoFile.type, cacheControl: '3600', upsert: false
          });
          if (uploadError) throw new Error('Could not upload your photo: ' + (uploadError.message || 'Please try again.'));
          nextPath = uploadedPath;
          // Uploading can take time. Re-verify the owner before updating metadata.
          if (currentUserId !== accountId || sessionRevision !== version) throw new Error('Your login has changed. Please sign in again.');
          const { data: freshIdentity, error: freshError } = await client.auth.getUser();
          if (freshError || freshIdentity?.user?.id !== accountId || currentUserId !== accountId || sessionRevision !== version) {
            throw new Error('Your login has changed. Please sign in again.');
          }
        }
        if (photoChanged) metadata[PHOTO_KEY] = nextPath;
        const { data, error } = await client.auth.updateUser({ data: metadata });
        if (error) throw error;
        if (data?.user?.id !== accountId || data.user.user_metadata?.full_name !== name ||
            (photoChanged && (photoPath(data.user) !== nextPath))) {
          throw new Error('The profile update could not be confirmed. Please try again.');
        }
        confirmed = true;
        if (currentUserId !== accountId || sessionRevision !== version) return;
        syncAccountIdentity(data.user);
        await avatar.pending;
        if (currentUserId !== accountId || sessionRevision !== version) return;
        if (!overlay.hidden && request === accountRequest) {
          resetPhotoEditor(true);
          input.value = name;
          setProfileMessage(photoChanged ? (nextPath ? 'Your profile and photo have been saved.' : 'Your profile has been saved and the photo removed.') : 'Your display name has been saved.', false);
        }
        if (photoChanged && oldPath && oldPath !== nextPath) await cleanupPhoto(client, oldPath, accountId, version);
      } finally {
        // On a failed save, delete a new upload only after confirming Auth did
        // not commit its path. A lost response must not delete a saved photo.
        if (uploadedPath && !confirmed && currentUserId === accountId && sessionRevision === version) {
          try {
            const { data: fresh, error } = await client.auth.getUser();
            if (!error && fresh?.user?.id === accountId && photoPath(fresh.user) !== uploadedPath) {
              await cleanupPhoto(client, uploadedPath, accountId, version);
            }
          } catch (_) { /* Keep the file when the final account state is uncertain. */ }
        }
      }
    });
    writes = update.catch(() => {});
    try {
      await update;
    } catch (error) {
      if (currentUserId === accountId && sessionRevision === version && request === accountRequest) {
        setProfileMessage(error?.message || 'Could not save your profile. Please try again.', true);
      }
    } finally {
      if (currentUserId === accountId && profileUserId === accountId && request === accountRequest) {
        profileBusy = false;
        syncPhotoControls();
        button.textContent = 'SAVE PROFILE';
        input.readOnly = false;
      }
    }
  }

  async function cleanupPhoto(client, path, accountId, version) {
    if (currentUserId !== accountId || sessionRevision !== version || !path?.startsWith(accountId + '/')) return;
    try {
      const { error } = await client.storage.from(PHOTO_BUCKET).remove([path]);
      if (error) console.warn('AMANAH unused profile photo could not be removed.');
    } catch (_) { console.warn('AMANAH unused profile photo could not be removed.'); }
  }

  async function updatePassword(event) {
    event.preventDefault();
    const client = getClient();
    const accountId = currentUserId;
    const version = sessionRevision;
    const password = overlay.querySelector('#amanahNewPassword').value;
    const confirm = overlay.querySelector('#amanahConfirmPassword').value;
    if (password.length < 8) return setMessage('Password must contain at least 8 characters.', true);
    if (password !== confirm) return setMessage('The two passwords do not match.', true);
    if (!client || !client.auth || !accountId) return setMessage('Authentication is unavailable. Please sign in again.', true);

    const button = overlay.querySelector('#amanahPasswordSave');
    button.disabled = true;
    button.textContent = 'UPDATING…';
    setMessage('', false);
    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || userData?.user?.id !== accountId || currentUserId !== accountId || sessionRevision !== version) {
        throw new Error('Your login has changed. Please sign in again.');
      }
      const { error } = await client.auth.updateUser({ password: password });
      if (error) throw error;
      if (currentUserId !== accountId || sessionRevision !== version) return;
      overlay.querySelector('#amanahChangePasswordForm').reset();
      setMessage('Your account password was updated successfully.', false);
    } catch (error) {
      if (currentUserId === accountId && sessionRevision === version) {
        setMessage(error?.message || 'Could not update the password. Please try again.', true);
      }
    } finally {
      button.disabled = false;
      button.textContent = 'UPDATE PASSWORD';
    }
  }

  function openSettings(focusProfile) {
    const node = ensureOverlay();
    ++accountRequest;
    resetProfileEditor();
    previouslyFocused = document.activeElement;
    node.hidden = false;
    document.body.classList.add('amanah-settings-open');
    node.querySelector('#amanahChangePasswordForm').reset();
    node.querySelector('.amanah-settings-content').scrollTop = 0;
    setMessage('', false);
    applyPreferences();
    node.querySelector('.amanah-settings-close').focus();
    refreshCurrentUser().then(fillAccount).then(() => {
      const input = node.querySelector('#amanahProfileName');
      if (focusProfile && !node.hidden && !input.disabled && document.activeElement === node.querySelector('.amanah-settings-close')) input.focus();
    });
  }

  function closeSettings() {
    if (!overlay || overlay.hidden) return;
    ++accountRequest;
    overlay.hidden = true;
    document.body.classList.remove('amanah-settings-open');
    overlay.querySelector('#amanahChangePasswordForm').reset();
    resetProfileEditor();
    if (previouslyFocused && typeof previouslyFocused.focus === 'function' && previouslyFocused.isConnected) {
      previouslyFocused.focus();
    }
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest && event.target.closest('#amanahSettingsGear, [data-amanah-open-profile]');
    if (trigger) {
      event.preventDefault();
      openSettings(trigger.hasAttribute('data-amanah-open-profile'));
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
      } else if (event === 'USER_UPDATED' && session?.user?.id === currentUserId) {
        syncAccountIdentity(session.user);
      }
    });
  }

  window.AMANAH_SETTINGS = { refreshCurrentUser, renderAvatars };
  applyPreferences();  // Retain the authenticated account first-paint appearance.
  watchAuthentication();
  refreshCurrentUser();
})();
