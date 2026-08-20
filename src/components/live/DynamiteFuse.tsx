"use client";

const FUSE_PATH = "M 8 86 C 35 47 65 86 96 46 C 113 24 131 17 142 9";

export function DynamiteFuse({ percent }: { percent: number }) {
  const safePercent = Math.max(0, Math.min(100, percent));
  const fuseDash = `${safePercent} ${Math.max(0.01, 100 - safePercent)}`;

  return (
    <div className="dynamite-fuse" aria-hidden="true">
      <svg viewBox="0 0 150 96" role="presentation">
        <path className="dynamite-fuse-burnt" d={FUSE_PATH} pathLength="100" />
        <path className="dynamite-fuse-rope" d={FUSE_PATH} pathLength="100" style={{ strokeDasharray: fuseDash }} />
      </svg>
      <div
        className="dynamite-fuse-spark"
        style={{ offsetPath: `path("${FUSE_PATH}")`, offsetDistance: `${safePercent}%` }}
      >
        <i /><i />
      </div>
    </div>
  );
}
