/* =========================================================
   AMANAH PROJECT MONITORING
   MULTI-EQUIPMENT VERSION
   ========================================================= */

const SUPABASE_URL =
    "https://bafmycjninxomufhkjvy.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


/* =========================================================
   STATE
   ========================================================= */

const state = {
    projects: [],
    equipment: [],
    selectedProject: null,
    selectedEquipmentIds: new Set()
};


/* =========================================================
   HELPERS
   ========================================================= */

function showSuccess(message) {

    const box =
        document.getElementById("successMessage");

    box.textContent = message;
    box.style.display = "block";

    document.getElementById("errorMessage")
        .style.display = "none";
}


function showError(message) {

    const box =
        document.getElementById("errorMessage");

    box.textContent = message;
    box.style.display = "block";

    document.getElementById("successMessage")
        .style.display = "none";
}


function clearMessages() {

    document.getElementById("successMessage")
        .style.display = "none";

    document.getElementById("errorMessage")
        .style.display = "none";
}


function escapeHtml(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =========================================================
   LOAD PROJECTS
   ========================================================= */

async function loadProjects() {

    const select =
        document.getElementById("projectSelect");

    try {

        const {
            data,
            error
        } = await supabaseClient
            .from("projects")
            .select(`
                project_id,
                project_name,
                client,
                location,
                site_engineer,
                start_date,
                target_completion,
                actual_completion,
                contract_amount,
                current_progress,
                status
            `)
            .order("project_name", {
                ascending: true
            });

        if (error) {
            throw error;
        }

        state.projects =
            data || [];

        select.innerHTML = `
            <option value="">
                Select project
            </option>
        `;

        state.projects.forEach(project => {

            const option =
                document.createElement("option");

            option.value =
                project.project_id;

            option.textContent =
                `${project.project_name} — ${project.project_id}`;

            select.appendChild(option);

        });

    } catch (error) {

        console.error(error);

        showError(
            "Could not load projects: " +
            error.message
        );
    }
}


/* =========================================================
   LOAD EQUIPMENT
   ========================================================= */

async function loadEquipment() {

    try {

        const {
            data,
            error
        } = await supabaseClient
            .from("equipment")
            .select(`
                equipment_id,
                equipment_name,
                equipment_type,
                plate_number,
                status
            `)
            .eq("status", "ACTIVE")
            .order("equipment_name", {
                ascending: true
            });

        if (error) {
            throw error;
        }

        state.equipment =
            data || [];

        renderEquipmentList();

    } catch (error) {

        console.error(error);

        const list =
            document.getElementById("equipmentList");

        if (list) {

            list.innerHTML = `
                <div class="pm-equipment-empty">
                    Could not load equipment.
                </div>
            `;
        }

        showError(
            "Could not load equipment: " +
            error.message
        );
    }
}


/* =========================================================
   RENDER EQUIPMENT LIST
   ========================================================= */

function renderEquipmentList() {

    const list =
        document.getElementById("equipmentList");

    if (!list) {
        return;
    }

    const searchInput =
        document.getElementById("equipmentSearch");

    const search =
        (searchInput?.value || "")
            .trim()
            .toLowerCase();

    const filtered =
        state.equipment.filter(item => {

            const text = [
                item.equipment_id,
                item.equipment_name,
                item.equipment_type,
                item.plate_number
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return text.includes(search);
        });


    if (!filtered.length) {

        list.innerHTML = `
            <div class="pm-equipment-empty">
                No equipment found.
            </div>
        `;

        updateEquipmentSummary();
        return;
    }


    list.innerHTML =
        filtered.map(item => {

            const checked =
                state.selectedEquipmentIds
                    .has(item.equipment_id);

            return `
                <label
                    class="pm-equipment-option"
                    data-equipment-search="${escapeHtml(
                        [
                            item.equipment_id,
                            item.equipment_name,
                            item.equipment_type,
                            item.plate_number
                        ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase()
                    )}"
                >

                    <input
                        type="checkbox"
                        class="equipment-checkbox"
                        value="${escapeHtml(item.equipment_id)}"
                        ${checked ? "checked" : ""}
                    >

                    <span class="pm-equipment-checkmark">
                        ${checked ? "✓" : ""}
                    </span>

                    <span class="pm-equipment-info">

                        <strong>
                            ${escapeHtml(item.equipment_name)}
                        </strong>

                        <small>
                            ${escapeHtml(item.equipment_id)}
                            ${
                                item.equipment_type
                                    ? " • " +
                                      escapeHtml(item.equipment_type)
                                    : ""
                            }
                            ${
                                item.plate_number
                                    ? " • Plate " +
                                      escapeHtml(item.plate_number)
                                    : ""
                            }
                        </small>

                    </span>

                </label>
            `;

        }).join("");


    list.querySelectorAll(
        ".equipment-checkbox"
    ).forEach(checkbox => {

        checkbox.addEventListener(
            "change",
            function () {

                const id =
                    this.value;

                if (this.checked) {

                    state.selectedEquipmentIds
                        .add(id);

                } else {

                    state.selectedEquipmentIds
                        .delete(id);
                }

                renderEquipmentList();
            }
        );

    });


    updateEquipmentSummary();
}


/* =========================================================
   EQUIPMENT SUMMARY
   ========================================================= */

function updateEquipmentSummary() {

    const summary =
        document.getElementById(
            "equipmentSelectedSummary"
        );

    if (!summary) {
        return;
    }

    const count =
        state.selectedEquipmentIds.size;


    if (count === 0) {

        summary.textContent =
            "No equipment selected.";

        summary.classList.remove(
            "has-selection"
        );

        return;
    }


    summary.textContent =
        `${count} equipment ${
            count === 1
                ? "selected"
                : "selected"
        }.`;

    summary.classList.add(
        "has-selection"
    );
}


/* =========================================================
   SELECT ALL EQUIPMENT
   ========================================================= */

function selectAllEquipment() {

    state.equipment.forEach(item => {

        state.selectedEquipmentIds
            .add(item.equipment_id);

    });

    renderEquipmentList();
}


/* =========================================================
   CLEAR EQUIPMENT
   ========================================================= */

function clearSelectedEquipment() {

    state.selectedEquipmentIds.clear();

    renderEquipmentList();
}


/* =========================================================
   GET SELECTED EQUIPMENT
   ========================================================= */

function getSelectedEquipment() {

    return state.equipment.filter(
        item =>
            state.selectedEquipmentIds
                .has(item.equipment_id)
    );
}


/* =========================================================
   PROJECT SELECTION
   ========================================================= */

function handleProjectChange() {

    const id =
        document
            .getElementById("projectSelect")
            .value;


    const project =
        state.projects.find(
            item =>
                item.project_id === id
        );


    state.selectedProject =
        project || null;


    if (!project) {

        clearProjectInformation();

        renderActivities([]);

        return;
    }


    document.getElementById("projectId")
        .value =
        project.project_id || "";


    document.getElementById("projectName")
        .value =
        project.project_name || "";


    document.getElementById("client")
        .value =
        project.client || "";


    document.getElementById("location")
        .value =
        project.location || "";


    document.getElementById("siteEngineer")
        .value =
        project.site_engineer || "";


    document.getElementById("currentProgress")
        .value =
        project.current_progress ?? 0;


    document.getElementById("contractAmount")
        .value =
        project.contract_amount ?? 0;


    document.getElementById("projectStatus")
        .value =
        project.status || "";


    loadActivities(
        project.project_id
    );
}


/* =========================================================
   CLEAR PROJECT INFORMATION
   ========================================================= */

function clearProjectInformation() {

    [
        "projectId",
        "projectName",
        "client",
        "location",
        "siteEngineer",
        "currentProgress",
        "contractAmount",
        "projectStatus"
    ]
    .forEach(id => {

        const element =
            document.getElementById(id);

        if (element) {
            element.value = "";
        }

    });
}


/* =========================================================
   LOAD ACTIVITIES
   ========================================================= */

async function loadActivities(projectId) {

    const body =
        document.getElementById(
            "activityBody"
        );


    body.innerHTML = `
        <tr>
            <td colspan="7">
                Loading...
            </td>
        </tr>
    `;


    try {

        const {
            data,
            error
        } = await supabaseClient
            .from("project_activities")
            .select(`
                activity_id,
                activity_date,
                activity,
                description,
                manpower,
                equipment,
                accomplishment,
                remarks
            `)
            .eq(
                "project_id",
                projectId
            )
            .order(
                "activity_date",
                {
                    ascending: false
                }
            );


        if (error) {
            throw error;
        }


        renderActivities(
            data || []
        );


    } catch (error) {

        console.error(error);


        body.innerHTML = `
            <tr>
                <td colspan="7">
                    Could not load activities.
                </td>
            </tr>
        `;


        showError(
            "Could not load project activities: " +
            error.message
        );
    }
}


/* =========================================================
   RENDER ACTIVITIES
   ========================================================= */

function renderActivities(rows) {

    const body =
        document.getElementById(
            "activityBody"
        );


    if (!rows.length) {

        body.innerHTML = `
            <tr>
                <td colspan="7">
                    No project activities found.
                </td>
            </tr>
        `;

        return;
    }


    body.innerHTML =
        rows.map(row => `

            <tr>

                <td>
                    ${escapeHtml(
                        row.activity_date || ""
                    )}
                </td>

                <td>
                    <strong>
                        ${escapeHtml(
                            row.activity || ""
                        )}
                    </strong>
                </td>

                <td>
                    ${escapeHtml(
                        row.description || ""
                    )}
                </td>

                <td>
                    ${escapeHtml(
                        row.manpower ?? 0
                    )}
                </td>

                <td>
                    ${escapeHtml(
                        row.equipment || ""
                    )}
                </td>

                <td class="pm-progress">
                    ${escapeHtml(
                        row.accomplishment ?? 0
                    )}%
                </td>

                <td>
                    ${escapeHtml(
                        row.remarks || ""
                    )}
                </td>

            </tr>

        `)
        .join("");
}


/* =========================================================
   SAVE ACTIVITY
   ========================================================= */

async function saveActivity() {

    clearMessages();


    if (!state.selectedProject) {

        showError(
            "Please select a project first."
        );

        return;
    }


    const activityDate =
        document
            .getElementById(
                "activityDate"
            )
            .value;


    const activity =
        document
            .getElementById(
                "activity"
            )
            .value
            .trim();


    const description =
        document
            .getElementById(
                "description"
            )
            .value
            .trim();


    const manpower =
        Number(
            document
                .getElementById(
                    "manpower"
                )
                .value || 0
        );


    const selectedEquipment =
        getSelectedEquipment();


    const accomplishment =
        Number(
            document
                .getElementById(
                    "accomplishment"
                )
                .value || 0
        );


    const remarks =
        document
            .getElementById(
                "remarks"
            )
            .value
            .trim();


    /* -------------------------------------------------------
       VALIDATION
       ------------------------------------------------------- */

    if (!activityDate) {

        showError(
            "Please select the activity date."
        );

        return;
    }


    if (!activity) {

        showError(
            "Please enter the activity."
        );

        return;
    }


    if (
        selectedEquipment.length === 0
    ) {

        showError(
            "Please select at least one equipment."
        );

        return;
    }


    if (
        accomplishment < 0 ||
        accomplishment > 100
    ) {

        showError(
            "Accomplishment must be between 0 and 100."
        );

        return;
    }


    const equipmentNames =
        selectedEquipment
            .map(
                item =>
                    item.equipment_name
            )
            .join(", ");


    const button =
        document.getElementById(
            "saveActivityButton"
        );


    button.disabled = true;
    button.textContent =
        "SAVING...";


    try {

        /* ---------------------------------------------------
           1. CREATE PROJECT ACTIVITY
           --------------------------------------------------- */

        const {
            data: activityRow,
            error: activityError
        } = await supabaseClient
            .from("project_activities")
            .insert({

                project_id:
                    state
                        .selectedProject
                        .project_id,

                project_name:
                    state
                        .selectedProject
                        .project_name,

                activity_date:
                    activityDate,

                activity:
                    activity,

                description:
                    description || null,

                manpower:
                    manpower,

                /*
                 * Keep this existing field for
                 * compatibility and reporting.
                 */
                equipment:
                    equipmentNames,

                accomplishment:
                    accomplishment,

                remarks:
                    remarks || null

            })
            .select(
                "activity_id"
            )
            .single();


        if (activityError) {
            throw activityError;
        }


        if (!activityRow?.activity_id) {

            throw new Error(
                "Activity was saved but no activity ID was returned."
            );
        }


        /* ---------------------------------------------------
           2. SAVE EACH EQUIPMENT RELATIONSHIP
           --------------------------------------------------- */

        const equipmentRows =
            selectedEquipment.map(
                item => ({

                    activity_id:
                        activityRow.activity_id,

                    equipment_id:
                        item.equipment_id

                })
            );


        const {
            error: equipmentError
        } = await supabaseClient
            .from(
                "project_activity_equipment"
            )
            .insert(
                equipmentRows
            );


        if (equipmentError) {

            console.error(
                "Equipment relationship error:",
                equipmentError
            );

            throw new Error(
                "Activity was saved, but the equipment assignments could not be saved: " +
                equipmentError.message
            );
        }


        /* ---------------------------------------------------
           3. SUCCESS
           --------------------------------------------------- */

        showSuccess(
            `Project activity saved successfully with ${selectedEquipment.length} equipment.`
        );


        clearActivityForm();


        await loadActivities(
            state
                .selectedProject
                .project_id
        );


    } catch (error) {

        console.error(error);


        showError(
            "Could not save project activity: " +
            error.message
        );


    } finally {

        button.disabled = false;

        button.textContent =
            "SAVE ACTIVITY";
    }
}


/* =========================================================
   CLEAR ACTIVITY FORM
   ========================================================= */

function clearActivityForm() {

    const today =
        new Date()
            .toISOString()
            .slice(0, 10);


    document.getElementById(
        "activityDate"
    ).value = today;


    document.getElementById(
        "activity"
    ).value = "";


    document.getElementById(
        "description"
    ).value = "";


    document.getElementById(
        "manpower"
    ).value = "0";


    state.selectedEquipmentIds
        .clear();


    const equipmentSearch =
        document.getElementById(
            "equipmentSearch"
        );

    if (equipmentSearch) {
        equipmentSearch.value = "";
    }


    renderEquipmentList();


    document.getElementById(
        "accomplishment"
    ).value = "0";


    document.getElementById(
        "remarks"
    ).value = "";
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

    await supabaseClient.auth.signOut();

    location.href =
        "index.html";
}


/* =========================================================
   STARTUP
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            const {
                data: {
                    session
                }
            } = await supabaseClient
                .auth
                .getSession();


            if (!session) {

                location.href =
                    "index.html";

                return;
            }


            /* ------------------------------------------------
               PROJECT EVENTS
               ------------------------------------------------ */

            document
                .getElementById(
                    "projectSelect"
                )
                .addEventListener(
                    "change",
                    handleProjectChange
                );


            /* ------------------------------------------------
               ACTIVITY BUTTONS
               ------------------------------------------------ */

            document
                .getElementById(
                    "saveActivityButton"
                )
                .addEventListener(
                    "click",
                    saveActivity
                );


            document
                .getElementById(
                    "clearActivityButton"
                )
                .addEventListener(
                    "click",
                    clearActivityForm
                );


            /* ------------------------------------------------
               EQUIPMENT EVENTS
               ------------------------------------------------ */

            const equipmentSearch =
                document.getElementById(
                    "equipmentSearch"
                );

            if (equipmentSearch) {

                equipmentSearch
                    .addEventListener(
                        "input",
                        renderEquipmentList
                    );
            }


            const selectAllEquipmentButton =
                document.getElementById(
                    "selectAllEquipmentButton"
                );

            if (selectAllEquipmentButton) {

                selectAllEquipmentButton
                    .addEventListener(
                        "click",
                        selectAllEquipment
                    );
            }


            const clearEquipmentButton =
                document.getElementById(
                    "clearEquipmentButton"
                );

            if (clearEquipmentButton) {

                clearEquipmentButton
                    .addEventListener(
                        "click",
                        clearSelectedEquipment
                    );
            }


            /* ------------------------------------------------
               LOGOUT
               ------------------------------------------------ */

            document
                .getElementById(
                    "logoutButton"
                )
                .addEventListener(
                    "click",
                    logout
                );


            /* ------------------------------------------------
               DEFAULT DATE
               ------------------------------------------------ */

            const today =
                new Date()
                    .toISOString()
                    .slice(0, 10);


            document.getElementById(
                "activityDate"
            ).value = today;


            /* ------------------------------------------------
               LOAD MASTER DATA
               ------------------------------------------------ */

            await Promise.all([
                loadProjects(),
                loadEquipment()
            ]);


        } catch (error) {

            console.error(error);

            showError(
                "Could not initialize Project Monitoring: " +
                error.message
            );
        }

    }
);
