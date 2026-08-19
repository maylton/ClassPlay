create or replace function public.submit_dynamite_attempt(
  p_player_id uuid,
  p_player_token uuid,
  p_item_id uuid,
  p_turn_id text,
  p_answer_text text
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
  v_correct boolean := false;
  v_timer_seconds integer := 10;
  v_points integer := 0;
begin
  select *
  into v_player
  from public.players
  where id = p_player_id
    and player_token = p_player_token
    and removed = false;

  if not found then
    raise exception 'Player session is invalid.';
  end if;

  select *
  into v_session
  from public.game_sessions
  where id = v_player.session_id
    and state = 'playing'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'This Dynamite turn is not accepting answers.';
  end if;

  if coalesce(v_session.settings->>'liveGameMode', '') <> 'dynamite' then
    raise exception 'This room is not running Dynamite.';
  end if;

  if coalesce(v_session.current_question->>'itemId', '') <> p_item_id::text
     or coalesce(v_session.current_question->>'dynamiteTurnId', '') <> p_turn_id then
    raise exception 'This Dynamite turn is no longer active.';
  end if;

  if coalesce(v_session.current_question->>'activePlayerId', '') <> p_player_id::text then
    raise exception 'The Dynamite is not in your hands yet.';
  end if;

  if coalesce(v_session.current_question->>'passedBy', '') <> '' then
    return jsonb_build_object(
      'correct', true,
      'passed', true,
      'timeUp', false,
      'points', 0,
      'score', v_player.score,
      'alreadyPassed', true
    );
  end if;

  v_timer_seconds := coalesce(
    (v_session.settings->>'dynamiteTimerSeconds')::integer,
    (v_session.settings->>'timerSeconds')::integer,
    10
  );
  if v_timer_seconds not in (10, 15, 20) then
    v_timer_seconds := 10;
  end if;

  if v_session.round_started_at is null
     or now() >= v_session.round_started_at + make_interval(secs => v_timer_seconds) then
    return jsonb_build_object(
      'correct', false,
      'passed', false,
      'timeUp', true,
      'points', 0,
      'score', v_player.score,
      'alreadyPassed', false
    );
  end if;

  select *
  into v_item
  from public.activity_items
  where id = p_item_id
    and activity_set_id = v_session.activity_set_id;

  if not found then
    raise exception 'Question item not found.';
  end if;

  v_correct := public.classplay_normalize(p_answer_text)
    = public.classplay_normalize(coalesce(v_session.current_question->>'correctAnswer', v_item.answer));

  if v_correct then
    v_points := 100;

    update public.game_sessions
    set current_question = current_question || jsonb_build_object(
      'passedBy', p_player_id::text,
      'passedAt', now()::text
    ),
    updated_at = now()
    where id = v_session.id;

    update public.players
    set score = score + v_points,
        correct_count = correct_count + 1,
        total_answers = total_answers + 1,
        last_seen_at = now()
    where id = v_player.id
    returning * into v_player;
  else
    update public.players
    set total_answers = total_answers + 1,
        last_seen_at = now()
    where id = v_player.id
    returning * into v_player;
  end if;

  return jsonb_build_object(
    'correct', v_correct,
    'passed', v_correct,
    'timeUp', false,
    'points', v_points,
    'score', v_player.score,
    'alreadyPassed', false
  );
end;
$$;

revoke execute on function public.submit_dynamite_attempt(uuid, uuid, uuid, text, text) from public;
revoke execute on function public.submit_dynamite_attempt(uuid, uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.submit_dynamite_attempt(uuid, uuid, uuid, text, text) to anon, authenticated;
