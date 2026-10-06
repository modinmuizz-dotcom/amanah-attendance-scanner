-- AMANAH station geometry smoke test
-- Run AFTER applying 20261006_station_geometry_final_fix.
-- This is read-only.

select to_regprocedure('public.refresh_road_section_geometry(uuid)') as section_rpc,
       to_regprocedure('public.refresh_road_work_component_geometry(uuid)') as component_rpc,
       to_regprocedure('public.refresh_road_project_station_geometries(text)') as project_rpc;

select a.project_id,
       round(a.length_m,2) as alignment_length_m,
       ST_GeometryType(a.geometry) as alignment_geometry_type,
       ST_NPoints(a.geometry) as alignment_points,
       count(distinct s.section_id) as section_count,
       count(distinct c.work_component_id) as component_count
from public.road_project_alignments a
left join public.project_phases ph on ph.project_id=a.project_id
left join public.project_sections s on s.phase_id=ph.phase_id
left join public.project_work_components c on c.section_id=s.section_id and c.is_active=true
where a.project_id='TEST ID 2'
group by a.project_id,a.length_m,a.geometry;

select s.section_code,
       s.station_start_m,
       s.station_end_m,
       s.route_length_m,
       ST_GeometryType(s.geometry) as geometry_type,
       case when s.geometry is null then 0 else ST_NPoints(s.geometry) end as point_count
from public.project_sections s
join public.project_phases ph on ph.phase_id=s.phase_id
where ph.project_id='TEST ID 2'
order by s.station_start_m;

select c.component_name,
       c.component_side,
       c.station_start_m,
       c.station_end_m,
       c.planned_quantity,
       c.quantity_unit,
       ST_GeometryType(c.geometry) as geometry_type,
       case when c.geometry is null then 0 else ST_NPoints(c.geometry) end as point_count
from public.project_work_components c
join public.project_sections s on s.section_id=c.section_id
join public.project_phases ph on ph.phase_id=s.phase_id
where ph.project_id='TEST ID 2'
  and c.is_active=true
order by c.sort_order,c.created_at;
