/* =========================================================
   AMANAH EQUIPMENT MAINTENANCE & REPAIR
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
  equipment: [],
  projects: [],
  records: [],
  editingId: null,
  photoMaintenanceId: null,
  selectedPhotos: [],
  photoPreviewUrls: []
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function localDateValue() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function formatDate(value) {
  if (!value) return "";
  const parts = String(value).slice(0, 10).split("-");
  if (parts.length !== 3) return value;
  return parts[1] + "/" + parts[2] + "/" + parts[0];
}

function showMessage(message, type) {
  const box = $("message");
  box.textContent = message;
  box.className = "message " + (type || "info");
  box.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearMessage() {
  const box = $("message");
  box.textContent = "";
  box.className = "message";
  box.style.display = "none";
}

async function requireSession() {
  const result = await supabaseClient.auth.getSession();

  if (result.error) throw result.error;

  if (!result.data?.session) {
    location.href = "index.html";
    return false;
  }

  return true;
}

async function logout() {
  await supabaseClient.auth.signOut();
  location.href = "index.html";
}

async function loadMasterData() {
  const results = await Promise.all([
    supabaseClient
      .from("equipment")
      .select("equipment_id,equipment_name,equipment_type,plate_number,status")
      .eq("status", "ACTIVE")
      .order("equipment_name"),
    supabaseClient
      .from("projects")
      .select("project_id,project_name,status")
      .order("project_name")
  ]);

  if (results[0].error) throw results[0].error;
  if (results[1].error) throw results[1].error;

  state.equipment = results[0].data || [];
  state.projects = results[1].data || [];

  populateSelectors();
}

function populateSelectors() {
  const equipmentFilter = $("equipmentFilter");
  const equipmentId = $("equipmentId");
  const projectFilter = $("projectFilter");
  const projectId = $("projectId");

  equipmentFilter.innerHTML =
    '<option value="">ALL EQUIPMENT</option>';

  equipmentId.innerHTML = "";

  projectFilter.innerHTML =
    '<option value="">ALL PROJECTS</option>';

  projectId.innerHTML =
    '<option value="">No project assigned</option>';

  state.equipment.forEach(item => {
    const a = document.createElement("option");
    a.value = item.equipment_id;
    a.textContent = item.equipment_name + " — " + item.equipment_id;
    equipmentFilter.appendChild(a);

    const b = document.createElement("option");
    b.value = item.equipment_id;
    b.textContent = item.equipment_name + " — " + item.equipment_id;
    equipmentId.appendChild(b);
  });

  state.projects.forEach(item => {
    const a = document.createElement("option");
    a.value = item.project_id;
    a.textContent = item.project_name + " — " + item.project_id;
    projectFilter.appendChild(a);

    const b = document.createElement("option");
    b.value = item.project_id;
    b.textContent = item.project_name + " — " + item.project_id;
    projectId.appendChild(b);
  });
}

async function loadRecords() {
  /*
    Do not embed equipment/projects in the maintenance query.

    The previous PostgREST relation query could surface:
      "column reference \"equipment_name\" is ambiguous"

    The master data is already loaded above, so we can safely
    resolve names by ID on the client without relying on embedded
    relationship aliases.
  */
  const result = await supabaseClient
    .from("equipment_maintenance")
    .select(
      "maintenance_id,equipment_id,project_id,maintenance_date,maintenance_type,description,supplier_shop,reference_no,quantity,unit,unit_cost,total_amount,remarks,approval_status,created_at"
    )
    .order("maintenance_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (result.error) throw result.error;

  state.records = result.data || [];
  render();
}

function equipmentNameById(id) {
  const item = state.equipment.find(
    row => row.equipment_id === id
  );

  return item
    ? item.equipment_name
    : id || "—";
}

function projectNameById(id) {
  const item = state.projects.find(
    row => row.project_id === id
  );

  return item
    ? item.project_name
    : id || "—";
}

function filteredRecords() {
  const equipment = $("equipmentFilter").value;
  const project = $("projectFilter").value;
  const type = $("typeFilter").value;

  return state.records.filter(row => {
    if (equipment && row.equipment_id !== equipment) return false;
    if (project && row.project_id !== project) return false;
    if (type && row.maintenance_type !== type) return false;
    return true;
  });
}

