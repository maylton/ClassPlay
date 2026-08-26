"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { resolveActivityImageUrl } from "@/lib/media";

const SPRITE_PREFIX = "sprite:";

type SpriteRef = {
  src: string;
  columns: number;
  rows: number;
  column: number;
  row: number;
};

function parseSpriteRef(value?: string): SpriteRef | null {
  if (!value?.startsWith(SPRITE_PREFIX)) return null;
  const [src, columnsText, rowsText, columnText, rowText] = value.slice(SPRITE_PREFIX.length).split("|");
  const columns = Number(columnsText);
  const rows = Number(rowsText);
  const column = Number(columnText);
  const row = Number(rowText);
  if (!src || !Number.isInteger(columns) || !Number.isInteger(rows) || !Number.isInteger(column) || !Number.isInteger(row)) return null;
  if (columns < 1 || rows < 1 || column < 0 || row < 0 || column >= columns || row >= rows) return null;
  return { src, columns, rows, column, row };
}

export function ActivityImage({ refValue, alt, className }: { refValue?: string; alt: string; className?: string }) {
  const sprite = parseSpriteRef(refValue);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (parseSpriteRef(refValue)) {
      setSrc(null);
      return;
    }
    let active = true;
    void resolveActivityImageUrl(refValue).then((url) => active && setSrc(url));
    return () => { active = false; };
  }, [refValue]);

  if (sprite) {
    return (
      <svg
        role="img"
        aria-label={alt}
        className={className}
        viewBox={`${sprite.column} ${sprite.row} 1 1`}
        preserveAspectRatio="xMidYMid slice"
      >
        <title>{alt}</title>
        <image href={sprite.src} x="0" y="0" width={sprite.columns} height={sprite.rows} preserveAspectRatio="none" />
      </svg>
    );
  }

  if (!src) return null;
  return <img src={src} alt={alt} className={className} />;
}
