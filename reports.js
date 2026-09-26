/* =========================================================
   AMANAH CONSTRUCTION MANAGEMENT SYSTEM
   ATTENDANCE REPORTS
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
let filteredAttendance = [];


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


  return (
    `${parts[1]}/${parts[2]}/${parts[0]}`
  );

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
        .limit(5000);


    if (error) {
      throw error;
    }


    allAttendance =
      data || [];


    buildFilterOptions();


    applyFilters();


  } catch (error) {

    console.error(
      error
    );


    showMessage(
      error.message ||
      'Unable to load reports.'
    );

  }

}


/* =========================================================
   FILTER OPTIONS
   ========================================================= */

function buildFilterOptions() {

  const employeeMap =
    new Map();

  const equipmentMap =
    new Map();

  const projectMap =
    new Map();


  allAttendance.forEach(
    row => {

      if (
        row.employee_id
      ) {

        employeeMap.set(
          row.employee_id,
          row.employee_name || ''
        );

      }


      if (
        row.equipment_id
      ) {

        equipmentMap.set(
          row.equipment_id,
          row.equipment_name || ''
        );

      }


      if (
        row.project_id
      ) {

        projectMap.set(
          row.project_id,
          row.project_name || ''
        );

      }

    }
  );


  const employeeSelect =
    document.getElementById(
      'employeeFilter'
    );


  const equipmentSelect =
    document.getElementById(
      'equipmentFilter'
    );


  const projectSelect =
    document.getElementById(
      'projectFilter'
    );


  employeeSelect.innerHTML =
    `
      <option value="">
        ALL EMPLOYEES
      </option>
    `;


  equipmentSelect.innerHTML =
    `
      <option value="">
        ALL EQUIPMENT
      </option>
    `;


  projectSelect.innerHTML =
    `
      <option value="">
        ALL PROJECTS
      </option>
    `;


  [...employeeMap.entries()]
    .sort(
      (a, b) =>
        String(a[1]).localeCompare(
          String(b[1])
        )
    )
    .forEach(
      ([id, name]) => {

        const option =
          document.createElement(
            'option'
          );

        option.value =
          id;

        option.textContent =
          `${name} — ${id}`;

        employeeSelect.appendChild(
          option
        );

      }
    );


  [...equipmentMap.entries()]
    .sort(
      (a, b) =>
        String(a[1]).localeCompare(
          String(b[1])
        )
    )
    .forEach(
      ([id, name]) => {

        const option =
          document.createElement(
            'option'
          );

        option.value =
          id;

        option.textContent =
          `${name} — ${id}`;

        equipmentSelect.appendChild(
          option
        );

      }
    );


  [...projectMap.entries()]
    .sort(
      (a, b) =>
        String(a[1]).localeCompare(
          String(b[1])
        )
    )
    .forEach(
      ([id, name]) => {

        const option =
          document.createElement(
            'option'
          );

        option.value =
          id;

        option.textContent =
          `${name} — ${id}`;

        projectSelect.appendChild(
          option
        );

      }
    );

}


/* =========================================================
   APPLY FILTERS
   ========================================================= */

