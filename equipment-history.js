const SUPABASE_URL="https://bafmycjninxomufhkjvy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const state={rows:[],equipment:[],projects:[]};

function $(id){return document.getElementById(id);}
function money(v){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",minimumFractionDigits:2}).format(Number(v||0));}
function escapeHtml(v){if(v===null||v===undefined)return "";return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function showMessage(msg,type="info"){const b=$("message");b.textContent=msg;b.className="message "+type;b.style.display="block";}

async function requireSession(){
  const r=await supabaseClient.auth.getSession();
  if(r.error)throw r.error;
  if(!r.data?.session){location.href="index.html";return false;}
  return true;
}

function statusPill(status){
  const cls=String(status||"").toLowerCase().replaceAll(" ","-");
  return '<span class="pill '+escapeHtml(cls)+'">'+escapeHtml(status||"")+'</span>';
}

async function loadFilters(){
  const [e,p]=await Promise.all([
    supabaseClient.from("equipment").select("equipment_id,equipment_name,plate_number").order("equipment_name"),
    supabaseClient.from("projects").select("project_id,project_name").order("project_name")
  ]);
  if(e.error)throw e.error;if(p.error)throw p.error;
  state.equipment=e.data||[];state.projects=p.data||[];

  $("equipmentFilter").innerHTML='<option value="">ALL EQUIPMENT</option>'+
    state.equipment.map(x=>'<option value="'+escapeHtml(x.equipment_id)+'">'+escapeHtml(x.equipment_name)+" — "+escapeHtml(x.equipment_id)+'</option>').join("");
  $("projectFilter").innerHTML='<option value="">ALL PROJECTS</option>'+
    state.projects.map(x=>'<option value="'+escapeHtml(x.project_id)+'">'+escapeHtml(x.project_name)+" — "+escapeHtml(x.project_id)+'</option>').join("");
}

async function loadHistory(){
  const {data,error}=await supabaseClient.from("equipment_repair_history").select("*").order("request_date",{ascending:false}).order("created_at",{ascending:false});
  if(error)throw error;
  state.rows=data||[];
  render();
}

function filtered(){
  const q=$("searchInput").value.trim().toLowerCase();
  const e=$("equipmentFilter").value;
  const p=$("projectFilter").value;
  const s=$("statusFilter").value;
  return state.rows.filter(x=>{
    const hay=[x.repair_form_no,x.equipment_name,x.equipment_id,x.plate_number,x.project_name,x.problem‌s_encountered,x.repaired_by].join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(!e||x.equipment_id===e)&&(!p||x.project_id===p)&&(!s||x.status===s);
  });
}

function render(){
  const rows=filtered();
  $("metricRecords").textContent=rows.length;
  $("metricOpen").textContent=rows.filter(x=>x.status!=="CLOSED").length;
  $("metricClosed").textContent=rows.filter(x=>x.status==="CLOSED").length;
  $("metricCost").textContent=money(rows.reduce((s,x)=>s+Number(x.total_repair_cost||0),0));

  if(!rows.length){
    $("historyBody").innerHTML='<tr><td colspan="11" class="empty">No equipment repair history found.</td></tr>';
    return;
  }

  $("historyBody").innerHTML=rows.map(x=>`
    <tr>
      <td><strong>${escapeHtml(x.repair_form_no)}</strong></td>
      <td>${escapeHtml(x.request_date||"")}</td>
      <td>${escapeHtml(x.equipment_name||x.equipment_id||"")}</td>
      <td>${escapeHtml(x.plate_number||"—")}</td>
      <td>${escapeHtml(x.project_name||"—")}</td>
      <td>${escapeHtml(x.problems_encountered||"")}</td>
      <td>${statusPill(x.status)}</td>
      <td class="money">${money(x.total_repair_cost)}</td>
      <td>${Number(x.total_photos||0)}</td>
      <td>${escapeHtml(x.repaired_by||"—")}</td>
      <td><button class="btn-primary" type="button" onclick="location.href='repair-requests.html?id=${encodeURIComponent(x.repair_request_id)}'">VIEW</button></td>
    </tr>`).join("");
}

["searchInput","equipmentFilter","projectFilter","statusFilter"].forEach(id=>$(id).addEventListener("input",render));
$("refreshButton").addEventListener("click",async()=>{try{await loadHistory();showMessage("Equipment history refreshed.","success");}catch(e){showMessage(e.message||"Unable to refresh history.","error");}});
$("logoutButton").addEventListener("click",async()=>{await supabaseClient.auth.signOut();location.href="index.html";});

(async function(){
  try{
    if(!await requireSession())return;
    await loadFilters();
    await loadHistory();
  }catch(e){
    console.error(e);
    showMessage(e.message||"Unable to load equipment history.","error");
    $("historyBody").innerHTML='<tr><td colspan="11" class="empty">Unable to load equipment history.</td></tr>';
  }
})();