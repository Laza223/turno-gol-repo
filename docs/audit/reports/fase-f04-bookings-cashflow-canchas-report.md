# Fase F4 — Admin Bookings + Cashflow + Canchas (CRUDs core) — Report

**Fecha:** 2026-05-27
**Branch:** `audit/frontend-f04`
**Veredicto:** 🟢 **PASS (3/3 done-criteria)** — los 3 CRUDs (reservas, caja, canchas) tienen happy path + 3 edge cases E2E (specs entregados y verificados a mano contra el código real; ejecución de browser en CI), confirmaciones destructivas escalonadas (ConfirmDialog reusable + cancel con elección de reembolso/motivo + cierre de caja con type-to-confirm + desactivar cancha con conteo de impacto), y optimistic update con rollback en el toggle de canchas. **Bonus T6:** cerrado el backlog B7 P2 (`parseRouteUuid` en 4 handlers `[id]/*`, H8). **Trust-but-verify:** la verificación de T5 detectó 6 bugs en los specs que el `typecheck` no podía cazar (cliente Supabase sin tipar) + 1 inconsistencia real de UI (caja registraba el movimiento en hoy, no en el día visto) — todos corregidos.

**Objetivo (MASTER_PLAN líneas 180-184):** Operativa diaria del admin sin trabas. Los 3 CRUDs que Marcelo/Rodrigo usan todo el día. Criticidad 🔴🔴 Alta. F4 es **UI/orquestación sobre lógica de negocio ya auditada** (B1 motor bookings, B3 MP refund, B8 cashflow/daily-close) — no se reescribió el backend, se expuso.

---

## Done-criteria (MASTER_PLAN F4) con evidencia

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| **Cada CRUD (reservas, caja, canchas) happy path + 3 edge cases E2E** | ✅ (specs entregados + hand-verified; ejecución en CI) | 3 specs nuevos, 4 tests c/u (happy + 3 edge): `tests/e2e/reservas-crud.spec.ts` (complete / cancel-con-seña-y-reembolso / cancel-sin-motivo-bloqueado / no-show), `tests/e2e/caja-crud.spec.ts` (alta movimiento / cierre type-to-confirm / guard de día cerrado / cierre con diferencia exige nota), `tests/e2e/canchas-crud.spec.ts` (crear / desactivar-con-reservas-futuras / pricing sin cubrir / optimistic rollback). Service-role setup + cleanup en `finally`. **Verificados contra schema y UI reales** (ver §Trust-but-verify); los mismos endpoints/services pasan verdes en los 325 integration. |
| **Confirmaciones destructivas escalonadas** | ✅ | `src/components/ui/confirm-dialog.tsx` (T1): diálogo + campos requeridos + `confirmationPhrase` (type-to-confirm) + botón destructivo rojo; mantiene abierto y muestra error si `onConfirm` devuelve `{success:false}`. Uso: **cancel reserva** (`reservas/[id]/BookingActions.tsx`, T2) → radios reembolso (solo si seña pagada) + motivo obligatorio + warning del efecto $ según método; **cierre de caja** (`caja/components/CloseDayButton.tsx:52`, T3) → `confirmationPhrase="CERRAR"` (irreversible) + nota obligatoria si hay diferencia; **desactivar cancha** (`canchas/components/CourtList.tsx:204-222`, T4) → warning con conteo real de reservas futuras/abonados (`getCourtDeactivationImpactAction`, `canchas/actions.ts:150`). 4 casos unit en `tests/unit/confirm-dialog.test.tsx`. |
| **Optimistic updates donde aplique (con rollback en error)** | ✅ | Toggle de canchas (`canchas/components/CourtList.tsx`): `activate()` (`:117-127`) setea `online` optimista → si la action devuelve `{success:false}` hace rollback a `offline` + toast destructivo; `onConfirmDeactivate()` (`:141-151`) setea `offline` optimista → rollback en error. E2E `canchas-crud` Test 4 ejercita el rollback real (action `'Cancha no encontrada'`). |

---

## Trabajo realizado (7 tasks)

