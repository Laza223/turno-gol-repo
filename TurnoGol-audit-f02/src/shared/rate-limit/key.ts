// Leftmost x-forwarded-for, x-real-ip fallback, then 'unknown'. On Vercel
// the leftmost XFF is the real client. Never pick a non-leftmost value —
// fix proxy config, not this parser.
export function parseClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim() ?? ''
    if (first) return first
  }
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  return 'unknown'
}
