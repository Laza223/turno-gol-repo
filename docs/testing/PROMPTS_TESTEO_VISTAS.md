# Prompts de Testeo de Front por Vista — TurnoGol

> Banco de prompts listos para copiar/pegar en sesiones de IA (Claude Code) para testear
> minuciosamente cada una de las **36 vistas** del proyecto.
> Pareja de `vistas.md` (inventario + prioridades). Este archivo es el **cómo**.
>
> **Stack de testeo asumido en cada sesión:** Playwright MCP (navegación real del browser),
> superpowers (skills de workflow: brainstorming, TDD, verification), `ui-ux-pro-max`,
> y la infraestructura E2E ya existente del repo (`tests/e2e/`, fixtures, seed).

---

## Cómo usar este archivo

1. **Una sesión = una unidad de trabajo.** Las vistas 🔴 P0 se trabajan **una sesión cada una**.
   Las P1 en sesiones de 1–2 vistas. Las P2/P3 agrupadas.
2. Al abrir cada sesión, **pegá primero el [BLOQUE GLOBAL](#bloque-global--pegar-al-inicio-de-cada-sesión)**
   y después el **prompt específico de la vista**.
3. Cada sesión sigue las **[7 fases](#metodología--7-fases-por-sesión)** sin saltarse ninguna.
4. El entregable de cada sesión es:
   - Specs Playwright nuevos/extendidos en `tests/e2e/`
   - Un reporte en `docs/testing/reports/<vista>.md` (usar la [plantilla](#plantilla-de-reporte-por-vista))
5. **No reinventes coverage.** Cada prompt indica qué spec **ya existe** para esa vista. Tu trabajo
   es **endurecer y cerrar gaps**, no duplicar.

### Orden de ejecución recomendado

```
Sprint 1 — P0 (8 sesiones dedicadas, 1 vista c/u):
  S1  login + verify .......... (auth es prerequisito de todo)
  S2  /[slug]/reservar (checkout)
  S3  reserva/exito + pendiente + error (3 estados post-pago, 1 sesión)
  S4  grilla
  S5  caja
Sprint 2 — P1 (6–8 sesiones):
  S6  onboarding
  S7  dashboard
  S8  settings/horarios + settings/reservas
  S9  settings/facturacion
  S10 reservas/[id] + reservas (listado)
  S11 mis-reservas
  S12 /[slug] + disponibilidad
  S13 abonados/nuevo + register
Sprint 3 — P2 (4–5 sesiones agrupadas):
  S14 canchas + abonados
  S15 staff + settings/pin
  S16 reportes + explorar
  S17 perfil + configuracion + eliminar-cuenta
  S18 home + suspended
Sprint 4 — P3 + regresión:
  S19 para-complejos + privacy + terms
  S20 mock-mp (validación de ambiente) + suite de regresión completa
```

---

## BLOQUE GLOBAL — pegar al inicio de CADA sesión

> Copiá este bloque tal cual como **primer mensaje** de cada sesión, antes del prompt de la vista.

```text
CONTEXTO DEL PROYECTO
Sos un QA engineer senior trabajando en TurnoGol, un SaaS B2B de gestión para
complejos de fútbol en Argentina (Next.js 14 App Router, TypeScript strict,
Supabase/Postgres con RLS, Drizzle, MercadoPago, Resend). Multi-tenant con
aislamiento por RLS. Tu trabajo HOY es testeo de front exhaustivo de UNA vista.

FUENTES DE VERDAD (leelas antes de empezar):
- CLAUDE.md (reglas críticas, convenciones de schema y multi-tenancy)
- vistas.md (inventario de vistas + prioridades + qué testear por vista)
- tests/e2e/README.md (convenciones E2E, projects, fixtures, comandos)
- El código de la vista asignada y sus Server Actions / data loaders.

INFRAESTRUCTURA DE TESTEO YA EXISTENTE (NO la reinventes, reutilizala):
- Runner: Playwright. Config en playwright.config.ts. testDir = tests/e2e/.
- Projects: chromium (default), mobile-chrome (tests/e2e/mobile/),
  axe-audit (tests/e2e/a11y/), webkit/firefox/mobile-safari (tests/e2e/cross-browser/).
- Fixtures de auth pre-generadas (tests/e2e/fixtures.ts):
    adminStorageState, playerStorageState, freshAdminStorageState, secondAdminStorageState.
  Se cargan vía cookies: context.addCookies(JSON.parse(adminStorageState).cookies).
- Helpers: tests/e2e/_helpers/booking-seed.ts (insertBookingServiceRole,
  cleanupBookingsByIds, tomorrowDateIsoArt, makeServiceClient), player-seed.ts.

DATOS SEMILLA DETERMINISTAS (scripts/seed-e2e.ts):
- Tenant principal:  id 00000000-0000-4000-8000-000000000001  slug "e2e-complejo-demo"
- Tenant con seña:   id 00000000-0000-4000-8000-000000000030  slug "e2e-complejo-sena"
- Cancha principal:  id 00000000-0000-4000-8000-000000000010
- Cancha con seña:   id 00000000-0000-4000-8000-000000000031
- Admin:   e2e-admin@turnogol.test    (staff_user_id 00000000-0000-4000-8000-000000000003)
- Player:  e2e-player@turnogol.test   (player_id     00000000-0000-4000-8000-000000000020)
- Admin fresh (onboarding sin completar): e2e-admin-fresh@turnogol.test
- Admin 2 (para tests de aislamiento cross-tenant): e2e-admin-2@turnogol.test

PRE-FLIGHT (corré esto al empezar; si ya corre, saltá):
  pnpm supabase:start
  pnpm e2e:seed
  # Playwright levanta el dev server solo (webServer en config) con:
  #   NEXT_PUBLIC_E2E=1, MP_MOCK_MODE=1, Upstash vacío (rate-limit off).

COMANDOS:
  pnpm exec playwright test <spec> --project chromium            # correr 1 spec
  pnpm exec playwright test <spec> --project chromium --headed   # ver el browser
  pnpm exec playwright test <spec> --project chromium --debug    # inspector
  pnpm test:e2e:ci            # chromium + mobile-chrome + axe-audit
  pnpm test:e2e:flake-detect  # @critical, 10x rerun, retries=0 (estabilidad)
  pnpm typecheck && pnpm lint # SIEMPRE antes de cerrar

REGLAS DE ORO (no negociables):
1. MONTOS en centavos de ARS (10000 = $100,00). Verificá el formateo en pantalla.
2. TIMESTAMPS en UTC en DB; se muestran en ART (America/Argentina/Buenos_Aires).
   Usá tomorrowDateIsoArt() para fechas, nunca new Date() crudo.
3. ENUMs: "canceled" (una L). Si ves "cancelled" en UI o assert, es BUG.
4. AISLAMIENTO RLS: ninguna vista debe filtrar datos de otro tenant. Cuando aplique,
   probá con secondAdminStorageState que NO ve datos del tenant principal.
5. ESPERAS basadas en condición (expect(...).toBeVisible(), toHaveURL), NUNCA
   waitForTimeout/sleep. Aplicá la skill de superpowers "condition-based-waiting".
6. CADA test limpia lo que crea (cleanupBookingsByIds en finally). Tests idempotentes.
7. MP en modo mock: el checkout redirige a /mock-mp/checkout con botones
   aprobar/rechazar/cancelar. Usalos para simular el webhook.
8. force-dynamic en vistas con datos variables: no asumas cache.

SKILLS A USAR (invocalas cuando corresponda):
- superpowers "brainstorming": en Fase 2, para enumerar estados y escenarios sin sesgo.
- superpowers "test-driven-development": Fase 4, escribí el assert antes de dar por bueno.
- superpowers "condition-based-waiting": para toda espera en Playwright.
- superpowers "verification-before-completion": Fase 6, no declares "listo" sin correr.
- superpowers "root-cause-tracing": si un test encuentra un bug real, rastreá la causa.
- Playwright MCP (browser_navigate, browser_snapshot, browser_click, browser_type,
  browser_console_messages, browser_network_requests, browser_take_screenshot,
  browser_resize, browser_evaluate): Fase 1 y 3, exploración real e interactiva.
- ui-ux-pro-max: revisión de jerarquía visual, estados de UI y accesibilidad.

QUÉ NO HACER:
- No toques código de producción salvo para arreglar un bug que el test demuestre
  (y en ese caso, documentalo en el reporte con root-cause).
- No hardcodees datos que el seed ya provee.
- No declares cobertura sin haber corrido los specs en verde + flake-check si es @critical.
```

---

## Metodología — 7 fases por sesión

Cada sesión ejecuta estas fases **en orden**. El prompt de cada vista las referencia.

| Fase | Nombre | Qué se hace | Herramienta principal |
|------|--------|-------------|----------------------|
| **0** | Setup & lectura | Pre-flight, leer código de la vista + Server Actions + spec existente | Read, Grep |
| **1** | Reconocimiento exploratorio | Navegar la vista real, capturar snapshot del DOM/a11y tree, mapear elementos interactivos, ver consola y network | **Playwright MCP** |
| **2** | Modelado de estados y escenarios | Enumerar TODOS los estados (loading/empty/success/error/edge) y construir la matriz de escenarios | superpowers `brainstorming` |
| **3** | Diseño de casos | Por cada escenario: happy / sad / edge / seguridad-RLS / a11y / responsive / i18n-montos-tz | Playwright MCP + matriz |
| **4** | Implementación de specs | Escribir/extender specs Playwright siguiendo convenciones del repo (fixtures, cleanup, condition-based-waiting) | superpowers `TDD` |
| **5** | Ejecución & flake-detect | Correr en verde; si es flujo crítico, `--repeat-each=10 --retries=0` | Playwright CLI |
| **6** | Reporte & verificación | `typecheck` + `lint`, llenar `docs/testing/reports/<vista>.md`, listar bugs con repro | superpowers `verification-before-completion` |

### Las 7 dimensiones de cobertura (Fase 3)

Para cada vista, cubrir explícitamente:

1. **Happy path** — el flujo principal funciona end-to-end.
2. **Estados de carga/vacío** — skeletons, spinners, empty states, sin datos.
3. **Errores** — validación de formularios, errores de servidor, datos inválidos en URL/params, recursos inexistentes (404).
4. **Edge cases del dominio** — límites (60/120 min, seña 0–100%, ventana de 15 min de pago), concurrencia (slot tomado entre ver y confirmar), estados terminales.
5. **Seguridad / RLS / IDOR** — acceso cross-tenant denegado, acceso a recurso de otro player denegado, PinGate, rutas protegidas sin sesión → redirect.
6. **Accesibilidad** — roles ARIA, foco, navegación por teclado, axe sin violaciones críticas (project `axe-audit`).
7. **Responsive / i18n / formato** — mobile (Pixel 5 / iPhone), montos en ARS, fechas en ART, textos en español, sin `cancelled`.

---

# 🔴 PROMPTS P0 — Crítico (1 sesión dedicada por vista)

## S1 · Login + Verify (`/login`, `/verify`)

**Coverage existente:** `tests/e2e/admin-login.spec.ts`, `tests/e2e/critical-flows/player-magic-link.spec.ts`, `tests/e2e/cross-browser/login-smoke.spec.ts`.
**Tu misión:** endurecer y cerrar gaps de estados de error del magic link.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTA ASIGNADA: Login (/login) + Verificación de magic link (/verify)
PRIORIDAD: P0 — sin auth no existe ningún flujo autenticado.
ARCHIVOS: src/app/(auth)/login/page.tsx, src/app/(auth)/verify/page.tsx
SPECS EXISTENTES (extender, no duplicar): tests/e2e/admin-login.spec.ts,
  tests/e2e/critical-flows/player-magic-link.spec.ts.

Ejecutá las 7 fases. Foco específico:

FASE 1 (Playwright MCP): navegá /login, sacá snapshot del a11y tree, mapeá:
  input de email, botón submit, estado "enviado" (SentState). Revisá consola y
  network al hacer submit. Repetí para /verify con distintos searchParams.

FASE 2 (brainstorming) — estados a enumerar como mínimo:
  /login:  idle → submitting (loading, botón disabled) → sent → error.
  /verify: token válido (loading→redirect), expired, used, invalid,
           exchange_failed, sin token.

FASE 3 — casos obligatorios:
  - Email válido → transición a SentState con instrucción de revisar correo.
  - Email inválido (sin @, vacío) → validación HTML5 + server.
  - Loading state: botón deshabilitado y spinner durante el submit (useFormStatus).
  - Opción de reenviar desde SentState.
  - Usuario YA autenticado entra a /login → redirect (no mostrar el form).
  - /verify?error=expired → mensaje "el link expiró" + CTA solicitar nuevo.
  - /verify?error=used / invalid / exchange_failed → cada mensaje correcto.
  - /verify sin token → comportamiento defensivo (no crash).
  - Responsive: 2 columnas (desktop) → 1 columna (mobile, Pixel 5).
  - A11y: label del input, foco inicial, axe sin violaciones críticas.

FASE 4: extendé los specs existentes. Si agregás casos de /verify error states,
  podés crear tests/e2e/verify-states.spec.ts. Magic link real se simula con
  admin.generateLink (ver tests/e2e/_helpers/auth-state.ts) — NO esperes email real.

FASE 5: estos flujos son @critical → corré pnpm test:e2e:flake-detect tras taggear.
FASE 6: reporte en docs/testing/reports/login-verify.md.
```

---

## S2 · Checkout de reserva (`/[slug]/reservar`)

**Coverage existente:** `tests/e2e/booking-flow.spec.ts` (4 tests, flujo de seña MP).
**Tu misión:** la vista del momento del pago. Cubrir cálculo de seña, errores `slot_taken`/`banned`, params inválidos.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTA ASIGNADA: Confirmación de reserva pre-pago
  /{slug}/reservar?court=...&date=...&time=...&dur=...
PRIORIDAD: P0 — acá se cobra. Error = pérdida de conversión o cobro incorrecto.
ARCHIVOS: src/app/(public)/[slug]/reservar/page.tsx + componentes
  (BookingSummary, ConfirmBookingButton, LoginGate) + la Server Action de confirmación.
SPEC EXISTENTE (extender): tests/e2e/booking-flow.spec.ts.
USAR tenant con seña: slug "e2e-complejo-sena", cancha 00000000-...-031.

Ejecutá las 7 fases. Foco específico:

FASE 1 (Playwright MCP): construí una URL válida con court/date/time/dur del seed
  (date = tomorrowDateIsoArt()). Navegá, snapshot del resumen, verificá que el
  monto de seña mostrado = price_snapshot * depositPercentage / 100.

FASE 3 — casos obligatorios:
  - Resumen correcto: cancha, fecha (ART), hora, duración, precio, seña.
  - Cálculo de seña exacto en centavos para 60 y 120 min.
  - Jugador NO autenticado → aparece LoginGate (no el botón de confirmar).
  - Confirmar (player auth) → redirige a /mock-mp/checkout → aprobar → /reserva/[id]/exito.
  - error=slot_taken (simulá: insertBookingServiceRole en el mismo slot antes de
    confirmar) → mensaje claro + CTA volver. La reserva NO se duplica.
  - error=banned (baneá al player en ese tenant vía tenant_player_bans) → mensaje informativo.
  - Params inválidos: court inexistente / date pasada / dur≠60,120 / time fuera de
    horario → 404 o error controlado (no 500, no pantalla en blanco).
  - Seña desactivada (tenant principal): el CTA refleja "sin seña" y no muestra monto.
  - Aislamiento: la URL con court de OTRO tenant no permite reservar en este slug.

FASE 4: extendé booking-flow.spec.ts. Limpiá TODAS las bookings creadas en finally.
FASE 5: @critical → flake-detect.
FASE 6: docs/testing/reports/reservar-checkout.md. Documentá el cálculo de seña verificado.
```

---

## S3 · Post-pago: éxito + pendiente + error (3 vistas, 1 sesión)

**Coverage existente:** parcial dentro de `booking-flow.spec.ts`.
**Tu misión:** los 3 estados terminales del pago y el polling de `PaymentStatusWatcher`.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTAS ASIGNADAS (3, misma sesión por estar acopladas):
  /reserva/[bookingId]/exito      src/app/reserva/[bookingId]/exito/page.tsx
  /reserva/[bookingId]/pendiente  src/app/reserva/[bookingId]/pendiente/page.tsx
  /reserva/[bookingId]/error      src/app/reserva/[bookingId]/error/page.tsx
PRIORIDAD: P0 — el jugador necesita saber si pagó o no. Componente clave: PaymentStatusWatcher (polling).

Ejecutá las 7 fases. Foco específico:

FASE 2 — la máquina de estados del pago:
  pending_payment --webhook approved--> confirmed     (exito)
  pending_payment --webhook rejected--> canceled_*    (error)
  pending_payment --15 min sin pago--> expired         (error/expira)

FASE 3 — casos obligatorios:
  EXITO:
   - booking confirmed → muestra resumen completo (cancha, complejo, fecha ART, monto).
   - booking aún pending → renderiza PaymentStatusWatcher y hace polling.
   - cuando el webhook mock confirma, la UI pasa a estado confirmado SIN reload manual.
   - booking inexistente o de OTRO player → 404 (probar con playerStorageState ajeno).
  PENDIENTE:
   - muestra espera con feedback (spinner/progress).
   - al cambiar a confirmed → redirige a /exito; al cancelarse → redirige a /error.
  ERROR:
   - mensaje de error claro (no técnico).
   - ventana activa → botón "Reintentar" visible → reabre checkout con el MISMO booking.
   - ventana expirada → botón "Reintentar" oculto, solo "volver".
   - booking de otro player → 404.

FASE 4: usá MP mock para forzar approved/rejected/canceled
  (botones de /mock-mp/checkout) y validar cada redirección/transición.
  Para el polling: condition-based-waiting con expect(page).toHaveURL(/exito/) o
  expect(...).toBeVisible(); NUNCA waitForTimeout.
FASE 5: @critical → flake-detect (el polling es propenso a flakear; verificá estabilidad).
FASE 6: docs/testing/reports/reserva-post-pago.md.
```

---

## S4 · Grilla (`/grilla`)

**Coverage existente:** `tests/e2e/grilla-realtime.spec.ts`, `tests/e2e/critical-flows/admin-create-booking-ui.spec.ts`.
**Tu misión:** herramienta diaria del admin + Realtime Supabase. Endurecer concurrencia y estados.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTA ASIGNADA: Grilla de canchas (/grilla)
PRIORIDAD: P0 — sin la grilla el complejo no opera.
ARCHIVO: src/app/(admin)/grilla/page.tsx + BookingGrid + BookingFormModal (BookingCard).
SPECS EXISTENTES (extender): grilla-realtime.spec.ts, critical-flows/admin-create-booking-ui.spec.ts.
NOTA: celdas libres son botones con aria-label "Reservar turno HH:MM".
  El modal NO tiene selector de método de pago (se cobra en /caja). Duración 60/120.

Ejecutá las 7 fases. Foco específico:

FASE 1 (Playwright MCP): navegá /grilla?date=<mañana>, snapshot de la tabla,
  mapeá celdas libres vs ocupadas, abrí el modal, mapeá sus campos.

FASE 3 — casos obligatorios:
  - Render correcto de slots por cancha/hora; ocupados vs libres distinguibles.
  - Crear reserva desde slot vacío (modal "Nueva reserva", guestName+guestPhone) →
    toast "Reserva creada" → aparece en la grilla → fila confirmed en DB.
  - REALTIME: insertBookingServiceRole en otro contexto → la reserva aparece en la
    grilla SIN reload (esto es lo que cubre grilla-realtime; verificá que sigue verde).
  - Navegación de fechas (anterior/siguiente) recarga datos correctos.
  - Slot en horario cerrado / fecha cerrada → no clickeable o bloqueado.
  - Estado vacío: tenant sin canchas → mensaje, no crash.
  - Concurrencia: dos intentos de reservar el MISMO slot → el segundo falla con
    mensaje claro (cross-check con tests/integration/race-double-booking.test.ts).
  - Aislamiento: admin del tenant 2 no ve reservas del tenant 1 en su grilla.
  - Responsive: grilla usable en tablet/mobile (project mobile-chrome).

FASE 4: extendé los specs. Cleanup de toda booking creada.
FASE 5: @critical → flake-detect (realtime flakea fácil; subí workers=1).
FASE 6: docs/testing/reports/grilla.md.
```

---

## S5 · Caja (`/caja`)

**Coverage existente:** `tests/e2e/caja-crud.spec.ts`, `tests/e2e/pin-lockout.spec.ts` (PIN).
**Tu misión:** gestión financiera diaria. Sumas correctas, cierre idempotente.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTA ASIGNADA: Caja diaria (/caja)
PRIORIDAD: P0 — datos financieros incorrectos = pérdida de confianza del admin.
ARCHIVO: src/app/(admin)/caja/page.tsx + CajaActions.
SPEC EXISTENTE (extender): caja-crud.spec.ts. Cross-check de idempotencia:
  tests/integration/daily-close-idempotency.test.ts, tests/integration/cashflow.test.ts.

Ejecutá las 7 fases. Foco específico:

FASE 3 — casos obligatorios:
  - Resumen del día correcto: total y desglose por método (efectivo / MercadoPago /
    transferencia). Las sumas deben CUADRAR (verificá centavos→ARS).
  - Navegación entre fechas recarga summary + movimientos.
  - Tabla de movimientos: entradas y salidas, ordenadas, con montos formateados.
  - Cerrar caja (CajaActions): estado antes (abierta, botón activo) vs después
    (cerrada, botón disabled o "ver cierre"). NO se puede cerrar dos veces (idempotencia).
  - Día sin movimientos → $0 y tabla vacía, NO error.
  - PinGate: si hay PIN configurado, /caja lo pide (cross-check pin-lockout.spec.ts).
  - Aislamiento: caja del tenant 2 no incluye cash_flows del tenant 1.

FASE 4: para poblar la caja, insertá cash_flows/payments vía service-role en el seed
  del test y limpialos en finally. Verificá montos exactos en pantalla.
FASE 5: @critical (cierre de caja) → flake-detect.
FASE 6: docs/testing/reports/caja.md. Adjuntá la verificación de sumas.
```

---

# 🟠 PROMPTS P1 — Alto (1–2 vistas por sesión)

## S6 · Onboarding (`/onboarding`)

**Coverage existente:** `tests/e2e/onboarding.spec.ts`, `tests/e2e/first-booking-aha.spec.ts`.
**Tu misión:** wizard de 4 pasos. Bloquea todo el resto del producto → cubrir cada paso y los guards.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTA ASIGNADA: Onboarding wizard (/onboarding)
PRIORIDAD: P1 — sin onboarding completo el admin no llega al dashboard.
ARCHIVO: src/app/onboarding/page.tsx + StepIdentity, StepCourts, StepSchedule, StepPayments.
SPEC EXISTENTE (extender): onboarding.spec.ts.
USAR: e2e-admin-fresh@turnogol.test (freshAdminStorageState) — onboarding SIN completar.

Ejecutá las 7 fases. Foco específico:

FASE 3 — casos obligatorios:
  - Paso 1 Identidad: nombre/dirección/teléfono con validaciones.
  - Paso 2 Canchas: agregar ≥1 cancha (superficie, duración 60/120, precio).
  - Paso 3 Horarios: configurar días/horarios de apertura.
  - Paso 4 Pagos: conectar MercadoPago (mock) o saltar.
  - Barra de progreso refleja el paso actual.
  - Volver atrás NO pierde datos del paso anterior.
  - Onboarding ya completo (admin normal) → redirect a /dashboard.
  - No autenticado → redirect a /login.
  - Al completar el paso 4 → redirect a /dashboard con checklist visible.

FASE 6: docs/testing/reports/onboarding.md.
Nota: el seed del freshAdmin se resetea con pnpm e2e:seed. Si tu test avanza el
  onboarding, restaurá el estado o documentá que requiere re-seed.
```

## S7 · Dashboard (`/dashboard`)

**Coverage existente:** parcial en `first-booking-aha.spec.ts`. **Gap real:** KPIs + checklist.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTA ASIGNADA: Dashboard del admin (/dashboard)
PRIORIDAD: P1. ARCHIVO: src/app/(admin)/dashboard/page.tsx + MetricCard, OnboardingChecklist.

Ejecutá las 7 fases. Foco:
  - KPIs del día (bookingsToday, revenueTodayCents→ARS, activeAbonados) cargan y son correctos.
  - Checklist de onboarding aparece si onboarding_completed o public_link_shared = false.
  - Con ambos true → checklist NO aparece (allDone).
  - Click en KPI/checklist navega a la sección correcta.
  - Estado vacío (complejo nuevo, sin reservas hoy) → ceros, no crash.
  - Aislamiento: métricas del tenant 2 ≠ tenant 1.
FASE 6: docs/testing/reports/dashboard.md.
```

## S8 · Settings: Horarios + Reservas (`/settings/horarios`, `/settings/reservas`)

**Coverage existente:** solo PIN (`pin-lockout.spec.ts`). **Gap grande:** estas dos vistas de config no tienen spec dedicado.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTAS ASIGNADAS: /settings/horarios y /settings/reservas (config de políticas).
PRIORIDAD: P1. ARCHIVOS:
  src/app/(admin)/settings/horarios/page.tsx (updateHorariosAction, add/removeClosedDateAction)
  src/app/(admin)/settings/reservas/page.tsx (updateReservasPolicyAction)
GAP: no hay spec dedicado. Creá tests/e2e/settings-horarios.spec.ts y settings-reservas.spec.ts.

Ejecutá las 7 fases. Foco:
  HORARIOS:
   - Grid de 7 días con apertura/cierre por día; toggle "cerrado" desactiva inputs.
   - Guardar → feedback + persistencia (recargar y verificar).
   - Agregar fecha cerrada (date picker) → aparece en lista; eliminar → desaparece.
   - Cierre < apertura → error de validación.
   - PinGate si hay PIN.
  RESERVAS:
   - Toggle "requiere seña" activa/desactiva el % ; % válido 1–100.
   - Cancelación anticipada: horas mínimas (entero positivo).
   - Penalidad no-show: tipo (ban/balance) + threshold + días.
   - Guardar → feedback + persistencia. No guardar % vacío con seña activa.
   - PinGate si hay PIN.
IMPORTANTE: estos tests MUTAN settings del tenant. Guardá el estado original en
  beforeAll y restauralo en afterAll (vía service-role) para no romper otros specs.
FASE 6: docs/testing/reports/settings-horarios-reservas.md.
```

## S9 · Settings: Facturación (`/settings/facturacion`)

**Gap:** sin spec dedicado. Estados del lifecycle SaaS + OAuth MP.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTA ASIGNADA: /settings/facturacion (suscripción SaaS + conexión MercadoPago).
PRIORIDAD: P1. ARCHIVO: src/app/(admin)/settings/facturacion/page.tsx (getSubscriptionState).
Cross-check: tests/integration/billing.test.ts, mp-oauth.test.ts, mp-callback-app-url.test.ts.
GAP: creá tests/e2e/settings-facturacion.spec.ts.

Ejecutá las 7 fases. Foco:
  - Muestra plan actual, estado y próxima fecha de cobro.
  - Estado trialing → días restantes + CTA activar.
  - Estado past_due → alerta + CTA pagar. suspended → banner prominente.
    (Forzá cada estado seteando tenant_subscriptions.status vía service-role; restaurá después.)
  - Botón "Conectar MercadoPago" inicia OAuth (en mock, verificá la URL de redirect).
  - MP ya conectado → muestra cuenta + opción desconectar.
  - PinGate si hay PIN. Error al cargar estado → manejo graceful (no crash).
FASE 6: docs/testing/reports/settings-facturacion.md.
```

## S10 · Reservas: listado + detalle (`/reservas`, `/reservas/[id]`)

**Coverage existente:** `tests/e2e/reservas-crud.spec.ts`, `critical-flows/admin-cancel-mp-refund.spec.ts`.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTAS ASIGNADAS: /reservas (listado) y /reservas/[id] (detalle + BookingActions).
PRIORIDAD: P1. SPECS EXISTENTES (extender): reservas-crud.spec.ts,
  critical-flows/admin-cancel-mp-refund.spec.ts.

Ejecutá las 7 fases. Foco:
  LISTADO:
   - Lista reservas del tenant; filtro por status (confirmada/pendiente/cancelada/no-show).
   - Click en fila → /reservas/[id]. Badges con color correcto por estado.
   - Estado vacío por filtro. Carga de ~200 sin degradar.
  DETALLE:
   - Datos completos (jugador, cancha, fecha ART, monto, estado).
   - BookingActions según estado: Confirmar (pendiente manual), Cancelar c/reembolso
     (dialog → MP refund mock → estado canceled_refunded), No-show (aplica penalidad).
   - Reserva ya cancelada → acciones no disponibles.
   - Motivo de cancelación y nota del jugador se muestran si existen.
   - Booking de OTRO tenant → 404 (cross-check tests/integration/idor-admin-cross-tenant.test.ts).
FASE 5: cancelación con refund es @critical → flake-detect.
FASE 6: docs/testing/reports/reservas-listado-detalle.md.
```

## S11 · Mis reservas (jugador) (`/mis-reservas`)

**Coverage existente:** `tests/e2e/player-bookings.spec.ts`.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTA ASIGNADA: /mis-reservas (jugador). PRIORIDAD: P1.
ARCHIVO: src/app/(player)/mis-reservas/page.tsx + CancelBookingButton, LeaveReviewButton.
SPEC EXISTENTE (extender): player-bookings.spec.ts. Usá playerStorageState.

Ejecutá las 7 fases. Foco:
  - Tab "Próximas" (futuras confirmadas) vs "Historial" (pasadas/canceladas) — searchParams.tab.
  - Cancelar (solo si la política de horas lo permite) → dialog → aparece como cancelada.
  - LeaveReviewButton solo en reservas pasadas sin review; dejar review persiste.
  - Estado vacío → CTA a explorar.
  - Badges de estado correctos. Montos ARS, fechas ART.
  - IDOR: un player NO ve ni cancela reservas de otro
    (cross-check tests/integration/idor-player-bookings.test.ts).
FASE 6: docs/testing/reports/mis-reservas.md.
```

## S12 · Perfil público + Disponibilidad (`/[slug]`, `/[slug]/disponibilidad`)

**Coverage existente:** `tests/e2e/public-seo.spec.ts`, `tests/e2e/availability.spec.ts`.

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTAS ASIGNADAS: /{slug} (perfil público) y /{slug}/disponibilidad (grilla semanal).
PRIORIDAD: P1. SPECS EXISTENTES (extender): public-seo.spec.ts, availability.spec.ts.
Usá slug "e2e-complejo-demo". SIN autenticación (vistas públicas).

Ejecutá las 7 fases. Foco:
  PERFIL:
   - Datos del complejo (nombre, dirección, teléfono, fotos), canchas, reviews (promedio+listado).
   - AvailabilityGrid carga en Suspense (skeleton → contenido).
   - Botón "Reservar" → /{slug}/disponibilidad o /reservar.
   - Tenant suspended/blocked/canceled/churned/deleted → página UNAVAILABLE.
   - Slug inexistente → 404.
   - SEO: <title>, meta description, JSON-LD LocalBusiness + BreadcrumbList (cross-check public-seo).
  DISPONIBILIDAD:
   - Grilla semanal; slot libre clickeable → /reservar?...; ocupado no clickeable.
   - Navegación semana ant/sig. Slots fuera de horario no aparecen. Fechas cerradas bloqueadas.
   - A11y: project axe-audit (tests/e2e/a11y/public.spec.ts ya cubre público; extendé si hace falta).
FASE 6: docs/testing/reports/perfil-disponibilidad.md.
```

## S13 · Nuevo abonado + Registro (`/abonados/nuevo`, `/register`)

**Coverage existente:** `abonados-crud.spec.ts` (parcial), `admin-login.spec.ts` (registro parcial).

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTAS ASIGNADAS: /abonados/nuevo (AbonadoForm) y /register (registro de staff).
PRIORIDAD: P1.

Ejecutá las 7 fases. Foco:
  NUEVO ABONADO:
   - Select de canchas poblado. Campos: nombre, teléfono, cancha, día/hora recurrente, precio.
   - Validación de requeridos. Submit OK → redirect a /abonados + éxito.
   - Slot recurrente ya ocupado → error claro (cross-check race-abonado-vs-individual.test.ts).
   - Sin canchas configuradas → mensaje + CTA a /canchas. Cancelar → vuelve.
  REGISTER:
   - Campos firstName/lastName/email/phone requeridos; errores inline por campo.
   - Submit → estado "enviado". Email ya registrado → error específico.
   - Loading state. Teléfono formato argentino. Link a /login.
FASE 6: docs/testing/reports/abonado-nuevo-register.md.
```

---

# 🟡 PROMPTS P2 — Medio (vistas agrupadas)

## S14 · Canchas + Abonados (`/canchas`, `/abonados`)

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTAS ASIGNADAS: /canchas (CourtList) y /abonados (AbonadosList).
PRIORIDAD: P2. SPECS EXISTENTES (extender): canchas-crud.spec.ts, abonados-crud.spec.ts.

Ejecutá las 7 fases. Foco:
  CANCHAS:
   - Listado con nombre/tipo/estado. Crear (superficie, duración 60/120, precios JSONB
     con cortes horarios). Editar persiste. Activar/desactivar (online/offline).
   - Eliminar solo si no hay reservas futuras. PinGate si hay PIN. Estado vacío → CTA.
   - Precios por tramo horario: verificá que un slot 9–17 y otro 17–23 toman precios distintos.
  ABONADOS:
   - Listado con estado (active/canceled/paused). Filtrar. Acciones: pausar/cancelar/reactivar.
   - "+ Nuevo Abonado" → /abonados/nuevo. Estado vacío.
FASE 6: docs/testing/reports/canchas-abonados.md.
```

## S15 · Staff + Settings PIN (`/staff`, `/settings/pin`)

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTAS ASIGNADAS: /staff (InviteStaffButton, StaffActions) y /settings/pin (setPinAction).
PRIORIDAD: P2. SPECS EXISTENTES (extender): staff-crud.spec.ts, pin-lockout.spec.ts.
Cross-check: tests/integration/pin-brute-force.test.ts.

Ejecutá las 7 fases. Foco:
  STAFF:
   - Listado (nombre/email/estado). Invitar por email (mock); email ya invitado → error.
   - Desactivar miembro: solo el dueño puede; miembro desactivado no entra. PinGate.
  PIN:
   - Sin PIN → form de creación. Con PIN → pide el actual para cambiar.
   - Patrón [0-9]{4,8}; PINs no coinciden → error; PIN incorrecto → error.
   - Tras setear PIN, PinGate funciona en /caja, /canchas, /reportes, /settings/*.
   - Lockout tras N intentos fallidos (cross-check pin-brute-force + pin-lockout).
   IMPORTANTE: restaurá settings.staff_pin_hash al estado original en afterAll.
FASE 6: docs/testing/reports/staff-pin.md.
```

## S16 · Reportes + Explorar (`/reportes`, `/explorar`)

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTAS ASIGNADAS: /reportes (getRevenueReport, CSV) y /explorar (búsqueda pública).
PRIORIDAD: P2. SPECS EXISTENTES (extender): reportes.spec.ts, portal-search.spec.ts.
Cross-check: tests/integration/reports.test.ts, search-upgrade.test.ts.

Ejecutá las 7 fases. Foco:
  REPORTES:
   - KPIs con % de cambio vs mes anterior (ingresos, ocupación). Tablas por cancha y método.
   - Navegación entre meses (searchParams). Mes sin datos → $0 sin error.
   - Exportar CSV: descarga + datos correctos. PinGate.
  EXPLORAR:
   - Resultados iniciales. Filtros: ciudad, superficie, formato, amenities, precio min/max.
   - Ordenamiento (relevancia/precio/rating). Toggle lista/mapa. Paginación (offset).
   - Sin resultados → empty state con sugerencia de limpiar filtros. SearchBar texto libre.
FASE 6: docs/testing/reports/reportes-explorar.md.
```

## S17 · Perfil + Configuración + Eliminar cuenta (jugador)

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTAS ASIGNADAS (jugador): /perfil (ProfileForm), /configuracion (DataExportButton),
  /eliminar-cuenta (DeleteAccountForm). PRIORIDAD: P2.
SPECS EXISTENTES (extender): player-profile.spec.ts, player-data-export.spec.ts,
  player-delete-account.spec.ts. Cross-check: arco-data-export.test.ts, player-anonymization.test.ts.

Ejecutá las 7 fases. Foco:
  PERFIL: muestra nombre/email/teléfono/avatar (iniciales si no hay foto). Editar nombre/teléfono
    persiste. Email no editable. Fecha+versión de términos aceptados.
  CONFIGURACIÓN: DataExportButton (ARCO) exporta/envía datos. Link a /eliminar-cuenta. noIndex.
  ELIMINAR CUENTA: confirmación explícita (escribir texto/checkbox) → doble confirmación →
    anonimización → logout+redirect. Player con reservas futuras → advertencia. Mensaje de
    retención financiera 5 años (Ley 25.326). noIndex.
  CUIDADO: eliminar-cuenta es DESTRUCTIVO. Usá un player desechable sembrado para el test
    (no e2e-player principal) y limpialo. NO anonimices el player compartido.
FASE 6: docs/testing/reports/player-cuenta.md.
```

## S18 · Home + Suspended (`/`, `/suspended`)

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTAS ASIGNADAS: / (landing) y /suspended. PRIORIDAD: P2.
SPEC EXISTENTE (extender): landing.spec.ts.

Ejecutá las 7 fases. Foco:
  HOME:
   - Hero + buscador: submit con ciudad/texto → /explorar?q=...
   - FeaturedComplexes, StatsBar, HowItWorks, OwnerBanner (CTA → /para-complejos) renderizan.
   - RESILIENCIA: si falla una de las 3 queries (listPublicCities/searchPublicTenants/
     getOpenMatches), las otras secciones igual se muestran (no pantalla en blanco).
   - ISR 300s: no datos stale obvios. A11y (cross-check a11y/public.spec.ts).
  SUSPENDED:
   - Icono + mensaje de suspensión. Botón de contacto. noIndex + robots no-follow.
FASE 6: docs/testing/reports/home-suspended.md.
```

---

# 🟢 PROMPTS P3 — Bajo (smoke + estático)

## S19 · Para complejos + Privacy + Terms

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTAS ASIGNADAS: /para-complejos (marketing), /privacy, /terms. PRIORIDAD: P3 (estáticas).
Objetivo: smoke + regresión visual ligera, no lógica.

Ejecutá fases 1, 3 (acotada), 4, 6. Foco:
  - /para-complejos: CTA principal → /register. Secciones (Features, Testimonios, FinalCta)
    renderizan. Imágenes/íconos sin broken links. Responsive mobile. Anclas internas.
  - /privacy: 9 secciones renderizan sin corte. Links externos válidos (AAIP, etc.). Responsive.
  - /terms: 10 secciones renderizan. Responsive. Sin "cancelled".
  Sugerencia: 1 spec smoke tests/e2e/static-pages.spec.ts que recorra las 3, verifique
  status 200, heading principal, ausencia de errores de consola, y axe sin violaciones críticas.
FASE 6: docs/testing/reports/paginas-estaticas.md.
```

## S20 · Mock-MP + Regresión completa

```text
[Pegá el BLOQUE GLOBAL arriba primero]

VISTA ASIGNADA: /mock-mp/checkout (solo testing) + REGRESIÓN de toda la suite.
PRIORIDAD: P3 (infra) + cierre de campaña.

Parte A — mock-mp:
  - Accesible solo con MP_MOCK_MODE=1; en prod → 404 (no se puede testear prod, documentar).
  - Botones: Aprobar (mockPay → /reserva/[id]/exito), Rechazar (mockReject → /error),
    Cancelar (mockCancel → /error). Muestra resumen correcto del booking.
  - Esto es la columna vertebral de TODOS los tests de pago: si falla, S2/S3 fallan.

Parte B — regresión:
  - Corré la suite completa: pnpm test:e2e:ci (chromium + mobile-chrome + axe-audit).
  - Corré pnpm test:e2e:flake-detect (todos los @critical, 10x).
  - pnpm typecheck && pnpm lint.
  - Consolidá un reporte global en docs/testing/reports/_RESUMEN.md:
    cobertura por vista, bugs abiertos, specs flaky, gaps restantes.
FASE 6: docs/testing/reports/mock-mp-regresion.md + _RESUMEN.md.
```

---

## Plantilla de reporte por vista

> Copiar a `docs/testing/reports/<vista>.md` al cerrar cada sesión.

```markdown
# Reporte de testeo — <Vista> (<URL>)

- **Prioridad:** P0 / P1 / P2 / P3
- **Sesión:** S<n>
- **Fecha:** YYYY-MM-DD
- **Specs tocados:** tests/e2e/<...>.spec.ts
- **Coverage previo:** <spec existente reutilizado>

## Matriz de cobertura

| Dimensión | Caso | Estado | Spec / test name |
|-----------|------|--------|------------------|
| Happy path | ... | ✅/❌/⏭️ | ... |
| Carga/vacío | ... | | |
| Errores | ... | | |
| Edge dominio | ... | | |
| Seguridad/RLS | ... | | |
| A11y | ... | | |
| Responsive/i18n | ... | | |

## Bugs encontrados

### BUG-<vista>-01 — <título>
- **Severidad:** crítica / alta / media / baja
- **Repro:** pasos numerados
- **Esperado vs actual:**
- **Causa raíz (si se investigó):**
- **Screenshot/trace:** ruta del artifact de Playwright

## Resultados de ejecución
- `pnpm exec playwright test <spec> --project chromium`: <verde/rojo, n tests>
- flake-detect (si @critical): <n/10 verdes>
- typecheck/lint: <ok/errores>

## Gaps / pendientes
- ...
```

---

## Anexo — Reglas Playwright específicas de este repo

Recordatorio condensado (ya en el BLOQUE GLOBAL, acá ampliado):

- **Auth por cookies, no por login UI.** Reutilizá `adminStorageState` / `playerStorageState`:
  `await context.addCookies(JSON.parse(adminStorageState).cookies)`. El login real solo se
  testea explícitamente en S1.
- **Fechas siempre con `tomorrowDateIsoArt()`** (date-fns-tz, DST-aware). Nunca offset manual.
- **Service-role para sembrar/limpiar estado** (`makeServiceClient`, `insertBookingServiceRole`,
  `cleanupBookingsByIds`). Bypassa RLS — usalo solo en setup/teardown, no para "testear" lógica.
- **Cleanup en `finally`** con los IDs creados. Tests idempotentes: corren 10× sin ensuciarse.
- **Esperas por condición** (`expect(locator).toBeVisible()`, `toHaveURL`, `toHaveText`).
  Cero `page.waitForTimeout`. Para realtime/polling, esperá el efecto observable, no un tiempo.
- **Selectores accesibles primero** (`getByRole`, `getByLabel`, `getByText`), no CSS frágil.
- **MP siempre mock** (`MP_MOCK_MODE=1` lo setea el webServer). El checkout va a `/mock-mp/checkout`.
- **Mutaciones de config del tenant** (settings, PIN, suscripción): guardá el estado original y
  restauralo en `afterAll`, o los demás specs heredan tu cambio y flakean.
- **`@critical`** al final del nombre del test para flujos de doc7 → entran en `flake-detect`.
- **Aislamiento**: cuando una vista muestra datos del tenant, agregá un caso con
  `secondAdminStorageState` que confirme que NO ve datos del tenant principal.
```
