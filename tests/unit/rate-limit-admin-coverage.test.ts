import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Static coverage guard (mirrors zod-coverage.test.ts): every admin-facing
// endpoint — API route handler OR Server Action — must enforce the `adminCrud`
// rate-limit policy. A new admin endpoint added without rate limiting fails
// here by default. See docs/security-decisions.md §"Rate limiting".

function findFiles(root: string, regex: RegExp, acc: string[] = []): string[] {
  if (!existsSync(root)) return acc
  for (const entry of readdirSync(root)) {
    const p = path.join(root, entry)
    const s = statSync(p)
    if (s.isDirectory()) findFiles(p, regex, acc)
    else if (regex.test(entry)) acc.push(p)
  }
  return acc
}

const ROOT = path.resolve(__dirname, '..', '..')
const rel = (f: string): string => path.relative(ROOT, f).replace(/\\/g, '/')
const read = (f: string): string => readFileSync(f, 'utf8')

// adminCrud is applied three idiomatic ways: guard() in route handlers,
// enforce() directly (raw handlers / super-admin), or adminRateLimited() in
// Server Actions. Any one counts as coverage.
function hasAdminRateLimit(src: string): boolean {
  return (
    /adminRateLimited\s*\(/.test(src) ||
    /\bguard\(\s*['"]adminCrud['"]/.test(src) ||
    /\benforce\(\s*['"]adminCrud['"]/.test(src)
  )
}

// Admin Server Actions: every mutating admin action lives in one of these trees.
const ADMIN_ACTION_FILES = [
  ...findFiles(path.join(ROOT, 'src/app/(admin)'), /^actions\.ts$/),
  ...findFiles(path.join(ROOT, 'src/app/onboarding'), /^actions\.ts$/),
  ...findFiles(path.join(ROOT, 'src/modules/tenants'), /^actions\.ts$/),
]

// Admin API routes: tenant-scoped routes resolve the admin via withTenant /
// withBillingTenant. That wrapper is the robust static signal for "admin route"
// (player routes use withPlayer; public/webhook/health use raw handlers).
const ALL_ROUTES = findFiles(path.join(ROOT, 'src/app/api'), /^route\.ts$/)
const TENANT_SCOPED_ROUTES = ALL_ROUTES.filter((f) => /\bwith(Billing)?Tenant\s*\(/.test(read(f)))

// Admin routes that use a raw handler (extractAuthUser) instead of withTenant —
// not caught by the heuristic above, so listed explicitly to keep them honest.
const ADMIN_RAW_ROUTES = [
  'src/app/api/reports/revenue/route.ts',
  'src/app/api/admin/jobs/route.ts',
].map((p) => path.join(ROOT, p))

const ADMIN_FILES = Array.from(
  new Set([...ADMIN_ACTION_FILES, ...TENANT_SCOPED_ROUTES, ...ADMIN_RAW_ROUTES]),
)

describe('adminCrud rate-limit coverage on admin endpoints', () => {
  it('discovers a meaningful set of admin endpoints', () => {
    expect(ADMIN_FILES.length).toBeGreaterThan(20)
  })

  for (const f of ADMIN_FILES) {
    it(`${rel(f)} enforces adminCrud rate limiting`, () => {
      expect(
        hasAdminRateLimit(read(f)),
        `${rel(f)} must call guard('adminCrud', …), enforce('adminCrud', …) or adminRateLimited(…)`,
      ).toBe(true)
    })
  }
})
