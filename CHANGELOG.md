# Changelog

## 0.2.0-rc.1 — Connected Classroom

### Added
- Supabase-ready repository/data layer with local fallback.
- Teacher email/password and magic-link authentication.
- Cloud Activity Set CRUD, edit screen and autosave.
- v0.1 local-to-cloud import with duplicate detection.
- Private image upload/storage with signed delivery URLs.
- Browser English text-to-speech on flashcards and read-aloud setting.
- Classroom accessibility settings: reduced motion, large text, high contrast, sound, timer and leaderboard controls.
- Accessible drag-and-drop enhancement for Sentence Builder while preserving tap/click interaction.
- Live host lobby with expiring six-digit room code and QR code.
- Anonymous student join flow with nickname-only access.
- Realtime question/reveal/final-state broadcasts and presence.
- Individual live scoring and optional leaderboard.
- Team Mode with 2–8 teams, auto-balancing, manual reassignment and team scoreboard.
- Student reconnect/resume flow.
- Server-side answer validation and speed scoring.
- RLS policies, private media bucket and narrow anonymous RPCs.
- Connected Classroom setup/acceptance documentation.
- Live/security smoke tests and stronger CI validation.

### Security hardening
- Correct answers are stripped from student question payloads until teacher reveal.
- Answer RPCs do not return the hidden correct answer.
- Speed bonuses use database/server round timing rather than client-reported timing.
- Student RPC execute permissions are explicitly scoped.

### Status
This is a release candidate. The code path is complete, but Supabase-backed integration, mobile and projector acceptance testing must pass before v0.2 is merged into `main` and tagged stable.
