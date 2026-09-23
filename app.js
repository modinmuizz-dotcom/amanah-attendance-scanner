/*******************************************************
 * AMANAH ATTENDANCE SCANNER
 *******************************************************/

const API_URL =
  'https://script.google.com/macros/s/AKfycbyIUJffSWob23Ewwx8qKhVGFRJMoSn1mCnVCYoGDN-JsV4sAWIvYFGx5IG9LjpWEIbi/exec';

const PERMANENT_QR = {
  type: 'AMANAH_ATTENDANCE_V1',
  company: 'AMANAH CONSTRUCTION',
  system: 'AMANAH CONSTRUCTION MANAGEMENT SYSTEM',
  station: 'MAIN_ATTENDANCE',
  version: 1
};


/* =====================================================
   STATE
   ===================================================== */

const state = {
  stationVerified: false,

  employees: [],
  equipment: [],
  projects: [],
  activeAttendance: [],

  selectedEmployee: null,
  selectedEquipment: null,
  selectedProject: null,

  scanner: null,
  scannerRunning: false,

  pendingOut: false
};


/* =====================================================
   DOM
   ===================================================== */

const $ = (id) => document.getElementById(id);


/* =====================================================
   START
   ===================================================== */

document.addEventListener('DOMContentLoaded', () => {

  setupButtons();

  showScreen('scannerScreen');

  setStatus(
    'Tap OPEN CAMERA to begin.',
    'info'
  );
});


/* =====================================================
   BUTTONS
   ===================================================== */

function setupButtons() {

  $('inButton')?.addEventListener(
    'click',
    timeIn
  );

  $('outButton')?.addEventListener(
    'click',
    beginTimeOut
  );

  $('fuelNoButton')?.addEventListener(
    'click',
    () => completeTimeOut(false)
  );

  $('fuelYesButton')?.addEventListener(
    'click',
    showFuelForm
  );

  $('fuelConfirmButton')?.addEventListener(
    'click',
    () => completeTimeOut(true)
  );

  $('restartScannerButton')?.addEventListener(
    'click',
    restartScanner
  );

  $('employeeSearch')?.addEventListener(
    'input',
    filterEmployees
  );

  $('equipmentSearch')?.addEventListener(
    'input',
    filterEquipment
  );

  $('projectSearch')?.addEventListener(
    'input',
    filterProjects
  );

  $('employeeSelect')?.addEventListener(
    'change',
    employeeChanged
  );

  $('equipmentSelect')?.addEventListener(
    'change',
    equipmentChanged
  );

  $('projectSelect')?.addEventListener(
    'change',
    projectChanged
  );
}


/* =====================================================
   CAMERA
   ===================================================== */

async function startScanner() {

  if (state.scannerRunning) {
    return;
  }

  try {

    if (state.scanner) {
      try {
        await state.scanner.clear();
      } catch (_) {}
    }

    state.scanner =
      new Html5Qrcode('reader');

    await state.scanner.start(
      {
        facingMode: {
          ideal: 'environment'
        }
      },
      {
        fps: 10,
        qrbox: {
          width: 260,
          height: 260
        },

        aspectRatio: 1.0
      },

      onScanSuccess,

      () => {}
    );

    state.scannerRunning = true;

    setStatus(
      'Camera ready. Point it at the AMANAH company QR code.',
      'info'
    );

  } catch (error) {

    console.error(error);

    setStatus(
      'Unable to open camera. Allow camera permission and reload the page.',
      'error'
    );
  }
}


/* =====================================================
   QR SUCCESS
   ===================================================== */

async function onScanSuccess(decodedText) {

  if (state.stationVerified) {
    return;
  }

  const payload = parseQr(decodedText);

  if (!payload) {

    setStatus(
      'Invalid QR code. Please scan the AMANAH company QR code.',
      'error'
    );

    return;
  }

  const valid =
    payload.type === PERMANENT_QR.type &&
    payload.company === PERMANENT_QR.company &&
    payload.system === PERMANENT_QR.system &&
    payload.station === PERMANENT_QR.station &&
    Number(payload.version) === PERMANENT_QR.version;

  if (!valid) {

    setStatus(
      'This is not the AMANAH attendance station QR code.',
      'error'
    );

    return;
  }

  state.stationVerified = true;

  await stopScanner();

  setStatus(
    '✓ AMANAH station verified.',
    'success'
  );

  showScreen('attendanceScreen');

  await loadBootstrap();
}


