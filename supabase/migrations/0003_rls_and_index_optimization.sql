-- ClassPlay v0.2 — RLS and index optimization
-- Addresses Supabase Performance Advisor findings before production data exists.

create index if not exists answers_item_idx on public.answers(item_id);
create index if not exists answers_player_idx on public.answers(player_id);
create index if not exists game_results_session_idx on public.game_results(session_id);
create index if not exists game_results_player_idx on public.game_results(player_id);
create index if not exists game_results_team_idx on public.game_results(team_id);
create index if not exists game_sessions_activity_idx on public.game_sessions(activity_set_id);
create index if not exists players_team_idx on public.players(team_id);

drop policy if exists "profiles own read" on public.profiles;
drop policy if exists "profiles own update" on public.profiles;
drop policy if exists "activity owner all" on public.activity_sets;
drop policy if exists "activity items owner all" on public.activity_items;
drop policy if exists "activity games owner all" on public.activity_games;
drop policy if exists "session host all" on public.game_sessions;
drop policy if exists "teams host all" on public.teams;
drop policy if exists "players host all" on public.players;
drop policy if exists "answers host read" on public.answers;
drop policy if exists "results host all" on public.game_results;

create policy "profiles own read" on public.profiles for select to authenticated
using (id = (select auth.uid()));
create policy "profiles own update" on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "activity owner all" on public.activity_sets for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "activity items owner all" on public.activity_items for all to authenticated
using (exists (
  select 1 from public.activity_sets a
  where a.id = activity_set_id and a.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.activity_sets a
  where a.id = activity_set_id and a.owner_id = (select auth.uid())
));

create policy "activity games owner all" on public.activity_games for all to authenticated
using (exists (
  select 1 from public.activity_sets a
  where a.id = activity_set_id and a.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.activity_sets a
  where a.id = activity_set_id and a.owner_id = (select auth.uid())
));

create policy "session host all" on public.game_sessions for all to authenticated
using (host_id = (select auth.uid()))
with check (host_id = (select auth.uid()));

create policy "teams host all" on public.teams for all to authenticated
using (exists (
  select 1 from public.game_sessions s
  where s.id = session_id and s.host_id = (select auth.uid())
))
with check (exists (
  select 1 from public.game_sessions s
  where s.id = session_id and s.host_id = (select auth.uid())
));

create policy "players host all" on public.players for all to authenticated
using (exists (
  select 1 from public.game_sessions s
  where s.id = session_id and s.host_id = (select auth.uid())
))
with check (exists (
  select 1 from public.game_sessions s
  where s.id = session_id and s.host_id = (select auth.uid())
));

create policy "answers host read" on public.answers for select to authenticated
using (exists (
  select 1 from public.game_sessions s
  where s.id = session_id and s.host_id = (select auth.uid())
));

create policy "results host all" on public.game_results for all to authenticated
using (exists (
  select 1 from public.game_sessions s
  where s.id = session_id and s.host_id = (select auth.uid())
))
with check (exists (
  select 1 from public.game_sessions s
  where s.id = session_id and s.host_id = (select auth.uid())
));
