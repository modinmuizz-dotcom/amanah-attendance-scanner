const API_URL =
  "https://script.google.com/macros/s/AKfycby4au7sf04nsQNJTQ7OaUYHtPWWCkrwn0H1ib2qbUI6xcErCbN63NMU2-KRBzwNjgVy/exec";


const MASTER_QR_VALUE =
  "AMANAH-CONSTRUCTION-ATTENDANCE";


let scanner = null;

let scannerRunning = false;

let data = {
  employees: [],
  equipment: [],
  projects: []
};

let fuelUsed = "no";


const $ = id =>
  document.getElementById(id);


document.addEventListener(
  "DOMContentLoaded",
  async () => {

    $("startCameraBtn")
      .addEventListener(
        "click",
        startScanner
      );


    $("resetBtn")
      .addEventListener(
        "click",
        resetAll
      );


    $("inBtn")
      .addEventListener(
        "click",
        () => submitAttendance("IN")
      );


    $("outBtn")
      .addEventListener(
        "click",
        () => showFuelAndPrepareOut()
      );


    document
      .querySelectorAll("[data-fuel]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () =>
            setFuelChoice(
              button.dataset.fuel
            )
        );

      });


    await loadData();

    startScanner();

  }
);



/* ==============================
   GOOGLE APPS SCRIPT API
================================ */

function apiGet(action, params = {}) {

  return new Promise(
    (resolve, reject) => {

      const callback =
        "__amanah_cb_" +
        Date.now() +
        "_" +
        Math.floor(
          Math.random() * 100000
        );


      const script =
        document.createElement("script");


      const query =
        new URLSearchParams({

          action,

          callback,

          ...params

        });


      window[callback] =
        result => {

          cleanup();

          if (
            result &&
            result.success === false
          ) {

            reject(
              new Error(
                result.error ||
                "Server error."
              )
            );

          } else {

            resolve(result);

          }

        };


      script.onerror =
        () => {

          cleanup();

          reject(
            new Error(
              "Could not connect to the attendance server."
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


      function cleanup() {

        delete window[callback];

        script.remove();

      }

    }
  );

}



/* ==============================
   LOAD EMPLOYEES/EQUIPMENT/PROJECTS
================================ */

async function loadData() {

  try {

    const result =
      await apiGet("bootstrap");


    data =
      result;


    fillSelect(
      "employeeSelect",
      data.employees,
      "employee"
    );


    fillSelect(
      "equipmentSelect",
      data.equipment,
      "equipment"
    );


    fillSelect(
      "projectSelect",
      data.projects,
      "project"
    );


    setStatus(
      "scanStatus",
      "Ready. Scan the single company QR code."
    );


  } catch (error) {

    console.error(error);


    setStatus(
      "scanStatus",
      error.message,
      true
    );

  }

}



function fillSelect(
  id,
  items,
  type
) {

  const select =
    $(id);


  select.innerHTML =
    `<option value="">
       Select ${type}
     </option>`;


  items.forEach(
    item => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        item.id;


      option.textContent =
        item.id
          ? `${item.id} — ${item.name}`
          : item.name;


      option.dataset.name =
        item.name;


      select.appendChild(
        option
      );

    }
  );

}



/* ==============================
   CAMERA
================================ */

async function startScanner() {

  if (scannerRunning)
    return;


  if (!window.Html5Qrcode) {

    setTimeout(
      startScanner,
      300
    );

    return;

  }


  $("startCameraBtn")
    .classList
    .add("hidden");


  setStatus(
    "scanStatus",
    "Requesting camera permission..."
  );


  try {

    scanner =
      new Html5Qrcode(
        "reader",
        {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE
          ]
        }
      );


    await scanner.start(

      {
        facingMode:
          "environment"
      },

      {
        fps: 10,

        qrbox: {
          width: 250,
          height: 250
        },

        aspectRatio: 1
      },

      onScanSuccess,

      () => {}

    );


    scannerRunning =
      true;


    setStatus(
      "scanStatus",
      "Camera ready. Point it at the company QR code."
    );


  } catch (error) {

    console.error(error);


    $("startCameraBtn")
      .classList
      .remove("hidden");


    setStatus(
      "scanStatus",
      "Camera could not open. Tap Open Camera, then allow camera permission.",
      true
    );

  }

}



/* ==============================
   QR RESULT
================================ */

async function onScanSuccess(
  decodedText
) {

  const value =
    String(decodedText || "")
      .trim();


  if (
    value !== MASTER_QR_VALUE &&
    !isMasterQrUrl(value)
  ) {

    setStatus(
      "scanStatus",
      "This is not the AMANAH attendance QR code.",
      true
    );

    return;

  }


  await stopScanner();


  $("scannerSection")
    .classList
    .add("hidden");


  $("formSection")
    .classList
    .remove("hidden");


  $("fuelSection")
    .classList
    .add("hidden");


  setStatus(
    "message",
    "QR verified. Select your name, equipment and project."
  );


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}



function isMasterQrUrl(
  value
) {

  return value.includes(
    "modinmuizz-dotcom.github.io/amanah-attendance-scanner"
  );

}



/* ==============================
   STOP CAMERA
================================ */

async function stopScanner() {

  if (
    !scanner ||
    !scannerRunning
  )
    return;


  try {

    await scanner.stop();

    await scanner.clear();

  } catch (error) {

    console.warn(error);

  }


  scannerRunning =
    false;

}



/* ==============================
   FUEL
================================ */

function showFuelAndPrepareOut() {

  if (!validateSelections())
    return;


  $("fuelSection")
    .classList
    .remove("hidden");


  setFuelChoice("no");


  setStatus(
    "message",
    "Fuel is optional. Choose NO or YES."
  );

}



function setFuelChoice(
  value
) {

  fuelUsed =
    value;


  document
    .querySelectorAll(
      "[data-fuel]"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "selected",
          button.dataset.fuel === value
        );

      }
    );


  $("fuelFields")
    .classList
    .toggle(
      "hidden",
      value !== "yes"
    );


  if (value === "no") {

    $("fuelAmount").value =
      "";

    $("fuelPrice").value =
      "";

  }

}



