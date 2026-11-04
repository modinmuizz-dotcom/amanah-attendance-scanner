# AMANAH CONSTRUCTION MANAGEMENT SYSTEM
## MASTER SYSTEM PROGRESS — CANONICAL CHECKPOINT
Updated: 2026-09-28

## ACTIVE ARCHITECTURE
- Frontend/hosting: GitHub Pages
- Repository: modinmuizz-dotcom/amanah-attendance-scanner
- Backend/database: Supabase
- Active architecture: Supabase + GitHub
- Do NOT return to the old Google Sheets / Apps Script attendance architecture.
- Do NOT use the old "DATA DON'T DELETE" / "DATA DONT DELETE" sheet.

## CURRENT SHARED SIDEBAR
MAIN
- Dashboard

ADMIN SECTION
- Master Data
- Roles & Permissions

PROJECT MANAGEMENT
- Activity Calendar

WORKFORCE
- Attendance

EQUIPMENT
- Equipment
- Operators / Drivers
- Maintenance
- Repair Requests
- Equipment History

RESOURCES
- Materials & Inventory
- Purchasing

REPORTING
- Reports

## MASTER DATA
admin.html + admin.js are the Master Data center.
Tabs already present:
- EMPLOYEES
- EQUIPMENT
- PROJECTS
- SUPPLIERS

The current admin.js already contains Supplier Master logic:
- state.suppliers
- loadSuppliers()
- renderSuppliers()
- editSupplier()
- openSupplierModal()
- saveSupplier()

Supplier UI fields:
- Supplier Code
- Supplier Name
- Contact Person
- Contact Number
- Email Address
- Address
- TIN
- Status

New database migration saved:
supabase/migrations/20260928_supplier_master.sql

The Supplier Master table is intended to register specific suppliers/vendors for Purchasing.
Purchase Orders currently store supplier_name directly; a future step can add supplier_id linkage and supplier selection from this master list.

## PURCHASING
Files:
- purchasing.html
- purchasing.js

Migrations:
- supabase/migrations/20260928_purchasing_module.sql
- supabase/migrations/20260928_purchasing_delete_policies.sql

Workflow:
SITE ENGINEER
-> Project
-> Requester
-> Materials
-> Quantity / Unit / Specifications
-> Purchase Request
-> Purchasing review

PURCHASING
-> Approve / Reject
-> Create Purchase Order
-> Supplier
-> Actual unit price
-> Delivery / payment terms
-> PO tracking

Important rule:
Estimated cost was removed from Purchase Requests.
The site engineer requests materials only.
Purchasing enters actual supplier prices on the PO.

PR statuses:
DRAFT, SUBMITTED, UNDER REVIEW, APPROVED, REJECTED, PARTIALLY ORDERED, ORDERED, CANCELLED, CLOSED

PO statuses:
DRAFT, APPROVED, SENT TO SUPPLIER, PARTIALLY RECEIVED, RECEIVED, CANCELLED, CLOSED

Purchasing actions:
- View
- Edit
- Print / Save PDF
- Delete
- Approve
- Reject
- Create PO

PO deletion returns linked PR to APPROVED.
PR deletion must not happen while linked to a PO.

## ACTIVITY CALENDAR
Files:
- project-schedule.html
- project-schedule.js

Completed:
- Monthly calendar
- Create activity
- Project/location
- Date/time
- Activity/description
- Manpower
- Priority
- Required equipment
- Equipment schedule
- Activity details
- Edit activity
- Engineer progress entry 0–100%
- 0% = PLANNED
- 1–99% = IN PROGRESS
- 100% = DONE
- Status/remarks update

Migration:
supabase/migrations/20260928_project_activity_schedule.sql

## ATTENDANCE
Final architecture:
- ONE permanent AMANAH company/station QR
- No individual employee QR codes

IN:
1. Who are you?
2. Equipment
3. Project
4. Fuel when applicable
5. Odometer/HRS meter

OUT:
1. Employee/operator
2. Active attendance is located automatically
3. Meter out
4. KM/HRS calculated
5. Activity capture
6. Multiple activities supported
7. Optional fuel
8. Fuel photo

Activity types:
HAULING, DELIVERY, TRIP, LOADS, CLEARING, SLOPE, CLEARING AND HAULING, ROAD REPAIR, BATCHING, OTHER

No UNIT field for attendance activity quantity.

Photos:
- 1–2 activity evidence photos
- Fuel photo when fuel is recorded
- Camera + photo library should both remain available

## EQUIPMENT / MAINTENANCE / REPAIR
Equipment:
- AMANAH-owned equipment
- No hourly rental rate
- Fuel uses liters only
- ODOMETER / HOUR METER
- Current meter tracked

Equipment History:
- Equipment summary
- Maintenance history
- Repair history
- Photo counts
- Combined maintenance + repair expense
- Print / Save PDF

Repair workflow:
DRAFT -> PENDING REVIEW -> PENDING APPROVAL -> APPROVED -> IN PROGRESS -> COMPLETED -> CLOSED

Repair photos are visible to reviewer/approver.

## UI RULES
- Keep shared sidebar/topbar consistent.
- Professional, practical, futuristic UI.
- Mobile-friendly field workflows.
- Preserve project dropdowns and project locations.
- Formal centered confirmation dialogs.
- Camera + photo library for photo attachments.
- Never reintroduce the old Google Sheets / Apps Script architecture.

