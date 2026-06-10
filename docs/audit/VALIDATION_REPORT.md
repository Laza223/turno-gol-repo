# VALIDATION REPORT — Auditoría Opus 4.8 sobre el trabajo de Opus 4.7

**Auditor:** Opus 4.8 (sesión de validación)
**Fecha:** 2026-05-31
**Branch:** `audit/opus-4.8-validation` (desde `main` @ `8c9272e`)
**HEAD auditado:** `8c9272e` — 25 commits *posteriores* al merge de auditoría completa (`ef8a9b0`, "26/26 AUDITORÍA COMPLETA"). Esos 25 commits son fixes de E2E (los "discovery findings").

> **Veredicto en una línea:** El trabajo de Opus 4.7 es **sólido y honesto** — todos los P0/P1 que verifiqué tienen fix real + test. Pero hay **deuda oculta introducida DESPUÉS del merge de auditoría**: 2 unit tests en rojo (regresión por el bypass de rate-limit de E2E) y el suite E2E `@critical` **no está flake-free** (verde solo en serie). El titular "26/26 COMPLETA" sobre-vende el estado de E2E.

---

## FASE A — Validación del trabajo de Opus 4.7

### A.1 — Estado de los 4 gates

| Check | Resultado | Claim de STATE.md | Veredicto |
|-------|-----------|-------------------|-----------|
| `pnpm typecheck` | ✅ **0 errores** | 0 errores | ✔ coincide |
| `pnpm lint` | ✅ **0 errores/warnings** | limpio | ✔ coincide |
| `pnpm build` | ✅ **Compiled successfully** (34 páginas estáticas) | compila | ✔ coincide |
| `pnpm test` (unit) | ❌ **4 failed / 588 passed (592)** | "590 passing + 2 fails (zod-coverage)" | ✘ **2 fallos NUEVOS** |

Warnings de build (no bloqueantes): Sentry sourcemaps/SENTRY_ORG ausente, `runtime` field en `health/route.ts`. Todos cosméticos.

### A.2 — Los 4 fallos de unit, en detalle

**(a) 2× `zod-coverage.test.ts` — CONOCIDOS, benignos (P3 backlog documentado)**
`bookings/[id]/complete/route.ts` y `no-show/route.ts` no importan `zod`. **No es un gap real:** ambos validan el UUID de ruta vía `parseRouteUuid()` (helper introducido en F4-T6) y no reciben body. El test es una heurística que busca `import {z}`/`*.schema` y no reconoce el helper. → Quick-win: enseñarle el helper al test.

**(b) 2× `rate-limit-apply.test.ts` — REGRESIÓN NUEVA, NO documentada** ⚠️
- `publicAvailability: 31st throttled` → esperaba `ok:false`, recibió `true`
- `fail-closed: authVerify denies when Redis throws` → esperaba `ok:false`, recibió `true`

**Causa raíz (confirmada leyendo el código):** `src/shared/rate-limit/apply.ts:17` cortocircuita cuando `process.env.NEXT_PUBLIC_E2E === '1'` devolviendo `{ ok:true, unavailable:true }`. Ese env var lo carga `tests/setup.ts` desde `.env.test` (vía dotenv). Resultado: en el unit suite, `enforce()` nunca ejecuta su lógica real → los tests que esperan throttle (test 1) y fail-closed (test 4) fallan. El test 3 (fail-open) pasa **por accidente** porque el bypass también devuelve `unavailable:true`.

**Por qué es deuda oculta:** El claim "590 passing + 2 fails" de STATE.md era cierto en el merge F14 (`ef8a9b0`). El bypass se agregó **después**, en `0257bca fix(e2e): bypass rate limit in E2E`, y **nadie volvió a correr el unit suite**. Es exactamente la clase de regresión que esta auditoría buscaba.

**Fix propuesto (quick-win, 5 min):** en el `beforeEach` de `rate-limit-apply.test.ts` agregar `delete process.env.NEXT_PUBLIC_E2E` (es el único test que ejercita el path real de `enforce`). No tocar `.env.test` ni `apply.ts` (el bypass es correcto para E2E).

### A.3 — Estado real de los E2E (corridas reales contra Supabase local + dev server)

Corrí los `@critical` de verdad (Playwright auto-levanta el dev server; Supabase en puerto `54331`).

| Corrida | Resultado |
|---------|-----------|
| `@critical` **paralelo** (8 workers) | **10 passed / 7 failed / 1 skipped** (1.1 min) |
| specs sospechosos **serial** (1 worker) | **7 passed / 1 skipped** — TODO VERDE (45.3s) |