/* =====================================================
   QR PARSER
   ===================================================== */

function parseQr(text) {

  try {

    return JSON.parse(
      String(text).trim()
    );

  } catch (error) {

    return null;
  }
}


/* =====================================================
   LOAD DATA
   ===================================================== */

async function loadBootstrap() {

  setStatus(
    'Loading employees, equipment and projects...',
    'info'
  );

  try {

    const data = await apiCall(
      'getBootstrap'
    );

    if (!data.success) {
      throw new Error(
        data.error || 'Unable to load system data.'
      );
    }

    state.employees =
      Array.isArray(data.employees)
        ? data.employees
        : [];

    state.equipment =
      Array.isArray(data.equipment)
        ? data.equipment
        : [];

    state.projects =
      Array.isArray(data.projects)
        ? data.projects
        : [];

    state.activeAttendance =
      Array.isArray(data.activeAttendance)
        ? data.activeAttendance
        : [];

    buildEmployeeList();
    buildEquipmentList();
    buildProjectList();

    setStatus(
      '✓ Station verified. Please select who you are.',
      'success'
    );

    updateButtons();

  } catch (error) {

    console.error(error);

    setStatus(
      error.message || 'Unable to load system data.',
      'error'
    );
  }
}


/* =====================================================
   EMPLOYEES
   ===================================================== */

function buildEmployeeList() {

  const select = $('employeeSelect');

  if (!select) {
    return;
  }

  select.innerHTML =
    '<option value="">Select employee / operator / driver</option>';

  state.employees.forEach(employee => {

    if (!employee.employeeId) {
      return;
    }

    const option =
      document.createElement('option');

    option.value =
      employee.employeeId;

    option.textContent =
      employee.employeeName +
      ' — ' +
      employee.employeeId +
      (
        employee.position
          ? ' (' + employee.position + ')'
          : ''
      );

    select.appendChild(option);
  });
}


function filterEmployees() {

  const search =
    String(
      $('employeeSearch')?.value || ''
    ).toLowerCase().trim();

  const select =
    $('employeeSelect');

  if (!select) {
    return;
  }

  select.innerHTML =
    '<option value="">Select employee / operator / driver</option>';

  state.employees
    .filter(employee => {

      const text =
        [
          employee.employeeId,
          employee.employeeName,
          employee.position,
          employee.department
        ]
          .join(' ')
          .toLowerCase();

      return text.includes(search);

    })
    .forEach(employee => {

      const option =
        document.createElement('option');

      option.value =
        employee.employeeId;

      option.textContent =
        employee.employeeName +
        ' — ' +
        employee.employeeId +
        (
          employee.position
            ? ' (' + employee.position + ')'
            : ''
        );

      select.appendChild(option);
    });
}


function employeeChanged() {

  const employeeId =
    $('employeeSelect')?.value || '';

  state.selectedEmployee =
    state.employees.find(
      employee =>
        employee.employeeId === employeeId
    ) || null;

  updateActiveAttendanceDisplay();

  updateButtons();
}


/* =====================================================
   EQUIPMENT
   ===================================================== */

function buildEquipmentList() {

  const select =
    $('equipmentSelect');

  if (!select) {
    return;
  }

  select.innerHTML =
    '<option value="">Select equipment</option>';

  state.equipment.forEach(item => {

    if (!item.equipmentId) {
      return;
    }

    const option =
      document.createElement('option');

    option.value =
      item.equipmentId;

    option.textContent =
      item.equipmentName +
      ' — ' +
      item.equipmentId;

    if (item.equipmentType) {
      option.textContent +=
        ' (' + item.equipmentType + ')';
    }

    select.appendChild(option);
  });
}


function filterEquipment() {

  const search =
    String(
      $('equipmentSearch')?.value || ''
    ).toLowerCase().trim();

  const select =
    $('equipmentSelect');

  if (!select) {
    return;
  }

  select.innerHTML =
    '<option value="">Select equipment</option>';

  state.equipment
    .filter(item => {

      const text =
        [
          item.equipmentId,
          item.equipmentName,
          item.equipmentType,
          item.plateNumber
        ]
          .join(' ')
          .toLowerCase();

      return text.includes(search);

    })
    .forEach(item => {

      const option =
        document.createElement('option');

      option.value =
        item.equipmentId;

      option.textContent =
        item.equipmentName +
        ' — ' +
        item.equipmentId;

      select.appendChild(option);
    });
}