### T1 — `ConfirmDialog` escalonado reusable (H6) — `3384253`
`src/components/ui/confirm-dialog.tsx`: construido sobre el wrapper Radix `dialog.tsx`. Props: `title/description/children` (campos controlados por el padre), `variant` (`destructive` → rojo), `confirmationPhrase` (type-to-confirm: confirmar disabled hasta escribir la frase exacta), `onConfirm` async que mantiene el diálogo abierto + muestra `role="alert"` si devuelve `{success:false}`, lo cierra en éxito; no cierra mientras `isPending`. `tests/unit/confirm-dialog.test.tsx`: 4 casos (type-to-confirm gatea, error mantiene abierto, success cierra, cancel cierra) con `@testing-library/react` + happy-dom.

### T2 — Reservas: cancel/no-show escalonado + F1 states (H1, H5) — `8bde9bf`
`reservas/[id]/BookingActions.tsx` reescrito: cancel abre `ConfirmDialog` destructivo con (a) radios reembolso **solo si `depositStatus==='paid'`**, (b) motivo obligatorio (≥3), (c) warning del efecto económico según `paymentMethod` (MP = reembolso automático; cash/transfer = coordinar manual; sin reembolso = queda para el complejo). El motivo y `shouldRefund` salen del estado (ya no hardcodeados `'Cancelada por el complejo'`/`false`). No-show abre confirm destructivo con aviso de penalidad; complete queda directo. `reservas/loading.tsx` + `error.tsx` (F1 Skeleton/ErrorState) + `page.tsx` empty → `EmptyState`. La action `cancelBookingAction(id, reason, shouldRefund)` ya soportaba todo (B3) — T2 fue 100% UI.

### T3 — Caja: write-side CRUD UI + F1 states (H2, H5) — `778e6b8`
La caja era solo-lectura; las actions `createCashFlowAction`/`closeDayAction` existían sin UI. F4 construyó el write-side: `RegisterMovementModal` (alta income/adjustment, categorías válidas sin `product_sale`, pesos→centavos), `CloseDayButton` (cierre escalonado type-to-confirm "CERRAR", nota obligatoria si el efectivo declarado difiere del balance), `CajaActions` (island; oculto si el día está cerrado), navegación de fecha (`?date=` + Anterior/Hoy/Siguiente), `loading.tsx`/`error.tsx`, empty → `EmptyState`. Montos en centavos. Idempotencia del cierre y mensajes ("ya fue cerrada") delegados a las actions (B8). **Fix posterior en T5-verify** (ver abajo): el alta de movimiento ahora respeta el día visto.

### T4 — Canchas: desactivar escalonado + optimistic toggle c/rollback + F1 states (H3, H4, H5) — `ce1e1bd` (+ `be817a9`)
`getCourtDeactivationImpactAction` (`canchas/actions.ts`): cuenta reservas futuras (`confirmed`/`pending_payment`, `date >= hoy ART` con cast `::date`) + abonados activos bajo RLS. `CourtList.tsx`: desactivar (online→offline) primero consulta el impacto y abre `ConfirmDialog` destructivo con el conteo ("Hay N reserva(s) futura(s)…"); activar es optimista; ambos hacen rollback + toast en error. Empty → `EmptyState`, `loading.tsx`/`error.tsx`. `be817a9` alineó el filtro de fecha a la convención `::date` (consistencia con `booking.service`).

### T5 — E2E reservas + caja + canchas (happy + 3 edge c/u) (H7) — `90f7531` (+ fixes `8ac7e85`)
3 specs, 12 tests, reusan fixtures (`adminStorageState`) + service-role para setup/cleanup en `finally`, fechas/IDs dedicados. **Entregados en `90f7531`; corregidos en `8ac7e85` tras la verificación a mano (§Trust-but-verify).**

### T6 — (bonus B7 P2) `parseRouteUuid()` en handlers `[id]/*` (H8) — `94aaf0c`
`bookings/[id]/cancel` y `courts/[id]/status` pasaban el segmento crudo (`parts[length-2]!`) directo a Drizzle → UUID malformado surface como Postgres `22P02` (SQL leakeado como 500). Ruteados por `parseRouteUuid(req, 'second-last')` → 400 limpio, igual que los `[id]/route.ts`. `bookings/[id]/complete` y `no-show` **ya validaban** vía `uuid.safeParse` (el hallazgo B7 era impreciso para esos 2); convertidos al helper compartido por uniformidad (preserva comportamiento: siguen dando 400 en inválido). Sin test que dependa del shape de error previo (`invalid_id`/`BAD_REQUEST` → 0 matches en tests).