**Clasificación de los 7 fallos del run paralelo:**

| # | Spec | Causa | Clasificación |
|---|------|-------|---------------|
| 1-3 | `booking-flow` S1/S2/S3 (depósito MP) | Timeout 30s esperando confirmación bajo contención de 8 workers + dev cold-compile. **Pasan en serie.** | 🟡 **FLAKE de paralelismo** (no es bug de producto) |
| 4 | `player-data-export` (ARCO) | Bundle devolvió `anon-…@anon.local`: el player compartido fue **anonimizado** por `player-delete-account` en paralelo. **Pasa en serie.** | 🟡 **FLAKE de aislamiento** (fixture compartido) |
| 5-6 | `player-bookings` ×2 | ConfirmDialog no cierra → la acción de cancelar falla (mismo player anonimizado/pollution). **Pasan en serie.** | 🟡 **FLAKE de aislamiento** |
| 7 | `push` (BroadcastChannel toast) | Toast no aparece en 10s. Race del listener BroadcastChannel. | 🔴 **Flaky real conocido** (ya marcado en commits `17e950b`) |

**Hallazgos positivos importantes:**
- ✅ La cascada de **~40 fallos por magic-link single-use** (reportada en F14) **YA NO EXISTE**: `global-setup.ts` pre-genera storage states con `generateLink`. Resuelto por los commits post-merge.
- ✅ El código de producto de los flujos críticos **funciona** — todo pasa en aislamiento.

**Tests deshabilitados (`test.fixme` duros):** `player-bookings:100` (empty-state), `availability:30` (free-slot link), `grilla-realtime:114` y `:186`. **Skips condicionales:** `pin-lockout` (necesita Upstash), `push:43`, `staff-crud:180` (necesita `E2E_RESEND_EMAIL`), `mobile-smoke:78` (estructura UI).

**Conclusión E2E:** El suite es **funcionalmente correcto** pero **no hermético bajo ejecución paralela**. Esto coincide exactamente con el *done-criterion #3 de F14 que quedó DIFERIDO* ("0 flaky 10x verde"). El problema es **deuda de infraestructura de test** (sin reserva de slot per-test, sin player aislado por test, contención en cold-start), **no bugs de la aplicación**. Consecuencia operativa real: `pnpm test:e2e:ci` (que corre en paralelo) da **rojo** → no puede ser un required-check confiable hasta hacerlo hermético.

### A.4 — Verificación de bugs reportados como "fixed" (3 P0 + 11 P1)

**P0 (3/3 verificados):**

| Bug | Fix presente | Test que lo cubre |
|-----|--------------|-------------------|
| **B1** — completeBooking/markNoShow sin validación de tiempo | ✅ `booking.service.ts:375-385` (SQL `(date+time_end)>NOW()` → `BookingNotYetEndedError`) y `:428-436` (`time_start`, con comentario sobre auto-ban falso) | ✅ `tests/integration/booking-time-validation.test.ts` |
| **B11** — CI aplicaba migrations divergentes | ✅ `src/shared/db/migrations/010..014.sql` presentes | ✅ (convención + dir versionado) |
| **F7-H1** — `notification_url` → ruta 404 | ✅ `payment.service.ts:88` → `/api/webhooks/mercadopago` (la vieja `/api/mp/webhooks` no existe en ningún lado; el route handler existe) | ✅ `tests/integration/webhook-notification-url.test.ts` — **test riguroso** (capturing gateway, asserta URL exacta Y que NO contenga la ruta vieja) |

**P1 (11/11 verificados — implementación + test):**