function equipmentChanged() {

  const id =
    $('equipmentSelect')?.value || '';

  state.selectedEquipment =
    state.equipment.find(
      item =>
        item.equipmentId === id
    ) || null;

  updateButtons();
}


/* =====================================================
   PROJECTS
   ===================================================== */

function buildProjectList() {

  const select =
    $('projectSelect');

  if (!select) {
    return;
  }

  select.innerHTML =
    '<option value="">Select project</option>';

  state.projects.forEach(project => {

    if (!project.projectId) {
      return;
    }

    const option =
      document.createElement('option');

    option.value =
      project.projectId;

    option.textContent =
      project.projectName +
      ' — ' +
      project.projectId;

    select.appendChild(option);
  });
}


function filterProjects() {

  const search =
    String(
      $('projectSearch')?.value || ''
    ).toLowerCase().trim();

  const select =
    $('projectSelect');

  if (!select) {
    return;
  }

  select.innerHTML =
    '<option value="">Select project</option>';

  state.projects
    .filter(project => {

      const text =
        [
          project.projectId,
          project.projectName,
          project.client,
          project.location
        ]
          .join(' ')
          .toLowerCase();

      return text.includes(search);

    })
    .forEach(project => {

      const option =
        document.createElement('option');

      option.value =
        project.projectId;

      option.textContent =
        project.projectName +
        ' — ' +
        project.projectId;

      select.appendChild(option);
    });
}


function projectChanged() {

  const id =
    $('projectSelect')?.value || '';

  state.selectedProject =
    state.projects.find(
      project =>
        project.projectId === id
    ) || null;

  updateButtons();
}


/* =====================================================
   ACTIVE ATTENDANCE
   ===================================================== */

function getActiveAttendance() {

  if (!state.selectedEmployee) {
    return null;
  }

  return state.activeAttendance.find(
    item =>
      item.employeeId ===
      state.selectedEmployee.employeeId
  ) || null;
}


function updateActiveAttendanceDisplay() {

  const box =
    $('activeAttendance');

  const active =
    getActiveAttendance();

  if (!box) {
    return;
  }

  if (!active) {

    box.hidden = true;
    box.innerHTML = '';

    return;
  }

  box.hidden = false;

  box.innerHTML = `
    <div class="active-title">
      ACTIVE ATTENDANCE
    </div>

    <div class="active-row">
      <strong>${escapeHtml(active.employeeName)}</strong>
    </div>

    <div class="active-row">
      Equipment:
      <strong>${escapeHtml(active.equipmentName)}</strong>
    </div>

    <div class="active-row">
      Project:
      <strong>${escapeHtml(active.projectName)}</strong>
    </div>

    <div class="active-row">
      Time In:
      <strong>${escapeHtml(active.timeIn)}</strong>
    </div>
  `;
}


/* =====================================================
   BUTTON STATE
   ===================================================== */

function updateButtons() {

  const inButton =
    $('inButton');

  const outButton =
    $('outButton');

  if (!inButton || !outButton) {
    return;
  }

  const employeeSelected =
    !!state.selectedEmployee;

  const equipmentSelected =
    !!state.selectedEquipment;

  const projectSelected =
    !!state.selectedProject;

  const active =
    getActiveAttendance();

  inButton.disabled =
    !employeeSelected ||
    !equipmentSelected ||
    !projectSelected ||
    !!active;

  outButton.disabled =
    !employeeSelected ||
    !active;
}


/* =====================================================
   TIME IN
   ===================================================== */

