/** Language being taught in an activity (BCP-47 primary tag; matches the DB check). */
export const DEFAULT_LANGUAGE = "en";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "ru", label: "Русский" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" },
  { code: "ar", label: "العربية" },
] as const;

export function languageLabel(code?: string) {
  const primary = (code || DEFAULT_LANGUAGE).split("-")[0];
  return LANGUAGES.find((language) => language.code === primary)?.label ?? primary.toUpperCase();
}

/** The smart builder's verb-inflection matching only knows English morphology. */
export function isEnglish(code?: string) {
  return !code || code.toLowerCase().startsWith("en");
}
