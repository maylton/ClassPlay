# ClassPlay visual system

ClassPlay uses the **Classroom Studio** visual language. The goal is a clean teacher workspace that becomes more energetic around game choice and gameplay.

## Style architecture

Visual code has three explicit layers, loaded in this order from `src/app/layout.tsx`:

1. `globals.css` — stable layout primitives and base component structure.
2. `features.css` — structural styles for product features such as auth, media, settings and Connected Classroom.
3. `studio.css` — the official ClassPlay brand/theme and the only place for visual overrides.

Do **not** create versioned override sheets such as `identity-v2.css`, `identity-v3.css`, `v03.css` or `studio-v2.css`. Refine the appropriate semantic section of `studio.css` instead. If a visual area becomes too large to maintain comfortably, split it by responsibility (for example dashboard, games or live), not by chronological version.

## Product tokens

The canonical palette and compatibility aliases live at the top of `studio.css`. New components should prefer `--studio-*` tokens instead of hard-coded brand colors when the color has a reusable semantic role.

Current core direction:

- violet: structural brand field
- lavender: page/canvas environment
- white: working surfaces and sheets
- charcoal: primary ink and high-contrast controls
- lime: ClassPlay signature accent and primary playful highlight
- blue, coral, mint and yellow: supporting game/state accents

## Icons

UI icons use Bootstrap Icons through `AppIcon`. Do not use emojis as product-interface icons. Emojis remain valid inside teacher-authored activity content.

## Game modes

Presentation metadata for game modes lives in `src/lib/game-catalog.ts`.

When a new mode is added, define its name, icon, visual class and context-specific descriptions there, then consume that catalog from Landing, Dashboard, Editor and Game Hub. Do not duplicate mode metadata inside components.

## CSS rules

- Prefer reusable tokens and component classes over one-off inline visual constants.
- Keep structural/layout rules in the base/feature layer when they are required independently of the theme.
- Keep brand colors, shadows, radii and visual states in `studio.css`.
- Avoid specificity escalation. `!important` is acceptable at the boundary where the official theme intentionally overrides a stable base/feature rule, but it should not be used to fight another theme file.
- Remove obsolete markup and selectors when a visual element is retired.
- Respect `prefers-reduced-motion` for non-essential animation.
- Preserve projector readability and strong contrast in game/live views.

## Review checklist

Before merging a visual change:

- verify dashboard, editor, mode picker and at least one local game;
- verify live host and student views;
- verify desktop and mobile layouts;
- verify no interface emoji was introduced;
- verify new game-mode metadata is not duplicated;
- run engine tests, live/security tests, typecheck, lint and production build.
