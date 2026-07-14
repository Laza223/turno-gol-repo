import { customType } from 'drizzle-orm/pg-core'

/**
 * Reemplazo drop-in de `jsonb` de drizzle-orm/pg-core.
 *
 * HISTORIA (importante, no borrar): bajo drizzle-orm 0.30 el `jsonb` de pg-core
 * hacía `JSON.stringify(value)` en `toDriver` y postgres-js NO recibía un OID de
 * tipo explícito, así que infería "esto es un string" y lo guardaba como un valor
 * JSON escalar (`jsonb_typeof = 'string'`, p.ej. `"{\"a\":1}"`) en vez de un
 * objeto. El dato quedaba CORRUPTO at-rest: `columna->>'campo'` y los operadores
 * jsonb en SQL devolvían NULL. Las lecturas vía drizzle lo enmascaraban porque
 * `fromDriver` hacía JSON.parse — pero cualquier SQL cruda, policy RLS o lector
 * no-drizzle se rompía. El workaround de entonces era devolver el valor CRUDO en
 * `toDriver` y dejar que postgres-js lo serializara una sola vez.
 *
 * DRIZZLE 0.45: `drizzle(client)` ahora PISA los serializers de json/jsonb de la
 * instancia de postgres-js con una identidad (ver postgres-js/driver.js:
 * `client.options.serializers["3802"] = transparentParser`). Eso rompía este
 * `toDriver`, que devuelve el objeto crudo esperando que postgres-js lo
 * serialice. La respuesta NO es stringify-ear acá: el repo comparte UNA sola
 * instancia de postgres-js entre drizzle (`getDb`) y el SQL crudo (`getSql`), así
 * que la mutación de drizzle también rompía todo `sql.json(obj)` crudo. El fix
 * vive en client.ts, que restaura los serializers nativos después de construir
 * drizzle — un solo lugar, y el invariante de siempre ("pasás el objeto, se
 * serializa una vez") sigue valiendo para los dos caminos.
 *
 * Verificado contra Postgres real (no asumido): `jsonb_typeof()` sobre una fila
 * insertada por drizzle devuelve 'object', no 'string'. Ver scripts/_jsonb_probe.ts.
 *
 * `fromDriver` conserva el parse defensivo para auto-sanar las filas viejas que
 * quedaron doble-codificadas antes de todo esto.
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
