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
  // ARCO data export (B9): GET, no body/params/query. Player id from session.
  'src/app/api/player/data-export/route.ts',
  // Queue-depth monitor (B10): GET, no input. Super-admin id from session.
  'src/app/api/admin/jobs/route.ts',
])

function usesZod(src: string): boolean {
  return /from\s+['"]zod['"]/.test(src) ||
         /from\s+['"]@\/shared\/validation/.test(src) ||
         /from\s+['"][^'"]+\/[a-z-]+\.schema['"]/.test(src)
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
