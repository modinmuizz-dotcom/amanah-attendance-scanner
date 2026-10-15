/* AMANAH shared dashboard — Phases 1–3. All financial values originate from
   permission-checked Supabase RPC, never from unfiltered client datasets. */
(function(){
 'use strict';
 const client=window.supabaseClient || (typeof supabaseClient!=='undefined'?supabaseClient:null);
 const root=document.getElementById('amanahControlCenter');
 if(!client||!root)return;
 const money=n=>'₱'+Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const approvedLinks=new Map([
  ['approvals.html','Approvals'],['finance-payroll.html','Payroll Approvals'],
  ['purchasing.html','Purchasing'],['payroll.html','Payroll'],
  ['project-schedule.html','Activity Calendar'],['equipment-maintenance.html','Maintenance'],
  ['repair-requests.html','Repair Requests'],['attendance.html','Attendance'],
  ['project-cost.html','Project Cost'],['lump-sum.html','Lump-Sum Contracts']
 ]);
 let request=0;
 const box=(title,value,description)=>'<div class="amanah-ctl-card"><span class="amanah-ctl-label">'+safe(title)+
  '</span><strong class="amanah-ctl-value">'+safe(value)+'</strong><div class="amanah-ctl-caption">'+safe(description)+'</div></div>';
 const panel=(title,sub,content)=>'<section class="amanah-ctl-panel"><h3>'+safe(title)+'</h3><p class="amanah-ctl-subtitle">'+safe(sub)+'</p>'+content+'</section>';
 const row=(label,value,href)=>{
  const link=approvedLinks.has(href)?'<a href="'+href+'">'+safe(label)+'</a>':safe(label);
  return '<div class="amanah-ctl-row"><span>'+link+'</span><strong>'+safe(value)+'</strong></div>';
 };
 const empty='<div class="amanah-ctl-empty">No records to display.</div>';
 function render(data){
  const perms=data.permissions||{};
  const cards=[],sections=[],shortcuts=[];
  const f=data.finance,p=data.purchasing,w=data.payroll,attendance=data.attendance,e=data.equipment;
  const projects=Array.isArray(data.projects)?data.projects:[];
  const actions=Array.isArray(data.actions)?data.actions:[];
  if(perms.schedule){
   cards.push(box('Active projects',projects.length,'Current projects, not completed or cancelled'));
   shortcuts.push('project-schedule.html');
   const progress=projects.map(project=>{
    const val=project.progress==null?null:Number(project.progress);
    const clamped=val===null?0:Math.max(0,Math.min(100,val));
    return '<div class="amanah-ctl-row" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><strong>'+
      safe(project.name)+'</strong><span>'+safe(val==null?'Not reported':clamped.toFixed(1)+'%')+'</span></div>'+
      '<div class="amanah-progress-track"><div class="amanah-progress-fill '+(clamped>=100?'done':project.overdue?'warn':'')+
      '" style="width:'+clamped+'%"></div></div><div class="amanah-ctl-caption">'+
      safe(project.overdue?'Past target completion date':project.status||'No status')+'</div></div>';
   }).join('');
   sections.push(panel('Physical Project Progress','Reported project progress from Project Master; not derived from spending.',progress||empty));
  }
  if(perms.attendance&&attendance){
   cards.push(box('Workers currently timed in',attendance.on_site,'Attendance records with no Time Out'));
   shortcuts.push('attendance.html');
  }
  if(perms.financial&&f){
   cards.push(box('Actual recorded cost',money(f.actual_cost),'Posted transactions only — unpaid obligations excluded'));
   const finance=[
    row('Labor already posted',money(f.labor),'project-cost.html'),
    row('Materials already posted',money(f.materials),'project-cost.html'),
    row('Fuel recorded',money(f.fuel),'project-cost.html'),
    row('Other posted expenses',money(f.other),'project-cost.html')
   ].join('');
   sections.push(panel('Financial Health','Actual Project Cost ledger. Approved but unpaid labor and unposted received materials are not included.',finance));
   shortcuts.push('project-cost.html');
  }
  if(perms.approvals||perms.purchasing||perms.payroll||perms.maintenance){
   const total=actions.reduce((s,a)=>s+Number(a.count||0),0);
   cards.push(box('Action required',total,'Pending records visible to your role'));
   sections.push(panel('Action Required','Permission-filtered queues with shortcuts to their responsible modules.',
     actions.length?actions.map(a=>row(a.label,Number(a.count||0),a.href)).join(''):empty));
  }
  if(perms.purchasing&&p){
   sections.push(panel('Purchasing Monitoring','Received quantities are charged only after evidence-backed PO finalization.',
     row('Open Purchase Orders',p.open_orders,'purchasing.html')+
     row('Received lines ready for posting',p.unposted_received_lines,'purchasing.html')+
     row('Received lines missing prices',p.received_unpriced_lines,'purchasing.html')));
   shortcuts.push('purchasing.html');
  }
  if(perms.payroll&&w){
   sections.push(panel('Payroll & Payment Monitoring','Financial approval authorizes payment but does not yet post project labor cost.',
    row('Payroll runs pending approval',w.awaiting_approval,'finance-payroll.html')+
    row('Approved, unreleased wages',money(w.approved_unreleased_amount),'payroll.html')));
   shortcuts.push('finance-payroll.html');
  }
  if(perms.equipment&&e){
   sections.push(panel('Equipment Monitoring','Equipment Master statuses, not assumed live GPS or operating hours.',
    row('Equipment in master',e.total,'equipment-maintenance.html')+
    row('Available / operational',e.active,'equipment-maintenance.html')));
   shortcuts.push('equipment-maintenance.html');
  }
  if(perms.attendance&&attendance){
   sections.push(panel('Workforce Today','Philippine date (Asia/Manila).',
    row('Recorded Time In today',attendance.today_in,'attendance.html')+
    row('Currently without Time Out',attendance.on_site,'attendance.html')));
  }
  const unique=[...new Set(shortcuts)];
  const links=unique.filter(x=>approvedLinks.has(x)).map(x=>
    '<a href="'+x+'">'+safe(approvedLinks.get(x))+'</a>').join('');
  root.innerHTML='<div class="amanah-control-head"><div><h2>OPERATIONS & FINANCIAL CONTROL</h2><p>One dashboard • individual role permissions • amounts reflect current posted records</p></div>'+
   '<button type="button" id="amanahControlRefresh" class="refresh">REFRESH OVERVIEW</button></div>'+
   '<div class="amanah-ctl-cards">'+(cards.join('')||box('Dashboard','Ready','No additional summaries assigned to this account'))+'</div>'+
   '<div class="amanah-ctl-grid">'+sections.join('')+'</div>'+
   '<nav class="amanah-ctl-actions" aria-label="Authorized module shortcuts">'+links+'</nav>'+
   '<div class="amanah-ctl-caption">Updated '+safe(new Date(data.as_of).toLocaleString('en-PH',{timeZone:'Asia/Manila'}))+' PHT • Click Refresh Overview for current values.</div>';
  root.querySelector('#amanahControlRefresh')?.addEventListener('click',load);
  // Older general-purpose dashboard panels are hidden only where current role
  // lacks access. The RPC itself applies server-side permission checks.
  const costBlock=document.querySelector('.cost-dashboard-panel');
  if(costBlock) costBlock.hidden=!perms.financial;
  const oldCards=document.querySelector('main.container > .cards');
  if(oldCards)oldCards.hidden=!(perms.equipment&&perms.attendance);
  const oldAttendance=document.getElementById('attendanceBody')?.closest('section.panel');
  if(oldAttendance)oldAttendance.hidden=!perms.attendance;
  const oldProgress=document.querySelector('.project-progress-future');
  if(oldProgress)oldProgress.hidden=true; // replaced by live progress list above
 }
 async function load(){
  const id=++request;
  root.innerHTML='<p class="amanah-ctl-empty">Loading authorized live dashboard summaries…</p>';
  try{
   const {data,error}=await client.rpc('amanah_dashboard_control_center');
   if(error)throw error;
   if(request!==id)return;
   render(data||{});
  }catch(error){
   if(request!==id)return;
   console.error('AMANAH dashboard control center',error);
   root.innerHTML='<div class="amanah-ctl-panel amanah-ctl-unavailable">Unable to load your role-specific Dashboard: '+
    safe(error?.message||'Please try again.')+
    '<div class="amanah-ctl-actions"><button class="refresh" id="amanahControlRetry">RETRY</button></div></div>';
   root.querySelector('#amanahControlRetry')?.addEventListener('click',load);
  }
 }
 const refresh=document.getElementById('refreshButton');
 if(refresh)refresh.addEventListener('click',load);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
 load();
})();