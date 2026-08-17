# Onboarding wizard del admin — spec del refactor 2026-08

> Vistas: `/onboarding/[paso]` (wizard 4 pasos, paso en la URL) + `/onboarding/listo` (cierre peak-end).
> Fuente visual: `MASTER.md` v2 (§5.1 excepción de motion, §7 Guided UX, §9 goal gradient/Zeigarnik/peak-end).
> Hermana de `pages/horarios-precios.md` (reusa su modelo de horarios) y de `pages/canchas.md`.
> Reemplaza la spec de 2026-07-02 (implementada, luego auditada: "todo el diseño está en el marco,
> nada en el contenido" — ver plan `2026-08-15-onboarding-refactor.md`).
> Estado: implementado 2026-08-16 (rama `feat/onboarding-refactor`, fases 0-9 cerradas).
> `docs/spec/doc10_onboarding_design.md` queda **superseded** por este documento (ver nota al pie).

## 0. Objetivo y anti-objetivo

**Objetivo**: que el dueño vea el complejo que está armando MIENTRAS lo arma — la tarjeta pública,
la semana de horarios, la grilla con sus canchas — y que el wizard termine con una victoria adentro
del producto (una reserva real cargada en la grilla), no con un trámite afuera (OAuth de MercadoPago).

**Anti-objetivo**: seguir invirtiendo solo en el marco. La v1 (2026-07-02) tenía rail de marca,
gradiente, indicador de progreso único — y aun así se sentía "un formulario", porque el 80% de la
pantalla (el panel derecho) era una card blanca con `<input>` apilados que no mostraban nada del
complejo del usuario. Este refactor no cambia colores: cambia qué ocupa la pantalla.

## 1. Qué cambió respecto a la v1

| # | v1 (2026-07-02) | Ahora |
|---|---|---|
| 1 | Paso 4 = "¿Cobrás seña?", CTA primario = OAuth a MercadoPago | Paso 4 = "Tu primera reserva": grilla real, tocás un slot y cargás un turno. La seña se movió a la checklist del dashboard (ítem destacado, `/settings/facturacion` ya tenía su card) |
| 2 | Panel derecho = card de formulario sola, `bg-background` plano | Split panel: form a la izquierda, preview del producto a la derecha (`PublicCardPreview`/`WeekPreview`/`GridPreview`, armándose en vivo) |
| 3 | Mobile: rail oculto, sin preview, solo header + form | Preview en barra sticky colapsable al pie (`PreviewPane`), nunca ausente |
| 4 | Paso NO estaba en la URL — `page.tsx` lo calculaba de DB en cada render | `/onboarding/[paso]` (`complejo`/`horarios`/`canchas`/`reserva`); el botón atrás del navegador funciona |
| 5 | Paso 2 sin "Volver" | `StepSchedule` y `StepCourts` tienen "Volver"; `updateWizardTenantAction` nuevo permite corregir el paso 1 sin reiniciar |
| 6 | Fotos de cancha se subían a R2 y se perdían en el submit (el payload no las incluía) | El paso 3 no pide fotos — se cargan después en `/settings/canchas`, mismo uploader contra la cancha real |
| 7 | Drafts de canchas en `useState` puro — perder la conexión los borraba | `sessionStorage` por tenant (`use-court-drafts.ts`) |
| 8 | Checklist del dashboard: 2 de 7 ítems (`complexData`, `hasSchedule`) hardcodeados a `true` | `hasSchedule` sale de `hasOperableDay()` real; `complexData` sigue `true` a propósito (los campos son NOT NULL, no hay nada que chequear) |
| 9 | Cero eventos de analytics en todo el flujo | Categoría `onboarding` completa + `activation.first_online_booking` (§8) |
| 10 | Lógica de negocio en `src/app/onboarding/actions.ts` (Zod inline, UPDATE crudo) | `src/modules/onboarding/` (service/schema/types/steps), la action queda de capa fina |
| 11 | Sin `layout.tsx`/`loading.tsx`/`error.tsx` | Los tres existen; `layout.tsx` además es el gate de sesión (§4) |
| 12 | `useActionState` en `StepIdentity` | `useTransition` + `onSubmit` manual — ver nota de la Fase 9 en el service, `createTenantAction` muta la cookie de sesión y `useActionState` pierde la carrera contra la revalidación automática de Next |

## 2. Estructura de pasos

Se mantienen **4 pasos** (contrato de 3 specs e2e), en el mismo orden que la v1 — horarios antes que
canchas sigue siendo obligatorio: `uniformRulesFromOpeningHours` necesita horarios confirmados para
generar precios que cubran la apertura real.

```
1. complejo   → crea el tenant (Tu complejo)
2. horarios   → confirma horarios (Cuándo abrís)
3. canchas    → ≥1 cancha con precio (Tus canchas)
4. reserva    → carga (skippable) la primera reserva real en la grilla (Tu primera reserva)
→ /onboarding/listo  (cierre peak-end: link + WhatsApp + reconocimiento de la 1ra reserva)
```

Fuente única de la tabla de pasos: `src/modules/onboarding/onboarding.steps.ts` (`WIZARD_STEPS`,
`stepFromSlug`, `stepPath`, `stepFromPathname`) — nadie arma `/onboarding/<algo>` a mano.

### Paso 1 — "Tu complejo"

- Pide: Nombre · Dirección · Ciudad + Provincia (`Combobox` con búsqueda, no un `<select>` de 24).
- No pide: teléfono ni email del complejo — se derivan de la cuenta staff vía `getStaffContact()`
  (que YA los pidió en `/register`). Editables después en `/settings/perfil` (`TenantContactForm`).
- Preview: `PublicCardPreview` — la tarjeta pública tal como la ve un jugador en `/explorar`,
  armándose en vivo. No es `FeaturedComplexCard` (esa pide un `PublicTenantCard` completo que este
  paso no tiene todavía); reusa su mismo lenguaje visual (`card-premium`, `mockup-cover`, iniciales
  fantasma) con solo los 3 datos que el paso realmente pide.
- Revisita: `updateWizardTenantAction` — el slug NO se recalcula (puede haber viajado por WhatsApp ya).
- Actions: `createTenantAction` (alta, idempotente si ya hay tenant) / `updateWizardTenantAction`.

### Paso 2 — "Cuándo abrís"

- Reusa `ScheduleFields` tal cual (compartido con `/settings/horarios`), sin reescritura.
- Preview: `WeekPreview` — una barra por día sobre un eje de 24h (06:00→06:00 del día siguiente, para
  no aplastar una madrugada de `closesNextDay` a un pixel), calculada con `effectiveCloseMins()`
  (mismo cálculo que la grilla real). Es la única representación gráfica de un horario en todo el
  producto.
- Botón "Volver" → paso 1.
- Action: `saveWizardScheduleAction` (usa `horariosSchema` canónico, no un schema local).

### Paso 3 — "Tus canchas"

- Pide: Nombre · Formato (chips) · Superficie · Precio por turno (uniforme, un precio por cancha).
- No pide: fotos (§1.6).
- Preview: `GridPreview` — cada cancha (existente o draft) es una columna que entra animada
  (`AnimatePresence` + `layout`, spring 200ms) al agregarse.
- "+ Agregar otra cancha" duplica la anterior (nombre autoincremental). Drafts persistidos en
  `sessionStorage` por tenant. Revisita: canchas ya creadas se listan aparte (`ExistingCourtsList`)
  con hint "Podés editarlas después desde Canchas".
- Botón "Volver" → paso 2.
- Action: `createWizardCourtsAction` → `createOnboardingCourts` (módulo), transacción única:
  límite de plan, `createCourt` por draft, `updateOnboardingStep(3)`.

### Paso 4 — "Tu primera reserva"

Reemplaza al paso de señas de la v1 (§A.2 del plan: el paso terminal empujaba al dueño fuera de la
app, al peor momento del flujo, para una decisión que ni siquiera es requisito de operación —
`booking.service.ts` confirma un booking online sin MP conectado).

- Contenido: `StepFirstBooking` monta la grilla **real** de HOY (`FirstBookingCourtSlots`, generada
  server-side con las canchas y horarios que el dueño acaba de confirmar). Tocar un slot libre abre
  un mini-form (nombre) → `createOnboardingFirstBookingAction` → `createManualBooking` del módulo
  `bookings` (mismo camino que una reserva manual real desde la grilla del admin).
- Es el único momento del wizard donde ya existen los tres requisitos duros de `createManualBooking`:
  cancha `online`, pricing que cubre el slot, slot de 60 min confirmado.
- El slot recién cargado hace un pulse único (`scale` keyframes, 400ms) — el momento pico del wizard.
- Skippable siempre: "Saltar por ahora" (sin turno) / "Terminar y ver mi complejo" (con turno) →
  `finishOnboardingAction`, que cierra el onboarding y redirige a `/onboarding/listo`.
- Sin horarios libres hoy (caso borde: el complejo cierra o ya está lleno) → `EmptyState`, no bloquea.

### Señas / MercadoPago — fuera del wizard

Se movió a la checklist del dashboard (`onboarding-checklist.tsx`) como ítem destacado; conectar
sigue siendo `/api/mp/oauth-start` desde `/settings/facturacion`. El callback de OAuth
(`api/mp/callback/route.ts`) distingue: onboarding no completo (caso wizard, ya no ocurre desde acá
salvo un link viejo) activa `requires_deposit` + completa onboarding; onboarding completo (caso
real, desde la checklist) solo conecta y emite `onboarding.mp.connected`.

### Cierre `/onboarding/listo`

Guard propio (sesión + `onboarding_completed`, ver §4). Mismo shell (`WizardShell` sin preview),
check animado (`ListoReveal`), reconocimiento condicional "Tu primera reserva ya está en la grilla"
si `hasAnyBooking(tenant.id)`, y `ShareActions` (WhatsApp + copiar link) — la acción que dispara el
Aha Moment real (`activation.first_online_booking`, §8) y marca `public_link_shared` en la checklist.

## 3. Arquitectura de rutas

```
src/app/onboarding/
├── layout.tsx               ← gate de sesión (§4) + WizardMotionProvider + WizardChrome
├── loading.tsx               ← Suspense fallback del segmento
├── error.tsx                  ← error boundary del segmento
├── motion-provider.tsx        ← LazyMotion(domAnimation) + MotionConfig(reducedMotion="user")
├── page.tsx                   ← bare `/onboarding` → redirige al paso correcto según DB
├── [paso]/page.tsx            ← resuelve slug→paso, guard de tenant/paso válido, emite analytics
├── listo/page.tsx             ← cierre peak-end
├── actions.ts                 ← capa fina: guard → rate limit → módulo → track
├── wizard-hours.ts            ← sanitizeWizardHours (normaliza defaults de DB con madrugada inválida)
└── components/
    ├── WizardChrome.tsx        ← el único componente que Next mantiene montado entre pasos: rail +
    │                              progreso animado + manejo de foco (§7)
    ├── WizardShell.tsx          ← card centrada + slot de preview (split si `preview` está presente)
    ├── PreviewPane.tsx           ← dónde vive el preview (columna sticky desktop / barra mobile)
    ├── PublicCardPreview.tsx     ← preview paso 1
    ├── WeekPreview.tsx           ← preview paso 2
    ├── GridPreview.tsx           ← preview paso 3 y 4
    ├── StepIdentity.tsx / StepSchedule.tsx / StepCourts.tsx / StepFirstBooking.tsx
    ├── step-courts/               ← CourtDraftCard, ExistingCourtsList, use-court-drafts (sessionStorage)
    ├── use-wizard-navigation.ts   ← helper de navegación cliente compartido entre pasos
    └── wizard-styles.ts           ← clases token-safe para los campos (P0.1 de MASTER §13 sigue abierta)

src/modules/onboarding/
├── onboarding.service.ts     ← reglas de negocio: createOnboardingCourts, saveOnboardingSchedule,
│                                 createOnboardingFirstBooking, hasAnyBooking, currentWizardStep
├── onboarding.schema.ts       ← wizardCourtsSchema, wizardFirstBookingSchema
├── onboarding.types.ts        ← WizardActionResult, WizardStep (1|2|3|4|5), CreateFirstBookingResult
└── onboarding.steps.ts        ← WIZARD_STEPS, stepFromSlug/stepPath/stepFromPathname
```

## 4. Gate de sesión: por qué vive en `layout.tsx`

`loading.tsx` mete un `<Suspense>` alrededor de cada page — Next arranca a streamear la respuesta
(200 ya emitido) antes de que `page.tsx`/`[paso]/page.tsx`/`listo/page.tsx` lleguen a su propio
`redirect('/login')`, y el status HTTP ya no se puede cambiar (mismo bug que `(public)/[slug]/layout.tsx`
ya tenía resuelto, encontrado de nuevo acá en la verificación adversarial de Fase 9). El layout
renderiza FUERA de ese boundary, así que ahí el `redirect()` llega a tiempo — `curl` contra
`/onboarding`, `/onboarding/complejo`, `/onboarding/listo` sin sesión da 307 real a `/login`, no 200
con el chrome vacío.

El layout solo chequea **sesión** (staff autenticado). Cada page sigue llamando `extractAuthUser()`
por su cuenta para el `staffUserId` que necesita — está memoizada con `cache()` (React), así que no
es un segundo viaje real. El resto de las validaciones (tenant existente, paso válido, onboarding ya
completo) sigue en cada page: no son uniformes entre páginas (`listo` exige `onboarding_completed`,
lo inverso de las otras).

## 5. Shell y layout visual

Split funcional en desktop: rail de progreso (`WizardChrome`, angosto) + card del form + columna de
preview (`PreviewPane`, sticky). En mobile el preview no desaparece: baja a una barra sticky al pie,
colapsada por defecto, con `pb-[env(safe-area-inset-bottom)]` (mismo patrón que `ui/sheet.tsx`). El
form va SIEMPRE antes que el preview en el DOM aunque visualmente quede al lado — el teclado no debe
atravesar el preview antes de los campos.

Card `card-premium rounded-2xl p-6 md:p-8`, h2 de paso en `font-display` (Archivo). Primitives
`ui/` tal cual — la tokenización de `ui/input`/`ui/button` (MASTER §13 P0.1) sigue abierta y es
tarea propia; el wizard usa las clases token-safe de `wizard-styles.ts` mientras tanto.

## 6. Animaciones

`motion` (paquete `motion/react`) es la única librería de animación del stack, y solo en esta ruta —
ver la enmienda a MASTER §5.1 (`docs/spec/design-system/MASTER.md`, sección "5.1 Tokens": excepción
fechada 2026-08-15). `WizardMotionProvider` (`motion-provider.tsx`) monta `LazyMotion` con
`domAnimation` (~15 KB, no el bundle completo) y `MotionConfig reducedMotion="user"` — sin esa línea
se rompe la política de `prefers-reduced-motion` que el resto del producto respeta en tres capas.

| Momento | Componente | Cómo |
|---|---|---|
| Cambio de paso | `WizardChrome` | slide+fade direccional, `AnimatePresence mode="wait"` |
| Cancha agregada | `GridPreview` | columna nueva entra con `layout` + spring (200ms) |
| Barra de progreso | `WizardChrome` | width con spring |
| Slot de la primera reserva | `StepFirstBooking` | `scale` keyframes reactivos a `done`, 400ms — el momento pico |
| Cierre `/listo` | `ListoReveal` | stagger de las acciones, ~500ms total |

Reglas técnicas: solo `transform`/`opacity` (nunca `height`/`top`), interrumpibles (default de
`motion`), duraciones al 80% en mobile.

## 7. Accesibilidad

- **Foco al cambiar de paso**: `WizardChrome` compara el `pathname` guardado en un ref contra el
  actual — mueve el foco al h2 del paso nuevo solo si el pathname cambió, nunca en la carga inicial
  (evita robar foco al montar, un riesgo real con `AnimatePresence` que no depende de si `motion`
  llega a disparar `onAnimationComplete` en el primer render).
- **Anuncio de progreso**: región `aria-live="polite"` ("Paso N de 4, N%") — `polite` a propósito,
  para que se encole después del anuncio de foco del h2 en vez de interrumpirlo.
- **Preview pane**: equivalente textual real (cuántas canchas, qué horarios), nunca `aria-hidden` —
  comunica estado, no es decorativo. `PreviewPane` renderiza el mismo contenido dos veces (aside
  desktop / panel mobile) ocultas por CSS según viewport, para que un lector de pantalla no lo
  anuncie dos veces.
- **Grilla del paso 4**: slots son `<button>` navegables por teclado, no `<div onClick>`.
- **Reduced motion**: `MotionConfig reducedMotion="user"` (§6).
- Targets ≥44px mobile, campos ≥16px (guard automático `tests/unit/mobile-font-size-guard.test.tsx`),
  errores con `role="alert"`.

## 8. Analytics

Categoría `onboarding` en `src/shared/observability/breadcrumbs.ts`. Restricción no negociable: el
sink de `analytics_events` solo se registra server-side (`instrumentation.ts`, `run-workers.ts`) —
**todo evento de onboarding se emite desde Server Actions o Server Components**, nunca desde el
cliente. `PII_KEYS` descarta `staffUserId`: solo se puede medir agregado por tenant.

```
onboarding.started                  [paso]/page.tsx — primera vista de cualquier paso
onboarding.step.viewed              [paso]/page.tsx — cada vista de paso
onboarding.step.completed           actions.ts — cada action que avanza
onboarding.step.back                [paso]/page.tsx — navegación a un paso anterior
onboarding.step.error               actions.ts — validación o negocio falló
onboarding.courts.added             createWizardCourtsAction — count enviado en el submit
onboarding.first_booking.created    createOnboardingFirstBookingAction
onboarding.first_booking.skipped    finishOnboardingAction — sin turno cargado
onboarding.completed                finishOnboardingAction
onboarding.link.shared              markPublicLinkSharedAction (dashboard) — channel whatsapp|copy
onboarding.mp.connected             api/mp/callback — fromChecklist: true
onboarding.abandoned                onboarding-abandonment.worker.ts — derivado, no emitido en vivo
activation.first_online_booking     booking.service.ts — el Aha Moment real, categoría `activation`
                                     propia (no `onboarding.*`: puede pasar días después)
```

Vista de embudo: `(super-admin)/super-admin/_components/onboarding-funnel-section.tsx`, alimentada
por `metrics.service.ts`/`dashboard.service.ts` — primer `SELECT` real sobre `analytics_events`
fuera de la purga de retención.

## 9. Checklist del dashboard

`getChecklistState()` (`(admin)/dashboard/queries.ts`): `complexData` sigue `true` constante (los
campos son NOT NULL en `tenants`, no hay nada que pueda dar falso — dejarlo como chequeo sería
teatro); `hasSchedule` ahora es real (`hasOperableDay(openingHours, closesNextDay)` — antes decía
"Horarios definidos ✓" a un complejo con los 7 días cerrados). `mpConnected` es el ítem destacado que
reemplaza al viejo paso 4. `firstBookingReceived` sigue siendo el proxy del Aha Moment (booking con
`created_by_staff IS NULL`).

## 10. Deuda declarada / fuera de alcance (no ejecutar sin pedido)

- **Madrugada × precios, sistémico** (heredado de la v1, sin cambios): `PricingGrid` UI y
  `validatePricingRulesCoverage` siguen sin representar horas post-medianoche fuera del generador
  del wizard. Tarea propia.
- Primitives `button`/`input` siguen light-hardcodeados (MASTER §13 P0.1).
- Paso 1 sin autocompletado Google Places (doc10 lo pedía; requiere API key — decisión de negocio,
  explícitamente fuera del alcance elegido el 2026-08-15).
- Rediseño de `/register` y del email de bienvenida: fuera del alcance elegido.

## 11. Contratos de test

- `tests/e2e/onboarding.spec.ts` — flujo completo: identidad → horarios → canchas → primera reserva
  (skip) → `/onboarding/listo`. Locators de heading con `{ level: 2 }` donde compiten con el `<h3>`
  placeholder de `PublicCardPreview`.
- `tests/e2e/qa-happy-paths/admin/TG-HP-203.spec.ts` — mismo recorrido + asserts de DB.
- `tests/e2e/first-booking-aha.spec.ts` — la checklist refleja el booking real.
- `tests/e2e/capture-screenshots.spec.ts` — captura los 4 pasos nuevos.
- `tests/unit/rate-limit-admin-coverage.test.ts` — cobertura **por action** (no por archivo): cierra
  el hueco que dejaba pasar `finishOnboardingAction` sin rate limit.
- `tests/unit/onboarding-role-guard.test.ts`, `onboarding-create-tenant-idempotency.test.ts`,
  `onboarding-schedule-validation.test.ts`.
- Stories con axe bloqueante en CI: `WizardChrome`, `WizardShell`, `PreviewPane`,
  `PublicCardPreview`, `WeekPreview`, `GridPreview`, `StepIdentity`, `StepSchedule`, `StepCourts`,
  `StepFirstBooking`, `CourtDraftCard`, `ExistingCourtsList`, `ui/progress`, `ui/stepper`.

---

> **Nota sobre `doc10_onboarding_design.md`**: ese documento (spec de estrategia/negocio, no de UI)
> describe un wizard que nunca coincidió con el código en varios puntos (orden de pasos, contenido
> del paso 4, precios pre-cargados) y quedó desactualizado por este refactor en los que sí coincidía
> (fotos fuera del wizard, paso terminal). Sigue vigente su §1 (Aha Moment, métricas de éxito) y su
> razonamiento de negocio (§6); su §2 (mockups ASCII paso a paso) está superseded por este documento.
