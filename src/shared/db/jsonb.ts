import { customType } from 'drizzle-orm/pg-core'

/**
 * Reemplazo drop-in de `jsonb` de drizzle-orm/pg-core que evita el doble-encode
 * con el driver postgres-js.
 *
 * BUG: el `jsonb` de pg-core hace `JSON.stringify(value)` en `toDriver`. El
 * driver postgres-js recibe ese STRING y lo guarda como un valor JSON escalar
 * (`jsonb_typeof = 'string'`, p.ej. `"{\"a\":1}"`) en vez de un objeto. El dato
 * queda corrupto at-rest: `columna->>'campo'` y los operadores jsonb en SQL
 * devuelven NULL. Las lecturas vía drizzle lo enmascaraban porque `fromDriver`
 * hacía `JSON.parse` del string — pero cualquier query SQL cruda, policy RLS o
 * lector no-drizzle sobre el campo se rompía. Confirmado en scripts/_jsonb_probe.ts.
 *
 * FIX: `toDriver` devuelve el valor CRUDO (objeto/array). postgres-js lo
 * serializa a jsonb una sola vez → `jsonb_typeof` correcto (object/array).
 * `fromDriver` mantiene el parse defensivo para auto-sanar las filas viejas que
 * ya quedaron doble-codificadas (string) antes de este fix.
 */
export const jsonb = customType<{ data: unknown; driverData: unknown }>({
  dataType() {
    return 'jsonb'
  },
  toDriver(value) {
    return value
  },
  fromDriver(value) {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  },
})
