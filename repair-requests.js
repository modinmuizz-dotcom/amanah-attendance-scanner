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
  selectedFiles: [],
  repairExecutionFiles: [],
  deleteRequestId: null,
  editingRequestId: null,
  approvalConfirmRequestId: null
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
  body.innerHTML=rows.map(x=>
    '<tr>' +
      '<td><strong>'+escapeHtml(x.repair_form_no)+'</strong></td>' +
      '<td>'+escapeHtml(x.request_date||"")+'</td>' +
      '<td>'+escapeHtml(x.equipment_name||x.equipment_id)+'</td>' +
      '<td>'+escapeHtml(x.project_name||"—")+'</td>' +
      '<td>'+escapeHtml(x.reported_by)+'</td>' +
      '<td>'+Number(x.photo_count||0)+' photo(s)</td>' +
      '<td>'+statusPill(x.status)+'</td>' +
      '<td><div style="display:flex;flex-wrap:wrap;gap:7px">' +
        '<button class="btn btn-blue" type="button" data-repair-view="'+escapeHtml(x.repair_request_id)+'">VIEW</button>' +
        (String(x.status||"").toUpperCase()==="CLOSED" ? '<button class="btn btn-danger" type="button" data-repair-delete="'+escapeHtml(x.repair_request_id)+'">DELETE</button>' : '') +
      '</div></td>' +
    '</tr>'
  ).join("");

  body.querySelectorAll("[data-repair-view]").forEach(btn=>{
    btn.addEventListener("click",()=>openDetail(btn.dataset.repairView));
  });
  body.querySelectorAll("[data-repair-delete]").forEach(btn=>{
    btn.addEventListener("click",()=>openDeleteConfirm(btn.dataset.repairDelete));
  });
}

function openDeleteConfirm(requestId){
  const request=state.requests.find(x=>String(x.repair_request_id)===String(requestId));
  if(!request)return;
  if(String(request.status||"").toUpperCase()!=="CLOSED"){
    showMessage("Only CLOSED repair requests can be deleted.","error");
    return;
  }
  state.deleteRequestId=request.repair_request_id;
  const details=$("deleteConfirmDetails");
  if(details){
    details.innerHTML="<strong>"+escapeHtml(request.repair_form_no||"Repair Request")+"</strong>"+
      "<div style='margin-top:5px;color:#64748b;font-size:12px'>"+
      escapeHtml(request.equipment_name||request.equipment_id||"")+" • "+
      escapeHtml(request.project_name||"No project")+" • "+
      escapeHtml(request.request_date||"")+"</div>";
  }
  $("deleteConfirmModal").classList.add("open");
}

function closeDeleteConfirm(){
  state.deleteRequestId=null;
  $("deleteConfirmModal").classList.remove("open");
}

async function deleteRepairRequest(){
  const requestId=state.deleteRequestId;
  if(!requestId)return;

  const request=state.requests.find(x=>String(x.repair_request_id)===String(requestId));
  if(!request){
    closeDeleteConfirm();
    return;
  }

  const button=$("confirmDeleteButton");
  button.disabled=true;
  button.textContent="DELETING...";

  try{
    const photos=await supabaseClient
      .from("repair_request_photos")
      .select("file_path")
      .eq("repair_request_id",requestId);

    if(photos.error)throw photos.error;

    const paths=(photos.data||[]).map(x=>x.file_path).filter(Boolean);

    const {data,error}=await supabaseClient.rpc(
      "amanah_delete_repair_request",
      {p_repair_request_id:requestId}
    );

    if(error)throw error;

    if(paths.length){
      const storageDelete=await supabaseClient
        .storage
        .from("repair-evidence")
        .remove(paths);

      if(storageDelete.error){
        console.warn("Repair photo storage cleanup warning:",storageDelete.error);
      }
    }

    closeDeleteConfirm();
    await loadRequests();

    showMessage(
      (data?.repair_form_no||request.repair_form_no||"Repair Request")+
      " was deleted successfully.",
      "success"
    );
  }catch(error){
    console.error("Delete repair request failed:",error);
    showMessage(
      error.message||"Unable to delete the Repair Request.",
      "error"
    );
  }finally{
    button.disabled=false;
    button.textContent="DELETE REPAIR REQUEST";
  }
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
  const container=$("selectedPhotos");
  if(!container)return;

  const hint=$("photoCategoryHint");
  const activeCategory=$("photoCategory")?.value||"PM FINDING";
  if(hint)hint.textContent=activeCategory;

  if(!state.selectedFiles.length){
    container.innerHTML=
      '<div style="padding:14px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:12px;text-align:center">'+
      'No new photos added yet. Click <strong>+ ADD PHOTO</strong> to attach evidence.'+
      '</div>';
    return;
  }

  container.innerHTML=
    '<div style="font-size:12px;font-weight:900;color:#334155;margin-bottom:10px">'+
      state.selectedFiles.length+' new photo(s) ready to be saved'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px">'+
    state.selectedFiles.map((entry,index)=>{
      const file=entry.file;
      const url=URL.createObjectURL(file);
      return '<div style="border:1px solid #dbe2ea;border-radius:12px;overflow:hidden;background:#fff;position:relative">'+
        '<div style="height:125px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden">'+
          '<img src="'+url+'" alt="Photo preview" style="width:100%;height:100%;object-fit:cover">'+
        '</div>'+
        '<div style="padding:9px">'+
          '<div style="margin-top:4px;color:#64748b;font-size:10px">'+escapeHtml(entry.category)+'</div>'+
          '<button type="button" data-remove-photo="'+index+'" class="btn btn-gray" style="margin-top:8px;width:100%;min-height:32px">REMOVE</button>'+
        '</div>'+
      '</div>';
    }).join('')+
    '</div>';

  container.querySelectorAll("[data-remove-photo]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const index=Number(btn.dataset.removePhoto);
      state.selectedFiles.splice(index,1);
      renderSelectedFiles();
    });
  });
}

