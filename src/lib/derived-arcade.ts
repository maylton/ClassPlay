import { getPlayableItemsForMode } from "./activity-intelligence";
import { DERIVED_ARCADE_MODE_ORDER } from "./game-catalog";
import type { ActivitySet, GameType } from "./types";

export type DerivedArcadeReadiness = {
  quiz: number;
  gap: number;
  sentenceBuilder: number;
  modes: GameType[];
};

export function getDerivedArcadeReadiness(activity: Pick<ActivitySet, "items">): DerivedArcadeReadiness {
  const quiz = getPlayableItemsForMode(activity.items, "quiz").length;
  const gap = getPlayableItemsForMode(activity.items, "gap-fill").length;
  const sentenceBuilder = getPlayableItemsForMode(activity.items, "sentence-builder").length;
  const questionReady = quiz >= 3 || gap >= 3;
  const phraseReady = sentenceBuilder >= 2;
  const readiness: Record<(typeof DERIVED_ARCADE_MODE_ORDER)[number], boolean> = {
    "boss-battle": questionReady,
    "bubble-burst": questionReady,
    "phrase-forge": phraseReady,
    "tower-stack": questionReady,
  };
  return {
    quiz,
    gap,
    sentenceBuilder,
    modes: DERIVED_ARCADE_MODE_ORDER.filter((mode) => readiness[mode]),
  };
}
