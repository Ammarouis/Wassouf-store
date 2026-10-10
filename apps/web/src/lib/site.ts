/**
 * Helpers for turning user-supplied URLs (environment variables) into values
 * the platform accepts.
 *
 * Environment variables are typed by hand, so a value like
 * `wassouf.onrender.com` (no scheme) is common. `new URL()` rejects it and
 * `fetch()` cannot use it, which previously crashed `next build` while
 * collecting page data. Normalising here keeps the build resilient.
 */

/** Adds a scheme to a bare host, e.g. `shop.com` -> `https://shop.com`. */
export function withScheme(value: string | undefined, fallbackScheme = 'https'): string {
  const raw = (value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `${fallbackScheme}://${raw}`;
}

/**
 * Public site URL used for metadata. Never throws: a missing or malformed
 * value falls back to localhost so the build can still complete.
 */
export function getSiteUrl(): URL {
  const candidates = [withScheme(process.env.NEXT_PUBLIC_SITE_URL), 'http://localhost:3000'];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(candidate);
    } catch {
      // Ignore and try the next candidate.
    }
  }
  return new URL('http://localhost:3000');
}
