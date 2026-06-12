import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function findFiles(root: string, regex: RegExp, acc: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    const p = path.join(root, entry)
    const s = statSync(p)
    if (s.isDirectory()) findFiles(p, regex, acc)
    else if (regex.test(entry)) acc.push(p)
  }
  return acc
}

const ROOT = path.resolve(__dirname, '..', '..')
const ACTIONS = findFiles(path.join(ROOT, 'src/app'), /^actions\.ts$/)
const ROUTES = findFiles(path.join(ROOT, 'src/app/api'), /^route\.ts$/)

// Files that legitimately have no user-supplied input (no body/params/query).
const NO_INPUT_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  // markPublicLinkSharedAction() takes no args; identity comes from session.
  'src/app/(admin)/dashboard/actions.ts',
  // GET with no query params; tenantId comes from session via withTenant.
  'src/app/api/billing/subscription/route.ts',
  // Pure session-driven trigger; no user-supplied input from request.
  'src/app/api/mp/oauth-start/route.ts',
  // GET with no input; returns global cities list.
  'src/app/api/public/cities/route.ts',
  // Health endpoint, no input.
  'src/app/api/status/route.ts',
  // Health alias of /api/status (B10): re-export, no input.
  'src/app/api/health/route.ts',
  // ARCO data export (B9): GET, no body/params/query. Player id from session.
  'src/app/api/player/data-export/route.ts',
  // Sesión del portal (ISR): GET, no body/params/query. Player id from cookie.
  'src/app/api/player/session/route.ts',
  // Queue-depth monitor (B10): GET, no input. Super-admin id from session.
  'src/app/api/admin/jobs/route.ts',
  // Business metrics (Fase 5): GET, no input. tenant_id from session via withTenant.
  'src/app/api/admin/metrics/route.ts',
  // System status del dashboard /metricas: GET, no input. Identidad de session;
  // rol verificado contra DB con getStaffRole.
  'src/app/api/admin/system-status/route.ts',
  // ARCO Supresion (F8 Ley 25.326): no args; player id from session.
  'src/app/(player)/eliminar-cuenta/actions.ts',
  // VAPID public key (F9): GET, no body/params. Public key is intentionally public.
  'src/app/api/admin/push/vapid/route.ts',
  // Push test trigger (F9): POST, no body. tenant_id + staff_user_id from JWT.
  'src/app/api/admin/push/test/route.ts',
  // CSP violation sink (security/hardening): POSTed browser telemetry, parsed
  // defensively in src/shared/observability/csp-report.ts (8KB cap, tolerates
  // both legacy + Reporting-API shapes, never used to mutate state). A strict
  // zod schema would reject valid browser variants; the handler IS the guard.
  'src/app/api/csp-report/route.ts',
])

function usesZod(src: string): boolean {
  return /from\s+['"]zod['"]/.test(src) ||
         /from\s+['"]@\/shared\/validation/.test(src) ||
         /from\s+['"][^'"]+\/[a-z-]+\.schema['"]/.test(src) ||
         // parseRouteUuid() validates the route's UUID param and returns a clean
         // 400 on a malformed id (F4-T6 shared helper). Routes whose only input
         // is that id — no body/query — are fully covered by it (e.g.
         // bookings/[id]/{complete,no-show}). Counts as input validation.
         /parseRouteUuid\s*\(/.test(src)
}

describe('Zod coverage on actions + route handlers', () => {
  for (const f of [...ACTIONS, ...ROUTES]) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    if (NO_INPUT_ALLOWLIST.has(rel)) continue
    it(`${rel} imports zod or a schema`, () => {
      const src = readFileSync(f, 'utf8')
      expect(usesZod(src), `${rel} must validate input via zod or a *.schema file`).toBe(true)
    })
  }
})
