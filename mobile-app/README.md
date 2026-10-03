# AMANAH Driver & Operator Mobile App

This folder is the dedicated native mobile-app workspace for AMANAH.

## Active development approach

The active mobile development path is **GitHub Codespaces + Expo + React Native + TypeScript**.

- Source control: GitHub
- Browser development environment: GitHub Codespaces
- Mobile framework: Expo + React Native + TypeScript
- Backend: existing AMANAH Supabase project
- Auth: Supabase Auth
- Employee identity: `public.employee_auth_accounts`
- Phone testing: Expo Go
- Production builds: Expo Application Services (EAS) when needed

The Replit project is retained separately as a backup/reference and is not the primary development environment.

## Identity flow

LOGIN -> SUPABASE AUTH USER -> EMPLOYEE ACCOUNT LINK -> EMPLOYEE PROFILE -> HOME

The authenticated account identifies the employee. The mobile app must not ask the user to choose their own employee identity.

The permanent AMANAH station QR identifies the station only.

## Attendance

Use the existing AMANAH attendance architecture and RPC workflow. Reuse:

- `attendance`
- `attendance_activities`
- `record_attendance_time_in`
- `prepare_attendance_out`
- `complete_attendance`
- `attach_fuel_evidence`
- existing attendance evidence storage buckets

Do not create a parallel attendance database.

## Approved activities

Drivers/operators can view approved upcoming work **without scanning the station QR and without starting attendance**.

The Approved Activities screen should:

- show a 7-calendar-day look-ahead: today + next 6 days
- default to ALL EQUIPMENT
- allow filtering by a specific active equipment unit
- use `project_activities` + `project_activity_equipment`
- show only `approval_status = APPROVED`
- exclude `CANCELLED`, `REJECTED`, and `DONE`
- show project, activity, description, scheduled time, equipment, priority, quantity, and status
- remain available after login and before attendance
- also be available during Time In after equipment selection

No employee-to-project-activity assignment table is being created yet. Equipment remains the current scheduling assignment mechanism.

## Permanent station QR

The production station QR is the existing AMANAH station payload:

- type: `AMANAH_ATTENDANCE_V1`
- company: `AMANAH CONSTRUCTION`
- system: `AMANAH CONSTRUCTION MANAGEMENT SYSTEM`
- station: `MAIN_ATTENDANCE`
- version: `1`

The app should parse JSON and validate these fields rather than comparing a raw QR string.

## Supabase identity mapping

Production contains:

`public.employee_auth_accounts`

Columns:

- `auth_user_id` UUID PRIMARY KEY -> `auth.users(id)`
- `employee_id` TEXT UNIQUE -> `employees(employee_id)`
- `mobile_access_enabled` BOOLEAN
- `created_at`
- `updated_at`

Do not put a service-role key in the mobile client.

## Browser testing

The browser/web preview may simulate the station QR scan for development, but native mobile builds must retain the real camera QR scanner.

## Git branch

The active free-development branch is:

`mobile-expo-free`

It was created from:

`mobile-app-foundation`

No existing GitHub Pages web application files are being changed by this mobile branch.

## Start development

Use GitHub Codespaces for the browser IDE. Expo's current default workflow is created with `create-expo-app`; the current Expo tutorial uses SDK 57. After the Expo project is initialized, copy or integrate this mobile foundation into the generated project and install the Supabase/Expo dependencies.

For phone testing, use Expo Go with the same SDK version as the project.

