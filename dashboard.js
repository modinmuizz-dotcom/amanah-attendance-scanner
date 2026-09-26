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


loadDashboard();
