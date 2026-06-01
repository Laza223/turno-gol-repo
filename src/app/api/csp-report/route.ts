import { handleCspReport } from '@/shared/observability/csp-report'

// Public, unauthenticated: browsers POST CSP violation reports here (wired via
// `report-uri` / `report-to` in next.config.js). All logic + hardening lives in
// the shared handler; this route stays thin so Next's route-export validation
// only sees POST/dynamic/runtime.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function POST(req: Request): Promise<Response> {
  return handleCspReport(req)
}
