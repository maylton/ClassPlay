-- Remediation plan, phases 2 and 3 (docs/REMEDIATION_PLAN.md).
--   2.1 practice leaderboard moderation   2.2 assignment plausibility + late flag
--   2.4 live room creation guards         2.5 live join limits and name filter
--   3.1 resume RPC returns the authoritative final ranking

-- Shared name moderation -----------------------------------------------------
-- Terms live in a table so they can be extended from the dashboard without a
-- migration. `match_anywhere` terms are also matched inside run-together text
-- ("xfuckx"); the rest only match whole words to avoid false positives on
-- ordinary names.
create table if not exists private.blocked_terms (
  term text primary key check (term ~ '^[a-z]+$'),
  match_anywhere boolean not null default false
);
revoke all on table private.blocked_terms from public, anon, authenticated;

insert into private.blocked_terms(term, match_anywhere) values
  -- Portuguese
  ('caralho', true), ('buceta', true), ('punheta', true), ('porra', false), ('puta', false), ('puto', false),
  ('merda', false), ('bosta', false), ('foder', false), ('fodase', false), ('foda', false), ('arrombado', false),
  ('arrombada', false), ('viado', false), ('xoxota', false), ('xereca', false), ('boquete', false),
  ('vagabunda', false), ('vagabundo', false), ('corno', false), ('cuzao', false), ('retardado', false), ('babaca', false),
  -- English
  ('fuck', true), ('motherfucker', true), ('nigger', true), ('nigga', true), ('faggot', true),
  ('shit', false), ('bitch', false), ('cunt', false), ('dick', false), ('cock', false), ('pussy', false),
  ('asshole', false), ('bastard', false), ('slut', false), ('whore', false), ('fag', false), ('retard', false),
  ('nazi', false), ('hitler', false), ('rape', false), ('porn', false), ('sex', false), ('penis', false), ('vagina', false),
  -- Spanish
  ('gilipollas', true), ('mierda', false), ('cabron', false), ('pendejo', false), ('verga', false), ('chingar', false),
  ('chingada', false), ('maricon', false), ('culero', false), ('polla', false), ('joder', false)
on conflict (term) do nothing;

