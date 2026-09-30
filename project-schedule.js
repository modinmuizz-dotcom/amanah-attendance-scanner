const SUPABASE_URL="https://bafmycjninxomufhkjvy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const state={projects:[],equipment:[],activities:[],assignments:[],selectedEquipment:new Set(),editingActivityId:null,editingScheduleId:null,detailActivityId:null,editingScheduleEquipment:new Set(),calendarMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1)};

function esc(v){return v==null?"":String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function msg(kind,text){const ok=document.getElementById("ok"),err=document.getElementById("err");ok.style.display=kind==="ok"?"block":"none";err.style.display=kind==="err"?"block":"none";if(kind==="ok")ok.textContent=text;else err.textContent=text;window.scrollTo({top:0,behavior:"smooth"});}
function clearMsg(){document.getElementById("ok").style.display="none";document.getElementById("err").style.display="none";}
function today(){return new Date().toISOString().slice(0,10);}
function statusPill(s){const cls={"PLANNED":"planned","IN PROGRESS":"progress","DONE":"done","NOT DONE":"notdone","CANCELLED":"cancel"}[s]||"planned";return '<span class="pill '+cls+'">'+esc(s)+'</span>';}
function fmtTime(iso){if(!iso)return "—";const d=new Date(iso);return d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});}
function fmtDate(iso){if(!iso)return "—";const d=new Date(iso);return d.toLocaleDateString();}
function isoFromLocal(date,time){if(!date||!time)return null;return new Date(date+"T"+time).toISOString();}
function getActivityTypeValue(prefix=""){
  const el=document.getElementById(prefix+"activityType");
  return (el?.value||"").trim();
}
function getActivityTypeDetails(prefix=""){
  const type=getActivityTypeValue(prefix).toUpperCase();
  const item=(document.getElementById(prefix+"activityItem")?.value||"").trim();
  const qtyRaw=document.getElementById(prefix+"activityQuantity")?.value||"";
  const quantity=qtyRaw===""?null:Number(qtyRaw);
  return {type,item,quantity};
}
function updateActivityTypeFields(prefix=""){
  const {type}=getActivityTypeDetails(prefix);
  const needsItem=type==="HAULING"||type==="MATERIALS DELIVERY";
  const needsQuantity=needsItem||type==="CONCRETE POURING";
  const itemField=document.getElementById(prefix+"activityItemField");
  const qtyField=document.getElementById(prefix+"activityQuantityField");
  const itemLabel=document.getElementById(prefix+"activityItemLabel");
  if(itemField)itemField.style.display=needsItem?"":"none";
  if(qtyField)qtyField.style.display=needsQuantity?"":"none";
  if(itemLabel)itemLabel.textContent=type==="MATERIALS DELIVERY"?"What is being delivered?":"What is being hauled?";
  if(!needsItem && document.getElementById(prefix+"activityItem"))document.getElementById(prefix+"activityItem").value="";
  if(!needsQuantity && document.getElementById(prefix+"activityQuantity"))document.getElementById(prefix+"activityQuantity").value="";
}
function validateActivityTypeDetails(prefix=""){
  const {type,item,quantity}=getActivityTypeDetails(prefix);
  if(!type)return "Please select or enter the activity type.";
  if((type==="HAULING"||type==="MATERIALS DELIVERY") && !item){
    return type==="HAULING" ? "Please enter what is being hauled." : "Please enter what is being delivered.";
  }
  if((type==="HAULING"||type==="MATERIALS DELIVERY"||type==="CONCRETE POURING") && (quantity===null || !Number.isFinite(quantity) || quantity<=0)){
    return "Please enter a quantity greater than 0.";
  }
  return null;
}

