-- ClassPlay v0.3 — persistent practice leaderboards
--
-- Connected Classroom rankings remain session-scoped. This table is used only
-- by unlisted individual-practice links.

create table if not exists public.practice_scores (
  id uuid primary key default gen_random_uuid(),
  activity_set_id uuid not null references public.activity_sets(id) on delete cascade,
  game_type text not null,
  player_name text not null,
  score integer not null default 0,
  correct integer not null default 0,
  total integer not null default 0,
  created_at timestamptz not null default now(),
  constraint practice_scores_player_name_check
    check (char_length(btrim(player_name)) between 1 and 24),
  constraint practice_scores_score_check
    check (score between 0 and 1000000),
  constraint practice_scores_correct_total_check
    check (correct >= 0 and total >= 0 and correct <= total)
);

create index if not exists practice_scores_activity_game_score_idx
  on public.practice_scores (activity_set_id, game_type, score desc, correct desc, created_at asc);

alter table public.practice_scores enable row level security;

-- New public-schema tables are no longer guaranteed to be exposed through the
-- Data API automatically, so keep grants explicit and least-privilege.
revoke all on table public.practice_scores from anon, authenticated;
grant select, insert on table public.practice_scores to anon, authenticated;
grant all on table public.practice_scores to service_role;

-- Practice activities are unlisted: they are reachable by direct link but are
-- not made globally public or discoverable.
drop policy if exists "unlisted activities link read" on public.activity_sets;
create policy "unlisted activities link read"
  on public.activity_sets for select
  to anon, authenticated
  using (visibility = 'unlisted');

drop policy if exists "unlisted activity items link read" on public.activity_items;
create policy "unlisted activity items link read"
  on public.activity_items for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.activity_sets a
      where a.id = activity_items.activity_set_id
        and a.visibility = 'unlisted'
    )
  );

drop policy if exists "unlisted activity games link read" on public.activity_games;
create policy "unlisted activity games link read"
  on public.activity_games for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.activity_sets a
      where a.id = activity_games.activity_set_id
        and a.visibility = 'unlisted'
    )
  );

-- Anyone holding the unlisted practice link may read that activity's scores.
drop policy if exists "unlisted practice scores link read" on public.practice_scores;
create policy "unlisted practice scores link read"
  on public.practice_scores for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.activity_sets a
      where a.id = practice_scores.activity_set_id
        and a.visibility = 'unlisted'
    )
  );

-- Anonymous practice players may submit only to an unlisted practice activity
-- and only for a game mode the teacher currently has enabled. Bounds on names
-- and score fields are also enforced by the table constraints above.
drop policy if exists "unlisted practice scores link submit" on public.practice_scores;
create policy "unlisted practice scores link submit"
  on public.practice_scores for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from public.activity_sets a
      where a.id = practice_scores.activity_set_id
        and a.visibility = 'unlisted'
    )
    and exists (
      select 1 from public.activity_games g
      where g.activity_set_id = practice_scores.activity_set_id
        and g.game_type = practice_scores.game_type
    )
  );
