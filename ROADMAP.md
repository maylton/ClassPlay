# ClassPlay — Product & Engineering Roadmap

> **Status:** Definitive roadmap
> **Current target:** v0.2.0 release candidate / Connected Classroom
> **Stable baseline:** v0.1.0 MVP — accepted after local validation
> **Product:** ClassPlay — interactive language-learning activities for teachers and students

---

## 1. Product vision

ClassPlay is a web-first classroom activity platform designed primarily for language learning. Teachers create a reusable **Activity Set** once and can practise the same content through different interaction patterns: flashcards, memory, matching, sentence building, gap fill and quiz.

The product is intentionally not a generic Wordwall clone. Its differentiator is a language-learning data model with vocabulary, grammar, example sentences, sentence chunks, distractors, pronunciation/audio and later CEFR-aware AI generation.

### Core promise

**Create once. Play many ways.**

A teacher should be able to prepare language content in minutes, open it on a classroom projector and change practice mode without rebuilding the activity.

### Primary use cases

1. Teacher-led projected activity with the whole class.
2. Student taking turns at the teacher computer/projector.
3. Small-group work on notebooks/tablets.
4. Individual student participation by room code in v0.2+.
5. Formative assessment and progress tracking in later versions.

---

## 2. Product principles

### 2.1 Classroom first
Every essential interaction must work quickly on a projector and with a mouse. Student login must never be required just to play a teacher-led activity.

### 2.2 Content and games are separate
Language data lives in Activity Sets. Game renderers consume that data. A game must never own or duplicate the source content.

### 2.3 Touch and mouse parity
Core games must remain usable by click/tap. Drag-and-drop may enhance a game, but should not be the only way to interact.

### 2.4 Fast feedback, low visual noise
Feedback should be immediate and celebratory without turning the interface into a distracting arcade screen.

### 2.5 Inclusive by default
Timers, animations, ranking and audio are optional. Large targets, readable contrast and reduced-motion support are first-class requirements.

### 2.6 Progressive architecture
The MVP starts local-first. The data contracts are designed so storage can be replaced by Supabase without rewriting the games.

---

## 3. Target audience

### Primary persona — Teacher
- English teacher working with children/teenagers.
- Uses a projector regularly.
- Needs quick preparation and flexible reuse.
- Wants visually modern activities without spending excessive time designing them.
- Often needs vocabulary + grammar in the same lesson.

### Secondary persona — Student
- Joins an activity with minimal friction.
- Needs large, obvious interaction targets.
- Should understand correct/wrong feedback immediately.
- Should not need an account for live classroom play.

---

## 4. Information architecture

```text
ClassPlay
├── Landing
├── Teacher workspace
│   ├── Dashboard / Library
│   ├── Create Activity
│   ├── Edit Activity (post-MVP polish)
│   └── Results
├── Activity
│   ├── Activity Set
│   └── Game mode selector
├── Games
│   ├── Flashcards
│   ├── Memory
│   ├── Matching
│   ├── Sentence Builder
│   ├── Gap Fill
│   └── Quiz
└── Live classroom (v0.2)
    ├── Host
    ├── Join by room code / QR
    ├── Team / individual mode
    └── Live results
```

---

## 5. Canonical data model

### ActivitySet

```ts
interface ActivitySet {
  id: string;
  title: string;
  description: string;
  subject: string;
  topic: string;
  level: string;        // CEFR-friendly label
  grade: string;
  kind: "vocabulary" | "grammar" | "mixed";
  items: ActivityItem[];
  enabledGames: GameType[];
  createdAt: string;
  updatedAt: string;
}
```

### ActivityItem

```ts
interface ActivityItem {
  id: string;
  prompt: string;
  answer: string;
  hint?: string;
  imageUrl?: string;
  example?: string;
  distractors?: string[];
  sentenceParts?: string[];
  gapSentence?: string;
}
```

### GameType

```ts
type GameType =
  | "flashcards"
  | "memory"
  | "matching"
  | "sentence-builder"
  | "gap-fill"
  | "quiz";
```

### GameResult

```ts
interface GameResult {
  game: GameType;
  activityId: string;
  score: number;
  correct: number;
  total: number;
  completedAt: string;
}
```

This contract is the stable boundary between content, storage and game UI.

---

# 6. Version 0.1 — MVP