async function init(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href="admin.html";return;}
  document.getElementById("activityDate").value=today();
  document.getElementById("clearForm").addEventListener("click",clearForm);
  document.getElementById("saveSchedule").addEventListener("click",saveSchedule);
  document.getElementById("initialStatus").addEventListener("change",updateInitialStatusUI);
  ["activityType","activityItem","activityQuantity"].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener("input",()=>updateActivityTypeFields(""));
  });
  ["editActivityType","editActivityItem","editActivityQuantity"].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener("input",()=>updateActivityTypeFields("edit"));
  });
  document.getElementById("equipmentSearch").addEventListener("input",renderEquipment);
  document.getElementById("allEquipment").addEventListener("click",()=>{state.equipment.forEach(e=>state.selectedEquipment.add(e.equipment_id));renderEquipment();});
  document.getElementById("clearEquipment").addEventListener("click",()=>{state.selectedEquipment.clear();renderEquipment();});
  ["fSearch","fDate","fStatus","fProject"].forEach(id=>document.getElementById(id).addEventListener("input",renderTables));
  document.getElementById("clearFilters").addEventListener("click",()=>{document.getElementById("fSearch").value="";document.getElementById("fDate").value="";document.getElementById("fStatus").value="";document.getElementById("fProject").value="";renderTables();});
  document.getElementById("closeModal").addEventListener("click",closeModal);
  document.getElementById("cancelModal").addEventListener("click",closeModal);
  document.getElementById("saveStatus").addEventListener("click",saveStatus);
  document.getElementById("closeDetailModal").addEventListener("click",closeDetailModal);
  document.getElementById("closeDetailButton").addEventListener("click",closeDetailModal);
  document.getElementById("detailEditButton").addEventListener("click",()=>{const id=state.detailActivityId;closeDetailModal();openEditModal(id);});
  document.getElementById("detailUpdateButton").addEventListener("click",()=>{const id=state.detailActivityId;closeDetailModal();openModal(id);});
  document.getElementById("detailProgressRange").addEventListener("input",e=>syncDetailProgressInputs(e.target.value));
  document.getElementById("detailProgressNumber").addEventListener("input",e=>syncDetailProgressInputs(e.target.value));
  document.getElementById("saveDetailProgress").addEventListener("click",saveDetailProgress);
  document.querySelectorAll("[data-progress-quick]").forEach(btn=>btn.addEventListener("click",()=>syncDetailProgressInputs(btn.dataset.progressQuick)));
  document.getElementById("closeEditModal").addEventListener("click",closeEditModal);
  document.getElementById("cancelEditModal").addEventListener("click",closeEditModal);
  document.getElementById("saveEditSchedule").addEventListener("click",saveEditSchedule);
  document.getElementById("editEquipmentSearch").addEventListener("input",renderEditEquipment);
  document.getElementById("editAllEquipment").addEventListener("click",()=>{state.equipment.forEach(e=>state.editingScheduleEquipment.add(e.equipment_id));renderEditEquipment();});
  document.getElementById("editClearEquipment").addEventListener("click",()=>{state.editingScheduleEquipment.clear();renderEditEquipment();});
  document.getElementById("calendarPrev").addEventListener("click",()=>changeCalendarMonth(-1));
  document.getElementById("calendarNext").addEventListener("click",()=>changeCalendarMonth(1));
  document.getElementById("calendarToday").addEventListener("click",()=>{state.calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendar();});
  await Promise.all([loadProjects(),loadEquipment(),loadActivities()]);
  updateInitialStatusUI();
  updateActivityTypeFields("");
}
async function loadProjects(){
  const {data,error}=await supabaseClient.from("projects").select("project_id,project_name,location").order("project_name");
  if(error)throw error; state.projects=data||[];
  const opts='<option value="">SELECT PROJECT</option>'+state.projects.map(p=>'<option value="'+esc(p.project_id)+'">'+esc(p.project_name)+" — "+esc(p.location||p.project_id)+"</option>").join("");
  document.getElementById("project").innerHTML=opts;
  document.getElementById("editProject").innerHTML=opts;
  document.getElementById("fProject").innerHTML='<option value="">ALL PROJECTS</option>'+state.projects.map(p=>'<option value="'+esc(p.project_id)+'">'+esc(p.project_name)+'</option>').join("");
}
async function loadEquipment(){
  const {data,error}=await supabaseClient.from("equipment").select("equipment_id,equipment_name,equipment_type,plate_number,status").eq("status","ACTIVE").order("equipment_name");
  if(error)throw error;state.equipment=data||[];renderEquipment();
}
function renderEquipment(){
  const q=(document.getElementById("equipmentSearch").value||"").toLowerCase().trim();
  const rows=state.equipment.filter(e=>[e.equipment_id,e.equipment_name,e.equipment_type,e.plate_number].join(" ").toLowerCase().includes(q));
  document.getElementById("equipmentList").innerHTML=rows.length?rows.map(e=>'<label class="equip-row"><input type="checkbox" value="'+esc(e.equipment_id)+'" '+(state.selectedEquipment.has(e.equipment_id)?"checked":"")+'> <span><strong>'+esc(e.equipment_name)+'</strong><small>'+esc(e.equipment_id)+" • "+esc(e.equipment_type||"")+" • "+esc(e.plate_number||"")+'</small></span></label>').join(""):'<div style="padding:20px;text-align:center;color:#64748b">No equipment found.</div>';
  document.querySelectorAll("#equipmentList input[type=checkbox]").forEach(cb=>cb.addEventListener("change",e=>{if(e.target.checked)state.selectedEquipment.add(e.target.value);else state.selectedEquipment.delete(e.target.value);renderEquipment();}));
  const n=state.selectedEquipment.size;const s=document.getElementById("equipmentSummary");s.textContent=n?n+" equipment selected.":"No equipment selected.";s.classList.toggle("has",!!n);
}
async function loadActivities(){
  const {data:acts,error}=await supabaseClient.from("project_activities").select("activity_id,project_id,project_name,activity_date,activity,activity_item,activity_quantity,description,manpower,equipment,accomplishment,remarks,activity_status,approval_status,approval_remarks,scheduled_start,scheduled_end,priority,completed_at,completion_remarks").order("activity_date",{ascending:false}).order("scheduled_start",{ascending:false});
  if(error)throw error;state.activities=acts||[];
  const {data:rel,error:relErr}=await supabaseClient.from("project_activity_equipment").select("activity_id,equipment_id");
  if(relErr)throw relErr;state.assignments=rel||[];renderTables();
}
function selectedProjectName(id){return state.projects.find(p=>p.project_id===id)?.project_name||"";}
function equipmentFor(id){const ids=state.assignments.filter(x=>x.activity_id===id).map(x=>x.equipment_id);return state.equipment.filter(e=>ids.includes(e.equipment_id));}
function renderTables(){
  const q=(document.getElementById("fSearch").value||"").toLowerCase().trim(),date=document.getElementById("fDate").value,status=document.getElementById("fStatus").value,pid=document.getElementById("fProject").value;
  const rows=state.activities.filter(a=>{
    const eqNames=equipmentFor(a.activity_id).map(e=>e.equipment_name).join(" ");
    const text=[a.activity,a.project_name,a.description,eqNames].join(" ").toLowerCase();
    return (!q||text.includes(q))&&(!date||a.activity_date===date)&&(!status||a.activity_status===status)&&(!pid||a.project_id===pid);
  });
  const equipCount=rows.reduce((n,a)=>n+equipmentFor(a.activity_id).length,0);
  document.getElementById("mScheduled").textContent=rows.length;
  document.getElementById("mEquip").textContent=equipCount;
  document.getElementById("mProgress").textContent=rows.filter(a=>a.activity_status==="IN PROGRESS").length;
  document.getElementById("mDone").textContent=rows.filter(a=>a.activity_status==="DONE").length;

  document.getElementById("activityTable").innerHTML=rows.length?rows.map(a=>{
    const eq=equipmentFor(a.activity_id);const time=(a.scheduled_start?fmtTime(a.scheduled_start):"—")+" - "+(a.scheduled_end?fmtTime(a.scheduled_end):"—");
    let action='<button class="mini edit" data-edit="'+esc(a.activity_id)+'">✎ EDIT</button><button class="mini blue" data-update="'+esc(a.activity_id)+'">UPDATE</button><button class="mini red" data-delete="'+esc(a.activity_id)+'">DELETE</button>';
    if(a.approval_status==="PENDING" && a.activity_status==="PENDING APPROVAL"){
      action+='<button class="mini amber" data-cancel-request="'+esc(a.activity_id)+'">CANCEL REQUEST</button>';
    }
    if(a.approval_status==="APPROVED" && a.activity_status!=="DONE" && a.activity_status!=="CANCELLED" && a.activity_status!=="REJECTED"){
      action+='<button class="mini amber" data-approved-cancel-request="'+esc(a.activity_id)+'">REQUEST CANCELLATION</button>';
    }
    return '<tr><td>'+esc(a.activity_date||"—")+'</td><td>'+esc(time)+'</td><td><strong>'+esc(a.project_name||selectedProjectName(a.project_id)||"")+'</strong></td><td><strong>'+esc(a.activity||"")+'</strong>'+(a.activity_item?'<br><small style="color:#64748b">'+esc(a.activity_item)+'</small>':'')+(a.activity_quantity!=null?'<br><small style="color:#2563eb;font-weight:800">QTY: '+esc(a.activity_quantity)+'</small>':'')+'</td><td style="white-space:normal;max-width:240px">'+esc(a.description||"")+'</td><td class="equip-list-text">'+esc(eq.map(e=>e.equipment_name).join(", ")||a.equipment||"—")+'</td><td>'+esc(a.priority||"NORMAL")+'</td><td>'+statusPill(a.activity_status||"PLANNED")+'</td><td>'+esc(a.accomplishment??0)+'%</td><td><div class="row-actions">'+action+'</div></td></tr>';
  }).join(""):'<tr><td colspan="10" style="text-align:center;color:#94a3b8;padding:30px">No scheduled activities found.</td></tr>';

  const approvedRows=rows.filter(a=>a.approval_status==='APPROVED' || (!a.approval_status && !['PENDING APPROVAL','REJECTED'].includes(a.activity_status)));
  const assignments=approvedRows.flatMap(a=>equipmentFor(a.activity_id).map(e=>({a,e})));
  document.getElementById("equipmentTable").innerHTML=assignments.length?assignments.map(({a,e})=>'<tr><td>'+esc(a.activity_date||"—")+'</td><td>'+esc((a.scheduled_start?fmtTime(a.scheduled_start):"—")+" - "+(a.scheduled_end?fmtTime(a.scheduled_end):"—"))+'</td><td><strong>'+esc(e.equipment_name)+'</strong><br><small style="color:#64748b">'+esc(e.equipment_id)+" • "+esc(e.plate_number||"")+'</small></td><td>'+esc(a.project_name||selectedProjectName(a.project_id)||"")+'</td><td><strong>'+esc(a.activity||"")+'</strong></td><td>'+esc(a.priority||"NORMAL")+'</td><td>'+statusPill(a.activity_status||"PLANNED")+'</td></tr>').join(""):'<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:30px">No equipment schedules found.</td></tr>';

  document.querySelectorAll("[data-edit]").forEach(btn=>btn.addEventListener("click",()=>openEditModal(btn.dataset.edit)));
  document.querySelectorAll("[data-update]").forEach(btn=>btn.addEventListener("click",()=>openModal(btn.dataset.update)));
  document.querySelectorAll("[data-delete]").forEach(btn=>btn.addEventListener("click",()=>deleteActivity(btn.dataset.delete)));
  document.querySelectorAll("[data-cancel-request]").forEach(btn=>btn.addEventListener("click",()=>cancelActivityRequest(btn.dataset.cancelRequest)));
  document.querySelectorAll("[data-approved-cancel-request]").forEach(btn=>btn.addEventListener("click",()=>requestActivityCancellation(btn.dataset.approvedCancelRequest)));
  renderCalendar();
}

