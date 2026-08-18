# ClassPlay

**Create once. Play many ways.**

ClassPlay is a classroom-first web app for creating reusable English-learning Activity Sets and playing them as Flashcards, Memory, Matching, Sentence Builder, Gap Fill and Quiz activities.

## MVP status

The current codebase is **v0.1.0 (MVP)** and uses browser-local storage so it can be tested without a backend or account.

Included now:
- modern landing page;
- teacher dashboard/library;
- local teacher display name;
- Activity Set creator;
- local persistence;
- duplicate/delete workflow;
- six playable game modes;
- responsive classroom/mobile UI;
- sample `Daily Routine — Present Simple` Activity Set;
- local game result count.

The full product plan is in [`ROADMAP.md`](./ROADMAP.md).

## Run locally

Requirements:
- Node.js 20.9 or newer.
- npm.

```bash
git clone https://github.com/maylton/ClassPlay.git
cd ClassPlay
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Useful commands

```bash
npm run dev
npm run build
npm run lint
npm run test:engine
```

## MVP data storage

Activity Sets, teacher name and recent game results are saved in browser `localStorage`.

This means:
- no account is required;
- data stays in the current browser/profile;
- clearing site data removes local ClassPlay content;
- activities created in one browser are not automatically visible in another.

Cloud persistence and teacher accounts are planned for v0.2 after MVP acceptance testing.

## Project structure

```text
src/
├── app/
│   ├── create/
│   ├── dashboard/
│   ├── play/[id]/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── games/
│   ├── ActivityEditor.tsx
│   ├── AppHeader.tsx
│   ├── Brand.tsx
│   ├── DashboardClient.tsx
│   └── GameHub.tsx
└── lib/
    ├── game-engine.ts
    ├── sample-data.ts
    ├── storage.ts
    └── types.ts
```

## Core architecture

The game components do not own their learning content. They receive the same `ActivitySet` contract and interpret the fields needed for that interaction.

```text
Activity Set
    ↓
Game mode selector
    ↓
┌────────────┬────────┬──────────┐
Flashcards  Memory   Matching  ...
└────────────┴────────┴──────────┘
```

This is the key design decision that lets ClassPlay reuse content and add new games later.

## Next milestone

Do **not** begin v0.2 until the MVP has been tested locally and accepted. The next release adds Supabase, teacher authentication, cloud sync, images, TTS, live rooms, QR codes, student joining, realtime scoring and Team Mode.

## License

License decision pending before public release.
