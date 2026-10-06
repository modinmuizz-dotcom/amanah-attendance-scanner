create or replace function public.delete_road_project_alignment(p_project_id text)
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

  update public.project_sections s
  set geometry=null,
      route_length_m=null,
      start_lat=null,
      start_lng=null,
      end_lat=null,
      end_lng=null,
      updated_at=now()
  where s.phase_id in (
    select ph.phase_id
    from public.project_phases ph
    where ph.project_id=p_project_id
  );

  update public.project_work_components c
  set geometry=null,
      updated_at=now()
  where c.section_id in (
    select s.section_id
    from public.project_sections s
    join public.project_phases ph on ph.phase_id=s.phase_id
    where ph.project_id=p_project_id
  );
end;
$$;