const SUPABASE_URL="https://bafmycjninxomufhkjvy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const state={equipment:[],projects:[],summary:[],repairs:[],pmRecords:[]};

function $(id){return document.getElementById(id);}
function escapeHtml(v){if(v===null||v===undefined)return "";return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function money(v){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));}
function formatDate(v){if(!v)return "—";const s=String(v).slice(0,10);const p=s.split("-");return p.length===3?p[1]+"/"+p[2]+"/"+p[0]:s;}
function showMessage(msg,type="info"){const b=$("message");b.textContent=msg;b.className="message "+type;b.style.display="block";window.scrollTo({top:0,behavior:"smooth"});}
function statusPill(status){const c=String(status||"").toLowerCase().replaceAll(" ","-");return '<span class="pill '+escapeHtml(c)+'">'+escapeHtml(status||"")+"</span>";}
function equipmentPill(status){const c=String(status||"").toLowerCase()==="active"?"active":"inactive";return '<span class="pill '+c+'">'+escapeHtml(status||"")+"</span>";}

async function requireSession(){const r=await supabaseClient.auth.getSession();if(r.error)throw r.error;if(!r.data?.session){location.href="index.html";return false;}return true;}

async function loadMaster(){const [e,p]=await Promise.all([
  supabaseClient.from("equipment").select("equipment_id,equipment_name,equipment_type,plate_number,status").order("equipment_name"),
  supabaseClient.from("projects").select("project_id,project_name").order("project_name")
]);if(e.error)throw e.error;if(p.error)throw p.error;state.equipment=e.data||[];state.projects=p.data||[];
$("equipmentFilter").innerHTML='<option value="">ALL EQUIPMENT</option>'+state.equipment.map(x=>'<option value="'+escapeHtml(x.equipment_id)+'">'+escapeHtml(x.equipment_name)+" — "+escapeHtml(x.equipment_id)+"</option>").join("");
$("projectFilter").innerHTML='<option value="">ALL PROJECTS</option>'+state.projects.map(x=>'<option value="'+escapeHtml(x.project_id)+'">'+escapeHtml(x.project_name)+" — "+escapeHtml(x.project_id)+"</option>").join("");}

async function loadData(){
  const [s,r,m]=await Promise.all([
    supabaseClient.from("equipment_maintenance_summary").select("*"),
    supabaseClient.from("equipment_repair_history").select("*").order("request_date",{ascending:false}).order("created_at",{ascending:false}),
    supabaseClient.from("equipment_maintenance").select("maintenance_id,equipment_id,project_id,maintenance_date,maintenance_type,description,supplier_shop,reference_no,quantity,unit,unit_cost,total_amount,remarks,created_at").order("maintenance_date",{ascending:false}).order("created_at",{ascending:false})
  ]);
  if(s.error)throw s.error;if(r.error)throw r.error;if(m.error)throw m.error;
  state.summary=s.data||[];state.repairs=r.data||[];state.pmRecords=(m.data||[]).filter(x=>String(x.maintenance_type||"").toUpperCase()==="PREVENTIVE MAINTENANCE");
  render();
}

function filters(){
  const q=$("searchInput").value.trim().toLowerCase(), e=$("equipmentFilter").value, p=$("projectFilter").value, st=$("statusFilter").value;
  const repairs=state.repairs.filter(x=>{
    const hay=[x.repair_form_no,x.equipment_name,x.equipment_id,x.plate_number,x.project_name,x.problems_encountered,x.repaired_by].join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(!e||x.equipment_id===e)&&(!p||x.project_id===p)&&(!st||x.status===st);
  });
  const pm=state.pmRecords.filter(x=>{const hay=[x.description,x.equipment_id,x.project_id].join(" ").toLowerCase();return (!q||hay.includes(q))&&(!e||x.equipment_id===e)&&(!p||x.project_id===p);});
  let summary=state.summary.filter(x=>{const hay=[x.equipment_name,x.equipment_id,x.plate_number,x.equipment_type].join(" ").toLowerCase();return (!q||hay.includes(q))&&(!e||x.equipment_id===e);});
  return {repairs,pm,summary};
}

