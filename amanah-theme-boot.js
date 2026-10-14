/*
 * AMANAH first-paint appearance bootstrap.
 * Runs synchronously in <head> before app CSS/HTML is painted.
 * Reads only the Supabase session of the currently signed-in account.
 * Never uses an unscoped browser-wide theme or the previous user's identity.
 */
(function () {
  'use strict';
  var prefs={theme:'blue',mode:'light',compact:false};
  var userId=null;
  try {
    var key='sb-bafmycjninxomufhkjvy-auth-token';
    var raw=window.localStorage.getItem(key);
    var session=raw ? JSON.parse(raw) : null;
    // Supabase removes this session on logout. A refreshable session can be
    // restored asynchronously by the existing authentication system.
    var user=session && session.access_token && session.refresh_token ? session.user : null;
    if(user && typeof user.id==='string' && user.id){
      userId=user.id;
      var cachedRaw=window.localStorage.getItem('amanah_ui_preferences_user_v2:'+userId);
      var cached=cachedRaw ? JSON.parse(cachedRaw) : null;
      var metadata=user.user_metadata && user.user_metadata.amanah_appearance_v1;
      var source=(cached && (cached.theme==='gold'||cached.theme==='blue')) ? cached : metadata;
      if(source && (source.theme==='gold'||source.theme==='blue')){
        prefs.theme=source.theme;
        prefs.mode=source.mode==='dark'?'dark':'light';
        prefs.compact=source.compact===true;
      }
    }
  }catch(_){
    userId=null;
    prefs={theme:'blue',mode:'light',compact:false};
  }
  var root=document.documentElement;
  root.setAttribute('data-amanah-theme',prefs.theme);
  root.setAttribute('data-amanah-mode',prefs.mode);
  root.setAttribute('data-amanah-density',prefs.compact?'compact':'comfortable');
  // Hide unfinished module markup until AMANAH's shared sidebar is ready.
  // The guard is scoped to the authenticated user, not a browser-wide theme.
  var page=(window.location.pathname.split('/').pop()||'').toLowerCase();
  var managementPages=['admin.html','dashboard.html','roles-permissions.html','approvals.html',
    'finance-payroll.html','project-schedule.html','lump-sum.html','attendance.html',
    'activity-on-site.html','payroll.html','equipment-maintenance.html','repair-requests.html',
    'equipment-history.html','project-cost.html','purchasing.html','reports.html',
    'suppliers.html','project-monitoring.html'];
  var pending=Boolean(userId && managementPages.indexOf(page)!==-1);
  if(pending) root.setAttribute('data-amanah-render','pending');

  var released=false;
  function reveal(){
    if(released) return;
    released=true;
    root.removeAttribute('data-amanah-render');
  }
  window.__AMANAH_THEME_BOOT={userId:userId,preferences:prefs,reveal:reveal};
  if(pending){
    // The shared shell emits this after its sidebar and module hero are built.
    document.addEventListener('amanah:shell-ready',reveal,{once:true});
    if(page==='equipment-history.html'){
      // Equipment History uses its own standalone sidebar.
      document.addEventListener('DOMContentLoaded',reveal,{once:true});
    }
    // If an external dependency fails, never leave the screen hidden forever.
    window.setTimeout(reveal,5000);
  }

  // Background safeguards for the earliest possible paint while CSS loads.
  // No transitions or animated mode switch during cross-page navigation.
  var style=document.createElement('style');
  style.id='amanahFirstPaintGuard';
  style.textContent=[
    'html[data-amanah-mode="dark"],html[data-amanah-mode="dark"] body{background-color:#090f1c!important;color-scheme:dark}',
    'html[data-amanah-mode="light"]{color-scheme:light}',
    '@media screen{',
    'html[data-amanah-render="pending"]{background:#090f1c!important}',
    'html[data-amanah-render="pending"][data-amanah-mode="light"]{background:#f5f7fb!important}',
    'html[data-amanah-render="pending"] body{visibility:hidden!important}',
    'html[data-amanah-render="pending"]::before{content:"";position:fixed;inset:0;background:#090f1c;z-index:2147483000;pointer-events:none}',
    'html[data-amanah-render="pending"][data-amanah-mode="light"]::before{background:#f5f7fb}',
    '}'
  ].join('');
  document.head.appendChild(style);
})();