## IMMEDIATE NEXT STEP
1. Run supabase/migrations/20260928_supplier_master.sql in Supabase.
2. Verify the SUPPLIERS tab in Master Data.
3. Register suppliers.
4. Later connect Purchase Orders to supplier_id and let Purchasing select a registered supplier.
5. Do not add other Purchasing functionality until requested.

## IMPORTANT REPOSITORY FILES
- admin.html
- admin.js
- amanah-ui.js
- purchasing.html
- purchasing.js
- project-schedule.html
- project-schedule.js
- equipment-history.html
- equipment-history.js
- equipment-maintenance.html
- repair-requests.html
- reports.html

## NON-NEGOTIABLE HISTORICAL RULE
Never use or recommend:
DATA DON'T DELETE / DATA DONT DELETE

The current AMANAH system is Supabase + GitHub.


## 2026-10-04 — ROAD PROJECT ARCHITECTURE IMPLEMENTED

The Road Project architecture is now implemented on the `amanah-mobile-integration` branch.

Structure:
- Project → Phase → Road Section → Work Component → Activity
- Road sections use station start/end in meters.
- Standard lane components: LEFT LANE and RIGHT LANE.
- Shoulders are optional and are never created automatically.
- Optional component types: SHOULDER, MEDIAN, DRAINAGE, SIDEWALK, OTHER.
- Each work component may have its own station range, planned quantity, status and optional PostGIS LineString geometry.
- `project_activities` now links to phase, section and work component and can store activity-specific station start/end.
- Activity Calendar requires the full Phase → Road Section → Work Component hierarchy for new road activities.
- Mobile Approved Work now returns and displays phase, section, work component, side and station range.
- New Road Structure page: `road-project-structure.html?project_id=...`
- PostGIS is enabled for embedded project map support.


## 2026-11-02 — NON-ROAD PROJECT STRUCTURE, PHASE 1

- Added Project Structure for SCHOOL BUILDING, MULTI PURPOSE BUILDING, COVERED COURT and WATER SYSTEM.
- Access: Project Master action or Project Management → Project Structure. Existing Road Structure is separate.
- Scope: project-specific templates, editable work groups/items, location/area and planned dates. The original flat item weights were replaced by editable group shares on 2026-11-04, as described below.
- Templates start with zero shares; the engineer assigns the allocation. Baselines require a complete positive allocation.
- Save Draft → Set Baseline. A saved baseline is locked; Revise Baseline requires a reason and retains the prior version snapshot.
- Database: project_work_structures and project_work_structure_events; RLS read access uses existing project/schedule permissions. Direct client writes are revoked; private permission-checked commands serialize writes and enforce optimistic revisions.
- Phase 1 does not change existing project accomplishment, road calculations, financial posting, payroll, or purchasing data.
- Next Phase 2: manual cumulative work-item progress, evidence photos and immutable progress history with weighted group/project rollups.
- Following phase: link the same work-item records to Activity Calendar, Dashboard, Project Master and Reports.
- Validation: node --test tests/project-structure-*.test.cjs and supabase/tests/20261102_project_work_structure.sql (transactional fixtures rolled back).

## 2026-11-04 — EDITABLE GROUP SHARES AND INDEPENDENT ITEM ALLOCATION

- Project Share (%) is editable for each draft work group. Group shares divide the whole project and must total exactly 100% for a baseline.
- Each work item has its own Item Share (% of Group). Item shares must total exactly 100% independently within every baseline group; the footer displays its assigned and remaining allocation.
- Project Contribution (%) is calculated as group project share × item share ÷ 100. For example, a 60% Structural Work group and a 50% Excavation item contribute 30% of the project scope.
- Preserved “Define the complete project scope”, the whole-project group share totals, and the allocation bar. Its caption reports weighted item allocation across the project and incomplete groups.
- The v2 database commands enforce both allocation levels, permissions, optimistic revisions and baseline locking. Drafts may remain incomplete but cannot exceed either 100% total. Use Revise baseline with a reason to edit an approved baseline.
- Legacy saved structures and audit snapshots retain their original weight model. The v2 reader converts legacy item weights into group shares and item percentages using largest-remainder rounding to total 100% within each nonzero group. Conversion is stored only on an authorized save or baseline revision. Cached v1 clients cannot overwrite v2 structures.
- Validation: all 20 model/controller tests passed; both SQL regression suites passed with rolled-back fixtures, covering independent totals, decimals, invalid values, old-client compatibility, baseline history, stale writes and access restrictions.
- This completes the scope-allocation adjustment in Phase 1. Actual accomplishment entry, evidence and weighted progress rollups remain Phase 2.

## 2026-11-04 — EXPLICIT EDIT CONTROLS FOR PROJECT STRUCTURE

- Existing work items open locked. Each Action cell has a blue Edit button beside Remove, which unlocks only that row's name, location, item share and planned dates.
- Work group names and project shares also open locked; Edit group unlocks only that group's header fields.
- Save draft remains the single save action for the structure. A successful save locks all fields again; a failed save preserves edited values and the rows that were open for editing. Clicking Edit alone does not mark the draft as changed.
- Adding a new group or work item opens its new fields for entry. Loading/reloading a project, replacing a template, and revising a baseline reset existing fields to locked. Read-only access and baseline locks still apply.
- Validation: all 25 model/controller tests passed, including row isolation, ignored locked-field events, save success/failure, new-item entry and baseline/view permissions. No database migration was needed.
