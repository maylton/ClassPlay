"use client";

type SpaceBlasterRocketProps = {
  firing: boolean;
  feedback: "correct" | "wrong" | null;
  reducedMotion: boolean;
};

export function SpaceBlasterRocket({ firing, feedback, reducedMotion }: SpaceBlasterRocketProps) {
  return (
    <div
      className={`classplay-rocket ${firing ? "is-firing" : ""} ${feedback ? `is-${feedback}` : ""} ${reducedMotion ? "reduced-motion" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 146" role="presentation">
        <g className="rocket-hover-shell">
          <g className="rocket-thrust">
            <path className="rocket-flame rocket-flame-outer" d="M36 103 L50 142 L64 103 Z" />
            <path className="rocket-flame rocket-flame-inner" d="M42 103 L50 131 L58 103 Z" />
            <rect className="rocket-nozzle" x="38" y="94" width="24" height="13" rx="4" />
          </g>
          <path className="rocket-fin rocket-fin-left" d="M35 68 L10 106 L38 95 Z" />
          <path className="rocket-fin rocket-fin-right" d="M65 68 L90 106 L62 95 Z" />
          <path className="rocket-body" d="M50 8 C67 28 70 48 68 75 L65 99 L35 99 L32 75 C30 48 33 28 50 8 Z" />
          <path className="rocket-nose" d="M50 8 C60 19 64 31 64 40 L36 40 C36 31 40 19 50 8 Z" />
          <path className="rocket-stripe" d="M34.5 79 H65.5 L64 89 H36 Z" />
          <circle className="rocket-cockpit-ring" cx="50" cy="58" r="13" />
          <circle className="rocket-cockpit" cx="50" cy="58" r="9" />
          <ellipse className="rocket-cockpit-glow" cx="46.5" cy="54.5" rx="3.2" ry="2.2" />
          <path className="rocket-panel" d="M42 92 H58" />
          <circle className="rocket-rivet left" cx="39" cy="74" r="1.6" />
          <circle className="rocket-rivet right" cx="61" cy="74" r="1.6" />
        </g>
      </svg>
    </div>
  );
}
