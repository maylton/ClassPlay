-- The join RPC returns a column named classroom_id, which makes a bare
-- ON CONFLICT (classroom_id, user_id) ambiguous inside PL/pgSQL. Target the
-- table's unique constraint explicitly.

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

  insert into public.class_members(classroom_id, user_id, display_name, active)
  values (v_class.id, v_user_id, v_student.username, true)
  on conflict on constraint class_members_classroom_id_user_id_key do update
    set display_name = excluded.display_name, active = true
  returning * into v_member;

  return query
  select v_class.id, v_class.name, v_class.school_year, v_member.id, v_member.display_name;
end;
$$;
