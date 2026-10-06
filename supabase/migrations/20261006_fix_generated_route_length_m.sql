-- AMANAH: fix project section station geometry refresh.
-- route_length_m is a generated column on public.project_sections,
-- so PostgreSQL does not allow the refresh function to assign to it.
-- It will be recalculated automatically from the section station fields.

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

  select
    s.*,
    ph.project_id
  into v_section
  from public.project_sections s
  join public.project_phases ph
    on ph.phase_id = s.phase_id
  where s.section_id = p_section_id;

  if not found then
    raise exception 'Road section not found.';
  end if;

  select a.*
  into v_alignment
  from public.road_project_alignments a
  where a.project_id = v_section.project_id
    and a.is_active = true
  order by a.updated_at desc
  limit 1;

  if not found then
    raise exception
      'Create and save the PRIMARY ROAD ALIGNMENT before defining road section geometry.';
  end if;

  v_start := coalesce(v_section.station_start_m, 0);
  v_end := coalesce(v_section.station_end_m, v_alignment.length_m);

  v_metric := ST_Transform(
    ST_SetSRID(v_alignment.geometry, 4326),
    32651
  );

  v_metric_len := ST_Length(v_metric);

  if v_metric_len <= 0 then
    raise exception 'Primary road alignment has zero length.';
  end if;

  if v_start < 0
     or v_end <= v_start
     or v_end > v_metric_len + 0.001 then
    raise exception
      'Road section station range % → % is outside the project alignment length of % m.',
      v_start,
      v_end,
      round(v_metric_len::numeric, 3);
  end if;

  v_geom := ST_Transform(
    ST_LineSubstring(
      v_metric,
      v_start / v_metric_len,
      v_end / v_metric_len
    ),
    4326
  );

  if GeometryType(v_geom) <> 'LINESTRING'
     or ST_NPoints(v_geom) < 2 then
    raise exception
      'Unable to derive a LineString from the project alignment for this road section.';
  end if;

  v_start_pt := ST_StartPoint(v_geom);
  v_end_pt := ST_EndPoint(v_geom);

  -- IMPORTANT:
  -- Do NOT update route_length_m here. It is a generated column.
  -- PostgreSQL recalculates it from station_start_m/station_end_m.
  update public.project_sections
  set
    geometry = ST_SetSRID(v_geom, 4326),
    start_lat = ST_Y(v_start_pt),
    start_lng = ST_X(v_start_pt),
    end_lat = ST_Y(v_end_pt),
    end_lng = ST_X(v_end_pt),
    updated_at = now()
  where section_id = p_section_id;

  return jsonb_build_object(
    'section_id', p_section_id,
    'station_start_m', v_start,
    'station_end_m', v_end,
    'route_length_m', round((v_end - v_start)::numeric, 3),
    'geometry', ST_AsGeoJSON(v_geom)::jsonb
  );
end;
$$;

grant execute
on function public.refresh_road_section_geometry(uuid)
to authenticated;
