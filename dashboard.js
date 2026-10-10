/* =========================================================
   AMANAH CONSTRUCTION MANAGEMENT SYSTEM
   ADMIN DASHBOARD
   ========================================================= */

const SUPABASE_URL =
  'https://bafmycjninxomufhkjvy.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';


const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


function showMessage(
  message,
  type = 'error'
) {

  const element =
    document.getElementById(
      'message'
    );

  element.textContent =
    message;

  element.className =
    `message ${type}`;

}


function clearMessage() {

  const element =
    document.getElementById(
      'message'
    );

  element.className =
    'message';

  element.textContent =
    '';

}


function formatTime(value) {

  if (!value) {
    return '-';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }
  );

}


function formatDate(value) {

  if (!value) {
    return '-';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleDateString();

}


function escapeHtml(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value)
    .replaceAll(
      '&',
      '&amp;'
    )
    .replaceAll(
      '<',
      '&lt;'
    )
    .replaceAll(
      '>',
      '&gt;'
    )
    .replaceAll(
      '"',
      '&quot;'
    )
    .replaceAll(
      "'",
      '&#039;'
    );

}


async function requireSession() {

  const {
    data,
    error
  } =
    await supabaseClient
      .auth
      .getSession();

  if (error) {
    throw error;
  }

  if (
    !data ||
    !data.session
  ) {

    location.href =
      'admin.html';

    return null;

  }

  return data.session;

}


async function loadDashboard() {

  clearMessage();

  try {

    const session =
      await requireSession();

    if (!session) {
      return;
    }


    const [
      employeesResult,
      equipmentResult,
      projectsResult,
      attendanceResult
    ] =
      await Promise.all([

        supabaseClient
          .from('employees')
          .select('*'),

        supabaseClient
          .from('equipment')
          .select('*'),

        supabaseClient
          .from('projects')
          .select('*'),

        supabaseClient
          .from('attendance')
          .select('*')
          .order(
            'created_at',
            {
              ascending: false
            }
          )
          .limit(50)

      ]);


    if (
      employeesResult.error
    ) {
      throw employeesResult.error;
    }

    if (
      equipmentResult.error
    ) {
      throw equipmentResult.error;
    }

    if (
      projectsResult.error
    ) {
      throw projectsResult.error;
    }

    if (
      attendanceResult.error
    ) {
      throw attendanceResult.error;
    }


    const employees =
      employeesResult.data || [];

    const equipment =
      equipmentResult.data || [];

    const projects =
      projectsResult.data || [];

    const attendance =
      attendanceResult.data || [];


    renderSummary(
      employees,
      equipment,
      projects,
      attendance
    );

    renderAttendance(
      attendance
    );

    // Expense-based chart is independent of site activity progress.
    await loadDashboardProjectCostChart();

  } catch (error) {

    console.error(error);

    showMessage(
      error.message ||
      'Unable to load dashboard.'
    );

  }

}


function renderSummary(
  employees,
  equipment,
  projects,
  attendance
) {

  const today =
    new Date();

  const todayText =
    today
      .toISOString()
      .slice(
        0,
        10
      );


  const activeEmployees =
    employees.filter(
      row =>
        String(
          row.status || ''
        ).toUpperCase() ===
        'ACTIVE'
    ).length;


  const activeEquipment =
    equipment.filter(
      row =>
        String(
          row.status || ''
        ).toUpperCase() ===
        'ACTIVE'
    ).length;


  const activeProjects =
    projects.filter(
      row =>
        String(
          row.status || ''
        ).toUpperCase() ===
        'ACTIVE'
    ).length;


  const todaysAttendance =
    attendance.filter(
      row =>
        String(
          row.attendance_date || ''
        ).slice(
          0,
          10
        ) === todayText
    );


  const todayIn =
    todaysAttendance.length;


  const currentlyWorking =
    todaysAttendance.filter(
      row =>
        String(
          row.status || ''
        ).toUpperCase() ===
        'IN'
    ).length;


  const completedToday =
    todaysAttendance.filter(
      row =>
        String(
          row.status || ''
        ).toUpperCase() ===
        'COMPLETED'
    ).length;


  document
    .getElementById(
      'totalEmployees'
    )
    .textContent =
    employees.length;


  document
    .getElementById(
      'activeEmployees'
    )
    .textContent =
    activeEmployees;


  document
    .getElementById(
      'totalEquipment'
    )
    .textContent =
    equipment.length;


  document
    .getElementById(
      'activeEquipment'
    )
    .textContent =
    activeEquipment;


  document
    .getElementById(
      'activeProjects'
    )
    .textContent =
    activeProjects;


  document
    .getElementById(
      'todayIn'
    )
    .textContent =
    todayIn;


  document
    .getElementById(
      'currentlyWorking'
    )
    .textContent =
    currentlyWorking;


  document
    .getElementById(
      'completedToday'
    )
    .textContent =
    completedToday;

}


