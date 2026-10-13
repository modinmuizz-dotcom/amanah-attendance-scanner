-- Make payroll draft line guards usable by authenticated Payroll Officers
-- and save/submit a payroll in a single atomic transaction.
begin;
create or replace function public.amanah_payroll_guard_item()
returns trigger language plpgsql security definer set search_path=public as $f$
declare v_status text;v_run uuid;
begin
 v_run:=case when tg_op='DELETE' then old.payroll_run_id else new.payroll_run_id end;
 select status into v_status from public.payroll_runs
 where payroll_run_id=v_run for update;
 if v_status is null then raise exception 'Payroll run not found';end if;
 if v_status<>'DRAFT' or not (select public.amanah_payroll_can_prepare()) then
    raise exception 'Payroll lines can be edited only by Payroll staff while the run is Draft';
 end if;
 if tg_op='DELETE' then return old;end if;
 if tg_op='UPDATE' and new.payroll_run_id is distinct from old.payroll_run_id then
   raise exception 'Cannot move payroll line to another run';
 end if;
 return new;
end $f$;

create or replace function public.amanah_payroll_create_and_submit(
 p_period_start date,
 p_period_end date,
 p_employee_items jsonb,
 p_group_items jsonb
)
returns uuid language plpgsql security definer set search_path=public as $f$
declare
 v_run uuid; v_line jsonb; v_employee_count int; v_group_count int;
 v_gross numeric:=0;v_amount numeric;v_employee_id text;v_project_id text;
 v_lines int:=0;
begin
 if auth.uid() is null or not (select public.amanah_payroll_can_prepare()) then
   raise exception 'Only authorized Payroll Officers can save payroll';
 end if;
 if p_period_start is null or p_period_end is null
    or p_period_end<p_period_start then raise exception 'Invalid payroll period'; end if;
 if jsonb_typeof(p_employee_items)<>'array' or jsonb_typeof(p_group_items)<>'array' then
   raise exception 'Payroll line arrays are required';
 end if;
 v_employee_count:=jsonb_array_length(p_employee_items);
 v_group_count:=jsonb_array_length(p_group_items);
 if v_employee_count+v_group_count<1 or v_employee_count+v_group_count>500 then
   raise exception 'Payroll must contain between 1 and 500 entries';
 end if;
 if exists(
   select 1 from (
     select value->>'employee_id' as employee_id from jsonb_array_elements(p_employee_items)
   ) e group by e.employee_id having count(*)>1
 ) then raise exception 'Duplicate employee entries in the same payroll are not allowed';end if;

 -- Validate the amounts and references before inserting anything.
 for v_line in select value from jsonb_array_elements(p_employee_items) loop
   v_employee_id:=nullif(btrim(v_line->>'employee_id'),'');
   v_amount:=round((v_line->>'gross_pay')::numeric,2);
   if v_employee_id is null or nullif(btrim(v_line->>'employee_name'),'') is null then
     raise exception 'Each employee needs an ID and name';end if;
   if not exists(select 1 from public.employees where employee_id=v_employee_id) then
     raise exception 'Payroll employee ID % does not exist',v_employee_id;end if;
   if v_amount<0 or (v_line->>'rate')::numeric<0
      or (v_line->>'full_days')::numeric<0
      or (v_line->>'half_days')::numeric<0 then
     raise exception 'Negative pay, rate or payroll days are invalid';end if;
   if abs(v_amount - round(
       (v_line->>'rate')::numeric*
       ((v_line->>'full_days')::numeric+(v_line->>'half_days')::numeric/2),2))>0.02 then
     raise exception 'Payroll for % has an inconsistent rate and gross pay',v_employee_id;end if;
   v_gross:=v_gross+v_amount;
 end loop;
 for v_line in select value from jsonb_array_elements(p_group_items) loop
   v_project_id:=nullif(btrim(v_line->>'project_id'),'');
   if v_project_id is null or not exists(
     select 1 from public.projects where project_id=v_project_id
   ) then raise exception 'Project for Group Labor is invalid: %',coalesce(v_project_id,'missing');end if;
   if nullif(btrim(v_line->>'group_name'),'') is null then
     raise exception 'Group Labor name is required';end if;
   v_amount:=round((v_line->>'gross_pay')::numeric,2);
   if (v_line->>'rate_per_meter')::numeric<=0 or (v_line->>'meters_accomplished')::numeric<=0
      or v_amount<=0 then raise exception 'Group Labor amounts must be positive';end if;
   if abs(v_amount-round((v_line->>'rate_per_meter')::numeric*(v_line->>'meters_accomplished')::numeric,2))>0.02 then
     raise exception 'Group Labor pay does not match the rate and accomplished meters';end if;
   v_gross:=v_gross+v_amount;
 end loop;
 v_gross:=round(v_gross,2);
 if v_gross<=0 then raise exception 'Payroll has no payable amount';end if;
 insert into public.payroll_runs(
   period_start,period_end,status,total_gross,employee_count
 ) values(p_period_start,p_period_end,'DRAFT',v_gross,v_employee_count)
 returning payroll_run_id into v_run;

 for v_line in select value from jsonb_array_elements(p_employee_items) loop
   insert into public.payroll_items(
     payroll_run_id,employee_id,employee_name,department,rate_type,rate,
     attendance_days,full_days,half_days,total_hours,gross_pay,attendance_ids
   ) values(
     v_run,btrim(v_line->>'employee_id'),btrim(v_line->>'employee_name'),
     v_line->>'department',coalesce(v_line->>'rate_type','DAILY'),
     round((v_line->>'rate')::numeric,2),
     coalesce((v_line->>'attendance_days')::numeric,0),
     coalesce((v_line->>'full_days')::numeric,0),
     coalesce((v_line->>'half_days')::numeric,0),
     coalesce((v_line->>'total_hours')::numeric,0),
     round((v_line->>'gross_pay')::numeric,2),
     case when jsonb_typeof(v_line->'attendance_ids')='array' then v_line->'attendance_ids'
          else '[]'::jsonb end
   );
 end loop;
 for v_line in select value from jsonb_array_elements(p_group_items) loop
   insert into public.payroll_group_items(
     payroll_run_id,project_id,group_name,activity_description,rate_per_meter,meters_accomplished,gross_pay
   ) values(
     v_run,btrim(v_line->>'project_id'),btrim(v_line->>'group_name'),
     v_line->>'activity_description',round((v_line->>'rate_per_meter')::numeric,2),
     (v_line->>'meters_accomplished')::numeric,
     round((v_line->>'gross_pay')::numeric,2)
   );
 end loop;

 -- SQL function call and all inserts share one Postgres transaction:
 -- a failure here rolls back the entire run, preventing orphan DRAFT headers.
 perform public.amanah_payroll_submit(v_run);
 return v_run;
end $f$;

revoke all on function public.amanah_payroll_create_and_submit(date,date,jsonb,jsonb) from public,anon;
grant execute on function public.amanah_payroll_create_and_submit(date,date,jsonb,jsonb) to authenticated;
commit;