## 6.1 Goal

Deliver a genuinely usable local classroom product, not a static prototype. A teacher can create an Activity Set, save it, reopen it and practise it through six game modes.

## 6.2 Technical architecture

- Next.js App Router.
- React + TypeScript.
- Tailwind available for utility styling; product styling may use semantic global CSS where it improves clarity.
- Browser `localStorage` repository for Activity Sets, teacher profile and recent game results.
- No backend required.
- No user account required.
- Responsive layouts for projector, desktop, tablet and phone.

### Storage abstraction

UI components must call storage functions rather than accessing `localStorage` directly. This makes the v0.2 Supabase migration incremental.

```text
UI → storage.ts → localStorage        (v0.1)
UI → repository layer → Supabase      (v0.2+)
```

## 6.3 MVP screens

### A. Landing page
Acceptance criteria:
- ClassPlay identity visible.
- Explains “one activity, six ways to play”.
- Clear actions to open dashboard and demo.
- Six game types previewed.
- Responsive on phone and projector.

### B. Teacher dashboard
Acceptance criteria:
- Shows teacher display name.
- Teacher can change local display name.
- Shows Activity Sets.
- Shows count of Activity Sets, enabled games and completed local rounds.
- Every Activity Set has Play and Duplicate actions.
- User-created sets can be deleted.
- Includes a direct Create Activity call-to-action.

### C. Activity creator
Required fields:
- title;
- description;
- topic;
- CEFR/level label;
- grade;
- content type.

Per-item fields:
- prompt / English;
- answer / meaning;
- visual hint;
- example sentence;
- gap sentence;
- sentence chunks;
- gap distractors.

Acceptance criteria:
- Minimum two complete prompt/answer items.
- At least one enabled game.
- Add/remove item rows.
- Select any combination of six game modes.
- Save redirects immediately to the game-mode selector.
- Activity persists after refresh/restart of browser.

### D. Game-mode selector
Acceptance criteria:
- Displays Activity Set title, description, grade, level and item count.
- Only enabled games appear.
- Large classroom-friendly cards.
- One-click/tap launch.

## 6.4 MVP game specifications

### Flashcards
Purpose: recognition, recall and vocabulary presentation.

Flow:
1. Show English prompt + visual hint.
2. Tap to flip.
3. Show meaning + optional example sentence.
4. Student/teacher chooses “Got it” or “Review again”.
5. Completion screen shows mastery count.

Acceptance criteria:
- Keyboard/mouse/touch-friendly.
- Current card and total visible.
- Progress bar.
- Self-assessment does not block advancing.

### Memory
Purpose: vocabulary association.

Flow:
1. Generate two cards for each selected item: prompt and answer.
2. Shuffle cards.
3. Player reveals two cards.
4. Correct pair stays matched.
5. Incorrect pair flips back.
6. Score accounts for attempts.

Acceptance criteria:
- Cards have readable projector-scale text.
- Input locks briefly while an incorrect pair is visible.
- Maximum of a practical number of cards per board; initial implementation uses up to eight source items.
- Replay reshuffles.

### Matching
Purpose: rapid association.

Flow:
1. English prompts appear in one column.
2. Meanings appear independently shuffled in a second column.
3. Player chooses one item from each side.
4. Matching pair becomes inactive.
5. Incorrect attempt resets selection with visible feedback.

Acceptance criteria:
- No drag dependency.
- Completed pairs visually disappear/fade from interaction.
- Works on touch screens.

### Sentence Builder
Purpose: grammar, syntax and chunking.

Source data: `sentenceParts`.

Flow:
1. Chunks are shuffled.
2. Player taps chunks to build the sentence.
3. Player can tap a chosen chunk to return it to the pool.
4. Check validates normalized sentence order.
5. Correct/incorrect feedback appears.
6. Next question advances automatically.

Acceptance criteria:
- No drag dependency in MVP.
- Correct target is derived from canonical sentence parts.
- Activity without sentence chunks shows a helpful configuration message, never crashes.

### Gap Fill
Purpose: controlled grammar/vocabulary practice.

Source data: `gapSentence`, `example`, `distractors`.

Flow:
1. Show sentence with `_____` placeholder.
2. Generate correct answer from the example/gap context.
3. Mix correct answer with teacher-provided distractors.
4. Show instant feedback.

