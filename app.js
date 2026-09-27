/************************************************************
 * AMANAH CONSTRUCTION MANAGEMENT SYSTEM
 * QR ATTENDANCE STATION
 *
 * WORKFLOW
 * ONE PERMANENT AMANAH QR
 *        ↓
 * WHO ARE YOU?
 *
 * TIME IN
 *   → EQUIPMENT
 *   → PROJECT / LOCATION (search existing OR type custom)
 *   → METER IN
 *   → TIME IN
 *
 * TIME OUT
 *   → WHO ARE YOU?
 *   → SYSTEM FINDS ACTIVE ATTENDANCE
 *   → EQUIPMENT + PROJECT ARE NOT ASKED AGAIN
 *   → METER OUT
 *   → SPECIFIC ACTIVITY / ACTIVITIES
 *   → FUEL QUESTION
 *   → TIME OUT
 *
 * ACTIVITY TABLE HAS:
 *   activity_category
 *   activity_description
 *   quantity
 *   NO UNIT
 ************************************************************/


/* ==========================================================
   SUPABASE
   ========================================================== */

const SUPABASE_URL =
  'https://bafmycjninxomufhkjvy.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


/* ==========================================================
   PERMANENT STATION QR
   ========================================================== */

const PERMANENT_QR = {
  type: 'AMANAH_ATTENDANCE_V1',
  company: 'AMANAH CONSTRUCTION',
  system: 'AMANAH CONSTRUCTION MANAGEMENT SYSTEM',
  station: 'MAIN_ATTENDANCE',
  version: 1
};


/* ==========================================================
   ACTIVITY CATEGORIES
   ========================================================== */

const ACTIVITY_CATEGORIES = [
  'HAULING',
  'DELIVERY',
  'TRIP',
  'LOADS',
  'CLEARING',
  'SLOPE',
  'CLEARING AND HAULING',
  'ROAD REPAIR',
  'BATCHING',
  'OTHER'
];


/* ==========================================================
   APPLICATION STATE
   ========================================================== */

const state = {
  stationVerified: false,
  cameraStream: null,
  scannerRunning: false,

  employees: [],
  equipment: [],
  projects: [],
  activeAttendance: [],

  selectedEmployee: null,
  selectedEquipment: null,
  selectedProject: null,

  pendingOut: false,
  outPrepared: false,

  lastMeterOut: null,
  lastActivities: [],

  lastQrData: '',
  lastQrTime: 0
};


/* ==========================================================
   DOM
   ========================================================== */

function $(id) {
  return document.getElementById(id);
}


/* ==========================================================
   PAGE START
   ========================================================== */

document.addEventListener(
  'DOMContentLoaded',
  function () {
    setupButtons();

    showScreen('scannerScreen');

    setStatus(
      'Tap OPEN CAMERA to begin.',
      'info'
    );
  }
);


/* ==========================================================
   BUTTONS
   ========================================================== */

function setupButtons() {

  bindClick(
    'startCameraButton',
    startScanner
  );

  bindClick(
    'inButton',
    timeIn
  );

  bindClick(
    'outButton',
    beginTimeOut
  );

  bindClick(
    'continueOutButton',
    prepareTimeOut
  );

  bindClick(
    'cancelOutButton',
    cancelTimeOut
  );

  bindClick(
    'fuelNoButton',
    function () {
      completeTimeOut(false);
    }
  );

  bindClick(
    'fuelYesButton',
    showFuelForm
  );

  bindClick(
    'fuelConfirmButton',
    function () {
      completeTimeOut(true);
    }
  );

  bindClick(
    'addActivityButton',
    function () {
      addActivityRow();
    }
  );

  bindClick(
    'restartScannerButton',
    restartScanner
  );

  bindInput(
    'employeeSearch',
    filterEmployees
  );

  bindInput(
    'equipmentSearch',
    filterEquipment
  );

  bindInput(
    'projectInput',
    projectInputChanged
  );

  bindChange(
    'employeeSelect',
    employeeChanged
  );

  bindChange(
    'equipmentSelect',
    equipmentChanged
  );

  bindInput(
    'fuelQuantity',
    updateFuelTotal
  );

  bindInput(
    'fuelPricePerLiter',
    updateFuelTotal
  );
}


function bindClick(
  id,
  handler
) {
  const element = $(id);

  if (element) {
    element.addEventListener('click', handler);
  }
}


function bindInput(
  id,
  handler
) {
  const element = $(id);

  if (element) {
    element.addEventListener('input', handler);
  }
}


function bindChange(
  id,
  handler
) {
  const element = $(id);

  if (element) {
    element.addEventListener('change', handler);
  }
}


/* ==========================================================
   CAMERA
   ========================================================== */

async function startScanner() {

  if (state.scannerRunning) {
    return;
  }

  const video = $('cameraVideo');
  const button = $('startCameraButton');

  if (!video) {
    setStatus(
      'Camera element was not found.',
      'error'
    );
    return;
  }

  try {

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error(
        'This browser does not support camera access.'
      );
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'OPENING CAMERA...';
    }

    setStatus(
      'Opening camera...',
      'info'
    );

    const stream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: 'environment'
          },
          width: {
            ideal: 1280
          },
          height: {
            ideal: 720
          }
        },
        audio: false
      });

    state.cameraStream = stream;

    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('autoplay', 'true');
    video.setAttribute('playsinline', 'true');

    await video.play();

    state.scannerRunning = true;

    if (button) {
      button.hidden = true;
    }

    setStatus(
      'Camera ready. Point it at the AMANAH company QR code.',
      'info'
    );

    scanCameraFrame();

  } catch (error) {

    console.error(
      'CAMERA ERROR:',
      error
    );

    state.scannerRunning = false;

    let message =
      'Unable to open camera. ';

    if (
      error &&
      error.name === 'NotAllowedError'
    ) {
      message +=
        'Camera permission was denied.';

    } else if (
      error &&
      error.name === 'NotFoundError'
    ) {
      message +=
        'No camera was found.';

    } else if (
      error &&
      error.name === 'NotReadableError'
    ) {
      message +=
        'The camera is being used by another app or tab.';

    } else {
      message +=
        error && error.message
          ? error.message
          : 'Please try again.';
    }

    setStatus(
      message,
      'error'
    );

    if (button) {
      button.disabled = false;
      button.hidden = false;
      button.textContent = 'TRY CAMERA AGAIN';
    }
  }
}


/* ==========================================================
   CAMERA SCANNER LOOP
   ========================================================== */

