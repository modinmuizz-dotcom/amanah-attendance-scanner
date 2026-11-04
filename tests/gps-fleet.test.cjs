const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const M = require('../gps-fleet-model.js');
const NOW = Date.parse('2026-11-04T08:00:00Z');
const provider = (overrides = {}) => ({vehicle_id:'test-vehicle-1', registration:'TEST-001', event_ts:'2026-11-04 16:00:00+08', speed:25, ignition:true, idling:false, odometer:125000, clock:600,
  location:{latitude:14.5995, longitude:120.9842, updated:'2026-11-04 15:58:00+08:00', gps_fix_type:3, position_description:'Test location'}, ...overrides});
const normalized = (overrides = {}) => ({vehicleId:'test-vehicle-1', registration:'TEST-001', latitude:14.5995, longitude:120.9842, locationUpdatedAt:'2026-11-04T07:58:00.000Z', eventUpdatedAt:'2026-11-04T08:00:00.000Z', gpsFix:3, speedKph:25, ignition:true, idling:false, odometerKm:125, clockMinutes:600, address:'Test location', ...overrides});
const snapshot = vehicles => ({vehicles:vehicles || [normalized()], fetchedAt:'2026-11-04T08:00:00.000Z', refreshAfterSeconds:60});
const dataModule = import('../supabase/functions/cartrack-fleet/data.js');
const handlerModule = import('../supabase/functions/cartrack-fleet/handler.js');

test('provider timestamps and meters normalize without returning extra personal or secret fields', async () => {
  const {normalizeSnapshot, timestamp} = await dataModule;
  const v = normalizeSnapshot({data:[provider({password:'synthetic-secret', driver:{phone_number:'synthetic-private-phone'}})]})[0];
  assert.equal(v.odometerKm,125); assert.equal(v.locationUpdatedAt,'2026-11-04T07:58:00.000Z');
  assert.equal(v.eventUpdatedAt,'2026-11-04T08:00:00.000Z');
  assert.equal(v.clockMinutes,600); assert.equal(v.speedKph,25);
  assert.ok(!JSON.stringify(v).includes('synthetic-')); assert.equal(timestamp('2026-11-04 08:00:00'),null);
  assert.equal(timestamp('2026-11-04 10:00:00+0200'),'2026-11-04T08:00:00.000Z');
});
test('missing/invalid coordinates and null measurements never become zero', async () => {
  const {normalizeSnapshot} = await dataModule;
  const v=normalizeSnapshot({data:[provider({speed:null,odometer:null,clock:'',location:{latitude:'',longitude:120}})]})[0];
  for(const field of ['latitude','longitude','speedKph','odometerKm','clockMinutes','locationUpdatedAt'])assert.equal(v[field],null,field);
  const out=normalizeSnapshot({data:[provider({location:{latitude:100,longitude:190}})]})[0];assert.equal(out.latitude,null);
});
test('provider errors and incomplete pages fail instead of silently displaying a partial fleet', async () => {
  const {normalizeSnapshot}=await dataModule;
  for(const body of [{}, {data:null}, {data:[null]}, {data:[{}]}, {data:[],error:{message:'provider detail'}}, {data:[],meta:{current_page:1,last_page:2}}])assert.throws(()=>normalizeSnapshot(body));
  assert.deepEqual(normalizeSnapshot({data:[]}),[]);
});
test('duplicate vehicle records keep the latest GPS location', async()=>{
  const {normalizeSnapshot}=await dataModule;
  const older=provider({location:{latitude:1,longitude:2,updated:'2026-11-03T08:00:00Z'}});
  const v=normalizeSnapshot({data:[provider(),older]});assert.equal(v.length,1);assert.equal(v[0].latitude,14.5995);
});
test('freshness uses the GPS timestamp rather than a newer engine event',()=>{
  const old=normalized({locationUpdatedAt:'2026-11-02T08:00:00Z'});
  assert.equal(M.freshness(old,NOW),'older');assert.equal(M.ageLabel(old,NOW),'2 days ago');
  assert.equal(M.freshness(normalized(),NOW),'recent');
  assert.equal(M.freshness(normalized({gpsFix:1}),NOW),'older');
  assert.equal(M.freshness(normalized({locationUpdatedAt:null}),NOW),'older');
  assert.equal(M.freshness(normalized({locationUpdatedAt:'2026-11-05T08:00:00Z'}),NOW),'older');
  assert.equal(M.freshness(normalized({latitude:null}),NOW),'missing');
});
test('summary and filters distinguish recent motion from old moving reports',()=>{
  const vehicles=[normalized(),normalized({registration:'TEST-002',locationUpdatedAt:'2026-11-01T00:00:00Z'}),normalized({registration:'TEST-003',latitude:null})];
  assert.deepEqual(M.summary(vehicles,NOW),{total:3,recent:1,moving:1,older:2});
  assert.equal(M.filter(vehicles,'','moving',NOW).length,1);
  assert.equal(M.filter(vehicles,'test-002','',NOW).length,1);
  assert.equal(M.filter(vehicles,'test location','missing',NOW).length,1);
  assert.match(M.timeLabel('2026-11-04T08:00:00Z'),/4:00:00 PM.*PHT/);
});

