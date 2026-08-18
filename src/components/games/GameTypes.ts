import type { ActivitySet } from "@/lib/types";
export interface GameProps { activity: ActivitySet; onComplete: (score: number, correct: number, total: number) => void; }
