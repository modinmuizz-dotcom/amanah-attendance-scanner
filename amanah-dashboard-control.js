/* AMANAH corporate management dashboard. Read-only reporting; the server
 * determines permissions and computes financial totals. Never infer access
 * from a user's name, localStorage, or UI role labels. */
(function () {
  'use strict';

  const api = typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient;
  const root = document.getElementById('amanahControlCenter');
  if (!api || !root) return;

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const qty = value => Number(value || 0).toLocaleString('en-PH',{maximumFractionDigits:0});
  const peso = value => '₱' + Number(value || 0).toLocaleString('en-PH',
    {minimumFractionDigits:2,maximumFractionDigits:2});
  const validCount = value => Number.isFinite(Number(value)) && Number(value) >= 0 ?
    Number(value) : 0;
  const phDate = value => {
    const stamp = new Date(value);
    return Number.isNaN(stamp.getTime()) ? 'Not available' :
      stamp.toLocaleString('en-PH',{
        timeZone:'Asia/Manila',day:'2-digit',month:'short',year:'numeric',
        hour:'numeric',minute:'2-digit',hour12:true
      }) + ' PHT';
  };
  const pathLabels = {
    'approvals.html':'Approval Center',
    'finance-payroll.html':'Payroll Approvals',
    'purchasing.html':'Purchasing',
    'payroll.html':'Payroll',
    'project-schedule.html':'Activity Calendar',
    'equipment-maintenance.html':'Maintenance',
    'repair-requests.html':'Repair Requests',
    'attendance.html':'Attendance',
    'project-cost.html':'Project Cost',
    'lump-sum.html':'Lump-Sum Contracts',
    'reports.html':'Reports'
  };

  // Permissions for destinations match the sidebar's access configuration.
  // Do not render inaccessible quick links.
  function canVisit(href, p) {
    switch(href) {
      case 'approvals.html': return !!p.approvals;
      case 'finance-payroll.html': return !!p.payroll_approve;
      case 'purchasing.html': return !!p.purchasing;
      case 'payroll.html': return !!p.payroll;
      case 'project-schedule.html': return !!p.schedule;
      case 'equipment-maintenance.html': return !!p.maintenance_access;
      case 'repair-requests.html': return !!p.repairs_access;
      case 'attendance.html': return !!p.attendance;
      case 'project-cost.html': return !!p.cost_access;
      case 'lump-sum.html': return !!p.schedule;
      case 'reports.html': return !!p.reports_access;
      default: return false;
    }
  }

  const makeLink = (href, label, p, cssClass) =>
    pathLabels[href] && canVisit(href,p) ?
      '<a class="'+(cssClass || '')+'" href="'+href+'">'+esc(label)+'</a>' :
      '<span>'+esc(label)+'</span>';
  const kpi = (label, value, note, index, status) =>
    '<article class="am-exec-kpi '+(status||'')+'">'+
      '<div class="am-exec-kpi-top"><span class="am-exec-kpi-index">0'+(index+1)+'</span>'+
        '<span class="am-exec-kpi-rule" aria-hidden="true"></span></div>'+
      '<div class="am-exec-kpi-label">'+esc(label)+'</div>'+
      '<strong class="am-exec-kpi-value">'+esc(value)+'</strong>'+
      '<p class="am-exec-kpi-note">'+esc(note)+'</p>'+
    '</article>';

  const sectionHeader = (number, eyebrow, title, subtitle) =>
    '<header class="am-section-head"><span class="am-section-index">'+esc(number)+'</span>'+
      '<div><span class="am-section-eyebrow">'+esc(eyebrow)+'</span>'+
      '<h3>'+esc(title)+'</h3>'+
      '<p>'+esc(subtitle)+'</p></div></header>';

  const card = (heading, caption, body, footer) =>
    '<article class="am-corp-panel"><div class="am-corp-panel-head">'+
      '<div><h4>'+esc(heading)+'</h4><p>'+esc(caption)+'</p></div></div>'+
      '<div class="am-corp-panel-body">'+body+'</div>'+
      (footer?'<div class="am-corp-panel-foot">'+footer+'</div>':'')+'</article>';

  const infoRow = (label, value, href, p, extra) =>
    '<div class="am-corp-list-row">'+
      '<span class="am-corp-row-label">'+makeLink(href,label,p,'am-corp-row-link')+
      (extra?'<small>'+esc(extra)+'</small>':'')+'</span>'+
      '<strong class="am-corp-row-number">'+esc(value)+'</strong></div>';

  const noData = text => '<p class="am-corp-empty">'+esc(text)+'</p>';
  let generation = 0;
  let lastData = null;

  function progressPanel(projects, p) {
    if (!projects.length) return card('Project accomplishment',
      'Based on reported progress in Project Master',
      noData('No active projects were returned.'),makeLink('project-schedule.html','Open Activity Calendar →',p,'am-corp-footer-link'));

    const countOverdue = projects.filter(x=>x.overdue === true).length;
    const rows = projects.map(project=>{
      const raw = project.progress == null ? null : Number(project.progress);
      const valid = raw != null && Number.isFinite(raw);
      const percent = valid ? Math.max(0,Math.min(100,raw)) : 0;
      const statusText = project.overdue ? 'Past target date' :
        valid ? (String(project.status||'Active').toUpperCase()) : 'Progress not reported';
      const flag = project.overdue ? ' is-late' : '';
      return '<li class="am-corp-progress-item">'+
        '<div class="am-corp-progress-top"><strong>'+esc(project.name||project.id||'Project')+'</strong>'+
          '<span class="am-corp-percent">'+(valid?esc(percent.toFixed(1)+'%'):'—')+'</span></div>'+
        '<div class="am-corp-progress-track" role="progressbar" aria-label="'+
          esc((project.name||'Project')+' completion')+'" aria-valuemin="0" aria-valuemax="100"'+
          (valid?' aria-valuenow="'+percent+'"':' aria-valuetext="Not reported"')+'>'+
          '<span class="am-corp-progress-fill'+flag+'" style="width:'+percent+'%"></span></div>'+
        '<div class="am-corp-progress-foot"><span class="'+(project.overdue?'am-corp-late':'')+'">'+
          esc(statusText)+'</span><span>'+esc(project.target_date ? 'Target '+project.target_date : 'No target date')+
          '</span></div></li>';
    }).join('');
    return card('Project accomplishment',
      countOverdue ? qty(countOverdue)+' project(s) beyond target date' :
        'Physical progress is separate from expenses',
      '<ul class="am-corp-progress-list">'+rows+'</ul>',
      makeLink('project-schedule.html','Open Activity Calendar →',p,'am-corp-footer-link'));
  }

  function actionsPanel(actions, p) {
    const safeActions=actions.filter(a=>canVisit(a.href,p));
    const count=safeActions.reduce((total,a)=>total+validCount(a.count),0);
    const items=safeActions.filter(a=>validCount(a.count)>0);
    let content = items.length ? '<ul class="am-corp-action-list">'+items.map(a=>
      '<li><div class="am-corp-action-item">'+
        '<div class="am-corp-action-detail"><span class="am-corp-action-dot" aria-hidden="true"></span>'+
          makeLink(a.href,a.label,p,'am-corp-action-link')+'</div>'+
        '<span class="am-corp-count">'+qty(a.count)+'</span></div></li>').join('')+
      '</ul>' : noData('No outstanding items in your authorized queues.');
    return card('Action required',count ? qty(count)+' items need review or follow-up' :
      'Your assigned action queues are clear',content,
      makeLink(p.approvals?'approvals.html':p.purchasing?'purchasing.html':p.payroll_approve?'finance-payroll.html':'repair-requests.html',
        'Open relevant module →',p,'am-corp-footer-link'));
  }

  function financialPanel(finance,p) {
    const categories=[
      {label:'Labor',value:validCount(finance.labor),className:'labor'},
      {label:'Materials',value:validCount(finance.materials),className:'materials'},
      {label:'Fuel',value:validCount(finance.fuel),className:'fuel'},
      {label:'Other',value:validCount(finance.other),className:'other'}
    ];
    const total=validCount(finance.actual_cost);
    const bar=total>0?categories.map(x=>
      '<span class="am-corp-distribution '+x.className+'" style="width:'+
        Math.max(0,Math.min(100,x.value/total*100)).toFixed(3)+'%" title="'+
        esc(x.label+': '+peso(x.value))+'"></span>').join(''):'';
    return '<article class="am-corp-panel am-financial-panel">'+
      '<div class="am-corp-panel-head"><div><h4>Actual expense distribution</h4>'+
      '<p>Posted project-cost entries only. Pending payments and unposted received materials are excluded.</p></div>'+
      (canVisit('project-cost.html',p)?'<a class="am-corp-footer-link" href="project-cost.html">View ledger →</a>':'')+'</div>'+
      '<div class="am-financial-body"><div class="am-financial-total">'+
      '<span class="am-financial-total-label">TOTAL POSTED COST</span>'+
      '<strong>'+esc(peso(total))+'</strong><small>Recorded across permitted project costs</small>'+
      '<div class="am-corp-distribution-bar" aria-label="Distribution of posted labor, materials, fuel and other costs">'+
      bar+'</div></div><div class="am-financial-breakdown">'+categories.map(x=>
        '<div class="am-financial-line"><span><i class="am-financial-dot '+x.className+
        '" aria-hidden="true"></i>'+esc(x.label)+'</span><strong>'+esc(peso(x.value))+
        '</strong></div>').join('')+'</div></div></article>';
  }

  function render(data) {
    const p=data.permissions||{};
    const f=data.finance,w=data.payroll,po=data.purchasing,a=data.attendance,e=data.equipment;
    const projects=Array.isArray(data.projects)?data.projects:[];
    const actions=Array.isArray(data.actions)?data.actions:[];
    const visibleActions=actions.filter(x=>canVisit(x.href,p));
    const attentionCount=visibleActions.reduce((sum,x)=>sum+validCount(x.count),0);
    const overview=[];

    // Stable visual hierarchy for all roles; unavailable measures are never
    // exposed as dummy zeros or displayed without server authorization.
    if(p.schedule)overview.push(['Active projects',qty(projects.length),'Open projects in master']);
    if(p.financial&&f)overview.push(['Actual posted cost',peso(f.actual_cost),'Excludes approved but unpaid expenses']);
    if(p.attendance&&a)overview.push(['Currently on site',qty(a.on_site),'Time In recorded, no Time Out']);
    if(visibleActions.length)overview.push(['Items requiring attention',qty(attentionCount),'Across permitted action queues']);
    if(!overview.length&&p.purchasing&&po)overview.push(['Open purchase orders',qty(po.open_orders),'Currently active orders']);
    if(!overview.length&&p.equipment&&e)overview.push(['Registered equipment',qty(e.total),'Equipment Master records']);
    if(!overview.length&&p.payroll&&w)overview.push(['Payroll awaiting approval',qty(w.awaiting_approval),'Financial review queue']);

    const kpis=overview.map((x,i)=>kpi(x[0],x[1],x[2],i,
      x[0]==='Items requiring attention'&&attentionCount>0?'needs-action':'')).join('');

    const primary=[];
    if(p.schedule) primary.push(progressPanel(projects,p));
    if(visibleActions.length || p.approvals || p.maintenance)
      primary.push(actionsPanel(actions,p));

    const financial = p.financial&&f ? financialPanel(f,p) : '';
    const monitoring=[];
    if(p.purchasing&&po) monitoring.push(card('Purchasing & materials',
      'Receipts, supplier prices and posting readiness',
      infoRow('Open purchase orders',qty(po.open_orders),'purchasing.html',p)+
      infoRow('Received lines ready to post',qty(po.unposted_received_lines),'purchasing.html',p)+
      infoRow('Received lines awaiting price',qty(po.received_unpriced_lines),'purchasing.html',p),
      makeLink('purchasing.html','Open Purchasing →',p,'am-corp-footer-link')));
    if(p.payroll&&w)monitoring.push(card('Payroll & obligations',
      'Approval is not the same as payment',
      infoRow('Pending payroll approval',qty(w.awaiting_approval),'finance-payroll.html',p)+
      infoRow('Approved, unreleased wages',peso(w.approved_unreleased_amount),'payroll.html',p),
      makeLink(p.payroll_approve?'finance-payroll.html':'payroll.html','Open Payroll →',p,'am-corp-footer-link')));
    if(p.equipment&&e)monitoring.push(card('Equipment status',
      'Based on Equipment Master classification',
      infoRow('Equipment registered',qty(e.total),'equipment-maintenance.html',p)+
      infoRow('Operational / available',qty(e.active),'equipment-maintenance.html',p),
      p.maintenance_access?makeLink('equipment-maintenance.html','Open Maintenance →',p,'am-corp-footer-link'):''));
    if(p.attendance&&a)monitoring.push(card('Workforce attendance',
      'Today in Philippine time',
      infoRow('Time In records today',qty(a.today_in),'attendance.html',p)+
      infoRow('Currently without Time Out',qty(a.on_site),'attendance.html',p),
      makeLink('attendance.html','Open Attendance →',p,'am-corp-footer-link')));

    const routeOrder=[
      ['project-schedule.html','Activity Calendar'],['approvals.html','Approval Center'],
      ['finance-payroll.html','Payroll Approvals'],['purchasing.html','Purchasing'],
      ['payroll.html','Payroll'],['project-cost.html','Project Cost'],
      ['equipment-maintenance.html','Maintenance'],['repair-requests.html','Repair Requests'],
      ['attendance.html','Attendance'],['reports.html','Reports']
    ];
    const shortcuts=routeOrder.filter(item=>canVisit(item[0],p)).map(item=>
      '<a href="'+item[0]+'">'+esc(item[1])+' <span aria-hidden="true">↗</span></a>').join('');

    const header='<div class="am-corp-hero">'+
      '<div class="am-corp-hero-copy"><span class="am-corp-kicker">'+
      '<span class="am-corp-kicker-mark" aria-hidden="true"></span>AMANAH CONSTRUCTION SERVICES / CONTROL CENTER</span>'+
      '<h2>Management Dashboard</h2>'+
      '<p>A unified view of projects, financial control, operational priorities and daily activity.</p></div>'+
      '<div class="am-corp-hero-tools"><span class="am-corp-sync-label">DATA UPDATED</span>'+
      '<time class="am-corp-sync-time">'+esc(phDate(data.as_of))+'</time>'+
      '<button class="am-corp-refresh" type="button" id="amanahControlRefresh" aria-label="Refresh dashboard overview">'+
      '<span aria-hidden="true">↻</span> Refresh overview</button></div></div>';

    const prioritySection=primary.length ?
      '<section class="am-corp-section">'+
      sectionHeader('01','MANAGEMENT FOCUS','Priorities & project delivery',
        'Track physical accomplishment and outstanding work across your authorized modules.')+
      '<div class="am-corp-priority-grid '+(primary.length===1?'single':'')+'">'+primary.join('')+'</div></section>' : '';
    const financeSection=financial ?
      '<section class="am-corp-section">'+
      sectionHeader(primary.length?'02':'01','FINANCIAL CONTROL','Cost performance',
        'Actual costs only — payroll, contracts and materials follow their payment/posting rules.')+
      financial+'</section>' : '';
    const operationsSection=monitoring.length ?
      '<section class="am-corp-section">'+
      sectionHeader(primary.length?(financial?'03':'02'):(financial?'02':'01'),
        'OPERATIONS','Operational overview','Workforce, equipment, purchasing and payment monitoring.')+
      '<div class="am-corp-monitor-grid">'+monitoring.join('')+'</div></section>' : '';
    const shortcutsSection=shortcuts ?
      '<section class="am-corp-section am-corp-shortcut-section">'+
      sectionHeader('','WORKSPACE','Quick access','Go directly to modules permitted for your account.')+
      '<nav class="am-corp-shortcuts" aria-label="Authorized modules">'+shortcuts+'</nav></section>' : '';

    root.innerHTML=header+
      '<section class="am-corp-section am-corp-executive">'+
      sectionHeader('','EXECUTIVE SUMMARY','At a glance',
        'Live summary figures based on records available to your account.')+
      '<div class="am-corp-kpi-grid">'+(kpis||kpi('Workspace','Ready',
        'No additional KPI summaries are assigned to your role',0))+'</div></section>'+
      prioritySection+financeSection+operationsSection+shortcutsSection;

    root.querySelector('#amanahControlRefresh')?.addEventListener('click',load);
    root.dataset.ready='true';

    // Consolidate legacy panels below the management workspace.
    // Hide redundant KPI tiles and the unused placeholder chart entirely.
    const oldCards=document.querySelector('main.container > .cards');
    if(oldCards)oldCards.hidden=true;
    const placeholder=document.querySelector('.project-progress-future');
    if(placeholder)placeholder.hidden=true;
    const cost=document.querySelector('.cost-dashboard-panel');
    if(cost)cost.hidden=!p.financial;
    const costSection=document.getElementById('amanahDetailedReportHeader');
    if(costSection)costSection.hidden=!p.financial;
    const attendance=document.getElementById('attendanceBody')?.closest('section.panel');
    if(attendance)attendance.hidden=!p.attendance;
    window.__AMANAH_DASHBOARD_PERMS = p;
    if (typeof window.loadDashboardLegacyDetails === 'function') {
      Promise.resolve(window.loadDashboardLegacyDetails(p)).catch(error =>
        console.warn('Unable to refresh optional detailed reports:',error));
    }
  }

  async function load() {
    const token=++generation;
    const refresh=root.querySelector('#amanahControlRefresh');
    if(refresh){refresh.disabled=true;refresh.setAttribute('aria-busy','true');}
    if(!lastData)root.innerHTML='<div class="am-corp-loading" role="status">Loading your management overview…</div>';
    try{
      const {data,error}=await api.rpc('amanah_dashboard_control_center');
      if(error)throw error;
      if(generation!==token)return;
      lastData=data||{};
      render(lastData);
    }catch(error){
      if(generation!==token)return;
      console.error('AMANAH management dashboard:',error);
      if(refresh){refresh.disabled=false;refresh.removeAttribute('aria-busy');}
      if(lastData){
        const existing=root.querySelector('.am-corp-error');
        if(existing)existing.remove();
        const note=document.createElement('div');
        note.className='am-corp-error';
        note.setAttribute('role','alert');
        note.textContent='Unable to refresh your Dashboard. Showing the last successful result.';
        root.prepend(note);
      }else{
        root.innerHTML='<div class="am-corp-error" role="alert">Unable to load your authorized Dashboard: '+
          esc(error?.message||'Please retry.')+
          '<button type="button" class="am-corp-refresh" id="amanahControlRetry">Retry</button></div>';
        root.querySelector('#amanahControlRetry')?.addEventListener('click',load);
      }
    }
  }

  document.getElementById('refreshButton')?.addEventListener('click',load);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  load();
})();
