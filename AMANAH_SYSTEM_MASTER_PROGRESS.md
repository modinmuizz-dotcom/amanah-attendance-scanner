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
