import { AppIcon } from "@/components/AppIcon";
import { GAME_MODE_CATALOG } from "@/lib/game-catalog";
import type { GameType } from "@/lib/types";

/** A game's icon on its own pastel tone — the one playful color note in the UI. */
export function GameIcon({ game, size = "md" }: { game: GameType; size?: "sm" | "md" | "lg" }) {
  const info = GAME_MODE_CATALOG[game];
  return <span className={`cp-game-icon cp-game-icon-${size} tone-${info.colorClass}`} aria-hidden="true"><AppIcon name={info.icon} /></span>;
}

/** Same treatment for icons that are not game modes (e.g. Dynamite, Live room). */
export function ToneIcon({ icon, tone, size = "md" }: { icon: string; tone: string; size?: "sm" | "md" | "lg" }) {
  return <span className={`cp-game-icon cp-game-icon-${size} tone-${tone}`} aria-hidden="true"><AppIcon name={icon} /></span>;
}