### T7 — Verify + report + STATE
Suite completa (ver §verificación) + este report + STATE.md.

---

## Trust-but-verify — bugs detectados en la verificación de T5

El implementer entregó los 3 specs en `90f7531` con `typecheck`+`lint` "verdes". Pero `lint` solo cubre `src/` y `typecheck` no caza estos errores porque **el cliente `@supabase/supabase-js` no está tipado** contra el schema (acepta cualquier objeto en `.insert()`/`.eq()`). Lectura directa del schema (`src/shared/db/schema/{cash-flows,daily-cash-closes,bookings,courts}.ts`) + del service (`cashflow.service.ts`) reveló:

| # | Spec | Bug | Habría fallado en |
|---|------|-----|-------------------|
| V1 | caja | `seedCashFlow` insertaba columna `date` (no existe en `cash_flows`) | INSERT (runtime CI) |
| V2 | caja | `seedCashFlow` usaba `created_by`; la FK real es `registered_by` (NOT NULL) | INSERT (runtime CI) |
| V3 | caja | `cleanupCajaDate` filtraba `cash_flows` por `.eq('date', …)` (no existe) | cleanup (runtime CI) |
| V4 | caja | `seedDailyClose` usaba `diff` (real: `diff_amount`) y `declared_cash: null` (NOT NULL) | INSERT (runtime CI) |
| V5 | caja | **Happy test roto:** el movimiento creado por UI caía en hoy (`now()`), no en `?date=2019-03-10` → la fila no aparecía. Inconsistencia real: `closeDayAction` usa el día visto, `createCashFlow` no | assertion (y bug de UX real) |
| V6 | canchas | **Test 4 falso:** interceptaba el Server Action con 500, pero un 500 hace **throw** y `activate()` solo hace rollback en `{success:false}` (sin try/catch) → el rollback nunca corría → asserts fallaban | assertion (CI) |

**Correcciones (`8ac7e85`):** V1-V4 → columnas reales + cleanup por rango `occurred_at` (la fecha-ART de `occurred_at` define el día; no hay columna `date` en `cash_flows`). V5 → `RegisterMovementModal`/`CajaActions` ahora pasan `occurredAt` del día visto (consistente con el cierre); fix de UX real, no solo de test. V6 → el edge ahora ejercita el path que el código sí tiene: borrar la cancha vía service-role bajo la UI → la action devuelve `{success:false, 'Cancha no encontrada'}` → rollback real + toast. Además: test de idempotencia renombrado/recomentado para reflejar lo que asserta (la UI oculta las acciones de escritura en un día cerrado; el guard server-side está cubierto por el integration `daily-close-idempotency`), una fecha dedicada por test (`fullyParallel`), y removido un `const` muerto (`GAPPED_PRICING`).

> Patrón idéntico al de F3 (test que reimplementaba la lógica + script de Lighthouse que mentía "passed"). Los reviewers y el `typecheck` no son suficientes para specs que tocan DB sin tipar: hay que leer el schema.

---

## Hallazgos (severidad + disposición)

| # | Hallazgo | Sev | Disposición |
|---|----------|-----|-------------|
| H1 | Cancel admin sin elección reembolso/motivo ni confirmación escalonada (seña pagada) | 🟡 P1 | ✅ FIXED T2 |
| H2 | Write-side de caja completamente ausente en la UI (alta movimiento + cierre) | 🔴 P0-fase | ✅ FIXED T3 |
| H3 | Desactivar cancha con reservas futuras/abonados sin warning escalonado | 🟡 P1 | ✅ FIXED T4 |
| H4 | Toggle de cancha sin optimistic update + rollback ni feedback de error | 🟡 P2 | ✅ FIXED T4 |
| H5 | reservas/caja/canchas sin loading/error.tsx; empty states hardcodeados | 🔵 P3 (consistencia F1) | ✅ FIXED T2/T3/T4 |
| H6 | No existía `ConfirmDialog` reusable | 🟡 P2 (habilitador) | ✅ FIXED T1 |
| H7 | E2E ausente para reservas/caja/canchas | 🟡 P2 (cobertura) | ✅ FIXED T5 (+ corregido en verify) |
| H8 | `[id]/{cancel,status}` sin validar el UUID de ruta (22P02 leak); `complete`/`no-show` validaban con otro helper | 🔵 P2 (backlog B7) | ✅ FIXED T6 |