Acceptance criteria:
- Missing gap data results in a helpful empty state.
- Options reshuffle between questions/replays where applicable.
- Correct answer remains visually clear after selection.

### Quiz
Purpose: quick comprehension check.

MVP flow:
- English prompt is the question.
- Correct meaning comes from the same item.
- Other meanings from the Activity Set become distractors.
- Streak adds bonus points.

Acceptance criteria:
- Up to four answer options.
- Correct answer always displayed after a wrong choice.
- Score and streak visible.

## 6.5 Scoring

MVP scoring is deliberately simple and game-local.

- Standard correct answer: 100–120 points depending on game.
- Quiz: streak bonus capped to avoid runaway scoring.
- Memory/Matching: additional attempts reduce final score.
- Flashcards: self-assessed mastery, 100 points each.

Scoring is not yet pedagogical analytics. That becomes a dedicated subsystem after live sessions are introduced.

## 6.6 MVP accessibility requirements

Required now:
- large tap targets;
- visible focus behavior inherited/maintained by native controls;
- semantic buttons rather than clickable `<div>` elements;
- strong text/background contrast;
- no essential information communicated only by animation;
- games usable without drag;
- responsive type and layouts.

Deferred to v0.2/v0.3:
- explicit reduced-motion toggle;
- high-contrast theme;
- large-text mode;
- question read-aloud toggle;
- full keyboard navigation audit.

## 6.7 MVP demo content

Ship one canonical set:

**Daily Routine — Present Simple / A1–A2 / 7th grade**

Items include:
- wake up;
- brush my teeth;
- have breakfast;
- go to school;
- have lunch;
- do homework;
- play games;
- go to bed.

This demo must contain enough metadata to exercise every game mode.

## 6.8 MVP definition of done

The MVP is complete only when:
- project source is committed to the official repository;
- `ROADMAP.md` and `README.md` are present;
- all six game modes render from the same Activity Set schema;
- local creation/persistence works;
- demo Activity Set works with all six modes;
- basic engine smoke tests pass;
- TypeScript/TSX source parses successfully;
- install/build instructions are documented;
- known limitations are explicitly documented.

---

# 7. Version 0.2 — Connected Classroom

> **Do not start implementation until the MVP has been tested locally/in class and explicitly approved.**

## 7.1 Goal

Turn the local teaching tool into a connected classroom experience while retaining projected teacher-led play.

## 7.2 Backend migration — Supabase

Introduce:
- PostgreSQL database;
- Supabase Auth for teacher accounts;
- Storage for custom images/audio;
- Realtime for rooms and live answers;
- Row Level Security from the first connected release.

### Proposed database tables

#### `profiles`
- id (uuid, FK auth.users)
- display_name
- school_name nullable
- avatar_url nullable
- created_at
- updated_at

#### `activity_sets`
- id uuid
- owner_id uuid
- title
- description
- subject
- topic
- cefr_level
- grade
- kind
- visibility (`private`, `unlisted`, later `public`)
- created_at
- updated_at

#### `activity_items`
- id uuid
- activity_set_id uuid
- sort_order
- prompt
- answer
- hint
- image_url
- example
- gap_sentence
- distractors jsonb
- sentence_parts jsonb

#### `activity_games`
- activity_set_id
- game_type
- settings jsonb

#### `game_sessions`
- id uuid
- activity_set_id
- host_id
- room_code
- mode
- state (`lobby`, `playing`, `results`, `closed`)
- settings jsonb
- created_at
- ended_at

#### `players`
- id uuid
- session_id
- nickname
- team_id nullable
- connected_at
- last_seen_at

#### `answers`
- id uuid
- session_id
- player_id
- item_id
- answer_payload jsonb
- is_correct
- response_ms
- awarded_points
- created_at

#### `game_results`
- id uuid
- session_id
- player_id nullable
- team_id nullable
- score
- correct
- total
- accuracy

## 7.3 Teacher authentication

Required:
- email/password or magic-link teacher sign-in;
- persistent session;
- protected teacher dashboard;
- anonymous students remain supported;
- local MVP Activity Sets can be imported into the account after sign-in.

Migration experience:
1. Teacher signs in.
2. ClassPlay detects local Activity Sets.
3. Prompt: “Move your local activities to your account?”
4. Import with duplicate detection.