function render() {
  const records = filteredRecords();

  const total = records.reduce(
    (sum, row) => sum + Number(row.total_amount || 0),
    0
  );

  const projectTotal = records
    .filter(row => !!row.project_id)
    .reduce(
      (sum, row) => sum + Number(row.total_amount || 0),
      0
    );

  $("recordCount").textContent = String(records.length);
  $("totalCost").textContent = money(total);
  $("projectCost").textContent = money(projectTotal);

  const body = $("tableBody");

  if (!records.length) {
    body.innerHTML =
      '<tr><td colspan="13" class="empty">No maintenance records found.</td></tr>';
    return;
  }

  body.innerHTML = records.map(row => {
    const equipmentName =
      equipmentNameById(row.equipment_id);

    const projectName =
      projectNameById(row.project_id);

    return (
      "<tr>" +
        "<td>" + escapeHtml(formatDate(row.maintenance_date)) + "</td>" +
        "<td><strong>" + escapeHtml(equipmentName) + "</strong><br><span style=\"color:#64748b\">" +
          escapeHtml(row.equipment_id) + "</span></td>" +
        "<td>" + escapeHtml(projectName) + "</td>" +
        "<td><span class=\"tag\">" + escapeHtml(row.maintenance_type) + "</span></td>" +
        "<td>" + escapeHtml(row.description) + "</td>" +
        "<td>" + escapeHtml(row.supplier_shop || "—") + "</td>" +
        "<td>" + escapeHtml(row.quantity) + "</td>" +
        "<td>" + escapeHtml(row.unit) + "</td>" +
        "<td>" + money(row.unit_cost) + "</td>" +
        "<td><strong>" + money(row.total_amount) + "</strong></td>" +
        "<td>" + escapeHtml(row.reference_no || "—") + "</td>" +
        "<td><span class=\"tag\">" + escapeHtml(row.approval_status || "NOT REQUIRED") + "</span></td>" +
        "<td class=\"action-buttons\">" +
          "<button class=\"btn-action btn-edit\" type=\"button\" onclick=\"editRecord('" +
            escapeHtml(row.maintenance_id) +
            "')\">EDIT</button>" +
          "<button class=\"btn-action\" type=\"button\" style=\"background:#0f766e\" onclick=\"printMaintenanceRecord('" +
            escapeHtml(row.maintenance_id) +
            "')\">PRINT</button>" +

          (row.approval_status === "PENDING" ? "<button class=\"btn-action maintenance-cancel-visible\" style=\"background:#dc2626!important;color:#fff!important;border:1px solid #dc2626!important;font-weight:900!important;opacity:1!important;cursor:pointer!important\" type=\"button\" onclick=\"cancelMaintenanceRequest('" + escapeHtml(row.maintenance_id) + "')\">CANCEL REQUEST</button>" : "") +
          (row.approval_status === "APPROVED" ? "<button class=\"btn-action maintenance-cancel-visible\" style=\"background:#f59e0b!important;color:#fff!important;border:1px solid #f59e0b!important;font-weight:900!important;opacity:1!important;cursor:pointer!important;box-shadow:0 5px 12px rgba(245,158,11,.2)\" type=\"button\" onclick=\"cancelMaintenanceRequest('" + escapeHtml(row.maintenance_id) + "')\">REQUEST CANCELLATION</button>" : "") +
          "<button class=\"btn-danger\" type=\"button\" onclick=\"deleteRecord('" +
            escapeHtml(row.maintenance_id) +
            "')\">DELETE</button>" +
        "</td>" +
      "</tr>"
    );
  }).join("");
}

async function printMaintenanceRecord(id){
  const printing=window.AmanahRecordPrint;
  if(!printing){showMessage('Print module unavailable. Please refresh the page.','error');return;}
  const win=printing.open('MAINTENANCE RECORD');
  if(!win)return;
  try{
    const [record,photos]=await Promise.all([
      supabaseClient.from('equipment_maintenance').select('*').eq('maintenance_id',id).single(),
      supabaseClient.from('equipment_maintenance_photos').select('storage_path').eq('maintenance_id',id).order('created_at',{ascending:true})
    ]);
    if(record.error)throw record.error;
    if(photos.error)throw photos.error;
    const r=record.data, f=printing.fields,s=printing.section,cash=printing.cash;
    const sections=[
      s('MAINTENANCE INFORMATION',f([
        ['Date',formatDate(r.maintenance_date)],
        ['Equipment',equipmentNameById(r.equipment_id)],
        ['Equipment ID',r.equipment_id],
        ['Project',projectNameById(r.project_id)],
        ['Maintenance Type',r.maintenance_type],
        ['Approval Status',r.approval_status||'NOT REQUIRED'],
        ['Supplier / Shop',r.supplier_shop],
        ['Reference / OR No.',r.reference_no],
        ['Description',r.description],
        ['Remarks',r.remarks]
      ])),
      s('MAINTENANCE COST',f([
        ['Quantity',r.quantity],
        ['Unit',r.unit],
        ['Unit Cost',cash(r.unit_cost)],
        ['Total Amount',cash(r.total_amount)]
      ]))
    ];
    const signed=await Promise.all((photos.data||[]).map(async p=>{
      const result=await supabaseClient.storage.from('equipment-maintenance-evidence').createSignedUrl(p.storage_path,600);
      if(result.error){console.warn('Maintenance print photo unavailable',result.error);return null;}
      return {label:'MAINTENANCE PHOTO EVIDENCE',src:result.data?.signedUrl};
    }));
    printing.printPage(win,{
      title:'EQUIPMENT MAINTENANCE RECORD',
      number:String(r.maintenance_type||'MAINTENANCE')+' · '+(r.equipment_id||''),
      status:r.approval_status||'NOT REQUIRED',
      sections,
      photos:signed.filter(Boolean)
    });
  }catch(error){
    console.error('Maintenance printing failed',error);
    printing.error(win,error);
    showMessage(error.message||'Unable to print maintenance record.','error');
  }
}

