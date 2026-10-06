/* =========================================================
   AMANAH CONSTRUCTION MANAGEMENT SYSTEM
   CENTRAL REPORTS MODULE
   ========================================================= */

const SUPABASE_URL="https://bafmycjninxomufhkjvy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const state={
  projects:[],
  costEntries:[],
  attendance:[],
  maintenance:[],
  repairs:[],
  currentRows:[],
  currentHeaders:[]
};

const descriptions={
  PROJECT_SUMMARY:"Project-level financial summary showing actual cost by labor, fuel, equipment, materials and other costs.",
  COST_LEDGER:"Complete actual project cost ledger. Every cost entry recorded against a project is shown here.",
  ATTENDANCE:"Attendance, working hours, equipment, project and fuel activity report.",
  FUEL:"Fuel cost report sourced from actual project fuel cost entries, including quantity and amount.",
  MAINTENANCE:"Equipment maintenance cost report showing maintenance records assigned to projects.",
  REPAIR:"Repair cost report showing repair request costs, including labor, materials and other repair expenses.",
  MATERIAL:"Materials / purchasing cost report showing project material cost entries. Repair-material entries are separated into the Repair report.",
  LABOR:"Labor / payroll cost report showing labor cost entries linked to projects. Repair labor is separated into the Repair report."
};

function $(id){return document.getElementById(id);}

