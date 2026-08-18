# ClassPlay

**Create once. Play many ways.**

ClassPlay is a classroom-first web app for creating reusable English-learning Activity Sets and playing the same language through Flashcards, Memory, Matching, Sentence Builder, Gap Fill and Quiz activities.

The current stable baseline is **v0.2.0 — Connected Classroom**. It combines the accepted local/projector MVP with teacher accounts, cloud persistence and live multiplayer classrooms.

## What ClassPlay can do

### Local / projector mode

Works with no backend or account:

- modern landing page and teacher library;
- Activity Set creation and editing;
- browser-local persistence;
- six game modes;
- Flashcard English TTS;
- Sentence Builder tap/click plus accessible drag-to-reorder;
- images stored as small local data URLs when cloud is unavailable;
- classroom accessibility settings;
- responsive projector, desktop and phone layouts;
- canonical `Daily Routine — Present Simple` demo.

### Connected Classroom — v0.2

Activated when Supabase environment variables are configured:

- teacher accounts with password or magic link;
- teacher signup before creating cloud activities;
- cloud Activity Set sync and autosave;
- one-click import of activities created in v0.1 local mode;
- private image storage;
- live rooms with six-digit codes and QR codes;
- nickname-only student joining with no student account;
- Realtime lobby presence, questions and answer counts;
- automatic host refresh as answers arrive;
- early round reveal when all active students answer;
- timer-based round reveal and teacher-controlled next-question flow;
- individual scores and optional leaderboard;
- Team Mode with 2–8 teams;
- timer and ranking controls;
- reconnect/resume after a student refresh;
- RLS-protected teacher data and narrow anonymous student RPCs.

### Product UI

ClassPlay uses Tailwind/product CSS for layout and **Bootstrap Icons** for interface iconography through a shared `AppIcon` component. Emojis remain valid inside teacher-authored activity content, but product controls use consistent vector icons.

The complete product plan is in [`ROADMAP.md`](./ROADMAP.md). Connected backend setup is in [`docs/SUPABASE_SETUP.md`](./docs/SUPABASE_SETUP.md).

## Run locally

Requirements:

- Node.js 22 recommended (Node 20.9+ supported by the current Next.js line);
- npm.

```bash
git clone https://github.com/maylton/ClassPlay.git
cd ClassPlay
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

With no `.env.local`, ClassPlay automatically runs in **Local mode** and all six teacher-led games remain available.

## Enable v0.2 cloud/live features

```bash
cp .env.example .env.local
```

Then configure:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Apply the migrations in order:

```text
supabase/migrations/0001_connected_classroom.sql
supabase/migrations/0002_security_hardening.sql
supabase/migrations/0003_rls_and_index_optimization.sql
supabase/migrations/0004_fix_live_room_join_ambiguity.sql
```

See [`docs/SUPABASE_SETUP.md`](./docs/SUPABASE_SETUP.md) for the full setup and acceptance-test sequence.

## Validation commands

```bash
npm run test:engine
npm run test:live
npm run typecheck
npm run lint
npm run build
```

GitHub Actions runs the same validation on `main`, `agent/**` branches and pull requests to `main`.

## Core architecture

Learning content is separate from game renderers:

```text
Activity Set
    ↓
Repository layer
(localStorage or Supabase)
    ↓
Game / Classroom engine
    ↓
┌────────────┬────────┬──────────┬───────────────┐
Flashcards  Memory   Matching   Sentence Builder …
└────────────┴────────┴──────────┴───────────────┘
```

This lets teachers create language once and change the type of practice without recreating the material.

### Connected Classroom flow

```text
Teacher account
      ↓
Cloud Activity Set
      ↓
Live session ──────→ Realtime host screen
      │
      ├── 6-digit room code
      ├── QR join URL
      │
      └── Anonymous player token
               ↓
        Student answer RPC
               ↓
      server validation/scoring
               ↓
       Realtime host refresh
```

The correct answer remains host-side until reveal. Speed scoring is based on server round time rather than client-reported timing.

## Project structure

```text
src/
├── app/
│   ├── auth/
│   ├── create/
│   ├── dashboard/
│   ├── edit/[id]/
│   ├── host/
│   ├── join/
│   └── play/[id]/
├── components/
│   ├── games/
│   ├── live/
│   ├── media/
│   └── settings/
├── hooks/
├── lib/
│   ├── live/
│   ├── repositories/
│   └── supabase/
└── proxy.ts

supabase/
└── migrations/
```

## Data safety in v0.2

- teacher-owned database rows use Row Level Security;
- students do not need accounts;
- accountless joins/answers use limited RPCs and a random per-player token;
- media is stored in a private bucket;
- hidden answers are not sent to student clients before reveal;
- no service-role/secret key belongs in browser environment variables.

## Release status

- **v0.1.0 MVP:** accepted after local testing.
- **v0.2.0 Connected Classroom:** accepted after Supabase-backed cloud/live testing and now the stable baseline.
- **Next target:** v0.3 — Classes, Assignments & Insights.

See [`CHANGELOG.md`](./CHANGELOG.md) for release details.

## License

License decision pending before broad public release.
