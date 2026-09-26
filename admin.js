/* =========================================================
   AMANAH CONSTRUCTION MANAGEMENT SYSTEM
   MASTER DATA WEB PAGE

   Manages:
   - Employees
   - Equipment
   - Projects

   Attendance scanner is NOT modified by this file.
   ========================================================= */


/* =========================================================
   SUPABASE CONFIGURATION
   ========================================================= */

const SUPABASE_URL =
  'https://bafmycjninxomufhkjvy.supabase.co';

/*
 * COPY THE SAME PUBLISHABLE KEY FROM YOUR CURRENT app.js
 *
 * Do NOT use the secret key.
 */
const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';


const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


/* =========================================================
   APPLICATION STATE
   ========================================================= */

const state = {

  employees: [],
  equipment: [],
  projects: [],

  activeTab: 'employeesTab',

  modalMode: 'add',

  modalType: null,

  editId: null

};


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHtml(value) {

  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

}


function showMessage(
  elementId,
  message,
  type = 'info'
) {

  const element =
    document.getElementById(elementId);

  element.textContent = message;

  element.className =
    `message ${type}`;

}


function hideMessage(elementId) {

  const element =
    document.getElementById(elementId);

  element.className =
    'message hidden';

}


function setLoadingButton(
  button,
  loading,
  originalText
) {

  if (!button) {
    return;
  }

  button.disabled = loading;

  button.textContent =
    loading
      ? 'SAVING...'
      : originalText;

}


/* =========================================================
   AUTHENTICATION
   ========================================================= */

async function checkSession() {

  const {
    data,
    error
  } =
    await supabaseClient.auth.getSession();

  if (error) {
    throw error;
  }

  if (
    data &&
    data.session
  ) {

    showAdminApp(
      data.session.user
    );

    await loadAllData();

  } else {

    showLoginScreen();

  }

}


async function login(event) {

  event.preventDefault();

  hideMessage('loginMessage');

  const email =
    document.getElementById(
      'loginEmail'
    ).value.trim();

  const password =
    document.getElementById(
      'loginPassword'
    ).value;

  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      throw error;
    }

    showAdminApp(
      data.user
    );

    await loadAllData();

  } catch (error) {

    showMessage(
      'loginMessage',
      error.message ||
        'Unable to sign in.',
      'error'
    );

  }

}


async function logout() {

  await supabaseClient.auth.signOut();

  showLoginScreen();

}


function showLoginScreen() {

  document
    .getElementById('loginScreen')
    .classList.remove('hidden');

  document
    .getElementById('adminApp')
    .classList.add('hidden');

}


function showAdminApp(user) {

  document
    .getElementById('loginScreen')
    .classList.add('hidden');

  document
    .getElementById('adminApp')
    .classList.remove('hidden');

  document
    .getElementById('loggedInUser')
    .textContent =
      user?.email || '';

}


/* =========================================================
   LOAD DATA
   ========================================================= */

async function loadAllData() {

  showMessage(
    'globalMessage',
    'Loading master data...',
    'info'
  );

  try {

    await Promise.all([
      loadEmployees(),
      loadEquipment(),
      loadProjects()
    ]);

    renderEmployees();
    renderEquipment();
    renderProjects();

    hideMessage(
      'globalMessage'
    );

  } catch (error) {

    showMessage(
      'globalMessage',
      error.message ||
        'Unable to load master data.',
      'error'
    );

  }

}


async function loadEmployees() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from('employees')
      .select('*')
      .order(
        'employee_name',
        { ascending: true }
      );

  if (error) {
    throw new Error(
      `Employees: ${error.message}`
    );
  }

  state.employees =
    data || [];

}


async function loadEquipment() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from('equipment')
      .select('*')
      .order(
        'equipment_name',
        { ascending: true }
      );

  if (error) {
    throw new Error(
      `Equipment: ${error.message}`
    );
  }

  state.equipment =
    data || [];

}


async function loadProjects() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from('projects')
      .select('*')
      .order(
        'project_name',
        { ascending: true }
      );

  if (error) {
    throw new Error(
      `Projects: ${error.message}`
    );
  }

  state.projects =
    data || [];

}


/* =========================================================
   EMPLOYEES
   ========================================================= */

