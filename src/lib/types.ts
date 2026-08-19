export type GameType =
  | "flashcards"
  | "memory"
  | "matching"
  | "sentence-builder"
  | "gap-fill"
  | "quiz"
  | "space-blaster"
  | "word-maze";

export type LiveGameMode = Extract<GameType, "gap-fill" | "quiz" | "space-blaster">;
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
  gameMode: LiveGameMode;
  prompt: string;
  hint?: string;
  imageUrl?: string;
  options: string[];
  startedAt: string;
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
