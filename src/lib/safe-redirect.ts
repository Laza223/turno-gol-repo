/**
 * Returns `next` only if it is a safe same-origin path (starts with a single
 * `/`, not `//` or `/\`). Otherwise returns `fallback`. Guards against
 * open-redirects through the auth callback `?next` param.
 *
 * Strips ASCII TAB/LF/CR before the prefix checks (security scan F5): the
 * WHATWG URL Standard has browsers strip those characters from a URL
 * *anywhere* in the string before parsing, so `/\t/evil.com` passes every
 * `startsWith` check unchanged here but normalizes to the protocol-relative
 * `//evil.com` once the browser's own URL parser sees it.
 */
export function sanitizeNext(next: string | null | undefined, fallback = '/mis-reservas'): string {
  if (!next) return fallback
  const stripped = next.replace(/[\t\n\r]/g, '')
  if (!stripped.startsWith('/')) return fallback
  if (stripped.startsWith('//')) return fallback
  if (stripped.startsWith('/\\')) return fallback
  return stripped
}
