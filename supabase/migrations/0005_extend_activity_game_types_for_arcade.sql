-- ClassPlay Arcade extends the persisted game catalog with the first two
-- action modes. Keep this constraint aligned with src/lib/game-catalog.ts.

alter table public.activity_games
  drop constraint if exists activity_games_game_type_check;

alter table public.activity_games
  add constraint activity_games_game_type_check
  check (game_type = any (array[
    'flashcards'::text,
    'memory'::text,
    'matching'::text,
    'sentence-builder'::text,
    'gap-fill'::text,
    'quiz'::text,
    'space-blaster'::text,
    'word-maze'::text
  ]));