async function renderExistingPhotosForEdit(){
  const container=$("selectedPhotos");
  if(!container || !state.editingRequestId || !state.selectedRequest?.photos?.length)return;

  const photos=state.selectedRequest.photos||[];
  let section=document.getElementById("existingPhotoEvidence");
  if(section)section.remove();

  section=document.createElement("div");
  section.id="existingPhotoEvidence";
  section.style.marginTop="14px";
  section.innerHTML=
    '<div style="font-size:12px;font-weight:900;color:#334155;margin-bottom:10px">CURRENT PHOTO EVIDENCE</div>'+
    '<div id="existingPhotoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px">'+
      '<div style="padding:14px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;font-size:11px;grid-column:1/-1;text-align:center">Loading current photos…</div>'+
    '</div>';
  container.appendChild(section);

  const signed=await Promise.all(
    photos.map(photo=>supabaseClient.storage.from("repair-evidence").createSignedUrl(photo.file_path,600))
  );

  const grid=section.querySelector("#existingPhotoGrid");
  grid.innerHTML=photos.map((photo,index)=>{
    const src=signed[index]?.data?.signedUrl||"";
    return '<div style="border:1px solid #dbe2ea;border-radius:12px;overflow:hidden;background:#fff">'+
      '<div style="height:125px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden">'+
        (src
          ? '<img src="'+escapeHtml(src)+'" alt="Photo evidence" style="width:100%;height:100%;object-fit:cover">'
          : '<div style="color:#94a3b8;font-size:11px;font-weight:800">PHOTO UNAVAILABLE</div>')+
      '</div>'+
      '<div style="padding:9px">'+
        '<div style="color:#64748b;font-size:10px;font-weight:800">'+escapeHtml(photo.photo_category||"OTHER")+'</div>'+
        '<div style="display:flex;gap:6px;margin-top:8px">'+
          '<button type="button" class="btn btn-blue" style="flex:1;min-height:32px" data-replace-photo="'+escapeHtml(photo.photo_id)+'">REPLACE</button>'+
          '<button type="button" class="btn btn-danger" style="flex:1;min-height:32px" data-delete-photo="'+escapeHtml(photo.photo_id)+'">DELETE</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }).join("");

  grid.querySelectorAll("[data-replace-photo]").forEach(btn=>{
    btn.addEventListener("click",()=>replaceExistingPhoto(btn.dataset.replacePhoto));
  });
  grid.querySelectorAll("[data-delete-photo]").forEach(btn=>{
    btn.addEventListener("click",()=>deleteExistingPhoto(btn.dataset.deletePhoto));
  });
}

async function replaceExistingPhoto(photoId){
  const photo=(state.selectedRequest?.photos||[]).find(x=>String(x.photo_id)===String(photoId));
  if(!photo)return;

  const input=$("photoReplaceInput");
  if(!input)return;

  input.value="";
  input.dataset.replacePhotoId=photoId;
  input.onchange=async()=>{
    const file=input.files?.[0];
    input.value="";
    if(!file)return;
    if(!file.type.startsWith("image/")){
      showMessage("Please select an image file.","error");
      return;
    }

    try{
      const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const newPath=photo.repair_request_id+"/"+crypto.randomUUID()+"-"+safe;

      const upload=await supabaseClient.storage.from("repair-evidence").upload(
        newPath,file,{upsert:false,contentType:file.type||"image/jpeg"}
      );
      if(upload.error)throw upload.error;

      const inserted=await supabaseClient.from("repair_request_photos").insert({
        repair_request_id:photo.repair_request_id,
        pm_inspection_item_id:photo.pm_inspection_item_id||null,
        photo_category:photo.photo_category||"OTHER",
        file_path:newPath,
        file_name:file.name,
        caption:photo.caption||null,
        uploaded_by:state.userId
      }).select("*").single();

      if(inserted.error){
        await supabaseClient.storage.from("repair-evidence").remove([newPath]);
        throw inserted.error;
      }

      const deleted=await supabaseClient.from("repair_request_photos").delete().eq("photo_id",photo.photo_id);
      if(deleted.error)throw deleted.error;

      const storageDelete=await supabaseClient.storage.from("repair-evidence").remove([photo.file_path]);
      if(storageDelete.error){
        console.warn("Old repair photo cleanup warning:",storageDelete.error);
      }

      state.selectedRequest.photos=(state.selectedRequest.photos||[]).map(x=>String(x.photo_id)===String(photoId)?inserted.data:x);
      await renderExistingPhotosForEdit();
      showMessage("Photo evidence replaced successfully.","success");
    }catch(error){
      console.error("Replace repair photo failed:",error);
      showMessage(error.message||"Unable to replace the photo evidence.","error");
    }
  };

  input.click();
}

async function deleteExistingPhoto(photoId){
  const photo=(state.selectedRequest?.photos||[]).find(x=>String(x.photo_id)===String(photoId));
  if(!photo)return;

  if(!window.confirm("Delete this photo evidence? This cannot be undone."))return;

  try{
    const deleted=await supabaseClient.from("repair_request_photos").delete().eq("photo_id",photo.photo_id);
    if(deleted.error)throw deleted.error;

    const storageDelete=await supabaseClient.storage.from("repair-evidence").remove([photo.file_path]);
    if(storageDelete.error){
      console.warn("Deleted database photo row but storage cleanup failed:",storageDelete.error);
    }

    state.selectedRequest.photos=(state.selectedRequest.photos||[]).filter(x=>String(x.photo_id)!==String(photoId));
    await renderExistingPhotosForEdit();
    showMessage("Photo evidence deleted successfully.","success");
  }catch(error){
    console.error("Delete repair photo failed:",error);
    showMessage(error.message||"Unable to delete the photo evidence.","error");
  }
}

function openNewRequest(){
  state.selectedRequest=null;
  state.editingRequestId=null;
  $("modalTitle").textContent="NEW REPAIR REQUEST";
  $("saveDraft").textContent="SAVE DRAFT";
  $("requestForm").reset();
  $("requestDate").value=localDate();
  $("items").innerHTML="";
  addItemRow();
  state.selectedFiles=[];
  const existingSection=document.getElementById("existingPhotoEvidence");
  if(existingSection)existingSection.remove();
  renderSelectedFiles();
  const existingPhotoNote=document.createElement("div");
  const existingCount=Number(state.selectedRequest?.photos?.length||0);
  if(existingCount){
    existingPhotoNote.id="existingPhotoNote";
    existingPhotoNote.style.cssText="margin-top:10px;padding:10px;border-radius:10px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:11px;font-weight:800";
    existingPhotoNote.textContent=existingCount+" existing photo(s) are already attached to this Repair Request. Use + ADD PHOTO to add more evidence.";
    $("selectedPhotos").prepend(existingPhotoNote);
  }
  $("requestModal").classList.add("open");
}

function closeRequestModal(){
  $("requestModal").classList.remove("open");
  state.editingRequestId=null;
}

async function openEditRequest(){
  const request=state.selectedRequest?.request;
  if(!request)return;

  if(!["DRAFT","RETURNED"].includes(String(request.status||"").toUpperCase())){
    showMessage("Only DRAFT or RETURNED Repair Requests can be edited.","error");
    return;
  }

  state.editingRequestId=request.repair_request_id;
  $("modalTitle").textContent="EDIT REPAIR REQUEST";
  $("saveDraft").textContent="SAVE CHANGES";

  $("equipmentId").value=request.equipment_id||"";
  $("projectId").value=request.project_id||"";
  $("requestDate").value=request.request_date||localDate();
  $("reportedBy").value=request.reported_by||"";
  $("bodyPlateNo").value=request.body_plate_no||"";
  $("pmInspectionId").value=request.pm_inspection_ref||"";
  $("problems").value=request.problems_encountered||"";
  $("remarks").value=request.remarks||"";

  $("items").innerHTML="";
  const items=state.selectedRequest.items||[];
  if(items.length) items.forEach(addItemRow);
  else addItemRow();

  state.selectedFiles=[];
  renderSelectedFiles();
  $("requestModal").classList.add("open");
  await renderExistingPhotosForEdit();
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

  if(!eq||!date||!reported||!problems){
    throw new Error("Equipment, date, reported by, and problems encountered are required.");
  }

  const eqRow=state.equipment.find(x=>x.equipment_id===eq);
  const finalBody=body||(eqRow?.plate_number||null);
  const items=getItems();

  if(state.editingRequestId){
    const requestId=state.editingRequestId;

    const update=await supabaseClient
      .from("repair_requests")
      .update({
        request_date:date,
        equipment_id:eq,
        project_id:proj,
        pm_inspection_ref:pm,
        reported_by:reported,
        body_plate_no:finalBody,
        problems_encountered:problems,
        remarks,
        prepared_by:state.userId,
        prepared_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      })
      .eq("repair_request_id",requestId);

    if(update.error)throw update.error;

    const removeItems=await supabaseClient
      .from("repair_request_items")
      .delete()
      .eq("repair_request_id",requestId);

    if(removeItems.error)throw removeItems.error;

    if(items.length){
      const itemsPayload=items.map((x,i)=>({...x,repair_request_id:requestId,display_order:i}));
      const ir=await supabaseClient.from("repair_request_items").insert(itemsPayload);
      if(ir.error)throw ir.error;
    }

    await uploadPhotos(requestId);
    const refreshedPhotos=await supabaseClient.from("repair_request_photos").select("*").eq("repair_request_id",requestId).order("uploaded_at",{ascending:false});
    if(refreshedPhotos.error)throw refreshedPhotos.error;
    if(state.selectedRequest)state.selectedRequest.photos=refreshedPhotos.data||[];

    const current=await supabaseClient
      .from("repair_requests")
      .select("repair_form_no,status")
      .eq("repair_request_id",requestId)
      .single();

    if(current.error)throw current.error;

    const status=current.data?.status||"DRAFT";
    closeRequestModal();
    $("detailModal").classList.remove("open");
    showMessage(
      current.data.repair_form_no+" saved successfully as "+status+".",
      "success"
    );
    await loadRequests();
    return;
  }

  const r=await supabaseClient.from("repair_requests").insert({
    request_date:date,
    equipment_id:eq,
    project_id:proj,
    pm_inspection_ref:pm,
    reported_by:reported,
    body_plate_no:finalBody,
    problems_encountered:problems,
    remarks,
    prepared_by:state.userId,
    prepared_at:new Date().toISOString()
  }).select("repair_request_id,repair_form_no").single();

  if(r.error)throw r.error;

  const requestId=r.data.repair_request_id;

  if(items.length){
    const itemsPayload=items.map((x,i)=>({...x,repair_request_id:requestId,display_order:i}));
    const ir=await supabaseClient.from("repair_request_items").insert(itemsPayload);
    if(ir.error)throw ir.error;
  }

  await uploadPhotos(requestId);

  closeRequestModal();
  showMessage("Repair request "+r.data.repair_form_no+" saved as DRAFT. You can edit it until it is submitted for GM approval.","success");
  await loadRequests();
}


async function uploadPhotos(requestId){
  const files=state.selectedFiles;
  if(!files.length)return;

  for(const entry of files){
    const file=entry.file;
    const category=entry.category||$("photoCategory")?.value||"OTHER";
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=requestId+"/"+crypto.randomUUID()+"-"+safe;

    const upload=await supabaseClient.storage.from("repair-evidence").upload(
      path,file,{upsert:false,contentType:file.type||"image/jpeg"}
    );
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

function openDetail(id){
  const row=state.requests.find(x=>String(x.repair_request_id)===String(id));
  if(!row){showMessage("Repair Request not found.","error");return;}
  const eq=state.equipment.find(x=>x.equipment_id===row.equipment_id);
  const project=state.projects.find(x=>x.project_id===row.project_id);
  $("detailContent").innerHTML=
    '<div class="detail-grid">' +
      '<div class="detail-box"><h3>Repair Form</h3><div class="detail-text"><strong>'+escapeHtml(row.repair_form_no)+'</strong><br>Date: '+escapeHtml(row.request_date||"")+'</div></div>' +
      '<div class="detail-box"><h3>Status</h3>'+statusPill(row.status)+'</div>' +
      '<div class="detail-box"><h3>Equipment</h3><div class="detail-text"><strong>'+escapeHtml(eq?.equipment_name||row.equipment_id)+'</strong></div></div>' +
      '<div class="detail-box"><h3>Project</h3><div class="detail-text">'+escapeHtml(project?.project_name||row.project_id||"No project assigned")+'</div></div>' +
    '</div>' +
    '<div style="margin-top:14px;padding:12px;border-radius:10px;background:#f8fafc;color:#64748b;font-size:11px;font-weight:800">Loading full repair details…</div>';
  $("detailModal").classList.add("open");
  openDetailFull(id);
}

async function openDetailFull(id){
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
      <div class="detail-box"><h3>Status</h3>${statusPill(r.data.status)}<div class="workflow"><span class="step ${["DRAFT","RETURNED","PENDING APPROVAL","APPROVED","IN PROGRESS","COMPLETED","CLOSED"].includes(r.data.status)?"active":""}">DRAFT</span><span class="step ${["PENDING APPROVAL","APPROVED","IN PROGRESS","COMPLETED","CLOSED"].includes(r.data.status)?"active":""}">GM APPROVAL</span><span class="step ${["APPROVED","IN PROGRESS","COMPLETED","CLOSED"].includes(r.data.status)?"active":""}">REPAIR</span><span class="step ${["COMPLETED","CLOSED"].includes(r.data.status)?"active":""}">COMPLETE</span></div></div>
      <div class="detail-box"><h3>Equipment</h3><div class="detail-text"><strong>${escapeHtml(eq?.equipment_name||r.data.equipment_id)}</strong>\nPlate: ${escapeHtml(r.data.body_plate_no||eq?.plate_number||"—")}</div></div>
      <div class="detail-box"><h3>Project</h3><div class="detail-text">${escapeHtml(project?.project_name||r.data.project_id||"No project assigned")}</div></div>
      <div class="detail-box" style="grid-column:1/-1"><h3>Problems Encountered (Sira)</h3><div class="detail-text">${escapeHtml(r.data.problems_encountered)}</div></div>
      <div class="detail-box">
        <h3>SUBMISSION CONTROL</h3>
        <div style="font-weight:800;color:#334155">${r.data.status==="PENDING APPROVAL"?"✓ Submitted to General Manager Approval Center":"Maintenance Officer may continue editing until submission."}</div>
        <div style="margin-top:8px;color:#64748b;font-size:11px">${r.data.updated_at?"Last updated: "+escapeHtml(r.data.updated_at):"—"}</div>
      </div>
      <div class="detail-box">
        <h3>GM DECISION</h3>
        <div style="font-weight:800;color:#334155">${r.data.status==="APPROVED" ? "✓ APPROVED — Repair may proceed." : r.data.status==="RETURNED" ? "↩ RETURNED — Correct the request and resubmit." : r.data.status==="PENDING APPROVAL" ? "Awaiting General Manager decision." : "No GM decision recorded yet."}</div>
        <div style="margin-top:8px;color:#64748b;font-size:11px">${r.data.approved_at?"Decision date: "+escapeHtml(r.data.approved_at):"The Approval Center controls the approval decision."}</div>
      </div>
    </div>

    <section class="card" style="margin-top:16px;padding:14px">
      <div class="toolbar"><div><h2 style="font-size:15px">PHOTO EVIDENCE</h2><p class="subtitle">Repair evidence remains attached to the request. The General Manager reviews the full request in the Approval Center before approval.</p></div></div>
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
      card.innerHTML=
        '<img src="'+escapeHtml(src)+'" alt="Repair evidence photo">' +
        '<div class="photo-meta">' +
          '<strong>'+escapeHtml(ph.photo_category)+'</strong>' +
        '</div>';
      pg.appendChild(card);
    }
  }

  const il=$("itemList");
  const materialsLocked=["PENDING APPROVAL","APPROVED","IN PROGRESS","COMPLETED","CLOSED"].includes(String(r.data.status||"").toUpperCase());
  il.innerHTML=
    (materialsLocked
      ? '<div style="margin-bottom:10px;padding:10px 12px;border-radius:10px;background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:11px;font-weight:900">MATERIALS / SPARE PARTS LOCKED — These quantities and descriptions are fixed after GM submission/approval and cannot be edited.</div>'
      : '')+
    (state.selectedRequest.items.length
      ? state.selectedRequest.items.map(x=>'<div style="padding:8px 0;border-bottom:1px solid #e5e7eb"><strong>'+escapeHtml(x.work_to_be_done||"")+'</strong> — '+escapeHtml(x.material_or_spare_part||"")+' '+escapeHtml(x.quantity??"")+' '+escapeHtml(x.unit||"")+'</div>').join("")
      : '<div class="empty">No work/material lines yet.</div>');

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
      <div id="repairPhotoPreview" style="margin-top:12px"></div>
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

function renderRepairExecutionPhotoPreview(){
  const box=document.getElementById("repairPhotoPreview");
  if(!box)return;

  const files=state.repairExecutionFiles||[];
  if(!files.length){
    box.innerHTML='<div style="padding:14px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:11px;text-align:center">No new repair photos selected. Choose a photo and it will appear here before upload.</div>';
    return;
  }

  box.innerHTML=
    '<div style="font-size:11px;font-weight:900;color:#334155;margin-bottom:9px">'+files.length+' photo(s) selected</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px">'+
      files.map((entry,index)=>{
        const url=URL.createObjectURL(entry.file);
        return '<div style="border:1px solid #dbe2ea;border-radius:12px;overflow:hidden;background:#fff">'+
          '<div style="height:135px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden">'+
            '<img src="'+url+'" alt="Selected repair photo" style="width:100%;height:100%;object-fit:cover">'+
          '</div>'+
          '<div style="padding:9px">'+
            '<div style="font-size:10px;font-weight:900;color:#475569">'+escapeHtml(entry.category)+'</div>'+
            '<button type="button" class="btn btn-gray" data-remove-repair-photo="'+index+'" style="margin-top:8px;width:100%;min-height:32px">REMOVE</button>'+
          '</div>'+
        '</div>';
      }).join('')+
    '</div>';

  box.querySelectorAll("[data-remove-repair-photo]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const index=Number(btn.dataset.removeRepairPhoto);
      state.repairExecutionFiles.splice(index,1);
      renderRepairExecutionPhotoPreview();
    });
  });
}

