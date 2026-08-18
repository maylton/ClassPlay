-- Fix live room joins failing with PostgreSQL error 42702 because the
-- RETURNS TABLE output column `state` collided with game_sessions.state.
-- Qualify game_sessions columns explicitly inside join_classplay_room.

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
  v_nickname := regexp_replace(v_nickname, '\s+', ' ', 'g');
  if char_length(v_nickname) < 2 or char_length(v_nickname) > 24 then
    raise exception 'Nickname must contain 2 to 24 characters.';
  end if;

  select gs.*
    into v_session
    from public.game_sessions as gs
   where gs.room_code = trim(p_room_code)
     and gs.state = 'lobby'
     and gs.locked = false
     and gs.expires_at > now()
   limit 1;

  if not found then
    raise exception 'Room is unavailable, locked, started or expired.';
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
