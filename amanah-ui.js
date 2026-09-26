(function(){
  'use strict';
  if(window.__AMANAH_COMMON_UI__) return;
  window.__AMANAH_COMMON_UI__=true;

  const nav=[
    {section:'MAIN',items:[
      ['dashboard','Dashboard','dashboard.html','grid'],
    ]},
    {section:'ADMIN SECTION',items:[
      ['employees','Employee Master','admin.html','user'],
      ['roles','Roles & Permissions','admin.html','shield'],
    ]},
    {section:'PROJECT MANAGEMENT',items:[
      ['projects','Projects','project-monitoring.html','briefcase'],
      ['progress','Project Progress','project-monitoring.html','chart'],
      ['documents','Documents','reports.html','file'],
    ]},
    {section:'WORKFORCE',items:[
      ['attendance','Attendance','attendance.html','calendar'],
      ['qr','QR Attendance','attendance.html','qr'],
    ]},
    {section:'EQUIPMENT',items:[
      ['equipment','Equipment','admin.html','truck'],
      ['operators','Operators / Drivers','admin.html','users'],
      ['maintenance','Maintenance','equipment-maintenance.html','wrench'],
      ['repairs','Repair Requests','repair-requests.html','repair'],
      ['history','Equipment History','equipment-history.html','history'],
    ]},
    {section:'RESOURCES',items:[
      ['materials','Materials & Inventory','project-cost.html','box'],
    ]},
    {section:'REPORTING',items:[
      ['reports','Reports','reports.html','report'],
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
    report:'<path d="M4 19V5M4 19h16"/><path d="M8 16v-3M12 16V8M16 16v-6"/>'
  };

  function getCurrentKey(){
    const file=(location.pathname.split('/').pop()||'dashboard.html').toLowerCase();
    if(file==='equipment-history.html') return 'history';
    if(file==='equipment-maintenance.html') return 'maintenance';
    if(file==='repair-requests.html') return 'repairs';
    if(file==='project-cost.html') return 'materials';
    if(file==='project-monitoring.html') return 'projects';
    if(file==='reports.html') return 'reports';
    if(file==='attendance.html') return 'attendance';
    if(file==='admin.html') return 'employees';
    return 'dashboard';
  }

  function build(){
    document.body.classList.add('amanah-common-active');

    const style=document.createElement('link');
    style.rel='stylesheet';
    style.href='amanah-ui.css?v=3';
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
          return '<a class="amanah-nav-item'+active+'" data-key="'+item[0]+'" href="'+item[2]+'"><span class="amanah-nav-icon"><svg viewBox="0 0 24 24">'+icon+'</svg></span><span>'+item[1]+'</span><span class="amanah-nav-chevron">›</span></a>';
        }).join('')).join('')+
      '</nav>'+
      '<div class="amanah-side-bottom"><div class="amanah-status-row"><span class="amanah-status-dot"></span>Local system online</div>'+
      '<div class="amanah-user-card"><div class="amanah-avatar">SA</div><div><div class="amanah-user-name">Super Admin</div><div class="amanah-user-role">Administrator</div></div><div class="amanah-user-gear">⚙</div></div>'+
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
      const existing=document.getElementById('logoutButton');
      if(existing){
        existing.click();
        setTimeout(()=>{ if(location.href.indexOf('index.html')===-1) location.href='index.html'; },900);
        return;
      }
      try{
        if(window.supabaseClient?.auth) await window.supabaseClient.auth.signOut();
      }catch(_){}
      location.href='index.html';
    });
  }

  function removeShell(){
    ['amanahSidebar','amanahTopbar','amanahMobileOverlay'].forEach(id=>{
      document.getElementById(id)?.remove();
    });
    document.body.classList.remove('amanah-common-active','amanah-sidebar-open');
  }

  function start(){
    const isAdmin=/admin\\.html$/i.test(location.pathname);
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
          }
        };

        const obs=new MutationObserver(syncShell);
        obs.observe(login,{attributes:true,attributeFilter:['class']});
        syncShell();
        return;
      }
    }
    build();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();