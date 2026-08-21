"use client";

export type EnglishVoiceProfile = {
  name: string;
  lang: string;
  quality: "enhanced" | "standard";
};

export type EnglishSequenceOptions = {
  pauseMs?: number;
  rate?: number;
  onSegmentStart?: (index: number) => void;
};

const ENHANCED_VOICE = /(natural|enhanced|premium|neural|google.*english|microsoft.*(aria|jenny|guy|ryan|sonia)|samantha|daniel|alex)/i;
const LOW_QUALITY_VOICE = /(compact|espeak|festival)/i;
let speechRunId = 0;

function synthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return null;
  return window.speechSynthesis;
}

function voiceScore(voice: SpeechSynthesisVoice) {
  const lang = voice.lang.toLowerCase();
  if (!lang.startsWith("en")) return -1000;
  let score = lang === "en-us" ? 50 : lang === "en-gb" ? 46 : lang.startsWith("en-") ? 38 : 30;
  if (ENHANCED_VOICE.test(voice.name)) score += 28;
  if (voice.default) score += 8;
  if (voice.localService) score += 4;
  if (LOW_QUALITY_VOICE.test(voice.name)) score -= 35;
  return score;
}

function bestEnglishVoice(voices: readonly SpeechSynthesisVoice[]) {
  return [...voices]
    .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
    .sort((left, right) => voiceScore(right) - voiceScore(left))[0] ?? null;
}

function profileForVoice(voice: SpeechSynthesisVoice | null): EnglishVoiceProfile | null {
  if (!voice) return null;
  return {
    name: voice.name,
    lang: voice.lang,
    quality: ENHANCED_VOICE.test(voice.name) && !LOW_QUALITY_VOICE.test(voice.name) ? "enhanced" : "standard",
  };
}

export function getEnglishVoiceProfile() {
  const synth = synthesis();
  return synth ? profileForVoice(bestEnglishVoice(synth.getVoices())) : null;
}

export async function prepareEnglishVoice(timeoutMs = 1200): Promise<EnglishVoiceProfile | null> {
  const synth = synthesis();
  if (!synth) return null;
  const ready = bestEnglishVoice(synth.getVoices());
  if (ready) return profileForVoice(ready);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      synth.removeEventListener("voiceschanged", finish);
      resolve(profileForVoice(bestEnglishVoice(synth.getVoices())));
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    synth.addEventListener("voiceschanged", finish, { once: true });
  });
}

function makeUtterance(text: string, voice: SpeechSynthesisVoice | null, rate: number) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice?.lang || "en-US";
  utterance.rate = rate;
  utterance.pitch = 1;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;
  return utterance;
}

export function cancelEnglishSpeech() {
  speechRunId += 1;
  synthesis()?.cancel();
}

export function speakEnglish(text: string) {
  const synth = synthesis();
  const clean = text.trim();
  if (!synth || !clean) return false;
  cancelEnglishSpeech();
  synth.speak(makeUtterance(clean, bestEnglishVoice(synth.getVoices()), 0.9));
  return true;
}

function speakSegment(text: string, voice: SpeechSynthesisVoice | null, rate: number, runId: number) {
  const synth = synthesis();
  if (!synth) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const utterance = makeUtterance(text, voice, rate);
    let settled = false;
    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(success && runId === speechRunId);
    };
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    const words = text.split(/\s+/).filter(Boolean).length;
    const timeout = window.setTimeout(() => {
      synth.cancel();
      finish(false);
    }, Math.max(4500, words * 1100));
    synth.speak(utterance);
  });
}

export async function speakEnglishSequence(texts: readonly string[], options: EnglishSequenceOptions = {}) {
  const synth = synthesis();
  const segments = texts.map((text) => text.trim()).filter(Boolean);
  if (!synth || !segments.length) return false;

  await prepareEnglishVoice();
  const voice = bestEnglishVoice(synth.getVoices());
  const runId = speechRunId + 1;
  speechRunId = runId;
  synth.cancel();

  for (let index = 0; index < segments.length; index += 1) {
    if (runId !== speechRunId) return false;
    options.onSegmentStart?.(index);
    const spoken = await speakSegment(segments[index], voice, options.rate ?? 0.88, runId);
    if (!spoken) return false;
    if (index < segments.length - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, options.pauseMs ?? 420));
    }
  }
  return runId === speechRunId;
}
