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
  budget: null
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
      current_progress,
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
  state.budget = null;

  $("projectId").value = "";
  $("projectName").value = "";
  $("contractAmount").value = "";
  $("approvedBudget").value = "";

  $("currentProgressText").textContent = "0%";
  $("progressBar").style.width = "0%";

  $("metricContract").textContent = money(0);
  $("metricBudget").textContent = money(0);
  $("metricActual").textContent = money(0);
  $("metricRemaining").textContent = money(0);
  $("metricUsage").textContent = "0.00%";

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

  $("projectId").value =
    project.project_id || "";

  $("projectName").value =
    project.project_name || "";

  $("contractAmount").value =
    money(project.contract_amount);

  const progress = Math.max(
    0,
    Math.min(100, number(project.current_progress))
  );

  $("currentProgressText").textContent =
    `${progress.toFixed(2)}%`;

  $("progressBar").style.width =
    `${progress}%`;

  $("metricContract").textContent =
    money(project.contract_amount);
}

/* =========================================================
   BUDGET
   ========================================================= */

async function loadBudget() {
  const projectId = selectedProjectId();

  if (!projectId) {
    $("approvedBudget").value = "";
    state.budget = null;
    return;
  }

  const { data, error } = await supabaseClient
    .from("project_budgets")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  state.budget = data || null;

  if (data) {
    $("approvedBudget").value =
      number(data.approved_budget).toFixed(2);
  } else {
    $("approvedBudget").value =
      number(
        state.selectedProject?.contract_amount
      ).toFixed(2);
  }

  updateMetrics();
}

async function saveBudget() {
  const projectId = selectedProjectId();

  if (!projectId) {
    showMessage(
      "Select a project first.",
      "error"
    );
    return;
  }

  const approvedBudget =
    number($("approvedBudget").value);

  if (approvedBudget < 0) {
    showMessage(
      "Approved budget cannot be negative.",
      "error"
    );
    return;
  }

  const button =
    $("saveBudgetButton");

  button.disabled = true;
  button.textContent = "SAVING...";

  try {
    const payload = {
      project_id: projectId,
      approved_budget: approvedBudget,
      notes: "AMANAH Project Cost Control"
    };

    const {
      data,
      error
    } = await supabaseClient
      .from("project_budgets")
      .upsert(
        payload,
        {
          onConflict: "project_id"
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    state.budget = data;

    showMessage(
      "Project budget saved successfully.",
      "success"
    );

    await refreshProjectData();

  } catch (error) {
    console.error(error);

    showMessage(
      "Could not save project budget: " +
      error.message,
      "error"
    );

  } finally {
    button.disabled = false;
    button.textContent = "SAVE BUDGET";
  }
}

/* =========================================================
   COST TRANSACTIONS
   ========================================================= */

async function loadTransactions() {
  const projectId = selectedProjectId();

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

  const contract =
    number(
      state.selectedProject?.contract_amount
    );

  const budget =
    number(
      state.budget?.approved_budget
    );

  const actual =
    state.transactions.reduce(
      (sum, item) =>
        sum + number(item.amount),
      0
    );

  const remaining =
    budget - actual;

  const usage =
    budget > 0
      ? (actual / budget) * 100
      : 0;

  $("metricContract").textContent =
    money(contract);

  $("metricBudget").textContent =
    money(budget);

  $("metricActual").textContent =
    money(actual);

  $("metricRemaining").textContent =
    money(remaining);

  $("metricUsage").textContent =
    `${Math.max(0, usage).toFixed(2)}%`;

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
    remaining < 0
      ? "#b91c1c"
      : "#0f172a";

  $("metricUsage").style.color =
    usage > 100
      ? "#b91c1c"
      : usage >= 90
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

    await loadBudget();

    await loadTransactions();

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

  await loadBudget();

  await loadTransactions();
}

async function refreshAll() {

  try {

    clearMessage();

    await loadProjects();

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
