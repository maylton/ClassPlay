# Changelog

## 0.3.0 — Smart Activity Builder

### Added
- Adaptive activity editor that only shows fields required by the selected game modes.
- Deterministic activity compatibility engine for detecting reusable game variants.
- Smart Variants section on the mode picker with one-click mode activation.
- Automatic Gap Fill generation from a full sentence plus target expression.
- Automatic Sentence Builder chunks derived from the same canonical sentence.
- Automatic Quiz choices from other compatible answers in the activity.
- Generated-variant previews and optional advanced overrides in the editor.
- Compatibility-aware game item filtering so mixed/richer activity data stays safe across modes.
- Smart Gap Fill derivation for Connected Classroom question preparation.
- Live-room readiness guard for activities that do not yet contain question-ready content.
- `smart-builder.css` as a responsibility-based visual module within the Classroom Studio system.
- v0.3 Smart Activity Builder architecture and acceptance documentation.

### Changed
- New activities begin by choosing game modes before entering content instead of showing every possible field at once.
- Generated variants remain derived from source content rather than being duplicated as a second source of truth.
- Existing activities can expose additional compatible game modes without requiring the teacher to re-enter content.

### Compatibility
- Existing v0.2 activity records remain supported.
- Existing manual gap sentences and sentence chunks remain valid overrides.
- No new Supabase schema migration is required for the Smart Activity Builder.

## 0.2.0 — Connected Classroom

### Added
- Supabase teacher authentication with password and magic link.
- Teacher signup gate before creating cloud activities.
- Cloud Activity Set CRUD, edit screen and autosave.
- v0.1 local-to-cloud import with duplicate detection.
- Private image upload/storage with signed delivery URLs.
- Browser English text-to-speech on flashcards and read-aloud setting.
- Classroom accessibility settings: reduced motion, large text, high contrast, sound, timer and leaderboard controls.
- Accessible drag-and-drop enhancement for Sentence Builder while preserving tap/click interaction.
- Live host lobby with expiring six-digit room code and QR code.
- Anonymous student join flow with nickname-only access.
- Realtime question/reveal/final-state broadcasts and presence.
- Immediate host refresh when student answers are accepted.
- Early round completion when every active player has answered.
- Timer-expiry reveal and explicit host next-question flow.
- Individual live scoring and optional leaderboard.
- Team Mode with 2–8 teams, auto-balancing, manual reassignment and team scoreboard.
- Student reconnect/resume flow.
- Server-side answer validation and speed scoring.
- Bootstrap Icons integration through a shared `AppIcon` component for consistent product UI iconography.
- Connected Classroom setup and acceptance documentation.
- Live/security smoke tests and stronger CI validation.

### Fixed
- Corrected the live-room join RPC ambiguity that prevented anonymous students from entering valid rooms.
- Restored immediate host answer-count updates through a Realtime Broadcast refresh signal.
- Fixed live round progression so completed/timed-out rounds can reveal and advance correctly.

### Security hardening
- Correct answers are stripped from student question payloads until teacher reveal.
- Answer RPCs do not return the hidden correct answer.
- Speed bonuses use database/server round timing rather than client-reported timing.
- Student RPC execute permissions are explicitly scoped.
- RLS protects teacher-owned data and private media storage.

### Acceptance
v0.2 passed connected-room acceptance with real Supabase authentication, cloud activity persistence, anonymous room joining, live answering, automatic host updates, round transitions and next-question flow. The Connected Classroom milestone is approved as the new stable baseline.
