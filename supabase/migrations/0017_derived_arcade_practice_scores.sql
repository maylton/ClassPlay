-- ClassPlay v0.9 — derived Arcade practice scores
--
-- Boss Battle and Bubble Burst are generated at runtime from question-ready
-- Quiz / Gap Fill content. They are intentionally not persisted in
-- activity_games, so the practice-score RLS policy needs an explicit path for
-- these two derived modes while retaining the existing exact-mode rule for all
-- authorable games.

drop policy if exists "unlisted practice scores link submit" on public.practice_scores;
create policy "unlisted practice scores link submit"
  on public.practice_scores for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.activity_sets a
      where a.id = practice_scores.activity_set_id
        and a.visibility = 'unlisted'
    )
    and (
      exists (
        select 1
        from public.activity_games g
        where g.activity_set_id = practice_scores.activity_set_id
          and g.game_type = practice_scores.game_type
      )
      or (
        practice_scores.game_type in ('boss-battle', 'bubble-burst')
        and 3 <= (
          select count(*)
          from public.activity_items i
          where i.activity_set_id = practice_scores.activity_set_id
            and (
              (char_length(btrim(coalesce(i.prompt, ''))) > 0
                and char_length(btrim(coalesce(i.answer, ''))) > 0)
              or position('___' in coalesce(i.gap_sentence, '')) > 0
            )
        )
      )
    )
  );
