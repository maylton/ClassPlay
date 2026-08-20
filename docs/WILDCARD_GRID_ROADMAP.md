# Wildcard Grid — Dedicated Roadmap

**Working name:** Wildcard Grid  
**Tagline:** *Pick a tile. Answer. Expect a twist.*  
**Product area:** ClassPlay Live  
**Primary use:** Whole-class team play on the projector, with students grouped into 2–4 teams.

## Product principles

Wildcard Grid is inspired by classroom board games where teams choose numbered tiles, but it must have its own ClassPlay identity:

1. Every tile always contains a learning question.
2. Some tiles also hide a second layer: a Wildcard.
3. The pedagogical sequence is always **Language → Result → Surprise**.
4. The projector is the complete primary play surface. **Student phones are optional** and only add team/turn/status information.
5. The game must remain fully playable with **zero connected student devices**.
6. The teacher is the authority for oral answers and marks **Correct** or **Not quite**.
7. The teacher chooses which content source feeds the board instead of being forced into automatic selection.
8. Board layout, Wildcards, scores, question source and current turn are persisted in the live session so refresh/reconnect does not reroll the game.
9. Visual direction: **modern classroom game show** — colorful and energetic without becoming childish or visually noisy.

## v0.8 — Playable MVP

### Setup

- Add `wildcard-grid` to ClassPlay Live.
- Force Team mode.
- Allow **2, 3 or 4 teams**.
- Allow the teacher to start immediately without students joining on phones.
- Board sizes: **12, 16 or 20 tiles**.
- Disable board sizes larger than the selected question-source pool.
- Teacher-selectable question source:
  - **Smart Mix** — ClassPlay chooses the strongest source automatically.
  - **Fill the Gaps** — only gap-sentence items.
  - **Quiz** — only Quiz-compatible items.
  - **Prompt ↔ Answer** — prompt/answer pairs, ideal for Matching, Flashcards and vocabulary-style decks.
- Each source displays its usable question count before room creation.
- A source must contain at least 12 usable questions to be selectable.
- Wildcard intensity:
  - **Balanced** (default)
  - **Chaos**

### Two valid classroom flows

#### Projector only

- Teacher creates the room and teams.
- No student joins by QR/code.
- Teams are physical classroom groups.
- Teacher controls tile choice, answer marking, Wildcards and score entirely from the projector.
- This is a first-class mode, not a degraded fallback.

#### Connected companion

- Students may join by QR/code.
- Joined students are assigned to one of the same teams.
- Phones show team, current turn, score, Shield/×2 status and revealed Wildcards.
- Phones never become required for answering or advancing the board.

### Board state

Persist in `game_sessions.settings` / `wildcardGridState`:

- selected question source;
- shuffled question order;
- numbered tile list;
- hidden Wildcard assignments;
- opened/completed tiles;
- active team;
- team scores;
- current tile;
- current phase;
- pending Wildcard interaction;
- winner/tie state.

No new game table is required because the session settings JSON is already authoritative and realtime-synchronized.

### Core turn flow

1. Board shows unopened numbered tiles.
2. Active team chooses a tile verbally.
3. Teacher clicks the tile.
4. Question from the configured source replaces/emphasizes the board.
5. Team discusses and answers orally.
6. Teacher clicks **Correct (+20)** or **Not quite (+0)**.
7. Correct answer is revealed.
8. If the tile contains a Wildcard, reveal and resolve it.
9. Mark tile completed and advance to the next team.
10. When all tiles are completed, highest score wins.

### Scoring

- Correct answer: **+20**.
- Incorrect answer: **+0**.
- Scores never go below zero.
- Wildcards modify team scores independently from player scores.
- Final database results are written by team, not as fake individual results.

### Wildcards

#### Balanced pool

- **Jackpot** — +50
- **Little Boost** — +20
- **Oops!** — −10
- **Heist** — steal 20 from another team
- **Gift** — give 20 to another team
- **Equalizer** — lowest-scoring team gains 30
- **Pickpocket** — steal 10 from two different opponents when possible
- **Shield** — block the next negative Wildcard that targets this team
- **Double Trouble** — next correct answer for this team is worth ×2

#### Chaos-only pool

- **Swap** — swap scores with another team
- **Blackout** — every team loses 20
- **Fresh Start** — all team scores reset to 0

### Distribution rules

- 12 tiles → **3 Wildcards**
- 16 tiles → **4 Wildcards**
- 20 tiles → **5 Wildcards**
- Always include at least:
  - one positive effect;
  - one interaction effect;
  - one risk effect.
- Balanced mode excludes the three extreme Chaos effects.
- Chaos mode allows at most one extreme effect per board.
- Wildcards are selected/shuffled once when the game starts.

