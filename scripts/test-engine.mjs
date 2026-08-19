import assert from "node:assert/strict";

function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
function normalizeAnswer(value) {
  return value.trim().toLocaleLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
}
function isCorrectAnswer(input, expected) { return normalizeAnswer(input) === normalizeAnswer(expected); }
function sentenceGapAnswer(item) {
  if (!item.gapSentence || !item.example) return item.prompt;
  const [before = "", after = ""] = item.gapSentence.split("_____");
  const normalizedBefore = before.trim();
  const normalizedAfter = after.trim();
  let answer = item.example;
  if (normalizedBefore && answer.startsWith(normalizedBefore)) answer = answer.slice(normalizedBefore.length).trim();
  if (normalizedAfter && answer.endsWith(normalizedAfter)) answer = answer.slice(0, answer.length - normalizedAfter.length).trim();
  return answer.replace(/^[,.;:!?\s]+|[,.;:!?\s]+$/g, "") || item.prompt;
}
function sentenceAnswer(item) {
  return (item.sentenceParts ?? []).join(" ").replace(/\s+([,.!?])/g, "$1");
}
function sentenceWords(item) {
  return sentenceAnswer(item).trim().split(/\s+/).filter(Boolean);
}

assert.equal(normalizeAnswer("  Goes to School!  "), "goes to school");
assert.equal(isCorrectAnswer("GOES to school", "goes to school."), true);
assert.deepEqual(shuffle([1, 2, 3], () => 0), [2, 3, 1]);
assert.equal(sentenceGapAnswer({ prompt: "have breakfast", example: "She has breakfast before school.", gapSentence: "She _____ before school." }), "has breakfast");
assert.deepEqual(
  sentenceWords({ sentenceParts: ["She", "has breakfast", "before school."] }),
  ["She", "has", "breakfast", "before", "school."],
  "Sentence Builder should expose one draggable token per written word",
);
assert.deepEqual(
  sentenceWords({ sentenceParts: ["I", "don't have", "any coffee", "at home."] }),
  ["I", "don't", "have", "any", "coffee", "at", "home."],
  "Contractions should stay intact while multi-word chunks are split",
);
console.log("ClassPlay game engine smoke tests passed.");
