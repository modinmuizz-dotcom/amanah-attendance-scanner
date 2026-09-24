/*******************************************************
 * AMANAH CONSTRUCTION MANAGEMENT SYSTEM
 * GITHUB + SUPABASE ATTENDANCE SCANNER
 *
 * WORKFLOW:
 *
 * ONE PERMANENT AMANAH QR
 *        ↓
 * WHO ARE YOU?
 *        ↓
 * EQUIPMENT
 *        ↓
 * PROJECT
 *        ↓
 * TIME IN
 *        ↓
 * TIME OUT
 *        ↓
 * DID YOU FUEL?
 *      /       \
 *    NO         YES
 *              ↓
 *       Quantity
 *       Liter/Gallon
 *       Fuel Amount
 *
 * NO EMPLOYEE QR CODES
 *
 * NO APPS SCRIPT API
 *******************************************************/


/* =====================================================
   SUPABASE CONFIGURATION
   ===================================================== */

const SUPABASE_URL =
  'https://bafmycjninxomufhkjvy.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';


/* =====================================================
   SUPABASE CLIENT
   ===================================================== */

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


/* =====================================================
   PERMANENT AMANAH QR
   ===================================================== */

const PERMANENT_QR = {

  type: 'AMANAH_ATTENDANCE_V1',

  company: 'AMANAH CONSTRUCTION',

  system:
    'AMANAH CONSTRUCTION MANAGEMENT SYSTEM',

  station: 'MAIN_ATTENDANCE',

  version: 1
};


/* =====================================================
   APPLICATION STATE
   ===================================================== */

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

  lastQrData: '',

  lastQrTime: 0
};


/* =====================================================
   DOM HELPER
   ===================================================== */

function $(id) {

  return document.getElementById(id);
}


/* =====================================================
   PAGE START
   ===================================================== */

document.addEventListener(
  'DOMContentLoaded',
  function () {

    setupButtons();

    showScreen(
      'scannerScreen'
    );

    setStatus(
      'Tap OPEN CAMERA to begin.',
      'info'
    );

  }
);


/* =====================================================
   BUTTONS
   ===================================================== */

function setupButtons() {

  const startButton =
    $('startCameraButton');

  if (startButton) {

    startButton.addEventListener(
      'click',
      startScanner
    );
  }


  const inButton =
    $('inButton');

  if (inButton) {

    inButton.addEventListener(
      'click',
      timeIn
    );
  }


  const outButton =
    $('outButton');

  if (outButton) {

    outButton.addEventListener(
      'click',
      beginTimeOut
    );
  }


  const fuelNoButton =
    $('fuelNoButton');

  if (fuelNoButton) {

    fuelNoButton.addEventListener(
      'click',
      function () {

        completeTimeOut(
          false
        );

      }
    );
  }


  const fuelYesButton =
    $('fuelYesButton');

  if (fuelYesButton) {

    fuelYesButton.addEventListener(
      'click',
      showFuelForm
    );
  }


  const fuelConfirmButton =
    $('fuelConfirmButton');

  if (fuelConfirmButton) {

    fuelConfirmButton.addEventListener(
      'click',
      function () {

        completeTimeOut(
          true
        );

      }
    );
  }


  const restartButton =
    $('restartScannerButton');

  if (restartButton) {

    restartButton.addEventListener(
      'click',
      restartScanner
    );
  }


  const employeeSearch =
    $('employeeSearch');

  if (employeeSearch) {

    employeeSearch.addEventListener(
      'input',
      filterEmployees
    );
  }


  const equipmentSearch =
    $('equipmentSearch');

  if (equipmentSearch) {

    equipmentSearch.addEventListener(
      'input',
      filterEquipment
    );
  }


  const projectSearch =
    $('projectSearch');

  if (projectSearch) {

    projectSearch.addEventListener(
      'input',
      filterProjects
    );
  }


  const employeeSelect =
    $('employeeSelect');

  if (employeeSelect) {

    employeeSelect.addEventListener(
      'change',
      employeeChanged
    );
  }


  const equipmentSelect =
    $('equipmentSelect');

  if (equipmentSelect) {

    equipmentSelect.addEventListener(
      'change',
      equipmentChanged
    );
  }


  const projectSelect =
    $('projectSelect');

  if (projectSelect) {

    projectSelect.addEventListener(
      'change',
      projectChanged
    );
  }
}


