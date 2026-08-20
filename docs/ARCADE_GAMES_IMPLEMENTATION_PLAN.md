# ClassPlay Arcade — Game Implementation Plan

## Goal

Expand ClassPlay Arcade with games that feel meaningfully different from one another while reusing the same pedagogical content model whenever possible.

The guiding principle is:

> **Content first, game mechanics second.**

A deck should be able to power several distinct experiences without requiring the teacher to recreate the same material for every game.

This roadmap intentionally prioritizes **quality over quantity**. We will implement, test and polish one game at a time.

---

## Development policy

### One game at a time

Only one new Arcade game should be under active implementation at a time.

Do not start the next game until the current one has:

- a complete playable loop;
- correct scoring and restart behavior;
- keyboard/touch support where relevant;
- responsive layouts;
- accessibility basics;
- regression tests for its engine/contracts;
- TypeScript and lint passing;
- a production build passing;
- a visual QA pass.

### One consolidated commit per implementation checkpoint

To avoid wasting Vercel deployment quota:

1. Work on all related files for the game as one implementation batch.
2. Validate the batch before publishing it.
3. Create **one consolidated commit** only when that checkpoint is ready.
4. Request a Vercel preview only for meaningful test checkpoints.
5. Do not create commits merely for comments, tiny CSS experiments, intermediate refactors or unfinished states.

For most games, the ideal deployment flow is:

- **Checkpoint 1:** first complete playable version;
- **Checkpoint 2:** visual/gameplay polish, only if needed;
- **Production:** after approval.

Target: **2–4 Vercel deployments maximum per game** whenever practical.

### Architecture rule

Game-specific mechanics belong in dedicated engines/components. Shared concepts belong in shared Arcade infrastructure.

Avoid:

- duplicating shuffle/choice/scoring helpers;
- embedding large engines in React components;
- changing activity data formats just to support one game;
- creating a new scoring implementation for every mode;
- large monolithic components;
- visual changes to unrelated games during a new-game implementation.

---

# Priority roadmap

## 1. Boss Battle

**Priority:** Highest  
**Estimated complexity:** Medium  
**Best content:** Quiz, Gap Fill, Prompt → Answer

### Core fantasy

The player fights a boss by answering questions correctly. Fast answers and streaks produce stronger attacks.

Possible bosses:

- Grammar Golem
- Vocabulary Dragon
- Tense Machine
- Final Exam Bot

### Core loop

1. Show question.
2. Player answers.
3. Correct answer damages the boss.
4. Fast answer can trigger a critical hit.
5. Wrong answer causes the boss to attack the player.
6. Player wins by reducing boss HP to zero before losing all hearts.

### Suggested scoring/gameplay

- correct: normal hit;
- speed bonus: extra damage;
- streak: attack multiplier or stronger animation;
- wrong: lose one heart;
- optional three-heart system;
- final boss phase becomes visually more intense.

### Progression idea

A deck can become a small campaign:

**Stage 1 → Stage 2 → Boss**

Questions are distributed across stages without repetition.

### Why first

The existing ClassPlay score, streak, timer and objective-question systems already provide much of the required infrastructure. It offers a strong visual payoff without demanding an entirely new content model.

### MVP quality bar

- at least one polished boss;
- boss HP and player hearts;
- hit / critical / damage animations;
- Quiz and Gap Fill support;
- mobile and desktop controls;
- restart-safe timer;
- result screen;
- no question repetition unless explicitly required by deck size.

---

## 2. Bubble Burst

**Priority:** High / quick win  
**Estimated complexity:** Low–Medium  
**Best content:** Quiz, vocabulary, Prompt → Answer

### Core fantasy

Answer options float around the screen as bubbles. The player must burst the correct bubble before time runs out.

Example:

> I _____ TV yesterday.

Bubbles:

- watch
- watched
- watching
- watches

### Core loop

1. Show prompt.
2. Spawn answer bubbles.
3. Bubbles gently move around the play area.
4. Player taps/clicks the correct one.
5. Correct answer pops dramatically and increases score/streak.
6. Wrong bubble produces feedback but does not feel punishing.

### Future modifiers

