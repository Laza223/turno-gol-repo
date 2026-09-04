import { readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import path from 'node:path'

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    const s = statSync(p)
    if (s.isDirectory() && !p.includes('node_modules') && !p.includes('.next')) walk(p, acc)
    else if (s.isFile() && p.endsWith('.ts')) acc.push(p)
  }
  return acc
}

const files = walk(path.resolve('src'))

describe('cookie flags', () => {
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    // Only consider files that actually .set( a cookie via `cookies()` jar.
    if (!/cookies\(\)/.test(src)) continue
    if (!/\.set\(\s*\{/.test(src)) continue
    const rel = path.relative(process.cwd(), f).replace(/\\/g, '/')

    it(`${rel} sets httpOnly + sameSite + secure(prod)`, () => {
      const block = src.match(/\.set\(\s*\{[\s\S]*?\}\s*\)/g) ?? []
      for (const b of block) {
        // Los adaptadores de cookies de la librería (hoy `cookieAdapter` en
        // src/lib/supabase/server.ts) reenvían los flags con `...options`.
        //
        // No es solo "los pone la librería": para las cookies de sesión de
        // Supabase, `httpOnly: false` es INTENCIONAL. El cliente del navegador
        // las lee de `document.cookie` para autorizar el canal en vivo de la
        // grilla (src/hooks/use-booking-realtime.ts). Es el default de
        // @supabase/ssr y exigirle httpOnly acá rompería Realtime.
        // Ese contrato se cubre en tests/unit/supabase-cookie-adapter.test.ts,
        // que verifica que las options viajen intactas.
        if (/\.\.\.options/.test(b)) continue
        expect(b, `${rel}: cookie .set must include httpOnly: true`).toMatch(/httpOnly:\s*true/)
        expect(b, `${rel}: cookie .set must include sameSite`).toMatch(
          /sameSite:\s*['"](lax|strict)['"]/,
        )
        expect(b, `${rel}: cookie .set must include secure based on NODE_ENV`).toMatch(
          /secure:\s*process\.env\.NODE_ENV/,
        )
      }
    })
  }
})
