-- Remediation plan, phases 4 and 5 (docs/REMEDIATION_PLAN.md).
--   4.1 practice links are no longer enumerable   4.2 shared activity images
--   4.4 transactional save + answers keep history  4.5 retention of live data
--   5.x target language, strict accents, accepted answers

-- Helpers used by RLS policies --------------------------------------------------
-- Policies run as the caller (often anon), so the helpers are security definer
-- and live in the non-exposed private schema.
grant usage on schema private to anon, authenticated;

create or replace function private.is_unlisted_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(select 1 from public.activity_sets a where a.id = p_activity_id and a.visibility = 'unlisted');
$$;

create or replace function private.is_listed_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.community_listings l
    join public.activity_sets a on a.id = l.activity_set_id
    where l.activity_set_id = p_activity_id and a.visibility = 'unlisted'
  );
$$;

-- Same eligibility rules as the 0021 practice-score policy, evaluated with
-- definer rights now that anon can no longer read unlisted items directly.
create or replace function private.practice_score_allowed(p_activity_id uuid, p_game_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_unlisted_activity(p_activity_id)
    and (
      exists (
        select 1 from public.activity_games g
        where g.activity_set_id = p_activity_id and g.game_type = p_game_type
      )
      or (
        p_game_type in ('boss-battle', 'bubble-burst', 'grammar-runner', 'tower-stack', 'word-hunt', 'typing-rush')
        and (
          (
            3 <= (
              select count(*) from public.activity_items i
              where i.activity_set_id = p_activity_id
                and char_length(btrim(coalesce(i.prompt, ''))) > 0
                and char_length(btrim(coalesce(i.answer, ''))) > 0
            )
            and 2 <= (
              select count(distinct lower(btrim(i.answer))) from public.activity_items i
              where i.activity_set_id = p_activity_id
                and char_length(btrim(coalesce(i.prompt, ''))) > 0
                and char_length(btrim(coalesce(i.answer, ''))) > 0
            )
          )
          or 3 <= (
            select count(*) from public.activity_items i
            where i.activity_set_id = p_activity_id
              and position('___' in coalesce(i.gap_sentence, '')) > 0
              and (char_length(btrim(coalesce(i.answer, ''))) > 0 or char_length(btrim(coalesce(i.prompt, ''))) > 0)
          )
        )
      )
      or (
        p_game_type = 'echo-chain'
        and 6 <= (
          select count(*) from public.activity_items i
          where i.activity_set_id = p_activity_id
            and char_length(btrim(coalesce(i.prompt, ''))) > 0
            and char_length(btrim(coalesce(i.answer, ''))) > 0
        )
        and 6 <= (
          select count(distinct lower(btrim(i.answer))) from public.activity_items i
          where i.activity_set_id = p_activity_id
            and char_length(btrim(coalesce(i.prompt, ''))) > 0
            and char_length(btrim(coalesce(i.answer, ''))) > 0
        )
      )
      or (
        p_game_type = 'phrase-forge'
        and 2 <= (
          select count(*) from public.activity_items i
          where i.activity_set_id = p_activity_id
            and (
              (
                char_length(btrim(coalesce(i.example, ''))) > 0
                and coalesce(array_length(regexp_split_to_array(btrim(i.example), E'\\s+'), 1), 0) >= 3
              )
              or (
                char_length(btrim(coalesce(i.example, ''))) = 0
                and jsonb_typeof(i.sentence_parts) = 'array'
                and jsonb_array_length(i.sentence_parts) > 1
                and 3 <= (
                  select count(*)
                  from regexp_split_to_table(
                    coalesce((select string_agg(value, ' ') from jsonb_array_elements_text(i.sentence_parts)), ''),
                    E'\\s+'
                  ) as parts(word)
                  where btrim(word) <> ''
                )
              )
            )
        )
      )
    );
$$;

revoke execute on function private.is_unlisted_activity(uuid), private.is_listed_activity(uuid), private.practice_score_allowed(uuid, text) from public;
grant execute on function private.is_unlisted_activity(uuid), private.is_listed_activity(uuid), private.practice_score_allowed(uuid, text) to anon, authenticated;

-- 4.1 Practice links are reachable only by exact ID ----------------------------------
-- Before: anyone could `select * from activity_sets where visibility = 'unlisted'`
-- and download every practice deck (with answers and owner IDs). Now only
-- Community-listed activities are publicly readable; a practice link is served
-- by get_practice_activity(id), which needs the exact ID and hides owner data.
drop policy if exists "unlisted activities link read" on public.activity_sets;
drop policy if exists "unlisted activity items link read" on public.activity_items;
drop policy if exists "unlisted activity games link read" on public.activity_games;

drop policy if exists "community activities public read" on public.activity_sets;
create policy "community activities public read" on public.activity_sets
  for select to anon, authenticated
  using ((select private.is_listed_activity(id)));
drop policy if exists "community activity items public read" on public.activity_items;
create policy "community activity items public read" on public.activity_items
  for select to anon, authenticated
  using ((select private.is_listed_activity(activity_set_id)));
drop policy if exists "community activity games public read" on public.activity_games;
create policy "community activity games public read" on public.activity_games
  for select to anon, authenticated
  using ((select private.is_listed_activity(activity_set_id)));

drop policy if exists "community listings public read" on public.community_listings;
create policy "community listings public read" on public.community_listings
  for select to anon, authenticated
  using ((select private.is_listed_activity(activity_set_id)));

drop policy if exists "unlisted practice scores link read" on public.practice_scores;
create policy "unlisted practice scores link read" on public.practice_scores
  for select to anon, authenticated
  using ((select private.is_unlisted_activity(activity_set_id)));
drop policy if exists "unlisted practice scores link submit" on public.practice_scores;
create policy "unlisted practice scores link submit" on public.practice_scores
  for insert to anon, authenticated
  with check ((select private.practice_score_allowed(activity_set_id, game_type)));

-- 5.x columns (added before the RPCs below so they are part of the payloads) -------
alter table public.activity_sets
  add column if not exists target_language text not null default 'en',
  add column if not exists strict_accents boolean not null default false;
alter table public.activity_sets drop constraint if exists activity_sets_target_language_check;
alter table public.activity_sets
  add constraint activity_sets_target_language_check check (target_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$');

alter table public.activity_items
  add column if not exists accepted_answers jsonb not null default '[]'::jsonb;
alter table public.activity_items drop constraint if exists activity_items_accepted_answers_check;
alter table public.activity_items
  add constraint activity_items_accepted_answers_check check (jsonb_typeof(accepted_answers) = 'array');

create or replace function public.get_practice_activity(p_activity_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (to_jsonb(a) - 'owner_id' - 'source_local_id')
    || jsonb_build_object(
      'activity_items', coalesce((
        select jsonb_agg(to_jsonb(i) order by i.sort_order)
        from public.activity_items i
        where i.activity_set_id = a.id
      ), '[]'::jsonb),
      'activity_games', coalesce((
        select jsonb_agg(jsonb_build_object('game_type', g.game_type, 'settings', g.settings))
        from public.activity_games g
        where g.activity_set_id = a.id
      ), '[]'::jsonb)
    )
  from public.activity_sets a
  where a.id = p_activity_id and a.visibility = 'unlisted';
$$;

revoke execute on function public.get_practice_activity(uuid) from public;
grant execute on function public.get_practice_activity(uuid) to anon, authenticated;

create or replace view public.community_catalog
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
    select i.image_url
    from public.activity_items i
    where i.activity_set_id = a.id
      and i.image_url is not null
    order by i.sort_order
    limit 1
  ) as cover_image_url,
  (
    select count(*)::integer
    from public.activity_items i
    where i.activity_set_id = a.id
  ) as item_count,
  array(
    select g.game_type
    from public.activity_games g
    where g.activity_set_id = a.id
    order by g.game_type
  ) as game_modes,
  a.ai_generated,
  a.target_language
from public.community_listings l
join public.activity_sets a on a.id = l.activity_set_id
where a.visibility = 'unlisted';

-- 4.2 Shared activity images -------------------------------------------------------
-- An uploaded image may be read by anyone who can see an activity that uses it:
-- practice links, Community listings, assigned students, and teachers who copied
-- a Community activity into their own library.
create index if not exists activity_items_image_url_idx
  on public.activity_items(image_url) where image_url is not null;

create or replace function private.can_view_activity_media(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.activity_items i
    join public.activity_sets a on a.id = i.activity_set_id
    where i.image_url = 'storage:activity-media/' || p_object_name
      and (
        a.visibility = 'unlisted'
        or a.owner_id = auth.uid()
        or private.can_read_assigned_activity(a.id)
      )
  );
$$;
revoke execute on function private.can_view_activity_media(text) from public;
grant execute on function private.can_view_activity_media(text) to anon, authenticated;

drop policy if exists "activity media shared read" on storage.objects;
create policy "activity media shared read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'activity-media' and private.can_view_activity_media(name));

-- 4.4 Live answers survive activity edits ---------------------------------------------
-- Removing an item used to cascade-delete every live answer to it. Keep the answer
-- (item_id becomes null) and store the question text in the payload instead.
alter table public.answers alter column item_id drop not null;
alter table public.answers drop constraint if exists answers_item_id_fkey;
alter table public.answers
  add constraint answers_item_id_fkey foreign key (item_id) references public.activity_items(id) on delete set null;

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
set search_path = ''
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
  values (
    v_session.id, v_player.id, p_item_id,
    jsonb_build_object('answer', p_answer_text, 'prompt', v_session.current_question->>'prompt', 'correctAnswer', v_session.current_question->>'correctAnswer'),
    v_correct, v_response_ms, v_points
  );

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

revoke execute on function public.submit_classplay_answer(uuid, uuid, uuid, text, integer) from public;
grant execute on function public.submit_classplay_answer(uuid, uuid, uuid, text, integer) to anon, authenticated;

-- 4.4 Transactional save -----------------------------------------------------------------
-- The browser used to save an activity in five separate requests; a failure in the
-- middle left a half-saved deck. One invoker-rights call keeps RLS in force and
-- runs in a single transaction.
create or replace function public.save_activity(p_activity jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid := (p_activity->>'id')::uuid;
  v_item_ids uuid[];
  v_games text[];
begin
  if v_user_id is null then
    raise exception 'Teacher session required.' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Activity id is required.' using errcode = '22023';
  end if;

  insert into public.activity_sets(
    id, owner_id, source_local_id, title, description, subject, topic, cefr_level, grade, kind, visibility,
    target_language, strict_accents, created_at, updated_at
  )
  values (
    v_id, v_user_id, nullif(p_activity->>'source_local_id', ''),
    coalesce(p_activity->>'title', 'Untitled activity'),
    coalesce(p_activity->>'description', ''),
    coalesce(p_activity->>'subject', 'English'),
    coalesce(p_activity->>'topic', 'English practice'),
    coalesce(p_activity->>'cefr_level', 'A1–A2'),
    coalesce(p_activity->>'grade', 'Class'),
    coalesce(p_activity->>'kind', 'mixed'),
    coalesce(p_activity->>'visibility', 'private'),
    coalesce(nullif(p_activity->>'target_language', ''), 'en'),
    coalesce((p_activity->>'strict_accents')::boolean, false),
    coalesce((p_activity->>'created_at')::timestamptz, now()),
    now()
  )
  on conflict (id) do update set
    source_local_id = excluded.source_local_id,
    title = excluded.title,
    description = excluded.description,
    subject = excluded.subject,
    topic = excluded.topic,
    cefr_level = excluded.cefr_level,
    grade = excluded.grade,
    kind = excluded.kind,
    visibility = excluded.visibility,
    target_language = excluded.target_language,
    strict_accents = excluded.strict_accents,
    updated_at = now();

  select coalesce(array_agg(x.id), '{}') into v_item_ids
  from jsonb_to_recordset(coalesce(p_activity->'items', '[]'::jsonb)) as x(id uuid);

  delete from public.activity_items i
  where i.activity_set_id = v_id and not (i.id = any(v_item_ids));

  insert into public.activity_items(
    id, activity_set_id, sort_order, prompt, answer, hint, image_url, example, gap_sentence,
    distractors, sentence_parts, accepted_answers
  )
  select
    (e.item->>'id')::uuid, v_id, (e.ordinality - 1)::integer,
    coalesce(e.item->>'prompt', ''), coalesce(e.item->>'answer', ''),
    nullif(e.item->>'hint', ''), nullif(e.item->>'image_url', ''),
    nullif(e.item->>'example', ''), nullif(e.item->>'gap_sentence', ''),
    case when jsonb_typeof(e.item->'distractors') = 'array' then e.item->'distractors' else '[]'::jsonb end,
    case when jsonb_typeof(e.item->'sentence_parts') = 'array' then e.item->'sentence_parts' else '[]'::jsonb end,
    case when jsonb_typeof(e.item->'accepted_answers') = 'array' then e.item->'accepted_answers' else '[]'::jsonb end
  from jsonb_array_elements(coalesce(p_activity->'items', '[]'::jsonb)) with ordinality as e(item, ordinality)
  on conflict (id) do update set
    sort_order = excluded.sort_order,
    prompt = excluded.prompt,
    answer = excluded.answer,
    hint = excluded.hint,
    image_url = excluded.image_url,
    example = excluded.example,
    gap_sentence = excluded.gap_sentence,
    distractors = excluded.distractors,
    sentence_parts = excluded.sentence_parts,
    accepted_answers = excluded.accepted_answers
  where public.activity_items.activity_set_id = v_id;

  select coalesce(array_agg(g), '{}') into v_games
  from jsonb_array_elements_text(coalesce(p_activity->'games', '[]'::jsonb)) as g;

  delete from public.activity_games g
  where g.activity_set_id = v_id and not (g.game_type = any(v_games));

  insert into public.activity_games(activity_set_id, game_type, settings)
  select v_id, g, '{}'::jsonb from unnest(v_games) as g
  on conflict (activity_set_id, game_type) do nothing;

  return v_id;
end;
$$;

revoke execute on function public.save_activity(jsonb) from public, anon;
grant execute on function public.save_activity(jsonb) to authenticated;

-- 4.5 Retention of live-room data ----------------------------------------------------------
-- Live rooms hold students' nicknames and answers. Purge rooms that ended or
-- expired more than p_days ago (players, answers, teams and results cascade).
create or replace function private.purge_expired_live_sessions(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.game_sessions s
  where coalesce(s.ended_at, s.expires_at) < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke execute on function private.purge_expired_live_sessions(integer) from public, anon, authenticated;

-- Schedule daily when pg_cron is enabled (Dashboard → Database → Extensions).
-- Without it, run `select private.purge_expired_live_sessions(90);` manually.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('classplay-purge-live-sessions', '17 3 * * *', 'select private.purge_expired_live_sessions(90)');
  end if;
end $$;
