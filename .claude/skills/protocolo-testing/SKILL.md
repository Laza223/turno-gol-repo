---
name: protocolo-testing
description: Usar cuando hay que correr, escribir o arreglar tests de TurnoGol (Vitest unit/integration, Playwright e2e, seeds, Supabase local), cuando un test falla y no está claro si es pre-existente, o antes de declarar un cambio como terminado.
---

# Protocolo de testing

## Qué correr cuándo

| Situación | Comando |
|---|---|
| Después de CADA cambio de código | `pnpm typecheck` (+ `pnpm lint` antes de cerrar) |
| Cambiaste lógica | `pnpm test` (unit; no requiere DB) |
| Un solo archivo unit | `pnpm exec vitest run tests/unit/<archivo>.test.ts` |
| Tocaste DB / queries / schema / RLS | `pnpm supabase:start` + `pnpm test:integration` |
| Tocaste aislamiento tenant/player | `pnpm test:isolation` — BLOQUEANTE (doc16), nunca debilitarlo |
| Tocaste un flujo de UI end-to-end | `pnpm e2e:seed` + `pnpm test:e2e` (un spec: `pnpm exec playwright test tests/e2e/<spec>.spec.ts --project chromium`) |
| Sospecha de flakiness | `pnpm test:e2e:flake-detect` (los `@critical` ×10, sin retries) |
| Verificación completa de un fix | `bash scripts/audit-verify.sh` (juez inmutable) |

## Entorno

- Integration y e2e necesitan Supabase local: `pnpm supabase:start` → DB `:54322`, API `:54331`, Inbucket (mails/magic links) `:54324`. Migración nueva → `pnpm supabase:reset` re-aplica todo.
- **E2E y MP mock**: Playwright levanta `pnpm dev` en `:3000` con `MP_MOCK_MODE=1`, pero con `reuseExistingServer` — si ya hay un dev server corriendo SIN ese flag, los specs de pago/seña fallan de forma confusa. Solución: agregar `MP_MOCK_MODE=1` a `.env.local` o cortar el server antes de correr e2e.
- `pnpm e2e:seed` (idempotente, re-correr si quedaron datos sucios) crea los tenants `e2e-complejo-demo` y `e2e-complejo-sena` con UUIDs fijos; credenciales en `tests/e2e/_helpers/test-credentials.ts`.

## Integración: seeds vs asserts (el pool importa)

El DSN de los tests es **superusuario**, así que un `SELECT` de verificación ve filas que producción —donde la app corre bajo `turnogol_app` con RLS— NO vería. Ahí se escondieron bugs reales que llegaron a prod con la suite en verde (`getMrrCents` devolviendo $0, el worker de retención abortando mudo). Por eso los dos papeles están separados:

| Para qué | Con qué | Dónde |
|---|---|---|
| Seed, fixtures, `TRUNCATE`, GRANTs | `adminSql()` | `tests/helpers/admin-db.ts` |
| Assert de post-condición tenant-scoped | `asApp(tenantId, tx => tx\`SELECT …\`)` | `tests/helpers/tenant.ts` |
| El bug depende de atributos de SESIÓN (GUCs `SUSET` tipo `session_replication_role`, `rolconfig` de migr. 055) | LOGIN real + tripwire `current_user`/`rolsuper`/`rolbypassrls` como primer `it` | patrón de `tests/integration/data-retention-worker-role.test.ts` |

`asApp` hace `SET LOCAL ROLE turnogol_app` + `app.current_tenant_id` y **siempre rollback**, así que también sirve para asserts que escriben. `SET ROLE` desde una sesión superusuario NO reproduce los GUCs de sesión ni el `rolconfig`: para eso está la tercera fila.

Se quedan en `adminSql()` **con un comentario que diga por qué**: lecturas deliberadamente cross-tenant, tablas globales (`tenants`, `players`, `staff_users`, `plans`, `processed_webhooks`) y tablas deny-all para el rol de la app (`push_send_log`).

