/* AMANAH Activity Schedule loader.
   The existing schedule implementation is preserved in commit 2280cedee8894c36b7fc530ca1b3917090fadaf9.
   This loader executes that unchanged implementation, then adds the DELETE enhancement. */
(function(){
  const CORE='https://raw.githubusercontent.com/modinmuizz-dotcom/amanah-attendance-scanner/2280cedee8894c36b7fc530ca1b3917090fadaf9/project-schedule.js';

  function load(src){
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=src;
      s.onload=resolve;
      s.onerror=()=>reject(new Error('Could not load '+src));
      document.head.appendChild(s);
    });
  }

  load(CORE)
    .then(()=>{
      if(typeof init==='function') return init();
      throw new Error('Activity schedule core did not initialize.');
    })
    .then(()=>load('activity-schedule-delete.js'))
    .catch(error=>{
      console.error(error);
      const err=document.getElementById('err');
      if(err){
        err.style.display='block';
        err.textContent='Could not initialize Activity Schedule: '+error.message;
      }
    });
})();