function showMaintenanceCancelDialog(record,approved=false){
  return new Promise(resolve=>{
    $("amanahMaintenanceCancelBackdrop")?.remove();
    const wrap=document.createElement("div");
    wrap.id="amanahMaintenanceCancelBackdrop";
    wrap.style.cssText="position:fixed;inset:0;z-index:30000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.68);backdrop-filter:blur(4px)";
    wrap.innerHTML=
      '<div style="width:min(560px,100%);background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 30px 90px rgba(15,23,42,.3);overflow:hidden">'+
        '<div style="display:flex;gap:12px;align-items:flex-start;padding:20px;border-bottom:1px solid #e2e8f0">'+
          '<div style="width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:#fff7ed;color:#b45309;font-weight:900">!</div>'+
          '<div><div style="color:#2563eb;font-size:8px;font-weight:900;letter-spacing:.1em">MAINTENANCE REQUEST</div><h3 style="margin:5px 0;color:#0f172a;font-size:18px">'+(approved?"REQUEST MAINTENANCE CANCELLATION":"CANCEL REQUEST")+'</h3><p style="margin:0;color:#64748b;font-size:10px;line-height:1.5">'+(approved?"This approved maintenance record requires General Manager approval before it can be cancelled.":"This maintenance request is still awaiting General Manager approval.")+'</p></div>'+
          '<button type="button" data-maint-cancel-close style="margin-left:auto;border:1px solid #dbe3ef;background:#fff;border-radius:9px;width:34px;height:34px;font-size:20px;color:#475569;cursor:pointer">×</button>'+
        '</div>'+
        '<div style="padding:18px 20px">'+
          '<div style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc"><strong style="display:block;color:#0f172a;font-size:11px">'+escapeHtml(equipmentNameById(record.equipment_id))+'</strong><span style="display:block;margin-top:4px;color:#475569;font-size:11px">'+escapeHtml(record.description||record.maintenance_type||"Maintenance request")+'</span></div>'+
          '<label style="display:block;margin-top:14px;color:#334155;font-size:9px;font-weight:900;letter-spacing:.08em">CANCELLATION REASON</label>'+
          '<textarea data-maint-cancel-reason rows="4" placeholder="Enter the reason for withdrawing this maintenance request..." style="width:100%;box-sizing:border-box;margin-top:7px;border:1px solid #cbd5e1;border-radius:10px;padding:11px 12px;font:inherit;resize:vertical"></textarea>'+
          '<div style="margin-top:6px;color:#94a3b8;font-size:9px">The reason will be retained in the approval history.</div>'+
        '</div>'+
        '<div style="display:flex;justify-content:flex-end;gap:8px;padding:15px 20px;border-top:1px solid #e2e8f0;background:#fbfdff">'+
          '<button type="button" data-maint-cancel-close class="btn-action">KEEP REQUEST</button>'+
          '<button type="button" data-maint-cancel-confirm class="btn-danger">CANCEL REQUEST</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(wrap);
    const reason=wrap.querySelector("[data-maint-cancel-reason]");setTimeout(()=>reason?.focus(),30);
    const finish=value=>{wrap.remove();resolve(value);};
    wrap.querySelectorAll("[data-maint-cancel-close]").forEach(b=>b.addEventListener("click",()=>finish(null)));
    wrap.querySelector("[data-maint-cancel-confirm]").addEventListener("click",()=>{
      const v=(reason?.value||"").trim();
      if(!v){reason.focus();reason.style.borderColor="#dc2626";return;}
      finish(v);
    });
    wrap.addEventListener("click",e=>{if(e.target===wrap)finish(null);});
  });
}

async function cancelMaintenanceRequest(id){
  const record=state.records.find(row=>row.maintenance_id===id);
  if(!record)return;
  const approved=record.approval_status==="APPROVED";
  if(!["PENDING","APPROVED"].includes(record.approval_status))return;
  const reason=await showMaintenanceCancelDialog(record,approved);
  if(!reason)return;
  try{
    if(!approved){
      const {data:req,error:reqError}=await supabaseClient.from("amanah_approval_requests").select("approval_id").eq("request_type","MAINTENANCE").eq("entity_id",id).eq("status","PENDING").maybeSingle();
      if(reqError)throw reqError;
      if(!req?.approval_id)throw new Error("No pending approval request was found for this maintenance request.");
      const {error}=await supabaseClient.rpc("amanah_cancel_approval",{p_approval_id:req.approval_id,p_reason:reason});
      if(error)throw error;
      showMessage("Maintenance request cancelled successfully.","success");
    }else{
      const {error}=await supabaseClient.rpc("amanah_submit_approval",{
        p_request_type:"MAINTENANCE",
        p_entity_id:id,
        p_title:"Cancellation: "+(equipmentNameById(record.equipment_id)||"Maintenance"),
        p_description:"Cancellation request submitted for General Manager approval.",
        p_payload:{
          request_action:"CANCEL",
          equipment_id:record.equipment_id||"",
          equipment_name:equipmentNameById(record.equipment_id)||"",
          project_id:record.project_id||"",
          project_name:projectNameById(record.project_id)||"",
          maintenance_date:record.maintenance_date||"",
          maintenance_type:record.maintenance_type||"",
          description:record.description||"",
          supplier_shop:record.supplier_shop||"",
          total_amount:Number(record.total_amount||0),
          cancellation_reason:reason
        }
      });
      if(error)throw error;
      showMessage("Maintenance cancellation request submitted for General Manager approval.","success");
    }
    await loadRecords();
  }catch(error){
    console.error(error);
    showMessage(error.message||"Unable to process maintenance cancellation.","error");
  }
}
function calculateTotal() {
  const quantity = Number($("quantity").value || 0);
  const unitCost = Number($("unitCost").value || 0);
  $("totalAmount").value = (quantity * unitCost).toFixed(2);
}

