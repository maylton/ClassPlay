type ArcadeTone = "shot" | "correct" | "wrong" | "move";

let audioContext: AudioContext | null = null;

function context() {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  audioContext ??= new window.AudioContext();
  return audioContext;
}

export function playArcadeTone(enabled: boolean, tone: ArcadeTone) {
  if (!enabled) return;
  const ctx = context();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  const frequencies: Record<ArcadeTone, number> = {
    shot: 520,
    correct: 760,
    wrong: 170,
    move: 300,
  };
  const durations: Record<ArcadeTone, number> = {
    shot: .07,
    correct: .16,
    wrong: .18,
    move: .03,
  };

  oscillator.type = tone === "wrong" ? "sawtooth" : "square";
  oscillator.frequency.setValueAtTime(frequencies[tone], now);
  if (tone === "correct") oscillator.frequency.exponentialRampToValueAtTime(1050, now + durations[tone]);
  if (tone === "shot") oscillator.frequency.exponentialRampToValueAtTime(260, now + durations[tone]);
  gain.gain.setValueAtTime(.045, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + durations[tone]);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + durations[tone]);
}
