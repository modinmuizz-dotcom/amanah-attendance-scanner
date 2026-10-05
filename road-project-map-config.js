(function(){
  const saved=localStorage.getItem('amanah_mapbox_public_token')||'';
  window.AMANAH_MAPBOX_TOKEN=saved.trim();
  window.AMANAH_SET_MAPBOX_TOKEN=function(token){
    const value=String(token||'').trim();
    if(value) localStorage.setItem('amanah_mapbox_public_token',value);
    else localStorage.removeItem('amanah_mapbox_public_token');
    window.AMANAH_MAPBOX_TOKEN=value;
    return value;
  };
})();