function render(){
  const f=filters();
  $("metricEquipment").textContent=f.summary.length;
  $("metricPM").textContent=f.pm.length;
  $("metricRepairs").textContent=f.repairs.length;
  $("metricOpen").textContent=f.repairs.filter(x=>x.status!=="CLOSED").length;
  $("metricCost").textContent=money(f.repairs.reduce((s,x)=>s+Number(x.total_repair_cost||0),0));

  $("summaryBody").innerHTML=f.summary.length?f.summary.map(x=>{
    const pmCount=state.pmRecords.filter(pm=>pm.equipment_id===x.equipment_id).length;
    return '<tr>'+
      '<td><div class="strong">'+escapeHtml(x.equipment_name||x.equipment_id)+'</div><div class="muted">'+escapeHtml(x.equipment_id)+'</div></td>'+
      '<td>'+equipmentPill(x.status)+'</td>'+
      '<td>'+pmCount+'</td>'+
      '<td>'+Number(x.total_repair_requests||0)+'</td>'+
      '<td>'+Number(x.open_repairs||0)+'</td>'+
      '<td>'+Number(x.closed_repairs||0)+'</td>'+
      '<td class="money">'+money(x.total_repair_cost)+'</td>'+
      '<td>'+formatDate(x.last_repair_completed)+'</td>'+
      '<td><button class="btn btn-primary" type="button" data-view-equipment="'+escapeHtml(x.equipment_id)+'">VIEW HISTORY</button></td>'+
    '</tr>';
  }).join(""):'<tr><td colspan="9" class="empty">No equipment found.</td></tr>';

  $("historyBody").innerHTML=f.repairs.length?f.repairs.map(x=>
    '<tr>'+
      '<td><div class="strong">'+escapeHtml(x.repair_form_no)+'</div></td>'+
      '<td>'+formatDate(x.request_date)+'</td>'+
      '<td>'+escapeHtml(x.equipment_name||x.equipment_id)+'</td>'+
      '<td>'+escapeHtml(x.project_name||"—")+'</td>'+
      '<td>'+escapeHtml(x.problems_encountered||"")+'</td>'+
      '<td>'+statusPill(x.status)+'</td>'+
      '<td class="money">'+money(x.total_repair_cost)+'</td>'+
      '<td class="photo-cell">'+Number(x.total_photos||0)+' <span class="muted">('+Number(x.pm_finding_photos||0)+' PM / '+Number(x.before_photos||0)+' before / '+Number(x.during_photos||0)+' during / '+Number(x.after_photos||0)+' after)</span></td>'+
      '<td><button class="repair-link" type="button" data-view-repair="'+escapeHtml(x.repair_request_id)+'">VIEW</button></td>'+
    '</tr>').join(""):'<tr><td colspan="9" class="empty">No repair history found for the selected filters.</td></tr>';
}

