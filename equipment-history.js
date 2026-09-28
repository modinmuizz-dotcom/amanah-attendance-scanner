const SUPABASE_URL="https://bafmycjninxomufhkjvy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const state={equipment:[],projects:[],summary:[],repairs:[],maintenanceRecords:[],pmRecords:[]};

function $(id){return document.getElementById(id);}
function escapeHtml(v){if(v===null||v===undefined)return "";return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function money(v){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));}
function formatDate(v){if(!v)return "—";const s=String(v).slice(0,10);const p=s.split("-");return p.length===3?p[1]+"/"+p[2]+"/"+p[0]:s;}
function showMessage(msg,type="info"){const b=$("message");b.textContent=msg;b.className="message "+type;b.style.display="block";window.scrollTo({top:0,behavior:"smooth"});}
function statusPill(status){const c=String(status||"").toLowerCase().replaceAll(" ","-");return '<span class="pill '+escapeHtml(c)+'">'+escapeHtml(status||"")+"</span>";}
function equipmentPill(status){const c=String(status||"").toLowerCase()==="active"?"active":"inactive";return '<span class="pill '+c+'">'+escapeHtml(status||"")+"</span>";}
function equipmentNameById(id){const x=state.equipment.find(e=>e.equipment_id===id);return x?.equipment_name||id||"—";}
function projectNameById(id){const x=state.projects.find(p=>p.project_id===id);return x?.project_name||id||"—";}
function maintenanceCostForEquipment(id){return state.maintenanceRecords.filter(x=>x.equipment_id===id).reduce((s,x)=>s+Number(x.total_amount||0),0);}
function combinedCostForEquipment(id,repairCost=null){const r=repairCost===null?Number(state.summary.find(x=>x.equipment_id===id)?.total_repair_cost||0):Number(repairCost||0);return r+maintenanceCostForEquipment(id);}

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
  state.summary=s.data||[];state.repairs=r.data||[];state.maintenanceRecords=m.data||[];state.pmRecords=state.maintenanceRecords.filter(x=>String(x.maintenance_type||"").toUpperCase()==="PREVENTIVE MAINTENANCE");
  render();
}

function filters(){
  const q=$("searchInput").value.trim().toLowerCase(), e=$("equipmentFilter").value, p=$("projectFilter").value, st=$("statusFilter").value;
  const repairs=state.repairs.filter(x=>{
    const hay=[x.repair_form_no,x.equipment_name,x.equipment_id,x.plate_number,x.project_name,x.problems_encountered,x.repaired_by].join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(!e||x.equipment_id===e)&&(!p||x.project_id===p)&&(!st||x.status===st);
  });
  const pm=state.pmRecords.filter(x=>{const hay=[x.description,x.equipment_id,x.project_id].join(" ").toLowerCase();return (!q||hay.includes(q))&&(!e||x.equipment_id===e)&&(!p||x.project_id===p);});
  const maintenance=state.maintenanceRecords.filter(x=>{const hay=[x.description,x.equipment_id,x.project_id,x.maintenance_type,x.supplier_shop,x.reference_no].join(" ").toLowerCase();return (!q||hay.includes(q))&&(!e||x.equipment_id===e)&&(!p||x.project_id===p);});
  let summary=state.summary.filter(x=>{const hay=[x.equipment_name,x.equipment_id,x.plate_number,x.equipment_type].join(" ").toLowerCase();return (!q||hay.includes(q))&&(!e||x.equipment_id===e);});
  return {repairs,pm,maintenance,summary};
}

