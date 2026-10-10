-- Correct approved lump-sum labor classification and Philippine cost date.
-- Both direct-labor groups and labor subcontractors are LABOR expenses.
create or replace function public.amanah_lump_post_approved_cost()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare v_project text;v_kind text;v_title text;v_party text;
begin
 if new.status='APPROVED' and old.status is distinct from 'APPROVED' then
  select project_id,contract_type,scope_title,contractor_name
  into v_project,v_kind,v_title,v_party from public.amanah_lump_contracts where id=new.contract_id;
  insert into public.project_cost_entries(project_id,cost_date,cost_type,description,
     quantity,unit,unit_cost,amount,reference_id,notes)
  values (v_project,(now() at time zone 'Asia/Manila')::date,'LABOR',
     'LUMP SUM '||v_kind||' - '||v_title||' / '||v_party||' - '||new.milestone,
     1,'BILLING',new.gross_amount,new.gross_amount,'LUMP-SUM:'||new.id::text,
     'GM-approved certified contract labor. Cash payments, advances, retention and withholding are recorded separately.')
  on conflict (reference_id) where (reference_id like 'LUMP-SUM:%')
  do nothing;
 end if;
 return new;
end $fn$;
