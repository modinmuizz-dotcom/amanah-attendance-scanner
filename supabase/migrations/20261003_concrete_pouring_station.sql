begin;

alter table public.project_activities
  add column if not exists pouring_station text;

comment on column public.project_activities.pouring_station is
  'Concrete pouring station/location range entered by engineer, e.g. STA. 0+120 TO STA. 0+180.';

commit;