function render(){
  const f=filters();
  $("metricEquipment").textContent=f.summary.length;
  $("metricPM").textContent=f.pm.length;
  if($("metricMaintenance")) $("metricMaintenance").textContent=f.maintenance.length;
  $("metricRepairs").textContent=f.repairs.length;
  $("metricOpen").textContent=f.repairs.filter(x=>x.status!=="CLOSED").length;
  $("metricCost").textContent=money(f.repairs.reduce((s,x)=>s+Number(x.total_repair_cost||0),0)+f.maintenance.reduce((s,x)=>s+Number(x.total_amount||0),0));

  $("summaryBody").innerHTML=f.summary.length?f.summary.map(x=>{
    const pmCount=state.pmRecords.filter(pm=>pm.equipment_id===x.equipment_id).length;
    return '<tr>'+
      '<td><div class="strong">'+escapeHtml(equipmentNameById(x.equipment_id))+'</div><div class="muted">'+escapeHtml(x.equipment_id)+'</div></td>'+
      '<td>'+equipmentPill(x.status)+'</td>'+
      '<td>'+pmCount+'</td>'+
      '<td>'+Number(x.total_repair_requests||0)+'</td>'+
      '<td>'+Number(x.open_repairs||0)+'</td>'+
      '<td>'+Number(x.closed_repairs||0)+'</td>'+
      '<td class="money">'+money(combinedCostForEquipment(x.equipment_id,x.total_repair_cost))+'</td>'+
      '<td>'+formatDate(x.last_repair_completed)+'</td>'+
      '<td><button class="btn btn-primary" type="button" data-view-equipment="'+escapeHtml(x.equipment_id)+'">VIEW HISTORY</button></td>'+
    '</tr>';
  }).join(""):'<tr><td colspan="9" class="empty">No equipment found.</td></tr>';

  if($("maintenanceBody")) $("maintenanceBody").innerHTML=f.maintenance.length?f.maintenance.map(x=>'<tr><td>'+formatDate(x.maintenance_date)+'</td><td><div class="strong">'+escapeHtml(x.equipment_name||x.equipment_id)+'</div><div class="muted">'+escapeHtml(x.equipment_id||"")+'</div></td><td>'+escapeHtml(projectNameById(x.project_id))+'</td><td>'+statusPill(x.maintenance_type)+'</td><td>'+escapeHtml(x.description||"")+'</td><td>'+escapeHtml(x.supplier_shop||"—")+'</td><td>'+escapeHtml(x.quantity??"")+'</td><td>'+escapeHtml(x.unit||"")+'</td><td class="money">'+money(x.total_amount)+'</td><td>'+escapeHtml(x.reference_no||"—")+'</td></tr>').join(""):'<tr><td colspan="10" class="empty">No maintenance records found for the selected filters.</td></tr>';

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
        '<div class="detail-item"><label>Maintenance Records</label><div>'+state.maintenanceRecords.filter(x=>x.equipment_id===equipmentId).length+'</div></div>'+
        '<div class="detail-item"><label>PM Records</label><div>'+pm.length+'</div></div>'+
        '<div class="detail-item"><label>Repair Requests</label><div>'+Number(summary?.total_repair_requests||repairs.length)+'</div></div>'+
        '<div class="detail-item"><label>Open Repairs</label><div>'+Number(summary?.open_repairs||0)+'</div></div>'+
        '<div class="detail-item"><label>Total Maintenance &amp; Repair Cost</label><div>'+money(combinedCostForEquipment(equipmentId,summary?.total_repair_cost))+'</div></div>'+
      '</div></div>'+
    '</div>'+
    '<div class="modal-section"><h3>MAINTENANCE RECORDS</h3>'+
      (state.maintenanceRecords.filter(x=>x.equipment_id===equipmentId).length?'<div class="table-wrap"><table class="mini-table"><thead><tr><th>Date</th><th>Type</th><th>Project</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th><th>Reference</th></tr></thead><tbody>'+
        state.maintenanceRecords.filter(x=>x.equipment_id===equipmentId).map(x=>'<tr><td>'+formatDate(x.maintenance_date)+'</td><td>'+escapeHtml(x.maintenance_type)+'</td><td>'+escapeHtml(projectNameById(x.project_id))+'</td><td>'+escapeHtml(x.description)+'</td><td>'+escapeHtml(x.quantity)+'</td><td>'+escapeHtml(x.unit)+'</td><td class="money">'+money(x.total_amount)+'</td><td>'+escapeHtml(x.reference_no||"—")+'</td></tr>').join("")+
      '</tbody></table></div>':'<div class="empty">No maintenance records found for this equipment.</div>')+
    '</div>'+
    '<div class="modal-section"><h3>REPAIR HISTORY</h3>'+
      (repairs.length?'<div class="table-wrap"><table class="mini-table"><thead><tr><th>Repair No.</th><th>Date</th><th>Project</th><th>Problem</th><th>Status</th><th>Cost</th><th>Photo Evidence</th><th>ACTION</th></tr></thead><tbody>'+
        repairs.map(x=>'<tr><td>'+escapeHtml(x.repair_form_no)+'</td><td>'+formatDate(x.request_date)+'</td><td>'+escapeHtml(x.project_name||"—")+'</td><td>'+escapeHtml(x.problems_encountered||"")+'</td><td>'+statusPill(x.status)+'</td><td class="money">'+money(x.total_repair_cost)+'</td><td><div class="photo-counts"><span class="photo-count">'+Number(x.pm_finding_photos||0)+' PM</span><span class="photo-count">'+Number(x.before_photos||0)+' Before</span><span class="photo-count">'+Number(x.during_photos||0)+' During</span><span class="photo-count">'+Number(x.after_photos||0)+' After</span></div></td><td><button class="repair-link" type="button" data-view-repair="'+escapeHtml(x.repair_request_id)+'">OPEN REPAIR</button></td></tr>').join("")+
      '</tbody></table></div>':'<div class="empty">No repair requests found for this equipment.</div>')+
    '</div>';

  $("historyModal").classList.add("open");
}

function closeModal(){$("historyModal").classList.remove("open");}

