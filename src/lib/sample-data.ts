import type { ActivitySet } from "./types";

export const SAMPLE_ACTIVITY: ActivitySet = {
  id: "daily-routine-present-simple",
  title: "Daily Routine",
  description: "Practice everyday actions and the Present Simple through quick classroom games.",
  subject: "English",
  topic: "Present Simple · Daily routine",
  level: "A1–A2",
  grade: "7th grade",
  kind: "mixed",
  enabledGames: ["flashcards", "memory", "matching", "sentence-builder", "gap-fill", "quiz"],
  createdAt: "2026-08-18T12:00:00-03:00",
  updatedAt: "2026-08-18T12:00:00-03:00",
  items: [
    {
      id: "wake-up", prompt: "wake up", answer: "acordar", hint: "🌅",
      example: "I wake up at 6:30 every day.", gapSentence: "I _____ at 6:30 every day.",
      distractors: ["wakes up", "waking up", "woke up"], sentenceParts: ["I", "wake up", "at 6:30", "every day"],
    },
    {
      id: "brush-teeth", prompt: "brush my teeth", answer: "escovar os dentes", hint: "🪥",
      example: "I brush my teeth after breakfast.", gapSentence: "I _____ after breakfast.",
      distractors: ["brushes my teeth", "brushed my teeth", "brushing my teeth"], sentenceParts: ["I", "brush my teeth", "after breakfast"],
    },
    {
      id: "have-breakfast", prompt: "have breakfast", answer: "tomar café da manhã", hint: "🍳",
      example: "She has breakfast before school.", gapSentence: "She _____ before school.",
      distractors: ["have breakfast", "having breakfast", "had breakfast"], sentenceParts: ["She", "has breakfast", "before school"],
    },
    {
      id: "go-school", prompt: "go to school", answer: "ir para a escola", hint: "🎒",
      example: "Lucas goes to school by bus.", gapSentence: "Lucas _____ by bus.",
      distractors: ["go to school", "going to school", "went to school"], sentenceParts: ["Lucas", "goes to school", "by bus"],
    },
    {
      id: "have-lunch", prompt: "have lunch", answer: "almoçar", hint: "🍛",
      example: "We have lunch at noon.", gapSentence: "We _____ at noon.",
      distractors: ["has lunch", "having lunch", "had lunch"], sentenceParts: ["We", "have lunch", "at noon"],
    },
    {
      id: "do-homework", prompt: "do homework", answer: "fazer a tarefa", hint: "✏️",
      example: "My sister does her homework in the afternoon.", gapSentence: "My sister _____ in the afternoon.",
      distractors: ["do her homework", "doing her homework", "did her homework"], sentenceParts: ["My sister", "does her homework", "in the afternoon"],
    },
    {
      id: "play-games", prompt: "play games", answer: "jogar", hint: "🎮",
      example: "They play games after dinner.", gapSentence: "They _____ after dinner.",
      distractors: ["plays games", "playing games", "played games"], sentenceParts: ["They", "play games", "after dinner"],
    },
    {
      id: "go-bed", prompt: "go to bed", answer: "ir dormir", hint: "🌙",
      example: "He goes to bed at 10 p.m.", gapSentence: "He _____ at 10 p.m.",
      distractors: ["go to bed", "going to bed", "went to bed"], sentenceParts: ["He", "goes to bed", "at 10 p.m."],
    }
  ]
};