function renderAttendance(
  rows
) {

  const body =
    document.getElementById(
      'attendanceBody'
    );


  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td
          colspan="9"
          class="empty"
        >
          No attendance records found.
        </td>
      </tr>
    `;

    return;

  }


  body.innerHTML =
    rows
      .map(
        row => {

          const status =
            String(
              row.status || ''
            ).toUpperCase();


          let statusClass =
            'other';

          if (
            status === 'IN'
          ) {
            statusClass =
              'in';
          }
          else if (
            status ===
            'COMPLETED'
          ) {
            statusClass =
              'completed';
          }


          let fuel = '-';

          if (
            row.fuel_used === true
          ) {

            fuel =
              `${row.fuel_quantity ?? 0} ${
                row.fuel_unit || ''
              } | ₱${
                Number(
                  row.fuel_amount || 0
                ).toFixed(2)
              }`;

          }


          return `
            <tr>

              <td>
                ${escapeHtml(
                  row.employee_name
                )}
              </td>

              <td>
                ${escapeHtml(
                  row.equipment_name
                )}
              </td>

              <td>
                ${escapeHtml(
                  row.project_name
                )}
              </td>

              <td>
                ${escapeHtml(
                  formatDate(
                    row.attendance_date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  formatTime(
                    row.time_in
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  formatTime(
                    row.time_out
                  )
                )}
              </td>

              <td>
                ${
                  row.total_hours ===
                  null ||
                  row.total_hours ===
                  undefined
                    ? '-'
                    : Number(
                        row.total_hours
                      ).toFixed(2)
                }
              </td>

              <td>
                ${escapeHtml(
                  fuel
                )}
              </td>

              <td
                class="status ${
                  statusClass
                }"
              >
                ${escapeHtml(
                  status
                )}
              </td>

            </tr>
          `;

        }
      )
      .join('');

}



/* =========================================================
   PROJECT COST CHART — FINANCIAL EXPENSE UTILIZATION
   Not the Activity Calendar's physical/project-site progress.
   Data: project_cost_entries.amount / saved Project Master estimate.
   ========================================================= */

let dashboardCostRows = [];
let dashboardCostRequest = 0;

function dashboardCurrency(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP',
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Number(amount || 0));
}

function dashboardCostValue(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function normalizeDashboardCostRow(row) {
  const hasEstimate = row.estimate_cost !== null &&
    row.estimate_cost !== undefined &&
    Number.isFinite(Number(row.estimate_cost)) &&
    Number(row.estimate_cost) >= 0;
  const actual = dashboardCostValue(row.actual_cost);
  const estimate = hasEstimate ? Number(row.estimate_cost) : null;
  const usage = estimate !== null && estimate > 0
    ? Math.max(0, actual * 100 / estimate) : null;

  return {
    project_id: String(row.project_id || ''),
    project_name: String(row.project_name || 'Unnamed Project'),
    project_type: String(row.project_type || 'Not classified'),
    project_status: String(row.project_status || ''),
    actual,
    estimate,
    usage,
    hasEstimate
  };
}

function renderDashboardProjectCostChart() {
  const chart = document.getElementById('projectCostChartList');
  const count = document.getElementById('costChartCount');
  if (!chart || !count) return;

  const filter = document.getElementById('projectCostChartFilter')?.value || 'all';
  const all = dashboardCostRows;
  const rows = all.filter(row => {
    if (filter === 'saved') return row.hasEstimate;
    if (filter === 'missing') return !row.hasEstimate;
    if (filter === 'over') return row.usage !== null && row.usage > 100;
    return true;
  });

  // Keep projects without a usable percentage visible, but sort below measured projects.
  rows.sort((a, b) => {
    if (a.usage === null && b.usage !== null) return 1;
    if (a.usage !== null && b.usage === null) return -1;
    if (a.usage !== null && b.usage !== null && a.usage !== b.usage) return b.usage - a.usage;
    return a.project_name.localeCompare(b.project_name);
  });

  const totalActual = all.reduce((sum, row) => sum + row.actual, 0);
  const totalEstimate = all.reduce((sum, row) => sum + (row.estimate || 0), 0);
  const savedCount = all.filter(row => row.hasEstimate).length;

  document.getElementById('costChartTotalExpenses').textContent = dashboardCurrency(totalActual);
  document.getElementById('costChartTotalEstimate').textContent = dashboardCurrency(totalEstimate);
  document.getElementById('costChartCoverage').textContent = savedCount + ' / ' + all.length;
  count.textContent = rows.length + ' of ' + all.length + ' project' +
    (all.length === 1 ? '' : 's') + ' shown';

  if (all.length === 0) {
    chart.innerHTML = '<div class="cost-chart-blank">No projects recorded yet. Add a project in Project Master.</div>';
    return;
  }
  if (rows.length === 0) {
    chart.innerHTML = '<div class="cost-chart-blank">No projects match the selected cost filter.</div>';
    return;
  }

  chart.innerHTML = rows.map(row => {
    const positiveEstimate = row.estimate !== null && row.estimate > 0;
    const usage = row.usage;
    const isOver = usage !== null && usage > 100;
    const isWarn = usage !== null && usage >= 80 && !isOver;
    const tone = isOver ? 'over' : isWarn ? 'warn' : '';
    const pct = usage === null ? '—' : usage.toFixed(2) + '%';
    const width = usage === null ? 0 : Math.max(0, Math.min(100, usage));
    const estimateLabel = row.estimate === null
      ? 'Project estimate not saved'
      : !positiveEstimate
        ? 'Saved estimate is ₱0.00'
        : dashboardCurrency(row.actual) + ' / ' + dashboardCurrency(row.estimate);
    const stateLabel = row.estimate === null
      ? 'NO ESTIMATE'
      : !positiveEstimate
        ? 'ZERO ESTIMATE'
        : isOver
          ? 'OVER ESTIMATE'
          : row.actual === 0
            ? 'NO EXPENSES'
            : 'ESTIMATE USED';
    const progressText = usage === null
      ? 'Cost percentage unavailable without a positive saved estimate'
      : pct + ' of estimated cost used';

    return `
      <div class="cost-chart-entry">
        <div class="cost-chart-project">
          <a href="project-cost.html?project=${encodeURIComponent(row.project_id)}"
             title="Open cost control for ${escapeHtml(row.project_name)}">
            ${escapeHtml(row.project_name)}
          </a>
          <small>${escapeHtml(row.project_id)} • ${escapeHtml(row.project_type)}</small>
        </div>
        <div class="cost-chart-track-col">
          <div class="cost-chart-meter" role="progressbar"
               aria-label="Cost usage for ${escapeHtml(row.project_name)}"
               aria-valuemin="0" aria-valuemax="100"
               aria-valuenow="${width}"
               aria-valuetext="${escapeHtml(progressText)}">
            <div class="cost-chart-fill ${tone}" style="width:${width}%"></div>
          </div>
          <div class="cost-chart-line-sub">
            <span>${escapeHtml(estimateLabel)}</span>
            <span>${isOver ? 'Exceeded by ' + dashboardCurrency(row.actual - row.estimate) :
              row.estimate !== null && row.estimate > 0
                ? 'Remaining ' + dashboardCurrency(row.estimate - row.actual)
                : ''}</span>
          </div>
        </div>
        <div class="cost-chart-figure">
          <strong class="${usage === null ? 'missing' : tone}">${pct}</strong>
          <span>${stateLabel}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function loadDashboardProjectCostChart() {
  const chart = document.getElementById('projectCostChartList');
  const count = document.getElementById('costChartCount');
  const button = document.getElementById('refreshProjectCostChartButton');
  if (!chart || !count) return;

  const request = ++dashboardCostRequest;
  if (!dashboardCostRows.length) {
    count.textContent = 'Loading project expenses...';
    chart.innerHTML = '<div class="cost-chart-blank">Loading saved estimates and recorded expenses...</div>';
  }
  if (button) button.disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc('get_dashboard_project_cost_chart');
    if (error) throw error;
    if (request !== dashboardCostRequest) return;

    dashboardCostRows = (Array.isArray(data) ? data : []).map(normalizeDashboardCostRow);
    renderDashboardProjectCostChart();
  } catch (error) {
    if (request !== dashboardCostRequest) return;
    console.error('Project Cost Chart:', error);
    if (!dashboardCostRows.length) {
      count.textContent = 'Project cost data unavailable';
      chart.replaceChildren();
      const errorBox = document.createElement('div');
      errorBox.className = 'cost-chart-blank is-error';
      errorBox.textContent = 'Unable to load Project Cost Chart. Please refresh or check your access.';
      chart.appendChild(errorBox);
    }
  } finally {
    if (request === dashboardCostRequest && button) button.disabled = false;
  }
}

async function logout() {

  await supabaseClient
    .auth
    .signOut();

  location.href =
    'admin.html';

}


document
  .getElementById(
    'refreshButton'
  )
  .addEventListener(
    'click',
    loadDashboard
  );


document
  .getElementById(
    'logoutButton'
  )
  .addEventListener(
    'click',
    logout
  );


// Filters only change the presentation; the financial data is never modified.
document.getElementById('projectCostChartFilter')
  ?.addEventListener('change', renderDashboardProjectCostChart);

document.getElementById('refreshProjectCostChartButton')
  ?.addEventListener('click', loadDashboardProjectCostChart);

// Keep amounts current as costs or Project Master estimates are updated.
window.setInterval(() => {
  if (!document.hidden) {
    loadDashboardProjectCostChart();
  }
}, 60000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadDashboardProjectCostChart();
});

loadDashboard();