function printEquipmentHistory(){
  const title=$("modalTitle").textContent.trim()||"Equipment History";
  const subtitle=$("modalSubtitle").textContent.trim();
  const content=$("modalContent").innerHTML;
  const w=window.open("","_blank","width=1100,height=850");
  if(!w){showMessage("Please allow pop-ups for AMANAH to print the equipment history.","error");return;}
  w.document.open();
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(title)} - AMANAH Equipment History</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#0f172a;font-family:Arial,Helvetica,sans-serif}
.page{max-width:1100px;margin:0 auto;padding:28px}
.brand{border-bottom:4px solid #2563eb;padding-bottom:14px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand-copy h1{margin:0;font-size:24px;letter-spacing:.5px}
.brand-copy p{margin:4px 0 0;color:#64748b;font-size:11px}
.brand-logo{width:82px;height:82px;object-fit:contain;flex:0 0 82px}
.report-title{margin:0 0 4px;font-size:22px}
.report-subtitle{color:#64748b;font-size:12px}
.detail-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:14px;margin-top:16px}
.detail-card{background:#f8fafc;border:1px solid #dbe3ef;border-radius:10px;padding:14px}
.detail-card h3,.modal-section h3{margin:0 0 9px;font-size:12px}
.detail-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.detail-item{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:8px}
.detail-item label{display:block;font-size:8px;color:#64748b;text-transform:uppercase;margin-bottom:4px}
.detail-item div{font-size:11px;font-weight:800}
.modal-section{margin-top:16px}
.table-wrap{width:100%;overflow:visible}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #dbe3ef;padding:7px;font-size:9px;text-align:left;vertical-align:top}
th{background:#f1f5f9;text-transform:uppercase;font-size:8px}
.money{font-weight:900;white-space:nowrap}
.muted{color:#64748b}
.strong{font-weight:900}
.pill{display:inline-flex;border-radius:999px;padding:3px 7px;font-size:8px;font-weight:900;background:#e2e8f0}
.pill.active,.pill.closed{background:#dcfce7;color:#166534}
.pill.in-progress{background:#fef3c7;color:#92400e}
.photo-counts{display:flex;flex-wrap:wrap;gap:4px}
.photo-count{background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;padding:3px 5px;font-size:8px;font-weight:900;color:#1e40af}
.footer{margin-top:22px;padding-top:10px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:8px;display:flex;justify-content:space-between}
@media print{@page{size:A4 portrait;margin:10mm}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
@media(max-width:800px){.detail-grid,.detail-list{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="page">
  <div class="brand"><div class="brand-copy"><h1>AMANAH CONSTRUCTION SERVICES</h1><p>Construction Management System • Equipment Lifecycle History Report</p></div><img class="brand-logo" src="data:image/png;base64,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[... ELLIPSIZATION ...]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[... ELLIPSIZATION ...]Pu8L6nkF+fMEwn/zoCWDEkGgmtAumTa4lVwkhaWpMsnqrwafucAkwdCqVAC2pTxtMaDcZyfscNcfmqKkllBXh0XdCIhGTjpYkHS1xOptjOhV39FNrNeUwRr2R55hZBtKQxByIOTYVT2AYAtM0icbiuq4urp96q8zbu2zaMxIZSgqlkMuOM5iQzPPe7ihPvx+SqYvR2pqmtbWe1pa0tmyDP6zwGC/bpINeLj7OpOJBIlLrkRN19F/T7qWsJQjUIk4Cw6tS7a0S5Ko4Zk0wiZrlixZaAhhaIy66gr2nzzM+MlI2GrfsDtTSSxGfOizPP98n+eMLAcmkTTSWxLIjmIZdq9nCQAiz1pABiWUZDA2XeXePxcJpAxx9cBfPvavp6x+i5IbsGNTc/LCLQoPhIKSBkCaGFRFhKCkUiuwZ07y/R/Kb5yvsGfAp+4K7V3q8tcNHGhGENrRWIQSBSMsKI+O+2LDXp+CH3PTnHG4Qsq1f8fYugz+/UgZhEihBxQ1EEAh832P1Zl80Nzr87jmXt3YoRsddbFPwo4c9+rKCeDyJxkRrSailCFXAnqEyDakIE1tM7ngix+5hyRmHmcyYbvOLvwSs221Sl4mCqBWEK+VTLrksmGdz+EkGEoNf3K8ZqzhYlqm1X5anHOHsuu+Z3L3ixSWYC5cSXL849qNcaH3p5w9UvRntnlnxQnpGDBAmqboMjuNgmvsq0SVIKfZVkBsYhkCIEB165AslmpMeScPHN9N4Io5bVagwIJM0SSWSRCIOUtQIMsMQaBWgQp/x4VFUEJJpTBFqA7dUxrIdkpkMiXgUU0pijkFdBPbrjpJJJlj51hDvD5VwTI1tmuRyOSqVKum6Rmw7Bsha7k7oE6oSY2NjFHMlTCdKLBGjUCjjuiGWEyOVSiBErfar6gf4vqbqVRkbG6FQKGMakoJrILSPLXzaG03W71DE06laT6JQ1OgIr0opP4aB5ouXJFm3ucSTqwPqG1sZG62oay8wrWlN/m+v/EX+U4J9udJTEktnX3v5lDd3FxvtYrmoDVUQEeFhOzGcSBTDcGqtASQIKQk1SGGgVUiIIgw1SnmEgaZY9HHLLhHHJDQSgI9tQKHsgwIVKnToUa16KAVRW1CuhhgE2IakrAwcS+JVq0jDIhJ3yJcUUUdiOgZNdQ4zO+tpbWpk3a5e+oYKCK1wy1CpeqTjknxpXzG2KWslsaGiVPFxrJCEA64yUKEkYkPENtFGzTO2LLNWZCgFhjAwLI1leghdIQgdTDNOqFwq7ghuaBCPtRDqKNKMIAyNH0DV8yi7HqVSltHRPIFIksw04wd2GDdHjCM7+3Z+/ubcMWVNv7ls2WIhxFL161+eHrP6d4ZrXtpLICShryiWoeoV8FQeX4WUygG5itzXs18RKPBUjS8ndBFmHB0EmDaYdhS3WKAuY2GaUYZHCrS2xPCVJGILxvNV2luToGHb9izt7THKroXnV2nKGOzeU2K/mQlSCZvXX8xz6NwYyg+JO4qVq3M0J0fYuPV1urrq6JyY5IVVFZSuMKW7gXWbxunsiFCpasZz1Vp2qHA4dG6Enn5N32CJlgZBOmWRK3gMjxZpqo9SdjWFXAUnuq/8KAQpDUBgmeBVPYSwECIkk5B4gUQFO0nFDWIRTaBsknGDxoxFNGqRiJvUZZqJRR0MU5LPF8Jzj242V21s/kWFlX133DHfEgAP3PXRTmf47Vf/6Wd7uzeNJgNDSGmYkmTcQIqakimVPSa0RfjSOTaxZIIb/zBOY8rjhosjlPw6vn5nhS+enmOk0s5Tq3fxseMtnnxHccWZcVxlsvwVzRkHlzhyToz7nq3g+j5H7WdTqMKqbQ3MaB/ihdU+rh9yxpEWD65OcN35AZ7SvL41QyU/yBc+Vsdfninx2poSZxwX5zt/kNzxTzG29ObR1lR+fPtanruvhZMuDvjogjE27rW4/SFJ1FHcfWOGQFXwVZyf3j3Cr74QZe2AybOvFpjVbXL4/lE8ovz+8ZBFx8AvHvCImjk+fFwjg4M+a3dp8mXJtZdE2brd5Md/HuQTp8VJNER5eVWBtTsU5384xdZtIc++USLq1FqfIQzGx13CwMOO2WGLNSx/et2cHaLrhAUnn720z/jVT45pS7m7Hvzxr3fPfq8/6U/tihi333QgxxyQ4dU3B3AcB9uoRaMe+EaJt9/rp1gcojEt+MriCnc8MEhL3RjHz4+Qig5y3gKDkZJJc3qMSqXA4fPi3PcCPLpijJXvjXHWVFOvqKXk440MGMWOwZNbDVAtMlk/TaXqjSYPCPBvP08fvdokc8u7Wfb7iz3PFnmwk9O4YIrd2LGIsw7qp3O5io7xgQXXrWDpUs62N0fMG1OgqmdDrGWOtZtLfL+RggClyMPrJDuaOXB54ps3Fbg45fWs2qbyXOvuSw4QrO3EKFUcYkbQwwOl5kyLcEB03129GSZNsnHdnyuPN/k13/eTkuqhA59rvtYyLtbPN5bm+XO72QIwzJJq0LPYARD2iRjFqYuc/21Uznr3MNZ/95usSdrqF1be5oOnjpyyIfPOOhhuWrl+7Nzef/Qrfl635QYR83UnD3/bU7veJe6iI/na3wFMbtKd7rEnS+YfOWOJE+/7dPVqPnLG0lWb3ewgkFGCknuejbLFacrDGnxyOv1/PjPFS4/O+SChUmqvoUTKISMgbboqFece2TI7Q8b2Bo6W+qY0BiFYoHceMDM7kY+dOwUzjium1jEoE6VaKpziJmQVEX695SZ1hJl3pxORK6IcotsWlPktdd6+fBpmnIxBCFIJ22efyPFPct7+c6VcY6eF6cwkmdgoEKlElKuwGEHCBYeGOPny03uebzAmccIjpiX4rd/KSIMB1PWMvUeWZXgcz+DtVsVJc8gWW9R1TG+8sNeDKkRMkkuXyEMAwoVn7gscOmc97jk5JeZ2lJCK+SOYjIYGR499qmn3p5ivLu5unNmm1IXnj39xIdfHPNHhsZkolzi7qcKrNwsyaQToEPGCz4nz9Mcc/A0rjhNkMtVyY2XuWLRBI6YEnDrA3mOmaG47SGXSXVFSlkPYUqx+Mg6kRsa48EVw2RLFkd2FPjji5Lj9wt5akWeJ1/PsmhBCz+7q5fPn66Z2hJw/S9Hee7VEh9fqDjhQJ+HV/Szabfg8LYsD75SRfgV2s0CN94xxoKpFS44yeA7P9vOmk1Vpqcr/PPPxzi2cZAVbyt2Dtq4bkVftiAvDtsvwZa1Azzw/CjHzZCkY3FKhYDOeIH7HskztHeUw+c2c+eTeT57TJHsSJFf3A+Xn+ix+n0XUXT52Ifb+OqFMXb2lThtruLdjQ6j4z4L90+zeTtce06B1zbA7kGbqBOyc2+W/MA4764Y5P7XBFWk+uHn0tbad4a/ePvDo38RWi82hFiufn5N+1OjRscpS3+21YOqAYJEJqFNwxQCRL7kETXG+cQJITt6NY+9LZGWxZkHV9nRD+/vijKxPaR3VCINQToaMjQumTupSrZisGcsRUPaIAwqGFYCSS3A4YcGcduj6DlEzEqtS5XM1DyWsIIUAl/HqU+bZLNFEvEoGkGlUqvGzxfK2EZAIBLEI5pKpbKPKKw13ItEYwRByPBojvb6CsM5C6VtYrZL3PaoeCa+kigt8b2Apoygb8wibeURhs1YOUJHpsB40aBQ8Dn3WMWOPs272yQnzwuZ0GWzfodmNOfzidPjvLWhwsOr46TTGUBrrbUeGRoXGCYIR910Tcq2siPLr/t97ny9bLGxzwzVWgjRfvf1E998cVu6bdVaV2eStjCkxrYMTCNU0YgUaMF4vkJ9QjGhNYHSMF7waEwb1CcMKq4mHrEwpESFkIgZuJ6PY4QkIs6+cF2tilJ9ULZKsC+kaKF1gCAkFrMxbRtPCXylSaQihLoGuJYS07QxzBhCpxDUEQqFFHkClUeIgDAoEfouWoUI5RN4IaAplQKMfXlISnmECMBCBSHSsJGGxAsUpmVQdgO0DjENTb5cC/j4SjMwXst1jToGvcMFKpUA244SBILe4SK2bZGIO/iB1qGWRqA0oYaxXKAXzAvE/pnRzZ/9+fBhWi8pCLG0Vr6zeDHG8vuFOrBNn/jJRV0PZN1k6HtBVStVCbyqU654bYSBCgMlAiS9I1UCDW5VMSkTsq43JAj3FVD7GhWCH0AQsK+s/4MWYeDV+C8AwloMReja57/yiFJAQUF91GD29FZeXdOLQ60WTAMftIGT8l/y5/S/6cMWKPDDGqMTk2Catb/LWqsHLFn7vfib/2dIsMzad9Ooka61z7WEYikhEjGQCIIQZjRLxnwLdC0a190UQesQjaExpNGQjvY5MdNXQkbseMIR1UHvxlv3fCgvxLvnaW0sByX+zX1roG3f9/K+IqzYabN48cDpsTlxv+yn0nHj4U0Znnu3j3h9F0e05YjHKzy82q9RsqbEMGuxV0PKWl2YMDGlQahDQgJUqAnDGiHyQZucMKw9rJSCilth5owp/Pa3l7Lj9We4+fYdvL9nHB1qbRhCaw3SMITneTXP3KyVRol9vy9VfCzLFscd1sbU6Z386nevEuqQSMSqJVqpWjWNFv8aOSFrZaO1WlBQWhOGtY6MBOG+pqMKCLnwMIO3d9hsLcbRlREWzqnnpIl5BscClQ2xegd557mdnFhryoMNRPYxfCN/s9b/A4ktDCn6/9pIQoAKKZ8317xsfVG/cdxBCZEfLoZXn1gvpJwgXtkyzpZKO584qETXJINbl+3mqDk2jXURYglBKhkhFm0gGm2hLtVEsTJKNreDbK5KseRTqUiRLfgUK1XKFXQ2r0UoTfKu4vabZ3DI/D38+ZYe0hmbDzVneP69HMlkQugwJJfP097cKqqep8uVPJm6lNCh0q6vSDhafOPaSXjCpLXZoG/LZN7fPc7oWIWYFej6lBCxqEMyZpNOmyQTBqlkjHQ6TTLWhCUiFEp95IrDFAt5ikWXfMGjZ9Dn/e1ww2WtZEcl5aE4engHFyzoZslin71bAz0yKSZXrA3cz5+iL3v+V8G4ISHUlD9Y8zDUf21T8D+0rVy6bzd+8A51LXPui0+Evcd0BUMDFfPM6e0yGB8dk8cd2CY29kLPUI5dhXaOnKo5YG4by57uY3jMx68KKpWASqVAzHZIGSZD40VyhRKlYoViwSOb9yhWqvhKU3ERRVeQzsSZ2JHgpCPG6K7fy+q3YOteDzfbT9510MKi7JaZPW2u+OOvF3HayTPES68MipHsKJYdEYYuccTMlKgGLhFjhM27CuzcW+SSRfU88eIohiGEFD6WqQiCmp4IAh/fDfCrEBea9ozHQN8I23YNs7OnyNbdFd7aWKE/K/j+NdPJjpnc+26KgZ7tnHFUJ3f9KEPc34aTctSDr4VWg+V95vJ7w2eWLMB8cWetP5XWWuzrFaT/Q62LV+4mXLIA87srefPAlqC+LJwjp7dpf3x0SJ525ASxvidg1+A4veUO5ncFHH/kBF55f5TQd5EYlAoBquyRGx9j644Btu8apaevRP+wz3gJSq5gcMQnV9R4gcmi05K0NwVMSxaYHi/z2Mt5Nu3wiAjFtgFPpFMJccT+c8W1XzyUY04cZFLrezQ60xkdd9i6u5+kyFOsxtDKE12xHMr1eH+Hoinl8dZal3Q6QS7v0TdUIsRmPOszNu6Ry1UpFT3cUhmvVGBXb56B0TIlT9M7WCbdUMfN1x3Azh546L0ofT2bOPOwJu5ZNhuncQ+RTMz/3b2eUxl3f/79Z/nuN/elfP5Dekev2I1evxjjrqd4YlZjMEdEI/tPadZ+OTsgzz1+kti0y2fTrgEG/C66633OPq6d594tsX1Plqrn0DdcoXe0wkBOk3ctqmFEB0TEeFHgBRYnnjiLRafP4K03dzKhrcz4UJnZ9S6NssrKdxVb9yj6RwOmTJrAYXNn8Mmrj+Tkk+Hn317B3g3DLDppEBk0oWkiX8iJvYN5WpOIOrNCMR+wd0zQmVKs2QH5vM+kKd0cddT+vLGqF2lH8LVNvmIwmgvoGy7y/pZRdvSV2TOq2DVQYtasbr796Zm8vlbw3EaDbZvfY/HRrdz5/XosezNGa7v/m1sqzuY3Rh64/Q3xiSMV5h92o/49Xez/3VOUdK28V2iN+fkT5KMHzo6cPL+7WhVKmW0z54jv/KHC/SsHaZo+n6OmCY6aK8WdTw/pl97YSUdLmmQijuv5VH3FaKHWZ+GoeQkOPSjDpBkJTjygyIIT32X2DEGuCKcfoDliEnznIcW2fD0TOqcye2Yrn/nS8VjBGJ+/8rc88UovYHPVufXc8BmTdze38fDrKVZv6CXI7WJus0sgLdYMSI6cqvn1c4KTT+jgh989GqHhzTf2cN23txD4Hi0NMQTirw1fx8YL5EpVLj17Jh86tInHV9us3jTCujVv8LFTp3HTRQpHbiYzO+P/8QHHWfX44LO3reYMIfC1/p83av1Pzw9YuhSWLEEsXEjwxu36wT88qI6I18emHn2o4TsNw8bpnz2CVNjAQ4+sZjhsxrRaWHxcmvbOOkb2ZinlxgmERakaMLPD5NSDbCJmiXse2cumNXs4vDXPjx6x6Ej65MualljI0HDIZncq7a2TOPkkm6uum8njy97kvI/8hvW7fJKZBoTp8PqaAo+96HLG/CxHzVRUdTs+Kbb2FhBVl9GKZGRcc8bCVr55SchHrlrNjT94h0Mn5fn6R5pYu8tk054iUVviez57B3J0dNTx9c8cwNzp03h2fTOvvL2R7Rvf5roL53HJoQWGerbq+gYruPdR4axaOf7CL1dxthBU9q3Rv3uKxn9ogsbKleglS5ALP4X3xq/0/b+5N5ink5mZs8452K8arjx0Vo65DU08+NxGdg1UaUhP4pRD61l02hTyZZtVa3qYkC4QkSEr3i/y6gaNq1NMbwmZFi3zwHsWHWnF3uEAbSTYq6dTX5/hio8Wmbd/icsvf5mbf7cOT8ZZ9uNJHDDD5ppzIyRj8NQqjztfUCTMAmfOzePrBuxMN3tGfXYN5Ljw2CRdiRKf+N4Ihx7UxIcWNHHXY3leWdXLFQstYnacVzeMYNoOF5+1H5+5YD5hZC4r1gkefvRBKPfyrcsOYFqsR/fs7iGdMdVDb5rOts3u47fez7kiSWnf1Nj/0Gyx//AMmb8F4fWd+r4/fqcyNV9sOnDOpGJQfHMNUbfIGSfsJzbvHWXH22s4dlY7nVNbOWBeNzNnNrJ9QPPcm+OUQ5PWhhjCECRkmY6oz7ObJIFXpauzk0hdF3O6Ndee2cvb64Y576peNuzStLY2oLXBQTN9BkZdTFFh486AnYM2qYTB8+94vLPd5dyDsnRkHEpmO92tKXbsGub2F8qEZozPnBPhgMmaodGQF941eOjNcbrScMrC2Vy6+CDmzpnP7sI0HnvhHR68/06OmZ3m86dPJLdrDcMj4zpZb+vXtgo7P1q96+YVfEQkqf5nFv8/PUXpryAsJFzVwwMzZW9s3VuVY5vTFtmhogqyveLy87rE7ENnYAy8T1N0B5Y1mbb2mRywXzNHH5gi4kh29hUYHiySNFwyZsjGcYcD95tKR1OaE6aMc9TUPr72uyw3/yXAjieor08QhlByA645I4ZQgrndJjt7FW9s1qQTNpGIoXcMhuLhN6tMSY1y9ERFQTfi2q0EoSZbKDGxvspQX4FVG30iyQznnzKTIw+fJSZNnE5ezuKl98b53e9/Q//Od/n8eQcwr6XKe2+vISRQdtIx1+wJjbjwv3fLS1x9/Tf/Oi/5PzVV7780yvADxSykCK8/WX/SNaK/OH5+JDq7qVCNm4FZv7BFMOMblNas5Q/fuIcNYn+mzz+WaFIQ1T0E7hCbe8qsfq+Hyvgo0UQ9HXUxTpg8Ru/IGD94OiRfjdLUEAVRG4Oi0RQrAZctLDJaFLTXa97bbvDWjiSJiECFWhsSKm5VFPJVjpriceFhKXaW2hn3kqzrGWV9zwD7Talj4UHtdDXEyVYzjNHOQDbg1VdfYrh3K+efMItjZ2X01rVr6evP0tJqBNqxnNFsUJpaH1zxz49wl9YYmv/acM9/yCzJBQswV64UwZ8+pee/ucv+/TEHxeaecVQQWHVF7SYjMpI+QuzYkub6n7zHoy/30do1k5mzZ9PeEKElliVl5XDMCqN5TaPIsWr9Hu56qQpIpG0hEFimrI28qnEyOpv1BYSgBYYtScVN/CBEhaEOVG1QTxj4ECqaMnD58WnCdDf16RR+4FJybfrzMYa9JCPZMls2byI/1sdJh3RxzuHtFAf36Lfe3YkRJcw0RGVVhUZY9d45Ybr+5Pm/4b3aM//Xhz3/w8bZflBrpn9D8rp7xLcbO1KfO3ehxdS6nDfc48uSNoWon83bgwnx+0f38NyqYcxIhraOTpobMjQkIGOXSdg+6YTCMkIKHgyN+4zkQ0bzHvmiT9n1qe5jN2sFE7VhPaZRqxuLR21ScZPGtENTxiEdCTEMTbZQpeIZjJciFPwoFSUZGh6mf28vlgw47eguLjquDbJ9evWbmxkc12Gy3tKBKe2Sq8N62/vRT37PDaKbyj9q8f/h84T/KgsF/OBkTuz17JvmznQOmdaswS172Wwo6+otMXHGRNEfNHDXs3kefnGAPUMVoskkmbo6Usk4EVMSNQPqoiF1cUgnLaIRC8vcN+nIkChtgqyNvzVqAzIIVUgQhpQqLoVSlVwhYLigKFQFbmBSDRTFYoFCPke1WGJKV5LFZ3RzyfFJUqXdvPfWDr1xtw49JXVeW/aoKxFB9eWDWsJvXL6Ml/7VM/6fOtJcgzgf5PIamWhdfQSXB4593dTOSNfUFkVbquKlYqFo6xJGZkaXzvud4vnXJA88M8Kra0bpHSkTaLBsB8uO1FrgmwaSEENqbNPANMD4awdGUKFGaUAY+EoRagnCwPMDvGqVqltGBS5RCzqbExw5t5FzT86w4DSDSHQPvLeDnRtRuwcNNvXb1tZ+Ta7gb2mLq+//6EV+5/qwGIxl/GOHOf83zJRHAay6iobfvsOV0rE+M7nd6jx6nmT+3DCwm40Qx5RoS1CMsacnJd7a5PDmpoB1PUV2DRQYybm1el4/RGmJ1qKWVbdvNpjWEKqwpqADBdR69DiOQV3KpK3BYWJziu7mCBMbJNMbXWZ1jTJxelYzLaKJ2KG3NTBeX+kZK97S9A4GW+uc4LbvX8evxSm1pj5/+yz/R480/3v/f/Fi5Ac3//4V1N3yFhf4pvWp7i5z/lFHxtj/wAgtKc9nPKeH93hioB85ko8yVEqRdZOirCKUfYNqKKh4HhUvxA0UnhKECExDE4lAImVTX2/R3BalIwl1VAkKZXr7Snrv3hJDQwXCwNPdLegj56HnHhKXQ9GEuWa9zxsvlunb673aHA1/9d3v8YA4uNan4H/nwv93AfAvYulvgNAaee18jhuusihaZ50+ebI9cf+pgtakQleVHh31/S27te4fQhTLCNtGNNUJ0dZsManDpLXBIpU2SWYMYhkDGiyoiwrqbBAKeod0ee2IXvM2etVGdP8I2hO2yGQcq6XZEvGkYDDr09NT2aHy/kOzW1n2pSdZVfX/5fT+o2fH/2+fKf+/QFmzvDae6/zFtfxV4AUELwx+0/+nbyzzj1nzNh9yksaxiYS1X0MyYkcsiNYLjITEIEAbKlQ6CH3f05UyxKJolAGhDTomCAFlizAwZOBGjAJ1eFFBpMEk7RgUqyFZt+KO7y6t14H3YoOln/v593j5g90OiGWLkYuXE4rl/zpU+H/9CfifiSaWw3L+5YjbBnzlYKYN+MxThjjYMMV+0rImSilaLFukEhFhpeKCVEKSiJtYjsC0BNoUKAG+MvCCEL9UrYwPq2ypovtM4e8MfX+TrXl7YpQ1n3yAnX74r3XVstlo8Q+0bP5vAOBfiafli5G3DiH+nm2tX8T8yY9oyQe0uFXaAoNGQ1MnJBEF7FPhviHIJR2y9a2MNjUxeGCMocnfZPRfOvP8SzBqyQLM/ZrRi/+bxMz/2+v/AaLBECqqWVeLAAAAAElFTkSuQmCC" alt="AMANAH Construction Services logo"></div>
  <h2 class="report-title">${escapeHtml(title)}</h2>
  <div class="report-subtitle">${escapeHtml(subtitle)}</div>
  ${content}
  <div class="footer"><span>AMANAH CMS</span><span>Generated ${new Date().toLocaleString("en-PH")}</span></div>
</div>
<script>
(function(){
  function printNow(){setTimeout(function(){window.print();},300);}
  window.addEventListener("load",function(){
    const logo=document.querySelector(".brand-logo");
    if(!logo){printNow();return;}
    if(typeof logo.decode==="function"){
      logo.decode().catch(function(){}).finally(printNow);
    }else if(logo.complete){
      printNow();
    }else{
      logo.addEventListener("load",printNow,{once:true});
      logo.addEventListener("error",printNow,{once:true});
      setTimeout(printNow,1200);
    }
  });
  window.onafterprint=function(){setTimeout(function(){window.close();},250);};
})();
</script>
</body>
</html>`);
  w.document.close();
}

function goToRepair(id){if(id)location.href="repair-requests.html?id="+encodeURIComponent(id);}

document.addEventListener("input",e=>{if(["searchInput"].includes(e.target.id))render();});
["equipmentFilter","projectFilter","statusFilter"].forEach(id=>$(id).addEventListener("change",render));
$("summaryBody").addEventListener("click",e=>{const b=e.target.closest("[data-view-equipment]");if(b)openEquipmentHistory(b.dataset.viewEquipment);});
$("historyBody").addEventListener("click",e=>{const b=e.target.closest("[data-view-repair]");if(b)goToRepair(b.dataset.viewRepair);});
$("modalContent").addEventListener("click",e=>{const b=e.target.closest("[data-view-repair]");if(b)goToRepair(b.dataset.viewRepair);});
$("refreshButton").addEventListener("click",async()=>{try{await loadMaster();await loadData();showMessage("Equipment history refreshed.","success");}catch(e){console.error(e);showMessage(e.message||"Unable to refresh equipment history.","error");}});
$("closeModal").addEventListener("click",closeModal);
$("printEquipmentHistory").addEventListener("click",printEquipmentHistory);
$("historyModal").addEventListener("click",e=>{if(e.target===$("historyModal"))closeModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
$("sidebarLogoutButton").addEventListener("click",async()=>{await supabaseClient.auth.signOut();location.href="index.html";});

(async()=>{try{if(!await requireSession())return;await loadMaster();await loadData();}catch(e){console.error(e);showMessage(e.message||"Unable to load equipment history.","error");$("summaryBody").innerHTML='<tr><td colspan="9" class="empty">Unable to load equipment history.</td></tr>';$("historyBody").innerHTML='<tr><td colspan="9" class="empty">Unable to load repair history.</td></tr>';}})();