| Bug | Evidencia |
|-----|-----------|
| B3 — over-refund / double-refund | ✅ `payment.service.ts:402` "prevent over-refund and double-refund" + tests pago |
| B5/B10 — send-email double-dispatch | ✅ `send-email.worker.ts:28` `claimNotificationForSend` (claim atómico) |
| B6 — PIN brute-force | ✅ policy `pinAttempts` (fail-closed) + `pin.test.ts`/`pin-cookie-tampering.test.ts` ✔ |
| B9 — ARCO data-export | ✅ `/api/player/data-export/route.ts` + E2E pasa (serial) |
| B9 — Sentry PII scrubber | ✅ `src/lib/sentry-pii-scrub.ts` + `sentry-pii-scrub.test.ts` (11) ✔ |
| B2 — postgres BYPASSRLS | ✅ launch-check + `launch-check-helpers.test.ts` (7) ✔ |
| B11 — refresh-mp-tokens lock | ✅ `pg_try_advisory_xact_lock(hashtext('mp_refresh:…'))` + `mp-token-refresh.test.ts` (6) ✔ |
| F3-H1 — realtime catch-up | ✅ `use-booking-realtime.test.ts` (7) ✔ |
| F5-H1 — botones abonado funcionales | ✅ `abonados-list.test.tsx` (13) ✔ |
| F7-H8 — `deposit_status`→`paid` al confirmar | ✅ `booking-flow` E2E asserta `deposit_status==='paid'` y pasa (serial) |
| F4-H1 — cancel admin con radios de reembolso | ✅ `reservas-crud:142` "refund radios visible" pasa en el run paralelo |

**Veredicto Fase A:** **Cero bugs "fake-fixed".** Cada P0 y cada P1 muestreado tiene implementación real + cobertura. El claim de "47 bugs fixed" se sostiene. La única deuda oculta es: (1) los 2 unit tests de rate-limit en rojo por el bypass E2E post-merge, y (2) el suite E2E no flake-free (conocido/diferido, pero el titular "COMPLETA" lo minimiza).

---

## FASE B — Análisis fresco del estado actual (¿listo para producción?)

### B.1 — Scorecard por área (1-10)

| Área | Nota | Justificación |
|------|:----:|---------------|
| **Multi-tenancy** | **9** | Suite de aislamiento BLOQUEANTE de **84 tests** (SELECT/INSERT/UPDATE/DELETE cross-tenant + fail-safe sin contexto = 0 filas + REVOKE). `SET LOCAL` correcto (`set_config(...,true)`). RLS dual staff/player. Tests usan rol no-superuser real (`authenticated`/`turnogol_app`). Launch-check valida `rolbypassrls=false`. **Único riesgo:** la RLS depende 100% de que el `DATABASE_URL` de prod NO sea superuser (garantía de runtime, no de compilación). |
| **Seguridad** | **7** | Headers fuertes (CSP, HSTS 2a+preload, X-Frame DENY, nosniff, Permissions-Policy). Rate-limit con políticas fail-open/closed. PIN brute-force. PII scrub. Tokens MP cifrados AES-GCM. **Gaps:** CSP `script-src 'unsafe-inline'` sin nonce; sin `report-uri`; rate-limit NO aplica a Server Actions admin (solo API públicas/auth/booking); CSRF = built-in Next (riesgo aceptado sin documentar formalmente); sin validación `Sec-Fetch-*`. |
| **Admin UX/UI** | **7** | Cubre el core operativo: grilla+realtime, reservas, caja+cierre, canchas, abonados con preview, reportes, settings PIN-gated, staff, onboarding wizard. Confirm dialogs, optimistic updates, mobile-responsive. **Diferido:** venta rápida cantina (US-CAJ-004), algunos emails transaccionales. |
| **Testing** | **7** | Amplitud real: 592 unit, ~344 integration (incl. 84 RLS bloqueante), 92 E2E/31 specs con 18 `@critical` + CI gate + flake-detect. **Debilidad:** E2E no hermético (flakes), 4 unit en rojo hoy, 3 integration fails conocidos, varios `fixme`. |
| **Observabilidad** | **6** | Sentry (PII scrub, graceful init, web-vitals), logger estructurado, request-id, `/api/status`, DLQ→Sentry, queue-depth endpoint. **Gaps:** `/api/status` es presence-only (sin health real de DB/pg-boss/Upstash/Resend); sin Sentry Performance/transactions; sin métricas de negocio/alertas/dashboard. |
| **Performance** | **6** | Build limpio, bundles 150-177KB. F12 agregó memoization + dynamic imports + Web Vitals tracking. **Gaps:** baseline 150KB (Sentry pesado); `/grilla` LCP ~3.8s / Lighthouse 88-89; sin cache Redis de `getAvailableSlots`; rutas públicas en `force-dynamic` (sin ISR); re-medición real diferida. |
| **Resiliencia** | **5** | MP gateway: try/catch + retry único en 401 (token refresh). Jobs: DLQ handlers + claims atómicos. Degradación correcta (push falla → swallow). **Gaps:** sin timeout explícito en SDK MP; **sin circuit breaker**; sin retry/backoff en 5xx/red; sin advisory lock en cron autoComplete; sin alerta cuando rate-limiter queda `unavailable`. |
| **Escalabilidad** | **5** | Monolito Supabase+Vercel es correcto para el stage. **Pero el deploy no está construido:** pg-boss no puede correr en Vercel serverless (sin host decidido); pool postgres `max:10` no tuneado para serverless; sin Supavisor; sin staging; sin load testing. A 100 complejos / 5000 concurrentes: no probado. |
| **UX/UI pública** | **4** | Funcional pero **pobre vs ATC**. Tiene: landing completa, `/explorar` (búsqueda texto + filtro ciudad + online), TenantCard básica, perfil, grilla disponibilidad, flujo de reserva completo, SEO sólido (sitemap, robots, JSON-LD, OG). **Falta (≈80 items del TODO):** precio "Desde $X" en cards, dirección completa, vista mapa, filtros avanzados (superficie/formato/servicios), buscador estructurado (localidad+fecha+hora), reseñas, favoritos, "Falta Uno". Un jugador **puede** reservar, pero el *descubrimiento* es delgado — preferiría la búsqueda de ATC. |

