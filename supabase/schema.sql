create table if not exists public.maintenance_service_staff (
  email text primary key check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 254
  ),
  role text not null default 'staff' check (role in ('staff', 'admin')),
  added_at timestamptz not null default now()
);

alter table public.maintenance_service_staff
  add column if not exists role text not null default 'staff'
  check (role in ('staff', 'admin'));

alter table public.maintenance_service_staff enable row level security;
revoke all on public.maintenance_service_staff from public, anon, authenticated;

create or replace function public.is_maintenance_service_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.maintenance_service_staff as staff
    where staff.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_maintenance_service_staff() from public, anon;
grant execute on function public.is_maintenance_service_staff() to authenticated;

create or replace function public.is_maintenance_service_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.maintenance_service_staff as staff
    where staff.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and staff.role = 'admin'
  );
$$;

revoke all on function public.is_maintenance_service_admin() from public, anon;
grant execute on function public.is_maintenance_service_admin() to authenticated;

create or replace function public.list_maintenance_service_staff()
returns table(email text, role text, added_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select staff.email, staff.role, staff.added_at
  from public.maintenance_service_staff as staff
  where public.is_maintenance_service_admin()
  order by staff.email;
$$;

create or replace function public.add_maintenance_service_staff(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
  inserted_rows integer;
begin
  if not public.is_maintenance_service_admin() then
    raise exception 'Only checklist admins can manage staff access.'
      using errcode = '42501';
  end if;
  if normalized_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$' then
    raise exception 'Enter a valid staff email address.';
  end if;

  insert into public.maintenance_service_staff (email)
  values (normalized_email)
  on conflict (email) do nothing;
  get diagnostics inserted_rows = row_count;
  if inserted_rows = 0 then
    raise exception 'This email already has checklist access.';
  end if;
end;
$$;

create or replace function public.remove_maintenance_service_staff(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
  deleted_rows integer;
begin
  if not public.is_maintenance_service_admin() then
    raise exception 'Only checklist admins can manage staff access.'
      using errcode = '42501';
  end if;

  delete from public.maintenance_service_staff
  where email = normalized_email
    and role = 'staff';
  get diagnostics deleted_rows = row_count;
  if deleted_rows = 0 then
    raise exception 'Staff access was not removed. The email may be an admin or may not have checklist access.';
  end if;
end;
$$;

revoke all on function public.list_maintenance_service_staff() from public, anon;
revoke all on function public.add_maintenance_service_staff(text) from public, anon;
revoke all on function public.remove_maintenance_service_staff(text) from public, anon;
grant execute on function public.list_maintenance_service_staff() to authenticated;
grant execute on function public.add_maintenance_service_staff(text) to authenticated;
grant execute on function public.remove_maintenance_service_staff(text) to authenticated;

create table if not exists public.maintenance_service_records (
  id uuid primary key default gen_random_uuid(),
  equipment text not null check (char_length(btrim(equipment)) between 1 and 120),
  action text not null check (action in ('serviced', 'repaired', 'scheduled')),
  details text not null check (char_length(btrim(details)) between 1 and 2000),
  event_date date not null,
  next_service_date date check (next_service_date is null or next_service_date >= event_date),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_by_email text,
  approved_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_by_email text not null,
  created_at timestamptz not null default now()
);

alter table public.maintenance_service_records
  add column if not exists approval_status text;
alter table public.maintenance_service_records
  add column if not exists approved_by uuid references auth.users (id) on delete set null;
alter table public.maintenance_service_records
  add column if not exists approved_by_email text;
alter table public.maintenance_service_records
  add column if not exists approved_at timestamptz;

update public.maintenance_service_records
set approval_status = 'approved'
where approval_status is null;

alter table public.maintenance_service_records
  alter column approval_status set default 'pending',
  alter column approval_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.maintenance_service_records'::regclass
      and conname = 'maintenance_service_records_approval_status_check'
  ) then
    alter table public.maintenance_service_records
      add constraint maintenance_service_records_approval_status_check
      check (approval_status in ('pending', 'approved'));
  end if;
end;
$$;

create index if not exists maintenance_service_records_created_at_idx
  on public.maintenance_service_records (created_at desc);

create index if not exists maintenance_service_records_equipment_idx
  on public.maintenance_service_records (lower(btrim(equipment)));

alter table public.maintenance_service_records enable row level security;

revoke all on public.maintenance_service_records from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert on public.maintenance_service_records to authenticated;

drop policy if exists "Invited staff can read service history"
  on public.maintenance_service_records;
create policy "Invited staff can read service history"
  on public.maintenance_service_records
  for select
  to authenticated
  using ((select public.is_maintenance_service_staff()));

drop policy if exists "Staff can add records for their own account"
  on public.maintenance_service_records;
create policy "Staff can add records for their own account"
  on public.maintenance_service_records
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (select public.is_maintenance_service_staff())
  );

create or replace function public.approve_maintenance_service_record(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  if not public.is_maintenance_service_admin() then
    raise exception 'Only checklist admins can approve service records.'
      using errcode = '42501';
  end if;
  if auth.uid() is null or coalesce(auth.jwt() ->> 'email', '') = '' then
    raise exception 'An authenticated checklist admin is required.';
  end if;

  update public.maintenance_service_records
  set approval_status = 'approved',
      approved_by = auth.uid(),
      approved_by_email = auth.jwt() ->> 'email',
      approved_at = now()
  where id = p_id
    and approval_status = 'pending';
  get diagnostics updated_rows = row_count;
  if updated_rows = 0 then
    raise exception 'This service record was not found or is no longer pending approval.';
  end if;
end;
$$;

create or replace function public.delete_maintenance_service_record(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_rows integer;
begin
  if not public.is_maintenance_service_admin() then
    raise exception 'Only checklist admins can delete service records.'
      using errcode = '42501';
  end if;

  delete from public.maintenance_service_records
  where id = p_id;
  get diagnostics deleted_rows = row_count;
  if deleted_rows = 0 then
    raise exception 'The service record was not found or was already deleted.';
  end if;
end;
$$;

revoke all on function public.approve_maintenance_service_record(uuid) from public, anon;
revoke all on function public.delete_maintenance_service_record(uuid) from public, anon;
grant execute on function public.approve_maintenance_service_record(uuid) to authenticated;
grant execute on function public.delete_maintenance_service_record(uuid) to authenticated;

create or replace function public.stamp_maintenance_service_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null
      or coalesce(auth.jwt() ->> 'email', '') = ''
      or not public.is_maintenance_service_staff() then
    raise exception 'An invited and authenticated staff account is required to record service work.';
  end if;

  new.created_by := auth.uid();
  new.created_by_email := auth.jwt() ->> 'email';
  new.created_at := now();
  new.approval_status := 'pending';
  new.approved_by := null;
  new.approved_by_email := null;
  new.approved_at := null;
  return new;
end;
$$;

revoke all on function public.stamp_maintenance_service_record() from public, anon, authenticated;

drop trigger if exists stamp_maintenance_service_record
  on public.maintenance_service_records;
create trigger stamp_maintenance_service_record
  before insert on public.maintenance_service_records
  for each row
  execute function public.stamp_maintenance_service_record();