function scanCameraFrame() {

  if (!state.scannerRunning) {
    return;
  }

  if (state.stationVerified) {
    return;
  }

  const video = $('cameraVideo');
  const canvas = $('cameraCanvas');

  if (!video || !canvas) {
    requestAnimationFrame(scanCameraFrame);
    return;
  }

  if (
    video.readyState >=
    HTMLMediaElement.HAVE_CURRENT_DATA
  ) {

    const width = video.videoWidth;
    const height = video.videoHeight;

    if (width > 0 && height > 0) {

      canvas.width = width;
      canvas.height = height;

      const context =
        canvas.getContext(
          '2d',
          {
            willReadFrequently: true
          }
        );

      if (context) {

        context.drawImage(
          video,
          0,
          0,
          width,
          height
        );

        const imageData =
          context.getImageData(
            0,
            0,
            width,
            height
          );

        if (typeof jsQR === 'function') {

          const qr =
            jsQR(
              imageData.data,
              imageData.width,
              imageData.height,
              {
                inversionAttempts: 'attemptBoth'
              }
            );

          if (qr && qr.data) {
            processQrResult(qr.data);
            return;
          }

        } else {

          state.scannerRunning = false;

          stopCamera();

          setStatus(
            'QR scanner library did not load. Reload the page.',
            'error'
          );

          return;
        }
      }
    }
  }

  requestAnimationFrame(scanCameraFrame);
}


/* ==========================================================
   QR RESULT
   ========================================================== */

async function processQrResult(
  decodedText
) {

  const now = Date.now();

  if (
    decodedText === state.lastQrData &&
    now - state.lastQrTime < 2500
  ) {
    return;
  }

  state.lastQrData = decodedText;
  state.lastQrTime = now;

  const payload = parseQr(decodedText);

  if (!payload) {

    setStatus(
      'Invalid QR code. Scan the AMANAH company QR.',
      'error'
    );

    resumeScanning(1500);
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
      'This is not the AMANAH attendance station QR.',
      'error'
    );

    resumeScanning(1500);
    return;
  }

  state.stationVerified = true;

  await stopScanner();

  setStatus(
    '✓ AMANAH station verified.',
    'success'
  );

  showScreen('attendanceScreen');

  await loadSystemData();
}


/* ==========================================================
   PARSE QR
   ========================================================== */

function parseQr(text) {

  try {
    return JSON.parse(
      String(text).trim()
    );
  } catch (error) {
    return null;
  }
}


function resumeScanning(
  delay
) {

  setTimeout(
    function () {

      if (
        state.scannerRunning &&
        !state.stationVerified
      ) {

        setStatus(
          'Camera ready. Point it at the AMANAH company QR code.',
          'info'
        );

        requestAnimationFrame(
          scanCameraFrame
        );
      }

    },
    delay || 1000
  );
}


/* ==========================================================
   STOP CAMERA
   ========================================================== */

async function stopScanner() {

  state.scannerRunning = false;

  stopCamera();
}


function stopCamera() {

  const video = $('cameraVideo');

  if (state.cameraStream) {

    state.cameraStream
      .getTracks()
      .forEach(
        function (track) {

          try {
            track.stop();
          } catch (_) {}

        }
      );

    state.cameraStream = null;
  }

  if (video) {

    try {
      video.pause();
    } catch (_) {}

    video.srcObject = null;
  }
}


/* ==========================================================
   LOAD SYSTEM DATA
   ========================================================== */

async function loadSystemData() {

  setStatus(
    'Loading employees, equipment and projects...',
    'info'
  );

  try {

    const employeeResult =
      await supabaseClient
        .from('employees')
        .select(
          'employee_id,employee_name,position,department,status'
        )
        .eq('status', 'ACTIVE')
        .order(
          'employee_name',
          {
            ascending: true
          }
        );

    if (employeeResult.error) {
      throw new Error(
        'Employees: ' +
        employeeResult.error.message
      );
    }


    let equipmentResult =
      await supabaseClient
        .from('equipment')
        .select(
          'equipment_id,equipment_name,equipment_type,plate_number,status,meter_type,current_meter_reading'
        )
        .eq('status', 'ACTIVE')
        .order(
          'equipment_name',
          {
            ascending: true
          }
        );

    if (equipmentResult.error) {

      const text =
        String(
          equipmentResult.error.message || ''
        ).toLowerCase();

      if (
        text.includes('meter_type') ||
        text.includes('current_meter_reading')
      ) {

        equipmentResult =
          await supabaseClient
            .from('equipment')
            .select(
              'equipment_id,equipment_name,equipment_type,plate_number,status'
            )
            .eq('status', 'ACTIVE')
            .order(
              'equipment_name',
              {
                ascending: true
              }
            );
      }
    }

    if (equipmentResult.error) {
      throw new Error(
        'Equipment: ' +
        equipmentResult.error.message
      );
    }


    const projectResult =
      await supabaseClient
        .from('projects')
        .select(
          'project_id,project_name,client,location,site_engineer,start_date,target_completion,actual_completion,contract_amount,current_progress,status'
        )
        .eq('status', 'ACTIVE')
        .order(
          'project_name',
          {
            ascending: true
          }
        );

    if (projectResult.error) {
      throw new Error(
        'Projects: ' +
        projectResult.error.message
      );
    }


    const attendanceResult =
      await supabaseClient
        .from('attendance')
        .select('*')
        .eq('status', 'IN')
        .order(
          'created_at',
          {
            ascending: false
          }
        );

    if (attendanceResult.error) {
      throw new Error(
        'Attendance: ' +
        attendanceResult.error.message
      );
    }


    state.employees =
      employeeResult.data || [];

    state.equipment =
      normalizeEquipment(
        equipmentResult.data || []
      );

    state.projects =
      projectResult.data || [];

    state.activeAttendance =
      attendanceResult.data || [];


    buildEmployeeList();
    buildEquipmentList();
    buildProjectList();
    syncAttendanceMode();
    updateActiveAttendanceDisplay();
    updateButtons();


    setStatus(
      '✓ AMANAH station verified. Who are you?',
      'success'
    );

  } catch (error) {

    console.error(
      'SUPABASE ERROR:',
      error
    );

    setStatus(
      'Unable to load system data: ' +
      (
        error.message ||
        'Unknown error'
      ),
      'error'
    );
  }
}


/* ==========================================================
   EQUIPMENT NORMALIZATION
   ========================================================== */

function normalizeEquipment(
  items
) {

  return items.map(
    function (item) {

      const explicit =
        String(
          item.meter_type || ''
        )
        .trim()
        .toUpperCase();

      let meterType =
        explicit === 'ODOMETER' ||
        explicit === 'HOUR METER'
          ? explicit
          : '';

      if (!meterType) {

        const typeText =
          String(
            item.equipment_type || ''
          ).toUpperCase();

        meterType =
          typeText.includes('TRUCK') ||
          typeText.includes('DUMP') ||
          typeText.includes('TRACTOR HEAD')
            ? 'ODOMETER'
            : 'HOUR METER';
      }

      const current =
        Number(
          item.current_meter_reading ?? 0
        );

      return Object.assign(
        {},
        item,
        {
          meter_type: meterType,
          current_meter_reading:
            Number.isFinite(current)
              ? current
              : 0
        }
      );
    }
  );
}


