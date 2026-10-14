-- Optional project assignment for manual / non-scanning employees.
-- Existing payroll lines keep their old project mapping via attendance.
BEGIN;
ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.projects(project_id);

CREATE OR REPLACE FUNCTION public.amanah_sync_paid_employee_project_cost(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
DECLARE
  v_item record;
  v_paid record;
  v_cents bigint;
  r record;
  v_reference text;
BEGIN
  SELECT i.payroll_item_id,i.payroll_run_id,i.employee_id,i.employee_name,
         i.rate_type,i.attendance_ids,i.project_id,pr.status
    INTO v_item
    FROM public.payroll_items i
    JOIN public.payroll_runs pr ON pr.payroll_run_id=i.payroll_run_id
   WHERE i.payroll_item_id=p_item_id;

  IF NOT FOUND OR v_item.status <> 'APPROVED' THEN RETURN; END IF;

  SELECT c.id,c.amount,c.released_on,c.payment_reference
    INTO v_paid FROM public.payroll_paycheck_claims c
   WHERE c.payroll_item_id=p_item_id;

  IF NOT FOUND OR coalesce(v_paid.amount,0)<=0 THEN RETURN; END IF;
  v_cents := round(v_paid.amount*100)::bigint;

  FOR r IN
    WITH attendance_ids AS (
      SELECT DISTINCT x.id
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_item.attendance_ids)='array'
             THEN v_item.attendance_ids ELSE '[]'::jsonb END
      ) AS x(id)
    ), project_weights AS (
      SELECT a.project_id,
             SUM(CASE WHEN v_item.rate_type='DAILY' THEN 1::numeric
                      ELSE greatest(coalesce(a.total_hours,0),0)::numeric
                  END) AS raw_weight
      FROM attendance_ids refs
      JOIN public.attendance a ON a.attendance_id=refs.id
      JOIN public.projects proj ON proj.project_id=a.project_id
      WHERE a.employee_id=v_item.employee_id
        AND upper(coalesce(a.status,''))='COMPLETED'
        AND nullif(btrim(coalesce(a.project_id,'')),'') IS NOT NULL
      GROUP BY a.project_id
    ), weights AS (
      SELECT project_id,
             CASE WHEN raw_weight>0 THEN raw_weight ELSE 1::numeric END AS weight
      FROM project_weights
    ), final_weights AS (
      -- For manually entered workers, charge only the explicitly selected project.
      -- Normal attendance-based employees keep proportional allocation.
      SELECT project_id,weight FROM weights WHERE v_item.project_id IS NULL
      UNION ALL
      SELECT v_item.project_id,1::numeric
      WHERE v_item.project_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.projects WHERE project_id=v_item.project_id)
    ), fractions AS (
      SELECT project_id,
             floor(v_cents::numeric * weight /
                   nullif(sum(weight) OVER(),0))::bigint AS base_cents,
             (v_cents::numeric * weight /
                   nullif(sum(weight) OVER(),0)) -
               floor(v_cents::numeric * weight /
                   nullif(sum(weight) OVER(),0)) AS fractional_part
      FROM final_weights
    ), allocations AS (
      SELECT project_id,base_cents,
             row_number() OVER (ORDER BY fractional_part DESC,project_id) AS rank,
             v_cents-sum(base_cents) OVER () AS remaining_cents
      FROM fractions
    )
    SELECT project_id,
           (base_cents+CASE WHEN rank<=remaining_cents THEN 1 ELSE 0 END)::numeric/100 AS amount
    FROM allocations
  LOOP
    IF r.amount > 0 THEN
      v_reference := 'PAYROLL-EMPLOYEE:'||v_paid.id::text||':'||r.project_id;
      INSERT INTO public.project_cost_entries (
        project_id,cost_date,cost_type,description,
        quantity,unit,unit_cost,amount,reference_id,notes
      ) VALUES (
        r.project_id,v_paid.released_on,'LABOR',
        'Paid payroll - '||v_item.employee_name,
        1,'PAYCHECK',r.amount,r.amount,v_reference,
        'Released on '||v_paid.released_on::text||
        ' • Payment ref: '||v_paid.payment_reference||
        ' • Payroll run: '||v_item.payroll_run_id::text||
        ' • Allocated from linked attendance by project'
      )
      ON CONFLICT (reference_id) WHERE (reference_id LIKE 'PAYROLL-EMPLOYEE:%')
      DO UPDATE SET
        project_id=EXCLUDED.project_id,cost_date=EXCLUDED.cost_date,
        cost_type='LABOR',description=EXCLUDED.description,
        quantity=EXCLUDED.quantity,unit='PAYCHECK',
        unit_cost=EXCLUDED.unit_cost,amount=EXCLUDED.amount,notes=EXCLUDED.notes;
    END IF;
  END LOOP;
END;
$body$;

CREATE OR REPLACE FUNCTION public.amanah_payroll_create_and_submit(p_period_start date, p_period_end date, p_employee_items jsonb, p_group_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   -- Manual (unscanned) workers may explicitly charge their pay to a project.
   -- Office/overhead payroll can remain without a project.
   v_project_id:=nullif(btrim(coalesce(v_line->>'project_id','')),'');
   if v_project_id is not null and not exists(
      select 1 from public.projects where project_id=v_project_id
   ) then
     raise exception 'Invalid project assignment for employee %',v_employee_id;
   end if;
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
     attendance_days,full_days,half_days,total_hours,gross_pay,attendance_ids,project_id
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
          else '[]'::jsonb end,
     nullif(btrim(coalesce(v_line->>'project_id','')),'')
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
end $function$;

COMMIT;