async function timeIn() {

  if (
    !state.selectedEmployee ||
    !state.selectedEquipment ||
    !state.selectedProject
  ) {

    setStatus(
      'Please select employee, equipment and project.',
      'error'
    );

    return;
  }

  setBusy(true);

  try {

    const response =
      await apiCall(
        'timeIn',
        {
          employeeId:
            state.selectedEmployee.employeeId,

          employeeName:
            state.selectedEmployee.employeeName,

          equipmentId:
            state.selectedEquipment.equipmentId,

          equipmentName:
            state.selectedEquipment.equipmentName,

          projectId:
            state.selectedProject.projectId,

          projectName:
            state.selectedProject.projectName
        }
      );

    if (!response.success) {
      throw new Error(
        response.error || 'Time In failed.'
      );
    }

    setStatus(
      '✓ TIME IN recorded successfully.',
      'success'
    );

    showResult(
      response.attendance,
      'TIME IN RECORDED'
    );

    await loadBootstrap();

  } catch (error) {

    console.error(error);

    setStatus(
      error.message || 'Time In failed.',
      'error'
    );

  } finally {

    setBusy(false);
  }
}


/* =====================================================
   BEGIN OUT
   ===================================================== */

function beginTimeOut() {

  const active =
    getActiveAttendance();

  if (!active) {

    setStatus(
      'No active attendance was found for this employee.',
      'error'
    );

    return;
  }

  state.pendingOut = true;

  hideElement('fuelForm', true);
  hideElement('fuelQuestion', false);

  setStatus(
    'Time Out selected. Did you fuel the equipment?',
    'info'
  );

  $('fuelQuestion')?.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
}


/* =====================================================
   FUEL
   ===================================================== */

function showFuelForm() {

  hideElement('fuelQuestion', true);
  hideElement('fuelForm', false);

  $('fuelQuantity')?.focus();
}


async function completeTimeOut(useFuel) {

  const employee =
    state.selectedEmployee;

  if (!employee) {

    setStatus(
      'Please select the employee.',
      'error'
    );

    return;
  }

  let fuelData = {
    fuelUsed: 'NO'
  };

  if (useFuel) {

    const quantity =
      parseFloat(
        $('fuelQuantity')?.value || ''
      );

    const unit =
      $('fuelUnit')?.value || '';

    const amount =
      parseFloat(
        $('fuelAmount')?.value || ''
      );

    if (!(quantity > 0)) {

      setStatus(
        'Enter the fuel quantity.',
        'error'
      );

      return;
    }

    if (
      unit !== 'Liter' &&
      unit !== 'Gallon'
    ) {

      setStatus(
        'Select Liter or Gallon.',
        'error'
      );

      return;
    }

    if (!(amount >= 0)) {

      setStatus(
        'Enter the fuel price / amount.',
        'error'
      );

      return;
    }

    fuelData = {
      fuelUsed: 'YES',
      fuelQuantity: quantity,
      fuelUnit: unit,
      fuelAmount: amount
    };
  }

  setBusy(true);

  try {

    const response =
      await apiCall(
        'timeOut',
        Object.assign(
          {
            employeeId:
              employee.employeeId
          },
          fuelData
        )
      );

    if (!response.success) {

      throw new Error(
        response.error || 'Time Out failed.'
      );
    }

    setStatus(
      '✓ TIME OUT recorded successfully.',
      'success'
    );

    showResult(
      response.attendance,
      'TIME OUT RECORDED'
    );

    resetFuel();

    await loadBootstrap();

  } catch (error) {

    console.error(error);

    setStatus(
      error.message || 'Time Out failed.',
      'error'
    );

  } finally {

    setBusy(false);
  }
}


/* =====================================================
   RESULT
   ===================================================== */

function showResult(attendance, title) {

  const box =
    $('resultBox');

  if (!box || !attendance) {
    return;
  }

  box.hidden = false;

  box.innerHTML = `
    <div class="result-title">
      ${escapeHtml(title)}
    </div>

    <div class="result-item">
      Employee:
      <strong>${escapeHtml(attendance.employeeName || '')}</strong>
    </div>

    <div class="result-item">
      Equipment:
      <strong>${escapeHtml(attendance.equipmentName || '')}</strong>
    </div>

    <div class="result-item">
      Project:
      <strong>${escapeHtml(attendance.projectName || '')}</strong>
    </div>

    <div class="result-item">
      Date:
      <strong>${escapeHtml(attendance.date || '')}</strong>
    </div>

    ${
      attendance.timeIn
        ? `
          <div class="result-item">
            Time In:
            <strong>${escapeHtml(attendance.timeIn)}</strong>
          </div>
        `
        : ''
    }

    ${
      attendance.timeOut
        ? `
          <div class="result-item">
            Time Out:
            <strong>${escapeHtml(attendance.timeOut)}</strong>
          </div>
        `
        : ''
    }

    ${
      attendance.totalHours !== undefined
        ? `
          <div class="result-item">
            Total Hours:
            <strong>${escapeHtml(String(attendance.totalHours))}</strong>
          </div>
        `
        : ''
    }

    ${
      attendance.fuel
        ? `
          <div class="result-item">
            Fuel:
            <strong>${escapeHtml(attendance.fuel)}</strong>
          </div>
        `
        : ''
    }
  `;
}


