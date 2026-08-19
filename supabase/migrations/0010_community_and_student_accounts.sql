-- ClassPlay v0.5 — Community + permanent student accounts
-- Student accounts authenticate with Supabase email/password and are marked by
-- a dedicated student_profiles row. Username is a display identity, never an
-- authorization claim.

create table public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,23}$'),
  username_key text generated always as (lower(username)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (username_key)
);
create index student_profiles_username_idx on public.student_profiles(username_key);
alter table public.student_profiles enable row level security;
revoke all on table public.student_profiles from anon, authenticated;
grant select on table public.student_profiles to authenticated;
grant all on table public.student_profiles to service_role;
create policy "student profile own read" on public.student_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.is_student_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.student_profiles s where s.user_id = auth.uid()
  );
$$;
revoke execute on function private.is_student_account() from public, anon;
grant execute on function private.is_student_account() to authenticated;

create or replace function public.register_student_profile(p_username text)
returns public.student_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.student_profiles%rowtype;
  v_username text := btrim(coalesce(p_username, ''));
begin
  if v_user_id is null then
    raise exception 'Sign in before creating a student profile.' using errcode='42501';
  end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Create a permanent student account first.' using errcode='42501';
  end if;
  if v_username !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,23}$' then
    raise exception 'Username must be 3–24 letters, numbers, dots, underscores or hyphens.' using errcode='22023';
  end if;
  if exists(select 1 from public.classrooms c where c.owner_id = v_user_id)
     or exists(select 1 from public.activity_sets a where a.owner_id = v_user_id) then
    raise exception 'This account is already being used as a teacher account.' using errcode='42501';
  end if;

  insert into public.student_profiles(user_id, username)
  values (v_user_id, v_username)
  on conflict (user_id) do update
    set username = excluded.username, updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;
revoke execute on function public.register_student_profile(text) from public, anon;
grant execute on function public.register_student_profile(text) to authenticated;

