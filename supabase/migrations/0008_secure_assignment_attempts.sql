-- Assignment results are authoritative at the database boundary.
-- Students cannot bypass a fixed game mode or attempt limit from the browser.

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

  if v_assignment.attempts_limit is not null then
    select count(*)::integer into v_attempt_count
    from public.assignment_attempts t
    where t.assignment_id = v_assignment.id and t.member_id = v_member.id;
    if v_attempt_count >= v_assignment.attempts_limit then
      raise exception 'You have used all attempts for this assignment.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.assignment_attempts(assignment_id, member_id, game_type, score, correct, total)
  values (v_assignment.id, v_member.id, p_game_type, p_score, p_correct, p_total)
  returning * into v_attempt;

  return v_attempt;
end;
$$;

revoke insert on table public.assignment_attempts from authenticated;
drop policy if exists "assignment attempts student insert" on public.assignment_attempts;
revoke execute on function public.submit_assignment_attempt(uuid, uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.submit_assignment_attempt(uuid, uuid, text, integer, integer, integer) to authenticated;