/* =====================================================
   API JSONP
   ===================================================== */

function apiCall(action, params = {}) {

  return new Promise((resolve, reject) => {

    const callbackName =
      'amanahCallback_' +
      Date.now() +
      '_' +
      Math.floor(
        Math.random() * 100000
      );

    const script =
      document.createElement('script');

    const query =
      new URLSearchParams();

    query.set(
      'action',
      action
    );

    query.set(
      'callback',
      callbackName
    );

    query.set(
      '_',
      Date.now()
    );

    Object.keys(params).forEach(key => {

      if (
        params[key] !== undefined &&
        params[key] !== null
      ) {

        query.set(
          key,
          String(params[key])
        );
      }
    });

    const timeout =
      setTimeout(() => {

        cleanup();

        reject(
          new Error(
            'API request timed out.'
          )
        );

      }, 20000);

    function cleanup() {

      clearTimeout(timeout);

      try {
        delete window[callbackName];
      } catch (_) {
        window[callbackName] =
          undefined;
      }

      script.remove();
    }

    window[callbackName] =
      function(data) {

        cleanup();
        resolve(data);
      };

    script.onerror =
      function() {

        cleanup();

        reject(
          new Error(
            'Unable to connect to AMANAH API.'
          )
        );
      };

    script.src =
      API_URL +
      '?' +
      query.toString();

    document.body.appendChild(
      script
    );
  });
}


/* =====================================================
   SCANNER CONTROL
   ===================================================== */

async function stopScanner() {

  if (!state.scanner) {
    return;
  }

  try {

    if (state.scannerRunning) {
      await state.scanner.stop();
    }

  } catch (error) {

    console.warn(
      'Scanner stop warning:',
      error
    );
  }

  try {
    await state.scanner.clear();
  } catch (_) {}

  state.scannerRunning = false;
}


async function restartScanner() {

  state.stationVerified = false;
  state.selectedEmployee = null;
  state.selectedEquipment = null;
  state.selectedProject = null;

  hideElement(
    'attendanceScreen',
    true
  );

  hideElement(
    'resultBox',
    true
  );

  showScreen('scannerScreen');

  setStatus(
    'Starting camera...',
    'info'
  );

  await startScanner();
}


/* =====================================================
   SCREEN
   ===================================================== */

function showScreen(screenId) {

  document
    .querySelectorAll(
      '.app-screen'
    )
    .forEach(screen => {

      screen.hidden =
        screen.id !== screenId;
    });
}


/* =====================================================
   STATUS
   ===================================================== */

function setStatus(message, type) {

  const element =
    $('statusMessage');

  if (!element) {
    return;
  }

  element.textContent =
    message;

  element.className =
    'status-message ' +
    (type || 'info');
}


/* =====================================================
   BUSY
   ===================================================== */

function setBusy(busy) {

  document.body.classList.toggle(
    'busy',
    busy
  );

  if (busy) {

    const inButton =
      $('inButton');

    const outButton =
      $('outButton');

    if (inButton) {
      inButton.disabled = true;
    }

    if (outButton) {
      outButton.disabled = true;
    }

  } else {

    updateButtons();
  }
}


/* =====================================================
   FUEL RESET
   ===================================================== */

function resetFuel() {

  if ($('fuelQuantity')) {
    $('fuelQuantity').value = '';
  }

  if ($('fuelUnit')) {
    $('fuelUnit').value = 'Liter';
  }

  if ($('fuelAmount')) {
    $('fuelAmount').value = '';
  }

  hideElement(
    'fuelQuestion',
    true
  );

  hideElement(
    'fuelForm',
    true
  );

  state.pendingOut = false;
}


/* =====================================================
   HELPERS
   ===================================================== */

function hideElement(id, hidden) {

  const element =
    $(id);

  if (element) {
    element.hidden =
      hidden;
  }
}


function escapeHtml(value) {

  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
