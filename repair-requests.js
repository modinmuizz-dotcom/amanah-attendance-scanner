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

  const [items,photos,costs]=await Promise.all([
    supabaseClient.from("repair_request_items").select("*").eq("repair_request_id",id).order("display_order"),
    supabaseClient.from("repair_request_photos").select("*").eq("repair_request_id",id).order("uploaded_at",{ascending:false}),
    supabaseClient.from("repair_request_costs").select("*").eq("repair_request_id",id).order("created_at",{ascending:true})
  ]);

  if(items.error)throw items.error;
  if(photos.error)throw photos.error;
  if(costs.error)throw costs.error;

  state.selectedRequest={
    request:r.data,
    items:items.data||[],
    photos:photos.data||[],
    costs:costs.data||[]
  };

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
      <div class="toolbar">
        <div>
          <h2 style="font-size:15px">REPAIR COST</h2>
          <p class="subtitle">Actual labor, parts/materials, and other repair costs.</p>
        </div>
      </div>
      <div id="repairCostContent" style="margin-top:10px"></div>
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

  renderRepairCosts();

  const repairBox=document.createElement("section");
  repairBox.className="card";
  repairBox.style.marginTop="16px";
  repairBox.style.padding="14px";

  if(r.data.status==="IN PROGRESS"){
    repairBox.innerHTML=`
      <div class="toolbar">
        <div>
          <h2 style="font-size:15px">REPAIR EXECUTION & PHOTO EVIDENCE</h2>
          <p class="subtitle">Record who is repairing the equipment and attach BEFORE / DURING / AFTER evidence.</p>
        </div>
      </div>
      <div class="detail-grid" style="margin-top:12px">
        <div class="field">
          <label>Repaired By</label>
          <input class="input" id="repairByInput" value="${escapeHtml(r.data.repaired_by||"")}" placeholder="Name of mechanic / repair team">
        </div>
        <div class="field">
          <label>Photo Category</label>
          <select class="select" id="repairPhotoCategory">
            <option>REPAIR BEFORE</option>
            <option>REPAIR DURING</option>
            <option>REPAIR AFTER</option>
          </select>
        </div>
      </div>
      <div class="upload-row" style="margin-top:12px">
        <div class="field" style="grid-column:1/-1">
          <label>Add Repair Photo</label>
          <input class="input" type="file" id="repairPhotoInput" accept="image/*" multiple capture="environment">
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-gray" type="button" id="saveRepairDetails">SAVE REPAIR DETAILS</button>
        <button class="btn btn-blue" type="button" id="uploadRepairPhotos">UPLOAD REPAIR PHOTOS</button>
      </div>
      <div style="margin-top:10px;color:#64748b;font-size:11px">
        REPAIR BEFORE: ${state.selectedRequest.photos.filter(x=>x.photo_category==="REPAIR BEFORE").length}
        &nbsp; | &nbsp;
        REPAIR DURING: ${state.selectedRequest.photos.filter(x=>x.photo_category==="REPAIR DURING").length}
        &nbsp; | &nbsp;
        REPAIR AFTER: ${state.selectedRequest.photos.filter(x=>x.photo_category==="REPAIR AFTER").length}
      </div>`;
  }else{
    repairBox.innerHTML=`
      <div class="toolbar">
        <div>
          <h2 style="font-size:15px">REPAIR EXECUTION</h2>
          <p class="subtitle">Repair execution details and photographic evidence.</p>
        </div>
      </div>
      <div class="detail-grid" style="margin-top:12px">
        <div class="detail-box"><h3>Repaired By</h3><div class="detail-text">${escapeHtml(r.data.repaired_by||"Not recorded")}</div></div>
        <div class="detail-box"><h3>Repair Started</h3><div class="detail-text">${escapeHtml(r.data.repair_date_started||"Not started")}</div></div>
        <div class="detail-box"><h3>Repair Completed</h3><div class="detail-text">${escapeHtml(r.data.repair_date_completed||"Not completed")}</div></div>
        <div class="detail-box"><h3>After Photo Count</h3><div class="detail-text">${state.selectedRequest.photos.filter(x=>x.photo_category==="REPAIR AFTER").length}</div></div>
      </div>`;
  }

  detail.querySelector("#detailActions").parentElement.before(repairBox);

  wireRepairExecutionHandlers(r.data, state.selectedRequest.photos);

  renderDetailActions();
  $("detailModal").classList.add("open");
}