async function backend(options={}) {
  const {createFleetHandler}=await handlerModule;
  let now=NOW;const calls=[];
  const secrets={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public-test-key',CARTRACK_API_USERNAME:'test-account',CARTRACK_API_PASSWORD:'private-test-key',...options.env};
  const handler=createFleetHandler({env:name=>secrets[name],now:()=>now,fetch:async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify(options.user||{id:'test-user'}),{status:options.authStatus||200});
    if(url.includes('/rpc/'))return new Response(JSON.stringify(options.permissions||[{permission_key:'equipment_history.view'}]),{status:options.permissionStatus||200});
    if(options.upstream)return await options.upstream(url,init);
    return new Response(JSON.stringify({data:[provider()]}));
  }});
  const request=(extra={})=>new Request('https://test.supabase.co/functions/v1/cartrack-fleet', {method:extra.method||'POST',headers:{origin:'https://modinmuizz-dotcom.github.io',authorization:'Bearer user-test-jwt',...extra.headers}, ...(extra.body?{body:extra.body}:{})});
  return{handler,calls,secrets,request,advance:ms=>{now+=ms;}};
}
test('missing authentication, disallowed origins and write methods are rejected before contacting services',async()=>{
  const b=await backend();
  assert.equal((await b.handler(b.request({headers:{authorization:''}}))).status,401);
  assert.equal((await b.handler(b.request({headers:{origin:'https://untrusted.example'}}))).status,403);
  assert.equal((await b.handler(b.request({method:'DELETE'}))).status,405);
  assert.equal(b.calls.length,0);
  const preflight=await b.handler(b.request({method:'OPTIONS',headers:{authorization:''}}));assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),'https://modinmuizz-dotcom.github.io');
});
test('anonymous identities and unrelated role permissions cannot fetch telemetry',async()=>{
  for(const options of [{authStatus:401},{user:{id:'test',is_anonymous:true}},{permissions:[]},{permissions:[{permission_key:'payroll.view'}]}]){
    const b=await backend(options);const res=await b.handler(b.request());
    assert.ok([401,403].includes(res.status));assert.ok(b.calls.every(c=>!c.url.includes('cartrack.com')));
  }
});
test('missing secrets report unconfigured only after successful user and permission verification',async()=>{
  const b=await backend({env:{CARTRACK_API_PASSWORD:''}});const response=await b.handler(b.request());
  assert.equal(response.status,503);assert.equal((await response.json()).code,'CARTRACK_NOT_CONFIGURED');assert.equal(b.calls.length,2);
});
test('authorized requests use a fixed read-only regional target, Basic auth and safe responses',async()=>{
  const b=await backend();const response=await b.handler(b.request({body:JSON.stringify({url:'https://untrusted.example/steal',method:'DELETE'})}));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const data=await response.json();assert.equal(data.vehicles[0].odometerKm,125);
  const call=b.calls.at(-1);assert.equal(call.url,'https://fleetapi-ph.cartrack.com/rest/vehicles/status');
  assert.equal(call.init.method,undefined);assert.equal(call.init.redirect,'error');
  assert.equal(call.init.headers.Authorization,'Basic '+btoa('test-account:private-test-key'));
  assert.ok(!JSON.stringify(data).includes('private-test-key'));
  assert.equal(b.calls[1].init.headers.Authorization,'Bearer user-test-jwt');
});
test('cached snapshots still require fresh user and role verification on every request',async()=>{
  const permissions=[{permission_key:'master_data.equipment'}];const b=await backend({permissions});
  await b.handler(b.request());const response=await b.handler(b.request());assert.equal((await response.json()).cached,true);
  assert.equal(b.calls.filter(c=>c.url.includes('cartrack.com')).length,1);
  permissions.length=0;assert.equal((await b.handler(b.request())).status,403);
  assert.equal(b.calls.filter(c=>c.url.endsWith('/auth/v1/user')).length,3);
});
test('concurrent authorized requests share a provider request; changed secrets invalidate cached data',async()=>{
  let resolve;const wait=new Promise(r=>resolve=r);let count=0;
  const b=await backend({upstream:async()=>{count++;await wait;return new Response(JSON.stringify({data:[provider()]}));}});
  const first=b.handler(b.request()), second=b.handler(b.request());
  await new Promise(setImmediate);resolve();assert.equal((await first).status,200);assert.equal((await second).status,200);assert.equal(count,1);
  b.secrets.CARTRACK_API_PASSWORD='replacement-test-key';await b.handler(b.request());assert.equal(count,2);
});
test('rate limits respect provider retry delay and avoid repeatedly calling Cartrack',async()=>{
  let count=0;const b=await backend({upstream:async()=>{count++;return new Response('sensitive provider detail',{status:429,headers:{'X-RateLimit-Retry-After-Seconds':'120'}});}});
  const first=await b.handler(b.request());assert.equal(first.status,429);assert.equal(first.headers.get('retry-after'),'120');
  assert.ok(!(await first.text()).includes('sensitive provider detail'));
  b.advance(60000);await b.handler(b.request());assert.equal(count,1);
  b.advance(61000);await b.handler(b.request());assert.equal(count,2);
});
test('upstream auth errors, malformed payloads and network exceptions never echo private material',async()=>{
  for(const upstream of [async()=>new Response('private-test-key',{status:401}),async()=>new Response('private-test-key',{status:403}),async()=>new Response('private-test-key'),async()=>{throw new Error('private-test-key');}]){
    const b=await backend({upstream});const response=await b.handler(b.request());assert.ok(response.status>=500);assert.ok(!(await response.text()).includes('private-test-key'));
  }
});

