-- ClassPlay Arcade — Tower Stack practice score support
-- Tower Stack is runtime-derived from Quiz or Gap Fill source content.

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
        practice_scores.game_type in ('boss-battle', 'bubble-burst', 'grammar-runner', 'tower-stack')
        and (
          (
            3 <= (
              select count(*)
              from public.activity_items i
              where i.activity_set_id = practice_scores.activity_set_id
                and char_length(btrim(coalesce(i.prompt, ''))) > 0
                and char_length(btrim(coalesce(i.answer, ''))) > 0
            )
            and 2 <= (
              select count(distinct lower(btrim(i.answer)))
              from public.activity_items i
              where i.activity_set_id = practice_scores.activity_set_id
                and char_length(btrim(coalesce(i.prompt, ''))) > 0
                and char_length(btrim(coalesce(i.answer, ''))) > 0
            )
          )
          or 3 <= (
            select count(*)
            from public.activity_items i
            where i.activity_set_id = practice_scores.activity_set_id
              and position('___' in coalesce(i.gap_sentence, '')) > 0
              and (
                char_length(btrim(coalesce(i.answer, ''))) > 0
                or char_length(btrim(coalesce(i.prompt, ''))) > 0
              )
          )
        )
      )
      or (
        practice_scores.game_type = 'phrase-forge'
        and 2 <= (
          select count(*)
          from public.activity_items i
          where i.activity_set_id = practice_scores.activity_set_id
            and (
              (
                char_length(btrim(coalesce(i.example, ''))) > 0
                and coalesce(array_length(regexp_split_to_array(btrim(i.example), E'\\s+'), 1), 0) >= 3
              )
              or (
                char_length(btrim(coalesce(i.example, ''))) = 0
                and jsonb_typeof(i.sentence_parts) = 'array'
                and jsonb_array_length(i.sentence_parts) > 1
                and 3 <= (
                  select count(*)
                  from regexp_split_to_table(
                    coalesce((select string_agg(value, ' ') from jsonb_array_elements_text(i.sentence_parts)), ''),
                    E'\\s+'
                  ) as parts(word)
                  where btrim(word) <> ''
                )
              )
            )
        )
      )
    )
  );
