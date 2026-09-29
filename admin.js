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
    defaultRate: 0,
    formula: 'PROJECT LENGTH × 0.34'
  },
  {
    description: 'Rebar - Longitudinal Section',
    unit: 'REBAR',
    factor: 0.17,
    defaultRate: 0,
    formula: 'PROJECT LENGTH × 0.17'
  },
  {
    description: 'Rebar - Transverse Section',
    unit: 'REBAR',
    factor: 0.14,
    defaultRate: 0,
    formula: 'PROJECT LENGTH × 0.14'
  },
  {
    description: 'Gravel',
    unit: 'CUBIC METER',
    factor: 1.15,
    defaultRate: 0,
    formula: 'PROJECT LENGTH × 1.15'
  },
  {
    description: 'Sand',
    unit: 'CUBIC METER',
    factor: 0.58,
    defaultRate: 0,
    formula: 'PROJECT LENGTH × 0.58'
  },
  {
    description: 'Labor',
    unit: 'METER',
    factor: 1,
    defaultRate: 356,
    formula: 'PROJECT LENGTH × ₱356'
  }
];


function getRoadMaterialBOM(project) {
  const details = project?.project_details || {};
  const shouldering =
    details.road_shouldering === true ||
    String(details.road_shouldering).toUpperCase() === 'YES';

  const roadLength = Number(details.road_length);
  const shoulderingLength = Number(details.road_shouldering_length);

  const items = ROAD_MATERIAL_BOM.map(item => ({
    ...item,
    basis: 'PROJECT LENGTH',
    basisLength: Number.isFinite(roadLength) && roadLength > 0 ? roadLength : 0
  }));

  if (shouldering) {
    const shoulderBasis =
      Number.isFinite(shoulderingLength) && shoulderingLength > 0
        ? shoulderingLength
        : 0;

    items.push(
      {
        description: 'Shouldering - Cement',
        unit: 'TUNNER BAG',
        factor: 0.067,
        defaultRate: 0,
        basis: 'SHOULDERING LENGTH',
        basisLength: shoulderBasis,
        formula: 'SHOULDERING LENGTH × 0.067'
      },
      {
        description: 'Shouldering - Rebar Longitudinal Section',
        unit: 'REBAR',
        factor: 0.17,
        defaultRate: 0,
        sameAs: 'Rebar - Longitudinal Section',
        basis: 'SHOULDERING LENGTH',
        basisLength: shoulderBasis,
        formula: 'SHOULDERING LENGTH × 0.17'
      },
      {
        description: 'Shouldering - Rebar Transverse Section',
        unit: 'REBAR',
        factor: 0.012,
        defaultRate: 0,
        sameAs: 'Rebar - Transverse Section',
        basis: 'SHOULDERING LENGTH',
        basisLength: shoulderBasis,
        formula: 'SHOULDERING LENGTH × 0.012'
      },
      {
        description: 'Shouldering - Gravel',
        unit: 'CUBIC METER',
        factor: 0.23,
        defaultRate: 0,
        sameAs: 'Gravel',
        basis: 'SHOULDERING LENGTH',
        basisLength: shoulderBasis,
        formula: 'SHOULDERING LENGTH × 0.23'
      },
      {
        description: 'Shouldering - Sand',
        unit: 'CUBIC METER',
        factor: 0.115,
        defaultRate: 0,
        sameAs: 'Sand',
        basis: 'SHOULDERING LENGTH',
        basisLength: shoulderBasis,
        formula: 'SHOULDERING LENGTH × 0.115'
      },
      {
        description: 'Shouldering - Labor',
        unit: 'METER',
        factor: 1,
        defaultRate: 66.67,
        basis: 'SHOULDERING LENGTH',
        basisLength: shoulderBasis,
        formula: 'SHOULDERING LENGTH × ₱66.67'
      }
    );
  }

  return items;
}


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

  materialEstimateProjectId: null,

  deleteTarget: null

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
            supplier.phone,
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
          ${escapeHtml(supplier.phone)}
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

            <button
              class="small-button delete-button"
              onclick="confirmDeleteSupplier('${encodeURIComponent(
                supplier.supplier_id
              )}')"
            >
              DELETE
            </button>

          </div>

        </td>

      </tr>

    `).join('');

}



function confirmDeleteSupplier(
  encodedId
) {
  const supplierId =
    decodeURIComponent(encodedId);

  const supplier =
    state.suppliers.find(
      item =>
        item.supplier_id ===
        supplierId
    );

  if (!supplier) {
    return;
  }

  openDeleteConfirmation({
    type: 'supplier',
    id: supplier.supplier_id,
    title: 'Delete Supplier',
    name: supplier.supplier_name,
    subtitle:
      'This action permanently removes the selected supplier record from AMANAH.',
    detailLabel: 'Supplier Code',
    detailValue: supplier.supplier_code
  });
}

function openDeleteConfirmation(target) {
  state.deleteTarget = target;

  const modal =
    document.getElementById(
      'deleteConfirmationModal'
    );

  if (!modal) return;

  document.getElementById(
    'deleteConfirmationTitle'
  ).textContent =
    target.title || 'Confirm Deletion';

  document.getElementById(
    'deleteConfirmationSubtitle'
  ).textContent =
    target.subtitle ||
    'Please confirm that you want to permanently remove this record.';

  document.getElementById(
    'deleteConfirmationName'
  ).textContent =
    target.name || '—';

  document.getElementById(
    'deleteConfirmationDetailLabel'
  ).textContent =
    target.detailLabel || 'Record ID';

  document.getElementById(
    'deleteConfirmationDetailValue'
  ).textContent =
    target.detailValue || target.id || '—';

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
}

function closeDeleteConfirmation() {
  const modal =
    document.getElementById(
      'deleteConfirmationModal'
    );

  if (!modal) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');

  state.deleteTarget = null;
}

async function executeDeleteConfirmation() {
  const target =
    state.deleteTarget;

  if (!target) return;

  const button =
    document.getElementById(
      'confirmDeleteButton'
    );

  button.disabled = true;
  button.textContent = 'DELETING...';

  try {
    if (target.type === 'supplier') {
      const { error } =
        await supabaseClient
          .from('suppliers')
          .delete()
          .eq(
            'supplier_id',
            target.id
          );

      if (error) {
        throw new Error(
          `Unable to delete supplier: ${error.message}`
        );
      }

      await loadSuppliers();
      renderSuppliers();

      closeDeleteConfirmation();

      showMessage(
        'globalMessage',
        `Supplier "${target.name}" was deleted successfully.`,
        'success'
      );
    }
  } catch (error) {
    showMessage(
      'globalMessage',
      error.message ||
        'The supplier could not be deleted.',
      'error'
    );
  } finally {
    button.disabled = false;
    button.textContent = 'DELETE SUPPLIER';
  }
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
            String(employee.department || '').toUpperCase() === 'TRUCKERS'
              ? (employee.hourly_rate ?? 0)
              : (employee.daily_rate ?? 0)
          ).toFixed(2)}
          <small class="rate-display-subtext">
            ${String(employee.department || '').toUpperCase() === 'TRUCKERS'
              ? 'PER HOUR'
              : escapeHtml(employee.rate_basis || 'PER DAY')}
          </small>
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

            <button
              class="small-button delete-button"
              onclick="confirmDeleteEmployee('${encodeURIComponent(employee.employee_id)}')"
            >
              DELETE
            </button>

          </div>

        </td>

      </tr>

    `).join('');

}