/* ==========================================================
   EMPLOYEES
   ========================================================== */

function buildEmployeeList() {

  const select =
    $('employeeSelect');

  if (!select) {
    return;
  }

  const selectedId =
    state.selectedEmployee
      ? String(
          state.selectedEmployee.employee_id
        )
      : '';

  select.innerHTML = '';

  appendOption(
    select,
    '',
    'Select employee / operator / driver'
  );

  state.employees.forEach(
    function (employee) {
      addEmployeeOption(
        select,
        employee
      );
    }
  );

  if (selectedId) {
    select.value =
      selectedId;
  }
}


function addEmployeeOption(
  select,
  employee
) {

  if (!employee.employee_id) {
    return;
  }

  const label =
    (
      employee.employee_name ||
      ''
    ) +
    ' — ' +
    employee.employee_id +
    (
      employee.position
        ? ' (' +
          employee.position +
          ')'
        : ''
    );

  appendOption(
    select,
    employee.employee_id,
    label
  );
}


function filterEmployees() {

  const input = $('employeeSearch');
  const select = $('employeeSelect');

  if (!select) {
    return;
  }

  const search =
    input && input.value
      ? input.value.toLowerCase().trim()
      : '';

  const selectedId =
    select.value || '';

  select.innerHTML = '';

  appendOption(
    select,
    '',
    'Select employee / operator / driver'
  );

  state.employees
    .filter(
      function (employee) {

        const text =
          [
            employee.employee_id,
            employee.employee_name,
            employee.position,
            employee.department
          ]
          .join(' ')
          .toLowerCase();

        return text.includes(search);
      }
    )
    .forEach(
      function (employee) {
        addEmployeeOption(
          select,
          employee
        );
      }
    );

  if (selectedId) {
    select.value = selectedId;
  }
}


function employeeChanged() {

  const select = $('employeeSelect');

  const employeeId =
    select
      ? select.value
      : '';

  state.selectedEmployee =
    state.employees.find(
      function (employee) {
        return (
          String(employee.employee_id) ===
          String(employeeId)
        );
      }
    ) || null;

  if (state.pendingOut) {
    return;
  }

  state.selectedEquipment = null;
  state.selectedProject = null;

  clearElementValue(
    'equipmentSelect'
  );

  clearElementValue(
    'equipmentSearch'
  );

  clearElementValue(
    'projectInput'
  );

  clearElementValue(
    'meterIn'
  );

  updateActiveAttendanceDisplay();
  syncAttendanceMode();
  updateButtons();
}


/* ==========================================================
   EQUIPMENT
   ========================================================== */

function buildEquipmentList() {

  const select = $('equipmentSelect');

  if (!select) {
    return;
  }

  select.innerHTML = '';

  appendOption(
    select,
    '',
    'Select equipment'
  );

  state.equipment.forEach(
    function (item) {
      addEquipmentOption(
        select,
        item
      );
    }
  );
}


function addEquipmentOption(
  select,
  item
) {

  if (!item.equipment_id) {
    return;
  }

  const label =
    (
      item.equipment_name ||
      ''
    ) +
    ' — ' +
    item.equipment_id +
    (
      item.equipment_type
        ? ' (' +
          item.equipment_type +
          ')'
        : ''
    );

  appendOption(
    select,
    item.equipment_id,
    label
  );
}


function filterEquipment() {

  const input = $('equipmentSearch');
  const select = $('equipmentSelect');

  if (!select) {
    return;
  }

  const search =
    input && input.value
      ? input.value.toLowerCase().trim()
      : '';

  const selectedId =
    select.value || '';

  select.innerHTML = '';

  appendOption(
    select,
    '',
    'Select equipment'
  );

  state.equipment
    .filter(
      function (item) {

        const text =
          [
            item.equipment_id,
            item.equipment_name,
            item.equipment_type,
            item.plate_number
          ]
          .join(' ')
          .toLowerCase();

        return text.includes(search);
      }
    )
    .forEach(
      function (item) {
        addEquipmentOption(
          select,
          item
        );
      }
    );

  if (selectedId) {
    select.value = selectedId;
  }
}


function equipmentChanged() {

  const select = $('equipmentSelect');

  const id =
    select
      ? select.value
      : '';

  state.selectedEquipment =
    state.equipment.find(
      function (item) {
        return (
          String(item.equipment_id) ===
          String(id)
        );
      }
    ) || null;

  updateEquipmentMeterUI();
  updateButtons();
}


function updateEquipmentMeterUI() {

  const info = $('equipmentMeterInfo');
  const typeBox = $('meterTypeIn');
  const meterInput = $('meterIn');

  if (!info || !typeBox) {
    return;
  }

  if (!state.selectedEquipment) {

    info.hidden = true;
    info.innerHTML = '';

    typeBox.textContent =
      'Select equipment first';

    if (meterInput) {
      meterInput.value = '';
    }

    return;
  }

  const equipment =
    state.selectedEquipment;

  const meterType =
    getMeterType(equipment);

  const unit =
    getMeterUnit(meterType);

  const current =
    Number(
      equipment.current_meter_reading ?? 0
    );

  typeBox.textContent =
    meterType;

  info.hidden = false;

  info.innerHTML =
    '<strong>' +
    escapeHtml(
      meterType
    ) +
    '</strong>' +
    ' • Current Master Reading: ' +
    '<strong>' +
    escapeHtml(
      formatNumber(current)
    ) +
    ' ' +
    unit +
    '</strong>';

  if (meterInput) {
    meterInput.value =
      Number.isFinite(current)
        ? String(current)
        : '';
    meterInput.min =
      String(
        Math.max(
          0,
          current
        )
      );
  }

  const note = $('meterInNote');

  if (note) {
    note.textContent =
      meterType === 'ODOMETER'
        ? 'Truck meter. Enter the odometer reading at the start of the shift.'
        : 'Equipment meter. Enter the hour-meter reading at the start of the shift.';
  }
}


function getMeterType(
  equipment
) {

  const text =
    String(
      equipment &&
      equipment.meter_type
        ? equipment.meter_type
        : ''
    )
    .toUpperCase();

  if (text === 'ODOMETER') {
    return 'ODOMETER';
  }

  return 'HOUR METER';
}


function getMeterUnit(
  meterType
) {
  return meterType === 'ODOMETER'
    ? 'KM'
    : 'HRS';
}


/* ==========================================================
   PROJECT / LOCATION
   ========================================================== */

function buildProjectList() {

  const list =
    $('projectOptions');

  if (!list) {
    return;
  }

  list.innerHTML = '';

  state.projects.forEach(
    function (project) {

      const option =
        document.createElement('option');

      option.value =
        project.project_name || '';

      option.label =
        project.location
          ? String(project.location)
          : '';

      list.appendChild(option);
    }
  );
}