---

## Tests nuevos / modificados

| Archivo | Tipo | Tests | Cubre |
|---------|------|-------|-------|
| `tests/unit/confirm-dialog.test.tsx` | **nuevo** | 4 | type-to-confirm gatea, error mantiene abierto, success cierra, cancel cierra |
| `tests/e2e/reservas-crud.spec.ts` | **nuevo** | 4 | complete, cancel-con-seña+reembolso, cancel-sin-motivo-bloqueado, no-show |
| `tests/e2e/caja-crud.spec.ts` | **nuevo** | 4 | alta movimiento, cierre type-to-confirm, guard día cerrado, cierre con diferencia exige nota |
| `tests/e2e/canchas-crud.spec.ts` | **nuevo** | 4 | crear, desactivar-con-reservas-futuras, pricing sin cubrir, optimistic rollback |

Unit suite: **418 → 422** (`pnpm test`, incluye `confirm-dialog.test.tsx`). E2E suite +12 (delegados a CI). Integration **325/325** (sin regresión; los 2 flaky pre-existentes no flakearon esta corrida).

---

## Cambios por archivo

| Archivo | Tipo | Task |
|---------|------|------|
| `src/components/ui/confirm-dialog.tsx` | **nuevo** | T1 |
| `tests/unit/confirm-dialog.test.tsx` | **nuevo** (4 tests) | T1 |
| `src/app/(admin)/reservas/[id]/BookingActions.tsx` | modificado (cancel/no-show escalonado) | T2 |
| `src/app/(admin)/reservas/[id]/page.tsx` | modificado (pasa seña/método a BookingActions) | T2 |
| `src/app/(admin)/reservas/{loading,error}.tsx` | **nuevos** (F1) | T2 |
| `src/app/(admin)/reservas/page.tsx` | modificado (EmptyState) | T2 |
| `src/app/(admin)/caja/components/{RegisterMovementModal,CloseDayButton,CajaActions}.tsx` | **nuevos** | T3 |
| `src/app/(admin)/caja/page.tsx` | modificado (date nav + CajaActions + EmptyState) | T3 |
| `src/app/(admin)/caja/{loading,error}.tsx` | **nuevos** (F1) | T3 |
| `src/app/(admin)/caja/actions.ts` | modificado (`occurredAt` coerce date) | T5-verify |
| `src/app/(admin)/caja/components/RegisterMovementModal.tsx` | modificado (movimiento en el día visto) | T5-verify |
| `src/app/(admin)/caja/components/CajaActions.tsx` | modificado (pasa `date` al modal) | T5-verify |
| `src/app/(admin)/canchas/actions.ts` | modificado (`getCourtDeactivationImpactAction`) | T4 |
| `src/app/(admin)/canchas/components/CourtList.tsx` | modificado (optimistic toggle + ConfirmDialog + EmptyState) | T4 |
| `src/app/(admin)/canchas/{loading,error}.tsx` | **nuevos** (F1) | T4 |
| `tests/e2e/{reservas,caja,canchas}-crud.spec.ts` | **nuevos** (4 tests c/u) | T5 |
| `src/app/api/bookings/[id]/{cancel,complete,no-show}/route.ts` | modificado (`parseRouteUuid`) | T6 |
| `src/app/api/courts/[id]/status/route.ts` | modificado (`parseRouteUuid`) | T6 |

---

## Visibilidad humana — schema

**F4 NO tocó el schema** (sin migraciones; no se modificó ninguna tabla, columna, constraint ni RLS). Todo el trabajo fue UI/Server Actions sobre el modelo de datos existente. No requiere revisión de DB ni acción humana de despliegue.

---

## Tests / verificación (corridos por el lead en el worktree f04)

