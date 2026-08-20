"use client";

import { useLayoutEffect, useRef } from "react";

const FUSE_PATH = "M 8 86 C 35 47 65 86 96 46 C 113 24 131 17 142 9";
const VIEWBOX_WIDTH = 150;
const VIEWBOX_HEIGHT = 96;

export function DynamiteFuse({ percent }: { percent: number }) {
  const ropeRef = useRef<SVGPathElement | null>(null);
  const sparkRef = useRef<HTMLDivElement | null>(null);
  const safePercent = Math.max(0, Math.min(100, percent));
  const fuseDash = `${safePercent} ${Math.max(0.01, 100 - safePercent)}`;

  useLayoutEffect(() => {
    const rope = ropeRef.current;
    const spark = sparkRef.current;
    if (!rope || !spark) return;

    const point = rope.getPointAtLength(rope.getTotalLength() * (safePercent / 100));
    spark.style.left = `${(point.x / VIEWBOX_WIDTH) * 100}%`;
    spark.style.top = `${(point.y / VIEWBOX_HEIGHT) * 100}%`;
  }, [safePercent]);

  return (
    <div className="dynamite-fuse" aria-hidden="true">
      <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} role="presentation">
        <path className="dynamite-fuse-burnt" d={FUSE_PATH} pathLength="100" />
        <path ref={ropeRef} className="dynamite-fuse-rope" d={FUSE_PATH} pathLength="100" style={{ strokeDasharray: fuseDash }} />
      </svg>
      <div ref={sparkRef} className="dynamite-fuse-spark"><i /><i /></div>
    </div>
  );
}
