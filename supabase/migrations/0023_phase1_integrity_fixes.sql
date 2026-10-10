-- Remediation plan, phase 1 (docs/REMEDIATION_PLAN.md, items 1.3, 1.4, 1.6).

-- 1.4 — Authoritative round clock -------------------------------------------
-- The 0001 trigger reset round_started_at to now() on *every* current_question
-- change. Dynamite writes in-turn updates (wrong-answer penalties, passedBy)
-- to current_question, so the trigger silently erased the penalty and the
-- forced explosion on the server. Restart the clock only when a new question
-- or turn is published; in-turn updates keep the value they wrote.
create or replace function public.set_round_started_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state = 'playing'
     and (
       (new.current_question->>'itemId') is distinct from (old.current_question->>'itemId')
       or (new.current_question->>'index') is distinct from (old.current_question->>'index')
       or (new.current_question->>'dynamiteTurnId') is distinct from (old.current_question->>'dynamiteTurnId')
       or (new.current_question->>'wildcardTileNumber') is distinct from (old.current_question->>'wildcardTileNumber')
     ) then
    new.round_started_at = now();
  end if;
  return new;
end;
$$;

-- 1.6 — Answer normalization --------------------------------------------------
-- 0001 used '\\s+', which (with standard_conforming_strings) matches a literal
-- backslash followed by "s" instead of whitespace. Also fold the typographic
-- apostrophes that phone keyboards insert into a plain apostrophe.
create or replace function public.classplay_normalize(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(regexp_replace(
    translate(coalesce(value, ''), '’‘ʼ', repeat(chr(39), 3)),
    '\s+', ' ', 'g'
  )));
$$;

-- 1.3 — Removed students must not rejoin with the class key ------------------
-- The previous upsert set active = true on conflict, silently undoing a
-- teacher's removal. A teacher can still readmit by setting active = true.
create or replace function public.join_classroom_account(p_join_code text)
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
  v_student public.student_profiles%rowtype;
  v_existing public.class_members%rowtype;
  v_member public.class_members%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in before joining a class.' using errcode='42501';
  end if;

  select * into v_student
  from public.student_profiles s
  where s.user_id = v_user_id
  limit 1;
  if v_student.user_id is null then
    raise exception 'Create your student profile first.' using errcode='42501';
  end if;

  select * into v_class
  from public.classrooms c
  where c.join_code = upper(btrim(p_join_code)) and c.join_enabled
  limit 1;
  if v_class.id is null then
    raise exception 'Class code not found or joining is closed.' using errcode='P0002';
  end if;

  select * into v_existing
  from public.class_members m
  where m.classroom_id = v_class.id and m.user_id = v_user_id
  limit 1;
  if v_existing.id is not null and not v_existing.active then
    raise exception 'You were removed from this class. Ask your teacher to readmit you.' using errcode='42501';
  end if;

  insert into public.class_members(classroom_id, user_id, display_name, active)
  values (v_class.id, v_user_id, v_student.username, true)
  on conflict on constraint class_members_classroom_id_user_id_key do update
    set display_name = excluded.display_name
  returning * into v_member;

  return query
  select v_class.id, v_class.name, v_class.school_year, v_member.id, v_member.display_name;
end;
$$;

revoke execute on function public.join_classroom_account(text) from public, anon;
grant execute on function public.join_classroom_account(text) to authenticated;
