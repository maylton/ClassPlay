import { sentenceWords } from "./game-engine";
import type { ActivityItem } from "./types";

export type WordToken = {
  id: string;
  text: string;
  sourceIndex: number;
};

export function sentenceWordTokens(item?: ActivityItem, prefix = "word"): WordToken[] {
  if (!item) return [];
  return sentenceWords(item).map((text, sourceIndex) => ({
    id: `${prefix}-${item.id}-${sourceIndex}`,
    text,
    sourceIndex,
  }));
}

export function reorderWordTokens(
  tokens: readonly WordToken[],
  activeId: string | number,
  overId: string | number,
) {
  const oldIndex = tokens.findIndex((token) => token.id === activeId);
  const newIndex = tokens.findIndex((token) => token.id === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return [...tokens];
  const next = [...tokens];
  const [moved] = next.splice(oldIndex, 1);
  if (!moved) return next;
  next.splice(newIndex, 0, moved);
  return next;
}
