"use client";

import { useEffect, useRef } from "react";

type IgnisBossProps = {
  feedback: "hit" | "critical" | "wrong" | null;
  enraged: boolean;
  damage: number;
  reducedMotion: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function IgnisBoss({ feedback, enraged, damage, reducedMotion }: IgnisBossProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const leftPupilRef = useRef<SVGGElement>(null);
  const rightPupilRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const arena = root?.closest(".boss-arena") as HTMLElement | null;
    if (!arena || reducedMotion) return;
    const arenaElement = arena;

    function setLook(clientX: number, clientY: number) {
      const rect = arenaElement.getBoundingClientRect();
      const normalizedX = clamp(((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -1, 1);
      const normalizedY = clamp(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1, -1, 1);
      const moveX = normalizedX * 8;
      const moveY = normalizedY * 6;
      const transform = `translate(${moveX} ${moveY})`;
      leftPupilRef.current?.setAttribute("transform", transform);
      rightPupilRef.current?.setAttribute("transform", transform);
    }

    function onPointerMove(event: PointerEvent) {
      setLook(event.clientX, event.clientY);
    }

    function onPointerDown(event: PointerEvent) {
      setLook(event.clientX, event.clientY);
    }

    function resetLook(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      leftPupilRef.current?.removeAttribute("transform");
      rightPupilRef.current?.removeAttribute("transform");
    }

    arenaElement.addEventListener("pointermove", onPointerMove);
    arenaElement.addEventListener("pointerdown", onPointerDown);
    arenaElement.addEventListener("pointerleave", resetLook);
    return () => {
      arenaElement.removeEventListener("pointermove", onPointerMove);
      arenaElement.removeEventListener("pointerdown", onPointerDown);
      arenaElement.removeEventListener("pointerleave", resetLook);
    };
  }, [reducedMotion]);

  const reaction = feedback === "critical" ? "critical" : feedback === "hit" ? "hit" : feedback === "wrong" ? "taunt" : "idle";

  return (
    <div
      ref={rootRef}
      className={`ignis-character reaction-${reaction} ${enraged ? "is-enraged" : ""} ${reducedMotion ? "reduced-motion" : ""}`}
      aria-hidden="true"
    >
      <span className="ignis-aura" />
      <div className="ignis-reactor">
        <svg className="ignis-svg" viewBox="0 0 200 210" role="presentation">
          <path className="ignis-horn left" d="M45 62 L20 2 Q55 21 75 52 Z" />
          <path className="ignis-horn right" d="M155 62 L180 2 Q145 21 125 52 Z" />
          <g className="ignis-arm left"><rect x="10" y="102" width="50" height="20" rx="10" /></g>
          <g className="ignis-arm right"><rect x="140" y="102" width="50" height="20" rx="10" /></g>
          <path className="ignis-body" d="M100 22 C160 22 180 82 180 132 C180 172 140 192 100 192 C60 192 20 172 20 132 C20 82 40 22 100 22 Z" />
          <circle className="ignis-spot" cx="45" cy="147" r="8" />
          <circle className="ignis-spot" cx="155" cy="137" r="12" />
          <circle className="ignis-spot" cx="160" cy="162" r="6" />
          <circle className="ignis-spot" cx="70" cy="177" r="10" />
          <g className="ignis-eye left">
            <circle className="ignis-eye-white" cx="75" cy="87" r="22" />
            <g ref={leftPupilRef} className="ignis-pupil">
              <circle className="ignis-iris" cx="75" cy="87" r="10" />
              <ellipse className="ignis-pupil-slit" cx="75" cy="87" rx="3" ry="9" />
              <circle className="ignis-eye-glint" cx="71" cy="83" r="3" />
            </g>
          </g>
          <path className="ignis-brow left" d="M40 62 L105 94 L110 77 L45 47 Z" />
          <g className="ignis-eye right">
            <circle className="ignis-eye-white" cx="125" cy="87" r="22" />
            <g ref={rightPupilRef} className="ignis-pupil">
              <circle className="ignis-iris" cx="125" cy="87" r="10" />
              <ellipse className="ignis-pupil-slit" cx="125" cy="87" rx="3" ry="9" />
              <circle className="ignis-eye-glint" cx="121" cy="83" r="3" />
            </g>
          </g>
          <path className="ignis-brow right" d="M160 62 L95 94 L90 77 L155 47 Z" />
          <path className="ignis-mouth" d="M70 142 Q100 122 130 142 Q120 162 100 162 Q80 162 70 142 Z" />
          <polygon className="ignis-tooth" points="75,140 85,137 80,150" />
          <polygon className="ignis-tooth" points="95,132 105,132 100,147" />
          <polygon className="ignis-tooth" points="115,137 125,140 120,150" />
          <polygon className="ignis-tooth" points="85,160 95,161 90,150" />
          <polygon className="ignis-tooth" points="105,161 115,160 110,150" />
        </svg>
      </div>
      <span className="ignis-shadow" />
      {damage > 0 && feedback !== "wrong" && <b className={`ignis-damage ${feedback === "critical" ? "critical" : ""}`}>−{damage}</b>}
      {feedback === "wrong" && <span className="ignis-taunt-mark">!</span>}
    </div>
  );
}
