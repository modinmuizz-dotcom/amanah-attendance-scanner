/* =========================================================
   AMANAH REPAIR REQUESTS + PHOTO EVIDENCE
   ========================================================= */

const SUPABASE_URL =
  "https://bafmycjninxomufhkjvy.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

const state = {
  userId: null,
  equipment: [],
  projects: [],
  requests: [],
  selectedRequest: null,
  selectedFiles: []
};

function $(id){ return document.getElementById(id); }

function escapeHtml(v){
  if(v===null||v===undefined)return "";
  return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function money(v){
  return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));
}

function localDate(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

function showMessage(msg,type="info"){
  const b=$("message");
  b.textContent=msg;
  b.className="message "+type;
  b.style.display="block";
  window.scrollTo({top:0,behavior:"smooth"});
}

function statusPill(status){
  const map={"PENDING REVIEW":"review","PENDING APPROVAL":"approval"};
  const key=map[status]||String(status||"DRAFT").toLowerCase().replaceAll(" ","-");
  return '<span class="pill '+escapeHtml(key)+'">'+escapeHtml(status)+'</span>';
}

async function requireSession(){
  const r=await supabaseClient.auth.getSession();
  if(r.error)throw r.error;
  if(!r.data?.session){location.href="index.html";return false;}
  return true;
}

async function logout(){
  await supabaseClient.auth.signOut();
  location.href="index.html";
}

async function loadMasterData(){
  const [e,p]=await Promise.all([
    supabaseClient.from("equipment").select("equipment_id,equipment_name,equipment_type,plate_number,status").eq("status","ACTIVE").order("equipment_name"),
    supabaseClient.from("projects").select("project_id,project_name,status").order("project_name")
  ]);
  if(e.error)throw e.error;
  if(p.error)throw p.error;
  state.equipment=e.data||[];
  state.projects=p.data||[];
  fillSelectors();
}

function fillSelectors(){
  const eqs=[$("equipmentFilter"),$("equipmentId")];
  eqs.forEach((s,i)=>{
    s.innerHTML="";
    if(i===0){
      const o=document.createElement("option");o.value="";o.textContent="ALL EQUIPMENT";s.appendChild(o);
    }
    state.equipment.forEach(x=>{
      const o=document.createElement("option");o.value=x.equipment_id;o.textContent=x.equipment_name+" — "+x.equipment_id;s.appendChild(o);
    });
  });
  const p1=$("projectFilter"),p2=$("projectId");
  p1.innerHTML='<option value="">ALL PROJECTS</option>';
  p2.innerHTML='<option value="">No project</option>';
  state.projects.forEach(x=>{
    const a=document.createElement("option");a.value=x.project_id;a.textContent=x.project_name+" — "+x.project_id;p1.appendChild(a);
    const b=document.createElement("option");b.value=x.project_id;b.textContent=x.project_name+" — "+x.project_id;p2.appendChild(b);
  });
}

async function loadRequests(){
  const r=await supabaseClient.from("repair_request_summary").select("*").order("request_date",{ascending:false}).order("created_at",{ascending:false});
  if(r.error)throw r.error;
  state.requests=r.data||[];
  renderRequests();
}

function filteredRequests(){
  const s=$("statusFilter").value,e=$("equipmentFilter").value,p=$("projectFilter").value;
  return state.requests.filter(x=>(!s||x.status===s)&&(!e||x.equipment_id===e)&&(!p||x.project_id===p));
}

function renderRequests(){
  const rows=filteredRequests();
  const body=$("requestBody");
  if(!rows.length){body.innerHTML='<tr><td colspan="8" class="empty">No repair requests found.</td></tr>';return;}
  body.innerHTML=rows.map(x=>`
    <tr>
      <td><strong>${escapeHtml(x.repair_form_no)}</strong></td>
      <td>${escapeHtml(x.request_date||"")}</td>
      <td>${escapeHtml(x.equipment_name||x.equipment_id)}</td>
      <td>${escapeHtml(x.project_name||"—")}</td>
      <td>${escapeHtml(x.reported_by)}</td>
      <td>${Number(x.photo_count||0)} photo(s)</td>
      <td>${statusPill(x.status)}</td>
      <td><button class="btn btn-blue" type="button" onclick="openDetail('${x.repair_request_id}')">VIEW</button></td>
    </tr>
  `).join("");
}

function resetItems(){
  $("items").innerHTML="";
  addItemRow();
}

function addItemRow(values={}){
  const row=document.createElement("div");
  row.className="item-row";
  row.innerHTML=`
    <input class="input work" placeholder="Works to be done" value="${escapeHtml(values.work_to_be_done||"")}">
    <input class="input material" placeholder="Materials / spare parts" value="${escapeHtml(values.material_or_spare_part||"")}">
    <input class="input qty" type="number" min="0" step="0.001" placeholder="Qty" value="${escapeHtml(values.quantity??"")}">
    <input class="input unit" placeholder="Unit" value="${escapeHtml(values.unit||"")}">
  `;
  $("items").appendChild(row);
}

function getItems(){
  return [...document.querySelectorAll(".item-row")].map(row=>({
    work_to_be_done:row.querySelector(".work").value.trim()||null,
    material_or_spare_part:row.querySelector(".material").value.trim()||null,
    quantity:row.querySelector(".qty").value===""?null:Number(row.querySelector(".qty").value),
    unit:row.querySelector(".unit").value.trim()||null
  })).filter(x=>x.work_to_be_done||x.material_or_spare_part);
}

function renderSelectedFiles(){
  const names=state.selectedFiles.map((f,i)=> (i+1)+". "+f.name+" ("+Math.round(f.size/1024)+" KB)").join("\n");
  $("selectedPhotos").textContent=names?names:"No photos selected yet.";
}

function openNewRequest(){
  $("requestForm").reset();
  $("requestDate").value=localDate();
  $("items").innerHTML="";
  addItemRow();
  state.selectedFiles=[];
  renderSelectedFiles();
  $("requestModal").classList.add("open");
}

function closeRequestModal(){
  $("requestModal").classList.remove("open");
}

async function createRequest(){
  const eq=$("equipmentId").value;
  const proj=$("projectId").value||null;
  const date=$("requestDate").value;
  const reported=$("reportedBy").value.trim();
  const body=$("bodyPlateNo").value.trim();
  const problems=$("problems").value.trim();
  const pm=$("pmInspectionId").value.trim()||null;
  const remarks=$("remarks").value.trim()||null;

  if(!eq||!date||!reported||!problems)throw new Error("Equipment, date, reported by, and problems encountered are required.");

  const eqRow=state.equipment.find(x=>x.equipment_id===eq);
  const finalBody=body||(eqRow?.plate_number||null);

  const r=await supabaseClient.from("repair_requests").insert({
    request_date:date,
    equipment_id:eq,
    project_id:proj,
    pm_inspection_ref:pm,
    reported_by:reported,
    body_plate_no:finalBody,
    problems_encountered:problems,
    remarks
  }).select("repair_request_id,repair_form_no").single();

  if(r.error)throw r.error;

  const requestId=r.data.repair_request_id;

  const items=getItems();
  if(items.length){
    const itemsPayload=items.map((x,i)=>({...x,repair_request_id:requestId,display_order:i}));
    const ir=await supabaseClient.from("repair_request_items").insert(itemsPayload);
    if(ir.error)throw ir.error;
  }

  await uploadPhotos(requestId);

  closeRequestModal();
  showMessage("Repair request "+r.data.repair_form_no+" saved as DRAFT.","success");
  await loadRequests();
}

async function uploadPhotos(requestId){
  const files=state.selectedFiles;
  if(!files.length)return;

  const category=$("photoCategory").value;

  for(const file of files){
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=requestId+"/"+crypto.randomUUID()+"-"+safe;

    const upload=await supabaseClient.storage.from("repair-evidence").upload(path,file,{upsert:false,contentType:file.type||"image/jpeg"});
    if(upload.error)throw upload.error;

    const row=await supabaseClient.from("repair_request_photos").insert({
      repair_request_id:requestId,
      photo_category:category,
      file_path:path,
      file_name:file.name,
      caption:null,
      uploaded_by:state.userId
    });
    if(row.error)throw row.error;
  }
}

async function openDetail(id){
  const r=await supabaseClient.from("repair_requests").select("*").eq("repair_request_id",id).single();
  if(r.error){showMessage(r.error.message,"error");return;}

  const [items,photos]=await Promise.all([
    supabaseClient.from("repair_request_items").select("*").eq("repair_request_id",id).order("display_order"),
    supabaseClient.from("repair_request_photos").select("*").eq("repair_request_id",id).order("uploaded_at",{ascending:false})
  ]);

  if(items.error)throw items.error;
  if(photos.error)throw photos.error;

  state.selectedRequest={request:r.data,items:items.data||[],photos:photos.data||[]};

  const eq=state.equipment.find(x=>x.equipment_id===r.data.equipment_id);
  const project=state.projects.find(x=>x.project_id===r.data.project_id);

  const detail=$("detailContent");
  detail.innerHTML=`
    <div class="detail-grid">
      <div class="detail-box"><h3>Repair Form</h3><div class="detail-text"><strong>${escapeHtml(r.data.repair_form_no)}</strong>\nDate: ${escapeHtml(r.data.request_date)}</div></div>
      <div class="detail-box"><h3>Status</h3>${statusPill(r.data.status)}<div class="workflow"><span class="step ${["PENDING REVIEW","PENDING APPROVAL","APPROVED","IN PROGRESS","COMPLETED","CLOSED"].includes(r.data.status)?"active":""}">REVIEW</span><span class="step ${["PENDING APPROVAL","APPROVED","IN PROGRESS","COMPLETED","CLOSED"].includes(r.data.status)?"active":""}">APPROVAL</span><span class="step ${["IN PROGRESS","COMPLETED","CLOSED"].includes(r.data.status)?"active":""}">REPAIR</span><span class="step ${["COMPLETED","CLOSED"].includes(r.data.status)?"active":""}">COMPLETE</span></div></div>
      <div class="detail-box"><h3>Equipment</h3><div class="detail-text"><strong>${escapeHtml(eq?.equipment_name||r.data.equipment_id)}</strong>\nPlate: ${escapeHtml(r.data.body_plate_no||eq?.plate_number||"—")}</div></div>
      <div class="detail-box"><h3>Project</h3><div class="detail-text">${escapeHtml(project?.project_name||r.data.project_id||"No project assigned")}</div></div>
      <div class="detail-box" style="grid-column:1/-1"><h3>Problems Encountered (Sira)</h3><div class="detail-text">${escapeHtml(r.data.problems_encountered)}</div></div>
      <div class="detail-box">
        <h3>Reviewer Evidence Check</h3>
        ${r.data.status === "PENDING REVIEW"
          ? '<div class="check-row"><input type="checkbox" id="reviewEvidence"> <label for="reviewEvidence">Photo evidence reviewed</label></div>'
          : '<div style="font-weight:800;color:#64748b">' +
            (r.data.reviewer_evidence_reviewed ? "✓ Evidence reviewed" : "Not yet required") +
            '</div>'}
        <div style="margin-top:8px;color:#64748b;font-size:11px">${r.data.reviewed_at
          ? "Reviewed at " + escapeHtml(r.data.reviewed_at)
          : "Reviewer check is required at Pending Review."}</div>
      </div>
      <div class="detail-box">
        <h3>Approver Evidence Check</h3>
        ${r.data.status === "PENDING APPROVAL"
          ? '<div class="check-row"><input type="checkbox" id="approveEvidence"> <label for="approveEvidence">Photo evidence reviewed</label></div>'
          : '<div style="font-weight:800;color:#64748b">' +
            (r.data.approver_evidence_reviewed ? "✓ Evidence reviewed" : "Not yet required") +
            '</div>'}
        <div style="margin-top:8px;color:#64748b;font-size:11px">${r.data.approved_at
          ? "Approved at " + escapeHtml(r.data.approved_at)
          : "Approver check is required at Pending Approval."}</div>
      </div>
    </div>

    <section class="card" style="margin-top:16px;padding:14px">
      <div class="toolbar"><div><h2 style="font-size:15px">PHOTO EVIDENCE</h2><p class="subtitle">Reviewer and Approver must review the evidence before forwarding or approving.</p></div></div>
      <div id="photoGrid" class="photo-grid"></div>
    </section>

    <section class="card" style="margin-top:16px;padding:14px">
      <div class="toolbar"><div><h2 style="font-size:15px">WORKS / MATERIALS</h2></div></div>
      <div id="itemList" style="margin-top:8px"></div>
    </section>

    <section class="card" style="margin-top:16px;padding:14px">
      <div class="toolbar"><div><h2 style="font-size:15px">REPAIR STATUS</h2></div></div>
      <div class="actions" id="detailActions"></div>
    </section>
  `;

  const pg=$("photoGrid");
  if(!state.selectedRequest.photos.length){
    pg.innerHTML='<div class="empty" style="grid-column:1/-1">No photo evidence attached.</div>';
  }else{
    pg.innerHTML="";
    for(const ph of state.selectedRequest.photos){
      const signed=await supabaseClient.storage.from("repair-evidence").createSignedUrl(ph.file_path,600);
      const card=document.createElement("div");card.className="photo-card";
      const src=signed.data?.signedUrl||"";
      card.innerHTML='<img src="'+escapeHtml(src)+'" alt="'+escapeHtml(ph.file_name)+'"><div class="photo-meta"><strong>'+escapeHtml(ph.photo_category)+'</strong><small>'+escapeHtml(ph.file_name)+'</small></div>';
      pg.appendChild(card);
    }
  }

  const il=$("itemList");
  il.innerHTML=state.selectedRequest.items.length
    ? state.selectedRequest.items.map(x=>'<div style="padding:8px 0;border-bottom:1px solid #e5e7eb"><strong>'+escapeHtml(x.work_to_be_done||"")+'</strong> — '+escapeHtml(x.material_or_spare_part||"")+' '+escapeHtml(x.quantity??"")+' '+escapeHtml(x.unit||"")+'</div>').join("")
    : '<div class="empty">No work/material lines yet.</div>';

  renderDetailActions();
  $("detailModal").classList.add("open");
}

function renderDetailActions(){
  const r=state.selectedRequest.request;
  const actions=$("detailActions");
  const photoCount=state.selectedRequest.photos.length;

  let html="";

  if(r.status==="DRAFT"){
    html += '<button class="btn btn-blue" id="submitReviewButton">SUBMIT FOR REVIEW</button>';
  }

  if(r.status==="PENDING REVIEW"){
    html += '<button class="btn btn-green" id="reviewAndForward">REVIEW & FORWARD</button>';
  }

  if(r.status==="PENDING APPROVAL"){
    html += '<button class="btn btn-green" id="approveRequest">APPROVE REPAIR</button>';
    html += '<button class="btn btn-gray" id="returnRequest">RETURN</button>';
  }

  if(r.status==="APPROVED"){
    html += '<button class="btn btn-primary" id="startRepairButton">START REPAIR</button>';
  }

  if(r.status==="IN PROGRESS"){
    html += '<button class="btn btn-green" id="completeRepairButton">MARK COMPLETED</button>';
  }

  if(r.status==="COMPLETED"){
    html += '<button class="btn btn-primary" id="closeRepairButton">CLOSE REPAIR</button>';
  }

  if(!html){
    html='<span style="color:#64748b">No action available for this status.</span>';
  }

  actions.innerHTML=html;

  const submit=document.getElementById("submitReviewButton");
  if(submit){
    submit.addEventListener("click",async()=>{
      await setStatus(r.repair_request_id,"PENDING REVIEW");
    });
  }

  const review=document.getElementById("reviewAndForward");
  if(review){
    review.addEventListener("click",async()=>{
      const checked=document.getElementById("reviewEvidence")?.checked || false;

      if(photoCount>0 && !checked){
        showMessage(
          "Reviewer must confirm that all photo evidence has been reviewed.",
          "error"
        );
        return;
      }

      await updateWorkflow(
        r.repair_request_id,
        "PENDING APPROVAL",
        {
          reviewer_evidence_reviewed: checked
        }
      );
    });
  }

  const approve=document.getElementById("approveRequest");
  if(approve){
    approve.addEventListener("click",async()=>{
      const checked=document.getElementById("approveEvidence")?.checked || false;

      if(photoCount>0 && !checked){
        showMessage(
          "Approver must confirm that all photo evidence has been reviewed.",
          "error"
        );
        return;
      }

      await updateWorkflow(
        r.repair_request_id,
        "APPROVED",
        {
          approver_evidence_reviewed: checked
        }
      );
    });
  }

  const returnButton=document.getElementById("returnRequest");
  if(returnButton){
    returnButton.addEventListener("click",async()=>{
      await setStatus(r.repair_request_id,"RETURNED");
    });
  }

  const startRepair=document.getElementById("startRepairButton");
  if(startRepair){
    startRepair.addEventListener("click",async()=>{
      await setStatus(r.repair_request_id,"IN PROGRESS");
    });
  }

  const completeRepair=document.getElementById("completeRepairButton");
  if(completeRepair){
    completeRepair.addEventListener("click",async()=>{
      await setStatus(r.repair_request_id,"COMPLETED");
    });
  }

  const closeRepair=document.getElementById("closeRepairButton");
  if(closeRepair){
    closeRepair.addEventListener("click",async()=>{
      await setStatus(r.repair_request_id,"CLOSED");
    });
  }
}

async function updateWorkflow(id,next,extra={}){
  const payload={status:next,...extra};

  if(next==="PENDING APPROVAL"){
    payload.reviewed_at=new Date().toISOString();
    payload.reviewed_by=state.userId;
  }
  if(next==="APPROVED"){
    payload.approved_at=new Date().toISOString();
    payload.approved_by=state.userId;
  }
  if(next==="IN PROGRESS")payload.repair_date_started=new Date().toISOString();
  if(next==="COMPLETED")payload.repair_date_completed=new Date().toISOString();
  if(next==="CLOSED")payload.received_at=new Date().toISOString();

  const r=await supabaseClient.from("repair_requests").update(payload).eq("repair_request_id",id);
  if(r.error){showMessage(r.error.message,"error");return;}

  showMessage("Repair request updated successfully.","success");
  $("detailModal").classList.remove("open");
  await loadRequests();
}

async function setStatus(id,status){
  await updateWorkflow(id,status);
}

$("logoutButton").addEventListener("click",logout);
$("newRequest").addEventListener("click",openNewRequest);
$("closeModal").addEventListener("click",closeRequestModal);
$("cancelRequest").addEventListener("click",closeRequestModal);
$("addItem").addEventListener("click",()=>addItemRow());
$("photoInput").addEventListener("change",e=>{state.selectedFiles=[...e.target.files];renderSelectedFiles();});
$("requestForm").addEventListener("submit",async e=>{e.preventDefault();try{await createRequest();}catch(err){console.error(err);showMessage(err.message||"Unable to create repair request.","error");}});
$("closeDetail").addEventListener("click",()=>$("detailModal").classList.remove("open"));
["statusFilter","equipmentFilter","projectFilter"].forEach(id=>$(id).addEventListener("change",renderRequests));

(async function(){
  try{
    if(!await requireSession())return;
    await loadMasterData();
    await loadRequests();
  }catch(e){
    console.error(e);
    showMessage(e.message||"Unable to load Repair Requests.","error");
  }
})();
