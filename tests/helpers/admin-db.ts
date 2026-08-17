import postgres, { type Sql } from 'postgres'

/**
 * DSN administrativo de los tests. Cuarto lugar del repo donde vive esta misma
 * string (`client.ts` DEFAULT_URL, `scripts/seed-e2e.ts`, `tests/e2e/_helpers/
 * fresh-tenant-cleanup.ts`): se repite en vez de importarse porque cada uno
 * pertenece a un runtime distinto y ninguno debe arrastrar a los otros.
 */
const DEFAULT_ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

/**
 * Pool ADMINISTRATIVO de los tests de integración: seeds, TRUNCATE y GRANTs.
 *
 * POR QUÉ EXISTE, SEPARADO DE `getSql()`:
 *
 * `getSql()` es el pool de LA APLICACIÓN. En producción su DSN apunta a un rol
 * con RLS enforced (`bypassRlsCheck` en `launch-check.ts` falla el deploy si no
 * es así), pero en los tests apunta a superusuario — así que hoy un assert que
 * lee con `getSql()` ve filas que producción NO vería, y el test da verde sobre
 * un bug real. Esa es la clase "local enmascara" (PR #30, getMrrCents dando $0,
 * data-retention abortando en silencio).
 *
 * El arreglo NO es flippear `DATABASE_URL` a `turnogol_app`: el seeding necesita
 * privilegios que ese rol no tiene a propósito (CREATE ROLE, TRUNCATE, INSERT en
 * tablas con FORCE RLS sin policy de INSERT), así que ~122 `beforeAll` morirían
 * antes del primer assert. El arreglo es SEPARAR LOS DOS PAPELES:
 *
 *   - seed / cleanup / GRANTs → `adminSql()`  (privilegios, este archivo)
 *   - asserts tenant-scoped   → `asApp()`     (rol de la app + RLS, ./tenant)
 *
 * Con los papeles separados, `DATABASE_URL` puede endurecerse más adelante sin
 * tocar un solo seed. HOY el flip es NO-OP: sin `TEST_ADMIN_DATABASE_URL` en
 * ningún env, esto cae a `DATABASE_URL` — el mismo superusuario de siempre, en
 * local y en CI.
 */
const globalForAdminSql = globalThis as unknown as { __turnogolAdminSql?: Sql }

let _adminSql: Sql | null = null

export function adminSql(): Sql {
  if (_adminSql) return _adminSql
  // Mismo motivo que `getSql()`: vitest re-evalúa los módulos por archivo de
  // test, así que sin el global cada uno de los ~137 archivos abriría su propio
  // pool y agotaría los slots de Postgres. `globalThis` sí sobrevive (singleThread).
  if (globalForAdminSql.__turnogolAdminSql) {
    _adminSql = globalForAdminSql.__turnogolAdminSql
    return _adminSql
  }
  const url = process.env.TEST_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_ADMIN_URL
  _adminSql = postgres(url, {
    max: 4,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    prepare: false,
    onnotice: () => {},
  })
  globalForAdminSql.__turnogolAdminSql = _adminSql
  return _adminSql
}
