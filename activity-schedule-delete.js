/* AMANAH Activity Schedule delete enhancement. Loaded by project-schedule.js. */
(function(){
  function ensureDeleteButtons(){
    const table=document.getElementById('activityTable');
    if(!table) return;
    table.querySelectorAll('tr').forEach(row=>{
      const update=row.querySelector('[data-update]');
      const actions=row.querySelector('.row-actions');
      if(!update || !actions) return;
      const id=update.dataset.update;
      if(!id || actions.querySelector(`[data-delete-activity="${CSS.escape(id)}"]`)) return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='mini red';
      btn.dataset.deleteActivity=id;
      btn.textContent='DELETE';
      actions.appendChild(btn);
    });
  }

  async function deleteActivity(btn){
    const id=btn.dataset.deleteActivity;
    if(!id || typeof supabaseClient==='undefined') return;
    const row=btn.closest('tr');
    const name=row?.querySelector('td:nth-child(4) strong')?.textContent?.trim() || 'this activity';
    const confirmed=confirm(`DELETE ACTIVITY?\n\n${name}\n\nThis will also remove all equipment schedule assignments for this activity.\n\nThis action cannot be undone.`);
    if(!confirmed) return;

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
  }

  function bind(){
    ensureDeleteButtons();
    document.querySelectorAll('[data-delete-activity]').forEach(btn=>{
      if(btn.dataset.deleteBound==='1') return;
      btn.dataset.deleteBound='1';
      btn.addEventListener('click',()=>deleteActivity(btn));
    });
  }

  function start(){
    bind();
    const target=document.getElementById('activityTable');
    if(target){
      new MutationObserver(bind).observe(target,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