/* =====================================================
   CAMERA
   ===================================================== */

async function startScanner() {

  if (state.scannerRunning) {

    return;
  }


  const video =
    $('cameraVideo');

  const button =
    $('startCameraButton');


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

      button.disabled =
        true;

      button.textContent =
        'OPENING CAMERA...';
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


    state.cameraStream =
      stream;


    video.srcObject =
      stream;


    video.muted =
      true;


    video.setAttribute(
      'autoplay',
      'true'
    );


    video.setAttribute(
      'playsinline',
      'true'
    );


    await video.play();


    state.scannerRunning =
      true;


    if (button) {

      button.hidden =
        true;
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


    state.scannerRunning =
      false;


    let message =
      'Unable to open camera. ';


    if (
      error &&
      error.name ===
        'NotAllowedError'
    ) {

      message +=
        'Camera permission was denied.';

    } else if (
      error &&
      error.name ===
        'NotFoundError'
    ) {

      message +=
        'No camera was found.';

    } else if (
      error &&
      error.name ===
        'NotReadableError'
    ) {

      message +=
        'The camera is being used by another app or tab.';

    } else {

      message +=
        error &&
        error.message
          ? error.message
          : 'Please try again.';
    }


    setStatus(
      message,
      'error'
    );


    if (button) {

      button.disabled =
        false;

      button.hidden =
        false;

      button.textContent =
        'TRY CAMERA AGAIN';
    }

  }
}


/* =====================================================
   CAMERA FRAME SCANNING
   ===================================================== */

