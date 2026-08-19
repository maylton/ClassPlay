-- RLS helper functions live outside the exposed public schema. They are
-- security-definer only to evaluate membership/ownership without recursively
-- invoking the policies on the same tables. Every helper binds decisions to
-- auth.uid(), uses an empty search_path, and is executable only by authenticated.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_class_owner(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.classrooms c
    where c.id = p_classroom_id and c.owner_id = auth.uid()
  );
$$;

create or replace function private.is_class_member(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.class_members m
    where m.classroom_id = p_classroom_id and m.user_id = auth.uid() and m.active
  );
$$;

create or replace function private.is_assignment_owner(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.assignments a
    join public.classrooms c on c.id = a.classroom_id
    where a.id = p_assignment_id and c.owner_id = auth.uid()
  );
$$;

create or replace function private.is_own_class_member(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.class_members m
    where m.id = p_member_id and m.user_id = auth.uid() and m.active
  );
$$;

create or replace function private.can_read_assigned_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.assignments a
    join public.class_members m on m.classroom_id = a.classroom_id
    where a.activity_set_id = p_activity_id
      and a.published
      and m.user_id = auth.uid()
      and m.active
  );
$$;

revoke execute on function
  private.is_class_owner(uuid),
  private.is_class_member(uuid),
  private.is_assignment_owner(uuid),
  private.is_own_class_member(uuid),
  private.can_read_assigned_activity(uuid)
from public, anon;

grant execute on function
  private.is_class_owner(uuid),
  private.is_class_member(uuid),
  private.is_assignment_owner(uuid),
  private.is_own_class_member(uuid),
  private.can_read_assigned_activity(uuid)
to authenticated;

drop policy if exists "classrooms student select" on public.classrooms;
create policy "classrooms student select" on public.classrooms for select to authenticated
  using ((select private.is_class_member(id)));

drop policy if exists "class members teacher select" on public.class_members;
drop policy if exists "class members teacher update" on public.class_members;
drop policy if exists "class members teacher delete" on public.class_members;
create policy "class members teacher select" on public.class_members for select to authenticated
  using ((select private.is_class_owner(classroom_id)));
create policy "class members teacher update" on public.class_members for update to authenticated
  using ((select private.is_class_owner(classroom_id)))
  with check ((select private.is_class_owner(classroom_id)));
create policy "class members teacher delete" on public.class_members for delete to authenticated
  using ((select private.is_class_owner(classroom_id)));

drop policy if exists "assignments teacher select" on public.assignments;
drop policy if exists "assignments student select" on public.assignments;
drop policy if exists "assignments teacher insert" on public.assignments;
drop policy if exists "assignments teacher update" on public.assignments;
drop policy if exists "assignments teacher delete" on public.assignments;
create policy "assignments teacher select" on public.assignments for select to authenticated
  using ((select private.is_class_owner(classroom_id)));
create policy "assignments student select" on public.assignments for select to authenticated
  using (published and (select private.is_class_member(classroom_id)));
create policy "assignments teacher insert" on public.assignments for insert to authenticated
  with check (
    (select private.is_class_owner(classroom_id))
    and activity_set_id in (select id from public.activity_sets where owner_id = (select auth.uid()))
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false
  );
create policy "assignments teacher update" on public.assignments for update to authenticated
  using ((select private.is_class_owner(classroom_id)))
  with check (
    (select private.is_class_owner(classroom_id))
    and activity_set_id in (select id from public.activity_sets where owner_id = (select auth.uid()))
  );
create policy "assignments teacher delete" on public.assignments for delete to authenticated
  using ((select private.is_class_owner(classroom_id)));

drop policy if exists "assignment attempts teacher select" on public.assignment_attempts;
drop policy if exists "assignment attempts student select" on public.assignment_attempts;
create policy "assignment attempts teacher select" on public.assignment_attempts for select to authenticated
  using ((select private.is_assignment_owner(assignment_id)));
create policy "assignment attempts student select" on public.assignment_attempts for select to authenticated
  using ((select private.is_own_class_member(member_id)));

drop policy if exists "assigned activity sets student read" on public.activity_sets;
drop policy if exists "assigned activity items student read" on public.activity_items;
drop policy if exists "assigned activity games student read" on public.activity_games;
create policy "assigned activity sets student read" on public.activity_sets for select to authenticated
  using ((select private.can_read_assigned_activity(id)));
create policy "assigned activity items student read" on public.activity_items for select to authenticated
  using ((select private.can_read_assigned_activity(activity_set_id)));
create policy "assigned activity games student read" on public.activity_games for select to authenticated
  using ((select private.can_read_assigned_activity(activity_set_id)));
