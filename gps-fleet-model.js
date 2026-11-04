(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AmanahFleet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const RECENT_MS = 15 * 60 * 1000;
  function hasLocation(vehicle) {
    return typeof vehicle.latitude === 'number' && Number.isFinite(vehicle.latitude) && Math.abs(vehicle.latitude) <= 90 &&
      typeof vehicle.longitude === 'number' && Number.isFinite(vehicle.longitude) && Math.abs(vehicle.longitude) <= 180;
  }
  function age(vehicle, now = Date.now()) {
    if (!vehicle.locationUpdatedAt) return null;
    const value = Date.parse(vehicle.locationUpdatedAt);
    if (!Number.isFinite(value) || value > now + 5 * 60000) return null;
    return Math.max(0, now - value);
  }
  function freshness(vehicle, now = Date.now()) {
    if (!hasLocation(vehicle)) return 'missing';
    const value = age(vehicle, now);
    return value !== null && value <= RECENT_MS && vehicle.gpsFix !== 0 && vehicle.gpsFix !== 1 ? 'recent' : 'older';
  }
  function motion(vehicle) {
    if (vehicle.speedKph > 0) return 'Moving';
    if (vehicle.idling === true) return 'Idling';
    if (vehicle.ignition === true) return 'Engine on';
    if (vehicle.ignition === false) return 'Engine off';
    return 'Unknown';
  }
  function timeLabel(value) {
    const date = value && new Date(value);
    return date && Number.isFinite(date.getTime()) ? date.toLocaleString('en-PH', {timeZone:'Asia/Manila', year:'numeric', month:'short', day:'2-digit', hour:'numeric', minute:'2-digit', second:'2-digit'}) + ' PHT' : 'Time unavailable';
  }
  function ageLabel(vehicle, now = Date.now()) {
    const ms = age(vehicle, now);
    if (ms === null) return 'Update time unavailable';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'Less than a minute ago';
    if (minutes < 60) return minutes + ' min ago';
    if (minutes < 1440) return Math.floor(minutes / 60) + ' hr ago';
    return Math.floor(minutes / 1440) + ' days ago';
  }
  function summary(vehicles, now = Date.now()) {
    return vehicles.reduce((s, v) => {
      s.total++;
      if (freshness(v, now) === 'recent') { s.recent++; if (motion(v) === 'Moving') s.moving++; }
      else s.older++;
      return s;
    }, {total:0, recent:0, moving:0, older:0});
  }
  function filter(vehicles, query, status, now = Date.now()) {
    query = String(query || '').trim().toLowerCase();
    return vehicles.filter(v => (!query || (v.registration + ' ' + v.address).toLowerCase().includes(query)) &&
      (!status || freshness(v, now) === status || (status === 'moving' && freshness(v, now) === 'recent' && motion(v) === 'Moving')));
  }
  return {hasLocation, age, freshness, motion, timeLabel, ageLabel, summary, filter, RECENT_MS};
});
