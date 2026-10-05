-- Store the responsible labor group/person for activity types
-- such as CONCRETE POURING and ROAD EMBANKMENT.

alter table public.project_activities
add column if not exists group_labor_in_charge text;

comment on column public.project_activities.group_labor_in_charge
is 'Name or identifier of the labor group/person in charge for activities such as CONCRETE POURING and ROAD EMBANKMENT.';
