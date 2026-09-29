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

const PROJECT_TYPES = [
  'CONCRETING OF ROAD',
  'MULTI PURPOSE BUILDING',
  'SCHOOL BUILDING',
  'FLOOD CONTROL',
  'WATER SYSTEM',
  'BRIDGE',
  'COVERED COURT'
];

const ROAD_MATERIAL_BOM = [
  {
    description: 'Cement',
    unit: 'TUNNER BAG',
    factor: 0.34,
    formula: 'PAVEMENT AREA × 0.34'
  },
  {
    description: 'Rebar - Longitudinal Section',
    unit: 'REBAR',
    factor: 0.17,
    formula: 'PAVEMENT AREA × 0.17'
  },
  {
    description: 'Rebar - Transverse Section',
    unit: 'REBAR',
    factor: 0.14,
    formula: 'PAVEMENT AREA × 0.14'
  },
  {
    description: 'Gravel',
    unit: 'CUBIC METER',
    factor: 1.15,
    formula: 'PAVEMENT AREA × 1.15'
  },
  {
    description: 'Sand',
    unit: 'CUBIC METER',
    factor: 0.58,
    formula: 'PAVEMENT AREA × 0.58'
  }
];


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
  suppliers: [],

  activeTab: 'employeesTab',

  modalMode: 'add',

  modalType: null,

  editId: null,

  pendingProjectModal: null,

  materialEstimateProjectId: null

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
      loadProjects(),
      loadSuppliers()
    ]);

    renderEmployees();
    renderEquipment();
    renderProjects();
    renderSuppliers();

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


async function loadSuppliers() {

  const { data, error } =
    await supabaseClient
      .from('suppliers')
      .select('*')
      .order('supplier_name', { ascending: true });

  if (error) {
    throw new Error(
      `Suppliers: ${error.message}`
    );
  }

  state.suppliers = data || [];

}


