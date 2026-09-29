# AMANAH Driver & Operator Mobile App

This folder is the separate mobile-app foundation for AMANAH.

## Architecture

- Mobile framework: Expo + React Native + TypeScript
- Backend: existing AMANAH Supabase project
- Auth: Supabase Auth
- Employee identity: public.employee_auth_accounts
- Existing attendance/activity tables are reused
- Employee activity assignment is intentionally NOT implemented yet

## Identity flow

LOGIN -> SUPABASE AUTH USER -> EMPLOYEE ACCOUNT LINK -> EMPLOYEE PROFILE

The permanent AMANAH station QR identifies the station. The authenticated mobile account identifies the employee.

## Existing AMANAH data reused by the app

- employees
- equipment
- projects
- attendance
- attendance_activities
- project_activities
- project_activity_equipment
- attendance-activity evidence storage
- attendance-fuel-evidence storage

## Identity mapping

The production database now contains:

public.employee_auth_accounts

Columns:
- auth_user_id UUID PRIMARY KEY -> auth.users(id)
- employee_id TEXT UNIQUE -> employees(employee_id)
- mobile_access_enabled BOOLEAN
- created_at
- updated_at

The mapping table currently has zero rows. No employee has been linked yet.

## Future activity assignment

Do NOT create an employee activity assignment table yet.

When we design that layer, it should sit beside the existing project_activity_equipment table rather than replacing it.

## Bootstrap

Use the current Expo initializer:

npx create-expo-app@latest

Then install the Supabase React Native dependencies documented by Supabase and copy this foundation into the generated Expo project.

## Branch

mobile-app-foundation

This branch is isolated from main. No existing GitHub Pages web application files are modified by this foundation.