function ensureAmanahMessageStyles(){
  if(document.getElementById("amanahMessageStyles")) return;
  const style=document.createElement("style");
  style.id="amanahMessageStyles";
  style.textContent=`
    .amanah-message-backdrop{
      display:none;position:fixed;inset:0;z-index:2500;
      align-items:center;justify-content:center;padding:20px;
      background:rgba(15,23,42,.66);backdrop-filter:blur(3px);
    }
    .amanah-message-dialog{
      width:min(560px,100%);background:#fff;border:1px solid #e2e8f0;
      border-radius:18px;box-shadow:0 25px 80px rgba(15,23,42,.28);
      overflow:hidden;animation:amanahMessageIn .16s ease-out;
    }
    .amanah-message-head{
      display:flex;align-items:center;gap:12px;padding:18px 20px;
      border-bottom:1px solid #e2e8f0;
    }
    .amanah-message-icon{
      width:42px;height:42px;border-radius:12px;display:grid;place-items:center;
      font-size:20px;font-weight:900;flex:0 0 auto;
    }
    .amanah-message-icon.confirm{background:#fef3c7;color:#92400e}
    .amanah-message-icon.success{background:#dcfce7;color:#166534}
    .amanah-message-icon.error{background:#fee2e2;color:#991b1b}
    .amanah-message-title{margin:0;font-size:16px;font-weight:900;color:#0f172a}
    .amanah-message-subtitle{margin:3px 0 0;color:#64748b;font-size:11px;font-weight:700}
    .amanah-message-body{padding:20px;color:#334155;font-size:13px;line-height:1.6}
    .amanah-message-body strong{color:#0f172a}
    .amanah-message-details{
      margin-top:12px;padding:12px 13px;border:1px solid #e2e8f0;border-radius:12px;
      background:#f8fafc;white-space:pre-line;
    }
    .amanah-message-actions{
      display:flex;justify-content:flex-end;gap:9px;padding:0 20px 20px;
    }
    .amanah-message-btn{
      min-height:42px;padding:10px 16px;border-radius:10px;border:1px solid #dbe2ea;
      font-size:11px;font-weight:900;cursor:pointer;
    }
    .amanah-message-btn.cancel{background:#fff;color:#334155}
    .amanah-message-btn.danger{background:#dc2626;color:#fff;border-color:#dc2626}
    .amanah-message-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}
    .amanah-message-btn:disabled{opacity:.65;cursor:wait}
    @keyframes amanahMessageIn{
      from{opacity:0;transform:translateY(8px) scale(.985)}
      to{opacity:1;transform:translateY(0) scale(1)}
    }
    @media(max-width:600px){
      .amanah-message-backdrop{padding:12px}
      .amanah-message-actions{flex-direction:column-reverse}
      .amanah-message-btn{width:100%}
    }
  `;
  document.head.appendChild(style);
}

function closeAmanahMessage(result){
  const wrap=document.getElementById("amanahMessageBackdrop");
  if(!wrap)return;
  wrap.style.display="none";
  wrap.remove();
  return result;
}

