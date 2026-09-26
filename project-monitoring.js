/* =========================================================
   AMANAH PROJECT MONITORING
   ========================================================= */

const SUPABASE_URL =
    "https://bafmycjninxomufhkjvy.supabase.co";

/*
 * IMPORTANT:
 * Put the SAME publishable key already used by your
 * working admin.js / app.js here.
 */
const SUPABASE_PUBLISHABLE_KEY =
    "https://bafmycjninxomufhkjvy.supabase.co";


const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


const state = {
    projects: [],
    selectedProject: null
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

    if (value === null || value === undefined) {
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


        state.projects = data || [];


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
   PROJECT SELECTION
   ========================================================= */

function handleProjectChange() {

    const id =
        document.getElementById("projectSelect").value;


    const project =
        state.projects.find(
            item => item.project_id === id
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


    loadActivities(project.project_id);
}


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
    ].forEach(id => {

        document.getElementById(id).value = "";

    });

}


/* =========================================================
   LOAD ACTIVITIES
   ========================================================= */

async function loadActivities(projectId) {

    const body =
        document.getElementById("activityBody");


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
            .eq("project_id", projectId)
            .order("activity_date", {
                ascending: false
            });


        if (error) {
            throw error;
        }


        renderActivities(data || []);


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
        document.getElementById("activityBody");


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
                    ${escapeHtml(row.activity_date || "")}
                </td>

                <td>
                    <strong>
                        ${escapeHtml(row.activity || "")}
                    </strong>
                </td>

                <td>
                    ${escapeHtml(row.description || "")}
                </td>

                <td>
                    ${escapeHtml(row.manpower ?? 0)}
                </td>

                <td>
                    ${escapeHtml(row.equipment || "")}
                </td>

                <td class="pm-progress">
                    ${escapeHtml(row.accomplishment ?? 0)}%
                </td>

                <td>
                    ${escapeHtml(row.remarks || "")}
                </td>

            </tr>

        `).join("");
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
        document.getElementById("activityDate").value;


    const activity =
        document.getElementById("activity").value.trim();


    const description =
        document.getElementById("description").value.trim();


    const manpower =
        Number(
            document.getElementById("manpower").value || 0
        );


    const equipment =
        document.getElementById("equipment").value.trim();


    const accomplishment =
        Number(
            document.getElementById("accomplishment").value || 0
        );


    const remarks =
        document.getElementById("remarks").value.trim();


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


    if (accomplishment < 0 || accomplishment > 100) {

        showError(
            "Accomplishment must be between 0 and 100."
        );

        return;
    }


    const button =
        document.getElementById("saveActivityButton");


    button.disabled = true;
    button.textContent = "SAVING...";


    try {

        const {
            error
        } = await supabaseClient
            .from("project_activities")
            .insert({

                project_id:
                    state.selectedProject.project_id,

                project_name:
                    state.selectedProject.project_name,

                activity_date:
                    activityDate,

                activity:
                    activity,

                description:
                    description || null,

                manpower:
                    manpower,

                equipment:
                    equipment || null,

                accomplishment:
                    accomplishment,

                remarks:
                    remarks || null
            });


        if (error) {
            throw error;
        }


        showSuccess(
            "Project activity saved successfully."
        );


        clearActivityForm();


        loadActivities(
            state.selectedProject.project_id
        );


    } catch (error) {

        console.error(error);

        showError(
            "Could not save project activity: " +
            error.message
        );


    } finally {

        button.disabled = false;
        button.textContent = "SAVE ACTIVITY";

    }
}


/* =========================================================
   CLEAR ACTIVITY
   ========================================================= */

function clearActivityForm() {

    const today =
        new Date()
            .toISOString()
            .slice(0, 10);


    document.getElementById("activityDate")
        .value = today;


    document.getElementById("activity")
        .value = "";


    document.getElementById("description")
        .value = "";


    document.getElementById("manpower")
        .value = "0";


    document.getElementById("equipment")
        .value = "";


    document.getElementById("accomplishment")
        .value = "0";


    document.getElementById("remarks")
        .value = "";
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

    await supabaseClient.auth.signOut();

    location.href = "index.html";
}


/* =========================================================
   STARTUP
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        const {
            data: {
                session
            }
        } = await supabaseClient.auth.getSession();


        if (!session) {

            location.href = "index.html";

            return;
        }


        document.getElementById("projectSelect")
            .addEventListener(
                "change",
                handleProjectChange
            );


        document.getElementById("saveActivityButton")
            .addEventListener(
                "click",
                saveActivity
            );


        document.getElementById("clearActivityButton")
            .addEventListener(
                "click",
                clearActivityForm
            );


        document.getElementById("logoutButton")
            .addEventListener(
                "click",
                logout
            );


        const today =
            new Date()
                .toISOString()
                .slice(0, 10);


        document.getElementById("activityDate")
            .value = today;


        await loadProjects();

    }
);
