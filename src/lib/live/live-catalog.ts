import type { LiveGameMode } from "@/lib/types";

export type LiveModePresentation = {
  label: string;
  description: string;
  icon: string;
};

export const LIVE_MODE_CATALOG = {
  "gap-fill": {
    label: "Fill the Gaps",
    description: "Students choose the language that completes each sentence.",
    icon: "pencil-square",
  },
  quiz: {
    label: "Quiz",
    description: "Students answer multiple-choice questions on their own devices.",
    icon: "trophy",
  },
  "space-blaster": {
    label: "Space Blaster",
    description: "Students aim at the correct answer and fire before the round ends.",
    icon: "rocket-takeoff",
  },
  dynamite: {
    label: "Dynamite",
    description: "Pass the fuse by answering before time runs out. Last player alive wins.",
    icon: "fire",
  },
} satisfies Record<LiveGameMode, LiveModePresentation>;

export const LIVE_MODE_ORDER = Object.keys(LIVE_MODE_CATALOG) as LiveGameMode[];
