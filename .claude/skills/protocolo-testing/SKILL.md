---
name: protocolo-testing
description: Usar cuando hay que correr o arreglar tests de TurnoGol (Vitest unit/integration, Playwright e2e, Stories, Supabase local) o cuando un test falla y no está claro por qué. Gotchas del entorno de tests.
---

# Tests de TurnoGol: gotchas del entorno

## Qué necesita cada suite

- `pnpm test` (unit) no necesita DB. Un solo archivo: `pnpm exec vitest run tests/unit/<archivo>.test.ts`.
- DB, queries, schema o RLS: `pnpm supabase:start` + `pnpm test:integration`. Aislamiento: `pnpm test:isolation` y `pnpm test:isolation:rol-real` (**bloqueantes**, doc16).
- UI de punta a punta: `pnpm e2e:seed` + `pnpm test:e2e` (un spec: `pnpm exec playwright test tests/e2e/<spec>.spec.ts --project chromium`). Flakiness: `pnpm test:e2e:flake-detect`.
- Verificación completa de un fix: `bash scripts/audit-verify.sh`.
- Supabase local: DB `:54322`, API `:54331`, Inbucket `:54324`. Migración nueva → `pnpm supabase:reset`.
- **Integración sin las variables de entorno trunca la base local** (default `:54322` + `cleanupAll`).
- **E2E y MP mock**: Playwright levanta `pnpm dev` en `:3000` con `MP_MOCK_MODE=1`, pero con `reuseExistingServer`: si ya hay un dev server sin ese flag, los specs de pago fallan de forma confusa. Next permite un solo dev server por carpeta.
- `pnpm e2e:seed` es idempotente; crea `e2e-complejo-demo` y `e2e-complejo-sena` con UUIDs fijos (credenciales en `tests/e2e/_helpers/test-credentials.ts`).

## El rol con el que se mide importa

El DSN de los tests es superusuario: un `SELECT` de verificación ve filas que producción (rol `turnogol_app` con RLS) no vería, y así llegaron bugs a prod con la suite en verde.

| Para qué | Con qué | Dónde |
|---|---|---|
| Seed, fixtures, `TRUNCATE`, GRANTs | `adminSql()` | `tests/helpers/admin-db.ts` |
| Assert tenant-scoped | `asApp(tenantId, tx => …)` (siempre rollback) | `tests/helpers/tenant.ts` |
| El bug depende de atributos de sesión (GUCs `SUSET`, `rolconfig`) | LOGIN real + tripwire de `current_user` | `tests/integration/data-retention-worker-role.test.ts` |

Se quedan en `adminSql()`, con comentario: lecturas cross-tenant a propósito, tablas globales y tablas deny-all (`push_send_log`). Un assert que se pone rojo al pasarlo a `asApp` es una señal real: o estaba mal ubicado o falta un grant o policy.

## Fechas y entorno

- Nada de fechas hardcodeadas: helpers relativos (`tomorrowDateIsoArt()`). "Hoy" es `artTodayStr()`, nunca `toISOString().slice(0,10)`.
- No dejar `process.env.*` pisado sin restaurar en `afterEach` (un `UPSTASH_*` filtrado colgó suites contra Redis real).
- Para saber si un rojo es previo: comparar contra la base en un worktree aparte. No usar `git stash`: la pila se comparte entre worktrees.

## Síntomas conocidos

| Síntoma | Causa / acción |
|---|---|
| `useFormState` / `useFormStatus` undefined en vitest | Mockear `react-dom` |
| `db-client-role-guard` falla | Es unit y mockea `postgres`: si falla, es tu cambio en la allowlist de roles de `applyContext` |
| `schema-drift` rojo por una columna que no está en ningún archivo | Basura de la DB local; CI aplica desde cero |
| Integration "tuple concurrently updated" | Race de GRANT en Supabase local → `--retry=3` |
| `abonados-crud` e2e falla en paralelo | Choca consigo mismo; correrlo solo |
| Vitest verde pero la página revienta | El borde RSC / `'use client'` no se ve en unit: probar con `pnpm dev` |
| Borraste un archivo sin stagear y `pnpm test` da ENOENT | Hay tests que listan con `git ls-files`; `git rm` |
| Story con `next/dynamic` que falla solo en CI | La primera story paga la transformación del chunk: importar el módulo estático en el archivo de story |
| `toHaveStyle` rojo sin explicación | No imprime el valor recibido: comparar `getComputedStyle(el).prop` con `toBe` |
| Story de hover rompe solo en un shard | El mouse real es uno para toda la página: `unhover` al arrancar |
| Flake de Stories que no reproduce local | El runner tiene 4 núcleos: `--shard=N/3` con la CPU cargada |
| `pnpm test:storybook -- <patrón>` corre todo | Usar `pnpm exec vitest run --config vitest.storybook.config.ts <patrón>` |

## Más síntomas

- Después de `pnpm supabase:reset`, `turnogol_app` y `turnogol_worker` quedan `NOLOGIN` (el error `28P01` parece contraseña mala; los tests siguen verdes porque entran como superusuario). Ver `docs/operations/setup-local-roles.md`.
- Después del reset, la API local da 502: `docker restart supabase_kong_TurnoGol`.
- "running" pero nada escucha en `:543xx` (Windows): WinNAT reservó el rango. Ver `netsh interface ipv4 show excludedportrange protocol=tcp`; se destraba con `net stop winnat` en una consola de administrador.
- `ResponsiveList` deja tabla y cards en el DOM: los textos salen duplicados.
- `getByText` normaliza el DOM pero no el matcher: un espacio duro (`formatArs`) no matchea.
- `vi.spyOn` de `setInterval`/`clearInterval` con fake timers envenena los archivos siguientes del worker.
- Un test con `next/og` que falla solo en la suite completa ("expected magic word"): otro dejó `global.fetch` mockeado.
- El axe de Storybook por defecto mide solo el tema claro (`pnpm test:storybook:dark`), y sobre gradientes devuelve `incomplete`, que no falla.
- Playwright `mask` pinta una caja encima, no oculta; `--update-snapshots` sin `=all` no reescribe diffs bajo el umbral.
- Una PR cuya base no es `main` no dispara `ci.yml`.
