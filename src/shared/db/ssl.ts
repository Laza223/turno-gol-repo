/**
 * Qué TLS usa cada pool contra Postgres, decidido en CÓDIGO y no por el
 * `?sslmode=` del DSN.
 *
 * ─── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * El mismo `DATABASE_URL` lo consumen DOS librerías de Postgres con semánticas
 * OPUESTAS para el mismo valor de `sslmode`:
 *
 *   - `pg` (node-postgres, lo que usa pg-boss por debajo) **valida la cadena de
 *     certificados** con `sslmode=require`. El pooler de Supabase firma con su
 *     propia CA, así que el worker moría al arrancar con "self-signed
 *     certificate in certificate chain". Se arregló poniendo `no-verify`, que
 *     `pg` entiende y traduce a `{ rejectUnauthorized: false }`.
 *   - `postgres` (porsager, el pool de la app) copia el `sslmode` **tal cual** a
 *     su opción `ssl`, y solo entiende `require` / `allow` / `prefer` /
 *     `verify-full`. Con `no-verify` le llega un string desconocido, cae al
 *     default de Node —validar la cadena— y muere con el MISMO error.
 *
 * O sea: cada valor arregla una librería y rompe la otra. Eso estuvo en
 * producción. Con `no-verify` en Railway el worker arrancaba y pg-boss andaba,
 * pero **todo `withTenantContext` fallaba**: el health-ping logueó
 * `database: down — self-signed certificate in certificate chain` cada 5
 * minutos durante horas y nadie se enteró, porque el proceso seguía vivo y el
 * latido seguía llegando. Los crons que tocan plata (dunning de suscripciones,
 * reconciliación de pagos pendientes, generación de slots de abonados,
 * reintento de reembolsos) usan ese pool.
 *
 * La salida no es elegir mejor el string: es **dejar de depender de él**. La
 * opción explícita le gana al query param en las dos librerías, así que a
 * partir de acá el `sslmode` del DSN es cosmético y ninguna edición de una
 * variable de entorno puede volver a romper esto.
 *
 * ─── Lo que NO hace ───────────────────────────────────────────────────────────
 *
 * `rejectUnauthorized: false` cifra pero no valida la cadena — es el
 * comportamiento que ya tenía el sistema, no un downgrade. Validar de verdad
 * exige empaquetar la CA de Supabase y pasar `sslrootcert`; queda como mejora
 * aparte, anotada en la auditoría de infraestructura.
 */

/** Hosts donde no hay TLS que negociar (Supabase local, CI, tests). */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function isLocalDsn(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname)
  } catch {
    // DSN ilegible: no inventamos TLS sobre algo que no sabemos qué es.
    return true
  }
}

/**
 * Opción `ssl` para un pool de `postgres` (porsager) y para uno de `pg`.
 *
 * El objeto `{ rejectUnauthorized: false }` lo entienden las dos: porsager lo
 * pasa derecho a `tls.connect`, y `pg` lo usa como su config de SSL.
 */
export function dbSslOptions(url: string): { rejectUnauthorized: false } | false {
  return isLocalDsn(url) ? false : { rejectUnauthorized: false }
}