**Promedio ponderado:** ~6.0/10. **Producto sólido en su núcleo (multi-tenancy, seguridad, admin, testing), con dos frentes claramente inmaduros: infraestructura de deploy y experiencia pública competitiva.**

### B.2 — TOP 10 blockers para producción (ordenados por criticidad)

1. **🔴 No hay infraestructura de deploy.** Sin Vercel deploy automatizado, sin branch protection, sin decisión de dónde corren los pg-boss workers. (TODO Fase 1)
2. **🔴 pg-boss workers no tienen hogar de producción** — no pueden correr en Vercel serverless. Hard blocker: sin esto, no hay jobs (expiración de reservas, recordatorios, refresh de tokens MP, dunning). (TODO Fase 1)
3. **🔴 2 unit tests en rojo (rate-limit)** — un CI con gate de tests bloquearía todo merge. Enmascara el gate verde. (Quick-win A.2b)
4. **🟠 E2E no flake-free bajo paralelo** — `pnpm test:e2e:ci` da rojo; no puede ser required-check confiable. Necesita aislamiento per-test. (Done-criterion F14 diferido)
5. **🟠 `/api/status` sin health real** — en prod no detectás caída de DB/MP/Resend/Upstash. (TODO Fase 2/5)
6. **🟠 Sin resiliencia MP (timeout/circuit-breaker)** — un MP lento/caído cuelga el path de conversión ($$$). (TODO Fase 3)
7. **🟠 Pool DB sin tunear + sin Supavisor** — riesgo de agotamiento de conexiones bajo concurrencia serverless. (TODO Fase 1)
8. **🟠 Legal/compliance** — inscripción AAIP + DPA + términos B2B. Obligatorio por Ley 25.326 para operar. (No-code, TODO Fase 8)
9. **🟡 Estrategia de migrations** — `db:push` sigue siendo el path documentado de prod (riesgoso). Parcialmente mitigado (dir versionado existe). (TODO Fase 1)
10. **🟡 Sin load testing + Server Actions admin sin rate-limit** — comportamiento desconocido a escala; mutaciones admin no metradas. (TODO Fase 2/7)

### B.3 — Quick wins (<30 min, alto impacto)

| Quick win | Esfuerzo | Impacto |
|-----------|:--------:|---------|
| Fix `rate-limit-apply.test.ts` (`delete NEXT_PUBLIC_E2E` en beforeEach) → unit gate verde | 5 min | 🔴 destraba el gate de tests |
| Aplicar migration 014 (`push_subscriptions`) a DB local → mata el error recurrente + fixea 1 integration fail | 5 min | 🟠 limpia logs + integration |
| `zod-coverage` reconozca `parseRouteUuid()` → cierra 2 fails honestamente | 10 min | 🟡 gate limpio sin mentir |
| Precio "Desde $X" en `TenantCard` (datos en `courts.pricing`) | ~30 min | 🟢 UX pública (paridad ATC) |
| Dirección completa en `TenantCard` (`tenants.address`) | ~15 min | 🟢 UX pública |
| Botón WhatsApp en perfil (`tenant.whatsapp` ya existe) | ~15 min | 🟢 conversión |
| `next/image` en `<img>` públicos restantes | ~20 min | 🟢 LCP + Core Web Vitals |
| OG tags dinámicos en `/[slug]` | ~20 min | 🟢 share en WhatsApp/redes |

### B.4 — Riesgos ocultos que Opus 4.7 pudo no haber visto