-- Lowercase, strip common accents and undo simple leetspeak (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s, !/|→i).
create or replace function private.moderation_text(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(
    lower(coalesce(value, '')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñý013457@$!|',
    'aaaaaaeeeeiiiiooooouuuucnyoieastasii'
  );
$$;

create or replace function private.has_blocked_term(value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select private.moderation_text(value) as v
  ),
  words as (
    select w from normalized, regexp_split_to_table(normalized.v, '[^a-z]+') as w where w <> ''
    union
    select regexp_replace(w, 's$', '') from normalized, regexp_split_to_table(normalized.v, '[^a-z]+') as w where w <> ''
  ),
  collapsed as (
    select regexp_replace(v, '[^a-z]+', '', 'g') as c from normalized
  )
  select exists (
    select 1
    from private.blocked_terms b
    where b.term in (select w from words)
       or (b.match_anywhere and position(b.term in (select c from collapsed)) > 0)
  );
$$;

revoke execute on function private.moderation_text(text), private.has_blocked_term(text) from public, anon, authenticated;

-- 2.1 Practice leaderboard -----------------------------------------------------
-- Inserts stay on the existing RLS policy (unlisted activity + eligible mode);
-- this trigger adds name moderation, plausibility caps and flood limits.
-- Caps: no game scores more than ~1,500 points per correct answer, and no game
-- reports more correct answers than the activity has items.
create or replace function private.guard_practice_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_count integer;
begin
  new.player_name := btrim(regexp_replace(coalesce(new.player_name, ''), '\s+', ' ', 'g'));
  if private.has_blocked_term(new.player_name) then
    raise exception 'Please choose a different name.' using errcode = '22023';
  end if;

  select count(*)::integer into v_item_count
  from public.activity_items i
  where i.activity_set_id = new.activity_set_id;

  if new.correct > v_item_count or new.total > 1000 or new.score > 3000 * greatest(new.correct, 1) then
    raise exception 'This score could not be verified.' using errcode = '22023';
  end if;

  if (
    select count(*) from public.practice_scores s
    where s.activity_set_id = new.activity_set_id and s.created_at > now() - interval '1 minute'
  ) >= 60 then
    raise exception 'Too many scores are being saved right now. Try again in a minute.' using errcode = '54000';
  end if;

  if (
    select count(*) from public.practice_scores s
    where s.activity_set_id = new.activity_set_id
      and s.game_type = new.game_type
      and lower(s.player_name) = lower(new.player_name)
      and s.created_at > now() - interval '5 minutes'
  ) >= 5 then
    raise exception 'You have saved several scores in a row. Try again in a few minutes.' using errcode = '54000';
  end if;

  return new;
end;
$$;

drop trigger if exists practice_scores_guard on public.practice_scores;
create trigger practice_scores_guard
before insert on public.practice_scores
for each row execute function private.guard_practice_score();

-- Teachers can remove entries from their own activity's leaderboards.
grant delete on table public.practice_scores to authenticated;
drop policy if exists "practice scores owner delete" on public.practice_scores;
create policy "practice scores owner delete"
  on public.practice_scores for delete
  to authenticated
  using (exists (
    select 1 from public.activity_sets a
    where a.id = practice_scores.activity_set_id and a.owner_id = (select auth.uid())
  ));

-- 2.2 Assignment attempts ------------------------------------------------------
alter table public.assignment_attempts
  add column if not exists submitted_late boolean not null default false;

create or replace function public.submit_assignment_attempt(
  p_assignment_id uuid,
  p_member_id uuid,
  p_game_type text,
  p_score integer,
  p_correct integer,
  p_total integer
)
returns public.assignment_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_assignment public.assignments%rowtype;
  v_member public.class_members%rowtype;
  v_attempt public.assignment_attempts%rowtype;
  v_attempt_count integer;
  v_item_count integer;
begin
  if v_user_id is null then
    raise exception 'Student session required.' using errcode = '42501';
  end if;

  select * into v_assignment
  from public.assignments a
  where a.id = p_assignment_id and a.published
  limit 1;
  if v_assignment.id is null then
    raise exception 'Assignment not found or not published.' using errcode = 'P0002';
  end if;

  select * into v_member
  from public.class_members m
  where m.id = p_member_id
    and m.classroom_id = v_assignment.classroom_id
    and m.user_id = v_user_id
    and m.active
  limit 1;
  if v_member.id is null then
    raise exception 'You are not an active member of this class.' using errcode = '42501';
  end if;

  if p_game_type is null or not (p_game_type = any(array[
    'flashcards','memory','matching','sentence-builder','gap-fill','quiz','space-blaster','word-maze'
  ])) then
    raise exception 'Unsupported game mode.' using errcode = '22023';
  end if;

  if v_assignment.game_type is not null and p_game_type <> v_assignment.game_type then
    raise exception 'This assignment requires a different game mode.' using errcode = '22023';
  end if;

  if v_assignment.game_type is null and not exists (
    select 1 from public.activity_games g
    where g.activity_set_id = v_assignment.activity_set_id and g.game_type = p_game_type
  ) then
    raise exception 'This game mode is not enabled for the assigned activity.' using errcode = '22023';
  end if;

  if p_score < 0 or p_score > 1000000 or p_correct < 0 or p_total < 0 or p_correct > p_total then
    raise exception 'Invalid result values.' using errcode = '22023';
  end if;

  select count(*)::integer into v_item_count
  from public.activity_items i
  where i.activity_set_id = v_assignment.activity_set_id;
  if p_correct > v_item_count or p_total > 1000 or p_score > 3000 * greatest(p_correct, 1) then
    raise exception 'This result could not be verified.' using errcode = '22023';
  end if;

  if v_assignment.attempts_limit is not null then
    select count(*)::integer into v_attempt_count
    from public.assignment_attempts t
    where t.assignment_id = v_assignment.id and t.member_id = v_member.id;
    if v_attempt_count >= v_assignment.attempts_limit then
      raise exception 'You have used all attempts for this assignment.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.assignment_attempts(assignment_id, member_id, game_type, score, correct, total, submitted_late)
  values (
    v_assignment.id, v_member.id, p_game_type, p_score, p_correct, p_total,
    v_assignment.due_at is not null and now() > v_assignment.due_at
  )
  returning * into v_attempt;

  return v_attempt;
end;
$$;

revoke execute on function public.submit_assignment_attempt(uuid, uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.submit_assignment_attempt(uuid, uuid, text, integer, integer, integer) to authenticated;

-- 2.4 Live room creation -------------------------------------------------------
-- Hosts may only open rooms for activities they own, and student or anonymous
-- accounts may not host at all.
drop policy if exists "session host activity guard insert" on public.game_sessions;
create policy "session host activity guard insert" on public.game_sessions
  as restrictive for insert to authenticated
  with check (
    exists (select 1 from public.activity_sets a where a.id = activity_set_id and a.owner_id = (select auth.uid()))
    and not (select private.is_student_account())
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false
  );

drop policy if exists "session host activity guard update" on public.game_sessions;
create policy "session host activity guard update" on public.game_sessions
  as restrictive for update to authenticated
  using (true)
  with check (
    exists (select 1 from public.activity_sets a where a.id = activity_set_id and a.owner_id = (select auth.uid()))
  );

-- 2.5 Live join ----------------------------------------------------------------
-- Adds a room capacity, nickname moderation and a per-room ban: a nickname the
-- teacher removed cannot rejoin the same room.
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
set search_path = ''
as $$
declare
  v_session public.game_sessions%rowtype;
  v_player public.players%rowtype;
  v_nickname text;
  v_team public.teams%rowtype;
  v_max_players constant integer := 100;
begin
  v_nickname := btrim(regexp_replace(coalesce(p_nickname, ''), '[[:cntrl:]]', '', 'g'));
  v_nickname := regexp_replace(v_nickname, '\s+', ' ', 'g');
  if char_length(v_nickname) < 2 or char_length(v_nickname) > 24 then
    raise exception 'Nickname must contain 2 to 24 characters.';
  end if;
  if private.has_blocked_term(v_nickname) then
    raise exception 'Please choose a different nickname.';
  end if;

  select gs.*
    into v_session
    from public.game_sessions as gs
   where gs.room_code = btrim(p_room_code)
     and gs.state = 'lobby'
     and gs.locked = false
     and gs.expires_at > now()
   limit 1
   for update;

  if not found then
    raise exception 'Room is unavailable, locked, started or expired.';
  end if;

  if exists (
    select 1 from public.players as p
    where p.session_id = v_session.id and p.removed and lower(p.nickname) = lower(v_nickname)
  ) then
    raise exception 'Your teacher removed this name from the room.';
  end if;

  if (
    select count(*) from public.players as p
    where p.session_id = v_session.id and p.removed = false
  ) >= v_max_players then
    raise exception 'This room is full.';
  end if;

  if v_session.mode = 'team' then
    select t.*
      into v_team
      from public.teams as t
      left join public.players as p
        on p.team_id = t.id
       and p.removed = false
     where t.session_id = v_session.id
     group by t.id
     order by count(p.id), t.sort_order
     limit 1;
  end if;

  begin
    insert into public.players(session_id, nickname, team_id)
    values (
      v_session.id,
      v_nickname,
      case when v_session.mode = 'team' then v_team.id else null end
    )
    returning * into v_player;
  exception
    when unique_violation then
      raise exception 'That nickname is already being used in this room.';
  end;

  return query
  select
    v_session.id,
    v_player.id,
    v_player.player_token,
    a.title,
    v_session.mode,
    v_session.state,
    v_player.team_id,
    v_team.name,
    v_team.color
  from public.activity_sets as a
  where a.id = v_session.activity_set_id;
end;
$$;

revoke execute on function public.join_classplay_room(text, text) from public;
grant execute on function public.join_classplay_room(text, text) to anon, authenticated;

-- Student usernames go through the same moderation.
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
  if private.has_blocked_term(v_username) then
    raise exception 'Please choose a different username.' using errcode='22023';
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

-- 3.1 Authoritative student snapshot -----------------------------------------------
-- Realtime broadcasts are only hints now: students re-read the room through
-- this RPC, so a forged broadcast cannot change what a phone shows. The
-- final ranking therefore has to come from the database as well.
create or replace function public.resume_classplay_player(p_player_id uuid, p_player_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players%rowtype;
  v_session public.game_sessions%rowtype;
  v_activity_title text;
  v_team public.teams%rowtype;
  v_public_settings jsonb;
  v_grid_state jsonb;
  v_public_tiles jsonb;
  v_grid_phase text;
  v_live_mode text;
  v_leaderboard jsonb := '[]'::jsonb;
  v_leaderboard_kind text := 'individual';
begin
  select * into v_player
  from public.players
  where id = p_player_id
    and player_token = p_player_token
    and removed = false;

  if not found then
    raise exception 'Player session is invalid.';
  end if;

  select * into v_session
  from public.game_sessions
  where id = v_player.session_id
    and state <> 'closed'
    and expires_at > now();

  if not found then
    raise exception 'Room is no longer active.';
  end if;

  select title into v_activity_title
  from public.activity_sets
  where id = v_session.activity_set_id;

  if v_player.team_id is not null then
    select * into v_team from public.teams where id = v_player.team_id;
  end if;

  update public.players
  set last_seen_at = now()
  where id = v_player.id;

  v_public_settings := v_session.settings;
  v_live_mode := coalesce(v_public_settings->>'liveGameMode', '');

  if v_live_mode = 'wildcard-grid'
     and jsonb_typeof(v_public_settings->'wildcardGridState') = 'object' then
    v_grid_state := v_public_settings->'wildcardGridState';
    v_grid_phase := coalesce(v_grid_state->>'phase', 'board');

    select coalesce(
      jsonb_agg(jsonb_set(tile, '{wildcard}', 'null'::jsonb, true) order by ordinal),
      '[]'::jsonb
    )
    into v_public_tiles
    from jsonb_array_elements(coalesce(v_grid_state->'tiles', '[]'::jsonb)) with ordinality as tiles(tile, ordinal);

    v_grid_state := jsonb_set(v_grid_state, '{tiles}', v_public_tiles, true);

    if v_grid_phase <> 'wildcard' then
      v_grid_state := jsonb_set(v_grid_state, '{pendingWildcard}', 'null'::jsonb, true);
    end if;

    v_public_settings := jsonb_set(v_public_settings, '{wildcardGridState}', v_grid_state, true);
  end if;

  if v_session.state = 'final_results' then
    if v_live_mode = 'wildcard-grid' then
      v_leaderboard_kind := 'team';
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'score', t.score) order by t.score desc, t.name), '[]'::jsonb)
        into v_leaderboard
        from (
          select tm.id, tm.name,
                 coalesce((v_session.settings->'wildcardGridState'->'teamScores'->>tm.id::text)::integer, 0) as score
          from public.teams tm
          where tm.session_id = v_session.id
        ) as t;
    elsif v_live_mode = 'dynamite' then
      v_leaderboard := '[]'::jsonb;
    elsif coalesce((v_session.settings->>'leaderboardEnabled')::boolean, true) then
      if v_session.mode = 'team' then
        v_leaderboard_kind := 'team';
        select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'score', t.score) order by t.score desc, t.name), '[]'::jsonb)
          into v_leaderboard
          from (
            select tm.id, tm.name, coalesce(sum(p.score), 0)::integer as score
            from public.teams tm
            left join public.players p on p.team_id = tm.id and p.removed = false
            where tm.session_id = v_session.id
            group by tm.id, tm.name
            order by score desc, tm.name
            limit 10
          ) as t;
      else
        select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.nickname, 'score', t.score) order by t.score desc, t.nickname), '[]'::jsonb)
          into v_leaderboard
          from (
            select p.id, p.nickname, p.score
            from public.players p
            where p.session_id = v_session.id and p.removed = false
            order by p.score desc, p.nickname
            limit 10
          ) as t;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'sessionId', v_session.id,
    'roomCode', v_session.room_code,
    'activityTitle', v_activity_title,
    'mode', v_session.mode,
    'state', v_session.state,
    'settings', v_public_settings,
    'currentQuestion', case
      when v_session.current_question is null then null
      else v_session.current_question - 'correctAnswer'
    end,
    'revealedAnswer', case
      when v_session.state = 'round_results' then v_session.current_question->>'correctAnswer'
      else null
    end,
    'leaderboard', v_leaderboard,
    'leaderboardKind', v_leaderboard_kind,
    'player', jsonb_build_object(
      'id', v_player.id,
      'sessionId', v_player.session_id,
      'nickname', v_player.nickname,
      'teamId', v_player.team_id,
      'score', v_player.score,
      'correctCount', v_player.correct_count,
      'totalAnswers', v_player.total_answers,
      'connectedAt', v_player.connected_at,
      'lastSeenAt', now(),
      'removed', false
    ),
    'team', case
      when v_team.id is null then null
      else jsonb_build_object('id', v_team.id, 'name', v_team.name, 'color', v_team.color)
    end
  );
end;
$$;

revoke execute on function public.resume_classplay_player(uuid, uuid) from public;
grant execute on function public.resume_classplay_player(uuid, uuid) to anon, authenticated;
