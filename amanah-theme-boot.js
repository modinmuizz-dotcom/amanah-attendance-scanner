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
  window.__AMANAH_THEME_BOOT={userId:userId,preferences:prefs};

  // Background safeguards for the earliest possible paint while CSS loads.
  // No transitions or animated mode switch during cross-page navigation.
  var style=document.createElement('style');
  style.id='amanahFirstPaintGuard';
  style.textContent='html[data-amanah-mode="dark"],html[data-amanah-mode="dark"] body{background-color:#090f1c!important;color-scheme:dark}html[data-amanah-mode="light"]{color-scheme:light}';
  document.head.appendChild(style);
})();
