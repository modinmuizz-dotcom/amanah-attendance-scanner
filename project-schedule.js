const SUPABASE_URL="https://bafmycjninxomufhkjvy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const state={projects:[],equipment:[],activities:[],assignments:[],selectedEquipment:new Set(),editingActivityId:null,calendarMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1)};

function esc(v){return v==null?"":String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function msg(kind,text){const ok=document.getElementById("ok"),err=document.getElementById("err");ok.style.display=kind==="ok"?"block":"none";err.style.display=kind==="err"?"block":"none";if(kind==="ok")ok.textContent=text;else err.textContent=text;window.scrollTo({top:0,behavior:"smooth"});}
function clearMsg(){document.getElementById("ok").style.display="none";document.getElementById("err").style.display="none";}
function today(){return new Date().toISOString().slice(0,10);}
function statusPill(s){const cls={"PLANNED":"planned","IN PROGRESS":"progress","DONE":"done","NOT DONE":"notdone","CANCELLED":"cancel"}[s]||"planned";return '<span class="pill '+cls+'">'+esc(s)+'</span>';}
function fmtTime(iso){if(!iso)return "—";const d=new Date(iso);return d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});}
function fmtDate(iso){if(!iso)return "—";const d=new Date(iso);return d.toLocaleDateString();}
function isoFromLocal(date,time){if(!date||!time)return null;return new Date(date+"T"+time).toISOString();}

async function init(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href="admin.html";return;}
  document.getElementById("activityDate").value=today();
  document.getElementById("clearForm").addEventListener("click",clearForm);
  document.getElementById("saveSchedule").addEventListener("click",saveSchedule);
  document.getElementById("equipmentSearch").addEventListener("input",renderEquipment);
  document.getElementById("allEquipment").addEventListener("click",()=>{state.equipment.forEach(e=>state.selectedEquipment.add(e.equipment_id));renderEquipment();});
  document.getElementById("clearEquipment").addEventListener("click",()=>{state.selectedEquipment.clear();renderEquipment();});
  ["fSearch","fDate","fStatus","fProject"].forEach(id=>document.getElementById(id).addEventListener("input",renderTables));
  document.getElementById("clearFilters").addEventListener("click",()=>{document.getElementById("fSearch").value="";document.getElementById("fDate").value="";document.getElementById("fStatus").value="";document.getElementById("fProject").value="";renderTables();});
  document.getElementById("closeModal").addEventListener("click",closeModal);
  document.getElementById("cancelModal").addEventListener("click",closeModal);
  document.getElementById("saveStatus").addEventListener("click",saveStatus);
  document.getElementById("calendarPrev").addEventListener("click",()=>changeCalendarMonth(-1));
  document.getElementById("calendarNext").addEventListener("click",()=>changeCalendarMonth(1));
  document.getElementById("calendarToday").addEventListener("click",()=>{state.calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendar();});
  await Promise.all([loadProjects(),loadEquipment(),loadActivities()]);
}
async function loadProjects(){
  const {data,error}=await supabaseClient.from("projects").select("project_id,project_name,location").order("project_name");
  if(error)throw error; state.projects=data||[];
  const opts='<option value="">SELECT PROJECT</option>'+state.projects.map(p=>'<option value="'+esc(p.project_id)+'">'+esc(p.project_name)+" — "+esc(p.location||p.project_id)+"</option>").join("");
  document.getElementById("project").innerHTML=opts;
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
  const {data:acts,error}=await supabaseClient.from("project_activities").select("activity_id,project_id,project_name,activity_date,activity,description,manpower,equipment,accomplishment,remarks,activity_status,scheduled_start,scheduled_end,priority,completed_at,completion_remarks").order("activity_date",{ascending:false}).order("scheduled_start",{ascending:false});
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
    const action='<button class="mini blue" data-update="'+esc(a.activity_id)+'">UPDATE</button>';
    return '<tr><td>'+esc(a.activity_date||"—")+'</td><td>'+esc(time)+'</td><td><strong>'+esc(a.project_name||selectedProjectName(a.project_id)||"")+'</strong></td><td><strong>'+esc(a.activity||"")+'</strong></td><td style="white-space:normal;max-width:240px">'+esc(a.description||"")+'</td><td class="equip-list-text">'+esc(eq.map(e=>e.equipment_name).join(", ")||a.equipment||"—")+'</td><td>'+esc(a.priority||"NORMAL")+'</td><td>'+statusPill(a.activity_status||"PLANNED")+'</td><td>'+esc(a.accomplishment??0)+'%</td><td><div class="row-actions">'+action+'</div></td></tr>';
  }).join(""):'<tr><td colspan="10" style="text-align:center;color:#94a3b8;padding:30px">No scheduled activities found.</td></tr>';

  const assignments=rows.flatMap(a=>equipmentFor(a.activity_id).map(e=>({a,e})));
  document.getElementById("equipmentTable").innerHTML=assignments.length?assignments.map(({a,e})=>'<tr><td>'+esc(a.activity_date||"—")+'</td><td>'+esc((a.scheduled_start?fmtTime(a.scheduled_start):"—")+" - "+(a.scheduled_end?fmtTime(a.scheduled_end):"—"))+'</td><td><strong>'+esc(e.equipment_name)+'</strong><br><small style="color:#64748b">'+esc(e.equipment_id)+" • "+esc(e.plate_number||"")+'</small></td><td>'+esc(a.project_name||selectedProjectName(a.project_id)||"")+'</td><td><strong>'+esc(a.activity||"")+'</strong></td><td>'+esc(a.priority||"NORMAL")+'</td><td>'+statusPill(a.activity_status||"PLANNED")+'</td></tr>').join(""):'<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:30px">No equipment schedules found.</td></tr>';

  document.querySelectorAll("[data-update]").forEach(btn=>btn.addEventListener("click",()=>openModal(btn.dataset.update)));
  renderCalendar();
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
    return (!q||text.includes(q))&&(!filterProject||a.project_id===filterProject)&&(!filterStatus||a.activity_status===filterStatus);
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
  document.querySelectorAll("[data-cal-update]").forEach(btn=>btn.addEventListener("click",()=>openModal(btn.dataset.calUpdate)));
}

