-- ClassPlay v0.8 — Wildcard Grid result persistence
-- Wildcard Grid owns a team score that is intentionally independent from player scores.

create or replace function public.finalize_classplay_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.game_sessions%rowtype;
begin
  select * into v_session
  from public.game_sessions
  where id = p_session_id
    and host_id = auth.uid();

  if not found then
    raise exception 'Host session not found.';
  end if;

  delete from public.game_results where session_id = p_session_id;

  if coalesce(v_session.settings->>'liveGameMode', '') = 'wildcard-grid' then
    insert into public.game_results(session_id, player_id, team_id, score, correct, total, accuracy)
    select
      p_session_id,
      null,
      t.id,
      greatest(
        0,
        coalesce(
          (v_session.settings->'wildcardGridState'->'teamScores'->>t.id::text)::integer,
          0
        )
      ),
      0,
      0,
      0
    from public.teams t
    where t.session_id = p_session_id;
  else
    insert into public.game_results(session_id, player_id, team_id, score, correct, total, accuracy)
    select
      p_session_id,
      p.id,
      p.team_id,
      p.score,
      p.correct_count,
      p.total_answers,
      case
        when p.total_answers = 0 then 0
        else round((p.correct_count::numeric / p.total_answers::numeric) * 100, 2)
      end
    from public.players p
    where p.session_id = p_session_id
      and p.removed = false;
  end if;

  update public.game_sessions
  set state = 'final_results', ended_at = now(), current_question = null
  where id = p_session_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.finalize_classplay_session(uuid) from public, anon;
grant execute on function public.finalize_classplay_session(uuid) to authenticated;
