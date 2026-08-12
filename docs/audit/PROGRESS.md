# Auditoría TurnoGol — Progreso

## Estado: EN CURSO
**Inicio:** 2026-06-30
**Objetivo:** Veredicto go/no-go para lanzamiento en ~2 semanas
**Focos:** (1) Aislamiento multi-tenant, (2) Caja/plata correcta, (3) Deuda técnica/bugs

### Entrevista de alineación (2026-06-30, antes de retomar Capa 2)
- **Lanzamiento:** soft — pocos tenants piloto conocidos, hay margen para ajustar sobre la marcha (no es un hard deadline con clientes ya comprometidos).
- **Mayor miedo:** que un flujo crítico (reserva/pago/cancelación) se rompa y deje trabado a jugador o admin. NO es el miedo principal la fuga cross-tenant ni un error de caja (aunque siguen siendo focos).
- **Criterio de éxito:** go/no-go priorizado por severidad — está bien cerrar con hallazgos menores pendientes, no hace falta cero-críticos ni cobertura total de las 6 capas para considerar la auditoría exitosa.
- **Orden de trabajo confirmado:** terminar Capa 2 (docs) antes de pasar a Capa 3.
- **Implicancia:** priorizar dentro de Capa 3-6 lo que toca flujos críticos (reserva/pago/cancelación) por sobre hallazgos cosméticos; los "REQUIERE INPUT" de negocio se consolidan y se preguntan juntos al final de Capa 2 en vez de interrumpir doc por doc.

## Capas
- [/] Capa 1 — Schema vs Código (completada parcialmente en sesión anterior con Opus 4.8)
- [x] Capa 2 — Documentación vs Código (19/19 docs, 82 hallazgos confirmados totales, 3 BLOQUEANTES: 2-43, 2-53, 2-76 — ver audit_report.md)
- [x] Capa 3 — Reglas de negocio y permisos (22 hallazgos confirmados, 6 BLOQUEANTES — manager puede tocar MP OAuth/billing SaaS/seña/horarios/canchas por falta de chequeo de rol; staff desactivado conserva acceso API indefinido — ver audit_report.md)
- [x] Capa 4 — Dead code (140 candidatos de knip, 10 agentes de verificación, 0 BLOQUEANTES/severidad uniforme BAJA — ver audit_report.md grupos 1-5)
- [x] Capa 5 — Consistencia de patrones (57 candidatos, 53 confirmados/4 refutados, 1 hallazgo 🟠 C5-G3 — ver audit_report.md)
- [ ] Capa 6 — Seguridad (RLS/Auth)

## Hallazgos pendientes de decisión (REQUIERE INPUT)
<!-- Los que necesitan intervención del dueño del producto -->
- Capa 4 grupo 4 (5 items sin veredicto mecánico: PremiumCard/table.tsx sin adoptar, boilerplate shadcn sin consumidor, getAvailableSlotsCached sin cablear, processSingleNotification, runRequestObservability) — ver audit_report.md.
- Capa 5 restante en backlog (ver audit_report.md): SA-09 (billing huérfano), SA-08 (favorites/reviews vía fetch), SA-10 (push unsubscribe/test), C5-G1/G2 (guards ad-hoc), F1-F7+DATE-01..16 (ART/fechas duplicadas), L5-LABELS-01/03 + naming F1-F9 (cosmético). C5-G3, L5-LABELS-02 y la "Shadow API" (6 clusters) ya se aplicaron — ver "Fixes aplicados".

## Fixes aplicados automáticamente
- D1: open_matches/open_match_status eliminados del CLAUDE.md (migr. 028 ya los había borrado)
- D2+D3: read_only quitado del doc + manager corregido a restringido (decisión: sin config/equipo)
- D4: doc9 marcado como eliminado, bullet borrado
- D5: deposit_mode (inexistente) → requires_deposit + deposit_percentage
- E1: campo settings.booking_advance_days agregado al texto de anticipación
- Fix tipo: court.types.ts surfaceType string → SurfaceType
- Fix test: grid-cells.test.ts fixture 'cesped' → 'synthetic_grass'
- **Capa 3 — causa raíz #1 (rol no revalidado) y #2 (staff desactivado con acceso indefinido), 2026-07-01:**
  - `with-tenant.ts`: `withTenant`/`withBillingTenant` ahora aceptan `{roles}` y SIEMPRE revalidan `getStaffRole()` (isActive + rol) antes de entrar al handler — fixea 3-01 (staff desactivado) para toda la superficie `/api/{bookings,cash-flows,courts,abonados,billing}`.
  - `with-role.ts`: `withRole()` comparaba contra `user.role` (hardcodeado a `'admin'` en el JWT, nunca rechazaba) → ahora usa `getStaffRole()` real. Fixea 3-14 (`/api/admin/metrics`).
  - Admin-only agregado (antes solo exigían sesión de staff, sin rol): `api/billing/{subscribe,upgrade,downgrade,cancel,reactivate,subscription}` (3-07/3-16), `api/mp/oauth-start` + `api/mp/callback` (3-04/3-08/3-15/3-17, además el callback ahora revalida que el staff autenticado sea admin del MISMO tenant del `state`, no solo la firma HMAC), `api/courts/*` POST/PATCH (3-18), `settings/reservas/actions.ts` (`updateReservasPolicyAction`, 3-05), `settings/horarios/actions.ts` (3 actions, 3-06/3-19), `canchas/page.tsx` + `canchas/actions.ts` (4 actions — **decisión propia:** hice todo /canchas admin-only, replicando el patrón ya usado en /settings, en vez de solo bloquear crear/editar precio y dejar el toggle online/offline operator-level; si el manager necesita apagar canchas en el día a día, avisame y lo separo).
  - `abonados/actions.ts`: reemplacé el `requireStaffTenant()` local (mismo agujero que canchas) por `requireOperatorStaff()` compartido — sigue siendo admin+manager, ahora sí revalida `is_active`.
- **4 P0 arquitectónicos (Fable 5), 2026-07-02:**
  - **TTL unificado**: `payment.service.ts` tenía `DEPOSIT_TIMER_MINUTES=15` para el `expires_at` de MP, más largo que el hold real (`DEFAULT_EXPIRY_SECONDS=6min`) — la preferencia de MP quedaba viva después de que el hold ya liberó el slot. Ahora `expiresAt` se deriva de `DEFAULT_EXPIRY_SECONDS` con buffer de 60s antes del hold (piso de 30s para no mandar una fecha pasada a MP en un retry tardío).
  - **Pagos diferidos excluidos**: `createPreference` (mp-gateway.implementation.ts) ahora manda `payment_methods.excluded_payment_types` con `ticket`/`atm`/`bank_transfer` — en vez de sostener una ventana de 48hs para `in_process` (nunca se llegó a implementar, solo estaba en un comentario), directamente se excluyen los métodos que la producen.
  - **Saga en `createDepositPayment`**: la llamada HTTP a MP estaba adentro de la misma tx que el `SELECT...FOR UPDATE` del booking. Ahora: tx1 (valida + INSERT payments pending + UPDATE booking) → commit → `gateway.createPreference` sin tx abierta → tx2 (UPDATE payments.mp_preference_id). Firma cambió de `(bookingId, gateway, tx, appUrl)` a `(bookingId, gateway, tenantId, appUrl)` — actualizados los 2 call sites (`reservar/actions.ts`) + 4 tests.
  - **DSN dual para workers (RLS)**: los cron jobs (`dunning-retry`, `data-retention-cleanup`, `generate-abonado-slots`, `expire-trials`, `auto-complete-bookings`, `reconcile-pending-payments`, `expire-pending-booking`/`booking.expiry.ts`, `send-email`, `push`) hacían scans cross-tenant con `getSql()`/`getDb()` (rol de `DATABASE_URL`) sin `SET LOCAL app.current_tenant_id` — bajo el rol restringido que `launch-check.ts` exige para la app (`bypassrls role check`, fatal), esos scans devuelven 0 filas en producción bajo RLS+FORCE (los tests pasan porque el rol local es `postgres` superuser). Nuevo `getWorkerSql()`/`getWorkerDb()` en `client.ts` (env `WORKER_DATABASE_URL`, fallback a `DATABASE_URL`) para los scans/mutaciones cross-tenant; las mutaciones de un tenant conocido pasaron a `withTenantContext` normal. Nueva aserción de arranque `assertWorkerDbVisibility()` (falla si el rol worker no tiene BYPASSRLS) llamada desde `run-workers.ts`, más un step nuevo en `launch-check.ts` (`worker bypassrls role check`, fatal) que exige lo inverso al check de la app — sin `WORKER_DATABASE_URL` configurado en el deploy, launch-check no puede pasar los dos checks a la vez.
  - **Pendiente para el humano**: configurar `WORKER_DATABASE_URL` en staging/producción (rol con `BYPASSRLS`, distinto del rol de la app) — no pude tocar `.env.example`/`.env.staging.example` (bloqueados por permisos de la sesión).
  - Verificación: `pnpm typecheck` ✅, `pnpm lint` ✅ (mismos 9 errores pre-existentes fuera de scope), `pnpm test` 1354/1356 ✅ (2 fails pre-existentes confirmados con `git stash`), `pnpm test:integration` 538/543 ✅ (5 fails pre-existentes confirmados con `git stash`, mismo root cause: `extractRealAuthUser`/`cache is not a function`), `pnpm test:isolation` 101/101 ✅.
  - Tests: agregué mocks de `getStaffRole`/`extractAuthUser` a `middleware.test.ts` (los 2 tests de `withRole` testeaban un escenario que no podía pasar en producción — `user.role` nunca es distinto de `'admin'`) y a `mp-oauth-state-csrf.test.ts` (rompía por completo al no mockear la nueva revalidación de sesión) + 4 tests nuevos para 3-15 (sin sesión, tenant ajeno, manager, membresía inactiva).
  - Verificación: `pnpm typecheck` limpio, `pnpm lint` sin errores nuevos (5 preexistentes en archivos que no toqué), `pnpm test` 1397/1399 verde (2 fallas preexistentes sin relación: hover de popover en `booking-grid.test.tsx`, link "Explorar" en `ingresar-page.test.tsx` — ninguna toca auth/permisos, no las toqué).
  - **Pendiente sin tocar** (no estaba en el alcance aprobado): 3-09/3-20 (FORCE ROW LEVEL SECURITY en reviews/player_favorites/push_subscriptions/feature_flags, requiere migración nueva), 3-02/3-03/3-21/3-22 (Zod admite 0 donde la DB exige >0), 3-10 (jugador puede loguearse como staff por error), 3-13 (mensaje de error crudo en /api/status).
- **Capa 3 — ronda 2: Opción B canchas + 3-10 + 3-13, 2026-07-01:**
  - **Decisión del usuario sobre 3-18: Opción B** — el manager SÍ puede activar/desactivar canchas (lluvia/mantenimiento), pero NO crear ni editar precio/nombre. `canchas/page.tsx`: `requireAdminStaff()` → `requireOperatorStaff()` (redirect a `/dashboard` si `!auth.ok`), pasa `isAdmin={role==='admin'}` a `CourtList`. `CourtList.tsx`/`CourtCard`: nuevo prop `isAdmin` oculta "+ Nueva cancha" (ambas instancias, incluida la del `EmptyState`) y "Editar"; el toggle Activar/Desactivar queda siempre visible. `canchas/actions.ts`: `toggleCourtStatusAction` y `getCourtDeactivationImpactAction` → `requireOperatorStaff()` (antes `requireAdminStaffAction()`); `createCourtAction`/`updateCourtAction` sin cambios (admin-only). `api/courts/[id]/status/route.ts`: quité `{roles:['admin']}` (default de `withTenant` ya es admin+manager); `api/courts/route.ts` POST y `api/courts/[id]/route.ts` PATCH sin cambios (admin-only).
  - **3-10 (jugador se loguea como staff):** `login/actions.ts` → `loginAction` chequea `is_player` en `app_metadata`/`user_metadata` (mismo criterio que `extractRealAuthUser` en `auth.middleware.ts:25`) justo después de `signInWithPassword`; si es jugador, `supabase.auth.signOut()` de esa sesión recién creada + mensaje genérico, sin llegar a `provisionAndRouteStaff`. No toqué `forgot-password`/`reset-password` (siguen sin filtrar por tipo de cuenta, pero ya no importa: el password de un jugador no sirve para entrar como staff).
  - **3-13 (/api/status expone error crudo):** `status/route.ts` — `checkDb`/`checkPgBoss`/`checkUpstash` loguean con `captureException` (de `@/lib/sentry`) y devuelven `error: 'No se pudo verificar.'` en vez de `(err as Error).message`. `status`/código HTTP sin cambios (el monitor de uptime sigue funcionando igual).
  - **3-09/3-20 (FORCE RLS):** NO tocado — requiere migración SQL, el usuario la va a hacer él mismo. Anotado en `audit_report.md` con el `ALTER TABLE ... FORCE ROW LEVEL SECURITY` exacto a agregar, siguiendo el patrón de `021_force_row_level_security.sql`.
  - **Fix colateral inesperado:** `tests/unit/middleware.test.ts:126` (`beforeEach(() => vi.mocked(getStaffRole).mockReset())`) rompía `pnpm typecheck` (TS2322: la expresión devuelve el mock, que TS interpreta como un `HookCleanupCallback` de 0 args, pero el mock tipado espera 2 args) — no lo había introducido yo en esta ronda, apareció al re-typechequear el estado ya commiteado; lo envolví en bloque `{ }` para que no devuelva nada.
  - Verificación: `pnpm typecheck` limpio (tras el fix de `middleware.test.ts`), `pnpm lint` 5 errores preexistentes sin relación (mismos de siempre: `settings/facturacion/page.tsx`, `explorar/SearchBar.tsx`, `BookingCard.tsx`, `HeroSearch.tsx`, `date-picker.tsx`), `pnpm test` 1397/1399 (mismas 2 fallas preexistentes: hover popover en `booking-grid.test.tsx`, link "Explorar" en `ingresar-page.test.tsx`).
  - No se tocó 3-02/3-03/3-21/3-22 (Zod vs DB): el usuario no lo incluyó en el pedido de esta ronda, sigue pendiente en `audit_report.md`.
- **Capa 4 — aplicación Grupos 1+2+3, 2026-07-01:**
  - Grupo 3: `pnpm remove @radix-ui/react-select nanoid tslib` (0 dependientes en el repo).
  - Grupos 1+2 (52 archivos, borrado completo de símbolos sin ningún uso + remoción de `export` en símbolos usados solo internamente): aplicado vía 7 lotes en paralelo, cada uno re-verificando con grep antes de tocar. 0 discrepancias.
  - Fallout encontrado y corregido: borrar `reviewsPageResponseSchema` dejó huérfanos `ratingSummaryResponseSchema`/`publicReviewItemResponseSchema` en `review.schema.ts` (rompían lint `no-unused-vars`) — los borré también.
  - Ajustes de alcance esperables (imports que quedaron sin uso tras un borrado, no son scope creep): `auth.service.ts`, `payment.schema.ts`, `with-tenant.ts`, `format.ts`.
  - Verificación: `pnpm typecheck` limpio al primer intento, `pnpm lint` mismos 9 errores preexistentes (0 nuevos), `pnpm test` 1396/1398 (mismas 2 fallas preexistentes; el total bajó en 1 test porque enumeraba símbolos ahora borrados, no es regresión).
  - Grupo 4 (5 items) queda en backlog por decisión del usuario — ver audit_report.md.

## Intentos fallidos (fix reverted)
<!-- Cambios que rompieron typecheck/lint y fueron revertidos -->

## Log de sesiones
### Sesión 1 — 2026-06-29 (Opus 4.8)
- Auditoría de CLAUDE.md vs código: 5 discrepancias corregidas (D1-D5)
- Capa 1 parcial: 14 hallazgos de schema (columnas/tablas sin uso), pendientes de decisión drop/implementar
- Type-drift: 1 fix aplicado, 2 falsos positivos descartados

### Sesión 2 — 2026-06-30/07-01 (Sonnet 5, Método Karpathy)
- Auditoría completa con ultracode + verificación adversarial
- Foco: multi-tenant, caja/plata, deuda técnica, go/no-go
- Entrevista de alineación antes de retomar Capa 2 (ver arriba)
- Capa 2 cerrada (19/19 docs): fan-out doc4/7/8/18/19/20 + verificación adversarial, 61 agentes, 55 candidatos → 54 confirmados, 1 refutado (falso positivo: código muerto). 3 BLOQUEANTES (2-43 sin UI de billing self-service, 2-53 bug real de cancelación si el refund MP falla, 2-76 retención/anonimización ARCO no implementada). 6 decisiones de negocio consolidadas pendientes de tu input en audit_report.md.
- Sin fixes de código aplicados esta ronda (todo lo encontrado en Capa 2 es doc-vs-código o requiere decisión de negocio/diseño, no typos obvios)
- Capa 3 cerrada (7 áreas en paralelo + verificación adversarial, 30 agentes, 23 candidatos → 22 confirmados, 1 refutado). **6 BLOQUEANTES**, la mayoría un mismo patrón: rutas/actions que solo validan "sesión de staff" sin revalidar el rol real (`admin` vs `manager`) contra la DB — permite a un manager conectar/reemplazar MercadoPago del tenant (riesgo de fraude real), cancelar la suscripción SaaS, apagar la seña, cambiar horarios y crear canchas. Además: staff desactivado conserva acceso de escritura indefinido en toda la superficie `/api/{bookings,cash-flows,courts,abonados}`. Sin fixes aplicados (requieren tu confirmación de criterio, ver "Decisiones — REQUIERE TU INPUT" en audit_report.md).
- Sin cortes por session limit en esta ronda (Capa 2: 61 agentes/2.9M tokens; Capa 3: 30 agentes/2.1M tokens, ambos corrieron completos)
- Ronda 2 de fixes Capa 3 (2026-07-01): decisión Opción B para canchas (3-18, manager sí puede toggle online/offline), + 3-10 (jugador-como-staff) y 3-13 (error crudo en /api/status) resueltos. 3-09/3-20 (FORCE RLS) documentado para migración del usuario, sin tocar. Verificación completa verde.
- Capa 4 cerrada (2026-07-01): `npx knip` (30 archivos + 3 deps + 77 exports + 56 tipos + 1 duplicate) → workflow de 10 agentes verificando cada candidato contra falsos positivos conocidos (barrels, referencias string/config, tipos usados solo inline) + 1 retry por corte de session limit (batch exports-3, recuperado sin pérdida vía resumeFromRunId). 0 fallas en el retry. Clasificado en 5 grupos (audit_report.md): Grupo 1 borrado completo seguro (~17 items), Grupo 2 sacar `export`/barrel redundante (~35 items, riesgo cero), Grupo 3 deps npm sin uso (@radix-ui/react-select, nanoid, tslib), Grupo 4 REQUIERE INPUT (5 items: PremiumCard/table.tsx sin adoptar, boilerplate shadcn, getAvailableSlotsCached sin cablear, processSingleNotification, runRequestObservability), Grupo 5 falsos positivos confirmados (SurfaceType, RevenueMetric — NO tocar, dan forma a tipos ampliamente usados). Severidad uniforme 🟢 BAJA, 0 BLOQUEANTES.
- Aplicados Grupos 1+2+3 de Capa 4 (2026-07-01, ver detalle arriba en "Fixes aplicados"): 52 archivos + 3 deps npm. Grupo 4 en backlog por decisión del usuario. Verificación completa verde.
- Capa 5 cerrada (2026-07-01): 8 áreas en paralelo + verificación adversarial, 65 agentes (2 rondas por 2 cortes de session limit, ambos recuperados sin pérdida vía resumeFromRunId), 57 candidatos → 53 confirmados, 4 refutados. Hallazgo destacado 🟠 C5-G3 (endpoint super-admin `admin/jobs` sin el triple-chequeo de revocación de `requireSystemAdmin()`, misma familia que causa raíz #2 de Capa 3). Root causes: "Shadow API" — 7 clusters de Route Handlers (`bookings`, `courts`, `abonados`, `cash-flows`, `player/bookings`, `player/profile`, `billing`) duplicando Server Actions sin ningún caller real, ya divergidos en manejo de errores y con huecos de cobertura CSRF; conversión ART reimplementada 6+ veces en el backend (`artDateAt`/`timeToMins`/`addDays`/SQL crudo, con una divergencia real ya activa entre `metrics.service.ts` y `cashflow.service.ts` sobre la misma tabla de plata); STATUS_LABELS duplicados con 1 bug de UX real (jugador ve "expired" en inglés en `/mis-reservas`). Sin fixes aplicados, esperando tu input (8 decisiones en audit_report.md).
- Fix Shadow API aplicado — cluster `courts` (2026-07-01): confirmado con grep fresco (fetch() en todo `src/**/*.tsx` + búsqueda de imports en `src/**/*.ts`) que ningún componente real llama a `/api/courts*`; borrados `src/app/api/courts/route.ts` (GET+POST), `src/app/api/courts/[id]/route.ts` (GET+PATCH) y `src/app/api/courts/[id]/status/route.ts` (PATCH) — los 3 duplicaban `createCourtAction`/`updateCourtAction`/`toggleCourtStatusAction` de `canchas/actions.ts` sin ningún caller. Carpetas vacías resultantes (`[id]/status`, `[id]`, y `courts/` con solo un `.gitkeep` legacy sin propósito) también borradas. `tests/integration/api-adversarial-uuid.test.ts` quedó con 0 tests tras esta limpieza (el cluster `bookings`, en paralelo, ya había sacado sus casos de `/api/bookings/[id]`) — borrado el archivo entero. `pnpm typecheck` y `pnpm lint` verdes (lint tiene 9 errores preexistentes en archivos no tocados por este fix: `facturacion/page.tsx`, `SearchBar.tsx`, `BookingCard.tsx`, `HeroSearch.tsx`, `date-picker.tsx` — fuera de scope del cluster courts). Server Actions de `canchas/actions.ts` intactas.
- **Capa 5 — fixes aplicados 2026-07-01 (resto de la ronda):**
  - **C5-G3:** `system-admin.guards.ts` exporta ahora `resolveSystemAdmin()` (antes privado); `api/admin/jobs/route.ts` lo usa en vez del chequeo ad-hoc `extractAuthUser()+type==='system_admin'` — ahora sí revalida fila activa en `system_admins` + allowlist antes de responder.
  - **L5-LABELS-02:** `mis-reservas/page.tsx` — `STATUS_LABELS`/`STATUS_CLASSES` suman la clave `expired` ('Expirado') y separan `canceled_refunded`/`canceled_no_refund` en textos distintos, igual que las 2 vistas admin.
  - **Shadow API, clusters restantes** (`bookings`, `abonados`, `cash-flows`, `player/bookings`, `player/profile` — `courts` ya se había hecho, ver arriba): 5 agentes en paralelo, cada uno reverificó con grep fresco antes de borrar. Preservados intactos `GET /api/bookings` (polling real, `use-booking-realtime.ts`) y `GET /api/player/bookings/[id]/status` (`PaymentStatusWatcher.tsx`) — el resto de cada cluster (incluidos varios GETs que se asumía sobrevivían pero resultaron también sin caller: `/api/bookings/[id]`, `/api/abonados`, `/api/cash-flows`, `/api/player/bookings`, `/api/player/bookings/[id]`, `/api/player/profile`) se borró completo. Tests ajustados: `idor-admin-cross-tenant.test.ts` borrado completo (testeaba solo handlers ahora muertos), `player-booking-window.test.ts` borrado (su cobertura de BK-04 ya existe en `booking-time-validation.test.ts`), `idor-player-bookings.test.ts` recortado preservando el caso de `/status`, `api-adversarial-uuid.test.ts` terminó de vaciarse (ya lo había dejado en 0 tests el cluster courts) y se borró.
  - **Fallout:** `zod-coverage.test.ts` — `api/bookings/route.ts` (ahora GET-only) sumado al `NO_INPUT_ALLOWLIST` con comentario explicando por qué (query params opcionales, sin schema necesario).
  - **Verificación final:** `pnpm typecheck` limpio, `pnpm lint` mismos 9 errores preexistentes, `pnpm test` 1354/1356 (mismas 2 fallas preexistentes; total bajó por los tests borrados junto con las rutas muertas).
  - **Sin tocar** (backlog por decisión del usuario): SA-08 (favorites/reviews vía fetch), SA-09 (billing huérfano), SA-10 (push unsubscribe/test), C5-G1/G2 (guards ad-hoc), F1-F7+DATE-01..16 (ART/fechas duplicadas), L5-LABELS-01/03 + naming F1-F9.
- EN CURSO: arrancando Capa 6 (Seguridad RLS/Auth) — última capa de la auditoría.

### Sesión — 2026-07-04 (Opus 4.8) — React Doctor top-3 pass
Herramienta nueva: `npx react-doctor@latest` (v0.7.1) — 327 hallazgos. Prompt: arreglar top-3 (no-dynamic-import-path ×1, only-export-components ×13, async-await-in-loop ×24), verificar contra el tool real, no suprimir a ciegas. Triage con 26 subagentes Sonnet (workflow read-only, ~104s): la mayoría del top-3 son FALSOS POSITIVOS. Receta oficial confirma: async-await-in-loop es FP si el loop comparte conexión/tx o depende del orden.
- **Fixes reales (6 sitios, `Promise.all` — SAFE porque pg-boss usa pool propio, no getWorkerSql):** `push.service.ts` (notifyAdminPush + notifyStaffPush, boss.send), `booking.expiry.ts:156` + `mp-webhook.handler.ts:166` + `reconcile-pending-payments.worker.ts:73` (dispatchEmail→boss.send), `dlq.ts:81` (attachFailureHandlers, boss.onComplete → Promise.all con try/catch por queue).
- **Falsos positivos → `doctor.config.mjs` (`ignore.overrides`, rule-scoped):** only-export-components (13 — shadcn cva + helpers puros co-ubicados, DEV-ONLY Fast Refresh, cero impacto usuario); async-await-in-loop (11 FP — loops sobre getWorkerSql compartido / `tx` / orden → `Promise.all` CRASHEA postgres-js, verificado leyendo cada uno); no-dynamic-import-path (1 — build-dist.mjs es script node, no bundle). `dunning-retry.worker.ts:40` con inline `react-doctor-disable-next-line` (archivo mixto: preserva visibles los bounded).
- **Diferido a follow-up (NO suprimido, 6 bounded):** dunning-retry ×5 (126-224) + booking.expiry:181 — cada iteración abre su propia tx (pool max 3) → necesitan bounded-concurrency (p-limit), no `Promise.all`. Es perf, no correctitud.
- **GOTCHA react-doctor 0.7.1:** `ignore.files` está ROTO — `'.design-sync/**'` excluyó ~110 hallazgos de archivos NO relacionados (server-auth-actions 34→0). Usar `ignore.overrides` (rule-scoped, sí respeta `files`+`rules`). Verificar cambios de config comparando dumps `--output-dir` COMPLETOS, NO `--json` (emite la superficie score filtrada, oculta reglas).
- **Verificación:** typecheck verde; mis 7 archivos lintean limpio (lint global sigue con el preexistente `facturacion/page.tsx:37` prefer-const, NO mío — ya figuraba en la lista de 9 lint errors preexistentes); `pnpm test` 1510/1510. Re-run tool real: no-dynamic-import 1→0, only-export 13→0, async-await 24→6 (los 6 bounded diferidos), server-auth-actions 34→34 (cero colateral), total 327→296.

### Sesión — 2026-07-04 (Opus 4.8) — React Doctor batch 2: Accessibility
Batch 2 de los 296 restantes. Categoría Accessibility (38). Security (25) + server-auth-actions (34) NO tocados: territorio de la auditoría en curso (Capa 3/5/6, ya marcados REQUIERE INPUT — no duplicar). Triage: 17 subagentes Sonnet (~71s) → 8 reales, 22 FP, 2 defer (+ phone-input:269 reclasificado a defer: el fix ingenuo mete ~50 tab-stops = peor a11y).
- **Fixes reales (7):** `CourtForm.tsx` wiring `htmlFor`↔`id` (Nombre/Superficie/Formato ×3), `phone-input.tsx:248` aria-label "Buscar país o código", `jugadores/page.tsx:41` aria-label "Buscar jugadores", `ProfileForm.tsx:98` `<label>`→`<span>` (rotulaba un div read-only, no un control).
- **Falsos positivos → `doctor.config.mjs` (9 overrides):** react-doctor lintea en aislamiento y no ve htmlFor por template-literal (StepCourts/AbonadoDialogs/AbonadoCreditLoader/QuickActions/register), patrón ARIA combobox APG (combobox/phone-input listbox+option), primitivos que forwardean (label.tsx, combobox), `<audio>` beep sin diálogo (PushNotificationManager), labels de grupo vía aria-labelledby (BookingFormModal/LeaveReviewButton/BookingGrid). + test-files (`tests/**`).
- **Diferido (3, NO suprimido):** PricingGrid:308 (autoFocus en edición inline = UX correcta), TenantGallery:92 (prefer-html-dialog = Radix→native, arquitectónico), phone-input:269 (necesita keyboard-nav de listbox real).
- **Verificación:** typecheck verde, `pnpm test` 1510/1510, archivos limpios. Re-run tool: Accessibility 38→3, server-auth-actions 34→34 (globs con paréntesis matchean bien), total 296→**261**.

### Sesión — 2026-07-04 (Opus 4.8) — React Doctor batch 3: State/Effect correctness
Batch 3: cluster de correctitud React state/effect (53 findings, 28 archivos). Triage: 28 subagentes Sonnet (~129s) → 2 reales, 37 FP, 13 defer. Confirma que el codebase está bien hecho: casi todo FP.
- **Fixes reales (2, effect-needs-cleanup):** `BookingGrid.tsx:262` (timer del pulso Realtime sin cleanup → leak si llega otra reserva o desmonta) + `phone-input.tsx:152` (setTimeout de focus sin cleanup) → capturar id + `return () => clearTimeout(...)`. 23/23 tests de esos componentes verdes.
- **Falsos positivos → config (14 overrides):** no-initialize-state = patrón SSR `mounted` (lazy-init rompería hydration); no-derived-useState = form-seed-then-edit mount-once; no-derived-state = controlado/no-controlado híbrido; no-fetch-in-effect = polling/geo/session client-only que no puede ir a server (ISR); prefer-useReducer = estilo; rendering-hydration-mismatch-time = año copyright en Server Component. Verificado leyendo cada componente.
- **BACKLOG — refactors genuinos diferidos (NO son FP; se difieren por riesgo de regresión, suprimidos en config con nota):**
  - `HeroSearch.tsx:70` — merge `setCity`+`setPrefilled` en un setState (evita 1 render extra).
  - `BookingFormModal.tsx:79` — dropear el effect que resincroniza `duration`; remontar vía `key={slot.courtId-date-timeStart}` desde BookingGrid.
  - `InviteStaffDialog.tsx:80` — reemplazar el effect-sobre-useFormState por un async wrapper que await-ee la action y llame toast()+onClose() directo.
- **Verificación:** typecheck verde, tests 23/23 (componentes tocados), archivos limpios. Re-run tool: state/effect 53→0, server-auth-actions 34→34 (cero colateral), total 261→**207**.

### Sesión — 2026-07-04 (Opus 4.8) — React Doctor batch 4: Performance
Batch 4: Performance (74; excluidos los 6 async-await-in-loop bounded ya triados en batch 1). Triage: 51 subagentes Sonnet (~4min; 1 retry por bug de `args` que llega como string JSON al Workflow → parse defensivo `typeof args==='string'?JSON.parse:args`). 19 mecánicos, 32 FP, 16 defer.
- **Fixes reales (16):** js-hoist-intl ×11 (hoist `new Intl.NumberFormat/DateTimeFormat` a module scope, se recreaban por render/call: AbonadoCreditLoader, DebtPayment, jugadores/[playerId]/page, jugadores/page, dashboard-helpers ×2, AvailabilityGrid ×2, WeeklyAvailability ×3, BookingPopover), js-combine-iterations ×3 (explorar/page ×2, report.utils — filter+map → una pasada; **gotcha: `for..of Map` exige downlevelIteration, usé `Array.from(map)`**), rerender-lazy-state-init (SearchBar `useState(fn)`→`useState(()=>fn)`), no-usememo-simple-expression (useChartTheme: sacar useMemo inútil + su import).
- **Falsos positivos → config (14 overrides):** js-set-map-lookups (String.indexOf / arrays acotados), js-tosorted-immutable (array ya es copia fresca), js-combine-iterations (2 pasos sobre arrays chicos), async-parallel (getWorkerSql/tx compartido → crash, o pg-boss ya indep), rerender-* (React 18 batchea / el estado sí driva render).
- **BACKLOG (suprimido, worth-doing):** data-export async-parallel (4 SELECTs ARCO → Promise.all, getSql pooled — diferido: solo verificable en integration, no unit); prefer-dynamic-import de charts recharts (MetricsDashboard/ReportCharts, bundle win); PricingGrid anchor useState→useRef.
- **Verificación:** typecheck verde (tras fix Array.from), `pnpm test` 1510/1510. Re-run tool: Performance 74→6 (los 6 bounded async), server-auth-actions 34→34, total 207→**139**.

### Sesión — 2026-07-04 (Opus 4.8) — React Doctor batch 5: Frontend bugs
Batch 5: Bugs de frontend Next.js (15; excluidos los server-* = territorio auditoría). Triage: 12 subagentes Sonnet (~58s) → 6 reales, 6 FP, 3 defer.
- **Fixes reales (6):** Suspense wraps de useSearchParams (explorar/page — QuickFilters+ExplorarToolbar en un boundary + ExplorarFilters en otro; reservas/page — ReservasToolbar), evita el bailout a client-render del route; `<a>`→`<Link>` en abonados/page (ruta interna); `<img>`→`next/image <Image fill sizes>` en TenantCard (coverUrl, host ya en remotePatterns).
- **FP + defer → config (4 overrides):** nextjs-no-a-element facturacion/StepPayments (`/api/mp/oauth-start` = redirect OAuth externo, debe ser `<a>`); no-event-handler ×3 (HeroSearch/date-picker/phone-input — el effect sincroniza estado DESDE el prop, no llama onChange); nextjs-no-img-element image-uploader (blob preview) + AccountMenu (avatar host arbitrario → BACKLOG remotePatterns); nextjs-no-edge-og-runtime (edge intencional).
- **Verificación:** typecheck + lint verdes, `pnpm test` 1510/1510. Re-run tool: Bugs 68→53 (solo server-*), total 139→**124**.

## React Doctor — cierre del barrido mecánico (2026-07-04)
5 batches: **327 → 124** (203 findings resueltos). **39 fixes reales de código** (~28 archivos + `doctor.config.mjs`), ~120 FP/by-design suprimidos con rationale rule-scoped (NUNCA `ignore.files` — está roto en 0.7.1). `server-auth-actions` intacto en 34 en las 5 verificaciones (cero colateral). Todo verde por batch (typecheck + 1510 tests + re-run del tool real). **NADA COMMITEADO.**
Queda (124), todo NO-mecánico o fuera de scope:
- **78 territorio auditoría:** server-auth-actions 34 + server-sequential-independent-await 15 + server-after-nonblocking 4 + Security 25. Ya son BLOQUEANTES/REQUIERE INPUT de Capa 3/5/6 (no duplicar acá).
- **37 Maintainability:** unused-export/unused-file (borrar = OK explícito del usuario), no-multi-comp/no-giant-component (refactors de estructura).
- **9 deferidos (suprimidos en config con nota):** 6 bounded async (p-limit), 3 a11y arquitectónicos (native dialog, listbox keyboard, autofocus inline).
- **Backlog worth-doing (suprimido, documentado acá):** data-export 4 SELECTs→Promise.all; prefer-dynamic-import charts recharts; PricingGrid anchor useState→useRef; 3 refactors state (HeroSearch merge setState, BookingFormModal key-remount, InviteStaffDialog async-wrapper); AccountMenu avatar `<img>`→`<Image>` (+remotePatterns).

### Sesión — 2026-07-04 (Opus 4.8) — React Doctor batch 6: Maintainability (unused-export/unused-file)
Batches 1-5 ya commiteados por el usuario aparte. Batch 6: 14 findings `unused-*` (9 export + 5 file). Triage: 13 investigadores general-purpose en paralelo (~7min, grep exhaustivo: imports directos, barrels, tests, dynamic import, `import type`/`z.infer`, convención Next.js, uso same-file). El usuario autorizó explícitamente borrar código muerto ("borralo tranquilo") pidiendo un listadito previo.
- **Borrados reales (2 archivos):** `src/components/admin/PremiumCard.tsx` + `src/components/admin/table.tsx` — primitives UI abandonados (0 refs; reemplazados por la clase CSS `.card-premium` que usan 19 páginas inline). Resuelve la decisión abierta de auditoría **4-25** ("¿refactorizar las páginas o borrar la duplicación muerta?") hacia borrar. Doc `MASTER.md:347` actualizado (sacado el ref a `PremiumCard`, queda `.card-premium`). Sacado el ref stale a `table.tsx` del override `only-export-components`.
- **Borrados de bloque muerto (2):** `formatDateShort` + su `dateShortFormatter` huérfano (`lib/format.ts:55-65`, 0 refs); re-export `export { InvalidTransitionError }` (`booking.state-machine.ts:77`) — la clase vive intacta en `booking.errors.ts` y todos los consumidores importan de ahí; solo sobraba el re-export.
- **FP arreglados en código (4, sin borrar):** despojada la palabra `export` de símbolos usados SOLO dentro de su propio archivo → `abonadoStatusVisual` (abonados/status-visual:33, usado line 45), `courtStatusVisual` (canchas/status-visual:31, usado 43), `WIZARD_STEPS` (WizardShell:7, usado 49/101), `DEFAULT_COUNTRY` (phone-input:35, usado 42/47/75).
- **REQUIERE INPUT (5, NO borrados, NO suprimidos — dejados visibles para decisión dueño):** son scaffolding con fix pendiente documentado; borrarlos iría CONTRA una corrección planeada.
  - `parseRouteUuid` (`shared/api/route-params.ts`) — helper de **seguridad** F4-T6 (rechaza UUIDs malformados en rutas `[id]`, evita leak de SQL 22P02); referenciado por `zod-coverage.test.ts:71` como vía válida de validación. Pendiente cablear en los `[id]` handlers.
  - `bookingResponseSchema` (`booking.schema.ts:90`) + `cashflow.schema.ts` (`cashFlowResponseSchema`, `daySummaryResponseSchema`) — contratos de output zod escritos pero sin cablear a `validateApiOutput`; finding auditoría **4-04** (endpoints sin validación de output).
  - `openingHoursSchema` (`tenant.schema.ts:11`) — finding **#36** lo quiere cablear en `updateScheduleAction` para validar horarios (bug de horas sin validar). Borrarlo mataría el schema del fix.
  - `runRequestObservability` (`shared/middleware/observability.ts:6`) — infra de observabilidad esperando adopción (grupo 4 auditoría / fase-b10).
- **1 FP cosmético NO silenciable:** react-doctor marca su propia `doctor.config.mjs` como `unused-file` y NO aplica `ignore.overrides` a su config file → el override no lo apaga. Inofensivo, documentado en el config.
- **Verificación:** typecheck 0 (filtrado audit-f02), mis 6 archivos lint 0 (el único rojo de lint es `facturacion/page.tsx:37` prefer-const, PRE-EXISTENTE ajeno, sin diff vs HEAD), `pnpm test` **1510/1510**. Re-run tool real: `unused-export` 9→3, `unused-file` 5→3, total **124→116**, `server-auth-actions` intacto en 34.

### Sesión — 2026-07-04 — TICKET 2: validadores huérfanos (item 1/5 — `parseRouteUuid`)
Verificación previa (paso 1 protocolo-fixes): universo real = 32 `route.ts`, solo 3 con segmento dinámico. 2 de los 3 (`[slug]`, `[tenantId]`) ya validan bien vía `{ params }` + schema/regex propios — no aplica `parseRouteUuid` (firma pathname-based) sin refactor, decisión del usuario: afuera de este ticket. El único candidato real era `player/bookings/[id]/status/route.ts`, que ya validaba (con `uuid.safeParse` inline duplicando la lógica del helper) — **no había 500 sin proteger**, el hallazgo real era duplicación/orfandad, no vulnerabilidad activa.
- **Fix aplicado:** `src/app/api/player/bookings/[id]/status/route.ts` — reemplazado el parseo manual (`req.nextUrl.pathname.split('/').at(-2)` + `uuid.safeParse` + `badRequest` inline) por `parseRouteUuid(req, 'second-last')`. Mismo comportamiento (400 `INVALID_ID`), saca imports `badRequest`/`uuid` sin uso.
- **Verificación:** typecheck ✅, lint del archivo tocado 0 (lint global sigue con el mismo `facturacion/page.tsx:37` preexistente, confirmado con `git stash` que ya estaba en `main` limpio), `pnpm test` **1510/1510**.
- **Pendiente item 1:** ninguno — `parseRouteUuid` ya no es huérfano (1 call site real).

### Sesión — 2026-07-04 — TICKET 2: validadores huérfanos (items 2-3/5 — `bookingResponseSchema` + `cashFlowResponseSchema`)
Verificación previa: doc15 documenta mutaciones de booking/cashflow como Route Handlers REST, pero el código real las implementa como Server Actions (`reservas/actions.ts`, `caja/actions.ts`) — divergencia doc-vs-código ya conocida, no bug nuevo. `validateApiOutput` es agnóstico de transporte (solo `schema.safeParse` + log warn, nunca throw), así que aplica igual sobre el payload de una Server Action.
- **Fix aplicado (`bookingResponseSchema`, 5 sitios en `reservas/actions.ts`):** `createBookingAction`, `confirmDepositPaymentAction`, `completeBookingAction`, `markNoShowAction`, `cancelBookingAction` — agregado `validateApiOutput(bookingResponseSchema, { data: result.booking }, '<actionName>')` en el branch `if (result.success)`, antes del revalidate. Campo por campo `BookingRow` calza 1:1 con el schema, cero drift esperado.
- **Fix aplicado (`cashFlowResponseSchema`, 1 sitio en `caja/actions.ts`):** antes de cablear, `cashflow.schema.ts:11-26` (`cashFlowRowResponseSchema`, `.strict()`) le faltaba el campo `abonadoId` que sí existe en `CashFlowRow` (agregado con la feature de saldo de abonados) → hubiera disparado falso "contract_mismatch" en cada llamada. Agregado `abonadoId: uuid.nullable()` al schema. Después, wiring en `createCashFlowAction`: `validateApiOutput(cashFlowResponseSchema, { data: result.cashFlow }, 'createCashFlowAction')`. `category` del schema sigue sin `'abonado_payment'` a propósito — el input schema de esta action ya restringe a los mismos 4 valores, ese category se crea por otro path (carga de saldo abonado), no por acá.
- **Verificación:** typecheck ✅, lint archivos tocados ✅ (0), `pnpm test` **1510/1510**, `tests/integration/cashflow.test.ts` **17/17**. `push-test-endpoint.test.ts` (2 fails, 403 vs 200) confirmado PRE-EXISTENTE vía `git stash` en `main` limpio — sin relación con este diff, no bloqueante.
- **Borrado (item 3, OK explícito del usuario):** `daySummaryResponseSchema` — `getDaySummary()` solo se consume desde Server Components (`caja/page.tsx`, `dashboard/queries.ts`), nunca es una respuesta HTTP → no hay dónde cablear `validateApiOutput` con sentido. Borrado junto con `dailyCashCloseResponseSchema` (const privada, único consumidor era el schema borrado, quedaba huérfana igual). `cashflow.schema.ts` queda con `cashFlowResponseSchema` (ahora cableado) como único export de output.
- **Verificación borrado:** typecheck ✅, lint ✅, `pnpm test` **1510/1510**, `cashflow.test.ts` **17/17**.
### Sesión — 2026-07-04 — TICKET 2: validadores huérfanos (items 4-5/5 — cierre)
- **`openingHoursSchema` (`tenant.schema.ts:11-19`) — NO REPRODUCE, borrado.** Finding #36 (horarios invertidos sin validar) ya estaba resuelto por `horariosSchema` (`src/modules/tenants/opening-hours.schema.ts:95`, del rediseño horarios+precios 89b652a + Día Operativo migr.035) — sí valida `cierre > apertura` por día vía `superRefine`/`isValidDayRange`, aware de `closesNextDay`. `updateScheduleAction` (`onboarding/actions.ts:131`) usa ese, nunca el viejo. `openingHoursSchema` (solo regex de formato, sin coherencia de rango, sin noción de día operativo) tenía 0 imports reales en `src` — cablearlo hubiera sido regresión (rechaza/acepta mal horarios de madrugada). Borrado con OK explícito del usuario; `createTenantSchema` (mismo archivo) queda intacto.
- **`runRequestObservability` (`shared/middleware/observability.ts:6`) — sin tocar, por decisión.** Ya evaluado en auditoría previa (finding **4-29**, `audit_report.md:397`): *"infra deliberada esperando adopción, no descuido... dejar como está (no es hallazgo real)"* (fase-b10-observabilidad-report.md). Adoptarlo implicaría envolver los 32 route handlers — retrofit grande, explícitamente fuera de scope B10. Usuario confirmó respetar la decisión vieja: no tocar.
- **Verificación borrado openingHoursSchema:** typecheck ✅, lint ✅, `pnpm test` **1510/1510**.

## TICKET 2 — CERRADO 100% (5/5 validadores huérfanos revisados)
| # | Validador | Resultado |
|---|---|---|
| 1 | `parseRouteUuid` | Cableado en `player/bookings/[id]/status/route.ts` |
| 2 | `bookingResponseSchema` | Cableado en 5 Server Actions de `reservas/actions.ts` |
| 3 | `cashFlowResponseSchema` | Fix de schema (`abonadoId` faltante) + cableado en `createCashFlowAction`; `daySummaryResponseSchema`+`dailyCashCloseResponseSchema` borrados (sin surface HTTP posible) |
| 4 | `openingHoursSchema` | Borrado — NO REPRODUCE, finding #36 ya resuelto por `horariosSchema` |
| 5 | `runRequestObservability` | Sin tocar — decisión de auditoría previa (4-29), retrofit grande fuera de scope |

Nada commiteado. Archivos tocados: `src/app/api/player/bookings/[id]/status/route.ts`, `src/app/(admin)/reservas/actions.ts`, `src/app/(admin)/caja/actions.ts`, `src/modules/cashflow/cashflow.schema.ts`, `src/modules/tenants/tenant.schema.ts`.

---

## Ticket 3 — Mantenibilidad estructural (react-doctor: no-giant-component + no-multi-comp) — 2026-07-04

**Alcance aprobado:** 2 peores infractores (1 por regla). Resto queda como follow-up.

### Fix 1 — BookingGrid (no-giant-component, 559 → orquestador ~120 líneas)
- Hooks extraídos → `src/hooks/`: `use-persisted-density.ts`, `use-dismissible-hint.ts`, `use-realtime-pulse.ts`, `use-grid-layout.ts`, `use-now-line.ts`.
- Subcomponentes extraídos → `src/components/booking/grid/`: `GridToolbar.tsx`, `GridScroller.tsx`, `GridLegend.tsx`, `FirstBookingHint.tsx`, `MorningCollapseBand.tsx`.
- `BookingGrid.tsx` conserva export público + re-export `GridBooking` + `BookingFormModal`. Cero cambio de comportamiento/API.

### Fix 2 — HorariosForms (no-multi-comp, 3 comps → 3 archivos)
- Split limpio → `HorariosForm.tsx`, `AddClosedDateForm.tsx`, `RemoveClosedDateForm.tsx` (misma carpeta). `HorariosForms.tsx` eliminado.
- Importers actualizados: `settings/horarios/page.tsx`, `tests/unit/horarios-forms.test.tsx`. Sin barrels.

### Verificación
- `pnpm typecheck` ✅
- Lint de archivos tocados (`src/`) ✅. Tests: `booking-grid` 13, `grilla-date-param` 3, `use-booking-realtime` 7, `horarios-forms` 4 → todos verdes.
- Re-scan react-doctor: no-giant-component 4→3 (BookingGrid eliminado), no-multi-comp 8→6 (HorariosForms eliminado; restan solo `.design-sync/previews/*` = FP tooling). Ningún subcomponente nuevo quedó giant.

### Pendiente / no tocado
- **PRE-EXISTENTE arreglado (con OK del usuario):** `src/app/(admin)/settings/facturacion/page.tsx:37` — `let mpConnected` (solo lectura, líneas 103/109) → `const`. Venía de a377479, rompía el gate. Fix de 1 línea. `bash scripts/audit-verify.sh` ahora 🟢 completo (typecheck + lint + **1510 tests**).
- **Follow-up giants:** SupportActionsPanel (426), StepCourts (386), PricingGrid (309).
- **Config:** agregar override `no-multi-comp` para `.design-sync/previews/**` en `doctor.config.mjs` (FP tooling).

Nada commiteado.

---

## Ticket 3 (cont.) — SupportActionsPanel (no-giant-component) — 2026-07-04

**Fix — SupportActionsPanel (426 → orquestador ~110 líneas)**
- Compartidos → `_components/support-actions/`: `constants.ts` (tipos + STATUS_LABELS + consts de clases), `FeedbackText.tsx`, `SectionCard.tsx` (separados en archivos propios para NO reintroducir no-multi-comp; el sketch original los ponía juntos en shared.tsx).
- 7 secciones → archivo propio: `ForceStatusSection`, `ReactivateSection`, `ExtendTrialSection`, `ChangePlanSection`, `SettingsSection`, `ResetPasswordSection`, `CancelSection`. Cada una dueña de su estado local + feedback.
- Parent conserva `Props` idéntico + re-export `SupportPanelSettings`; un único `useTransition`/`run` compartido baja como prop `pending`+`run` (mismo comportamiento: todos los botones se deshabilitan durante cualquier acción).
- Importer `page.tsx` intacto (mismo entry + tipo). Sin tests que dependan del panel.

### Verificación
- `bash scripts/audit-verify.sh` 🟢 completo: typecheck + lint + **1510 tests**.
- Re-scan react-doctor: no-giant-component 3→2 (SupportActionsPanel fuera). Ningún archivo nuevo quedó giant ni multi-comp.

### Cola restante
- **Giants:** StepCourts (386), PricingGrid (309).
- **Config:** override `no-multi-comp` para `.design-sync/previews/**` en `doctor.config.mjs` (FP tooling, único no-multi-comp restante = 6).

---

## Ticket 3 (cont.) — StepCourts + config design-sync (no-giant-component / no-multi-comp) — 2026-07-04

**Config — `doctor.config.mjs`**
- Override `no-multi-comp` para `.design-sync/previews/**` (fixtures de preview del tooling: co-ubican varias muestras por archivo a propósito; fuera de `src/`, no shippea). Re-scan: no-multi-comp **6→0**.

**Fix — StepCourts (386 → orquestador ~90 líneas)**
- Subcarpeta `src/app/onboarding/components/step-courts/` (self-contained, hook incluido por decisión del dueño):
  - `constants.ts` — `FORMATS`, `SURFACE_OPTIONS`, tipos `SurfaceType`/`Draft`, helper puro `minPrice()`.
  - `use-court-drafts.ts` — hook: estado de drafts (`drafts`/`expandedKeys`/`nextKey`) + `toggleExpand`/`expand`/`updateDraft`/`addDraft`/`removeDraft` + derivado `canRemove`.
  - `CourtDraftCard.tsx` — tarjeta por-draft (fila-resumen colapsable + form inline). El grueso de las líneas.
  - `ExistingCourtsList.tsx` — lista read-only de canchas ya creadas.
- Parent `StepCourts.tsx`: misma ruta + export + `Props`. Retiene `handleSubmit`/`handleBack` (transitions + Server Actions `createWizardCourtsAction`/`setWizardStepAction`) y estado `error`; submit fuerza `expand(d.key)` en el draft inválido.
- Importer `onboarding/page.tsx:12` intacto. Sin tests que toquen internals.

### Verificación
- `bash scripts/audit-verify.sh` 🟢 completo: typecheck + lint + **1510 tests**.
- Re-scan react-doctor: no-giant-component **2→1** (sólo PricingGrid), no-multi-comp **0**. Ningún archivo nuevo quedó giant ni multi-comp.

### Cola restante
- **Giant:** PricingGrid (309) — último de `src/`.

Nada commiteado.

---

## Ticket 3 (cont.) — PricingGrid (no-giant-component) — 2026-07-04

**Fix — PricingGrid (309 → orquestador ~85 líneas)**
- Subcarpeta `src/app/(admin)/canchas/components/pricing-grid/`:
  - `cell-utils.ts` — puros (sin JSX): `cellKey`/`parseCellKey` (encode/decode de clave celda) + `heatStyle` + rampas HEAT_*.
  - `use-cell-selection.ts` — hook: modelo de interacción (selección click/arrastre/Shift, modo bloque, edición inline, asignación masiva) + `setCells`/`rectCells` + pointerup effect. Recibe la grilla controlada (`grid`/`onGridChange`), nunca muta precios propios.
  - `PricingGridToolbar.tsx` — barra: modo selección + barra bulk + hint.
  - `PricingGridTable.tsx` — matriz día×hora (headers + celdas heat map + editor inline). El grueso de las líneas.
- Parent `PricingGrid.tsx`: misma ruta + export + `Props`. Compone hook + toolbar + tabla; retiene `useTheme`/`isDark`, memos `hours`/`priceStats`, early-return `hours.length===0`.
- Importers intactos: `PricingSection.tsx:24` + `tests/unit/pricing-grid-render.test.tsx:5`. Comportamiento y aria-labels (`Lun 08:00` / `Precio Lun 08:00`) preservados exactos → test verde sin tocarlo.

**Config — parity de FP reubicados**
- `no-aria-hidden-on-focusable`: el `<td aria-hidden>·</td>` (inactiva, no focuseable — FP verificado) se mudó a `PricingGridTable.tsx`; el override glob `**/PricingGrid.tsx` no lo matcheaba → extendido con `**/PricingGridTable.tsx`. Re-suprimido, count 0.
- `no-autofocus` (editor inline, autofocus deliberado): preexistente y VISIBLE (nunca suprimido) en PricingGrid.tsx:308 → ahora PricingGridTable.tsx:106. Count 1→1, sin cambio; se deja visible igual que antes (no se introduce supresión nueva).

### Verificación
- `bash scripts/audit-verify.sh` 🟢 completo: typecheck + lint + **1510 tests**.
- Re-scan react-doctor: no-giant-component **1→0** (último giant de `src/` cerrado), no-multi-comp **0**. Parity de las otras reglas confirmada (aria-hidden 0, autofocus 1 = pre-refactor).

### Estado Ticket 3
- **no-giant-component: 0** en `src/` (HorariosForms, BookingGrid, SupportActionsPanel, StepCourts, PricingGrid).
- **no-multi-comp: 0** (design-sync previews suprimidos por config).

Nada commiteado.

---

## 2026-07-10 — Caza de bugs multi-agente (post-auditoría, main @ f95e9ee)

Workflow: 8 finders paralelos (Opus, uno por superficie) + panel adversarial 3 lentes/hallazgo (Sonnet 5), 53 agentes, 0 errores. **15/15 hallazgos confirmados 3/3 unánime, 0 rechazados.** Report completo con evidencia y plan por lotes: `docs/audit/reports/caza-bugs-2026-07-10.md`.

- 🔴 6 críticos: refunds MP siempre fallan (`bookings.payment_id` → fila intención); refund MP dentro de tx (doble reembolso en retry); `credit_applied` de abonado se pierde al cancelar (REQUIERE INPUT); auto-complete/no-show/slot-past rotos para madrugada con `closes_next_day` (×3, causa raíz común); retention worker bajo pool restringido (fix ya en `chore/claude-fixes` 735f4fe, falta mergear).
- 🟡 7 medios: onboarding actions sin chequeo de rol (manager puede tocar config); 5ta oleada RLS pool (`data-export` ARCO vacío, MRR=0, listTenants sin plan); `getPriceForSlot` precio null con cierre a medianoche; countdown 15 min vs hold real 6 min; slot post-medianoche rechazado como past.
- 🟢 2 bajos: cierre de caja sin serializar vs altas concurrentes; `loadAbonadoCreditAction` sin `revalidatePath('/caja')`.

Nada aplicado (auditar ≠ fixear). Nada commiteado.

---

## 2026-07-10 (fixes) — #1 refund MP roto: bookings.payment_id re-linkeado a la fila aprobada

**Archivo:** `src/modules/payments/payment.service.ts` — `upsertPaymentRow` (línea ~409).

**Cambio:** antes del INSERT...ON CONFLICT original, se agregó un UPDATE que re-linkea la fila de "intención" (`p.id = bookings.payment_id AND p.mp_payment_id IS NULL`) con el `mp_payment_id`/`status`/`amount` reales del evento. Solo si esa UPDATE no afecta filas (ya re-linkeada en un evento previo, o `bookings.payment_id` no apunta a una intención) cae al INSERT...ON CONFLICT preexistente. `bookings.payment_id` deja de quedar huérfano apuntando a una fila `pending`/`mp_payment_id=NULL` tras la aprobación del webhook.

**Test agregado:** `tests/integration/payments.test.ts` — describe `createDepositPayment → webhook approval → cancelByPlayer — re-link (caza-bugs #1)`. Ejercita el camino real completo (createDepositPayment → processWebhook aprobado → cancelByPlayer) que ningún test anterior cubría; `cancellations.test.ts` seguía linkeando el pago a mano (`linkPaymentToBooking`), lo cual queda intacto porque testea `cancelByPlayer`/`cancelByAdmin` de forma aislada (no el bug, que estaba upstream en el webhook).

**Verificación:**
- `pnpm typecheck` 🟢
- `pnpm exec vitest run tests/integration/payments.test.ts` → 11/11 🟢 (incluye el test nuevo)
- `pnpm exec vitest run tests/integration/cancellations.test.ts tests/integration/reconcile-pending-payments-idempotency.test.ts tests/integration/webhook-notification-url.test.ts tests/integration/booking-checkout.test.ts` → 26/26 🟢 (sin regresión)
- `bash scripts/audit-verify.sh` → 🟢 completo (typecheck + lint + 1517 unit tests)

Nada commiteado.

---

## 2026-07-10 (fixes) — #3 refund MP dentro de la transacción: saga de dos fases

**Problema:** `createRefund` llamaba a `gateway.createRefund` (I/O externo a MercadoPago) DENTRO de la misma transacción de cancelación. Un fallo posterior en esa tx (timeout de lock, throw downstream, crash antes del commit) hacía rollback del registro local mientras MP ya había devuelto la plata — un reintento volvía a reembolsar.

**Cambio — saga de dos fases** (mismo patrón ya usado por `createDepositPayment`):
- `src/modules/payments/payment.service.ts`: `createRefund` partido en `prepareRefund` (fase 1, corre DENTRO de la tx del caller: lockea, valida, chequea over-refund, inserta fila `payments` type='refund' status='pending' — sin tocar MP) + `settleRefund` (fase 2, SIN tx abierta: llama a `gateway.createRefund(mpPaymentId, amount, idempotencyKey)` y persiste el resultado en una tx corta propia). Idempotency key = `refund:${refundPaymentId}` (id de la fila de refund, no del pago original — evita colisión entre refunds parciales distintos del mismo pago; estable ante reintentos de la MISMA liquidación).
- `PaymentGateway.createRefund` (interfaz + `MercadoPagoGateway` + `MockGateway` + `withCircuitBreaker`): tercer parámetro opcional `idempotencyKey`, pasado a MP via `requestOptions.idempotencyKey` (confirmado en el SDK: `PaymentRefund.create({payment_id, body, requestOptions})` mergea `requestOptions` en `config.options`, que `RestClient.fetch` lee como header `X-Idempotency-Key` — mismo patrón que `getPaymentStatus` ya usa para `timeout`).
- `src/modules/bookings/booking.cancellation.ts`: `cancelByPlayer`/`cancelByAdmin` ahora llaman `prepareRefund` (no I/O) y devuelven `CancellationOutcome = { booking, pendingRefund? }` en vez de `BookingRow` plano.
- `src/app/(player)/mis-reservas/actions.ts` y `src/app/(admin)/reservas/actions.ts`: después de que la tx de cancelación commitea, si hay `pendingRefund` llaman `settleRefund` (best-effort: si falla, la cancelación YA es válida — no hay rollback — pero se loguea con `captureMessage` nivel error para seguimiento manual; no se agregó worker de reconciliación, queda como backlog).

**Tests actualizados** (ninguno testeaba timing de I/O, solo resultado final — todos adaptados a two-phase):
- `tests/integration/mp-refund-validation.test.ts`: `createRefund`→`prepareRefund` (guards de over-refund/double-refund intactos, corren ANTES de tocar MP igual que antes).
- `tests/integration/payments.test.ts`: test de refund reescrito para fase 1 (sin llamar gateway) + fase 2 (`settleRefund` aprueba); test de guards renombrado a `prepareRefund`; mi test de #1 (re-link) extendido con `settleRefund`.
- `tests/integration/cancellations.test.ts`, `concurrent-cancellation.test.ts` (5 tests de carrera, incluye el ganador de `Promise.allSettled` liquidando su `pendingRefund`), `cashflow.test.ts`: agregado el `settleRefund` explícito donde antes se asumía refund síncrono.
- `tests/unit/mis-reservas-cancel-action.test.ts`, `reservas-actions-role-guard.test.ts`: mocks de `cancelByPlayer`/`cancelByAdmin` actualizados al nuevo shape `{booking, pendingRefund}`.
- `tests/unit/mp-breaker.gateway.test.ts`: assertion de forwarding de argumentos incluye el 3er parámetro.

**Verificación:**
- `pnpm typecheck` 🟢
- Integración dirigida (9 archivos, 74 tests): payments, mp-refund-validation, cancellations, concurrent-cancellation, cashflow, reconcile-pending-payments-idempotency, webhook-notification-url, booking-checkout, mp-webhook → 74/74 🟢
- `bash scripts/audit-verify.sh` → 🟢 completo (typecheck + lint + 1517 unit tests)

Nada commiteado.

---

## 2026-07-10 (fixes) — #4 + #5: guards temporales rotos con closes_next_day (instante físico del slot)

**Problema:** `autoCompleteOverdueBookings`, `completeBooking` (guard admin) y `markNoShow` comparaban `date + time_end`/`date + time_start` directo contra `NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires'`. Para un slot de madrugada (`date`=día operativo, `time_start`/`time_end` < hora de apertura, `closes_next_day=true`) eso computa la hora de pared sobre el día OPERATIVO, no el día físico real (que es el calendario siguiente). Resultado: un turno 00:00–01:00 cargado la noche anterior aparecía "ya terminado" ~20h antes de tiempo (auto-complete lo completaba solo) y "ya empezado" apenas creado (no-show/complete admin lo daban por válido sin esperar la hora real).

**Cambio — `src/modules/bookings/booking.service.ts`:** 3 constantes SQL reusables (`PHYSICALLY_NEXT_DAY_SQL`, `PHYSICAL_START_SQL`, `PHYSICAL_END_SQL`), gemelas en SQL crudo de la función JS `slotIsPhysicallyNextDay` ya existente (misma condición: `closes_next_day` + `time_start` antes de la apertura del día de semana vía `opening_hours` JSONB + `EXTRACT(DOW FROM date)`), que suman `INTERVAL '1 day'` cuando corresponde:
- `completeBooking` (guard admin, línea ~547): `SELECT` ahora JOINea `tenants t` y usa `PHYSICAL_END_SQL > NOW()` en vez de `date + time_end`.
- `autoCompleteOverdueBookings` (línea ~593): `UPDATE bookings b ... FROM tenants t WHERE t.id=b.tenant_id AND ...` usa `PHYSICAL_END_SQL` en el WHERE.
- `markNoShow` (línea ~615): mismo JOIN, `PHYSICAL_START_SQL > NOW()` como `not_yet_started`.

Para tenants con `closes_next_day=false` (default), `PHYSICALLY_NEXT_DAY_SQL` es siempre `false` → las 3 expresiones colapsan exactamente al comportamiento anterior (`date+time_end`/`date+time_start` sin offset) — cero cambio de comportamiento fuera del caso madrugada.

**Tests agregados** (`tests/integration/bookings.test.ts`, describe `día operativo (closes_next_day) — instante físico del slot`): tenant con `closes_next_day=true` + `opening_hours` del día de HOY (ART) seteado a `open=20:00/close=02:00`, booking `date=hoy`, `time_start=00:00`, `time_end=01:00` (madrugada). 3 tests: auto-complete NO completa el turno; `completeBooking('admin')` lanza `BookingNotYetEndedError`; `markNoShow` lanza `BookingNotYetStartedError`. **Verificado que los 3 fallan contra el código pre-fix** (`git stash` del archivo de producción, correr, confirmar 3 failures reales, `git stash pop`) — no son falsos positivos.

**Verificación:**
- `pnpm typecheck` 🟢
- `pnpm exec vitest run tests/integration/bookings.test.ts tests/integration/booking-time-validation.test.ts tests/unit/auto-complete-advisory-lock.test.ts` → 39/39 🟢 (sin regresión en tenants `closes_next_day=false`)
- `bash scripts/audit-verify.sh` → 🟢 completo (typecheck + lint + 1517 unit tests)

Nada commiteado.

---

## 2026-07-10 (fixes) — #7 onboarding actions sin chequeo de rol

**Problema:** `requireWizardTenant()` (helper local en `src/app/onboarding/actions.ts`) solo chequeaba "es staff con membresía en este tenant" — sin mirar el rol. Un manager (Encargado) podía invocar directo las Server Actions del wizard (`saveWizardScheduleAction`, `createWizardCourtsAction`, `setWizardStepAction`, `finishOnboardingAction`) y reescribir horarios/canchas o cerrar el onboarding — acciones de Configuración que deberían ser solo-admin, igual que `/settings` y `/canchas` fuera del wizard.

**Cambio:** `requireWizardTenant` reemplazado por los guards compartidos ya existentes en `src/modules/staff/guards.ts`:
- `setWizardStepAction`, `saveWizardScheduleAction`, `createWizardCourtsAction` → `requireAdminStaffAction()` (no redirige, devuelve `{ok:false,error}` — mismo contrato `WizardActionResult` que ya tenían) + `adminRateLimited(tenant.id)` preservado explícitamente (antes vivía dentro del helper local).
- `finishOnboardingAction` (firma `Promise<void>`, siempre redirige) → `requireAdminStaff()` (redirige a `/dashboard` si el rol no es admin, a `/login` si no hay sesión — mismo patrón que el resto de las zonas solo-admin).
- `createTenantAction` (Paso 1, crea el tenant) queda con su guard actual sin cambios — es la creación misma del tenant, todavía no hay rol que chequear.
- Ambos guards resuelven tenant y rol por DB (`getStaffTenant`/`getStaffRole`), nunca por el claim del JWT — no reintroduce el problema que el comentario original de `requireWizardTenant` advertía (claim `tenant_id` no propagado aún tras el Paso 1).

**Tests:**
- `tests/unit/onboarding-schedule-validation.test.ts`: agregado mock de `getStaffRole` (`@/modules/staff/staff.service`) → `'admin'`, necesario porque `saveWizardScheduleAction` ahora pasa por ese lookup.
- `tests/unit/onboarding-role-guard.test.ts` (nuevo, 7 tests): un manager es rechazado en las 4 actions (incluyendo `finishOnboardingAction` → redirect a `/dashboard`, no completa el onboarding); un admin sigue funcionando en paridad. Mocks de `withTenantContext`/`getCourtCountAndLimit`/`createCourt` configurados para que la action LLEGUE hasta el final si el guard falla — así "manager bloqueado" es una aserción real, no un falso positivo por un mock a medio configurar. **Verificado con `git stash` del archivo de producción**: 4/4 tests de manager fallan contra el código viejo (uno de ellos revela además que sin el guard, el manager llegaba hasta el `tx.update()` real de `tenants`).

**Verificación:**
- `pnpm typecheck` 🟢 · `pnpm lint` 🟢
- `pnpm exec vitest run tests/unit/onboarding-schedule-validation.test.ts tests/unit/onboarding-role-guard.test.ts` → 13/13 🟢
- `bash scripts/audit-verify.sh` → 🟢 completo (typecheck + lint + 1524 unit tests)

Nada commiteado.

---

## 2026-07-10 (fixes) — #8 + #9 + #10: 5ta y 6ta oleada del fallout RLS `turnogol_app`

Mismo patrón sistémico de las 4 oleadas previas (ver `pr30-turnogol-app-fallout` en memoria): código que llama `getSql()`/`getDb()` (pool restringido, FORCE RLS) fuera de `withTenantContext`/`withPlayerContext`, sobre una tabla con RLS, devuelve SIEMPRE 0 filas en producción. Local lo enmascara (`DATABASE_URL`/`WORKER_DATABASE_URL` apuntan al mismo superusuario).

**5ta oleada (hallazgos #8/#9/#10 del report caza-bugs):**
- `src/app/api/player/data-export/route.ts` — export ARCO: `getSql()` → `getWorkerSql()` para el dump de bookings/payments/relaciones/bans.
- `src/modules/super-admin/dashboard.service.ts` — `getMrrCents` (única función del archivo que toca `tenant_subscriptions`, RLS+FORCE — las otras 4 funciones leen tablas genuinamente globales y quedan en `getDb()`): `getDb()` → `getWorkerDb()`. Comentario de cabecera corregido (decía "tenant_subscriptions es global sin RLS", es falso).
- `src/modules/super-admin/tenants.service.ts` — `listTenants` completo (scan cross-tenant) + la query de `tenant_subscriptions` dentro de `getTenantDetail` (el resto del archivo, que lee `tenants`/`plans` puros o ya usa `withTenantContext`, queda igual): `getDb()` → `getWorkerDb()`. Mismo comentario corregido.

**6ta oleada (encontrada por grep sistemático dedicado, agente en background, 39 call sites de `getSql`/`getDb` revisados en 25 archivos):**
- `src/app/(auth)/register/actions.ts` — el pre-check "¿ya existe cuenta con este email?" contra `staff_users` (que SÍ tiene RLS relacional vía `staff_see_same_tenant_staff`, pese al comentario "es global sin RLS") corría con `getDb()` ANTES de que exista tenant_id alguno → devolvía 0 filas siempre → un registro duplicado nunca detectaba la cuenta existente, Supabase hacía signup silencioso (anti-enumeración) sin reenviar el email, y el usuario quedaba en "revisá tu correo" sin que llegara nada. Fix: `getDb()` → `getWorkerDb()`, mismo patrón que el precedente exacto `getOrCreateStaffUser` en `auth.service.ts`. Comentario corregido.
- 2 notas menores investigadas y descartadas (no son bugs): `refresh-mp-tokens.worker.ts` usa `getSql`/`getDb` en vez de las versiones worker pero `tenants` no tiene RLS, cosmético; `public.service.ts listTopPublicTenantSlugs` degrada a orden alfabético sin contexto pero está documentado/aceptado explícitamente y no corrompe datos.
- **Confirmado: las 5 oleadas previas siguen cerradas**, cero regresiones encontradas en el resto de los 39 call sites revisados.

**Tests (todos con patrón "trap" — mockean el POOL, no la función, siguiendo `tests/unit/staff-service-worker-pool.test.ts`; los integration tests existentes NO detectan esta clase porque local no tiene un rol restringido real):**
- `tests/unit/data-export-worker-pool.test.ts` (nuevo): confirma `getWorkerSql` llamado, `getSql` nunca.
- `tests/unit/super-admin-worker-pool.test.ts` (nuevo, 3 tests): `getMrrCents`, `listTenants`, `getTenantDetail` — confirman el pool correcto por función.
- `tests/unit/register-existing-account.test.ts`: `getDb()` mockeado como trampa que explota si se llama; agregado `getWorkerDb()` real. Un test existente ahora también asserta `expect(getDb).not.toHaveBeenCalled()`.
- **Los 4 tests trap nuevos/actualizados verificados con `git stash` de cada archivo de producción: los 4 fallan contra el código viejo** (MRR=0, rows vacías/undefined, subscription sin match, register no detecta email existente) — no son falsos positivos.

**Verificación:**
- `pnpm typecheck` 🟢 · `pnpm lint` 🟢
- `bash scripts/audit-verify.sh` → 🟢 completo (typecheck + lint + 1529 unit tests)

---

## 2026-07-10 (fixes) — #11 getPriceForSlot precio null en cierres a medianoche

**Problema:** `getPriceForSlot` (`src/modules/tenants/public.service.ts`) comparaba `slotMins < timeToMins(rule.to)` sin tratar `rule.to === '00:00'` como fin del día (minuto 1440) — quedaba en `timeToMins('00:00') = 0`, así que `slotMins < 0` nunca es cierto: una franja de precio que cierra a medianoche NO matcheaba NINGÚN slot (ni siquiera los de la tardecita, ej. 20:00–23:00 con cierre 00:00), mostrando precio $0/gratis y calculando la seña sobre $0 en la grilla pública de complejos con ese horario. Bug gemelo del ya arreglado en `court.service.ts calculatePrice` y `pricing-grid.ts` (mismo patrón `rule.to === '00:00' ? 24*60 : timeToMins(rule.to)`), que `getPriceForSlot` nunca había recibido.

**Cambio:** una línea en `getPriceForSlot`, mismo patrón que las otras 3 funciones de pricing del repo.

**Gap relacionado documentado, NO arreglado (fuera de alcance del hallazgo):** para tenants `closesNextDay` cuyas reglas vienen de `uniformRulesFromOpeningHours` (onboarding, precio uniforme), el tramo post-medianoche se genera como una regla separada con el day-key del día SIGUIENTE (ej. `{days:['sat'], from:'00:00', to:'02:00'}` para un viernes que cierra a las 2). Tanto `getPriceForSlot` como `calculatePrice` (el path de cálculo de precio REAL de una reserva) hacen el lookup con el day-key del día OPERATIVO fijo para toda la noche (ej. 'fri'), así que ese tramo post-medianoche nunca matchea sin importar el fix de '00:00' — un slot de madrugada (ej. 01:00) podría seguir devolviendo precio null / `PriceUnavailableError` en `calculatePrice`. No verificado si es alcanzable en producción con las reglas que genera hoy la UI de `/canchas` (que podrían usar un formato distinto al de `uniformRulesFromOpeningHours`); requiere investigación dedicada — no es lo que describe este hallazgo (#11), que es específicamente sobre el símbolo '00:00' y ya está confirmado + testeado.

**Test agregado:** `tests/unit/public-service.test.ts` — caso `cierre a medianoche (00:00 = fin del día) cubre toda la franja, no solo el minuto 0`. Verificado con `git stash` que falla contra el código viejo (`null` en vez de `900000`).

**Verificación:**
- `pnpm typecheck` 🟢
- `pnpm exec vitest run tests/unit/public-service.test.ts tests/unit/generate-slots.test.ts` → 22/22 🟢
- `bash scripts/audit-verify.sh` → 🟢 completo

Nada commiteado.

---

## 2026-07-10 (fixes) — #12 countdown 15 min vs hold real 6 min

**Problema:** 4 archivos calculaban `expiresAt`/una ventana de retry usando literales `15 * 60 * 1000` / `DEPOSIT_TIMER_MINUTES = 15`, pero el hold real del backend es `DEFAULT_EXPIRY_SECONDS = 6 * 60` (`src/shared/jobs/definitions.ts`) — el comentario en uno de los 4 ("Mirrors DEPOSIT_TIMER_MINUTES in payment.service.ts") apuntaba a una constante que no existe ahí. El jugador veía "14:30 restantes" mientras el worker de expiración ya había liberado el slot a los 6 minutos.

**Cambio (mismo patrón, 4 archivos, ahora derivan de `DEFAULT_EXPIRY_SECONDS`):**
- `src/app/reserva/[bookingId]/pendiente/page.tsx` — `expiresAt` del `PaymentStatusWatcher`.
- `src/app/reserva/[bookingId]/exito/page.tsx` — mismo `expiresAt` cuando el booking todavía no está `confirmed` (esperando webhook).
- `src/app/reserva/[bookingId]/error/page.tsx` — `withinWindow` (funcional, no solo cosmético: con 15 min mostraba el botón "Reintentar pago" sobre un booking que el worker ya había expirado, y el retry fallaba confuso en vez de mandar a "Reservar de nuevo").
- `src/app/api/player/bookings/[id]/status/route.ts` — el `expiresAt` que devuelve el polling (`DEPOSIT_TIMER_MINUTES` local eliminado, importa la constante real).

**Test agregado:** `tests/unit/booking-status-expiry.test.ts` (route handler, el más testeable de los 4 — las 3 páginas son Server Components idénticos mecánicamente, verificados por inspección). Verificado con `git stash` que falla contra el código viejo (`...T12:15:00` en vez de `...T12:06:00`).

**Verificación:**
- `pnpm typecheck` 🟢
- `pnpm exec vitest run tests/unit/booking-status-expiry.test.ts` → 1/1 🟢
- `bash scripts/audit-verify.sh` → 🟢 completo (typecheck + lint + 1530 unit tests)

Nada commiteado.

---

## 2026-07-10 (fixes) — #13 slot post-medianoche del día operativo anterior rechazado como "past"

**Problema:** `createOnlineBookingImpl` (`src/modules/bookings/booking.service.ts`) rechazaba con `BookingDateOutOfRangeError('past_date')` a TODO `input.date < todayStr`, sin excepción. Para un complejo `closes_next_day` cuya noche todavía sigue abierta (ej. Lunes 20:00→Martes 02:00 físico), a las Martes 00:30 el jugador que quiere reservar el slot 01:00–02:00 de "Lunes operativo" (todavía 30 min en el futuro, complejo abierto) se encontraba con `input.date='Lunes' < todayStr='Martes'` → rechazo inmediato, sin llegar nunca al chequeo de `slotIsPhysicallyNextDay` (que solo se evaluaba para `input.date === todayStr`, el caso "hoy operativo con post-medianoche", no para "ayer operativo todavía vigente").

**Cambio:** el branch `input.date < todayStr` ahora permite la excepción `input.date === addDays(todayStr, -1)` (ayer operativo) SI `slotIsPhysicallyNextDay` confirma que el slot es de madrugada (`closes_next_day` + `time_start` antes de la apertura del día) — reusa el mismo helper ya usado para el caso "hoy". Si pasa esa validación, compara la hora de pared contra HOY (no contra `input.date`), ya que el instante físico del slot cae en el calendario de hoy.

**Test agregado:** `tests/integration/booking-time-validation.test.ts` — tenant con `closes_next_day=true` y apertura sintética a las 23:59 (para que el test sea determinístico sin importar la hora real de ejecución) + cancha con precio uniforme 24hs (usa el fix #11). Slot sintético "ahora+10min" (siempre futuro). Verificado con `git stash` que falla contra el código viejo (`BookingDateOutOfRangeError: past_date`).

**Verificación:**
- `pnpm typecheck` 🟢
- `pnpm exec vitest run tests/integration/booking-time-validation.test.ts` → 8/8 🟢 (sin regresión en los 7 tests previos)
- `bash scripts/audit-verify.sh` → 🟢 completo (typecheck + lint + 1530 unit tests)

Nada commiteado.

---

## 2026-07-10 (fixes) — #14 cierre de caja sin serializar vs altas concurrentes

**Problema:** `closeDailyRegister` leía los totales del día (`aggregateTotals`) y recién DESPUÉS insertaba la fila `daily_cash_closes` — sin ningún lock entre ambos pasos. Un `createCashFlow`/`registerDebtPayment`/`loadAbonadoCredit` (que insertan `cash_flows` vía el guard compartido `assertDayOpen`) podía commitear un movimiento en esa ventana: el alta pasa (el día todavía no tenía cierre cuando `assertDayOpen` la dejó pasar), pero el cierre ya había leído los totales ANTES de ese commit — el cierre queda con un total que NO incluye el movimiento, y como el día ya está cerrado, ese movimiento queda huérfano sin forma de recuperarse.

**Cambio:** `pg_advisory_xact_lock(hashtext('daily_close:'||tenantId))` (mismo patrón ya usado en el repo para `mp_refresh`/`auto_complete_bookings`) agregado en DOS puntos:
- `assertDayOpen` (`src/modules/cashflow/cashflow.service.ts`) — el guard COMPARTIDO por `createCashFlow` y todo insert directo de `cash_flows` (`registerDebtPayment`/`loadAbonadoCredit` en `ptr.service.ts`), así que un solo cambio cubre TODOS los caminos de alta sin tocar cada call site.
- `closeDailyRegister` (`src/modules/cashflow/daily-close.service.ts`) — como primera sentencia, antes de chequear si el día ya está cerrado.

Al ser transaction-scoped y bloqueante (no `pg_try_`), la segunda transacción que compita por el mismo tenant espera a que la primera cierre (commit/rollback) antes de proceder — garantiza que un alta y un cierre sobre el mismo tenant nunca se intercalen: o el alta queda reflejada en el total del cierre, o se rechaza con `DayAlreadyClosedError` porque el cierre ya commiteó primero.

**Test agregado:** `tests/integration/daily-close-concurrent-cashflow.test.ts` — 5 rondas de `createCashFlow` + `closeDailyRegister` genuinamente concurrentes (`Promise.allSettled`, tenant nuevo por ronda) verificando el invariante: nunca "alta exitosa + cierre que no la cuenta". **Verificado con `git stash`: falla consistente 3/3 corridas contra el código viejo** (reproduce el split-brain exacto: `flowCount=1` pero `close.totalIncome=0`) — no es una carrera rara, se dispara fácil en local.

**Verificación:**
- `pnpm typecheck` 🟢
- `pnpm exec vitest run tests/integration/cashflow.test.ts tests/integration/daily-close-date-guard.test.ts tests/integration/daily-close-idempotency.test.ts tests/unit/cashflow-service.test.ts tests/integration/daily-close-concurrent-cashflow.test.ts` → 42/42 🟢 (sin regresión; test de concurrencia estable en 3 corridas repetidas)
- `bash scripts/audit-verify.sh` → 🟢 completo (typecheck + lint + 1530 unit tests)

Nada commiteado.

---

## 2026-07-10 — CIERRE: 13/14 hallazgos de caza-bugs aplicados

Los 13 hallazgos locales (todo excepto #6, que requiere push/PR) quedaron fixeados, testeados y verificados con `git stash` uno por uno contra el código viejo. Estado final: `docs/audit/PROGRESS.md` tiene una entrada por hallazgo con archivo/línea, evidencia, test y comando de verificación. `bash scripts/audit-verify.sh` 🟢 en cada cierre — el último corrido deja **1530 unit tests pasando, typecheck y lint limpios**.

**Pendiente (requiere decisión/acción del usuario, no de código):**
- **#2** (`credit_applied` de abonado se pierde al cancelar) — REQUIERE INPUT de negocio, no aplicado (usuario indicó que el módulo de abonados se va a refactorizar).
- **#6** (mergear `chore/claude-fixes` — retention worker) — el fix ya existe en la rama, solo falta push + PR (acción de riesgo, pendiente de confirmación).

**Nada commiteado en esta sesión** — todos los cambios están en el working tree de `main`, sin stage ni commit, a la espera de que el usuario revise y decida cómo agruparlos.

---

## 2026-07-12 — React Doctor: re-scan completo (branch `claude/react-doctor-execution-y88hgb`)

`npx react-doctor@latest -y --json` (v0.7.6), scope full, con la config existente (`doctor.config.mjs`) aplicada. **68 diagnósticos: 11 errores + 57 warnings, 41 archivos afectados.** Solo consulta/registro — sin triage ni fixes esta sesión.

### Errores (11)

**4 Bugs — NO cubiertos por overrides existentes, candidatos a triage real:**
- `src/app/(admin)/abonados/AbonadosList.tsx:249` — `no-unguarded-browser-global-in-render-or-hook-init`: `document` leído durante render (SSR rompe).
- `src/components/booking/PaymentStatusWatcher.tsx:67` — `effect-needs-cleanup`: `setTimeout` en `useEffect` sin cleanup.
- `src/hooks/use-booking-realtime.ts:110` — `effect-needs-cleanup`: `subscribe` en `useEffect` sin cleanup.
- `src/hooks/use-persisted-density.ts:21` — `no-impure-state-updater`: el updater de estado hace `localStorage.setItem()` (efecto lateral dentro del updater).

**7 Security (`supabase-table-missing-rls`)** — mismo archivo, `supabase/migrations/20260424000003_global_tables.sql` líneas 9/32/109/139/157/186/202. Probable falso positivo: el número y ubicación coincide con las tablas globales documentadas en CLAUDE.md (`tenants`, `players`, `staff_users`, `plans`, `price_versions`, `processed_webhooks` — sin `tenant_id`, sin RLS por diseño). **NO verificado línea por línea todavía** — pendiente confirmar tabla por tabla antes de decidir supresión en `doctor.config.mjs` vs. RLS real faltante.

### Warnings (57) por regla

- `server-sequential-independent-await` ×14 — `canchas/actions.ts:206`, `grilla/page.tsx:36`, `reservas/page.tsx:102`, `api/player/data-export/route.ts:66,83`, `court.service.ts:125`, `metrics.service.ts:185,193`, `support.service.ts:291,398`, `tenants.service.ts:133,327,436`, `public.service.ts:383`.
- `async-await-in-loop` ×6 — `dunning-retry.worker.ts:130,153,177,203,228` + `booking.expiry.ts:179`. Coincide exacto con el backlog de perf ya documentado en `doctor.config.mjs` (bounded-concurrency real, requiere `p-limit`, no `Promise.all`) — **no son hallazgos nuevos**.
- `server-after-nonblocking` ×4 — `canchas/actions.ts:240,290`, `settings/perfil/actions.ts:44,95` (`console.warn()` bloqueante antes de responder; candidato a `next/server` `after()`).
- `exhaustive-deps` ×4 — `BookingCard.tsx:168`, `use-grid-layout.ts:74,95`, `use-nearest-city.ts:83`.
- `prefer-module-scope-static-value`/`prefer-module-scope-pure-function` ×7 — `reportes/page.tsx:42`, `reservas/[id]/page.tsx:35,41`, `para-complejos/page.tsx:450`, `mis-reservas/page.tsx:132`, `ExplorarFilters.tsx:66`, `SettingsSection.tsx:27`.
- `no-derived-useState` ×2 — `HorariosForm.tsx:32`, `SettingsSection.tsx:24`.
- `no-locale-format-in-render` ×2 — `ReviewsSection.tsx:76`, `status-banner.tsx:17` (hydration mismatch potencial).
- `rerender-lazy-state-init` ×3 — `SearchBar.tsx:53,55,56`.
- `control-has-associated-label` ×2 — `PricingSection.tsx:202,256`.
- `js-set-map-lookups` ×2, `js-combine-iterations` ×1, `no-array-index-as-key` ×1 (`combobox.tsx:265`), `prefer-html-dialog` ×1 (`TenantGallery.tsx:92`).
- `require-pnpm-hardening` ×2 (`pnpm-workspace.yaml` — falta `minimumReleaseAge`/`trustPolicy`), `url-prefilled-privileged-action` ×1 (`ingresar/page.tsx:152`), `clickjacking-redirect-risk` ×1 (`api/auth/callback/route.ts:100`).
- `unused-file`/`unused-dev-dependency`/`unused-export` ×4 (Maintainability) — `doctor.config.mjs` (FP conocido, ver nota en el propio config), `@lhci/cli` + `happy-dom` sin uso en `package.json`, `runRequestObservability` (ya evaluado y dejado a propósito, ver sesión 2026-07-04 arriba).

**Sin acción tomada, nada commiteado por este registro salvo el propio PROGRESS.md.** Reporte JSON completo (formato `react-doctor --json`, 68 diagnósticos con `help` extendido) generado en esta sesión — no versionado, vivía en scratchpad temporal (efímero, no sobrevive el contenedor).

## 2026-07-12 (copy) — Desalineaciones de copy en producción (.agents/product-marketing.md §Desalineaciones)

**Contexto:** encargo /copywriting sobre las 5 desalineaciones del doc de product marketing. Durante el planning se detectó una SESIÓN PARALELA editando el mismo branch (`chore/storybook-complete`): 4 de los 5 hallazgos ya estaban fixeados en el working tree (sin commitear) por esa sesión. Esta sesión cubrió el residuo. Estado verificado en disco archivo por línea (no por mensajes).

**Resuelto por la sesión paralela (verificado por esta sesión, sin tocar):**
1. "cobrados automáticamente" (abonados) → `para-complejos/page.tsx:62` ahora "Registrás quién pagó cada sesión".
2. "miles de jugadores" ×3 → metadata y hero de `para-complejos/page.tsx` + `home/OwnerBanner.tsx:60` reescritos sin la promesa.
3. "queda con deuda" → `precios/page.tsx:21` ahora modelo softban ("si reincide, queda 14 días sin poder reservarte online"); `:26` "historial, stats y ausencias".
4. Stats fabricados (+10.000/50+/95%) → claims mecánicos en `home/StatsBar.tsx:1-6` y `para-complejos/page.tsx:64-69`. Sección `Testimonials` de para-complejos ELIMINADA por esa sesión.
5. "plataforma líder" → `layout.tsx:34` ahora "Sistema de reservas online y gestión…".

**Aplicado por esta sesión:**
- **A. Email muerto del modelo de deuda borrado** (OK explícito del dueño): `src/modules/notifications/templates/no-show-debt-created.ts` eliminado + 4 referencias en `templates/index.ts` (import, re-export, type map, RENDERERS) + 4 bloques en `tests/unit/notification-templates.test.ts` (import, describe, routing, array `valid`). Estaba registrado pero sin ningún enqueue (`git grep no_show_debt_created` fuera de templates/: cero) — huérfano del revert de deuda (migr. 044).
- **B. Barrido de palabras prohibidas restante:** `para-complejos/page.tsx:42` 'Dashboard en tiempo real' → 'Métricas en tiempo real'; `home/OwnerBanner.tsx:47` 'Solución para complejos' → 'Para dueños de complejo'.

**REQUIERE INPUT resuelto por el dueño (registrado):** el testimonio fabricado duplicado en `/login` (`src/app/(auth)/login/page.tsx:42-47`, "Marcelo Pérez · Complejo San Martín, Mendoza") se CONSERVA por decisión explícita del dueño. Esta sesión declinó redactar o mejorar testimonios fabricados (publicidad engañosa; viola la regla dura del GTM y expone bajo Ley 24.240) y no restauró la sección eliminada. Riesgo documentado.

**Verificación (por paso):**
- Paso A: `pnpm typecheck` 🟢, `pnpm lint` 🟢, `vitest run tests/unit/notification-templates.test.ts` → 28/28 🟢
- Paso B: `pnpm typecheck` 🟢, `pnpm lint` 🟢
- Grep de cierre sobre src/+tests/: cero matches de "miles de jugadores" / "cobrados automáticamente" / "queda con deuda" / "+10.000" / "plataforma líder" / "Solución para complejos" / "NoShowDebtCreated" (los hits de "Dashboard" restantes son identificadores internos y el panel super-admin, no copy de marketing).

Nada commiteado.

## 2026-07-12 — Contenido SEO: infra de blog + 3 piezas decision-stage (sesión estrategia de contenido)

Continuación del esfuerzo docs/marketing/ (misma sesión que la estrategia). Complementa la entrada anterior de copy (sesión paralela) — sin solapamiento de archivos salvo `/para-complejos` y `/precios`, editados antes del sweep paralelo.

- Copy fixes propios: `/para-complejos` (metadata, hero, features seña/abonados, stats mecánicos, testimonios fabricados ELIMINADOS + link `#testimonios` del BusinessHeader), `/precios` (deuda→softban, ficha jugador), `home/StatsBar` (stats fabricados→mecánicos), `OwnerBanner` ("miles de jugadores"→link propio), `layout.tsx` ("plataforma líder"→"Sistema de reservas online y gestión"), `BookingActions` (dialog no-show→softban), comments stale del modelo deuda (QuickActions, tenant.types, settings/reservas/actions, ptr.service, cashflow.service).
- Infra blog: deps `next-mdx-remote@5` + `gray-matter` + `remark-gfm` + `@tailwindcss/typography` (plugin agregado a tailwind.config). `src/lib/content/posts.ts` (loader zod-validado), `ArticleShell` (JSON-LD Article+FAQPage, CTA), `Mdx.tsx`, rutas `/blog`, `/blog/[slug]`, `/vs/alquila-tu-cancha`, `/alternativas-alquila-tu-cancha`. Sitemap: +blog/comparativas, fix `/privacy`→`/privacidad` y `/terms`→`/terminos` (apuntaban a 404). Header business: +link Blog. `public/llms.txt`.
- Contenido: 3 piezas es-AR con disclosure de sesgo y claims verificados contra `.agents/product-marketing.md` (topics #1-3 de la estrategia).
- Verificación: `pnpm typecheck` 🟢, `pnpm lint` 🟢, dev server :3210 → 6/6 rutas HTTP 200, tabla GFM + FAQPage JSON-LD presentes en HTML renderizado, grep de claims prohibidos sobre las 4 páginas servidas = 0 matches, grep de tests/stories que asserten el copy viejo = 0.
- Delegaciones (fase research, misma sesión): 3 agentes Sonnet (~290k tokens) → docs/marketing/research/*.
- NO tocado: template no-show-debt (lo eliminó la sesión paralela, verificado en código), testimonio de /login (decisión del dueño), doc4_monetizacion.md (precios viejos, pendiente).

Nada commiteado.

## 2026-07-17 — Slugs reservados: tenant con slug de ruta estática quedaba shadowed

Hallazgo (esfuerzo UX 5 pilares): `generateUniqueSlug` (`src/modules/tenants/tenant.service.ts:16`) solo chequeaba colisión contra `tenants.slug`, nunca contra segmentos estáticos del App Router. Como `(public)/[slug]` vive en la raíz, un tenant llamado "Precios", "Login", "Grilla", etc. generaba un slug que Next resuelve como ruta estática (estático gana sobre dinámico) → página pública inalcanzable sin error visible.

- `src/modules/tenants/tenant.utils.ts`: nueva constante `RESERVED_SLUGS` (49 entradas) — enumeración real de segmentos top-level de `src/app` (los 6 route groups aportan hijos top-level: `(admin)` grilla/caja/…, `(auth)` login/ingresar/…, `(business)` precios/blog/vs/…, `(player)`, `(public)` explorar/…, `(super-admin)`) + raíz (`api`, `home`, `mock-mp`, `onboarding`, `reserva`, `select-tenant`, `icon-*`) + `c` (prefijo del link público `/c/{slug}`).
- `src/modules/tenants/tenant.service.ts`: `generateUniqueSlug` sufija base reservada con `-futbol` ("precios" → "precios-futbol", decisión de producto propuesta en el pedido: sufijo menos invasivo) y además une `RESERVED_SLUGS` al set de colisiones para que ningún candidato numérico caiga en un slug reservado (edge: `icon-192`/`icon-512` son rutas reales).
- Tests: `tests/unit/tenant-service.test.ts` +4 casos (sufijo `-futbol`, barrido exhaustivo de las 49 reservas —ninguna puede salir como slug—, fallback numérico `grilla-futbol-2`, salto de candidato numérico reservado `icon-192`→`icon-193`). 14/14 🟢.
- Migración para tenants existentes: NO hace falta — pre-deploy, sin tenants productivos; seeds usan `e2e-complejo-demo` / `e2e-complejo-sena` / `staging-demo` (ninguno reservado).
- Verificación: `pnpm vitest run tests/unit/tenant-service.test.ts` → 14/14 🟢, `pnpm typecheck` 🟢, `pnpm lint` → 0 errors (27 warnings pre-existentes, ninguno en archivos tocados).
- Nota colateral (NO tocado): `buildPublicLinkUrl` (`src/lib/utils.ts:27`) en este worktree todavía arma `/c/{slug}` — el fix Fase 0 UX que lo pasa a `/{slug}` vive en otro worktree/rama. La constante nueva cubre ambos mundos (`c` reservado).

Mantenimiento: al agregar una ruta top-level nueva en `src/app`, agregar el segmento a `RESERVED_SLUGS` (comentario en la constante lo indica).

## 2026-07-17 — a11y: GhostKpis de /reportes bajo AA por opacity-50 (sesión fix puntual, worktree dazzling-goldwasser)

Hallazgo derivado del fix de `GhostTopSlots` (/metricas, sesión UX paralela): `GhostKpis` en `src/app/(admin)/reportes/page.tsx` aplicaba `opacity-50` al grid entero — `text-foreground` de los StatCard componía ~3.79:1 sobre fondo blanco (AA exige 4.5:1). Nunca lo atrapó el gate a11y de Storybook porque la página no tenía story.

- Fix (mismo criterio que GhostTopSlots): sin opacidad sobre el wrapper; valor del StatCard en `text-muted-foreground` (ya AA), `opacity-40` solo en el glifo del ícono (decorativo, sin texto). Comentario explicativo en el componente.
- Cobertura del gate: `GhostKpis` extraído a `src/app/(admin)/reportes/GhostKpis.tsx` (la página es server component async con auth+DB, no storybook-able) + `GhostKpis.stories.tsx` (title `Admin/Reportes/GhostKpis`, play con smoke asserts). El a11y global (`preview.tsx` → `a11y.test: 'error'`) ahora la cubre.
- Verificación: `pnpm typecheck` 🟢, `pnpm lint` 🟢 (0 errores; 27 warnings pre-existentes, ninguno en reportes), story 1/1 🟢. Test negativo: con el patrón viejo re-aplicado temporalmente la story FALLA con 3 violaciones `color-contrast` (axe 4.12) — el gate atrapa la regresión; restaurado el fix, verde.
- Nota infra: la suite storybook no corre en este worktree anidado sin el plugin `resolveAddonVitestSetupFiles` (bug resolver Vitest, ya documentado); se corrió con config temporal portada del worktree ux-usability, borrada después. El fix de config pertenece a esa rama — no se duplicó acá.

Nada commiteado.

## 2026-07-13 — Auditoría psicológica de /para-complejos (skill marketing-psychology, solo report)

**Contexto:** encargo /marketing-psychology → landing B2B, alcance "solo auditoría" elegido por el dueño. Report nuevo: `docs/audit/AUDIT_PSICOLOGIA_PARA_COMPLEJOS.md`. Capa siguiente al sweep 5eb5eca (2026-07-12): aquel mató la lista negra literal; este audita claims residuales + efectividad psicológica del copy vigente.

**Hallazgos:** 1 🔴 (H-05: "Herramientas que nacieron de la operación diaria de complejos como el tuyo", `page.tsx:346` — claim de origen falso con cero clientes; viola regla dura #2 del playbook y piso legal MASTER §9) · 6 🟡 (H-02 H1 aspiracional vs loss aversion REQUIERE INPUT; H-03 "Soporte dedicado" sin canal comprometido; H-04 softban ausente en toda la landing — diferenciador #1 sin vender; H-06 corporate-speak en Features; H-12 mock grilla 15 min = triage #92 con peso subido; H-13/H-14 REQUIERE INPUT) · 5 🟢 (pulido). + 3 gaps estructurales REQUIERE INPUT (contraste vs status quo, objeción seña, pratfall del pionero) + sección "lo que ya está bien" (subhead hero, StatsBar mecánico, risk reversal del cierre — no romper).

**Claims verificados contra código antes de afirmar:** trial 30 días (`tenant.service.ts:55` ✅), TTL hold 6 min = "en minutos" (`booking.expiry.ts:81` ✅), quiet hours 8AM (`push-quiet-hours.ts:17` ✅), sin application_fee = "100% de la seña" (grep `mercadopago.ts` ✅), "20 minutos" permitido por decisión (gtm 03:51).

**Cross-refs:** MASTER §13 P2.7 desactualizado (5eb5eca ya eliminó los stats que lista — cerrarlo o reescribirlo, REQUIERE INPUT); triage #92/#134 referenciados, no duplicados. Contratos de test para el fix futuro documentados en el report (story fija H1 + "Reservas online 24/7" + CTAs→/register).

**Delegaciones:** 2 Explore (Sonnet, exploración landing + docs marketing/gtm) en fase de planning.

Sin código tocado. Nada commiteado (report + esta entrada solamente).

---

## 2026-07-21 — React Doctor: cierre de pendientes del re-scan v0.7.6 (4 bugs + 7 supabase-rls)

Triage y cierre de los pendientes registrados en la sesión 2026-07-12 (4 candidatos Bugs sin triage + 7 Security `supabase-table-missing-rls` sin verificar tabla por tabla). 2 agentes de exploración (evidencia archivo:línea), fixes mínimos con precedente del propio repo, overrides con rationale honesto, verificación completa.

**Veredictos y acciones (los 11 + 1 colateral):**
- **`AbonadosList.tsx:249` (hoy :294, línea corrida por #39) `no-unguarded-browser-global-in-render-or-hook-init`** → FALSO POSITIVO: el único `document` del archivo es el `document.body` del `createPortal` en `AbonadoActionDialogs`, detrás de `if (actions.state.dialog === null) return null` (dialog arranca null y solo cambia por click — en SSR retorna antes de tocar document) + `AbonadoDialogs` carga con `dynamic({ssr:false})`. Override en config.
- **`PaymentStatusWatcher.tsx:67` `effect-needs-cleanup`** → FP técnico (cleanup real vía flag `cancelled`, idiom de setTimeout recursivo con backoff) + **hardening aplicado igual**: `timerId` trackeado en el scope del effect y `clearTimeout(timerId)` en el cleanup (libera el timer pendiente al desmontar en vez de dejarlo no-opear), guard `if (cancelled) return` antes del `setStatus` post-await (fetch en vuelo), eliminado el `return id` sin uso. La regla SIGUE flagueando post-hardening (no sigue la asignación dentro de `scheduleNext`; su mensaje "without returning cleanup" es literalmente falso contra el código actual) → override con ese rationale.
- **`use-booking-realtime.ts:110` `effect-needs-cleanup`** → FALSO POSITIVO, código sin tocar: el subscribe se limpia vía `teardown` → `supabase.removeChannel(channel)` (L186-193) + clearInterval/clearTimeout de poll y reconcile; cubierto por el test case 7 (`use-booking-realtime.test.ts:284-325`: removeChannel 1× + 0 fetches post-unmount). Un "fix" naïve rompería ese test. Override.
- **`use-persisted-density.ts:21` `no-impure-state-updater`** → **REAL (bajo), FIXED**: `localStorage.setItem` vivía DENTRO del updater de setState (StrictMode doble-invoca updaters; era el único lugar del repo que violaba el patrón dominante "setItem en el handler"). Movido al cuerpo del handler, precedente exacto `onboarding-checklist.tsx:78-80`; deps `[]`→`[isCompact]` (inocuo, consumidor es un onClick).
- **7× `supabase-table-missing-rls` (`20260424000003_global_tables.sql` L9/32/109/139/157/186/202)** → verificado tabla por tabla en AMBOS árboles de migraciones. 2 grupos con rationale distinto: **(a) FP de aislamiento de archivo** — `players` (L109), `staff_users` (L139, policy `staff_see_same_tenant_staff`), `system_admins` (L157): RLS SÍ existe (ENABLE + policies en `006_rls_policies.sql`, FORCE en `036`), el tool lintea 003 en aislamiento; **(b) sin RLS POR DISEÑO, no FP** — `plans` (L9), `tenants` (L32), `price_versions` (L186), `processed_webhooks` (L202): cero RLS en cualquier migración, intencional (doc12 §2, tablas globales/de sistema sin tenant_id; `tenants` guarda tokens MP encriptados con aislamiento app-layer aceptado en doc12 §7.2/§9.2). Un solo override file-scoped con el comentario doble explícito. Ninguna vulnerabilidad activa; ninguna de las 7 es reviews/player_favorites/push_subscriptions/feature_flags ni `products`.
- **Colateral (aparecido en la verificación, código de main post-baseline): `dashboard/actions.ts:48/79` `server-auth-actions` (severity error)** → FP familia batch-7: las 3 actions del archivo llaman `requireOperatorStaff()` + `adminRateLimited()` ANTES de tocar DB (leídos los 3 exports completos; el propio archivo documenta que la ronda R5 lo cerró con el guard central). Override en la sección 2026-07-21 del config.

**Corrección de registro:** 3-09/3-20 (FORCE RLS en reviews/player_favorites/push_subscriptions/feature_flags) figuran arriba (entradas 2026-06-29/07-01, L50/55/84) como "NO tocado / migración pendiente del usuario" — **ya están CERRADOS** por `036_force_rls_remaining_tables.sql` (ENABLE en migr. 014/015/016/017 + FORCE en 036, cuyo header cita TG-BL-02/TG-P2-RLS-02). `audit_report.md` ya estaba limpio (re-verificación #37); solo esas notas de este log quedaron stale — no se reescriben, vale esta corrección.

**Test nuevo:** `tests/unit/use-persisted-density.test.ts` (4 casos; el hook no tenía ninguno). Mock de localStorage con el patrón `push-notification-dismiss.test.tsx` — gotcha: `vi.spyOn(Storage.prototype, ...)` NO intercepta en happy-dom (métodos own-property de la instancia). El caso trampa (StrictMode + conteo de escrituras) **verificado contra el código pre-fix: falla con "expected 1 times, but got 2 times"** (updater impuro doble-invocado escribe 2×); post-fix 4/4 🟢.

**PRE-EXISTENTE arreglado (1 línea, fuera de scope, para desbloquear el juez):** `PortalHeader.tsx:7` — import `LogIn` (lucide) sin uso, error de lint llegado con PRs recientes de main (post-baseline "0 errors" del 2026-07-17). Rompía `audit-verify.sh` (`set -e` aborta en [2/3] Lint antes de correr los tests). Confirmado pre-existente vía `git stash` (árbol limpio: mismos 34 problemas, 1 error + 33 warnings). Mismo precedente que `facturacion/page.tsx:37` (2026-07-04). Revertible si preferís dejarlo al PR que lo introdujo.

**Verificación:**
- Dirigidos: density 4 + payment-status-watcher-stall 3 + use-booking-realtime 7 + abonados-list 15 + booking-grid 13 → **42/42 🟢**
- `bash scripts/audit-verify.sh` → 🟢 completo (typecheck + lint 0 errores + **1861 unit tests / 251 archivos**)
- Re-run `npx react-doctor@0.7.6 --json` (pinneado a la versión exacta del baseline): **errorCount 11 → 0** — los 4 Bugs + 7 supabase-rls del baseline TODOS resueltos (2 fixes en código + 9 FP/by-design suprimidos con rationale), más los 2 `server-auth-actions` nuevos de main. Quedan **87 warnings**, todo backlog/territorio-auditoría pre-existente; el total warnings creció 57→87 respecto del baseline por código nuevo de main (`server-sequential-independent-await` 14→32; `prefer-use-effect-event` ×3 y `unsafe-json-in-html` ×2 son reglas/hallazgos nuevos de main), **cero hallazgos en archivos tocados por esta sesión**.

**Archivos tocados:** `src/hooks/use-persisted-density.ts` (fix), `src/components/booking/PaymentStatusWatcher.tsx` (hardening), `src/components/site/PortalHeader.tsx` (pre-existente 1 línea), `doctor.config.mjs` (sección "Re-scan v0.7.6 — triage 2026-07-21": 5 overrides), `tests/unit/use-persisted-density.test.ts` (nuevo).

Nada commiteado (pendiente de decisión del dueño).

## 2026-07-23 — Wave 2 D3: queries reales bajo rol real (rama audit/data-d3)

**🔴 D3-H1 cazado y FIXEADO:** los 2 índices de expresión ART de la migr. 053 (`idx_cash_flows_tenant_day_art`, `idx_stock_movements_tenant_day_art`) eran INUSABLES bajo el pool real `turnogol_app` con RLS: `timezone()` no es LEAKPROOF y Postgres no baja quals no-leakproof debajo de la barrera de seguridad de las policies → toda la clase "día ART" (caja, cierre, resumen dashboard, reportes cantina) hacía Seq Scan (medido: 7 ms/22k filas descartadas). D1 los había verificado como superusuario (RLS bypasseada) — trampa "local enmascara" a nivel planner. Fix: helper `artDayRangeUtc` (art-date.ts) + 8 callers migrados a rango UTC sargable `[date 03:00Z, date+1 03:00Z)` (cashflow.service ×3, daily-close, canteen-report ×3, dashboard/queries) + migr. 054 dropea los 2 índices muertos. Post-fix: 0,13-0,6 ms vía `idx_cash_flows_tenant_date`/`idx_stock_movements_tenant_day`. Test regresión `tests/unit/art-day-range-utc.test.ts`.

**T0:** seed sintético reusable D6 (`scripts/audit/seed-d3-volume.sql`: 15,7k bookings/22,4k cash_flows/1 año + 200 tenants fondo, setseed fijo, cleanup integrado) + harness `scripts/audit/explain-d3-hotpaths.sql` (13 hot paths bajo rol real). Todos los demás planes sanos; seq scans restantes justificados (tablas chicas). Parciales 053 validados con volumen (Q8 quedaba pendiente de D1).

**Hallazgos no aplicados (backlog con evidencia en report):** H2 🔴 agregado reviews de /explorar escanea tabla completa por request público (cachear/materializar); H3 🔴 export de caja sin tope de rango; H5 🟡 6 N+1 (generate-abonado-slots el peor, cantina venta/fiado, dunning, send-email); H6 🟡 sin-LIMIT (getDebts 55 ms/71k buffers para devolver 0 — REQUIERE INPUT ventana; historial; fiados); Haversine DIFERIDO con medición (0,1 ms a 207 tenants, bounding box cambia semántica); matriz de caché completa (0 revalidateTag; gaps ISR canchas/settings mitigados por checkout force-dynamic; `/deudas` revalida stub muerto).

**Gate:** typecheck ✅ / lint 0 errors ✅ / unit 2003/2003 ✅ / integration 677/677 ✅ / isolation 123/123 ✅ / EXPLAIN post-fix con Index Cond bajo turnogol_app+RLS ✅. Report: `docs/audit/reports/fase-d3-queries-rol-real-report.md`. Migr. 054 NO aplicada a prod (decisión del dueño).

**Actualización 2026-07-23 (post-verificación adversarial, misma sesión D3):** resuelta la coordinación de merge con `chore/drop-get-day-comparisons` (PR #54, dead code de D1) — se aplicó el mismo diff de borrado (`getDayComparisons` + `DayComparisons`/`DayTotals` + fixtures + test integración) directo en `audit/data-d3`, sin esperar el merge del otro PR. El fix D3 sobre esa función quedó sin efecto (nunca tuvo caller), sin pérdida. Gate re-verificado: typecheck ✅ / lint 0 errors ✅ / unit 2003 ✅ / integration 676/676 (677→676, retirado el test de la función borrada) / isolation 123/123 ✅. `audit/data-d3` ya no colisiona con PR #54 en ningún archivo.

## 2026-07-23 — Wave 2 D5: infra de datos (rama audit/data-d5)

**Residuo D3 cerrado primero:** migr. 054 aplicada a prod con aprobación del dueño (verificado: 0 índices ART, 107 índices totales, tracking 7 filas).

**🔴 D5-H1 (cazado, fix operativo pendiente del dueño):** pg-boss del worker Railway conecta a prod como `postgres` (owner) — pg_stat_activity mostró las 10 conexiones del poller con usename=postgres; la env DATABASE_URL de Railway apunta al superusuario en vez de turnogol_app (diseño migr. 037/039 violado por config de deploy). Clase colateral: `bypassRlsCheck` de launch-check no la caza (postgres tiene rolbypassrls=false pero es OWNER → bypassa RLS donde no hay FORCE). Hardening aplicado: check nuevo `role identity check` asserta current_user esperado por DSN. Falta confirmar el usuario del DSN de Vercel (pull de env denegado en sesión).

**Implementado (4 sonnet-implementers en zonas disjuntas + gate):**
- Migr. 055: timeouts por rol — turnogol_app 15s/3s/30s (statement/lock/idle-in-tx), turnogol_worker 120s/10s/120s; log_min_duration_statement 300ms best-effort (EXCEPTION insufficient_privilege, supautils puede negarlo). Antes: rolconfig NULL, lock e idle INFINITOS. Test por catálogo `role-timeouts.test.ts` (gotcha ALTER ROLE SET aplica al LOGIN, no a SET ROLE).
- Migr. 056: search_path='public' fijo en 5 funciones trigger (cuerpos leídos; '' rompería 4) + REVOKE recalc_tenant_from_price(uuid) de PUBLIC/anon/authenticated — era SECURITY DEFINER invocable como RPC PostgREST por anónimos (advisor D2-H3); GRANT explícito a turnogol_app/worker.
- pg-boss deliberado (boss.ts): max 5, archiveCompletedAfterSeconds 43200, deleteAfterDays 7, maintenanceIntervalSeconds 120 (defaults 9.0.3 verificados en la lib, ahora elegidos) + CRON_WORK_OPTIONS newJobCheckIntervalSeconds 30 en 10 colas cron (poller era la top query absoluta de prod: 2,08M calls / 46,7s; latency-sensitive quedan en 2s).
- Purga processed_webhooks >30d automatizada en data-retention-cleanup (paso global pre-loop; doc19 ya la fijaba manual — de paso el runbook tenía TRUNCATE...WHERE inválido, corregido). Test idempotencia nuevo.
- **Drift test Drizzle↔SQL en CI** (`schema-drift.test.ts`, 56 casos): 27 tablas + columnas + 25 enums vs information_schema/pg_enum. 0 drift real — la premisa pre-cargada (before_state/after_state "en DB pero no en Drizzle") resultó OBSOLETA (Drizzle ya las declara; lo muerto es a nivel app). Regla leakproof: 0 índices de expresión no-leakproof sobre tablas RLS (filtro NOT indisexclusion justificado — EXCLUDE constraints usan tsrange no-leakproof pero no pasan por el planner). 2 controles positivos ejecutados.
- **Canario de plan bajo rol real** (`query-plan-canary.test.ts`, cierra obs. 1 del verificador D3): SET LOCAL ROLE turnogol_app + enable_seqscan=off; 2 positivos (Index Cond con fecha en cash_flows/stock_movements) + negativo (índice expresión recreado en tx: matchea como superusuario, bajo RLS la fecha queda en Filter). Hallazgo empírico: el assert correcto es sobre Index Cond, no Node Type (otros índices tenant_id-líder sirven la igualdad).
- launch-check: role identity + role session timeouts + ssl in use (3 fatales). sslmode=require en DSNs de ejemplo + comentarios railway.toml/Dockerfile.worker.

**Prod verificado read-only (insumos):** pg_stat_statements YA activa (1.11, track=top) — hallazgo #4 del MASTER_PLAN parcialmente falso; publication solo bookings vigente; autovacuum sano; pgboss.job/archive rotando (housekeeping default funcionaba); Postgres 17 en prod vs postgres:15 en CI (anotado, territorio D7); max_connections 60 con ~18 usadas.

**Gate:** typecheck ✅ / lint 0 errors ✅ / unit 2003/2003 ✅ / integration 738/738 ✅ (+62 nuevos; 1ra corrida 734/738 por residuo de implementers paralelos contra la misma DB — re-run limpio verde) / isolation 123/123 ✅.

**REQUIERE INPUT (dueño):** 1) DSN Railway → turnogol_app (D5-H1) + confirmar DSN Vercel; 2) PITR/backups — la auto-pausa de julio sugiere free tier (posiblemente SIN backups gestionados hoy), definir RPO; 3) retención audit_logs (propuesta 24 meses) y notifications (6 meses) — hoy sin techo; 4) aplicar 055+056 a prod.

**Verificación adversarial D5 (mismo día): RECHAZADO → 4 fixes → gate re-verificado verde.** Hallazgos del verificador: (1) 🔴 canario positivo cash_flows frágil al desempate del planner entre índices tenant_id-líder (reprodujo rojo con stats contaminadas por su propio seed de ataque) — fix: los positivos ahora DROPean competidores en tx (patrón del negativo), 3× corridas verdes; (2) 🟡 clase Saga VIVA en pagos: mp-webhook.handler y handleUpgradeApproved llaman MP dentro de withTenantContext + fetch OAuth de refreshMpAccessToken era el único HTTP ilimitado — mitigado acá (AbortSignal.timeout 8s + idle_in_tx app 30s→60s, margen 2× sobre worst-case ~24s), fix de la CLASE queda como insumo pre-cargado a D4 (ya estaba en su scope); (3) 🟡 purgeProcessedWebhooks sin try/catch acoplaba housekeeping a la purga legal Ley 25.326 — fix log-and-continue. Verificador confirmó empíricamente: REVOKE 056 no rompe el trigger de courts, search_path no rompe los 5 triggers (control con bug pre-existente descartado), espejos byte-idénticos, export CSV 500k filas ~1s bajo statement_timeout 15s. Gate final: typecheck ✅ lint ✅ unit 2003 ✅ integration 738/738 exit 0 ✅ isolation 123/123 ✅ canario 3× ✅.

**Cierre D5 (mismo día): 055+056 APLICADAS A PROD** con aprobación del dueño vía Supabase MCP. Verificación post-apply: app_config [15s/3s/60s/300ms], worker_config [120s/10s/120s/300ms] — `log_min_duration_statement=300ms` SÍ entró en prod (supautils lo permitió; slow query log activo, el fallback dashboard no hizo falta); 5/5 funciones con search_path fijo; anon/authenticated SIN EXECUTE en recalc_tenant_from_price, turnogol_app CON; tracking 9 filas (048–056). Decisiones del dueño: DSN Railway queda PENDIENTE (lo cambia él; `role identity check` de launch-check lo marcará en el próximo pre-deploy); upgrade a Supabase Pro DECIDIDO (backups diarios; acción del dueño en dashboard); retención audit_logs 24m + notifications 6m APROBADA (chip de implementación creado). PR #56.

## 2026-07-23 — Wave 2 D5 (continuación): wipe legal sin session_replication_role (rama claude/frosty-volhard-fe7e28)

**🔴 cerrado: el wipe Ley 25.326 §16 estaba 100% roto en prod.** `wipeTenant` abría su tx con `SET LOCAL session_replication_role='replica'` (GUC SUSET): bajo el rol real `turnogol_worker` muere en el PRIMER statement con `permission denied to set parameter`. `GRANT SET ON PARAMETER` inaplicable en Supabase (probado: falla incluso como `postgres`). Local/CI enmascaraban (pool worker cae a DATABASE_URL superusuario — clase PR #30). Evidencia prod: **0 tenants con `scheduled_deletion_at` vencido** → bug latente, ningún borrado real salteado todavía.

**Decisión (ADR `docs/decisions/2026-07-23-wipe-retencion-sin-replica-role.md`):** eliminar la necesidad del replica role en vez de recuperarlo vía SECURITY DEFINER. Censo empírico (pg_trigger/pg_constraint contra DB real): ningún trigger de usuario bloquea DELETE en las 20 tablas del wipe (la inmutabilidad de bookings terminales es BEFORE UPDATE; daily_cash_closes es append-only por REVOKE, resuelto en 057), y de las 11 aristas de FK entre ellas el orden de DELETEs solo viola UNA: la circular `bookings.payment_id → payments`.

**Implementado:**
- Migr. 058 (`058_wipe_deferrable_fk.sql` + espejo): `fk_bookings_payment` DEFERRABLE INITIALLY IMMEDIATE (semántica idéntica en operación normal) + re-afirmación idempotente de los GRANT DELETE de 057 (057 está aplicada en prod/local pero vive sin commitear en `claude/practical-kilby-322fa9` — sin esto el CI de esta rama no los tendría).
- `wipeTenant`: `SET CONSTRAINTS fk_bookings_payment DEFERRED` (per-tx, sin privilegios — verificado bajo turnogol_worker) reemplaza al GUC. Bonus de seguridad: la FK enforcement queda ACTIVA durante el wipe — una tabla futura olvidada en la lista hace fallar la tx loud en vez de dejar huérfanos silenciosos (complementa la trampa CASCADE documentada).
- Seed compartido `tests/helpers/retention.ts` (extraído del test existente) con upgrade: booking TERMINAL + FK circular REALMENTE poblada (antes el seed no la ejercitaba — un wipe roto en ese camino pasaba igual).
- **Test de rol real** `tests/integration/data-retention-worker-role.test.ts`: LOGIN temporal a turnogol_worker + WORKER_DATABASE_URL logueando COMO el rol (activa el rolconfig de 055, mismo camino que prod). Tripwire anti-enmascare (current_user/rolsuper/rolbypassrls) + test de premisa (GUC sigue denegado) + wipe completo. Cierra la clase "local enmascara" para este worker.

**Gate:** typecheck ✅ / lint 0 errors ✅ / unit worker-pool 3/3 ✅ / integration data-retention-cleanup 11/11 ✅ + data-retention-worker-role 3/3 ✅ (058 aplicada a mano a la DB local). **Verificación adversarial (Sonnet, contexto fresco): ACOMPAÑO, 0 hallazgos bloqueantes** — reconstruyó el grafo de FKs independiente (coincide 11/11 aristas), mutation test (revirtió el fix → el test de rol real falla con el error exacto de prod → restaurado byte-idéntico), grants verificados en 20/20 tablas contra DB real, suite integración completa 737/741 con 4 timeouts flaky preexistentes no relacionados (pasan aislados 4/4).

**058 APLICADA A PROD** (2026-07-23, aprobación del dueño, vía Supabase MCP con `SET LOCAL lock_timeout='3s'` de guardia): verificado post-apply `fk_bookings_payment` condeferrable=t / condeferred=f (INITIALLY IMMEDIATE), grants DELETE worker OK, tracking `20260724031838:wipe_deferrable_fk`. El wipe legal Ley 25.326 queda FUNCIONAL en prod por primera vez desde que el worker corre bajo turnogol_worker.

**Coordinación:** la rama `claude/practical-kilby-322fa9` (057 + purgas por edad D5) toca el mismo worker y este archivo sin commitear — conflicto de merge esperado, cambios ortogonales (documentado en el ADR).

## 2026-07-24 — Wave 2 D4: Flujos de integridad dinámica (rama audit/data-d4)

**Método:** 6 recon Sonnet paralelos (Saga MP-en-tx / idempotencia workers / multi-tabla+tx-catch / carreras canteen+día operativo / state machine / reconciliación) → síntesis → 3 implementers paralelos + fixes del orquestador → verificación adversarial fresca (APROBADO CON FIXES MENORES, 2 🟡 fixeados) → gate completo por release verifier.

**Fixes en fase (6 commits `audit(d4):`):**
- **F1 — clase tx-catch CERRADA en main:** rescatados los 4 fixes varados en `claude/wizardly-gates-df7198` (nunca mergeada; base a99dd94, aplicó limpio). Bug activo con daño demostrable: `completeAndChargeBookingAction` commiteaba el complete + cobros parciales ante `DayAlreadyClosedError` a mitad del loop. + `chargeDebtAction`, abonados, mis-reservas (preventivos, services fail-fast). Recon confirmó: caja limpia post-PR#50, cero instancias nuevas en 138 call sites / 71 archivos.
- **F2 — Saga D4-A1:** `getPaymentStatus` fuera de la tx del webhook MP (fase SEARCH/PROCESS, patrón mp-reconcile) + pre-check read-only de `processed_webhooks` antes del fetch (entrega repetida no repaga el GET; TOCTOU benigno, el lock transaccional decide). Asserts originales de idempotencia intactos (webhook storm 8x → 1 confirmación).
- **F3 — push-send idempotente (migr. 059):** tabla `push_send_log` (RLS ENABLE+FORCE deny-all app + REVOKE; bloque P nuevo en isolation) + claim atómico INSERT..ON CONFLICT DO NOTHING RETURNING antes de enviar + `dedupeKey` determinística `push:booking-confirmed:<bookingId>:<subId>` + purga >30d en data-retention. El comentario "the worker is idempotent" era FALSO — ahora es verdad. Espejo supabase byte-idéntico (sha256 verificado por el adversarial).
- **F4 — race tests de gaps + observabilidad:** `daily-open-race` (open-vs-open), `canteen-sell-vs-purchase-race` (venta ∥ reposición), `abonado-slots-rerun-idempotency` (cron 2x) — control positivo verificado (lock/guard comentado → test falla). + refund externo MP: audit_log `payment.external_refund_detected` + Sentry en la rama `refunded` (solo visibilidad; política = RI).
- **H1/H2 del adversarial:** guard anti falso-positivo (refund local vía `description 'Refund of <id>'` de prepareRefund → sin alerta) + `tx-catch-atomicity.test.ts` contra Postgres real con control positivo en completeAndCharge (shape viejo restaurado → caza `expected 'completed' to be 'confirmed'`; chargeDebt sin control positivo posible: sin write previo al loop + advisory lock todo-o-nada, documentado).

**Hallazgos clave NO fixeados (backlog/RI, detalle en report §2):** clase Saga en billing.service B1-B4 + handleUpgradeApproved (REQUIERE INPUT diseño fallo-parcial; flag saas_upgrade OFF amortigua) · refresh-mp-tokens fetch-en-tx (rediseño lock sesión) · send-email gap P1 conocido · updateProduct pisa stock cacheado (RI UX) · día operativo caja≠bookings CONFIRMADO (venta 01:30 cae en D+1, partido en D — RI negocio) · reconciliación contable diseñada, invariantes 1-9 (RI prioridad/canal) · `no_show→completed` inverso spec-sin-código (RI) · condición no-show time_start vs time_end doc6 (RI).

**Correcciones de estado:** MASTER_PLAN:289 decía "completed→no_show 24h NO implementada" — FALSO: trigger vigente (migr. 045, heredado de 030) la permite con `NOW() - OLD.updated_at < INTERVAL '24 hours'` y `bookings.test.ts:631-666` lo prueba con UPDATE crudo. Corregido: el gap real es el sentido INVERSO. CLAUDE.md decía 12 workers — son 13 (`dlq.ts:8-9`). 11/13 crons con retryLimit=0 real (sin SendOptions → el "retry" es el próximo tick).

## 2026-08-01 — TurnoGol v2 Fase 0: la gramática del sistema de interacción (T0/6)

**Contrato:** `docs/planning/2026-08-01-decisiones-de-fase-v2.md` §3 Fase 0 (post cadena visión→pase crítico→decisiones de fase, misma fecha). No es auditoría nueva: aplica el sistema de interacción transversal (visión v2 §6) sobre el producto ACTUAL, en 7 tandas T0–T6, cada una con gate typecheck+lint+test. Este entry cierra **T0 — Infraestructura**.

**Nota de estado del repo:** la rama cambió de `main` a `feat/visual-upgrade-admin-panel` (a96ca3f) a mitad de sesión sin acción propia — probablemente otra sesión/terminal del dueño. `git stash list` confirma el hook `epitaxy` auto-stasheó al menos un pre-switch ajeno (`fix/seguridad-xss-jsonld-hijack-abonados`), sin tocar nada de esto. No se tocó ningún stash. `main` local está desactualizada vs `origin/main` (faltan varios merges, incluida esta misma rama vía PR #94). Pendiente decidir con el dueño la rama base antes de commitear Fase 0 — hoy todo sigue sin commitear.

**Implementado (T0):**
- `src/lib/money.ts` (nuevo): fuente única de parseo/formato de plata para inputs — `parsePesosToCents` (movido desde `modules/courts/pricing-grid.ts`, re-exportado ahí para no romper call sites/tests), `centsToInputDisplay`, y `integerToWordsEsAr`/`centsToWordsEsAr` (conversión a palabras es-AR con apócope "veintiún" antes de mil/millones) + `MONEY_WORDS_THRESHOLD_CENTS` ($10.000).
- `src/components/ui/money-input.tsx` (nuevo) + stories: control de plata único (visión §6.3) — controlado (`valueCents`/`onValueChange`) o no controlado (`name`+`defaultValueCents`, hidden input en centavos, mismo patrón que `PhoneInput`), formatea con miles mientras se tipea, cursor al final, relectura en palabras arriba del umbral, clamp de min/max solo en blur (nunca trunca mientras se tipea).
- Toast con acción "Deshacer": `use-toast.ts` (`ToastAction`/`action?`, duración 10s con acción vs 4s default), `toast.tsx` (`ToastAction` sobre `ToastPrimitives.Action`), `toaster.tsx` (renderiza el botón, ejecuta + descarta al click).
- `ConfirmDialog`: prop `consequences?: string[]` → `<ul>` estandarizada (reemplaza el `<ul>` que cada caller armaba a mano en `description`, ver `StaffActions.tsx`).
- Zod locale global: `installZodLocale()` (`z.config(z.locales.es())`) llamado en `instrumentation.ts` (después de Sentry, nunca antes — memoria `sentry-server-nunca-reporto-instrumentation`) y en `tests/setup.ts` (evita que prod hable español y los tests sigan viendo inglés). Mensajes explícitos siguen ganando sobre el locale; se agregaron los que faltaban en `tenant.schema.ts` (`city`/`province`, 🔴 auditoría §4.15).
- `not-found.tsx` nuevo en `(admin)` y `(super-admin)/super-admin`; `error.tsx` nuevo en `(super-admin)/super-admin` — sin esto `notFound()` (17 call sites) expulsaba al 404 raíz sin sidebar (🔴 auditoría §7).
- `status-visual.tsx` (reservas): el fallback de un `status` desconocido dejó de ser "Jugada" (alias a `completed`) y pasa a un visual neutro "Estado desconocido" — evita que un estado nuevo sin mapear se lea como plata cobrada.
- Los 3 "Algo salió mal" (`app/error.tsx`, `global-error.tsx`, `(public)/error.tsx`) se revisaron contra la plantilla de §6.7: YA cumplían (título + qué pasó + qué hacer + referencia de digest) — **sin cambios**, evitando un refactor cosmético no pedido.

**Tests nuevos:** `tests/unit/money.test.ts` (14), `tests/unit/money-input.test.tsx` (8), `tests/unit/use-toast.test.ts` (4), `tests/unit/toaster.test.tsx` (3, con cleanup del estado global de módulo entre tests), + 1 caso nuevo en `tests/unit/confirm-dialog.test.tsx` (consequences).

**Gate T0:** typecheck ✅ / lint 0 errores (45 warnings preexistentes ajenos) ✅ / unit **287 archivos / 2331 tests ✅** (suite completa, no solo lo nuevo).

**Pendiente explícito (no es gap silencioso):** Storybook (864 stories) no corre en CI — las stories nuevas de `money-input`/`confirm-dialog` se verifican manualmente, no por gate automático. `vitest.storybook.config.ts` no tiene `setupFiles` propio (Storybook aplica sus propias preview annotations) — el locale de Zod no llega ahí; irrelevante mientras ninguna story ejercite validación Zod client-side.

**Próximo:** T1 — matriz en reservas (marcar ausente unificado + radios→chips).

## 2026-08-01 — TurnoGol v2 Fase 0 (T1/6): matriz en reservas

**Implementado:**
- **"Marcar ausente" unificado a un solo `ConfirmDialog`** en las 3 superficies donde existía (`QuickActions.tsx` desktop — antes arm-pattern de 2 clics sin texto de consecuencias; `QuickActions.tsx` menú mobile — antes ejecutaba DIRECTO sin ningún paso, 🔴 auditoría §4.5; `BookingActions.tsx` detalle — ya lo tenía bien, ahora comparte el mismo texto). `NO_SHOW_CONSEQUENCES` (mismo array literal en ambos archivos) vía la prop `consequences` nueva de T0.
- **Toast con "Deshacer"** en las 3 superficies: `revertNoShowAction` se agregó como prop OPCIONAL a `BookingQuickActions` (mismo criterio que `getBookingChargesAction`) y se cableó en `reservas/page.tsx` (`QUICK_ACTIONS`). Sin la prop (stories/tests viejos), el toast de éxito simplemente no ofrece Deshacer — no rompe nada.
- **Radios nativos ~20px → chips h-11** (🔴 auditoría §4.5): nuevo primitive `src/components/ui/radio-chip.tsx` sobre `@radix-ui/react-radio-group` (dependencia nueva, ya en la misma familia de Radix que Dialog/DropdownMenu/Toast/Tooltip) — roving tabindex + navegación con flechas + "primer ítem tabbable si nada está seleccionado" vienen gratis de Radix en vez de reimplementar el patrón ARIA a mano. Reemplaza: deposit-method (3 opciones, `QuickActions.tsx`) y cancel-type (2 opciones, en `QuickActions.tsx` Y `BookingActions.tsx`).
- **Gotcha cazado en el propio cambio:** pasar `value={cancelType ?? undefined}` a `RadioGroupPrimitive.Root` lo arranca "uncontrolled" (primer render con `undefined`) y React tira warning al pasar a un string real. Fix: `value={cancelType ?? ''}` — siempre controlado desde el mount, `''` no matchea ningún `<RadioChip>` así que el efecto visual (nada seleccionado) es idéntico.

**Tests:** reescritos 2 casos de `tests/unit/reservas-quick-actions.test.tsx` que asumían el arm-pattern viejo + 4 nuevos (ConfirmDialog con consecuencias, menú mobile unificado, toast con Deshacer, toast sin Deshacer si falta la prop); `tests/unit/booking-actions-no-show.test.tsx` nuevo (3 casos, cero cobertura previa de este flujo en el detalle). `booking-actions-cancel-preview.test.tsx` (7 casos) sigue verde sin tocar — confirma que el swap radio→chip no rompió `getByRole('radio')`/`toBeChecked()`. Actualizadas 2 stories (`QuickActions.stories.tsx`: `AusenteRequiereDobleClick` → `AusenteAbreConfirmDialogConConsecuencias` + `AusenteConfirmadoOfreceDeshacer` nueva).

**Gate T1:** typecheck ✅ / lint 0 errores ✅ / unit 288 archivos / 2337 tests ✅ / e2e chromium: `reservas-crud.spec.ts` (no-show) ✅, `TG-HP-212.spec.ts` (softban 2da ausencia) ✅.

**Hallazgo colateral (fuera de scope T1, NO tocado):** `reservas-crud.spec.ts` tiene 2 fallas e2e preexistentes en esta rama, confirmadas independientes de Fase 0 por aislamiento (`git stash` + re-run contra HEAD limpio, mismo resultado antes y después): (1) "mark completed... shows Completada status" — `getByText('Jugada')` no aparece tras completar un turno (flujo de `CompleteBookingDialog`, no tocado por T1); (2) "confirmar pago inline" — el cleanup del test falla por FK `cash_flows_booking_id_fkey` al borrar el booking seedeado. Ninguna de las dos toca `status-visual.tsx` ni el flujo de ausente. Anotado para quien audite `CompleteBookingDialog`/cleanup de este spec — no es responsabilidad de Fase 0.

**Próximo:** T2 — matriz en torneos (~16 mutaciones sin ConfirmDialog ni toast hoy, cero tests).

## 2026-08-01 — TurnoGol v2 Fase 0 (T2/6): matriz en torneos

**Implementado (4 archivos, ~16 mutaciones):**
- **`TeamsPanel.tsx`**: borrar equipo → ConfirmDialog (consequences: plantel completo + "no se puede deshacer") + toast éxito; sacar jugador del plantel → Clase A, ejecuta ya + toast con Deshacer (recrea vía `addPlayerAction` con `fullName/playerId/dni/shirtNumber` — fidelidad completa salvo id/timestamps nuevos); alta de equipo/jugador → toasts de éxito nuevos (antes silenciosos); ambos vacíos artesanales → `EmptyState`.
- **`SlotsPanel.tsx`**: liberar horarios (🔴 auditoría §4.5, "Liberar de hoy en adelante" ejecutaba con un click) → ConfirmDialog con el CONTEO real de horas que se liberan (`slots.filter(date>=hoy).length`) + toast éxito. Sin Deshacer: recuperarlas exige re-tomarlas y podrían estar ocupadas — Clase B genuina. Vacío → `EmptyState`.
- **`FixturePanel.tsx`**: borrar fixture → ConfirmDialog con conteo de partidos y, condicional, cuántos YA tienen resultado cargado (se pierden) + toast éxito. El vacío "Todavía no hay fixture" ya usaba `EmptyState` (sin cambios).
- **`ActaPanel.tsx`**: walkover → ConfirmDialog (antes ejecutaba directo); borrar resultado → ConfirmDialog con consecuencia verificada contra el código (`clearMatchResult` en `tournament-result.service.ts:274` — NO borra el acta, solo el marcador; y en llaves des-propaga el equipo aguas abajo a "A definir", mencionado condicional a `isKnockout`); borrar evento (gol/tarjeta) → Clase A, ejecuta ya + toast con Deshacer (recrea vía `addEventAction` con `matchId/teamId/teamPlayerId/type/minute`); guardar resultado y agregar evento suman toast de éxito (antes silenciosos). Vacío del acta → `EmptyState`.
- **`InscripcionesPanel.tsx`**: toast de éxito al registrar un cobro (antes silencioso); vacío → `EmptyState`. Sin cambios de fricción: "un cobro no se puede borrar" es una regla de negocio ya correcta, no una confirmación faltante.
- **`SuspendidosPanel.tsx`**: vacío "No hay jugadores suspendidos" → `EmptyState`.
- **`torneos/page.tsx`** (🔴 auditoría §4.12): eliminado el banner "Próximamente" que convivía con el propio `EmptyState`/botón "Crear el primero" cuando `total===0` — se autocontradecía (import `Sparkles` removido con él).

**Tests nuevos (cero cobertura previa de estos 4 componentes):** `torneos-teams-panel.test.tsx` (5), `torneos-slots-panel.test.tsx` (2), `torneos-fixture-panel.test.tsx` (3), `torneos-acta-panel.test.tsx` (5) — 15 casos cubriendo: ConfirmDialog no ejecuta al primer click, consecuencias visibles y correctas (conteos reales), cancelar no llama la action, Clase A ejecuta directo + Deshacer recrea con los mismos datos, EmptyState en cada vacío.

**Gate T2:** typecheck ✅ / lint 0 errores ✅ / unit 292 archivos / 2352 tests ✅ / `pnpm vitest --config vitest.storybook.config.ts` acotado a los 6 story files tocados (TeamsPanel, SlotsPanel, FixturePanel, ActaPanel, InscripcionesPanel, SuspendidosPanel): 31/31 ✅. **Nota:** correr la config de Storybook SIN acotar por archivo dispara ~255 archivos / 1004 tests con 81 fallas preexistentes en zonas no tocadas por Fase 0 (ej. `ConfirmBookingButton.stories.tsx`) — confirma otra vez que Storybook no corre en CI y acumula deuda propia; no se investigó por estar fuera de scope.

**Próximo:** T3 — matriz en el resto (impersonar, alert() de onboarding, ban unificado, abonado, super-admin).

## 2026-08-01 — TurnoGol v2 Fase 0 (T3/6): matriz en el resto

**Implementado:**
- **Impersonar** (`impersonate-button.tsx`, 🔴 auditoría §4.7/§8): `window.confirm()` nativo → `ConfirmDialog` con consecuencias. Era la acción más sensible del panel con la confirmación más débil.
- **`alert()` de onboarding** (`CourtDraftCard.tsx:249,257`): los 2 casos (subir/borrar foto) → `toast` destructive. `<Toaster/>` vive en el layout raíz, onboarding no tiene layout propio que lo excluya.
- **Ban manual unificado** (🔴 auditoría §4.11 — el hallazgo más delicado de T3): existían DOS diálogos de ban con DOS Server Actions distintas. `deudas/ManualBanDialog.tsx` llamaba `deudas/actions.ts::banPlayerAction` — **sin audit log**, motivo precargado `"Deuda incobrable de reserva"` + default 30 días (reintroducía con un click el modelo no-show=deuda revertido el 2026-07-11). `jugadores/[playerId]/BanPlayerControls.tsx` llamaba `jugadores/actions.ts::banPlayerAction` — con audit log, sin precargar nada. Unificado en un componente compartido nuevo, `src/components/admin/BanPlayerDialog.tsx` (ConfirmDialog + RadioChip, misma acción auditada en las dos superficies). Decisión del dueño 2026-08-01: **motivo vacío obligatorio + default 7 días**; "Permanente" sigue disponible, nunca sugerido. `deudas/ManualBanDialog.tsx` pasó a ser un adaptador fino (`key={player.id}` para no arrastrar datos del jugador anterior si se cambia de selección sin cerrar). `deudas/actions.ts` perdió su `banPlayerAction`/tipos/imports ahora muertos. `BanPlayerControls` ganó `playerName?` (wireado desde `JugadorProfileView.tsx` con `profile.name`) para que la confirmación nombre al jugador.
- **Abonados**: "Pausar turno fijo" (`AbonadoDialogs.tsx`) pasó de `variant="default"` a `destructive` + `consequences` (borra reservas futuras, pese a tener "Reactivar" después).
- **Quitar día cerrado** (`RemoveClosedDateForm.tsx`, hoy sin toast): ahora emite toast de éxito con **Deshacer** (Clase A) que re-invoca `addClosedDateAction` con la misma fecha + `router.refresh()`. Requirió mockear `next/navigation` en `tests/unit/horarios-forms.test.tsx` (el componente no llamaba `useRouter()` antes).
- **Activar cancha** (`CourtList.tsx`): ganó toast de éxito "Cancha activada" — antes solo "Desactivar" toasteaba (asimetría, 🟢 auditoría §7 implícito).
- **Super-admin, 3 acciones sin ninguna confirmación** (`ChangePlanSection`/`ExtendTrialSection`/`ResetPasswordSection`): ejecutaban directo al click. Ahora piden `ConfirmDialog` liviano (sin type-to-confirm — no son las destructivas de estado que ya lo tenían) con la consecuencia real (plan destino + precio, días de extensión, email del staff). Botones de confirmación con label DISTINTO al trigger (`Extender`/`Confirmar cambio`/`Confirmar reseteo`) para evitar colisión de nombre accesible entre el botón que abre y el que confirma.

**Tests nuevos:** `impersonate-button.test.tsx` (4), `ban-player-dialog.test.tsx` (5, cubre el componente compartido), `manual-ban-dialog.test.tsx` (5, prueba específicamente que ya NO usa la action sin auditar y que ya NO precarga "Deuda incobrable"+30d). Reescritas 6 stories (impersonate-button ×3, horarios ConDeshacer ×1, super-admin ExtendTrial/ChangePlan/ResetPassword ×3 con el flujo de 2 pasos).

**Gate T3:** typecheck ✅ / lint 0 errores ✅ / unit 295 archivos / 2366 tests ✅ / storybook (chromium) sobre los 8 archivos tocados con play functions: BanPlayerControls 6/6, impersonate-button 4/4, RemoveClosedDateForm 3/3, ExtendTrialSection 3/3, ChangePlanSection 4/4, ResetPasswordSection 3/3 — todos ✅ (BanPlayerControls tuvo 1 falla de "Levantar Bloqueo" en la corrida grupal, reproducida 0/2 veces en aislado — flake de orden de stories ya documentado en memoria del proyecto, no relacionado a este diff).

**Próximo:** T4 — jerarquía única de acciones de plata (15× `bg-emerald-600` → `Button`/`bg-primary`).

## 2026-08-01 — TurnoGol v2 Fase 0 (T4/6): jerarquía única de acciones de plata

**Implementado:**
- **15 sitios `bg-emerald-600` → `<Button>`/par `bg-primary`+`text-primary-foreground`** (🔴 auditoría §4.1): `RegisterMovementModal.tsx`, `ProductFormDialog.tsx`, `StockEntryDialog.tsx`, `ChargeDebtDialog.tsx`, `CompleteBookingDialog.tsx` (+`h-10`→`h-11`), `DebtListClient.tsx` (queda `<a>`, es link externo de WhatsApp, con el mismo par de clases), `BookingFormModal.tsx` (className override que reintroducía emerald-600, eliminado), `TicketPanel.tsx` (2 badges + botón "Cobrar $X"), `ActivatePlanSection.tsx` (solo el hover estaba mal), `WeeklyAvailabilityModal.tsx` (pill día activo + hover de chip horario), `QuickBookingButton.tsx`/`DashboardCanteenButton.tsx` (mismo fix duplicado en los dos). `grep -rn "bg-emerald-600" src/` = 0.
- **`BookingErrorCard.tsx`**: `<button>` crudo → `<SubmitButton>` (usa `useFormStatus`, `pendingLabel="Reintentando…"`). Ganó `md:h-12` explícito porque `size="default"` de `<Button>` deja un `md:h-10` residual que twMerge no deduplica cross-breakpoint contra un `h-12` sin prefijo.
- **Regla ESLint `no-restricted-syntax`** (`eslint.config.mjs`) contra el literal `bg-emerald-600` (string y template literal) — evita que vuelva. Verificada con control positivo (archivo temporal con la violación, detectada y borrada).
- **Consolidación de "método de pago → etiqueta"** (7 sitios duplicados encontrados por grep sistemático, más de los 2 originalmente estimados): fuente única nueva `src/lib/payment-method.ts` (`MethodKey`, `METHOD_LABELS`, `PAYMENT_METHOD_OPTIONS`) — vive en `@/lib` y no en `caja-lib.ts` porque `BookingPopover.tsx` (componente reusable en `@/components`) no puede importar de `@/app/**` (regla ESLint `turnogol/capas-components`). `caja-lib.ts` re-exporta `METHOD_LABELS`/`MethodKey` desde ahí para no tocar sus 17 consumidores existentes. Reemplazados: `BookingPopover.tsx` (`PAYMENT_LABELS` local), `BookingCharges.tsx` (`METHOD_LABELS` local — su `PAYMENT_METHODS` con iconos/color para el picker de cobro NO se tocó, es un concepto distinto y más rico), `BookingDetailCard.tsx` (`METHOD_LABEL` local), `CompleteBookingDialog.tsx`/`ChargeDebtDialog.tsx`/`RegisterMovementModal.tsx` (arrays `METHOD_OPTIONS`/`METHODS` locales → `PAYMENT_METHOD_OPTIONS`). `QuickActions.tsx`'s `DEPOSIT_METHOD_LABELS` (3 keys, sin `mercadopago`) quedó SIN TOCAR a propósito: es "cómo se cobró la seña en el mostrador", un concepto legítimamente distinto de método de pago general, no un duplicado.
- **Consolidación de formatters ARS locales** (5 encontrados por grep de `style: 'currency'`+`currency: 'ARS'`, no 2 como se estimó originalmente): `BookingPopover.tsx`, `dashboard-helpers.ts` (`formatARS` exportado — se dejó un re-export `export { formatArs as formatARS } from '@/lib/format'` para no tocar su único consumidor externo, `MetricsDashboard.tsx`), `WeeklyAvailabilityModal.tsx`, `WeeklyAvailability.tsx`, `AvailabilityGrid.tsx` (`ARS_PRICE_FORMATTER` inline) — todos reemplazados por `formatArs` de `@/lib/format`.
- Comentario actualizado en `tests/e2e/a11y/admin.spec.ts` explicando por qué `color-contrast` sigue deshabilitado pese a los 15 fixes (la mayoría vivían en modales no abiertos en el render inicial de las 6 rutas que ese test cubre).

**Gate T4:** typecheck ✅ / lint 0 errores, 45 warnings preexistentes ✅ / unit 295 archivos / 2366 tests ✅ / e2e chromium aislados: `booking-flow.spec.ts -g "S2"` (retry de pago) ✅, `admin-create-booking-ui.spec.ts` ✅. Un run agrupado con 6 tests de `qa-happy-paths` adicionales tiró 5 fallas (onboarding wizard, upload R2, grilla realtime, crear abonado) — reproducidas 0/2 en aislado cada una: flake conocido de correr muchos e2e contra un solo dev server (ver memoria `e2e-critical-flaky-no-deterministico`), no relacionado a este diff.

**Próximo:** T5 — barrido MoneyInput (20 sitios en 6 sub-lotes).

## 2026-08-01 — TurnoGol v2 Fase 0 (T5/6): barrido MoneyInput

**Método:** ejecutado vía Workflow (6 sub-lotes secuenciales, cada uno implementado por un agente y verificado por un segundo agente con contexto fresco que re-corrió typecheck/lint/test por su cuenta, sin confiar en el reporte del implementador). Primera corrida: 5 de 12 agentes murieron por un error transitorio de acceso de la organización (no relacionado al código); se resumió el workflow desde cache (`resumeFromRunId`) y los 5 restantes corrieron limpios en el segundo intento.

**Implementado (18 archivos de producción + tests/stories):**
- **Cluster A — canchas/pricing + onboarding**: `PricingSection.tsx` (5 campos: uniforme/semana/finde/día/noche), `PricingGrid.tsx` + `use-cell-selection.ts` + `PricingGridToolbar.tsx` + `PricingGridTable.tsx` (editor de celda y barra de lote de la grilla de precios — `bulkValue`/`editValue` string pasaron a `bulkValueCents`/`editValueCents`), `step-courts/{constants,use-court-drafts,CourtDraftCard,StepCourts}.tsx` (onboarding, `Draft.price:string` → `Draft.priceCents:number|null`). De paso, `src/modules/courts/pricing-grid.ts` perdió su propio `parsePesosToCents` duplicado (era `Number(digits)*100` local) y ahora re-exporta el de `@/lib/money`.
- **Cluster B — caja movimientos**: `RegisterMovementModal.tsx`, `is-valid-movement.ts` (firma pasó a `(amountCents: number|null, description: string)`), `OpenDayCard.tsx`, `CloseDayButton.tsx` (el campo "Efectivo contado" admite vacío = no declarado, preservado como `null`).
- **Cluster C — caja productos**: `ProductFormDialog.tsx` (Precio/Costo — NO Stock/Stock mínimo, esos quedan en unidades), `StockEntryDialog.tsx` (Costo por unidad — NO Packs/Unidades por pack). El schema server (`canteen.schema.ts`) ya esperaba centavos, cero fricción.
- **Cluster D — reservas/cargos**: `BookingFormModal.tsx` (modo NO controlado — `name`+hidden input, el FormData ya trae centavos), `CompleteBookingDialog.tsx`, `ChargeDebtDialog.tsx`, `BookingCharges.tsx` (3 campos, no 2 como estimaba el plan original: cargo simple + cobro dividido en 2 partes).
- **Cluster E — abonados + torneos**: `AbonadoForm.tsx` — **🔴 hallazgo real de la auditoría (§4.4), no cosmético**: el input viejo (`type="number" step="0.01"`) hacía `Number("25.000")===25` con el hábito argentino de tipear el punto de miles — un abonado de $25.000 se guardaba en $25 sin que nada lo detectara. Se rastreó la cadena completa y se renombró el campo del schema Zod de `abonados/nuevo/actions.ts` a `pricePerSessionCents` para que sea centavos de punta a punta. `TorneoForm.tsx` (inscripción por equipo — NO cupo de equipos, eso es cantidad). **Hallazgo adicional no anticipado por el plan**: `InscripcionesPanel.tsx` SÍ tenía un campo de monto editable (el plan decía que quizás ya no, había que verificar sin asumir) con el mismo patrón de bug — migrado igual.
- **Cluster F — público**: `ExplorarFilters.tsx` — eliminado el parser local duplicado `centsToPesos`/`pesosToCents`, estado pasa a `minPriceCents`/`maxPriceCents`.

**Regla aplicada en los 6 lotes**: cero `Number(x)`/`parseFloat(x)`/`Math.round(x*100)` residual sobre un valor que ya sale parseado de `MoneyInput` — confirmado por cada verificador con `git diff` + grep de la clase, no solo sobre los archivos de su lote sino cruzando contra los otros 5 (evita que un sub-lote posterior reintroduzca el patrón que uno anterior eliminó).

**Gate final (corrido por mí, combinando los 6 lotes en el mismo working tree — no hubo aislamiento de worktree, ejecución secuencial a propósito para no correr typecheck/test contra un estado a medio editar):** typecheck ✅ / lint 0 errores, 45 warnings preexistentes ✅ / unit 295 archivos, 2365 tests ✅ (2366→2365: el caso "rechaza monto no numérico" de `is-valid-movement.test.ts` dejó de aplicar, `amountCents` nunca es un string inválido por construcción — no es una pérdida de cobertura real).

**Storybook — 1 regresión real encontrada y arreglada, 2 fallas confirmadas preexistentes (no tocadas):**
- `OpenDayCard.stories.tsx:107` hacía `toHaveValue(5000)` sobre el input viejo; con `MoneyInput` (type=text, muestra "5.000" formateado) el assert correcto es `toHaveValue('5.000')` — corregido, las 16 stories de caja (Register/OpenDay/CloseDay) pasan.
- `ProductFormDialog.stories.tsx`/`StockEntryDialog.stories.tsx` tienen 2 queries desalineadas con el copy actual del componente ("Nombre" vs "Nombre del producto"; "= 24 unidades" vs "Total a ingresar: 24 unidades") — confirmado con `git show HEAD` que ya fallaban ANTES de esta sesión, sin relación a MoneyInput. No se tocaron (fuera de scope); flageado como tarea aparte.

**Próximo:** T6 — callback `/verify` (`error.code` → `'expired'`) + `docs/spec/design-system/gramatica-interaccion.md` + verificación final completa de los 5 criterios de aceptación de Fase 0.

## 2026-08-01 — TurnoGol v2 Fase 0 (T6/6): callback /verify + doc + cierre

**Implementado:**
- **§4.6 (copy 'expired' muerto)**: `src/app/api/auth/callback/route.ts` ahora inspecciona `error?.code === 'otp_expired'` (código real de GoTrue, confirmado en `@supabase/auth-js/src/lib/error-codes.ts` — cubre tanto "venció por tiempo" como "ya fue consumido", GoTrue no distingue los dos con códigos separados) antes de caer al `'exchange_failed'` genérico. Mismo patrón que `reset-password/actions.ts:50` (`error.code === 'same_password'`). Test nuevo `tests/unit/auth-callback-verify-errors.test.ts` (3 casos: otp_expired→expired, otro código→exchange_failed, sin code→exchange_failed sin explotar).
- **`docs/spec/design-system/gramatica-interaccion.md`** (nuevo): matriz completa deshacer/confirmar (Clase A/B/C con inventario real de acciones), contrato de `MoneyInput`, plantillas de vacío/error, consolidación de verdad única, checklist para código nuevo. Referenciado desde `MASTER.md` (doc20) como la fuente de verdad de INTERACCIÓN, complementaria a la de diseño visual.

**Verificación final — panel de 5 verificadores independientes (uno por criterio de aceptación), vía Workflow:**
- **Criterio 1** (cero CTA de plata fuera del sistema): **FAIL en la primera pasada** — el grep original (`bg-emerald-600`) no agarra variantes del mismo problema con otro matiz de la escala. El verificador hizo el grep de CLASE (no de instancia) que pide el propio protocolo de auditoría y encontró 2 sitios reales sin migrar: `ConfirmBookingButton.tsx` (🔴 el botón que inicia el pago de la seña en el portal público — el CTA de plata más transitado del producto) y `ActivatePlanSection.tsx` (🔴 "Activar plan", dispara una suscripción paga real) con `bg-gradient-to-r from-emerald-500 to-teal-500`/`bg-emerald-700 text-white` crudos; más `BookingErrorCard.tsx` (🟡 "Reintentar pago" — SÍ usa `SubmitButton` con loading state, pero el color seguía siendo el gradiente crudo). Los tres se migraron a `<Button>`/`bg-primary`+`text-primary-foreground` (ver diffs). Se descartaron explícitamente 6 archivos más con el mismo gradiente (`LoginGate.tsx`, `PaymentStatusWatcher.tsx`, `BookingSuccessCard.tsx`, `home/OwnerBanner.tsx`, `explorar/page.tsx`, `AvailabilityGrid.tsx`) por ser CTAs de navegación/decoración que no mueven ni cobran plata — tocarlos hubiera sido scope creep de Fase 0. Re-verificado tras el fix: `grep` limpio en los 3 archivos, gate completo (typecheck/lint/test) verde, y e2e real `booking-flow.spec.ts` (las 4 escenas S1-S4, incluye clickear "Pagar seña y reservar" y llegar a `/mock-mp/checkout`) + `TG-HP-101`/`TG-HP-103` (jugador) todos ✅.
- **Criterio 2** (matriz deshacer/confirmar): CONFIRMED — 34 tests de reservas+torneos re-corridos, `consequences=` en 10 sitios distintos, cero `window.confirm()`/`alert()` ejecutables.
- **Criterio 3** (100% MoneyInput): CONFIRMED — los 22 `type="number"` restantes son todos no-plata (goles, cupos, stock, días, %, minutos, un prop de Recharts); 3 diffs completos releídos confirman centavos de punta a punta.
- **Criterio 4** (plantillas vacío/error): CONFIRMED.
- **Criterio 5** (🔴 cerrados): CONFIRMED, los 7 hallazgos (§4.1/§4.4/§4.5/§4.6/§4.11/§4.12/§4.15) verificados uno por uno contra código real, no contra resúmenes.

**Recorrido manual** (navegador real, `pnpm dev` + login staff con credenciales seed de e2e): tipear "25000" en el monto de un movimiento de Caja muestra "25.000" + relectura "veinticinco mil pesos"; el movimiento guardado llega a la tabla como "+$ 25.000,00" exacto (sin corrimiento de orden de magnitud) — confirma la cadena de datos en centavos end-to-end en un flujo real, no solo en tests.

**Hallazgo colateral (no es un bug, es un artefacto de esta sesión de QA manual)**: correr `booking-flow.spec.ts` con el dev server manual del navegador todavía abierto en el puerto 3000 hace fallar S1/S2/S3 (Playwright reusa ESE server, sin los env vars `MP_MOCK_MODE=1`/`NEXT_PUBLIC_E2E=1`, así que el redirect a `/mock-mp/checkout` nunca pasa). Aislado con `git stash` (mismo fallo en código sin tocar) + parar el preview del navegador → los 4 tests pasan limpio. Coincide con la memoria del proyecto "Next 16: un solo dev por working dir".

**Gate final combinado (T0-T6, todo el diff de Fase 0 en un solo working tree):** typecheck ✅ / lint 0 errores, 45 warnings preexistentes ✅ / unit 296 archivos, 2368 tests ✅ / e2e chromium: `booking-flow.spec.ts` (4/4), `admin-create-booking-ui.spec.ts`, `TG-HP-101`, `TG-HP-103`, `reservas-quick-actions`+`booking-actions-no-show` (19 tests), 4 archivos de torneos (15 tests) — todos ✅.

## Fase 0 — CERRADA (2026-08-01)

Los 5 criterios de aceptación del contrato (`docs/planning/2026-08-01-decisiones-de-fase-v2.md` §3) están verificados contra código real por un panel de verificadores independientes con contexto fresco, con un hallazgo real corregido en el camino (2 CTAs de plata sin migrar que el grep original no agarraba). Sin commits (regla del repo desde el arranque) — todo el diff de T0-T6 sigue en el working tree de `feat/visual-upgrade-admin-panel`, pendiente de que Lazar decida cómo particionarlo en PRs.

## 2026-08-02 — TurnoGol v2 Fase 1: la plata visible (T0-T7)

**Contrato:** `docs/planning/2026-08-01-decisiones-de-fase-v2.md` §3 Fase 1 (entrada: Fase 0 cerrada). 6 criterios de salida, 8 tandas T0-T7, mismo gate por tanda que Fase 0 (typecheck+lint+test). Rama `claude/contrato-fase-1-re4zma`, un commit por tanda.

**T0 — Fuente única de agregados (`5432bca`):** `street-money.service.ts` (nuevo) — `getStreetMoney`/`sumStreetMoney` unen los 3 orígenes de deuda (turnos jugados sin cobrar, fiados de cantina abiertos, cuotas de inscripción de torneo impagas) en una sola función, la ÚNICA que arma el listado y suma el total (criterio de salida #5). `getDebts` se mueve de `app/(admin)/deudas/queries.ts` a `modules/bookings/booking.debts.ts` (un módulo no puede importar de `app/`); `deudas/queries.ts` reexporta para no romper su caller.

**T1 — Encabezado perpetuo en /caja (`5d23caa`):** `CajaHeaderStats` (nuevo) — cobrado hoy + plata en la calle (linkea a `/caja/deudas`) + estado de caja, visible SIEMPRE, con el día abierto o cerrado (criterio #1).

**T2 — Tab "Plata en la calle" (`8acc13a`):** nueva tab `/caja/deudas` — los 3 orígenes en una lista con chip por origen + "Cobrar" por fila (`StreetMoneyChargeDialog`). `SplitPaymentFields` (extraído de `deudas/ChargeDebtDialog.tsx`, primer caller) cubre método mixto para turnos desde el día 1; fiados/torneos cobran con su capacidad de ese momento (método único / parcial) hasta T3/T4 (criterio #2).

**T3 — Cobro mixto en fiados de cantina (`a021acf`):** `settleTab` pasa de `method` único a `charges[]` (1-5 líneas monto+método), validando que sumen EXACTO el total del ticket — un fiado no admite parcial, el producto ya se entregó. `chargeSplitPayment` nuevo en `cashflow.service.ts`: el loop de `createCashFlow` con idempotencia por línea (`${key}-${i}`), compartido en vez de reimplementado por cada caller.

**T4 — Cobro mixto en cuotas de torneo (`ef6d010`):** `registerInscriptionPayment` pasa a `charges[]` vía `chargeSplitPayment`, con pago PARCIAL permitido (a diferencia de fiados). `InscripcionesPanel` y el diálogo de Plata en la calle adoptan `SplitPaymentFields`. T3+T4 cierran el criterio #3 (D2, método mixto) para los 3 orígenes.

**T5 — Cierre guiado: pulido (`7ed07ce`):** `CloseDayButton` ya cubría el criterio #4 (esperado pre-calculado antes de contar, diferencia con motivo capturado en el momento) desde antes de Fase 1 — se refuerzan los 3 pasos con eyebrows visuales en el mismo diálogo en vez de partirlo en pantallas separadas. El desglose por método (parte del criterio #3) ya vivía en `MethodBreakdown` — sin cambios de código.

**T6 — Instrumentación de proxies (`7499b47`):** categoría `cashflow` en `track` (`breadcrumbs.ts`) — `close.opened`/`close.confirmed` (duración + diferencia declarado-esperado) desde `CloseDayButton`, y `street_money.viewed` (total) desde `/caja` y `/caja/deudas`, misma fuente (`getStreetMoney`) que ya alimenta la pantalla, así que el dato instrumentado nunca diverge de lo que ve el usuario. Cierra el criterio #6 (Sentry ya es la herramienta de observabilidad del proyecto — "instrumentado/baseline-ready" es el criterio literal, no "graficado").

### T7 — Test de consistencia + revisión adversarial + gate final

**Tests nuevos:**
- `tests/integration/street-money-consistency.test.ts` (7 casos, nuevo): seedea los 3 orígenes (turno `completed` sin cobrar $8.000, fiado abierto $3.000, cuota de torneo impaga $4.500) y verifica que `getStreetMoney`/`sumStreetMoney` traen los 3, ordenan por antigüedad ascendente, dan el MISMO total en dos lecturas consecutivas, aíslan por tenant, y bajan el total al cobrar un origen sin tocar los otros dos. Es la verificación literal que pide el criterio #5 ("garantizado por diseño y verificado con test de consistencia — no a ojo").
- `tests/integration/tournament-inscriptions.test.ts`: +4 casos — método mixto de verdad en una sola llamada (2 líneas, 2 métodos), carrera de 2 cobros concurrentes que juntos superan lo pendiente (mismo patrón `Promise.allSettled` que `daily-close-concurrent-cashflow.test.ts`: uno gana, el otro `InscriptionOverpaidError`, nunca sobre-cobra) con guard `EFFECTIVE_POOL_MAX>=2`, y la regresión del hallazgo crítico de abajo.

**Revisión adversarial (Workflow, 4 lentes independientes — aislamiento tenant/RLS, dinero+concurrencia, arquitectura/convenciones, corrección de tests — cada hallazgo verificado por un 5° agente que intentó refutarlo con contexto fresco):** no se pudieron correr los tests de integración contra Postgres real en esta sandbox (sin Docker), así que esta revisión fue la única red de seguridad real sobre la lógica de plata y concurrencia antes de cerrar la fase. 5 hallazgos, los 5 CONFIRMADOS, ninguno refutado:

- 🔴 **CRÍTICO — sobre-cobro real en `registerInscriptionPayment`** (`tournament-payment.service.ts:211`): el atajo de idempotencia ("la key de la línea 0 ya existe → salteo TODA la validación") asumía que un reintento con la misma `clientIdempotencyKey` siempre reenvía el MISMO array de `charges`. Si el cliente reusa la key pero MUTA el array (ej.: la respuesta del primer cobro se pierde en tránsito — el catch de `StreetMoneyChargeDialog` no resetea `lines`/`idempotencyKey` — el admin agrega una línea al diálogo abierto y reenvía con la misma key), las líneas NUEVAS se insertaban vía `chargeSplitPayment` sin pasar por el `FOR UPDATE` ni por `InscriptionOverpaidError`: un equipo con arancel de $10.000 terminaba con $17.000 en `cash_flows`. **Fix:** se eliminó el atajo por boolean — ahora SIEMPRE se toma el lock y se valida, pero solo cuenta contra `pending` lo que es genuinamente NUEVO (línea cuya key todavía no tiene fila); una línea ya commiteada es un no-op garantizado por el `ON CONFLICT` de `createCashFlow`, así que no puede rechazar un reintento legítimo, y una línea agregada de más sigue sin poder colarse. Regresión cubierta con un test nuevo (`tests/integration/tournament-inscriptions.test.ts`) que reproduce el escenario exacto.
- 🟡 **MEDIO — duplicación de UI**: `deudas/ChargeDebtDialog.tsx` (la página `/deudas`, de donde `SplitPaymentFields` se había extraído en T2) nunca se migró al componente compartido — tenía su propia copia manual de `ChargeLine`/handlers/JSX, mientras los otros 3 diálogos (`StreetMoneyChargeDialog`, `FiadosList`, `InscripcionesPanel`) sí usan `SplitPaymentFields`. **Fix:** migrado a `SplitPaymentFields`/`newChargeLine`, mismo patrón que los otros 3 — de paso unifica el copy del botón de atajo ("Saldar todo en efectivo" → "Pagar todo en efectivo", igual que el resto).
- 🟡 **MEDIO — test de carrera sin guard de pool**: el test nuevo de concurrencia en cuotas de torneo (T7) no tenía el guard `EFFECTIVE_POOL_MAX>=2` que sí tienen los otros 4 tests de carrera del repo (`race-admin-vs-online`, `concurrent-cancellation`, `billing-race-conditions`, `rls-pool-poisoning`) — con `DATABASE_POOL_MAX=1` local el test seguiría verde pero dejaría de ejercitar la serialización real por `FOR UPDATE`. **Fix:** agregado, mismo patrón que `billing-race-conditions.test.ts`.
- 🟢 **BAJO — `chargeDebtAction` (`deudas/actions.ts`) sin migrar a `chargeSplitPayment`**: seguía con el loop manual de `createCashFlow` + key por línea a mano, pese a ser el patrón del que `chargeSplitPayment` se extrajo en T3. **Fix:** migrado; `tests/unit/charge-debt-action.test.ts` actualizado (mockeaba `createCashFlow`, ahora mockea `chargeSplitPayment` y verifica además la forma del builder por línea).
- 🟢 **BAJO — comentario impreciso sobre atomicidad**: `getStreetMoney` corre los 3 `SELECT` con `Promise.all` "en la misma tx", pero bajo READ COMMITTED (default, nadie sube el nivel de aislamiento) no comparten una única snapshot — cada uno toma la suya al ejecutarse. Sin impacto real (los 3 orígenes son conjuntos disjuntos, nunca duplica ni pierde plata dentro de una respuesta), pero la garantía real no estaba documentada. **Fix:** comentario aclaratorio en `street-money.service.ts`, sin cambio funcional (subir a SERIALIZABLE sería costo real para un problema cosmético).

**Gate final (T0-T7, todo el diff de Fase 1 en un solo working tree):** typecheck ✅ / lint 0 errores, 45 warnings preexistentes ✅ / unit 297 archivos, 2375 tests ✅ (incluye los tests nuevos de T7 + el fix del mock de `charge-debt-action.test.ts` tras migrar `chargeDebtAction`). **Pendiente explícito (no es gap silencioso):** los tests de integración nuevos (`street-money-consistency.test.ts`, +4 casos en `tournament-inscriptions.test.ts`) no se pudieron ejecutar contra Postgres real en esta sesión (sandbox sin Docker) — verificados por lectura exhaustiva de los helpers/servicios reales contra los que corren (uno de los 4 lentes de la revisión adversarial fue exactamente esto), pero quedan sin un primer run real hasta que alguien los corra con `pnpm supabase:start` + `pnpm test:integration` (local o CI).

## Fase 1 — CERRADA (2026-08-02)

Los 6 criterios de salida del contrato están implementados y, para el criterio #5 (fuente única de agregados), verificados con un test de consistencia dedicado. Un hallazgo crítico real (sobre-cobro en cuotas de torneo bajo un reintento que reusa la idempotency key con un array mutado) se encontró y corrigió en el camino gracias a una revisión adversarial de 4 lentes independientes con verificación cruzada por un 5° agente — sin ella el bug hubiera quedado sin detectar, porque ningún test existente ejercitaba ese camino. Pendiente antes de considerar la fase verificada de punta a punta: correr los tests de integración nuevos contra Postgres real (esta sandbox no tiene Docker).

**Pendiente cerrado 2026-08-02** (sesión de Fase 2, con Docker/Supabase local disponible): `pnpm test:integration tests/integration/street-money-consistency.test.ts tests/integration/tournament-inscriptions.test.ts` — **27/27 verde** (7 + 20 casos) contra Postgres real. Fase 1 queda verificada de punta a punta, sin gaps.

## Fase 2 — "Hoy" (2026-08-02/04)

Contrato: `docs/planning/2026-08-01-decisiones-de-fase-v2.md` §3, Fase 2. Evoluciona `/dashboard` (label "Inicio" → "Hoy") hacia 3 números + "Mientras no estabas" + "Necesita tu atención", cero gráficos. Decisiones de producto confirmadas por Lazar antes de arrancar: umbral "turno sin cobrar" = inmediato (sin ventana de gracia); resumen diario D8 = reporta el día de AYER, push 08:00 ART (ajustado de 07:00: cae en horario silencioso del push, 07:00 nunca se entregaba antes de las 08:00 igual) + email opt-in default false; nav renombrado "Inicio"→"Hoy" ya; accesos rápidos (reservar/cantina) sacados de la pantalla.

**Hallazgo colateral P0, no relacionado a Fase 2, arreglado en el camino:** `public/sw.js` tenía un error de sintaxis real desde el commit `adb1729` (2026-07-25, ya en main) — un fragmento de texto corrupto pegado al inicio del archivo (residuo de un sed/reemplazo mal hecho en ese commit) rompía el parseo completo del Service Worker. Confirmado con `node --check`: `SyntaxError: Unexpected token ')'`. El push de notificaciones (feature documentada en CLAUDE.md) estuvo **completamente roto en producción** desde esa fecha — el SW nunca se registra en el navegador. Nadie lo detectó porque ningún test carga/parsea el archivo real (`tests/e2e/push.spec.ts` inyecta mensajes por BroadcastChannel a propósito, documentado en su propio header, para no depender de VAPID+FCM real en CI). Arreglado (se borró el prefijo corrupto). Chip spawneado para agregar cobertura de regresión (parse-check de `public/sw.js`).

**Implementación:**
- `src/modules/home/` (nuevo): `home.types.ts`/`home.lib.ts`/`home.service.ts` — agregador único `getHoyData`, reusa `getStreetMoney` (Fase 1) sin recalcular, reusa `daySlotsFor`/`occupancyForDay` (day-bookings.ts).
- `docs/decisions/2026-08-02-taxonomia-alertas-hoy.md` (nuevo, criterio de entrada del contrato): 3 alertas v1, prioridad P1→P3, umbrales confirmados por Lazar.
- Guard D5: `dashboard/page.tsx` rebota manager→`/grilla`; `admin-sidebar.tsx` con `requiresAdmin`. Reconciliado a mano con PR #98 (fix de anchor `tour-grilla`, mergeado a origin/main durante la sesión por un agente spawneado en paralelo).
- UI: `dashboard/page.tsx` reescrito (3 números + `NeedsAttention`/`WhileYouWereAway` nuevos), `QuickBookingButton`/`DashboardCanteenButton`/`UpcomingBookings` borrados (huérfanos, 0 otros callers).
- D8: `src/shared/jobs/workers/daily-summary.worker.ts` (nuevo, cron 08:00 ART), template `daily-summary.ts`, flag `daily_summary_email_opt_in` en `TenantSettings`, UI `/settings/avisos`.
- Tests nuevos: `home.lib.test.ts` (10), `home-service.test.ts` (15), `home-service-operating-day.test.ts` (2), `daily-summary-worker.test.ts` (4), `tests/e2e/hoy-screen.spec.ts` (3) + storage-state `manager` nuevo en la infra e2e (`seed-e2e.ts`/`fixtures.ts`/`global-setup.ts`).

**Revisión adversarial (Workflow, 5 lentes independientes — dinero/concurrencia, aislamiento tenant/RLS, arquitectura/convenciones, fidelidad al contrato, calidad de tests — cada hallazgo verificado por un 6° agente que intentó refutarlo con contexto fresco):** 17 hallazgos crudos, 16 confirmados, 1 refutado (pero el refutador encontró un problema real distinto en el camino — ver abajo). Todos los hallazgos accionables corregidos en la misma sesión:

- 🔴 **CRÍTICO — gap de cobertura de día operativo**: TODOS los tests de `home-service.test.ts`/`daily-summary-worker.test.ts` fijaban `cutoffMins=0`/`closesNextDay=false` — el branch real de día operativo (`operatingDayRangeUtc` con cutoff>0) nunca se ejercitaba para `getHoyData`, pese a que `dashboard/page.tsx` y el worker D8 lo calculan dinámico en producción. **Fix:** `tests/integration/home-service-operating-day.test.ts` nuevo, mismo patrón que `cashflow-operating-day.test.ts` — verificado con ruptura controlada (rompí `hasCashFlowsOnDate` a propósito, confirmé rojo, revertí, confirmé verde).
- 🟡 **MEDIO — alerta "seña rechazada" obsoleta tras reintento exitoso**: `getFailedDepositsToday` no filtraba si el pago rechazado seguía siendo el activo del booking. Un reintento exitoso (seña #2 aprobada) dejaba la alerta de la seña #1 colgada en "Necesita tu atención" todo el día, mandando al staff a revisar una reserva ya cobrada. **Fix:** filtro `p.id = b.payment_id` + test de regresión.
- 🟡 **MEDIO — push de `daily_summary` sin dedupeKey**: un retry de pg-boss (retryLimit=3 real en `push-send`) podía duplicar el resumen diario visible al admin — solo `booking.confirmed_online` tenía dedupeKey. **Fix:** dedupeKey determinística `push:daily-summary:{tenantId}:{date}:{subId}` + assertion en el test del worker.
- 🟡 **MEDIO × 4 — gaps de cobertura**: `occupancy` nunca asserteado, `cashClosed=false` nunca probado, "caja abierta sin actividad" (operando izquierdo del OR) nunca aislado del derecho, orden P1→P3 con ≤1 ítem por categoría no discriminaba si el `sort` se invocaba o no. **Fix:** 4 casos nuevos en `home-service.test.ts` (uno de ellos, el de orden, mejorado con 2 ítems P1 reales y verificado igual que el crítico).
- 🟢 **BAJO × 6**: typo `'cancelled'`→`'canceled'` en el doc de taxonomía (código real ya estaba bien); JOINs a `courts` sin `tenant_id` repetido (defensa en profundidad, mitigado por RLS FORCE — arreglado igual, barato); test de aislamiento cross-tenant sin datos para las 4 queries nuevas de "mientras no estabas" (documentado, no arreglado — RLS + filtro explícito ya cubren dos capas); "seña fallida" bucketea por `created_at` no por "momento del fallo real" (`processed_at` es NULL a propósito para rechazados) — mitigado por el hold de 6 min, documentado como límite conocido, sin fix (requeriría columna nueva); copy del vacío-premio duplicado en 3 archivos sin chequeo cruzado (trade-off arquitectónico ya documentado en el código — la regla "componente reusable no importa valores del dominio" lo exige); alcance del resumen diario a todo el staff (no solo admin) pese a D5 — **REQUIRE INPUT resuelto por Lazar: se deja así** (el manager ya ve esos números en Caja, no es fuga de datos).
- ⚪ **Refutado pero productivo**: el hallazgo original sobre cleanup de `hoy-screen.spec.ts` era incorrecto (sí limpia bien, try/finally), pero el 6° agente encontró en el camino que el slot original (06:00-07:00) chocaba EXACTO con `reservas-crud.spec.ts:358-359` (mismo tenant/court/día) — colisión real en corridas locales multi-worker. **Fix:** slot cambiado a 05:00-06:00.

**Gate final (T0-T8):** typecheck ✅ / lint 0 errores, 44 warnings preexistentes (uno menos que Fase 1: se borró código muerto) ✅ / unit 297 archivos, 2377 tests ✅ / integration 122 archivos, 966 tests ✅ / isolation 162/162 ✅ / e2e chromium: `hoy-screen.spec.ts` (3/3), `critical-flows/*` (4/4), `admin-login.spec.ts` (6/6), `theme-toggle.spec.ts` (2/2), `onboarding.spec.ts` (8/8, incluye el tour de coachmarks arreglado por PR #98), `first-booking-aha.spec.ts` (1/1), `TG-HP-226.spec.ts` (falla, pero confirmado con `git stash` que es un bug preexistente NO relacionado — el usuario recién invitado queda en `/reset-password`, ajeno al guard D5 — reportado aparte), `reservas-crud.spec.ts` (2 fallos preexistentes confirmados corriendo el spec solo, sin relación a esta sesión — mismo flake documentado en memoria del proyecto).

**PR:** [#101](https://github.com/Laza223/turno-gol-repo/pull/101) (rama `feat/fase2-hoy-home-admin`), CI corriendo al momento de abrir.

## Fase 3 — BLOQUEADA (no arranca sola)

Entrada del contrato (`decisiones-de-fase-v2.md:111`): **(1)** máquina de estados del slot documentada cubriendo TODAS las combinaciones reales de reserva+seña+cancelación (no solo los 6 estados felices) — no existe el doc; **(2)** prototipo navegable mostrado a ≥3 dueños/encargados prospecto — no hecho, es venta. Regla anti-túnel (§3): tampoco Fase 2 cerró del todo — su propio criterio de salida #4 ("demo comercial usada en ≥1 reunión real") sigue pendiente, es tarea de Lazar, no de código.

**Próximo paso ofrecido, pendiente de que Lazar lo pida:** redactar el borrador de la máquina de estados del slot (leyendo `bookings`/`deposit_status`/cancelaciones reales) como insumo técnico del gate — no reemplaza el prototipo ni la validación con prospectos, que siguen siendo responsabilidad de Lazar.

## Fase 2 — CERRADA (2026-08-04)

## 2026-08-04 — Fase 3: máquina de estados del slot (criterio de entrada #1)

Lazar pidió redactar el borrador ofrecido arriba. Nuevo doc: `docs/planning/2026-08-04-maquina-estados-slot.md` (rama `docs/fase3-maquina-estados-slot`, sin commitear). Compone `doc6_entidades.md` (máquina de la entidad `Booking`) + `pages/grilla.md`/`BookingCard.slotVisual` (mapa visual real) + lectura directa de `booking.state-machine.ts`/`booking.cancellation.ts`/`ptr.service.ts`/migraciones — tabla combinatoria de 15 filas (no solo los 6 "estados felices"), cubre reserva+seña+cancelación+no-show+torneo+abonado+bloqueo.

**Hallazgos documentados (no corregidos, es un doc de mapeo, no un fix):** `canceled_refunded`/`canceled_no_refund`/`expired` son invisibles en la grilla (la query los excluye, `grilla/page.tsx:63`) pero sí visibles en `/reservas` — dos vistas con universos de estado distintos, nunca escrito como decisión explícita; `doc6_entidades.md` y `pages/grilla.md` no incluyen `type='tournament'` (migr. 062); 3 implementaciones de "status-visual" (grilla/reservas/canchas/abonados) desincronizadas por diseño, con sync 100% manual; `pending_payment→expired` "admin fuerza manualmente" documentado en doc6 pero no existe en código (el único camino es automático); comentario del worker de expiración dice 15min, la constante real es 6min.

**Criterio de entrada #1 de Fase 3: CERRADO.** Criterio #2 (prototipo validado con ≥3 prospectos) sigue pendiente — **Fase 3 sigue BLOQUEADA**, ahora por un solo criterio en vez de dos. El doc deja 4 decisiones de diseño marcadas "REQUIERE INPUT" (§8) para cuando Fase 3 arranque de verdad: estado transitorio de cancelada/expirada en la grilla, si "terminado sin cobrar" distingue no-show con seña capturada de sin seña, unificar o no las 3 implementaciones de status-visual, y qué hacer con no-show sobre una hora de torneo.

## 2026-08-04 — Fase 3: la Grilla (T0–T5)

Contrato: `docs/planning/2026-08-01-decisiones-de-fase-v2.md` §3, Fase 3. Rama `feat/fase3-grilla`.

**Desvío consciente del contrato, decidido por su dueño:** el criterio de entrada #2 (prototipo navegable validado con ≥3 dueños/encargados prospecto) NO se cumplió. Lazar vio un prototipo navegable, lo aprobó y decidió arrancar sin la ronda de validación con prospectos. Queda registrado como decisión de producto, no se re-litiga.

**Decisiones de producto confirmadas antes de arrancar:** reprogramar mueve cancha+día+horario dentro de la ventana de anticipación y **recalcula** el precio a la franja destino (el precio pertenece a la franja, no a la reserva); alarma "sin cobrar" = `completed` con saldo > 0, más `no_show` sin nada capturado (un no-show CON seña capturada no alarma: ya cobraste lo único cobrable); cancelada/expirada siguen invisibles en la grilla; no-show sobre hora de torneo no se ofrece; popover de alta con 2 campos + precio pre-calculado, con link al `BookingFormModal` completo.

### T0 — Migración 070: relajar `price_snapshot`

Bloqueante de reprogramar. `enforce_booking_invariants_fn` (regla 2) prohibía cambiar `price_snapshot` incondicionalmente desde la migr. 005. `070_reschedule_price_recalc.sql` (+ espejo `supabase/migrations/20260424000070_*.sql`) abre una excepción **acotada**: solo si `OLD.status IN ('confirmed','pending_payment')` **y** cambió el slot físico (`starts_at` o `court_id`). Re-declara `SET search_path = 'public'` — sin eso, `CREATE OR REPLACE FUNCTION` resetea `proconfig` y deshace en silencio el hardening de la 056.

Verificado con **ruptura controlada**: se revirtió el trigger a la versión de la 060, se confirmó que exactamente los 4 tests de "permite" quedaban rojos, se reaplicó, verde. `tests/integration/booking-price-immutability.test.ts` (8 casos).

### T1 — Fuente única de estado visual + alarma

Había **6** mapeos estado→visual desincronizados en 3 shapes distintas, con `GridLegend.tsx:16` pidiendo por comentario mantenerlos iguales (y los tints ya divergían). Dos módulos nuevos: `src/lib/status-tone.ts` (tabla de tokens por tono, cross-dominio) y `src/lib/booking/slot-visual.ts` (`slotStateKey`/`gridSlotVisual`/`bookingBadgeVisual`/`GRID_LEGEND_ITEMS`, todo derivado de UNA tabla). Preserva la divergencia deliberada: la grilla distingue "Señada" de "Confirmada", la lista no. `src/components/ui/status-badge.tsx` reemplaza 4 Badge duplicados. Arrastra el fix de contraste AA: `bg-muted text-muted-foreground` (4.21:1) estaba en abonados/canchas/staff. `tests/unit/slot-visual.test.ts` (24 casos — antes no había NINGÚN test unitario de los 6 mapeos).

### T2 — `GridBooking` con saldo pendiente

La alarma necesita plata, no estado. `grid-cells.ts` suma `totalPaid`/`pending`, calculados server-side con `summarizeBookingCharges` (la misma función que usa el detalle: los dos números no pueden divergir). Query agregada nueva `sumBookingChargesByBooking` (una sola pasada para todo el día, no una por celda) con `VALUES` CTE parametrizado. 🔴 **Gotcha del contrato cerrado acá, no en T5:** `getBookingCharges` no filtraba por `category` — se le agregó `AND category = 'booking'`, porque el agregado batch y el detalle tienen que coincidir. `tests/integration/booking-charges-batch.test.ts` (6). `use-booking-realtime.ts` arrastra el saldo previo en INSERT/UPDATE (`carryMoney`): los `cash_flows` no replican por el canal de bookings, así que Realtime nunca puede traer el saldo.

### T3 — Reprogramar: backend

`src/modules/bookings/booking.reschedule.ts` nuevo. Es un UPDATE del MISMO booking (conserva id, seña y cobros; no ensucia métricas con una cancelación que nadie hizo). Reescribe las **seis** columnas del slot juntas — dejar `starts_at`/`ends_at` viejos haría que el exclusion constraint no vea el choque real. `assertSlotFreeForOther` agrega `AND id <> bookingId` (el `checkOverlapOrThrow` de creación matchearía el turno contra sí mismo). **Orden de locks documentado y probado**: cancha destino ANTES del booking, porque `createManualBooking` lockea la cancha y después inserta — al revés habría deadlock real entre crear y reprogramar sobre la misma cancha. Doble `invalidateCourtDateSlots` (origen + destino): ningún flujo previo movía un booking. Template `booking-rescheduled` + `rescheduleBookingAction` (try/catch FUERA de `withTenantContext`, email post-commit no bloqueante). `tests/integration/booking-reschedule.test.ts` (15).

### T4 — Panel lateral: shell + cobrar + marcar ausente

`BookingSlotPanel` (Sheet `side="right"`, variante nueva) reemplaza el popover de solo-lectura. El hover se fue a propósito: no existe en touch y el mostrador usa tablet. Se van ~90 líneas de `slotVisual` privado y ~60 de hover-intent (3 timers); la celda ocupada pasa a ser un solo `<button>` con el `placement()` directo. Cobrar tiene 3 caminos porque el backend valida estados distintos: `settle` (jugado con saldo), `finish` (confirmado y terminado → cobra y cierra en un paso), `advance` (todavía no terminó → adelanto, y ahí se fuerza UNA línea porque `addBookingChargeAction` no acepta mixto — mostrar el mixto y mandar solo la primera sería cobrar de menos sin avisar). `NO_SHOW_CONSEQUENCES` estaba duplicado literal en 2 archivos: extraído a `src/lib/booking/no-show-consequences.ts`.

🔴 **Bug que solo apareció corriendo la app:** después de cobrar $24.000, la plata llegó a `cash_flows` pero la grilla seguía en rojo. `useBookingRealtime` lee `initialBookings` solo al montar, así que `router.refresh()` solo no alcanza. Una alarma que no se apaga después de cobrar entrena al staff a ignorarlas. Fix: prop `onMutated` → `router.refresh()` + `refetch()`. Re-verificado en el navegador: quedó "Jugada" verde.

Otros dos hallazgos propios: `Date.now()` en render era impuro **y** ignoraba el día operativo (un turno de madrugada de un complejo `closes_next_day` habría contado como terminado sin haber pasado) — pasó a ser prop `hasEnded`, decidida por la grilla. Y los tests de "torneo/bloqueo no ofrecen marcar ausente" pasaban **vacíos** (`renderGrid` nunca pasaba las acciones, así que el panel no renderizaba ningún botón): se les agregó un control positivo.

### T5 — Panel lateral: cantina + reprogramar (UI)

**Cantina atada al turno.** `SellTicketInput.bookingId?` + `sellTicketSchema` + `createCashFlow`. El cash_flow sigue siendo `income`/`product_sale`: el `booking_id` es una etiqueta de origen, NO un pago del turno.

🔴 **Barrido de clase, no de instancia.** La feature crea un tipo de fila nuevo: `booking_id` no nulo con categoría distinta de `booking`. Toda query que asuma "`booking_id` ⇒ es plata del turno" queda mal. Barrido de los 6 lectores: `getBookingCharges` ✅ (T2), `sumBookingChargesByBooking` ✅ (T2), `booking.debts.ts` ✅ (ya filtraba), reconciliación INV1 ✅ / INV9 ✅ (ya filtraban), `getCashFlowsForExport` — sin cambio a propósito (la fila sigue diciendo `product_sale`, la columna "cancha" es información extra). **El único roto era `getRevenueReport` Q2a** ("ingreso por cancha"), sin filtro de categoría: la cerveza se habría contado como facturación de la cancha. Fix + `tests/integration/reports.test.ts` (2 casos nuevos), verificado con **ruptura controlada** (sin el filtro, la cancha "factura" $5.900 en vez de $5.000).

El `bookingId` se valida con `AND tenant_id = ...` explícito además de RLS (convención del propio módulo, `lockProducts:48`). No es ceremonia: **el test cross-tenant lo detectó** — el FK a `bookings` corre con los permisos del dueño de la tabla y no ve RLS, y con el DSN superusuario del entorno local RLS tampoco filtra, así que el turno ajeno entraba. `tests/integration/canteen-sale-booking-link.test.ts` (5 casos).

**Reprogramar (UI).** `BookingRescheduleDialog` + `listRescheduleSlotsAction`. `getAvailableSlots` no sabe de ventana de anticipación ni de hora actual: las dos se aplican en la action. El predicado "ya pasó" se extrajo de `useGridLayout` a `slotHasPassed` (`shared/time/operating-day.ts`) y lo usan los dos — si divergieran, el panel ofrecería mover un turno a un hueco que la grilla ya pinta como pasado. `artNowParts()` bajó a `shared/dates/art.ts` para que el server use el mismo reloj (estaba en un módulo `'use client'`). El diálogo muestra el precio de cada hueco y avisa explícito cuando el cambio mueve la plata.

**Frontera de arquitectura:** el diálogo de cantina reusa el `TicketPanel` real de /caja/cantina, y un componente de `@/components` no puede importar de `@/app` (regla de lint). Mover `TicketPanel` habría arrastrado `caja-lib` y sus 17 consumidores, o sea un cambio estructural. En su lugar el diálogo vive en `app/(admin)/grilla/_components/` y `GrillaView` (client wrapper mínimo) lo inyecta como `renderCanteenDialog` — una Server Component no puede pasar un componente por prop, solo elementos y Server Actions.

**Verificación en la app real** (dev server + Playwright headless contra ese mismo server, no solo tests):
- El panel del turno ofrece: Cobrar y cerrar turno / Cargar cantina / Reprogramar / Marcar ausente.
- Cantina: catálogo cargado bajo demanda, 2 Cervezas → CTA "Cobrar $ 5.000" → venta registrada. DB: `income | product_sale | 500000 | cash | Cantina: Cerveza x2 | booking_id no nulo`; stock 24→22; ledger `sale | -2 | 250000`.
- 🟢 **La invariante que importa**: el panel del turno sigue mostrando **"Precio del turno $100 · Cobrado $0 · Pendiente $100"** con $15.000 de cantina cargados. La cantina no toca el saldo del turno.
- Caja: "Cobrado hoy $15.000,00", 3 filas "Cantina: Cerveza x2 · Cantina/Bar · Efectivo".
- Reprogramar: turno del 2026-08-04 21:00 movido al 2026-08-05 08:00 — `date`, `time_start`, `time_end`, `starts_at` (`2026-08-05 11:00:00+00` = 08:00 ART) y `price_snapshot` (2.400.000 → 10.000, la tarifa de la franja destino) recalculados juntos.
- Datos de prueba limpiados al terminar.

**Nota de método:** el primer intento de verificación falló porque el script clickeaba antes de la hidratación y porque la pane del navegador embebido no compositaba (rects en 0). Ninguna de las dos era un bug del producto — se confirmó instrumentando el estado real de React antes de sacar conclusiones.

**Pendiente de T5, explícito:** el consumo de cantina NO se muestra en la ficha del turno ni en el panel (queda visible en Caja). Mostrarlo requiere una query nueva por turno; fuera del alcance de esta tanda.

**Flake propio encontrado y arreglado en el gate de T5:** `dateIn()` de `booking-reschedule.test.ts` (escrito en T3) calculaba las fechas con `toISOString()` (UTC) mientras `assertDateWindow` usa ART. Entre las 21:00 ART y la medianoche, `dateIn(-1)` devuelve HOY, así que el caso "no se puede mover al pasado" dejaba de ser el pasado y el test se ponía rojo por hora del día — habría fallado igual en CI a esas horas. Ahora usa `artTodayStr()`/`addDays()`, las mismas funciones que el código bajo test.

### T6 — Popover de alta rápida (criterios de salida #3 y #4)

**Criterio #3: ≤3 campos visibles, precio pre-calculado, Enter confirma.** El click de una celda libre abre `QuickBookingForm` en un Popover **anclado a la celda** (Radix, trigger = el propio botón del slot), no el modal de 10 campos. Dos campos a la vista: **quién** (autocomplete de jugador registrado + texto libre como invitado) y **seña** (chips Sin seña / Efectivo / Transfer / MP; elegir método revela el monto). El precio NO es un campo: se muestra ya resuelto. `Enter` en cualquier campo confirma. "Más opciones" abre el `BookingFormModal` completo **sin cambios** — bloqueos, precio a mano, teléfono, notas y duración siguen todos ahí.

Sin `depositPercentage` (stories, tests viejos) la grilla se comporta como antes y la celda libre abre el modal: el popover no puede sugerir una seña sin saber el porcentaje del complejo.

**Fuente única de tarifa (`src/lib/booking/pricing.ts`, nuevo).** El precio se calcula EN EL CLIENTE para que aparezca sin round-trip — y para eso hacía falta que la función fuera la misma que la del server, no una copia. Había **tres** implementaciones del mismo `for` sobre `pricing.rules`: `calculatePrice` (court.service, sobre un `Date`), el `priceForSlot` privado de booking.service (sobre dayKey+hora) y una inline en `validatePricingRulesCoverage`. Coincidían por casualidad, no por construcción. Ahora las tres delegan en el módulo puro, que además exporta `priceForDateSlot` (día operativo + hora de pared, la forma en que hablan la grilla y `bookings`). `tests/unit/booking-pricing.test.ts` (15 casos) incluye una tabla que compara `priceForDateSlot` contra `calculatePrice(artDateAt(...))` caso por caso: la extracción no cambió ninguna respuesta.

`calcDepositCents` se movió a ese mismo módulo (`modules/bookings/deposit.ts` quedó re-exportando) por la regla de lint que prohíbe a `@/components` importar el dominio como VALOR. Misma razón de fondo que el precio: el monto sugerido en pantalla no puede diferir del que calcularía el server.

**Chequeo de disponibilidad, ahora visible.** `checkSlotAvailabilityAction` es fail-open (devuelve `available: true` ante cualquier fallo propio), así que un `false` es señal POSITIVA de que el turno se ocupó: el popover lo dice y deshabilita Confirmar. Sin mostrarlo, la carrera de doble reserva quedaba solo en el exclusion constraint y el admin veía el error recién al confirmar. Hay test del camino feliz Y del fail-open (un chequeo que explota NO bloquea el alta).

**Criterio #4: instrumentación del proxy "alta ≤10 s".** Categoría `grid` nueva en `track` (`breadcrumbs.ts`), mismo patrón que `cashflow` de Fase 1: `quick_create.opened` / `.confirmed` / `.more_options` / `.abandoned`, con `durationMs`. `.abandoned` importa tanto como `.confirmed` — sin él, el promedio mediría solo los casos donde el popover alcanzó, que es justo el sesgo que haría parecer bueno un atajo que nadie usa.

🔴 **Bug que solo apareció corriendo la app.** El complejo del seed tiene `deposit_percentage: 0` (config válida: no pide seña online). El popover pre-cargaba el monto en **$0** y después el submit lo rechazaba por "la seña tiene que ser mayor a $0": el atajo se volvía un callejón sin salida y no había forma de cobrar una seña a mano. Los tests unitarios no lo veían porque usaban 30%. Arreglado: sin sugerencia > $0 el campo arranca vacío y el admin tipea el monto. Test de regresión + story.

**Dos e2e rotos en `main`, arreglados de paso.** `TG-HP-208` y `TG-HP-209` llenaban `#guestPhone` directo, pero el modal lo colapsó bajo "Opciones avanzadas" en un rediseño anterior — fallaban con "element is not visible". Verificado que es preexistente: `BookingFormModal.tsx` no tiene cambios respecto de `main` en esta rama, y en `main` esos specs no abren el colapsable mientras el modal sí lo tiene. Se les agregó el click que faltaba.

**Verificación en la app real** (dev server + Playwright headless contra ese mismo server):
- Popover: "Cancha E2E 1 | 15:00–16:00 | **$ 100** | ¿A nombre de quién? | Seña | Sin seña | Efectivo | Transfer | MP | Confirmar reserva | Más opciones".
- Enter confirma: **1.0 s** desde el click de la celda hasta el toast (criterio #4 pide ≤10 s).
- "Más opciones" abre el modal completo con sus campos intactos (`#guestName` presente).
- DB: `Alta Rapida T6` → confirmed / spontaneous / `price_snapshot = 10000` (la tarifa de la franja, calculada en el cliente y coincidente con la que grabó el server) / `deposit_status = not_required`. `Con Sena T6` → `deposit_amount = 3000`, `deposit_status = paid`, `payment_method = cash`.
- Datos de prueba limpiados al terminar.

**Gotcha de entorno (no del producto):** correr la suite de integración deja los roles `turnogol_app`/`turnogol_worker` sin LOGIN, y la app arranca tirando `28P01: password authentication failed`. El mensaje miente — es NOLOGIN, no contraseña. Fix documentado en `docs/operations/setup-local-roles.md`; hay que repetirlo después de cada corrida de integración/reset.

**Fuera de alcance, marcado explícito:** una seña cobrada de mostrador (`depositStatus: 'paid'`) queda en el booking pero **NO genera un `cash_flow`**, así que no aparece en Caja del día. Es comportamiento preexistente de `createManualBooking` — el popover manda exactamente el mismo payload que el modal, así que no es una regresión de T6. Vale revisarlo aparte.

### T7 — Revisión adversarial y cierre

**Método:** workflow de 5 lentes independientes (dinero/concurrencia, aislamiento-RLS, día operativo, arquitectura, calidad de tests) sobre el diff completo de Fase 3, con un agente escéptico distinto refutando cada hallazgo con contexto fresco. Mismo patrón que cerró Fase 2.

⚠️ **Incidente de método, y su fix.** La primera corrida usó el subagente por defecto (con permisos de escritura) y uno de los lentes hizo un test de mutación **sobre el árbol de trabajo real**: borró el guard `if (booking.type === 'block' || booking.type === 'tournament') return null` de `BookingSlotPanel.chargeMode` y lo dejó con un comentario `// MUTANTE`. Lo detecté por la notificación de archivo modificado, frené el workflow (`TaskStop`), verifiqué el árbol entero (`grep MUTANTE` + `find -mmin`) y confirmé que sólo ese archivo había sido tocado y ya estaba restaurado. La corrida se relanzó con `agentType: 'sonnet-adversarial-reviewer'` (solo lectura) más una regla explícita de "nunca edites, nunca mutes el árbol real". **Lección: un revisor no necesita permisos de escritura, y dárselos es darle la posibilidad de romper lo que está revisando.**

#### 🔴 Hallazgo crítico confirmado: reprogramar pisaba el precio de un abonado

Una sesión de abonado es `type='fixed'` + `status='confirmed'`, y su `price_snapshot` sale del CONTRATO (`abonados.price_per_session`, `abonado.service.ts:132`), **no** de `court.pricing`. `rescheduleBooking` sólo bloqueaba `tournament` y `block`, así que `fixed` pasaba y el precio se recalculaba contra la grilla de tarifas: al abonado se le pisaba el precio pactado con el de lista, en silencio, hacia arriba o hacia abajo según la franja destino. El trigger de la migración 070 tampoco lo frenaba (el estado es `confirmed`, justo el que la excepción habilita), y la UI ofrecía el botón porque `isClientBooking` sólo excluía bloqueo y torneo.

**Fix (fail-closed):** `booking.reschedule.ts` rechaza `type='fixed'` con un motivo propio (`abonado_session`) y su mensaje es-AR; `BookingSlotPanel` no ofrece "Reprogramar" sobre un abonado (la cantina sí sigue: el abonado consume igual). Test de integración + test unitario nuevos, **verificados con ruptura controlada**: neutralizando el guard, el de integración se pone rojo con `promise resolved instead of rejecting`; restaurado, 16/16 verde.

**REQUIERE INPUT (abierto):** ¿se debe poder mover UNA sesión suelta de un abonado ("esta semana no puedo el martes")? Hoy queda bloqueado. Si se habilita, tiene que conservar el precio del contrato, no recalcularlo — el `priceOverride` de `RescheduleBookingInput` ya existe para eso.

#### Otros dos hallazgos reales, cerrados

- **`<select>` sin nombre accesible** (`SplitPaymentFields`): axe `select-name`. En un lector de pantalla el control se anunciaba sólo por su valor ("Efectivo") sin decir qué se estaba eligiendo, y con cobro mixto hay varios selects idénticos. Ahora lleva `aria-label` con el índice de la línea cuando hay más de una. Es un componente de Fase 1 usado por varias pantallas: el fix las arregla a todas.
- **Contraste AA del precio en el popover** (`QuickBookingForm`): `text-emerald-700` sobre el fondo del popover da 4.41:1 y AA pide 4.5. Pasó a `TONE_TEXT.success` (emerald-800), el token que T1 ya había fijado para esto. Mismo cambio en el aviso de "jugador registrado".

#### Storybook

`pnpm test:storybook`: **81 → 75 fallas**. Los 7 tests de esta rama que estaban rojos (`QuickBookingForm` ×4, `BookingSlotPanel` ×3) quedaron verdes. Cruzado archivo por archivo contra `git status`: de los **27 archivos que siguen fallando, NINGUNO es de esta rama** — es un baseline preexistente del repo. Una de las fallas nuevas (`StockEntryDialog`) se confirmó **flaky**: pasa 4/4 corrida sola, y el elemento que reporta invisible es un botón que esta rama no toca.

**Deuda que esto destapa, fuera del alcance de Fase 3:** el suite de Storybook tiene 75 tests rojos en `main`. La memoria del proyecto lo daba por cerrado; en algún momento regresó y nadie lo miró. Vale un esfuerzo propio.

#### Story faltante

`BookingRescheduleDialog` era el único componente nuevo sin stories. Se agregaron 3: lista de huecos (con la cancha pausada fuera del selector), día sin horarios y error de carga.

#### Hallazgos de la corrida completa (5 lentes, 19 agentes): 11 confirmados, 3 refutados

**🔴 CRÍTICO — la seña quedaba stale al reprogramar** (encontrado por DOS lentes independientes, `dinero` y `tests`). `deposit_amount` se calcula al crear como un % del precio de ESA franja (`booking.service.ts:438`) y `rescheduleBooking` nunca lo recalculaba. Consecuencias: mover un turno `pending_payment` a una franja más barata dejaba una seña MAYOR al precio total, y ese monto stale es exactamente el que cobra MercadoPago (hay un link de pago vivo con el monto ya cotizado al jugador). **Fix fail-closed:** se bloquea reprogramar con `deposit_status = 'pending'`. Cambiar el precio abajo de una preferencia de MP ya emitida es otro problema, no el de esta fase.

**🔴 Misma familia — precio por debajo de lo ya cobrado.** Mover un turno con seña PAGADA a una franja más barata dejaba `price_snapshot < totalPaid`. `summarizeBookingCharges` clampea el pendiente en 0, así que la diferencia a favor del cliente no aparecía en ningún lado: se la tragaba el sistema. Ahora se rechaza con un mensaje que manda al camino correcto (cancelar y devolver, que sí registra la devolución). Los dos guards **verificados con ruptura controlada**: neutralizándolos, los dos tests nuevos se ponen rojos; restaurados, 19/19 verde.

**🟡 La alarma "Sin cobrar" no llegaba a /reservas** (dos lentes) — **hallazgo real, fix REVERTIDO a propósito**. `ReservaListRow`/`ReservaDetail` nunca cargaban `pending`/`totalPaid`, así que `bookingBadgeVisual` degradaba a "Jugada" verde — y el detalle se contradecía a sí mismo: badge verde arriba, "Saldo pendiente: $X" en la sección de Cobros más abajo. El propio comentario de `slot-visual.ts` afirmaba que la alarma sí viajaba al listado: el código prometía algo que el wiring no hacía. Lo implementé (`withMoney()` en `queries.ts`, mismo helper batch que la grilla) **y el e2e lo tiró abajo**: `reservas-crud` pasó de 2 fallos preexistentes a 3, porque en la grilla la alarma REEMPLAZA al label — así que en el listado "Jugada" y "Ausente" colapsaban ambas en "Sin cobrar" y la columna de estado dejaba de decir el estado del turno. Eso no es un test desactualizado: es una decisión de producto que el contrato NO tomó (§3 acota la alarma a la grilla) y que empeora un listado cuyo trabajo es mostrar estados. **Revertido**; en su lugar se corrigió el comentario de `slot-visual.ts` que prometía lo que el wiring no hacía, y queda un REQUIERE INPUT anotado ahí mismo: si se unifica, hay que decidir antes si el badge del listado pasa a hablar de plata o si va un indicador aparte. La contradicción del detalle (badge "Jugada" arriba, "Saldo pendiente: $X" abajo) es anterior a Fase 3 y sigue abierta.

**🟡 El cobro no se propagaba a otras pantallas** (tres lentes). Cobrar sólo inserta en `cash_flows`; el canal de Realtime escucha `bookings`, así que la grilla de la otra tablet se quedaba con la alarma en rojo indefinidamente. La sugerencia obvia —tocar `bookings.updated_at` como no-op— **no funciona**: verifiqué el trigger `enforce_booking_invariants_fn` y PROHÍBE cualquier UPDATE sobre un turno terminal, y `completed` es justo el estado que dispara la alarma. **Fix:** reconcile periódico (30 s) también en estado `SUBSCRIBED`, no sólo en `OFFLINE`.

**🟢 Dos menores, cerrados.** El email de reprogramación mostraba la fecha de origen en ISO crudo y la de destino en DD/MM/YYYY dentro del mismo mensaje (`formatDateStrArs` nuevo; el audit log sigue con la fecha ISO, que es lo correcto para una metadata). Y el toast anunciaba `selected.price` (leído al listar los huecos) en vez del precio que el server efectivamente grabó — ahora sale de `res.booking.priceSnapshot`.

**Refutado pero cerrado igual:** `assertDateWindow` recibía `settings?.booking_advance_days` sin el `?? 6` que usan todos los demás consumidores. El refutador tuvo razón en que no es alcanzable (la columna trae el default), pero la divergencia con `listRescheduleSlotsAction` no tenía por qué existir. Se agregó el fallback.

**Refutados de verdad (2):** el `UPDATE` de la nota de deuda en `completeAndChargeBookingAction` filtrando sólo por `id` (está dentro de `withTenantContext`, RLS lo cubre) y `carryMoney` arrastrando el saldo previo en un evento de Realtime (es exactamente el comportamiento buscado: `cash_flows` no replica por ese canal, así que el saldo previo es el mejor dato disponible hasta el reconcile).

**Gate T6:** typecheck ✅ / lint 0 errores, 44 warnings (mismo baseline) ✅ / unit 300 archivos, 2443 tests ✅ / integration 126 archivos, 1002 tests ✅ / isolation 162/162 ✅ / e2e chromium `admin-create-booking-ui` + `TG-HP-208` + `TG-HP-209`: **4/4** ✅ (incluye el test nuevo del camino corto: 2 campos + Enter → confirmed en DB).

**Gate final de Fase 3:** typecheck ✅ / lint 0 errores, 44 warnings (mismo baseline que Fase 2) ✅ / unit 2444 ✅ / integration 1006 ✅ / isolation 162/162 ✅ / e2e chromium `admin-create-booking-ui` 2/2 + `TG-HP-208` + `TG-HP-209` ✅; `reservas-crud` con los MISMOS 2 fallos preexistentes que ya documentó Fase 2 ✅ / Storybook: los 7 tests de esta rama pasaron de rojo a verde, y los 27 archivos que siguen fallando no son de esta rama (cruzado contra `git status`).

**Decisiones de Lazar al cierre:** reprogramar una sesión de abonado queda BLOQUEADO; `BookingPopover.tsx` + su story se BORRARON (código muerto, el panel lateral lo reemplazó en T4); la deuda de Storybook queda anotada como esfuerzo aparte.

**PR:** [#102](https://github.com/Laza223/turno-gol-repo/pull/102) (rama `feat/fase3-grilla`), commit `df9df32`.

**Post-PR — CI y react-doctor (commit `3829716`):** el único check rojo fue E2E, con 1 fallo de 19. El primer spec que toca `/grilla` en CI clickeaba la celda ANTES de que React hidratara: el `<button>` viene en el HTML del SSR, Playwright lo ve y lo clickea, pero el handler todavía no está atado y el click es un no-op silencioso. `waitUntil: 'networkidle'` alcanzaba cuando la celda sólo abría el modal; desde Fase 3 la grilla carga chunks extra y el arranque en frío pierde la carrera. **No era flake**: falló 3 de 3 en CI (intento + 2 retries) y 0 de 3 local. Fix: helper `openQuickBookingPopover` (`tests/e2e/_helpers/grid.ts`) que reintenta el click completo con `expect.toPass`, usado por los tres specs que abren la grilla.

React Doctor pasó de **84/100 (2 errores, 6 warnings)** a **88/100 (0 errores, 4 warnings)**: `reset(() => setCourtId(v))` se leía como un state updater con efectos adentro (no lo era —`reset` era un helper propio— pero la ambigüedad se sacó con dos handlers explícitos), `.filter().map()` de `listRescheduleSlotsAction` pasó a una sola pasada, y el guard de cancelación del efecto de `QuickBookingForm` ahora corta antes de tocar estado.

**Deuda anotada, no atendida a propósito:** `no-giant-component` en `BookingGrid`, `BookingSlotPanel` y `QuickBookingForm` (>300 líneas). Partirlos es un refactor de forma sobre código que acaba de pasar el gate completo — reabre riesgo sin cambiar comportamiento. Y `no-autofocus` en el popover de alta: se mantiene con fundamento, la regla apunta a la carga de página y acá el foco entra a un popover que el admin abrió con un click, que es el comportamiento correcto (WAI-ARIA) y lo que sostiene el criterio de "alta ≤10 s".

## Fase 3 — CERRADA (2026-08-05)

**Gate T0–T5:** typecheck ✅ / lint 0 errores, 44 warnings (mismo baseline que Fase 2: los 2 que introduje —`setState` síncrono en efecto— se arreglaron montando los diálogos solo cuando se abren) ✅ / unit 299 archivos, 2419 tests ✅ / integration 126 archivos, 1002 tests ✅ / isolation 162/162 ✅. E2E no corrido en esa tanda (sí en T6).

---

## E1 — La seña de mostrador entra a Caja (2026-08-05)

**El bug.** `createManualBooking` (`booking.service.ts`) insertaba la reserva con `deposit_status='paid'` y el monto, pero NUNCA creaba la fila en `cash_flows`. La otra puerta al mismo estado —`confirmManualDepositPayment`, cuando el staff confirma una seña que estaba pendiente— sí la creaba, vía `recordManualDepositCashFlow` (`payment.service.ts:564`). Como `expectedCash = openingCash + cashNet` (`daily-close.service.ts:95`) sale de `cash_flows`, el encargado contaba MÁS efectivo del esperado y `daily_cash_closes.diff_amount` archivaba un sobrante fantasma — irrecuperable, porque el cierre es historia contable y no una vista.

Preexistente, pero los chips de seña del popover de Fase 3 lo volvieron el camino principal de cobro en el mostrador. A nivel turno la cuenta siempre estuvo bien (`booking.debts.ts:77` cuenta la seña pagada como cobrada): el agujero era solo Caja.

**Barrido de clase.** Los caminos que ponen `deposit_status='paid'` son tres: `createManualBooking` (el roto), el webhook de MP (`recordDepositCashFlow` ✅) y `confirmManualDepositPayment` (✅). Verificado que abonados (`abonado.service.ts:133`, worker de slots), torneos (`tournament-slots.service.ts:148`) y las cancelaciones/no-show nacen o quedan en `not_required` / solo mueven `paid → refunded|captured`. No hay un cuarto.

**El fix.** Helper privado `recordManualBookingDepositCashFlow` en `booking.service.ts`, duplicando deliberadamente el patrón de `recordManualDepositCashFlow` en vez de extraerlo: allá el tipo del método es `ManualDepositMethod`, que excluye `'mercadopago'` A PROPÓSITO (esa seña la confirma el webhook), y acá hace falta el `PaymentMethodValue` completo porque el staff puede cobrar con el QR de MP y anotar la reserva a mano. Unificar habría obligado a ensanchar ese tipo y desarmado el guard que impide que `confirmDepositPaymentAction` acepte `'mercadopago'`. El repo ya había tomado y documentado esta misma decisión en `payment.service.ts:560-562`.

Tres guards, cada uno con su razón:
- `depositIsCounted` (`paid` o `captured`) es EL MISMO predicado que `summarizeBookingCharges` usa para `depositCounted`. La invariante que queda escrita: **existe fila en `cash_flows` ⟺ el resumen del turno cuenta la seña**. Con cualquier otro criterio, Caja y el detalle del turno divergen. Y una seña `pending` es una promesa, no un ingreso: si entrara, el cierre esperaría efectivo que nadie puso en el cajón — el bug espejo.
- `depositAmount > 0`: `chk_cashflow_amount_positive` rechaza 0, y el schema admite `paid` sin monto.
- `input.depositMethod` presente: `cash_flows.method` es NOT NULL.

🔴 **El método sale de `input.depositMethod`, NUNCA de `created.paymentMethod`.** Para `'mercadopago'` la columna se persiste NULL (lo exige `chk_booking_payment_consistency`: `payment_id NOT NULL` para ese método, y en el alta manual no hay fila `payments`), así que `created.paymentMethod` sería `null` → violación de NOT NULL → **reserva perdida**. `input.depositMethod` es el único rastro del medio real. Tampoco se toca `paymentMethod`: `reconciliation.service.ts:255` filtra INV4 por `payment_method='mercadopago'` y persistirlo generaría findings permanentes.

⚠️ **El catch es PARCIAL y quedó documentado en el helper.** Solo `DayAlreadyClosedError` es realmente atrapable, porque `assertDayOpen` lo tira en JS ANTES de mandar SQL. Cualquier violación de constraint aborta la transacción entera en Postgres: el `captureMessage` corre igual, pero el COMMIT falla y la reserva se pierde — lo demostró la ruptura R4. Los guards del caller **no son redundancia defensiva: son la única razón** por la que "una seña mal formada nunca te hace perder la reserva" es cierto. El comentario gemelo de `payment.service.ts:556-562` promete más de lo que puede cumplir; no se propagó esa mentira.

**Corrección de clase encontrada leyendo el template.** `admin_deposit_after_close` tenía **"por Mercado Pago" hardcodeado** en el cuerpo del mail. El template nació con un solo emisor (el webhook) y cuando se sumaron los cobros de mostrador pasó a mentir: mandaba al dueño a buscar en el panel de MP una plata que estaba en el cajón. Ese mail es exactamente el que se usa para registrar el movimiento a mano al día siguiente. Ahora `method` es un campo opcional del template con frase propia por medio (`en efectivo` / `por transferencia` / `por Mercado Pago` / `por otro medio`); ausente degrada a Mercado Pago (contrato viejo, para las notificaciones ya encoladas). Los TRES emisores lo pasan. Arregla también el camino preexistente de `confirmManualDepositPayment`, que venía mintiendo desde que existe.

**Idempotencia: garantía indirecta, testeada en vez de duplicada.** El alta manual nace `status='confirmed'` y `confirmManualDepositPayment` exige `pending_payment` vía `transitionFromPendingPayment`, así que el doble cash_flow es estructuralmente imposible. No hay UNIQUE ni idempotency key que lo frene — solo la máquina de estados. Se decidió NO agregar un guard nuevo (sería una segunda fuente de verdad sobre la máquina de estados) y dejar un test que se pone rojo si algún día el alta manual pudiera nacer `pending_payment`.

**Tests nuevos:** `tests/integration/manual-booking-deposit-cashflow.test.ts` (10 casos: efectivo, mercadopago con `payment_method` NULL, transferencia que no mueve el efectivo esperado, no-doble-conteo contra `getBookingCharges`, monto 0, seña `pending`, sin seña, caja ya cerrada con notificación encolada, **el cierre cuadrando con diff 0**, y el no-doble-cobro). `tests/unit/admin-deposit-after-close-template.test.ts` (5 casos; el template no tenía ni uno).

El unit test que el plan pedía para `createManualBooking` se descartó: habría sido puro mock de la cadena de drizzle (insert + `tx.execute` del overlap + el lock de courts) y la integración lo cubre estrictamente mejor. Se cambió por el del template, que no tenía cobertura y cuesta cero mocks.

**7 rupturas controladas ejecutadas** (neutralizar → confirmar el test nombrado en rojo → restaurar → verde):

| # | Neutralización | Cayó |
|---|---|---|
| R1 | Borrar la llamada al helper | 6 tests, incl. "el cierre del día cuadra" |
| R2 | Descripción → `'Seña'` a secas | "descripción canónica" + "no infla el cobrado" |
| R3 | `input.depositMethod` → `created.paymentMethod` | "mercadopago" — `null value in column "method"`, y se lleva puesta la reserva |
| R4 | Sacar guard `depositAmount > 0` | "monto 0" — `chk_cashflow_amount_positive`, ídem se lleva la reserva |
| R5 | Sacar guard `depositIsCounted` | "seña PENDIENTE no toca Caja" |
| R6 | Sacar el catch de `DayAlreadyClosedError` | "caja ya cerrada" |
| R7 | `category:'booking'` → `'other'` | "descripción canónica" |

R5 destapó un hueco propio: ningún test cubría una seña `pending`, así que la ruptura no habría fallado. Se agregó el caso ANTES de romper.

**Gate:** typecheck ✅ (0 errores de código; los que salen son de `.next/dev/types/routes.d.ts`, artefacto generado corrupto por un dev server matado a mitad — CI lo regenera) / lint 0 errores, 44 warnings (mismo baseline) ✅ / unit 301 archivos, **2449 tests** ✅ / integration 127 archivos, **1016 tests** ✅ / isolation **162/162** ✅.

Sin verificación en la app: el cambio es 100% de capa de servicio y no toca una línea de UI (`verificacion-ux` explícitamente no aplica a lógica sin UI). Se confirmó estáticamente que el popover manda el payload que el fix consume (`QuickBookingForm.tsx:217-228`: `{depositMethod, depositAmount, depositStatus:'paid'}`), y el test de integración prueba la aritmética del cierre punta a punta contra una DB real.

---

## E3 — Píldora de plata separada del badge en /reservas (2026-08-05)

**La contradicción.** El detalle de una reserva mostraba el badge "Jugada" en verde arriba y "Saldo pendiente: $X" en la sección de Cobros veinte centímetros más abajo, en la misma pantalla. `ReservaListRow` nunca traía `pending`/`totalPaid`, así que `bookingBadgeVisual` degradaba al estado del turno. Anterior a Fase 3; el REQUIERE INPUT quedó anotado en `slot-visual.ts:267` durante T7 porque **el fix ingenuo estaba prohibido**: en la grilla la alarma REEMPLAZA al label, y aplicar eso al listado colapsaba "Jugada" y "Ausente" en un mismo "Sin cobrar", dejando a la columna de estado sin decir el estado.

**Decisión del dueño (2026-08-05): indicador APARTE.** El badge de estado no cambia; se agrega una píldora "Sin cobrar" al lado, solo cuando hay saldo.

**La forma del cambio.** `BookingBadgeVisual` gana `unpaid: boolean` y `bookingBadgeVisual` recupera el estado real re-preguntando **sin** los datos de plata:
```ts
const unpaid = raw === 'unpaid_alarm'
const base = unpaid ? slotStateKey({ ...facts, pending: null, totalPaid: null }) : raw
```
`isUnpaidAlarm` degrada a false con los dos nulos, así que devuelve exactamente el key que `slotStateKey` habría dado sin alarma. **No se toca `slotStateKey` ni `isUnpaidAlarm`**: la grilla queda literalmente intacta (hay un test que lo prueba). La alternativa —refactorizar `slotStateKey` para devolver `{base, alarm}`— habría movido la superficie que Fase 3 acaba de estabilizar.

La píldora sale de `UNPAID_ALARM_BADGE`, derivado de la MISMA fila de `SLOT_STATES` que pinta la alarma de la grilla: las dos superficies no pueden desincronizarse. Y no es un componente nuevo — es el mismo `StatusBadge` con otro visual, así que hereda los tokens de tono ya verificados en contraste.

**Dos decisiones de diseño que el plan dejó abiertas:**
- **El `accent` SÍ toma el tono de alarma.** MASTER §2.6 asigna el COLOR al estado de la plata y el ícono+label a qué es la cosa: una tira verde al lado de una píldora roja rompería esa partición.
- **La píldora SÍ entra al `aria-label`.** La fila entera es un `<Link>` estirado con ese mismo `aria-label` (`BookingListItem.tsx:105,152`): quien navega por links con lector de pantalla escucha SOLO ese string, y dejar la plata afuera se la escondería justo a quien no puede ver la píldora roja. En la vista compacta la píldora va **sin** el `hidden sm:inline-flex` del badge: en mobile se oculta el estado por espacio, pero la alarma de plata es exactamente lo que no puede esconderse.

**Costo de queries.** El listado filtra por estado terminal antes de pedir los cobros (`isUnpaidAlarm` solo dispara en `completed`/`no_show`), y `sumBookingChargesByBooking` corta antes de tocar la DB con la lista vacía → **en el scope 'proximas' la página sigue costando 2 queries, no 3**. El detalle cuesta **cero queries nuevas**: `getBookingCharges` ya venía en el mismo `withTenantContext`.

**Contradicción documental cerrada.** El comentario de `slot-visual.ts:253-272` decía "la alarma NO viaja al listado, es deliberado" mientras `tests/unit/slot-visual.test.ts:152` asertaba `label === 'Sin cobrar'`. Las dos cosas eran ciertas de distinto sujeto (la función sí, el wiring no) y juntas eran ruido. Ahora hay una sola verdad escrita: **la alarma viaja como flag, nunca como label**.

**Tests:** `slot-visual.test.ts` pasó de 23 a 29 casos — se invirtió el de `:152` y se agregaron ausente-sin-cobrar, ausente-con-seña-capturada (NO alarma), degradación sin datos de plata, el colapso `deposit_paid→confirmed` por el camino nuevo, y **el que prueba que la grilla no se movió** (`gridSlotVisual` sigue devolviendo `unpaid_alarm`/"Sin cobrar"). Stories nuevas en las tres superficies que no tenían ninguna cobertura de la alarma: `status-visual` (3, con control negativo), `BookingListItem` (2, una asertando el `aria-label` completo) y `BookingDetailCard` (2, con el control negativo "Jugada cobrada").

**Cerrado de paso (grupo C3 del esfuerzo de Storybook):** `BookingListItem > Bloqueo Administrativo` esperaba dos veces el texto "Bloqueo" — el badge decía esa palabra hasta que Fase 3 lo renombró a "Bloqueado" en `SLOT_STATES`. La story se alineó al componente (nombre "Bloqueo" + estado "Bloqueado", uno cada uno).

**5 rupturas controladas, y una limitación honesta:**

| # | Neutralización | Cayó |
|---|---|---|
| R2 | `key: raw` (que la alarma pise el label) | los 2 unit de "el badge sigue diciendo Jugada/Ausente" |
| R3 | Sacar `unpaid` del `aria-label` | story `BookingListItem > Jugada Sin Cobrar` |
| R4 | `accent` siempre por tono base | unit del accent destructivo |

R1 y R5 (wiring de la página) **no los cubre ninguna story ni unit test** — son Server Components. Se verificaron corriendo la app, que es donde ese wiring existe.

**Verificación en la app real** (dev server + Playwright headless contra ese mismo server; la pane del navegador embebido volvió a no compositar, rects en 0×0):
- Listado, jugada con saldo: `Jugada` + `Sin cobrar`, `aria-label = "Reserva 08:00–09:00, Cancha E2E 1, Deudor Jugada, Jugada, sin cobrar"`.
- Listado, ausente sin cobrar: `Ausente` + `Sin cobrar` — **los dos estados se siguen distinguiendo**, que era el punto entero.
- Listado, jugada COBRADA (control negativo): `Jugada` sola, sin píldora.
- Detalle: el `<dd>` de Estado dice `Jugada Sin cobrar` y abajo `Saldo pendiente: $ 15.000` — ya no se contradice. El control negativo dice `Jugada` + `Pagado completo`.
- Grilla: 4 celdas `Sin cobrar` reemplazando el label. Intacta.
- Datos de prueba limpiados al terminar.

**E2E: cero fallos nuevos, probado con control.** La primera corrida dio 8 rojos, pero eran **datos locales sucios** (cash_flows huérfanos de corridas previas rompiendo los `DELETE` de cleanup por FK, en cascada). Con seed limpio: **2 rojos en la rama** (`reservas-crud:97` y `:338`) contra **4 en `main`** con el mismo seed, incluyendo esos mismos dos. O sea son preexistentes y `main` está peor. ⚠️ **El par documentado de fallos preexistentes de `reservas-crud` está desactualizado**: eran `:145` (cancelar con seña) y `:225` (orden de validación); hoy el spec entero es flaky local — entre corridas de `main` falló 4/5 y 7/8. Vale un esfuerzo propio.

**Gate:** typecheck ✅ (0 errores de código) / lint 0 errores, 44 warnings ✅ / unit 301 archivos, **2454 tests** ✅ / integration 127 archivos, **1016 tests** ✅ / storybook de los 3 archivos tocados ✅ (queda 1 rojo en `BookingListItem.stories.tsx` que es el `heading-order` de `CompleteBookingDialog`, grupo A4 del esfuerzo de Storybook).

**Fallo propio encontrado y arreglado:** `tests/unit/reservas-page-render.test.tsx` y `reservas-status-filter.test.ts` mockean `@/app/(admin)/reservas/queries` con un objeto literal, así que el import nuevo de `sumBookingChargesByBooking` en la page los rompió a los 14. Se agregó el export al mock (Map vacío, el mismo early-return de la implementación real sin ids).
---

## E2 — Storybook: 76 → 0 y gate bloqueante (EN CURSO, 2026-08-05)

**Medición propia antes de empezar** (`pnpm test:storybook`, browser mode chromium + axe): 27 archivos / **76 tests** rojos sobre 258 / 1017. 71 de 76 determinísticos. Siete causas raíz, no 27 problemas. Última vez verde: 864/864 el 2026-07-13; `docs/storybook/STORYBOOK_QA_REPORT.md:348` todavía lo afirma. **Causa de fondo: el suite no corre en CI** — y es el ÚNICO lugar del repo que mide contraste (`tests/e2e/a11y/admin.spec.ts` tiene `color-contrast` deshabilitado a propósito).

### Grupo E — fuga entre stories: CERRADO

🔴 **El diagnóstico que traía el plan era correcto en el QUÉ y equivocado en el MECANISMO, y eso cambia el fix.** La hipótesis era que React 19 reconciliaba el mismo `<form>` entre stories del mismo archivo, así que el remedio sería un `key={ctx.id}` en el decorator de `preview.tsx`. **Lo implementé y no arregló nada** (6 rojos antes, 6 después) — lo revertí en vez de dejarlo puesto "por las dudas": un cambio que no hace lo que promete es peor que no tenerlo.

El mecanismo real, aislado con evidencia: `ForgotPasswordCard > Error` **pasa sola** (`-t "Error"` → 1/1) y **falla después de `Enviando`**. Lo que queda colgado no es la instancia del componente sino la **transición de React**: `fn(() => new Promise(() => {}))` deja una transición que nunca cierra, y como vive en el scheduler y no en el árbol, un remount no la toca. La story siguiente resuelve su propia action pero React no puede commitear la actualización — el síntoma es desconcertante (`Unable to find role="alert"` sobre un alert que su propio código sí renderiza).

**Fix:** helper `pendingAction<T>` (`src/test/pending-action.ts`) — la promesa queda en vuelo para que el spinner sea estable y el `play` la **libera** al final, esperando el commit. Aplicado a los 4 archivos rojos: **17/17 verdes** (eran 6 rojos). El patrón está en **10 archivos**; los otros 6 pasan hoy solo porque la story colgada quedó última en el archivo — deuda latente anotada en el docstring del helper, cualquier reordenamiento de exports los rompe.

### Grupo G — toasts invisibles bajo un diálogo: CERRADO, era bug de producción

`<Toaster/>` vive en `src/app/layout.tsx`, hermano del portal de los diálogos. Con un Dialog abierto, Radix llama `hideOthers()` y `aria-hidden` marca todo el resto del árbol con `data-aria-hidden="true"` — el viewport de toasts incluido. **En la app real, todo toast disparado con un diálogo abierto es invisible para lectores de pantalla.** `aria-hidden` whitelistea cualquier nodo con atributo `aria-live`, así que alcanza con declararlo; va en `"off"` para matchear el selector sin crear una live region nueva que duplique los anuncios de la que Radix Toast ya maneja.

**Ruptura controlada:** `QuickActions.stories.tsx` sin el cambio → **5 rojos**; con el cambio → **3**. Los 2 que caían por el toast bajo `aria-hidden` están cerrados.

⚠️ **Lo que el diagnóstico atribuía a G y NO es de G:** los 2 fallos de `FiadosList` no tienen nada que ver con toasts — son `toBeVisible()` sobre texto de un diálogo (`FiadosList.stories.tsx:78`). Quedan sin causa asignada.

### Grupo C3 — cerrado de paso en E3

`BookingListItem > Bloqueo Administrativo`: la story esperaba "Bloqueo" dos veces (nombre + badge), pero Fase 3 renombró el label del badge a "Bloqueado" en `SLOT_STATES`.

### Estado

**76 → 70 rojos / 27 → 24 archivos** (medido con la suite completa; el total subió a 1024 tests por las stories nuevas de E3).

**Pendiente:** grupo A (23 tests, 4 de ellos bugs de a11y de producción: contraste 3.93:1 en `admin-sidebar` por el visual upgrade #93, dos `<select>` sin nombre en `BookingFormModal`, `heading-order` en `CompleteBookingDialog`, contraste en `InscripcionesPanel`) · B (14, copy drift, mecánico) · C1/C2 (10, queries ambiguas) · D (11, contratos viejos — uno de ellos, `BookingActions > Ausente Pasadas Las 24H`, **NO es bug de story: cambió la regla de negocio y hay que escalarlo**) · F (9, diálogos con `open` estático) · los 6 archivos latentes del patrón de E · 2 flakes genuinos · y el cableado del job en CI, que va **último** y solo tras 3 corridas completas verdes seguidas.

### Cierre (2026-08-05) — 66 → 0, y qué de ese diagnóstico estaba mal

Re-medición sobre la rama rebasada antes de tocar nada: **66 rojos / 23 archivos sobre 1024** (no 70/24 — la diferencia eran flakes que no reprodujeron).

**Cuatro correcciones al diagnóstico de arriba, todas encontradas con la evidencia de axe en la mano, no leyendo código:**

1. **El grupo A eran 9 bugs de a11y de producción, no 4.** Los que faltaban: `aria-allowed-attr` (`aria-expanded` en un textbox que nunca declaró `role="combobox"`), `aria-dialog-name` en los dos popovers de horario, y tres contrastes más (chips de horario, alerta de error, avisos amber) — todos en `BookingFormModal`.
2. **Los dos contrastes "de `InscripcionesPanel`" no viven ahí**: son `SplitPaymentFields.tsx`, el control de cobro compartido que además montan `CompleteBookingDialog` y `BookingSlotPanel`. Buscarlos en el archivo de la story es lo que había hecho fallar la localización estática. Un fix, tres pantallas.
3. **`money-input` (8 rojos, el archivo entero) NO era bug de producción.** La story renderiza el input sin `<Label>` y axe marca `label-title-only`. El componente no trae label propio a propósito: cada caller monta el suyo. Se arregló la story.
4. **`BookingActions > Ausente Pasadas Las 24H` no era cambio de regla de negocio** (la nota de arriba se escaló de más). Era contaminación: la story ANTERIOR del archivo dejaba abierto su toast de "Ausencia deshecha", y ésta asserta que no hay ningún botón. Cerrar el toast en la story previa la puso en verde sin tocar el guard de 24h, que sigue existiendo en los dos lados.

**El idiom de contraste ya estaba escrito en el repo** (`src/components/ui/error-state.tsx:42-49`: "un tono más oscuro en claro, el token original en oscuro"). Se siguió en vez de inventar otro: `text-emerald-700`→`800`, `text-amber-700`→`800`, `text-destructive`→`text-red-700 dark:text-destructive`. **No se tocó `globals.css`**: los tokens están calibrados contra blanco y pasan; lo que falla es texto saturado sobre su propio tinte translúcido en superficie clara, que es un problema del sitio de uso, no del token.

**Un bug de librería, no de story** (`CourtList`): `waitForElementToBeRemoved` resuelve la raíz de búsqueda UNA sola vez, al invocarla. Sobre un nieto (`toastText`), si el `<li>` ya se desprendió del `<ol>`, la raíz capturada es el `<li>` huérfano y `contains()` da `true` para siempre → cuelga los 15s completos. Sobre el `<li>` mismo, si ya se fue, tira "already removed". Entre las dos formas **no queda ventana** bajo la suite completa. El reemplazo es `waitFor` + `queryBy`, que tolera los dos órdenes. Explica una familia de "flakes de toast bajo carga" que se venía atribuyendo a CPU.

**Los 2 rojos que sobrevivieron a los fixes por archivo** son exactamente el argumento de por qué la suite completa manda: los dos pasaban en aislado. `AbonadoForm > Error De Preview` fallaba con "Unable to find button Continuar" y un dump de roles casi vacío — el popover del DatePicker seguía montado y Radix marcaba el resto del árbol con `aria-hidden`. En aislado la ventana es de milisegundos.

**Lo que se decidió NO hacer:** migrar a `pendingAction` los archivos donde la story colgada quedó ÚLTIMA. Son seguros hoy por posición, no por diseño; el inventario real (15 archivos, no 10) quedó en el docstring del helper, junto con el falso amigo de `StepIdentity.stories.tsx` (declara una variable local con ese nombre sin importar el helper, así que un grep lo cuenta como migrado).

### La parte cara: llegar a 0 no fue arreglar 66 tests, fue estabilizar la suite

Con los 66 cerrados archivo por archivo, la suite completa dio **2 rojos**. La corrida siguiente, sin tocar una línea, dio **6 rojos DISTINTOS**. Ese es el dato que importa: los archivos sueltos daban verde y la suite completa no, en ambas direcciones.

Las 8 fallas acumuladas eran **dos clases**, no ocho problemas:

**Clase 1 — `waitForElementToBeRemoved` (18 usos, 7 archivos).** No sirve para esperar que algo desaparezca, y falla en las dos direcciones opuestas:
- llega tarde → tira `"element is already removed"` (hace un chequeo de existencia al entrar);
- llega temprano sobre un DESCENDIENTE → cuelga hasta el timeout completo, porque resuelve la raíz de búsqueda una sola vez al invocarla caminando `parentElement`. Si el contenedor ya se desprendió, la raíz capturada es ese contenedor huérfano y `contenedor.contains(nieto)` sigue dando `true` para siempre sobre el subárbol intacto.

Entre las dos formas no queda ventana. Reemplazadas por `expectGone` (`src/test/expect-gone.ts`), que chequea `isConnected`: no camina el árbol y tolera los dos órdenes. Esto explica de paso una familia de "flakes de toast bajo carga" que se venía atribuyendo a CPU y no lo era.

**Clase 2 — `toBeVisible()` síncrono sobre un nodo recién montado.** `findByRole` resuelve cuando el nodo EXISTE, no cuando se ve; el elemento entra con `data-[state=open]:animate-in fade-in-0` y el primer frame tiene `opacity: 0`. Bajo la suite completa la ventana se ensancha lo suficiente para perder la carrera. Se envolvieron en `waitFor` los sitios que fallaron.

**Se evaluó y se DESCARTÓ el atajo global** de meter `animation: none !important` bajo `prefers-reduced-motion` para matar la clase 2 de raíz: `globals.css:889` usa `animation: card-fade-in 0.4s both`, y con `fill-mode: both` el elemento se queda en `opacity: 0` hasta que la animación TERMINA. Por eso el bloque de reduced-motion existente tiene que escribir `animation: none` **y** `opacity: 1` juntos (`globals.css:950`). Un `animation: none` a secas sobre todo el árbol dejaría invisible a todo lo que entra con fill-mode. Los 399 `toBeVisible()` de las stories tampoco se barrieron en masa: la mayoría son asserts de render inicial, sin animación de por medio, y tocarlos sería churn sin señal.

Además, `AbonadoForm`: el botón de submit dice **"Procesando..."** mientras la preview está en vuelo (`AbonadoForm.tsx:655`), así que `getByRole({name:'Continuar'})` no lo encuentra en esa ventana. Pasado a `findByRole` en los 6 usos del archivo.

**Corridas completas: 2 → 6 → 1 → 0 → 0 → 0.** Las tres últimas, 1024/1024, sin tocar nada entre medio.

### El gate

Job `stories` en `ci.yml`, **BLOQUEANTE y sin `continue-on-error`**, en paralelo con unit/integration. Razón escrita en el propio workflow: esta suite es el único lugar del repo que mide contraste — `tests/e2e/a11y/admin.spec.ts:27` corre axe con `disableRules: ['color-contrast']`, y su comentario aclara que la regla queda apagada porque los CTAs viven dentro de modales que esa prueba nunca abre. Las stories sí los abren en el `play`.

**Cero retries**, también a propósito: la contaminación entre stories es determinística en la corrida completa y desaparece al reintentar — un retry esconde exactamente la clase de bug que este gate existe para atrapar.

⚠️ **Falta un paso que NO se puede hacer desde el repo:** marcar `Stories (BLOCKING)` como *required status check* en la protección de rama de `main`. Sin eso el job corre y se ve rojo, pero no impide el merge.

---

## Bloque 3 (2026-08-05) — Partir los 3 gigantes de la grilla

Refactor de **forma solamente**: cero cambio de comportamiento, cero cambio de copy, cero cambio en las props públicas ni en los tipos que exportan. Va DESPUÉS del gate de Storybook a propósito — la red que hace seguro mover 900 líneas de JSX es esa suite, no la de unit.

| Archivo | Antes | Después |
|---|---|---|
| `src/components/booking/BookingGrid.tsx` | 484 | **290** |
| `src/components/booking/BookingSlotPanel.tsx` | 541 | **287** |
| `src/components/booking/QuickBookingForm.tsx` | 414 | **283** |

Convención seguida: la ya establecida por el Ticket 3 (ver arriba) — el orquestador conserva `Props` y el export público, los hooks van a `src/hooks/` o a la subcarpeta del componente, y las piezas de JSX a una subcarpeta propia.

**Piezas nuevas (15 archivos, 1094 líneas):**

- `src/hooks/use-grid-actions.ts` — todo el estado de "qué superficie está abierta" de la grilla (`selectedSlot`, `quickSlotKey`, `detailBookingId`, `isNavPending`) y sus handlers. Están juntos porque **se cierran entre sí**: abrir el modal cierra el popover, crear una reserva cierra los dos. Repartidos en el componente esa relación quedaba implícita en el orden de los `setState`.
- `booking/grid/` — `GridOverlays.tsx` (modal completo + panel del turno), `GridEmptyStates.tsx` (offline / sin canchas / día cerrado), `QuickFormCell.tsx`, `grid-keyboard-nav.ts` (`moveGridFocus`).
- `booking/slot-panel/` — `actions.ts` (tipos del contrato), `charge-copy.ts`, `use-slot-charges.ts`, `SlotPriceSummary.tsx`, `SlotChargeSection.tsx`, `SlotActionButtons.tsx`.
- `booking/quick-form/` — `constants.ts`, `use-player-search.ts`, `use-slot-availability.ts`, `DepositFieldset.tsx`.

**Las dos decisiones que no eran obvias:**

1. **`slot-panel/actions.ts` no estaba en la partición planeada.** Se agregó porque los tipos del contrato del panel (`SlotPanelActions`, `ChargeInput`, `RenderCanteenDialog`) los necesitan también `use-slot-charges.ts` y `SlotActionButtons.tsx`: dejándolos en `BookingSlotPanel.tsx` los hijos importaban al padre (ciclo type-only) y el orquestador quedaba en 326 líneas, por encima del objetivo. `BookingSlotPanel.tsx` los re-exporta, así que **ningún caller cambió su import**.

2. **El bloque de derived-state on prop change (`if (booking.id !== lastId)`) NO se partió.** Toca estado de dos dueños (`error`/`lines`/`idempotencyKey` del hook de cobro, y los tres `*Open` del orquestador); romperlo en dos bloques con su propio `lastId` cada uno habría sido un cambio estructural más riesgoso que el problema que resuelve. Quedó entero, en el orquestador, con `useSlotCharges` exponiendo los setters crudos — es la idéntica secuencia de `setState`, sólo que tres pasan por una capa de indirección. El `setLastId(null)` que las tres mutaciones exitosas hacían inline viaja al hook como callback `resetLastId`.

**Orden de hooks en `BookingSlotPanel`:** cambió en el TEXTO (ahora `useRouter` → 4× `useState` → `useSlotCharges`, antes el `useTransition` de cobro iba primero) pero es incondicional y estable entre renders, que es lo que exigen las Rules of Hooks — no un orden textual específico. Se deja anotado porque es el punto donde este refactor podía romper en silencio.

**Verificación (misma base, antes y después):**

| Suite | Resultado |
|---|---|
| `pnpm typecheck` | 0 errores |
| `pnpm lint` | 0 errores (44 warnings preexistentes de `no-restricted-imports`) |
| `pnpm test` | **2454/2454** en 301 archivos |
| `pnpm test:storybook:ci` | **1024/1024** en 258 archivos |
| e2e de grilla (6 specs, `--workers=1`) | **9 passed / 2 skipped** (los dos `test.fixme` de `grilla-realtime`) |

El primer lote de e2e dio 1 rojo en `TG-HP-209` que **no reprodujo**: el mismo test pasó solo (24.3s) y el lote completo repetido pasó entero. El snapshot de la falla muestra el modal abierto, el formulario lleno, sin `role="alert"` y con el botón en "Confirmar" (no "Guardando…") — o sea `handleSubmit` nunca corrió: el click no tomó efecto. Es la clase ya documentada de clicks no-op de esta máquina, no una regresión; los dos hermanos de ese mismo spec ya están marcados `test.fixme` por la misma infra de Realtime local.

**Conflicto con el Bloque 2.4 — resuelto al rebasear** (`fix/bloque2-decisiones` sobre `main`, 2026-08-05). `BookingSlotPanel.tsx` se reescribió entero acá (541→287) y la otra rama le saca `booking.type !== 'fixed'` de `canReschedule`. Git lo auto-mergeó bien solo: quedó la versión refactorizada **sin** esa línea y con el comentario nuevo ("`fixed` SÍ entra desde la decisión del dueño"). El único conflicto manual fue este archivo, y era de secciones apendeadas a la vez.

---

## E4 — Las 4 decisiones del dueño (2026-08-05)

Cuatro pendientes que estaban esperando input y ya no. Dos de ellas tocan plata.

### (1) 🔴 Reembolso externo de MP: se reconcilia y se avisa solo al admin

**El agujero.** Un reembolso hecho a mano desde el panel de Mercado Pago llega como webhook `status='refunded'` igual que cualquier otro. `dispatchPaymentInfo` (`payment.service.ts:260`) pisaba la fila `payments` y dejaba `bookings.deposit_status` en `'paid'`: el turno seguía figurando como cobrado con la plata ya devuelta. Solo quedaba un audit log y un warning en Sentry.

**La decisión (dueño):** reconciliar el booking (`deposit_status` → `'refunded'`) y avisar SOLO al admin por mail. Al jugador NO — el complejo hizo ese reembolso por afuera y puede tener una conversación en curso.

**Lo que define la forma del fix, y no estaba en el plan:** el trigger `enforce_booking_invariants_fn` (migr. `070`) hace `RAISE EXCEPTION` ante **cualquier** UPDATE sobre un booking en estado terminal. Un UPDATE sin filtrar abortaría la transacción entera del webhook y el job terminaría en la DLQ para siempre. Por eso el UPDATE filtra por `status IN ('confirmed','pending_payment')` y `deposit_status IN ('paid','captured')`.

Ese filtro por `status` **protege gratis la seña capturada de un no-show**: `deposit_status='captured'` SIEMPRE se escribe en el mismo UPDATE que fija `no_show`/`canceled_no_refund`, así que nunca convive con un status no terminal. No hizo falta un caso especial. Y el filtro por `deposit_status` da la idempotencia: un segundo evento MP del mismo refund ya no matchea porque la seña quedó en `'refunded'` → 0 filas.

**`booking.status` NO se toca.** Cancelar el turno y liberar el horario es decisión del complejo. El mail lo dice explícito para que nadie asuma que el sistema lo hizo solo.

**Sobre "solo al admin":** `enqueueTenantOwnerNotification` mandaba a TODO el staff activo, pese al prefijo `admin_` de sus templates — o sea "admin" venía significando "el complejo", no el rol. Se le agregó un `opts.onlyRole` **opcional** en vez de cambiar el default: los 10 callers existentes quedan byte-idénticos, y el único que lo usa es esta alerta, que es plata y MP (lo mismo que `requireAdminStaffAction` le cierra al encargado).

**Tests nuevos:** `tests/integration/mp-external-refund.test.ts` (4 casos contra DB real, porque la garantía central no existe en un mock), `tests/unit/admin-external-refund-template.test.ts` (5) y 4 casos nuevos en el unit existente.

**3 rupturas controladas** (neutralizar → confirmar el test nombrado en rojo → restaurar → verde):

| # | Neutralización | Cayó |
|---|---|---|
| R1 | Sacar el filtro `status IN ('confirmed','pending_payment')` | el caso de no_show, con `PostgresError: Booking en estado terminal (no_show) no puede modificarse` — exactamente el modo de falla que el filtro previene |
| R2 | Sacar `{ onlyRole: 'admin' }` | "avisa SOLO al admin": 2 notificaciones en vez de 1, el encargado también recibía |
| R3 | Sacar el filtro `deposit_status IN ('paid','captured')` | el de idempotencia: el 2do evento volvía a reconciliar |

### (2) Torneos — la amarilla del partido de la roja: CONFIRMADO, cero código

`YELLOWS_CONSUMED_BY_RED = true` se queda. El comentario pasó de "REQUIERE INPUT antes de release" a "DECIDIDO (dueño, 2026-08-05)", apuntando al ADR nuevo `docs/decisions/2026-08-05-amarilla-consumida-por-roja.md`. El comportamiento **ya estaba bajo test** (`tests/unit/tournament-suspensions.test.ts`, describe "amarilla del partido de la roja", asserta `pendingMatches === 1`): no hacía falta agregar nada, sí referenciarlo desde el comentario para que sea la alarma si alguien invierte la constante.

### (3) ⚠️ Retención — la premisa del pedido era falsa: ya estaba implementado

El enunciado decía que `audit_logs` y `notifications` crecían SIN TECHO. No es así desde el 2026-07-23 (wave 2 D5, `PROGRESS.md:672`):

| Afirmación | Evidencia |
|---|---|
| `audit_logs` 24 meses | `data-retention-cleanup.worker.ts:188-198` — `INTERVAL '24 months'` |
| `notifications` 6 meses | `data-retention-cleanup.worker.ts:206-216` — `INTERVAL '6 months'` |
| Corren de verdad | `runDataRetentionCleanup:449-465`, cron `0 10 * * 0` (domingo 07:00 ART) |
| Bajo test contra DB real | `tests/integration/retention-age-purges.test.ts:99` y `:155` |

**Evidencia pedida, corrida el 2026-08-05:** `pnpm test:integration tests/integration/retention-age-purges.test.ts` → **4/4**, con los logs del worker mostrando `purged audit_logs count:1` y en la segunda pasada `count:0` (idempotencia), ídem `notifications`. Cero código.

Nota para no volver a confundirlos: el `toBe(31)` de `data-retention-cleanup-worker-pool.test.ts` cuenta los statements de `wipeTenant` (borrado legal por tenant), no estas purgas — son mecanismos distintos.

### (4) 🔴 Abonados: se habilita mover una sesión suelta

`booking.reschedule.ts` deja de tirar `BookingNotReschedulableError('abonado_session')`.

**El precio sale de `booking.price_snapshot`, no de un SELECT a `abonados.price_per_session`.** Hoy son idénticos (no existe ninguna función que edite el precio del contrato — verificado), pero `price_snapshot` es el precio pactado para ESA sesión al generarla: el día que exista esa función, la edición debe aplicar hacia adelante, no reescribir sesiones ya comunicadas al cliente.

**La rama va ANTES del check de `priceOverride`**, no después. `priceOverride` es un campo público del input de dominio: si el orden fuera el inverso, un llamado directo a la Server Action bypaseando la UI podría pisarle el precio al contrato. "Nunca se recalcula" también significa "nunca se pisa desde afuera".

Consecuencias verificadas, ninguna necesitó código: el guard `price_below_paid` queda inerte por construcción (el precio nuevo es idéntico al viejo); el trigger de la 070 no se dispara (`IS DISTINCT FROM` da falso); `abonadoId` y `type` no están en el `.set()` del UPDATE, así que la sesión sigue perteneciendo al contrato; y la colisión con otra sesión del mismo abonado ya la cubría `assertSlotFreeForOther`.

**UI:** `BookingSlotPanel` deja de excluir `type='fixed'`; `BookingRescheduleDialog` muestra el precio del contrato en cada franja y un aviso ("se mantiene el precio del contrato sin importar el horario") en vez del delta de tarifa — si no, mostraría un precio que el servidor va a ignorar. Se borró la rama muerta `'abonado_session'` de la Server Action y del union de `booking.errors.ts`.

**Tests:** el de integración que asertaba el RECHAZO se invirtió (mover de una franja de $500.000 a una de $900.000 y verificar que `price_snapshot` sigue en $777.777 — el que pidió el dueño), más "conserva `type` y `abonado_id`", "ignora un `priceOverride` explícito" y "rechaza chocar con otra sesión del mismo abonado". El unit de la grilla también se invirtió.

**2 rupturas controladas:**

| # | Neutralización | Cayó |
|---|---|---|
| R1 | Desactivar la rama `type === 'fixed'` | "conservando el del contrato": `expected 900000 to be 777777` — el precio de lista pisando al pactado, el bug exacto que el guard tapaba |
| R2 | Mover el check de `fixed` DESPUÉS del de `priceOverride` | "ignora un priceOverride explícito": `expected 1 to be 777777` |

**Gate:** typecheck ✅ / lint 0 errores, 44 warnings (mismo baseline) ✅ / unit 302 archivos, **2463 tests** ✅ / integration 128 archivos, **1023 tests** ✅ / isolation **162/162** ✅ / storybook de los componentes tocados 13/13 ✅.

**Sin verificación en la app:** (1) y (3) son 100% capa de servicio/worker. (4) sí toca UI y queda pendiente de `verificacion-ux` — el flujo completo (abrir el panel de un turno fijo, reprogramar, ver el precio quedar igual) no se corrió contra el dev server en esta sesión.

---

## E5 — `reservas-crud` e2e: no era flaky (2026-08-05)

El spec figuraba como flaky en local (falló 4/5 y 7/8 en corridas distintas de `main`) y limpio en CI. **Ninguna de las dos cosas significaba lo que parecía.**

### Por qué "pasaba en CI": CI no lo corre

`ci.yml:191` corre `playwright test --project chromium --grep @critical`. De los 5 tests del spec, **uno solo** tenía la etiqueta. Los dos que fallaban en local —`:122` (marcar completada) y `:363` (confirmar pago inline)— nunca se ejecutaron en el gate. No había divergencia local-vs-CI que explicar: había una zona sin gate.

### Causa 1 — contrato desactualizado, no timing

`:122` esperaba que el click en "Marcar completada" completara el turno y apareciera el badge "Jugada". Desde Fase 3 ese botón **no completa nada**: abre `CompleteBookingDialog` (Completar + Cobrar), y hay que confirmar adentro. El test medía el flujo pre-Fase-3, así que fallaba de forma determinística — lo que lo hacía parecer intermitente era la causa 2, que a veces lo tumbaba antes de llegar hasta ahí.

El test ahora pasa por el diálogo. El label del submit se matchea con regex (`/^Completar (con deuda|y cobrar|sin cobrar)$/`) para no atarse a la aritmética de si queda saldo.

### Causa 2 — 🔴 el cleanup se envenenaba a sí mismo

`deleteBooking` (local del spec) era un `DELETE FROM bookings` pelado. Pero `cash_flows.booking_id` es una FK **sin `ON DELETE`** (`004_isolated_tables.sql:367` → RESTRICT), y el test de "Confirmar pago inline" dispara `confirmDepositPaymentAction`, que inserta la fila de la seña en `cash_flows`.

Resultado: el DELETE del `finally` fallaba, el booking quedaba vivo, y **la corrida siguiente chocaba contra el exclusion constraint de la cancha**. Cada corrida ensuciaba a la próxima. Esa es la cascada de "datos locales sucios" que el repo venía anotando como flake ambiental.

El helper compartido ya hacía lo correcto (`_helpers/booking-seed.ts:119`, `cleanupBookingsByIds`: borra `payments` y desengancha `bookings.payment_id` antes del DELETE) — este spec tenía su propia copia incompleta. Ahora borra en orden hijos→padres: `cash_flows` → desenganchar `payment_id` → `payments` → `bookings`.

### Cobertura: el test de plata entra al gate

`:363` ("Confirmar pago" inline) pasó a `@critical`. Es el único de los cinco que mueve dinero de verdad (crea la fila en `cash_flows`), y era justamente el que dejaba la basura que rompía a los demás. Los otros tres siguen fuera del gate a propósito: el runner de 2 cores no banca la suite completa (ver el comentario del job en `ci.yml`).

### Evidencia

- **5 corridas consecutivas: 5/5, 5/5, 5/5, 5/5, 5/5.**
- **Control contra el spec original** (mismo seed, mismo dev server, `git stash` del fix): **2 failed / 3 passed**, con `Locator: getByText('Jugada')` entre los fallos. O sea, el cambio es lo que las arregló, no el ambiente.

### Trampa de ambiente que costó dos corridas

Una tanda intermedia dio **404 "Página no encontrada"** en el detalle de la reserva, con los 4 tests que navegan cayendo juntos. No era el spec: la suite de INTEGRACIÓN corrida antes hace `cleanupAll(sql)` en su `beforeAll` y se lleva puestos los datos del seed e2e. `pnpm e2e:seed` y volvió a 5/5.

Vale como regla: **después de correr integración, el entorno e2e local está roto hasta re-seedear.** Es distinto del trap ya conocido de los roles en NOLOGIN (`bootstrap-local-roles.mjs`), y hay que hacer los dos.

También apareció una vez `module factory is not available` en el dev server — el `.next` corrupto que ya está documentado. Se va reiniciando el server.

---

## Deuda anotada (2026-08-06) — 9 archivos con transición de React sin cerrar

Al investigar 3 cuelgues seguidos de `Stories (BLOCKING)` en CI (PR #109 y #110 — el job se comió su `timeout-minutes` tres veces, en puntos distintos de la suite: story #137, #239 y #230; en local y en `main` la misma suite corre limpia en 4-5 min), re-conté el inventario que el comentario de `src/test/pending-action.ts` dejó pendiente el 2026-08-05.

**El número del comentario estaba desactualizado: son 9 archivos sin migrar, no 6.**

```
git grep -lE "new Promise(<[^>]*>)?\(\(\) => \{\}\)" -- "*.stories.tsx"
```
da 12 archivos; de esos, `StepCourts`/`StepPayments` ya migraron al helper `pendingAction` en el Bloque 1, y `StepIdentity` es el falso amigo ya documentado (variable local llamada `pendingAction` sin importar el helper).

De los 9 reales, la mayoría tiene la story colgada **antes** del final del archivo — el caso de riesgo que el docstring marcaba como "no seguro":

| Archivo | Story colgada | Stories después (en riesgo) |
|---|---|---|
| `src/components/booking/BookingFormModal.stories.tsx` | `Guardando` (4/8) | 4 (`ErrorDelServidor`, `Cerrado`, `AvisoDeColisionOptimista`, `ExitoLlamaOnSuccess`) |
| `src/components/ui/confirm-dialog.stories.tsx` | `Procesando` (5/7) | 2 (`ErrorControlado`, `ErrorInesperado`) |
| `src/components/ui/image-uploader.stories.tsx` | `Subiendo` (7/9) | 2 (`ErrorDeProcesamiento`, `SubidaExitosa`) |
| `src/app/(super-admin)/super-admin/tenants/[id]/_components/impersonate-button.stories.tsx` | `ConfirmaYEntra` (2/4) | 2 (`CancelaLaConfirmacion`, `SinAdminActivo`) |
| `src/components/ui/submit-button.stories.tsx` | `Enviando` (2/3) | 1 (`Destructivo`) |
| `src/app/(player)/configuracion/DataExportButton.stories.tsx` | `Cargando` (2/4) | 2 (`ErrorDeServidor`, `RespuestaSinData`) |
| `src/app/(public)/[slug]/reservar/components/ConfirmBookingButton.stories.tsx` | `Enviando` (3/3, última) | — seguro hoy |

`admin-layout-shell.stories.tsx` y `super-admin-layout-shell.stories.tsx` tienen el patrón en forma distinta: `NEVER_RESOLVES` es el `signOut` por defecto de `meta.args` para TODAS las stories del archivo, no una story puntual — ninguna `play` lo dispara hoy, así que no encajan en la tabla de riesgo por posición, pero siguen siendo la misma promesa que nunca resuelve.

**No se prueba como causa de los 3 cuelgues** — la suite corre limpia en local (1026/1026, ~4min) y en `main` (4:42, 4:47). El mecanismo documentado en E3 es fallo de TEST (`Unable to find role="alert"`), no stall de proceso. Pero es el sospechoso más plausible: transiciones sin cerrar acumulándose en el mismo `page` de Playwright durante 130-240 archivos de la suite completa, en un runner de CI con memoria más ajustada que la máquina local, es la clase de cosa que degrada un proceso hasta que deja de responder en vez de tirar un error limpio y localizado.

**Decisión del dueño (2026-08-06):** anotar y frenar, no migrar esta noche. `Stories (BLOCKING)` se sacó de los required status checks de `main` (branch protection revertida a `Integration & Isolation (BLOCKING)` / `Lint & Types` / `Unit Tests`, los 3 de antes) — el job sigue corriendo en cada PR y se ve rojo/colgado si repite, pero no bloquea. Pendiente: migrar los 6 archivos con riesgo real (la tabla de arriba, sin contar el ya-seguro `ConfirmBookingButton`) a `pendingAction`, medir 3 corridas de CI seguidas, y recién ahí reactivar el required check.

---

## Fase 4 del rediseño v2 (2026-08-06) — reorganización estructural, 2 de 4 criterios

Contrato: `docs/planning/2026-08-01-decisiones-de-fase-v2.md` §3. Se ejecutaron los **dos
criterios que no dependen de D3** (la política de identidad de Clientes — ficha ligera de
invitados + vinculación manual — no existe hoy, verificado 2026-08-06):

- [x] Navegación de 6 espacios activa; cero rutas huérfanas ni ítems del menú viejo colgando.
- [x] Grilla-lista mobile (lista por hora con swipe entre canchas) reemplazando a la matriz.
- [ ] Clientes fusionado (UNA lista de personas) — **bloqueado por D3**, fuera de esta sesión.
- [ ] Etiquetas D3 operativas en la ficha — **bloqueado por D3**.

**Decisiones del dueño antes de planificar:** cáscara "Clientes" con pestañas sin tocar la
identidad · cero renombres de ruta (cambian labels y agrupación, no URLs) · `/reservas` pasa a
ser la pestaña Lista de Grilla · grilla mobile = swipe por cancha **más** una página "Todas".

### Mapa de navegación, antes y después

| Antes (9 ítems planos) | Después |
|---|---|
| Hoy → `/dashboard` | **Hoy** → `/dashboard` (sin cambios) |
| Grilla → `/grilla` | **Grilla** → `/grilla`, pestañas *Calendario* / *Lista* |
| Reservas → `/reservas` | pestaña *Lista* de Grilla (deja de ser ítem) |
| Turnos fijos → `/abonados` | pestaña *Turnos fijos* de Clientes (deja de ser ítem) |
| Torneos → `/torneos` | **Torneos** → `/torneos` (sin cambios, sigue tras el flag) |
| Jugadores → `/jugadores` | **Clientes** → `/jugadores`, pestañas *Jugadores* / *Turnos fijos* |
| Caja y Cantina → `/caja` | **Caja** → `/caja` (4 pestañas existentes) |
| Analíticas → `/analiticas` | **Métricas** → `/analiticas` |
| Configuración → `/settings` | **Configuración**, separada al pie; candado para el manager |

Mobile: la hamburguesa se retira; la navegación primaria es `AdminBottomNav` (3 accesos del rol
+ "Más", que abre el mismo drawer).

### Rutas huérfanas cerradas

| Qué | Estado antes | Ahora |
|---|---|---|
| `(admin)/canchas/*` | redirect con TODA la implementación adentro (+ error/loading sobre un redirect) | código en `settings/canchas/`, stub de 5 líneas |
| `(admin)/staff/*` | ídem | código en `settings/equipo/`, stub |
| `(admin)/metricas/*` | ídem | código en `analiticas/`, stub |
| `(admin)/deudas/*` | ídem | `chargeDebtAction` a `caja/deudas/`; el resto era dead code |
| `/jugadores/deudas` | 2ª lista de deuda con su propio total | redirect a `/caja/deudas` |
| `revalidatePath('/deudas')` | apuntaba a un stub: la lista real nunca se refrescaba tras cobrar | `/caja/deudas` |
| `robots.ts` | sin `/torneos` ni las rutas legacy | completo |

**Por qué muere `/jugadores/deudas`:** mostraba `getDebts` (sólo turnos) mientras `/caja/deudas`
muestra `getStreetMoney`, que **llama a `getDebts` por dentro** y suma además fiados y cuotas de
torneo. Era un subconjunto estricto con su propio total: dos números para el mismo hecho
económico, que es exactamente lo que P2 prohíbe. Costo aceptado y compensado: sancionar a un
moroso ya no se dispara desde el listado; `getStreetMoney` ahora propaga `playerId` y cada fila
linkea a la ficha, donde el control de baneo ya vivía. `ManualBanDialog`/`DebtListClient`/
`ChargeDebtDialog` quedaron sin callers y se borraron.

### Cómo queda verificado (no a ojo)

`tests/unit/admin-routes-reachable.test.ts` lee el árbol de `src/app/(admin)` y exige, en las
dos direcciones: que toda página tenga camino declarado (menú, pestaña, allowlist contextual con
motivo escrito, o redirect de compat verificado contra el archivo) y que ningún href de menú
apunte a una página inexistente. **Verificado con control negativo**: una página sin camino lo
pone rojo (probado agregando una y borrándola).

### Deuda que esto NO cerró

- `/settings` redirige a `/settings/reservas` (tab #2, elección arbitraria — auditoría §7).
- El número "Hoy: $X" persistente en la barra lateral (visión §3.3 / P2): exige una query de
  caja en el layout de todas las páginas admin.
- 4 de 7 pestañas de Settings siguen con `<h1>Configuración</h1>` genérico (auditoría §7).

---

## Migración a `pendingAction` (2026-08-06, rama `fix/storybook-pending-action`)

Lazar pidió cerrar la deuda de arriba. **La tabla de 6 archivos estaba armada por grep
sintáctico, no por mecanismo: 2 de los 6 no tienen transición de React y no pueden contaminar
nada.** Medido antes de tocar, no deducido:

```
$ grep -cE "useTransition|useActionState|startTransition" <componente>
confirm-dialog.tsx      3      image-uploader.tsx        0
BookingFormModal.tsx    3      submit-button.tsx         0 (pero useFormStatus → <form action>)
```

| Archivo | Mecanismo real | Resultado |
|---|---|---|
| `BookingFormModal.stories.tsx` | `useTransition` en el componente | ✅ migrado, 8/8 |
| `confirm-dialog.stories.tsx` | `useTransition` en el componente | ✅ migrado, 7/7 |
| `submit-button.stories.tsx` | `<form action>` de React 19 = transición | ✅ migrado, 3/3 |
| `impersonate-button.stories.tsx` | hereda la transición de `ConfirmDialog` | ✅ migrado, 4/4 |
| `image-uploader.stories.tsx` | **ninguno** — `busy` es `useState` puro | ❌ NO APLICA, revertido |
| `DataExportButton.stories.tsx` | **ninguno** — `useState` + `spyOn(window,'fetch')` | ❌ NO APLICA, otra clase |

**`image-uploader` no es una omisión: migrarlo ROMPE.** Aplicado el helper, `Subiendo` muere con
`Test timed out in 30000ms`. El componente resuelve el upload con `setBusy(false)` en un `finally`
de async normal — no hay transición que liberar, y el `release` introduce una espera que el flujo
real no tiene. Revertido con `git checkout --` (paso 5 del protocolo de fixes), no dejado a medias.

**`DataExportButton` tiene un riesgo REAL pero de otra clase**, anotado sin arreglar por estar
fuera del alcance de esta tanda: su story `Cargando` hace
`spyOn(window, 'fetch').mockImplementation(() => new Promise(() => {}))` **y nunca lo restaura**;
`vitest.storybook.config.ts` no setea `restoreMocks`. Hoy no rompe por dos razones que no son
diseño: `isolate` (default `true`) corta la fuga entre archivos, y las 2 stories siguientes traen
su propio `parameters.fetchMock`, cuyo decorator `withFetch` pisa el spy al montar y lo restaura al
desmontar. Si alguna de esas dos condiciones cambia, queda un `fetch` que nunca resuelve instalado
para el resto de la corrida.

**Lo que esta tanda NO prueba, dicho explícito:** los 4 archivos migrados **ya pasaban en verde
antes** (baseline medido: 6 archivos / 35 tests ✅). El control negativo, entonces, salió verde: la
contaminación por transición **no se manifiesta hoy** en ninguno de ellos. La migración es
preventiva y alinea el repo con un patrón que ya existe — no cierra un rojo activo, y **no hay
evidencia de que sea la causa de los 3 cuelgues de `Stories (BLOCKING)`**. Esa hipótesis sigue sin
confirmar ni descartar.

**Inventario residual (el grep sigue dando 12 archivos, no 6):** `StepCourts.stories.tsx:105` y
`StepPayments.stories.tsx:92` conservan el patrón en su ÚLTIMA story (migraron solo la del medio en
el Bloque 1); `ConfirmBookingButton` igual; los 2 `*-layout-shell` mantienen `NEVER_RESOLVES` en
`meta.args`. Todos seguros por posición, ninguno por diseño.

**Gate:** `pnpm typecheck` ✅ · `pnpm lint` 0 errores / 44 warnings (mismo baseline que Fase 2 y 3)
✅ · `pnpm test:storybook` suite completa **258/258 archivos, 1026/1026 tests, 3m22s** ✅.

**Pendiente para reactivar el required check:** hacen falta 3 corridas de CI seguidas del job
`Stories` sin colgarse. El check sigue fuera de los required de `main` hasta tenerlas.
(GitHub Actions estuvo en `major_outage` desde el 2026-08-06T15:22 UTC sin crear runs; se recuperó
el 2026-08-07 ~03:20 UTC y ahí arrancó la medición.)

**Mediciones de `Stories (BLOCKING)` tras la recuperación:**

| # | PR | sha | ¿tiene la migración? | Resultado |
|---|---|---|---|---|
| 1 | #113 | `4f3b18f` | sí | ✅ pass |
| 2 | #112 | `afe34b0` | **no** | ✅ pass |

La #2 importa más que la #1: `afe34b0` **no** lleva la migración a `pendingAction` y el job pasó
igual. Es evidencia directa contra la hipótesis de que las transiciones sin cerrar causaban los
cuelgues — no la refuta sola (3 cuelgues sobre N corridas puede ser intermitente), pero mueve el
sospechoso al fondo de la lista.

### Colateral: `pnpm audit --prod` rojo por una CVE publicada el mismo día

Al re-disparar el CI del PR #112 tras la recuperación de Actions, el workflow `security` falló en
`pnpm audit --prod --audit-level=high`. **No lo introdujo ningún PR**: el run de `main` del
2026-08-06T09:39 pasó en verde con el mismo lockfile — la CVE se publicó entre medio.

`CVE-2026-59870` (GHSA-5p4m-2wfm-xmqj, high): consumo cuadrático de CPU resolviendo `!!omap` en
`js-yaml`. Llega como `gray-matter@4.0.3 > js-yaml@3.15.0`; parcheado en `3.15.1`.

Exposición real acotada: `gray-matter` tiene **un solo consumidor**, `src/lib/content/posts.ts:3`,
que parsea el frontmatter de los posts del blog — archivos versionados en el repo, no entrada de
usuario. Explotarlo exigiría commitear un `.md` malicioso.

**Fix:** `js-yaml@<3.15.1: "^3.15.1"` en `pnpm.overrides` (mismo patrón que los `cookie@<0.7.0` /
`postcss@<8.5.10` que ya estaban). El selector con rango deja intacto el `js-yaml@4.3.0` de eslint.
Verificado: `gray-matter > js-yaml@3.15.1` y `pnpm audit --prod --audit-level=high` sin hallazgos
(queda 1 moderate, bajo el umbral del gate). `pnpm typecheck` ✅.

---

## `home-service` fallaba los viernes y sábados, no al azar (2026-08-07)

`Integration & Isolation (BLOCKING)` se puso rojo en el PR #112 con **un solo test caído de 1023**:
`home-service.test.ts > "occupancy cuenta el turno confirmado de hoy"` →
`expected 0 to be greater than 0`. El PR no toca `home/`, `occupancy` ni ese archivo — el fallo era
preexistente y **dependía del día de la semana**.

Medido con código ejecutado (`daySlotsFor` sobre una semana entera, sin DB):

```
lun 16 | mar 16 | mie 16 | jue 16 | vie 0 | sab 0 | dom 14
```

**La cadena.** El fixture `DEFAULT_OPENING_HOURS` copiaba el default crudo de la migración 003, que
pone `fri`/`sat` cerrando a la `01:00`. Pero `hoyOpts` pasa `closesNextDay: false` (el default de la
migr. 035), y sin ese flag un cierre post-medianoche es un rango inválido: `generateTimeSlots`
arranca su loop con `480 < 60` y devuelve `[]`. Con `slotsCount = 0`, `occupancyForDay` calcula
`available = Math.max(0, 0 * courts - 0) = 0` y la assertion revienta. Los otros 5 días pasan porque
`close: '00:00'` cae en el `if (close === 0) return END_OF_DAY_MINS` de `effectiveCloseMins`.

**No era un bug de producción, y se verificó antes de alarmar.** Ningún tenant real está en ese
estado: `sanitizeWizardHours` (`src/app/onboarding/wizard-hours.ts`) baja esos cierres a `00:00`
durante el onboarding, y su comentario nombra el problema exacto — *"una madrugada sin flag = 0
celdas → día sin precio silencioso"*. El fixture ahora refleja lo que el wizard produce, que es lo
que el suite debe simular.

**Barrido de clase, en dos pasos:**

1. *Cierre de madrugada en tests* — 6 archivos más (`canteen-report-operating-day`,
   `booking-physical-overlap`, `cashflow-operating-day`, `home-service-operating-day`,
   `metrics-operating-day`, `caja-actions-role-guard`). **Los 6 pasan `closesNextDay: true`; ninguno
   pasa `false`.**
2. *Fecha real del sistema en vez de fija* — 7 archivos usan `artDateOf(new Date())`. De los otros 6,
   **ninguno** referencia `openingHours` / `daySlotsFor` / `occupancy`: usan la fecha real para
   movimientos de caja, stock y cierres, que no generan slots.

`home-service.test.ts` era la única instancia de la clase completa (fecha real + slots + horario de
madrugada sin flag). Fix en `afe34b0`, ya en `main` vía PR #112.

**Verificado:** con el fixture corregido los 7 días generan slots (vie 16, sáb 15) · `pnpm typecheck`
✅ · `Integration & Isolation (BLOCKING)` pasó a verde en el PR #112.

---

## Baselines visuales de la grilla, desactualizadas por la Fase 4 (2026-08-07)

`Regresión visual (ADVISORY)` quedó rojo en `main` tras mergear el PR #112: la Fase 4 cambió la UI
del admin y nadie regeneró las fotos de referencia (el #112 no toca un solo `.png` — verificado con
`git diff --name-only`). Como el job es `continue-on-error` a nivel job, se mergeó sin que el rojo
frenara nada.

**Alcance real: 2 de 9, no las 8 baselines** (7 passed). Leer el log fue necesario justamente por el
`continue-on-error` — `gh run view --log-failed` devuelve VACÍO en un job así, hay que pedir el log
completo (misma trampa que [[continue-on-error-step-podrido-en-silencio]]):

| Baseline | Píxeles distintos | Ratio |
|---|---|---|
| `admin-grilla.png` | 13.466 | 0.02 |
| `admin-grilla-mobile.png` | 16.841 | 0.06 |

**Los ratios engañan y casi me hacen buscar un bug que no existía.** La grilla mobile pasó de matriz
a lista por hora con swipe — un rediseño completo — y aun así mueve solo el 6% de los píxeles,
porque el ratio se calcula sobre la imagen entera y ambos layouts comparten el fondo claro. Un ratio
bajo NO significa "cambio menor".

**Verificado mirando las imágenes, no deduciendo.** Descargadas del artifact del run 31146421146:

- *mobile*: hamburguesa → logo; aparecen pestañas Calendario/Lista, chips Todas/Cancha y la lista
  por hora (`08:00–09:00` + botón por cancha); la leyenda al pie se reemplaza por `AdminBottomNav`
  (Hoy · Grilla · Caja · Más).
- *desktop*: el contenido baja ~53px por las pestañas nuevas, y el sidebar muestra el renombrado de
  la Fase 4 (Métricas→Analíticas, Turnos fijos→Clientes, Caja y Cantina→Caja) — 6 espacios con
  Configuración separada al pie.

Cada diferencia corresponde 1:1 al mapa de navegación documentado arriba. **Cero cambios visuales
inesperados**, así que las capturas nuevas son la referencia correcta.

**Cómo se regeneró, sin infra nueva:** los `-actual.png` del artifact los generó el propio CI en
Linux (las baselines viven en `__screenshots__/{project}/linux/`, imposibles de regenerar desde
Windows) y Playwright los marcó `captured a stable screenshot` — dos capturas seguidas idénticas.
Se copiaron sobre las baselines. Alternativa descartada por desproporcionada: montar un workflow con
`--update-snapshots=all` (que además es la única forma válida: sin `=all` el preset `changed` da
verde sin reescribir, ver [[playwright-update-snapshots-preset-changed]]).

---

## B5 — Detector de código muerto reproducible, y los 2 bugs que destapó (2026-08-09)

El bloque pedía "borrar dead code". El problema real no eran las 5 funciones que un barrido a mano
había encontrado: era que **el barrido no se repetía**, así que `src/app` y `src/components` nunca
se habían mirado y nada impedía que se volviera a acumular. Ahora hay `knip.jsonc` versionado y
`pnpm knip` cableado al job `Lint & Types` **sin `continue-on-error`**.

**Gate verificado con control negativo**, no asumido: se agregó un `export function __knipCanary__`
muerto dentro de `send-email.worker.ts` y knip lo reportó (`send-email.worker.ts:100:17`). Sin ese
control, la config podía estar dejando archivos enteros fuera del análisis y el verde no probaba
nada.

### Los 2 hallazgos que NO eran código muerto

**1. 🔴 `request_id` siempre `null` en los errores de la API.** `runRequestObservability` es lo único
que puebla el AsyncLocalStorage de `request-context`, y **no lo llamaba nadie**. Los dos lectores sí
estaban vivos: `logger.ts` emitía cada línea sin `requestId`/`tenantId`/`userId`, y `api-error.ts`
respondía `"meta": {"request_id": null}` en TODOS los errores HTTP, mientras doc15 §2.3 promete ese
id para correlacionar. `tagSession` tampoco hacía nada (`updateRequestContext` no-opea sin store).
Cableada en los 4 wrappers (`withTenant`, `withBillingTenant`, `withPlayer`, `withAuth`).

*Por qué no lo vio la suite que ya existía:* `observability-middleware.test.ts` prueba `tagSession`
abriendo el contexto **a mano** con `runWithRequestContext`. La pieza andaba perfecto; lo que
faltaba era el cable entre la pieza y el request real. El candado nuevo
(`tests/unit/route-wrappers-request-context.test.ts`) prueba el WRAPPER: 5 de sus 8 casos fallan si
se saca la llamada (verificado).

**2. Cache de slots por cancha: 0 lectores, 11 invalidaciones.** `readThroughSlots`/`getCachedSlots`/
`setCachedSlots`/`getAvailableSlotsCached` no tenían un solo caller, pero los mutadores de `bookings`
llamaban a `invalidateCourtDateSlots` en 11 lugares — borrando claves de Redis que nadie escribía
nunca, en el camino caliente de la plata.

No fue un olvido, fue un **desajuste de forma**: el único consumidor plausible es
`getPublicAvailability`, que resuelve TODAS las canchas del complejo en una query, así que un cache
por-cancha lo habría convertido en N GETs a Redis para reemplazar 1 query — más lento, no más
rápido. Y esa ruta ya cachea en el borde (`s-maxage=30, stale-while-revalidate=60`). Se eliminó la
mitad por-cancha; la mitad de búsqueda cross-tenant (`invalidateAvailSearch`, que SÍ tiene lector)
queda intacta y los 11 call sites ahora la llaman derecho.

### Lo demás

- **Sitemap de torneos**: `/[slug]/torneos` y sus fichas eran páginas públicas indexables sin un
  solo enlace ni entrada de sitemap — invisibles para Google. Cableado con
  `listPublicTournamentSlugs` (que ya aplica el feature flag + `is_public`), en tandas de 5 para no
  vaciar el pool.
- **Borrados**: `tailwind-output.css` (102 KB de build committeado en la raíz), `scripts/_jsonb_probe.ts`,
  `nextPlanSlug`, `qualifiedCount`, `cleanupVisualData`, y `deleteEventsForMatch` — cuyo comentario
  decía "lo usan los services de fase 1 y 2" y no lo usaba nadie (el borrado en cascada real lo hace
  `clearFixture` con su propio DELETE inline).
- **devDependencies**: `@eslint/js` y `globals` fuera. `eslint.config.mjs` documenta que NO usa
  `js.configs.recommended` a propósito, así que nunca se importaron.
- **~80 exports y tipos** perdieron el `export`: se usaban solo dentro de su archivo.

### Exenciones, todas con motivo escrito

La única forma de eximir un símbolo es `/** @public */` pegado al código — no hay allowlist en el
config. Se usa para: superficie vendorizada de shadcn/ui (la reintroduce cualquier `npx shadcn add`),
helpers de `tests/e2e/mobile/_helpers.ts` reservados para una tarea abierta de Lazar, y
`adjustStockAction` (que ya tenía la decisión escrita: arqueo físico, v1.5).

### 4 features de Torneos sin forma de dispararse → CERRADO en B16

`deleteTournamentAction`, `updateTeamAction`, `rescheduleMatchAction` y `seedPlayoffsAction` estaban
implementadas, validadas y con guards, y **ningún componente las importaba**. Quedaron marcadas
`@public` como exención temporal hasta la decisión del dueño. Decidió cablearles UI: ver **B16**,
que borra las 4 exenciones.

---

## B1 — El código borraba 83 días antes de lo que los términos prometen (2026-08-09)

`/terminos` y `/privacidad`, las dos páginas publicadas, le garantizan al titular que **"los datos
del complejo se conservan 90 días tras la baja (estado churned)"**. `CHURNED_DELETION_DAYS` valía
**7**. El sistema eliminaba datos personales alcanzados por la Ley 25.326 ochenta y tres días antes
de lo comprometido por escrito. No es una preferencia de producto: es incumplir un contrato
publicado.

Constantes: `CHURNED_DELETION_DAYS` 7 → **90**, y `CANCELED_BLOCKED_DELETION_DAYS` pasa a derivarse
(`CHURNED_DELETION_DAYS + 7`) en vez de ser un 67 suelto, así que ya no pueden desincronizarse.

### La constante sola no alcanzaba

`scheduled_deletion_at` **se materializa en la fila** en el momento de la transición
(`NOW() + interval`), no se calcula al leer. Las filas que ya pasaron por
`transitionBlockedToChurned` / `transitionCanceledToBlocked` conservan la fecha vieja, y el worker
de retención las habría borrado igual. La **migración 073** las corrige.

**Dos deltas distintos, no uno** — el plan original decía "+83 días" para todas y habría estado mal:

| Camino | Escribía | Falta | Total |
|---|---|---|---|
| `churned` (`transitionBlockedToChurned`) | `NOW() + 7d` | +83d | 90 |
| `blocked` (`transitionCanceledToBlocked`) | `NOW() + 67d` | +30d | 97 |

Un +83 uniforme habría dejado a los `blocked` en 150 días. El filtro por status alcanza para
separarlos porque `suspended → blocked` (dunning día 14) no toca `scheduled_deletion_at`: los únicos
cuatro UPDATE que lo escriben son los dos de churned y los dos de cancelación. La migración es
aditiva (solo empuja fechas hacia adelante) y las guardas de cota superior la hacen efectivamente
idempotente.

### Candados

- `retention-matches-legal-promise.test.ts` **lee el número del texto legal publicado** y lo compara
  con la constante que ejecuta el borrado, en las dos direcciones: falla si alguien baja la
  constante *y* si alguien reescribe el texto sin tocar el código.
- `billing.test.ts` tenía los plazos pegados (`toBeLessThan(7.5)`, `toBeLessThan(68)`). Ahora los
  toma de las constantes: el test de integración prueba que la transición **aplique** el plazo, y
  cuál es el plazo correcto lo custodia el candado legal.
- Control negativo corrido en los dos: volver a poner 7 pone 4 casos en rojo.

### CTA de WhatsApp: apuntaba a un número inexistente

`ArticleShell` (el pie de **todas** las páginas editoriales) linkeaba a `wa.me/5491100000000` —
un placeholder, publicado en producción. El único camino de conversión de esas páginas caía en un
número que no existe. Centralizado en `src/lib/contact.ts` con el número real.

El candado tiene dos mitades, porque arreglar el número no arregla la causa: una detecta pinta de
placeholder (`5491100000000` muere en la regla de "6 dígitos repetidos"), y la otra **escanea `src/`
y prohíbe cualquier `wa.me/<dígitos>` fuera de `contact.ts`**. Los usos dinámicos (`wa.me/?text=`
para compartir, `wa.me/${telefonoDelCliente}` en Caja y en el cierre de reserva) siguen permitidos.

### Los 🟢 de texto

- **`bg-emerald-505`**: clase inexistente delante de la real, sin efecto. Borrada.
- **"+1.200 turnos libres hoy"**: métrica inventada en el hero de la home pública, con cero
  complejos reales en el sistema. Borrada.
- **`TODO(f14-tz)`**: pedía migrar `getTestDate()` a `tomorrowDateIsoArt()`. El problema real no era
  el +2d sino el `toISOString()`, que devuelve el día **UTC**: entre las 21:00 y las 24:00 de ART ya
  es el día siguiente, así que el test pedía turnos para hoy+3 tres horas por noche. Se conservó la
  ventana y se corrigió la zona con un `dateIsoArtIn(n)` nuevo.
- **`PinGate`**: NO era un hallazgo. El comentario de `analiticas/page.tsx` ya dice explícitamente
  que la mención al PinGate era falsa y por qué. Estaba corregido; queda anotado para que el próximo
  grep no lo vuelva a levantar.
- **`TenantStatusBadge` duplicado**: había **dos** componentes con el mismo nombre, el mismo set de
  8 estados y las mismas etiquetas, cada uno con su tabla de clases hardcodeada — y ya habían
  divergido: `suspended` era ámbar en uno y rojo en el otro, `churned` gris en uno y rojo en el otro.
  El mismo complejo se veía de dos colores según la pantalla del panel. Encima **ninguno pasaba por
  `StatusBadge`**, que existe justamente para imponer MASTER §1.4 (*color + ícono + texto siempre
  juntos, nunca color solo* — daltonismo): los dos distinguían los 8 estados solo por color.
  Fusionados en `_components/tenant-status-visual.tsx` sobre `StatusBadge` + `TONE_BADGE`, con ícono
  por estado y `count` opcional. 4 importadores repuntados, 2 archivos de stories fusionados en 1.

---

## B6 — `@/shared` deja de conocer `@/modules` (2026-08-10)

La regla `turnogol/capas-shared` estaba en `warn` con 6 violaciones de VALOR y un comentario que
prescribía el fix: *"inyección de dependencias (pasar la función como parámetro)"*. Leídas las 6
aristas, **ninguna era eso**. Eran dos problemas distintos, y los dos se resolvían moviendo archivos,
sin tocar una línea de lógica.

### Arista 1 — `shared/db/audit.ts` → `@/modules/auth/impersonation`

El módulo importado es **puro `node:crypto`**: un códec de cookie firmada HMAC, auto-documentado como
*"Este módulo es PURO... lo importan workers, audit.ts y tests sin arrastrar `next/headers`"*. No es
dominio. Estaba **mal ubicado**: con el archivo del lado de `modules/`, una dependencia de
infraestructura sobre infraestructura se veía como acoplamiento al dominio.

`src/modules/auth/impersonation.ts` → **`src/shared/security/impersonation-cookie.ts`**. 7
importadores. `impersonation.server.ts` (que sí usa `next/headers`) se queda en `modules/auth`.

### Aristas 2-6 — los 4 wrappers de route handler

`with-auth`, `with-player`, `with-role`, `with-tenant` importaban `extractAuthUser` ×3 y
`getStaffRole` ×2. **No son infraestructura**: son el composition root del runtime web — orquestar
auth + rol + lifecycle de tenant + contexto de DB *es* su función.

El propio `eslint.config.mjs` ya había escrito ese argumento para eximir `src/shared/jobs/**`
("los workers son el composition root del runtime de background... igual que src/app/ lo hace para el
runtime web"). Se aplicó el mismo criterio, pero **moviendo los archivos en vez de eximir el
directorio**: `src/shared/middleware/` también contiene `observability.ts`, que sí es infra pura, y
un `ignores` sobre el directorio entero le habría abierto la puerta a cualquier archivo futuro.

`src/shared/middleware/with-*.ts` → **`src/server/middleware/`**. 24 importadores. `observability.ts`
se queda donde estaba.

**Por qué no DI:** inyectar `{ extractAuthUser, getStaffRole }` habría metido boilerplate en ~18
route handlers y, peor, habría hecho *posible* inyectar un resolver equivocado en el borde de
aislamiento de tenants. Un movimiento de archivo no puede introducir ese bug.

### `src/server` como capa

No es un eslabón más de `app → modules → shared`: está **al lado de `app`**, y es el único lugar
(junto a `shared/jobs`) autorizado a orquestar dominio. Documentado en CLAUDE.md y en el bloque de
capas de `eslint.config.mjs`. La regla nueva `turnogol/capas-server` le prohíbe importar
`@/components`, `@/hooks` y `@/app`: compone, no renderiza.

### Trinquete

`turnogol/capas-shared` pasa de `warn` a **`error`**. Mensaje reescrito: en vez de prescribir DI,
ahora nombra la salida correcta ("si el archivo NECESITA orquestar dominio, no es infraestructura:
su lugar es @/server o @/shared/jobs").

**Control negativo corrido**: un `import` de valor de `@/modules/staff/staff.service` en un archivo
de `shared/` y uno de `@/components/ui/button` en uno de `server/` dan `2 errors`. Las dos reglas
muerden de verdad.

### El movimiento invirtió una capa, y el trinquete no lo veía

Lo encontró el revisor adversarial con contexto fresco, con el gate entero en verde.

`src/modules/staff/guards.ts` reusa `BLOCKED_TENANT_STATUSES` / `READ_ONLY_TENANT_STATUSES` como
fuente única para el bloqueo de lifecycle en Server Actions. Esas constantes vivían en
`with-tenant.ts`, así que al mover ese archivo a `@/server` el import pasó de `modules → shared`
(permitido) a **`modules → server`** — exactamente la dirección que el bloque `capas-server` que
agrega este mismo PR declara imposible ("app → server → modules → shared, nunca al revés").

Ningún gate lo atrapaba: `capas-nadie-importa-app` restringía `@/app/**` y nada más.

Las constantes son **estados de `tenants.status`, o sea dominio**, no lógica de middleware. Se
movieron a `src/modules/tenants/tenant.lifecycle.ts` (archivo nuevo), de donde las importan tanto
`with-tenant.ts` como `guards.ts` y `settings/equipo/actions.ts`. Nadie invierte nada.

### La trampa de la flat config: un bloque posterior REEMPLAZA la regla, no la suma

Al agregar `@/server/**` como patrón prohibido en `capas-nadie-importa-app-ni-server`, el control
negativo mostró que **solo mordía en `src/modules/**`**. En `src/shared/**` el import de `@/server`
pasaba limpio.

Causa: `capas-shared` es un bloque POSTERIOR que matchea los mismos archivos, y en flat config eso
reemplaza la configuración entera de la regla en vez de sumarse. `capas-shared` solo listaba
`@/modules/**`, así que para `src/shared/**` los patrones de `@/app` y `@/server` desaparecían.

La clase completa, barrida: `capas-lib` tenía el mismo agujero (y ya lo tenía **antes** de este PR —
`src/lib/**` podía importar `@/app/**` sin que nadie chillara), y `capas-components` cubría `@/app`
pero no `@/server`. Los tres bloques repiten ahora los patrones que les corresponden, con un
comentario que explica por qué la repetición no es copy-paste.

**Control negativo final**: 5 archivos sonda, uno por capa (`modules`, `shared`, `lib`,
`components`, más `lib → modules` para confirmar que no se rompió el patrón viejo) → `5 problems
(5 errors)`. Todas las capas muerden.

### Config muerta borrada

El bloque `turnogol/capas-components-excepcion-ticketpanel` eximía a
`src/components/dashboard/DashboardCanteenButton.tsx`, **que ya no existe**. El TODO que pedía mover
`TicketPanel` a `@/components` quedó sin objeto: ningún archivo de `@/components` importa
`@/app` como valor hoy (los 4 que quedan son `import type`, que la regla deja pasar). `TicketPanel`
se queda en su ruta — sus imports relativos (`../caja-lib`, `./ticket-lib`, `./actions`,
`./TabDialog`) confirman que es una pieza de esa ruta, no un componente reusable.

### Evidencia

`pnpm lint`: 44 problemas → **38** (0 errores). Los 6 de `no-restricted-imports` a cero; los 38 que
quedan son los de react-hooks, que son B7. `pnpm typecheck` limpio. `pnpm test` 3088/3088.
`pnpm test:integration` 878/878. `pnpm test:isolation` 166/166. `pnpm knip` sin hallazgos.

Las dos suites de DB hay que correrlas **en serie**: lanzadas en paralelo contra el mismo Postgres
local dan `PostgresError: tuple concurrently updated` (la carrera de GRANT de `ensureRoles` ya
documentada). Da 12 rojos que no tienen nada que ver con el cambio.

Un test tenía la ruta pegada como string y hubo que repuntarlo:
`route-wrappers-request-context.test.ts` lee los 4 archivos con `readFileSync` para verificar que
todos envuelvan en `runRequestObservability` — leía de `src/shared/middleware`. Es exactamente el
candado que debía romperse con este movimiento.

---

## B7 — 38 warnings de react-hooks a cero (2026-08-10)

`eslint-config-next@16` trajo las reglas del linter del React Compiler
(`set-state-in-effect`, `purity`, `use-memo`). Entraron en `warn` porque el
código nunca se había escrito contra ellas. El comentario del config decía
"19 / 6 / 2"; el inventario real al arrancar era **25 / 11 / 2 = 38**.

Ahora son **0**, con las tres reglas en `error`.

### No era una familia, eran cuatro

El valor del bloque no fue apagar warnings: fue que cada familia escondía un
defecto distinto.

**1. Valores que solo existen en el browser (11 sitios).** El idiom
`useState(fallback)` + `useEffect(() => setX(leer()), [])` para localStorage /
matchMedia / `mounted` pinta el fallback, hidrata, y recién en un SEGUNDO render
pinta el valor real: un frame de parpadeo garantizado. `use-client-value.ts`
(nuevo) generaliza lo que `use-is-desktop.ts` ya hacía bien —
`useClientValue` / `useHydrated` / `useMediaQuery` / `useClientSnapshot`— y
`use-persisted-flag.ts` suma escritura con invalidación por evento `storage`
(dos pestañas quedan sincronizadas solas).

**2. `Date.now()` en el render de un componente cliente (7 sitios).** Esta NO
era deuda de linter, era un bug latente. El valor decide UI real —"¿seguís
dentro de las 24h para deshacer la ausencia?", "¿la cancelación entra en
política?", "¿el turno ya terminó?"— y quedaba congelado en el instante del
último render: una pestaña abierta cruzaba el límite y seguía ofreciendo lo de
antes. `use-now.ts` (nuevo) expone el reloj como store externo, con un
`setInterval` por granularidad compartido entre todos los consumidores.

**3. `purity` en Server Components (5 sitios).** Falsos positivos legítimos: el
cuerpo de un `async page` corre una vez por request. Tres de los cinco
re-implementaban a mano el `new Date(Date.now() - 3h).toISOString().slice(0,10)`
que `artTodayStr()` ya hacía — usan el helper, tres copias menos. Los otros dos
llevan `eslint-disable` con el motivo escrito.

**4. Estado derivado de props (12 sitios).** `useEffect(() => setX(prop), [prop])`
para adaptar estado interno a una prop que cambió. React documenta el ajuste
DURANTE el render comparando contra el valor anterior; con el efecto el
componente pinta el valor viejo y se corrige en un segundo render.

### Lo que atraparon los tests, no yo

- **`use-persisted-density.test.ts`** — el caché en memoria de la primitiva nueva
  pisaba el disco SIEMPRE. Solo debe existir cuando `setItem` lanza (Safari
  privado); si la escritura funciona la entrada se borra, o el Map le tapa a
  `getSnapshot` cualquier escritura externa y filtra estado entre tests.
- **`Reveal.stories.tsx`** — dos stubs de `matchMedia` armados con
  `{ ...real(query), matches: false }`. `addEventListener` vive en el PROTOTIPO,
  así que el spread se lo comía. Alcanzaba mientras el componente solo leía
  `.matches`; `useSyncExternalStore` sí se suscribe.
- **Story `ConFiltrosActivos`** — en `ExplorarFilters` la clave de comparación
  arrancaba con el valor actual, así que el sync no corría en el PRIMER render.
  Entrar a /explorar con filtros en la URL los mostraba todos apagados.
- **`report-unused-disable-directives`** — al pasar las reglas a `error` marcó un
  `eslint-disable` que había quedado sin objeto. Vale la pena saber que está
  prendido.

### Dos riesgos evitados en `useArtNow`

Es el hook que alimenta `slotHasPassed`: si se rompe, un turno pasado vuelve a
ser clickeable y el admin puede reservar en un horario que ya fue.

1. Derivar el objeto del reloj devolvía una REFERENCIA nueva por render. El hook
   viejo devolvía un valor de estado (estable entre ticks), así que habría roto
   las deps de todo consumidor. Memo de un slot.
2. Adelantar la hora real al SSR habría cambiado el HTML del servidor: servidor y
   cliente calculan con SU reloj, y cruzar un minuto entre los dos renders da
   hydration mismatch en cada celda del borde. De ahí `useNowMsAfterHydration`,
   que devuelve 0 hasta hidratar — el equivalente numérico del
   `{ date: '', time: '' }` con el que el hook arrancaba.

El candado que ya existía (`use-art-now.test.ts`, el de #29) pasa igual, y
`use-now.test.ts` (nuevo, 5 casos) cubre lo que no era obvio: un solo interval
con N consumidores, limpieza recién con el ÚLTIMO unmount, `getSnapshot` estable
entre ticks (si devolviera `Date.now()` fresco el render entra en loop infinito)
y la identidad del objeto de `useArtNow`.

### Los disables que quedan

8, todos deliberados y con el motivo al lado. Tres familias: Server Components,
arranque de una operación asincrónica (`setLoading(true)` antes de un fetch, que
no encadena renders porque el efecto no depende de `loading`), y efectos que
deciden consultando el DOM real (`document.activeElement`, `querySelector`),
imposible durante el render.

### Evidencia

`pnpm lint` **0 errores** con las tres reglas en `error` (los 6 warnings que
quedan son los de capas que cierra B6, que va en otra rama). `pnpm typecheck`
limpio. `pnpm test` **3093/3093**. `pnpm test:storybook` **259 archivos,
1035/1035**.

Ojo: unit y storybook **no se pueden correr en paralelo** — `e2e-endpoint-guard`
sale rojo por contención y pasa aislado. Mismo cuidado que con las dos suites de
DB en B6.

---

## B16 — El producto pedía cuatro cosas que no dejaba hacer (2026-08-11)

Las 4 Server Actions huérfanas que B5 dejó marcadas `@public` no eran higiene de knip. Eran cuatro
promesas escritas que la aplicación no podía cumplir, y las cinco están citadas textuales:

| Dónde lo dice el producto | Qué hacía falta |
|---|---|
| `FixturePanel.tsx` — *"Después podés mover cualquier partido a mano."* | `rescheduleMatchAction` |
| `FixturePanel.tsx` — *"…quedaron sin día ni hora … movelos a mano."* | `rescheduleMatchAction` |
| `mapTournamentError` ×2 — *'marcalo como "se bajó"'* | `updateTeamAction` (`status`) |
| `PosicionesTable.tsx` + `StandingsTieUnresolvedError` — *"cargales el número de siembra"* | `updateTeamAction` (`seed`) |
| `tournament-standings.service.ts:319` — `/** Botón "Cerrar zonas y sortear cruces". */` | `seedPlayoffsAction` |

El nombre del botón estaba escrito en el código desde julio. El botón no existía.

### La Planilla — por qué un tablero y no un selector de fecha

`rescheduleMatch` valida tres cosas que desde la UI son invisibles: que el partido entre ENTERO en
una hora que el torneo posee **en esa cancha**, que ningún equipo quede con dos partidos pisados, y
que la cancha no termine con dos encima. Un input de fecha y hora libre habría dado
`MatchOutsideOwnedTimeError` casi siempre, porque el encargado no tiene forma de saber qué horas
posee el torneo.

La Planilla dibuja esas horas (día × cancha) con los partidos adentro, un riel de "Sin agendar"
arriba, y **click-to-place**: tocás "Mover" y los huecos legales se marcan como destino mientras los
ilegales quedan apagados con el motivo en una línea ("Los Pibes ya tiene otro partido a esa hora.",
mismo texto que el error del servidor). Sin drag and drop: el teclado y el teléfono del mostrador
salen gratis, y lo que importa acá es **ver la legalidad antes de mover**, que arrastrar no da.

**Las celdas salen de la misma función que usa el generador.** `placementsIn` (privada en
`fixture/scheduler.ts`) se expuso como `openingsIn(slot, opts)`, y `fixture/placement.ts` la consume
para clasificar cada hueco en `free` / `occupied` / `team_busy` / `current`. Si el paso del
scheduler cambia, cambia en los dos lados a la vez: el tablero no puede ofrecer un hueco que el
generador no usaría. Es afordancia, no control de acceso — el service revalida igual y su rechazo se
muestra inline sin cerrar nada.

Dos casos que el tablero no puede esconder, y que tienen su propio riel:
- **Sin agendar** (`startsAt = null`): los que no entraron al generar.
- **Fuera de las horas del torneo**: tienen día y hora pero el torneo ya liberó esa hora. Sin este
  riel, el partido desaparecía de la pantalla sin aviso.

La Planilla pasa a ser la vista por defecto del fixture; el listado agrupado queda detrás de un
toggle. **Gotcha del toggle**: `usePersistedFlag` devuelve `false` cuando no hay nada en
localStorage, así que el flag tiene que nombrar la elección NO por defecto
(`tg-torneos-vista-listado`, `serverValue: false`) o la Planilla no sería el default. Mismo patrón
que `usePersistedDensity`.

### La ficha del equipo

El estado (`registered` / `confirmed` / `withdrawn` / `disqualified`) va arriba y siempre visible
porque es lo urgente: un equipo que no viene se marca el sábado a la mañana con gente esperando.
Los datos (nombre, capitán, teléfono, arancel, notas) van detrás de "Editar datos".

Clases de confirmación (`gramatica-interaccion.md`): `registered ↔ confirmed` es **Clase A**
(se aplica ya, toast con Deshacer). Bajar o descalificar es **Clase B**, con las consecuencias
verificadas contra el service: sale del cupo (`addTeam` solo cuenta registered/confirmed), sale de
los clasificados (`qualifiedSeeds` los saltea) y **los partidos ya jugados quedan como están** —
punto abierto declarado en el design doc, que ahora se dice en vez de descubrirse.

### El corte

`CorteZonasCard` no es un botón: es el estado del corte. Anticipa los tres bloqueos que
`seedPlayoffs` puede tirar, con el mismo criterio que el service — cuántos partidos de zona faltan,
el empate irresoluble en la línea de corte, y el rol (candado y tooltip, no desaparición). Y muestra
**cómo quedarían los cruces** antes de comprometerlos, con `qualifiedSeeds` + `qualifierLabel`, que
ya estaban escritos y testeados.

Se calcula en el servidor (`buildCorte` en `posiciones/page.tsx`) por dos motivos: el motor no entra
al bundle, y `qualifiedSeeds` **tira** `StandingsTieUnresolvedError` — atraparlo ahí es lo que
permite ofrecer el sorteo de desempate en vez de un cuadro a medias. El error trae nombres y no ids,
así que los equipos empatados se reconstruyen contra la tabla, que es de donde salieron esos nombres.

El sorteo de desempate cierra el círculo: escribe `tournament_teams.seed`, que es lo que lee el
criterio `drawn_lots`. El sistema no sortea — **registra** el sorteo que se hizo con una moneda, que
es como se resuelve en la cancha.

### Borrar el torneo

`deleteTournament` solo borra en `draft` y con cero horas, cero partidos y cero cobros. Por eso no
hay "zona de peligro" fija que estaría muerta el 95% del tiempo: la afordancia aparece solo cuando
borrar es posible, y si hay horas tomadas se muestra **bloqueada con el motivo**. Clase C
(`confirmationPhrase` = el nombre del torneo). Los bloqueos que la pantalla no conoce (fixture,
cobros en Caja) los reporta el servidor y el diálogo los muestra sin cerrarse.

### Fuera de alcance, decidido

**Editar `groupLabel` a mano.** Las zonas las asigna `generateFixture` en serpentina y las persiste;
un override manual desincronizaría el fixture ya generado. El campo sigue en el schema de la acción,
simplemente no se ofrece.

### 🔴 Lo que encontró la revisión adversarial (con el gate 100% verde)

**`buildCorte` escondía a los dos equipos con BYE.** La primera versión filtraba
los cruces por "la primera ronda del cuadro", con un comentario que decía *"el
resto sale de los ganadores, no de las zonas"*. Es falso en cuanto hay BYE, y el
propio repo ya lo documentaba en `tournament-fixture.service.ts:160-162`.

Un torneo de **3 zonas × 2 clasificados** son 6 clasificados en un cuadro de 8:
los seeds 1 y 2 entran directo a semifinales, o sea a la **ronda 2**. Con el
filtro viejo, los dos equipos que mejor terminaron las zonas no aparecían nunca
en "Así quedarían los cruces" ni después en "Los cruces". `groupsCount` y
`teamsAdvancePerGroup` no exigen potencia de 2 (rango 1-16 cada uno), así que no
es una configuración exótica. La siembra real los sembraba bien: era un agujero
de visualización en la pantalla nueva del PR.

**Por qué no lo agarró nada:** `buildCorte` vivía como helper suelto adentro de
`posiciones/page.tsx`, sin export y sin forma de testearlo.
`torneos-corte-zonas.test.tsx` prueba la tarjeta con un `crosses` armado a mano
y nunca ejercita el cálculo.

El fix no es solo el filtro: `buildCorte` salió a `posiciones/corte-lib.ts`
(puro, mismo criterio que `torneos-lib.ts`) con `torneos-corte-lib.test.ts`
encima, 19 casos. **Control negativo corrido**: con el filtro viejo puesto de
vuelta, 4 de esos 19 se ponen rojos. Además:

- `alreadySeeded` pasó a mirar `homeTeamId || awayTeamId` en CUALQUIER ronda:
  en un cruce con BYE el sembrado puede ser el visitante.
- Un lado que espera al ganador de otra llave dice **"Ganador de la llave
  anterior"** en vez de "A definir": el equipo con bye no está sin definir,
  está esperando.
- Cuando el cuadro tiene más de una ronda sembrada, cada cruce muestra su ronda
  (`roundLabel`, ya escrito), o "1º Zona A" en semis se lee como si fuera de la
  misma fecha que los cuartos.

Los otros dos hallazgos quedaron documentados en el código, no arreglados, con
el motivo escrito: la regla 3 de `rescheduleMatch` mira la cancha sin filtrar
por torneo y la Planilla solo ve los partidos del suyo (el servidor rechaza con
`CourtSlotTakenError`, cerrarlo del lado del cliente costaría una query
cross-torneo por render); y el sorteo de desempate escribe un `seed` por equipo
sin transacción conjunta (idempotente al reintentar, y con seeds a medias el
corte sigue bloqueado).

### Lo que encontraron los tests

- **La cuenta de destinos estaba mal en una story** (esperaba 3, eran 2): a las 21 en la otra cancha
  el hueco lo bloquea Los Pibes, que ya juegan a esa hora. La afordancia estaba bien; el comentario
  no.
- **`ResponsiveList` deja las DOS vistas en el DOM** (tabla `sm+` y cards mobile, una escondida por
  CSS): todo conteo tiene que scopearse a la tabla o sale duplicado. Costó 6 falsos rojos.
- **Un `<span class="sr-only">` dentro de un botón duplica su texto en el DOM** y rompe
  `getByText`. Pasó a `aria-label`, que da el mismo nombre accesible sin ensuciar.

### Evidencia

`pnpm typecheck` limpio. `pnpm lint` 0. `pnpm test` **3155/3155** (313 archivos). `pnpm knip` **sin
hallazgos**: los 4 símbolos salieron del reporte y **no queda ningún `@public` en Torneos**.
`tournament-placement.test.ts` cubre los 6 casos del motor puro, incluido el relámpago de 25' que
entra dos veces en una hora de 60 y el partido corrido a mano que pisa dos huecos;
`torneos-corte-lib.test.ts` cubre el cuadro con BYE, con control negativo corrido.

---

## B9 + B10 🔴 — Los tests que nunca corrieron, y el CSV que se exportaba solo (2026-08-11)

Primera tanda del plan `docs/planning/2026-08-11-deuda-cero-bloques-restantes.md`.
Va primero porque todo lo que sigue se apoya en que los tests digan la verdad.

### B9.1 — 27 tests colectados por nadie

`pnpm test` era `vitest run --dir tests/unit`. Ningún script del repo colectaba
`src/`, y ahí vivían 4 archivos de test: `settings/equipo/actions.test.ts`
(guards de autorización de staff), `home.lib.test.ts`, `report.utils.test.ts` y
`dashboard/queries.test.ts`. `vitest list --filesOnly` reportaba 0 archivos bajo
`src/`. No estaban rotos ni skippeados: simplemente nunca se ejecutaban.

Pasa a `vitest run tests/unit src` — 317 archivos, `tests/integration` sigue
afuera (verificado: 0 archivos de integración colectados). CI corre `pnpm test`,
así que el gate se propaga solo.

**Al prenderlos salieron 2 rojos, y los 2 eran drift del test, no un agujero.**
`resendInviteAction` había movido el chequeo de membership de una query dentro
de `withTenantContext` a `isStaffMemberOfTenant` (pool worker, porque la policy
de SELECT de `staff_users` sólo expone miembros `is_active=true`). El test
seguía mockeando la forma vieja: `withTenantContext` devolvía `{members: []}` y
la action lo retornaba crudo, porque ahora ese wrapper envuelve sólo a
`assertActorIsAdmin`. Peor: el archivo **no mockeaba `staff.service` en
absoluto**, así que ese camino pegaba a la DB de verdad en un test unitario.

Se agregó el mock faltante, se alineó el mensaje esperado con el del código, y
se sumó el caso de actor no-admin, que nadie cubría. 11/11.

### B9.2 — 14 guards que garantizaban verde

6 archivos de integración (`daily-summary-worker`, `push-subscribe-rls`,
`push-send-idempotency`, `push-test-endpoint`, `push-dispatch-on-booking-confirmed`,
`push-worker-410-cleanup`) tenían `let dbAvailable = false`, un `beforeAll` con
try/catch que se tragaba el fallo de conexión, y un `if (!dbAvailable) return`
por test. **En los 6 el guard cubría el 100% de los tests del archivo**: sin
Postgres reportaban verde perfecto, y como no usaban `it.skip` ni siquiera
figuraban como skipped. Cinco docstrings prometían por escrito "skips gracefully
if the DB is not available".

Ahora `beforeAll` explota, igual que `isolation.test.ts`. Verificado en las dos
direcciones: con Postgres local **14/14 pasan** (los tests eran correctos, sólo
estaban ciegos); con `DATABASE_URL` a un puerto muerto, el archivo **falla**.

### B10 🔴 — El export de caja pedía sesión, no permiso

`GET /api/reports/revenue` exporta TODOS los `cash_flows` del complejo en un
rango arbitrario, y validaba sólo `user.type === 'staff'` + `getStaffTenant`.
Le faltaban las dos capas que el resto del panel sí aplica:

- **Rol**: no se revalidaba contra `tenant_staff_members`. El claim `role` del
  JWT viene hardcodeado a `'admin'` para todo el staff, así que un miembro dado
  de baja (`is_active=false`) seguía exportando la caja entera con su token
  viejo.
- **Lifecycle**: un complejo `blocked`/`suspended`/`churned`/`deleted` seguía
  exportando, cuando el layout `(admin)` ya lo tiene hard-lockeado por pantalla.

Pasa a `withTenant` (default admin+manager: la misma superficie que
`/analiticas`, de donde sale el botón, y el mismo criterio que
`/api/admin/metrics`). No se agregó `withAnyRole` encima porque el default de
`withTenant` ya es exactamente eso — componer los dos duplica la lectura de rol.

De paso deja de anidar contextos de DB: `withTenant` ya abre la tx
tenant-scoped, así que `getCashFlowsForExport` la recibe en vez de pedir una
segunda conexión al pool, y el cutoff de día operativo sale de
`resolveCutoffMins(tenantId, tx)` — el helper que `metrics` ya usaba — en lugar
de un `getStaffTenant` extra.

### Lo que encontraron los tests

- **Un cast que no barrí desde la raíz.** Cambiar la firma de
  `getCashFlowsForExport` compiló limpio contra `src/`, pero había 3 callers en
  `tests/integration/`. El grep original estaba acotado a `src/` — la lección ya
  fichada de "grepear callers desde la RAÍZ", repetida.
- **`rate-limit-admin-coverage.test.ts` listaba `reports/revenue` como
  `ADMIN_RAW_ROUTES`** ("usa un handler crudo, no `withTenant`"). Ahora lo
  levanta la heurística de `withTenant`; dejarlo en la lista manual escondería
  una regresión futura, así que salió de ahí.
- El `queries.test.ts` huérfano resultó ser un `it.todo` legítimo y documentado
  (`getDashboardData` se retiró en Fase 2). Es el único skipped de los 317.

### Evidencia

`pnpm typecheck` limpio. `pnpm lint` 0. `pnpm test` **3182/3183** (316 archivos
pasan, 1 todo) con `src/` ya colectado.

Control negativo del test nuevo (`reports-revenue-route-guard.test.ts`, 8 casos):
contra el código anterior **fallan 4** — el staff desactivado y los 3 estados de
tenant bloqueado devolvían **200 con el CSV completo**.

### Lo que NO entró

De B10 quedan abiertos, para la tanda mecánica: los 2 🟡 de route-guard
(`api/status` sin auth, `api/e2e/create-booking`), las 12 páginas que usan
`extractAuthUser` crudo sin `getStaffRole` (hoy no es un agujero: son pantallas
operator-level), `with-auth.ts` como código muerto, y los 7 listados sin
paginación — el peor sigue siendo `getStreetMoney`, sin `LIMIT`, recalculado
entero en cada carga de `/caja`.

---

## B12 — Cinco etiquetas, y la columna de texto libre que las contradecía (2026-08-11)

Fase 4, primera mitad. Es el único grupo del backlog cuyo costo sube con el
tiempo: la cirugía de Clientes es barata sin clientes y cara con ellos, y la
ventana expira con el primer contrato.

### La decisión ya estaba tomada; el trabajo era no traicionarla

El set final venía cerrado de `2026-08-07-analisis-rubro-y-decisiones.md:129-166`:
`Se le fía` · `No fiar` · `Organiza el grupo` · `Tiene precio acordado` ·
`Trato conflictivo`. Lo que había que respetar no es la lista, es **por qué es
una lista**: D3 prohíbe texto libre sobre personas y el motivo es legal, no de
UI — lo que un cliente puede leer ejerciendo derecho de acceso (Ley 25.326)
queda controlado en origen.

De ahí salen tres decisiones de implementación que no son de gusto:

- **ENUM `player_tag` cerrado**, no una tabla de configuración por complejo. Un
  set abierto reintroduce exactamente el problema que D3 cierra.
- **Sobre `player_tenant_relationships`**, no sobre `players`: la etiqueta es del
  complejo. Que uno ponga "No fiar" no puede viajar al complejo de al lado —
  cubierto con un test que lo verifica sobre el MISMO jugador en dos tenants.
- **Columna array y no tabla hija**: una tabla nueva arrastra RLS + FORCE +
  policies + DELETE en `data-retention-cleanup.worker.ts` + caso en
  `isolation.test.ts`, y no compra nada. La trazabilidad de quién puso qué ya la
  da `audit_logs` (`player.tags_updated`, con `before`/`after`). Las policies de
  PTR ya scopean por `app.current_tenant_id`, así que la columna hereda el
  aislamiento sin policy nueva.

### `abonados.notes` — texto libre sobre una persona con nombre y teléfono

Existía desde antes de D3 y es literalmente lo que la decisión prohíbe. Se
elimina (migr. 074), decisión del dueño tomada explícitamente.

**Verificado contra producción ANTES de escribir la migración**, no asumido:
`0` filas en `abonados`, `0` con notas, 3 tenants vivos (todos de prueba). Es la
única razón por la que un `DROP COLUMN` es aceptable acá — el rollback recrea la
columna vacía y no hay dato que restaurar.

### La garantía de "sin repetidos" vive en la base

Un `CHECK` no puede llevar subquery, así que el predicado va en una función
`IMMUTABLE` (`player_tags_are_unique`) con `SET search_path` explícito — sin esa
línea, un `CREATE OR REPLACE` futuro deshace el hardening en silencio, que ya
pasó en este repo. El service igual normaliza (dedup + orden canónico) para que
dos guardados con el mismo set produzcan la misma fila y el diff del audit log
sea legible; el CHECK es la garantía de abajo, no la de arriba.

`gets_credit` + `no_credit` juntas se rechazan en el borde (Zod), no se resuelven
en silencio eligiendo una: son opuestas y dejarían al mostrador sin saber qué
hacer.

### Lo que encontraron los tests

- 🔴 **Un array de UN elemento se serializa como escalar en `tx.execute(sql\`\`)`.**
  `setPlayerTags` escribía `player_tag[]` por SQL crudo y Postgres respondía
  `malformed array literal: "no_credit"` (`22P02`). Con 2+ elementos el síntoma
  cambia, así que un test que solo probara el caso multi-elemento no lo hubiera
  visto. Reescrito con el query builder, que conoce el tipo de la columna — y de
  paso es lo que pide B8. El `before` del audit log sale de un
  `SELECT ... FOR UPDATE` en la misma tx, que da la misma garantía que el
  `RETURNING` de la fila vieja que se intentaba primero.
- **El barrido de `notes` no terminaba en `src/`**: 3 fixtures y un test unitario
  lo seguían pasando. Los levantó `pnpm typecheck`, no el grep — que estaba
  acotado a `src/`. Misma lección ya fichada: barrer callers desde la RAÍZ.
- **La regla de capas frenó el primer lugar donde puse los chips**:
  `src/components/` no puede importar dominio como VALOR, y `PLAYER_TAG_LABELS`
  lo es. `PlayerTagChips` quedó route-local en `jugadores/`, que es donde vive su
  único consumidor (y donde va a vivir la lista fusionada de B13).

### Evidencia

`pnpm typecheck` limpio. `pnpm lint` 0. `pnpm test` **3205/3206** (318 archivos
pasan, 1 todo). Stories del componente nuevo **4/4** en chromium.

Migración probada en las DOS direcciones sobre la base local: forward → rollback
completo (columna, constraint, función y tipo fuera; `abonados.notes` de vuelta)
→ forward otra vez. El CHECK de unicidad verificado con un INSERT real que
Postgres rechaza con `chk_ptr_tags_unique`.

**Verificado en la app corriendo, no solo en tests**: login real como admin,
ficha de `/jugadores/[playerId]`, marcar "Organiza el grupo", guardar → la fila
de `player_tenant_relationships` queda en `{group_organizer}` y `audit_logs`
registra `player.tags_updated` con `before: []` / `after: ['group_organizer']`.
El chip aparece en la lista. `/abonados/nuevo` renderiza sin campo de notas y sin
mención a "Notas".

### Lo que NO entró

B13 (la fusión de las dos listas de personas, con el abonado de `player_id NULL`
que hoy `/jugadores` nunca muestra) es la segunda mitad de Fase 4 y queda para el
próximo bloque. El orden lo fijan los docs: B12 destraba B13, no al revés.

### Postmortem del DROP: la ventana que zafó por tener 0 filas

El `DROP COLUMN abonados.notes` viajó en la **misma** migración que sacó el
código que la usaba. Eso es lo que `db-migrate.yml` prohíbe por escrito
("renombrar o dropear algo que el código viejo todavía usa NO es seguro y va en
dos releases") y la razón por la que la regla existe: ya pasó tres veces —
048–051 dejó la caja rota ~10 h, 059/061, y 060–066.

**Por qué es una ventana real.** `db-migrate.yml` corre en el push a `main`,
pero Vercel deploya por integración Git y no desde ese workflow. Nada los
ordena, y el Environment `Production` no tiene protection rules (verificado con
`gh api repos/…/environments`), así que la migración —checkout + CLI + push, ~1
min— le gana al build de Next, que tarda varios. En esos minutos el código VIEJO
sigue sirviendo tráfico contra el schema NUEVO.

**Qué habría roto, que no es lo obvio.** Un `SELECT *` sobrevive a una columna
que desaparece; el query builder de Drizzle no. `getAbonados` zafaba (usa SQL
crudo con `SELECT *`), pero `createAbonado` nombra `notes` en el
`.insert().values()`, y `pause`/`reactivate`/`cancelAbonado` la traen en el
**`.returning()` sin argumentos**, que Drizzle expande a todas las columnas del
schema viejo. O sea: crear o pausar un turno fijo habría tirado error.

**Qué pasó de verdad.** La ventana se detectó después de abrir el PR. El split
en dos releases (074 aditiva + 075 con el DROP) se preparó, pero el merge llegó
unos minutos antes que el push. Salió **sin daño por suerte, no por diseño**:
`abonados` tenía 0 filas en producción, así que las funciones que rompían no
tenían quién las llamara.

Verificado después del merge, no asumido: `db-migrate` en verde
(`11a701d7`), `abonados.notes` ya no existe en prod, `tags` y el ENUM
`player_tag` sí, `/api/status` y `/` en 200, y **cero errores nuevos en Sentry**
(el más reciente es de dos días antes del deploy).

**Lo que queda como regla, no como anécdota:** el split se decide ANTES de abrir
el PR, no después. Una vez que el PR está listo y anunciado, el merge puede
llegar en cualquier momento — y llegó. Y el detector barato antes de dropear
cualquier columna es buscar `.returning()` pelado, no leer los `SELECT`.

---

## B13 — Merge de Clientes: UNA lista de personas ✅ CERRADO (2026-08-11)

**El agujero.** `/jugadores` salía de `player_tenant_relationships ⋈ players`, o
sea **solo perfiles registrados**. Pero `abonados.player_id` es nullable y
`contact_name`/`contact_phone` son NOT NULL: el titular de un turno fijo cargado
de mostrador existe como nombre + teléfono y **no aparecía en ninguna lista de
personas**. Es el caso que anticipó el pase crítico: *"el 'Diego' del fijo de los
lunes, que quizás no tiene cuenta — o peor, quizás ES el 'Diego R.' que reserva
online"*. El propio `ClientesTabs.tsx` lo confesaba por escrito.

### La decisión de diseño: derivar, no crear tabla

La persona sin cuenta **se deriva de `abonados` al leer**. No gana tabla propia.
Dos razones, y la segunda pesa más que la primera:

1. Una tabla tenant-aislada nueva arrastra el costo fijo de siempre (RLS +
   FORCE + policies, filtro explícito, DELETE en `data-retention-cleanup`, caso
   en `isolation.test.ts`).
2. Dejaría **dos fuentes de verdad** para el mismo nombre y teléfono, que se
   separan al primer edit. Derivando, `abonados.contact_name` sigue siendo el
   único lugar donde vive el dato.

Contracara asumida y documentada: una persona sin cuenta **no puede tener
etiquetas** (B12) — viven en `player_tenant_relationships`, que exige
`player_id`. No es una limitación del atajo: la etiqueta es sobre una RELACIÓN,
y la relación empieza cuando el staff vincula. Vincular la destraba.

### Identidad: dos colas de teléfono, no una

- **Agrupar** (`significantPhoneSql`, últimos **10** dígitos, mín. 6): estricta,
  porque fusiona filas **sin que nadie confirme**. Cae al id de la fila cuando no
  hay dígitos suficientes, para que los teléfonos basura no terminen todos en la
  misma persona.
- **Sugerir** (`suggestionPhoneSql`, últimos **8**): más laxa, porque la confirma
  un humano. Es la que hace que `0 11 15 2233-4455` y `+54 9 11 2233-4455` —el
  mismo celular escrito como lo escribe medio país— se reconozcan: sus últimos 10
  dígitos NO coinciden (el `15` corre la ventana), los últimos 8 sí.

Sacar el `15` "bien" exigiría saber si el área tiene 2, 3 o 4 dígitos. Eso es
adivinar, y adivinar mal fusiona personas.

### Vinculación manual, con inverso

`linkContactToPlayer` mueve los `abonados` del grupo, reasigna las `bookings` que
esos fijos generaron (solo las que **no tienen dueño**) y suma al
`bookings_count` de la relación la cantidad real reasignada — ese contador es
incremental, no un `COUNT(*)`. NO toca `noshow_count`: una ausencia de cuando la
persona no tenía cuenta no debe disparar hoy un softban retroactivo.

`unlinkContactFromPlayer` es el inverso exacto y existe porque **no hay ninguna
otra pantalla que le cambie el titular a un fijo**: sin deshacer, un click sobre
una sugerencia equivocada quedaba grabado para siempre.

Guard que importa: el jugador destino tiene que tener fila en
`player_tenant_relationships` de ESE complejo. Sin eso, un encargado podría
vincular contra un `player_id` de otro tenant —y ver su nombre en la lista—.
**Control negativo corrido**: quitando ese `if`, cae exactamente 1 test
(`rechaza vincular con un jugador que no es cliente del complejo`) y ninguno más.

### Evidencia

- `pnpm typecheck` · `pnpm lint` · `pnpm knip` — limpios
- `pnpm test` — **3232/3232**
- `pnpm test:integration` — **907/907** (incluye los 11 nuevos de `contact-link`)
- `pnpm test:isolation` — **166/166**
- Stories de `jugadores/` — **24/24** (axe incluido; el diálogo tiene story en
  estado ABIERTO, si no ese estado no lo mide nadie)
- Verificado en el navegador con el seed E2E: el contacto aparece con la
  sugerencia, vincular lo funde en una fila, desvincular lo devuelve intacto

### Qué queda afuera, a propósito

- **Invitados de una reserva suelta** (`bookings.guest_name`): decisión de
  producto #10, cancelada. Un fijo es un vínculo estable con el complejo; un
  invitado de una noche no.
- **Deudores de cantina** (`canteen_tabs.debtor_name`): mismo criterio.
- **Ficha-panel abrible desde Grilla, Caja y deudas**: es el criterio de salida
  de la Fase 4 completa, no de este bloque.
- El `LIMIT 200` sin cursor sigue ahí y sigue siendo **B10**. Ahora trunca sobre
  un conjunto más grande.

---

## B8 (parte 1) — La suma que concatena no existía; el candado que faltaba, sí

**La premisa del plan está REFUTADA.** El plan de B8 decía que de los ~193 casts
de SQL crudo, *"al menos uno es donde Postgres puede devolver un número como
texto y la suma concatena"*, y señalaba `payment.service.ts:968`. Se buscó la
clase completa sobre los caminos de plata (5 slices, ~100 archivos) y **no hay
ninguno**.

Lo que sí se confirmó, contra el código y no contra el plan:

- **El bug es posible en este repo.** `node_modules/postgres/src/types.js` parsea
  a JS number solo los oids `[21, 23, 26, 700, 701]` — int2, int4, oid, float4,
  float8. int8/bigint (20) y numeric (1700) llegan como **string**. Y los dos
  pools de `src/shared/db/client.ts` (:54 y :151) se crean sin opción `types`,
  así que ese default aplica en el runtime web y en los workers.
- **No hay ningún caso sin cubrir.** `payment.service.ts:968` ya envuelve en
  `Number(...)` y encima declara el tipo honesto (`string | number`), así que la
  pista del plan apuntaba a un sitio que estaba bien.
- Dos candidatos que un grep marca como sospechosos son falsos positivos:
  `booking.debts.ts:61` **sí** tiene `::int`, pero cinco líneas más abajo, sobre
  el `COALESCE` que envuelve al `SUM` — un grep line-local no lo ve. Y el de
  `:79` vive dentro de un `HAVING`: es aritmética 100% en Postgres, nunca cruza
  a JS.

**Lo que sí estaba mal, y no era lo que se buscaba.** Seis `sql<number>` en
`report.service.ts` (:58, :72, :73, :94, :111, :123) envuelven un
`CAST(... AS BIGINT)`. El tipo mentía: en runtime son strings. No producían un
bug **hoy** porque todos los consumidores llaman `Number()` — pero TypeScript
estaba tapando el agujero en vez de señalarlo, y el próximo que escribiera
`total + x` no iba a recibir ningún aviso.

Pasaron a `sql<string>`. El `BIGINT` se deja como está y es deliberado: los
montos son centavos de ARS e int4 se satura arriba de ~$21M de pesos, así que
castear a `::int` sería el arreglo equivocado. **Typecheck en verde después del
cambio es la prueba** de que todos los consumidores ya convertían: un
`reduce((acc, r) => acc + r.total, 0)` con `total: string` no compila.

**El candado:** `tests/unit/sql-number-type-honesty.test.ts` falla si un
`sql<number>` envuelve un agregado que Postgres devuelve como bigint/numeric sin
un cast que el driver sepa parsear. Hasta ahora el repo estaba limpio **por
convención** — cada sitio se acordó de poner `::int` o de envolver en `Number()`
—, y una convención sin candado dura hasta el primer despistado. Control
negativo corrido: revirtiendo un solo sitio, el test lo caza con archivo:línea y
el arreglo concreto.

Alcance del candado, explícito: cubre `sql<number>`, donde el tipo y el SQL están
pegados y se verifican leyendo una sola expresión. **No** cubre
`tx.execute<{x: number}>` ni `as unknown as Array<{x: number}>` — ahí están
separados, y adivinar qué columna corresponde a qué campo produce falsos
positivos. Un candado con falsos positivos termina desactivado, así que se dejó
ajustado en vez de amplio.

### Lo que queda de B8

Los **204** casts `as unknown as` (el plan decía 193; el número creció) siguen
ahí. Con la premisa del bug refutada, lo que queda es higiene de tipos: pasarlos
al genérico `tx.execute<T>()`, que Drizzle ya expone. Vale hacerlo, pero es
churn mecánico sin defecto conocido detrás — conviene decidir explícitamente si
paga las 3 sesiones que estimaba el plan. Falta también **B8d** (el gate de
Prettier, que hoy no corre en CI).
---
## B8d — El gate de Prettier, que estaba configurado y no corría ✅ CERRADO

`.prettierrc` existía desde siempre y `ci.yml` **confesaba por escrito** que
`pnpm format:check` no estaba cableado, "porque enchufarlo exige un reformateo
masivo, que es un esfuerzo aparte". Ese esfuerzo es este. Un gate configurado
que no corre no es una convención floja: es deriva creciendo sin nada que la
frene, y el número lo muestra — el comentario decía ~716 archivos y al medirlo
hoy eran **1071**.

### Tres cosas antes de reformatear, no una

1. **La config peleaba con el código.** `.prettierrc` fijaba
   `trailingComma: "es5"` contra un repo escrito en estilo `"all"` — que además
   es el **default de Prettier 3**. Se alineó la config al código, no al revés:
   nadie eligió `es5` deliberadamente. Medido: baja el diff de 770 a 668
   archivos sobre `src/`. Solo el 13%, así que el reformateo masivo era
   inevitable igual — pero peleaba de gratis.
2. **No existía `.prettierignore`.** Se creó, cubriendo generados (`.next/`,
   `coverage/`, `e2e-results/`, `visual-results/`, `semgrep-sarif/`,
   `playwright-report/`, `scripts/demo/out/`, `**/*-snapshots/`) y el lockfile.
   Y, a propósito, **las migraciones**: `src/shared/db/migrations/` y
   `supabase/migrations/` quedan afuera porque por regla del repo no se editan
   una vez aplicadas — reformatearlas sería tocar archivos inmutables.
3. **El scope estaba desalineado.** `format` cubría `src/` mientras `lint`
   cubría `src/ tests/ scripts/`. Ahora los tres scripts miran lo mismo: un gate
   que ignora `tests/` deja crecer la deriva justo donde más archivos hay.

### Lo único que el reformateo rompió

`tests/unit/use-booking-realtime.test.ts`: un objeto que estaba en una línea pasó
a cinco, y el `// eslint-disable-next-line @typescript-eslint/no-explicit-any` de
arriba **dejó de cubrir** los dos `as any`, que ahora viven en las líneas 14 y 15.
ESLint lo cazó (2 errores). Se pasó a un par
`/* eslint-disable */ … /* eslint-enable */` alrededor del bloque: misma
supresión que ya había, con el alcance correcto.

Vale como gotcha general: **un reformateo masivo mueve las directivas de
supresión de una sola línea**. El detector es correr ESLint después de Prettier,
no antes.

### Evidencia

1071 archivos reformateados. `pnpm format:check` limpio · `pnpm lint` limpio ·
`pnpm typecheck` limpio · `pnpm knip` limpio · **3234** unit · **907**
integración · **166** isolation · **1066** stories en 264 archivos (con axe).

El gate quedó como primer step del job `Lint & Types`, antes de lint y typecheck:
es el más rápido de los tres y el de arreglo más barato (`pnpm format`), así que
no tiene sentido hacer esperar a nadie detrás de un typecheck para avisarle que
le faltó una coma.

### Observación aparte, sin relación con B8d

`pnpm test` falló **una vez de tres corridas** en esta sesión, con 1 test
distinto cada vez y verde al re-correr. Uno se identificó
(`tests/unit/e2e-endpoint-guard.test.ts`, que muta `process.env` y se pisa bajo
paralelismo); los otros dos no se llegaron a capturar. No lo causa este cambio
—pasaba antes— pero es un flake real bajo carga y conviene fichar el archivo
exacto la próxima vez que aparezca, no re-correr y seguir.

---

## B10 (parte 1) — /caja traía toda la deuda impaga para mostrar un número

**El defecto, verificado contra el código.** `getStreetMoney` no tiene `LIMIT`
en ningún lado: dispara `getDebts`, `listOpenTabs` y `listTenantInscriptionDebts`
en paralelo —las tres sin techo—, concatena todo en JS y ordena en JS. Y no lo
llamaba solo `/caja/deudas`, que es donde las filas se muestran: lo llamaban
también `caja/page.tsx:46` y `home.service.ts:316`.

En `/caja` el resultado se usaba **para una sola cosa**: `sumStreetMoney(...)`,
el número del encabezado. O sea que cada carga de la pantalla de plata
materializaba la lista completa de deuda impaga para sumarla. Y la deuda impaga
no se estabiliza — crece con el uso del complejo —, así que el costo de esa
pantalla crece con el negocio.

**El arreglo:** `getStreetMoneyTotal(tenantId, tx)` calcula el mismo número en
Postgres sin traer una fila, y `/caja` pasa a usarlo. `/caja/deudas` sigue con
`getStreetMoney`, que es donde las filas hacen falta.

**El precio, y cómo se paga.** El total en SQL repite los predicados de las tres
funciones de origen, y el docstring del módulo advierte explícitamente contra
tener dos lugares que calculen el total. Por eso no queda librado a la
disciplina: `tests/integration/street-money-total.test.ts` siembra las tres
fuentes y falla si las dos rutas no dan exactamente lo mismo. **Control negativo
corrido**: sacando el descuento de la seña del SQL, el test se pone rojo con
`expected 700000 to be 500000`. La duplicación pasa de riesgo silencioso a
regresión que se ve.

**La home NO se tocó, a propósito.** Ahí `streetMoneyRows` sí se usa para armar
las alertas de turnos impagos del día (`home.service.ts:328`), así que cambiarla
al total no alcanza: hace falta una consulta de deuda filtrada por fecha, que es
trabajo aparte. `/caja` es la pantalla frecuente y es la que gana acá.

### Correcciones al plan de B10

- 🔴 **`with-auth.ts` NO es código muerto.** El plan dice "0 consumidores".
  Falso: lo ejercitan `tests/unit/middleware.test.ts` y
  `tests/unit/route-wrappers-request-context.test.ts`, y este último lo usa como
  **implementación de referencia** (`:119-124`) para después verificar
  estáticamente que `withTenant`/`withPlayer` abren el contexto de request igual.
  Knip no lo marca porque tiene consumidores reales, no por un blindspot.
  Borrarlo debilitaría el guard de los otros dos wrappers. **No se toca.**
- El conteo de `getStreetMoney` sí era correcto, y el problema era peor de lo
  descripto: no es solo `/caja/deudas`, son tres pantallas.

### Lo que queda de B10

- 🟡 `api/status/route.ts` sin auth (info disclosure de estado de infra).
- 🟡 `api/e2e/create-booking/route.ts` con gate por `NEXT_PUBLIC_E2E`, que se
  inlinea en build.
- **La UI que miente**: `listTenantBookings` trunca a `LIMIT 200` mientras
  `countTenantBookingsByStatus` cuenta sin techo — las píldoras pueden decir
  "Completadas (740)" y la lista mostrar 200. Verificado en
  `reservas/queries.ts:89-148`.
- Paginación con cursor real para `listTenantClients`, `/mis-reservas`,
  `getCashFlowsForExport` y `getAbonados`.
- Las 12 páginas con `extractAuthUser` crudo (hoy no es un agujero: son
  pantallas operator-level donde admin y manager pasan igual).

---

## B10 (parte 2) — Guards que no guardaban y listas que truncaban en silencio

**PR**: `fix/b10-guards` · **Fecha**: 2026-08-11

### El hallazgo que no estaba en el plan

🔴 **`mock-mp/checkout/page.tsx` tenía el portón MÁS DÉBIL que sus propias
Server Actions.** La página cerraba con `process.env.MP_MOCK_MODE !== '1'` a
secas; sus actions (`actions.ts:22`) además exigen `NODE_ENV !== 'production'`, y
el gateway (`computeMpMockEnabled`) tiene un docstring que dice textualmente que
tiene que ser **imposible de activar en producción aunque `MP_MOCK_MODE=1` se
filtre a un deploy prod**.

Con esa filtración las actions seguían devolviendo 404 — pero la página
renderizaba. Y `loadBookingSummary` lee `bookings`/`courts`/`tenants`
**cross-tenant con el pool BYPASSRLS y sin auth**: publicaba fecha, hora, cancha,
nombre del complejo y monto de seña de cualquier `bookingId` que se adivinara.

No lo encontré leyendo: lo encontró el test estático nuevo
(`tests/unit/app-page-guard-chain.test.ts`) la primera vez que corrió, junto con
la `page.tsx` del landing. Ahora usa `computeMpMockEnabled()`, con el escenario
exacto cubierto en `mock-mp-checkout-booking.test.ts`.

### 🟡 `/api/status` — el detalle detrás de un token

El endpoint es público a propósito (monitor de uptime externo sin credenciales),
pero el `checks[]` completo le contaba a cualquiera **qué pieza está caída**. El
caso que obliga a cerrarlo no es de principio: `upstash: down` anuncia que el
rate limiter quedó degradado, o sea publica la ventana exacta para probar
contraseñas y magic links sin freno.

Ahora el semáforo (`status` + 200/503) sigue público —es el contrato del
monitor y no dice qué subsistema falló— y el desglose exige `STATUS_TOKEN` en el
header `x-status-token` (comparación en tiempo constante,
`src/shared/security/secret-compare.ts`). **Fuera de producción sale sin token**:
`next dev`, CI y el gate de readiness de Playwright son donde se lo mira, y
exigirles un token sería ceremonia sin defensa.

Sin `STATUS_TOKEN` configurado el detalle queda CERRADO, no abierto — hay un test
dedicado a ese modo de falla, que es la variante cómoda que dejaría producción
igual que antes. `launch-check`/`staging-check` mandan el token si está en su env
file; `doc19_runbook.md §3.0` documenta cómo leerlo.

### 🟡 `/api/e2e/create-booking` — un secreto server-only, no una variable pública

El plan decía que el gate `NEXT_PUBLIC_E2E === '1'` "se inlinea en build".
Cierto, pero **ese no era el problema real**: la barrera efectiva era
`NODE_ENV !== 'production'`, y en cualquier `next build` (previews incluidos) la
función colapsa a `false`. O sea el endpoint ya estaba cerrado en todo artefacto
desplegado.

Lo que sí está mal es que esa barrera —una propiedad implícita de Next que nadie
re-verifica— fuera la ÚNICA sosteniendo una ruta que escribe reservas reales sin
sesión, sin ban y sin seña, con el `playerId` saliendo de un header. Ahora el
portón es `E2E_ENDPOINT_SECRET` (server-only, mínimo 16 chars) que además hay que
presentar en `x-e2e-secret`; `NODE_ENV` queda como segunda barrera, no como la
única. Rechaza con **404, no 401**: un secreto que no matchea no debe confirmar
que la ruta existe. `launch:check`/`staging:check` fallan si la variable existe
en producción.

`pnpm stress:bookings` lo manda y corta con un mensaje claro si falta — sin eso
el síntoma sería "50 de 50 fallaron con 404", que se lee como "el endpoint no
existe".

### Las 12 páginas con `extractAuthUser` crudo: regla, no refactor

Están cubiertas por sus layouts (`(admin)/layout.tsx` para staff,
`settings/layout.tsx` con `requireAdminStaff` para lo solo-admin). O sea el plan
tenía razón: **no es un agujero**. Pero la cobertura es una propiedad del ÁRBOL,
invisible desde el archivo de la página.

Reescribir 12 archivos sin cambiar comportamiento habría sido churn. En su lugar,
`app-page-guard-chain.test.ts` verifica la cadena entera: toda página autenticada
tiene guard arriba, `settings/**` exige `requireAdminStaff` en su cadena, los
route groups públicos están **enumerados a mano** (uno nuevo no hereda la
excepción), y las páginas mock-only exigen el portón de no-producción. La
convención pasó a ser regla — y ya pagó, encontrando el 🔴 de arriba.

### La UI que miente — CERRADO

`/reservas` decía "740 reservas" en el subtítulo y las píldoras (COUNT sin techo)
mientras listaba 200 (`LIMIT` mudo). El defecto no era el techo sino el
**silencio**: nada en pantalla decía que faltaban 540 ni había forma de llegar a
ellas. En el scope `historial`, que crece para siempre, esa es la vista normal de
cualquier complejo con unos meses de uso.

Ahora hay páginas de 100 con paginador, y el rango visible se dice explícito
("Mostrando 101–200 de 740"). Lo mismo en `/jugadores` (`listTenantClients`), que
B13 dejó fichado acá: ahí no había número que contradijera, pero la persona 201
simplemente no existía para la pantalla y el único modo de alcanzarla era adivinar
su nombre en el buscador.

**Offset y no keyset, a sabiendas**: el orden cambia según el scope (tres
`ORDER BY` distintos en reservas), y un cursor por scope serían tres codificadores
con tres oportunidades de perder una fila en un empate. Sobre el historial de UN
complejo el offset no es un problema de performance. `LIMIT n+1` para detectar la
página siguiente, sin pagar un COUNT extra.

### `getCashFlowsForExport` — se rechaza el pedido, no se recorta el resultado

No tiene `LIMIT` y está BIEN que no lo tenga: un export de plata truncado en
silencio es peor que uno que falla, porque el complejo cierra su contabilidad con
un CSV al que le faltan filas y nada se lo dice. El problema era el rango:
`?from=1900-01-01&to=2999-12-31` traía TODOS los movimientos a memoria dentro de
una función serverless. Ahora hay techo de 366 días (un año fiscal con bisiesto)
con 400 explícito. La UI de `/analiticas` solo exporta un mes, así que ningún uso
real se toca.

### Lo que queda de B10 (y por qué)

- **`/mis-reservas`** (`LIMIT 200`): la page trae todo y parte
  próximos/historial **en JS**, así que paginar exige mover ese corte a SQL — no
  es la misma línea que los otros dos. Trunca en silencio pero sin número que lo
  contradiga, y el techo se alcanza recién a ~4 años de reservar todas las
  semanas.
- **`getAbonados`** (sin `LIMIT`, `SELECT *`): el total se calcula con `.length`,
  o sea **es honesto** — no miente, solo no tiene techo. Acotado por la capacidad
  física del complejo (una fila por slot semanal por cancha) más los `canceled`
  acumulados; la pantalla ya filtra por estado.

Ninguno de los dos es la clase que se cerró acá (mentir o volver inalcanzable un
dato). Se dejan fichados, no resueltos.

---

## B10 (parte 3) — CERRADO: los dos listados que quedaban

**PR**: `fix/b10-cierre` · **Fecha**: 2026-08-11

### `/mis-reservas` — lo que se perdía era la cola del historial

La parte 2 lo dejó fichado porque "paginar exige mover el corte a SQL". Medido,
la forma exacta del defecto es más específica de lo que decía el plan:

La query traía `LIMIT 200` **global** con `ORDER BY date DESC`, y el corte
próximos/historial se hacía **en JS**. Como el orden es descendente, esas 200
**siempre** contenían todo lo futuro: el tab "Próximos" nunca estuvo truncado, y
el contador del hero ("Tenés N turnos por jugar") siempre fue correcto. Lo que se
perdía era la **cola del historial** — un jugador de años no llegaba a sus
reservas más viejas y nada en pantalla se lo decía.

Ahora el corte está en SQL y cada tab pagina por su lado (50 por página, que es
lo que se lee en un celular).

**La duplicación que esto introdujo, y cómo se paga.** "Tenés N turnos por jugar"
ya no se puede derivar de las filas en pantalla: parado en Historial no hay
ninguna próxima a la vista. Lo cuenta una query aparte, y si esa query y
`countUpcomingPlayable` divergen, el hero miente. Dos defensas:

1. El vocabulario de estados vive en **un solo lugar**
   (`UPCOMING_PLAYABLE_STATUSES`, exportado desde `upcoming-count.ts`) y la SQL
   lo interpola en vez de repetir la lista de enums.
2. `tests/integration/mis-reservas-pagination.test.ts` compara las dos rutas.
   **Control negativo corrido**: sacando el filtro de estado del COUNT, el test
   se pone rojo con `expected 12 to be 8`.

Misma clase que el total de plata en calle (parte 1), mismo remedio.

### `getAbonados` — sigue sin `LIMIT`, y está bien

**No se paginó, a propósito.** El total que muestra la pantalla sale de `.length`
sobre estas mismas filas, así que el número **nunca puede contradecir la lista**:
no es la clase "la UI miente" que se cerró en `/reservas` y `/jugadores`. El
conjunto además está acotado por la capacidad física del complejo (una fila por
slot semanal por cancha) más los `canceled` acumulados, y la pantalla ya filtra
por estado. Paginar 40 turnos fijos sería ceremonia.

Lo que **sí** se arregló es el `SELECT *`: el cast prometía una forma exacta de
fila que la query no garantizaba. Nombrar las columnas convierte un renombre o un
DROP en un error de Postgres —ruidoso, en el deploy— en vez de un campo
`undefined` con tipo no-nullable llegando a la UI. Precedente concreto:
`abonados.notes` se dropeó en la 074 y este `SELECT *` no se enteró; la próxima
puede no ser tan barata. Cubierto con un test que verifica que ninguna columna
prometida llegue `undefined` (la función no tenía **ningún** test antes).

### B10 cerrado — resumen de las tres partes

| Parte | Qué |
|---|---|
| 1 (#137) | `/caja` materializaba toda la deuda impaga para mostrar un número |
| 2 (#138) | 🔴 `mock-mp/checkout` con portón más débil que sus actions · `/api/status` sin auth · `/api/e2e/create-booking` · la UI que mentía en `/reservas` · `/jugadores` · techo del export CSV · test estático de cadena de guards |
| 3 (este) | `/mis-reservas` por tab en SQL · `getAbonados` sin `SELECT *` |

**Premisas del plan refutadas en el camino** (3): el bug de concatenación de B8
no existía · `with-auth.ts` no es código muerto · el gate de
`/api/e2e/create-booking` no dependía del inlining de `NEXT_PUBLIC_E2E` sino de
`NODE_ENV`. Más un 🔴 que el plan no tenía y encontró un test.

---

## B8 (parte 2) — Los dos caminos a la base no parsean igual, y nadie lo había escrito

**Rama**: `worktree-b8-torneos` · **Fecha**: 2026-08-11

### El plan pedía una cosa; medirlo dijo otra

El plan de B8 pide convertir **193 casts a mano** (`(rows as unknown as Array<{…}>)`)
al genérico de Drizzle (`tx.execute<T>(sql\`…\`)`), en 3 PRs. Hay que decirlo
derecho: **esa conversión no atrapa ni un bug.** El genérico es la MISMA
aserción sin chequear, escrita más corto. Lo único que atrapa algo es comparar
la forma prometida contra lo que el driver devuelve de verdad — y para eso
primero hay que saber qué devuelve.

No estaba escrito en ningún lado. Medido contra Postgres real:

| SQL | `getSql()` (template de postgres-js) | `tx.execute(sql\`…\`)` (Drizzle) |
|---|---|---|
| `timestamptz` / `now()` | **Date** | **string** |
| `date` | **Date** | **string** (`'YYYY-MM-DD'`) |
| `time` | string | string |
| `count(*)` / `sum(int)` | string (bigint) | string |
| `numeric` | string | string |
| `integer` / `::int` | number | number |
| `boolean` | boolean | boolean |

**Las dos APIs del repo parsean distinto el mismo SQL.** El template tag va por
el protocolo extendido (tipado); Drizzle manda todo por `unsafe()` (texto). Los
services usan `tx.execute`, o sea que ahí una columna sin castear es string
SIEMPRE. La tabla quedó escrita en `src/shared/db/client.ts`, que es donde
alguien la va a buscar.

Y una segunda: **el SQL crudo devuelve las claves snake_case**, tal cual las
nombra Postgres. `typeof <tabla>.$inferSelect` es camelCase porque describe la
salida del *query builder*. Los dos se ven iguales en el editor.

### Lo que estaba roto

Barrido completo de los 205 casts. **3 sitios prometían camelCase sobre SQL
crudo**, o sea que todo campo multi-palabra valía `undefined` con TypeScript en
verde:

| Sitio | Qué devolvía |
|---|---|
| `booking.service.ts` `autoCompleteOverdueBookings` | `RETURNING b.*` → `rowToBookingRow` leía `row.tenantId`, `row.timeStart`, `row.priceSnapshot`: todos `undefined` |
| `cashflow.service.ts` `createCashFlow` (insert) | `RETURNING *` con `clientIdempotencyKey` → `tenantId`/`registeredBy`/`occurredAt` `undefined` |
| `cashflow.service.ts` `createCashFlow` (reintento) | ídem por el `SELECT *` del segundo ramo |

Más **12 campos declarados `Date`** que en runtime son string, en 6 archivos
(`abonado.service`, `stock.service`, `payment.service`, `tournament-slots`,
`cashflow`, `daily-close`).

**Bugs vivos hoy: cero, y está verificado uno por uno.** Los consumidores de las
3 filas mentirosas solo leen `.id` o `.length`, y los 12 `Date` pasan todos por
`new Date(...)`, que funciona igual con un string. O sea: el sistema anda **por
casualidad**, no por diseño. Un `r.occurredAt.getTime()` directo compila hoy y
da NaN; `bookingId` ya venía enmascarado — el `?? null` del mapper convertía el
`undefined` en un `null` que se lee como "este cobro no está atado a ningún
turno".

### Lo que se hizo

- Tipo crudo explícito + mapper snake→camel donde el cast mentía:
  `BookingRawRow`/`rawRowToBookingRow`, `CashFlowRawRow`/`rawRowToCashFlowRow`,
  `DailyCashCloseRawRow`/`rawRowToDailyCloseRow` (este último estaba duplicado
  a mano en dos archivos, ahora es uno).
- Los 12 `Date` pasan a `string`. El `new Date(...)` de cada mapper ya era
  correcto; el tipo era el que mentía.
- `tests/unit/raw-sql-row-shape.test.ts`: candado estático de las **dos
  subclases decidibles sin parsear SQL** — `Date` en una fila de `tx.execute`, y
  `$inferSelect` sobre SQL crudo. El candado de la parte 1
  (`sql-number-type-honesty`) había dejado escrito que emparejar campo↔columna
  da falsos positivos, y tenía razón: al escanear el repo, la heurística se
  equivocó sola en cada `Promise.all` de dos queries. Estas dos se deciden
  mirando el TIPO solo, así que entran sin falso positivo.

### Decisiones tomadas y por qué

- **El UPDATE de `autoCompleteOverdueBookings` se queda en SQL crudo.** Pasarlo
  al query builder borraba el cast entero (más lindo), pero
  `auto-complete-advisory-lock` observa el orden lock→UPDATE sobre `tx.execute`
  y quedaba ciego. Esa invariante de concurrencia vale más que un cast menos.
- **La conversión mecánica de los ~190 casts restantes NO se hizo acá.** No
  atrapa nada por sí sola, y el candado nuevo ya lee las dos formas
  (`as unknown as` y `.execute<…>`), así que no la necesita.

### Verificación

- `pnpm typecheck` · `pnpm lint` · `pnpm knip` · `pnpm format:check` limpios
- `pnpm test` → **3321/3321**
- `pnpm test:integration` → **135 archivos / 932 tests**, todo verde. La primera
  pasada dio 3 `Test timed out in 10000ms` (ninguna assertion); re-correr el
  MISMO commit dio verde — el flake de carga ya registrado.
- **Controles negativos corridos** (3): reinyectando cada cast original,
  `raw-sql-row-shape` se pone rojo; el test de bookings da
  `expected undefined to be '4718f890-…'`; el de cashflow da
  `insert: expected undefined to be 'a8ea87e6-…'` y `expected null to be 'd86b81b8-…'`.
