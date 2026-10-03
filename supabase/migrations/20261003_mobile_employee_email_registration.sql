begin;

create unique index if not exists employees_email_unique_lower_idx
  on public.employees (lower(trim(email)))
  where email is not null and trim(email) <> '';

create or replace function public.link_my_employee_mobile_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text;
  v_employee_id text;
  v_existing_employee_id text;
  v_existing_auth_user_id uuid;
begin
  if v_auth_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'You must be signed in.'
    );
  end if;

  select lower(trim(email))
    into v_email
  from auth.users
  where id = v_auth_user_id;

  if v_email is null or v_email = '' then
    return jsonb_build_object(
      'success', false,
      'error', 'Your Supabase account does not have an email address.'
    );
  end if;

  select e.employee_id
    into v_employee_id
  from public.employees e
  where lower(trim(coalesce(e.email, ''))) = v_email
    and upper(trim(coalesce(e.status, ''))) = 'ACTIVE'
    and lower(trim(coalesce(e.position, ''))) in (
      'driver',
      'operator',
      'driver/operator',
      'driver / operator'
    )
  limit 1;

  if v_employee_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'This email is not registered to an active Driver / Operator in AMANAH Employee Master Data.'
    );
  end if;

  select employee_id, auth_user_id
    into v_existing_employee_id, v_existing_auth_user_id
  from public.employee_auth_accounts
  where employee_id = v_employee_id
     or auth_user_id = v_auth_user_id
  limit 1;

  if v_existing_employee_id is not null then
    if v_existing_auth_user_id = v_auth_user_id
       and v_existing_employee_id = v_employee_id then
      return jsonb_build_object(
        'success', true,
        'employee_id', v_employee_id,
        'already_linked', true
      );
    end if;

    return jsonb_build_object(
      'success', false,
      'error', 'This employee already has an AMANAH mobile account. Use that account or the password reset process.'
    );
  end if;

  insert into public.employee_auth_accounts (
    auth_user_id,
    employee_id,
    mobile_access_enabled
  )
  values (
    v_auth_user_id,
    v_employee_id,
    true
  );

  return jsonb_build_object(
    'success', true,
    'employee_id', v_employee_id,
    'already_linked', false
  );
end;
$function$;

grant execute on function public.link_my_employee_mobile_account() to authenticated;

commit;