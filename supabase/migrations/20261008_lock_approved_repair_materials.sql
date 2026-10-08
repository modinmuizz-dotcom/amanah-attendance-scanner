-- AMANAH: lock Repair Request material/spare-part lines after GM approval.
-- Maintenance may prepare/edit these lines while the request is DRAFT/RETURNED.
-- Once status reaches PENDING APPROVAL or APPROVED (and later workflow states),
-- the original repair-request materials must remain unchanged.

create or replace function public.amanah_lock_approved_repair_materials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select upper(coalesce(status,''))
    into v_status
  from public.repair_requests
  where repair_request_id = coalesce(new.repair_request_id, old.repair_request_id);

  if v_status not in ('DRAFT','RETURNED') then
    raise exception
      'Repair materials are locked after GM approval/submission. Return the Repair Request to DRAFT/RETURNED before changing materials.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_lock_approved_repair_materials_update on public.repair_request_items;
create trigger trg_lock_approved_repair_materials_update
before update on public.repair_request_items
for each row
execute function public.amanah_lock_approved_repair_materials();

drop trigger if exists trg_lock_approved_repair_materials_delete on public.repair_request_items;
create trigger trg_lock_approved_repair_materials_delete
before delete on public.repair_request_items
for each row
execute function public.amanah_lock_approved_repair_materials();

drop trigger if exists trg_lock_approved_repair_materials_insert on public.repair_request_items;
create trigger trg_lock_approved_repair_materials_insert
before insert on public.repair_request_items
for each row
execute function public.amanah_lock_approved_repair_materials();