function confirmDeleteEmployee(encodedId) {
  const employeeId = decodeURIComponent(encodedId);
  const employee = state.employees.find(item => item.employee_id === employeeId);
  if (!employee) return;

  openDeleteConfirmation({
    type: 'employee',
    table: 'employees',
    id: employee.employee_id,
    idColumn: 'employee_id',
    load: loadEmployees,
    render: renderEmployees,
    title: 'Delete Employee',
    name: employee.employee_name,
    subtitle: 'This action permanently removes the selected employee record from AMANAH.',
    detailLabel: 'Employee ID',
    detailValue: employee.employee_id,
    confirmText: 'DELETE EMPLOYEE',
    successText: 'Employee "' + employee.employee_name + '" was deleted successfully.'
  });
}

function confirmDeleteEquipment(encodedId) {
  const equipmentId = decodeURIComponent(encodedId);
  const equipment = state.equipment.find(item => item.equipment_id === equipmentId);
  if (!equipment) return;

  openDeleteConfirmation({
    type: 'equipment',
    table: 'equipment',
    id: equipment.equipment_id,
    idColumn: 'equipment_id',
    load: loadEquipment,
    render: renderEquipment,
    title: 'Delete Equipment',
    name: equipment.equipment_name,
    subtitle: 'This action permanently removes the selected equipment record from AMANAH.',
    detailLabel: 'Equipment ID',
    detailValue: equipment.equipment_id,
    confirmText: 'DELETE EQUIPMENT',
    successText: 'Equipment "' + equipment.equipment_name + '" was deleted successfully.'
  });
}

function confirmDeleteProject(encodedId) {
  const projectId = decodeURIComponent(encodedId);
  const project = state.projects.find(item => item.project_id === projectId);
  if (!project) return;

  openDeleteConfirmation({
    type: 'project',
    table: 'projects',
    id: project.project_id,
    idColumn: 'project_id',
    load: loadProjects,
    render: renderProjects,
    title: 'Delete Project',
    name: project.project_name,
    subtitle: 'This action permanently removes the selected project record from AMANAH.',
    detailLabel: 'Project ID',
    detailValue: project.project_id,
    confirmText: 'DELETE PROJECT',
    successText: 'Project "' + project.project_name + '" was deleted successfully.'
  });
}