function escapeHtml(v){
  if(v===null||v===undefined)return "";
  return String(v)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function money(v){
  return "₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function num(v){return Number(v||0);}

function formatDate(v){
  if(!v)return "—";
  const s=String(v).slice(0,10);
  const p=s.split("-");
  return p.length===3 ? p[1]+"/"+p[2]+"/"+p[0] : s;
}

function formatTime(v){
  if(!v)return "—";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return String(v);
  return d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit",second:"2-digit"});
}

function showMessage(message,type="error"){
  const box=$("message");
  box.textContent=message;
  box.className="message "+type;
}

function clearMessage(){
  const box=$("message");
  box.textContent="";
  box.className="message";
}

async function requireSession(){
  const r=await supabaseClient.auth.getSession();
  if(r.error)throw r.error;
  if(!r.data?.session){
    location.href="admin.html";
    return false;
  }
  return true;
}

function today(){
  return new Date().toISOString().slice(0,10);
}

function projectName(id){
  const p=state.projects.find(x=>x.project_id===id);
  return p?.project_name || id || "—";
}

function projectLabel(id){
  const p=state.projects.find(x=>x.project_id===id);
  if(!p)return id||"ALL PROJECTS";
  return p.project_name+" — "+p.project_id;
}

function inDateRange(value){
  const from=$("dateFrom").value;
  const to=$("dateTo").value;
  const d=String(value||"").slice(0,10);
  if(from && d<from)return false;
  if(to && d>to)return false;
  return true;
}

function projectMatches(projectId){
  const selected=$("projectFilter").value;
  return !selected || String(projectId||"")===selected;
}

function filteredCostEntries(){
  return state.costEntries.filter(x=>projectMatches(x.project_id)&&inDateRange(x.cost_date));
}

function categoryTotal(rows,type){
  return rows.filter(x=>String(x.cost_type||"").toUpperCase()===type).reduce((s,x)=>s+num(x.amount),0);
}

function isRepairRef(ref){
  return String(ref||"").toUpperCase().startsWith("AUTO-REPAIR:");
}

function isMaintenanceRef(ref){
  return String(ref||"").toUpperCase().startsWith("AUTO-MAINTENANCE:");
}

function categoryBadge(type){
  const t=String(type||"OTHER").toUpperCase();
  const cls=["fuel","labor","equipment","material"].includes(t.toLowerCase())?t.toLowerCase():"other";
  return '<span class="badge '+cls+'">'+escapeHtml(t)+'</span>';
}

async function loadData(){
  clearMessage();
  const ok=await requireSession();
  if(!ok)return;

  const results=await Promise.all([
    supabaseClient.from("projects").select("project_id,project_name,location,status").order("project_name"),
    supabaseClient.from("project_cost_entries").select("id,project_id,cost_date,cost_type,description,quantity,unit,unit_cost,amount,reference_id,notes,created_at").order("cost_date",{ascending:false}).order("created_at",{ascending:false}).limit(20000),
    supabaseClient.from("attendance").select("attendance_id,employee_id,employee_name,attendance_date,time_in,time_out,total_hours,status,equipment_id,equipment_name,project_id,project_name,fuel_used,fuel_quantity,fuel_unit,fuel_amount,meter_used,meter_unit").order("attendance_date",{ascending:false}).order("time_in",{ascending:false}).limit(10000),
    supabaseClient.from("equipment_maintenance").select("maintenance_id,equipment_id,project_id,maintenance_date,maintenance_type,description,supplier_shop,reference_no,quantity,unit,unit_cost,total_amount,remarks,approval_status").order("maintenance_date",{ascending:false}).order("created_at",{ascending:false}).limit(10000),
    supabaseClient.from("repair_request_summary").select("repair_request_id,repair_form_no,request_date,created_at,equipment_id,equipment_name,equipment_type,plate_number,project_id,project_name,reported_by,status,repair_cost_total,repair_labor_cost,repair_material_cost,repair_other_cost").order("request_date",{ascending:false}).order("created_at",{ascending:false}).limit(10000)
  ]);

  const errors=results.filter(r=>r.error).map(r=>r.error);
  if(errors.length)throw errors[0];

  state.projects=results[0].data||[];
  state.costEntries=results[1].data||[];
  state.attendance=results[2].data||[];
  state.maintenance=results[3].data||[];
  state.repairs=results[4].data||[];

  buildProjectOptions();
  generateReport();
}

function buildProjectOptions(){
  const select=$("projectFilter");
  const current=select.value;
  select.innerHTML='<option value="">ALL PROJECTS</option>';
  state.projects.forEach(p=>{
    const o=document.createElement("option");
    o.value=p.project_id;
    o.textContent=p.project_name+" — "+p.project_id;
    select.appendChild(o);
  });
  if([...select.options].some(o=>o.value===current))select.value=current;
}

function baseCostSummary(rows){
  const total=rows.reduce((s,x)=>s+num(x.amount),0);
  return {
    total,
    labor:categoryTotal(rows,"LABOR"),
    fuel:categoryTotal(rows,"FUEL"),
    equipment:categoryTotal(rows,"EQUIPMENT"),
    material:categoryTotal(rows,"MATERIAL"),
    other:rows.reduce((s,x)=>{
      const t=String(x.cost_type||"").toUpperCase();
      return ["LABOR","FUEL","EQUIPMENT","MATERIAL"].includes(t)?s:s+num(x.amount);
    },0)
  };
}

function setSummary(items){
  items.forEach((x,i)=>{
    const n=i+1;
    $("summary"+n+"Label").textContent=x.label;
    $("summary"+n).textContent=x.value;
  });
}

function setMeta(title,subtitle){
  $("reportTitle").textContent=title;
  $("reportSubtitle").textContent=subtitle;
  const project=$("projectFilter").value;
  $("reportProjectMeta").textContent="Project: "+(project?projectLabel(project):"ALL PROJECTS");
  const from=$("dateFrom").value;
  const to=$("dateTo").value;
  const period=from&&to?formatDate(from)+" — "+formatDate(to):from?formatDate(from)+" — PRESENT":to?"UP TO "+formatDate(to):"ALL DATES";
  $("reportDateMeta").textContent="Period: "+period;
  $("generatedMeta").textContent="Generated: "+new Date().toLocaleString("en-PH");
}

function renderTable(headers,rows){
  state.currentHeaders=headers;
  state.currentRows=rows;
  $("reportHead").innerHTML="<tr>"+headers.map(h=>"<th>"+escapeHtml(h)+"</th>").join("")+"</tr>";
  if(!rows.length){
    $("reportBody").innerHTML='<tr><td colspan="'+headers.length+'" class="empty">No records found for the selected filters.</td></tr>';
    return;
  }
  $("reportBody").innerHTML=rows.map(row=>"<tr>"+row.map((cell,i)=>{
    if(cell && typeof cell==="object" && cell.html)return "<td>"+cell.html+"</td>";
    return "<td>"+escapeHtml(cell==null?"":cell)+"</td>";
  }).join("")+"</tr>").join("");
}

function renderProjectSummary(){
  const rows=filteredCostEntries();
  const groups=new Map();

  rows.forEach(x=>{
    const id=x.project_id||"UNASSIGNED";
    if(!groups.has(id))groups.set(id,{project_id:id,project_name:projectName(id),labor:0,fuel:0,equipment:0,material:0,other:0,total:0});
    const g=groups.get(id);
    const amount=num(x.amount);
    const type=String(x.cost_type||"OTHER").toUpperCase();
    if(type==="LABOR")g.labor+=amount;
    else if(type==="FUEL")g.fuel+=amount;
    else if(type==="EQUIPMENT")g.equipment+=amount;
    else if(type==="MATERIAL")g.material+=amount;
    else g.other+=amount;
    g.total+=amount;
  });

  const groupsRows=[...groups.values()].sort((a,b)=>b.total-a.total);
  const totals=groupsRows.reduce((a,g)=>({
    total:a.total+g.total,labor:a.labor+g.labor,fuel:a.fuel+g.fuel,equipment:a.equipment+g.equipment,material:a.material+g.material,other:a.other+g.other
  }),{total:0,labor:0,fuel:0,equipment:0,material:0,other:0});

  setSummary([
    {label:"PROJECTS",value:String(groupsRows.length)},
    {label:"ACTUAL COST",value:money(totals.total)},
    {label:"LABOR",value:money(totals.labor)},
    {label:"FUEL",value:money(totals.fuel)},
    {label:"EQUIPMENT",value:money(totals.equipment)},
    {label:"MATERIALS",value:money(totals.material)}
  ]);
  setMeta("PROJECT COST SUMMARY","Consolidated actual cost by project and cost category.");

  renderTable(
    ["PROJECT","LABOR","FUEL","EQUIPMENT","MATERIALS","OTHER","TOTAL ACTUAL COST"],
    groupsRows.map(g=>[
      {html:"<strong>"+escapeHtml(g.project_name)+"</strong><small>"+escapeHtml(g.project_id)+"</small>"},
      money(g.labor),money(g.fuel),money(g.equipment),money(g.material),money(g.other),money(g.total)
    ])
  );
}

function renderCostLedger(){
  const rows=filteredCostEntries();
  const s=baseCostSummary(rows);
  setSummary([
    {label:"COST ENTRIES",value:String(rows.length)},
    {label:"ACTUAL COST",value:money(s.total)},
    {label:"LABOR",value:money(s.labor)},
    {label:"FUEL",value:money(s.fuel)},
    {label:"EQUIPMENT",value:money(s.equipment)},
    {label:"MATERIALS",value:money(s.material)}
  ]);
  setMeta("PROJECT COST LEDGER","Complete actual cost entries recorded against projects.");

  renderTable(
    ["DATE","PROJECT","TYPE","DESCRIPTION","QTY","UNIT","UNIT COST","AMOUNT","REFERENCE"],
    rows.map(x=>[
      formatDate(x.cost_date),
      {html:"<strong>"+escapeHtml(projectName(x.project_id))+"</strong><small>"+escapeHtml(x.project_id||"")+"</small>"},
      {html:categoryBadge(x.cost_type)},
      {html:"<strong>"+escapeHtml(x.description||"")+"</strong><small>"+escapeHtml(x.notes||"")+"</small>"},
      num(x.quantity).toLocaleString("en-PH",{maximumFractionDigits:3}),
      x.unit||"",
      money(x.unit_cost),
      {html:'<span class="amount">'+money(x.amount)+'</span>'},
      x.reference_id||""
    ])
  );
}

function renderAttendance(){
  const rows=state.attendance.filter(x=>projectMatches(x.project_id)&&inDateRange(x.attendance_date));
  const hours=rows.reduce((s,x)=>s+num(x.total_hours),0);
  const fuel=rows.filter(x=>x.fuel_used===true);
  const fuelAmount=fuel.reduce((s,x)=>s+num(x.fuel_amount),0);
  const completed=rows.filter(x=>String(x.status||"").toUpperCase()==="COMPLETED").length;
  const active=rows.filter(x=>String(x.status||"").toUpperCase()==="IN").length;
  const liters=fuel.reduce((s,x)=>s+num(x.fuel_quantity),0);

  setSummary([
    {label:"ATTENDANCE RECORDS",value:String(rows.length)},
    {label:"TOTAL HOURS",value:hours.toFixed(2)},
    {label:"FUEL COST",value:money(fuelAmount)},
    {label:"COMPLETED",value:String(completed)},
    {label:"CURRENTLY IN",value:String(active)},
    {label:"FUEL QUANTITY",value:liters.toFixed(2)+" L"}
  ]);
  setMeta("ATTENDANCE REPORT","Attendance, working hours, equipment, project and fuel usage.");

  renderTable(
    ["ATTENDANCE ID","EMPLOYEE","EQUIPMENT","PROJECT","DATE","TIME IN","TIME OUT","TOTAL HOURS","FUEL","STATUS"],
    rows.map(x=>[
      x.attendance_id,
      {html:"<strong>"+escapeHtml(x.employee_name)+"</strong><small>"+escapeHtml(x.employee_id)+"</small>"},
      {html:"<strong>"+escapeHtml(x.equipment_name)+"</strong><small>"+escapeHtml(x.equipment_id)+"</small>"},
      {html:"<strong>"+escapeHtml(x.project_name)+"</strong><small>"+escapeHtml(x.project_id)+"</small>"},
      formatDate(x.attendance_date),
      formatTime(x.time_in),
      formatTime(x.time_out),
      x.total_hours==null?"—":num(x.total_hours).toFixed(2),
      {html:x.fuel_used===true?'<span class="badge fuel">'+escapeHtml(x.fuel_quantity||0)+' '+escapeHtml(x.fuel_unit||"Liter")+' | '+money(x.fuel_amount)+'</span>':'<span class="badge other">NO FUEL</span>'},
      {html:'<span class="badge '+(String(x.status||"").toLowerCase()==="completed"?"labor":"other")+'">'+escapeHtml(x.status||"—")+'</span>'}
    ])
  );
}

function renderFuel(){
  const rows=filteredCostEntries().filter(x=>String(x.cost_type||"").toUpperCase()==="FUEL");
  const total=rows.reduce((s,x)=>s+num(x.amount),0);
  const qty=rows.reduce((s,x)=>s+num(x.quantity),0);
  const avg=qty?total/qty:0;
  const projects=new Set(rows.map(x=>x.project_id).filter(Boolean)).size;

  setSummary([
    {label:"FUEL RECORDS",value:String(rows.length)},
    {label:"FUEL COST",value:money(total)},
    {label:"QUANTITY",value:qty.toFixed(2)+" L"},
    {label:"AVERAGE / LITER",value:money(avg)},
    {label:"PROJECTS",value:String(projects)},
    {label:"COST TYPE",value:"FUEL"}
  ]);
  setMeta("FUEL COST REPORT","Actual fuel cost entries recorded against projects.");

  renderTable(
    ["DATE","PROJECT","FUEL DESCRIPTION","QUANTITY","UNIT","PRICE / UNIT","FUEL COST","REFERENCE"],
    rows.map(x=>[
      formatDate(x.cost_date),
      {html:"<strong>"+escapeHtml(projectName(x.project_id))+"</strong><small>"+escapeHtml(x.project_id||"")+"</small>"},
      x.description||"",
      num(x.quantity).toLocaleString("en-PH",{maximumFractionDigits:3}),
      x.unit||"LITER",
      money(x.unit_cost),
      {html:'<span class="amount">'+money(x.amount)+'</span>'},
      x.reference_id||""
    ])
  );
}

function renderMaintenance(){
  const rows=state.maintenance.filter(x=>projectMatches(x.project_id)&&inDateRange(x.maintenance_date));
  const total=rows.reduce((s,x)=>s+num(x.total_amount),0);
  const approved=rows.filter(x=>String(x.approval_status||"").toUpperCase()==="APPROVED").length;

  setSummary([
    {label:"MAINTENANCE RECORDS",value:String(rows.length)},
    {label:"MAINTENANCE COST",value:money(total)},
    {label:"APPROVED",value:String(approved)},
    {label:"PROJECTS",value:String(new Set(rows.map(x=>x.project_id).filter(Boolean)).size)},
    {label:"RECORD TYPE",value:"EQUIPMENT"},
    {label:"ACTUAL COST",value:money(total)}
  ]);
  setMeta("MAINTENANCE COST REPORT","Equipment maintenance costs assigned to projects.");

  renderTable(
    ["DATE","EQUIPMENT","PROJECT","MAINTENANCE TYPE","DESCRIPTION","SUPPLIER / SHOP","QTY","UNIT","TOTAL COST","REFERENCE"],
    rows.map(x=>[
      formatDate(x.maintenance_date),
      {html:"<strong>"+escapeHtml(x.equipment_id)+"</strong>"},
      {html:"<strong>"+escapeHtml(projectName(x.project_id))+"</strong><small>"+escapeHtml(x.project_id||"")+"</small>"},
      x.maintenance_type||"",
      x.description||"",
      x.supplier_shop||"—",
      num(x.quantity).toLocaleString("en-PH",{maximumFractionDigits:3}),
      x.unit||"",
      {html:'<span class="amount">'+money(x.total_amount)+'</span>'},
      x.reference_no||"—"
    ])
  );
}

function renderRepair(){
  const rows=state.repairs.filter(x=>projectMatches(x.project_id)&&inDateRange(x.request_date)&&num(x.repair_cost_total)>0);
  const total=rows.reduce((s,x)=>s+num(x.repair_cost_total),0);
  const labor=rows.reduce((s,x)=>s+num(x.repair_labor_cost),0);
  const material=rows.reduce((s,x)=>s+num(x.repair_material_cost),0);
  const other=rows.reduce((s,x)=>s+num(x.repair_other_cost),0);

  setSummary([
    {label:"REPAIR REQUESTS",value:String(rows.length)},
    {label:"REPAIR COST",value:money(total)},
    {label:"REPAIR LABOR",value:money(labor)},
    {label:"REPAIR MATERIAL",value:money(material)},
    {label:"REPAIR OTHER",value:money(other)},
    {label:"PROJECTS",value:String(new Set(rows.map(x=>x.project_id).filter(Boolean)).size)}
  ]);
  setMeta("REPAIR COST REPORT","Repair request costs separated into labor, materials and other expenses.");

  renderTable(
    ["REPAIR FORM","DATE","EQUIPMENT","PROJECT","STATUS","LABOR","MATERIAL","OTHER","TOTAL REPAIR COST"],
    rows.map(x=>[
      x.repair_form_no,
      formatDate(x.request_date),
      {html:"<strong>"+escapeHtml(x.equipment_name||x.equipment_id)+"</strong><small>"+escapeHtml(x.equipment_id||"")+"</small>"},
      {html:"<strong>"+escapeHtml(x.project_name||projectName(x.project_id))+"</strong><small>"+escapeHtml(x.project_id||"")+"</small>"},
      x.status||"—",
      money(x.repair_labor_cost),
      money(x.repair_material_cost),
      money(x.repair_other_cost),
      {html:'<span class="amount">'+money(x.repair_cost_total)+'</span>'}
    ])
  );
}

function renderMaterial(){
  const rows=filteredCostEntries().filter(x=>String(x.cost_type||"").toUpperCase()==="MATERIAL"&&!isRepairRef(x.reference_id));
  const total=rows.reduce((s,x)=>s+num(x.amount),0);

  setSummary([
    {label:"MATERIAL RECORDS",value:String(rows.length)},
    {label:"MATERIAL COST",value:money(total)},
    {label:"PROJECTS",value:String(new Set(rows.map(x=>x.project_id).filter(Boolean)).size)},
    {label:"COST TYPE",value:"MATERIAL"},
    {label:"SOURCE",value:"PROJECT COST"},
    {label:"ACTUAL COST",value:money(total)}
  ]);
  setMeta("MATERIALS / PURCHASING COST REPORT","Project material cost entries. Repair materials are shown separately in the Repair report.");

  renderTable(
    ["DATE","PROJECT","MATERIAL DESCRIPTION","QTY","UNIT","UNIT COST","TOTAL COST","REFERENCE"],
    rows.map(x=>[
      formatDate(x.cost_date),
      {html:"<strong>"+escapeHtml(projectName(x.project_id))+"</strong><small>"+escapeHtml(x.project_id||"")+"</small>"},
      x.description||"",
      num(x.quantity).toLocaleString("en-PH",{maximumFractionDigits:3}),
      x.unit||"",
      money(x.unit_cost),
      {html:'<span class="amount">'+money(x.amount)+'</span>'},
      x.reference_id||"—"
    ])
  );
}

function renderLabor(){
  const rows=filteredCostEntries().filter(x=>String(x.cost_type||"").toUpperCase()==="LABOR"&&!isRepairRef(x.reference_id));
  const total=rows.reduce((s,x)=>s+num(x.amount),0);
  const hours=rows.reduce((s,x)=>s+num(x.quantity),0);

  setSummary([
    {label:"LABOR RECORDS",value:String(rows.length)},
    {label:"LABOR COST",value:money(total)},
    {label:"LABOR HOURS",value:hours.toFixed(2)},
    {label:"PROJECTS",value:String(new Set(rows.map(x=>x.project_id).filter(Boolean)).size)},
    {label:"COST TYPE",value:"LABOR"},
    {label:"SOURCE",value:"PROJECT COST"}
  ]);
  setMeta("LABOR / PAYROLL COST REPORT","Labor cost entries linked to projects. Repair labor is separated into the Repair report.");

  renderTable(
    ["DATE","PROJECT","LABOR DESCRIPTION","HOURS","RATE / HOUR","LABOR COST","REFERENCE"],
    rows.map(x=>[
      formatDate(x.cost_date),
      {html:"<strong>"+escapeHtml(projectName(x.project_id))+"</strong><small>"+escapeHtml(x.project_id||"")+"</small>"},
      x.description||"",
      num(x.quantity).toFixed(3),
      money(x.unit_cost),
      {html:'<span class="amount">'+money(x.amount)+'</span>'},
      x.reference_id||"—"
    ])
  );
}

function generateReport(){
  const type=$("reportType").value;
  $("reportDescription").textContent=descriptions[type]||"";
  if(type==="PROJECT_SUMMARY")return renderProjectSummary();
  if(type==="COST_LEDGER")return renderCostLedger();
  if(type==="ATTENDANCE")return renderAttendance();
  if(type==="FUEL")return renderFuel();
  if(type==="MAINTENANCE")return renderMaintenance();
  if(type==="REPAIR")return renderRepair();
  if(type==="MATERIAL")return renderMaterial();
  if(type==="LABOR")return renderLabor();
}

function clearFilters(){
  $("projectFilter").value="";
  $("dateFrom").value="";
  $("dateTo").value="";
  generateReport();
}

function exportCSV(){
  if(!state.currentRows.length){
    showMessage("There are no records to export.");
    return;
  }
  const csvRows=[state.currentHeaders,...state.currentRows.map(row=>row.map(cell=>{
    if(cell&&typeof cell==="object"&&cell.html){
      const tmp=document.createElement("div");
      tmp.innerHTML=cell.html;
      return tmp.textContent||"";
    }
    return cell==null?"":cell;
  }))];
  const csv=csvRows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="AMANAH_"+$("reportType").value+"_REPORT_"+today()+".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

$("reportType").addEventListener("change",generateReport);
$("projectFilter").addEventListener("change",generateReport);
$("dateFrom").addEventListener("change",generateReport);
$("dateTo").addEventListener("change",generateReport);
$("filterButton").addEventListener("click",generateReport);
$("clearButton").addEventListener("click",clearFilters);
$("exportButton").addEventListener("click",exportCSV);
$("printButton").addEventListener("click",()=>window.print());
$("refreshButton").addEventListener("click",loadData);

(async function start(){
  try{
    const ok=await requireSession();
    if(!ok)return;
    await loadData();
  }catch(error){
    console.error(error);
    showMessage(error.message||"Unable to load Reports.");
    $("reportBody").innerHTML='<tr><td colspan="10" class="empty">Unable to load report data.</td></tr>';
  }
})();