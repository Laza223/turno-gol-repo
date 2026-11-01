/**
 * El seed e2e y su helper borran los tenants a mano, en orden de FK. Toda tabla
 * con `tenant_id` y FK NO-CASCADE a `tenants` tiene que estar en esas listas, o
 * `DELETE FROM tenants` revienta con 23503 — pero SOLO en una DB local que ya
 * tenga filas de esa tabla: CI aplica las migraciones sobre una DB vacía y no lo
 * ve. Así cayeron analytics_events (072) y whatsapp_* (096), y el seed ya había
 * borrado los usuarios auth cuando fallaba.
 *
 * Este test corta la clase: compara las FKs REALES de la DB migrada contra los
 * `DELETE FROM` de los dos archivos, y falla en el PR que agrega la tabla.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { adminSql } from '../helpers/admin-db'

const CLEANUPS = [
  // El seed limpia dos tenants fijos: cada tabla tiene que borrarse para los dos.
  { file: 'scripts/seed-e2e.ts', scopes: ['E2E.tenantId', 'E2E.depositTenantId'] },
  // El helper recorre los tenants del fresh admin con `tid`.
  { file: 'tests/e2e/_helpers/fresh-tenant-cleanup.ts', scopes: ['tid'] },
]

function tablesDeletedFor(source: string, scope: string): Set<string> {
  const re = new RegExp(
    `DELETE FROM (\\w+) WHERE tenant_id = \\$\\{${scope.replace('.', '\\.')}\\}`,
    'g',
  )
  return new Set([...source.matchAll(re)].map((m) => m[1]))
}

describe('limpieza de tenants del seed e2e vs FKs reales a tenants', () => {
  let fkTables: string[] = []

  beforeAll(async () => {
    // pg_catalog no es una tabla de tenant: no hay RLS que reproducir, así que va
    // por el pool administrativo (lectura deliberadamente global).
    const rows = await adminSql()<{ tabla: string }[]>`
      SELECT DISTINCT cl.relname AS tabla
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      WHERE c.contype = 'f'
        AND c.confrelid = 'public.tenants'::regclass
        AND c.confdeltype <> 'c'
        AND c.conrelid <> c.confrelid
        AND cl.relnamespace = 'public'::regnamespace
      ORDER BY 1`
    fkTables = rows.map((r) => r.tabla)
  })

  it('la query ve las FKs (tripwire: DB sin migrar daría verde vacío)', () => {
    expect(fkTables).toContain('bookings')
  })

  it.each(CLEANUPS)('$file borra toda tabla con FK no-CASCADE a tenants', ({ file, scopes }) => {
    const source = readFileSync(path.resolve(process.cwd(), file), 'utf8')
    const missing = fkTables.filter((t) => scopes.some((s) => !tablesDeletedFor(source, s).has(t)))
    expect(
      missing,
      `Falta \`DELETE FROM <tabla> WHERE tenant_id = …\` en ${file} (para cada tenant del ` +
        `cleanup), antes de DELETE FROM tenants y respetando el orden de FK: ${missing.join(', ')}`,
    ).toEqual([])
  })
})