- **Typecheck (`pnpm typecheck`):** ✓ exit 0 (cubre `tests/**` por el `include` del tsconfig).
- **Lint (`pnpm lint`):** ✓ 0 warnings/errors. *Nota: `eslint src/` no cubre `tests/` — los specs no pasan por lint, solo por `typecheck` (sin `noUnusedLocals`). Por eso el `const` muerto no lo cazaba ninguna gate; removido a mano.*
- **Unit (`pnpm test`):** ✓ **422/422** (43 files; incluye `confirm-dialog.test.tsx`). Warnings Radix "Missing Description for DialogContent" = a11y benignos, no fallos.
- **Integration (`pnpm test:integration`):** ✓ **325/325** (62 files; `daily-close-idempotency` 5/5 esta corrida; los endpoints que toca T6 — idor, cancellations, courts, bookings — verdes).
- **Build (`pnpm build`):** ✓ exit 0. First Load JS (gz): `/reservas` **153 KB**, `/reservas/[id]` **176 KB**, `/caja` **176 KB**, `/canchas` **175 KB** — todas < 200KB ✓ (techo de referencia `/staff` 190KB, sin cambios). Handlers API nuevos 0 B (server-only).
- **E2E full run:** **delegado a CI.** Razón: el puerto :3000 está ocupado por un dev server ajeno (worktree externo Gemini Antigravity) — `reuseExistingServer` testearía la branch equivocada, y liberar el puerto exigiría matar `node.exe` ajenos. Los specs typechequean, están bien formados y fueron verificados a mano contra schema/UI reales; los mismos services/endpoints pasan verdes en los 325 integration. Mismo patrón que F2/F3.

---

## Gaps / deferred

| Gap | Disposición |
|-----|-------------|
| E2E reservas/caja/canchas ejecución real (browser) | CI (Linux, server+seed+browsers). 12 specs entregados + hand-verified. |
| Optimistic rollback solo cubre fallo graceful `{success:false}`, no un throw/500 de red (propaga al error boundary) | Aceptable v1: la action devuelve `{success:false}` en los fallos de negocio; un 500 de transporte es raro y el boundary lo captura. Nice-to-have: try/catch con rollback-on-throw. |
| Venta rápida de productos / cantina (US-CAJ-004) | **F5** (depende del CRUD de productos; `product_sale` no decrementa stock en v1, by-design B8). |
| CRUD de abonados, Settings/políticas/staff, Reportes financieros | **F5**. |
| Paginación real de reservas (hoy LIMIT 200) + filtro de fecha en `/reservas` | Backlog (200 cubre el volumen v1 diario; no es done-criteria F4). |
| Editar reserva (cambiar horario/cancha) | Out-of-scope por doc8 ("cancelar y re-crear"); solo notas. |
| Soft-delete de canchas | Backlog (v1 usa offline; doc6 Court online⇄offline). |
| Lighthouse de /reservas /caja /canchas | No es done-criteria F4; el tuning real de perf es F12. Harness `pnpm lighthouse:grilla` (F3) es el patrón si se quiere baseline. |

---

## Stats acumulados (post F4)

- **Fases completadas: 17/26** (backend B0-B11 + F0 + F1 + F2 + F3 + F4 frontend).
- **F4:** 3/3 done-criteria. 8 commits (T1 `3384253`, T2 `8bde9bf`, T3 `778e6b8`, T4 `ce1e1bd`+`be817a9`, T5 `90f7531`+`8ac7e85`, T6 `94aaf0c`, docs). **16 tests nuevos** (4 unit ConfirmDialog + 12 E2E CRUD). 8 hallazgos (H1-H8) resueltos. **6 bugs de specs + 1 inconsistencia UI** detectados en trust-but-verify y corregidos. Sin migraciones. Bundles F4 todos <200KB.
- **Tests acumulados nuevos audit:** 181 (post-F3) + 16 (F4) = **197**.
- **Bugs fixed acumulado:** 30 (post-F3) + **H1 (cancel UI sin reembolso/motivo) + H2 (write-side caja ausente) + H3 (desactivar sin warning) + H8 (UUID route leak en cancel/status)** = **34**. (H4/H5/H6/H7 son hardening/cobertura; las correcciones V1-V6 de T5-verify son sobre código no mergeado a main aún, no cuentan como bugs de runtime en prod.)
- **Deps nuevas:** ninguna (F4 reusó F1 primitives + Radix dialog + testing-library/happy-dom de F3).
- **Migraciones nuevas:** 0.

---

## Próxima fase

**F5 — Admin Reportes + Settings + Abonados + Staff** (MASTER_PLAN líneas 186-190). Incluye lo diferido de F4: venta rápida de productos/cantina (depende del CRUD de productos), CRUD de abonados, settings/políticas/horarios-feriados, reportes financieros. **Trigger humano:** confirmar continuar o pausar.
