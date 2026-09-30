(function(){
  'use strict';
  if(window.__AMANAH_COMMON_UI__) return;
  window.__AMANAH_COMMON_UI__=true;

  const nav=[
    {section:'MAIN',items:[
      ['dashboard','Dashboard','dashboard.html','grid','dashboard.view'],
    ]},
    {section:'ADMIN SECTION',items:[
      ['employees','Master Data','admin.html','user','master_data.employees'],
      ['roles','Roles & Permissions','roles-permissions.html','shield','roles.manage'],
      ['approvals','Approval Center','approvals.html','shield','approvals.view'],
    ]},
    {section:'PROJECT MANAGEMENT',items:[
      ['schedule','Activity Calendar','project-schedule.html','calendar','schedule.view'],
    ]},
    {section:'WORKFORCE',items:[
      ['attendance','Attendance','attendance.html','calendar','attendance.view'],
      ['activitiesSite','Activities on Site','activity-on-site.html','activity','activities.view'],
      ['payroll','Payroll','payroll.html','report','payroll.view'],
    ]},
    {section:'EQUIPMENT',items:[
      ['equipment','Equipment','admin.html','truck','master_data.equipment'],
      ['operators','Operators / Drivers','admin.html','users','master_data.employees'],
      ['maintenance','Maintenance','equipment-maintenance.html','wrench','maintenance.view'],
      ['repairs','Repair Requests','repair-requests.html','repair','repairs.view'],
      ['history','Equipment History','equipment-history.html','history','equipment_history.view'],
    ]},
    {section:'RESOURCES',items:[
      ['materials','Materials & Inventory','project-cost.html','box','materials.view'],
      ['purchasing','Purchasing','purchasing.html','briefcase','purchasing.view'],
    ]},
    {section:'REPORTING',items:[
      ['reports','Reports','reports.html','report','reports.view'],
    ]}
  ];

  const icons={
    grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users:'<circle cx="9" cy="7" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 7M18 14a6 6 0 0 1 4 7"/>',
    shield:'<path d="M12 3l8 4v5c0 4.5-3.1 7.4-8 9-4.9-1.6-8-4.5-8-9V7l8-4z"/><path d="M9 12l2 2 4-4"/>',
    briefcase:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 5V3h8v2M8 10h8M8 14h5"/>',
    chart:'<path d="M4 19V5M4 19h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
    file:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    calendar:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2v4M15 2v4M8 10h8M8 14h5"/>',
    qr:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>',
    truck:'<path d="M3 17h11V7H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    wrench:'<path d="M14 6a5 5 0 0 0 4 8l-8 8-4-4 8-8a5 5 0 0 0 0-7l3 3 2-2-3-3a5 5 0 0 0-2 5z"/>',
    repair:'<path d="M4 19h5l10-10a2.8 2.8 0 0 0-4-4L5 15l-1 4z"/><path d="M14 6l4 4"/>',
    history:'<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/><path d="M16 3v4M8 3v4"/>',
    box:'<path d="M4 7h16v13H4z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 12h16"/>',
    report:'<path d="M4 19V5M4 19h16"/><path d="M8 16v-3M12 16V8M16 16v-6"/>',
    activity:'<path d="M4 19V5M4 19h16"/><path d="M6 15l4-4 3 2 5-6"/>'
  };

  function getCurrentKey(){
    const file=(location.pathname.split('/').pop()||'dashboard.html').toLowerCase();
    if(file==='equipment-history.html') return 'history';
    if(file==='equipment-maintenance.html') return 'maintenance';
    if(file==='repair-requests.html') return 'repairs';
    if(file==='project-cost.html') return 'materials';
    if(file==='purchasing.html') return 'purchasing';
    if(file==='suppliers.html') return 'suppliers';
    if(file==='project-schedule.html') return 'schedule';
    if(file==='reports.html') return 'reports';
    if(file==='attendance.html') return 'attendance';
    if(file==='activity-on-site.html') return 'activitiesSite';
    if(file==='payroll.html') return 'payroll';
    if(file==='roles-permissions.html') return 'roles';
    if(file==='approvals.html') return 'approvals';
    if(file==='admin.html') return 'employees';
    return 'dashboard';
  }

  function build(){
    document.body.classList.add('amanah-common-active');

    const style=document.createElement('link');
    style.rel='stylesheet';
    style.href='amanah-ui.css?v=6';
    document.head.appendChild(style);

    const oldHeaders=[...document.querySelectorAll('body > header, body > .topbar, body > .top-header, #adminApp > header.topbar')];
    oldHeaders.forEach(el=>{ if(el && !el.id?.startsWith('amanah')) el.style.setProperty('display','none','important'); });


    function moduleHeroConfig(){
      const file=(location.pathname.split('/').pop()||'dashboard.html').toLowerCase();
      const map={
        'dashboard.html':{
          kicker:'SYSTEM OVERVIEW',
          title:'DASHBOARD',
          desc:'Monitor AMANAH projects, workforce, equipment and daily operations from one place.',
          badge:'Management Dashboard'
        },
        'admin.html':{
          kicker:'MASTER DATA CONTROL',
          title:'MASTER DATA',
          desc:'Manage employees, equipment and projects used by the AMANAH construction management system.',
          badge:'Master Data Center'
        },
        'attendance.html':{
          kicker:'WORKFORCE CONTROL',
          title:'ATTENDANCE MANAGEMENT',
          desc:'View and monitor AMANAH attendance, working hours and fuel usage.',
          badge:'Attendance Control'
        },
        'activity-on-site.html':{
          kicker:'WORKFORCE OPERATIONS',
          title:'ACTIVITIES ON SITE',
          desc:'Review the work activities completed by drivers and operators during site operations, including photo evidence submitted at TIME OUT.',
          badge:'Site Activity Evidence'
        },
        'payroll.html':{
          kicker:'WORKFORCE COMPENSATION',
          title:'PAYROLL',
          desc:'Calculate and maintain employee payroll using AMANAH attendance records and employee pay rates.',
          badge:'Payroll Control'
        },
        'reports.html':{
          kicker:'REPORTING & ANALYTICS',
          title:'ATTENDANCE REPORTS',
          desc:'Analyze AMANAH attendance, working hours and fuel usage with filters and report exports.',
          badge:'Attendance Analytics'
        }
      };
      return map[file] || null;
    }

    function ensureModuleHero(){
      if(document.querySelector('.amanah-common-page-hero') || document.querySelector('.amanah-common-active .hero')) return;
      const cfg=moduleHeroConfig();
      if(!cfg) return;
      const host=document.querySelector('main') || document.querySelector('.container') || document.querySelector('.page');
      if(!host) return;

      const hero=document.createElement('section');
      hero.className='amanah-common-page-hero';
      hero.innerHTML=
        '<div><div class="kicker">'+cfg.kicker+'</div>'+
        '<h1>'+cfg.title+'</h1>'+
        '<p>'+cfg.desc+'</p></div>'+
        '<div class="hero-card"><small>System Module</small><strong>'+cfg.badge+'</strong></div>';
      
      host.insertBefore(hero,host.firstElementChild);

      const hideSelectors={
        'dashboard.html':['.heading'],
        'admin.html':['.page-heading'],
        'attendance.html':['.heading'],
        'reports.html':['main.container > h1','main.container > .subtitle']
      };
      const file=(location.pathname.split('/').pop()||'dashboard.html').toLowerCase();
      (hideSelectors[file]||[]).forEach(sel=>{
        document.querySelectorAll(sel).forEach(el=>el.style.display='none');
      });
    }

    const sidebar=document.createElement('aside');
    ensureModuleHero();

    sidebar.id='amanahSidebar';
    const current=getCurrentKey();
    sidebar.innerHTML=
      '<div class="amanah-side-top">'+
        '<div class="amanah-brand"><div class="amanah-brand-logo">A</div><div><div class="amanah-brand-title">AMANAH</div><div class="amanah-brand-subtitle">Construction Services</div></div></div>'+
        '<input id="amanahSideSearch" class="amanah-side-search" placeholder="Search modules..." autocomplete="off">'+
      '</div>'+
      '<nav class="amanah-nav" id="amanahNav">'+
        nav.map(group=>'<div class="amanah-nav-section">'+group.section+'</div>'+group.items.map(item=>{
          const active=item[0]===current?' active':'';
          const icon=icons[item[3]]||icons.grid;
          return '<a class="amanah-nav-item'+active+'" data-key="'+item[0]+'" data-permission="'+(item[4]||'')+'" href="'+item[2]+'"><span class="amanah-nav-icon"><svg viewBox="0 0 24 24">'+icon+'</svg></span><span>'+item[1]+'</span><span class="amanah-nav-chevron">›</span></a>';
        }).join('')).join('')+
      '</nav>'+
      '<div class="amanah-side-bottom"><div class="amanah-status-row"><span class="amanah-status-dot"></span>Local system online</div>'+
      '<div class="amanah-user-card"><div class="amanah-avatar">A</div><div><div class="amanah-user-name" id="amanahCurrentUserName">AMANAH USER</div><div class="amanah-user-role" id="amanahCurrentUserRole">AUTHENTICATED</div></div><div class="amanah-user-gear">⚙</div></div>'+
      '<button class="amanah-sidebar-logout" id="amanahSidebarLogout" type="button">LOG OUT</button></div>';

    const topbar=document.createElement('header');
    topbar.id='amanahTopbar';
    const title=nav.flatMap(g=>g.items.map(i=>[i[0],i[1]])).find(x=>x[0]===current)?.[1]||'Dashboard';
    topbar.innerHTML=
      '<div class="amanah-breadcrumb"><button class="amanah-icon-btn amanah-menu-toggle" id="amanahMenuToggle" aria-label="Open menu"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><span>Construction Management System</span><span class="amanah-crumb-arrow">›</span><strong>'+title+'</strong></div>'+
      '<div class="amanah-top-right"><div class="amanah-local-ai"><span class="amanah-ai-dot"></span>Local AI</div><button class="amanah-icon-btn" aria-label="Notifications"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg></button><div class="amanah-top-avatar">SA</div></div>';

    const overlay=document.createElement('div');overlay.id='amanahMobileOverlay';

    document.body.appendChild(sidebar);
    document.body.appendChild(topbar);
    document.body.appendChild(overlay);

    const toggle=document.getElementById('amanahMenuToggle');
    const close=()=>{sidebar.classList.remove('open');document.body.classList.remove('amanah-sidebar-open')};
    toggle?.addEventListener('click',()=>{sidebar.classList.toggle('open');document.body.classList.toggle('amanah-sidebar-open')});
    overlay.addEventListener('click',close);

    const search=document.getElementById('amanahSideSearch');
    search?.addEventListener('input',()=>{
      const q=search.value.trim().toLowerCase();
      sidebar.querySelectorAll('.amanah-nav-item').forEach(item=>item.style.display=(!q||item.textContent.toLowerCase().includes(q))?'flex':'none');
    });

    document.getElementById('amanahSidebarLogout')?.addEventListener('click',async()=>{
      const isAdmin=/admin\.html$/i.test(location.pathname);
      const existing=document.getElementById('logoutButton');

      if(existing){
        existing.click();
        // admin.html handles the logout locally and returns to the login screen.
        if(isAdmin) return;
        setTimeout(()=>{ location.href='admin.html'; },600);
        return;
      }

      try{
        if(window.supabaseClient?.auth) await window.supabaseClient.auth.signOut();
      }catch(_){}

      // Never send authenticated users to the public attendance station.
      location.href='admin.html';
    });
  }

  async function loadAccessControl(){
    try{
      if(!window.supabase?.createClient) return;
      const client=window.supabaseClient || window.supabase.createClient(
        'https://bafmycjninxomufhkjvy.supabase.co',
        'sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ'
      );

      const {data:{session}}=await client.auth.getSession();
      if(!session) return;

      await client.rpc('amanah_register_current_user');

      const [{data:permissionRows,error:permissionError},{data:role,error:roleError}]=await Promise.all([
        client.rpc('amanah_get_current_permissions'),
        client.rpc('amanah_get_current_role')
      ]);

      if(permissionError) throw permissionError;
      if(roleError) throw roleError;

      const permissionSet=new Set((permissionRows||[]).map(row=>row.permission_key));
      window.AMANAH_PERMISSION_SET=permissionSet;
      window.AMANAH_CURRENT_ROLE=role||'UNASSIGNED';
      window.amanahCan=(permission)=>permissionSet.has(permission);

      const roleEl=document.getElementById('amanahCurrentUserRole');
      if(roleEl) roleEl.textContent=window.AMANAH_CURRENT_ROLE;

      const email=session.user?.email||'AMANAH USER';
      const name=session.user?.user_metadata?.full_name ||
        session.user?.user_metadata?.name ||
        email.split('@')[0];

      const nameEl=document.getElementById('amanahCurrentUserName');
      if(nameEl) nameEl.textContent=name;

      const visibleLinks=[...document.querySelectorAll('.amanah-nav-item')];
      visibleLinks.forEach(link=>{
        const key=link.dataset.permission;
        if(key && !permissionSet.has(key)){
          link.style.display='none';
          link.dataset.accessHidden='true';
        }
      });

      document.querySelectorAll('.amanah-nav-section').forEach(section=>{
        let node=section.nextElementSibling;
        let hasVisible=false;
        while(node && !node.classList.contains('amanah-nav-section')){
          if(node.classList.contains('amanah-nav-item') && node.dataset.accessHidden!=='true'){
            hasVisible=true;
          }
          node=node.nextElementSibling;
        }
        section.style.display=hasVisible?'':'none';
      });

      const file=(location.pathname.split('/').pop()||'dashboard.html').toLowerCase();
      const accessRules={
        'dashboard.html':['dashboard.view'],
        'roles-permissions.html':['roles.manage'],
        'project-schedule.html':['schedule.view'],
        'attendance.html':['attendance.view'],
        'activity-on-site.html':['activities.view'],
        'payroll.html':['payroll.view'],
        'equipment-maintenance.html':['maintenance.view'],
        'repair-requests.html':['repairs.view'],
        'equipment-history.html':['equipment_history.view'],
        'project-cost.html':['materials.view'],
        'purchasing.html':['purchasing.view'],
        'reports.html':['reports.view'],
        'admin.html':['master_data.employees','master_data.equipment','master_data.projects','master_data.suppliers']
      };

      const required=accessRules[file]||[];
      const allowed=required.length===0 || required.some(p=>permissionSet.has(p));

      if(!allowed && file!=='admin.html'){
        const host=document.querySelector('main')||document.body;
        const currentHero=document.querySelector('.amanah-common-page-hero');
        if(currentHero) currentHero.style.display='none';
        const block=document.createElement('section');
        block.className='amanah-access-denied';
        block.innerHTML='<div class="kicker">ACCESS CONTROL</div><h1>ACCESS RESTRICTED</h1><p>Your assigned role does not include permission to open this module.</p><button type="button" id="amanahAccessBack">RETURN TO DASHBOARD</button>';
        host.prepend(block);
        document.getElementById('amanahAccessBack')?.addEventListener('click',()=>location.href='dashboard.html');
        setTimeout(()=>{ if(location.pathname.toLowerCase().endsWith(file)) location.href='dashboard.html'; },1500);
      }
    }catch(error){
      console.warn('AMANAH access control initialization failed:',error);
    }
  }

  function removeShell(){
    ['amanahSidebar','amanahTopbar','amanahMobileOverlay'].forEach(id=>{
      document.getElementById(id)?.remove();
    });
    document.body.classList.remove('amanah-common-active','amanah-sidebar-open');
  }

  function start(){
    const isAdmin=/admin\.html$/i.test(location.pathname);
    if(isAdmin){
      const login=document.getElementById('loginScreen');
      const app=document.getElementById('adminApp');

      if(login && app){
        const syncShell=()=>{
          const loggedOut=!login.classList.contains('hidden');
          if(loggedOut){
            removeShell();
          }else if(!document.getElementById('amanahSidebar')){
            build();
            loadAccessControl();
          }
        };

        const obs=new MutationObserver(syncShell);
        obs.observe(login,{attributes:true,attributeFilter:['class']});
        syncShell();
        if(!login.classList.contains('hidden')) loadAccessControl();
        return;
      }
    }
    build();
    loadAccessControl();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();