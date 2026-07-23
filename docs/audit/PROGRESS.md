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