### Projector UX — game-show direction

Board phase:

- colorful stage-like background with restrained ambient glows;
- team score strip with strong team colors;
- animated highlight for the active team;
- large responsive numbered grid;
- varied colorful tile palette;
- staggered tile entrance animation;
- hover/lift feedback on selectable tiles;
- opened tiles visually disabled;
- room code + question-source badge + End session action;
- no connected-device requirement.

Question phase:

- active-team color carried into the question card;
- visible question-source badge;
- tile number;
- active team;
- large prompt;
- optional image;
- no answer options shown to students;
- teacher controls: **Correct** / **Not quite**;
- animated transitions between board and question stages.

Result phase:

- score-pop animation;
- correct/wrong color treatment;
- answer reveal card;
- suspense treatment when a Wildcard is hidden below the tile.

Wildcard phase:

- stronger reveal animation/card;
- distinct visual identity for positive / interaction / risk / chaos effects;
- clear effect copy;
- target-team selector when needed;
- **Continue / Apply** action.

Final phase:

- celebratory champion treatment;
- animated trophy;
- team-colored ranking cards;
- sudden-death treatment for ties.

All motion must respect `prefers-reduced-motion`.

### Student phone UX — optional companion

Lobby:

- assigned team;
- Wildcard Grid explanation;
- clear indication that answers happen with the team, out loud.

During game:

- current team;
- own team score;
- all team scores in compact form;
- **YOUR TURN — choose a tile together** when active;
- **Watch the projector** otherwise;
- during question: `Talk with your team and answer out loud.`
- during Wildcard: show the revealed effect and updated score.

Students never submit the oral answer from the phone in this mode. The host must never wait for a phone event before advancing.

### Security / hidden information

- Student Realtime payloads strip every hidden `tile.wildcard` value.
- Student reconnect RPCs also strip hidden Wildcards.
- `pendingWildcard` becomes public only during the reveal phase.
- Question source is safe to expose and may be shown on host/student UI.

### Finish + ties

- Normal finish: rank teams by Wildcard Grid score.
- If first place is unique: declare winner.
- If first place is tied: enter **Sudden Death**.
- Sudden Death uses an extra compatible question with no Wildcard.
- Teacher marks which tied team answered correctly first.
- v0.8 may initially expose a teacher tie-break selector if a full buzzer flow is not yet implemented.

## v0.8.1 — Polish

- score-transfer animation for Heist/Gift/Swap;
- sound cues with respect for `soundEnabled`;
- optional teacher-configurable base score;
- custom team names/colors before starting;
- richer per-effect motion where it adds clarity rather than distraction.

## v0.9 ideas

- student captain can choose the tile from a phone;
- buzzer-based sudden death;
- deck-author custom Wildcards;
- category-colored boards;
- optional `No Wildcards` classroom mode;
- reusable Wildcard engine for future Live party games.

## Technical contracts

- `LiveGameMode` includes `wildcard-grid` but `GameType` does not; it remains Live-only.
- `WildcardGridQuestionSource` supports `smart`, `gap-fill`, `quiz` and `prompt-answer`.
- Source selection changes the actual item pool used to build the board and questions.
- Board size availability derives from the selected source pool.
- Wildcard Grid must not write fake answer rows or fake individual scores.
- Team scores are stored in `wildcardGridState.teamScores`.
- **No player connection is required to start or complete a Wildcard Grid session.**
- Refreshing host/student must reconstruct the exact same board and turn.
- Public student payload never includes hidden Wildcard assignments for unopened tiles.
- Teacher-only state may contain the full hidden board because host access is authenticated.
- Board generation, source resolution and Wildcard resolution live in the Live engine, not React components.
- Host/student components render state and dispatch actions; they do not contain randomization rules.
- Add regression contracts for source selection, board generation, wildcard count, score floor, turn rotation, persistence-safe deterministic reducers and Live-mode compatibility.

## Definition of done for v0.8

- 12/16/20 board setup works according to the selected source size.
- 2–4 teams supported.
- **projector-only session works from start to finish with zero connected phones.**
- connected phones remain optional companions.
- teacher can explicitly choose Smart Mix, Fill the Gaps, Quiz or Prompt ↔ Answer.
- every tile maps to one question from the selected source.
- board survives host refresh without rerolling.
- teacher can mark correct/incorrect.
- base scoring works.
- at least the Balanced Wildcard set is playable.
- target-selection effects work.
- hidden Wildcards stay private until reveal.
- phones show correct team/turn/score status when used.
- final ranking works and persists by team.
- game-show visual pass is applied with reduced-motion fallback.
- all existing ClassPlay CI contracts stay green.
- TypeScript, ESLint and production build pass.
