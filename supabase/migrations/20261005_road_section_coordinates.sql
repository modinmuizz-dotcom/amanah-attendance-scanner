-- Add explicit geographic start/end coordinates to road sections.
alter table public.project_sections
  add column if not exists start_lat numeric,
  add column if not exists start_lng numeric,
  add column if not exists end_lat numeric,
  add column if not exists end_lng numeric;

alter table public.project_sections
  drop constraint if exists project_sections_start_lat_range;
alter table public.project_sections
  add constraint project_sections_start_lat_range
  check (start_lat is null or (start_lat between -90 and 90));

alter table public.project_sections
  drop constraint if exists project_sections_start_lng_range;
alter table public.project_sections
  add constraint project_sections_start_lng_range
  check (start_lng is null or (start_lng between -180 and 180));

alter table public.project_sections
  drop constraint if exists project_sections_end_lat_range;
alter table public.project_sections
  add constraint project_sections_end_lat_range
  check (end_lat is null or (end_lat between -90 and 90));

alter table public.project_sections
  drop constraint if exists project_sections_end_lng_range;
alter table public.project_sections
  add constraint project_sections_end_lng_range
  check (end_lng is null or (end_lng between -180 and 180));

alter table public.project_sections
  drop constraint if exists project_sections_start_coordinate_pair;
alter table public.project_sections
  add constraint project_sections_start_coordinate_pair
  check ((start_lat is null and start_lng is null) or (start_lat is not null and start_lng is not null));

alter table public.project_sections
  drop constraint if exists project_sections_end_coordinate_pair;
alter table public.project_sections
  add constraint project_sections_end_coordinate_pair
  check ((end_lat is null and end_lng is null) or (end_lat is not null and end_lng is not null));

create or replace function public.save_road_section_start_end(
  p_section_id uuid,
  p_start_lat numeric,
  p_start_lng numeric,
  p_end_lat numeric,
  p_end_lng numeric
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

  if p_start_lat is not null and (p_start_lat < -90 or p_start_lat > 90) then
    raise exception 'Invalid start latitude.';
  end if;
  if p_start_lng is not null and (p_start_lng < -180 or p_start_lng > 180) then
    raise exception 'Invalid start longitude.';
  end if;
  if p_end_lat is not null and (p_end_lat < -90 or p_end_lat > 90) then
    raise exception 'Invalid end latitude.';
  end if;
  if p_end_lng is not null and (p_end_lng < -180 or p_end_lng > 180) then
    raise exception 'Invalid end longitude.';
  end if;

  if ((p_start_lat is null) <> (p_start_lng is null)) then
    raise exception 'Start latitude and longitude must be entered together.';
  end if;
  if ((p_end_lat is null) <> (p_end_lng is null)) then
    raise exception 'End latitude and longitude must be entered together.';
  end if;

  update public.project_sections
  set start_lat=p_start_lat,start_lng=p_start_lng,end_lat=p_end_lat,end_lng=p_end_lng,updated_at=now()
  where section_id=p_section_id;

  if not found then
    raise exception 'Road section not found.';
  end if;
end;
$$;