## 7.4 Images

Activity items gain:
- upload custom image;
- image preview/crop where practical;
- remove/replace image;
- image fallback to hint text/emoji.

Later option:
- image search/generation integration only after licensing/safety decisions.

## 7.5 Text-to-Speech / audio

Initial TTS:
- browser speech synthesis where supported;
- language defaults to English;
- replay button on flashcards;
- teacher can disable audio.

Future:
- uploaded pronunciation audio;
- cloud TTS with selectable accents/voices.

## 7.6 QR Code and share links

Each live session exposes:
- human-friendly six-digit/short room code;
- join URL;
- QR Code;
- host lobby.

Students join with:
- nickname only;
- no account requirement.

Security requirements:
- room codes expire;
- host can lock room;
- nickname length/filter controls;
- no public list of active rooms.

## 7.7 Live multiplayer

### Session states

```text
created → lobby → playing → round_results → playing → final_results → closed
```

### Teacher host controls
- start game;
- next question;
- pause;
- reveal answer;
- remove player;
- lock room;
- end session;
- toggle leaderboard;
- toggle timer.

### Student client
- room join;
- nickname;
- waiting lobby;
- answer interaction;
- immediate personal feedback where host settings permit;
- round status.

## 7.8 Team Mode

Teacher can:
- create 2–8 teams;
- auto-assign players;
- manually move players;
- use team colors/names;
- view team score rather than individual ranking.

Projected UI:
- large team scoreboard;
- round winner;
- optional comeback bonus disabled by default.

## 7.9 Leaderboard controls

Modes:
- off;
- individual;
- team;
- anonymous rank (student sees own rank only — later).

Pedagogical principle: leaderboard is optional, never intrinsic to a game.

## 7.10 v0.2 accessibility

Implement settings panel:
- reduced motion;
- large text;
- high contrast;
- timer on/off;
- sound on/off;
- leaderboard on/off;
- read question aloud.

Settings can be saved per teacher and overridden per session.

## 7.11 Drag-and-drop enhancement

Add accessible drag-and-drop to:
- Sentence Builder;
- Matching optional layout.

Click/tap ordering remains available as fallback.

## 7.12 v0.2 definition of done

- Teacher authentication works.
- Cloud Activity Sets sync correctly.
- Existing local data migration is tested.
- Images can be attached to Activity Items.
- Flashcard TTS works on supported browsers.
- Host can open a live room.
- Student can join by code/QR without account.
- Realtime answers update host state.
- Individual and team play function.
- Host can disable timer/ranking.
- RLS prevents teachers accessing each other’s private data.
- Mobile student flow is tested.
- Projector host flow is tested.

---

# 8. Version 0.3 — Classes, Assignments & Insights

## Goal
Persist classroom organization and transform gameplay into useful formative assessment.

Features:
- classes;
- student rosters / anonymous-to-known mapping options;
- assignments;
- due dates;
- asynchronous play;
- attempt history;
- activity analytics;
- item difficulty;
- class accuracy;
- common errors;
- “needs attention” grammar/vocabulary concepts;
- CSV export;
- teacher notes.

### Insight examples

- “3rd person singular: 42% accuracy.”
- “goes / go confusion occurred in 11 answers.”
- “Vocabulary recognition is stronger than sentence production.”

Do not infer linguistic mastery from a single game. Reports must distinguish observed performance from broader competence.

---

# 9. Version 0.4 — AI Activity Studio

## Goal
Generate high-quality editable language content while keeping the teacher in control.

Teacher input:
- topic;
- grammar focus;
- vocabulary theme;
- CEFR level;
- school grade / age band;
- number of items;
- Brazilian learner context optional;
- game modes requested.

AI output may include:
- vocabulary pairs;
- example sentences;
- gap sentences;
- plausible distractors;
- sentence chunks;
- short quiz items;
- suggested hints;
- activity title/description.

Rules:
- AI content is always reviewable/editable before publication.
- Never auto-publish generated activities.
- Flag potentially ambiguous gap fills.
- Avoid answer options with multiple defensible answers.
- Keep a regeneration action per item, not just per whole set.

Future AI tools:
- “simplify to A1”;
- “make this harder”;
- “convert vocabulary to grammar practice”;
- “create a revision set from these three activities”;
- “generate distractors only”.

