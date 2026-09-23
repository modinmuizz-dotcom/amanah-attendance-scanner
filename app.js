/* =========================================================
   AMANAH CONSTRUCTION
   ATTENDANCE QR SCANNER
   GitHub Pages Frontend
   ========================================================= */


/* =========================================================
   CONFIGURATION
   ========================================================= */

const API_URL =
  "https://script.google.com/macros/s/AKfycbwZeyl8Vpe_ufPz3uCbicDXJkzVUzvqL6wRiJvSkZcwy42C5R-_HP6gz-K-bgmVEIYm/exec";


/*
   PERMANENT AMANAH COMPANY QR
*/

const AMANAH_QR = {
  type: "AMANAH_ATTENDANCE_V1",
  company: "AMANAH CONSTRUCTION",
  system: "AMANAH CONSTRUCTION MANAGEMENT SYSTEM",
  station: "MAIN_ATTENDANCE",
  version: 1
};


/*
   SCANNER SETTINGS
*/

const SCANNER_CONFIG = {

  fps: 10,

  qrbox: function(viewfinderWidth, viewfinderHeight) {

    const size = Math.floor(
      Math.min(viewfinderWidth, viewfinderHeight) * 0.70
    );

    return {
      width: size,
      height: size
    };

  },

  aspectRatio: 1.0,

  rememberLastUsedCamera: true,

  showTorchButtonIfSupported: true,

  showZoomSliderIfSupported: true

};


/* =========================================================
   GLOBAL VARIABLES
   ========================================================= */

let scanner = null;

let scannerRunning = false;

let companyVerified = false;

let employeeData = null;

let lastScannedText = "";

let scanLock = false;


/* =========================================================
   PAGE LOAD
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  function() {

    startScanner();

  }
);


/* =========================================================
   START CAMERA
   ========================================================= */

async function startScanner() {

  setStatus(
    "Starting camera...",
    "info"
  );

  try {

    if (
      !window.isSecureContext &&
      location.hostname !== "localhost"
    ) {

      setStatus(
        "Camera requires HTTPS. Please open the GitHub Pages HTTPS address.",
        "error"
      );

      return;

    }


    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {

      setStatus(
        "This browser does not support camera access.",
        "error"
      );

      return;

    }


    scanner = new Html5Qrcode("reader");


    /*
       Try back camera first.
    */

    let cameraId = null;


    try {

      const cameras =
        await Html5Qrcode.getCameras();


      if (!cameras || cameras.length === 0) {

        throw new Error(
          "No camera was found."
        );

      }


      /*
         Prefer rear/back camera.
      */

      const backCamera =
        cameras.find(camera => {

          const label =
            (camera.label || "").toLowerCase();

          return (
            label.includes("back") ||
            label.includes("rear") ||
            label.includes("environment")
          );

        });


      cameraId =
        backCamera
          ? backCamera.id
          : cameras[0].id;

    }

    catch (cameraError) {

      console.log(
        "Camera enumeration:",
        cameraError
      );

      /*
         Let html5-qrcode request the camera.
      */

      cameraId = {
        facingMode: "environment"
      };

    }


    await scanner.start(

      cameraId,

      SCANNER_CONFIG,

      onScanSuccess,

      onScanFailure

    );


    scannerRunning = true;


    setStatus(
      "Camera ready. Point it at the AMANAH company QR code.",
      "success"
    );


  }

  catch (error) {

    console.error(error);


    setStatus(
      "Unable to open camera. Please allow camera permission and reload this page.",
      "error"
    );

  }

}


/* =========================================================
   QR SCAN SUCCESS
   ========================================================= */

function onScanSuccess(decodedText) {

  if (scanLock) {
    return;
  }


  if (decodedText === lastScannedText) {
    return;
  }


  lastScannedText = decodedText;


  let data;


  try {

    data = JSON.parse(decodedText);

  }

  catch (error) {

    /*
       Not JSON.
       Ignore and continue scanning.
    */

    return;

  }


  /*
     STEP 1
     COMPANY QR
  */

  if (isAmanahCompanyQR(data)) {

    verifyCompanyQR(data);

    return;

  }


  /*
     STEP 2
     EMPLOYEE QR
  */

  if (companyVerified) {

    processEmployeeQR(data);

    return;

  }


  setStatus(
    "Please scan the AMANAH company QR first.",
    "error"
  );

}


/* =========================================================
   QR SCAN FAILURE
   ========================================================= */

function onScanFailure(errorMessage) {

  /*
     Normal.
     QR scanners continuously report failures
     while searching for a QR.
  */

}


/* =========================================================
   VALIDATE COMPANY QR
   ========================================================= */

