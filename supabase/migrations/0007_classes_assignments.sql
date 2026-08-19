-- ClassPlay v0.4 — Classes & Assignments
-- Student identities use Supabase Anonymous Auth. Anonymous Auth users carry the
-- authenticated Postgres role, so teacher-owned writes explicitly reject the
-- is_anonymous JWT claim while students receive only membership-scoped access.

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  school_year text not null default extract(year from now())::text check (char_length(btrim(school_year)) between 1 and 20),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  join_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index classrooms_owner_idx on public.classrooms(owner_id, created_at desc);

create table public.class_members (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (classroom_id, user_id)
);
create index class_members_user_idx on public.class_members(user_id, classroom_id);
create index class_members_class_idx on public.class_members(classroom_id, active, joined_at);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  activity_set_id uuid not null references public.activity_sets(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  instructions text not null default '' check (char_length(instructions) <= 1000),
  game_type text,
  due_at timestamptz,
  attempts_limit integer check (attempts_limit is null or attempts_limit between 1 and 20),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignments_game_type_check check (
    game_type is null or game_type = any(array[
      'flashcards','memory','matching','sentence-builder','gap-fill','quiz','space-blaster','word-maze'
    ])
  )
);
create index assignments_class_idx on public.assignments(classroom_id, published, due_at, created_at desc);
create index assignments_activity_idx on public.assignments(activity_set_id);

create table public.assignment_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  member_id uuid not null references public.class_members(id) on delete cascade,
  game_type text not null,
  score integer not null default 0 check (score between 0 and 1000000),
  correct integer not null default 0,
  total integer not null default 0,
  completed_at timestamptz not null default now(),
  constraint assignment_attempts_result_check check (correct >= 0 and total >= 0 and correct <= total),
  constraint assignment_attempts_game_type_check check (
    game_type = any(array[
      'flashcards','memory','matching','sentence-builder','gap-fill','quiz','space-blaster','word-maze'
    ])
  )
);
create index assignment_attempts_assignment_idx on public.assignment_attempts(assignment_id, completed_at desc);
create index assignment_attempts_member_idx on public.assignment_attempts(member_id, assignment_id, completed_at desc);

alter table public.classrooms enable row level security;
alter table public.class_members enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_attempts enable row level security;

-- Explicit Data API grants: new public-schema tables are no longer guaranteed
-- to be exposed automatically by Supabase.
revoke all on table public.classrooms, public.class_members, public.assignments, public.assignment_attempts from anon, authenticated;
grant select, insert, update, delete on table public.classrooms, public.class_members, public.assignments, public.assignment_attempts to authenticated;
grant all on table public.classrooms, public.class_members, public.assignments, public.assignment_attempts to service_role;

create policy "classrooms teacher select" on public.classrooms for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "classrooms student select" on public.classrooms for select to authenticated
  using (id in (select classroom_id from public.class_members where user_id = (select auth.uid()) and active));
