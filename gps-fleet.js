(function() {
  'use strict';
  const client = window.supabaseClient || window.supabase.createClient('https://bafmycjninxomufhkjvy.supabase.co', 'sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ');
  window.supabaseClient = client;
  const M = window.AmanahFleet;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {vehicles:[], fetchedAt:null, allowed:false, userId:null, busy:false, generation:0, nextAt:0, stopAuto:false, lastPaint:0};
  let map = null, layer = null, fitted = false;
  const markers = new Map();
  const errors = {
    CARTRACK_NOT_CONFIGURED:'The Cartrack connection is not configured. An AMANAH administrator must finish GPS setup.',
    CARTRACK_AUTH_FAILED:'Cartrack rejected the stored API credentials. Ask an AMANAH administrator to check the connection.',
    CARTRACK_ACCESS_DENIED:'Cartrack denied access. Check the integration user’s vehicle access and API permissions.',
    CARTRACK_RATE_LIMIT:'Cartrack is temporarily limiting requests. Please wait before refreshing.',
    CARTRACK_RESPONSE_INVALID:'Cartrack returned an unexpected or incomplete response. The last loaded snapshot has been retained.',
    AUTH_REQUIRED:'Your session could not be verified. Sign in to AMANAH again.',
    ACCESS_DENIED:'Your AMANAH role does not include equipment viewing access.',
    CONNECTION_UNAVAILABLE:'The fleet refresh failed. The last loaded positions, if any, are retained. Check their GPS update times and try again.'
  };
  function message(text = '', error = false) {
    $('fleetMessage').textContent = text;
    $('fleetMessage').hidden = !text;
    $('fleetMessage').classList.toggle('error', error);
  }
  async function timed(promise) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error('timeout')), 40000); })]); }
    finally { window.clearTimeout(timer); }
  }
  function controls() {
    $('fleetRefresh').disabled = !state.allowed || state.busy || Date.now() < state.nextAt;
    $('fleetRefresh').textContent = state.busy ? 'Refreshing…' : 'Refresh fleet';
    $('fleetFit').disabled = !map || markers.size === 0;
  }
  function clearFleet() {
    state.generation++; state.allowed = false; state.busy = false;
    state.vehicles = []; state.fetchedAt = null; state.nextAt = 0;
    markers.clear(); layer?.clearLayers(); fitted = false;
    $('fleetWorkspace').hidden = true;
    $('fleetRows').innerHTML = '<tr><td colspan="7">No fleet snapshot loaded.</td></tr>';
    controls();
  }
  function ensureMap() {
    if (map) return;
    if (!window.L) { $('fleetMap').textContent = 'The map could not load. Vehicle details remain available below.'; return; }
    map = window.L.map('fleetMap').setView([7.2, 124.25], 8);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
    layer = window.L.featureGroup().addTo(map);
    window.requestAnimationFrame(() => map.invalidateSize());
  }
  function fit() {
    if (map && markers.size) map.fitBounds(layer.getBounds(), {padding:[35, 35], maxZoom:16});
  }
  function render() {
    const now = Date.now(); state.lastPaint = now;
    const s = M.summary(state.vehicles, now);
    for (const name of ['total', 'recent', 'moving', 'older']) $('fleet' + name[0].toUpperCase() + name.slice(1)).textContent = state.fetchedAt ? String(s[name]) : '—';
    const vehicles = M.filter(state.vehicles, $('fleetSearch').value, $('fleetFilter').value, now);
    $('fleetCount').textContent = state.fetchedAt ? vehicles.length + ' of ' + s.total + ' vehicles' : 'No snapshot loaded';
    $('fleetFetched').textContent = state.fetchedAt ? 'Snapshot retrieved ' + M.timeLabel(state.fetchedAt) + '. Each vehicle has its own GPS update time.' : 'No fleet snapshot loaded.';
    $('fleetRows').innerHTML = vehicles.length ? vehicles.map(v => {
      const freshness = M.freshness(v, now), positioned = M.hasLocation(v);
      const label = freshness === 'recent' ? 'Recent location' : freshness === 'missing' ? 'No location' : 'Last known location';
      const speed = v.speedKph === null ? '—' : Number(v.speedKph).toLocaleString('en-PH') + ' km/h';
      const odometer = v.odometerKm === null ? '—' : Number(v.odometerKm).toLocaleString('en-PH', {maximumFractionDigits:1}) + ' km';
      const coords = positioned ? v.latitude.toFixed(6) + ', ' + v.longitude.toFixed(6) : 'Coordinates unavailable';
      return '<tr><td><strong>' + esc(v.registration) + '</strong></td><td><span class="gps-tag ' + freshness + '">' + label + '</span><small>' + esc(M.motion(v)) + '</small></td><td>' + esc(speed) + '</td><td>' + esc(odometer) + '</td><td>' + esc(M.timeLabel(v.locationUpdatedAt)) + '<small>' + esc(M.ageLabel(v, now)) + '</small></td><td>' + esc(v.address || 'Address unavailable') + '<small>' + coords + '</small></td><td><button class="gps-button secondary" type="button" data-fleet-focus="' + state.vehicles.indexOf(v) + '"' + (!positioned || !map ? ' disabled' : '') + '>Show on map</button></td></tr>';
    }).join('') : '<tr><td colspan="7">' + (state.fetchedAt ? (state.vehicles.length ? 'No vehicles match your filters.' : 'Cartrack returned no vehicles. Check the integration user’s saved vehicle access.') : 'No fleet snapshot loaded.') + '</td></tr>';
    markers.clear(); layer?.clearLayers();
    if (map) for (const v of vehicles) {
      if (!M.hasLocation(v)) continue;
      const recent = M.freshness(v, now) === 'recent';
      const color = !recent ? '#b45309' : M.motion(v) === 'Moving' ? '#1d4ed8' : '#15803d';
      const marker = window.L.circleMarker([v.latitude, v.longitude], {radius:9, color:'#fff', weight:2, fillColor:color, fillOpacity:1}).addTo(layer);
      const popup = document.createElement('div'), name = document.createElement('strong'), detail = document.createElement('p');
      name.textContent = v.registration;
      detail.textContent = (recent ? 'Recent location' : 'Last known location') + ' · ' + M.motion(v) + '\nGPS updated: ' + M.timeLabel(v.locationUpdatedAt) + '\n' + (v.address || 'Address unavailable');
      popup.append(name, detail); marker.bindPopup(popup);
      markers.set(v, marker);
    }
    if (!fitted && markers.size) { fit(); fitted = true; }
    controls();
  }
  async function refresh() {
    if (!state.allowed || state.busy || Date.now() < state.nextAt) return;
    const generation = ++state.generation;
    state.busy = true; state.nextAt = Date.now() + 60000; controls();
    try {
      const {data, error} = await timed(client.functions.invoke('cartrack-fleet', {body:{}}));
      if (generation !== state.generation) return;
      if (error) {
        let body = {};
        try { body = await error.context?.clone().json() || {}; } catch { /* generic error below */ }
        if (generation !== state.generation) return;
        const code = body.code || (error.context?.status === 401 ? 'AUTH_REQUIRED' : error.context?.status === 403 ? 'ACCESS_DENIED' : 'CONNECTION_UNAVAILABLE');
        const failure = new Error(errors[code] || errors.CONNECTION_UNAVAILABLE);
        failure.code = code; failure.retry = body.retryAfterSeconds;
        throw failure;
      }
      if (!data || !Array.isArray(data.vehicles) || !Number.isFinite(Date.parse(data.fetchedAt)) || !data.vehicles.every(v => v && typeof v.registration === 'string')) {
        const error = new Error(errors.CARTRACK_RESPONSE_INVALID); error.code = 'CARTRACK_RESPONSE_INVALID'; throw error;
      }
      state.vehicles = data.vehicles; state.fetchedAt = data.fetchedAt; state.stopAuto = false;
      state.nextAt = Date.now() + Math.max(60, Math.min(3600, Number(data.refreshAfterSeconds) || 60)) * 1000;
      message(); render();
    } catch (error) {
      if (generation !== state.generation) return;
      const code = error.code || 'CONNECTION_UNAVAILABLE';
      if (code === 'AUTH_REQUIRED' || code === 'ACCESS_DENIED') { clearFleet(); message(errors[code], true); return; }
      state.stopAuto = ['CARTRACK_NOT_CONFIGURED', 'CARTRACK_AUTH_FAILED', 'CARTRACK_ACCESS_DENIED'].includes(code);
      state.nextAt = state.stopAuto ? 0 : Date.now() + Math.max(60, Math.min(3600, Number(error.retry) || 60)) * 1000;
      message(errors[code] || errors.CONNECTION_UNAVAILABLE, true); render();
    } finally { if (generation === state.generation) { state.busy = false; controls(); } }
  }
  async function initialize() {
    const generation = ++state.generation;
    try {
      const {data, error} = await timed(client.auth.getSession());
      if (generation !== state.generation) return;
      if (error || !data?.session) { clearFleet(); location.replace('admin.html'); return; }
      state.userId = data.session.user.id;
      const permissions = await timed(client.rpc('amanah_get_current_permissions'));
      if (generation !== state.generation) return;
      if (permissions.error) throw permissions.error;
      if (!Array.isArray(permissions.data) || !permissions.data.some(p => ['master_data.equipment', 'equipment_history.view'].includes(p.permission_key))) {
        clearFleet(); message(errors.ACCESS_DENIED, true); return;
      }
      state.allowed = true; $('fleetWorkspace').hidden = false;
      ensureMap(); message('Loading the latest fleet snapshot…'); render(); await refresh();
    } catch { if (generation === state.generation) { clearFleet(); message('AMANAH could not verify access. Reload this page to try again.', true); } }
  }
  $('fleetRefresh').addEventListener('click', refresh);
  $('fleetFit').addEventListener('click', fit);
  $('fleetSearch').addEventListener('input', render);
  $('fleetFilter').addEventListener('change', render);
  $('fleetRows').addEventListener('click', event => {
    const button = event.target.closest('[data-fleet-focus]');
    if (!button || button.disabled || !map) return;
    const v = state.vehicles[Number(button.dataset.fleetFocus)], marker = markers.get(v);
    if (marker) { map.setView([v.latitude, v.longitude], 16); marker.openPopup(); $('fleetMap').scrollIntoView({behavior:'smooth', block:'center'}); }
  });
  function tick() {
    if (!state.allowed || document.hidden) return;
    if (Date.now() - state.lastPaint >= 60000) render();
    controls();
    if ($('fleetAuto').checked && !state.stopAuto && Date.now() >= state.nextAt) refresh();
  }
  $('fleetAuto').addEventListener('change', tick);
  document.addEventListener('visibilitychange', tick);
  window.setInterval(tick, 15000);
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (state.userId && session?.user?.id !== state.userId)) { clearFleet(); message('Your session changed. Sign in and reload this page to view the fleet.', true); }
  });
  initialize();
})();
