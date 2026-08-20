import type { ComponentType } from "react";
import type { GameType } from "@/lib/types";
import { BossBattleGame } from "./BossBattleGame";
import { BubbleBurstGame } from "./BubbleBurstGame";
import { FlashcardsGame } from "./FlashcardsGame";
import { GapFillGame } from "./GapFillGame";
import type { GameProps } from "./GameTypes";
import { MatchingGame } from "./MatchingGame";
import { MemoryGame } from "./MemoryGame";
import { PhraseForgeGame } from "./PhraseForgeGame";
import { QuizGame } from "./QuizGame";
import { SentenceBuilderGame } from "./SentenceBuilderGame";
import { SpaceBlasterGame } from "./SpaceBlasterGame";
import { TowerStackGame } from "./TowerStackGame";
import { WordMazeGame } from "./WordMazeGame";

// Grammar Runner is intentionally paused. Keep a no-op registry slot so older
// persisted references remain safe while the actual implementation stays archived.
const PausedGrammarRunner = () => null;

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
  "grammar-runner": PausedGrammarRunner,
  "phrase-forge": PhraseForgeGame,
  "tower-stack": TowerStackGame,
};