- golden bubble;
- Freeze Time;
- ×2 score bubble;
- bomb/decoy objects;
- larger streak multipliers.

### Quality bar

Movement must stay readable. This should not become a twitch game where motion prevents students from reading the English.

---

## 3. Grammar Runner

**Priority:** High  
**Estimated complexity:** Medium–High  
**Best content:** Quiz, Gap Fill

### Core fantasy

An endless-runner-style game where answer choices occupy lanes. The player moves between lanes to collect the correct answer.

Example:

> SHE ___ TO SCHOOL EVERY DAY.

| Lane 1 | Lane 2 | Lane 3 |
| --- | --- | --- |
| GO | GOES | GOING |

The player must enter the **GOES** lane.

### Controls

Desktop:

- Left / Right arrows

Touch:

- large left/right tap zones or swipe

### Core loop

1. Character runs automatically.
2. Question appears.
3. Answer gates/items appear ahead in lanes.
4. Player changes lane.
5. Passing through the correct answer scores points.
6. Speed gradually increases with streak/performance.

### Design constraint

Reading time must always remain pedagogically reasonable. Difficulty should come from decision speed, not unreadable motion.

---

## 4. Phrase Forge

**Priority:** High pedagogical value  
**Estimated complexity:** Low–Medium  
**Best content:** Sentence Builder

### Core fantasy

Players assemble sentences from shuffled word pieces while a forge/conveyor-style interface gives the activity an Arcade identity.

Example pieces:

> every / she / morning / coffee / drinks

Target:

> She drinks coffee every morning.

### Core loop

1. Show shuffled tokens.
2. Player places words into the sentence line.
3. Incorrect placements can return to the tray or remain editable.
4. Complete sentence is checked.
5. Speed and accuracy determine score.

### Good language targets

- word order;
- Present Simple;
- questions;
- adverbs of frequency;
- comparatives;
- Present Perfect;
- modal structures.

### Why it matters

Phrase Forge would give Sentence Builder content a true Arcade experience instead of simply reskinning a multiple-choice game.

---

## 5. Tower Stack

**Priority:** Medium  
**Estimated complexity:** Low–Medium  
**Best content:** Any objective content

### Core fantasy

Every correct answer adds a block to a tower. The goal is to build as high as possible before the activity ends.

### Core loop

1. Answer question.
2. Correct answer adds block.
3. Streaks create special blocks/floors.
4. Tower grows visibly throughout the game.
5. Final height becomes part of the result screen.

### Suggested streak rewards

- 3 correct: Perfect Block;
- 5 correct: Double Floor;
- long streak: visual tower upgrade.

### Design constraint

Physics can add life, but the tower should not randomly collapse and erase student progress. Visual wobble is preferable to frustrating failure.

---

# Second-wave concepts

These should remain in backlog until the first five reach the desired quality level.

## Word Drop

Words/answers fall from the top of the screen. The player catches or selects the correct answer.

Best for:

- vocabulary;
- Gap Fill;
- short answer choices.

Complexity: **Low–Medium**.

---

## Treasure Rush

Correct answers open treasure chests. Chests may contain score bonuses, multipliers or temporary power-ups.

Best for: **any objective content**.

Complexity: **Low**.

This can become a strong vehicle for the shared Arcade power-up system.

---

## Minefield

The player crosses a grid/path. Moving to the next safe position requires answering correctly.

Best for:

- Quiz;
- Gap Fill.

Complexity: **Medium**.

Avoid excessive randomness: success must primarily reflect answering, not luck.

---

## Word Hunt

The player receives a definition/clue and searches for its answer in a procedurally generated letter grid.

Example:

> Find: a place where you borrow books

Target: **LIBRARY**

Best for: **vocabulary / Prompt → Answer**.

Complexity: **Medium**.

The grid should be generated from real deck answers without requiring a special activity format.

---

## Road Crossing

Frogger-inspired structure: each lane/gate represents an answer and the player crosses through the correct one.

Best for: **Quiz**.

Complexity: **Medium**.

This overlaps somewhat with Grammar Runner, so it should only be implemented if its gameplay becomes sufficiently distinct.

---

## Combo Clash

Fast question chains focused on maintaining a multiplier.