function renderEmployees() {

  const search =
    document
      .getElementById(
        'employeeSearch'
      )
      .value
      .trim()
      .toLowerCase();

  const rows =
    state.employees.filter(
      employee => {

        const text =
          [
            employee.employee_id,
            employee.employee_name,
            employee.position,
            employee.department,
            employee.status
          ]
          .join(' ')
          .toLowerCase();

        return text.includes(search);

      }
    );

  const body =
    document.getElementById(
      'employeesTableBody'
    );

  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td
          colspan="6"
          class="empty-row"
        >
          No employees found.
        </td>
      </tr>
    `;

    return;

  }

  body.innerHTML =
    rows.map(employee => `

      <tr>

        <td>
          ${escapeHtml(
            employee.employee_id
          )}
        </td>

        <td>
          ${escapeHtml(
            employee.employee_name
          )}
        </td>

        <td>
          ${escapeHtml(
            employee.position
          )}
        </td>

        <td>
          ${escapeHtml(
            employee.department
          )}
        </td>

        <td class="${
          employee.status === 'ACTIVE'
            ? 'status-active'
            : 'status-inactive'
        }">
          ${escapeHtml(
            employee.status
          )}
        </td>

        <td>

          <div class="action-buttons">

            <button
              class="small-button edit-button"
              onclick="editEmployee('${encodeURIComponent(
                employee.employee_id
              )}')"
            >
              EDIT
            </button>

          </div>

        </td>

      </tr>

    `).join('');

}


function editEmployee(encodedId) {

  const id =
    decodeURIComponent(
      encodedId
    );

  const employee =
    state.employees.find(
      item =>
        item.employee_id === id
    );

  if (!employee) {
    return;
  }

  openEmployeeModal(
    'edit',
    employee
  );

}


/* =========================================================
   EQUIPMENT
   ========================================================= */

function renderEquipment() {

  const search =
    document
      .getElementById(
        'equipmentSearch'
      )
      .value
      .trim()
      .toLowerCase();

  const rows =
    state.equipment.filter(
      equipment => {

        const text =
          [
            equipment.equipment_id,
            equipment.equipment_name,
            equipment.equipment_type,
            equipment.plate_number,
            equipment.status
          ]
          .join(' ')
          .toLowerCase();

        return text.includes(search);

      }
    );

  const body =
    document.getElementById(
      'equipmentTableBody'
    );

  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td
          colspan="6"
          class="empty-row"
        >
          No equipment found.
        </td>
      </tr>
    `;

    return;

  }

  body.innerHTML =
    rows.map(equipment => `

      <tr>

        <td>
          ${escapeHtml(
            equipment.equipment_id
          )}
        </td>

        <td>
          ${escapeHtml(
            equipment.equipment_name
          )}
        </td>

        <td>
          ${escapeHtml(
            equipment.equipment_type
          )}
        </td>

        <td>
          ${escapeHtml(
            equipment.plate_number
          )}
        </td>

        <td class="${
          equipment.status === 'ACTIVE'
            ? 'status-active'
            : 'status-inactive'
        }">
          ${escapeHtml(
            equipment.status
          )}
        </td>

        <td>

          <div class="action-buttons">

            <button
              class="small-button edit-button"
              onclick="editEquipment('${encodeURIComponent(
                equipment.equipment_id
              )}')"
            >
              EDIT
            </button>

          </div>

        </td>

      </tr>

    `).join('');

}


function editEquipment(encodedId) {

  const id =
    decodeURIComponent(
      encodedId
    );

  const equipment =
    state.equipment.find(
      item =>
        item.equipment_id === id
    );

  if (!equipment) {
    return;
  }

  openEquipmentModal(
    'edit',
    equipment
  );

}


/* =========================================================
   PROJECTS
   ========================================================= */

