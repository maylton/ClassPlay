import type { GameType } from "./types";

export type GameModePresentation = {
  icon: string;
  name: string;
  shortName: string;
  colorClass: string;
  pickerDescription: string;
  editorDescription: string;
  landingDescription: string;
};

export const GAME_MODE_CATALOG = {
  flashcards: { icon: "card-text", name: "Flashcards", shortName: "Flashcards", colorClass: "mint", pickerDescription: "Reveal, remember and self-check", editorDescription: "Reveal prompt and answer", landingDescription: "Reveal vocabulary, examples and meanings with one tap." },
  memory: { icon: "grid-3x3-gap", name: "Memory", shortName: "Memory", colorClass: "violet", pickerDescription: "Find matching pairs", editorDescription: "Find matching pairs", landingDescription: "Match words and meanings in a fast classroom challenge." },
  matching: { icon: "link-45deg", name: "Matching", shortName: "Matching", colorClass: "blue", pickerDescription: "Connect English and meaning", editorDescription: "Connect prompts and answers", landingDescription: "Connect related language without slowing the lesson down." },
  "sentence-builder": { icon: "puzzle", name: "Sentence Builder", shortName: "Builder", colorClass: "orange", pickerDescription: "Put chunks in the right order", editorDescription: "Put chunks in order", landingDescription: "Build correct sentences one chunk at a time." },
  "gap-fill": { icon: "pencil-square", name: "Gap Fill", shortName: "Gap fill", colorClass: "pink", pickerDescription: "Complete the missing language", editorDescription: "Complete the sentence", landingDescription: "Choose the missing language and get instant feedback." },
  quiz: { icon: "trophy", name: "Quiz", shortName: "Quiz", colorClass: "yellow", pickerDescription: "Fast multiple-choice challenge", editorDescription: "Quick multiple choice", landingDescription: "Turn the same content into a quick whole-class check." },
  "space-blaster": { icon: "rocket-takeoff", name: "Space Blaster", shortName: "Blaster", colorClass: "space", pickerDescription: "Move, aim and blast the right answer", editorDescription: "Blast the language that completes the sentence", landingDescription: "Pilot a ClassPlay ship and fire at the language that completes each sentence." },
  "word-maze": { icon: "map", name: "Word Maze", shortName: "Maze", colorClass: "maze", pickerDescription: "Navigate to the correct answer portal", editorDescription: "Find the correct language inside a maze", landingDescription: "Navigate a playful maze and reach the portal with the correct missing language." },
  "boss-battle": { icon: "shield-shaded", name: "Boss Battle", shortName: "Boss", colorClass: "boss", pickerDescription: "Answer fast, build a streak and defeat Ignis", editorDescription: "Arcade mode generated from Quiz or Gap Fill content", landingDescription: "Turn correct answers, speed and streaks into attacks against Ignis." },
  "bubble-burst": { icon: "circle", name: "Bubble Burst", shortName: "Bubbles", colorClass: "bubble", pickerDescription: "Read, react and pop the correct answer", editorDescription: "Arcade mode generated from Quiz or Gap Fill content", landingDescription: "Pop floating answer bubbles while keeping the language easy to read." },
  // Kept for backwards compatibility only. Grammar Runner is paused and hidden from the UI.
  "grammar-runner": { icon: "sign-turn-right-fill", name: "Grammar Runner", shortName: "Runner", colorClass: "runner", pickerDescription: "Choose a lane and outrun the wrong answer", editorDescription: "Arcade mode generated from Quiz or Gap Fill content", landingDescription: "Read the prompt, choose a lane and race through the correct language gate." },
  "phrase-forge": { icon: "hammer", name: "Phrase Forge", shortName: "Forge", colorClass: "forge", pickerDescription: "Forge complete sentences from word ingots", editorDescription: "Arcade mode generated from Sentence Builder content", landingDescription: "Heat the forge by rebuilding complete sentences word by word." },
} satisfies Record<GameType, GameModePresentation>;

/** Authorable source modes persisted in activity_games. */
export const GAME_MODE_ORDER: GameType[] = [
  "flashcards",
  "memory",
  "matching",
  "sentence-builder",
  "gap-fill",
  "quiz",
  "space-blaster",
  "word-maze",
];

/** Runtime-only Arcade experiences derived from existing source content. */
export const DERIVED_ARCADE_MODE_ORDER = [
  "boss-battle",
  "bubble-burst",
  "phrase-forge",
] as const satisfies readonly GameType[];

export type DerivedArcadeMode = (typeof DERIVED_ARCADE_MODE_ORDER)[number];

/** All local/practice Arcade experiences, including authorable Arcade modes. */
export const ARCADE_MODE_ORDER = [
  "space-blaster",
  "word-maze",
  ...DERIVED_ARCADE_MODE_ORDER,
] as const satisfies readonly GameType[];

export function isArcadeMode(mode: GameType) {
  return (ARCADE_MODE_ORDER as readonly GameType[]).includes(mode);
}

export function isDerivedArcadeMode(mode: GameType): mode is DerivedArcadeMode {
  return (DERIVED_ARCADE_MODE_ORDER as readonly GameType[]).includes(mode);
}
