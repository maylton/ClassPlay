export type EnglishPhraseMatch = {
  start: number;
  end: number;
  text: string;
};

type WordToken = {
  start: number;
  end: number;
  normalized: string;
};

const IRREGULAR_BASES: Record<string, string> = {
  am: "be",
  is: "be",
  are: "be",
  was: "be",
  were: "be",
  been: "be",
  being: "be",
  has: "have",
  had: "have",
  does: "do",
  did: "do",
  done: "do",
  goes: "go",
  went: "go",
  gone: "go",
  made: "make",
  took: "take",
  taken: "take",
  came: "come",
  saw: "see",
  seen: "see",
  ate: "eat",
  eaten: "eat",
  got: "get",
  gotten: "get",
  wrote: "write",
  written: "write",
  spoke: "speak",
  spoken: "speak",
};

function words(value: string): WordToken[] {
  const tokens: WordToken[] = [];
  const pattern = /[A-Za-z0-9']+/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      normalized: match[0].toLocaleLowerCase(),
    });
  }

  return tokens;
}

function inflectionForms(value: string) {
  const token = value.toLocaleLowerCase();
  const forms = new Set<string>([token]);
  const irregular = IRREGULAR_BASES[token];
  if (irregular) forms.add(irregular);

  if (token.endsWith("ies") && token.length > 4) {
    forms.add(`${token.slice(0, -3)}y`);
  }

  if (token.endsWith("ied") && token.length > 4) {
    forms.add(`${token.slice(0, -3)}y`);
  }

  if (token.endsWith("es") && token.length > 3) {
    forms.add(token.slice(0, -2));
  }

  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 2) {
    forms.add(token.slice(0, -1));
  }

  if (token.endsWith("ed") && token.length > 4) {
    const stem = token.slice(0, -2);
    forms.add(stem);
    forms.add(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
  }

  if (token.endsWith("ing") && token.length > 4) {
    const stem = token.slice(0, -3);
    forms.add(stem);
    forms.add(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
  }

  return forms;
}

function inflectionEquivalent(left: string, right: string) {
  if (left === right) return true;
  const leftForms = inflectionForms(left);
  const rightForms = inflectionForms(right);
  for (const form of leftForms) if (rightForms.has(form)) return true;
  return false;
}

/**
 * Finds a phrase inside a full English sentence while tolerating common verb
 * inflection. The returned text always uses the surface form from the sentence
 * (for example, `watch TV` matches and returns `watches TV`).
 */
export function findEnglishPhraseMatch(source: string, phrase: string): EnglishPhraseMatch | null {
  const sourceWords = words(source);
  const phraseWords = words(phrase);
  if (!sourceWords.length || !phraseWords.length || phraseWords.length > sourceWords.length) return null;

  // Prefer a literal token match before trying morphology.
  for (let startIndex = 0; startIndex <= sourceWords.length - phraseWords.length; startIndex += 1) {
    const exact = phraseWords.every((token, offset) => sourceWords[startIndex + offset].normalized === token.normalized);
    if (!exact) continue;
    const first = sourceWords[startIndex];
    const last = sourceWords[startIndex + phraseWords.length - 1];
    return { start: first.start, end: last.end, text: source.slice(first.start, last.end) };
  }

  for (let startIndex = 0; startIndex <= sourceWords.length - phraseWords.length; startIndex += 1) {
    const compatible = phraseWords.every((token, offset) => inflectionEquivalent(sourceWords[startIndex + offset].normalized, token.normalized));
    if (!compatible) continue;
    const first = sourceWords[startIndex];
    const last = sourceWords[startIndex + phraseWords.length - 1];
    return { start: first.start, end: last.end, text: source.slice(first.start, last.end) };
  }

  return null;
}
