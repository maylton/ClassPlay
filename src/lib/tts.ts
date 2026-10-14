"use client";

import { DEFAULT_LANGUAGE } from "@/lib/languages";

// Function names keep their historical "English" wording; every helper takes an
// optional BCP-47 `lang` (the activity's target language) and defaults to English.

export type EnglishVoiceProfile = {
  name: string;
  lang: string;
  quality: "enhanced" | "standard";
};

export type EnglishSequenceOptions = {
  pauseMs?: number;
  rate?: number;
  lang?: string;
  onSegmentStart?: (index: number) => void;
};

const ENHANCED_VOICE = /(natural|enhanced|premium|neural|google|microsoft.*(aria|jenny|guy|ryan|sonia)|samantha|daniel|alex)/i;
const LOW_QUALITY_VOICE = /(compact|espeak|festival)/i;
let speechRunId = 0;

function synthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return null;
  return window.speechSynthesis;
}

function normalizedTag(value: string) {
  return value.toLowerCase().replace("_", "-");
}

function primaryTag(lang: string) {
  return normalizedTag(lang).split("-")[0];
}

function voiceScore(voice: SpeechSynthesisVoice, lang: string) {
  const voiceLang = normalizedTag(voice.lang);
  const primary = primaryTag(lang);
  if (!voiceLang.startsWith(primary)) return -1000;
  let score: number;
  if (primary === "en") score = voiceLang === "en-us" ? 50 : voiceLang === "en-gb" ? 46 : voiceLang.startsWith("en-") ? 38 : 30;
  else score = voiceLang === normalizedTag(lang) ? 50 : 40;
  if (ENHANCED_VOICE.test(voice.name)) score += 28;
  if (voice.default) score += 8;
  if (voice.localService) score += 4;
  if (LOW_QUALITY_VOICE.test(voice.name)) score -= 35;
  return score;
}

function bestVoice(voices: readonly SpeechSynthesisVoice[], lang: string) {
  const primary = primaryTag(lang);
  return [...voices]
    .filter((voice) => normalizedTag(voice.lang).startsWith(primary))
    .sort((left, right) => voiceScore(right, lang) - voiceScore(left, lang))[0] ?? null;
}

function profileForVoice(voice: SpeechSynthesisVoice | null): EnglishVoiceProfile | null {
  if (!voice) return null;
  return {
    name: voice.name,
    lang: voice.lang,
    quality: ENHANCED_VOICE.test(voice.name) && !LOW_QUALITY_VOICE.test(voice.name) ? "enhanced" : "standard",
  };
}

export function getEnglishVoiceProfile(lang: string = DEFAULT_LANGUAGE) {
  const synth = synthesis();
  return synth ? profileForVoice(bestVoice(synth.getVoices(), lang)) : null;
}

export async function prepareEnglishVoice(timeoutMs = 1200, lang: string = DEFAULT_LANGUAGE): Promise<EnglishVoiceProfile | null> {
  const synth = synthesis();
  if (!synth) return null;
  const ready = bestVoice(synth.getVoices(), lang);
  if (ready) return profileForVoice(ready);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      synth.removeEventListener("voiceschanged", finish);
      resolve(profileForVoice(bestVoice(synth.getVoices(), lang)));
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    synth.addEventListener("voiceschanged", finish, { once: true });
  });
}

function makeUtterance(text: string, voice: SpeechSynthesisVoice | null, rate: number, lang: string) {
  const utterance = new SpeechSynthesisUtterance(text);
  // Without a matching installed voice, the lang tag still lets the browser pick one.
  utterance.lang = voice?.lang || lang;
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

export function speakEnglish(text: string, lang: string = DEFAULT_LANGUAGE) {
  const synth = synthesis();
  const clean = text.trim();
  if (!synth || !clean) return false;
  cancelEnglishSpeech();
  synth.speak(makeUtterance(clean, bestVoice(synth.getVoices(), lang), 0.9, lang));
  return true;
}

function speakSegment(text: string, voice: SpeechSynthesisVoice | null, rate: number, runId: number, lang: string) {
  const synth = synthesis();
  if (!synth) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const utterance = makeUtterance(text, voice, rate, lang);
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

  const lang = options.lang ?? DEFAULT_LANGUAGE;
  await prepareEnglishVoice(1200, lang);
  const voice = bestVoice(synth.getVoices(), lang);
  const runId = speechRunId + 1;
  speechRunId = runId;
  synth.cancel();

  for (let index = 0; index < segments.length; index += 1) {
    if (runId !== speechRunId) return false;
    options.onSegmentStart?.(index);
    const spoken = await speakSegment(segments[index], voice, options.rate ?? 0.88, runId, lang);
    if (!spoken) return false;
    if (index < segments.length - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, options.pauseMs ?? 420));
    }
  }
  return runId === speechRunId;
}