function projectInputChanged() {

  const input =
    $('projectInput');

  const value =
    input
      ? input.value.trim()
      : '';

  if (!value) {

    state.selectedProject = null;

    const note =
      $('projectMatchNote');

    if (note) {
      note.textContent =
        'Registered projects are available in the search list. Custom locations are allowed.';
    }

    updateButtons();
    return;
  }

  const master =
    state.projects.find(
      function (project) {
        return (
          String(
            project.project_name || ''
          )
          .trim()
          .toLowerCase() ===
          value.toLowerCase()
        );
      }
    );

  if (master) {

    state.selectedProject =
      master;

    const note =
      $('projectMatchNote');

    if (note) {
      note.textContent =
        'Registered project selected: ' +
        (
          master.location
            ? master.location
            : 'registered project'
        );
    }

  } else {

    state.selectedProject = {
      project_id: null,
      project_name: value,
      location: value,
      custom: true
    };

    const note =
      $('projectMatchNote');

    if (note) {
      note.textContent =
        'Custom project / location will be saved exactly as entered.';
    }
  }

  updateButtons();
}


/* ==========================================================
   ACTIVE ATTENDANCE
   ========================================================== */

function getActiveAttendance() {

  if (!state.selectedEmployee) {
    return null;
  }

  return state.activeAttendance.find(
    function (item) {
      return (
        String(item.employee_id) ===
        String(
          state.selectedEmployee.employee_id
        )
      );
    }
  ) || null;
}


function updateActiveAttendanceDisplay() {

  const box =
    $('activeAttendance');

  if (!box) {
    return;
  }

  const active =
    getActiveAttendance();

  if (!active) {

    box.hidden = true;
    box.innerHTML = '';

    return;
  }

  const meterType =
    String(
      active.meter_type ||
      'HOUR METER'
    ).toUpperCase();

  const meterUnit =
    active.meter_unit ||
    getMeterUnit(meterType);

  const meterIn =
    Number(
      active.meter_in ?? 0
    );

  box.hidden = false;

  box.innerHTML =
    '<div class="active-title">ACTIVE ATTENDANCE FOUND</div>' +

    '<div class="active-row">' +
      '<strong>' +
      escapeHtml(
        active.employee_name
      ) +
      '</strong>' +
    '</div>' +

    '<div class="active-row">' +
      'Equipment: ' +
      '<strong>' +
      escapeHtml(
        active.equipment_name
      ) +
      '</strong>' +
    '</div>' +

    '<div class="active-row">' +
      'Project / Location: ' +
      '<strong>' +
      escapeHtml(
        active.project_name
      ) +
      '</strong>' +
    '</div>' +

    '<div class="active-row">' +
      'Meter In: ' +
      '<strong>' +
      escapeHtml(
        formatNumber(meterIn)
      ) +
      ' ' +
      escapeHtml(meterUnit) +
      '</strong>' +
    '</div>' +

    '<div class="active-row">' +
      'Time In: ' +
      '<strong>' +
      escapeHtml(
        formatTime(active.time_in)
      ) +
      '</strong>' +
    '</div>';
}


/* ==========================================================
   WORKFLOW MODE
   ========================================================== */

function syncAttendanceMode() {

  const active =
    getActiveAttendance();

  const timeInDetails =
    $('timeInDetails');

  const outDetails =
    $('outDetails');

  const activeExists =
    !!active;

  if (timeInDetails) {
    timeInDetails.hidden =
      activeExists;
  }

  if (
    !activeExists &&
    !state.pendingOut
  ) {
    if (outDetails) {
      outDetails.hidden = true;
    }
    hideElement(
      'fuelQuestion',
      true
    );
    hideElement(
      'fuelForm',
      true
    );
  }

  updateActiveAttendanceDisplay();
}


/* ==========================================================
   ATTENDANCE BUTTONS
   ========================================================== */

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
    !!state.selectedProject &&
    String(
      state.selectedProject.project_name || ''
    ).trim() !== '';

  const meterInValue =
    parseFloat(
      $('meterIn')
        ? $('meterIn').value
        : ''
    );

  const meterInReady =
    Number.isFinite(meterInValue) &&
    meterInValue >= 0;

  const active =
    getActiveAttendance();

  const busyOut =
    state.pendingOut ||
    state.outPrepared;

  inButton.disabled =
    !employeeSelected ||
    !!active ||
    !equipmentSelected ||
    !projectSelected ||
    !meterInReady;

  outButton.disabled =
    !employeeSelected ||
    !active ||
    busyOut;
}


/* ==========================================================
   TIME IN
   ========================================================== */

async function timeIn() {

  const employee =
    state.selectedEmployee;

  const equipment =
    state.selectedEquipment;

  const project =
    state.selectedProject;

  const meterIn =
    parseFloat(
      $('meterIn')
        ? $('meterIn').value
        : ''
    );

  if (
    !employee ||
    !equipment ||
    !project
  ) {

    setStatus(
      'Please select employee, equipment and project / location.',
      'error'
    );

    return;
  }

  if (!Number.isFinite(meterIn)) {

    setStatus(
      'Enter the TIME IN meter reading.',
      'error'
    );

    return;
  }

  const currentMeter =
    Number(
      equipment.current_meter_reading ?? 0
    );

  if (
    Number.isFinite(currentMeter) &&
    meterIn < currentMeter
  ) {

    setStatus(
      'Meter In cannot be lower than the equipment master reading (' +
      formatNumber(currentMeter) +
      ').',
      'error'
    );

    return;
  }

  setBusy(true);

  try {

    const attendanceDate =
      getManilaDate();

    const timeInValue =
      new Date().toISOString();

    const meterType =
      getMeterType(equipment);

    const meterUnit =
      getMeterUnit(meterType);

    const projectId =
      project.custom
        ? null
        : project.project_id;

    const insertData = {

      employee_id:
        employee.employee_id,

      employee_name:
        employee.employee_name,

      attendance_date:
        attendanceDate,

      time_in:
        timeInValue,

      time_out:
        null,

      total_hours:
        null,

      status:
        'IN',

      equipment_id:
        equipment.equipment_id,

      equipment_name:
        equipment.equipment_name,

      project_id:
        projectId,

      project_name:
        project.project_name,

      meter_type:
        meterType,

      meter_in:
        meterIn,

      meter_out:
        null,

      meter_used:
        null,

      meter_unit:
        meterUnit,

      fuel_used:
        false,

      fuel_quantity:
        null,

      fuel_unit:
        null,

      fuel_amount:
        null
    };


    const result =
      await supabaseClient
        .from('attendance')
        .insert(insertData)
        .select()
        .single();


    if (result.error) {
      throw new Error(
        result.error.message
      );
    }


    setStatus(
      '✓ TIME IN recorded successfully.',
      'success'
    );

    showResult(
      mapAttendanceForResult(
        result.data
      ),
      'TIME IN RECORDED'
    );


    await loadSystemData();

  } catch (error) {

    console.error(
      'TIME IN ERROR:',
      error
    );

    setStatus(
      'TIME IN failed: ' +
      (
        error.message ||
        'Unknown error'
      ),
      'error'
    );

  } finally {

    setBusy(false);
  }
}


