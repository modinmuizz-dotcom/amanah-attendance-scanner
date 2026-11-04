import {normalizeSnapshot} from './data.js';

const ORIGIN = 'https://modinmuizz-dotcom.github.io';
const API = 'https://fleetapi-ph.cartrack.com/rest/vehicles/status';
const PERMISSIONS = ['master_data.equipment', 'equipment_history.view'];
const CACHE_MS = 30000;
class FleetError extends Error {
  constructor(code, message, status = 502, retry = 60) { super(message); Object.assign(this, {code, status, retry}); }
}
const retrySeconds = value => Math.max(1, Math.min(3600, Number(value) || 60));

export function createFleetHandler({env, fetch: fetcher = globalThis.fetch, now = Date.now}) {
  let cache = null, pending = null, pendingKey = '', failure = null;
  async function read(url, options = {}, timeout = 15000) {
    return await fetcher(url, {...options, redirect:'error', signal:AbortSignal.timeout(timeout)});
  }
  async function snapshot(username, password) {
    const key = username + '\0' + password;
    if (cache?.key === key && now() - cache.time < CACHE_MS) return {...cache.value, cached:true};
    if (failure?.key === key && now() < failure.until) throw failure.error;
    if (pending && pendingKey === key) return pending;
    pendingKey = key;
    const work = (async () => {
      try {
        const response = await read(API, {headers:{Authorization:'Basic ' + btoa(username + ':' + password), Accept:'application/json'}});
        if (!response.ok) {
          const retry = retrySeconds(response.headers.get('X-RateLimit-Retry-After-Seconds') || response.headers.get('Retry-After'));
          if (response.status === 401) throw new FleetError('CARTRACK_AUTH_FAILED', 'Cartrack rejected the stored API credentials. Ask an AMANAH administrator to check the connection.');
          if (response.status === 403) throw new FleetError('CARTRACK_ACCESS_DENIED', 'Cartrack denied access. Check the integration user’s vehicle access and API permissions.');
          if (response.status === 429) throw new FleetError('CARTRACK_RATE_LIMIT', 'Cartrack is temporarily limiting requests. Please wait before refreshing.', 429, retry);
          throw new FleetError('CARTRACK_UNAVAILABLE', 'Cartrack is temporarily unavailable. The last displayed positions may be out of date.', 503, retry);
        }
        let vehicles;
        try { vehicles = normalizeSnapshot(await response.json()); }
        catch { throw new FleetError('CARTRACK_RESPONSE_INVALID', 'Cartrack returned an unexpected or incomplete fleet response. Please retry later.'); }
        const value = {vehicles, fetchedAt:new Date(now()).toISOString(), refreshAfterSeconds:60, cached:false};
        cache = {key, time:now(), value}; failure = null;
        return value;
      } catch (error) {
        const safe = error instanceof FleetError ? error : new FleetError('CARTRACK_UNAVAILABLE', 'The Cartrack connection could not be reached. Please retry later.');
        failure = {key, until:now() + safe.retry * 1000, error:safe};
        throw safe;
      }
    })();
    pending = work;
    try { return await work; } finally { if (pending === work) { pending = null; pendingKey = ''; } }
  }
  return async function handler(request) {
    const origin = request.headers.get('origin');
    const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store', Vary:'Origin', 'X-Content-Type-Options':'nosniff'};
    if (origin === ORIGIN) Object.assign(headers, {'Access-Control-Allow-Origin':ORIGIN, 'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS'});
    const reply = (status, data, extra = {}) => new Response(JSON.stringify(data), {status, headers:{...headers, ...extra}});
    if (origin && origin !== ORIGIN) return reply(403, {code:'ORIGIN_DENIED', message:'Origin is not allowed.'});
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
    if (!['GET', 'POST'].includes(request.method)) return reply(405, {code:'METHOD_NOT_ALLOWED', message:'Only fleet viewing is supported.'}, {Allow:'GET, POST, OPTIONS'});
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) return reply(401, {code:'AUTH_REQUIRED', message:'Sign in to AMANAH to view the fleet.'});
    try {
      const url = env('SUPABASE_URL');
      let publicKey = env('SUPABASE_ANON_KEY');
      if (!publicKey) { try { publicKey = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || '{}').default; } catch { /* fail closed below */ } }
      if (!url || !publicKey) return reply(503, {code:'AUTH_UNAVAILABLE', message:'AMANAH access verification is unavailable.'});
      const authHeaders = {apikey:publicKey, Authorization:authorization};
      const userResponse = await read(url + '/auth/v1/user', {headers:authHeaders}, 10000);
      if (!userResponse.ok) return reply(userResponse.status >= 500 ? 503 : 401, {code:'AUTH_REQUIRED', message:'Your AMANAH session could not be verified. Please sign in again.'});
      const user = await userResponse.json();
      if (!user.id || user.is_anonymous) return reply(401, {code:'AUTH_REQUIRED', message:'Sign in with an assigned AMANAH account.'});
      const permissionResponse = await read(url + '/rest/v1/rpc/amanah_get_current_permissions', {method:'POST', headers:{...authHeaders, 'Content-Type':'application/json'}, body:'{}'}, 10000);
      if (!permissionResponse.ok) return reply(503, {code:'AUTH_UNAVAILABLE', message:'AMANAH could not verify your equipment permissions.'});
      const rows = await permissionResponse.json();
      if (!Array.isArray(rows) || !rows.some(row => PERMISSIONS.includes(row.permission_key))) return reply(403, {code:'ACCESS_DENIED', message:'Your AMANAH role does not include equipment viewing access.'});
      const username = (env('CARTRACK_API_USERNAME') || '').trim();
      const password = (env('CARTRACK_API_PASSWORD') || '').trim();
      if (!username || !password) return reply(503, {code:'CARTRACK_NOT_CONFIGURED', message:'The Cartrack connection is not configured. An AMANAH administrator must finish GPS setup.'});
      return reply(200, await snapshot(username, password));
    } catch (error) {
      // Provider responses, headers, secrets and exception text never enter client messages or logs.
      if (error instanceof FleetError) return reply(error.status, {code:error.code, message:error.message, retryAfterSeconds:error.retry}, {'Retry-After':String(error.retry)});
      return reply(503, {code:'CONNECTION_UNAVAILABLE', message:'The fleet connection is temporarily unavailable. Please retry later.', retryAfterSeconds:60}, {'Retry-After':'60'});
    }
  };
}
