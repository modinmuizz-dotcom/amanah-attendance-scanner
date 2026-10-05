-- Fix RLS permission checks being treated as read-only transactions.
-- amanah_has_permission() is used directly inside RLS policies, so it must
-- never perform INSERT/UPDATE/DELETE work.

create or replace function public.amanah_has_permission(p_permission_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    return false;
  end if;

  return exists(
    select 1
    from public.amanah_user_roles ur
    join public.amanah_role_permissions rp on rp.role_id = ur.role_id
    join public.amanah_permissions p on p.permission_id = rp.permission_id
    where ur.auth_user_id = auth.uid()
      and p.permission_key = p_permission_key
  );
end
$function$;
