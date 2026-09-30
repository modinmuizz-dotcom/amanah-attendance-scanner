-- AMANAH Roles & Permissions
create table if not exists public.amanah_roles (
  role_id uuid primary key default gen_random_uuid(),
  role_name text not null unique,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.amanah_permissions (
  permission_id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  module text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.amanah_role_permissions (
  role_id uuid not null references public.amanah_roles(role_id) on delete cascade,
  permission_id uuid not null references public.amanah_permissions(permission_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(role_id, permission_id)
);

create table if not exists public.amanah_user_directory (
  auth_user_id uuid primary key,
  email text not null unique,
  display_name text,
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.amanah_user_roles (
  auth_user_id uuid not null references public.amanah_user_directory(auth_user_id) on delete cascade,
  role_id uuid not null references public.amanah_roles(role_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(auth_user_id, role_id)
);

create index if not exists amanah_role_permissions_role_idx on public.amanah_role_permissions(role_id);
create index if not exists amanah_user_roles_role_idx on public.amanah_user_roles(role_id);

insert into public.amanah_permissions(permission_key,module,action,description) values
('dashboard.view','Dashboard','VIEW','Open the AMANAH dashboard'),
('master_data.employees','Master Data','EMPLOYEES','View and manage employee master data'),
('master_data.equipment','Master Data','EQUIPMENT','View and manage equipment master data'),
('master_data.projects','Master Data','PROJECTS','View and manage project master data'),
('master_data.suppliers','Master Data','SUPPLIERS','View and manage supplier master data'),
('roles.manage','Roles & Permissions','MANAGE','Create roles and assign permissions'),
('schedule.view','Activity Calendar','VIEW','View scheduled project activities'),
('schedule.manage','Activity Calendar','MANAGE','Create, edit, update and delete scheduled activities'),
('attendance.view','Attendance','VIEW','View attendance records'),
('attendance.manage','Attendance','MANAGE','Manage attendance records where applicable'),
('activities.view','Activities on Site','VIEW','View driver/operator site activities and evidence'),
('payroll.view','Payroll','VIEW','View and calculate payroll'),
('payroll.manage','Payroll','MANAGE','Save and manage payroll runs'),
('maintenance.view','Maintenance','VIEW','View preventive maintenance records'),
('maintenance.manage','Maintenance','MANAGE','Create and manage preventive maintenance'),
('repairs.view','Repair Requests','VIEW','View repair requests and evidence'),
('repairs.manage','Repair Requests','MANAGE','Prepare, review, approve and manage repair requests'),
('equipment_history.view','Equipment History','VIEW','View equipment operating and maintenance history'),
('materials.view','Materials & Inventory','VIEW','View material estimates and inventory'),
('materials.manage','Materials & Inventory','MANAGE','Manage material estimates and inventory'),
('purchasing.view','Purchasing','VIEW','View purchasing transactions'),
('purchasing.manage','Purchasing','MANAGE','Create and manage purchasing transactions'),
('reports.view','Reports','VIEW','View AMANAH reports')
on conflict(permission_key) do update set module=excluded.module,action=excluded.action,description=excluded.description;

insert into public.amanah_roles(role_name,description,is_system) values
('SUPER ADMIN','Full system access and security administration.',true),
('ADMINISTRATOR','Master data and general administration.',true),
('PROJECT MANAGEMENT','Project planning, activities and project cost visibility.',true),
('SITE ENGINEER','Site activity, project scheduling and equipment monitoring.',true),
('HR / PAYROLL','Employee, attendance and payroll administration.',true),
('PROCUREMENT','Suppliers, purchasing and material management.',true),
('MAINTENANCE','Equipment maintenance, repairs and history.',true),
('OPERATIONS','Attendance, site activities and equipment operations.',true)
on conflict(role_name) do update set description=excluded.description,is_system=true,updated_at=now();

do $$
declare
  r_super uuid; r_admin uuid; r_pm uuid; r_site uuid; r_hr uuid; r_proc uuid; r_maint uuid; r_ops uuid;
begin
  select role_id into r_super from public.amanah_roles where role_name='SUPER ADMIN';
  select role_id into r_admin from public.amanah_roles where role_name='ADMINISTRATOR';
  select role_id into r_pm from public.amanah_roles where role_name='PROJECT MANAGEMENT';
  select role_id into r_site from public.amanah_roles where role_name='SITE ENGINEER';
  select role_id into r_hr from public.amanah_roles where role_name='HR / PAYROLL';
  select role_id into r_proc from public.amanah_roles where role_name='PROCUREMENT';
  select role_id into r_maint from public.amanah_roles where role_name='MAINTENANCE';
  select role_id into r_ops from public.amanah_roles where role_name='OPERATIONS';

  delete from public.amanah_role_permissions;

  insert into public.amanah_role_permissions(role_id,permission_id)
    select r_super,permission_id from public.amanah_permissions;

  insert into public.amanah_role_permissions(role_id,permission_id)
    select r_admin,permission_id from public.amanah_permissions
    where permission_key in ('dashboard.view','master_data.employees','master_data.equipment','master_data.projects','master_data.suppliers','attendance.view','activities.view','payroll.view','reports.view');

  insert into public.amanah_role_permissions(role_id,permission_id)
    select r_pm,permission_id from public.amanah_permissions
    where permission_key in ('dashboard.view','master_data.projects','schedule.view','schedule.manage','materials.view','materials.manage','reports.view');

  insert into public.amanah_role_permissions(role_id,permission_id)
    select r_site,permission_id from public.amanah_permissions
    where permission_key in ('dashboard.view','schedule.view','schedule.manage','activities.view','master_data.equipment','equipment_history.view','repairs.view','repairs.manage','reports.view');

  insert into public.amanah_role_permissions(role_id,permission_id)
    select r_hr,permission_id from public.amanah_permissions
    where permission_key in ('dashboard.view','master_data.employees','attendance.view','payroll.view','payroll.manage','reports.view');

  insert into public.amanah_role_permissions(role_id,permission_id)
    select r_proc,permission_id from public.amanah_permissions
    where permission_key in ('dashboard.view','master_data.suppliers','materials.view','materials.manage','purchasing.view','purchasing.manage','reports.view');

  insert into public.amanah_role_permissions(role_id,permission_id)
    select r_maint,permission_id from public.amanah_permissions
    where permission_key in ('dashboard.view','master_data.equipment','maintenance.view','maintenance.manage','repairs.view','repairs.manage','equipment_history.view','reports.view');

  insert into public.amanah_role_permissions(role_id,permission_id)
    select r_ops,permission_id from public.amanah_permissions
    where permission_key in ('dashboard.view','attendance.view','activities.view','master_data.equipment','equipment_history.view');
end $$;

create or replace function public.amanah_is_super_admin()
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then return false; end if;
  if not exists(select 1 from public.amanah_user_roles) then return true; end if;
  return exists(
    select 1 from public.amanah_user_roles ur
    join public.amanah_roles r on r.role_id=ur.role_id
    where ur.auth_user_id=auth.uid() and upper(r.role_name)='SUPER ADMIN'
  );
end $$;

create or replace function public.amanah_register_current_user()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid();
  v_email text := coalesce(auth.jwt()->>'email','');
  v_name text := coalesce(auth.jwt()->'user_metadata'->>'full_name',auth.jwt()->'user_metadata'->>'name',split_part(v_email,'@',1));
  v_super_role uuid;
  v_role_assigned boolean := false;
begin
  if v_user is null then raise exception 'Authentication is required.'; end if;

  insert into public.amanah_user_directory(auth_user_id,email,display_name,active,last_seen_at,updated_at)
  values(v_user,v_email,v_name,true,now(),now())
  on conflict(auth_user_id) do update set
    email=excluded.email,
    display_name=coalesce(excluded.display_name,public.amanah_user_directory.display_name),
    active=true,last_seen_at=now(),updated_at=now();

  if not exists(select 1 from public.amanah_user_roles) then
    select role_id into v_super_role from public.amanah_roles where upper(role_name)='SUPER ADMIN' limit 1;
    if v_super_role is not null then
      insert into public.amanah_user_roles(auth_user_id,role_id) values(v_user,v_super_role) on conflict do nothing;
      v_role_assigned := true;
    end if;
  end if;

  return jsonb_build_object('auth_user_id',v_user,'email',v_email,'display_name',v_name,'bootstrapped_super_admin',v_role_assigned);
end $$;

create or replace function public.amanah_get_current_permissions()
returns table(permission_key text)
language plpgsql security definer set search_path=public as $$
begin
  perform public.amanah_register_current_user();
  return query
  select distinct p.permission_key
  from public.amanah_user_roles ur
  join public.amanah_role_permissions rp on rp.role_id=ur.role_id
  join public.amanah_permissions p on p.permission_id=rp.permission_id
  where ur.auth_user_id=auth.uid()
  order by p.permission_key;
end $$;

create or replace function public.amanah_get_current_role()
returns text language plpgsql security definer set search_path=public as $$
begin
  perform public.amanah_register_current_user();
  return coalesce((
    select r.role_name from public.amanah_user_roles ur
    join public.amanah_roles r on r.role_id=ur.role_id
    where ur.auth_user_id=auth.uid()
    order by case when upper(r.role_name)='SUPER ADMIN' then 0 else 1 end,r.role_name
    limit 1
  ),'UNASSIGNED');
end $$;

create or replace function public.amanah_has_permission(p_permission_key text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform public.amanah_register_current_user();
  return exists(
    select 1
    from public.amanah_user_roles ur
    join public.amanah_role_permissions rp on rp.role_id=ur.role_id
    join public.amanah_permissions p on p.permission_id=rp.permission_id
    where ur.auth_user_id=auth.uid() and p.permission_key=p_permission_key
  );
end $$;

alter table public.amanah_roles enable row level security;
alter table public.amanah_permissions enable row level security;
alter table public.amanah_role_permissions enable row level security;
alter table public.amanah_user_directory enable row level security;
alter table public.amanah_user_roles enable row level security;

drop policy if exists amanah_roles_select on public.amanah_roles;
create policy amanah_roles_select on public.amanah_roles for select to authenticated using (true);
drop policy if exists amanah_roles_insert on public.amanah_roles;
create policy amanah_roles_insert on public.amanah_roles for insert to authenticated with check (public.amanah_is_super_admin());
drop policy if exists amanah_roles_update on public.amanah_roles;
create policy amanah_roles_update on public.amanah_roles for update to authenticated using (public.amanah_is_super_admin()) with check (public.amanah_is_super_admin());
drop policy if exists amanah_roles_delete on public.amanah_roles;
create policy amanah_roles_delete on public.amanah_roles for delete to authenticated using (public.amanah_is_super_admin());

drop policy if exists amanah_permissions_select on public.amanah_permissions;
create policy amanah_permissions_select on public.amanah_permissions for select to authenticated using (true);
drop policy if exists amanah_permissions_write on public.amanah_permissions;
create policy amanah_permissions_write on public.amanah_permissions for all to authenticated using (public.amanah_is_super_admin()) with check (public.amanah_is_super_admin());

drop policy if exists amanah_role_permissions_select on public.amanah_role_permissions;
create policy amanah_role_permissions_select on public.amanah_role_permissions for select to authenticated using (true);
drop policy if exists amanah_role_permissions_write on public.amanah_role_permissions;
create policy amanah_role_permissions_write on public.amanah_role_permissions for all to authenticated using (public.amanah_is_super_admin()) with check (public.amanah_is_super_admin());

drop policy if exists amanah_user_directory_select on public.amanah_user_directory;
create policy amanah_user_directory_select on public.amanah_user_directory for select to authenticated using (public.amanah_is_super_admin() or auth_user_id=auth.uid());
drop policy if exists amanah_user_directory_insert on public.amanah_user_directory;
create policy amanah_user_directory_insert on public.amanah_user_directory for insert to authenticated with check (auth_user_id=auth.uid());
drop policy if exists amanah_user_directory_update on public.amanah_user_directory;
create policy amanah_user_directory_update on public.amanah_user_directory for update to authenticated using (public.amanah_is_super_admin() or auth_user_id=auth.uid()) with check (public.amanah_is_super_admin() or auth_user_id=auth.uid());

drop policy if exists amanah_user_roles_select on public.amanah_user_roles;
create policy amanah_user_roles_select on public.amanah_user_roles for select to authenticated using (public.amanah_is_super_admin() or auth_user_id=auth.uid());
drop policy if exists amanah_user_roles_insert on public.amanah_user_roles;
create policy amanah_user_roles_insert on public.amanah_user_roles for insert to authenticated with check (public.amanah_is_super_admin());
drop policy if exists amanah_user_roles_delete on public.amanah_user_roles;
create policy amanah_user_roles_delete on public.amanah_user_roles for delete to authenticated using (public.amanah_is_super_admin());

grant execute on function public.amanah_register_current_user() to authenticated;
grant execute on function public.amanah_get_current_permissions() to authenticated;
grant execute on function public.amanah_get_current_role() to authenticated;
grant execute on function public.amanah_has_permission(text) to authenticated;