function showAmanahConfirm({title,subtitle,activity,equipment}){
  return new Promise(resolve=>{
    ensureAmanahMessageStyles();
    document.getElementById("amanahMessageBackdrop")?.remove();
    const details=[
      activity?("Activity: "+activity):"",
      equipment?("Equipment schedule: "+equipment):"Equipment schedule: None"
    ].filter(Boolean).join("\\n");

    const wrap=document.createElement("div");
    wrap.id="amanahMessageBackdrop";
    wrap.className="amanah-message-backdrop";
    wrap.innerHTML=
      '<div class="amanah-message-dialog" role="dialog" aria-modal="true" aria-labelledby="amanahMessageTitle">'+
        '<div class="amanah-message-head">'+
          '<div class="amanah-message-icon confirm">!</div>'+
          '<div><h3 class="amanah-message-title" id="amanahMessageTitle">'+esc(title||"Confirm Action")+'</h3>'+
          '<p class="amanah-message-subtitle">'+esc(subtitle||"Please review the following information before continuing.")+'</p></div>'+
        '</div>'+
        '<div class="amanah-message-body">'+
          '<div>This action will permanently remove the selected record.</div>'+
          '<div class="amanah-message-details"><strong>Review before deletion</strong>\\n'+esc(details)+'</div>'+
        '</div>'+
        '<div class="amanah-message-actions">'+
          '<button type="button" class="amanah-message-btn cancel" data-message-cancel>CANCEL</button>'+
          '<button type="button" class="amanah-message-btn danger" data-message-confirm>DELETE ACTIVITY</button>'+
        '</div>'+
      '</div>';

    document.body.appendChild(wrap);
    wrap.style.display="flex";

    const finish=value=>{closeAmanahMessage();resolve(value);};
    wrap.querySelector("[data-message-cancel]").addEventListener("click",()=>finish(false));
    wrap.querySelector("[data-message-confirm]").addEventListener("click",()=>finish(true));
    wrap.addEventListener("click",e=>{if(e.target===wrap)finish(false);});
    document.addEventListener("keydown",function onKey(e){
      if(e.key==="Escape"){document.removeEventListener("keydown",onKey);finish(false);}
    },{once:true});
  });
}


function showAmanahCancelConfirm({title,subtitle,activity,project,approved=false}){
  return new Promise(resolve=>{
    ensureAmanahMessageStyles();
    document.getElementById("amanahCancelBackdrop")?.remove();
    const wrap=document.createElement("div");
    wrap.id="amanahCancelBackdrop";
    wrap.className="amanah-message-backdrop";
    wrap.innerHTML=
      '<div class="amanah-message-dialog" role="dialog" aria-modal="true">'+
        '<div class="amanah-message-head">'+
          '<div class="amanah-message-icon confirm">!</div>'+
          '<div><h3 class="amanah-message-title">'+esc(title||"Cancel Request")+'</h3>'+
          '<p class="amanah-message-subtitle">'+esc(subtitle||"Review this request before withdrawing it.")+'</p></div>'+
        '</div>'+
        '<div class="amanah-message-body">'+
          '<div>'+esc(approved ? "This will submit a cancellation request to the General Manager. The approved activity will remain active until the General Manager decides." : "This will withdraw the pending request. The original record will remain in AMANAH for audit history.")+'</div>'+
          '<div class="amanah-message-details"><strong>Request details</strong>\nActivity: '+esc(activity||"—")+'\nProject: '+esc(project||"—")+'</div>'+
          '<label style="display:block;margin-top:14px;font-size:11px;font-weight:800;color:#334155">CANCELLATION REASON</label>'+
          '<textarea data-cancel-reason rows="4" placeholder="Enter the reason for withdrawing this request..." style="width:100%;box-sizing:border-box;margin-top:7px;border:1px solid #cbd5e1;border-radius:10px;padding:11px 12px;font:inherit;resize:vertical"></textarea>'+
          '<div style="margin-top:6px;color:#94a3b8;font-size:10px">A cancellation reason is required for the audit trail.</div>'+
        '</div>'+
        '<div class="amanah-message-actions">'+
          '<button type="button" class="amanah-message-btn cancel" data-message-cancel>KEEP REQUEST</button>'+
          '<button type="button" class="amanah-message-btn danger" data-message-confirm>CANCEL REQUEST</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(wrap);
    wrap.style.display="flex";
    const reason=wrap.querySelector("[data-cancel-reason]");
    setTimeout(()=>reason?.focus(),30);
    const finish=value=>{wrap.remove();resolve(value);};
    wrap.querySelector("[data-message-cancel]").addEventListener("click",()=>finish(null));
    wrap.querySelector("[data-message-confirm]").addEventListener("click",()=>{
      const text=(reason?.value||"").trim();
      if(!text){reason.focus();reason.style.borderColor="#dc2626";return;}
      finish(text);
    });
    wrap.addEventListener("click",e=>{if(e.target===wrap)finish(null);});
    document.addEventListener("keydown",function onKey(e){if(e.key==="Escape"){document.removeEventListener("keydown",onKey);finish(null);}}, {once:true});
  });
}

async function cancelActivityRequest(id){
  const a=state.activities.find(x=>x.activity_id===id);
  if(!a || a.approval_status!=="PENDING") return;
  const reason=await showAmanahCancelConfirm({
    title:"Cancel Activity Request",
    subtitle:"This activity is still awaiting General Manager approval.",
    activity:a.activity,
    project:a.project_name||selectedProjectName(a.project_id)
  });
  if(!reason)return;
  const btn=document.querySelector("[data-cancel-request=\""+CSS.escape(id)+"\"]");
  if(btn){btn.disabled=true;btn.textContent="CANCELLING...";}
  try{
    const {data:req,error:reqError}=await supabaseClient.from("amanah_approval_requests").select("approval_id").eq("request_type","ACTIVITY").eq("entity_id",id).eq("status","PENDING").maybeSingle();
    if(reqError)throw reqError;
    if(!req?.approval_id)throw new Error("No pending approval request was found for this activity.");
    const {error}=await supabaseClient.rpc("amanah_cancel_approval",{p_approval_id:req.approval_id,p_reason:reason});
    if(error)throw error;
    msg("ok","Activity request cancelled successfully.");
    await loadActivities();
  }catch(e){
    console.error(e);msg("err","Could not cancel activity request: "+e.message);
  }finally{
    if(btn){btn.disabled=false;btn.textContent="CANCEL REQUEST";}
  }
}

