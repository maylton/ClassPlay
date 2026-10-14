-- Remediation plan: remaining items (docs/REMEDIATION_PLAN.md).
--   4.5 data rights: export_my_data() and delete_my_account()
--   5.7 one source of truth for derived Arcade modes (activity_sets.derived_modes)

-- 5.7 Derived Arcade modes ------------------------------------------------------------
-- The browser already decides which derived Arcade modes an activity unlocks
-- (getDerivedArcadeReadiness). It now stores that list on save, and the practice
-- leaderboard trusts it instead of re-implementing the rules in SQL. Activities
-- saved before this migration keep the old SQL rules (derived_modes is null).
alter table public.activity_sets
  add column if not exists derived_modes text[];
alter table public.activity_sets drop constraint if exists activity_sets_derived_modes_check;
alter table public.activity_sets
  add constraint activity_sets_derived_modes_check check (
    derived_modes is null or derived_modes <@ array[
      'boss-battle', 'bubble-burst', 'grammar-runner', 'phrase-forge',
      'tower-stack', 'word-hunt', 'typing-rush', 'echo-chain'
    ]::text[]
  );

-- Keep the 0025 rules as the fallback for activities without a stored list.
alter function private.practice_score_allowed(uuid, text) rename to practice_score_allowed_legacy;
revoke execute on function private.practice_score_allowed_legacy(uuid, text) from public, anon, authenticated;

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
      or coalesce(
        (select p_game_type = any(a.derived_modes) from public.activity_sets a where a.id = p_activity_id),
        private.practice_score_allowed_legacy(p_activity_id, p_game_type)
      )
    );
$$;
revoke execute on function private.practice_score_allowed(uuid, text) from public;
grant execute on function private.practice_score_allowed(uuid, text) to anon, authenticated;

-- Policies reference functions by OID, so the renamed legacy function would
-- otherwise keep serving the policy. Point it at the new function.
drop policy if exists "unlisted practice scores link submit" on public.practice_scores;
create policy "unlisted practice scores link submit" on public.practice_scores
  for insert to anon, authenticated
  with check ((select private.practice_score_allowed(activity_set_id, game_type)));

-- save_activity: same as 0025, plus derived_modes.
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
  v_derived text[];
begin
  if v_user_id is null then
    raise exception 'Teacher session required.' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Activity id is required.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_activity->'derived_modes') = 'array' then
    select coalesce(array_agg(m), '{}') into v_derived
    from jsonb_array_elements_text(p_activity->'derived_modes') as m;
  end if;

  insert into public.activity_sets(
    id, owner_id, source_local_id, title, description, subject, topic, cefr_level, grade, kind, visibility,
    target_language, strict_accents, derived_modes, created_at, updated_at
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
    v_derived,
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
    derived_modes = excluded.derived_modes,
    updated_at = now();

  select coalesce(array_agg((e.item->>'id')::uuid), '{}') into v_item_ids
  from jsonb_array_elements(coalesce(p_activity->'items', '[]'::jsonb)) as e(item);

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

-- 4.5 Data rights (LGPD) ------------------------------------------------------------------
-- Every signed-in user (teacher or student) can download what ClassPlay stores
-- about them and delete their account. Both are bound to auth.uid().
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sign in to export your data.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at) from auth.users u where u.id = v_user_id),
    'teacher_profile', (select to_jsonb(p) from public.profiles p where p.id = v_user_id),
    'student_profile', (select to_jsonb(s) from public.student_profiles s where s.user_id = v_user_id),
    'activities', coalesce((
      select jsonb_agg(
        to_jsonb(a)
        || jsonb_build_object(
          'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order) from public.activity_items i where i.activity_set_id = a.id), '[]'::jsonb),
          'games', coalesce((select jsonb_agg(g.game_type) from public.activity_games g where g.activity_set_id = a.id), '[]'::jsonb),
          'practice_scores', coalesce((select jsonb_agg(to_jsonb(ps)) from public.practice_scores ps where ps.activity_set_id = a.id), '[]'::jsonb)
        )
        order by a.created_at
      )
      from public.activity_sets a where a.owner_id = v_user_id
    ), '[]'::jsonb),
    'community_listings', coalesce((select jsonb_agg(to_jsonb(l)) from public.community_listings l where l.owner_id = v_user_id), '[]'::jsonb),
    'classes_taught', coalesce((
      select jsonb_agg(
        to_jsonb(c)
        || jsonb_build_object(
          'members', coalesce((select jsonb_agg(to_jsonb(m)) from public.class_members m where m.classroom_id = c.id), '[]'::jsonb),
          'assignments', coalesce((
            select jsonb_agg(to_jsonb(asg) || jsonb_build_object(
              'attempts', coalesce((select jsonb_agg(to_jsonb(att)) from public.assignment_attempts att where att.assignment_id = asg.id), '[]'::jsonb)
            ))
            from public.assignments asg where asg.classroom_id = c.id
          ), '[]'::jsonb)
        )
      )
      from public.classrooms c where c.owner_id = v_user_id
    ), '[]'::jsonb),
    'class_memberships', coalesce((
      select jsonb_agg(
        to_jsonb(m)
        || jsonb_build_object(
          'classroom_name', (select c.name from public.classrooms c where c.id = m.classroom_id),
          'attempts', coalesce((select jsonb_agg(to_jsonb(att)) from public.assignment_attempts att where att.member_id = m.id), '[]'::jsonb)
        )
      )
      from public.class_members m where m.user_id = v_user_id
    ), '[]'::jsonb),
    'live_sessions_hosted', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'room_code', s.room_code, 'state', s.state, 'created_at', s.created_at, 'ended_at', s.ended_at,
        'players', (select count(*) from public.players p where p.session_id = s.id)
      ) order by s.created_at)
      from public.game_sessions s where s.host_id = v_user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- Deleting the auth user cascades to everything the account owns: profiles,
-- activities (items, games, practice scores, Community listings), classes
-- (members, assignments, attempts), class memberships and hosted live rooms.
-- Uploaded images must be removed through the Storage API first (the browser
-- does that before calling this function).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sign in to delete your account.' using errcode = '42501';
  end if;
  delete from auth.users where id = v_user_id;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
