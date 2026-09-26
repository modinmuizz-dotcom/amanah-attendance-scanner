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
  records: []
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
  const result = await supabaseClient
    .from("equipment_maintenance")
    .select("maintenance_id,equipment_id,project_id,maintenance_date,maintenance_type,description,supplier_shop,reference_no,quantity,unit,unit_cost,total_amount,remarks,equipment(equipment_name),projects(project_name)")
    .order("maintenance_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (result.error) throw result.error;

  state.records = result.data || [];
  render();
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
      row.equipment?.equipment_name || row.equipment_id;

    const projectName =
      row.projects?.project_name || row.project_id || "—";

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
        "<td><button class=\"btn-danger\" type=\"button\" onclick=\"deleteRecord('" +
          escapeHtml(row.maintenance_id) +
          "')\">DELETE</button></td>" +
      "</tr>"
    );
  }).join("");
}

function calculateTotal() {
  const quantity = Number($("quantity").value || 0);
  const unitCost = Number($("unitCost").value || 0);
  $("totalAmount").value = (quantity * unitCost).toFixed(2);
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
}

function openModal() {
  clearMessage();
  resetForm();
  $("modalBackdrop").classList.add("open");
}

function closeModal() {
  $("modalBackdrop").classList.remove("open");
}

async function saveRecord(event) {
  event.preventDefault();
  clearMessage();

  const button = $("saveButton");
  button.disabled = true;
  button.textContent = "SAVING...";

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

    if (!payload.equipment_id) throw new Error("Please select equipment.");
    if (!payload.maintenance_date) throw new Error("Please select the date.");
    if (!payload.description) throw new Error("Please enter a description.");
    if (payload.quantity < 0) throw new Error("Quantity cannot be negative.");
    if (payload.unit_cost < 0) throw new Error("Unit cost cannot be negative.");

    const result = await supabaseClient
      .from("equipment_maintenance")
      .insert(payload)
      .select()
      .single();

    if (result.error) throw result.error;

    closeModal();

    showMessage(
      payload.project_id
        ? "Maintenance saved successfully. The project Equipment cost was updated automatically."
        : "Maintenance saved successfully.",
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
    button.disabled = false;
    button.textContent = "SAVE MAINTENANCE";
  }
}

async function deleteRecord(id) {
  const record = state.records.find(
    row => row.maintenance_id === id
  );

  if (!record) return;

  const ok = window.confirm(
    "Delete this maintenance record? Any automatic project Equipment cost linked to it will also be removed."
  );

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
