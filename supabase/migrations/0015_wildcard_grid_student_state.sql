-- ClassPlay v0.8 — Wildcard Grid student-state hardening
-- Student reconnects must never receive hidden tile assignments.

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

  if coalesce(v_public_settings->>'liveGameMode', '') = 'wildcard-grid'
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
