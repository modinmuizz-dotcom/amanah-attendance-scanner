/* AMANAH Activity Schedule delete enhancement. Loaded by project-schedule.html when included. */
(function(){
  function initDelete(){
    if(!document.getElementById('activityTable')) return;
    if(typeof supabaseClient === 'undefined') return;
    document.querySelectorAll('[data-delete-activity]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id=btn.dataset.deleteActivity;
        if(!id) return;
        const row=document.querySelector(`[data-delete-activity="${CSS.escape(id)}"]`)?.closest('tr');
        const name=row?.querySelector('td:nth-child(4) strong')?.textContent?.trim() || 'this activity';
        if(!confirm(`DELETE ACTIVITY?\n\n${name}\n\nThis will also remove all equipment schedule assignments for this activity.`)) return;
        btn.disabled=true;
        const original=btn.textContent;
        btn.textContent='DELETING...';
        try{
          const {error}=await supabaseClient.from('project_activities').delete().eq('activity_id',id);
          if(error) throw error;
          if(typeof msg==='function') msg('ok',`Activity "${name}" deleted successfully. Its corresponding equipment schedule was also deleted.`);
          if(typeof loadActivities==='function') await loadActivities();
        }catch(e){
          console.error(e);
          if(typeof msg==='function') msg('err','Could not delete activity: '+e.message);
        }finally{
          btn.disabled=false;
          btn.textContent=original;
        }
      });
    });
  }
  const observer=new MutationObserver(initDelete);
  document.addEventListener('DOMContentLoaded',()=>{
    initDelete();
    const target=document.getElementById('activityTable');
    if(target) observer.observe(target,{childList:true});
  });
})();
