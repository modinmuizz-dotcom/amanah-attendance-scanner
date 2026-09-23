/*******************************************************
 * AMANAH CONSTRUCTION MANAGEMENT SYSTEM
 * MOBILE ATTENDANCE SCANNER
 *
 * ONE PERMANENT COMPANY QR ONLY
 *
 * FLOW:
 * COMPANY QR
 *     ↓
 * WHO ARE YOU?
 *     ↓
 * EQUIPMENT
 *     ↓
 * PROJECT
 *     ↓
 * TIME IN
 *     ↓
 * TIME OUT
 *     ↓
 * OPTIONAL FUEL
 *
 * NO EMPLOYEE QR CODES
 *
 * IMPORTANT:
 * This file uses jsQR only.
 * There must be ZERO Html5Qrcode references.
 *******************************************************/


/* =====================================================
   CONFIGURATION
   ===================================================== */

const API_URL =
  'https://script.google.com/macros/s/AKfycbyxEhNRWFlbW-RbwYKyfer9Xd9f5w-ZXnGt9UBxWf2pAM50N5fzhleXfiIhBKFiSw2i/exec';


const PERMANENT_QR = {
  type: 'AMANAH_ATTENDANCE_V1',
  company: 'AMANAH CONSTRUCTION',
  system: 'AMANAH CONSTRUCTION MANAGEMENT SYSTEM',
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
   DOM SHORTCUT
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

    showScreen('scannerScreen');

    setStatus(
      'Tap OPEN CAMERA to begin.',
      'info'
    );

  }
);


/* =====================================================
   BUTTON SETUP
   ===================================================== */