async function requestActivityCancellation(id){
  const a=state.activities.find(x=>x.activity_id===id);
  if(!a || a.approval_status!=="APPROVED")return;
  const reason=await showAmanahCancelConfirm({
    title:"Request Activity Cancellation",
    subtitle:"This approved activity requires General Manager approval before it can be cancelled.",
    activity:a.activity,
    project:a.project_name||selectedProjectName(a.project_id),
    approved:true
  });
  if(!reason)return;
  const btn=document.querySelector("[data-approved-cancel-request=\""+CSS.escape(id)+"\"]");
  if(btn){btn.disabled=true;btn.textContent="SUBMITTING...";}
  try{
    const {data,error}=await supabaseClient.rpc("amanah_request_cancellation",{
      p_request_type:"ACTIVITY",
      p_entity_id:id,
      p_title:"Cancellation: "+(a.activity||"Activity"),
      p_description:"Cancellation request submitted for General Manager approval.",
      p_payload:{
        request_action:"CANCEL",
        project_name:a.project_name||selectedProjectName(a.project_id),
        activity:a.activity||"",
        activity_date:a.activity_date||"",
        equipment:equipmentFor(id).map(e=>e.equipment_name).join(", "),
        priority:a.priority||"NORMAL",
        manpower:a.manpower||0,
        description:a.description||"",
        cancellation_reason:reason
      }
    });
    if(error)throw error;
    if(!data)throw new Error("The approval request was not created.");
    msg("ok","Activity cancellation request submitted successfully. It is now awaiting General Manager approval.");
    await loadActivities();
  }catch(e){
    console.error(e);
    msg("err","Cancellation request was not submitted: "+(e.message||"Please try again."));
  }finally{
    if(btn){btn.disabled=false;btn.textContent="REQUEST CANCELLATION";}
  }
}async function deleteActivity(id){
  const a=state.activities.find(x=>x.activity_id===id);
  if(!a)return;
  const name=a.activity||"Activity";
  const equipment=equipmentFor(id).map(e=>e.equipment_name).join(", ");
  const details=equipment?"\\n\\nEquipment schedule that will also be deleted:\\n"+equipment:"";
  const confirmed=await showAmanahConfirm({
    title:"Confirm Activity Deletion",
    subtitle:"This action requires confirmation before the activity is removed.",
    activity:name,
    equipment:equipment||"None"
  });
  if(!confirmed)return;
  clearMsg();
  const btn=document.querySelector("[data-delete=\""+CSS.escape(id)+"\"]");
  const old=btn?.textContent||"DELETE";
  if(btn){btn.disabled=true;btn.textContent="DELETING...";}
  try{
    const {error}=await supabaseClient.from("project_activities").delete().eq("activity_id",id);
    if(error)throw error;
    msg("ok","Activity \""+name+"\" deleted successfully. Its corresponding equipment schedule was also deleted.");
    await loadActivities();
  }catch(e){
    console.error(e);
    msg("err","Could not delete activity: "+e.message);
  }finally{
    if(btn){btn.disabled=false;btn.textContent=old;}
  }
}

function changeCalendarMonth(delta){
  state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()+delta,1);
  renderCalendar();
}

function calendarStatusClass(status){
  return {"PLANNED":"planned","IN PROGRESS":"status-progress","DONE":"status-done","NOT DONE":"status-notdone","CANCELLED":"status-cancel"}[status] || "planned";
}

