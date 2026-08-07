import { eq } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { nightCutoffMins } from '@/shared/time/operating-day'
import type { OpeningHours } from './tenant.types'

/**
 * Cutoff de día operativo del tenant, derivado de `opening_hours` +
 * `closes_next_day` (ver `nightCutoffMins`). Devuelve 0 para la inmensa mayoría
 * de complejos, donde el día operativo es idéntico al día calendario ART.
 *
 * Vive acá y no en `@/shared` a propósito: necesita el tipo `OpeningHours`, que
 * es de dominio, y `@/shared` no puede conocer `@/modules` (regla de capas de
 * `eslint.config.mjs`). Lo comparten `metrics` y `reports`, que hasta el
 * 2026-08-07 tenían el mismo SELECT duplicado — y sólo uno de los dos lo usaba
 * de verdad, que es cómo los reportes quedaron en UTC calendario.
 *
 * Lee sólo 2 columnas y reusa la tx tenant-scoped ya abierta en vez de abrir
 * otra conexión.
 */
export async function resolveCutoffMins(tenantId: string, tx: DbTx): Promise<number> {
  const [row] = await tx
    .select({ openingHours: tenants.openingHours, closesNextDay: tenants.closesNextDay })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  if (!row) return 0
  return nightCutoffMins(row.openingHours as OpeningHours, row.closesNextDay)
}
