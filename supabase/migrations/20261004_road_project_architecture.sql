-- AMANAH universal project structure backbone
-- Project -> Phase -> Section -> Work Component
-- Road projects use this for station-based lanes, optional shoulders, drainage, etc.

create table if not exists public.project_phases (
  phase_id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(project_id) on delete cascade,
  phase_code text,
  phase_name text not null,
  sequence_no integer not null default 1,
  status text not null default 'PLANNED'
    check (status in ('PLANNED','IN PROGRESS','DONE','ON HOLD','CANCELLED')),
  planned_start date,
  planned_end date,
  actual_end date,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_sections (
  section_id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.project_phases(phase_id) on delete cascade,
  section_code text,
  section_name text not null,
  station_start_m numeric(14,3),
  station_end_m numeric(14,3),
  route_length_m numeric(14,3)
    generated always as (
      case
        when station_start_m is not null
         and station_end_m is not null
         and station_end_m >= station_start_m
        then station_end_m - station_start_m
        else null
      end
    ) stored,
  geometry geometry(LineString,4326),
  status text not null default 'PLANNED'
    check (status in ('PLANNED','IN PROGRESS','DONE','ON HOLD','CANCELLED')),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    station_start_m is null
    or station_end_m is null
    or station_end_m >= station_start_m
  )
);

create table if not exists public.project_work_components (
  work_component_id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.project_sections(section_id) on delete cascade,
  component_type text not null,
  component_side text not null default 'NONE'
    check (component_side in ('LEFT','RIGHT','CENTER','NONE')),
  component_name text not null,
  station_start_m numeric(14,3),
  station_end_m numeric(14,3),
  planned_quantity numeric(14,3) not null default 0
    check (planned_quantity >= 0),
  quantity_unit text not null default 'M',
  status text not null default 'PLANNED'
    check (status in ('PLANNED','IN PROGRESS','DONE','ON HOLD','CANCELLED')),
  is_optional boolean not null default false,
  is_active boolean not null default true,
  geometry geometry(LineString,4326),
  sort_order integer not null default 1,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    station_start_m is null
    or station_end_m is null
    or station_end_m >= station_start_m
  )
);

create index if not exists idx_project_phases_project_id on public.project_phases(project_id);
create index if not exists idx_project_sections_phase_id on public.project_sections(phase_id);
create index if not exists idx_project_sections_geometry on public.project_sections using gist(geometry);
create index if not exists idx_project_work_components_section_id on public.project_work_components(section_id);
create index if not exists idx_project_work_components_geometry on public.project_work_components using gist(geometry);
create unique index if not exists uq_project_phases_project_sequence on public.project_phases(project_id, sequence_no);
create unique index if not exists uq_project_work_components_section_name on public.project_work_components(section_id, lower(component_name));

create or replace function public.set_project_structure_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_project_phases_updated_at on public.project_phases;
create trigger trg_project_phases_updated_at before update on public.project_phases
for each row execute function public.set_project_structure_updated_at();

drop trigger if exists trg_project_sections_updated_at on public.project_sections;
create trigger trg_project_sections_updated_at before update on public.project_sections
for each row execute function public.set_project_structure_updated_at();

drop trigger if exists trg_project_work_components_updated_at on public.project_work_components;
create trigger trg_project_work_components_updated_at before update on public.project_work_components
for each row execute function public.set_project_structure_updated_at();

alter table public.project_phases enable row level security;
alter table public.project_sections enable row level security;
alter table public.project_work_components enable row level security;

drop policy if exists project_phases_select on public.project_phases;
create policy project_phases_select on public.project_phases for select to authenticated
using (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.view'));

drop policy if exists project_phases_insert on public.project_phases;
create policy project_phases_insert on public.project_phases for insert to authenticated
with check (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));

drop policy if exists project_phases_update on public.project_phases;
create policy project_phases_update on public.project_phases for update to authenticated
using (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'))
with check (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));

drop policy if exists project_phases_delete on public.project_phases;
create policy project_phases_delete on public.project_phases for delete to authenticated
using (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));

drop policy if exists project_sections_select on public.project_sections;
create policy project_sections_select on public.project_sections for select to authenticated
using (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.view'));

drop policy if exists project_sections_insert on public.project_sections;
create policy project_sections_insert on public.project_sections for insert to authenticated
with check (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));

drop policy if exists project_sections_update on public.project_sections;
create policy project_sections_update on public.project_sections for update to authenticated
using (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'))
with check (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));

drop policy if exists project_sections_delete on public.project_sections;
create policy project_sections_delete on public.project_sections for delete to authenticated
using (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));

drop policy if exists project_work_components_select on public.project_work_components;
create policy project_work_components_select on public.project_work_components for select to authenticated
using (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.view'));

drop policy if exists project_work_components_insert on public.project_work_components;
create policy project_work_components_insert on public.project_work_components for insert to authenticated
with check (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));

drop policy if exists project_work_components_update on public.project_work_components;
create policy project_work_components_update on public.project_work_components for update to authenticated
using (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'))
with check (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));

drop policy if exists project_work_components_delete on public.project_work_components;
create policy project_work_components_delete on public.project_work_components for delete to authenticated
using (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));

grant select, insert, update, delete on public.project_phases to authenticated;
grant select, insert, update, delete on public.project_sections to authenticated;
grant select, insert, update, delete on public.project_work_components to authenticated;

comment on table public.project_phases is 'AMANAH universal project phase layer. Road projects use phases before sections.';
comment on table public.project_sections is 'AMANAH project section layer. Road projects use station-based road sections.';
comment on table public.project_work_components is 'AMANAH work component layer. Road projects use lanes, optional shoulders, median, drainage and other components.';
comment on column public.project_work_components.component_side is 'LEFT/RIGHT/CENTER/NONE relative to increasing station direction.';
comment on column public.project_work_components.geometry is 'Optional mapped LineString for embedded project maps.';