/* ==========================================================
   BEGIN TIME OUT
   ========================================================== */

function beginTimeOut() {

  const active =
    getActiveAttendance();

  if (!active) {

    setStatus(
      'No active attendance was found.',
      'error'
    );

    return;
  }

  state.pendingOut = true;
  state.outPrepared = false;
  state.lastMeterOut = null;
  state.lastActivities = [];

  lockEmployeeSelection(true);

  addActivityRow();

  showOutMeterSummary();

  hideElement(
    'outDetails',
    false
  );

  hideElement(
    'fuelQuestion',
    true
  );

  hideElement(
    'fuelForm',
    true
  );

  setStatus(
    'TIME OUT started. Enter Meter Out and record the specific activities completed.',
    'info'
  );

  const meterOut =
    $('meterOut');

  if (meterOut) {

    meterOut.min =
      String(
        Number(
          active.meter_in ?? 0
        )
      );

    meterOut.value = '';

    setTimeout(
      function () {
        meterOut.focus();
      },
      100
    );
  }

  scrollToElement(
    'outDetails'
  );

  updateButtons();
}


/* ==========================================================
   OUT METER SUMMARY
   ========================================================== */

function showOutMeterSummary() {

  const active =
    getActiveAttendance();

  const box =
    $('outMeterSummary');

  const note =
    $('meterOutNote');

  if (!active || !box) {
    return;
  }

  const meterType =
    String(
      active.meter_type ||
      'HOUR METER'
    ).toUpperCase();

  const unit =
    active.meter_unit ||
    getMeterUnit(meterType);

  const meterIn =
    Number(
      active.meter_in ?? 0
    );

  box.innerHTML =
    '<strong>' +
    escapeHtml(
      active.equipment_name
    ) +
    '</strong>' +
    '<br>' +
    'Meter Type: ' +
    '<strong>' +
    escapeHtml(meterType) +
    '</strong>' +
    ' • Meter In: ' +
    '<strong>' +
    escapeHtml(
      formatNumber(meterIn)
    ) +
    ' ' +
    escapeHtml(unit) +
    '</strong>';

  if (note) {
    note.textContent =
      meterType === 'ODOMETER'
        ? 'OUT usage will be calculated as KM: Meter Out − Meter In.'
        : 'OUT usage will be calculated as HRS: Meter Out − Meter In.';
  }
}


/* ==========================================================
   PREPARE TIME OUT
   ========================================================== */

async function prepareTimeOut() {

  const active =
    getActiveAttendance();

  const employee =
    state.selectedEmployee;

  if (!active || !employee) {

    setStatus(
      'No active attendance was found for this employee.',
      'error'
    );

    return;
  }

  const meterOut =
    parseFloat(
      $('meterOut')
        ? $('meterOut').value
        : ''
    );

  const meterIn =
    Number(
      active.meter_in ?? 0
    );

  if (!Number.isFinite(meterOut)) {

    setStatus(
      'Enter the TIME OUT meter reading.',
      'error'
    );

    return;
  }

  if (meterOut < meterIn) {

    setStatus(
      'Meter Out cannot be lower than Meter In (' +
      formatNumber(meterIn) +
      ').',
      'error'
    );

    return;
  }

  const activities =
    collectActivities();

  if (!activities.valid) {

    setStatus(
      activities.message,
      'error'
    );

    return;
  }

  setBusy(true);

  try {

    const rpcResult =
      await supabaseClient.rpc(
        'prepare_attendance_out',
        {
          p_attendance_id:
            String(
              active.attendance_id
            ),

          p_employee_id:
            String(
              employee.employee_id
            ),

          p_meter_out:
            meterOut,

          p_activities:
            activities.rows
        }
      );

    if (rpcResult.error) {
      throw new Error(
        rpcResult.error.message
      );
    }

    const result =
      Array.isArray(rpcResult.data)
        ? rpcResult.data[0]
        : rpcResult.data;

    if (!result) {
      throw new Error(
        'TIME OUT preparation returned no result.'
      );
    }

    if (result.success !== true) {
      throw new Error(
        result.error ||
        'TIME OUT preparation was not completed.'
      );
    }

    state.outPrepared = true;
    state.lastMeterOut = meterOut;
    state.lastActivities =
      activities.rows;

    hideElement(
      'outDetails',
      true
    );

    hideElement(
      'fuelQuestion',
      false
    );

    setStatus(
      '✓ Meter Out and activities recorded. Did you fuel the equipment?',
      'success'
    );

    scrollToElement(
      'fuelQuestion'
    );

  } catch (error) {

    console.error(
      'TIME OUT PREPARATION ERROR:',
      error
    );

    setStatus(
      'TIME OUT preparation failed: ' +
      (
        error.message ||
        'Unknown error'
      ),
      'error'
    );

  } finally {

    setBusy(false);
  }
}


/* ==========================================================
   ACTIVITY ROWS
   ========================================================== */

function addActivityRow(
  initial
) {

  const list =
    $('activityList');

  if (!list) {
    return;
  }

  const row =
    document.createElement('div');

  row.className =
    'activity-row';

  const category =
    initial &&
    initial.activity_category
      ? initial.activity_category
      : '';

  const description =
    initial &&
    initial.activity_description
      ? initial.activity_description
      : '';

  const quantity =
    initial &&
    initial.quantity !== undefined
      ? initial.quantity
      : '';

  row.innerHTML =
    '<div class="activity-row-header">' +
      '<div class="activity-number">ACTIVITY</div>' +
      '<button type="button" class="activity-remove">REMOVE</button>' +
    '</div>' +

    '<div class="activity-grid">' +

      '<select class="select-input activity-category">' +
        '<option value="">Select category</option>' +
        buildCategoryOptions(category) +
      '</select>' +

      '<input ' +
        'class="text-input activity-description" ' +
        'type="text" ' +
        'maxlength="250" ' +
        'placeholder="Describe what you did..." ' +
        'value="' +
          escapeAttribute(description) +
        '"' +
      '>' +

      '<input ' +
        'class="text-input activity-quantity" ' +
        'type="number" ' +
        'min="0.01" ' +
        'step="0.01" ' +
        'inputmode="decimal" ' +
        'placeholder="Quantity" ' +
        'value="' +
          escapeAttribute(
            quantity === '' ? '' : String(quantity)
          ) +
        '"' +
      '>' +

    '</div>';

  const remove =
    row.querySelector(
      '.activity-remove'
    );

  if (remove) {

    remove.addEventListener(
      'click',
      function () {

        row.remove();

        ensureAtLeastOneActivityRow();
      }
    );
  }

  list.appendChild(row);

  refreshActivityLabels();
}


