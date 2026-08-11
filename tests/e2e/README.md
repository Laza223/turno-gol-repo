# Tests E2E — TurnoGol

Playwright. Requiere Supabase local corriendo + dev server en puerto 3000.

## Inventario de specs por project

| Project         | Patrón de match                                                      | Specs incluidos                                                                                                                                                                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chromium`      | `tests/e2e/*.spec.ts` (excluye `mobile/`, `a11y/`, `cross-browser/`) | `abonados-crud`, `admin-login`, `availability`, `booking-flow`, `caja-crud`, `canchas-crud`, `first-booking-aha`, `grilla-realtime`, `landing`, `onboarding`, `pin-lockout`, `player-bookings`, `player-data-export`, `player-delete-account`, `player-profile`, `portal-search`, `public-seo`, `push`, `reportes`, `reservas-crud`, `staff-crud` (21 specs) |
| `mobile-chrome` | `tests/e2e/mobile/*.spec.ts`                                         | `admin-mobile-smoke`, `touch-targets`                                                                                                                                                                                                                                                                                                                        |
| `axe-audit`     | `tests/e2e/a11y/*.spec.ts`                                           | `admin`, `player`, `public`, `skip-link`                                                                                                                                                                                                                                                                                                                     |
| `webkit`        | `tests/e2e/cross-browser/*.spec.ts`                                  | `login-smoke`, `public-smoke`                                                                                                                                                                                                                                                                                                                                |
| `firefox`       | `tests/e2e/cross-browser/*.spec.ts`                                  | `login-smoke`, `public-smoke`                                                                                                                                                                                                                                                                                                                                |
| `mobile-safari` | `tests/e2e/cross-browser/*.spec.ts`                                  | `login-smoke`, `public-smoke`                                                                                                                                                                                                                                                                                                                                |

**Projects CI** (instalan solo Chromium): `chromium`, `mobile-chrome`, `axe-audit`.

**Projects cross-browser** (requieren webkit/firefox instalados): `webkit`, `firefox`, `mobile-safari`. Corren local o en job nightly futuro.

## Flujos críticos taggeados `@critical`

> Ver T5 del plan F14 para el tagging real en cada spec. Esta sección documenta la convención y el inventario target.

Los tests taggeados `@critical` son el subset que ejecuta `pnpm test:e2e:flake-detect` (10× rerun, retries=0). Target post-F14: ≥ 13 tests.

Flujos doc7 a taggear:

- **Flow 2** — Jugador reserva online con seña MP (`booking-flow.spec.ts`, 4 tests)
- **Flow 5** — Cierre caja + arqueo (`caja-crud.spec.ts`)
- **Flow 6** — PIN gate `/caja` + `/staff` (`pin-lockout.spec.ts`)
- **Flow 7** — Magic link admin (`admin-login.spec.ts`) + player magic link (T4)
- **Flow 8** — Player area: ver/cancelar/perfil/ARCO/eliminar (`player-bookings`, `player-data-export`, `player-delete-account`)
- **Flow 1** — Admin crea reserva manual desde UI (T2, nuevo spec `critical-flows/admin-create-booking-ui.spec.ts`)
- **Flow 3** — Cancelación con reembolso MP (T3, nuevos specs)

Naming convention: agregar ` @critical` al **final del string del test name**:

```ts
test('jugador reserva con seña MP @critical', async ({ page }) => { ... })
```

El `--grep @critical` en `test:e2e:flake-detect` hace match sobre ese sufijo.

## Cómo correr local

### Pre-requisitos

1. **Supabase local corriendo:**
   ```sh
   pnpm supabase:start
   ```
2. **Seed E2E** (crea tenants, users y datos de prueba):
   ```sh
   pnpm e2e:seed
   ```
3. **Dev server** (Playwright lo arranca automáticamente si no está corriendo; ver `playwright.config.ts` `webServer`):
   ```sh
   pnpm dev
   ```

### Comandos

| Comando                       | Qué corre                                                      | Cuándo usar                          |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| `pnpm test:e2e`               | Todos los projects (requiere webkit/firefox/safari instalados) | Full local, browsers instalados      |
| `pnpm test:e2e:ci`            | `chromium` + `mobile-chrome` + `axe-audit`                     | Simular CI localmente                |
| `pnpm test:e2e:flake-detect`  | `chromium`, solo `@critical`, 10× rerun, retries=0             | Verificar estabilidad antes de merge |
| `pnpm test:e2e:cross-browser` | `webkit` + `firefox` + `mobile-safari`                         | Cross-browser manual o pre-release   |

Para correr un spec específico:

```sh
pnpm exec playwright test booking-flow --project chromium
pnpm exec playwright test booking-flow --project chromium --headed
pnpm exec playwright test booking-flow --project chromium --debug
```

Para listar tests que matchean `@critical` sin correrlos:

```sh
pnpm exec playwright test --project chromium --grep @critical --list
```

## Troubleshooting

### Supabase no corre

```sh
pnpm supabase:start
# Si falla: supabase status para ver el estado
# Si hay conflicto de puertos: supabase stop && supabase start
```

El dev server necesita `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`. Sin Supabase local, los tests de auth fallan con 500.

### MercadoPago mock desactivado

`playwright.config.ts` setea `MP_MOCK_MODE=1` en el `webServer`. Si corrés el dev server manualmente con `pnpm dev`, verificar que `.env.local` tenga `MP_MOCK_MODE=1` o que el server se arranca desde Playwright. Sin MP_MOCK, el checkout real falla en E2E.

### Puerto 3000 ocupado

Playwright reutiliza el server si está corriendo (`reuseExistingServer: true` fuera de CI). Si el puerto está ocupado con una instancia diferente, matar el proceso:

```sh
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

Luego dejar que Playwright arranque el server limpio.

### Upstash creds faltantes

`playwright.config.ts` setea `UPSTASH_REDIS_REST_URL=''` y `UPSTASH_REDIS_REST_TOKEN=''` vacíos en el webServer. Esto desactiva rate limiting en E2E. Los tests que cubren rate-limiting usan stubs en vitest unit, no E2E. Si un test falla con error de Upstash, verificar que el server E2E usa las vars del config y no las de `.env.local`.

### Resend creds faltantes

`playwright.config.ts` inyecta `RESEND_API_KEY=e2e-placeholder`. Los tests de magic link (`admin-login`, `player-magic-link`) mockean el envío; no se espera email real. Si ves errores de Resend en logs, el servidor puede estar usando la key real de `.env.local` — en ese caso los emails se envían igual pero los tests no fallan por eso.

### Tests `webkit`/`firefox`/`mobile-safari` fallan con "browser not found"

Instalar los browsers:

```sh
npx playwright install webkit firefox
```

Estos no se instalan en CI. Usar `pnpm test:e2e:ci` para correr sólo los projects CI.

## Links

- [docs/browser-support.md](../../docs/browser-support.md) — decisiones de soporte de browsers (F13)
- [docs/audit/MASTER_PLAN.md](../../docs/audit/MASTER_PLAN.md) — plan general de auditoría
- [docs/audit/plans/2026-05-29-fase-f14-e2e-coverage-final.md](../../docs/audit/plans/2026-05-29-fase-f14-e2e-coverage-final.md) — plan F14 completo (T1–T5)
