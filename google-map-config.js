(function(){
  const saved=localStorage.getItem('amanah_google_maps_api_key')||'';
  window.AMANAH_GOOGLE_MAPS_KEY=saved.trim();
  window.AMANAH_SET_GOOGLE_MAPS_KEY=function(key){
    const value=String(key||'').trim();
    if(value) localStorage.setItem('amanah_google_maps_api_key',value);
    else localStorage.removeItem('amanah_google_maps_api_key');
    window.AMANAH_GOOGLE_MAPS_KEY=value;
    return value;
  };
})();
