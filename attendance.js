/* =========================================================
   AMANAH CONSTRUCTION MANAGEMENT SYSTEM
   ATTENDANCE MANAGEMENT
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


let allAttendance = [];


/* =========================================================
   MESSAGE
   ========================================================= */

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

  element.textContent =
    '';

  element.className =
    'message';

}


/* =========================================================
   AUTHENTICATION
   ========================================================= */

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

    return false;

  }


  return true;

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHtml(
  value
) {

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


/* =========================================================
   DATE
   ========================================================= */

function formatDate(
  value
) {

  if (!value) {
    return '-';
  }


  const text =
    String(value)
      .slice(
        0,
        10
      );


  const parts =
    text.split('-');


  if (
    parts.length !== 3
  ) {
    return text;
  }


  return `${parts[1]}/${parts[2]}/${parts[0]}`;

}


/* =========================================================
   TIME
   ========================================================= */

function formatTime(
  value
) {

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
      hour:
        'numeric',

      minute:
        '2-digit',

      second:
        '2-digit'
    }
  );

}


/* =========================================================
   FUEL
   ========================================================= */

function formatFuel(
  row
) {

  if (
    row.fuel_used !== true
  ) {

    return `
      <span class="fuel-no">
        NO FUEL
      </span>
    `;

  }


  const quantity =
    row.fuel_quantity ??
    0;


  const unit =
    row.fuel_unit ||
    '';


  const amount =
    Number(
      row.fuel_amount ||
      0
    ).toFixed(2);


  return `
    <span class="fuel-yes">
      ${escapeHtml(quantity)}
      ${escapeHtml(unit)}
      |
      ₱${amount}
    </span>
  `;

}


/* =========================================================
   LOAD ATTENDANCE
   ========================================================= */

async function loadAttendance() {

  clearMessage();


  try {

    const loggedIn =
      await requireSession();


    if (!loggedIn) {
      return;
    }


    const {
      data,
      error
    } =
      await supabaseClient
        .from('attendance')
        .select('*')
        .order(
          'attendance_date',
          {
            ascending:
              false
          }
        )
        .order(
          'time_in',
          {
            ascending:
              false
          }
        )
        .limit(1000);


    if (error) {
      throw error;
    }


    allAttendance =
      data || [];


    applyFilters();


  } catch (error) {

    console.error(
      error
    );


    showMessage(
      error.message ||
      'Unable to load attendance.'
    );


    document
      .getElementById(
        'attendanceBody'
      )
      .innerHTML = `
        <tr>
          <td
            colspan="10"
            class="empty"
          >
            Unable to load attendance.
          </td>
        </tr>
      `;

  }

}


/* =========================================================
   FILTER
   ========================================================= */

function applyFilters() {

  const search =
    document
      .getElementById(
        'searchInput'
      )
      .value
      .trim()
      .toLowerCase();


  const date =
    document
      .getElementById(
        'dateInput'
      )
      .value;


  const status =
    document
      .getElementById(
        'statusFilter'
      )
      .value
      .toUpperCase();


  const filtered =
    allAttendance.filter(
      row => {


        const employee =
          String(
            row.employee_name ||
            ''
          )
          .toLowerCase();


        const equipment =
          String(
            row.equipment_name ||
            ''
          )
          .toLowerCase();


        const project =
          String(
            row.project_name ||
            ''
          )
          .toLowerCase();


        const employeeId =
          String(
            row.employee_id ||
            ''
          )
          .toLowerCase();


        const equipmentId =
          String(
            row.equipment_id ||
            ''
          )
          .toLowerCase();


        const projectId =
          String(
            row.project_id ||
            ''
          )
          .toLowerCase();


        const searchableText =
          `
          ${employee}
          ${equipment}
          ${project}
          ${employeeId}
          ${equipmentId}
          ${projectId}
          `
          .toLowerCase();


        const matchesSearch =
          !search ||
          searchableText.includes(
            search
          );


        const rowDate =
          String(
            row.attendance_date ||
            ''
          )
          .slice(
            0,
            10
          );


        const matchesDate =
          !date ||
          rowDate === date;


        const rowStatus =
          String(
            row.status ||
            ''
          )
          .toUpperCase();


        const matchesStatus =
          !status ||
          rowStatus ===
          status;


        return (
          matchesSearch &&
          matchesDate &&
          matchesStatus
        );

      }
    );


  renderAttendance(
    filtered
  );


  renderSummary(
    filtered
  );

}