---

# 10. Version 0.5 — Library & Sharing

Features:
- public/unlisted activity publishing;
- shareable activity URL;
- duplicate/remix someone else’s set;
- favorites;
- search;
- filters by grade, CEFR, topic, grammar, vocabulary and game compatibility;
- creator attribution;
- report inappropriate content;
- curated collections.

Potential teacher collections:
- 6th Grade — House & Furniture;
- 7th Grade — Present Simple;
- 8th Grade — Comparatives & Superlatives;
- 9th Grade — Modal Verbs.

---

# 11. Version 1.0 — Stable Classroom Platform

A 1.0 release requires product stability rather than merely more features.

Minimum expectations:
- robust authentication;
- reliable autosave;
- live rooms resilient to reconnects;
- stable six core games;
- polished activity editor;
- accessible classroom settings;
- results/analytics;
- activity sharing;
- documented privacy/data retention;
- error monitoring;
- automated tests;
- deployment pipeline;
- backup/export path;
- responsive support for common modern browsers.

---

# 12. Future game backlog

Games should be implemented as independent renderers consuming Activity Set data.

Candidate modes:

### True or False
Statements + boolean answer.

### Spin the Wheel
Random prompt selector for speaking/review.

### Random Cards
Draw-a-card classroom speaking prompts.

### Categorize
Drag/click terms into categories: regular/irregular, countable/uncountable, positive/negative, etc.

### Word Unscramble
Reorder letters.

### Missing Letters
Spelling-focused practice.

### Word Search
Vocabulary recognition.

### Who Said It?
Dialogue/character matching.

### This or That
Fast comparative/opinion prompts.

### Speaking Cards
Full-screen prompt + optional timer + useful language scaffold.

### Hot Seat
Projected clue mode for teams.

### Bingo
Generate randomized boards from an Activity Set.

### Verb Sprint
Infinitive → past → participle quick rounds.

---

# 13. Language-learning extensions

## Pronunciation
- TTS;
- teacher-uploaded audio;
- IPA optional;
- accent label (US/UK/etc.) where applicable;
- record-and-compare only after privacy review.

## Grammar metadata
Potential future schema:
- target structure;
- tense/aspect;
- affirmative/negative/question;
- error tag;
- explanation;
- accepted alternative answers.

## Vocabulary metadata
Potential future schema:
- part of speech;
- translation;
- definition;
- collocation;
- CEFR;
- example;
- topic tags;
- pronunciation.

---

# 14. Visual design system

## Personality
Modern, warm, playful, confident and calm. It should feel like a contemporary consumer app rather than school administration software.

## Core visual principles
- generous whitespace;
- large rounded cards;
- strong typography;
- restrained color system;
- one dominant interaction per screen;
- subtle depth;
- motion only when it reinforces state.

## Base palette direction
- warm off-white background;
- very dark green/charcoal text;
- evergreen primary accent;
- soft lime highlight;
- semantic pastel game colors.

Game colors are decorative; correctness must also use icons/text.

## Themes backlog
- Clean (default);
- Arcade;
- Space;
- Neon;
- Classroom;
- Anime-inspired original theme without copyrighted characters/assets.

Theme changes must not change content or game logic.

---

# 15. UX rules

1. No essential teacher action more than two primary clicks away during a lesson.
2. Avoid modal chains.
3. Do not ask students to create an account to join a live room.
4. Use confirmation only for destructive actions.
5. Always show where a teacher is: Library → Activity → Game.
6. Preserve a way back to game-mode selection during play.
7. Empty-state messages explain how to fix missing content.
8. Classroom buttons must remain usable at distance.
9. Never hide the correct answer after an incorrect classroom response.
10. Activity authoring should preview which games the data supports.

---

# 16. Engineering architecture

Recommended long-term structure:

```text
src/
├── app/
│   ├── dashboard/
│   ├── create/
│   ├── activity/[id]/
│   ├── play/[id]/
│   ├── join/
│   └── api/                       # only where server routes are justified
├── components/
│   ├── ui/
│   ├── editor/
│   ├── classroom/
│   └── games/
├── games/                         # future game packages/registry
├── lib/
│   ├── activity-engine/
│   ├── scoring/
│   ├── repositories/
│   ├── supabase/
│   └── validation/
├── hooks/
├── types/
└── tests/
```

