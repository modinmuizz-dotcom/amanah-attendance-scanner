-- Link planned activities to the universal project structure.
alter table public.project_activities
  add column if not exists phase_id uuid references public.project_phases(phase_id) on delete set null,
  add column if not exists section_id uuid references public.project_sections(section_id) on delete set null,
  add column if not exists work_component_id uuid references public.project_work_components(work_component_id) on delete set null,
  add column if not exists station_start_m numeric(14,3),
  add column if not exists station_end_m numeric(14,3);

create index if not exists idx_project_activities_phase_id on public.project_activities(phase_id);
create index if not exists idx_project_activities_section_id on public.project_activities(section_id);
create index if not exists idx_project_activities_work_component_id on public.project_activities(work_component_id);

comment on column public.project_activities.phase_id is 'Optional universal project phase link.';
comment on column public.project_activities.section_id is 'Optional universal project section link. Road activities use the station-based road section.';
comment on column public.project_activities.work_component_id is 'Optional universal work-component link. Road activities use left/right lane, optional shoulder, median, drainage, etc.';
comment on column public.project_activities.station_start_m is 'Optional activity-specific station start in meters from project origin.';
comment on column public.project_activities.station_end_m is 'Optional activity-specific station end in meters from project origin.';

alter table public.project_activities
  add constraint project_activities_station_range_chk
  check (station_start_m is null or station_end_m is null or station_end_m >= station_start_m);
