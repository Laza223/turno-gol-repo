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

## Plata en la UI

- **Todo campo de monto es `MoneyInput`** (`@/components/ui/money-input`), nunca un `type="number"` suelto: pesos enteros, separador de miles mientras se tipea y relectura en palabras arriba de `MONEY_WORDS_THRESHOLD_CENTS`. El parseo vive en `@/lib/money` y es la única fuente.
- **El campo se reformatea en CADA tecla, así que el parser tiene que sobrevivir a strings a medio tipear** — no alcanza con que parsee bien el string final. (pasó: `parsePesosToCents` borraba todo lo no-dígito, así que la coma se comía en el acto y los dígitos de los centavos se pegaban al entero en la tecla siguiente: `1500,50` terminaba valiendo $150.050. Afectaba los 7 campos de plata del admin, incluido el precio de cancha, que publicaba el error 100× en el portal público. El test que lo agarra tipea tecla por tecla; los que parseaban el string entero pasaban en verde.)
- **Desambiguación es-AR**: el último separador es decimal solo si lo siguen 0, 1 o 2 dígitos; con 3 es grupo de miles (`35,000` son treinta y cinco mil). El caso de CERO dígitos es el instante en que se acaba de tipear la coma y es tan importante como los otros.
- **Escribir en un día de caja ya cerrado exige `type='adjustment'`** vía `allowClosedDay` en `CreateCashFlowInput`, y ninguna Server Action lo expone. Ver `docs/decisions/2026-08-28-sena-cobrada-con-la-caja-cerrada.md`. (pasó: el `catch` de `DayAlreadyClosedError` avisaba al dueño pero no escribía nada, así que la reserva decía "pagada" y la plata no figuraba en Caja.)
- **Saltear el chequeo de cierre no es saltear `assertDayOpen`**: ahí adentro está el `pg_advisory_xact_lock` que serializa contra un `closeDailyRegister` concurrente. Pasarle el flag, no evitar la llamada.
- **El cash_flow de la seña tiene TRES emisores, no uno**: `recordManualBookingDepositCashFlow` (booking.service.ts), `recordManualDepositCashFlow` y `recordDepositCashFlow` (payment.service.ts). Están duplicados a propósito, así que un arreglo en uno NO llega a los otros — listarlos con `grep -rn "depositCashFlowDescription" src/` antes de dar por cerrado cualquier bug de señas. (pasó: el fix de la caja cerrada tapó una sola de las tres puertas y se dio por cerrado; las otras dos siguieron tirando la plata al vacío hasta que un barrido de la clase las encontró.)
- **Un `mockRejectedValue` pelado sobre el colaborador que falló también hace fallar el camino de recuperación**, y el test rojo parece un bug del fix. El mock tiene que imitar la REGLA, no el resultado: `mockImplementation` que rechaza sólo mientras no venga el flag de escape. (pasó: `createCashFlow` mockeado con `mockRejectedValue(new DayAlreadyClosedError())` rechazaba también la escritura del ajuste, que es justo lo que el caso prueba.)

## Rutas públicas y status HTTP

- **Un `loading.tsx` cubre su segmento Y todo lo que cuelga debajo.** Abre un `<Suspense>`, Next arranca a streamear con el 200 ya en los headers, y cualquier `notFound()` posterior cambia el cuerpo pero no el status: soft-404 indexable. Un `layout.tsx` queda fuera del boundary de SU segmento, **no del de un ancestro**. (pasó dos veces: primero con las pages de `/{slug}/*`, arreglado moviendo el gate a `[slug]/layout.tsx`; después con un gate en `[slug]/torneos/layout.tsx`, que seguía adentro del boundary del `loading.tsx` del perfil. La salida fue encerrar la page del perfil y su skeleton en un grupo `(perfil)`, que no cambia la URL y deja a cada hermano decidiendo su status.)
- **El status se mide, no se deduce**: `fetch(url, {redirect:'manual'})` repetido, y con control negativo (la misma URL en la condición contraria). Un cuerpo que dice "no encontrado" no prueba que el status sea 404, y una sola medición puede caer del lado bueno por timing de compilación.

## Server Actions y forms

- **Retorno**: `ActionResult` de `@/shared/types/action-result` — `{ success: true } & TExtra | { success: false; error: string }`. Nada de `{ success: boolean; error?: string }`: esa forma no discrimina, deja compilar un fallo sin motivo y termina mostrándole al usuario un error genérico donde había uno real.
- **La action llega por PROP tipada** (`import type`), no por import de valor: importar un módulo `'use server'` desde un componente cliente arrastra drizzle y `node:async_hooks` al bundle del browser y rompe Storybook.
- **Nada de wrapper `ActionForm`**: el patrón del repo es `useActionState` + action por prop + `SubmitButton` de `@/components/ui/submit-button` (`useFormStatus` → deshabilitado + `aria-busy`, evita el doble submit). Los forms de auth tienen botón propio a propósito (sistema visual distinto).
- **El error SIEMPRE se muestra**: un form que descarta el `{ success: false }` deja al usuario apretando Guardar sin feedback. `ConfirmDialog` ya lo hace solo si el handler devuelve el `ActionResult`.

## Efectos externos y transacciones