/* ==============================
   SAVE ATTENDANCE
================================ */

async function submitAttendance(
  direction
) {

  if (!validateSelections())
    return;


  if (
    direction === "OUT" &&
    $("fuelSection")
      .classList
      .contains("hidden")
  ) {

    showFuelAndPrepareOut();

    return;

  }


  if (
    direction === "OUT" &&
    fuelUsed === "yes"
  ) {

    if (
      !$("fuelAmount").value ||
      !$("fuelPrice").value
    ) {

      setStatus(
        "message",
        "Please enter fuel amount and fuel price.",
        true
      );

      return;

    }

  }


  const employee =
    selected(
      "employeeSelect"
    );


  const equipment =
    selected(
      "equipmentSelect"
    );


  const project =
    selected(
      "projectSelect"
    );


  const params = {

    employeeId:
      employee.value,

    employeeName:
      employee.name,

    equipmentId:
      equipment.value,

    equipmentName:
      equipment.name,

    projectId:
      project.value,

    projectName:
      project.name

  };


  if (
    direction === "OUT"
  ) {

    params.fuelUsed =
      fuelUsed;


    params.fuelAmount =
      $("fuelAmount").value;


    params.fuelUnit =
      $("fuelUnit").value;


    params.fuelPrice =
      $("fuelPrice").value;

  }


  setBusy(true);


  setStatus(
    "message",
    direction === "IN"
      ? "Saving Time In..."
      : "Saving Time Out..."
  );


  try {

    const result =
      await apiGet(
        direction === "IN"
          ? "checkin"
          : "checkout",
        params
      );


    setStatus(
      "message",
      result.message ||
      "Saved successfully."
    );


    alert(
      result.message ||
      "Attendance saved successfully."
    );


    resetAll();


  } catch (error) {

    setStatus(
      "message",
      error.message,
      true
    );


  } finally {

    setBusy(false);

  }

}



/* ==============================
   VALIDATION
================================ */

function validateSelections() {

  if (
    !$("employeeSelect").value
  ) {

    setStatus(
      "message",
      "Please select who you are.",
      true
    );

    return false;

  }


  if (
    !$("equipmentSelect").value
  ) {

    setStatus(
      "message",
      "Please select the equipment.",
      true
    );

    return false;

  }


  if (
    !$("projectSelect").value
  ) {

    setStatus(
      "message",
      "Please select the project.",
      true
    );

    return false;

  }


  return true;

}



function selected(id) {

  const select =
    $(id);


  const option =
    select.options[
      select.selectedIndex
    ];


  return {

    value:
      select.value,

    name:
      option?.dataset.name ||
      option?.textContent ||
      ""

  };

}



/* ==============================
   BUTTON CONTROL
================================ */

function setBusy(
  busy
) {

  [
    "inBtn",
    "outBtn",
    "resetBtn"
  ].forEach(
    id => {

      $(id).disabled =
        busy;

    }
  );

}



/* ==============================
   RESET
================================ */

async function resetAll() {

  await stopScanner();


  $("employeeSelect").value =
    "";

  $("equipmentSelect").value =
    "";

  $("projectSelect").value =
    "";

  $("fuelAmount").value =
    "";

  $("fuelPrice").value =
    "";


  $("fuelSection")
    .classList
    .add("hidden");


  $("fuelFields")
    .classList
    .add("hidden");


  fuelUsed =
    "no";


  document
    .querySelectorAll(
      "[data-fuel]"
    )
    .forEach(
      button =>
        button.classList.remove(
          "selected"
        )
    );


  $("formSection")
    .classList
    .add("hidden");


  $("scannerSection")
    .classList
    .remove("hidden");


  setStatus(
    "scanStatus",
    "Starting camera..."
  );


  startScanner();

}



/* ==============================
   STATUS
================================ */

function setStatus(
  id,
  text,
  error = false
) {

  const element =
    $(id);


  if (!element)
    return;


  element.textContent =
    text;


  element.style.background =
    error
      ? "#fdecec"
      : "";


  element.style.color =
    error
      ? "#b42318"
      : "";

}