### Game registry target

Later replace hard-coded mode switches with a registry:

```ts
const gameRegistry = {
  memory: {
    component: MemoryGame,
    supports: canPlayMemory,
    defaultSettings: {}
  }
}
```

Benefits:
- add games without modifying every screen;
- detect whether Activity Set data is sufficient;
- expose per-game settings;
- generate editor warnings.

---

# 17. Validation strategy

## Activity validation
A shared validator should eventually verify:
- title length;
- minimum item count;
- unique item IDs;
- valid enabled game identifiers;
- required data by game;
- duplicate prompt/answer warnings;
- gap contains exactly one intended blank where required;
- distractors do not duplicate correct answer.

## Answer normalization
Normalization may handle:
- trim whitespace;
- collapse repeated whitespace;
- case normalization where appropriate;
- terminal punctuation normalization.

Future typed-answer modes need configurable strictness. Do not globally remove accents/apostrophes because that can change language meaning.

---

# 18. Testing strategy

## MVP
- pure engine smoke tests;
- source parse/type validation;
- manual browser QA;
- local persistence QA;
- responsive QA.

## v0.2
Add:
- unit tests for repositories/game engine;
- component tests for critical game states;
- Playwright end-to-end tests;
- Supabase integration tests;
- live room reconnection tests;
- RLS policy tests.

### Mandatory E2E scenarios
1. Create Activity Set → save → refresh → reopen.
2. Play all enabled games.
3. Teacher creates room → student joins → answers → host receives result.
4. Student reconnects after brief network loss.
5. Host disables leaderboard/timer.
6. Team assignment and scoring.

---

# 19. Security & privacy

Before connected student data is stored:
- minimize personal data;
- use nickname-only sessions by default;
- define retention for live-session records;
- apply RLS to every user-owned table;
- never expose service-role keys to browser clients;
- sanitize user-generated text rendering;
- validate file uploads by type/size;
- rate-limit room joining and AI generation where applicable;
- publish privacy policy before broad public use.

For school contexts, favor collecting less student-identifying data, not more.

---

# 20. Performance targets

Classroom reliability matters more than decorative complexity.

Targets:
- dashboard interactive quickly on ordinary school hardware;
- game transitions should feel immediate;
- avoid loading full-size images unnecessarily;
- prefetch the next question assets when possible;
- live-room payloads should transmit state changes, not entire activities repeatedly;
- animations must not block input.

---

# 21. Offline / PWA direction

Post-v0.2 investigation:
- installable PWA shell;
- cache recently used Activity Sets;
- allow teacher-led local games offline;
- queue cloud changes and sync after reconnect where safe.

Live multiplayer requires connectivity, but projected local play should eventually tolerate school-network failures.

---

# 22. Analytics philosophy

ClassPlay analytics should answer teaching questions rather than merely count clicks.

Useful:
- hardest item;
- most common wrong answer;
- average response time;
- accuracy by concept/tag;
- improvement across attempts;
- class vs individual patterns.

Avoid:
- claiming language proficiency from a single game;
- opaque AI-generated student labels;
- punitive ranking defaults.

---

# 23. Deployment strategy

## MVP local testing

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Hosted environments (v0.2)
Suggested stages:
- local;
- preview/development;
- production.

Environment variables must never be committed. Use `.env.local` locally and platform secrets in deployment.

Potential deployment target: Vercel for Next.js plus Supabase for database/auth/storage/realtime. Hosting choice should be revisited based on pricing and classroom traffic before public launch.

---

# 24. Release process

Each release should include:
1. version bump;
2. changelog entry;
3. automated validation;
4. manual game smoke test;
5. mobile/projector check;
6. migration notes if data schema changed;
7. tagged release after acceptance.

Branches:
- `main`: accepted/stable line;
- `agent/*` or feature branches: active implementation;
- pull requests for review once collaboration grows.

---

# 25. MVP local test checklist

After cloning:

```bash
git clone https://github.com/maylton/ClassPlay.git
cd ClassPlay
npm install
npm run dev
```

Then verify:

