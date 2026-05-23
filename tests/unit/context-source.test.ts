import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(root: string, suffix: RegExp, acc: string[] = []): string[] {
  for (const e of readdirSync(root)) {
    const p = path.join(root, e)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, suffix, acc)
    else if (suffix.test(e)) acc.push(p)
  }
  return acc
}

const routes = walk(path.resolve('src/app/api'), /^route\.ts$/)

/**
 * Forbidden: seeding tenant/player context from request-derived values
 * (params, searchParams, body.tenant). Context MUST come from session/JWT.
 */
const FORBIDDEN = [
  /withTenantContext\([^,]*params\./,
  /withTenantContext\([^,]*searchParams\./,
  /withTenantContext\([^,]*body\.tenant/,
  /withPlayerContext\([^,]*params\./,
  /withPlayerContext\([^,]*searchParams\./,
  /withPlayerContext\([^,]*body\.player/,
]

describe('context source must NEVER come from request input', () => {
  for (const f of routes) {
    const rel = path.relative(process.cwd(), f).replace(/\\/g, '/')
    const src = readFileSync(f, 'utf8')
    it(`${rel} does not seed context from request`, () => {
      for (const re of FORBIDDEN) {
        expect(src, `${rel}: forbidden pattern ${re}`).not.toMatch(re)
      }
    })
  }
})
