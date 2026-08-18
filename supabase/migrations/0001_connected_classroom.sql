-- ClassPlay v0.2 — Connected Classroom
-- Run in a fresh Supabase project before configuring NEXT_PUBLIC_SUPABASE_* variables.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Teacher',
  school_name text,
  avatar_url text,
  classroom_settings jsonb not null default '{"reducedMotion":false,"largeText":false,"highContrast":false,"timerEnabled":true,"timerSeconds":30,"soundEnabled":true,"leaderboardEnabled":true,"readAloud":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(coalesce(new.email, 'Teacher'), '@', 1), 'Teacher'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(coalesce(u.email, 'Teacher'), '@', 1), 'Teacher')
from auth.users u
on conflict (id) do nothing;

create table if not exists public.activity_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_local_id text,
  title text not null,
  description text not null default '',
  subject text not null default 'English',
  topic text not null default 'English practice',
  cefr_level text not null default 'A1–A2',
  grade text not null default 'Class',
  kind text not null default 'mixed' check (kind in ('vocabulary', 'grammar', 'mixed')),
  visibility text not null default 'private' check (visibility in ('private', 'unlisted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, source_local_id)
);

create table if not exists public.activity_items (
  id uuid primary key default gen_random_uuid(),
  activity_set_id uuid not null references public.activity_sets(id) on delete cascade,
  sort_order integer not null default 0,
  prompt text not null,
  answer text not null,
  hint text,
  image_url text,
  example text,
  gap_sentence text,
  distractors jsonb not null default '[]'::jsonb,
  sentence_parts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_games (
  activity_set_id uuid not null references public.activity_sets(id) on delete cascade,
  game_type text not null check (game_type in ('flashcards', 'memory', 'matching', 'sentence-builder', 'gap-fill', 'quiz')),
  settings jsonb not null default '{}'::jsonb,
  primary key(activity_set_id, game_type)
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  activity_set_id uuid not null references public.activity_sets(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  room_code char(6) not null unique check (room_code ~ '^[0-9]{6}$'),
  mode text not null default 'individual' check (mode in ('individual', 'team')),
  state text not null default 'lobby' check (state in ('lobby', 'playing', 'round_results', 'final_results', 'closed')),
  settings jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  expires_at timestamptz not null default (now() + interval '4 hours'),
  current_item_index integer not null default 0,
  current_question jsonb,
  round_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  name text not null,
  color text not null,
  sort_order integer not null default 0,
  unique(session_id, name)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  nickname text not null,
  team_id uuid references public.teams(id) on delete set null,
  player_token uuid not null default gen_random_uuid(),
  score integer not null default 0,
  correct_count integer not null default 0,
  total_answers integer not null default 0,
  removed boolean not null default false,
  connected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists players_unique_nickname_in_session on public.players(session_id, lower(nickname)) where removed = false;

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  item_id uuid not null references public.activity_items(id) on delete cascade,
  answer_payload jsonb not null default '{}'::jsonb,
  is_correct boolean not null,
  response_ms integer not null default 0,
  awarded_points integer not null default 0,
  created_at timestamptz not null default now(),
  unique(session_id, player_id, item_id)
);

create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  score integer not null default 0,
  correct integer not null default 0,
  total integer not null default 0,
  accuracy numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists activity_items_activity_idx on public.activity_items(activity_set_id, sort_order);
create index if not exists sessions_host_idx on public.game_sessions(host_id, created_at desc);
create index if not exists players_session_idx on public.players(session_id);
create index if not exists answers_session_idx on public.answers(session_id, created_at);

drop trigger if exists activity_sets_updated_at on public.activity_sets;
create trigger activity_sets_updated_at before update on public.activity_sets for each row execute function public.set_updated_at();
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists sessions_updated_at on public.game_sessions;
create trigger sessions_updated_at before update on public.game_sessions for each row execute function public.set_updated_at();

create or replace function public.set_round_started_at()
returns trigger
language plpgsql
as $$
begin
  if new.state = 'playing' and new.current_question is distinct from old.current_question then
    new.round_started_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_round_started_at on public.game_sessions;
create trigger sessions_round_started_at before update on public.game_sessions for each row execute function public.set_round_started_at();

-- Row Level Security ---------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.activity_sets enable row level security;
alter table public.activity_items enable row level security;
alter table public.activity_games enable row level security;
alter table public.game_sessions enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.answers enable row level security;
alter table public.game_results enable row level security;

drop policy if exists "profiles own read" on public.profiles;
drop policy if exists "profiles own update" on public.profiles;
drop policy if exists "activity owner all" on public.activity_sets;
drop policy if exists "activity items owner all" on public.activity_items;
drop policy if exists "activity games owner all" on public.activity_games;
drop policy if exists "session host all" on public.game_sessions;
drop policy if exists "teams host all" on public.teams;
drop policy if exists "players host all" on public.players;
drop policy if exists "answers host read" on public.answers;
drop policy if exists "results host all" on public.game_results;

create policy "profiles own read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles own update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "activity owner all" on public.activity_sets for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "activity items owner all" on public.activity_items for all to authenticated
using (exists (select 1 from public.activity_sets a where a.id = activity_set_id and a.owner_id = auth.uid()))
with check (exists (select 1 from public.activity_sets a where a.id = activity_set_id and a.owner_id = auth.uid()));
create policy "activity games owner all" on public.activity_games for all to authenticated
using (exists (select 1 from public.activity_sets a where a.id = activity_set_id and a.owner_id = auth.uid()))
with check (exists (select 1 from public.activity_sets a where a.id = activity_set_id and a.owner_id = auth.uid()));

create policy "session host all" on public.game_sessions for all to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy "teams host all" on public.teams for all to authenticated
using (exists (select 1 from public.game_sessions s where s.id = session_id and s.host_id = auth.uid()))
with check (exists (select 1 from public.game_sessions s where s.id = session_id and s.host_id = auth.uid()));
create policy "players host all" on public.players for all to authenticated
using (exists (select 1 from public.game_sessions s where s.id = session_id and s.host_id = auth.uid()))
with check (exists (select 1 from public.game_sessions s where s.id = session_id and s.host_id = auth.uid()));
create policy "answers host read" on public.answers for select to authenticated
using (exists (select 1 from public.game_sessions s where s.id = session_id and s.host_id = auth.uid()));
create policy "results host all" on public.game_results for all to authenticated
using (exists (select 1 from public.game_sessions s where s.id = session_id and s.host_id = auth.uid()))
with check (exists (select 1 from public.game_sessions s where s.id = session_id and s.host_id = auth.uid()));

-- Private storage bucket. Paths start with the authenticated owner's UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity-media', 'activity-media', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "activity media owner read" on storage.objects;
drop policy if exists "activity media owner insert" on storage.objects;
drop policy if exists "activity media owner update" on storage.objects;
drop policy if exists "activity media owner delete" on storage.objects;

create policy "activity media owner read" on storage.objects for select to authenticated
using (bucket_id = 'activity-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "activity media owner insert" on storage.objects for insert to authenticated
with check (bucket_id = 'activity-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "activity media owner update" on storage.objects for update to authenticated
using (bucket_id = 'activity-media' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'activity-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "activity media owner delete" on storage.objects for delete to authenticated
using (bucket_id = 'activity-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Anonymous student RPCs ----------------------------------------------------
create or replace function public.classplay_normalize(value text)
returns text
language sql
immutable
as $$
  select lower(trim(regexp_replace(coalesce(value, ''), '\\s+', ' ', 'g')));
$$;

create or replace function public.join_classplay_room(p_room_code text, p_nickname text)
returns table(
  session_id uuid,
  player_id uuid,
  player_token uuid,
  activity_title text,
  mode text,
  state text,
  team_id uuid,
  team_name text,
  team_color text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions%rowtype;
  v_player public.players%rowtype;
  v_nickname text;
  v_team public.teams%rowtype;
begin
  v_nickname := trim(regexp_replace(coalesce(p_nickname, ''), '[[:cntrl:]]', '', 'g'));
  v_nickname := regexp_replace(v_nickname, '\\s+', ' ', 'g');
  if char_length(v_nickname) < 2 or char_length(v_nickname) > 24 then
    raise exception 'Nickname must contain 2 to 24 characters.';
  end if;

  select * into v_session
  from public.game_sessions
  where room_code = trim(p_room_code)
    and state = 'lobby'
    and locked = false
    and expires_at > now()
  limit 1;

  if not found then
    raise exception 'Room is unavailable, locked, started or expired.';
  end if;

  if v_session.mode = 'team' then
    select t.* into v_team
    from public.teams t
    left join public.players p on p.team_id = t.id and p.removed = false
    where t.session_id = v_session.id
    group by t.id
    order by count(p.id), t.sort_order
    limit 1;
  end if;

  begin
    insert into public.players(session_id, nickname, team_id)
    values(v_session.id, v_nickname, case when v_session.mode = 'team' then v_team.id else null end)
    returning * into v_player;
  exception when unique_violation then
    raise exception 'That nickname is already being used in this room.';
  end;

  return query
  select v_session.id, v_player.id, v_player.player_token, a.title, v_session.mode, v_session.state,
         v_player.team_id, v_team.name, v_team.color
  from public.activity_sets a
  where a.id = v_session.activity_set_id;
end;
$$;

create or replace function public.resume_classplay_player(p_player_id uuid, p_player_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
  v_session public.game_sessions%rowtype;
  v_activity_title text;
  v_team public.teams%rowtype;
begin
  select * into v_player from public.players where id = p_player_id and player_token = p_player_token and removed = false;
  if not found then raise exception 'Player session is invalid.'; end if;
  select * into v_session from public.game_sessions where id = v_player.session_id and state <> 'closed' and expires_at > now();
  if not found then raise exception 'Room is no longer active.'; end if;
  select title into v_activity_title from public.activity_sets where id = v_session.activity_set_id;
  if v_player.team_id is not null then select * into v_team from public.teams where id = v_player.team_id; end if;
  update public.players set last_seen_at = now() where id = v_player.id;

  return jsonb_build_object(
    'sessionId', v_session.id,
    'roomCode', v_session.room_code,
    'activityTitle', v_activity_title,
    'mode', v_session.mode,
    'state', v_session.state,
    'settings', v_session.settings,
    'currentQuestion', case when v_session.current_question is null then null else v_session.current_question - 'correctAnswer' end,
    'revealedAnswer', case when v_session.state = 'round_results' then v_session.current_question->>'correctAnswer' else null end,
    'player', jsonb_build_object(
      'id', v_player.id, 'sessionId', v_player.session_id, 'nickname', v_player.nickname,
      'teamId', v_player.team_id, 'score', v_player.score, 'correctCount', v_player.correct_count,
      'totalAnswers', v_player.total_answers, 'connectedAt', v_player.connected_at, 'lastSeenAt', now(), 'removed', false
    ),
    'team', case when v_team.id is null then null else jsonb_build_object('id', v_team.id, 'name', v_team.name, 'color', v_team.color) end
  );
end;
$$;

create or replace function public.submit_classplay_answer(
  p_player_id uuid,
  p_player_token uuid,
  p_item_id uuid,
  p_answer_text text,
  p_response_ms integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
  v_session public.game_sessions%rowtype;
  v_item public.activity_items%rowtype;
  v_existing public.answers%rowtype;
  v_correct boolean;
  v_points integer := 0;
  v_timer_seconds integer;
  v_response_ms integer := 0;
begin
  select * into v_player from public.players where id = p_player_id and player_token = p_player_token and removed = false;
  if not found then raise exception 'Player session is invalid.'; end if;
  select * into v_session from public.game_sessions where id = v_player.session_id and state = 'playing' and expires_at > now();
  if not found then raise exception 'This round is not accepting answers.'; end if;

  if coalesce(v_session.current_question->>'itemId', '') <> p_item_id::text then
    raise exception 'This question is no longer active.';
  end if;

  select * into v_existing from public.answers where session_id = v_session.id and player_id = v_player.id and item_id = p_item_id;
  if found then
    select * into v_item from public.activity_items where id = p_item_id;
    return jsonb_build_object('correct', v_existing.is_correct, 'points', v_existing.awarded_points, 'score', v_player.score, 'alreadyAnswered', true);
  end if;

  v_timer_seconds := coalesce((v_session.settings->>'timerSeconds')::integer, 30);
  if v_session.round_started_at is not null then
    v_response_ms := greatest(0, floor(extract(epoch from (now() - v_session.round_started_at)) * 1000)::integer);
  end if;
  if coalesce((v_session.settings->>'timerEnabled')::boolean, true)
     and v_session.round_started_at is not null
     and now() > v_session.round_started_at + make_interval(secs => v_timer_seconds + 3) then
    raise exception 'Time is up for this question.';
  end if;

  select * into v_item from public.activity_items where id = p_item_id and activity_set_id = v_session.activity_set_id;
  if not found then raise exception 'Question item not found.'; end if;

  v_correct := public.classplay_normalize(p_answer_text) = public.classplay_normalize(coalesce(v_session.current_question->>'correctAnswer', v_item.answer));
  if v_correct then
    v_points := 100;
    if coalesce((v_session.settings->>'timerEnabled')::boolean, true) then
      v_points := v_points + greatest(0, 50 - least(50, v_response_ms / 200));
    end if;
  end if;

  insert into public.answers(session_id, player_id, item_id, answer_payload, is_correct, response_ms, awarded_points)
  values(v_session.id, v_player.id, p_item_id, jsonb_build_object('answer', p_answer_text), v_correct, v_response_ms, v_points);

  update public.players
  set score = score + v_points,
      correct_count = correct_count + case when v_correct then 1 else 0 end,
      total_answers = total_answers + 1,
      last_seen_at = now()
  where id = v_player.id
  returning * into v_player;

  return jsonb_build_object('correct', v_correct, 'points', v_points, 'score', v_player.score, 'alreadyAnswered', false);
end;
$$;

create or replace function public.finalize_classplay_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions%rowtype;
begin
  select * into v_session from public.game_sessions where id = p_session_id and host_id = auth.uid();
  if not found then raise exception 'Host session not found.'; end if;

  delete from public.game_results where session_id = p_session_id;
  insert into public.game_results(session_id, player_id, team_id, score, correct, total, accuracy)
  select p_session_id, p.id, p.team_id, p.score, p.correct_count, p.total_answers,
         case when p.total_answers = 0 then 0 else round((p.correct_count::numeric / p.total_answers::numeric) * 100, 2) end
  from public.players p where p.session_id = p_session_id and p.removed = false;

  update public.game_sessions set state = 'final_results', ended_at = now(), current_question = null where id = p_session_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.join_classplay_room(text, text) from public;
revoke execute on function public.resume_classplay_player(uuid, uuid) from public;
revoke execute on function public.submit_classplay_answer(uuid, uuid, uuid, text, integer) from public;
revoke execute on function public.finalize_classplay_session(uuid) from public;

grant execute on function public.join_classplay_room(text, text) to anon, authenticated;
grant execute on function public.resume_classplay_player(uuid, uuid) to anon, authenticated;
grant execute on function public.submit_classplay_answer(uuid, uuid, uuid, text, integer) to anon, authenticated;
grant execute on function public.finalize_classplay_session(uuid) to authenticated;

-- Realtime host subscriptions. Ignore duplicate publication membership on reruns.
do $$
begin
  alter publication supabase_realtime add table public.players;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.answers;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.game_sessions;
exception when duplicate_object then null;
end $$;