- Una llamada a MercadoPago, Resend o R2 **NUNCA va adentro de una transacción SQL**. Si la tx aborta después de la llamada, el reintento duplica el efecto externo (pasó: doble reembolso) y encima la conexión queda tomada durante toda la latencia de red. Patrón: preparar en la tx → commitear → llamar afuera → registrar el resultado en una segunda tx (Saga).
- Al revés también: no commitear una escritura local dando por hecho que el efecto externo salió bien (pasó: alta de staff commiteada con el email de invitación fallado).
- **Un `try/catch` agregado a un middleware que compone DENTRO de `withTenantContext`/`withPlayerContext` convierte un throw en un valor resuelto, y `db.transaction` hace COMMIT en vez de ROLLBACK** aunque el handler haya fallado a mitad de una escritura multi-paso — sin ningún cambio visible en la respuesta al cliente, así que no lo delata ningún test que solo mire el body HTTP. El catch de "loguear + devolver `internal()`" solo es seguro en la capa que envuelve la llamada a `withTenantContext(...)` DESDE AFUERA (ahí el rollback de Drizzle ya corrió antes de que la excepción llegue al catch) — nunca en una capa intermedia que corre adentro de esa tx (`with-role.ts` es justo eso: compone siempre dentro de `withTenant`). Antes de agregar un catch a cualquier wrapper de `src/server/middleware/`, verificar con `grep -n "withTenantContext\|withPlayerContext" src/server/middleware/*.ts` cuál de los dos lados de la tx es. (pasó: 2026-09-02, ver `docs/gtm/ejecucion/10-aprendizajes.md` — un fix de mensajes de error le agregó try/catch a los 4 wrappers por igual; un revisor adversarial de contexto fresco lo agarró antes de mergear, corrigiéndolo solo en `with-role.ts`.)

## Drizzle

- **jsonb**: importar `jsonb` desde `src/shared/db/jsonb.ts`, NUNCA desde `drizzle-orm/pg-core`. El de pg-core doble-codifica con postgres-js y corrompe el dato at-rest (queda string escalar; `columna->>'campo'` devuelve NULL).
- Merge de jsonb en `` sql`` ``: pasar el objeto crudo, NUNCA `JSON.stringify` (mismo doble-encode). Ojo con `||` sobre un array: concatena en vez de reemplazar.
- Subquery correlacionado dentro de `` sql`` `` en `.select()` no califica columnas de la tabla externa → usar LEFT JOIN con tabla derivada.
- **Migraciones**: fuente de verdad `src/shared/db/migrations/NNN_nombre.sql` (numeración secuencial; la última se lee con `ls src/shared/db/migrations | tail -1` — no la fijes acá, un número que se incrementa solo queda viejo y se cita como vigente). Después de crear una: `pnpm db:sync-supabase` genera el espejo en `supabase/migrations/`, y `pnpm supabase:reset` la aplica localmente. NUNCA editar una migración ya existente. Detalle en `docs/operations/MIGRATIONS.md`.
- **Drizzle 0.45 envuelve todo error de postgres-js en `DrizzleQueryError`: `code`/`constraint_name` viajan en `err.cause`, nunca en `err`.** Un `catch` que mira `err.code` en el nivel superior nunca ve un 23505/23503 si el INSERT que falló vino de `.insert(tabla).values().returning()` (query builder) — sí lo ve si vino de `tx.execute(sql\`...\`)` crudo, porque ahí no hay wrapping. Helper único que camina la cadena de `cause`: `isUniqueViolation`/`isForeignKeyViolation` en `src/shared/db/pg-errors.ts` (movido de `modules/tournaments/` acá porque ya lo usan 2+ módulos). (pasó dos veces: primero en tournaments, cazado por un test de integración y no por el typecheck; después en `cashflow/daily-close.service.ts` — el mismo patrón naive sobrevivió sin que nadie lo mirara hasta la campaña de mutación de 2026-09-03, porque el test que lo debía agarrar solo afirmaba "4 de 5 fallaron", no CON QUÉ error.)

## Multi-tenant / RLS

- Contexto por request (helpers en `src/shared/db/client.ts`, hacen el `SET LOCAL` correcto): staff → `withTenantContext(tenantId, tx => ...)`; jugador → `withPlayerContext(playerId, ...)` (cross-tenant: NO setear tenant_id). Jamás `SET` sin LOCAL.
- **Defensa en profundidad**: además de RLS, SIEMPRE filtro explícito `WHERE tenant_id = ...` / `WHERE player_id = ...`. En dev la app conecta como superusuario → RLS no aplica y el filtro explícito es la única barrera (así se cerraron leaks reales de revenue cross-tenant). (pasó: 2026-09-03, campaña de mutación — el patrón "INSERT ... ON CONFLICT (client_idempotency_key) DO NOTHING" + SELECT de fallback para recuperar la fila apareció 6 veces sin `AND tenant_id = ...` — `cashflow.service.ts` y sus dos gemelos en `canteen-tab.service.ts`/`canteen-sale.service.ts` — porque el índice único de `client_idempotency_key` es GLOBAL, no por tenant: al copiar el patrón de un módulo a otro, el WHERE se copió incompleto las tres veces.)
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