Un assert que se pone rojo al migrarlo a `asApp` **es la señal, no una regresión**: o el assert estaba mal ubicado, o falta un grant/policy de verdad. Clasificá antes de "arreglar".

Ratchet a futuro: cuando una suite queda migrada del todo deja de importar `getSql`, y ahí se puede banear `getSql`/`getDb` en `tests/integration/**` por lint. Hoy es imposible (122 archivos lo importan).

## Test rojo: ¿lo rompiste vos?

1. `git stash` → correr el mismo test → `git stash pop`.
2. Ya fallaba sin tu cambio → es pre-existente: NO lo persigas ni lo "arregles de paso"; registralo y seguí.
3. Falla solo con tu cambio → tu cambio es la causa. Debuggear la causa raíz; el test no se toca.

## Reglas duras

- **NUNCA** borrar un test, ponerle `.skip` ni debilitar aserciones para llegar a verde. Verde se consigue arreglando código, no editando al juez.
- Nada de fechas hardcodeadas (time bombs que explotan meses después — ya pasó en este repo). Usar helpers relativos como `tomorrowDateIsoArt()` de `tests/e2e/_helpers/booking-seed.ts`.
- Nada de `new Date().toISOString().slice(0,10)` para "hoy": deriva el día en UTC y entre las 21:00 y medianoche ART ya devuelve mañana (los tests de fecha se caen 3 h por noche). Usar `artTodayStr()` de `@/shared/dates/art`. Hay una regla de ESLint que lo bloquea.
- No setear `process.env.*` en un test sin restaurarlo en `afterEach` (un leak de `UPSTASH_*` colgó suites enteras 37s contra Redis real).
- Al declarar "listo/verde": citar el output real del comando. Sin output pegado, no hay claim.

## Gotchas conocidos del repo

| Síntoma | Causa / acción |
|---|---|
| `useFormState`/`useFormStatus` undefined en vitest | Mockear `react-dom` para testear la presentación |
| `db-client-role-guard` falla | Es un test **unit** que mockea `postgres` entero: NO necesita Supabase. Si falla, es tu cambio en la allowlist de roles de `applyContext` |
| `schema-drift` rojo por una columna que no existe en ningún archivo | Basura de la DB local (rama vieja o experimento aplicado a mano). CI aplica migraciones desde cero y no lo ve |
| Integration: "tuple concurrently updated" | Race de GRANT en Supabase local → `pnpm test:integration --retry=3` |
| `abonados-crud` e2e falla en paralelo local | Choca consigo mismo; correr solo ese spec aparte |
| Vitest verde pero la página revienta | Borde RSC/`'use client'` no se ve en unit — verificar en el server real (`pnpm dev`) |
| Story que espera un hijo que entra por `next/dynamic` y falla solo en CI | El `import()` es un pedido al dev server de Vite: la PRIMERA story del archivo paga la transformación del chunk y se pasa de `asyncUtilTimeout` (15 s). Importar el módulo estático arriba del archivo de story lo carga fuera del presupuesto de los `findBy*`. Caso medido: `ExplorarSplitView` (`docs/tech-debt.md`) |
| `toHaveStyle` rojo en CI y no se entiende por qué | No imprime el valor recibido: da el MISMO mensaje para un nodo huérfano, un color equivocado y un elemento sin fondo. Comparar el string (`getComputedStyle(el).prop` con `toBe`) antes de intentar reproducir |
| Story de hover rompe solo en el shard | El mouse real es uno para toda la página y `@vitest/browser` no la recarga entre archivos: una story anterior lo deja sobre un elemento y Chromium dispara `mouseenter` al montar. Soltar el hover con `unhover` al arrancar; `userEvent` acá es sintético, mover el puntero no alcanza |
| Flake de Stories que NO reproduce local | El runner de GitHub tiene 4 núcleos. Correr `--shard=N/3` con ~14 procesos quemando CPU en paralelo: eso lo trae de 0/3 a 5/14 |