function renderSuppliers() {

  const search =
    document
      .getElementById('supplierSearch')
      .value
      .trim()
      .toLowerCase();

  const rows =
    state.suppliers.filter(
      supplier => {

        const text =
          [
            supplier.supplier_code,
            supplier.supplier_name,
            supplier.contact_person,
            supplier.contact_number,
            supplier.email,
            supplier.address,
            supplier.tin,
            supplier.status
          ]
          .join(' ')
          .toLowerCase();

        return text.includes(search);

      }
    );

  const body =
    document.getElementById(
      'suppliersTableBody'
    );

  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td
          colspan="7"
          class="empty-row"
        >
          No suppliers found.
        </td>
      </tr>
    `;

    return;

  }

  body.innerHTML =
    rows.map(supplier => `

      <tr>

        <td>
          ${escapeHtml(supplier.supplier_code)}
        </td>

        <td>
          ${escapeHtml(supplier.supplier_name)}
        </td>

        <td>
          ${escapeHtml(supplier.contact_person)}
        </td>

        <td>
          ${escapeHtml(supplier.contact_number)}
        </td>

        <td>
          ${escapeHtml(supplier.email)}
        </td>

        <td class="${supplier.status === 'ACTIVE'
          ? 'status-active'
          : 'status-inactive'}">
          ${escapeHtml(supplier.status)}
        </td>

        <td>

          <div class="action-buttons">

            <button
              class="small-button edit-button"
              onclick="editSupplier('${encodeURIComponent(
                supplier.supplier_id
              )}')"
            >
              EDIT
            </button>

          </div>

        </td>

      </tr>

    `).join('');

}


function editSupplier(encodedId) {

  const id =
    decodeURIComponent(
      encodedId
    );

  const supplier =
    state.suppliers.find(
      item =>
        item.supplier_id === id
    );

  if (!supplier) {
    return;
  }

  openSupplierModal(
    'edit',
    supplier
  );

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
          colspan="7"
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
          ₱${Number(
            employee.hourly_rate ?? 0
          ).toFixed(2)}
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
          colspan="7"
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
            project.project_type,
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
          colspan="7"
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
          ${escapeHtml(project.project_id)}
        </td>

        <td>
          ${escapeHtml(project.project_name)}
        </td>

        <td>
          ${escapeHtml(project.project_type || 'NOT CLASSIFIED')}
        </td>

        <td>
          ${escapeHtml(project.client)}
        </td>

        <td>
          ${escapeHtml(project.location)}
        </td>

        <td class="${project.status === 'ACTIVE'
          ? 'status-active'
          : 'status-inactive'}">
          ${escapeHtml(project.status)}
        </td>

        <td>
          <div class="action-buttons">
            <button
              class="small-button edit-button"
              onclick="editProject('${encodeURIComponent(project.project_id)}')"
            >
              EDIT
            </button>

            <button
              class="small-button material-estimate-button"
              onclick="openMaterialEstimate('${encodeURIComponent(project.project_id)}')"
            >
              MATERIAL ESTIMATE
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


function openSupplierModal(
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
        'Supplier Code',
        'supplier_code',
        values.supplier_code,
        true
      )}

      ${field(
        'Supplier Name',
        'supplier_name',
        values.supplier_name,
        true
      )}

      ${field(
        'Contact Person',
        'contact_person',
        values.contact_person
      )}

      ${field(
        'Contact Number',
        'contact_number',
        values.contact_number
      )}

      ${field(
        'Email Address',
        'email',
        values.email,
        false,
        'email'
      )}

      ${field(
        'Address',
        'address',
        values.address
      )}

      ${field(
        'TIN',
        'tin',
        values.tin
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
      ? 'ADD SUPPLIER'
      : 'EDIT SUPPLIER',
    'supplier',
    mode,
    record
  );

}


async function saveSupplier(
  values
) {

  const payload = {

    supplier_code:
      values.supplier_code.trim(),

    supplier_name:
      values.supplier_name.trim(),

    contact_person:
      values.contact_person.trim() ||
      null,

    contact_number:
      values.contact_number.trim() ||
      null,

    email:
      values.email.trim() ||
      null,

    address:
      values.address.trim() ||
      null,

    tin:
      values.tin.trim() ||
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
        .from('suppliers')
        .insert(
          payload
        );

    if (error) {
      throw new Error(
        `Supplier: ${error.message}`
      );
    }

  } else {

    const {
      error
    } =
      await supabaseClient
        .from('suppliers')
        .update({
          ...payload,
          updated_at:
            new Date().toISOString()
        })
        .eq(
          'supplier_id',
          state.editId
        );

    if (error) {
      throw new Error(
        `Supplier: ${error.message}`
      );
    }

  }

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

  if (type === 'supplier') {
    return record.supplier_id;
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
   BOM / MATERIAL ESTIMATE
   ========================================================= */

function getRoadPavementArea(project) {
  const details = project?.project_details || {};
  const stored = Number(details.road_pavement_area);
  if (Number.isFinite(stored) && stored > 0) {
    return stored;
  }

  const length = Number(details.road_length);
  const width = Number(details.road_width);
  const thickness = Number(details.road_thickness);

  if (
    Number.isFinite(length) &&
    Number.isFinite(width) &&
    Number.isFinite(thickness)
  ) {
    return length * width * thickness;
  }

  return 0;
}

function materialEstimateMoney(value) {
  return '₱' + Number(value || 0).toLocaleString(
    'en-PH',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );
}

function openMaterialEstimate(encodedId) {
  const projectId = decodeURIComponent(encodedId);
  const project =
    state.projects.find(
      item => item.project_id === projectId
    );

  if (!project) return;

  if (project.project_type !== 'CONCRETING OF ROAD') {
    showMessage(
      'globalMessage',
      'BOM / Material Estimate is currently configured for CONCRETING OF ROAD projects. The material formulas for this project type must be defined before an estimate can be generated.',
      'info'
    );
    return;
  }

  const area = getRoadPavementArea(project);

  state.materialEstimateProjectId = projectId;

  document.getElementById('materialEstimateProjectName').textContent =
    project.project_name || '—';

  document.getElementById('materialEstimateProjectId').textContent =
    project.project_id || '—';

  document.getElementById('materialEstimateBasis').textContent =
    Number(area || 0).toLocaleString(
      'en-PH',
      { maximumFractionDigits: 6 }
    );

  const info = document.getElementById('materialEstimateInfo');
  info.style.display = area > 0 ? 'block' : 'none';
  info.textContent =
    area > 0
      ? 'The quantities below are generated from the saved Pavement Area using the AMANAH road material consumption factors.'
      : 'Pavement Area is not available for this project. Edit the project and complete the Road Engineering Details before generating the estimate.';

  loadMaterialEstimateItems(project, area);
}

async function loadMaterialEstimateItems(project, area) {
  const body = document.getElementById('materialEstimateBody');
  const modal = document.getElementById('materialEstimateModal');

  body.innerHTML = `
    <tr>
      <td colspan="5" class="empty-row">Loading material estimate...</td>
    </tr>
  `;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  let existing = [];

  try {
    const { data, error } =
      await supabaseClient
        .from('project_material_estimates')
        .select('estimate_id')
        .eq('project_id', project.project_id)
        .eq('estimate_type', 'ROAD')
        .maybeSingle();

    if (error) throw error;

    if (data?.estimate_id) {
      const { data: items, error: itemError } =
        await supabaseClient
          .from('project_material_estimate_items')
          .select('description,unit,qty,rate,total_cost,consumption_factor,formula')
          .eq('estimate_id', data.estimate_id)
          .order('created_at');

      if (itemError) throw itemError;
      existing = items || [];
    }

    const rows = ROAD_MATERIAL_BOM.map(template => {
      const found =
        existing.find(
          item => item.description === template.description
        );

      const qty =
        Number.isFinite(Number(found?.qty))
          ? Number(found.qty)
          : area * template.factor;

      const rate =
        Number.isFinite(Number(found?.rate))
          ? Number(found.rate)
          : 0;

      return {
        ...template,
        unit: found?.unit || template.unit,
        qty,
        rate,
        total_cost: qty * rate
      };
    });

    body.innerHTML =
      rows.map((row, index) => `
        <tr>
          <td>
            <strong>${escapeHtml(row.description)}</strong>
            <div class="project-formula">Formula: ${escapeHtml(row.formula)}</div>
            <input type="hidden" data-material-description data-index="${index}" value="${escapeHtml(row.description)}">
            <input type="hidden" data-material-factor data-index="${index}" value="${row.factor}">
            <input type="hidden" data-material-formula data-index="${index}" value="${escapeHtml(row.formula)}">
          </td>

          <td>
            <input
              class="material-estimate-unit"
              data-material-unit
              data-index="${index}"
              value="${escapeHtml(row.unit)}"
              maxlength="40"
            >
          </td>

          <td class="material-estimate-qty">
            <span data-material-qty data-index="${index}">
              ${Number(row.qty || 0).toLocaleString('en-PH',{maximumFractionDigits:6})}
            </span>
          </td>

          <td>
            <input
              class="material-estimate-rate"
              data-material-rate
              data-index="${index}"
              type="number"
              min="0"
              step="0.01"
              value="${Number(row.rate || 0).toFixed(2)}"
              placeholder="0.00"
            >
          </td>

          <td class="material-estimate-total" data-material-total data-index="${index}">
            ${materialEstimateMoney(row.qty * row.rate)}
          </td>
        </tr>
      `).join('');

    document
      .querySelectorAll('[data-material-rate]')
      .forEach(input =>
        input.addEventListener(
          'input',
          updateMaterialEstimateTotals
        )
      );

    updateMaterialEstimateTotals();

  } catch (error) {
    body.innerHTML =
      `
        <tr>
          <td colspan="5" class="empty-row">
            Unable to load material estimate: ${escapeHtml(error.message)}
          </td>
        </tr>
      `;
  }
}

function updateMaterialEstimateTotals() {
  let grandTotal = 0;

  document
    .querySelectorAll('[data-material-rate]')
    .forEach(input => {
      const index = input.dataset.index;
      const qty =
        Number(
          document.querySelector(
            `[data-material-qty="${index}"]`
          )?.textContent.replaceAll(',','')
        ) || 0;
      const rate = Number(input.value || 0);
      const total = qty * rate;
      grandTotal += total;

      const totalCell =
        document.querySelector(
          `[data-material-total="${index}"]`
        );

      if (totalCell) {
        totalCell.textContent =
          materialEstimateMoney(total);
      }
    });

  document.getElementById('materialEstimateGrandTotal').textContent =
    materialEstimateMoney(grandTotal);
}

async function saveMaterialEstimate() {
  const projectId = state.materialEstimateProjectId;

  if (!projectId) return;

  const project =
    state.projects.find(
      item => item.project_id === projectId
    );

  if (!project) return;

  if (project.project_type !== 'CONCRETING OF ROAD') {
    throw new Error(
      'Material estimate formulas are currently configured for CONCRETING OF ROAD projects only.'
    );
  }

  const area = getRoadPavementArea(project);

  if (!area) {
    throw new Error(
      'Pavement Area is not available. Please complete the Road Engineering Details first.'
    );
  }

  const button =
    document.getElementById(
      'saveMaterialEstimateButton'
    );

  button.disabled = true;
  button.textContent = 'SAVING...';

  try {
    const { data: estimate, error: estimateError } =
      await supabaseClient
        .from('project_material_estimates')
        .upsert(
          {
            project_id: projectId,
            estimate_type: 'ROAD',
            basis_quantity: area,
            basis_label: 'PAVEMENT AREA',
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'project_id,estimate_type'
          }
        )
        .select('estimate_id')
        .single();

    if (estimateError) {
      throw estimateError;
    }

    const rows = [];

    document
      .querySelectorAll('[data-material-rate]')
      .forEach(input => {
        const index = input.dataset.index;
        const description =
          document.querySelector(
            `[data-material-description][data-index="${index}"]`
          )?.value || '';

        const unit =
          document.querySelector(
            `[data-material-unit][data-index="${index}"]`
          )?.value.trim() || '';

        const factor =
          Number(
            document.querySelector(
              `[data-material-factor][data-index="${index}"]`
            )?.value
          ) || 0;

        const formula =
          document.querySelector(
            `[data-material-formula][data-index="${index}"]`
          )?.value || '';

        const qty =
          Number(
            document.querySelector(
              `[data-material-qty][data-index="${index}"]`
            )?.textContent.replaceAll(',','')
          ) || 0;

        const rate = Number(input.value || 0);

        rows.push({
          estimate_id: estimate.estimate_id,
          description,
          unit,
          consumption_factor: factor,
          qty,
          rate,
          total_cost: qty * rate,
          formula,
          updated_at: new Date().toISOString()
        });
      });

    const { error: deleteError } =
      await supabaseClient
        .from('project_material_estimate_items')
        .delete()
        .eq('estimate_id', estimate.estimate_id);

    if (deleteError) {
      throw deleteError;
    }

    const { error: insertError } =
      await supabaseClient
        .from('project_material_estimate_items')
        .insert(rows);

    if (insertError) {
      throw insertError;
    }

    closeMaterialEstimate();

    showMessage(
      'globalMessage',
      'BOM / Material Estimate saved successfully for ' +
        project.project_name +
        '.',
      'success'
    );

  } catch (error) {

    showMessage(
      'globalMessage',
      error.message ||
        'Unable to save material estimate.',
      'error'
    );

  } finally {

    button.disabled = false;
    button.textContent = 'SAVE MATERIAL ESTIMATE';

  }
}

function closeMaterialEstimate() {
  state.materialEstimateProjectId = null;

  const modal =
    document.getElementById(
      'materialEstimateModal'
    );

  if (!modal) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

/* =========================================================
   PROJECT FORM
   ========================================================= */


function projectTypeLabel(type) {
  return type || 'NOT CLASSIFIED';
}

function openProjectTypeModal(mode = 'add', record = null) {
  state.pendingProjectModal = { mode, record: record || {} };
  const modal = document.getElementById('projectTypeModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeProjectTypeModal() {
  state.pendingProjectModal = null;
  const modal = document.getElementById('projectTypeModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function chooseProjectType(type) {
  if (!PROJECT_TYPES.includes(type)) return;
  const pending = state.pendingProjectModal || {mode:'add',record:{}};
  closeProjectTypeModal();
  openProjectModal(pending.mode,{...(pending.record||{}),project_type:type});
}

function renderProjectSpecificFields(type, details = {}) {
  if (type === 'CONCRETING OF ROAD') {
    return `
      <div class="project-detail-section">
        <h3>ROAD ENGINEERING DETAILS</h3>
        <p>Enter the pavement dimensions. AMANAH calculates the pavement area automatically.</p>
        <div class="form-grid">
          ${field('Length','road_length',details.road_length,false,'number','0')}
          ${field('Width','road_width',details.road_width,false,'number','0')}
          ${field('Thickness','road_thickness',details.road_thickness,false,'number','0')}
          ${calculatedField('Pavement Area','road_pavement_area',details.road_pavement_area,'LENGTH × WIDTH × THICKNESS')}
        </div>
      </div>`;
  }

  if (type === 'MULTI PURPOSE BUILDING' || type === 'SCHOOL BUILDING') {
    return `
      <div class="project-detail-section">
        <h3>BUILDING ENGINEERING DETAILS</h3>
        <p>Enter the structural dimensions. Calculated quantities are shown automatically.</p>

        <div class="project-detail-section">
          <h3>FLOOR AREA</h3>
          <div class="form-grid">
            ${field('Length','building_floor_length',details.building_floor_length,false,'number','0')}
            ${field('Width','building_floor_width',details.building_floor_width,false,'number','0')}
            ${field('Thickness','building_floor_thickness',details.building_floor_thickness,false,'number','0')}
            ${calculatedField('Floor Area','building_floor_area',details.building_floor_area,'LENGTH × WIDTH × THICKNESS')}
          </div>
        </div>

        <div class="form-grid">
          ${field('Height','building_height',details.building_height,false,'number','0')}
        </div>

        <div class="project-detail-section">
          <h3>FOOTING</h3>
          <div class="form-grid">
            ${field('Width','footing_width',details.footing_width,false,'number','0')}
            ${field('Length','footing_length',details.footing_length,false,'number','0')}
            ${field('Thickness','footing_thickness',details.footing_thickness,false,'number','0')}
            ${calculatedField('Footing','footing_quantity',details.footing_quantity,'WIDTH × LENGTH × THICKNESS')}
          </div>
        </div>

        <div class="project-detail-section">
          <h3>COLUMN</h3>
          <div class="form-grid">
            ${field('Width','column_width',details.column_width,false,'number','0')}
            ${field('Length','column_length',details.column_length,false,'number','0')}
            ${field('Height','column_height',details.column_height,false,'number','0')}
            ${calculatedField('Column','column_quantity',details.column_quantity,'WIDTH × LENGTH × HEIGHT')}
          </div>
        </div>

        <div class="project-detail-section">
          <h3>BEAM</h3>
          <div class="form-grid">
            ${selectField('Beam Type','beam_type',['TIE BEAM','ROOF BEAM'],details.beam_type||'TIE BEAM')}
            ${field('Width','beam_width',details.beam_width,false,'number','0')}
            ${field('Length','beam_length',details.beam_length,false,'number','0')}
            ${field('Thickness','beam_thickness',details.beam_thickness,false,'number','0')}
            ${calculatedField('Beam Quantity','beam_quantity',details.beam_quantity,'WIDTH × LENGTH × THICKNESS')}
          </div>
        </div>

        <div class="project-detail-section">
          <h3>WALL</h3>
          <div class="form-grid">
            ${field('Height','wall_height',details.wall_height,false,'number','0')}
            ${field('Width','wall_width',details.wall_width,false,'number','0')}
            ${calculatedField('Wall','wall_quantity',details.wall_quantity,'HEIGHT × WIDTH')}
          </div>
        </div>
      </div>`;
  }

  if (type === 'FLOOD CONTROL') {
    return `
      <div class="project-detail-section">
        <h3>FLOOD CONTROL ENGINEERING DETAILS</h3>
        <p>Slope ratio is defined by Rise and Run. No separate ratio text field is required.</p>
        <div class="form-grid">
          ${field('Rise','flood_rise',details.flood_rise,false,'number','0')}
          ${field('Run','flood_run',details.flood_run,false,'number','0')}
          ${field('Width','flood_width',details.flood_width,false,'number','0')}
          ${calculatedField('Slope','flood_slope',details.flood_slope,'RISE ÷ RUN')}
          ${calculatedField('Slope Area','flood_slope_area',details.flood_slope_area,'(RISE ÷ RUN) × WIDTH')}
          ${field('Pile Cap Length','sheet_pile_cap_length',details.sheet_pile_cap_length,false,'number','0')}
          ${field('Sheet Pile Width','sheet_pile_width',details.sheet_pile_width,false,'number','0')}
          ${calculatedField('Sheet Pile Pieces','sheet_pile_pieces',details.sheet_pile_pieces,'PILE CAP LENGTH ÷ SHEET PILE WIDTH')}
        </div>
      </div>`;
  }

  if (type === 'COVERED COURT') {
    return `
      <div class="project-detail-section">
        <h3>COVERED COURT ENGINEERING DETAILS</h3>
        <p>Enter the structural dimensions. Beam classification is selected from the dropdown.</p>

        <div class="project-detail-section">
          <h3>FLOOR AREA</h3>
          <div class="form-grid">
            ${field('Length','covered_floor_length',details.covered_floor_length,false,'number','0')}
            ${field('Width','covered_floor_width',details.covered_floor_width,false,'number','0')}
            ${field('Thickness','covered_floor_thickness',details.covered_floor_thickness,false,'number','0')}
            ${calculatedField('Floor Area','covered_floor_area',details.covered_floor_area,'LENGTH × WIDTH × THICKNESS')}
          </div>
        </div>

        <div class="form-grid">
          ${field('Height','covered_height',details.covered_height,false,'number','0')}
        </div>

        <div class="project-detail-section">
          <h3>FOOTING</h3>
          <div class="form-grid">
            ${field('Width','covered_footing_width',details.covered_footing_width,false,'number','0')}
            ${field('Length','covered_footing_length',details.covered_footing_length,false,'number','0')}
            ${field('Thickness','covered_footing_thickness',details.covered_footing_thickness,false,'number','0')}
            ${calculatedField('Footing','covered_footing_quantity',details.covered_footing_quantity,'WIDTH × LENGTH × THICKNESS')}
          </div>
        </div>

        <div class="project-detail-section">
          <h3>COLUMN</h3>
          <div class="form-grid">
            ${field('Width','covered_column_width',details.covered_column_width,false,'number','0')}
            ${field('Length','covered_column_length',details.covered_column_length,false,'number','0')}
            ${field('Height','covered_column_height',details.covered_column_height,false,'number','0')}
            ${calculatedField('Column','covered_column_quantity',details.covered_column_quantity,'WIDTH × LENGTH × HEIGHT')}
          </div>
        </div>

        <div class="project-detail-section">
          <h3>BEAM</h3>
          <div class="form-grid">
            ${selectField('Beam Type','covered_beam_type',['TIE BEAM','ROOF BEAM'],details.covered_beam_type||'TIE BEAM')}
            ${field('Width','covered_beam_width',details.covered_beam_width,false,'number','0')}
            ${field('Length','covered_beam_length',details.covered_beam_length,false,'number','0')}
            ${field('Thickness','covered_beam_thickness',details.covered_beam_thickness,false,'number','0')}
            ${calculatedField('Beam Quantity','covered_beam_quantity',details.covered_beam_quantity,'WIDTH × LENGTH × THICKNESS')}
          </div>
        </div>
      </div>`;
  }

  if (type === 'WATER SYSTEM' || type === 'BRIDGE') {
    return `
      <div class="project-detail-section">
        <h3>PROJECT-SPECIFIC DETAILS</h3>
        <p>No additional engineering fields are defined yet for this project type. The common project information above will be saved now.</p>
      </div>`;
  }

  return '';
}

function calculatedField(label,name,value='',formula='') {
  return `
    <div class="form-field project-calculated">
      <label for="${name}">${escapeHtml(label)}</label>
      <input id="${name}" name="${name}" type="number" value="${escapeHtml(value ?? '')}" readonly>
      ${formula ? `<div class="project-formula">Formula: ${escapeHtml(formula)}</div>` : ''}
    </div>`;
}

function calculateProjectFormulas() {
  const type = document.getElementById('project_type')?.value || '';
  const num = id => {
    const value = document.getElementById(id)?.value;
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const set = (id,value) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value === null || !Number.isFinite(value) ? '' : Number(value.toFixed(6));
  };
  const product = (...ids) => {
    const values = ids.map(num);
    return values.every(v => v !== null) ? values.reduce((a,b)=>a*b,1) : null;
  };

  if (type === 'CONCRETING OF ROAD') {
    set('road_pavement_area',product('road_length','road_width','road_thickness'));
  }

  if (type === 'MULTI PURPOSE BUILDING' || type === 'SCHOOL BUILDING') {
    set('building_floor_area',product('building_floor_length','building_floor_width','building_floor_thickness'));
    set('footing_quantity',product('footing_width','footing_length','footing_thickness'));
    set('column_quantity',product('column_width','column_length','column_height'));
    set('beam_quantity',product('beam_width','beam_length','beam_thickness'));
    const h=num('wall_height'),w=num('wall_width');
    set('wall_quantity',h!==null&&w!==null?h*w:null);
  }

  if (type === 'FLOOD CONTROL') {
    const rise=num('flood_rise'),run=num('flood_run'),width=num('flood_width');
    const slope=rise!==null&&run!==null&&run!==0?rise/run:null;
    set('flood_slope',slope);
    set('flood_slope_area',slope!==null&&width!==null?slope*width:null);
    const cap=num('sheet_pile_cap_length'),pileWidth=num('sheet_pile_width');
    set('sheet_pile_pieces',cap!==null&&pileWidth!==null&&pileWidth!==0?cap/pileWidth:null);
  }

  if (type === 'COVERED COURT') {
    set('covered_floor_area',product('covered_floor_length','covered_floor_width','covered_floor_thickness'));
    set('covered_footing_quantity',product('covered_footing_width','covered_footing_length','covered_footing_thickness'));
    set('covered_column_quantity',product('covered_column_width','covered_column_length','covered_column_height'));
    set('covered_beam_quantity',product('covered_beam_width','covered_beam_length','covered_beam_thickness'));
  }
}

function collectProjectDetails(type,values) {
  const map = {
    'CONCRETING OF ROAD':['road_length','road_width','road_thickness','road_pavement_area'],
    'MULTI PURPOSE BUILDING':['building_floor_length','building_floor_width','building_floor_thickness','building_floor_area','building_height','footing_width','footing_length','footing_thickness','footing_quantity','column_width','column_length','column_height','column_quantity','beam_type','beam_width','beam_length','beam_thickness','beam_quantity','wall_height','wall_width','wall_quantity'],
    'SCHOOL BUILDING':['building_floor_length','building_floor_width','building_floor_thickness','building_floor_area','building_height','footing_width','footing_length','footing_thickness','footing_quantity','column_width','column_length','column_height','column_quantity','beam_type','beam_width','beam_length','beam_thickness','beam_quantity','wall_height','wall_width','wall_quantity'],
    'FLOOD CONTROL':['flood_rise','flood_run','flood_width','flood_slope','flood_slope_area','sheet_pile_cap_length','sheet_pile_width','sheet_pile_pieces'],
    'WATER SYSTEM':[],
    'BRIDGE':[],
    'COVERED COURT':['covered_floor_length','covered_floor_width','covered_floor_thickness','covered_floor_area','covered_height','covered_footing_width','covered_footing_length','covered_footing_thickness','covered_footing_quantity','covered_column_width','covered_column_length','covered_column_height','covered_column_quantity','covered_beam_type','covered_beam_width','covered_beam_length','covered_beam_thickness','covered_beam_quantity']
  };
  const details={};
  (map[type]||[]).forEach(key=>{
    if(values[key]===undefined) return;
    const raw=String(values[key]).trim();
    if(raw==='') details[key]=null;
    else if(['beam_type','covered_beam_type'].includes(key)) details[key]=raw;
    else {
      const n=Number(raw);
      details[key]=Number.isFinite(n)?n:raw;
    }
  });
  return details;
}

function openProjectModal(mode,record=null) {
  const values=record||{};
  const type=values.project_type||'';
  if(!type){ openProjectTypeModal(mode,record); return; }

  const details=values.project_details||{};
  document.getElementById('formFields').innerHTML=`
    <div class="project-type-banner">
      <small>PROJECT TYPE</small>
      <strong>${escapeHtml(projectTypeLabel(type))}</strong>
      <input type="hidden" id="project_type" name="project_type" value="${escapeHtml(type)}">
    </div>

    ${field('Project ID','project_id',values.project_id,true)}
    ${field('Project Name','project_name',values.project_name,true)}
    ${field('Client','client',values.client)}
    ${field('Location','location',values.location)}
    ${field('Site Engineer','site_engineer',values.site_engineer)}
    ${field('Start Date','start_date',values.start_date,false,'date')}
    ${field('Target Completion','target_completion',values.target_completion,false,'date')}
    ${field('Actual Completion','actual_completion',values.actual_completion,false,'date')}
    ${field('Contract Amount','contract_amount',values.contract_amount,false,'number','0.00')}
    ${field('Current Progress (%)','current_progress',values.current_progress,false,'number','0')}
    ${selectField('Status','status',['ACTIVE','COMPLETED','ON HOLD','INACTIVE'],values.status||'ACTIVE')}
    ${renderProjectSpecificFields(type,details)}
  `;
  const fields=document.getElementById('formFields');
  fields.oninput=calculateProjectFormulas;
  fields.onchange=calculateProjectFormulas;
  calculateProjectFormulas();

  openModal(mode==='add'?'ADD PROJECT — '+type:'EDIT PROJECT — '+type,'project',mode,values);
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

    else if (
      state.modalType ===
      'supplier'
    ) {

      await saveSupplier(
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

  const projectType = (values.project_type || '').trim();

  if (!PROJECT_TYPES.includes(projectType)) {
    throw new Error(
      'Please select a valid project type before saving.'
    );
  }

  const projectDetails =
    collectProjectDetails(
      projectType,
      values
    );

  const payload = {

    project_id:
      values.project_id.trim(),

    project_name:
      values.project_name.trim(),

    project_type:
      projectType,

    project_details:
      projectDetails,

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
        openProjectTypeModal(
          'add'
        )
    );

  document
    .getElementById(
      'closeProjectTypeModalButton'
    )
    .addEventListener(
      'click',
      closeProjectTypeModal
    );

  document
    .getElementById(
      'cancelProjectTypeButton'
    )
    .addEventListener(
      'click',
      closeProjectTypeModal
    );

  document
    .querySelectorAll(
      '[data-project-type]'
    )
    .forEach(
      button =>
        button.addEventListener(
          'click',
          () =>
            chooseProjectType(
              button.dataset.projectType
            )
        )
    );

  document
    .getElementById(
      'projectTypeModal'
    )
    .addEventListener(
      'click',
      event => {
        if (event.target.id === 'projectTypeModal') {
          closeProjectTypeModal();
        }
      }
    );

  document
    .getElementById(
      'addSupplierButton'
    )
    .addEventListener(
      'click',
      () =>
        openSupplierModal(
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
      'closeMaterialEstimateButton'
    )
    .addEventListener(
      'click',
      closeMaterialEstimate
    );

  document
    .getElementById(
      'cancelMaterialEstimateButton'
    )
    .addEventListener(
      'click',
      closeMaterialEstimate
    );

  document
    .getElementById(
      'saveMaterialEstimateButton'
    )
    .addEventListener(
      'click',
      saveMaterialEstimate
    );

  document
    .getElementById(
      'materialEstimateModal'
    )
    .addEventListener(
      'click',
      event => {
        if (event.target.id === 'materialEstimateModal') {
          closeMaterialEstimate();
        }
      }
    );

  document
    .getElementById(
      'supplierSearch'
    )
    .addEventListener(
      'input',
      renderSuppliers
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
