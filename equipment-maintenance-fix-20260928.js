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
      "maintenance_id,equipment_id,project_id,maintenance_date,maintenance_type,description,supplier_shop,reference_no,quantity,unit,unit_cost,total_amount,remarks,created_at"
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
      '<tr><td colspan="12" class="empty">No maintenance records found.</td></tr>';
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
        "<td class=\"action-buttons\">" +
          "<button class=\"btn-action btn-edit\" type=\"button\" onclick=\"editRecord('" +
            escapeHtml(row.maintenance_id) +
            "')\">EDIT</button>" +

          "<button class=\"btn-danger\" type=\"button\" onclick=\"deleteRecord('" +
            escapeHtml(row.maintenance_id) +
            "')\">DELETE</button>" +
        "</td>" +
      "</tr>"
    );
  }).join("");
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

    $("saveButton").textContent =
      "UPDATE MAINTENANCE";

    $("modalBackdrop").classList.add("open");

    loadExistingMaintenancePhotos(
      record.maintenance_id
    );

  } else {
    $("modalTitle").textContent = "ADD MAINTENANCE";
    $("saveButton").textContent = "SAVE MAINTENANCE";
    $("modalBackdrop").classList.add("open");
  }
}

function closeModal() {
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

async function saveRecord(event) {
  event.preventDefault();
  clearMessage();

  const button = $("saveButton");
  button.disabled = true;
  const editingRecordId =
    state.editingId;

  const isEditing =
    !!editingRecordId;

  button.textContent =
    isEditing
      ? "UPDATING..."
      : "SAVING...";

  try {
    const payload = {
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

    if (!payload.equipment_id)
      throw new Error("Please select equipment.");

    if (!payload.maintenance_date)
      throw new Error("Please select the date.");

    if (!payload.description)
      throw new Error("Please enter a description.");

    if (payload.quantity < 0)
      throw new Error("Quantity cannot be negative.");

    if (payload.unit_cost < 0)
      throw new Error("Unit cost cannot be negative.");

    const totalAmount =
      Number(payload.quantity || 0) *
      Number(payload.unit_cost || 0);

    if (state.editingId) {
      /*
        total_amount is generated by the database from
        quantity × unit_cost. Do not send a value for it.
      */
      const result =
        await supabaseClient
          .from("equipment_maintenance")
          .update(payload)
          .eq(
            "maintenance_id",
            editingRecordId
          );

      if (result.error)
        throw result.error;

      await uploadPhotosForMaintenance(
        editingRecordId
      );

      closeModal();

      showMessage(
        payload.project_id
          ? "Maintenance updated successfully. Project Equipment cost was synchronized automatically."
          : "Maintenance updated successfully.",
        "success"
      );

    } else {
      /*
        total_amount is generated by the database from
        quantity × unit_cost. Do not send a value for it.
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

      await uploadPhotosForMaintenance(
        maintenanceId
      );

      closeModal();

      showMessage(
        payload.project_id
          ? "Maintenance saved successfully. The project Equipment cost was updated automatically."
          : "Maintenance saved successfully.",
        "success"
      );
    }

    await loadRecords();

  } catch (error) {
    console.error(error);

    showMessage(
      error.message ||
        "Unable to save maintenance record.",
      "error"
    );

  } finally {
    button.disabled = false;
    button.textContent =
      isEditing
        ? "UPDATE MAINTENANCE"
        : "SAVE MAINTENANCE";
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
