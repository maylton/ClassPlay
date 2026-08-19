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
  flashcards: {
    icon: "card-text",
    name: "Flashcards",
    shortName: "Flashcards",
    colorClass: "mint",
    pickerDescription: "Reveal, remember and self-check",
    editorDescription: "Reveal prompt and answer",
    landingDescription: "Reveal vocabulary, examples and meanings with one tap.",
  },
  memory: {
    icon: "grid-3x3-gap",
    name: "Memory",
    shortName: "Memory",
    colorClass: "violet",
    pickerDescription: "Find matching pairs",
    editorDescription: "Find matching pairs",
    landingDescription: "Match words and meanings in a fast classroom challenge.",
  },
  matching: {
    icon: "link-45deg",
    name: "Matching",
    shortName: "Matching",
    colorClass: "blue",
    pickerDescription: "Connect English and meaning",
    editorDescription: "Connect prompts and answers",
    landingDescription: "Connect related language without slowing the lesson down.",
  },
  "sentence-builder": {
    icon: "puzzle",
    name: "Sentence Builder",
    shortName: "Builder",
    colorClass: "orange",
    pickerDescription: "Put chunks in the right order",
    editorDescription: "Put chunks in order",
    landingDescription: "Build correct sentences one chunk at a time.",
  },
  "gap-fill": {
    icon: "pencil-square",
    name: "Gap Fill",
    shortName: "Gap fill",
    colorClass: "pink",
    pickerDescription: "Complete the missing language",
    editorDescription: "Complete the sentence",
    landingDescription: "Choose the missing language and get instant feedback.",
  },
  quiz: {
    icon: "trophy",
    name: "Quiz",
    shortName: "Quiz",
    colorClass: "yellow",
    pickerDescription: "Fast multiple-choice challenge",
    editorDescription: "Quick multiple choice",
    landingDescription: "Turn the same content into a quick whole-class check.",
  },
} satisfies Record<GameType, GameModePresentation>;

export const GAME_MODE_ORDER = Object.keys(GAME_MODE_CATALOG) as GameType[];