async function uploadRepairPhotos(request){
  const files=state.repairExecutionFiles||[];
  if(!files.length) throw new Error("Please choose at least one repair photo.");

  for(const entry of files){
    const file=entry.file;
    const category=entry.category||"REPAIR BEFORE";

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

  state.repairExecutionFiles=[];
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
  state.repairExecutionFiles=state.repairExecutionFiles||[];
  renderRepairExecutionPhotoPreview();

  const photoInput=document.getElementById("repairPhotoInput");
  if(photoInput){
    photoInput.addEventListener("change",event=>{
      const category=document.getElementById("repairPhotoCategory")?.value||"REPAIR BEFORE";
      const incoming=[...event.target.files].filter(file=>file.type.startsWith("image/"));
      if(!incoming.length)return;

      state.repairExecutionFiles.push(
        ...incoming.map(file=>({file,category}))
      );

      event.target.value="";
      renderRepairExecutionPhotoPreview();
    });
  }

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
  let html="";

  if(r.status==="DRAFT" || r.status==="RETURNED"){
    html += '<button class="btn btn-blue" id="editRepairRequestButton">EDIT REPAIR REQUEST</button>';
    html += '<button class="btn btn-green" id="submitRepairApprovalButton">SUBMIT FOR APPROVAL</button>';
    if(r.status==="RETURNED"){
      html += '<div style="width:100%;margin-top:8px;color:#92400e;font-size:11px;font-weight:800">This request was returned by the General Manager. Update the details, then resubmit for approval.</div>';
    }
  }

  if(r.status==="PENDING APPROVAL"){
    html += '<div style="width:100%;padding:12px;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:900">AWAITING GENERAL MANAGER APPROVAL</div>';
  }

  if(r.status==="APPROVED"){
    const materialItems=(state.selectedRequest.items||[]).filter(x=>
      String(x.material_or_spare_part||"").trim() &&
      Number(x.quantity||0)>0
    );

    if(materialItems.length){
      if(r.materials_purchase_request_id){
        html += '<div style="width:100%;padding:12px;border-radius:10px;background:#dcfce7;color:#166534;font-size:12px;font-weight:900">REPAIR MATERIALS REQUESTED — SENT TO PURCHASING</div>';
      }else{
        html += '<button class="btn btn-green" id="requestRepairMaterialsButton">REQUEST REPAIR MATERIALS</button>';
      }
    }

    html += '<button class="btn btn-primary" id="startRepairButton">START REPAIR</button>';
  }

  if(r.status==="IN PROGRESS"){
    const hasRepairedBy=!!String(r.repaired_by||"").trim();
    const hasAfterPhoto=state.selectedRequest.photos.some(x=>x.photo_category==="REPAIR AFTER");
    const canComplete=hasRepairedBy&&hasAfterPhoto;

    html += '<button class="btn btn-green" id="completeRepairButton" '+(canComplete?"":"disabled")+'>MARK COMPLETED</button>';

    if(!canComplete){
      const missing=[];
      if(!hasRepairedBy)missing.push("Repaired By");
      if(!hasAfterPhoto)missing.push("REPAIR AFTER photo");
      html += '<div style="width:100%;margin-top:8px;color:#64748b;font-size:11px;font-weight:800">Completion locked until: '+escapeHtml(missing.join(" and "))+'</div>';
    }
  }

  if(r.status==="COMPLETED"){
    html += '<button class="btn btn-primary" id="closeRepairButton">CLOSE REPAIR</button>';
  }

  if(!html){
    html='<span style="color:#64748b">No action available for this status.</span>';
  }

  actions.innerHTML=html;

  const editButton=document.getElementById("editRepairRequestButton");
  if(editButton){
    editButton.addEventListener("click",async()=>{
      try{
        openEditRequest();
      }catch(e){
        showMessage(e.message||"Unable to edit Repair Request.","error");
      }
    });
  }

  const submitApproval=document.getElementById("submitRepairApprovalButton");
  if(submitApproval){
    submitApproval.addEventListener("click",()=>{
      openApprovalConfirmation(r.repair_request_id);
    });
  }

  const requestRepairMaterials=document.getElementById("requestRepairMaterialsButton");
  if(requestRepairMaterials){
    requestRepairMaterials.addEventListener("click",()=>{
      openRepairMaterialsConfirmation(r.repair_request_id);
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


// ---------------------------------------------------------
// REQUEST REPAIR MATERIALS
// Creates a REPAIR MATERIALS Purchase Request in Purchasing
// after the Repair Request has already been approved by GM.
// ---------------------------------------------------------
function openRepairMaterialsConfirmation(id){
  const request=state.selectedRequest?.request;
  if(!request || String(request.repair_request_id)!==String(id))return;

  const materialItems=(state.selectedRequest.items||[]).filter(x=>
    String(x.material_or_spare_part||"").trim() &&
    Number(x.quantity||0)>0
  );

  if(request.status!=="APPROVED"){
    showMessage("Repair materials can only be requested after GM approval.","error");
    return;
  }

  if(request.materials_purchase_request_id){
    showMessage("Repair materials have already been sent to Purchasing for this Repair Request.","info");
    return;
  }

  if(!materialItems.length){
    showMessage("No material or spare-part line with a quantity was found in this Repair Request.","error");
    return;
  }

  const existing=document.getElementById("repairMaterialsConfirmOverlay");
  if(existing)existing.remove();

  const overlay=document.createElement("div");
  overlay.id="repairMaterialsConfirmOverlay";
  overlay.style.cssText=[
    "position:fixed",
    "inset:0",
    "width:100vw",
    "height:100vh",
    "background:rgba(15,23,42,.78)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:24px",
    "box-sizing:border-box",
    "z-index:2147483647"
  ].join(";");

  const dialog=document.createElement("div");
  dialog.style.cssText=[
    "width:min(560px,calc(100vw - 48px))",
    "background:#fff",
    "border-radius:18px",
    "padding:20px",
    "box-sizing:border-box",
    "box-shadow:0 24px 80px rgba(0,0,0,.45)"
  ].join(";");

  const lines=materialItems.map(x=>
    '<div style="padding:8px 0;border-bottom:1px solid #e2e8f0">'+
      '<strong>'+escapeHtml(x.material_or_spare_part)+'</strong>'+
      '<div style="margin-top:3px;color:#64748b;font-size:11px">'+
        escapeHtml(x.quantity)+' '+escapeHtml(x.unit||'')+
        (x.work_to_be_done?' • '+escapeHtml(x.work_to_be_done):'')+
      '</div>'+
    '</div>'
  ).join("");

  dialog.innerHTML=
    '<div style="display:flex;gap:12px;align-items:flex-start">'+
      '<div>'+
        '<div style="color:#2563eb;font-size:9px;font-weight:900;letter-spacing:.08em">PURCHASING</div>'+
        '<h2 style="margin:5px 0 0;color:#0f172a;font-size:20px">REQUEST REPAIR MATERIALS?</h2>'+
      '</div>'+
      '<button type="button" id="repairMaterialsClose" style="margin-left:auto;width:34px;height:34px;border:1px solid #dbe3ef;background:#fff;border-radius:9px;font-size:20px;color:#475569;cursor:pointer">×</button>'+
    '</div>'+
    '<div style="margin-top:14px;padding:14px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;font-size:12px;line-height:1.6">'+
      'The General Manager has already approved this Repair Request. Confirming will send the required materials/spare parts to the Purchasing module as an <strong>APPROVED — REPAIR MATERIALS</strong> Purchase Request.'+
    '</div>'+
    '<div style="margin-top:14px;border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc">'+
      '<div style="font-size:11px;font-weight:900;color:#334155;margin-bottom:7px">'+escapeHtml(request.repair_form_no||"Repair Request")+'</div>'+
      '<div style="color:#64748b;font-size:11px;margin-bottom:8px">Materials / spare parts to send to Purchasing:</div>'+
      lines+
    '</div>'+
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">'+
      '<button type="button" class="btn btn-gray" id="repairMaterialsCancel">CANCEL</button>'+
      '<button type="button" class="btn btn-green" id="repairMaterialsConfirm">YES, SEND TO PURCHASING</button>'+
    '</div>';

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close=()=>overlay.remove();
  dialog.querySelector("#repairMaterialsClose").addEventListener("click",close);
  dialog.querySelector("#repairMaterialsCancel").addEventListener("click",close);
  overlay.addEventListener("click",e=>{if(e.target===overlay)close();});

  dialog.querySelector("#repairMaterialsConfirm").addEventListener("click",async()=>{
    const button=dialog.querySelector("#repairMaterialsConfirm");
    button.disabled=true;
    button.textContent="SENDING...";

    try{
      const {data,error}=await supabaseClient.rpc(
        "amanah_request_repair_materials",
        {p_repair_request_id:id}
      );
      if(error)throw error;

      close();

      const requestNo=data?.request_no||"Purchase Request";
      showMessage(
        requestNo+" was created in Purchasing as REPAIR MATERIALS.",
        "success"
      );

      await openDetailFull(id);
    }catch(error){
      console.error("Request repair materials failed:",error);
      showMessage(
        error.message||"Unable to send the repair materials request to Purchasing.",
        "error"
      );
      button.disabled=false;
      button.textContent="YES, SEND TO PURCHASING";
    }
  });
}

function openApprovalConfirmation(id){
  const request=state.selectedRequest?.request;
  if(!request || String(request.repair_request_id)!==String(id))return;

  // Remove any previous confirmation overlay.
  const oldOverlay=document.getElementById("approvalConfirmOverlay");
  if(oldOverlay)oldOverlay.remove();

  // Hide the legacy modal so it can never interfere with the new overlay.
  const legacyModal=$("approvalConfirmModal");
  if(legacyModal){
    legacyModal.classList.remove("open");
    legacyModal.style.display="none";
  }

  state.approvalConfirmRequestId=id;

  const equipmentName=state.equipment.find(x=>x.equipment_id===request.equipment_id)?.equipment_name||request.equipment_id||"";
  const projectName=state.projects.find(x=>x.project_id===request.project_id)?.project_name||request.project_id||"No project";

  const overlay=document.createElement("div");
  overlay.id="approvalConfirmOverlay";
  overlay.style.cssText=[
    "position:fixed",
    "left:0",
    "top:0",
    "width:100vw",
    "height:100vh",
    "background:rgba(15,23,42,.78)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:24px",
    "box-sizing:border-box",
    "z-index:2147483647"
  ].join(";");

  const dialog=document.createElement("div");
  dialog.style.cssText=[
    "width:min(540px,calc(100vw - 48px))",
    "background:#fff",
    "border-radius:18px",
    "padding:20px",
    "box-sizing:border-box",
    "box-shadow:0 24px 80px rgba(0,0,0,.45)"
  ].join(";");

  dialog.innerHTML=
    '<div class="dialog-head">'+
      '<h2 style="margin:0">SUBMIT FOR APPROVAL?</h2>'+
      '<button type="button" class="close" id="dynamicCloseApproval">×</button>'+
    '</div>'+
    '<div style="margin-top:14px;padding:15px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;font-size:12px;line-height:1.6">'+
      'Please confirm that this Repair Request is complete and ready to be reviewed by the General Manager.'+
      '<div style="margin-top:10px;padding:10px;border-radius:9px;background:#fff;border:1px solid #dbeafe;color:#334155">'+
        '<strong>'+escapeHtml(request.repair_form_no||"Repair Request")+'</strong>'+
        '<div style="margin-top:5px;color:#64748b">'+escapeHtml(equipmentName)+" • "+escapeHtml(projectName)+'</div>'+
      '</div>'+
      '<div style="margin-top:10px;font-weight:800">After submission, the request will become PENDING APPROVAL and editing will be locked until the GM returns or approves it.</div>'+
    '</div>'+
    '<div class="actions" style="justify-content:flex-end">'+
      '<button type="button" class="btn btn-gray" id="dynamicCancelApproval">CANCEL</button>'+
      '<button type="button" class="btn btn-green" id="dynamicConfirmApproval">YES, SUBMIT FOR APPROVAL</button>'+
    '</div>';

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const closeBtn=dialog.querySelector("#dynamicCloseApproval");
  const cancelBtn=dialog.querySelector("#dynamicCancelApproval");
  const confirmBtn=dialog.querySelector("#dynamicConfirmApproval");

  const cancel=()=>closeApprovalConfirmation();
  closeBtn.addEventListener("click",cancel);
  cancelBtn.addEventListener("click",cancel);
  overlay.addEventListener("click",e=>{
    if(e.target===overlay)closeApprovalConfirmation();
  });

  confirmBtn.addEventListener("click",async()=>{
    const requestId=state.approvalConfirmRequestId;
    if(!requestId)return;

    confirmBtn.disabled=true;
    confirmBtn.textContent="SUBMITTING...";
    try{
      await submitRepairForApproval(requestId);
      closeApprovalConfirmation();
    }catch(err){
      console.error(err);
      showMessage(err.message||"Unable to submit Repair Request for approval.","error");
    }finally{
      confirmBtn.disabled=false;
      confirmBtn.textContent="YES, SUBMIT FOR APPROVAL";
    }
  });
}


function closeApprovalConfirmation(){
  state.approvalConfirmRequestId=null;
  const overlay=document.getElementById("approvalConfirmOverlay");
  if(overlay)overlay.remove();

  const legacyModal=$("approvalConfirmModal");
  if(legacyModal){
    legacyModal.classList.remove("open");
    legacyModal.style.display="none";
  }
}


async function submitRepairForApproval(id){
  const request=state.selectedRequest?.request;
  if(!request || request.repair_request_id!==id){
    await openDetailFull(id);
  }

  const current=state.selectedRequest?.request;
  if(!current)throw new Error("Repair Request details are not loaded.");
  if(!["DRAFT","RETURNED"].includes(String(current.status||"").toUpperCase())){
    throw new Error("Only DRAFT or RETURNED Repair Requests can be submitted for approval.");
  }

  if(!String(current.equipment_id||"").trim() || !String(current.problems_encountered||"").trim()){
    throw new Error("Complete the required equipment and problem details before submitting for approval.");
  }

  const itemSummary=(state.selectedRequest.items||[])
    .map(x=>[x.work_to_be_done,x.material_or_spare_part,x.quantity,x.unit].filter(v=>v!==null&&v!==undefined&&String(v).trim()!=="").join(" "))
    .join(" • ");

  const button=document.getElementById("submitRepairApprovalButton");
  if(button){
    button.disabled=true;
    button.textContent="SUBMITTING...";
  }

  try{
    const {data,error}=await supabaseClient.rpc("amanah_submit_approval",{
      p_request_type:"REPAIR_REQUEST",
      p_entity_id:id,
      p_title:"Repair Request: "+(current.repair_form_no||id),
      p_description:"Repair request submitted directly by Maintenance for General Manager approval.",
      p_payload:{
        request_action:"CREATE",
        repair_request_id:id,
        repair_form_no:current.repair_form_no,
        request_date:current.request_date,
        equipment_id:current.equipment_id,
        equipment_name:state.equipment.find(x=>x.equipment_id===current.equipment_id)?.equipment_name||current.equipment_id,
        project_id:current.project_id,
        project_name:state.projects.find(x=>x.project_id===current.project_id)?.project_name||current.project_id,
        pm_inspection_ref:current.pm_inspection_ref,
        reported_by:current.reported_by,
        problems_encountered:current.problems_encountered,
        items_summary:itemSummary||"No work/material line items recorded yet.",
        photo_count:state.selectedRequest.photos.length,
        remarks:current.remarks
      }
    });

    if(error)throw error;

    $("detailModal").classList.remove("open");
    showMessage(
      (current.repair_form_no||"Repair Request")+" was sent to the Approval Center for General Manager approval.",
      "success"
    );
    await loadRequests();
  }finally{
    if(button){
      button.disabled=false;
      button.textContent="SUBMIT FOR APPROVAL";
    }
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
$("addPhotoButton").addEventListener("click",()=>$("photoInput").click());
$("photoCategory").addEventListener("change",()=>renderSelectedFiles());
$("photoInput").addEventListener("change",e=>{
  const category=$("photoCategory").value||"OTHER";
  const incoming=[...e.target.files].filter(file=>file.type.startsWith("image/"));
  if(!incoming.length)return;
  state.selectedFiles.push(...incoming.map(file=>({file,category})));
  e.target.value="";
  renderSelectedFiles();
});
$("requestForm").addEventListener("submit",async e=>{e.preventDefault();try{await createRequest();}catch(err){console.error(err);showMessage(err.message||"Unable to create repair request.","error");}});
$("closeDetail").addEventListener("click",()=>$("detailModal").classList.remove("open"));
$("closeApprovalConfirm").addEventListener("click",closeApprovalConfirmation);
$("cancelApprovalConfirm").addEventListener("click",closeApprovalConfirmation);
$("approvalConfirmModal").addEventListener("click",e=>{if(e.target.id==="approvalConfirmModal")closeApprovalConfirmation();});
// Approval submission confirmation is handled by the dynamically created
// full-screen overlay in openApprovalConfirmation().
$("closeDeleteConfirm").addEventListener("click",closeDeleteConfirm);
$("cancelDeleteConfirm").addEventListener("click",closeDeleteConfirm);
$("confirmDeleteButton").addEventListener("click",async()=>{try{await deleteRepairRequest();}catch(err){console.error(err);showMessage(err.message||"Unable to delete the Repair Request.","error");}});
$("deleteConfirmModal").addEventListener("click",e=>{if(e.target.id==="deleteConfirmModal")closeDeleteConfirm();});
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
