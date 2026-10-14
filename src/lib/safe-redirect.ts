const INTERNAL_ORIGIN = "http://classplay.internal";

/**
 * Accepts only same-origin relative paths for post-auth redirects. Resolving
 * against a fixed origin rejects protocol-relative tricks such as `//evil.com`,
 * `/\evil.com` and `/\t/evil.com`, which a plain `startsWith("/")` lets through.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/")) return fallback;
  try {
    const url = new URL(value, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
