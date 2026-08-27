---
name: convenciones-stack
description: Usar cuando se escribe o modifica código que toca la DB (Drizzle, schema, migraciones, jsonb), aislamiento multi-tenant/RLS, background jobs de pg-boss, pagos MercadoPago (mock mode, webhooks, OAuth), Server Actions o Route Handlers en TurnoGol.
---

# Convenciones del stack

## Invariantes globales

- Montos en **centavos ARS, integer**. Nunca decimal ni float.
- Timestamps **UTC en DB**; conversión a ART solo en frontend.
- UUIDs como PK. TypeScript strict, jamás `any`.
- Vocabulario de enums: **`canceled` con una L** (`canceled_refunded`, `canceled_no_refund`). `cancelled` no existe en este repo.
- Turnos de 60 min fijos: `SLOT_DURATION_MINUTES` en `src/shared/constants.ts:8`. El slot 23:00→medianoche se guarda con `time_end='24:00'`. Cierres post-medianoche: usar los helpers de `src/shared/time/operating-day.ts` — nunca reimplementar esa aritmética.
- Mutaciones de UI = **Server Actions**. Route Handlers SOLO para webhooks de MP, `/api/public/*` y auth callbacks.
- **El día NUNCA se deriva en UTC.** `new Date().toISOString().slice(0,10)` devuelve el día siguiente entre las 21:00 y medianoche ART: un default de listado o un bucketing de métricas que pase por ahí salta de día 3 horas por noche. Usar `artTodayStr()` (`@/shared/dates/art`) para "hoy", `artDateOf` (`@/shared/time/art-date`) para el día ART de un instante, u `operatingDateOf` (`@/shared/time/operating-day`) cuando el día es el OPERATIVO del complejo. Bloqueado por ESLint (`no-restricted-syntax`).

## Server Actions y forms

- **Retorno**: `ActionResult` de `@/shared/types/action-result` — `{ success: true } & TExtra | { success: false; error: string }`. Nada de `{ success: boolean; error?: string }`: esa forma no discrimina, deja compilar un fallo sin motivo y termina mostrándole al usuario un error genérico donde había uno real.
- **La action llega por PROP tipada** (`import type`), no por import de valor: importar un módulo `'use server'` desde un componente cliente arrastra drizzle y `node:async_hooks` al bundle del browser y rompe Storybook.
- **Nada de wrapper `ActionForm`**: el patrón del repo es `useActionState` + action por prop + `SubmitButton` de `@/components/ui/submit-button` (`useFormStatus` → deshabilitado + `aria-busy`, evita el doble submit). Los forms de auth tienen botón propio a propósito (sistema visual distinto).
- **El error SIEMPRE se muestra**: un form que descarta el `{ success: false }` deja al usuario apretando Guardar sin feedback. `ConfirmDialog` ya lo hace solo si el handler devuelve el `ActionResult`.

## Efectos externos y transacciones

- Una llamada a MercadoPago, Resend o R2 **NUNCA va adentro de una transacción SQL**. Si la tx aborta después de la llamada, el reintento duplica el efecto externo (pasó: doble reembolso) y encima la conexión queda tomada durante toda la latencia de red. Patrón: preparar en la tx → commitear → llamar afuera → registrar el resultado en una segunda tx (Saga).
- Al revés también: no commitear una escritura local dando por hecho que el efecto externo salió bien (pasó: alta de staff commiteada con el email de invitación fallado).

## Drizzle

- **jsonb**: importar `jsonb` desde `src/shared/db/jsonb.ts`, NUNCA desde `drizzle-orm/pg-core`. El de pg-core doble-codifica con postgres-js y corrompe el dato at-rest (queda string escalar; `columna->>'campo'` devuelve NULL).
- Merge de jsonb en `` sql`` ``: pasar el objeto crudo, NUNCA `JSON.stringify` (mismo doble-encode). Ojo con `||` sobre un array: concatena en vez de reemplazar.
- Subquery correlacionado dentro de `` sql`` `` en `.select()` no califica columnas de la tabla externa → usar LEFT JOIN con tabla derivada.
- **Migraciones**: fuente de verdad `src/shared/db/migrations/NNN_nombre.sql` (numeración secuencial; la última se lee con `ls src/shared/db/migrations | tail -1` — no la fijes acá, un número que se incrementa solo queda viejo y se cita como vigente). Después de crear una: `pnpm db:sync-supabase` genera el espejo en `supabase/migrations/`, y `pnpm supabase:reset` la aplica localmente. NUNCA editar una migración ya existente. Detalle en `docs/operations/MIGRATIONS.md`.

