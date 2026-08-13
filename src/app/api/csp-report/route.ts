import { handleCspReport } from '@/shared/observability/csp-report'
import { enforce, rateLimit429 } from '@/shared/rate-limit'
import { parseClientIp } from '@/shared/rate-limit'

// Public, unauthenticated: browsers POST CSP violation reports here (wired via
// `report-uri` / `report-to` in next.config.js). All logic + hardening lives in
// the shared handler; this route stays thin so Next's route-export validation
// only sees POST/dynamic/runtime.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Rate-limited per IP (security scan F9): the handler's own dedupe map keys on
// attacker-supplied (directive, blockedUri), which a client can vary per
// request to defeat it — this IP-based limit is the outer defense (20/60s;
// vs. vapidPublic's precedent for the same class of unauthenticated route).
export async function POST(req: Request): Promise<Response> {
  const ip = parseClientIp(req.headers)
  const outcome = await enforce('cspReport', ip)
  if (!outcome.ok) return rateLimit429(outcome)

  return handleCspReport(req)
}
