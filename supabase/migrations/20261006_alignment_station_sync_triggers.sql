-- Keep all derived road geometries synchronized with station-based source-of-truth data.

create or replace function public.trg_refresh_alignment_dependents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_road_project_station_geometries(NEW.project_id);
  return NEW;
end;
$$;

drop trigger if exists trg_refresh_alignment_dependents on public.road_project_alignments;
create trigger trg_refresh_alignment_dependents
after insert or update of geometry, length_m, start_lat, start_lng, end_lat, end_lng
on public.road_project_alignments
for each row
execute function public.trg_refresh_alignment_dependents();

create or replace function public.trg_refresh_section_geometry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_road_section_geometry(NEW.section_id);
  return NEW;
end;
$$;

drop trigger if exists trg_refresh_section_geometry on public.project_sections;
create trigger trg_refresh_section_geometry
after insert or update of station_start_m, station_end_m, phase_id
on public.project_sections
for each row
execute function public.trg_refresh_section_geometry();

create or replace function public.trg_refresh_component_geometry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.is_active then
    perform public.refresh_road_work_component_geometry(NEW.work_component_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_refresh_component_geometry on public.project_work_components;
create trigger trg_refresh_component_geometry
after insert or update of station_start_m, station_end_m, section_id, is_active
on public.project_work_components
for each row
execute function public.trg_refresh_component_geometry();
