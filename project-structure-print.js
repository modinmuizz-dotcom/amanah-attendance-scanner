/* Same-tab printable snapshot of the selected project's current scope. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./project-structure-model.js'):root.AmanahProjectStructure);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.AmanahProjectStructurePrint=api;
})(typeof window==='undefined'?globalThis:window,function(M){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=value=>(value/100).toFixed(2)+'%';
  function timestamp(value){
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'—':date.toLocaleString('en-PH',{timeZone:'Asia/Manila',day:'2-digit',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'});
  }
  function build(project,structure,groups,options={}){
    const totals=M.summary(groups);
    const status=options.dirty?'UNSAVED DRAFT':structure?.status==='BASELINED'?'BASELINE V'+structure.baseline_version:structure?'DRAFT V'+structure.baseline_version:'NEW STRUCTURE';
    const saved=structure?.updated_at?'Last saved: '+timestamp(structure.updated_at):'No saved draft';
    const printed=timestamp(options.printedAt||new Date());
    const sections=groups.map((group,index)=>{
      const summary=M.groupSummary(group);
      const rows=group.items.map(item=>'<tr><td>'+esc(item.name||'Unnamed work item')+'</td><td>'+esc(item.location||'—')+'</td><td class="ps-print-number">'+pct(M.cents(item.weight))+'</td><td class="ps-print-number">'+M.contribution(group,item).toFixed(2)+'%</td><td>'+esc(item.planned_start||'—')+'</td><td>'+esc(item.planned_end||'—')+'</td></tr>').join('');
      return '<section class="ps-print-group"><h2>'+String(index+1).padStart(2,'0')+' · '+esc(group.name||'Untitled work group')+'</h2>'+
        '<p class="ps-print-group-summary">Project share: <strong>'+pct(M.cents(group.share))+'</strong> · Item allocation: <strong>'+pct(summary.assigned)+' / 100%</strong> · '+group.items.length+' work item'+(group.items.length===1?'':'s')+'</p>'+
        '<table><colgroup><col class="ps-print-work"><col class="ps-print-location"><col class="ps-print-share"><col class="ps-print-share"><col class="ps-print-date"><col class="ps-print-date"></colgroup>'+
        '<thead><tr><th>WORK ITEM</th><th>LOCATION / AREA</th><th>ITEM SHARE<br>(% OF GROUP)</th><th>PROJECT<br>CONTRIBUTION</th><th>PLANNED START</th><th>PLANNED FINISH</th></tr></thead><tbody>'+
        (rows||'<tr><td colspan="6">No work items defined in this group.</td></tr>')+'</tbody></table>'+
        '<p class="ps-print-group-foot">Remaining item allocation: '+pct(summary.remaining)+'</p></section>';
    }).join('');
    return '<header class="ps-print-header"><div><strong>AMANAH CONSTRUCTION SERVICES</strong><h1>PROJECT WORK STRUCTURE</h1></div><div class="ps-print-stamp"><strong>'+esc(status)+'</strong><br>Printed: '+esc(printed)+' · Philippine time<br>'+esc(saved)+'</div></header>'+
      '<section class="ps-print-project"><h2>'+esc(project.project_name)+'</h2><p><strong>Project ID:</strong> '+esc(project.project_id)+' · <strong>Type:</strong> '+esc(project.project_type)+'</p><p><strong>Location:</strong> '+esc(project.location||'—')+'</p></section>'+
      (options.dirty?'<p class="ps-print-draft-note"><strong>UNSAVED DRAFT</strong> · Includes the current on-screen changes.</p>':'')+
      '<section class="ps-print-scope"><h2>Define the complete project scope</h2><p><strong>'+totals.groups+' work groups · '+totals.items+' work items</strong></p><p>Assigned project share: <strong>'+pct(totals.assigned)+'</strong> · Remaining project share: <strong>'+pct(totals.remaining)+'</strong> · Work-item scope allocation: <strong>'+pct(totals.allocated)+'</strong></p>'+
      '<p>Group project shares total 100%. Item shares total 100% within each group. Project contribution = group project share × item share ÷ 100.</p>'+
      (totals.incompleteGroups||totals.assigned!==10000||totals.groupsUnassigned?'<p><strong>Scope allocation is incomplete.</strong> '+totals.incompleteGroups+' group(s) still require complete item allocations.</p>':'')+'</section>'+
      (sections||'<p>No work groups defined for this project.</p>')+
      '<footer class="ps-print-footer">Scope allocation and planned dates · '+esc(status)+' · Project '+esc(project.project_id)+'</footer>';
  }
  return{build};
});
