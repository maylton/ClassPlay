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
4. The projector is the main play surface; student phones show team/turn/status, not multiple-choice answering.
5. The teacher is the authority for oral answers and marks **Correct** or **Not quite**.
6. Board layout, Wildcards, scores and current turn are persisted in the live session so refresh/reconnect does not reroll the game.

## v0.8 — Playable MVP

### Setup

- Add `wildcard-grid` to ClassPlay Live.
- Force Team mode.
- Allow **2, 3 or 4 teams**.
- Board sizes: **12, 16 or 20 tiles**.
- Disable board sizes larger than the compatible question pool.
- Question source:
  - Grammar-heavy decks prefer Gap Fill when possible.
  - Otherwise use Quiz-compatible questions.
- Wildcard intensity:
  - **Balanced** (default)
  - **Chaos**

### Board state

Persist in `game_sessions.settings.wildcardGridState`:

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

No new database table is required for the first implementation because the session settings JSON is already authoritative and realtime-synchronized.

### Core turn flow

1. Board shows unopened numbered tiles.
2. Active team chooses a tile verbally.
3. Teacher clicks the tile.
4. Question replaces/emphasizes the board.
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

### Projector UX

Board phase:

- team score strip;
- active-team highlight;
- large responsive numbered grid;
- opened tiles visually disabled;
- room code + End session action.

Question phase:

- tile number;
- active team;
- large prompt;
- optional image;
- no answer buttons shown to students;
- teacher controls: **Correct** / **Not quite**.

Wildcard phase:

- reveal animation/card;
- clear effect copy;
- target-team selector when needed;
- score delta animation;
- **Continue** action.

### Student phone UX

Lobby:

- assigned team;
- Wildcard Grid explanation.

During game:

- current team;
- own team score;
- all team scores in compact form;
- **YOUR TURN — choose a tile together** when active;
- **Watch the projector** otherwise;
- during question: `Talk with your team and answer out loud.`
- during Wildcard: show the revealed effect and updated score.

Students never submit the oral answer from the phone in this mode.

### Finish + ties

- Normal finish: rank teams by Wildcard Grid score.
- If first place is unique: declare winner.
- If first place is tied: enter **Sudden Death**.
- Sudden Death uses an extra compatible question with no Wildcard.
- Teacher marks which tied team answered correctly first.
- v0.8 may initially expose a teacher tie-break selector if a full buzzer flow is not yet implemented.

## v0.8.1 — Polish

- richer tile reveal motion;
- score-transfer animation for Heist/Gift/Swap;
- sound cues with respect for `soundEnabled`;
- reduced-motion variants;
- stronger mobile status screen;
- optional teacher-configurable base score;
- custom team names/colors before starting.

## v0.9 ideas

- student captain can choose the tile from a phone;
- buzzer-based sudden death;
- deck-author custom Wildcards;
- category-colored boards;
- optional `No Wildcards` classroom mode;
- reusable Wildcard engine for future Live party games.

## Technical contracts

- `LiveGameMode` includes `wildcard-grid` but `GameType` does not; it remains Live-only.
- Wildcard Grid must not write fake answer rows or fake individual scores.
- Team scores are stored in `wildcardGridState.teamScores`.
- Refreshing host/student must reconstruct the exact same board and turn.
- Public student payload never includes hidden Wildcard assignments for unopened tiles.
- Teacher-only state may contain the full hidden board because host access is authenticated.
- Board generation and Wildcard resolution live in the Live engine, not React components.
- Host/student components render state and dispatch actions; they do not contain randomization rules.
- Add regression contracts for board generation, wildcard count, score floor, turn rotation, persistence-safe deterministic reducers and Live-mode compatibility.

## Definition of done for v0.8

- 12/16/20 board setup works according to deck size.
- 2–4 teams supported.
- every tile maps to one compatible question.
- board survives host refresh without rerolling.
- teacher can mark correct/incorrect.
- base scoring works.
- at least the Balanced Wildcard set is playable.
- target-selection effects work.
- phones show correct team/turn/score status.
- final ranking works.
- all existing ClassPlay CI contracts stay green.
- TypeScript, ESLint and production build pass.
