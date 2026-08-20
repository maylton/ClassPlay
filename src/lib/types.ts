export type GameType =
  | "flashcards"
  | "memory"
  | "matching"
  | "sentence-builder"
  | "gap-fill"
  | "quiz"
  | "space-blaster"
  | "word-maze"
  | "boss-battle"
  | "bubble-burst"
  | "grammar-runner"
  | "phrase-forge"
  | "tower-stack"
  | "word-hunt"
  | "typing-rush";

export type LiveGameMode = "gap-fill" | "quiz" | "space-blaster" | "dynamite" | "wildcard-grid";
export type DynamiteTimerSeconds = 10 | 15 | 20;
export type WildcardGridSize = 12 | 16 | 20;
export type WildcardGridIntensity = "balanced" | "chaos";
export type WildcardGridQuestionSource = "smart" | "gap-fill" | "quiz" | "prompt-answer";
export type WildcardGridPhase = "board" | "question" | "result" | "wildcard" | "finished";
export type WildcardEffectType =
  | "jackpot"
  | "little-boost"
  | "oops"
  | "heist"
  | "gift"
  | "equalizer"
  | "pickpocket"
  | "shield"
  | "double-trouble"
  | "swap"
  | "blackout"
  | "fresh-start";
export type ActivityKind = "vocabulary" | "grammar" | "mixed";
export type ActivityVisibility = "private" | "unlisted";

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
  visibility?: ActivityVisibility;
  ownerId?: string;
  sourceLocalId?: string;
  aiGenerated?: boolean;
  items: ActivityItem[];
  enabledGames: GameType[];
  createdAt: string;
  updatedAt: string;
}

export interface TeacherProfile {
  name: string;
  school?: string;
  avatarUrl?: string;
  email?: string;
  id?: string;
}

export interface GameResult {
  game: GameType;
  activityId: string;
  score: number;
  correct: number;
  total: number;
  completedAt: string;
}

export interface DynamitePlayerRef {
  id: string;
  name: string;
}

export interface DynamiteState {
  order: DynamitePlayerRef[];
  aliveIds: string[];
  eliminatedIds: string[];
  currentPlayerId: string;
  turnNumber: number;
  questionCursor: number;
  questionOrder: number[];
  winnerId?: string | null;
}

export interface WildcardEffect {
  type: WildcardEffectType;
  title: string;
  description: string;
  tone: "positive" | "risk" | "interaction" | "chaos";
  requiresTarget?: boolean;
}

export interface WildcardGridTile {
  number: number;
  questionIndex: number;
  wildcard?: WildcardEffect | null;
  opened: boolean;
  resolved: boolean;
}

export interface WildcardGridTeamRef {
  id: string;
  name: string;
  color: string;
}

export interface WildcardGridState {
  size: WildcardGridSize;
  intensity: WildcardGridIntensity;
  phase: WildcardGridPhase;
  tiles: WildcardGridTile[];
  teams: WildcardGridTeamRef[];
  teamOrder: string[];
  activeTeamId: string;
  teamScores: Record<string, number>;
  teamShields: Record<string, boolean>;
  teamDoubleNext: Record<string, boolean>;
  currentTileNumber?: number | null;
  lastAnswerCorrect?: boolean | null;
  lastBasePoints?: number;
  pendingWildcard?: WildcardEffect | null;
  completedTurns: number;
  tiedTeamIds?: string[];
  winnerTeamId?: string | null;
}

export interface ClassroomSettings {
  reducedMotion: boolean;
  largeText: boolean;
  highContrast: boolean;
  timerEnabled: boolean;
  timerSeconds: number;
  soundEnabled: boolean;
  leaderboardEnabled: boolean;
  readAloud: boolean;
  liveGameMode?: LiveGameMode;
  dynamiteTimerSeconds?: DynamiteTimerSeconds;
  dynamiteState?: DynamiteState | null;
  wildcardGridSize?: WildcardGridSize;
  wildcardGridIntensity?: WildcardGridIntensity;
  wildcardGridSource?: WildcardGridQuestionSource;
  wildcardGridState?: WildcardGridState | null;
}

export type SessionMode = "individual" | "team";
export type SessionState = "lobby" | "playing" | "round_results" | "final_results" | "closed";

export interface Team {
  id: string;
  sessionId: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface LivePlayer {
  id: string;
  sessionId: string;
  nickname: string;
  teamId?: string | null;
  score: number;
  correctCount: number;
  totalAnswers: number;
  connectedAt: string;
  lastSeenAt: string;
  removed?: boolean;
}

export interface LiveQuestion {
  itemId: string;
  index: number;
  total: number;
  gameMode?: LiveGameMode;
  prompt: string;
  hint?: string;
  imageUrl?: string;
  options: string[];
  startedAt: string;
  sourceMode?: "quiz" | "gap-fill" | "prompt-answer";
  dynamiteTurnId?: string;
  activePlayerId?: string;
  activePlayerName?: string;
  passedBy?: string;
  passedAt?: string;
  wildcardTileNumber?: number;
  wildcardActiveTeamId?: string;
}

export interface GameSession {
  id: string;
  activitySetId: string;
  hostId: string;
  roomCode: string;
  mode: SessionMode;
  state: SessionState;
  settings: ClassroomSettings;
  locked: boolean;
  expiresAt: string;
  currentItemIndex: number;
  currentQuestion?: LiveQuestion | null;
  createdAt: string;
  endedAt?: string | null;
}

export interface JoinRoomResult {
  sessionId: string;
  playerId: string;
  playerToken: string;
  activityTitle: string;
  mode: SessionMode;
  state: SessionState;
  teamId?: string | null;
  teamName?: string | null;
  teamColor?: string | null;
}

export interface ResumeRoomResult {
  sessionId: string;
  roomCode: string;
  activityTitle: string;
  mode: SessionMode;
  state: SessionState;
  settings: ClassroomSettings;
  currentQuestion?: LiveQuestion | null;
  player: LivePlayer;
  team?: Pick<Team, "id" | "name" | "color"> | null;
  revealedAnswer?: string | null;
}

export interface LiveAnswerResult {
  correct: boolean;
  points: number;
  score: number;
  alreadyAnswered?: boolean;
}

export interface DynamiteAttemptResult {
  correct: boolean;
  passed: boolean;
  timeUp: boolean;
  points: number;
  score: number;
  alreadyPassed?: boolean;
}
