# ClassPlay v0.3 — Smart Activity Builder

## Product principle

**Create the source content once. Let ClassPlay adapt it to every compatible game.**

v0.3 replaces the old all-fields-at-once activity editor with an adaptive builder and a deterministic compatibility engine. The feature does not depend on AI and does not require a new database schema.

## Core behavior

### Adaptive editor

The editor shows fields according to the selected game modes:

- Flashcards / Memory / Matching / Quiz: prompt + answer pairs.
- Gap Fill: full sentence + target word/expression.
- Sentence Builder: full sentence.
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
- full sentence + target contained in that sentence -> Gap Fill.

Compatibility requires at least two playable items for a mode.

### Smart variants

After an activity is saved, the mode picker shows **Smart Variants** for compatible modes that are not enabled yet. A teacher can add one with a single click. ClassPlay saves the new enabled mode without requiring the source content to be entered again.

### Derived data

Automatic variants are derived from canonical source content at runtime:

- Gap Fill replaces the target phrase with `_____`.
- Sentence Builder splits the canonical sentence into deterministic chunks and attempts to keep a selected target expression intact.
- Quiz answer choices come from other compatible answers in the same activity.

Generated data should remain derived rather than duplicated. Explicit teacher overrides in the existing `gapSentence` / `sentenceParts` fields remain supported.

### Mixed-content safety

Each game now filters the activity items through the compatibility engine before play. This lets one activity contain richer content without sending sentence-only items into Memory/Quiz or pair-only items into sentence games.

## Compatibility

- Existing v0.2 activity records continue to load.
- Existing Supabase columns are reused; no migration is required for this feature.
- Existing manual `gapSentence` and `sentenceParts` values remain valid.
- Connected Classroom, authentication, storage ownership and realtime logic are not changed by this feature.

## Test focus

1. Create Memory only with four prompt/answer pairs; save and verify Flashcards, Matching and Quiz are suggested as Smart Variants.
2. Add one suggested mode and verify it persists without re-entering content.
3. Create Gap Fill with full sentences + target expressions; verify gap previews are generated.
4. Verify the same sentence content unlocks Sentence Builder and generated chunks work in play mode.
5. Select only one mode and confirm unrelated editor fields remain hidden.
6. Edit an old v0.2 activity and confirm its existing manual gap/chunk data still works.
7. Run engine, live/security, typecheck, lint and production build.