function setupButtons() {

  const startCameraButton =
    $('startCameraButton');

  if (startCameraButton) {

    startCameraButton.addEventListener(
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
        completeTimeOut(false);
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
        completeTimeOut(true);
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
   START CAMERA
   ===================================================== */

async function startScanner() {

  if (state.scannerRunning) {
    return;
  }


  const button =
    $('startCameraButton');

  const video =
    $('cameraVideo');


  if (!video) {

    setStatus(
      'Camera video element was not found.',
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
      button.textContent =
        'OPENING CAMERA...';
    }


    setStatus(
      'Requesting camera access...',
      'info'
    );


    /*
     * Open ONE native camera stream.
     * We do NOT use Html5Qrcode.
     */

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


    /*
     * Attach stream to the video.
     */

    video.srcObject =
      stream;

    video.muted = true;

    video.setAttribute(
      'playsinline',
      'true'
    );

    video.setAttribute(
      'autoplay',
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


    /*
     * Begin scanning video frames.
     */

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
      error.name === 'NotAllowedError'
    ) {

      message +=
        'Camera permission was denied. Allow camera access for this website.';


    } else if (
      error &&
      error.name === 'NotFoundError'
    ) {

      message +=
        'No camera was found on this device.';


    } else if (
      error &&
      error.name === 'NotReadableError'
    ) {

      message +=
        'The camera is being used by another app or browser tab.';


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
   SCAN CAMERA FRAME
   ===================================================== */

function scanCameraFrame() {

  if (!state.scannerRunning) {
    return;
  }


  if (state.stationVerified) {
    return;
  }


  const video =
    $('cameraVideo');

  const canvas =
    $('cameraCanvas');


  if (!video || !canvas) {

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

      /*
       * Keep the canvas at the actual
       * camera resolution.
       */

      canvas.width =
        width;

      canvas.height =
        height;


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


        /*
         * jsQR is supplied by index.html.
         */

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

          setStatus(
            'QR scanner library is not loaded. Please reload the page.',
            'error'
          );

          state.scannerRunning =
            false;

          stopCamera();

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
   PROCESS QR RESULT
   ===================================================== */

async function processQrResult(
  decodedText
) {

  /*
   * Prevent repeatedly processing
   * the same QR every frame.
   */

  const now =
    Date.now();

  if (
    decodedText === state.lastQrData &&
    now - state.lastQrTime < 2500
  ) {

    return;
  }


  state.lastQrData =
    decodedText;

  state.lastQrTime =
    now;


  const payload =
    parseQr(decodedText);


  if (!payload) {

    setStatus(
      'Invalid QR code. Please scan the AMANAH company QR code.',
      'error'
    );


    resumeQrScanning(
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
      'This is not the AMANAH attendance station QR code.',
      'error'
    );


    resumeQrScanning(
      1500
    );

    return;
  }


  /*
   * SUCCESS
   */

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


  await loadBootstrap();
}


/* =====================================================
   PARSE QR
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
   RESUME SCANNING
   ===================================================== */

function resumeQrScanning(
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

  stopCamera();

  state.scannerRunning =
    false;
}


/* =====================================================
   STOP CAMERA HARD
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
   LOAD SYSTEM DATA
   ===================================================== */

async function loadBootstrap() {

  setStatus(
    'Loading employees, equipment and projects...',
    'info'
  );


  try {

    const data =
      await apiCall(
        'getBootstrap'
      );


    if (
      !data ||
      !data.success
    ) {

      throw new Error(
        data &&
        data.error
          ? data.error
          : 'Unable to load system data.'
      );
    }


    state.employees =
      Array.isArray(
        data.employees
      )
        ? data.employees
        : [];


    state.equipment =
      Array.isArray(
        data.equipment
      )
        ? data.equipment
        : [];


    state.projects =
      Array.isArray(
        data.projects
      )
        ? data.projects
        : [];


    state.activeAttendance =
      Array.isArray(
        data.activeAttendance
      )
        ? data.activeAttendance
        : [];


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
      'BOOTSTRAP ERROR:',
      error
    );


    setStatus(
      error.message ||
        'Unable to load system data.',
      'error'
    );
  }
}


/* =====================================================
   BUILD EMPLOYEE LIST
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

      if (
        !employee.employeeId
      ) {
        return;
      }


      const option =
        document.createElement(
          'option'
        );


      option.value =
        employee.employeeId;


      option.textContent =
        employee.employeeName +
        ' — ' +
        employee.employeeId +
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
            employee.employeeId,
            employee.employeeName,
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

        const option =
          document.createElement(
            'option'
          );


        option.value =
          employee.employeeId;


        option.textContent =
          employee.employeeName +
          ' — ' +
          employee.employeeId +
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
          employee.employeeId ===
          employeeId
        );
      }
    ) || null;


  updateActiveAttendanceDisplay();

  updateButtons();
}


/* =====================================================
   BUILD EQUIPMENT LIST
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

      if (!item.equipmentId) {
        return;
      }


      const option =
        document.createElement(
          'option'
        );


      option.value =
        item.equipmentId;


      option.textContent =
        item.equipmentName +
        ' — ' +
        item.equipmentId;


      if (
        item.equipmentType
      ) {

        option.textContent +=
          ' (' +
          item.equipmentType +
          ')';
      }


      select.appendChild(
        option
      );

    }
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
            item.equipmentId,
            item.equipmentName,
            item.equipmentType,
            item.plateNumber
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

        const option =
          document.createElement(
            'option'
          );


        option.value =
          item.equipmentId;


        option.textContent =
          item.equipmentName +
          ' — ' +
          item.equipmentId;


        select.appendChild(
          option
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
          item.equipmentId === id
        );
      }
    ) || null;


  updateButtons();
}


/* =====================================================
   BUILD PROJECT LIST
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

      if (!project.projectId) {
        return;
      }


      const option =
        document.createElement(
          'option'
        );


      option.value =
        project.projectId;


      option.textContent =
        project.projectName +
        ' — ' +
        project.projectId;


      select.appendChild(
        option
      );

    }
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
            project.projectId,
            project.projectName,
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

        const option =
          document.createElement(
            'option'
          );


        option.value =
          project.projectId;


        option.textContent =
          project.projectName +
          ' — ' +
          project.projectId;


        select.appendChild(
          option
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
          project.projectId === id
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
        item.employeeId ===
        state.selectedEmployee.employeeId
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
        active.employeeName
      ) +
      '</strong>' +
    '</div>' +

    '<div class="active-row">' +
      'Equipment: ' +
      '<strong>' +
      escapeHtml(
        active.equipmentName
      ) +
      '</strong>' +
    '</div>' +

    '<div class="active-row">' +
      'Project: ' +
      '<strong>' +
      escapeHtml(
        active.projectName
      ) +
      '</strong>' +
    '</div>' +

    '<div class="active-row">' +
      'Time In: ' +
      '<strong>' +
      escapeHtml(
        active.timeIn
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


    if (
      !response ||
      !response.success
    ) {

      throw new Error(
        response &&
        response.error
          ? response.error
          : 'Time In failed.'
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

    console.error(
      'TIME IN ERROR:',
      error
    );


    setStatus(
      error.message ||
        'Time In failed.',
      'error'
    );

  } finally {

    setBusy(false);
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
      behavior: 'smooth',
      block: 'center'
    });
  }
}


/* =====================================================
   SHOW FUEL FORM
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
   COMPLETE TIME OUT
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


  let fuelData = {

    fuelUsed:
      'NO'
  };


  if (useFuel) {

    const quantityInput =
      $('fuelQuantity');

    const unitInput =
      $('fuelUnit');

    const amountInput =
      $('fuelAmount');


    const quantity =
      quantityInput
        ? parseFloat(
            quantityInput.value
          )
        : NaN;


    const unit =
      unitInput
        ? unitInput.value
        : '';


    const amount =
      amountInput
        ? parseFloat(
            amountInput.value
          )
        : NaN;


    if (
      !(quantity > 0)
    ) {

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


    if (
      !(amount >= 0)
    ) {

      setStatus(
        'Enter the fuel price / amount.',
        'error'
      );

      return;
    }


    fuelData = {

      fuelUsed:
        'YES',

      fuelQuantity:
        quantity,

      fuelUnit:
        unit,

      fuelAmount:
        amount
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


    if (
      !response ||
      !response.success
    ) {

      throw new Error(
        response &&
        response.error
          ? response.error
          : 'Time Out failed.'
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

    console.error(
      'TIME OUT ERROR:',
      error
    );


    setStatus(
      error.message ||
        'Time Out failed.',
      'error'
    );

  } finally {

    setBusy(false);
  }
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


  box.hidden =
    false;


  let html = '';


  html +=
    '<div class="result-title">' +
    escapeHtml(title) +
    '</div>';


  html +=
    '<div class="result-item">' +
    'Employee: ' +
    '<strong>' +
    escapeHtml(
      attendance.employeeName || ''
    ) +
    '</strong>' +
    '</div>';


  html +=
    '<div class="result-item">' +
    'Equipment: ' +
    '<strong>' +
    escapeHtml(
      attendance.equipmentName || ''
    ) +
    '</strong>' +
    '</div>';


  html +=
    '<div class="result-item">' +
    'Project: ' +
    '<strong>' +
    escapeHtml(
      attendance.projectName || ''
    ) +
    '</strong>' +
    '</div>';


  html +=
    '<div class="result-item">' +
    'Date: ' +
    '<strong>' +
    escapeHtml(
      attendance.date || ''
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
}


/* =====================================================
   API JSONP
   ===================================================== */

function apiCall(
  action,
  params
) {

  params =
    params || {};


  return new Promise(
    function (
      resolve,
      reject
    ) {

      const callbackName =
        'amanahCallback_' +
        Date.now() +
        '_' +
        Math.floor(
          Math.random() * 100000
        );


      const script =
        document.createElement(
          'script'
        );


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
        String(
          Date.now()
        )
      );


      Object.keys(
        params
      ).forEach(
        function (key) {

          const value =
            params[key];


          if (
            value !== undefined &&
            value !== null
          ) {

            query.set(
              key,
              String(value)
            );
          }

        }
      );


      const timeout =
        setTimeout(
          function () {

            cleanup();

            reject(
              new Error(
                'API request timed out.'
              )
            );

          },
          20000
        );


      function cleanup() {

        clearTimeout(
          timeout
        );


        try {

          delete window[
            callbackName
          ];

        } catch (_) {

          window[
            callbackName
          ] = undefined;
        }


        script.remove();
      }


      window[
        callbackName
      ] =
        function (data) {

          cleanup();

          resolve(
            data
          );
        };


      script.onerror =
        function () {

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

    }
  );
}


/* =====================================================
   RESTART SCANNER
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
   SCREEN SWITCH
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
   STATUS MESSAGE
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
