# ClassPlay v0.3 — Smart Activity Builder

## Product principle

**Create the source content once. Let ClassPlay adapt it to every compatible game.**

v0.3 replaces the old all-fields-at-once activity editor with an adaptive builder and a deterministic compatibility engine. The feature does not depend on AI.

## Core behavior

### Adaptive editor

The editor shows fields according to the selected game modes:

- Flashcards / Memory / Matching / Quiz: prompt + answer pairs.
- Gap Fill: full sentence + target word/expression.
- Sentence Builder: full sentence.
- Space Blaster / Word Maze: full sentence + target word/expression, reusing the same source content as Gap Fill.
- Flashcards additionally exposes optional image/example support.
- Hints appear only when a selected mode can use them.
- Generated Gap Fill sentences and Sentence Builder chunks are previewed instead of requiring duplicate typing.
- Advanced controls allow explicit overrides when automatic generation is not ideal.

A new activity starts with no mode selected, so the teacher first chooses the intended classroom interaction and then sees the minimal editor required for it.

### Compatibility engine

`src/lib/activity-intelligence.ts` is the canonical compatibility/adaptation layer.

It detects whether an activity can power each game mode:

- prompt + answer pairs -> Flashcards, Memory, Matching;
- multiple distinct prompt + answer pairs -> Quiz;
- full sentence -> Sentence Builder;
- full sentence + target contained in that sentence -> Gap Fill;
- three full sentences + usable targets -> Space Blaster / Word Maze.

Standard modes require at least two playable items. Arcade modes require at least three so their answer selection remains meaningful.

### Smart variants

After an activity is saved, the mode picker shows **Smart Variants** for compatible modes that are not enabled yet. A teacher can add one with a single click. ClassPlay saves the new enabled mode without requiring the source content to be entered again.

### Derived data

Automatic variants are derived from canonical source content at runtime:

- Gap Fill replaces the target phrase with `_____`.
- Sentence Builder splits the canonical sentence into deterministic chunks and attempts to keep a selected target expression intact.
- Quiz answer choices come from other compatible answers in the same activity.
- Gap Fill choices can use the other target expressions in the same activity; manual distractors remain optional.
- Arcade rounds reuse the generated gap prompt and target answer while drawing distractors from other compatible sentence targets.

Generated data should remain derived rather than duplicated. Explicit teacher overrides in the existing `gapSentence` / `sentenceParts` fields remain supported.

### English phrase matching

Generated sentence variants use `src/lib/english-phrase-matcher.ts` so a base target can match common English inflections in the actual sentence. Examples include:

- `watch TV` -> `watches TV` / `watched TV`
- `study English` -> `studies English`
- `go to school` -> `goes to school`
- `have breakfast` -> `has breakfast`

The form that actually appears in the source sentence is preserved in the generated variant.

### Adaptive Memory boards

Memory no longer takes the first eight pairs from an activity. `src/lib/memory-board.ts` selects a controlled board size from the available compatible pairs and randomizes which pairs are included.

- minimum playable content: 2 pairs;
- preferred board sizes: 4, 6, 8, 10, 12, 16 and 20 pairs;
- maximum board size: 20 pairs;
- the largest preferred size that fits is selected (for example 9 available pairs -> an 8-pair board; 11 -> 10; 18 -> 16);
- when more pairs are available than fit the board, the subset is randomized;
- replay avoids repeating the exact same subset when at least one unused pair exists;
- the grid density adapts to larger boards and becomes responsive on smaller screens.

### Mixed-content safety

Each game filters the activity items through the compatibility engine before play. This lets one activity contain richer content without sending sentence-only items into Memory/Quiz or pair-only items into sentence games.

## Cloud persistence safety

Arcade adds two persisted `GameType` values, so Supabase migration `0005_extend_activity_game_types_for_arcade.sql` extends the `activity_games.game_type` check constraint with `space-blaster` and `word-maze`.

Cloud saves are also non-destructive at the child-row level: ClassPlay upserts the desired items and game modes before deleting stale rows. A validation or network failure therefore cannot erase the last good `activity_items` / `activity_games` set. Local/demo activities resolve through `source_local_id` so retries converge on one cloud copy instead of creating repeated orphan records.

## Compatibility

- Existing v0.2 activity records continue to load.
- Existing Supabase columns are reused; Arcade requires only the game-type constraint extension in migration `0005`, not new columns/tables.
- Existing manual `gapSentence` and `sentenceParts` values remain valid.
- Connected Classroom, authentication, storage ownership and realtime logic are not changed by these persistence changes.

## Test focus

1. Create Memory only with four prompt/answer pairs; save and verify Flashcards, Matching and Quiz are suggested as Smart Variants.
2. Add one suggested mode and verify it persists without re-entering content.
3. Create Gap Fill with full sentences + target expressions; verify gap previews are generated.
4. Verify the same sentence content unlocks Sentence Builder and generated chunks work in play mode.
5. Verify common target inflections stay intact in Sentence Builder (`watch TV` -> `watches TV`, `study English` -> `studies English`).
6. Create a Memory activity with nine compatible pairs and verify each board contains eight pairs selected from the full nine-pair pool.
7. Replay the nine-pair Memory activity and verify at least one previously unused pair rotates into the new board.
8. With at least three sentence targets, verify Space Blaster and Word Maze are offered as Smart Variants and persist successfully to cloud activities.
9. Select only one mode and confirm unrelated editor fields remain hidden.
10. Edit an old v0.2 activity and confirm its existing manual gap/chunk data still works.
11. Run engine, Smart Activity Builder, Arcade, live/security, typecheck, lint and production build.