create policy "classrooms teacher insert" on public.classrooms for insert to authenticated
  with check (owner_id = (select auth.uid()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "classrooms teacher update" on public.classrooms for update to authenticated
  using (owner_id = (select auth.uid()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false)
  with check (owner_id = (select auth.uid()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "classrooms teacher delete" on public.classrooms for delete to authenticated
  using (owner_id = (select auth.uid()) and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);

create policy "class members teacher select" on public.class_members for select to authenticated
  using (classroom_id in (select id from public.classrooms where owner_id = (select auth.uid())));
create policy "class members own select" on public.class_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy "class members teacher update" on public.class_members for update to authenticated
  using (classroom_id in (select id from public.classrooms where owner_id = (select auth.uid())))
  with check (classroom_id in (select id from public.classrooms where owner_id = (select auth.uid())));
create policy "class members teacher delete" on public.class_members for delete to authenticated
  using (classroom_id in (select id from public.classrooms where owner_id = (select auth.uid())));

create policy "assignments teacher select" on public.assignments for select to authenticated
  using (classroom_id in (select id from public.classrooms where owner_id = (select auth.uid())));
create policy "assignments student select" on public.assignments for select to authenticated
  using (published and classroom_id in (select classroom_id from public.class_members where user_id = (select auth.uid()) and active));
create policy "assignments teacher insert" on public.assignments for insert to authenticated
  with check (
    classroom_id in (select id from public.classrooms where owner_id = (select auth.uid()))
    and activity_set_id in (select id from public.activity_sets where owner_id = (select auth.uid()))
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false
  );
create policy "assignments teacher update" on public.assignments for update to authenticated
  using (classroom_id in (select id from public.classrooms where owner_id = (select auth.uid())))
  with check (
    classroom_id in (select id from public.classrooms where owner_id = (select auth.uid()))
    and activity_set_id in (select id from public.activity_sets where owner_id = (select auth.uid()))
  );
create policy "assignments teacher delete" on public.assignments for delete to authenticated
  using (classroom_id in (select id from public.classrooms where owner_id = (select auth.uid())));

create policy "assignment attempts teacher select" on public.assignment_attempts for select to authenticated
  using (assignment_id in (
    select a.id from public.assignments a
    join public.classrooms c on c.id = a.classroom_id
    where c.owner_id = (select auth.uid())
  ));
create policy "assignment attempts student select" on public.assignment_attempts for select to authenticated
  using (member_id in (select id from public.class_members where user_id = (select auth.uid())));
create policy "assignment attempts student insert" on public.assignment_attempts for insert to authenticated
  with check (member_id in (
    select m.id from public.class_members m
    join public.assignments a on a.classroom_id = m.classroom_id
    where m.user_id = (select auth.uid()) and m.active and a.id = assignment_id and a.published
  ));

-- Assigned private activities are readable only by enrolled students who have
-- a currently published assignment pointing at them.
create policy "assigned activity sets student read" on public.activity_sets for select to authenticated
  using (id in (
    select a.activity_set_id from public.assignments a
    where a.published and a.classroom_id in (
      select classroom_id from public.class_members where user_id = (select auth.uid()) and active
    )
  ));
create policy "assigned activity items student read" on public.activity_items for select to authenticated
  using (activity_set_id in (
    select a.activity_set_id from public.assignments a
    where a.published and a.classroom_id in (
      select classroom_id from public.class_members where user_id = (select auth.uid()) and active
    )
  ));
create policy "assigned activity games student read" on public.activity_games for select to authenticated
  using (activity_set_id in (
    select a.activity_set_id from public.assignments a
    where a.published and a.classroom_id in (
      select classroom_id from public.class_members where user_id = (select auth.uid()) and active
    )
  ));

-- Anonymous students use the authenticated role. These restrictive policies
-- keep teacher-authored content write operations permanent-user-only while
-- preserving the new assignment SELECT policies above.
create policy "permanent activity sets insert" on public.activity_sets as restrictive for insert to authenticated
  with check (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "permanent activity sets update" on public.activity_sets as restrictive for update to authenticated
  using (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false)
  with check (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "permanent activity sets delete" on public.activity_sets as restrictive for delete to authenticated
  using (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "permanent activity items insert" on public.activity_items as restrictive for insert to authenticated
  with check (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "permanent activity items update" on public.activity_items as restrictive for update to authenticated
  using (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false)
  with check (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "permanent activity items delete" on public.activity_items as restrictive for delete to authenticated
  using (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "permanent activity games insert" on public.activity_games as restrictive for insert to authenticated
  with check (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "permanent activity games update" on public.activity_games as restrictive for update to authenticated
  using (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false)
  with check (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create policy "permanent activity games delete" on public.activity_games as restrictive for delete to authenticated
  using (coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);

-- Joining by class key is the one operation that must resolve a non-public
-- classroom row. Keep the function narrowly scoped, bind every write to
-- auth.uid(), set an empty search_path, and explicitly limit EXECUTE.
create or replace function public.join_classroom(p_join_code text, p_display_name text)
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
  v_member public.class_members%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in before joining a class.' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_display_name, ''))) < 1 or char_length(btrim(p_display_name)) > 40 then
    raise exception 'Enter a name between 1 and 40 characters.' using errcode = '22023';
  end if;

  select * into v_class
  from public.classrooms c
  where c.join_code = upper(btrim(p_join_code)) and c.join_enabled
  limit 1;

  if v_class.id is null then
    raise exception 'Class code not found or joining is closed.' using errcode = 'P0002';
  end if;

  insert into public.class_members(classroom_id, user_id, display_name, active)
  values (
    v_class.id,
    v_user_id,
    btrim(regexp_replace(p_display_name, '\s+', ' ', 'g')),
    true
  )
  on conflict (classroom_id, user_id) do update
    set display_name = excluded.display_name, active = true
  returning * into v_member;

  return query
  select v_class.id, v_class.name, v_class.school_year, v_member.id, v_member.display_name;
end;
$$;

revoke execute on function public.join_classroom(text, text) from public, anon;
grant execute on function public.join_classroom(text, text) to authenticated;
