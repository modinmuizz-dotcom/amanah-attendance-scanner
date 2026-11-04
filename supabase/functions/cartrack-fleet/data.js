// Whitelist the documented GET /vehicles/status fields. Never return raw provider data.
export function numeric(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function timestamp(value) {
  if (typeof value !== 'string') return null;
  let text = value.trim().replace(' ', 'T');
  if (/[+-]\d{2}$/.test(text)) text += ':00';
  if (/[+-]\d{4}$/.test(text)) text = text.slice(0, -2) + ':' + text.slice(-2);
  // Do not interpret a timezone-free provider timestamp in the server's local timezone.
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(text)) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
const label = (value, length = 250) => typeof value === 'string' ? value.trim().slice(0, length) : '';
const boolean = value => typeof value === 'boolean' ? value : null;
export function normalizeSnapshot(payload) {
  if (!payload || !Array.isArray(payload.data) || payload.error || payload.data.length > 10000) throw new Error('Invalid fleet response');
  if (numeric(payload.meta?.last_page) > (numeric(payload.meta?.current_page) ?? 1)) throw new Error('Incomplete fleet response');
  const vehicles = new Map();
  for (const row of payload.data) {
    if (!row || typeof row !== 'object' || !label(row.registration, 80)) throw new Error('Invalid vehicle');
    const location = row.location || {};
    const lat = numeric(location.latitude), lng = numeric(location.longitude);
    const positioned = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const odometer = numeric(row.odometer), speed = numeric(row.speed), clock = numeric(row.clock);
    const vehicle = {
      vehicleId: label(row.vehicle_id, 100), registration: label(row.registration, 80),
      latitude: positioned ? lat : null, longitude: positioned ? lng : null,
      locationUpdatedAt: timestamp(location.updated), eventUpdatedAt: timestamp(row.event_ts),
      gpsFix: [0, 1, 2, 3].includes(numeric(location.gps_fix_type)) ? numeric(location.gps_fix_type) : null,
      speedKph: speed !== null && speed >= 0 ? speed : null,
      ignition: boolean(row.ignition), idling: boolean(row.idling),
      odometerKm: odometer !== null && odometer >= 0 ? odometer / 1000 : null,
      clockMinutes: clock !== null && clock >= 0 ? clock : null,
      address: label(location.position_description)
    };
    const key = vehicle.vehicleId || vehicle.registration.toUpperCase();
    const previous = vehicles.get(key);
    if (!previous || (Date.parse(vehicle.locationUpdatedAt) || 0) > (Date.parse(previous.locationUpdatedAt) || 0)) vehicles.set(key, vehicle);
  }
  return [...vehicles.values()].sort((a, b) => a.registration.localeCompare(b.registration));
}
