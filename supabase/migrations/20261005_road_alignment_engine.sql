-- AMANAH Road Alignment Engine
-- One authoritative project-level alignment stored as PostGIS LineString.
-- Sections/components remain independently mappable below this alignment.

create table if not exists public.road_project_alignments (
  alignment_id uuid primary key default gen_random_uuid(),
  project_id text not null unique references public.projects(project_id) on delete cascade,
  alignment_name text not null default 'PRIMARY ROAD ALIGNMENT',
  geometry geometry(LineString,4326) not null,
  length_m numeric(14,3) not null default 0,
  start_lat numeric,
  start_lng numeric,
  end_lat numeric,
  end_lng numeric,
  source text not null default 'FREE_DRAW'
    check (source in ('FREE_DRAW','ROAD_MATCHED','IMPORTED','SURVEY')),
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_road_project_alignments_geometry
  on public.road_project_alignments using gist(geometry);

create index if not exists idx_road_project_alignments_project
  on public.road_project_alignments(project_id);

alter table public.road_project_alignments enable row level security;

drop policy if exists road_project_alignments_select on public.road_project_alignments;
create policy road_project_alignments_select
  on public.road_project_alignments for select to authenticated
  using (
    public.amanah_has_permission('master_data.projects')
    or public.amanah_has_permission('schedule.view')
  );

drop policy if exists road_project_alignments_insert on public.road_project_alignments;
create policy road_project_alignments_insert
  on public.road_project_alignments for insert to authenticated
  with check (public.amanah_has_permission('master_data.projects'));

drop policy if exists road_project_alignments_update on public.road_project_alignments;
create policy road_project_alignments_update
  on public.road_project_alignments for update to authenticated
  using (public.amanah_has_permission('master_data.projects'))
  with check (public.amanah_has_permission('master_data.projects'));

drop policy if exists road_project_alignments_delete on public.road_project_alignments;
create policy road_project_alignments_delete
  on public.road_project_alignments for delete to authenticated
  using (public.amanah_has_permission('master_data.projects'));

grant select, insert, update, delete on public.road_project_alignments to authenticated;

create or replace function public.save_road_project_alignment(
  p_project_id text,
  p_geojson jsonb,
  p_source text default 'FREE_DRAW'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_geom geometry;
  v_length numeric(14,3);
  v_start geometry;
  v_end geometry;
  v_alignment_id uuid;
  v_source text;
begin
  if not public.amanah_has_permission('master_data.projects') then
    raise exception 'Permission denied.';
  end if;

  if p_geojson is null then
    raise exception 'Alignment geometry is required.';
  end if;

  v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson),4326);

  if GeometryType(v_geom) <> 'LINESTRING' then
    raise exception 'Project alignment must be a LineString.';
  end if;

  if ST_NPoints(v_geom) < 2 then
    raise exception 'Project alignment requires at least two points.';
  end if;

  if ST_IsEmpty(v_geom) or not ST_IsValid(v_geom) then
    raise exception 'Project alignment geometry is invalid.';
  end if;

  if not exists (
    select 1 from public.projects
    where project_id=p_project_id
      and project_type='CONCRETING OF ROAD'
  ) then
    raise exception 'Road project not found.';
  end if;

  v_length := round(ST_Length(v_geom::geography)::numeric,3);
  v_start := ST_StartPoint(v_geom);
  v_end := ST_EndPoint(v_geom);
  v_source := upper(coalesce(nullif(p_source,''),'FREE_DRAW'));

  if v_source not in ('FREE_DRAW','ROAD_MATCHED','IMPORTED','SURVEY') then
    v_source := 'FREE_DRAW';
  end if;

  insert into public.road_project_alignments (
    project_id, alignment_name, geometry, length_m,
    start_lat, start_lng, end_lat, end_lng, source,
    is_active, created_by, updated_at
  )
  values (
    p_project_id, 'PRIMARY ROAD ALIGNMENT', v_geom, v_length,
    ST_Y(v_start), ST_X(v_start), ST_Y(v_end), ST_X(v_end), v_source,
    true, auth.uid(), now()
  )
  on conflict (project_id) do update set
    geometry=excluded.geometry,
    length_m=excluded.length_m,
    start_lat=excluded.start_lat,
    start_lng=excluded.start_lng,
    end_lat=excluded.end_lat,
    end_lng=excluded.end_lng,
    source=excluded.source,
    is_active=true,
    updated_at=now()
  returning alignment_id into v_alignment_id;

  return jsonb_build_object(
    'alignment_id',v_alignment_id,
    'length_m',v_length,
    'source',v_source,
    'geometry',ST_AsGeoJSON(v_geom)::jsonb
  );
end;
$$;

create or replace function public.delete_road_project_alignment(
  p_project_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.amanah_has_permission('master_data.projects') then
    raise exception 'Permission denied.';
  end if;

  delete from public.road_project_alignments
  where project_id=p_project_id;
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
  'alignment',
    coalesce((
      select jsonb_build_object(
        'alignment_id',a.alignment_id,
        'alignment_name',a.alignment_name,
        'length_m',a.length_m,
        'start_lat',a.start_lat,
        'start_lng',a.start_lng,
        'end_lat',a.end_lat,
        'end_lng',a.end_lng,
        'source',a.source,
        'geometry',ST_AsGeoJSON(a.geometry)::jsonb
      )
      from road_project_alignments a
      where a.project_id=p_project_id and a.is_active=true
      limit 1
    ), null),
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

comment on table public.road_project_alignments is
  'Authoritative project-level road alignment. PostGIS LineString used for stationing, sectioning and progress mapping.';