async function saveSchedule(){
  clearMsg();
  const pid=document.getElementById("project").value,date=document.getElementById("activityDate").value,start=document.getElementById("startTime").value,end=document.getElementById("endTime").value,activity=document.getElementById("activity").value.trim(),description=document.getElementById("description").value.trim(),manpower=Number(document.getElementById("manpower").value||0),priority=document.getElementById("priority").value;
  if(!pid)return msg("err","Please select a project.");
  if(!date)return msg("err","Please select the activity date.");
  if(!activity)return msg("err","Please enter the activity.");
  if(!state.selectedEquipment.size)return msg("err","Please select the equipment required on site.");
  const ss=isoFromLocal(date,start),se=isoFromLocal(date,end);
  if(ss&&se&&new Date(se)<new Date(ss))return msg("err","End time cannot be earlier than start time.");
  const p=state.projects.find(x=>x.project_id===pid);
  const btn=document.getElementById("saveSchedule");btn.disabled=true;btn.textContent="SAVING...";
  try{
    const {data,error:insertError}=await supabaseClient.from("project_activities").insert({project_id:pid,project_name:p?.project_name||null,activity_date:date,activity,description:description||null,manpower,equipment:state.equipment.filter(e=>state.selectedEquipment.has(e.equipment_id)).map(e=>e.equipment_name).join(", "),accomplishment:0,remarks:null,activity_status:"PLANNED",scheduled_start:ss,scheduled_end:se,priority,completed_at:null,completion_remarks:null}).select("activity_id").single();
    if(insertError)throw insertError;
    const rel=Array.from(state.selectedEquipment).map(equipment_id=>({activity_id:data.activity_id,equipment_id}));
    const {error}=await supabaseClient.from("project_activity_equipment").insert(rel);if(error)throw error;
    msg("ok","Activity scheduled successfully. The selected equipment is now reserved on the equipment schedule.");
    clearForm();await loadActivities();
  }catch(e){console.error(e);msg("err","Could not save schedule: "+e.message)}finally{btn.disabled=false;btn.textContent="SAVE SCHEDULE";}
}
function clearForm(){document.getElementById("activityDate").value=today();document.getElementById("startTime").value="";document.getElementById("endTime").value="";document.getElementById("activity").value="";document.getElementById("description").value="";document.getElementById("manpower").value="0";document.getElementById("priority").value="NORMAL";state.selectedEquipment.clear();renderEquipment();}
function openModal(id){const a=state.activities.find(x=>x.activity_id===id);if(!a)return;state.editingActivityId=id;document.getElementById("modalActivityName").textContent=(a.project_name||"")+" — "+(a.activity||"");document.getElementById("modalStatus").value=a.activity_status||"PLANNED";document.getElementById("modalProgress").value=a.accomplishment??0;document.getElementById("modalRemarks").value=a.completion_remarks||"";document.getElementById("statusModal").style.display="flex";}
function closeModal(){state.editingActivityId=null;document.getElementById("statusModal").style.display="none";}
document.getElementById("modalStatus").addEventListener("change",()=>{const s=document.getElementById("modalStatus").value;if(s==="DONE")document.getElementById("modalProgress").value=100;if(s==="NOT DONE"||s==="CANCELLED")document.getElementById("modalProgress").value=0;});
async function saveStatus(){if(!state.editingActivityId)return;const status=document.getElementById("modalStatus").value,progress=Math.max(0,Math.min(100,Number(document.getElementById("modalProgress").value||0))),remarks=document.getElementById("modalRemarks").value.trim();const payload={activity_status:status,accomplishment:status==="DONE"?100:progress,completion_remarks:remarks||null,completed_at:status==="DONE"?new Date().toISOString():null};const btn=document.getElementById("saveStatus");btn.disabled=true;btn.textContent="SAVING...";try{const {error}=await supabaseClient.from("project_activities").update(payload).eq("activity_id",state.editingActivityId);if(error)throw error;msg("ok","Activity status updated successfully.");closeModal();await loadActivities();}catch(e){console.error(e);msg("err","Could not update activity status: "+e.message)}finally{btn.disabled=false;btn.textContent="SAVE STATUS";}}
document.addEventListener("DOMContentLoaded",()=>{init().catch(e=>{console.error(e);msg("err","Could not initialize schedule: "+e.message)})});