Best for:

- Quiz;
- Gap Fill;
- revision drills.

Complexity: **Low**.

This can become the cleanest pure-score Arcade mode.

---

## Typing Rush

Players type the missing answer rather than selecting it. Accuracy and response speed determine score.

Best for:

- Gap Fill;
- spelling;
- vocabulary recall.

Complexity: **Low–Medium**.

Must tolerate capitalization and sensible punctuation differences where appropriate.

---

# Shared Arcade systems

New games should gradually strengthen shared infrastructure instead of building isolated implementations.

## 1. Content adapters

Arcade should expose reusable pools such as:

- Quiz choices;
- Gap Fill completion;
- Prompt → Answer;
- Sentence Builder tokens.

A game declares which adapters it accepts. The engine then receives normalized content.

## 2. Shared score model

Reuse ClassPlay concepts where appropriate:

- base points;
- speed bonus;
- streak;
- accuracy;
- final score.

A game may translate score into thematic effects (boss damage, tower blocks, etc.) without inventing incompatible scoring rules unnecessarily.

## 3. Arcade power-ups

Potential reusable system:

- Freeze Time;
- ×2 Score;
- Shield;
- Slow Motion;
- Extra Life;
- Score Magnet.

Power-ups should be implemented centrally when multiple games genuinely need them. Do not introduce a generic system prematurely for a single game.

## 4. Game lifecycle

Every Arcade game should behave consistently around:

- start;
- question transition;
- timer restart;
- pause if supported;
- replay;
- game over;
- result submission.

Replay must never inherit stale timer/state from the previous run.

## 5. Responsive controls

Every game should explicitly support:

- desktop keyboard/mouse;
- touch devices;
- common laptop/projector resolutions.

Controls should be visible enough that a first-time player can understand the game without teacher explanation.

## 6. Accessibility

Minimum requirements:

- `prefers-reduced-motion` support for heavy animation;
- sufficient contrast;
- no critical information communicated by color alone;
- keyboard interaction where the mechanic allows it;
- readable text at game speed.

---

# Visual direction

Arcade games should share the ClassPlay identity while having distinct personalities.

Common principles:

- modern rather than childish;
- strong but controlled color;
- meaningful motion;
- clear hierarchy;
- large readable prompts;
- celebratory feedback without obscuring learning content;
- game-like presentation rather than a quiz with a decorative background.

A new Arcade game should answer this question clearly:

> **What does the player actually do here that feels different from the other games?**

If the answer is only “click another multiple-choice card,” the concept needs more work before implementation.

---

# Proposed implementation order

1. **Boss Battle**
2. **Bubble Burst**
3. **Grammar Runner**
4. **Phrase Forge**
5. **Tower Stack**
6. Reassess the second-wave backlog based on classroom feedback

The order may change after real classroom testing, but only one game should be active at a time.

---

# Definition of Done for each game

A game is considered ready only when all applicable items are complete:

### Gameplay

- [ ] Full game loop works
- [ ] Correct/wrong states are deterministic
- [ ] Score is correct
- [ ] Streak/speed mechanics are correct
- [ ] Replay resets all transient state
- [ ] Deck compatibility rules are explicit

### UX

- [ ] Desktop tested
- [ ] Touch/mobile tested
- [ ] Main prompt remains readable during gameplay
- [ ] Instructions are understandable on first launch
- [ ] Result screen is complete
- [ ] Animations improve feedback rather than delay the game

### Engineering

- [ ] Engine separated from presentation where appropriate
- [ ] Shared helpers reused instead of duplicated
- [ ] No unnecessary lint suppressions
- [ ] Regression tests added
- [ ] TypeScript passes
- [ ] ESLint passes
- [ ] Production build passes

### Release

- [ ] Visual QA completed
- [ ] One consolidated implementation commit created
- [ ] Preview deployed only when ready for real testing
- [ ] Production merge only after approval

---

## Current next game

**Boss Battle** is the recommended next Arcade implementation.

Before coding, define its MVP in one focused design pass: boss visual language, HP model, player lives, supported question adapters, damage formula and stage progression. Then implement that complete slice before moving to Bubble Burst.
