import type { ComponentType } from "react";
import type { GameType } from "@/lib/types";
import { BossBattleGame } from "./BossBattleGame";
import { BubbleBurstGame } from "./BubbleBurstGame";
import { FlashcardsGame } from "./FlashcardsGame";
import { GapFillGame } from "./GapFillGame";
import { GrammarRunnerGame } from "./GrammarRunnerGame";
import type { GameProps } from "./GameTypes";
import { MatchingGame } from "./MatchingGame";
import { MemoryGame } from "./MemoryGame";
import { PhraseForgeGame } from "./PhraseForgeGame";
import { QuizGame } from "./QuizGame";
import { SentenceBuilderGame } from "./SentenceBuilderGame";
import { SpaceBlasterGame } from "./SpaceBlasterGame";
import { WordMazeGame } from "./WordMazeGame";

export const GAME_COMPONENTS: Record<GameType, ComponentType<GameProps>> = {
  flashcards: FlashcardsGame,
  memory: MemoryGame,
  matching: MatchingGame,
  "sentence-builder": SentenceBuilderGame,
  "gap-fill": GapFillGame,
  quiz: QuizGame,
  "space-blaster": SpaceBlasterGame,
  "word-maze": WordMazeGame,
  "boss-battle": BossBattleGame,
  "bubble-burst": BubbleBurstGame,
  "grammar-runner": GrammarRunnerGame,
  "phrase-forge": PhraseForgeGame,
};
