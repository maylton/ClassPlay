export type GameType =
  | "flashcards"
  | "memory"
  | "matching"
  | "sentence-builder"
  | "gap-fill"
  | "quiz";

export type ActivityKind = "vocabulary" | "grammar" | "mixed";

export interface ActivityItem {
  id: string;
  prompt: string;
  answer: string;
  hint?: string;
  imageUrl?: string;
  example?: string;
  distractors?: string[];
  sentenceParts?: string[];
  gapSentence?: string;
}

export interface ActivitySet {
  id: string;
  title: string;
  description: string;
  subject: string;
  topic: string;
  level: string;
  grade: string;
  kind: ActivityKind;
  items: ActivityItem[];
  enabledGames: GameType[];
  createdAt: string;
  updatedAt: string;
}

export interface TeacherProfile {
  name: string;
  school?: string;
}

export interface GameResult {
  game: GameType;
  activityId: string;
  score: number;
  correct: number;
  total: number;
  completedAt: string;
}
