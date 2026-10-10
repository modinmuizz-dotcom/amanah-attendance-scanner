/* =========================================================
   AMANAH PROJECT COST CONTROL
   GITHUB + SUPABASE
   NO APPS SCRIPT API
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
  projects: [],
  selectedProject: null,
  transactions: [],
  estimateCost: null,
  estimateStatus: "missing",
  projectDataVersion: 0
};

/* =========================================================
   HELPERS
   ========================================================= */

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
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function number(value) {
  return Number(value || 0);
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function showMessage(message, type = "info") {
  const box = $("message");

  if (!box) return;

  box.textContent = message;
  box.className = `message ${type}`;
  box.style.display = "block";

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function clearMessage() {
  const box = $("message");

  if (!box) return;

  box.style.display = "none";
  box.textContent = "";
}

function selectedProjectId() {
  return $("projectSelect").value || "";
}

function calculateModalAmount() {
  const quantity = number($("costQuantity").value);
  const unitCost = number($("costUnitPrice").value);

  $("costAmount").value =
    (quantity * unitCost).toFixed(2);
}

/* =========================================================
   AUTH
   ========================================================= */

async function requireSession() {
  const {
    data: { session },
    error
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error(error);
    throw error;
  }

  if (!session) {
    location.href = "index.html";
    return false;
  }

  return true;
}

/* =========================================================
   PROJECTS
   ========================================================= */

async function loadProjects() {
  const { data, error } = await supabaseClient
    .from("projects")
    .select(`
      project_id,
      project_name,
      client,
      location,
      site_engineer,
      start_date,
      target_completion,
      actual_completion,
      contract_amount,
      status
    `)
    .order("project_name", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  state.projects = data || [];

  const select = $("projectSelect");

  select.innerHTML =
    '<option value="">Select project</option>';

  state.projects.forEach(project => {
    const option = document.createElement("option");

    option.value = project.project_id;

    option.textContent =
      `${project.project_name} — ${project.project_id}`;

    select.appendChild(option);
  });
}

/* =========================================================
   PROJECT UI
   ========================================================= */

function clearProjectUI() {
  state.selectedProject = null;
  state.transactions = [];
  state.estimateCost = null;
  state.estimateStatus = "missing";
  state.projectDataVersion += 1;

  $("projectId").value = "";
  $("projectName").value = "";
  $("contractAmount").value = "";
  $("projectEstimateCost").value = "";

  renderCostProgress(0, 0);

  $("metricContract").textContent = money(0);
  $("metricEstimate").textContent = "—";
  $("metricActual").textContent = money(0);
  $("metricRemaining").textContent = "—";
  $("metricUsage").textContent = "—";

  $("breakdownLabor").textContent = money(0);
  $("breakdownEquipment").textContent = money(0);
  $("breakdownFuel").textContent = money(0);
  $("breakdownMaterial").textContent = money(0);
  $("breakdownOther").textContent = money(0);

  $("transactionSummary").textContent =
    "Select a project to view cost transactions.";

  $("costTableBody").innerHTML =
    '<tr><td colspan="9" class="empty">Select a project.</td></tr>';
}

function populateProjectUI(project) {
  state.selectedProject = project;
  state.estimateCost = null;
  state.estimateStatus = "loading";
  state.projectDataVersion += 1;
  $("projectEstimateCost").value = "Loading...";

  $("projectId").value =
    project.project_id || "";

  $("projectName").value =
    project.project_name || "";

  $("contractAmount").value =
    money(project.contract_amount);

  renderCostProgress(0, 0);

  $("metricContract").textContent =
    money(project.contract_amount);
}

/* =========================================================
   PROJECT ESTIMATE COST (READ-ONLY FROM PROJECT MASTER)
   Based on saved materials, labor, and custom BOM line totals.
   Never falls back to contract amount or legacy project_budgets.
   ========================================================= */

function renderCostProgress(actual = 0, estimateCost = null) {
  const text = $("currentProgressText");
  const bar = $("progressBar");
  const info = $("progressSourceInfo");

  const ready = state.estimateStatus === "ready";
  const hasEstimate = ready && estimateCost !== null &&
    Number.isFinite(estimateCost) && estimateCost >= 0;
  const positiveEstimate = hasEstimate && estimateCost > 0;
  const percent = positiveEstimate
    ? Math.max(0, (actual / estimateCost) * 100)
    : null;

  const widthPercent = percent === null ? 0 : Math.min(100, percent);
  text.textContent = percent === null ? "—" : `${percent.toFixed(2)}%`;
  bar.style.width = `${widthPercent}%`;
  bar.style.background = percent !== null && percent > 100 ? "#dc2626" : "";
  text.style.color = percent !== null && percent > 100 ? "#dc2626" : "";
  bar.setAttribute("aria-valuenow", String(widthPercent));
  bar.setAttribute("aria-valuetext",
    percent === null ? "Project estimate is not available"
      : `${percent.toFixed(2)}% of project estimate used`);

  if (!state.selectedProject) {
    info.textContent = "Select a project to view its estimate cost usage.";
  } else if (state.estimateStatus === "loading") {
    info.textContent = "Loading saved Project Estimate from Project Master...";
  } else if (state.estimateStatus === "error") {
    info.textContent = "Project Estimate could not be loaded. Use REFRESH to retry.";
  } else if (!hasEstimate) {
    info.textContent = "No Project Estimate saved yet. Save it in Project Master first.";
  } else if (!positiveEstimate) {
    info.textContent = "Saved Project Estimate is ₱0.00. Enter estimated quantities and rates in Project Master.";
  } else {
    info.textContent =
      `${money(actual)} actual cost of ${money(estimateCost)} saved Project Estimate` +
      (percent > 100 ? " • Estimate exceeded" : "");
  }
}

async function loadProjectEstimate() {
  const projectId = selectedProjectId();
  const version = state.projectDataVersion;
  if (!projectId || !state.selectedProject) return;

  // Project Master uses ROAD only for CONCRETING OF ROAD; otherwise GENERAL.
  const estimateType = state.selectedProject.project_type === "CONCRETING OF ROAD"
    ? "ROAD" : "GENERAL";

  if (state.estimateStatus !== "ready") {
    state.estimateStatus = "loading";
    $("projectEstimateCost").value = "Loading...";
    updateMetrics();
  }

  try {
    const { data, error } = await supabaseClient.rpc("get_project_estimate_cost", {
      p_project_id: projectId,
      p_estimate_type: estimateType
    });

    if (error) throw error;
    if (version !== state.projectDataVersion || projectId !== selectedProjectId()) return;

    const parsed = data === null ? null : Number(data);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      throw new Error("The saved Project Estimate total is invalid.");
    }

    state.estimateCost = parsed;
    state.estimateStatus = parsed === null ? "missing" : "ready";
    $("projectEstimateCost").value = parsed === null ? "Not saved" : money(parsed);
    updateMetrics();
  } catch (error) {
    if (version !== state.projectDataVersion || projectId !== selectedProjectId()) return;
    state.estimateCost = null;
    state.estimateStatus = "error";
    $("projectEstimateCost").value = "Unavailable";
    updateMetrics();
    throw error;
  }
}

/* =========================================================
   COST TRANSACTIONS
   ========================================================= */

async function loadTransactions() {
  const projectId = selectedProjectId();
  const version = state.projectDataVersion;

  if (!projectId) {
    state.transactions = [];

    renderTransactions();
    updateMetrics();

    return;
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("project_cost_entries")
    .select(`
      id,
      project_id,
      cost_date,
      cost_type,
      description,
      quantity,
      unit,
      unit_cost,
      amount,
      reference_id,
      notes,
      created_at,
      updated_at
    `)
    .eq("project_id", projectId)
    .order("cost_date", {
      ascending: false
    })
    .order("created_at", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  // Discard an obsolete response when a different project is selected.
  if (version !== state.projectDataVersion || projectId !== selectedProjectId()) return;

  state.transactions = data || [];

  renderTransactions();
  updateMetrics();
}

function renderTransactions() {
  const body =
    $("costTableBody");

  if (!state.selectedProject) {

    body.innerHTML =
      '<tr><td colspan="9" class="empty">Select a project.</td></tr>';

    return;
  }

  const rows =
    state.transactions;

  const total =
    rows.reduce(
      (sum, item) =>
        sum + number(item.amount),
      0
    );

  $("transactionSummary").textContent =
    `${rows.length} transaction` +
    `${rows.length === 1 ? "" : "s"} • ` +
    `${money(total)} total actual cost`;

  if (!rows.length) {

    body.innerHTML =
      '<tr><td colspan="9" class="empty">No cost transactions recorded for this project.</td></tr>';

    return;
  }

  body.innerHTML =
    rows.map(item => `
      <tr>

        <td>
          ${escapeHtml(
            formatDate(item.cost_date)
          )}
        </td>

        <td>
          <span class="type-badge">
            ${escapeHtml(item.cost_type)}
          </span>
        </td>

        <td>
          ${escapeHtml(item.description)}
        </td>

        <td>
          ${escapeHtml(
            number(item.quantity)
              .toLocaleString("en-PH", {
                maximumFractionDigits: 3
              })
          )}
        </td>

        <td>
          ${escapeHtml(item.unit || "")}
        </td>

        <td class="money">
          ${money(item.unit_cost)}
        </td>

        <td class="money">
          ${money(item.amount)}
        </td>

        <td>
          ${escapeHtml(
            item.reference_id || ""
          )}
        </td>

        <td>

          <button
            class="btn-danger"
            style="
              min-height:34px;
              padding:7px 10px;
              font-size:10px;
            "
            type="button"
            onclick="deleteCost('${escapeHtml(item.id)}')"
          >
            DELETE
          </button>

        </td>

      </tr>
    `).join("");
}

async function saveCost(event) {
  event.preventDefault();

  const projectId =
    selectedProjectId();

  if (!projectId) {
    showMessage(
      "Select a project first.",
      "error"
    );

    closeCostModal();

    return;
  }

  const costType =
    $("costType").value;

  const description =
    $("costDescription").value.trim();

  const costDate =
    $("costDate").value;

  const quantity =
    number($("costQuantity").value);

  const unit =
    $("costUnit").value.trim();

  const unitCost =
    number($("costUnitPrice").value);

  const amount =
    Number(
      (quantity * unitCost).toFixed(2)
    );

  const referenceId =
    $("costReference").value.trim();

  const notes =
    $("costNotes").value.trim();

  if (!costType) {
    showMessage(
      "Select a cost type.",
      "error"
    );
    return;
  }

  if (!description) {
    showMessage(
      "Enter a cost description.",
      "error"
    );
    return;
  }

  if (!costDate) {
    showMessage(
      "Select a cost date.",
      "error"
    );
    return;
  }

  if (
    quantity < 0 ||
    unitCost < 0
  ) {
    showMessage(
      "Quantity and unit cost cannot be negative.",
      "error"
    );
    return;
  }

  if (amount < 0) {
    showMessage(
      "Amount cannot be negative.",
      "error"
    );
    return;
  }

  const button =
    $("saveCostButton");

  button.disabled = true;
  button.textContent = "SAVING...";

  try {

    const payload = {
      project_id: projectId,
      cost_date: costDate,
      cost_type: costType,
      description,
      quantity,
      unit: unit || null,
      unit_cost: unitCost,
      amount,
      reference_id:
        referenceId || null,
      notes:
        notes || null
    };

    const { error } =
      await supabaseClient
        .from("project_cost_entries")
        .insert(payload);

    if (error) {
      throw error;
    }

    closeCostModal();

    showMessage(
      "Project cost saved successfully.",
      "success"
    );

    await refreshProjectData();

  } catch (error) {

    console.error(error);

    showMessage(
      "Could not save project cost: " +
      error.message,
      "error"
    );

  } finally {

    button.disabled = false;
    button.textContent = "SAVE COST";
  }
}

async function deleteCost(id) {

  if (!id) return;

  const transaction =
    state.transactions.find(
      item => item.id === id
    );

  if (!transaction) return;

  const confirmed =
    window.confirm(
      `Delete this cost entry?\n\n` +
      `${transaction.description}\n` +
      `${money(transaction.amount)}`
    );

  if (!confirmed) return;

  try {

    const { error } =
      await supabaseClient
        .from("project_cost_entries")
        .delete()
        .eq("id", id);

    if (error) {
      throw error;
    }

    showMessage(
      "Cost entry deleted.",
      "success"
    );

    await refreshProjectData();

  } catch (error) {

    console.error(error);

    showMessage(
      "Could not delete cost entry: " +
      error.message,
      "error"
    );
  }
}

/* =========================================================
   METRICS
   ========================================================= */

function updateMetrics() {

  const contract = number(state.selectedProject?.contract_amount);
  const estimate = state.estimateStatus === "ready"
    ? state.estimateCost : null;

  const actual = state.transactions.reduce(
    (sum, item) => sum + number(item.amount), 0
  );

  const remaining = estimate === null ? null : estimate - actual;
  const usage = estimate !== null && estimate > 0
    ? (actual / estimate) * 100 : null;

  renderCostProgress(actual, estimate);

  $("metricContract").textContent = money(contract);
  $("metricEstimate").textContent = estimate === null ? "—" : money(estimate);
  $("metricActual").textContent = money(actual);
  $("metricRemaining").textContent = remaining === null ? "—" : money(remaining);
  $("metricUsage").textContent = usage === null ? "—" : `${Math.max(0, usage).toFixed(2)}%`;

  const totals = {
    LABOR: 0,
    EQUIPMENT: 0,
    FUEL: 0,
    MATERIAL: 0,
    OTHER: 0
  };

  state.transactions.forEach(item => {

    const key =
      String(
        item.cost_type || ""
      ).toUpperCase();

    if (
      Object.prototype.hasOwnProperty.call(
        totals,
        key
      )
    ) {

      totals[key] +=
        number(item.amount);

    }
  });

  $("breakdownLabor").textContent =
    money(totals.LABOR);

  $("breakdownEquipment").textContent =
    money(totals.EQUIPMENT);

  $("breakdownFuel").textContent =
    money(totals.FUEL);

  $("breakdownMaterial").textContent =
    money(totals.MATERIAL);

  $("breakdownOther").textContent =
    money(totals.OTHER);

  $("metricRemaining").style.color =
    remaining !== null && remaining < 0
      ? "#b91c1c"
      : "#0f172a";

  $("metricUsage").style.color =
    usage !== null && usage > 100
      ? "#b91c1c"
      : usage !== null && usage >= 90
        ? "#ea580c"
        : "#0f172a";
}

/* =========================================================
   PROJECT CHANGE / REFRESH
   ========================================================= */

async function handleProjectChange() {

  clearMessage();

  const projectId =
    selectedProjectId();

  if (!projectId) {

    clearProjectUI();

    return;
  }

  const project =
    state.projects.find(
      item =>
        item.project_id === projectId
    );

  if (!project) {

    clearProjectUI();

    return;
  }

  try {

    populateProjectUI(project);

    state.transactions = [];
    updateMetrics();

    await Promise.all([
      loadProjectEstimate(),
      loadTransactions()
    ]);

  } catch (error) {

    console.error(error);

    showMessage(
      "Could not load project cost data: " +
      error.message,
      "error"
    );
  }
}

async function refreshProjectData() {

  if (!selectedProjectId()) {

    clearProjectUI();

    return;
  }

  const project =
    state.projects.find(
      item =>
        item.project_id ===
        selectedProjectId()
    );

  if (project) {
    state.selectedProject =
      project;
  }

  await Promise.all([
    loadProjectEstimate(),
    loadTransactions()
  ]);
}

async function refreshAll() {

  try {

    clearMessage();

    const previousProjectId = selectedProjectId();
    await loadProjects();

    if (state.projects.some(project => project.project_id === previousProjectId)) {
      $("projectSelect").value = previousProjectId;
    }

    if (selectedProjectId()) {

      await handleProjectChange();

    } else {

      clearProjectUI();

    }

  } catch (error) {

    console.error(error);

    showMessage(
      "Could not refresh Project Cost: " +
      error.message,
      "error"
    );
  }
}

/* =========================================================
   MODAL
   ========================================================= */

function openCostModal() {

  if (!selectedProjectId()) {

    showMessage(
      "Select a project before adding a cost.",
      "error"
    );

    return;
  }

  $("costForm").reset();

  $("costDate").value =
    localDateInputValue();

  $("costQuantity").value =
    "1";

  $("costUnitPrice").value =
    "0";

  calculateModalAmount();

  $("costModal").style.display =
    "grid";

  document.body.style.overflow =
    "hidden";
}

function closeCostModal() {

  $("costModal").style.display =
    "none";

  document.body.style.overflow =
    "";
}

function useContractAmount() {

  const contract =
    number(
      state.selectedProject?.contract_amount
    );

  if (!state.selectedProject) {

    showMessage(
      "Select a project first.",
      "error"
    );

    return;
  }

  $("approvedBudget").value =
    contract.toFixed(2);
}

/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

  await supabaseClient.auth.signOut();

  location.href =
    "index.html";
}

/* =========================================================
   STARTUP
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    try {

      const valid =
        await requireSession();

      if (!valid) {
        return;
      }

      $("projectSelect")
        .addEventListener(
          "change",
          handleProjectChange
        );

      $("saveBudgetButton")
        .addEventListener(
          "click",
          saveBudget
        );

      $("useContractButton")
        .addEventListener(
          "click",
          useContractAmount
        );

      $("addCostButton")
        .addEventListener(
          "click",
          openCostModal
        );

      $("closeCostModal")
        .addEventListener(
          "click",
          closeCostModal
        );

      $("cancelCostButton")
        .addEventListener(
          "click",
          closeCostModal
        );

      $("costForm")
        .addEventListener(
          "submit",
          saveCost
        );

      $("costQuantity")
        .addEventListener(
          "input",
          calculateModalAmount
        );

      $("costUnitPrice")
        .addEventListener(
          "input",
          calculateModalAmount
        );

      $("refreshButton")
        .addEventListener(
          "click",
          refreshAll
        );

      $("logoutButton")
        .addEventListener(
          "click",
          logout
        );

      $("costModal")
        .addEventListener(
          "click",
          (event) => {

            if (
              event.target ===
              $("costModal")
            ) {

              closeCostModal();

            }
          }
        );

      document.addEventListener(
        "keydown",
        (event) => {

          if (event.key === "Escape") {

            closeCostModal();

          }

        }
      );

      $("costDate").value =
        localDateInputValue();

      await loadProjects();

      // Pick up both edited Project Master estimates and new cost transactions.
      const updateProjectCostFigures = () => {
        if (!document.hidden && selectedProjectId()) {
          Promise.all([loadProjectEstimate(), loadTransactions()])
            .catch(error => console.error("Could not refresh project figures:", error));
        }
      };
      window.setInterval(updateProjectCostFigures, 60000);
      document.addEventListener("visibilitychange", updateProjectCostFigures);

      const params =
        new URLSearchParams(
          window.location.search
        );

      const preselected =
        params.get("project");

      if (
        preselected &&
        state.projects.some(
          project =>
            project.project_id ===
            preselected
        )
      ) {

        $("projectSelect").value =
          preselected;

        await handleProjectChange();

      }

    } catch (error) {

      console.error(error);

      showMessage(
        "AMANAH could not initialize: " +
        error.message,
        "error"
      );
    }
  }
);