function openDeleteConfirmation(target) {
  state.deleteTarget = target;
  const modal = document.getElementById('deleteConfirmationModal');
  if (!modal) return;

  if (modal.parentElement !== document.body) document.body.appendChild(modal);
  modal.style.setProperty('z-index', '20000', 'important');
  modal.style.setProperty('pointer-events', 'auto', 'important');

  document.getElementById('deleteConfirmationTitle').textContent = target.title || 'Confirm Deletion';
  document.getElementById('deleteConfirmationSubtitle').textContent = target.subtitle || 'Please confirm that you want to permanently remove this record.';
  document.getElementById('deleteConfirmationName').textContent = target.name || '—';
  document.getElementById('deleteConfirmationDetailLabel').textContent = target.detailLabel || 'Record ID';
  document.getElementById('deleteConfirmationDetailValue').textContent = target.detailValue || target.id || '—';
  document.getElementById('confirmDeleteButton').textContent = target.confirmText || 'DELETE';

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeDeleteConfirmation() {
  const modal = document.getElementById('deleteConfirmationModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  state.deleteTarget = null;
}

function friendlyDeleteError(error, target) {
  if (error?.code === '23503') {
    if (target.type === 'employee') return 'This employee cannot be deleted because attendance records reference this employee. Please deactivate the employee instead.';
    if (target.type === 'equipment') return 'This equipment cannot be deleted because attendance, maintenance, repair, or activity records reference this equipment. Please deactivate the equipment instead.';
    if (target.type === 'project') return 'This project cannot be deleted because existing attendance records reference it. Please review those records before deletion.';
    return 'This record cannot be deleted because other AMANAH records still reference it.';
  }
  return error?.message || 'The selected record could not be deleted.';
}

async function executeDeleteConfirmation() {
  const target = state.deleteTarget;
  if (!target) return;

  const button = document.getElementById('confirmDeleteButton');
  if (!button) return;
  button.disabled = true;
  button.textContent = 'DELETING...';

  try {
    const { error } = await supabaseClient.from(target.table).delete().eq(target.idColumn, target.id);
    if (error) throw error;
    await target.load();
    target.render();
    closeDeleteConfirmation();
    showMessage('globalMessage', target.successText || 'The selected record was deleted successfully.', 'success');
  } catch (error) {
    showMessage('globalMessage', friendlyDeleteError(error, target), 'error');
  } finally {
    button.disabled = false;
    button.textContent = target.confirmText || 'DELETE';
  }
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

            <button
              class="small-button delete-button"
              onclick="confirmDeleteEquipment('${encodeURIComponent(equipment.equipment_id)}')"
            >
              DELETE
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

            <button
              class="small-button delete-button"
              onclick="confirmDeleteProject('${encodeURIComponent(project.project_id)}')"
            >
              DELETE
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
        values.phone
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

    phone:
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


const EMPLOYEE_POSITIONS = [
  'PROPRIETOR',
  'MANAGER',
  'SITE ENGINEER',
  'OFFICE ENGINEER',
  'PURCHASING OFFICER',
  'MAINTENANCE OFFICER',
  'LIAISON OFFICER',
  'PERSONAL ESCORT',
  'OFFICE DRIVER',
  'DRIVER / OPERATOR'
];

const EMPLOYEE_DEPARTMENTS = [
  'ADMIN',
  'CONSTRUCTION',
  'MAINTENANCE',
  'PROCUREMENT',
  'TRUCKERS'
];

function updateEmployeeRateFields() {
  const department =
    document
      .getElementById('department')
      ?.value
      ?.trim()
      ?.toUpperCase() || '';

  const hourlyWrap =
    document.getElementById(
      'employeeHourlyRateField'
    );

  const dailyWrap =
    document.getElementById(
      'employeeDailyRateField'
    );

  const hourlyInput =
    document.getElementById(
      'hourly_rate'
    );

  const dailyInput =
    document.getElementById(
      'daily_rate'
    );

  if (
    !hourlyWrap ||
    !dailyWrap ||
    !hourlyInput ||
    !dailyInput
  ) {
    return;
  }

  const isTruckers =
    department === 'TRUCKERS';

  hourlyWrap.style.display =
    isTruckers
      ? ''
      : 'none';

  dailyWrap.style.display =
    isTruckers
      ? 'none'
      : '';

  hourlyInput.disabled =
    !isTruckers;

  dailyInput.disabled =
    isTruckers;

  hourlyInput.required =
    isTruckers;

  dailyInput.required =
    !isTruckers;

  if (isTruckers) {
    dailyInput.value = '0';
  } else {
    hourlyInput.value = '0';
  }

  setupDecimalInputs(
    document.getElementById(
      'formFields'
    )
  );
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

  const positionOptions =
    values.position &&
    !EMPLOYEE_POSITIONS.includes(
      values.position
    )
      ? [
          values.position,
          ...EMPLOYEE_POSITIONS
        ]
      : EMPLOYEE_POSITIONS;

  const departmentOptions =
    values.department &&
    !EMPLOYEE_DEPARTMENTS.includes(
      values.department
    )
      ? [
          values.department,
          ...EMPLOYEE_DEPARTMENTS
        ]
      : EMPLOYEE_DEPARTMENTS;

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

      ${selectField(
        'Position',
        'position',
        positionOptions,
        values.position || ''
      )}

      ${selectField(
        'Department',
        'department',
        departmentOptions,
        values.department || ''
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

      <div id="employeeHourlyRateField" class="form-field">
        <label for="hourly_rate">Hourly Rate</label>
        <input
          id="hourly_rate"
          name="hourly_rate"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          data-decimal-input="true"
          value="${escapeHtml(values.hourly_rate ?? 0)}"
        >
        <small class="rate-field-help">TRUCKERS department only.</small>
      </div>

      <div id="employeeDailyRateField" class="form-field">
        <label for="daily_rate">Daily Rate</label>
        <input
          id="daily_rate"
          name="daily_rate"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          data-decimal-input="true"
          value="${escapeHtml(values.daily_rate ?? 0)}"
        >
        <small class="rate-field-help">ADMIN, CONSTRUCTION, MAINTENANCE and PROCUREMENT.</small>
      </div>


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

  const department =
    document.getElementById('department');

  if (department) {
    department.addEventListener(
      'change',
      updateEmployeeRateFields
    );
  }

  updateEmployeeRateFields();

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
        ['ACTIVE', 'MAINTENANCE', 'INACTIVE'],
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

function getRoadProjectLength(project) {
  const details = project?.project_details || {};
  const length = Number(details.road_length);

  return Number.isFinite(length) && length > 0
    ? length
    : 0;
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

  const isRoadProject =
    project.project_type === 'CONCRETING OF ROAD';

  const length =
    isRoadProject
      ? getRoadProjectLength(project)
      : 0;

  state.materialEstimateProjectId = projectId;

  document.getElementById('materialEstimateProjectName').textContent =
    project.project_name || '—';

  document.getElementById('materialEstimateProjectId').textContent =
    project.project_id || '—';

  document.getElementById('materialEstimateBasis').textContent =
    isRoadProject
      ? Number(length || 0).toLocaleString(
          'en-PH',
          { maximumFractionDigits: 6 }
        )
      : 'MANUAL';

  const info = document.getElementById('materialEstimateInfo');
  info.style.display = 'block';
  info.textContent =
    isRoadProject
      ? (
        length > 0
          ? 'Road quantities are generated from the saved Project Length. Total Cost is calculated automatically as QTY × RATE.'
          : 'Project Length is not available. Complete the Road Engineering Details before generating the automatic road estimate.'
      )
      : 'Add the required materials or cost items. Total Cost is calculated automatically as QTY × RATE.';

  loadMaterialEstimateItems(project, length);
}

async function loadMaterialEstimateItems(project, length) {
  const body = document.getElementById('materialEstimateBody');
  const modal = document.getElementById('materialEstimateModal');

  body.innerHTML = `
    <tr>
      <td colspan="5" class="empty-row">Loading material estimate...</td>
    </tr>
  `;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  const isRoadProject =
    project.project_type === 'CONCRETING OF ROAD';

  const estimateType =
    isRoadProject
      ? 'ROAD'
      : 'GENERAL';

  let existing = [];

  try {
    const { data, error } =
      await supabaseClient
        .from('project_material_estimates')
        .select('estimate_id')
        .eq('project_id', project.project_id)
        .eq('estimate_type', estimateType)
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

    const templates =
      isRoadProject
        ? getRoadMaterialBOM(project)
        : [];
    const standardDescriptions = new Set(
      templates.map(item => item.description)
    );

    const rows = templates.map(template => {
      const found =
        existing.find(
          item => item.description === template.description
        );

      const basisLength =
        Number.isFinite(Number(template.basisLength))
          ? Number(template.basisLength)
          : length;

      const qty =
        basisLength * Number(template.factor || 0);

      let rate = 0;

      if (Number.isFinite(Number(found?.rate))) {
        rate = Number(found.rate);
      } else if (template.sameAs) {
        const sameAsRow =
          existing.find(
            item => item.description === template.sameAs
          );

        rate =
          Number.isFinite(Number(sameAsRow?.rate))
            ? Number(sameAsRow.rate)
            : Number(template.defaultRate || 0);
      } else {
        rate = Number(template.defaultRate || 0);
      }

      return {
        ...template,
        unit: found?.unit || template.unit,
        qty,
        rate,
        total_cost: qty * rate,
        custom: false
      };
    });

    // Preserve any user-created descriptions saved previously.
    existing
      .filter(item => !standardDescriptions.has(item.description))
      .forEach(item => {
        const qty = Number(item.qty || 0);
        const rate = Number(item.rate || 0);

        rows.push({
          description: item.description || 'Custom Description',
          unit: item.unit || '',
          qty: Number.isFinite(qty) ? qty : 0,
          rate: Number.isFinite(rate) ? rate : 0,
          factor: Number(item.consumption_factor || 0),
          formula: item.formula || 'MANUAL ENTRY',
          custom: true
        });
      });

    renderMaterialEstimateRows(rows);
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

function renderMaterialEstimateRows(rows) {
  const body = document.getElementById('materialEstimateBody');

  body.innerHTML =
    rows.map((row, index) => {
      const custom = row.custom === true;

      const descriptionCell = custom
        ? `
          <div class="material-estimate-custom-wrap">
            <input
              class="material-estimate-description"
              data-material-description
              data-material-custom="true"
              data-index="${index}"
              value="${escapeHtml(row.description)}"
              placeholder="Enter description"
              maxlength="120"
            >
          </div>
        `
        : `
          <strong>${escapeHtml(row.description)}</strong>
        `;

      const qtyCell = custom
        ? `
          <input
            class="material-estimate-qty-input"
            data-material-qty
            data-index="${index}"
            data-material-custom="true"
            type="text"
            inputmode="decimal"
            value="${Number(row.qty || 0)}"
            placeholder="0"
          >
        `
        : `
          <span data-material-qty data-index="${index}">
            ${Number(row.qty || 0).toLocaleString('en-PH',{maximumFractionDigits:6})}
          </span>
        `;

      return `
        <tr data-material-row data-index="${index}" data-material-custom-row="${custom ? 'true' : 'false'}">
          <td>
            ${descriptionCell}
            <div class="project-formula">Formula: ${escapeHtml(row.formula || 'MANUAL ENTRY')}</div>
            <input type="hidden" data-material-factor data-index="${index}" value="${Number(row.factor || 0)}">
            <input type="hidden" data-material-formula data-index="${index}" value="${escapeHtml(row.formula || 'MANUAL ENTRY')}">
          </td>

          <td>
            <input
              class="material-estimate-unit"
              data-material-unit
              data-index="${index}"
              value="${escapeHtml(row.unit)}"
              maxlength="40"
              placeholder="Unit"
            >
          </td>

          <td class="material-estimate-qty">
            ${qtyCell}
          </td>

          <td>
            <input
              class="material-estimate-rate"
              data-material-rate
              data-index="${index}"
              type="text"
              inputmode="decimal"
              value="${Number(row.rate || 0).toFixed(2)}"
              placeholder="0.00"
            >
          </td>

          <td class="material-estimate-total" data-material-total data-index="${index}">
            ${materialEstimateMoney(row.qty * row.rate)}
          </td>
        </tr>
      `;
    }).join('');

  bindMaterialEstimateInputs();
  updateMaterialEstimateTotals();
}

function bindMaterialEstimateInputs() {
  document
    .querySelectorAll('[data-material-rate], [data-material-qty][data-material-custom="true"]')
    .forEach(input => {
      if (input.dataset.materialBound === 'true') return;

      input.dataset.materialBound = 'true';

      input.addEventListener(
        'input',
        () => {
          normalizeMaterialDecimal(input);
          updateMaterialEstimateTotals();
        }
      );
    });
}

function normalizeMaterialDecimal(input) {
  if (!input) return;

  let value =
    String(input.value || '')
      .replace(/[^0-9.]/g, '');

  const dot = value.indexOf('.');

  if (dot >= 0) {
    value =
      value.slice(0, dot + 1) +
      value.slice(dot + 1).replace(/\\./g, '');
  }

  input.value = value;
}

function addMaterialEstimateDescription() {
  const body = document.getElementById('materialEstimateBody');

  const currentRows =
    body.querySelectorAll('[data-material-row]').length;

  const row = {
    description: '',
    unit: '',
    qty: 0,
    rate: 0,
    factor: 0,
    formula: 'MANUAL ENTRY',
    custom: true
  };

  const wrapper =
    document.createElement('div');

  wrapper.innerHTML = `
    <table style="display:none"><tbody>
      <tr></tr>
    </tbody></table>
  `;

  const nextIndex = currentRows;

  const tr =
    document.createElement('tr');

  tr.setAttribute('data-material-row', '');
  tr.setAttribute('data-index', nextIndex);
  tr.setAttribute('data-material-custom-row', 'true');

  tr.innerHTML = `
    <td>
      <input
        class="material-estimate-description"
        data-material-description
        data-material-custom="true"
        data-index="${nextIndex}"
        value=""
        placeholder="Enter description"
        maxlength="120"
      >
      <div class="project-formula">Formula: MANUAL ENTRY</div>
      <input type="hidden" data-material-factor data-index="${nextIndex}" value="0">
      <input type="hidden" data-material-formula data-index="${nextIndex}" value="MANUAL ENTRY">
    </td>

    <td>
      <input
        class="material-estimate-unit"
        data-material-unit
        data-index="${nextIndex}"
        value=""
        maxlength="40"
        placeholder="Unit"
      >
    </td>

    <td class="material-estimate-qty">
      <input
        class="material-estimate-qty-input"
        data-material-qty
        data-material-custom="true"
        data-index="${nextIndex}"
        type="text"
        inputmode="decimal"
        value="0"
        placeholder="0"
      >
    </td>

    <td>
      <input
        class="material-estimate-rate"
        data-material-rate
        data-index="${nextIndex}"
        type="text"
        inputmode="decimal"
        value="0.00"
        placeholder="0.00"
      >
    </td>

    <td class="material-estimate-total" data-material-total data-index="${nextIndex}">
      ₱0.00
    </td>
  `;

  body.appendChild(tr);

  bindMaterialEstimateInputs();
  updateMaterialEstimateTotals();

  tr.querySelector('[data-material-description]')?.focus();
}

function updateMaterialEstimateTotals() {
  let grandTotal = 0;

  document
    .querySelectorAll('[data-material-rate]')
    .forEach(input => {
      const index = input.dataset.index;

      const qtyElement =
        document.querySelector(
          `[data-material-qty][data-index="${index}"]`
        );

      const qty =
        qtyElement?.tagName === 'INPUT'
          ? Number(qtyElement.value || 0)
          : Number(
              qtyElement?.textContent
                .replaceAll(',','')
            ) || 0;

      const rate =
        Number(input.value || 0);

      const total = qty * rate;

      grandTotal += total;

      const totalCell =
        document.querySelector(
          `[data-material-total][data-index="${index}"]`
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

  const isRoadProject =
    project.project_type === 'CONCRETING OF ROAD';

  const estimateType =
    isRoadProject
      ? 'ROAD'
      : 'GENERAL';

  const length =
    isRoadProject
      ? getRoadProjectLength(project)
      : 0;

  if (isRoadProject && !length) {
    throw new Error(
      'Project Length is not available. Please complete the Road Engineering Details first.'
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
            estimate_type: estimateType,
            basis_quantity: length,
            basis_label: isRoadProject
              ? 'PROJECT LENGTH'
              : 'MANUAL',
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
      .querySelectorAll('[data-material-row]')
      .forEach(row => {
        const index = row.dataset.index;

        const descriptionEl =
          row.querySelector('[data-material-description]');

        const description =
          (descriptionEl?.value || '')
            .trim();

        if (!description) {
          return;
        }

        const unit =
          row.querySelector('[data-material-unit]')
            ?.value.trim() || '';

        const factor =
          Number(
            row.querySelector('[data-material-factor]')
              ?.value
          ) || 0;

        const formula =
          row.querySelector('[data-material-formula]')
            ?.value || 'MANUAL ENTRY';

        const qtyEl =
          row.querySelector('[data-material-qty]');

        const qty =
          qtyEl?.tagName === 'INPUT'
            ? Number(qtyEl.value || 0)
            : Number(
                qtyEl?.textContent.replaceAll(',','')
              ) || 0;

        const rate =
          Number(
            row.querySelector('[data-material-rate]')
              ?.value
          ) || 0;

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

    const customRows =
      document.querySelectorAll(
        '[data-material-custom="true"]'
      );

    const invalidCustomRow =
      Array.from(
        document.querySelectorAll(
          '[data-material-custom-row="true"]'
        )
      ).some(row => {
        const description =
          row.querySelector(
            '[data-material-description]'
          )?.value.trim() || '';

        return !description;
      });

    if (invalidCustomRow) {
      throw new Error(
        'Please enter a description for every custom material row before saving.'
      );
    }

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


function printMaterialEstimate() {
  const modal =
    document.getElementById(
      'materialEstimateModal'
    );

  if (!modal) return;

  const card =
    modal.querySelector(
      '.material-estimate-modal-card'
    );

  if (!card) return;

  const printWindow =
    window.open(
      '',
      '_blank',
      'width=1000,height=800'
    );

  if (!printWindow) {
    showMessage(
      'globalMessage',
      'The print window could not be opened. Please allow pop-ups for AMANAH and try again.',
      'error'
    );
    return;
  }

  const clone =
    card.cloneNode(true);

  // Preserve the values currently visible in editable fields.
  clone
    .querySelectorAll('input, textarea, select')
    .forEach(field => {
      if (field.tagName === 'SELECT') {
        Array.from(field.options).forEach(option => {
          option.selected =
            option.value === field.value;
        });
      } else {
        field.setAttribute(
          'value',
          field.value || ''
        );

        if (field.tagName === 'TEXTAREA') {
          field.textContent =
            field.value || '';
        }
      }
    });

  // Remove screen-only controls from the printed document.
  clone
    .querySelectorAll(
      '.material-estimate-actions, .close-button'
    )
    .forEach(element =>
      element.remove()
    );

  const printDocument = printWindow.document;

  printDocument.open();
  printDocument.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>BOM / Material Estimate</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            background: #fff;
            color: #0f172a;
            font-family: Arial, Helvetica, sans-serif;
          }

          body {
            padding: 0;
          }

          .material-estimate-modal-card {
            width: 100%;
            max-width: none;
            background: #fff;
            box-shadow: none;
            border: 0;
            border-radius: 0;
            padding: 0;
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
            padding: 0 0 12px;
            border-bottom: 2px solid #0f172a;
          }

          .modal-header h2 {
            margin: 0;
            font-size: 20px;
            line-height: 1.25;
            color: #0f172a;
          }

          .material-estimate-subtitle {
            margin: 5px 0 0;
            color: #475569;
            font-size: 10px;
            line-height: 1.45;
          }

          .material-estimate-project {
            display: grid;
            grid-template-columns: 1.6fr 1fr 1fr;
            gap: 10px;
            margin: 12px 0;
            padding: 10px 12px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: #f8fafc;
          }

          .material-estimate-project small {
            display: block;
            margin-bottom: 4px;
            color: #475569;
            font-size: 8px;
            font-weight: 700;
            letter-spacing: .08em;
            text-transform: uppercase;
          }

          .material-estimate-project strong {
            display: block;
            font-size: 11px;
            font-weight: 800;
            color: #0f172a;
          }

          .material-estimate-info {
            display: block !important;
            margin: 0 0 10px;
            padding: 8px 10px;
            border: 1px solid #cbd5e1;
            border-radius: 7px;
            background: #f8fafc;
            color: #334155;
            font-size: 9px;
            line-height: 1.45;
          }

          .material-estimate-table-wrap {
            overflow: visible;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
          }

          .material-estimate-table {
            width: 100%;
            min-width: 0;
            border-collapse: collapse;
          }

          .material-estimate-table th,
          .material-estimate-table td {
            padding: 7px 8px;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
            vertical-align: middle;
            font-size: 9px;
          }

          .material-estimate-table thead th {
            background: #f1f5f9;
            color: #334155;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: .06em;
            text-transform: uppercase;
          }

          .material-estimate-table tfoot th {
            background: #f8fafc;
            color: #0f172a;
            font-size: 9px;
          }

          .material-estimate-table input {
            width: 100%;
            min-height: 22px;
            padding: 0;
            border: 0;
            outline: 0;
            background: transparent;
            color: #0f172a;
            font: inherit;
          }

          .project-formula {
            margin-top: 2px;
            color: #64748b;
            font-size: 7px;
            line-height: 1.3;
          }

          .material-estimate-qty,
          .material-estimate-total {
            white-space: nowrap;
            font-weight: 800;
          }

          .material-estimate-note {
            margin-top: 8px;
            padding: 8px 10px;
            border: 1px solid #cbd5e1;
            border-radius: 7px;
            background: #f8fafc;
            color: #475569;
            font-size: 8px;
            line-height: 1.45;
          }

          .material-estimate-note strong {
            color: #334155;
          }
        </style>
      </head>

      <body>
        ${clone.outerHTML}
      </body>
    </html>
  `);

  printDocument.close();

  const doPrint = () => {
    printWindow.focus();
    printWindow.print();

    printWindow.onafterprint = () => {
      printWindow.close();
    };
  };

  setTimeout(doPrint, 350);
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

  // Move the chooser to document.body so it cannot be trapped
  // inside another stacking context created by the AMANAH shell.
  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  modal.style.setProperty('z-index','20000','important');
  modal.style.setProperty('pointer-events','auto','important');

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
    const hasShouldering = details.road_shouldering === true ||
      String(details.road_shouldering).toUpperCase() === 'YES';

    return `
      <div class="project-detail-section">
        <h3>ROAD ENGINEERING DETAILS</h3>
        <p>Enter the pavement dimensions. Concrete shouldering is optional and can be enabled when applicable.</p>

        <div class="form-grid">
          ${field('Length','road_length',details.road_length,false,'number','0')}
          ${field('Width','road_width',details.road_width,false,'number','0')}
          ${field('Thickness','road_thickness',details.road_thickness,false,'number','0')}
          ${calculatedField('Pavement Area','road_pavement_area',details.road_pavement_area,'LENGTH × WIDTH × THICKNESS')}
        </div>

        <div class="project-detail-section road-shouldering-panel">
          <div class="road-shouldering-heading">
            <div>
              <h3>CONCRETE SHOULDERING</h3>
              <p>Optional. Select YES only when this road project includes concrete shouldering.</p>
            </div>
            ${selectField(
              'Concrete Shouldering',
              'road_shouldering',
              ['NO','YES'],
              hasShouldering ? 'YES' : 'NO'
            )}
          </div>

          <div id="roadShoulderingFields" class="form-grid ${hasShouldering ? '' : 'hidden'}">
            ${field('Shouldering Length','road_shouldering_length',details.road_shouldering_length,false,'number','0')}
            ${field('Shouldering Width','road_shouldering_width',details.road_shouldering_width,false,'number','0')}
            ${field('Shouldering Thickness','road_shouldering_thickness',details.road_shouldering_thickness,false,'number','0')}
            ${calculatedField('Shouldering Area','road_shouldering_area',details.road_shouldering_area,'LENGTH × WIDTH × THICKNESS')}
          </div>
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
        <p>Enter the slope using the Rise-to-Run ratio. AMANAH calculates the slope ratio, true slope length using the Pythagorean theorem, and slope surface area.</p>
        <div class="form-grid">
          ${field('Rise','flood_rise',details.flood_rise,false,'number','0')}
          ${field('Run','flood_run',details.flood_run,false,'number','0')}
          ${field('Width','flood_width',details.flood_width,false,'number','0')}

          ${calculatedField('Slope Ratio','flood_slope',details.flood_slope,'RISE ÷ RUN')}
          ${calculatedField('Slope Length','flood_slope_length',details.flood_slope_length,'√(RISE² + RUN²)')}
          ${calculatedField('Slope Area','flood_slope_area',details.flood_slope_area,'SLOPE LENGTH × WIDTH')}

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

  if (type === 'WATER SYSTEM') {
    return `
      <div class="project-detail-section">
        <h3>WATER SYSTEM ENGINEERING DETAILS</h3>
        <p>Enter the required structural dimensions and quantities for the water system project.</p>

        <div class="project-detail-section">
          <h3>COLUMN</h3>
          <div class="form-grid">
            ${field('Width','water_column_width',details.water_column_width,false,'number','0')}
            ${field('Length','water_column_length',details.water_column_length,false,'number','0')}
            ${field('Height','water_column_height',details.water_column_height,false,'number','0')}
            ${calculatedField('Column','water_column_quantity',details.water_column_quantity,'WIDTH × LENGTH × HEIGHT')}
          </div>
        </div>

        <div class="project-detail-section">
          <h3>BEAM</h3>
          <div class="form-grid">
            ${field('Width','water_beam_width',details.water_beam_width,false,'number','0')}
            ${field('Length','water_beam_length',details.water_beam_length,false,'number','0')}
            ${field('Thickness','water_beam_thickness',details.water_beam_thickness,false,'number','0')}
            ${calculatedField('Beam','water_beam_quantity',details.water_beam_quantity,'WIDTH × LENGTH × THICKNESS')}
          </div>
        </div>

        <div class="project-detail-section">
          <h3>SECOND FLOOR BEAM</h3>
          <div class="form-grid">
            ${field('Width','water_second_floor_beam_width',details.water_second_floor_beam_width,false,'number','0')}
            ${field('Length','water_second_floor_beam_length',details.water_second_floor_beam_length,false,'number','0')}
            ${field('Thickness','water_second_floor_beam_thickness',details.water_second_floor_beam_thickness,false,'number','0')}
            ${calculatedField('Second Floor Beam','water_second_floor_beam_quantity',details.water_second_floor_beam_quantity,'WIDTH × LENGTH × THICKNESS')}
          </div>
        </div>

        <div class="project-detail-section">
          <h3>SLUB</h3>
          <div class="form-grid">
            ${field('Width','water_slub_width',details.water_slub_width,false,'number','0')}
            ${field('Length','water_slub_length',details.water_slub_length,false,'number','0')}
            ${field('Thickness','water_slub_thickness',details.water_slub_thickness,false,'number','0')}
            ${calculatedField('Slub','water_slub_quantity',details.water_slub_quantity,'WIDTH × LENGTH × THICKNESS')}
          </div>
        </div>

        <div class="project-detail-section">
          <h3>3RD FLOOR BEAM</h3>
          <div class="form-grid">
            ${field('Width','water_3rd_floor_beam_width',details.water_3rd_floor_beam_width,false,'number','0')}
            ${field('Length','water_3rd_floor_beam_length',details.water_3rd_floor_beam_length,false,'number','0')}
            ${field('Thickness','water_3rd_floor_beam_thickness',details.water_3rd_floor_beam_thickness,false,'number','0')}
            ${calculatedField('3rd Floor Beam','water_3rd_floor_beam_quantity',details.water_3rd_floor_beam_quantity,'WIDTH × LENGTH × THICKNESS')}
          </div>
        </div>

        <div class="project-detail-section">
          <h3>TOP STAND</h3>
          <div class="form-grid">
            ${field('How Many','water_top_stand_quantity',details.water_top_stand_quantity,false,'number','0')}
          </div>
        </div>

        <div class="project-detail-section">
          <h3>SOLAR PANNEL</h3>
          <div class="form-grid">
            ${field('How Many','water_solar_pannel_quantity',details.water_solar_pannel_quantity,false,'number','0')}
          </div>
        </div>
      </div>`;
  }

  if (type === 'BRIDGE') {
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
      <input
        id="${name}"
        name="${name}"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        data-calculated-field="true"
        value="${escapeHtml(value ?? '')}"
        readonly
      >
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

    const shouldering =
      document.getElementById('road_shouldering')?.value === 'YES';

    const shoulderingFields =
      document.getElementById('roadShoulderingFields');

    if (shoulderingFields) {
      shoulderingFields.classList.toggle(
        'hidden',
        !shouldering
      );
    }

    if (shouldering) {
      set(
        'road_shouldering_area',
        product(
          'road_shouldering_length',
          'road_shouldering_width',
          'road_shouldering_thickness'
        )
      );
    } else {
      set('road_shouldering_area', null);
    }
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
    const rise = num('flood_rise');
    const run = num('flood_run');
    const width = num('flood_width');

    // Rise-to-run is the slope ratio.
    const slopeRatio =
      rise !== null &&
      run !== null &&
      run !== 0
        ? rise / run
        : null;

    // Treat Rise and Run as the perpendicular legs of the
    // right triangle. The sloped face is the hypotenuse.
    const slopeLength =
      rise !== null &&
      run !== null
        ? Math.sqrt(
            (rise * rise) +
            (run * run)
          )
        : null;

    set(
      'flood_slope',
      slopeRatio
    );

    set(
      'flood_slope_length',
      slopeLength
    );

    set(
      'flood_slope_area',
      slopeLength !== null &&
      width !== null
        ? slopeLength * width
        : null
    );

    const cap = num('sheet_pile_cap_length');
    const pileWidth = num('sheet_pile_width');

    set(
      'sheet_pile_pieces',
      cap !== null &&
      pileWidth !== null &&
      pileWidth !== 0
        ? cap / pileWidth
        : null
    );
  }

  if (type === 'COVERED COURT') {
    set('covered_floor_area',product('covered_floor_length','covered_floor_width','covered_floor_thickness'));
    set('covered_footing_quantity',product('covered_footing_width','covered_footing_length','covered_footing_thickness'));
    set('covered_column_quantity',product('covered_column_width','covered_column_length','covered_column_height'));
    set('covered_beam_quantity',product('covered_beam_width','covered_beam_length','covered_beam_thickness'));
  }

  if (type === 'WATER SYSTEM') {
    set('water_column_quantity',product('water_column_width','water_column_length','water_column_height'));
    set('water_beam_quantity',product('water_beam_width','water_beam_length','water_beam_thickness'));
    set('water_second_floor_beam_quantity',product('water_second_floor_beam_width','water_second_floor_beam_length','water_second_floor_beam_thickness'));
    set('water_slub_quantity',product('water_slub_width','water_slub_length','water_slub_thickness'));
    set('water_3rd_floor_beam_quantity',product('water_3rd_floor_beam_width','water_3rd_floor_beam_length','water_3rd_floor_beam_thickness'));
  }
}

function collectProjectDetails(type,values) {
  const map = {
    'CONCRETING OF ROAD':[
      'road_length',
      'road_width',
      'road_thickness',
      'road_pavement_area',
      'road_shouldering',
      'road_shouldering_length',
      'road_shouldering_width',
      'road_shouldering_thickness',
      'road_shouldering_area'
    ],
    'MULTI PURPOSE BUILDING':['building_floor_length','building_floor_width','building_floor_thickness','building_floor_area','building_height','footing_width','footing_length','footing_thickness','footing_quantity','column_width','column_length','column_height','column_quantity','beam_type','beam_width','beam_length','beam_thickness','beam_quantity','wall_height','wall_width','wall_quantity'],
    'SCHOOL BUILDING':['building_floor_length','building_floor_width','building_floor_thickness','building_floor_area','building_height','footing_width','footing_length','footing_thickness','footing_quantity','column_width','column_length','column_height','column_quantity','beam_type','beam_width','beam_length','beam_thickness','beam_quantity','wall_height','wall_width','wall_quantity'],
    'FLOOD CONTROL':[
      'flood_rise',
      'flood_run',
      'flood_width',
      'flood_slope',
      'flood_slope_length',
      'flood_slope_area',
      'sheet_pile_cap_length',
      'sheet_pile_width',
      'sheet_pile_pieces'
    ],
    'WATER SYSTEM':[
      'water_column_width',
      'water_column_length',
      'water_column_height',
      'water_column_quantity',
      'water_beam_width',
      'water_beam_length',
      'water_beam_thickness',
      'water_beam_quantity',
      'water_second_floor_beam_width',
      'water_second_floor_beam_length',
      'water_second_floor_beam_thickness',
      'water_second_floor_beam_quantity',
      'water_slub_width',
      'water_slub_length',
      'water_slub_thickness',
      'water_slub_quantity',
      'water_3rd_floor_beam_width',
      'water_3rd_floor_beam_length',
      'water_3rd_floor_beam_thickness',
      'water_3rd_floor_beam_quantity',
      'water_top_stand_quantity',
      'water_solar_pannel_quantity'
    ],
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

  fields.querySelectorAll('input, select').forEach(input => {
    input.readOnly = false;
    input.disabled = false;
    input.style.pointerEvents = 'auto';
    input.style.userSelect = 'text';
  });

  fields.oninput = calculateProjectFormulas;
  fields.onchange = calculateProjectFormulas;
  fields.addEventListener(
    'change',
    event => {
      if (
        event.target?.id === 'road_shouldering'
      ) {
        calculateProjectFormulas();
      }
    }
  );
  setupDecimalInputs(fields);
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
        type="${type === 'number' ? 'text' : type}"
        inputmode="${type === 'number' ? 'decimal' : ''}"
        autocomplete="off"
        data-decimal-input="${type === 'number' ? 'true' : 'false'}"
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


function normalizeDecimalValue(input) {
  if (!input) return;

  let value = String(input.value || '')
    .replace(/[^0-9.]/g, '');

  const firstDot = value.indexOf('.');
  if (firstDot !== -1) {
    value =
      value.slice(0, firstDot + 1) +
      value.slice(firstDot + 1).replace(/\./g, '');
  }

  input.value = value;
}

function setupDecimalInputs(container = document) {
  container
    .querySelectorAll('[data-decimal-input="true"]')
    .forEach(input => {
      input.readOnly = false;
      input.disabled = false;
      input.style.pointerEvents = 'auto';
      input.style.userSelect = 'text';
      input.addEventListener(
        'input',
        () => normalizeDecimalValue(input)
      );
    });
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

    hourly_rate:
      (values.department || '').toUpperCase() === 'TRUCKERS'
        ? (values.hourly_rate === '' ? 0 : Number(values.hourly_rate))
        : 0,

    daily_rate:
      (values.department || '').toUpperCase() === 'TRUCKERS'
        ? 0
        : (values.daily_rate === '' ? 0 : Number(values.daily_rate)),

    rate_basis:
      'PER DAY',

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

  document.addEventListener(
    'click',
    event => {
      const button = event.target.closest('[data-project-type]');
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      chooseProjectType(
        button.dataset.projectType
      );
    },
    true
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
      'addMaterialDescriptionButton'
    )
    .addEventListener(
      'click',
      addMaterialEstimateDescription
    );

  document
    .getElementById(
      'printMaterialEstimateButton'
    )
    .addEventListener(
      'click',
      printMaterialEstimate
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


  /* DELETE_CONFIRMATION_DELEGATE */
  document.addEventListener('click', event => {
    const cancel = event.target.closest('#cancelDeleteButton, #deleteConfirmationCloseButton');
    if (cancel) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeDeleteConfirmation();
      return;
    }
    const confirm = event.target.closest('#confirmDeleteButton');
    if (confirm) {
      event.preventDefault();
      event.stopImmediatePropagation();
      executeDeleteConfirmation();
      return;
    }
    if (event.target.id === 'deleteConfirmationModal') closeDeleteConfirmation();
  }, true);
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
