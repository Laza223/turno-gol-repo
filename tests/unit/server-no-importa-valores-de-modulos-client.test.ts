import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Candado para una clase que ya pegó dos veces y que NINGÚN test veía.
 *
 * Un Server Component puede importar un COMPONENTE de un módulo `'use client'`
 * (el bundler pone una referencia y React la resuelve al renderizar en el
 * cliente), pero NO puede importar un valor para ejecutarlo: lo que recibe es
 * esa referencia de módulo, no el valor.
 *
 * Caso real (2026-08-20): `CANCELABLE`, un `Set`, vivía exportado desde
 * `CancelSubscriptionSection.tsx` (`'use client'`) y `/reactivar` hacía
 * `CANCELABLE.has(...)`. La página entera devolvía 500 —y `/reactivar` es la
 * única superficie de un dueño `suspended` para pagar o darse de baja—. El
 * typecheck pasa (los tipos existen), el lint pasa, y los tests unitarios de la
 * página pasaban porque mockean el módulo del componente: ahí `CANCELABLE` sí
 * era un Set de verdad. Solo se ve corriendo la app.
 *
 * Heurística: un import de valor (no `import type`) desde un archivo client
 * hacia uno que no lo es, cuyo binding NO parece un componente (PascalCase).
 * Los `import type` no se miran: se borran en compilación y no cruzan nada.
 */

const repoRoot = path.resolve(__dirname, '../..')

function gitFiles(...patterns: string[]): string[] {
  return execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', ...patterns], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
}

function isClientModule(file: string): boolean {
  const src = readFileSync(path.join(repoRoot, file), 'utf8')
  // Se admite un banner de comentarios antes de la directiva.
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src)
}

/** `@/foo` → `src/foo`; `./foo` → relativo al archivo. Sin extensión. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith('@/')) return path.posix.normalize(spec.replace(/^@\//, 'src/'))
  if (spec.startsWith('.')) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec))
  }
  return null
}

const IMPORT_RE = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g

describe('un Server Component no puede importar valores de un módulo "use client"', () => {
  it('no hay imports de valor no-componente desde módulos client', () => {
    const files = gitFiles('src/**/*.ts', 'src/**/*.tsx')
    const clientModules = new Set(files.filter(isClientModule).map((f) => f.replace(/\.tsx?$/, '')))

    const offenders: string[] = []

    for (const file of files) {
      if (file.endsWith('.stories.tsx')) continue
      if (isClientModule(file)) continue // client → client es legítimo
      const src = readFileSync(path.join(repoRoot, file), 'utf8')

      for (const m of src.matchAll(IMPORT_RE)) {
        const [, typeOnly, bindings, spec] = m
        if (typeOnly) continue
        const target = resolveSpecifier(file.replace(/\\/g, '/'), spec)
        if (!target || !clientModules.has(target)) continue

        for (const raw of bindings.split(',')) {
          const binding = raw.trim()
          if (!binding || binding.startsWith('type ')) continue
          const local = (binding.split(/\s+as\s+/).pop() ?? binding).trim()
          // PascalCase = componente: eso SÍ cruza el boundary. Ojo con el
          // `[a-z]`: sin él, `CANCELABLE` (SCREAMING_SNAKE, el caso real que
          // motivó este test) pasa por componente y el candado no atrapa nada
          // — verificado reintroduciendo el bug a propósito.
          if (/^[A-Z][A-Za-z0-9]*$/.test(local) && /[a-z]/.test(local)) continue
          offenders.push(`${file} importa "${local}" de "${spec}" ("use client")`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