1. **Los 2 unit tests de rate-limit en rojo se introdujeron DESPUÉS del "COMPLETA"** — el unit suite no se re-corrió tras el endurecimiento de E2E. STATE.md (2026-05-30) es anterior a la regresión.
2. **Foot-gun de seguridad:** las políticas fail-CLOSED (`authVerify`, `pinAttempts`, `authMagicLink`) se **bypassean silenciosamente** ante `NEXT_PUBLIC_E2E=1`. Es correcto para E2E, pero si ese env var llegara a setearse en un build no-test, las defensas de brute-force **desaparecen sin ruido**. → Recomendación: assert en build/launch-check de que `NEXT_PUBLIC_E2E` NUNCA está seteado en prod.
3. **El titular "26/26 AUDITORÍA COMPLETA" sobre-vende E2E.** Done-criterion #3 (flake-free) quedó diferido; el suite crítico está verde **solo en serie**. Quien lea STATE.md asume E2E cerrado.
4. **La RLS cuelga de un solo hilo: el rol del `DATABASE_URL` de prod.** Un único `DATABASE_URL` mal configurado (superuser) desactiva TODO el aislamiento multi-tenant en silencio. Launch-check lo mitiga, pero es garantía de runtime, no de compilación.
5. **`push_subscriptions` (migration 014) no estaba aplicada** en la DB local donde corren los tests — sugiere que el proceso de aplicar migrations es manual/frágil. En prod implicaría que el push **nunca funciona** (el error se traga). Refuerza el blocker #9 (estrategia de migrations).

---

## Decisiones de PRODUCTO (NO implementar — requieren tu OK)

- **"Falta Uno" / partidos abiertos** (diferenciador social vs ATC) — deferido a v1.5 en docs; gran esfuerzo.
- **Sistema de reseñas** (tabla `reviews`) — requiere decisión de moderación + modelo de datos.
- **Vista de mapa** (Google Maps/Mapbox/Leaflet) — requiere proveedor + poblar `lat/lng` con geocoding.
- **Buscador estructurado por disponibilidad real cross-complejo** — feature pesada, define posicionamiento vs ATC.

---

## Plan de acción propuesto para FASE C (espera tu "dale")

**PRIORIDAD 1 — Gates 100% verde:**
1. Fix hermético de `rate-limit-apply.test.ts` → `pnpm test` verde.
2. (Opcional) `zod-coverage` reconoce `parseRouteUuid` → cierra los 2 fails restantes honestamente.
3. Aplicar migration 014 local + verificar integration.
4. Atacar el flaky real de `push` (BroadcastChannel race) y/o documentar aislamiento per-test para los flakes de paralelismo.

**PRIORIDAD 2 — Blockers de prod sin decisión humana:**
5. Health checks reales en `/api/status` (DB/pg-boss/Upstash/Resend).
6. Assert anti-foot-gun: `NEXT_PUBLIC_E2E` nunca en prod (launch-check).
7. Timeout explícito en gateway MP.

**PRIORIDAD 3 — Quick wins UX pública:** precio "Desde $X", dirección, WhatsApp, `next/image`, OG tags.

> **Regla respetada:** cada fix → commit atómico; nada de push a `main` sin mostrarte; decisiones de producto anotadas, no implementadas.

---

## FASE C — Ejecutado (8 commits sobre `audit/opus-4.8-validation`)

### Gates finales

| Check | Antes (Fase A) | Después (Fase C) |
|-------|----------------|------------------|
| `pnpm typecheck` | ✅ 0 | ✅ 0 |
| `pnpm lint` | ✅ 0 | ✅ 0 |
| `pnpm test` (unit) | ❌ 4 fail / 588 | ✅ **604 passed** (+12 tests nuevos) |
| `pnpm build` | ✅ | ✅ (34 páginas) |
| push integration (4 specs) | ❌ tabla ausente | ✅ 8/8 |
| push `@critical` E2E | 🔴 flaky | ✅ 5/5 con `--repeat-each=5` |

### PRIORIDAD 1 — Gates verde