## Multi-tenant / RLS

- Contexto por request (helpers en `src/shared/db/client.ts`, hacen el `SET LOCAL` correcto): staff → `withTenantContext(tenantId, tx => ...)`; jugador → `withPlayerContext(playerId, ...)` (cross-tenant: NO setear tenant_id). Jamás `SET` sin LOCAL.
- **Defensa en profundidad**: además de RLS, SIEMPRE filtro explícito `WHERE tenant_id = ...` / `WHERE player_id = ...`. En dev la app conecta como superusuario → RLS no aplica y el filtro explícito es la única barrera (así se cerraron leaks reales de revenue cross-tenant).
- **Workers/jobs**: nunca `getDb()` — usar `getWorkerDb()`/`getWorkerSql()` (pool con `WORKER_DATABASE_URL`, rol BYPASSRLS) para barridos cross-tenant. Una mutación sobre UN tenant conocido vuelve por `withTenantContext` en el pool normal. **Bloqueado por ESLint** en `src/shared/jobs/**` (bloque `turnogol/jobs-worker-pool`), porque el modo de falla es silencioso: el pool de la app no tira error, devuelve cero filas y el job reporta éxito.
- **Roles staff**: el rol NUNCA sale del JWT. Guards de `src/modules/staff/guards.ts`: `requireOperatorStaff()` (admin+manager: grilla, reservas, caja, jugadores) y `requireAdminStaff()`/`requireAdminStaffAction()` (solo admin: configuración, equipo, MP/facturación).
- **Checklist tabla tenant-aislada nueva**: columna `tenant_id` + policy RLS + `FORCE ROW LEVEL SECURITY` + DELETE manual en `src/shared/jobs/workers/data-retention-cleanup.worker.ts` (el wipe NO cascadea: el tenant se soft-anonimiza, no se borra la fila) + caso en `tests/integration/isolation.test.ts`.
- Nunca exportar helpers de servidor desde un archivo `'use client'`: vitest pasa igual y revienta solo en runtime real.

## pg-boss

- Workers en `src/shared/jobs/workers/`, nombres de cola en `src/shared/jobs/queue-names.ts`, proceso con `pnpm jobs:start`.
- Todo job debe ser idempotente (webhooks deduplican vía `processed_webhooks` / idempotency keys en cash_flows).
- Efectos con horario (push en madrugada 00–08): patrón `startAfter` de `src/modules/notifications/push-quiet-hours.ts`, nunca sleep.

## MercadoPago

- Dev/E2E: `MP_MOCK_MODE=1` en `.env.local` activa `LocalMockGateway` (`src/modules/payments/mock-mp.ts`) → checkout local en `/mock-mp/checkout`, webhook procesado inline sin pg-boss. Hard-gated a no-producción: no intentar "arreglar" ese gate.
- NUNCA llamar la API real de MP desde tests ni dev. Replay manual de webhooks: `pnpm webhook:replay`.
- Webhooks entrantes verifican firma HMAC en `src/modules/payments/webhook-auth.ts` (gotcha: `data.id` va en minúsculas al construir el manifest).
- Llamadas salientes pasan por `withCircuitBreaker` (`src/modules/payments/mp-breaker.gateway.ts`) — no bypassearlo con un fetch directo.
- Tokens OAuth por tenant (`mp_access_token`/`mp_refresh_token`) están cifrados at-rest y el cifrado es la ÚNICA barrera (tabla `tenants` es global, sin RLS). Jamás loguearlos ni devolverlos en payloads.