function renderProjects() {

  const search =
    document
      .getElementById(
        'projectSearch'
      )
      .value
      .trim()
      .toLowerCase();

  const rows =
    state.projects.filter(
      project => {

        const text =
          [
            project.project_id,
            project.project_name,
            project.client,
            project.location,
            project.site_engineer,
            project.status
          ]
          .join(' ')
          .toLowerCase();

        return text.includes(search);

      }
    );

  const body =
    document.getElementById(
      'projectsTableBody'
    );

  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td
          colspan="6"
          class="empty-row"
        >
          No projects found.
        </td>
      </tr>
    `;

    return;

  }

  body.innerHTML =
    rows.map(project => `

      <tr>

        <td>
          ${escapeHtml(
            project.project_id
          )}
        </td>

        <td>
          ${escapeHtml(
            project.project_name
          )}
        </td>

        <td>
          ${escapeHtml(
            project.client
          )}
        </td>

        <td>
          ${escapeHtml(
            project.location
          )}
        </td>

        <td class="${
          project.status === 'ACTIVE'
            ? 'status-active'
            : 'status-inactive'
        }">
          ${escapeHtml(
            project.status
          )}
        </td>

        <td>

          <div class="action-buttons">

            <button
              class="small-button edit-button"
              onclick="editProject('${encodeURIComponent(
                project.project_id
              )}')"
            >
              EDIT
            </button>

          </div>

        </td>

      </tr>

    `).join('');

}


function editProject(encodedId) {

  const id =
    decodeURIComponent(
      encodedId
    );

  const project =
    state.projects.find(
      item =>
        item.project_id === id
    );

  if (!project) {
    return;
  }

  openProjectModal(
    'edit',
    project
  );

}


/* =========================================================
   MODAL
   ========================================================= */

function openModal(
  title,
  type,
  mode,
  record
) {

  state.modalType =
    type;

  state.modalMode =
    mode;

  state.editId =
    record
      ? getRecordId(
          type,
          record
        )
      : null;

  document
    .getElementById(
      'modalTitle'
    )
    .textContent =
      title;

  document
    .getElementById(
      'modal'
    )
    .classList.remove(
      'hidden'
    );

}


function closeModal() {

  document
    .getElementById(
      'modal'
    )
    .classList.add(
      'hidden'
    );

  document
    .getElementById(
      'formFields'
    )
    .innerHTML = '';

  document
    .getElementById(
      'recordForm'
    )
    .reset();

  state.modalType = null;
  state.modalMode = 'add';
  state.editId = null;

}


function getRecordId(
  type,
  record
) {

  if (type === 'employee') {
    return record.employee_id;
  }

  if (type === 'equipment') {
    return record.equipment_id;
  }

  if (type === 'project') {
    return record.project_id;
  }

  return null;

}


/* =========================================================
   EMPLOYEE FORM
   ========================================================= */

function openEmployeeModal(
  mode,
  record = null
) {

  const values =
    record || {};

  document
    .getElementById(
      'formFields'
    )
    .innerHTML = `

      ${field(
        'Employee ID',
        'employee_id',
        values.employee_id,
        true
      )}

      ${field(
        'Employee Name',
        'employee_name',
        values.employee_name,
        true
      )}

      ${field(
        'Position',
        'position',
        values.position,
        true
      )}

      ${field(
        'Department',
        'department',
        values.department,
        true
      )}

      ${field(
        'Contact Number',
        'contact_number',
        values.contact_number
      )}

      ${field(
        'Date Hired',
        'date_hired',
        values.date_hired,
        false,
        'date'
      )}

      ${selectField(
        'Status',
        'status',
        ['ACTIVE', 'INACTIVE'],
        values.status || 'ACTIVE'
      )}

    `;

  openModal(
    mode === 'add'
      ? 'ADD EMPLOYEE'
      : 'EDIT EMPLOYEE',
    'employee',
    mode,
    record
  );

}


/* =========================================================
   EQUIPMENT FORM
   ========================================================= */

function openEquipmentModal(
  mode,
  record = null
) {

  const values =
    record || {};

  document
    .getElementById(
      'formFields'
    )
    .innerHTML = `

      ${field(
        'Equipment ID',
        'equipment_id',
        values.equipment_id,
        true
      )}

      ${field(
        'Equipment Name',
        'equipment_name',
        values.equipment_name,
        true
      )}

      ${field(
        'Equipment Type',
        'equipment_type',
        values.equipment_type,
        true
      )}

      ${field(
        'Plate Number',
        'plate_number',
        values.plate_number
      )}

      ${selectField(
        'Status',
        'status',
        ['ACTIVE', 'INACTIVE'],
        values.status || 'ACTIVE'
      )}

    `;

  openModal(
    mode === 'add'
      ? 'ADD EQUIPMENT'
      : 'EDIT EQUIPMENT',
    'equipment',
    mode,
    record
  );

}


/* =========================================================
   PROJECT FORM
   ========================================================= */

function openProjectModal(
  mode,
  record = null
) {

  const values =
    record || {};

  document
    .getElementById(
      'formFields'
    )
    .innerHTML = `

      ${field(
        'Project ID',
        'project_id',
        values.project_id,
        true
      )}

      ${field(
        'Project Name',
        'project_name',
        values.project_name,
        true
      )}

      ${field(
        'Client',
        'client',
        values.client
      )}

      ${field(
        'Location',
        'location',
        values.location
      )}

      ${field(
        'Site Engineer',
        'site_engineer',
        values.site_engineer
      )}

      ${field(
        'Start Date',
        'start_date',
        values.start_date,
        false,
        'date'
      )}

      ${field(
        'Target Completion',
        'target_completion',
        values.target_completion,
        false,
        'date'
      )}

      ${field(
        'Actual Completion',
        'actual_completion',
        values.actual_completion,
        false,
        'date'
      )}

      ${field(
        'Contract Amount',
        'contract_amount',
        values.contract_amount,
        false,
        'number',
        '0.00'
      )}

      ${field(
        'Current Progress (%)',
        'current_progress',
        values.current_progress,
        false,
        'number',
        '0'
      )}

      ${selectField(
        'Status',
        'status',
        ['ACTIVE', 'COMPLETED', 'ON HOLD', 'INACTIVE'],
        values.status || 'ACTIVE'
      )}

    `;

  openModal(
    mode === 'add'
      ? 'ADD PROJECT'
      : 'EDIT PROJECT',
    'project',
    mode,
    record
  );

}


/* =========================================================
   FORM FIELD HELPERS
   ========================================================= */

function field(
  label,
  name,
  value = '',
  required = false,
  type = 'text',
  placeholder = ''
) {

  return `

    <div class="form-field">

      <label for="${name}">
        ${escapeHtml(label)}
      </label>

      <input
        id="${name}"
        name="${name}"
        type="${type}"
        value="${escapeHtml(
          value ?? ''
        )}"
        placeholder="${escapeHtml(
          placeholder
        )}"
        ${required ? 'required' : ''}
      >

    </div>
  `;

}


function selectField(
  label,
  name,
  options,
  selected
) {

  return `

    <div class="form-field">

      <label for="${name}">
        ${escapeHtml(label)}
      </label>

      <select
        id="${name}"
        name="${name}"
        required
      >

        ${options.map(
          option => `

            <option
              value="${escapeHtml(option)}"
              ${option === selected
                ? 'selected'
                : ''}
            >
              ${escapeHtml(option)}
            </option>

          `
        ).join('')}

      </select>

    </div>

  `;

}


/* =========================================================
   SAVE RECORD
   ========================================================= */

async function saveRecord(event) {

  event.preventDefault();

  const form =
    document.getElementById(
      'recordForm'
    );

  const formData =
    new FormData(form);

  const values =
    Object.fromEntries(
      formData.entries()
    );

  const saveButton =
    form.querySelector(
      'button[type="submit"]'
    );

  setLoadingButton(
    saveButton,
    true,
    'SAVE'
  );

  try {

    if (
      state.modalType ===
      'employee'
    ) {

      await saveEmployee(
        values
      );

    }

    else if (
      state.modalType ===
      'equipment'
    ) {

      await saveEquipment(
        values
      );

    }

    else if (
      state.modalType ===
      'project'
    ) {

      await saveProject(
        values
      );

    }

    closeModal();

    await loadAllData();

    showMessage(
      'globalMessage',
      'Record saved successfully.',
      'success'
    );

  } catch (error) {

    showMessage(
      'globalMessage',
      error.message ||
        'Unable to save record.',
      'error'
    );

  } finally {

    setLoadingButton(
      saveButton,
      false,
      'SAVE'
    );

  }

}


/* =========================================================
   SAVE EMPLOYEE
   ========================================================= */

async function saveEmployee(
  values
) {

  const payload = {

    employee_id:
      values.employee_id.trim(),

    employee_name:
      values.employee_name.trim(),

    position:
      values.position.trim(),

    department:
      values.department.trim() ||
      null,

    contact_number:
      values.contact_number.trim() ||
      null,

    date_hired:
      values.date_hired ||
      null,

    status:
      values.status || 'ACTIVE'

  };


  if (
    state.modalMode ===
    'add'
  ) {

    const {
      error
    } =
      await supabaseClient
        .from('employees')
        .insert(
          payload
        );

    if (error) {
      throw new Error(
        `Employee: ${error.message}`
      );
    }

  } else {

    const {
      error
    } =
      await supabaseClient
        .from('employees')
        .update({
          ...payload,
          updated_at:
            new Date().toISOString()
        })
        .eq(
          'employee_id',
          state.editId
        );

    if (error) {
      throw new Error(
        `Employee: ${error.message}`
      );
    }

  }

}


/* =========================================================
   SAVE EQUIPMENT
   ========================================================= */

async function saveEquipment(
  values
) {

  const payload = {

    equipment_id:
      values.equipment_id.trim(),

    equipment_name:
      values.equipment_name.trim(),

    equipment_type:
      values.equipment_type.trim(),

    plate_number:
      values.plate_number.trim() ||
      null,

    status:
      values.status || 'ACTIVE'

  };


  if (
    state.modalMode ===
    'add'
  ) {

    const {
      error
    } =
      await supabaseClient
        .from('equipment')
        .insert(
          payload
        );

    if (error) {
      throw new Error(
        `Equipment: ${error.message}`
      );
    }

  } else {

    const {
      error
    } =
      await supabaseClient
        .from('equipment')
        .update({
          ...payload,
          updated_at:
            new Date().toISOString()
        })
        .eq(
          'equipment_id',
          state.editId
        );

    if (error) {
      throw new Error(
        `Equipment: ${error.message}`
      );
    }

  }

}


/* =========================================================
   SAVE PROJECT
   ========================================================= */

async function saveProject(
  values
) {

  const payload = {

    project_id:
      values.project_id.trim(),

    project_name:
      values.project_name.trim(),

    client:
      values.client.trim() ||
      null,

    location:
      values.location.trim() ||
      null,

    site_engineer:
      values.site_engineer.trim() ||
      null,

    start_date:
      values.start_date ||
      null,

    target_completion:
      values.target_completion ||
      null,

    actual_completion:
      values.actual_completion ||
      null,

    contract_amount:
      values.contract_amount === ''
        ? null
        : Number(
            values.contract_amount
          ),

    current_progress:
      values.current_progress === ''
        ? null
        : Number(
            values.current_progress
          ),

    status:
      values.status || 'ACTIVE'

  };


  if (
    state.modalMode ===
    'add'
  ) {

    const {
      error
    } =
      await supabaseClient
        .from('projects')
        .insert(
          payload
        );

    if (error) {
      throw new Error(
        `Project: ${error.message}`
      );
    }

  } else {

    const {
      error
    } =
      await supabaseClient
        .from('projects')
        .update({
          ...payload,
          updated_at:
            new Date().toISOString()
        })
        .eq(
          'project_id',
          state.editId
        );

    if (error) {
      throw new Error(
        `Project: ${error.message}`
      );
    }

  }

}


/* =========================================================
   TABS
   ========================================================= */

function setupTabs() {

  const buttons =
    document.querySelectorAll(
      '.tab-button'
    );

  buttons.forEach(
    button => {

      button.addEventListener(
        'click',
        () => {

          const tabId =
            button.dataset.tab;

          document
            .querySelectorAll(
              '.tab-button'
            )
            .forEach(
              item =>
                item.classList.remove(
                  'active'
                )
            );

          document
            .querySelectorAll(
              '.tab-panel'
            )
            .forEach(
              panel =>
                panel.classList.remove(
                  'active'
                )
            );

          button.classList.add(
            'active'
          );

          document
            .getElementById(
              tabId
            )
            .classList.add(
              'active'
            );

          state.activeTab =
            tabId;

        }
      );

    }
  );

}


/* =========================================================
   EVENT SETUP
   ========================================================= */

function setupEvents() {

  document
    .getElementById(
      'loginForm'
    )
    .addEventListener(
      'submit',
      login
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
      'addEmployeeButton'
    )
    .addEventListener(
      'click',
      () =>
        openEmployeeModal(
          'add'
        )
    );


  document
    .getElementById(
      'addEquipmentButton'
    )
    .addEventListener(
      'click',
      () =>
        openEquipmentModal(
          'add'
        )
    );


  document
    .getElementById(
      'addProjectButton'
    )
    .addEventListener(
      'click',
      () =>
        openProjectModal(
          'add'
        )
    );


  document
    .getElementById(
      'employeeSearch'
    )
    .addEventListener(
      'input',
      renderEmployees
    );


  document
    .getElementById(
      'equipmentSearch'
    )
    .addEventListener(
      'input',
      renderEquipment
    );


  document
    .getElementById(
      'projectSearch'
    )
    .addEventListener(
      'input',
      renderProjects
    );


  document
    .getElementById(
      'recordForm'
    )
    .addEventListener(
      'submit',
      saveRecord
    );


  document
    .getElementById(
      'closeModalButton'
    )
    .addEventListener(
      'click',
      closeModal
    );


  document
    .getElementById(
      'cancelModalButton'
    )
    .addEventListener(
      'click',
      closeModal
    );


  document
    .getElementById(
      'modal'
    )
    .addEventListener(
      'click',
      event => {

        if (
          event.target.id ===
          'modal'
        ) {
          closeModal();
        }

      }
    );


  setupTabs();

}


/* =========================================================
   AUTH STATE
   ========================================================= */

supabaseClient.auth.onAuthStateChange(
  async (_event, session) => {

    if (session) {

      showAdminApp(
        session.user
      );

      try {

        await loadAllData();

      } catch (error) {

        showMessage(
          'globalMessage',
          error.message,
          'error'
        );

      }

    } else {

      showLoginScreen();

    }

  }
);


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    setupEvents();

    try {

      await checkSession();

    } catch (error) {

      showMessage(
        'loginMessage',
        error.message ||
          'Unable to initialize application.',
        'error'
      );

    }

  }
);