function clearPhotoPreviews() {
  state.photoPreviewUrls.forEach(url => {
    try {
      URL.revokeObjectURL(url);
    } catch (_) {}
  });

  state.photoPreviewUrls = [];
}

function resetMaintenancePhotos() {
  clearPhotoPreviews();
  state.selectedPhotos = [];

  if ($("maintenancePhotoInput")) {
    $("maintenancePhotoInput").value = "";
  }

  if ($("maintenancePhotoPreview")) {
    $("maintenancePhotoPreview").innerHTML =
      '<div class="photo-empty-inline">No photos selected.</div>';
  }

  if ($("maintenancePhotoSummary")) {
    $("maintenancePhotoSummary").textContent =
      "Optional: attach maintenance evidence before saving.";
  }
}

function renderPendingMaintenancePhotos() {
  clearPhotoPreviews();

  const preview = $("maintenancePhotoPreview");
  const summary = $("maintenancePhotoSummary");

  if (!state.selectedPhotos.length) {
    preview.innerHTML =
      '<div class="photo-empty-inline">No photos selected.</div>';

    if (summary) {
      summary.textContent =
        "Optional: attach maintenance evidence before saving.";
    }

    return;
  }

  state.photoPreviewUrls =
    state.selectedPhotos.map(file =>
      URL.createObjectURL(file)
    );

  preview.innerHTML =
    state.photoPreviewUrls.map((url, index) =>
      '<div class="inline-photo-card">' +
        '<img src="' + escapeHtml(url) + '" alt="Selected maintenance photo">' +
        '<div class="inline-photo-label">PHOTO ' + (index + 1) + '</div>' +
        '<button class="photo-remove-button" type="button" onclick="removePendingPhoto(' + index + ')">REMOVE</button>' +
      '</div>'
    ).join("");

  if (summary) {
    summary.textContent =
      state.selectedPhotos.length +
      " photo" +
      (state.selectedPhotos.length === 1 ? "" : "s") +
      " selected. Remove any photo you want to change, then choose a new photo. Existing selected photos stay attached.";
  }
}

function handleMaintenanceFormPhotos(event) {
  const incomingPhotos =
    Array.from(event.target.files || []).filter(file =>
      file.type.startsWith("image/")
    );

  if (!incomingPhotos.length) {
    if (event.target) {
      event.target.value = "";
    }
    return;
  }

  const existingKeys = new Set(
    state.selectedPhotos.map(file =>
      file.name + "|" + file.size + "|" + file.lastModified
    )
  );

  incomingPhotos.forEach(file => {
    const key =
      file.name + "|" + file.size + "|" + file.lastModified;

    if (!existingKeys.has(key)) {
      state.selectedPhotos.push(file);
      existingKeys.add(key);
    }
  });

  /*
    The native file input only contains the most recently selected
    FileList. We keep the full selection in state so selecting a
    new photo ADDS to the current photos instead of replacing them.
    Clearing the input also allows the user to choose the same file
    again later if needed.
  */
  event.target.value = "";

  renderPendingMaintenancePhotos();
}

function removePendingPhoto(index) {
  if (
    index < 0 ||
    index >= state.selectedPhotos.length
  ) {
    return;
  }

  state.selectedPhotos.splice(index, 1);

  /*
    Re-render from state so removing PHOTO 2 leaves PHOTO 1 intact,
    and the next newly selected photo becomes the next available slot.
  */
  renderPendingMaintenancePhotos();

  const input = $("maintenancePhotoInput");
  if (input) {
    input.value = "";
  }
}

function resetForm() {
  $("recordForm").reset();
  $("maintenanceDate").value = localDateValue();
  $("maintenanceType").value = "PREVENTIVE MAINTENANCE";
  $("quantity").value = "1";
  $("unit").value = "LOT";
  $("unitCost").value = "0";
  $("totalAmount").value = "0.00";

  if (state.equipment.length) {
    $("equipmentId").value = state.equipment[0].equipment_id;
  }

  $("projectId").value = "";

  resetMaintenancePhotos();

  if ($("existingMaintenancePhotos")) {
    $("existingMaintenancePhotos").innerHTML = "";
    $("existingMaintenancePhotosWrap").style.display = "none";
  }
}

function openModal(record = null) {
  clearMessage();

  state.editingId =
    record?.maintenance_id || null;

  resetForm();

  if (record) {
    $("modalTitle").textContent = "EDIT MAINTENANCE";

    $("maintenanceDate").value =
      record.maintenance_date || "";

    $("maintenanceType").value =
      record.maintenance_type || "PREVENTIVE MAINTENANCE";

    $("equipmentId").value =
      record.equipment_id || "";

    $("projectId").value =
      record.project_id || "";

    $("description").value =
      record.description || "";

    $("supplierShop").value =
      record.supplier_shop || "";

    $("referenceNo").value =
      record.reference_no || "";

    $("quantity").value =
      record.quantity ?? 1;

    $("unit").value =
      record.unit || "LOT";

    $("unitCost").value =
      record.unit_cost ?? 0;

    $("totalAmount").value =
      Number(record.total_amount || 0).toFixed(2);

    $("remarks").value =
      record.remarks || "";

    $("saveButton").textContent = "SAVE";
    $("printMaintenanceModal").hidden = false;
    $("modalBackdrop").classList.add("open");

    loadExistingMaintenancePhotos(
      record.maintenance_id
    );

  } else {
    $("modalTitle").textContent = "ADD MAINTENANCE";
    $("printMaintenanceModal").hidden = true;
    $("saveButton").textContent = "SAVE";
    $("modalBackdrop").classList.add("open");
  }
}

