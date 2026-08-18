-- ClassPlay v0.2 — Supabase security hardening
-- Addresses Security Advisor warnings that are not intentional parts of the
-- anonymous student RPC surface.

alter function public.set_updated_at() set search_path = public;
alter function public.set_round_started_at() set search_path = public;
alter function public.classplay_normalize(text) set search_path = public;

-- Internal trigger helper must never be exposed as a client RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Finalization is host-only. Keep anon explicitly denied.
revoke execute on function public.finalize_classplay_session(uuid) from public, anon;
grant execute on function public.finalize_classplay_session(uuid) to authenticated;

-- These three SECURITY DEFINER RPCs intentionally remain available to anonymous
-- students because they are the narrow ClassPlay student API. join validates room
-- state/code; resume and submit additionally require a random per-player token.
revoke execute on function public.join_classplay_room(text, text) from public;
revoke execute on function public.resume_classplay_player(uuid, uuid) from public;
revoke execute on function public.submit_classplay_answer(uuid, uuid, uuid, text, integer) from public;

grant execute on function public.join_classplay_room(text, text) to anon, authenticated;
grant execute on function public.resume_classplay_player(uuid, uuid) to anon, authenticated;
grant execute on function public.submit_classplay_answer(uuid, uuid, uuid, text, integer) to anon, authenticated;