function isAmanahCompanyQR(data) {

  return (

    data &&
    data.type === AMANAH_QR.type &&
    data.company === AMANAH_QR.company &&
    data.system === AMANAH_QR.system &&
    data.station === AMANAH_QR.station &&
    Number(data.version) === AMANAH_QR.version

  );

}


/* =========================================================
   COMPANY QR VERIFIED
   ========================================================= */

async function verifyCompanyQR(data) {

  if (scanLock) {
    return;
  }


  scanLock = true;


  setStatus(
    "AMANAH company QR detected. Verifying station...",
    "info"
  );


  try {

    const result =
      await apiGet(
        "verifyStation"
      );


    if (
      result &&
      result.success === true
    ) {

      companyVerified = true;


      document.getElementById(
        "pageTitle"
      ).textContent =
        "Scan Employee QR";


      document.getElementById(
        "pageSubtitle"
      ).textContent =
        "Company station verified. Scan the employee QR code.";


      setStatus(
        "✓ AMANAH station verified. Scan an employee QR code.",
        "success"
      );

    }

    else {

      companyVerified = false;


      setStatus(
        "Company QR is not authorized for this attendance station.",
        "error"
      );

    }

  }

  catch (error) {

    console.error(error);


    /*
       If API verification fails because of a temporary
       network problem, we still recognize the permanent
       QR locally.

       This keeps the camera usable while the API is
       unavailable.
    */

    companyVerified = true;


    document.getElementById(
      "pageTitle"
    ).textContent =
      "Scan Employee QR";


    document.getElementById(
      "pageSubtitle"
    ).textContent =
      "Company QR recognized. Scan the employee QR code.";


    setStatus(
      "✓ AMANAH company QR recognized. Scan employee QR.",
      "success"
    );

  }


  setTimeout(
    function() {

      scanLock = false;
      lastScannedText = "";

    },
    1200
  );

}


/* =========================================================
   PROCESS EMPLOYEE QR
   ========================================================= */

async function processEmployeeQR(data) {

  if (scanLock) {
    return;
  }


  scanLock = true;


  setStatus(
    "Employee QR detected. Looking up employee...",
    "info"
  );


  try {

    const employee =
      normalizeEmployeeQR(data);


    if (!employee) {

      setStatus(
        "Invalid employee QR. Employee ID or employee name is missing.",
        "error"
      );


      scanLock = false;

      return;

    }


    /*
       Ask Apps Script to verify employee.
    */

    const result =
      await apiGet(
        "employee",
        {
          employeeId:
            employee.employeeId,

          name:
            employee.name
        }
      );


    if (
      !result ||
      result.success !== true
    ) {

      setStatus(
        result && result.message
          ? result.message
          : "Employee was not found.",
        "error"
      );


      scanLock = false;

      return;

    }


    employeeData = {

      employeeId:
        result.employeeId ||
        employee.employeeId,

      name:
        result.name ||
        employee.name,

      position:
        result.position ||
        employee.position ||
        ""

    };


    showEmployee(employeeData);


    setStatus(
      "Employee verified. Choose TIME IN or TIME OUT.",
      "success"
    );


    stopScanner();


  }

  catch (error) {

    console.error(error);


    setStatus(
      "Unable to verify employee. Please try again.",
      "error"
    );


  }


  scanLock = false;

}


/* =========================================================
   NORMALIZE EMPLOYEE QR
   ========================================================= */

function normalizeEmployeeQR(data) {

  if (!data) {
    return null;
  }


  /*
     Support multiple employee QR formats.

     This makes the scanner compatible with
     your previous QR generator versions.
  */

  const employeeId =
    firstValue(
      data.employeeId,
      data.employeeID,
      data["Employee ID"],
      data.id,
      data.ID
    );


  const name =
    firstValue(
      data.name,
      data.Name,
      data.employeeName,
      data["Employee Name"],
      data["NAME OF OPERATORS"],
      data["Operator/Driver"],
      data.operator,
      data.operatorName
    );


  const position =
    firstValue(
      data.position,
      data.Position
    );


  if (!employeeId && !name) {

    return null;

  }


  return {

    employeeId:
      employeeId
        ? String(employeeId).trim()
        : "",

    name:
      name
        ? String(name).trim()
        : "",

    position:
      position
        ? String(position).trim()
        : ""

  };

}


/* =========================================================
   FIRST AVAILABLE VALUE
   ========================================================= */

function firstValue(...values) {

  for (
    const value of values
  ) {

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {

      return value;

    }

  }


  return "";

}


/* =========================================================
   DISPLAY EMPLOYEE
   ========================================================= */