function applyFilters() {

  const dateFrom =
    document.getElementById(
      'dateFrom'
    ).value;


  const dateTo =
    document.getElementById(
      'dateTo'
    ).value;


  const employee =
    document.getElementById(
      'employeeFilter'
    ).value;


  const equipment =
    document.getElementById(
      'equipmentFilter'
    ).value;


  const project =
    document.getElementById(
      'projectFilter'
    ).value;


  const status =
    document.getElementById(
      'statusFilter'
    ).value
      .toUpperCase();


  const fuel =
    document.getElementById(
      'fuelFilter'
    ).value;


  const search =
    document.getElementById(
      'searchInput'
    ).value
      .trim()
      .toLowerCase();


  filteredAttendance =
    allAttendance.filter(
      row => {

        const rowDate =
          String(
            row.attendance_date ||
            ''
          )
          .slice(
            0,
            10
          );


        if (
          dateFrom &&
          rowDate < dateFrom
        ) {

          return false;

        }


        if (
          dateTo &&
          rowDate > dateTo
        ) {

          return false;

        }


        if (
          employee &&
          String(
            row.employee_id ||
            ''
          ) !== employee
        ) {

          return false;

        }


        if (
          equipment &&
          String(
            row.equipment_id ||
            ''
          ) !== equipment
        ) {

          return false;

        }


        if (
          project &&
          String(
            row.project_id ||
            ''
          ) !== project
        ) {

          return false;

        }


        const rowStatus =
          String(
            row.status ||
            ''
          )
          .toUpperCase();


        if (
          status &&
          rowStatus !== status
        ) {

          return false;

        }


        if (
          fuel === 'YES' &&
          row.fuel_used !== true
        ) {

          return false;

        }


        if (
          fuel === 'NO' &&
          row.fuel_used === true
        ) {

          return false;

        }


        const searchText = [

          row.employee_id,

          row.employee_name,

          row.equipment_id,

          row.equipment_name,

          row.project_id,

          row.project_name,

          row.attendance_id,

          row.status

        ]

          .map(
            value =>
              String(
                value ||
                ''
              )
              .toLowerCase()
          )

          .join(' ');


        if (
          search &&
          !searchText.includes(
            search
          )
        ) {

          return false;

        }


        return true;

      }
    );


  renderSummary(
    filteredAttendance
  );


  renderReport(
    filteredAttendance
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


  const totalHours =
    rows.reduce(
      (
        total,
        row
      ) => {

        return (
          total +
          Number(
            row.total_hours ||
            0
          )
        );

      },
      0
    );


  const inCount =
    rows.filter(
      row =>
        String(
          row.status ||
          ''
        )
          .toUpperCase() ===
        'IN'
    ).length;


  const completedCount =
    rows.filter(
      row =>
        String(
          row.status ||
          ''
        )
          .toUpperCase() ===
        'COMPLETED'
    ).length;


  const fuelCount =
    rows.filter(
      row =>
        row.fuel_used ===
        true
    ).length;


  const fuelAmount =
    rows.reduce(
      (
        total,
        row
      ) => {

        return (
          total +
          Number(
            row.fuel_amount ||
            0
          )
        );

      },
      0
    );


  document.getElementById(
    'recordsCount'
  ).textContent =
    records;


  document.getElementById(
    'hoursCount'
  ).textContent =
    totalHours.toFixed(2);


  document.getElementById(
    'inCount'
  ).textContent =
    inCount;


  document.getElementById(
    'completedCount'
  ).textContent =
    completedCount;


  document.getElementById(
    'fuelCount'
  ).textContent =
    fuelCount;


  document.getElementById(
    'fuelAmount'
  ).textContent =
    `₱${fuelAmount.toFixed(2)}`;

}


/* =========================================================
   RENDER REPORT
   ========================================================= */

function renderReport(
  rows
) {

  const body =
    document.getElementById(
      'reportBody'
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
            )
            .toUpperCase();


          let statusClass =
            'status-other';


          if (
            status ===
            'IN'
          ) {

            statusClass =
              'status-in';

          }


          if (
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
                )
                .toFixed(2);


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

                <small>
                  ${escapeHtml(
                    row.employee_id
                  )}
                </small>

              </td>

              <td>

                <strong>
                  ${escapeHtml(
                    row.equipment_name
                  )}
                </strong>

                <small>
                  ${escapeHtml(
                    row.equipment_id
                  )}
                </small>

              </td>

              <td>

                <strong>
                  ${escapeHtml(
                    row.project_name
                  )}
                </strong>

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

              <td>

                <span
                  class="
                    status
                    ${statusClass}
                  "
                >
                  ${escapeHtml(
                    status
                  )}
                </span>

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

  document.getElementById(
    'dateFrom'
  ).value =
    '';


  document.getElementById(
    'dateTo'
  ).value =
    '';


  document.getElementById(
    'employeeFilter'
  ).value =
    '';


  document.getElementById(
    'equipmentFilter'
  ).value =
    '';


  document.getElementById(
    'projectFilter'
  ).value =
    '';


  document.getElementById(
    'statusFilter'
  ).value =
    '';


  document.getElementById(
    'fuelFilter'
  ).value =
    '';


  document.getElementById(
    'searchInput'
  ).value =
    '';


  applyFilters();

}


/* =========================================================
   EXPORT CSV
   ========================================================= */

function exportCSV() {

  if (
    !filteredAttendance.length
  ) {

    showMessage(
      'There are no records to export.'
    );

    return;

  }


  const headers = [

    'Attendance ID',
    'Employee ID',
    'Employee Name',
    'Equipment ID',
    'Equipment Name',
    'Project ID',
    'Project Name',
    'Date',
    'Time In',
    'Time Out',
    'Total Hours',
    'Fuel Used',
    'Fuel Quantity',
    'Fuel Unit',
    'Fuel Amount',
    'Status'

  ];


  const rows =
    filteredAttendance.map(
      row => [

        row.attendance_id || '',

        row.employee_id || '',

        row.employee_name || '',

        row.equipment_id || '',

        row.equipment_name || '',

        row.project_id || '',

        row.project_name || '',

        row.attendance_date || '',

        row.time_in || '',

        row.time_out || '',

        row.total_hours ?? '',

        row.fuel_used
          ? 'YES'
          : 'NO',

        row.fuel_quantity ?? '',

        row.fuel_unit || '',

        row.fuel_amount ?? '',

        row.status || ''

      ]
    );


  const csv = [

    headers,

    ...rows

  ]

    .map(
      row =>
        row
          .map(
            value =>
              `"${String(
                value
              )
                .replaceAll(
                  '"',
                  '""'
                )}"`
          )
          .join(',')
    )

    .join('\r\n');


  const blob =
    new Blob(
      [csv],
      {
        type:
          'text/csv;charset=utf-8;'
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      'a'
    );


  link.href =
    url;


  link.download =
    `AMANAH_ATTENDANCE_REPORT_${new Date()
      .toISOString()
      .slice(
        0,
        10
      )}.csv`;


  document.body.appendChild(
    link
  );


  link.click();


  link.remove();


  URL.revokeObjectURL(
    url
  );

}


/* =========================================================
   LOGOUT
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
   EVENTS
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
    'exportButton'
  )
  .addEventListener(
    'click',
    exportCSV
  );


document
  .getElementById(
    'printButton'
  )
  .addEventListener(
    'click',
    () => window.print()
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


document
  .getElementById(
    'fuelFilter'
  )
  .addEventListener(
    'change',
    applyFilters
  );


/* =========================================================
   START
   ========================================================= */

loadAttendance();
