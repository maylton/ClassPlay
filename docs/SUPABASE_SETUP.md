# ClassPlay v0.2 — Supabase setup

ClassPlay keeps all six local/projector games available without a backend. The connected features in v0.2 — teacher accounts, cloud sync, image storage and live rooms — activate when Supabase is configured.

## Production target

The current production hostname target is:

```text
https://classplay.langspot.app
```

This keeps ClassPlay technically independent from the LangSpot portfolio while reusing the existing `langspot.app` domain.

## 1. Supabase project

The ClassPlay Supabase project has been created in São Paulo (`sa-east-1`).

Project URL:

```text
https://oxzrrsbrhyqaobzysyhc.supabase.co
```

The repository deliberately does not commit the publishable key. Keep environment values in `.env.local` locally and in deployment-platform environment variables for hosted environments.

## 2. Apply the ClassPlay schema

Apply the migrations in order:

```text
supabase/migrations/0001_connected_classroom.sql
supabase/migrations/0002_security_hardening.sql
supabase/migrations/0003_rls_and_index_optimization.sql
supabase/migrations/0004_fix_live_room_join_ambiguity.sql
```

The migrations create and configure:

- teacher profiles;
- Activity Sets, items and enabled games;
- live sessions, teams, anonymous players, answers and results;
- Row Level Security policies;
- the private `activity-media` Storage bucket;
- narrow accountless student RPCs;
- Realtime publication entries;
- profile creation and server-side round timing triggers;
- hardened RPC permissions/search paths;
- RLS query optimizations and foreign-key indexes;
- qualified live-room join lookup columns to avoid PostgreSQL output-column ambiguity.

## 3. Configure authentication URLs

For local testing, set the Supabase Site URL to:

```text
http://localhost:3000
```

Allow this redirect URL:

```text
http://localhost:3000/auth/callback
```

For production, add:

```text
https://classplay.langspot.app
https://classplay.langspot.app/auth/callback
```

Email/password and magic-link authentication are both supported by the app. If email confirmation is enabled, the teacher completes confirmation before the first signed-in session.

## 4. Create `.env.local`

Copy the example file:

```bash
cp .env.example .env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://oxzrrsbrhyqaobzysyhc.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Use the project's **publishable** client key. Never put a service-role/secret key in a `NEXT_PUBLIC_*` variable.

In production, use:

```env
NEXT_PUBLIC_APP_URL=https://classplay.langspot.app
```

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
- Students do not receive direct table access for joining or answering; accountless operations go through narrow `security definer` RPCs protected by room state and, after join, a random player token.
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

Confirm all migrations ran fully, including `0004_fix_live_room_join_ambiguity.sql`, and verify the room is still in the lobby, is not locked, and the six-digit code is correct.

### Live host does not update after answers

Confirm `players`, `answers` and `game_sessions` are present in the `supabase_realtime` publication.