function closeModal() {
  $("printMaintenanceModal").hidden = true;
  state.editingId = null;
  resetMaintenancePhotos();
  $("modalBackdrop").classList.remove("open");
}

function editRecord(id) {
  const record = state.records.find(
    row => row.maintenance_id === id
  );

  if (!record) {
    showMessage(
      "Maintenance record could not be found.",
      "error"
    );
    return;
  }

  openModal(record);
}

async function uploadPhotosForMaintenance(maintenanceId) {
  if (!maintenanceId || !state.selectedPhotos.length) {
    return;
  }

  for (const file of state.selectedPhotos) {
    const ext =
      (
        file.name.split(".").pop() ||
        "jpg"
      )
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";

    const path =
      "maintenance/" +
      String(maintenanceId) +
      "/" +
      crypto.randomUUID() +
      "." +
      ext;

    const upload =
      await supabaseClient.storage
        .from("equipment-maintenance-evidence")
        .upload(
          path,
          file,
          {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "image/jpeg"
          }
        );

    if (upload.error) {
      throw upload.error;
    }

    const insert =
      await supabaseClient
        .from("equipment_maintenance_photos")
        .insert({
          maintenance_id: String(maintenanceId),
          storage_path: path
        });

    if (insert.error) {
      throw insert.error;
    }
  }

  resetMaintenancePhotos();
}

async function loadExistingMaintenancePhotos(maintenanceId) {
  const wrap = $("existingMaintenancePhotosWrap");
  const box = $("existingMaintenancePhotos");

  if (!wrap || !box) return;

  wrap.style.display = "block";
  box.innerHTML =
    '<div class="photo-empty-inline">Loading existing photos...</div>';

  const result =
    await supabaseClient
      .from("equipment_maintenance_photos")
      .select("photo_id,storage_path,created_at")
      .eq("maintenance_id", String(maintenanceId))
      .order("created_at", { ascending: true });

  if (result.error) {
    box.innerHTML =
      '<div class="photo-error-inline">' +
      escapeHtml(result.error.message) +
      "</div>";
    return;
  }

  if (!result.data?.length) {
    box.innerHTML =
      '<div class="photo-empty-inline">No photos attached to this maintenance record yet.</div>';
    return;
  }

  const cards = [];

  for (const photo of result.data) {
    const signed =
      await supabaseClient.storage
        .from("equipment-maintenance-evidence")
        .createSignedUrl(photo.storage_path, 60 * 60);

    if (signed.error) {
      cards.push(
        '<div class="inline-photo-card"><div class="photo-error-inline">Photo unavailable</div></div>'
      );
      continue;
    }

    cards.push(
      '<div class="inline-photo-card" data-photo-id="' +
        escapeHtml(photo.photo_id) +
      '">' +
        '<img src="' +
        escapeHtml(signed.data.signedUrl) +
        '" alt="Existing maintenance photo">' +
        '<div class="inline-photo-label">ATTACHED PHOTO</div>' +
        '<button class="photo-delete-button" type="button" onclick="deleteExistingMaintenancePhoto(\'' +
          escapeHtml(photo.photo_id) +
        '\', \'' +
          escapeHtml(photo.storage_path) +
        '\')">DELETE PHOTO</button>' +
      '</div>'
    );
  }

  box.innerHTML = cards.join("");
}

async function deleteExistingMaintenancePhoto(photoId, storagePath) {
  if (!photoId || !storagePath) return;

  const card =
    document.querySelector(
      '[data-photo-id="' + photoId.replace(/"/g, '\\\"') + '"]'
    );

  const ok =
    window.confirm(
      "Delete this maintenance photo? This cannot be undone."
    );

  if (!ok) return;

  try {
    const storageResult =
      await supabaseClient.storage
        .from("equipment-maintenance-evidence")
        .remove([storagePath]);

    if (storageResult.error) {
      throw storageResult.error;
    }

    const dbResult =
      await supabaseClient
        .from("equipment_maintenance_photos")
        .delete()
        .eq("photo_id", photoId);

    if (dbResult.error) {
      throw dbResult.error;
    }

    if (card) {
      card.remove();
    }

    const box = $("existingMaintenancePhotos");

    if (
      box &&
      !box.querySelector(".inline-photo-card")
    ) {
      box.innerHTML =
        '<div class="photo-empty-inline">No photos attached to this maintenance record yet. Choose a new photo above to add replacement evidence.</div>';
    }

  } catch (error) {
    console.error(error);
    showMessage(
      error.message ||
      "Unable to delete the maintenance photo.",
      "error"
    );
  }
}