- [ ] Landing page loads.
- [ ] Dashboard opens.
- [ ] Demo Daily Routine Activity Set is present.
- [ ] Teacher display name can be changed.
- [ ] New Activity Set can be created with at least two items.
- [ ] Refresh preserves the Activity Set.
- [ ] Duplicate creates an independent copy.
- [ ] Flashcards flips and records self-checks.
- [ ] Memory pairs English and meanings.
- [ ] Matching accepts/rejects pairs correctly.
- [ ] Sentence Builder accepts the correct sequence.
- [ ] Gap Fill identifies the correct option.
- [ ] Quiz displays four or fewer options and scores answers.
- [ ] Completion screen appears.
- [ ] Completed-game count increases on Dashboard.
- [ ] User-created Activity Set can be deleted.
- [ ] Layout is readable at projector resolution.
- [ ] Layout remains usable on phone width.

Record every issue found before v0.2. Fix MVP regressions first; do not hide them behind new features.

---

# 26. v0.2 implementation order

Once MVP is approved, implement v0.2 in this exact dependency order:

1. Repository/data-access abstraction cleanup.
2. Supabase project + environment configuration.
3. Database schema + migrations.
4. RLS policies + tests.
5. Teacher authentication.
6. Local-to-cloud Activity Set migration.
7. Cloud CRUD/autosave.
8. Image storage/upload.
9. TTS/audio controls.
10. Game-session schema.
11. Host lobby.
12. Room code generation/expiry.
13. Student join flow.
14. Realtime presence/state.
15. Live question synchronization.
16. Student answer submission.
17. Live scoring.
18. Leaderboard controls.
19. Team Mode.
20. QR Code.
21. Accessibility settings.
22. Drag-and-drop enhancement with click fallback.
23. Mobile QA.
24. Projector QA.
25. Reconnection/error recovery.
26. v0.2 release candidate.

---

# 27. Explicitly out of scope for MVP

To protect the first release from scope creep, v0.1 does **not** include:
- cloud accounts;
- multiplayer;
- QR codes;
- public library;
- AI generation;
- student profiles;
- persistent classes;
- image uploads;
- server-side analytics;
- pronunciation recording;
- payments/subscriptions;
- public marketplace.

These omissions are deliberate and represented in later milestones.

---

# 28. Current project status

### v0.1 MVP
- [x] Product architecture defined.
- [x] Activity Set schema defined.
- [x] Local persistence layer.
- [x] Landing page.
- [x] Teacher dashboard.
- [x] Activity creator.
- [x] Game-mode selector.
- [x] Flashcards.
- [x] Memory.
- [x] Matching.
- [x] Sentence Builder.
- [x] Gap Fill.
- [x] Quiz.
- [x] Sample Daily Routine set.
- [x] Game result persistence.
- [x] Responsive visual system.
- [x] Engine smoke-test script.
- [x] Local classroom acceptance test by project owner.

### v0.2 — Connected Classroom
- [x] MVP gate approved; implementation unblocked.
- [x] Repository/data-access abstraction cleanup.
- [x] Supabase environment/configuration layer.
- [x] Database schema + migration.
- [x] RLS policies + security contract tests.
- [x] Teacher authentication UI and SSR session refresh.
- [x] Local-to-cloud Activity Set migration.
- [x] Cloud CRUD + edit autosave.
- [x] Private image upload/storage.
- [x] Flashcard TTS/audio controls.
- [x] Game-session schema.
- [x] Host lobby.
- [x] Expiring six-digit room codes.
- [x] Anonymous student join flow.
- [x] Realtime Presence/Broadcast and host DB subscriptions.
- [x] Live question synchronization.
- [x] Server-validated student answer submission.
- [x] Live scoring.
- [x] Leaderboard controls.
- [x] Team Mode.
- [x] QR Code.
- [x] Accessibility settings.
- [x] Sentence Builder drag-and-drop enhancement with click/tap fallback.
- [x] Student reconnect/resume implementation.
- [x] Core/live security smoke tests and CI validation added.
- [ ] Supabase-backed integration acceptance test.
- [ ] Mobile device acceptance test with real room.
- [ ] Projector acceptance test with real room.
- [ ] v0.2 release candidate accepted and merged to `main`.

**Current state:** code-complete release candidate; connected acceptance testing is the remaining gate.

---

## Final product north star

A teacher should be able to go from **“I need to practise this language point”** to **a polished classroom game** in a few minutes, and should be able to change the type of practice without recreating the content.