function showEmployee(employee) {

  document.getElementById(
    "employeePanel"
  ).classList.remove("hidden");


  document.getElementById(
    "employeeName"
  ).textContent =
    employee.name || "—";


  document.getElementById(
    "employeeId"
  ).textContent =
    employee.employeeId
      ? "ID: " + employee.employeeId
      : "ID: —";


  document.getElementById(
    "employeePosition"
  ).textContent =
    employee.position || "—";


  document.getElementById(
    "actions"
  ).classList.remove("hidden");


  document.getElementById(
    "resetButton"
  ).classList.remove("hidden");

}


/* =========================================================
   RECORD ATTENDANCE
   ========================================================= */

async function recordAttendance(type) {

  if (!employeeData) {

    setStatus(
      "Please scan an employee QR first.",
      "error"
    );

    return;

  }


  const buttons =
    document.querySelectorAll(
      ".action-button"
    );


  buttons.forEach(
    button => {
      button.disabled = true;
    }
  );


  setStatus(
    type === "IN"
      ? "Recording TIME IN..."
      : "Recording TIME OUT...",
    "info"
  );


  try {

    const result =
      await apiGet(
        "attendance",
        {

          action:
            type,

          employeeId:
            employeeData.employeeId,

          name:
            employeeData.name,

          position:
            employeeData.position,

          station:
            AMANAH_QR.station

        }
      );


    if (
      result &&
      result.success === true
    ) {

      setStatus(
        result.message ||
        (
          type === "IN"
            ? "TIME IN recorded successfully."
            : "TIME OUT recorded successfully."
        ),
        "success"
      );


      /*
         Hide action buttons after successful attendance.
      */

      document.getElementById(
        "actions"
      ).classList.add("hidden");


    }

    else {

      setStatus(
        result && result.message
          ? result.message
          : "Attendance could not be recorded.",
        "error"
      );


      buttons.forEach(
        button => {
          button.disabled = false;
        }
      );

    }

  }

  catch (error) {

    console.error(error);


    setStatus(
      "Connection error. Attendance was not confirmed.",
      "error"
    );


    buttons.forEach(
      button => {
        button.disabled = false;
      }
    );

  }

}


/* =========================================================
   RESET SCANNER
   ========================================================= */

async function resetScanner() {

  employeeData = null;

  lastScannedText = "";

  scanLock = false;


  document.getElementById(
    "employeePanel"
  ).classList.add("hidden");


  document.getElementById(
    "actions"
  ).classList.add("hidden");


  document.getElementById(
    "resetButton"
  ).classList.add("hidden");


  document.getElementById(
    "pageTitle"
  ).textContent =
    "Scan Employee QR";


  document.getElementById(
    "pageSubtitle"
  ).textContent =
    "Scan the employee QR code.";


  setStatus(
    "Ready for next employee.",
    "info"
  );


  await startScanner();

}


/* =========================================================
   STOP SCANNER
   ========================================================= */

async function stopScanner() {

  if (
    scanner &&
    scannerRunning
  ) {

    try {

      await scanner.stop();

      scannerRunning = false;

    }

    catch (error) {

      console.log(
        "Scanner stop:",
        error
      );

    }

  }

}


/* =========================================================
   API GET / JSONP
   ========================================================= */

function apiGet(
  action,
  params = {}
) {

  return new Promise(
    function(resolve, reject) {

      const callbackName =
        "amanahCallback_" +
        Date.now() +
        "_" +
        Math.floor(
          Math.random() * 100000
        );


      const script =
        document.createElement(
          "script"
        );


      const query =
        new URLSearchParams();


      query.set(
        "callback",
        callbackName
      );


      query.set(
        "action",
        action
      );


      Object.keys(params).forEach(
        key => {

          if (
            params[key] !== undefined &&
            params[key] !== null
          ) {

            query.set(
              key,
              params[key]
            );

          }

        }
      );


      const timer =
        setTimeout(
          function() {

            cleanup();

            reject(
              new Error(
                "API request timed out."
              )
            );

          },
          15000
        );


      window[callbackName] =
        function(data) {

          clearTimeout(timer);

          cleanup();

          resolve(data);

        };


      function cleanup() {

        try {
          delete window[callbackName];
        }

        catch (e) {
          window[callbackName] =
            undefined;
        }


        if (script.parentNode) {

          script.parentNode.removeChild(
            script
          );

        }

      }


      script.onerror =
        function() {

          clearTimeout(timer);

          cleanup();

          reject(
            new Error(
              "Unable to connect to AMANAH API."
            )
          );

        };


      script.src =
        API_URL +
        "?" +
        query.toString();


      document.body.appendChild(
        script
      );

    }
  );

}


/* =========================================================
   STATUS DISPLAY
   ========================================================= */

function setStatus(
  message,
  type = "info"
) {

  const status =
    document.getElementById(
      "status"
    );


  status.textContent =
    message;


  status.className =
    "status " +
    type;

}
