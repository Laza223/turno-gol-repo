// x-vercel-forwarded-for first: Vercel's edge network sets this itself and
// overwrites any client-supplied value with the same name, so it can't be
// spoofed — unlike x-forwarded-for, which a raw HTTP client controls freely
// and can rotate per request to get a fresh rate-limit bucket every time
// (F12). Fall back to x-forwarded-for's leftmost hop for non-Vercel
// environments (local dev, self-hosted), then x-real-ip, then 'unknown'.
export function parseClientIp(headers: Headers): string {
  const vercel = headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  if (vercel) return vercel

  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim() ?? ''
    if (first) return first
  }
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  return 'unknown'
}
