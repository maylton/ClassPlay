# ClassPlay v0.2 — Supabase setup

ClassPlay keeps all six local/projector games available without a backend. The connected features in v0.2 — teacher accounts, cloud sync, image storage and live rooms — activate when Supabase is configured.

## 1. Create a project

Create a Supabase project for ClassPlay. For classroom testing, the free project is enough to validate the flow before choosing a production plan.

## 2. Apply the ClassPlay schema

Open the Supabase SQL Editor and run the complete migration:

```text
supabase/migrations/0001_connected_classroom.sql
```

The migration creates:

- teacher profiles;
- Activity Sets, items and enabled games;
- live sessions, teams, anonymous players, answers and results;
- Row Level Security policies;
- the private `activity-media` Storage bucket;
- accountless student RPCs;
- Realtime publication entries;
- profile creation and server-side round timing triggers.

It is safe to rerun the migration during early testing: triggers and policies are replaced where necessary and tables use `if not exists`.

## 3. Configure authentication URLs

In **Authentication → URL Configuration**, use your current ClassPlay URL as the Site URL.

For local testing:

```text
http://localhost:3000
```

Allow this redirect URL:

```text
http://localhost:3000/auth/callback
```

When ClassPlay is deployed, add the production `/auth/callback` URL too.

Email/password and magic-link authentication are both supported by the app. If email confirmation is enabled, the teacher completes confirmation before the first signed-in session.

## 4. Create `.env.local`

Copy the example file:

```bash
cp .env.example .env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Use the project's **publishable** client key. Never put a service-role/secret key in a `NEXT_PUBLIC_*` variable.

## 5. Restart ClassPlay

```bash
npm run dev
```

Then open `http://localhost:3000`.

The header should show **Sign in** instead of **Local mode**.

## 6. Acceptance test

### Teacher cloud

1. Create a teacher account.
2. Sign in.
3. Import any Activity Sets detected from the v0.1 local browser library.
4. Create a new Activity Set and refresh the page.
5. Confirm it remains in the library.
6. Edit it and confirm autosave.
7. Upload a JPG/PNG/WebP/GIF under 5 MB and confirm the image renders.
8. Open Flashcards and test the pronunciation button.

### Live individual room

1. Open an Activity Set and choose **Start live room**.
2. Choose **Individual**.
3. Scan the QR code from a phone, or open `/join` in a private browser window.
4. Join with a nickname only.
5. Start the game from the host screen.
6. Submit an answer from the student device.
7. Confirm the host answer counter/score updates.
8. Confirm a wrong answer does not reveal the correct option until the host presses **Reveal answer**.
9. Refresh the student page mid-game and confirm it reconnects.
10. Finish the game and confirm final scores.

### Team room

1. Create a new live session in **Teams** mode.
2. Join with at least two student clients.
3. Confirm automatic team balancing.
4. Move a student between teams from the lobby.
5. Confirm the projected scoreboard aggregates team points.

### Accessibility/session controls

Confirm:

- timer can be disabled;
- leaderboard can be disabled;
- reduced motion works;
- large-text mode works;
- high-contrast mode works;
- sound can be disabled;
- read-aloud can be enabled;
- Sentence Builder still works by tap/click when drag is not used.

## Security model

- Teacher-owned tables use RLS and are accessible only to their owner.
- Students do not receive database table access for joining or answering; accountless operations go through narrow `security definer` RPCs protected by a random player token.
- The hidden correct answer stays in the host-owned session record and is removed from the student's question payload until reveal.
- Speed points are calculated from server-side round time, not a browser-supplied timer.
- Uploaded files live in a private Storage bucket and are served through temporary signed URLs.
- Live room codes expire; the host can lock the lobby and remove players.

## Troubleshooting

### Header still says Local mode

Check that both Supabase variables exist in `.env.local`, then restart `npm run dev`.

### Authentication returns to the wrong URL

Check the Supabase Site URL and allowed redirect URL, then verify `NEXT_PUBLIC_APP_URL`.

### Students cannot join

Confirm the migration ran fully, the room is still in the lobby, it is not locked, and the six-digit code is correct.

### Live host does not update after answers

Confirm the migration added `players`, `answers` and `game_sessions` to the `supabase_realtime` publication. Rerunning the migration is safe during this test phase.
