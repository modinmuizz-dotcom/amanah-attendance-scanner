-- Interactive Road Project Map
-- Stores the real-world road/section/component alignments in PostGIS
-- and exposes controlled RPCs for the AMANAH Road Project map UI.

create or replace function public.save_road_section_geometry(
  p_section_id uuid,
  p_geojson jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id text;
  v_geom geometry;
begin
  if not amanah_has_permission('master_data.projects') then
    raise exception 'Permission denied.';
  end if;

  if p_geojson is null then
    v_geom := null;
  else
    v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson),4326);
    if GeometryType(v_geom) <> 'LINESTRING' then
      raise exception 'Road section geometry must be a LineString.';
    end if;
    if ST_NPoints(v_geom) < 2 then
      raise exception 'Road section geometry requires at least two points.';
    end if;
  end if;

  select p.project_id into v_project_id
  from project_sections s
  join project_phases ph on ph.phase_id=s.phase_id
  join projects p on p.project_id=ph.project_id
  where s.section_id=p_section_id;

  if v_project_id is null then
    raise exception 'Road section not found.';
  end if;

  update project_sections
  set geometry=v_geom, updated_at=now()
  where section_id=p_section_id;
end;
$$;

create or replace function public.save_road_work_component_geometry(
  p_work_component_id uuid,
  p_geojson jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id text;
  v_geom geometry;
begin
  if not amanah_has_permission('master_data.projects') then
    raise exception 'Permission denied.';
  end if;

  if p_geojson is null then
    v_geom := null;
  else
    v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson),4326);
    if GeometryType(v_geom) <> 'LINESTRING' then
      raise exception 'Work component geometry must be a LineString.';
    end if;
    if ST_NPoints(v_geom) < 2 then
      raise exception 'Work component geometry requires at least two points.';
    end if;
  end if;

  select p.project_id into v_project_id
  from project_work_components c
  join project_sections s on s.section_id=c.section_id
  join project_phases ph on ph.phase_id=s.phase_id
  join projects p on p.project_id=ph.project_id
  where c.work_component_id=p_work_component_id;

  if v_project_id is null then
    raise exception 'Work component not found.';
  end if;

  update project_work_components
  set geometry=v_geom, updated_at=now()
  where work_component_id=p_work_component_id;
end;
$$;

create or replace function public.save_road_project_map_center(
  p_project_id text,
  p_map_lat numeric,
  p_map_lng numeric,
  p_map_zoom integer,
  p_project_details jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not amanah_has_permission('master_data.projects') then
    raise exception 'Permission denied.';
  end if;

  if p_map_lat is null or p_map_lng is null then
    raise exception 'Map latitude and longitude are required.';
  end if;

  if p_map_lat < -90 or p_map_lat > 90 or p_map_lng < -180 or p_map_lng > 180 then
    raise exception 'Invalid map coordinates.';
  end if;

  update projects
  set project_details=coalesce(p_project_details,'{}'::jsonb),
      updated_at=now()
  where project_id=p_project_id
    and project_type='CONCRETING OF ROAD';

  if not found then
    raise exception 'Road project not found.';
  end if;
end;
$$;

create or replace function public.get_road_project_map_data(p_project_id text)
returns jsonb
language sql
security definer
set search_path = public
as $$
select jsonb_build_object(
  'project',
    coalesce((
      select jsonb_build_object(
        'project_id',p.project_id,
        'project_name',p.project_name,
        'location',p.location,
        'project_type',p.project_type,
        'project_details',coalesce(p.project_details,'{}'::jsonb)
      )
      from projects p
      where p.project_id=p_project_id
    ), '{}'::jsonb),
  'phases',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'phase_id',ph.phase_id,
        'phase_code',ph.phase_code,
        'phase_name',ph.phase_name,
        'status',ph.status,
        'sequence_no',ph.sequence_no
      ) order by ph.sequence_no)
      from project_phases ph
      where ph.project_id=p_project_id
    ),'[]'::jsonb),
  'sections',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'section_id',s.section_id,
        'phase_id',s.phase_id,
        'section_code',s.section_code,
        'section_name',s.section_name,
        'station_start_m',s.station_start_m,
        'station_end_m',s.station_end_m,
        'route_length_m',s.route_length_m,
        'status',s.status,
        'geometry',case when s.geometry is null then null else ST_AsGeoJSON(s.geometry)::jsonb end
      ) order by s.station_start_m,s.created_at)
      from project_sections s
      join project_phases ph on ph.phase_id=s.phase_id
      where ph.project_id=p_project_id
    ),'[]'::jsonb),
  'components',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'work_component_id',c.work_component_id,
        'section_id',c.section_id,
        'component_type',c.component_type,
        'component_side',c.component_side,
        'component_name',c.component_name,
        'station_start_m',c.station_start_m,
        'station_end_m',c.station_end_m,
        'planned_quantity',c.planned_quantity,
        'quantity_unit',c.quantity_unit,
        'status',c.status,
        'is_optional',c.is_optional,
        'is_active',c.is_active,
        'geometry',case when c.geometry is null then null else ST_AsGeoJSON(c.geometry)::jsonb end
      ) order by c.sort_order,c.created_at)
      from project_work_components c
      join project_sections s on s.section_id=c.section_id
      join project_phases ph on ph.phase_id=s.phase_id
      where ph.project_id=p_project_id and c.is_active=true
    ),'[]'::jsonb)
);
$$;