async function openEquipmentHistory(equipmentId){
  const eq=state.equipment.find(x=>x.equipment_id===equipmentId)||state.summary.find(x=>x.equipment_id===equipmentId);
  if(!eq)return;
  const summary=state.summary.find(x=>x.equipment_id===equipmentId);
  const pm=state.pmRecords.filter(x=>x.equipment_id===equipmentId);
  const repairs=state.repairs.filter(x=>x.equipment_id===equipmentId);
  $("modalTitle").textContent=eq.equipment_name||equipmentId;
  $("modalSubtitle").textContent=(eq.equipment_id||equipmentId)+" • "+(eq.plate_number||"No plate");

  $("modalContent").innerHTML=
    '<div class="detail-grid">'+
      '<div class="detail-card"><h3>EQUIPMENT PROFILE</h3><div class="detail-list">'+
        '<div class="detail-item"><label>Equipment ID</label><div>'+escapeHtml(eq.equipment_id)+'</div></div>'+
        '<div class="detail-item"><label>Type</label><div>'+escapeHtml(eq.equipment_type||"—")+'</div></div>'+
        '<div class="detail-item"><label>Plate Number</label><div>'+escapeHtml(eq.plate_number||"—")+'</div></div>'+
        '<div class="detail-item"><label>Status</label><div>'+equipmentPill(eq.status)+'</div></div>'+
      '</div></div>'+
      '<div class="detail-card"><h3>MAINTENANCE SUMMARY</h3><div class="detail-list">'+
        '<div class="detail-item"><label>PM Records</label><div>'+pm.length+'</div></div>'+
        '<div class="detail-item"><label>Repair Requests</label><div>'+Number(summary?.total_repair_requests||repairs.length)+'</div></div>'+
        '<div class="detail-item"><label>Open Repairs</label><div>'+Number(summary?.open_repairs||0)+'</div></div>'+
        '<div class="detail-item"><label>Total Repair Cost</label><div>'+money(summary?.total_repair_cost)+'</div></div>'+
      '</div></div>'+
    '</div>'+
    '<div class="modal-section"><h3>PREVENTIVE MAINTENANCE RECORDS</h3>'+
      (pm.length?'<div class="table-wrap"><table class="mini-table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th><th>Reference</th></tr></thead><tbody>'+
        pm.map(x=>'<tr><td>'+formatDate(x.maintenance_date)+'</td><td>'+escapeHtml(x.maintenance_type)+'</td><td>'+escapeHtml(x.description)+'</td><td>'+escapeHtml(x.quantity)+'</td><td>'+escapeHtml(x.unit)+'</td><td class="money">'+money(x.total_amount)+'</td><td>'+escapeHtml(x.reference_no||"—")+'</td></tr>').join("")+
      '</tbody></table></div>':'<div class="empty">No preventive-maintenance records found for this equipment.</div>')+
    '</div>'+
    '<div class="modal-section"><h3>REPAIR HISTORY</h3>'+
      (repairs.length?'<div class="table-wrap"><table class="mini-table"><thead><tr><th>Repair No.</th><th>Date</th><th>Project</th><th>Problem</th><th>Status</th><th>Cost</th><th>Photo Evidence</th><th>ACTION</th></tr></thead><tbody>'+
        repairs.map(x=>'<tr><td>'+escapeHtml(x.repair_form_no)+'</td><td>'+formatDate(x.request_date)+'</td><td>'+escapeHtml(x.project_name||"—")+'</td><td>'+escapeHtml(x.problems_encountered||"")+'</td><td>'+statusPill(x.status)+'</td><td class="money">'+money(x.total_repair_cost)+'</td><td><div class="photo-counts"><span class="photo-count">'+Number(x.pm_finding_photos||0)+' PM</span><span class="photo-count">'+Number(x.before_photos||0)+' Before</span><span class="photo-count">'+Number(x.during_photos||0)+' During</span><span class="photo-count">'+Number(x.after_photos||0)+' After</span></div></td><td><button class="repair-link" type="button" data-view-repair="'+escapeHtml(x.repair_request_id)+'">OPEN REPAIR</button></td></tr>').join("")+
      '</tbody></table></div>':'<div class="empty">No repair requests found for this equipment.</div>')+
    '</div>';

  $("historyModal").classList.add("open");
}

function closeModal(){$("historyModal").classList.remove("open");}

function goToRepair(id){if(id)location.href="repair-requests.html?id="+encodeURIComponent(id);}

document.addEventListener("input",e=>{if(["searchInput"].includes(e.target.id))render();});
["equipmentFilter","projectFilter","statusFilter"].forEach(id=>$(id).addEventListener("change",render));
$("summaryBody").addEventListener("click",e=>{const b=e.target.closest("[data-view-equipment]");if(b)openEquipmentHistory(b.dataset.viewEquipment);});
$("historyBody").addEventListener("click",e=>{const b=e.target.closest("[data-view-repair]");if(b)goToRepair(b.dataset.viewRepair);});
$("modalContent").addEventListener("click",e=>{const b=e.target.closest("[data-view-repair]");if(b)goToRepair(b.dataset.viewRepair);});
$("refreshButton").addEventListener("click",async()=>{try{await loadMaster();await loadData();showMessage("Equipment history refreshed.","success");}catch(e){console.error(e);showMessage(e.message||"Unable to refresh equipment history.","error");}});
$("closeModal").addEventListener("click",closeModal);
$("historyModal").addEventListener("click",e=>{if(e.target===$("historyModal"))closeModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
$("sidebarLogoutButton").addEventListener("click",async()=>{await supabaseClient.auth.signOut();location.href="index.html";});

(async()=>{try{if(!await requireSession())return;await loadMaster();await loadData();}catch(e){console.error(e);showMessage(e.message||"Unable to load equipment history.","error");$("summaryBody").innerHTML='<tr><td colspan="9" class="empty">Unable to load equipment history.</td></tr>';$("historyBody").innerHTML='<tr><td colspan="9" class="empty">Unable to load repair history.</td></tr>';}})();