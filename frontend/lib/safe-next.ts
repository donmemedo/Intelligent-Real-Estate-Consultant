/**
 * Where to go after sign-in: always an absolute URL on this site, never another site (open redirect).
 * Returning a path is not enough: "/.//evil.com" normalises to the path "//evil.com", which a browser
 * reads as another host. Browsers also strip tab/CR/LF ("/\t/evil.com"). So reject control characters
 * and backslashes, resolve against our origin, and hand back the full same-origin URL.
 */
export function safeNext(next: string | null, origin = globalThis.location?.origin ?? "http://localhost"): string {
  const fallback = `${origin}/leads`;
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? url.href : fallback;
  } catch {
    return fallback;
  }
}