1. **`rate-limit-apply.test.ts` hermético** (`01d71f2`) — `delete NEXT_PUBLIC_E2E` en beforeEach + restore en afterAll. Ahora ejercita la lógica real de throttle + fail-closed. Cierra 2 de las 4 fallas.
2. **`zod-coverage` reconoce `parseRouteUuid`** (`cc48a68`) — heurística `usesZod` extendida. Cierra las otras 2 fallas honestamente (los routes validan su único input, el UUID).
3. **Migration 014 aplicada local + bug latente fixeado** (`d9120f6`) — `push-dispatch` pasa; descubrí y corregí un bug REAL en `push-subscribe-rls` Case 2 (usaba el id de la fila push como `tenant_id`/`staff_user_id` con "conflict fires anyway", pero `ON CONFLICT DO UPDATE SET tenant_id = EXCLUDED.tenant_id` propaga el valor bogus → FK violation). Estaba enmascarado mientras la tabla no existía.
4. **Push BroadcastChannel race** (`dfe2d31`) — el único flaky-serial real. Re-post determinístico vía `expect().toPass()` (el manager deduplica por id). Verificado 5/5.

### PRIORIDAD 2 — Hardening de prod

5. **`/api/status` checkea Upstash de verdad** (`ffc9dbd`) — PING real cuando está configurado; `ok`+nota cuando no (no rompe el gate del webServer E2E). **Corrección a Fase B:** `/api/status` YA hacía checks reales de DB (`SELECT 1`+latencia) y pg-boss (`getQueueSize`); solo faltaba Upstash. Mi score de Observabilidad (6) era algo duro.
6. **Anti-foot-gun `NEXT_PUBLIC_E2E`** (`c8ec389`) — helper puro `e2eBypassDisabledCheck` (4 tests) como step fatal de launch-check. Cierra el riesgo oculto #2.
7. **Timeout MP** — **ya estaba** (`mpClient` setea `options:{timeout:8000}`, cubre todas las llamadas incl. `getPaymentStatus`). **Corrección a Fase B:** mi afirmación "sin timeout" era errónea. Quedan circuit-breaker + retry/backoff como gaps reales (TODO Fase 3).

### PRIORIDAD 3 — Quick wins UX pública

8. **Botón WhatsApp en perfil** (`8b0be3f`) — helper `buildWhatsappUrl` (5 tests, normaliza a dígitos, mensaje prellenado) + link en `TenantHeader` (solo si hay número). No adivina código de país (espera número internacional completo).
9. **Dirección completa en TenantCard** (`e6ae2fa`) — `tenants.address` (tabla global, sin RLS) agregado al search + render estilo ATC.
- **OG tags `/[slug]`** — **ya estaban** (F6: `generateMetadata`+`buildMetadata` con OG/Twitter/canonical). El TODO.md estaba desactualizado.
- **`next/image`** — **ya adoptado** en todo lo público (TenantCard + TenantHeader); 0 `<img>` crudos en `src/`.

### Documentado, NO implementado (requiere tu decisión)

- **Precio "Desde $X" en TenantCard** — **NO es un quick win.** `courts` tiene RLS tenant-scoped; el search lista N tenants sin contexto de tenant, así que un subquery a `courts.pricing` devolvería 0 filas bajo el rol `turnogol_app` de prod (funciona local solo por superuser). Opciones: **(A)** denormalizar `tenants.from_price_cents` (migración + mantenimiento write-side al cambiar pricing); **(B)** función `SECURITY DEFINER` que agregue el mínimo sin romper RLS; **(C)** policy de lectura pública en `courts` exponiendo solo pricing. Recomiendo **A** (lecturas simples, cache-friendly, SEO). Decisión tuya.
- **E2E no hermético bajo paralelo (workers locales).** En CI corre serial (`workers:1`) y `flake-detect` también → **no bloquea ningún gate**. El verde-en-serie ya está. El fix para 0-flaky-en-paralelo es aislamiento per-spec (player dedicado para `delete-account`, reserva de slot per-test). Es rearquitectura de fixtures → lo dejo documentado para tu OK (regla de "fallo arquitectónico").
- **Resiliencia MP: circuit breaker + retry/backoff en 5xx** (TODO Fase 3). El timeout ya está; estos son los gaps reales.
- **Proceso de migrations frágil** — la 014 no estaba aplicada en la DB local de tests. Falta un paso automatizado "aplicar todas las migrations" para dev/CI (TODO Fase 1: estrategia de migrations versionadas).

### Correcciones a mi propia Fase B (honestidad)

Tres cosas que scoreé peor de lo que están: el **timeout MP existe** (8s), **`/api/status` ya hace checks reales** de DB+pg-boss, y **OG tags + `next/image` ya estaban** hechos en F6. El TODO.md (pre-auditoría) está desactualizado respecto a lo que F6/F7 entregaron.