/* =========================================================
   SUMMARY
   ========================================================= */

function renderSummary(
  rows
) {

  const records =
    rows.length;


  const inCount =
    rows.filter(
      row =>
        String(
          row.status ||
          ''
        ).toUpperCase() ===
        'IN'
    ).length;


  const completedCount =
    rows.filter(
      row =>
        String(
          row.status ||
          ''
        ).toUpperCase() ===
        'COMPLETED'
    ).length;


  const fuelCount =
    rows.filter(
      row =>
        row.fuel_used ===
        true
    ).length;


  document
    .getElementById(
      'recordsCount'
    )
    .textContent =
    records;


  document
    .getElementById(
      'inCount'
    )
    .textContent =
    inCount;


  document
    .getElementById(
      'completedCount'
    )
    .textContent =
    completedCount;


  document
    .getElementById(
      'fuelCount'
    )
    .textContent =
    fuelCount;

}


/* =========================================================
   TABLE
   ========================================================= */

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
          colspan="10"
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
              row.status ||
              ''
            ).toUpperCase();


          let statusClass =
            'status-other';


          if (
            status === 'IN'
          ) {

            statusClass =
              'status-in';

          }
          else if (
            status ===
            'COMPLETED'
          ) {

            statusClass =
              'status-completed';

          }


          const totalHours =
            row.total_hours ===
              null ||
            row.total_hours ===
              undefined
              ? '-'
              : Number(
                  row.total_hours
                ).toFixed(2);


          return `
            <tr>

              <td>
                ${escapeHtml(
                  row.attendance_id
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    row.employee_name
                  )}
                </strong>

                <br>

                <small>
                  ${escapeHtml(
                    row.employee_id
                  )}
                </small>
              </td>

              <td>
                ${escapeHtml(
                  row.equipment_name
                )}

                <br>

                <small>
                  ${escapeHtml(
                    row.equipment_id
                  )}
                </small>
              </td>

              <td>
                ${escapeHtml(
                  row.project_name
                )}

                <br>

                <small>
                  ${escapeHtml(
                    row.project_id
                  )}
                </small>
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
                ${escapeHtml(
                  totalHours
                )}
              </td>

              <td>
                ${formatFuel(row)}
              </td>

              <td
                class="
                  status
                  ${statusClass}
                "
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
   CLEAR FILTERS
   ========================================================= */

function clearFilters() {

  document
    .getElementById(
      'searchInput'
    )
    .value =
    '';


  document
    .getElementById(
      'dateInput'
    )
    .value =
    '';


  document
    .getElementById(
      'statusFilter'
    )
    .value =
    '';


  applyFilters();

}


/* =========================================================
   LOG OUT
   ========================================================= */

async function logout() {

  try {

    await supabaseClient
      .auth
      .signOut();


    location.href =
      'admin.html';

  } catch (error) {

    showMessage(
      error.message ||
      'Logout failed.'
    );

  }

}


/* =========================================================
   EVENT HANDLERS
   ========================================================= */

document
  .getElementById(
    'filterButton'
  )
  .addEventListener(
    'click',
    applyFilters
  );


document
  .getElementById(
    'clearButton'
  )
  .addEventListener(
    'click',
    clearFilters
  );


document
  .getElementById(
    'refreshButton'
  )
  .addEventListener(
    'click',
    loadAttendance
  );


document
  .getElementById(
    'logoutButton'
  )
  .addEventListener(
    'click',
    logout
  );


document
  .getElementById(
    'searchInput'
  )
  .addEventListener(
    'input',
    applyFilters
  );


document
  .getElementById(
    'statusFilter'
  )
  .addEventListener(
    'change',
    applyFilters
  );


/* =========================================================
   START
   ========================================================= */

loadAttendance();
