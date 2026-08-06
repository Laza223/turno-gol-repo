import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { RESERVED_SLUGS } from '@/modules/tenants/tenant.utils'

/**
 * `RESERVED_SLUGS` tiene que contener TODOS los segmentos de primer nivel del
 * App Router, o un complejo puede quedarse con un slug que Next resuelve como
 * ruta estática y su página pública se vuelve inalcanzable — sin error en
 * ningún log y sin forma de arreglarlo salvo renombrando al cliente.
 *
 * El docstring de la constante pedía "mantener en sync a mano". No funcionó:
 * al auditarla en Fase 4 le faltaban `analiticas`, `deudas` y `reactivar`, los
 * tres desde hacía rato. Este test lo vuelve mecánico.
 *
 * Sólo verifica una dirección (toda ruta real está reservada). La inversa no
 * se exige a propósito: la lista puede reservar de más (p. ej. `c`, que es un
 * prefijo de link y no una carpeta, o una ruta que se borró pero cuyo slug no
 * conviene liberar porque hay links viejos dando vueltas).
 */

const appDir = path.resolve(__dirname, '..', '..', 'src', 'app')

/** Segmentos que SÍ aparecen en la URL: sin route groups, dinámicos ni privados. */
function topLevelSegments(): string[] {
  const segments = new Set<string>()

  // Sólo se baja por route groups: un directorio normal YA es el primer
  // segmento de la URL, y lo que cuelgue de él es un segundo nivel que no
  // puede colisionar con `/{slug}`.
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (!statSync(full).isDirectory()) continue
      // `_privado` no rutea; `[slug]` es justamente el catch-all del tenant.
      if (entry.startsWith('_') || entry.startsWith('[')) continue

      if (entry.startsWith('(') && entry.endsWith(')')) {
        walk(full)
        continue
      }
      segments.add(entry)
    }
  }

  walk(appDir)
  return [...segments].sort()
}

describe('RESERVED_SLUGS cubre el App Router', () => {
  const segments = topLevelSegments()

  it('encuentra segmentos para auditar (si no, el guard no aplica)', () => {
    expect(segments.length).toBeGreaterThan(20)
    // Canarios: si estos dejan de aparecer, el walker se rompió.
    expect(segments).toContain('grilla')
    expect(segments).toContain('explorar')
  })

  it.each(topLevelSegments())('/%s está reservado', (segment) => {
    expect(
      RESERVED_SLUGS.has(segment),
      `El segmento top-level "${segment}" no está en RESERVED_SLUGS: un complejo ` +
        `cuyo nombre slugifique así quedaría con su página pública tapada por la ` +
        `ruta estática. Agregalo en src/modules/tenants/tenant.utils.ts.`,
    ).toBe(true)
  })
})