function renderRepairCosts(){
  const box=$("repairCostContent");
  if(!box)return;

  const costs=state.selectedRequest.costs||[];
  const total=costs.reduce((s,x)=>s+Number(x.amount||0),0);
  const labor=costs.filter(x=>x.cost_type==="LABOR").reduce((s,x)=>s+Number(x.amount||0),0);
  const material=costs.filter(x=>x.cost_type==="MATERIAL").reduce((s,x)=>s+Number(x.amount||0),0);
  const other=costs.filter(x=>x.cost_type==="OTHER").reduce((s,x)=>s+Number(x.amount||0),0);

  let html=
    '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px">'+
      '<div class="detail-box"><h3>Total Repair Cost</h3><div class="detail-text"><strong>'+money(total)+'</strong></div></div>'+
      '<div class="detail-box"><h3>Labor</h3><div class="detail-text">'+money(labor)+'</div></div>'+
      '<div class="detail-box"><h3>Materials</h3><div class="detail-text">'+money(material)+'</div></div>'+
      '<div class="detail-box"><h3>Other</h3><div class="detail-text">'+money(other)+'</div></div>'+
    '</div>';

  if(costs.length){
    html += '<div style="overflow:auto"><table style="width:100%;min-width:760px;border-collapse:collapse">'+
      '<thead><tr><th style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:left">TYPE</th><th style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:left">DESCRIPTION</th><th style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:left">QTY</th><th style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:left">UNIT</th><th style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:left">UNIT COST</th><th style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:left">AMOUNT</th><th style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:left"></th></tr></thead>'+
      '<tbody>'+
      costs.map(x=>
        '<tr>'+
          '<td style="padding:8px;border-bottom:1px solid #f1f5f9">'+escapeHtml(x.cost_type)+'</td>'+
          '<td style="padding:8px;border-bottom:1px solid #f1f5f9">'+escapeHtml(x.description)+'</td>'+
          '<td style="padding:8px;border-bottom:1px solid #f1f5f9">'+escapeHtml(x.quantity)+'</td>'+
          '<td style="padding:8px;border-bottom:1px solid #f1f5f9">'+escapeHtml(x.unit||"")+'</td>'+
          '<td style="padding:8px;border-bottom:1px solid #f1f5f9">'+money(x.unit_cost)+'</td>'+
          '<td style="padding:8px;border-bottom:1px solid #f1f5f9;font-weight:800">'+money(x.amount)+'</td>'+
          '<td style="padding:8px;border-bottom:1px solid #f1f5f9">'+
            (state.selectedRequest.request.status==="IN PROGRESS"
              ? '<button class="btn btn-danger" type="button" data-delete-repair-cost="'+escapeHtml(x.repair_cost_id)+'">DELETE</button>'
              : '')+
          '</td>'+
        '</tr>'
      ).join("")+
      '</tbody></table></div>';
  }else{
    html += '<div class="empty">No actual repair costs recorded yet.</div>';
  }

  if(state.selectedRequest.request.status==="IN PROGRESS"){
    html +=
      '<div style="margin-top:14px;padding-top:14px;border-top:1px solid #e5e7eb">'+
        '<div class="detail-grid">'+
          '<div class="field"><label>Cost Type</label><select class="select" id="repairCostType"><option>LABOR</option><option>MATERIAL</option><option>OTHER</option></select></div>'+
          '<div class="field"><label>Description</label><input class="input" id="repairCostDescription" placeholder="Example: Hydraulic Hose"></div>'+
          '<div class="field"><label>Quantity</label><input class="input" id="repairCostQty" type="number" min="0" step="0.001" value="1"></div>'+
          '<div class="field"><label>Unit</label><input class="input" id="repairCostUnit" placeholder="pcs / hour / set"></div>'+
          '<div class="field"><label>Unit Cost</label><input class="input" id="repairCostUnitCost" type="number" min="0" step="0.01" value="0"></div>'+
          '<div class="field"><label>Total Amount</label><input class="input" id="repairCostAmount" readonly value="0.00"></div>'+
          '<div class="field full"><label>Reference / OR No.</label><input class="input" id="repairCostReference" placeholder="Optional"></div>'+
          '<div class="field full"><label>Notes</label><textarea class="textarea" id="repairCostNotes" placeholder="Optional"></textarea></div>'+
        '</div>'+
        '<div class="actions" style="margin-top:12px"><button class="btn btn-green" type="button" id="saveRepairCost">SAVE REPAIR COST</button></div>'+
      '</div>';
  }

  box.innerHTML=html;

  const qty=$("repairCostQty");
  const unitCost=$("repairCostUnitCost");
  const amount=$("repairCostAmount");
  const recalc=()=>{
    if(!qty||!unitCost||!amount)return;
    amount.value=(Number(qty.value||0)*Number(unitCost.value||0)).toFixed(2);
  };
  qty?.addEventListener("input",recalc);
  unitCost?.addEventListener("input",recalc);

  $("saveRepairCost")?.addEventListener("click",async()=>{
    try{
      await saveRepairCost();
    }catch(e){
      showMessage(e.message||"Unable to save repair cost.","error");
    }
  });

  box.querySelectorAll("[data-delete-repair-cost]").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      try{
        await deleteRepairCost(btn.dataset.deleteRepairCost);
      }catch(e){
        showMessage(e.message||"Unable to delete repair cost.","error");
      }
    });
  });
}

