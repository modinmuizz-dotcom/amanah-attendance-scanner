-- AMANAH: final fix for station-derived geometry.
-- 1) Avoid ST_LineSubstring(geography, ...) because the live PostGIS build
--    in this project does not expose that overload.
-- 2) Perform linear referencing on a metric geometry in UTM zone 51N,
--    then transform the derived geometry back to WGS84.
-- 3) Guard synchronization triggers with pg_trigger_depth() so the helper
--    functions do not recursively fire themselves.

create or replace function public.refresh_road_section_geometry(
  p_section_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section record;
  v_alignment record;
  v_start numeric;
  v_end numeric;
  v_metric geometry;
  v_geom geometry;
  v_metric_len numeric;
  v_start_pt geometry;
  v_end_pt geometry;
begin
  if not public.amanah_has_permission('master_data.projects')
     and not public.amanah_has_permission('schedule.manage') then
    raise exception 'Permission denied.';
  end if;

  select s.*, ph.project_id
    into v_section
  from public.project_sections s
  join public.project_phases ph on ph.phase_id=s.phase_id
  where s.section_id=p_section_id;

  if not found then
    raise exception 'Road section not found.';
  end if;

  select a.*
    into v_alignment
  from public.road_project_alignments a
  where a.project_id=v_section.project_id
    and a.is_active=true
  order by a.updated_at desc
  limit 1;

  if not found then
    raise exception 'Create and save the PRIMARY ROAD ALIGNMENT before defining road section geometry.';
  end if;

  v_start := coalesce(v_section.station_start_m,0);
  v_end := coalesce(v_section.station_end_m,v_alignment.length_m);

  v_metric := ST_Transform(
    ST_SetSRID(v_alignment.geometry,4326),
    32651
  );
  v_metric_len := ST_Length(v_metric);

  if v_metric_len <= 0 then
    raise exception 'Primary road alignment has zero length.';
  end if;

  if v_start < 0 or v_end <= v_start or v_end > v_metric_len + 0.001 then
    raise exception 'Road section station range % → % is outside the project alignment length of % m.',
      v_start, v_end, round(v_metric_len::numeric,3);
  end if;

  v_geom := ST_Transform(
    ST_LineSubstring(
      v_metric,
      v_start / v_metric_len,
      v_end / v_metric_len
    ),
    4326
  );

  if GeometryType(v_geom) <> 'LINESTRING' or ST_NPoints(v_geom) < 2 then
    raise exception 'Unable to derive a LineString from the project alignment for this road section.';
  end if;

  v_start_pt := ST_StartPoint(v_geom);
  v_end_pt := ST_EndPoint(v_geom);

  update public.project_sections
  set
    route_length_m = round((v_end-v_start)::numeric,3),
    geometry = ST_SetSRID(v_geom,4326),
    start_lat = ST_Y(v_start_pt),
    start_lng = ST_X(v_start_pt),
    end_lat = ST_Y(v_end_pt),
    end_lng = ST_X(v_end_pt),
    updated_at = now()
  where section_id=p_section_id;

  return jsonb_build_object(
    'section_id',p_section_id,
    'station_start_m',v_start,
    'station_end_m',v_end,
    'route_length_m',round((v_end-v_start)::numeric,3),
    'geometry',ST_AsGeoJSON(v_geom)::jsonb
  );
end;
$$;

create or replace function public.refresh_road_work_component_geometry(
  p_work_component_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_component record;
  v_alignment record;
  v_start numeric;
  v_end numeric;
  v_metric geometry;
  v_geom geometry;
  v_metric_len numeric;
begin
  if not public.amanah_has_permission('master_data.projects')
     and not public.amanah_has_permission('schedule.manage') then
    raise exception 'Permission denied.';
  end if;

  select c.*, s.station_start_m as section_start_m, s.station_end_m as section_end_m,
         ph.project_id
    into v_component
  from public.project_work_components c
  join public.project_sections s on s.section_id=c.section_id
  join public.project_phases ph on ph.phase_id=s.phase_id
  where c.work_component_id=p_work_component_id;

  if not found then
    raise exception 'Work component not found.';
  end if;

  select a.*
    into v_alignment
  from public.road_project_alignments a
  where a.project_id=v_component.project_id
    and a.is_active=true
  order by a.updated_at desc
  limit 1;

  if not found then
    raise exception 'Create and save the PRIMARY ROAD ALIGNMENT before defining work component geometry.';
  end if;

  v_start := coalesce(v_component.station_start_m,v_component.section_start_m);
  v_end := coalesce(v_component.station_end_m,v_component.section_end_m);

  v_metric := ST_Transform(
    ST_SetSRID(v_alignment.geometry,4326),
    32651
  );
  v_metric_len := ST_Length(v_metric);

  if v_metric_len <= 0 then
    raise exception 'Primary road alignment has zero length.';
  end if;

  if v_start is null or v_end is null
     or v_end <= v_start
     or v_start < v_component.section_start_m
     or v_end > v_component.section_end_m
     or v_end > v_metric_len + 0.001 then
    raise exception 'Work component station range % → % must stay inside its road section and project alignment.',
      v_start, v_end;
  end if;

  v_geom := ST_Transform(
    ST_LineSubstring(
      v_metric,
      v_start / v_metric_len,
      v_end / v_metric_len
    ),
    4326
  );

  if GeometryType(v_geom) <> 'LINESTRING' or ST_NPoints(v_geom) < 2 then
    raise exception 'Unable to derive a LineString from the project alignment for this work component.';
  end if;

  update public.project_work_components
  set
    geometry = ST_SetSRID(v_geom,4326),
    updated_at = now()
  where work_component_id=p_work_component_id;

  return jsonb_build_object(
    'work_component_id',p_work_component_id,
    'station_start_m',v_start,
    'station_end_m',v_end,
    'length_m',round(ST_Length(v_geom::geography)::numeric,3),
    'geometry',ST_AsGeoJSON(v_geom)::jsonb
  );
end;
$$;

create or replace function public.trg_refresh_alignment_dependents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.refresh_road_project_station_geometries(new.project_id);
  return new;
end;
$$;

create or replace function public.trg_refresh_section_geometry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.refresh_road_section_geometry(new.section_id);
  return new;
end;
$$;

create or replace function public.trg_refresh_component_geometry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.is_active then
    perform public.refresh_road_work_component_geometry(new.work_component_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refresh_alignment_dependents on public.road_project_alignments;
create trigger trg_refresh_alignment_dependents
after insert or update of geometry, length_m, start_lat, start_lng, end_lat, end_lng
on public.road_project_alignments
for each row
execute function public.trg_refresh_alignment_dependents();

drop trigger if exists trg_refresh_section_geometry on public.project_sections;
create trigger trg_refresh_section_geometry
after insert or update of station_start_m, station_end_m, phase_id
on public.project_sections
for each row
execute function public.trg_refresh_section_geometry();

drop trigger if exists trg_refresh_component_geometry on public.project_work_components;
create trigger trg_refresh_component_geometry
after insert or update of station_start_m, station_end_m, section_id, is_active
on public.project_work_components
for each row
execute function public.trg_refresh_component_geometry();

grant execute on function public.refresh_road_section_geometry(uuid) to authenticated;
grant execute on function public.refresh_road_work_component_geometry(uuid) to authenticated;
grant execute on function public.refresh_road_project_station_geometries(text) to authenticated;