class Element {
  constructor(){this.listeners={};this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.checked=true;this.value='';this.classList={toggle(){}};}
  addEventListener(name,fn){this.listeners[name]=fn;}
  async emit(name,event={}){await this.listeners[name]?.(event);}
}
async function browser(options={}) {
  const html=fs.readFileSync(path.join(root,'gps-fleet.html'),'utf8');
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  let now=NOW,authChange,tick,visibility;const calls=[],responses=[...(options.responses||[{data:snapshot(),error:null}])];
  const document={hidden:false,getElementById:id=>nodes[id],addEventListener:(name,fn)=>{if(name==='visibilitychange')visibility=fn;}};
  const client={auth:{getSession:async()=>({data:{session:options.loggedOut?null:{user:{id:'test-user'}}}}),onAuthStateChange:fn=>{authChange=fn;}},
    rpc:async()=>({data:options.permissions||[{permission_key:'equipment_history.view'}]}),
    functions:{invoke:async()=>{calls.push('invoke');return options.invoke?await options.invoke():responses.shift()||{data:snapshot(),error:null};}}};
  const redirects=[];
  vm.runInNewContext(fs.readFileSync(path.join(root,'gps-fleet.js'),'utf8'),{
    window:{AmanahFleet:M,supabase:{createClient:()=>client},setTimeout,clearTimeout,setInterval:fn=>{tick=fn;}}, document,
    location:{replace:to=>redirects.push(to)},Date:class extends Date {static now(){return now;}}, Map,console
  });
  const flush=async()=>{for(let i=0;i<6;i++)await new Promise(setImmediate);};await flush();
  return{nodes,calls,responses,redirects,document,flush,advance:ms=>{now+=ms;},authChange:(event,session)=>authChange(event,session),tick:()=>tick(),visibility:()=>visibility(),click:async id=>{await nodes[id].emit('click');await flush();}};
}
test('browser denies unrelated roles and redirects signed-out users before calling the fleet function',async()=>{
  const denied=await browser({permissions:[{permission_key:'payroll.view'}]});assert.equal(denied.calls.length,0);assert.equal(denied.nodes.fleetWorkspace.hidden,true);
  const out=await browser({loggedOut:true});assert.deepEqual(out.redirects,['admin.html']);assert.equal(out.calls.length,0);
});
test('vehicle list works without the map library, escapes names and retains a snapshot on failed refresh',async()=>{
  const h=await browser({responses:[{data:snapshot([normalized({registration:'<script>TEST</script>'})]),error:null},{data:null,error:new Error('network')}]});
  assert.match(h.nodes.fleetRows.innerHTML,/&lt;script&gt;TEST/);assert.doesNotMatch(h.nodes.fleetRows.innerHTML,/<script>/);
  assert.equal(h.nodes.fleetTotal.textContent,'1');assert.match(h.nodes.fleetMap.textContent,/map could not load/);
  h.advance(61000);await h.click('fleetRefresh');assert.equal(h.nodes.fleetTotal.textContent,'1');assert.match(h.nodes.fleetRows.innerHTML,/TEST/);assert.equal(h.nodes.fleetMessage.hidden,false);
});
test('auto refresh pauses in a hidden tab and resumes only after the refresh interval',async()=>{
  const h=await browser();h.advance(61000);h.document.hidden=true;h.tick();await h.flush();assert.equal(h.calls.length,1);
  h.document.hidden=false;h.visibility();await h.flush();assert.equal(h.calls.length,2);
  h.tick();await h.flush();assert.equal(h.calls.length,2);
});
test('signing out clears visible data and prevents a late snapshot from reappearing',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r);
  const h=await browser({invoke:()=>pending});assert.equal(h.calls.length,1);
  h.authChange('SIGNED_OUT',null);resolve({data:snapshot(),error:null});await h.flush();
  assert.equal(h.nodes.fleetWorkspace.hidden,true);assert.doesNotMatch(h.nodes.fleetRows.innerHTML,/TEST-001/);
});
test('a server permission rejection clears a previously displayed snapshot',async()=>{
  const error={context:new Response(JSON.stringify({code:'ACCESS_DENIED'}),{status:403})};
  const h=await browser({responses:[{data:snapshot(),error:null},{data:null,error}]});
  h.advance(61000);await h.click('fleetRefresh');assert.equal(h.nodes.fleetWorkspace.hidden,true);assert.doesNotMatch(h.nodes.fleetRows.innerHTML,/TEST-001/);
});
test('unconfigured credentials stop automatic retries but allow a manual check after setup',async()=>{
  const error={context:new Response(JSON.stringify({code:'CARTRACK_NOT_CONFIGURED'}),{status:503})};
  const h=await browser({responses:[{data:null,error},{data:snapshot(),error:null}]});
  h.advance(120000);h.tick();await h.flush();assert.equal(h.calls.length,1);assert.equal(h.nodes.fleetRefresh.disabled,false);
  await h.click('fleetRefresh');assert.equal(h.calls.length,2);assert.equal(h.nodes.fleetTotal.textContent,'1');
});