async function saveRepairCost(){
  const request=state.selectedRequest.request;
  if(request.status!=="IN PROGRESS")throw new Error("Repair costs can only be added while the repair is IN PROGRESS.");

  const costType=$("repairCostType").value;
  const description=$("repairCostDescription").value.trim();
  const quantity=Number($("repairCostQty").value||0);
  const unit=$("repairCostUnit").value.trim()||null;
  const unitCost=Number($("repairCostUnitCost").value||0);
  const referenceNo=$("repairCostReference").value.trim()||null;
  const notes=$("repairCostNotes").value.trim()||null;

  if(!description)throw new Error("Enter a repair cost description.");
  if(quantity<0||unitCost<0)throw new Error("Quantity and unit cost cannot be negative.");

  const {error}=await supabaseClient.from("repair_request_costs").insert({
    repair_request_id:request.repair_request_id,
    cost_type:costType,
    description,
    quantity,
    unit,
    unit_cost:unitCost,
    reference_no:referenceNo,
    notes,
    created_by:state.userId
  });
  if(error)throw error;

  await openDetail(request.repair_request_id);
  showMessage("Repair cost saved successfully and synchronized to Project Cost.","success");
}

async function deleteRepairCost(id){
  if(!id) return;
  const request=state.selectedRequest.request;
  if(request.status!=="IN PROGRESS")return;

  if(!confirm("Delete this repair cost entry?"))return;

  const {error}=await supabaseClient.from("repair_request_costs")
    .delete()
    .eq("repair_cost_id",id)
    .eq("repair_request_id",request.repair_request_id);

  if(error)throw error;

  await openDetail(request.repair_request_id);
  showMessage("Repair cost deleted successfully.","success");
}

async function uploadRepairPhotos(request){
  const input=document.getElementById("repairPhotoInput");
  const category=document.getElementById("repairPhotoCategory")?.value;
  if(!input || !input.files.length) throw new Error("Please choose at least one repair photo.");
  if(!category) throw new Error("Please select a repair photo category.");

  for(const file of [...input.files]){
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=request.repair_request_id+"/"+crypto.randomUUID()+"-"+safe;

    const upload=await supabaseClient.storage
      .from("repair-evidence")
      .upload(path,file,{upsert:false,contentType:file.type||"image/jpeg"});

    if(upload.error) throw upload.error;

    const row=await supabaseClient.from("repair_request_photos").insert({
      repair_request_id:request.repair_request_id,
      photo_category:category,
      file_path:path,
      file_name:file.name,
      caption:null,
      uploaded_by:state.userId
    });

    if(row.error) throw row.error;
  }

  await openDetail(request.repair_request_id);
  showMessage("Repair photo evidence uploaded successfully.","success");
}

async function saveRepairDetails(request){
  const repairedBy=document.getElementById("repairByInput")?.value.trim()||null;

  const r=await supabaseClient
    .from("repair_requests")
    .update({repaired_by:repairedBy})
    .eq("repair_request_id",request.repair_request_id);

  if(r.error) throw r.error;

  await openDetail(request.repair_request_id);
  showMessage("Repair details saved successfully.","success");
}

function wireRepairExecutionHandlers(request,photos){
  const save=document.getElementById("saveRepairDetails");
  if(save){
    save.addEventListener("click",async()=>{
      try{
        await saveRepairDetails(request);
      }catch(e){
        showMessage(e.message||"Unable to save repair details.","error");
      }
    });
  }

  const upload=document.getElementById("uploadRepairPhotos");
  if(upload){
    upload.addEventListener("click",async()=>{
      try{
        await uploadRepairPhotos(request);
      }catch(e){
        showMessage(e.message||"Unable to upload repair photos.","error");
      }
    });
  }
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
    const hasRepairedBy = !!String(r.repaired_by || "").trim();
    const hasAfterPhoto = state.selectedRequest.photos.some(x => x.photo_category === "REPAIR AFTER");
    const canComplete = hasRepairedBy && hasAfterPhoto;

    html += '<button class="btn btn-green" id="completeRepairButton" ' +
      (canComplete ? "" : "disabled") +
      '>MARK COMPLETED</button>';

    if(!canComplete){
      const missing = [];
      if(!hasRepairedBy) missing.push("Repaired By");
      if(!hasAfterPhoto) missing.push("REPAIR AFTER photo");
      html += '<div style="width:100%;margin-top:8px;color:#64748b;font-size:11px;font-weight:800">' +
        'Completion locked until: ' + escapeHtml(missing.join(" and ")) +
        '</div>';
    }
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
      const repairedBy=(state.selectedRequest.request.repaired_by||"").trim();
      const afterPhotos=state.selectedRequest.photos.filter(x=>x.photo_category==="REPAIR AFTER").length;

      if(!repairedBy){
        showMessage("Please record Repaired By before completing the repair.","error");
        return;
      }

      if(afterPhotos===0){
        showMessage("A REPAIR AFTER photo is required before the repair can be marked COMPLETED.","error");
        return;
      }

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

    const requestedId=new URLSearchParams(location.search).get("id");
    if(requestedId){
      await openDetail(requestedId);
    }
  }catch(e){
    console.error(e);
    showMessage(e.message||"Unable to load Repair Requests.","error");
  }
})();
