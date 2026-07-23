// Argentina is UTC-3 with no DST (fixed offset, safe to use as constant).
const ART_OFFSET_MS = 3 * 3600_000

export function artDateOf(ts: Date): string {
  return new Date(ts.getTime() - ART_OFFSET_MS).toISOString().slice(0, 10)
}

export function todayART(): string {
  return artDateOf(new Date())
}

/**
 * Límites UTC `[fromUtc, toUtc)` del rango de días operativos ART
 * `fromDate..toDate` ('YYYY-MM-DD', inclusive ambos). Medianoche ART
 * = 03:00 UTC (offset fijo, sin DST) — mismo corrimiento que usa
 * metrics.service para sus ventanas.
 *
 * Existe para filtrar `occurred_at` por rango sargable en vez de la expresión
 * `(occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = X`:
 * bajo RLS esa expresión no puede usarse como Index Cond — `timezone()` no es
 * LEAKPROOF, así que el planner no la baja debajo de la barrera de seguridad
 * de las policies y cae a Seq Scan aunque exista un índice de expresión
 * (hallazgo D3). Los operadores de comparación sobre la columna cruda sí son
 * leakproof y entran por idx_*_tenant_date/_day.
 */
export function artDayRangeUtc(
  fromDate: string,
  toDate: string = fromDate,
): { fromUtc: Date; toUtc: Date } {
  const fromUtc = new Date(new Date(`${fromDate}T00:00:00Z`).getTime() + ART_OFFSET_MS)
  const toUtc = new Date(
    new Date(`${toDate}T00:00:00Z`).getTime() + ART_OFFSET_MS + 24 * 3600_000,
  )
  return { fromUtc, toUtc }
}