function getMaintenancePayload(){
  return {
    equipment_id: $("equipmentId").value,
    project_id: $("projectId").value || null,
    maintenance_date: $("maintenanceDate").value,
    maintenance_type: $("maintenanceType").value,
    description: $("description").value.trim(),
    supplier_shop: $("supplierShop").value.trim() || null,
    reference_no: $("referenceNo").value.trim() || null,
    quantity: Number($("quantity").value || 0),
    unit: $("unit").value.trim() || "LOT",
    unit_cost: Number($("unitCost").value || 0),
    remarks: $("remarks").value.trim() || null
  };
}

function validateMaintenancePayload(payload){
  if (!payload.equipment_id)
    throw new Error("Please select equipment.");

  if (!payload.maintenance_date)
    throw new Error("Please select the date.");

  if (!payload.maintenance_type)
    throw new Error("Please select a maintenance type.");

  if (!payload.description)
    throw new Error("Please enter a description.");

  if (payload.quantity < 0)
    throw new Error("Quantity cannot be negative.");

  if (payload.unit_cost < 0)
    throw new Error("Unit cost cannot be negative.");
}

async function persistMaintenanceRecord(){
  const editingRecordId = state.editingId;
  const isEditing = !!editingRecordId;
  const payload = getMaintenancePayload();

  validateMaintenancePayload(payload);

  const totalAmount =
    Number(payload.quantity || 0) *
    Number(payload.unit_cost || 0);

  if (isEditing) {
    /*
      SAVE/EDIT MODE:
      Never submit or create an approval request automatically.
      The existing approval state stays exactly as it is.
    */
    const existingRecord = state.records.find(
      row => row.maintenance_id === editingRecordId
    );

    const existingApprovalStatus =
      existingRecord?.approval_status || "NOT REQUIRED";

    const result =
      await supabaseClient
        .from("equipment_maintenance")
        .update(payload)
        .eq("maintenance_id", editingRecordId);

    if (result.error)
      throw result.error;

    await uploadPhotosForMaintenance(editingRecordId);

    const equipmentName =
      equipmentNameById(payload.equipment_id);

    const projectName =
      projectNameById(payload.project_id);

    /*
      When an approval is already PENDING, refresh the existing approval
      details only. This does not submit another approval request.
    */
    if (existingApprovalStatus === "PENDING") {
      const { error: approvalUpdateError } =
        await supabaseClient.rpc(
          "amanah_update_pending_maintenance_approval",
          {
            p_entity_id: editingRecordId,
            p_title:
              equipmentName +
              " — " +
              (payload.maintenance_type || "MAINTENANCE"),
            p_description:
              "Maintenance request details updated. Existing General Manager approval request retained.",
            p_payload: {
              equipment_id: payload.equipment_id,
              equipment_name: equipmentName,
              project_id: payload.project_id || "",
              project_name: projectName,
              maintenance_date: payload.maintenance_date,
              maintenance_type: payload.maintenance_type,
              description: payload.description,
              supplier_shop: payload.supplier_shop || "",
              reference_no: payload.reference_no || "",
              quantity: payload.quantity,
              unit: payload.unit,
              unit_cost: payload.unit_cost,
              total_amount: totalAmount,
              remarks: payload.remarks || ""
            }
          }
        );

      if (approvalUpdateError)
        throw approvalUpdateError;
    }

    return {
      maintenanceId: editingRecordId,
      payload,
      totalAmount,
      existingApprovalStatus,
      isEditing: true
    };
  }

  /*
    NEW RECORD:
    Save as a draft only. approval_status remains the database default
    (NOT REQUIRED) until the user explicitly clicks SUBMIT FOR APPROVAL.
  */
  const result =
    await supabaseClient
      .from("equipment_maintenance")
      .insert(payload)
      .select()
      .single();

  if (result.error)
    throw result.error;

  const maintenanceId =
    result.data?.maintenance_id;

  if (!maintenanceId)
    throw new Error("Maintenance record was saved but its ID was not returned.");

  await uploadPhotosForMaintenance(maintenanceId);

  return {
    maintenanceId,
    payload,
    totalAmount,
    existingApprovalStatus: "NOT REQUIRED",
    isEditing: false
  };
}

async function saveRecord(event){
  event?.preventDefault();
  clearMessage();

  const button = $("saveButton");
  if (button) {
    button.disabled = true;
    button.textContent = "SAVING...";
  }

  try {
    await persistMaintenanceRecord();

    closeModal();

    showMessage(
      "Maintenance record saved successfully. No approval request was sent.",
      "success"
    );

    await loadRecords();
  } catch (error) {
    console.error(error);

    showMessage(
      error.message || "Unable to save maintenance record.",
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "SAVE";
    }
  }
}