create or replace function public.join_classroom_account(p_join_code text)
returns table (
  classroom_id uuid,
  classroom_name text,
  school_year text,
  member_id uuid,
  display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_class public.classrooms%rowtype;
  v_student public.student_profiles%rowtype;
  v_member public.class_members%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in before joining a class.' using errcode='42501';
  end if;

  select * into v_student
  from public.student_profiles s
  where s.user_id = v_user_id
  limit 1;
  if v_student.user_id is null then
    raise exception 'Create your student profile first.' using errcode='42501';
  end if;

  select * into v_class
  from public.classrooms c
  where c.join_code = upper(btrim(p_join_code)) and c.join_enabled
  limit 1;
  if v_class.id is null then
    raise exception 'Class code not found or joining is closed.' using errcode='P0002';
  end if;

  insert into public.class_members(classroom_id, user_id, display_name, active)
  values (v_class.id, v_user_id, v_student.username, true)
  on conflict (classroom_id, user_id) do update
    set display_name = excluded.display_name, active = true
  returning * into v_member;

  return query
  select v_class.id, v_class.name, v_class.school_year, v_member.id, v_member.display_name;
end;
$$;
revoke execute on function public.join_classroom(text, text) from authenticated;
revoke execute on function public.join_classroom_account(text) from public, anon;
grant execute on function public.join_classroom_account(text) to authenticated;

-- Permanent student accounts still use the authenticated Postgres role. Add
-- role-marker guards at the database boundary so they cannot call teacher
-- authoring APIs directly.
drop policy if exists "permanent activity sets insert" on public.activity_sets;
drop policy if exists "permanent activity sets update" on public.activity_sets;
drop policy if exists "permanent activity sets delete" on public.activity_sets;
create policy "teacher activity sets insert" on public.activity_sets as restrictive for insert to authenticated
  with check (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "teacher activity sets update" on public.activity_sets as restrictive for update to authenticated
  using (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false)
  with check (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "teacher activity sets delete" on public.activity_sets as restrictive for delete to authenticated
  using (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);

drop policy if exists "permanent activity items insert" on public.activity_items;
drop policy if exists "permanent activity items update" on public.activity_items;
drop policy if exists "permanent activity items delete" on public.activity_items;
create policy "teacher activity items insert" on public.activity_items as restrictive for insert to authenticated
  with check (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "teacher activity items update" on public.activity_items as restrictive for update to authenticated
  using (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false)
  with check (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "teacher activity items delete" on public.activity_items as restrictive for delete to authenticated
  using (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);

drop policy if exists "permanent activity games insert" on public.activity_games;
drop policy if exists "permanent activity games update" on public.activity_games;
drop policy if exists "permanent activity games delete" on public.activity_games;
create policy "teacher activity games insert" on public.activity_games as restrictive for insert to authenticated
  with check (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "teacher activity games update" on public.activity_games as restrictive for update to authenticated
  using (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false)
  with check (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "teacher activity games delete" on public.activity_games as restrictive for delete to authenticated
  using (not (select private.is_student_account()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);

create policy "teacher classrooms insert guard" on public.classrooms as restrictive for insert to authenticated
  with check (not (select private.is_student_account()));
create policy "teacher classrooms update guard" on public.classrooms as restrictive for update to authenticated
  using (not (select private.is_student_account())) with check (not (select private.is_student_account()));
create policy "teacher classrooms delete guard" on public.classrooms as restrictive for delete to authenticated
  using (not (select private.is_student_account()));
create policy "teacher assignments insert guard" on public.assignments as restrictive for insert to authenticated
  with check (not (select private.is_student_account()));
create policy "teacher assignments update guard" on public.assignments as restrictive for update to authenticated
  using (not (select private.is_student_account())) with check (not (select private.is_student_account()));
create policy "teacher assignments delete guard" on public.assignments as restrictive for delete to authenticated
  using (not (select private.is_student_account()));

-- Community discovery is separate from direct-link sharing. A listing points at
-- an unlisted Activity Set; removing the listing does not disable its practice
-- link or erase its leaderboard.
create table public.community_listings (
  activity_set_id uuid primary key references public.activity_sets(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 80),
  published_at timestamptz not null default now()
);
create index community_listings_published_idx on public.community_listings(published_at desc);
alter table public.community_listings enable row level security;
revoke all on table public.community_listings from anon, authenticated;
grant select on table public.community_listings to anon, authenticated;
grant all on table public.community_listings to service_role;
create policy "community listings public read" on public.community_listings for select to anon, authenticated
  using (exists(
    select 1 from public.activity_sets a
    where a.id = activity_set_id and a.visibility = 'unlisted'
  ));

create or replace function public.publish_community_activity(p_activity_id uuid)
returns public.community_listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_author text;
  v_listing public.community_listings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Teacher session required.' using errcode='42501';
  end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
     or exists(select 1 from public.student_profiles s where s.user_id = v_user_id) then
    raise exception 'Student accounts cannot publish to Community.' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.activity_sets a
    where a.id = p_activity_id and a.owner_id = v_user_id
  ) then
    raise exception 'Activity not found in your library.' using errcode='42501';
  end if;

  select coalesce(nullif(btrim(p.display_name),''),'Teacher')
    into v_author
  from public.profiles p
  where p.id = v_user_id;

  update public.activity_sets
    set visibility='unlisted', updated_at=now()
  where id=p_activity_id and owner_id=v_user_id;

  insert into public.community_listings(activity_set_id, owner_id, author_name)
  values (p_activity_id, v_user_id, coalesce(v_author,'Teacher'))
  on conflict (activity_set_id) do update
    set author_name=excluded.author_name
  returning * into v_listing;

  return v_listing;
end;
$$;
revoke execute on function public.publish_community_activity(uuid) from public, anon;
grant execute on function public.publish_community_activity(uuid) to authenticated;

create or replace function public.remove_community_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Teacher session required.' using errcode='42501';
  end if;
  delete from public.community_listings l
  where l.activity_set_id=p_activity_id and l.owner_id=v_user_id;
end;
$$;
revoke execute on function public.remove_community_activity(uuid) from public, anon;
grant execute on function public.remove_community_activity(uuid) to authenticated;

create view public.community_catalog
with (security_invoker = true)
as
select
  l.activity_set_id,
  l.author_name,
  l.published_at,
  a.title,
  a.description,
  a.subject,
  a.topic,
  a.cefr_level,
  a.grade,
  a.kind,
  (
    select i.image_url from public.activity_items i
    where i.activity_set_id=a.id and i.image_url is not null
    order by i.sort_order limit 1
  ) as cover_image_url,
  (select count(*)::integer from public.activity_items i where i.activity_set_id=a.id) as item_count,
  array(
    select g.game_type from public.activity_games g
    where g.activity_set_id=a.id
    order by g.game_type
  ) as game_modes
from public.community_listings l
join public.activity_sets a on a.id=l.activity_set_id
where a.visibility='unlisted';

revoke all on table public.community_catalog from public;
grant select on table public.community_catalog to anon, authenticated;