function buildCategoryOptions(
  selected
) {

  return ACTIVITY_CATEGORIES
    .map(
      function (category) {

        const isSelected =
          String(category) ===
          String(selected || '');

        return (
          '<option value="' +
          escapeAttribute(category) +
          '"' +
          (
            isSelected
              ? ' selected'
              : ''
          ) +
          '>' +
          escapeHtml(category) +
          '</option>'
        );
      }
    )
    .join('');
}


function ensureAtLeastOneActivityRow() {

  const list =
    $('activityList');

  if (!list) {
    return;
  }

  if (
    list.querySelectorAll(
      '.activity-row'
    ).length === 0
  ) {
    addActivityRow();
  }

  refreshActivityLabels();
}


function refreshActivityLabels() {

  const rows =
    document.querySelectorAll(
      '.activity-row'
    );

  rows.forEach(
    function (row, index) {

      const label =
        row.querySelector(
          '.activity-number'
        );

      if (label) {
        label.textContent =
          'ACTIVITY ' +
          String(index + 1);
      }

      const remove =
        row.querySelector(
          '.activity-remove'
        );

      if (remove) {
        remove.style.visibility =
          rows.length > 1
            ? 'visible'
            : 'hidden';
      }
    }
  );
}


function collectActivities() {

  const rows =
    Array.from(
      document.querySelectorAll(
        '.activity-row'
      )
    );

  const output = [];

  for (
    let i = 0;
    i < rows.length;
    i += 1
  ) {

    const row = rows[i];

    const category =
      row.querySelector(
        '.activity-category'
      );

    const description =
      row.querySelector(
        '.activity-description'
      );

    const quantity =
      row.querySelector(
        '.activity-quantity'
      );

    const activityCategory =
      category
        ? category.value.trim()
        : '';

    const activityDescription =
      description
        ? description.value.trim()
        : '';

    const activityQuantity =
      quantity
        ? parseFloat(quantity.value)
        : NaN;

    if (!activityCategory) {

      return {
        valid: false,
        message:
          'Select an activity category for Activity ' +
          String(i + 1) +
          '.'
      };
    }

    if (!activityDescription) {

      return {
        valid: false,
        message:
          'Enter the activity description for Activity ' +
          String(i + 1) +
          '.'
      };
    }

    if (
      !Number.isFinite(activityQuantity) ||
      activityQuantity <= 0
    ) {

      return {
        valid: false,
        message:
          'Enter a quantity greater than 0 for Activity ' +
          String(i + 1) +
          '.'
      };
    }

    output.push({
      activity_category:
        activityCategory,

      activity_description:
        activityDescription,

      quantity:
        activityQuantity
    });
  }

  if (!output.length) {

    return {
      valid: false,
      message:
        'Add at least one activity before completing TIME OUT.'
    };
  }

  return {
    valid: true,
    rows: output
  };
}


/* ==========================================================
   CANCEL TIME OUT
   ========================================================== */

function cancelTimeOut() {

  state.pendingOut = false;
  state.outPrepared = false;
  state.lastMeterOut = null;
  state.lastActivities = [];

  lockEmployeeSelection(false);

  hideElement(
    'outDetails',
    true
  );

  hideElement(
    'fuelQuestion',
    true
  );

  hideElement(
    'fuelForm',
    true
  );

  const list =
    $('activityList');

  if (list) {
    list.innerHTML = '';
  }

  updateActiveAttendanceDisplay();
  syncAttendanceMode();
  updateButtons();

  setStatus(
    'TIME OUT cancelled.',
    'info'
  );
}


/* ==========================================================
   FUEL
   ========================================================== */

function showFuelForm() {

  hideElement(
    'fuelQuestion',
    true
  );

  hideElement(
    'fuelForm',
    false
  );

  const quantity =
    $('fuelQuantity');

  if (quantity) {
    quantity.focus();
  }

  setStatus(
    'Enter fuel quantity in liters and fuel price per liter.',
    'info'
  );

  scrollToElement(
    'fuelForm'
  );
}


function updateFuelTotal() {

  const quantity =
    parseFloat(
      $('fuelQuantity')
        ? $('fuelQuantity').value
        : ''
    );

  const pricePerLiter =
    parseFloat(
      $('fuelPricePerLiter')
        ? $('fuelPricePerLiter').value
        : ''
    );

  const total =
    quantity > 0 &&
    pricePerLiter >= 0
      ? quantity * pricePerLiter
      : 0;

  const totalInput =
    $('fuelTotal');

  if (totalInput) {
    totalInput.value =
      total.toFixed(2);
  }

  return total;
}


/* ==========================================================
   COMPLETE TIME OUT
   ========================================================== */

async function completeTimeOut(
  useFuel
) {

  const employee =
    state.selectedEmployee;

  const active =
    getActiveAttendance();

  if (!employee) {

    setStatus(
      'Please select the employee.',
      'error'
    );

    return;
  }

  if (!active) {

    setStatus(
      'No active attendance was found.',
      'error'
    );

    return;
  }

  if (!state.outPrepared) {

    setStatus(
      'Finish Meter Out and activity details first.',
      'error'
    );

    return;
  }

  let fuelUsed = false;
  let fuelQuantity = null;
  let fuelUnit = null;
  let fuelAmount = null;

  if (useFuel) {

    const quantity =
      parseFloat(
        $('fuelQuantity')
          ? $('fuelQuantity').value
          : ''
      );

    const pricePerLiter =
      parseFloat(
        $('fuelPricePerLiter')
          ? $('fuelPricePerLiter').value
          : ''
      );

    if (!(quantity > 0)) {

      setStatus(
        'Enter the fuel quantity in liters.',
        'error'
      );

      return;
    }

    if (!(pricePerLiter > 0)) {

      setStatus(
        'Enter the fuel price per liter.',
        'error'
      );

      return;
    }

    fuelQuantity = quantity;
    fuelUnit = 'Liter';
    fuelAmount =
      Number(
        (
          quantity *
          pricePerLiter
        ).toFixed(2)
      );

    updateFuelTotal();

    fuelUsed = true;
  }

  setBusy(true);

  try {

    const timeOut =
      new Date().toISOString();

    const rpcResult =
      await supabaseClient.rpc(
        'complete_attendance',
        {

          p_attendance_id:
            active.attendance_id,

          p_employee_id:
            employee.employee_id,

          p_time_out:
            timeOut,

          p_fuel_used:
            fuelUsed,

          p_fuel_quantity:
            fuelUsed
              ? fuelQuantity
              : null,

          p_fuel_unit:
            fuelUsed
              ? fuelUnit
              : null,

          p_fuel_amount:
            fuelUsed
              ? fuelAmount
              : null
        }
      );

    if (rpcResult.error) {
      throw new Error(
        rpcResult.error.message
      );
    }

    if (!rpcResult.data) {
      throw new Error(
        'TIME OUT function returned no result.'
      );
    }

    const completed =
      Array.isArray(rpcResult.data)
        ? rpcResult.data[0]
        : rpcResult.data;

    if (!completed) {
      throw new Error(
        'TIME OUT function returned an empty result.'
      );
    }

    if (completed.success !== true) {
      throw new Error(
        completed.error ||
        'TIME OUT was not completed.'
      );
    }

    const completedAttendance =
      buildCompletedAttendance(
        completed,
        active
      );

    setStatus(
      '✓ TIME OUT recorded successfully.',
      'success'
    );

    showResult(
      mapAttendanceForResult(
        completedAttendance
      ),
      'TIME OUT RECORDED'
    );

    resetOutWorkflowForNewAttendance();

    await loadSystemData();

  } catch (error) {

    console.error(
      'TIME OUT ERROR:',
      error
    );

    setStatus(
      'TIME OUT failed: ' +
      (
        error.message ||
        'Unknown error'
      ),
      'error'
    );

  } finally {

    setBusy(false);
  }
}