function scanCameraFrame() {

  if (
    !state.scannerRunning
  ) {

    return;
  }


  if (
    state.stationVerified
  ) {

    return;
  }


  const video =
    $('cameraVideo');

  const canvas =
    $('cameraCanvas');


  if (
    !video ||
    !canvas
  ) {

    requestAnimationFrame(
      scanCameraFrame
    );

    return;
  }


  if (
    video.readyState >=
    HTMLMediaElement.HAVE_CURRENT_DATA
  ) {

    const width =
      video.videoWidth;

    const height =
      video.videoHeight;


    if (
      width > 0 &&
      height > 0
    ) {

      canvas.width =
        width;

      canvas.height =
        height;


      const context =
        canvas.getContext(
          '2d',
          {
            willReadFrequently:
              true
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


        if (
          typeof jsQR ===
          'function'
        ) {

          const qr =
            jsQR(
              imageData.data,
              imageData.width,
              imageData.height,
              {
                inversionAttempts:
                  'attemptBoth'
              }
            );


          if (
            qr &&
            qr.data
          ) {

            processQrResult(
              qr.data
            );

            return;
          }


        } else {

          state.scannerRunning =
            false;

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


  requestAnimationFrame(
    scanCameraFrame
  );
}


/* =====================================================
   QR RESULT
   ===================================================== */

async function processQrResult(
  decodedText
) {

  const now =
    Date.now();


  if (
    decodedText ===
      state.lastQrData &&
    now -
      state.lastQrTime <
      2500
  ) {

    return;
  }


  state.lastQrData =
    decodedText;

  state.lastQrTime =
    now;


  const payload =
    parseQr(
      decodedText
    );


  if (!payload) {

    setStatus(
      'Invalid QR code. Scan the AMANAH company QR.',
      'error'
    );


    resumeScanning(
      1500
    );

    return;
  }


  const valid =
    payload.type ===
      PERMANENT_QR.type &&

    payload.company ===
      PERMANENT_QR.company &&

    payload.system ===
      PERMANENT_QR.system &&

    payload.station ===
      PERMANENT_QR.station &&

    Number(payload.version) ===
      PERMANENT_QR.version;


  if (!valid) {

    setStatus(
      'This is not the AMANAH attendance station QR.',
      'error'
    );


    resumeScanning(
      1500
    );

    return;
  }


  state.stationVerified =
    true;


  await stopScanner();


  setStatus(
    '✓ AMANAH station verified.',
    'success'
  );


  showScreen(
    'attendanceScreen'
  );


  await loadSystemData();
}


/* =====================================================
   PARSE QR
   ===================================================== */

function parseQr(
  text
) {

  try {

    return JSON.parse(
      String(
        text
      ).trim()
    );

  } catch (error) {

    return null;
  }
}


/* =====================================================
   RESUME SCANNING
   ===================================================== */

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


/* =====================================================
   STOP CAMERA
   ===================================================== */

async function stopScanner() {

  state.scannerRunning =
    false;

  stopCamera();
}


/* =====================================================
   STOP CAMERA STREAM
   ===================================================== */

function stopCamera() {

  const video =
    $('cameraVideo');


  if (
    state.cameraStream
  ) {

    state.cameraStream
      .getTracks()
      .forEach(
        function (track) {

          try {

            track.stop();

          } catch (_) {}

        }
      );


    state.cameraStream =
      null;
  }


  if (video) {

    try {

      video.pause();

    } catch (_) {}


    video.srcObject =
      null;
  }
}


/* =====================================================
   LOAD DATA FROM SUPABASE
   ===================================================== */

async function loadSystemData() {

  setStatus(
    'Loading employees, equipment and projects...',
    'info'
  );


  try {

    const results =
      await Promise.all([

        supabaseClient
          .from('employees')
          .select(
            'employee_id,employee_name,position,department,status'
          )
          .eq(
            'status',
            'ACTIVE'
          )
          .order(
            'employee_name',
            {
              ascending: true
            }
          ),

        supabaseClient
          .from('equipment')
          .select(
            'equipment_id,equipment_name,equipment_type,plate_number,status'
          )
          .eq(
            'status',
            'ACTIVE'
          )
          .order(
            'equipment_name',
            {
              ascending: true
            }
          ),

        supabaseClient
          .from('projects')
          .select(
            'project_id,project_name,client,location,site_engineer,start_date,target_completion,actual_completion,contract_amount,current_progress,status'
          )
          .eq(
            'status',
            'ACTIVE'
          )
          .order(
            'project_name',
            {
              ascending: true
            }
          ),

        supabaseClient
          .from('attendance')
          .select(
            '*'
          )
          .eq(
            'status',
            'IN'
          )
          .order(
            'created_at',
            {
              ascending: false
            }
          )
      ]);


    const employeeResult =
      results[0];

    const equipmentResult =
      results[1];

    const projectResult =
      results[2];

    const attendanceResult =
      results[3];


    if (
      employeeResult.error
    ) {

      throw new Error(
        'Employees: ' +
        employeeResult.error.message
      );
    }


    if (
      equipmentResult.error
    ) {

      throw new Error(
        'Equipment: ' +
        equipmentResult.error.message
      );
    }


    if (
      projectResult.error
    ) {

      throw new Error(
        'Projects: ' +
        projectResult.error.message
      );
    }


    if (
      attendanceResult.error
    ) {

      throw new Error(
        'Attendance: ' +
        attendanceResult.error.message
      );
    }


    state.employees =
      employeeResult.data ||
      [];


    state.equipment =
      equipmentResult.data ||
      [];


    state.projects =
      projectResult.data ||
      [];


    state.activeAttendance =
      attendanceResult.data ||
      [];


    buildEmployeeList();

    buildEquipmentList();

    buildProjectList();


    setStatus(
      '✓ AMANAH station verified. Who are you?',
      'success'
    );


    updateButtons();


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


/* =====================================================
   EMPLOYEES
   ===================================================== */

function buildEmployeeList() {

  const select =
    $('employeeSelect');


  if (!select) {

    return;
  }


  select.innerHTML =
    '';


  const first =
    document.createElement(
      'option'
    );


  first.value =
    '';

  first.textContent =
    'Select employee / operator / driver';


  select.appendChild(
    first
  );


  state.employees.forEach(
    function (employee) {

      addEmployeeOption(
        select,
        employee
      );

    }
  );
}


/* =====================================================
   ADD EMPLOYEE OPTION
   ===================================================== */

function addEmployeeOption(
  select,
  employee
) {

  if (
    !employee.employee_id
  ) {

    return;
  }


  const option =
    document.createElement(
      'option'
    );


  option.value =
    employee.employee_id;


  option.textContent =
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


  select.appendChild(
    option
  );
}


/* =====================================================
   FILTER EMPLOYEES
   ===================================================== */

function filterEmployees() {

  const input =
    $('employeeSearch');

  const select =
    $('employeeSelect');


  if (!select) {

    return;
  }


  const search =
    input &&
    input.value
      ? input.value
          .toLowerCase()
          .trim()
      : '';


  select.innerHTML =
    '';


  const first =
    document.createElement(
      'option'
    );


  first.value =
    '';

  first.textContent =
    'Select employee / operator / driver';


  select.appendChild(
    first
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


        return text.includes(
          search
        );
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
}


/* =====================================================
   EMPLOYEE CHANGED
   ===================================================== */

function employeeChanged() {

  const select =
    $('employeeSelect');


  const employeeId =
    select
      ? select.value
      : '';


  state.selectedEmployee =
    state.employees.find(
      function (employee) {

        return (
          employee.employee_id ===
          employeeId
        );
      }
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
    '';


  const first =
    document.createElement(
      'option'
    );


  first.value =
    '';

  first.textContent =
    'Select equipment';


  select.appendChild(
    first
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


/* =====================================================
   ADD EQUIPMENT OPTION
   ===================================================== */

function addEquipmentOption(
  select,
  item
) {

  if (
    !item.equipment_id
  ) {

    return;
  }


  const option =
    document.createElement(
      'option'
    );


  option.value =
    item.equipment_id;


  option.textContent =
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


  select.appendChild(
    option
  );
}


/* =====================================================
   FILTER EQUIPMENT
   ===================================================== */

function filterEquipment() {

  const input =
    $('equipmentSearch');

  const select =
    $('equipmentSelect');


  if (!select) {

    return;
  }


  const search =
    input &&
    input.value
      ? input.value
          .toLowerCase()
          .trim()
      : '';


  select.innerHTML =
    '';


  const first =
    document.createElement(
      'option'
    );


  first.value =
    '';

  first.textContent =
    'Select equipment';


  select.appendChild(
    first
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


        return text.includes(
          search
        );
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
}


/* =====================================================
   EQUIPMENT CHANGED
   ===================================================== */

function equipmentChanged() {

  const select =
    $('equipmentSelect');


  const id =
    select
      ? select.value
      : '';


  state.selectedEquipment =
    state.equipment.find(
      function (item) {

        return (
          item.equipment_id ===
          id
        );
      }
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
    '';


  const first =
    document.createElement(
      'option'
    );


  first.value =
    '';

  first.textContent =
    'Select project';


  select.appendChild(
    first
  );


  state.projects.forEach(
    function (project) {

      addProjectOption(
        select,
        project
      );

    }
  );
}


/* =====================================================
   ADD PROJECT OPTION
   ===================================================== */

function addProjectOption(
  select,
  project
) {

  if (
    !project.project_id
  ) {

    return;
  }


  const option =
    document.createElement(
      'option'
    );


  option.value =
    project.project_id;


  option.textContent =
    (
      project.project_name ||
      ''
    ) +
    ' — ' +
    project.project_id;


  select.appendChild(
    option
  );
}


/* =====================================================
   FILTER PROJECTS
   ===================================================== */

function filterProjects() {

  const input =
    $('projectSearch');

  const select =
    $('projectSelect');


  if (!select) {

    return;
  }


  const search =
    input &&
    input.value
      ? input.value
          .toLowerCase()
          .trim()
      : '';


  select.innerHTML =
    '';


  const first =
    document.createElement(
      'option'
    );


  first.value =
    '';

  first.textContent =
    'Select project';


  select.appendChild(
    first
  );


  state.projects
    .filter(
      function (project) {

        const text =
          [

            project.project_id,

            project.project_name,

            project.client,

            project.location

          ]
            .join(' ')
            .toLowerCase();


        return text.includes(
          search
        );
      }
    )
    .forEach(
      function (project) {

        addProjectOption(
          select,
          project
        );

      }
    );
}


/* =====================================================
   PROJECT CHANGED
   ===================================================== */

function projectChanged() {

  const select =
    $('projectSelect');


  const id =
    select
      ? select.value
      : '';


  state.selectedProject =
    state.projects.find(
      function (project) {

        return (
          project.project_id ===
          id
        );
      }
    ) || null;


  updateButtons();
}


/* =====================================================
   ACTIVE ATTENDANCE
   ===================================================== */

function getActiveAttendance() {

  if (
    !state.selectedEmployee
  ) {

    return null;
  }


  return state.activeAttendance.find(
    function (item) {

      return (
        item.employee_id ===
        state.selectedEmployee.employee_id
      );

    }
  ) || null;
}


/* =====================================================
   DISPLAY ACTIVE ATTENDANCE
   ===================================================== */

function updateActiveAttendanceDisplay() {

  const box =
    $('activeAttendance');


  if (!box) {

    return;
  }


  const active =
    getActiveAttendance();


  if (!active) {

    box.hidden =
      true;

    box.innerHTML =
      '';

    return;
  }


  box.hidden =
    false;


  box.innerHTML =

    '<div class="active-title">' +
      'ACTIVE ATTENDANCE' +
    '</div>' +

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
      'Project: ' +
      '<strong>' +
      escapeHtml(
        active.project_name
      ) +
      '</strong>' +
    '</div>' +

    '<div class="active-row">' +
      'Time In: ' +
      '<strong>' +
      formatTime(
        active.time_in
      ) +
      '</strong>' +
    '</div>';
}


/* =====================================================
   BUTTON STATE
   ===================================================== */

function updateButtons() {

  const inButton =
    $('inButton');

  const outButton =
    $('outButton');


  if (
    !inButton ||
    !outButton
  ) {

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


  setBusy(
    true
  );


  try {

    const employee =
      state.selectedEmployee;

    const equipment =
      state.selectedEquipment;

    const project =
      state.selectedProject;


    const attendanceDate =
      getManilaDate();


    const timeIn =
      new Date().toISOString();


    const insertData = {

      employee_id:
        employee.employee_id,

      employee_name:
        employee.employee_name,

      attendance_date:
        attendanceDate,

      time_in:
        timeIn,

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
        project.project_id,

      project_name:
        project.project_name,

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
        .insert(
          insertData
        )
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

    setBusy(
      false
    );
  }
}


/* =====================================================
   BEGIN TIME OUT
   ===================================================== */

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


  state.pendingOut =
    true;


  hideElement(
    'fuelForm',
    true
  );


  hideElement(
    'fuelQuestion',
    false
  );


  setStatus(
    'Time Out selected. Did you fuel the equipment?',
    'info'
  );


  const question =
    $('fuelQuestion');


  if (question) {

    question.scrollIntoView({
      behavior:
        'smooth',

      block:
        'center'
    });
  }
}


/* =====================================================
   FUEL FORM
   ===================================================== */

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
}


/* =====================================================
   TIME OUT
   ===================================================== */

/* =====================================================
   TIME OUT
   ===================================================== */

async function completeTimeOut(
  useFuel
) {

  const employee =
    state.selectedEmployee;


  if (!employee) {

    setStatus(
      'Please select the employee.',
      'error'
    );

    return;
  }


  const active =
    getActiveAttendance();


  if (!active) {

    setStatus(
      'No active attendance was found.',
      'error'
    );

    return;
  }


  let fuelUsed =
    false;

  let fuelQuantity =
    null;

  let fuelUnit =
    null;

  let fuelAmount =
    null;


  /* ===================================================
     FUEL VALIDATION
     =================================================== */

  if (useFuel) {

    const quantityInput =
      $('fuelQuantity');

    const unitInput =
      $('fuelUnit');

    const amountInput =
      $('fuelAmount');


    fuelQuantity =
      quantityInput
        ? parseFloat(
            quantityInput.value
          )
        : NaN;


    fuelUnit =
      unitInput
        ? String(
            unitInput.value
          ).trim()
        : '';


    fuelAmount =
      amountInput
        ? parseFloat(
            amountInput.value
          )
        : NaN;


    if (
      !(fuelQuantity > 0)
    ) {

      setStatus(
        'Enter the fuel quantity.',
        'error'
      );

      return;
    }


    if (
      fuelUnit !== 'Liter' &&
      fuelUnit !== 'Gallon'
    ) {

      setStatus(
        'Select Liter or Gallon.',
        'error'
      );

      return;
    }


    if (
      !(fuelAmount >= 0)
    ) {

      setStatus(
        'Enter the fuel price / amount.',
        'error'
      );

      return;
    }


    fuelUsed =
      true;
  }


  /* ===================================================
     START
     =================================================== */

  setBusy(
    true
  );


  try {

    const timeOut =
      new Date().toISOString();


    /* =================================================
       CALL SUPABASE DATABASE FUNCTION

       This replaces the old:

       .from('attendance')
       .update(...)

       The database function handles:
       - TIME OUT
       - Total Hours
       - Status
       - Fuel
       ================================================= */

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


    /* =================================================
       CHECK SUPABASE ERROR
       ================================================= */

    if (
      rpcResult.error
    ) {

      throw new Error(
        rpcResult.error.message
      );
    }


    if (
      !rpcResult.data
    ) {

      throw new Error(
        'TIME OUT function returned no result.'
      );
    }


    /*
     * JSONB functions normally return an object.
     * This also safely handles a one-item array.
     */

    const completed =
      Array.isArray(
        rpcResult.data
      )
        ? rpcResult.data[0]
        : rpcResult.data;


    if (
      !completed
    ) {

      throw new Error(
        'TIME OUT function returned an empty result.'
      );
    }


    if (
      completed.success !== true
    ) {

      throw new Error(
        'TIME OUT was not completed.'
      );
    }


    /* =================================================
       BUILD RESULT FOR EXISTING UI

       The current database function does not return
       attendance_date, so use the already-loaded
       active attendance date.
       ================================================= */

    const completedAttendance = {

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
        timeOut,


      total_hours:
        completed.total_hours,


      fuel_used:
        completed.fuel_used === true
          ? true
          : false,


      fuel_quantity:
        completed.fuel_quantity ??
        null,


      fuel_unit:
        completed.fuel_unit ??
        null,


      fuel_amount:
        completed.fuel_amount ??
        null

    };


    /* =================================================
       SUCCESS
       ================================================= */

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


    /* =================================================
       RESET FUEL UI
       ================================================= */

    resetFuel();


    /* =================================================
       REFRESH ACTIVE ATTENDANCE

       This removes the green ACTIVE ATTENDANCE
       box because the row is now COMPLETED.
       ================================================= */

    await loadSystemData();


  } catch (error) {

    console.error(
      'TIME OUT ERROR:',
      error
    );


    setStatus(
      'TIME OUT failed: ' +
      (
        error &&
        error.message
          ? error.message
          : 'Unknown error'
      ),
      'error'
    );


  } finally {

    setBusy(
      false
    );

  }

}


/* =====================================================
   RESULT MAPPING
   ===================================================== */

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
        ? formatTime(
            row.time_in
          )
        : '',

    timeOut:
      row.time_out
        ? formatTime(
            row.time_out
          )
        : '',

    totalHours:
      row.total_hours,

    fuel:
      row.fuel_used
        ? (
            Number(
              row.fuel_quantity
            ).toFixed(2) +
            ' ' +
            row.fuel_unit +
            ' | ₱' +
            Number(
              row.fuel_amount
            ).toFixed(2)
          )
        : ''

  };
}


/* =====================================================
   RESULT DISPLAY
   ===================================================== */

function showResult(
  attendance,
  title
) {

  const box =
    $('resultBox');


  if (
    !box ||
    !attendance
  ) {

    return;
  }


  let html = '';


  html +=
    '<div class="result-title">' +
      escapeHtml(
        title
      ) +
    '</div>';


  html +=
    '<div class="result-item">' +
      'Employee: ' +
      '<strong>' +
        escapeHtml(
          attendance.employeeName ||
          ''
        ) +
      '</strong>' +
    '</div>';


  html +=
    '<div class="result-item">' +
      'Equipment: ' +
      '<strong>' +
        escapeHtml(
          attendance.equipmentName ||
          ''
        ) +
      '</strong>' +
    '</div>';


  html +=
    '<div class="result-item">' +
      'Project: ' +
      '<strong>' +
        escapeHtml(
          attendance.projectName ||
          ''
        ) +
      '</strong>' +
    '</div>';


  html +=
    '<div class="result-item">' +
      'Date: ' +
      '<strong>' +
        escapeHtml(
          attendance.date ||
          ''
        ) +
      '</strong>' +
    '</div>';


  if (
    attendance.timeIn
  ) {

    html +=
      '<div class="result-item">' +
        'Time In: ' +
        '<strong>' +
          escapeHtml(
            attendance.timeIn
          ) +
        '</strong>' +
      '</div>';
  }


  if (
    attendance.timeOut
  ) {

    html +=
      '<div class="result-item">' +
        'Time Out: ' +
        '<strong>' +
          escapeHtml(
            attendance.timeOut
          ) +
        '</strong>' +
      '</div>';
  }


  if (
    attendance.totalHours !==
    null &&
    attendance.totalHours !==
    undefined
  ) {

    html +=
      '<div class="result-item">' +
        'Total Hours: ' +
        '<strong>' +
          escapeHtml(
            String(
              attendance.totalHours
            )
          ) +
        '</strong>' +
      '</div>';
  }


  if (
    attendance.fuel
  ) {

    html +=
      '<div class="result-item">' +
        'Fuel: ' +
        '<strong>' +
          escapeHtml(
            attendance.fuel
          ) +
        '</strong>' +
      '</div>';
  }


  box.innerHTML =
    html;


  box.hidden =
    false;
}


/* =====================================================
   RESTART
   ===================================================== */

async function restartScanner() {

  await stopScanner();


  state.stationVerified =
    false;


  state.selectedEmployee =
    null;


  state.selectedEquipment =
    null;


  state.selectedProject =
    null;


  state.pendingOut =
    false;


  state.lastQrData =
    '';


  state.lastQrTime =
    0;


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


  showScreen(
    'scannerScreen'
  );


  const button =
    $('startCameraButton');


  if (button) {

    button.hidden =
      false;

    button.disabled =
      false;

    button.textContent =
      'OPEN CAMERA';
  }


  setStatus(
    'Tap OPEN CAMERA to begin.',
    'info'
  );
}


/* =====================================================
   SCREEN
   ===================================================== */

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
          screen.id !==
          screenId;
      }
    );
}


/* =====================================================
   STATUS
   ===================================================== */

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


/* =====================================================
   BUSY
   ===================================================== */

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


    if (inButton) {

      inButton.disabled =
        true;
    }


    if (outButton) {

      outButton.disabled =
        true;
    }


  } else {

    updateButtons();
  }
}


/* =====================================================
   FUEL RESET
   ===================================================== */

function resetFuel() {

  const quantity =
    $('fuelQuantity');

  const unit =
    $('fuelUnit');

  const amount =
    $('fuelAmount');


  if (quantity) {

    quantity.value =
      '';
  }


  if (unit) {

    unit.value =
      'Liter';
  }


  if (amount) {

    amount.value =
      '';
  }


  hideElement(
    'fuelQuestion',
    true
  );


  hideElement(
    'fuelForm',
    true
  );


  state.pendingOut =
    false;
}


/* =====================================================
   MANILA DATE
   ===================================================== */

function getManilaDate() {

  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone:
        'Asia/Manila',

      year:
        'numeric',

      month:
        '2-digit',

      day:
        '2-digit'
    }
  ).format(
    new Date()
  );
}


/* =====================================================
   MANILA TIME
   ===================================================== */

function formatTime(
  value
) {

  if (!value) {

    return '';
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(
      value
    );
  }


  return new Intl.DateTimeFormat(
    'en-PH',
    {
      timeZone:
        'Asia/Manila',

      hour:
        '2-digit',

      minute:
        '2-digit',

      second:
        '2-digit',

      hour12:
        true
    }
  ).format(
    date
  );
}


/* =====================================================
   HIDE ELEMENT
   ===================================================== */

function hideElement(
  id,
  hidden
) {

  const element =
    $(id);


  if (element) {

    element.hidden =
      hidden;
  }
}


/* =====================================================
   HTML ESCAPE
   ===================================================== */

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