async function submitMaintenanceForApproval(){
  clearMessage();

  const saveButton = $("saveButton");
  const submitButton = $("submitApprovalButton");

  if (saveButton) saveButton.disabled = true;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "SUBMITTING...";
  }

  try {
    const confirmed = window.confirm(
      "Submit this Maintenance Request to the General Manager for approval?\n\nAfter submission, the request will be marked PENDING and the GM can review it in the Approval Center."
    );

    if (!confirmed) return;

    const saved = await persistMaintenanceRecord();

    const equipmentName =
      equipmentNameById(saved.payload.equipment_id);

    const projectName =
      projectNameById(saved.payload.project_id);

    const { error: approvalError } =
      await supabaseClient.rpc(
        "amanah_submit_approval",
        {
          p_request_type: "MAINTENANCE",
          p_entity_id: saved.maintenanceId,
          p_title:
            equipmentName +
            " — " +
            (saved.payload.maintenance_type || "MAINTENANCE"),
          p_description:
            "Maintenance request submitted for General Manager approval.",
          p_payload: {
            equipment_id: saved.payload.equipment_id,
            equipment_name: equipmentName,
            project_id: saved.payload.project_id || "",
            project_name: projectName,
            maintenance_date: saved.payload.maintenance_date,
            maintenance_type: saved.payload.maintenance_type,
            description: saved.payload.description,
            supplier_shop: saved.payload.supplier_shop || "",
            reference_no: saved.payload.reference_no || "",
            quantity: saved.payload.quantity,
            unit: saved.payload.unit,
            unit_cost: saved.payload.unit_cost,
            total_amount: saved.totalAmount,
            remarks: saved.payload.remarks || ""
          }
        }
      );

    if (approvalError)
      throw approvalError;

    closeModal();

    showMessage(
      "Maintenance Request has been sent to the Approval Center for General Manager approval.",
      "success"
    );

    await loadRecords();
  } catch (error) {
    console.error(error);

    showMessage(
      error.message || "Unable to submit maintenance request for approval.",
      "error"
    );
  } finally {
    if (saveButton) saveButton.disabled = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "SUBMIT FOR APPROVAL";
    }
  }
}


async function openPhotoModal(maintenanceId) {
  state.photoMaintenanceId =
    maintenanceId;

  state.selectedPhotos = [];

  $("photoFileInput").value = "";
  $("photoUploadMessage").textContent =
    "Choose one or more photos, then upload them.";

  $("photoBackdrop").classList.add("open");

  await loadMaintenancePhotos(
    maintenanceId
  );
}

function closePhotoModal() {
  $("photoBackdrop").classList.remove("open");
  state.photoMaintenanceId = null;
  state.selectedPhotos = [];
}

async function loadMaintenancePhotos(
  maintenanceId
) {
  const box =
    $("maintenancePhotoGrid");

  box.innerHTML =
    '<div class="photo-empty">Loading photos...</div>';

  const result =
    await supabaseClient
      .from(
        "equipment_maintenance_photos"
      )
      .select(
        "photo_id,maintenance_id,storage_path,caption,created_at"
      )
      .eq(
        "maintenance_id",
        String(maintenanceId)
      )
      .order(
        "created_at",
        { ascending: true }
      );

  if (result.error) {
    box.innerHTML =
      '<div class="photo-error">' +
      escapeHtml(
        result.error.message
      ) +
      "</div>";
    return;
  }

  if (!result.data?.length) {
    box.innerHTML =
      '<div class="photo-empty">No maintenance photos attached yet.</div>';
    return;
  }

  const cards = [];

  for (const photo of result.data) {
    const signed =
      await supabaseClient.storage
        .from(
          "equipment-maintenance-evidence"
        )
        .createSignedUrl(
          photo.storage_path,
          60 * 60
        );

    if (signed.error) {
      cards.push(
        '<div class="maintenance-photo-card">' +
        '<div class="photo-error">Photo unavailable</div>' +
        "</div>"
      );
      continue;
    }

    cards.push(
      '<div class="maintenance-photo-card">' +
        '<img src="' +
          escapeHtml(
            signed.data.signedUrl
          ) +
          '" alt="Maintenance evidence">' +
        '<div class="maintenance-photo-meta">' +
          '<strong>MAINTENANCE PHOTO</strong>' +
        '</div>' +
      "</div>"
    );
  }

  box.innerHTML = cards.join("");
}

function handleMaintenancePhotoSelection(event) {
  state.selectedPhotos =
    Array.from(
      event.target.files || []
    );

  if (!state.selectedPhotos.length) {
    $("photoUploadMessage").textContent =
      "Choose one or more photos, then upload them.";
    return;
  }

  $("photoUploadMessage").textContent =
    state.selectedPhotos.length +
    " photo" +
    (
      state.selectedPhotos.length === 1
        ? ""
        : "s"
    ) +
    " selected.";
}

async function uploadMaintenancePhotos() {
  if (!state.photoMaintenanceId) {
    throw new Error(
      "Maintenance record not selected."
    );
  }

  if (!state.selectedPhotos.length) {
    throw new Error(
      "Please choose at least one photo."
    );
  }

  const button =
    $("uploadPhotosButton");

  button.disabled = true;
  button.textContent =
    "UPLOADING...";

  try {
    for (const file of state.selectedPhotos) {
      const ext =
        (
          file.name.split(".").pop() ||
          "jpg"
        )
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      const path =
        "maintenance/" +
        String(state.photoMaintenanceId) +
        "/" +
        crypto.randomUUID() +
        "." +
        ext;

      const upload =
        await supabaseClient.storage
          .from(
            "equipment-maintenance-evidence"
          )
          .upload(
            path,
            file,
            {
              cacheControl: "3600",
              upsert: false,
              contentType:
                file.type ||
                "image/jpeg"
            }
          );

      if (upload.error)
        throw upload.error;

      const insert =
        await supabaseClient
          .from(
            "equipment_maintenance_photos"
          )
          .insert({
            maintenance_id:
              String(
                state.photoMaintenanceId
              ),
            storage_path: path
          });

      if (insert.error)
        throw insert.error;
    }

    state.selectedPhotos = [];
    $("photoFileInput").value = "";

    $("photoUploadMessage").textContent =
      "Photos uploaded successfully.";

    await loadMaintenancePhotos(
      state.photoMaintenanceId
    );

  } finally {
    button.disabled = false;
    button.textContent =
      "UPLOAD PHOTOS";
  }
}