/* ==========================================================
   COMPLETED ATTENDANCE RESULT
   ========================================================== */

function buildCompletedAttendance(
  completed,
  active
) {

  return {

    attendance_id:
      completed.attendance_id ||
      active.attendance_id,

    employee_name:
      completed.employee_name ||
      active.employee_name,

    equipment_name:
      completed.equipment_name ||
      active.equipment_name,

    project_name:
      completed.project_name ||
      active.project_name,

    attendance_date:
      active.attendance_date,

    time_in:
      completed.time_in ||
      active.time_in,

    time_out:
      completed.time_out ||
      new Date().toISOString(),

    total_hours:
      completed.total_hours,

    meter_type:
      active.meter_type,

    meter_in:
      active.meter_in,

    meter_out:
      state.lastMeterOut,

    meter_used:
      calculateMeterUsed(
        active.meter_in,
        state.lastMeterOut
      ),

    meter_unit:
      active.meter_unit ||
      getMeterUnit(
        String(
          active.meter_type ||
          'HOUR METER'
        ).toUpperCase()
      ),

    fuel_used:
      completed.fuel_used === true,

    fuel_quantity:
      completed.fuel_quantity ?? null,

    fuel_unit:
      completed.fuel_unit ?? null,

    fuel_amount:
      completed.fuel_amount ?? null,

    activities:
      state.lastActivities
  };
}


function calculateMeterUsed(
  meterIn,
  meterOut
) {

  const start =
    Number(meterIn);

  const end =
    Number(meterOut);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return null;
  }

  return Number(
    (end - start).toFixed(2)
  );
}


/* ==========================================================
   RESULT DISPLAY
   ========================================================== */

function mapAttendanceForResult(
  row
) {

  return {

    attendance_id:
      row.attendance_id,

    employeeName:
      row.employee_name,

    equipmentName:
      row.equipment_name,

    projectName:
      row.project_name,

    date:
      row.attendance_date,

    timeIn:
      row.time_in
        ? formatTime(row.time_in)
        : '',

    timeOut:
      row.time_out
        ? formatTime(row.time_out)
        : '',

    totalHours:
      row.total_hours,

    meterType:
      row.meter_type,

    meterIn:
      row.meter_in,

    meterOut:
      row.meter_out,

    meterUsed:
      row.meter_used,

    meterUnit:
      row.meter_unit,

    fuel:
      row.fuel_used
        ? (
            Number(
              row.fuel_quantity
            ).toFixed(2) +
            ' ' +
            (
              row.fuel_unit ||
              'Liter'
            ) +
            ' | ₱' +
            Number(
              row.fuel_amount
            ).toFixed(2)
          )
        : '',

    activities:
      row.activities || []
  };
}


function showResult(
  attendance,
  title
) {

  const box =
    $('resultBox');

  if (!box || !attendance) {
    return;
  }

  let html =
    '<div class="result-title">' +
      escapeHtml(title) +
    '</div>';

  html +=
    '<div class="result-item">' +
      'Employee: <strong>' +
      escapeHtml(
        attendance.employeeName || ''
      ) +
      '</strong>' +
    '</div>';

  html +=
    '<div class="result-item">' +
      'Equipment: <strong>' +
      escapeHtml(
        attendance.equipmentName || ''
      ) +
      '</strong>' +
    '</div>';

  html +=
    '<div class="result-item">' +
      'Project / Location: <strong>' +
      escapeHtml(
        attendance.projectName || ''
      ) +
      '</strong>' +
    '</div>';

  html +=
    '<div class="result-item">' +
      'Date: <strong>' +
      escapeHtml(
        attendance.date || ''
      ) +
      '</strong>' +
    '</div>';

  if (attendance.timeIn) {

    html +=
      '<div class="result-item">' +
        'Time In: <strong>' +
        escapeHtml(
          attendance.timeIn
        ) +
        '</strong>' +
      '</div>';
  }

  if (attendance.timeOut) {

    html +=
      '<div class="result-item">' +
        'Time Out: <strong>' +
        escapeHtml(
          attendance.timeOut
        ) +
        '</strong>' +
      '</div>';
  }

  if (
    attendance.totalHours !== null &&
    attendance.totalHours !== undefined
  ) {

    html +=
      '<div class="result-item">' +
        'Total Hours: <strong>' +
        escapeHtml(
          String(
            attendance.totalHours
          )
        ) +
        '</strong>' +
      '</div>';
  }

  if (
    attendance.meterIn !== null &&
    attendance.meterIn !== undefined
  ) {

    html +=
      '<div class="result-item">' +
        escapeHtml(
          attendance.meterType || 'METER'
        ) +
        ': <strong>' +
        escapeHtml(
          formatNumber(
            attendance.meterIn
          )
        ) +
        ' ' +
        escapeHtml(
          attendance.meterUnit || ''
        ) +
        ' IN' +
        '</strong>' +
      '</div>';
  }

  if (
    attendance.meterOut !== null &&
    attendance.meterOut !== undefined
  ) {

    html +=
      '<div class="result-item">' +
        'Meter Out: <strong>' +
        escapeHtml(
          formatNumber(
            attendance.meterOut
          )
        ) +
        ' ' +
        escapeHtml(
          attendance.meterUnit || ''
        ) +
        '</strong>' +
      '</div>';
  }

  if (
    attendance.meterUsed !== null &&
    attendance.meterUsed !== undefined
  ) {

    html +=
      '<div class="result-item">' +
        'Usage: <strong>' +
        escapeHtml(
          formatNumber(
            attendance.meterUsed
          )
        ) +
        ' ' +
        escapeHtml(
          attendance.meterUnit || ''
        ) +
        '</strong>' +
      '</div>';
  }

  if (attendance.activities.length) {

    html +=
      '<div class="result-item">' +
        '<strong>Activities:</strong>' +
        '<br>';

    attendance.activities.forEach(
      function (activity, index) {

        html +=
          String(index + 1) +
          '. ' +
          escapeHtml(
            activity.activity_category
          ) +
          ' — ' +
          escapeHtml(
            activity.activity_description
          ) +
          ' — Qty: ' +
          escapeHtml(
            formatNumber(
              activity.quantity
            )
          ) +
          '<br>';
      }
    );

    html += '</div>';
  }

  if (attendance.fuel) {

    html +=
      '<div class="result-item">' +
        'Fuel: <strong>' +
        escapeHtml(
          attendance.fuel
        ) +
        '</strong>' +
      '</div>';
  }

  box.innerHTML = html;

  box.hidden = false;
}


