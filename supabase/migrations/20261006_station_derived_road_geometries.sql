-- AMANAH: derive Road Section and Work Component geometry from the Primary Road Alignment.
-- Station ranges are now the source of truth; stored geometries are generated views of the master alignment.

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
  v_len numeric;
  v_geom geometry;
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

  v_len := v_alignment.length_m;
  v_start := coalesce(v_section.station_start_m,0);
  v_end := coalesce(v_section.station_end_m,v_len);

  if v_start < 0 or v_end <= v_start or v_end > v_len + 0.001 then
    raise exception 'Road section station range % → % is outside the project alignment length of % m.',
      v_start, v_end, v_len;
  end if;

  v_geom := ST_LineSubstring(
    v_alignment.geometry::geography,
    v_start / v_len,
    v_end / v_len
  )::geometry;

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
  v_section record;
  v_start numeric;
  v_end numeric;
  v_len numeric;
  v_geom geometry;
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

  v_len := v_alignment.length_m;
  v_start := coalesce(v_component.station_start_m,v_component.section_start_m);
  v_end := coalesce(v_component.station_end_m,v_component.section_end_m);

  if v_start is null or v_end is null
     or v_end <= v_start
     or v_start < v_component.section_start_m
     or v_end > v_component.section_end_m
     or v_end > v_len + 0.001 then
    raise exception 'Work component station range % → % must stay inside its road section and project alignment.',
      v_start, v_end;
  end if;

  v_geom := ST_LineSubstring(
    v_alignment.geometry::geography,
    v_start / v_len,
    v_end / v_len
  )::geometry;

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

create or replace function public.refresh_road_project_station_geometries(
  p_project_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section record;
  v_component record;
  v_sections integer := 0;
  v_components integer := 0;
begin
  if not public.amanah_has_permission('master_data.projects')
     and not public.amanah_has_permission('schedule.manage') then
    raise exception 'Permission denied.';
  end if;

  for v_section in
    select s.section_id
    from public.project_sections s
    join public.project_phases ph on ph.phase_id=s.phase_id
    where ph.project_id=p_project_id
    order by s.station_start_m, s.created_at
  loop
    perform public.refresh_road_section_geometry(v_section.section_id);
    v_sections := v_sections + 1;
  end loop;

  for v_component in
    select c.work_component_id
    from public.project_work_components c
    join public.project_sections s on s.section_id=c.section_id
    join public.project_phases ph on ph.phase_id=s.phase_id
    where ph.project_id=p_project_id
      and c.is_active=true
    order by c.sort_order, c.created_at
  loop
    perform public.refresh_road_work_component_geometry(v_component.work_component_id);
    v_components := v_components + 1;
  end loop;

  return jsonb_build_object(
    'project_id',p_project_id,
    'sections_refreshed',v_sections,
    'components_refreshed',v_components
  );
end;
$$;

grant execute on function public.refresh_road_section_geometry(uuid) to authenticated;
grant execute on function public.refresh_road_work_component_geometry(uuid) to authenticated;
grant execute on function public.refresh_road_project_station_geometries(text) to authenticated;
