-- Allow zero accomplishment for live mobile activity rows.
-- An activity can be active before the operator has completed any quantity.
alter table public.attendance_activities
  drop constraint if exists attendance_activities_quantity_check;

alter table public.attendance_activities
  add constraint attendance_activities_quantity_check
  check (quantity >= 0);