/* ==========================================================
   RESET AFTER COMPLETED OUT
   ========================================================== */

function resetOutWorkflowForNewAttendance() {

  state.pendingOut = false;
  state.outPrepared = false;

  lockEmployeeSelection(false);

  hideElement(
    'outDetails',
    true
  );

  hideElement(
    'fuelQuestion',
    true
  );

  hideElement(
    'fuelForm',
    true
  );

  const activityList =
    $('activityList');

  if (activityList) {
    activityList.innerHTML = '';
  }

  clearFuelInputs();

  state.selectedEquipment = null;
  state.selectedProject = null;

  clearElementValue(
    'equipmentSelect'
  );

  clearElementValue(
    'equipmentSearch'
  );

  clearElementValue(
    'projectInput'
  );

  clearElementValue(
    'meterIn'
  );

  updateEquipmentMeterUI();
}


/* ==========================================================
   LOCK EMPLOYEE DURING OUT
   ========================================================== */

function lockEmployeeSelection(
  locked
) {

  const employeeSelect =
    $('employeeSelect');

  const employeeSearch =
    $('employeeSearch');

  if (employeeSelect) {
    employeeSelect.disabled = locked;
  }

  if (employeeSearch) {
    employeeSearch.disabled = locked;
  }
}


/* ==========================================================
   RESTART
   ========================================================== */

async function restartScanner() {

  await stopScanner();

  state.stationVerified = false;
  state.selectedEmployee = null;
  state.selectedEquipment = null;
  state.selectedProject = null;
  state.pendingOut = false;
  state.outPrepared = false;
  state.lastMeterOut = null;
  state.lastActivities = [];
  state.lastQrData = '';
  state.lastQrTime = 0;

  lockEmployeeSelection(false);

  hideElement(
    'attendanceScreen',
    true
  );

  hideElement(
    'resultBox',
    true
  );

  hideElement(
    'fuelQuestion',
    true
  );

  hideElement(
    'fuelForm',
    true
  );

  hideElement(
    'outDetails',
    true
  );

  const activityList =
    $('activityList');

  if (activityList) {
    activityList.innerHTML = '';
  }

  clearElementValue(
    'employeeSearch'
  );

  clearElementValue(
    'employeeSelect'
  );

  clearElementValue(
    'equipmentSearch'
  );

  clearElementValue(
    'equipmentSelect'
  );

  clearElementValue(
    'projectInput'
  );

  clearElementValue(
    'meterIn'
  );

  clearElementValue(
    'meterOut'
  );

  clearFuelInputs();

  showScreen(
    'scannerScreen'
  );

  const button =
    $('startCameraButton');

  if (button) {
    button.hidden = false;
    button.disabled = false;
    button.textContent = 'OPEN CAMERA';
  }

  setStatus(
    'Tap OPEN CAMERA to begin.',
    'info'
  );
}


/* ==========================================================
   SCREEN
   ========================================================== */

function showScreen(
  screenId
) {

  document
    .querySelectorAll(
      '.app-screen'
    )
    .forEach(
      function (screen) {

        screen.hidden =
          screen.id !== screenId;
      }
    );
}


/* ==========================================================
   STATUS
   ========================================================== */

function setStatus(
  message,
  type
) {

  const element =
    $('statusMessage');

  if (!element) {
    return;
  }

  element.textContent =
    message;

  element.className =
    'status-message ' +
    (
      type ||
      'info'
    );
}


/* ==========================================================
   BUSY
   ========================================================== */

function setBusy(
  busy
) {

  document.body.classList.toggle(
    'busy',
    busy
  );

  if (busy) {

    const inButton =
      $('inButton');

    const outButton =
      $('outButton');

    const continueButton =
      $('continueOutButton');

    if (inButton) {
      inButton.disabled = true;
    }

    if (outButton) {
      outButton.disabled = true;
    }

    if (continueButton) {
      continueButton.disabled = true;
    }

  } else {

    const continueButton =
      $('continueOutButton');

    if (continueButton) {
      continueButton.disabled =
        false;
    }

    updateButtons();
  }
}


/* ==========================================================
   FUEL RESET
   ========================================================== */

function clearFuelInputs() {

  const quantity =
    $('fuelQuantity');

  const price =
    $('fuelPricePerLiter');

  const total =
    $('fuelTotal');

  if (quantity) {
    quantity.value = '';
  }

  if (price) {
    price.value = '';
  }

  if (total) {
    total.value = '0.00';
  }
}


function resetFuel() {
  clearFuelInputs();

  hideElement(
    'fuelQuestion',
    true
  );

  hideElement(
    'fuelForm',
    true
  );
}


/* ==========================================================
   MANILA DATE
   ========================================================== */

function getManilaDate() {

  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }
  ).format(
    new Date()
  );
}


/* ==========================================================
   MANILA TIME
   ========================================================== */

function formatTime(
  value
) {

  if (!value) {
    return '';
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

  return new Intl.DateTimeFormat(
    'en-PH',
    {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }
  ).format(date);
}


/* ==========================================================
   FORMAT NUMBER
   ========================================================== */

function formatNumber(
  value
) {

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return '0.00';
  }

  return number.toFixed(2);
}


/* ==========================================================
   GENERIC HELPERS
   ========================================================== */

function appendOption(
  select,
  value,
  text
) {

  const option =
    document.createElement('option');

  option.value =
    value;

  option.textContent =
    text;

  select.appendChild(
    option
  );
}


function clearElementValue(
  id
) {

  const element =
    $(id);

  if (!element) {
    return;
  }

  if (
    element.tagName === 'SELECT' &&
    element.options.length
  ) {
    element.selectedIndex = 0;
  } else {
    element.value = '';
  }
}


function hideElement(
  id,
  hidden
) {

  const element =
    $(id);

  if (element) {
    element.hidden = hidden;
  }
}


function scrollToElement(
  id
) {

  const element =
    $(id);

  if (!element) {
    return;
  }

  setTimeout(
    function () {

      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

    },
    50
  );
}


function escapeHtml(
  value
) {

  return String(
    value === null ||
    value === undefined
      ? ''
      : value
  )
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


function escapeAttribute(
  value
) {

  return escapeHtml(value);
}