function renderCalendar(){
  const grid=document.getElementById("calendarGrid");
  const label=document.getElementById("calendarMonthLabel");
  if(!grid||!label)return;

  const year=state.calendarMonth.getFullYear();
  const month=state.calendarMonth.getMonth();
  label.textContent=state.calendarMonth.toLocaleDateString(undefined,{month:"long",year:"numeric"});

  const weekdays=["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const first=new Date(year,month,1);
  const startDay=first.getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const prevDays=new Date(year,month,0).getDate();

  const q=(document.getElementById("fSearch")?.value||"").toLowerCase().trim();
  const filterProject=document.getElementById("fProject")?.value||"";
  const filterStatus=document.getElementById("fStatus")?.value||"";
  const filtered=state.activities.filter(a=>{
    const eqNames=equipmentFor(a.activity_id).map(e=>e.equipment_name).join(" ");
    const text=[a.activity,a.project_name,a.description,eqNames].join(" ").toLowerCase();
    const calendarApproved=a.approval_status==='APPROVED' || (!a.approval_status && !['PENDING APPROVAL','REJECTED'].includes(a.activity_status));
    return calendarApproved && (!q||text.includes(q))&&(!filterProject||a.project_id===filterProject)&&(!filterStatus||a.activity_status===filterStatus);
  });

  let out=weekdays.map(d=>'<div class="calendar-weekday">'+d+'</div>').join("");

  const totalCells=Math.ceil((startDay+daysInMonth)/7)*7;
  const todayStr=today();

  for(let cell=0;cell<totalCells;cell++){
    const dayNum=cell-startDay+1;
    let cellDate,muted=false,displayDay;

    if(dayNum<1){
      const d=prevDays+dayNum;
      cellDate=year+"-"+String(month).padStart(2,"0")+"-"+String(d).padStart(2,"0");
      muted=true;displayDay=d;
    }else if(dayNum>daysInMonth){
      const d=dayNum-daysInMonth;
      const nextDate=new Date(year,month+1,d);
      cellDate=nextDate.toISOString().slice(0,10);
      muted=true;displayDay=d;
    }else{
      cellDate=year+"-"+String(month+1).padStart(2,"0")+"-"+String(dayNum).padStart(2,"0");
      displayDay=dayNum;
    }

    const dayActs=filtered.filter(a=>a.activity_date===cellDate).sort((a,b)=>{
      const aa=a.scheduled_start||"9999";const bb=b.scheduled_start||"9999";
      return aa.localeCompare(bb);
    });

    const events=dayActs.slice(0,4).map(a=>{
      const time=(a.scheduled_start?fmtTime(a.scheduled_start):"")+" "+(a.scheduled_end?("– "+fmtTime(a.scheduled_end)):"");
      const statusCls=calendarStatusClass(a.activity_status);
      return '<button type="button" class="calendar-event '+statusCls+'" data-cal-update="'+esc(a.activity_id)+'">'+
        '<div class="calendar-event-time">'+esc(time||"ALL DAY")+'</div>'+
        '<div class="calendar-event-name">'+esc(a.activity||"Activity")+'</div>'+
        '<div class="calendar-event-project">'+esc(a.project_name||selectedProjectName(a.project_id)||"")+'</div>'+
      '</button>';
    }).join("");

    const more=dayActs.length>4?'<div class="calendar-more">+'+(dayActs.length-4)+' more</div>':"";

    out+='<div class="calendar-day '+(muted?"muted ":"")+(cellDate===todayStr?"today":"")+'>'+
      '<div class="calendar-day-number"><span>'+displayDay+'</span>'+(dayActs.length?'<em class="calendar-more">'+dayActs.length+' task'+(dayActs.length>1?"s":"")+'</em>':"")+'</div>'+
      (events||'<div style="height:4px"></div>')+more+
    '</div>';
  }

  grid.innerHTML=out;
  document.querySelectorAll("[data-cal-update]").forEach(btn=>btn.addEventListener("click",()=>openDetailsModal(btn.dataset.calUpdate)));
}

async function saveSchedule(){
  clearMsg();
  const pid=document.getElementById("project").value,date=document.getElementById("activityDate").value,start=document.getElementById("startTime").value,end=document.getElementById("endTime").value,activity=document.getElementById("activityType").value.trim().toUpperCase(),description=document.getElementById("description").value.trim(),manpower=Number(document.getElementById("manpower").value||0),priority=document.getElementById("priority").value;
  const {type:activityType, item:activityItem, quantity:activityQuantity}=getActivityTypeDetails("");
  if(!pid)return msg("err","Please select a project.");
  if(!date)return msg("err","Please select the activity date.");
  const activityDetailError=validateActivityTypeDetails("");
  if(activityDetailError)return msg("err",activityDetailError);
  if(!state.selectedEquipment.size)return msg("err","Please select the equipment required on site.");
  const ss=isoFromLocal(date,start),se=isoFromLocal(date,end);
  if(ss&&se&&new Date(se)<new Date(ss))return msg("err","End time cannot be earlier than start time.");
  const p=state.projects.find(x=>x.project_id===pid);
  const equipmentNames=state.equipment.filter(e=>state.selectedEquipment.has(e.equipment_id)).map(e=>e.equipment_name).join(", ");
  const btn=document.getElementById("saveSchedule");btn.disabled=true;btn.textContent="SUBMITTING...";
  try{
    const {data,error:insertError}=await supabaseClient.from("project_activities").insert({
      project_id:pid,project_name:p?.project_name||null,activity_date:date,activity,activity_item:activityItem||null,activity_quantity:activityQuantity,
      description:description||null,manpower,equipment:equipmentNames,accomplishment:0,remarks:null,activity_status:"PENDING APPROVAL",
      approval_status:"PENDING",scheduled_start:ss,scheduled_end:se,priority,completed_at:null,completion_remarks:null
    }).select("activity_id").single();
    if(insertError)throw insertError;

    const rel=Array.from(state.selectedEquipment).map(equipment_id=>({activity_id:data.activity_id,equipment_id}));
    const {error:relError}=await supabaseClient.from("project_activity_equipment").insert(rel);
    if(relError)throw relError;

    const {error:approvalError}=await supabaseClient.rpc("amanah_submit_approval",{
      p_request_type:"ACTIVITY",
      p_entity_id:data.activity_id,
      p_title:activity,
      p_description:"Activity submitted by Engineer for General Manager approval.",
      p_payload:{project_name:p?.project_name||"",activity,activity_type:activityType,activity_item:activityItem||"",activity_quantity:activityQuantity,activity_date:date,time:(start||end)?((start||"")+" - "+(end||"")):"ALL DAY",priority,equipment:equipmentNames,manpower,description:description||""}
    });
    if(approvalError)throw approvalError;

    msg("ok","Activity submitted for General Manager approval. It will not be placed on the equipment/calendar schedule until approved.");
    clearForm();await loadActivities();
  }catch(e){console.error(e);msg("err","Could not submit activity: "+e.message)}finally{btn.disabled=false;btn.textContent="SAVE SCHEDULE";}
}
function updateInitialStatusUI(){const s=document.getElementById("initialStatus").value;const progress=s==="DONE"?100:0;const el=document.getElementById("initialStatus");el.style.color=s==="DONE"?"#15803d":s==="IN PROGRESS"?"#c2410c":s==="NOT DONE"?"#b91c1c":s==="CANCELLED"?"#475569":"#1d4ed8";el.style.background=s==="DONE"?"#ecfdf5":s==="IN PROGRESS"?"#fff7ed":s==="NOT DONE"?"#fef2f2":s==="CANCELLED"?"#f1f5f9":"#eff6ff";}
function clearForm(){document.getElementById("activityDate").value=today();document.getElementById("startTime").value="";document.getElementById("endTime").value="";document.getElementById("activityType").value="";document.getElementById("activityItem").value="";document.getElementById("activityQuantity").value="";document.getElementById("description").value="";document.getElementById("manpower").value="0";document.getElementById("priority").value="NORMAL";document.getElementById("initialStatus").value="PENDING APPROVAL";updateInitialStatusUI();updateActivityTypeFields("");state.selectedEquipment.clear();renderEquipment();}

function localDateInput(iso){
  if(!iso)return "";
  const d=new Date(iso);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function localTimeInput(iso){
  if(!iso)return "";
  const d=new Date(iso);
  return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}
function renderEditEquipment(){
  const list=document.getElementById("editEquipmentList");
  if(!list)return;
  const q=(document.getElementById("editEquipmentSearch").value||"").toLowerCase().trim();
  const rows=state.equipment.filter(e=>[e.equipment_id,e.equipment_name,e.equipment_type,e.plate_number].join(" ").toLowerCase().includes(q));
  list.innerHTML=rows.length?rows.map(e=>'<label class="equip-row"><input type="checkbox" value="'+esc(e.equipment_id)+'" '+(state.editingScheduleEquipment.has(e.equipment_id)?"checked":"")+'> <span><strong>'+esc(e.equipment_name)+'</strong><small>'+esc(e.equipment_id)+" • "+esc(e.equipment_type||"")+" • "+esc(e.plate_number||"")+'</small></span></label>').join(""):'<div style="padding:20px;text-align:center;color:#64748b">No equipment found.</div>';
  list.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.addEventListener("change",e=>{
    if(e.target.checked)state.editingScheduleEquipment.add(e.target.value);
    else state.editingScheduleEquipment.delete(e.target.value);
    renderEditEquipment();
  }));
  const n=state.editingScheduleEquipment.size;
  const summary=document.getElementById("editEquipmentSummary");
  summary.textContent=n?n+" equipment selected.":"No equipment selected.";
  summary.classList.toggle("has",!!n);
}
function openEditModal(id){
  const a=state.activities.find(x=>x.activity_id===id);
  if(!a)return;
  state.editingScheduleId=id;
  document.getElementById("editProject").value=a.project_id||"";
  document.getElementById("editActivityDate").value=a.activity_date||localDateInput(a.scheduled_start);
  document.getElementById("editStartTime").value=localTimeInput(a.scheduled_start);
  document.getElementById("editEndTime").value=localTimeInput(a.scheduled_end);
  document.getElementById("editActivityType").value=a.activity||"";
  document.getElementById("editActivityItem").value=a.activity_item||"";
  document.getElementById("editActivityQuantity").value=a.activity_quantity??"";
  document.getElementById("editPriority").value=a.priority||"NORMAL";
  document.getElementById("editDescription").value=a.description||"";
  document.getElementById("editManpower").value=a.manpower??0;
  document.getElementById("editCurrentStatus").value=a.activity_status||"PLANNED";
  document.getElementById("editEquipmentSearch").value="";
  state.editingScheduleEquipment=new Set(state.assignments.filter(x=>x.activity_id===id).map(x=>x.equipment_id));
  renderEditEquipment();
  updateActivityTypeFields("edit");
  document.getElementById("editModal").style.display="flex";
}
function closeEditModal(){
  state.editingScheduleId=null;
  state.editingScheduleEquipment.clear();
  document.getElementById("editModal").style.display="none";
}
async function saveEditSchedule(){
  if(!state.editingScheduleId)return;
  clearMsg();
  const id=state.editingScheduleId;
  const pid=document.getElementById("editProject").value;
  const date=document.getElementById("editActivityDate").value;
  const start=document.getElementById("editStartTime").value;
  const end=document.getElementById("editEndTime").value;
  const activity=document.getElementById("editActivityType").value.trim().toUpperCase();
  const {type:activityType,item:activityItem,quantity:activityQuantity}=getActivityTypeDetails("edit");
  const description=document.getElementById("editDescription").value.trim();
  const manpower=Number(document.getElementById("editManpower").value||0);
  const priority=document.getElementById("editPriority").value;
  if(!pid)return msg("err","Please select a project.");
  if(!date)return msg("err","Please select the activity date.");
  const editActivityDetailError=validateActivityTypeDetails("edit");
  if(editActivityDetailError)return msg("err",editActivityDetailError);
  if(!state.editingScheduleEquipment.size)return msg("err","Please select the equipment required on site.");
  const ss=isoFromLocal(date,start),se=isoFromLocal(date,end);
  if(ss&&se&&new Date(se)<new Date(ss))return msg("err","End time cannot be earlier than start time.");
  const p=state.projects.find(x=>x.project_id===pid);
  const btn=document.getElementById("saveEditSchedule");
  btn.disabled=true;btn.textContent="SAVING...";
  try{
    const payload={
      project_id:pid,
      project_name:p?.project_name||null,
      activity_date:date,
      activity,
      activity_item:activityItem||null,
      activity_quantity:activityQuantity,
      description:description||null,
      manpower,
      equipment:state.equipment.filter(e=>state.editingScheduleEquipment.has(e.equipment_id)).map(e=>e.equipment_name).join(", "),
      scheduled_start:ss,
      scheduled_end:se,
      priority,
      activity_status:"PENDING APPROVAL",
      approval_status:"PENDING",
      approval_decided_by:null,
      approval_decided_at:null,
      approval_remarks:null
    };
    const {error:updateError}=await supabaseClient.from("project_activities").update(payload).eq("activity_id",id);
    if(updateError)throw updateError;

    const {error:deleteError}=await supabaseClient.from("project_activity_equipment").delete().eq("activity_id",id);
    if(deleteError)throw deleteError;

    const rel=Array.from(state.editingScheduleEquipment).map(equipment_id=>({activity_id:id,equipment_id}));
    const {error:insertError}=await supabaseClient.from("project_activity_equipment").insert(rel);
    if(insertError)throw insertError;

    const p2=state.projects.find(x=>x.project_id===pid);
    const eqNames=state.equipment.filter(e=>state.editingScheduleEquipment.has(e.equipment_id)).map(e=>e.equipment_name).join(", ");
    const {error:approvalError}=await supabaseClient.rpc("amanah_submit_approval",{
      p_request_type:"ACTIVITY",
      p_entity_id:id,
      p_title:activity,
      p_description:"Edited activity resubmitted by Engineer for General Manager approval.",
      p_payload:{project_name:p2?.project_name||"",activity,activity_type:activityType,activity_item:activityItem||"",activity_quantity:activityQuantity,activity_date:date,time:(start||end)?((start||"")+" - "+(end||"")):"ALL DAY",priority,equipment:eqNames,manpower,description:description||""}
    });
    if(approvalError)throw approvalError;
    closeEditModal();
    msg("ok","Activity changes saved and resubmitted for General Manager approval.");
    await loadActivities();
  }catch(e){
    console.error(e);
    msg("err","Could not edit activity schedule: "+e.message);
  }finally{
    btn.disabled=false;
    btn.textContent="SAVE CHANGES";
  }
}

function selectedProjectLocation(id){return state.projects.find(p=>p.project_id===id)?.location||"";}
function formatActivityDate(date){
  if(!date)return "—";
  const d=new Date(date+"T00:00:00");
  return d.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
}
function clampProgress(v){
  const n=Number(v);
  if(!Number.isFinite(n))return 0;
  return Math.max(0,Math.min(100,Math.round(n)));
}
function syncDetailProgressInputs(value){
  const p=clampProgress(value);
  document.getElementById("detailProgressRange").value=p;
  document.getElementById("detailProgressNumber").value=p;
  document.getElementById("detailProgressEditorValue").textContent=p+"%";
}
async function saveDetailProgress(){
  const id=state.detailActivityId;
  if(!id)return;
  const a=state.activities.find(x=>x.activity_id===id);
  if(!a)return;
  const progress=clampProgress(document.getElementById("detailProgressNumber").value);
  let nextStatus;
  if(progress===100)nextStatus="DONE";
  else if(progress>0)nextStatus="IN PROGRESS";
  else nextStatus="PLANNED";

  const payload={
    accomplishment:progress,
    activity_status:nextStatus,
    completed_at:progress===100?new Date().toISOString():null
  };
  const btn=document.getElementById("saveDetailProgress");
  btn.disabled=true;btn.textContent="SAVING...";
  try{
    const {error}=await supabaseClient.from("project_activities").update(payload).eq("activity_id",id);
    if(error)throw error;
    msg("ok","Activity progress saved at "+progress+"%. Status updated to "+nextStatus+".");
    await loadActivities();
    const refreshed=state.activities.find(x=>x.activity_id===id);
    if(refreshed){
      const p=clampProgress(refreshed.accomplishment||0);
      document.getElementById("detailStatus").textContent=refreshed.activity_status||nextStatus;
      document.getElementById("detailProgressText").textContent=p+"%";
      document.getElementById("detailProgressFill").style.width=p+"%";
      syncDetailProgressInputs(p);
      document.getElementById("detailCompletedAt").textContent=refreshed.completed_at?"Completed at: "+new Date(refreshed.completed_at).toLocaleString():"";
    }
  }catch(e){
    console.error(e);
    msg("err","Could not save activity progress: "+e.message);
  }finally{
    btn.disabled=false;btn.textContent="SAVE PROGRESS";
  }
}
function openDetailsModal(id){
  const a=state.activities.find(x=>x.activity_id===id);
  if(!a)return;
  state.detailActivityId=id;
  const equipment=equipmentFor(id);
  const equipmentText=equipment.length
    ? equipment.map(e=>e.equipment_name+(e.plate_number?" • "+e.plate_number:"")).join(", ")
    : (a.equipment||"—");
  const progress=Math.max(0,Math.min(100,Number(a.accomplishment||0)));
  const time=(a.scheduled_start?fmtTime(a.scheduled_start):"—")+" - "+(a.scheduled_end?fmtTime(a.scheduled_end):"—");
  document.getElementById("detailActivityName").textContent=a.activity||"Activity";
  document.getElementById("detailProjectName").textContent=(a.project_name||selectedProjectName(a.project_id)||"")+(a.project_id?" • "+a.project_id:"");
  document.getElementById("detailStatus").textContent=a.activity_status||"PLANNED";
  document.getElementById("detailPriority").textContent=a.priority||"NORMAL";
  document.getElementById("detailProject").textContent=a.project_name||selectedProjectName(a.project_id)||"—";
  document.getElementById("detailLocation").textContent=selectedProjectLocation(a.project_id)||"—";
  document.getElementById("detailDate").textContent=formatActivityDate(a.activity_date);
  document.getElementById("detailTime").textContent=time;
  document.getElementById("detailManpower").textContent=(a.manpower??0)+" personnel";
  document.getElementById("detailEquipment").textContent=equipmentText;
  document.getElementById("detailDescription").textContent=a.description||"No description provided.";
  document.getElementById("detailProgressText").textContent=progress+"%";
  document.getElementById("detailProgressFill").style.width=progress+"%";
  syncDetailProgressInputs(progress);
  document.getElementById("detailRemarks").textContent=a.completion_remarks||a.remarks||"No remarks recorded.";
  document.getElementById("detailCompletedAt").textContent=a.completed_at?"Completed at: "+new Date(a.completed_at).toLocaleString():"";
  document.getElementById("detailModal").style.display="flex";
}
function closeDetailModal(){
  state.detailActivityId=null;
  document.getElementById("detailModal").style.display="none";
}
function openModal(id){const a=state.activities.find(x=>x.activity_id===id);if(!a)return;state.editingActivityId=id;document.getElementById("modalActivityName").textContent=(a.project_name||"")+" — "+(a.activity||"");document.getElementById("modalStatus").value=a.activity_status||"PLANNED";document.getElementById("modalProgress").value=a.accomplishment??0;document.getElementById("modalRemarks").value=a.completion_remarks||"";document.getElementById("statusModal").style.display="flex";}
function closeModal(){state.editingActivityId=null;document.getElementById("statusModal").style.display="none";}
document.getElementById("modalStatus").addEventListener("change",()=>{const s=document.getElementById("modalStatus").value;if(s==="DONE")document.getElementById("modalProgress").value=100;if(s==="NOT DONE"||s==="CANCELLED")document.getElementById("modalProgress").value=0;});
async function saveStatus(){if(!state.editingActivityId)return;const activity=state.activities.find(x=>x.activity_id===state.editingActivityId);const status=document.getElementById("modalStatus").value,progress=Math.max(0,Math.min(100,Number(document.getElementById("modalProgress").value||0))),remarks=document.getElementById("modalRemarks").value.trim();if(status==="CANCELLED"){closeModal();if(activity?.approval_status==="PENDING"){await cancelActivityRequest(state.editingActivityId);return;}if(activity?.approval_status==="APPROVED"){await requestActivityCancellation(state.editingActivityId);return;}msg("err","This activity cannot be cancelled from its current status.");return;}const payload={activity_status:status,accomplishment:status==="DONE"?100:progress,completion_remarks:remarks||null,completed_at:status==="DONE"?new Date().toISOString():null};const btn=document.getElementById("saveStatus");btn.disabled=true;btn.textContent="SAVING...";try{const {error}=await supabaseClient.from("project_activities").update(payload).eq("activity_id",state.editingActivityId);if(error)throw error;msg("ok","Activity status updated successfully.");closeModal();await loadActivities();}catch(e){console.error(e);msg("err","Could not update activity status: "+e.message)}finally{btn.disabled=false;btn.textContent="SAVE STATUS";}}
document.addEventListener("DOMContentLoaded",()=>{init().catch(e=>{console.error(e);msg("err","Could not initialize schedule: "+e.message)})});