function openDeleteConfirm(record) {
  return new Promise(resolve => {
    const backdrop = $("deleteConfirmBackdrop");
    const confirmText = $("deleteConfirmText");

    confirmText.innerHTML =
      "Are you sure you want to delete this specific maintenance?" +
      "<div class=\"confirm-details\">" +
        "<div><span>Date</span><strong>" +
          escapeHtml(record.maintenance_date || "—") +
        "</strong></div>" +
        "<div><span>Equipment</span><strong>" +
          escapeHtml(equipmentNameById(record.equipment_id)) +
        "</strong></div>" +
        "<div><span>Type</span><strong>" +
          escapeHtml(record.maintenance_type || "—") +
        "</strong></div>" +
        "<div><span>Description</span><strong>" +
          escapeHtml(record.description || "—") +
        "</strong></div>" +
        "<div><span>Total</span><strong>" +
          money(record.total_amount) +
        "</strong></div>" +
      "</div>" +
      "<div class=\"confirm-warning\">" +
        "Any automatic Project Equipment Cost linked to this maintenance will also be removed." +
      "</div>";

    backdrop.classList.add("open");

    const finish = value => {
      backdrop.classList.remove("open");
      $("deleteConfirmYes").removeEventListener("click", yes);
      $("deleteConfirmNo").removeEventListener("click", no);
      backdrop.removeEventListener("click", outside);
      document.removeEventListener("keydown", escape);

      resolve(value);
    };

    const yes = () => finish(true);
    const no = () => finish(false);
    const outside = event => {
      if (event.target === backdrop) finish(false);
    };
    const escape = event => {
      if (event.key === "Escape") finish(false);
    };

    $("deleteConfirmYes").addEventListener("click", yes);
    $("deleteConfirmNo").addEventListener("click", no);
    backdrop.addEventListener("click", outside);
    document.addEventListener("keydown", escape);
  });
}

async function deleteRecord(id) {
  const record = state.records.find(
    row => row.maintenance_id === id
  );

  if (!record) return;

  const ok = await openDeleteConfirm(record);

  if (!ok) return;

  try {
    const result = await supabaseClient
      .from("equipment_maintenance")
      .delete()
      .eq("maintenance_id", id);

    if (result.error) throw result.error;

    showMessage(
      "Maintenance record deleted successfully.",
      "success"
    );

    await loadRecords();

  } catch (error) {
    console.error(error);
    showMessage(
      error.message || "Unable to delete maintenance record.",
      "error"
    );
  }
}

$("maintenanceNav").addEventListener(
  "click",
  function () {
    location.href = "equipment-maintenance.html";
  }
);

$("logoutButton").addEventListener("click", logout);
$("addButton").addEventListener("click", openModal);
$("closeModal").addEventListener("click", closeModal);
$("cancelButton").addEventListener("click", closeModal);
$("recordForm").addEventListener("submit", saveRecord);
$("printMaintenanceModal").addEventListener("click",()=>{
  if(!state.editingId)return;
  printMaintenanceRecord(state.editingId);
});
$("maintenancePhotoInput").addEventListener(
  "change",
  handleMaintenanceFormPhotos
);
$("photoFileInput").addEventListener(
  "change",
  handleMaintenancePhotoSelection
);
$("uploadPhotosButton").addEventListener(
  "click",
  async function () {
    try {
      await uploadMaintenancePhotos();
    } catch (error) {
      console.error(error);
      $("photoUploadMessage").textContent =
        error.message ||
        "Unable to upload photos.";
    }
  }
);
$("closePhotoModal").addEventListener(
  "click",
  closePhotoModal
);
$("closePhotoButton").addEventListener(
  "click",
  closePhotoModal
);
$("photoBackdrop").addEventListener(
  "click",
  function (event) {
    if (
      event.target ===
      $("photoBackdrop")
    ) {
      closePhotoModal();
    }
  }
);
$("quantity").addEventListener("input", calculateTotal);
$("unitCost").addEventListener("input", calculateTotal);

$("modalBackdrop").addEventListener(
  "click",
  function (event) {
    if (event.target === $("modalBackdrop")) {
      closeModal();
    }
  }
);

["equipmentFilter", "projectFilter", "typeFilter"].forEach(
  function (id) {
    $(id).addEventListener("change", render);
  }
);

(async function start() {
  try {
    const ok = await requireSession();
    if (!ok) return;

    await loadMasterData();
    await loadRecords();

  } catch (error) {
    console.error(error);
    showMessage(
      error.message || "Unable to load Equipment Maintenance.",
      "error"
    );
  }
})();
