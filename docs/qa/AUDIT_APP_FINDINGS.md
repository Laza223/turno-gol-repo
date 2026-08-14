# Audit App — Hallazgos de QA exploratorio multi-agente

> Registro de hallazgos de la sesión de QA exploratorio con navegador real (ver
> `docs/qa/PROMPT_SESION_QA_MULTIAGENTE.md`). **Este archivo es SOLO registro — ningún hallazgo
> de acá se arregla desde esta sesión.** Priorización y fixes son un esfuerzo aparte, con el
> dueño del producto decidiendo el orden (ver `protocolo-fixes-general`).

## Cómo se registra un hallazgo

Dos categorías, nunca mezcladas:

- **BUG** — contradice `docs/qa/vistas_qa_exhaustivo.md` o el código hace algo distinto de lo
  que dice hacer. Objetivo, no admite debate.
- **MEJORA/UX** — nada escrito lo prohíbe, es criterio del agente mirando como usuario real.
  Solo válido si cita un ancla (heurístico de Nielsen, regla de `MASTER.md`, criterio de
  accesibilidad, o la regla "tan simple que un niño lo entienda"). Sin ancla, no se registra.

Plantilla por hallazgo (copiar y completar):

```markdown
### [BUG|MEJORA] <título corto, específico> — <vista/URL>

- **Severidad:** 🔴 crítico · 🟡 medio · 🟢 bajo
- **Vista:** <nombre de la vista, igual que en vistas_qa_exhaustivo.md> — **URL:** `/ruta`
- **Esperado:** <qué debería pasar, citando el checklist si es BUG>
- **Observado:** <qué pasó de verdad>
- **Evidencia:** <captura de pantalla / verificación en DB o API / pasos de reproducción>
- **Ancla** (solo si es MEJORA/UX): <heurístico de Nielsen | regla de MASTER.md §N | criterio
  de accesibilidad | "tan simple que un niño lo entienda">
- **Reportado por:** <agente/sesión> · <fecha>
```

Un hallazgo por bloque. No agrupar varios problemas distintos en una sola entrada.

---

## Resumen (completar al cierre de cada sesión de QA)

| Fecha | Vistas cubiertas | 🔴 | 🟡 | 🟢 | BUG | MEJORA/UX | Vistas sin cubrir |
|---|---|---|---|---|---|---|---|
| 2026-08-13/14 (Lote 1+2+3, CERRADO) | 46/46 (100%) | 8 | 34 | 18 | 41 | 19 | Ninguna — barrido completo |

**Estado de la sesión: CERRADA.** Las 46 vistas de `vistas_qa_exhaustivo.md` (P0=10, P1=24, P2=7, P3=5) quedaron cubiertas con browser real (`agent-browser`, 23 agentes en paralelo en total repartidos en 3 lotes) y verificación cruzada en DB (Postgres local, solo lectura) donde correspondía a un reclamo de "se guardó"/"no se guardó". 60 hallazgos totales (conteo verificado por grep sobre este mismo archivo, no estimado): 41 BUG + 19 MEJORA-UX, por severidad real 8 🔴 críticos + 34 🟡 medios + 18 🟢 bajos. Ningún archivo de código fue tocado en toda la sesión — único output: este archivo (`docs/qa/AUDIT_APP_FINDINGS.md`) y la extensión del seed E2E vía SQL directo (documentada en la memoria de continuidad de la sesión, no en el repo). Patrón sistémico transversal detectado en 3 lotes distintos, vale la pena leerlo como UNA sola causa raíz con 6+ apariciones: el locale español de Zod (`installZodLocale()`, `instrumentation.ts`) no cubre los mensajes default de `.max()`/`.min()` sin `message` custom — aparece en Checkout (P0), Onboarding/Register, Canchas, Equipo, Caja·Productos (P1) y Perfil del jugador (P2); lo mismo con el banner `PushNotificationManager` tapando controles reales (P0 Grilla/Caja, P1 Dashboard, P2 Avisos — esta última manifestación es 🔴 crítica porque bloquea la única acción de la pantalla sin feedback) y con el soft-404 del catch-all `[slug]` (P1 Perfil público/Disponibilidad, P3 slugs legacy /privacy /terms).

**Nota operativa (no es hallazgo de producto):** el agente de Auth corrió `agent-browser close --all` al final de su sesión, cerrando también las sesiones de browser de los otros 3 agentes que corrían en paralelo. No tuvo impacto en los resultados (los 4 agentes ya habían completado su recolección de evidencia), pero para los próximos lotes cada agente tiene instrucción explícita de cerrar SOLO su propia sesión nombrada.

---

## 🔴 P0

### [BUG] `/ingresar` crea cuenta jugador nueva sin declaración jurada +18 — Verificación de magic link

- **Severidad:** 🔴 crítico
- **Vista:** Verificación de magic link (re-acceso jugador) — **URL:** `/ingresar` → `/api/auth/callback` → `/verify`
- **Esperado:** `/ingresar` es re-acceso para un jugador YA existente (comentario propio del código, `src/modules/auth/auth.service.ts:62-64`). Un email nunca registrado no debería poder crear cuenta activa por esta vía — el alta real exige nombre/apellido y checkbox de declaración jurada +18 (ADR-012, doc11) vía el `LoginGate` del checkout.
- **Observado:** `signInWithExistingPlayerMagicLink` (`auth.service.ts:66-78`) llama a `supabase.auth.signInWithOtp` sin `shouldCreateUser: false`, así que Supabase crea el usuario igual si no existía. Pedido desde `/ingresar` con un email nunca usado → Inbucket entregó la plantilla de ALTA (`type=signup`), y seguir el link dejó una sesión de jugador activa en `/mis-reservas` sin ningún paso de consentimiento.
- **Evidencia:** `docker exec supabase_db_TurnoGol psql -U postgres -d postgres -c "SELECT id,email,created_at FROM auth.users WHERE email='no-existe-jugador-xyz@turnogol.test'"` → 1 fila nueva. `SELECT first_name,last_name,agreed_to_terms_at,terms_version,status FROM players WHERE email='...'` → `first_name` derivado del local-part del email, `last_name`/`agreed_to_terms_at`/`terms_version` NULL, `status='active'`.
- **Reportado por:** Lote 1 P0 · agente Auth (agent-browser) · 2026-08-13

### [BUG] Deep link `date` calendáricamente inválido crashea el checkout — Confirmación de reserva

- **Severidad:** 🔴 crítico
- **Vista:** Confirmación de reserva (checkout jugador) — **URL:** `/{slug}/reservar?...&date=2099-13-45&...`
- **Esperado:** Con un `date` con formato de fecha pero calendáricamente inválido, se debe mostrar el `InvalidState` ("Faltan datos del turno. Elegí un horario desde la grilla.") sin crash — mismo criterio que otros deep links inválidos de la misma vista.
- **Observado:** Crash con la pantalla genérica de error de Next ("Algo salió mal"). `DATE_RE = /^\d{4}-\d{2}-\d{2}$/` (`src/app/(public)/[slug]/reservar/page.tsx:20`) solo valida formato, no que sea fecha real; el string pasa de largo hasta `getPublicAvailability(tenant, date)` (línea 75), que arma la query SQL cruda y Postgres tira un error de parseo sin atrapar. El módulo ya importa `isValidCalendarDate` en `actions.ts` pero `page.tsx` no lo usa.
- **Evidencia:** Navegación directa a la URL; consola muestra `Failed query: select "court_id"...` con digest `2924618809`, capturado por `<ErrorBoundaryHandler>`.
- **Reportado por:** Lote 1 P0 · agente Checkout+pago (agent-browser) · 2026-08-13

### [BUG] `bookingId` no-UUID crashea las 3 páginas de desenlace de pago — misma clase, 3 archivos

- **Severidad:** 🔴 crítico
- **Vista:** Reserva exitosa / Reserva pendiente / Reserva con error de pago — **URL:** `/reserva/not-a-uuid/exito`, `/reserva/not-a-uuid/pendiente`, `/reserva/not-a-uuid/error`
- **Esperado:** Con `bookingId` que no es UUID válido, mostrar el estado "No encontramos tu reserva" (que sí funciona para UUID válido pero inexistente) — el propio checklist ya marcaba la vista de error como riesgo conocido.
- **Observado:** Las 3 páginas crashean con "Algo salió mal" en vez del estado gracioso. Misma causa raíz en los 3 archivos: `loadBooking` arma `WHERE b.id = ${bookingId}` en SQL crudo sin validar el formato UUID antes — Postgres rechaza el cast y la excepción no se atrapa. El checkout (vista 2) ya tiene y usa `UUID_RE` (`actions.ts:31`) pero no se reutiliza acá.
  - `src/app/reserva/[bookingId]/exito/page.tsx:53`
  - `src/app/reserva/[bookingId]/pendiente/page.tsx:18`
  - `src/app/reserva/[bookingId]/error/page.tsx:20`
- **Evidencia:** GET autenticado a cada URL con `not-a-uuid` → `main.textContent = "Algo salió mal..."` con digest distinto por página (1317655671 / 1060938302 / 2884734113).
- **Reportado por:** Lote 1 P0 · agente Checkout+pago (agent-browser) · 2026-08-13

### [BUG] Mensaje de validación en inglés (Zod sin traducir) — Confirmación de reserva

- **Severidad:** 🟡 medio
- **Vista:** Confirmación de reserva (checkout jugador) — **URL:** `/{slug}/reservar`
- **Esperado:** Mensaje en español, consistente con el resto del formulario (`"Ingresá tu nombre"`, `"Ingresá un email válido"`).
- **Observado:** Nombre/apellido >80 caracteres muestra el mensaje crudo de Zod: `"Too big: expected string to have <=80 characters"`. `src/app/(public)/[slug]/reservar/actions.ts:43-44` — `.max(80)` sin mensaje custom (a diferencia de `.min(1, 'Ingresá tu nombre')` en la misma línea); `actions.ts:77` expone `parsed.error.issues[0]?.message` directo al usuario.
- **Evidencia:** `firstName: 'B'.repeat(150)` + email válido + checkbox → banner `role=alert` con el texto en inglés (screenshot).
- **Reportado por:** Lote 1 P0 · agente Checkout+pago (agent-browser) · 2026-08-13

### [BUG] Banner "Habilitar notificaciones" tapa la navegación del panel admin

- **Severidad:** 🟡 medio
- **Vista:** Grilla de canchas y Caja diaria (layout admin compartido) — **URL:** `/grilla`, `/caja` (afecta todo el layout `(admin)`)
- **Esperado:** Ningún elemento flotante debe tapar controles de navegación persistentes (prevención de errores / affordance básica).
- **Observado:** `PushNotificationManager` (`src/components/admin/PushNotificationManager.tsx:329`, `fixed bottom-[...] inset-x-4 z-40 sm:left-4 sm:right-auto sm:max-w-sm`, sin offset que considere la nav) se superpone sobre los links "Torneos"/"Métricas"/"Configuración" del sidebar en desktop (1280×800 y 1440×900) y sobre los tabs "Caja"/"Más" de la barra inferior mobile — intercepta el click, no solo tapa visualmente. Aparece por defecto en cada sesión nueva hasta descartarlo con la "X". **Encontrado independientemente por 3 agentes** (Grilla, Caja y, en Lote 2, Dashboard), en los 3 casos confirmando que el click sobre el link tapado no navega mientras el banner está visible.
- **Evidencia:** `elementFromPoint(79,425)` (posición de "Torneos") → `{tag:'DIV', text:'¿Habilitar notificaciones?...'}` en vez del link. Screenshots: `grilla-1280x800.png`, `mobile-grilla.png`, `overlay-verify.png`, `dash-03-toggle.png`/`dash-05-after-close-prompt.png` (Lote 2: click en "Torneos"/"Métricas" con el banner visible no navega — heading sigue en "Hoy" sin request de red; tras cerrar el banner, el mismo click sí navega).
- **Reportado por:** Lote 1 P0 · agentes Grilla + Caja (agent-browser) · 2026-08-13; confirmado de nuevo en Lote 2 P1 · agente Dashboard (agent-browser) · 2026-08-13

### [BUG] Banner "acaba de ser tomado" (`slot_taken`) inalcanzable en la práctica — Confirmación de reserva

- **Severidad:** 🟡 medio
- **Vista:** Confirmación de reserva (checkout jugador) — **URL:** `/{slug}/reservar?...&error=slot_taken`
- **Esperado:** Al redirigir con `error=slot_taken` debe verse el alert "Ese turno acaba de ser tomado. Elegí otro horario." (`CheckoutErrorBanner`, manteniendo el contexto del checkout).
- **Observado:** `page.tsx:86-93` re-chequea disponibilidad ANTES de llegar al banner y, si el slot ya no está libre (la causa real de `slot_taken`), corta con `CheckoutInvalidState` ("Ese turno ya no está disponible...") — el guard se dispara siempre primero, así que el mensaje específico de `CheckoutErrorBanner` (línea 58 de `CheckoutStates.tsx`) nunca se ve en el escenario real que lo dispara.
- **Evidencia:** 3 clicks rápidos sobre "Pagar seña y reservar" en un slot libre → 1 sola fila en `bookings` (verificado en DB), URL final con `error=slot_taken` pero pantalla mostrando el texto de `CheckoutInvalidState`, no el de `CheckoutErrorBanner`.
- **Reportado por:** Lote 1 P0 · agente Checkout+pago (agent-browser) · 2026-08-13

### [BUG] `ErrorState` de `/verify` sin `role="alert"` — Verificación de magic link

- **Severidad:** 🟡 medio
- **Vista:** Verificación de magic link — **URL:** `/verify?error=invalid`
- **Esperado:** Checklist vista 7 `[A11y - Alerta de error]`: `<p role="alert">` anunciable por screen reader.
- **Observado:** El `<p>` del mensaje NO tiene `role="alert"` (`src/app/(auth)/verify/page.tsx:168`). El equivalente en `/login` sí lo tiene — la inconsistencia es específica de `/verify`.
- **Evidencia:** `document.querySelector('[role=alert]')` → `null` en `/verify?error=invalid`; confirmado en el código fuente.
- **Reportado por:** Lote 1 P0 · agente Auth (agent-browser) · 2026-08-13

### [BUG] `/verify?error=used` es inalcanzable — código muerto en `ERROR_COPY`

- **Severidad:** 🟢 bajo
- **Vista:** Verificación de magic link — **URL:** `/verify?error=expired` (reutilización de link)
- **Esperado:** Checklist vista 7 `[Concurrencia]`: reusar un magic link ya canjeado debe dar `/verify?error=used`.
- **Observado:** `src/app/api/auth/callback/route.ts:76` mapea CUALQUIER `otp_expired` de Supabase (vencido por tiempo o ya canjeado) a `'expired'`. Ningún caller de `redirectVerifyError()` pasa nunca `'used'` — el string solo existe en `ERROR_COPY` (`verify/page.tsx:11`) y en una story de Storybook.
- **Evidencia:** Magic link válido consumido → repetir la misma URL de callback da `/verify?error=expired`, nunca `error=used`. `grep -n "'used'"` sobre `src/` solo encuentra el diccionario y la story.
- **Reportado por:** Lote 1 P0 · agente Auth (agent-browser) · 2026-08-13

### [MEJORA-UX] Cancelar una reserva no vive en el panel lateral de la Grilla — Grilla de canchas

- **Severidad:** 🟡 medio
- **Vista:** Grilla de canchas / Listado de reservas — **URL:** `/grilla` (panel lateral) vs `/reservas` (tab "Lista" del mismo toolbar)
- **Esperado:** N/A (no hay checkbox violado) — criterio propio.
- **Observado:** El `BookingSlotPanel` (Sheet lateral de la Grilla) ofrece "Cargar cantina", "Reprogramar" y cobrar/marcar ausente, pero NO cancelar ni editar datos de la reserva. La única forma de cancelar es la tab "Lista" (`/reservas`), con botón "Cancelar" + diálogo (motivo + quién cancela). Verificado end-to-end: cancelación desde `/reservas` deja `status='canceled_no_refund'` con `canceled_reason`/`canceled_by`/`canceled_at` completos y el slot vuelve a la Grilla al instante — pero solo llegando por la vista secundaria.
- **Evidencia:** `SELECT id, status, canceled_reason, canceled_by, canceled_at FROM bookings WHERE guest_name='QA DoubleSubmit Test'` → `canceled_no_refund` con los 3 campos completos; slot 18:00 Cancha E2E 1 confirmado libre después.
- **Ancla:** Heurístico de Nielsen — control y libertad del usuario (sin "salida de emergencia" para deshacer una reserva mal cargada desde la herramienta de uso diario); regla del dueño "tan simple que un niño lo entienda" (CLAUDE.md) — cancelar debería vivir junto a cobrar/reprogramar/marcar ausente.
- **Reportado por:** Lote 1 P0 · agente Grilla (agent-browser) · 2026-08-13

### [MEJORA-UX] `/verify` clasifica "cuenta confirmada" también en un re-login — Verificación de magic link

- **Severidad:** 🟢 bajo
- **Vista:** Verificación de magic link — **URL:** `/verify?status=success&next=%2Fe2e-complejo-demo%2Freservar&intent=booking`
- **Esperado:** N/A — criterio propio.
- **Observado:** `playerSuccessIntent()` (`src/lib/auth-success.ts:20-23`) deriva el intent solo del path de `next`, sin distinguir alta real de re-login. Pedido de magic link de RE-ACCESO (no alta) para `e2e-player@turnogol.test` (cuenta ya existente) con `next` de reserva → igual muestra "¡Cuenta confirmada!" / "Volvé para terminar tu reserva.", copy pensado para alta nueva.
- **Evidencia:** Link recibido con `type=email` (re-acceso, no signup) pero redirige igual a `intent=booking` con el copy de alta.
- **Ancla:** Heurístico de Nielsen #2 (match entre el sistema y el mundo real) — el mensaje de éxito debe reflejar lo que efectivamente ocurrió.
- **Reportado por:** Lote 1 P0 · agente Auth (agent-browser) · 2026-08-13

### [MEJORA-UX] Foco no se mueve al error tras un login fallido — Login

- **Severidad:** 🟢 bajo
- **Vista:** Login — **URL:** `/login`
- **Esperado:** N/A — criterio propio.
- **Observado:** Tras submit fallido, `document.activeElement` queda en `<body>` — no se mueve al campo ni al mensaje de error. El mensaje sí tiene `role="alert"` (se anuncia por screen reader), pero un usuario de teclado sin lector de pantalla debe retabular desde el principio.
- **Evidencia:** `eval('document.activeElement.outerHTML')` tras error → `<body>`.
- **Ancla:** Heurístico de Nielsen #9 (ayudar a reconocer/diagnosticar/recuperarse de errores) — gestión de foco en formularios accesibles.
- **Reportado por:** Lote 1 P0 · agente Auth (agent-browser) · 2026-08-13

### [MEJORA-UX] Inputs Nombre/Apellido sin `maxlength` HTML — Confirmación de reserva

- **Severidad:** 🟢 bajo
- **Vista:** Confirmación de reserva (checkout jugador) — **URL:** `/{slug}/reservar`
- **Esperado:** N/A — criterio propio.
- **Observado:** El servidor rechaza >80 caracteres (Zod), pero los inputs no tienen `maxlength` — se puede escribir y enviar texto arbitrariamente largo, y el usuario solo se entera tras un viaje completo al servidor (ver el bug del mensaje en inglés, arriba).
- **Evidencia:** `get attr maxlength` en ambos inputs → vacío; se envió un nombre de 150 caracteres sin freno del navegador.
- **Ancla:** Heurístico de Nielsen #5 — prevención de errores.
- **Reportado por:** Lote 1 P0 · agente Checkout+pago (agent-browser) · 2026-08-13

### [MEJORA-UX] Banners de error sin CTA de recuperación — Confirmación de reserva

- **Severidad:** 🟢 bajo
- **Vista:** Confirmación de reserva (checkout jugador) — **URL:** `/{slug}/reservar?...&error=too_many_holds` (también `banned`, `rate_limited`)
- **Esperado:** N/A — criterio propio.
- **Observado:** Los banners inline (`too_many_holds`, `banned`, `rate_limited`) son solo texto, sin botón de recuperación — a diferencia de `CheckoutInvalidState`, que siempre renderiza un link "Elegir otro turno" (`CheckoutStates.tsx:106-123`). Inconsistencia de patrón entre dos familias de error de la misma vista.
- **Evidencia:** Screenshot del banner `too_many_holds` sin ningún link/botón debajo del texto.
- **Ancla:** Heurístico de Nielsen #9 (recuperación de errores) + #4 (consistencia interna).
- **Reportado por:** Lote 1 P0 · agente Checkout+pago (agent-browser) · 2026-08-13

### [MEJORA-UX] Widget "Cobrado hoy" del sidebar tarda 15-21s en reflejar un cobro hecho desde Deudas — Caja · Plata en la calle

- **Severidad:** 🟢 bajo
- **Vista:** Caja · Plata en la calle (deudas) — **URL:** `/caja/deudas`
- **Esperado:** N/A — criterio propio.
- **Observado:** Al cobrar un fiado desde `/caja/deudas`, el total de "PLATA EN LA CALLE" de esa misma página se actualiza al instante, pero el widget "Cobrado hoy" del sidebar (B14, visible en todo el admin) queda con el valor viejo durante 15-21s (aparente poll de `/api/admin/day-total`) — el mismo cobro hecho desde `/caja/cantina` sí actualiza el sidebar de inmediato. El monto en base está bien calculado (`cash_flow` correcto) — es puramente de refresco visual.
- **Evidencia:** Secuencia de screenshots (`deudas-08-immediately.png`, `-09-after6s.png`, `-10-after21s.png`) con el sidebar en $6.177 hasta ~21s después del toast de éxito, mientras `SELECT status, total_amount, settled_cash_flow_id FROM canteen_tabs WHERE debtor_name='Deudor Cantina QA'` ya mostraba `paid`.
- **Ancla:** Heurístico de Nielsen #1 — visibilidad del estado del sistema.
- **Reportado por:** Lote 1 P0 · agente Caja (agent-browser) · 2026-08-13

## 🟠 P1

### [BUG] Doble click en "Continuar" del wizard de Onboarding crea canchas duplicadas — Onboarding (Paso 3: Canchas)

- **Severidad:** 🔴 crítico
- **Vista:** Onboarding (wizard 4 pasos) — Paso 3 Canchas — **URL:** `/onboarding`
- **Esperado:** Checklist vista 11, líneas 904-906 (Doble submit): el botón debe deshabilitarse en el primer click, un solo request enviado.
- **Observado:** El botón "Continuar" del paso Canchas NO se deshabilita sincrónicamente al hacer click. Tres clicks rápidos dispararon 3 POST `/onboarding` independientes y crearon 3 filas idénticas `courts` ("Cancha 1", mismo precio, las 3 `status='online'`, bookeables públicamente) — el admin ve 3 columnas indistinguibles en la Grilla recién terminado el onboarding. El mismo ataque repetido en el Paso 1 (tenant) SÍ está protegido (una sola fila pese a 3 clicks) — el problema es específico del INSERT del paso Canchas, sin guard de idempotencia.
- **Evidencia:** `SELECT id,name,created_at FROM courts WHERE tenant_id=...` → 3 filas `name='Cancha 1'`, `status='online'`, `price=1500000`, ~1s de diferencia entre timestamps. Screenshot de la Grilla con 3 columnas "Cancha 1" duplicadas. Control negativo: mismo ataque en Paso 1 no duplica.
- **Reportado por:** Lote 2 P1 · agente Onboarding (agent-browser) · 2026-08-13

### [BUG] `completeAndChargeBookingAction` crashea toda la vista de Reservas al completar un turno con nota de deuda — Detalle de reserva

- **Severidad:** 🔴 crítico
- **Vista:** Detalle de reserva (`CompleteBookingDialog`, "Completar con deuda") — **URL:** `/reservas/[id]`
- **Esperado:** Completar cobrando menos que lo pendiente + nota de deuda debe completar la reserva, anexar la nota a `notes_internal` y mostrar "Completada con deuda pendiente" (checklist vista 13 líneas 1092-1093, vista 21 línea 1698).
- **Observado:** Siempre que `debtNote` no está vacío, la Action falla con un `PostgresError` sin capturar. `completeAndChargeBookingAction` (`src/app/(admin)/reservas/actions.ts:978-987`) hace un segundo `UPDATE notes_internal` DESPUÉS de que `completeBooking()` (línea 922) ya puso `status='completed'` en la MISMA transacción; el trigger `enforce_booking_invariants_fn()` (migración 070, líneas 72-114) bloquea cualquier UPDATE sobre un booking cuyo `OLD.status` ya es terminal, sin excepción para la propia transacción que lo completó. La transacción entera rollbackea (sin corrupción, pero sin cobro registrado) y el error crudo de Postgres escala hasta el error boundary de toda la ruta `/reservas`, dejando al staff sin poder usarla hasta recargar. Con `debtNote` vacío, la misma Action completa correctamente. Reproducido 2 veces idéntico.
- **Evidencia:** Response: `{"name":"PostgresError","message":"Booking en estado terminal (completed) no puede modificarse"}` sobre `UPDATE bookings SET notes_internal = $1 ...`. DB tras el intento: `status='confirmed'`, `notes_internal=''`, 0 filas en `cash_flows`. Repetido con nota vacía en el mismo booking → éxito (`status='completed'`, `cash_flow` de $60 insertado).
- **Reportado por:** Lote 2 P1 · agente Reservas (agent-browser) · 2026-08-13

### [BUG] Subir el logo del complejo crashea el perfil público — Configuración: Perfil público

- **Severidad:** 🔴 crítico
- **Vista:** Configuración: Perfil público (efecto en el perfil público) — **URL:** `/settings/perfil` → efecto en `/e2e-complejo-demo`
- **Esperado:** Checklist vista 29, línea 2289: subir logo se refleja en el perfil público sin acción adicional.
- **Observado:** El logo se sube y persiste bien del lado admin (`tenants.logo_url`, se ve en la propia vista de Perfil, que usa un `<img>` plano). Pero visitar el perfil público con ese logo seteado crashea TODA la página ("Algo salió mal"). Causa: `TenantHeader.tsx:49` renderiza el logo con `next/image`, pero `next.config.ts:72-79` (`images.remotePatterns`) no incluye el hostname del bucket público de R2 (`pub-*.r2.dev`) — solo lista `images.unsplash.com`, `**.supabase.co` y `media.turnogol.com`. Next tira "Invalid src prop... hostname is not configured" y el throw en cliente tumba toda la página pública, no solo el logo. El mismo patrón (`<Image src={tenant.coverUrl}>` en `TenantCard.tsx:202`, usado en `/explorar`) está expuesto al mismo riesgo con la Portada (no confirmado en vivo por un asset de prueba inválido, no por protección real del código).
- **Evidencia:** Consola: `Invalid src prop (https://pub-...r2.dev/.../logo-....webp)... hostname "pub-...r2.dev" is not configured under images in your next.config.js`, manejado por `<ErrorBoundaryHandler>`. Reproducido subiendo un PNG real vía input (no bypass), verificado `logo_url` en DB antes/después. Cleanup: logo removido al terminar la prueba.
- **Reportado por:** Lote 2 P1 · agente Settings (agent-browser) · 2026-08-13

### [BUG] El cron que auto-completa turnos rompe "Horarios tomados", el candado de borrado y el fixture de Torneos — Torneos: detalle + fixture

- **Severidad:** 🔴 crítico
- **Vista:** Torneos: detalle + fixture — **URL:** `/torneos/[id]`
- **Esperado:** El panel "Horarios tomados" debe listar todas las horas que el torneo ocupa; el guard de borrado (`countTournamentBookings` → `TournamentHasBookingsError`) debe frenar el DELETE mientras haya horas referenciadas (comentario propio del código, `tournament.service.ts:230-231`, para evitar un 23503 crudo de la FK); `generateFixture` debe poder ubicar partidos en todas las horas tomadas.
- **Observado:** `listTournamentSlots`/`countTournamentBookings` (`tournament-slots.service.ts:231-234,270-273`) filtran `status IN ('confirmed','pending_payment')`. El cron `auto-complete-bookings.worker.ts` (cada 30 min) pasa cualquier booking `confirmed` ya terminado a `completed`, para TODOS los tenants y tipos, sin excepción para `type='tournament'`. Reproducido: tomé 4 horas para el torneo el mismo día, verificadas en DB (`confirmed`); ~50 min después (tras correr el cron) las 4 filas seguían existiendo con `tournament_id` correcto pero `status='completed'` — el panel pasó a mostrar "Sin horarios tomados" y el guard de borrado (mismo filtro) da 0, mientras el DELETE real seguiría chocando con la FK `bookings_tournament_id_fkey` (sin `ON DELETE`) con un 23503 crudo — exactamente el caso que el propio comentario del código dice haber querido evitar. El mismo filtro se reutiliza en `generateFixture` (línea 347) y `rescheduleMatch` (línea 556): un torneo cuyas primeras horas ya pasaron pierde esas horas también para el fixture.
- **Evidencia:** DB antes: 4 filas `status='confirmed'`; DB después del cron: mismas 4 filas `status='completed'`. `SELECT count(*) ... status IN ('confirmed','pending_payment')` → 0; `SELECT count(*) ...` sin filtro → 4. UI: "Todavía no reservaste ningún horario para este torneo." con las 4 filas aún existiendo (`bug-horarios-desaparecen.png`).
- **Reportado por:** Lote 2 P1 · agente Torneos (agent-browser) · 2026-08-13

### [BUG] Teléfono de 5-6 dígitos aceptado sin validar formato argentino — Registro de nuevo admin + Onboarding

- **Severidad:** 🟡 medio
- **Vista:** Registro de nuevo admin + Onboarding (Paso 1) — **URL:** `/register`, `/onboarding`
- **Esperado:** Checklist vista 22 línea 1786 y vista 11 línea 864: un teléfono corto (ej. 6 dígitos) debe rechazarse con "Teléfono inválido", mínimo 8 caracteres reales.
- **Observado:** Tanto `/register` como el Paso 1 de onboarding aceptan teléfonos de solo 5 dígitos sin ningún error, y los persisten con el prefijo "+54" pegado adelante, sin separar código de área. Solo se rechaza con 1 dígito.
- **Evidencia:** `auth.users.raw_user_meta_data.phone = "+54 123456"` (6 dígitos, aceptado); mismo caso confirmado en `tenants.phone` del onboarding.
- **Reportado por:** Lote 2 P1 · agente Onboarding (agent-browser) · 2026-08-13

### [BUG] Mensaje de validación en inglés al superar el largo máximo de Nombre — Registro de nuevo admin + Onboarding

- **Severidad:** 🟡 medio
- **Vista:** Registro de nuevo admin + Onboarding (Paso 1) — **URL:** `/register`, `/onboarding`
- **Esperado:** Mensaje en español, consistente con el resto del formulario ("Mínimo 2 caracteres", "Dirección muy corta").
- **Observado:** Al superar 80 (register) o 100 (onboarding) caracteres en Nombre, se muestra el mensaje crudo de Zod en inglés ("Too big: expected string to have <=80/100 characters"), sin traducir — mismo patrón sistémico que el ya reportado en Checkout (P0) y que reaparece en Canchas/Equipo y Caja·Productos más abajo: los `.max()` sin `message` custom no toman el locale es-AR global pese a `installZodLocale()`.
- **Evidencia:** Screenshots con el texto en inglés visible bajo el input, mientras el resto de los campos del mismo formulario muestran error en español.
- **Reportado por:** Lote 2 P1 · agente Onboarding (agent-browser) · 2026-08-13

### [BUG] Overflow horizontal en mobile: el botón "Descartar" del checklist de onboarding queda cortado — Dashboard

- **Severidad:** 🟡 medio
- **Vista:** Dashboard del admin (Hoy) — **URL:** `/dashboard` (viewport 390px)
- **Esperado:** Sin scroll horizontal; controles del header de "Configuración del complejo" completamente dentro del viewport.
- **Observado:** En 390px el documento mide 401px de `scrollWidth` (11px de overflow). El `<button>` "Descartar" (`whitespace-nowrap` dentro de un flex `items-center gap-2` que no wrapea) termina en `right=401px`, sobrepasando el borde del viewport.
- **Evidencia:** `document.documentElement.scrollWidth=401` vs `clientWidth=390`; botón "Descartar" con `right=401`. Screenshot con el botón recortado en el borde de la card.
- **Reportado por:** Lote 2 P1 · agente Dashboard (agent-browser) · 2026-08-13

### [BUG] Deep link con id no-UUID crashea `/reservas/[id]` — Detalle de reserva

- **Severidad:** 🟡 medio
- **Vista:** Detalle de reserva — **URL:** `/reservas/abc`
- **Esperado:** Un id que no es UUID válido debería resolver a 404 ("no encontrado"), igual que un id válido pero inexistente.
- **Observado:** `/reservas/abc` no cae en `notFound()` — crashea con el error boundary genérico ("No pudimos cargar las reservas"). Postgres rechaza el cast de `'abc'` a uuid en la query cruda de `getBookingDetail`, sin try/catch. Misma clase de bug que el ya reportado en P0 para las 3 páginas de desenlace de pago (falta validar UUID antes de la query cruda) — ya señalado como riesgo conocido en el propio checklist, confirmado ahora en vivo con evidencia concreta.
- **Evidencia:** `/reservas/abc` → "No pudimos cargar las reservas... Código de referencia: 209718429"; `/reservas/00000000-0000-0000-0000-000000000000` (UUID válido inexistente) → 404 correcto "No encontramos esto".
- **Reportado por:** Lote 2 P1 · agente Reservas (agent-browser) · 2026-08-13

### [BUG] Invitar a un miembro del equipo lo marca `is_active=true` antes de que acepte la invitación — Configuración: Equipo

- **Severidad:** 🟡 medio
- **Vista:** Configuración: Equipo — **URL:** `/settings/equipo`
- **Esperado:** Checklist vista 28 línea 2221: tras invitar, la tabla muestra al nuevo miembro en estado "Inactivo" (el propio toast de la UI dice "Recibirán un email para activar su cuenta").
- **Observado:** `inviteStaffAction` (`actions.ts:206,211`) inserta/actualiza la fila con `isActive:true` de forma incondicional, antes de que la persona invitada abra el email o setee contraseña. El nuevo miembro aparece de inmediato con badge "Activo" y cuenta para `activeAdminCount` — el `SELECT COUNT(*)` que usa el guard de último-admin (`actions.ts:289-306`) no chequea si esa persona alguna vez inició sesión. Un tenant con un solo admin que invita a un segundo Administrador ve el conteo de "admins activos" subir a 2 al instante aunque el invitado nunca haya entrado.
- **Evidencia:** `SELECT su.email, tsm.is_active, tsm.role FROM tenant_staff_members tsm JOIN staff_users su ...` → `is_active=t` desde el primer instante, sin tocar Inbucket. La UI mostró badge "Activo" con opciones "Cambiar a Administrador"/"Desactivar" (no "Reenviar invitación", que el checklist dice que solo aparece para inactivos).
- **Reportado por:** Lote 2 P1 · agente Settings (agent-browser) · 2026-08-13

### [BUG] Mensaje de validación en inglés al superar el largo máximo — Configuración: Canchas y Equipo

- **Severidad:** 🟡 medio
- **Vista:** Configuración: Canchas y Configuración: Equipo (mismo mecanismo en 2 vistas) — **URL:** `/settings/canchas`, `/settings/equipo`
- **Esperado:** Checklist vista 27 línea 2149 / vista 28 línea 2229: mensaje Zod en español gracias al locale global instalado en `instrumentation.ts`.
- **Observado:** Un nombre de cancha o un nombre/apellido de staff de más de 100 caracteres devuelve el default de Zod en inglés ("Too big: expected string to have <=100 characters"). Reproducido en 2 Server Actions/schemas independientes (Canchas y Equipo) — mismo síntoma sistémico que en Onboarding/Register y Checkout (P0): los campos con `.max()` sin `message` custom no toman el locale es-AR global, mientras los mensajes con override sí salen en español.
- **Evidencia:** Screenshot con "Too big: expected string to have <=100 characters" en `<p role="alert">`, repetido palabra por palabra en ambas vistas. `court.schema.ts:21` (`.max(100)` sin mensaje); `settings/equipo/actions.ts:89-90` (mismo patrón).
- **Reportado por:** Lote 2 P1 · agente Settings (agent-browser) · 2026-08-13

### [BUG] Alta de abonado acepta una fecha de inicio pasada y genera reservas fantasma "jugadas" — Nuevo abonado

- **Severidad:** 🟡 medio
- **Vista:** Nuevo abonado (alta de turno fijo) — **URL:** `/abonados/nuevo`
- **Esperado:** Un turno fijo representa reservas reales a futuro; no debería confirmarse un abonado cuya fecha "Empieza el" ya pasó, o al menos debería advertirse antes de generar reservas `confirmed` retroactivas.
- **Observado:** El DatePicker de "Empieza el" solo restringe por día de la semana, sin `min=hoy`. Un inicio 10 días antes de hoy fue aceptado sin aviso: se generaron 8 reservas `confirmed`, 2 con fecha ya pasada, que el trigger de 24h auto-transicionó a `completed` — un "partido jugado" con `price_snapshot=$5.000` que en realidad nunca ocurrió. Ni pausar ni cancelar el abonado las tocan después (ambas acciones solo borran reservas con `date >= hoy`) — quedan para siempre.
- **Evidencia:** Abonado con `starts_on=2026-08-03`; 2 bookings con fecha pasada, `status` inicial `confirmed` → luego `completed`. El preview mostraba las 8 fechas (incluidas las pasadas) en badge verde "Libre" sin advertencia.
- **Reportado por:** Lote 2 P1 · agente Abonados (agent-browser) · 2026-08-13

### [BUG] El campo Teléfono se vacía al volver del preview tras un error de validación — Nuevo abonado

- **Severidad:** 🟡 medio
- **Vista:** Nuevo abonado (alta de turno fijo) — **URL:** `/abonados/nuevo`
- **Esperado:** Igual que Nombre y Precio, el valor cargado de Teléfono debería conservarse cuando el servidor rechaza el submit por otro motivo (nombre >120 caracteres) y la UI vuelve a `phase:'form'`.
- **Observado:** Al rechazar el submit por nombre largo, Nombre y Precio conservan su valor, pero Teléfono queda completamente vacío. Si el usuario solo corrige el nombre y reintenta sin notar la pérdida, el siguiente submit falla con un segundo error no relacionado ("Teléfono requerido."). Reproducido 2 veces, aislando la variable.
- **Evidencia:** Snapshot post-error: "Nombre y apellido" y "Precio" retenidos, "Teléfono" sin valor (placeholder visible).
- **Reportado por:** Lote 2 P1 · agente Abonados (agent-browser) · 2026-08-13

### [BUG] "Todavía no tenés clientes" es un falso positivo con una página fuera de rango — Personas / Jugadores

- **Severidad:** 🟡 medio
- **Vista:** Personas / Jugadores (listado) — **URL:** `/jugadores?pagina=999`
- **Esperado:** El EmptyState debe aparecer solo cuando el tenant no tiene ningún cliente (`clients.length === 0 && !q`, checklist línea 1921).
- **Observado:** Con `?pagina=999` y sin búsqueda activa, se muestra el mismo EmptyState aunque el tenant sí tiene clientes reales — la condición (`JugadoresView.tsx:107`) solo mira el array de la página actual, no si existen clientes en otras páginas. Además el nav de paginación (línea 251) sigue mostrando "Anteriores" al lado del mismo EmptyState — contradicción visible en pantalla.
- **Evidencia:** `/jugadores?pagina=999` con tenant con 3 clientes reales (verificado en DB) muestra "Todavía no tenés clientes" + link "Compartí tu link..." junto al link "Anteriores" en la misma pantalla.
- **Reportado por:** Lote 2 P1 · agente Personas (agent-browser) · 2026-08-13

### [BUG] `BanPlayerDialog` no resetea motivo/duración al reabrirse tras cancelar — Ficha de jugador

- **Severidad:** 🟡 medio
- **Vista:** Ficha de jugador/contacto — **URL:** `/jugadores/[playerId]`
- **Esperado:** Checklist línea 2020: reabrir el diálogo tras cancelar debe mostrar el form limpio (`reason=""`, `duration="7d"`), no lo tipeado antes de cancelar.
- **Observado:** Reproducido 2 veces: escribir un motivo de 510 caracteres + duración "Permanente", cancelar, y reabrir con el botón "Bloquear jugador" — ninguno de los 2 campos se resetea. Causa: `BanPlayerControls.tsx:78` abre el diálogo con `setBanOpen(true)` directo sobre el estado del padre, sin pasar por el `handleOpenChange` de `BanPlayerDialog` (`BanPlayerDialog.tsx:49-55`) que hace el reset — ese handler solo lo invoca Radix cuando el propio Dialog dispara el cambio (ESC, click afuera, botones internos), nunca cuando `open` cambia de `false` a `true` desde afuera. Contraste: `LinkContactDialog.tsx:90-92` (mismo patrón de diálogo) sí resetea porque su botón disparador llama `reset()` explícitamente antes de abrir.
- **Evidencia:** Tras reabrir, radio "Permanente" `aria-checked=true` y `textarea.value.length===510`. DB confirma que no se creó ninguna fila en `tenant_player_bans` por los intentos cancelados — el bug es puramente de estado de UI.
- **Reportado por:** Lote 2 P1 · agente Personas (agent-browser) · 2026-08-13

### [BUG] `/analiticas` no tiene el guard de rol que su propio comentario promete — Analíticas

- **Severidad:** 🟡 medio
- **Vista:** Analíticas — **URL:** `/analiticas`
- **Esperado:** El comentario de cabecera del archivo (`page.tsx:67-71`) afirma que el acceso lo da `requireOperatorStaff` en el layout admin — igual que `/caja/productos` (`requireCajaContext()` → `requireOperatorStaff()`) o Configuración/Equipo (`requireAdminStaff`).
- **Observado:** Ni `layout.tsx` ni `analiticas/page.tsx` llaman jamás a `requireOperatorStaff()` — solo aparece en el texto del comentario. El único guard real es `extractAuthUser()` + `getStaffTenant()`, que no mira el rol. Hoy el resultado visible es "correcto" (admin y manager entran, ambos habilitados por producto) solo porque `staff_role` tiene exactamente 2 valores y los dos están permitidos — es efecto colateral de que no existe un tercer rol, no una barrera explícita. Verificado: login manager → `/analiticas` → 200, dashboard completo + "Exportar CSV" visible.
- **Evidencia:** Grep de `requireOperatorStaff` en `analiticas/page.tsx` → única ocurrencia es el comentario (línea 67); grep en `layout.tsx` → cero ocurrencias. Contraste: `caja/productos/page.tsx:34` sí lo llama.
- **Reportado por:** Lote 2 P1 · agente Analíticas (agent-browser) · 2026-08-13

### [BUG] Mensaje de validación en inglés al superar el largo máximo de Nota — Caja · Productos

- **Severidad:** 🟡 medio
- **Vista:** Caja · Productos (Reponer / Salida) — **URL:** `/caja/productos`
- **Esperado:** Mensaje default de Zod en español (locale global `installZodLocale()`), igual que el resto del producto.
- **Observado:** El campo Nota (`boundedText(300)` sin `message` custom para el caso `max`) supera 300 caracteres y muestra el default de Zod en inglés ("Too big: expected string to have <=300 characters") en los 2 diálogos que comparten el schema (Reponer y Salida). La validación sí rechaza correctamente el envío (sin fila nueva en `stock_movements`) — el problema es solo de idioma, mismo patrón sistémico ya visto en paralelo por otro agente en Configuración: Canchas — apunta a que el locale de Zod no se aplica de forma consistente en el path de validación de las Server Actions.
- **Evidencia:** Screenshot con el texto en inglés en ambos diálogos; `SELECT ... FROM stock_movements ...` sin fila nueva tras el intento (confirma que solo el copy está mal).
- **Reportado por:** Lote 2 P1 · agente Analíticas (agent-browser) · 2026-08-13

### [BUG] La tab "Próximos" de Mis reservas se define solo por fecha de calendario, no por estado — Mis reservas (jugador)

- **Severidad:** 🟡 medio
- **Vista:** Mis reservas (jugador) — **URL:** `/mis-reservas`
- **Esperado:** Checklist líneas 1307-1309: "Próximos" debe listar reservas futuras/accionables, "Historial" las pasadas con sus badges.
- **Observado:** El corte es puramente `b.date >= today` (`mis-reservas/page.tsx:68-69`), nunca por `status`. Una reserva de HOY ya jugada (`completed`, badge "Jugada") o expirada sin pagarse (`expired`, sin acción disponible) sigue en "Próximos" —mezclada con reservas realmente futuras— hasta que cambia el día calendario completo.
- **Evidencia:** Booking `268654de-...` (hoy 20:00-21:00) con `status=completed` (ya son las 21:32 ART) seguía listado en "Próximos" junto a una reserva confirmada de mañana; 4 bookings "Expirado" ocupando permanentemente la tab principal.
- **Reportado por:** Lote 2 P1 · agente Jugador (agent-browser) · 2026-08-13

### [BUG] Slug inexistente devuelve HTTP 200 en vez de 404 — Perfil público del complejo

- **Severidad:** 🟡 medio
- **Vista:** Perfil público del complejo — **URL:** `/e2e-slug-que-no-existe-123`
- **Esperado:** Checklist línea 1146: slug inexistente → `notFound()` → 404. El contenido visual ("Complejo no encontrado", `noindex`) ya es correcto.
- **Observado:** Soft-404 — el status HTTP real es 200 OK para cualquier slug inexistente (3 slugs random nunca visitados). La página usa ISR (`revalidate=300`) con `dynamicParams=true`; el fallback de `notFound()` se sirve con `x-nextjs-cache: HIT`/`x-nextjs-prerender: 1` incluso para un slug jamás solicitado, sugiriendo que Next cachea una respuesta compartida "no encontrado" con status 200.
- **Evidencia:** `curl -D -` → `HTTP/1.1 200 OK` + `x-nextjs-cache: HIT`; repetido con un slug nunca usado, mismo resultado. Control negativo: `/api/this-does-not-exist` sí da 404 real.
- **Reportado por:** Lote 2 P1 · agente Público (agent-browser) · 2026-08-13

### [BUG] Mismo soft-404 (200 en vez de 404) en Disponibilidad semanal — Disponibilidad semanal

- **Severidad:** 🟡 medio
- **Vista:** Disponibilidad semanal — **URL:** `/{slug-inexistente}/disponibilidad`
- **Esperado:** Checklist línea 1255: `notFound()` en un slug inexistente. La ruta es `force-dynamic` (sin ISR), a diferencia de la vista 14.
- **Observado:** Igual que en el Perfil público, el status es 200 OK pese a contenido correcto ("Complejo no encontrado"). Al ser `force-dynamic` (sin caché ISR de por medio), descarta que el bug de la otra vista sea solo un artefacto de caché — apunta a un comportamiento de `notFound()` en segmentos dinámicos `[slug]` en este entorno (Next.js 16/Turbopack).
- **Evidencia:** `curl -D -` → `HTTP/1.1 200 OK`, body con "Complejo no encontrado"/"Volver al inicio" (contenido correcto, status incorrecto).
- **Reportado por:** Lote 2 P1 · agente Público (agent-browser) · 2026-08-13

### [BUG] La tabla de Goleadores oculta el aviso de "goles sin autor" cuando todavía no hay ningún goleador cargado — Torneos: posiciones

- **Severidad:** 🟡 medio
- **Vista:** Torneos: inscripciones + posiciones/goleadores — **URL:** `/torneos/[id]/posiciones`
- **Esperado:** Checklist línea 2657 y comentario propio del código ("el faltante se avisa, no se bloquea"): el aviso "Faltan N gol(es) sin autor" debe mostrarse siempre que `unattributedGoals > 0`, independientemente de si ya hay algún goleador atribuido.
- **Observado:** `GoleadoresTable.tsx` retorna el EmptyState genérico apenas `scorers.rows.length === 0` (líneas 12-19), ANTES de evaluar `unattributedGoals` (que solo se chequea en el footer de la tabla real, líneas 65-70 — código inalcanzable si `rows.length` es 0). Con 4 partidos jugados y 2 goles cargados sin autor, `unattributedGoals=5` pero la página solo muestra "Todavía no hay goleadores", sin ninguna mención al faltante.
- **Evidencia:** `SELECT type,team_player_id FROM tournament_match_events` → 2 filas `type='goal'` con `team_player_id NULL`; 4 partidos con marcador cargado; UI muestra solo el EmptyState genérico.
- **Reportado por:** Lote 2 P1 · agente Torneos (agent-browser) · 2026-08-13

### [BUG] El bloque de deuda muestra un ícono de teléfono sin número ni link cuando el contacto no tiene teléfono — Detalle de reserva

- **Severidad:** 🟢 bajo
- **Vista:** Detalle de reserva (`CompleteBookingDialog`, bloque de deuda) — **URL:** `/reservas/[id]`
- **Esperado:** La línea "📞 {nombre} — {teléfono}" con link de WhatsApp solo debería aparecer si hay `contactName` Y teléfono — ambas condiciones necesarias.
- **Observado:** Con `guest_name` presente pero `guest_phone` NULL, el bloque igual renderiza "📞 {nombre}" sin número ni link de WhatsApp — un elemento visual sin destino ni acción, no la ausencia total de la línea.
- **Evidencia:** `guest_name='QA Complete Flow Test'`, `guest_phone=''`; snapshot de accesibilidad sin ningún link "WhatsApp" en el árbol.
- **Reportado por:** Lote 2 P1 · agente Reservas (agent-browser) · 2026-08-13

### [MEJORA-UX] El input "Otro" del porcentaje de seña no se sincroniza con el chip preset activo — Configuración: Políticas de reserva

- **Severidad:** 🟡 medio
- **Vista:** Configuración: Políticas de reserva — **URL:** `/settings/reservas`
- **Observado:** Al pasar de un chip preset (ej. 50%, el valor real guardado) al botón "Otro", el input debería precargarse con el valor activo (50). En cambio siempre muestra un valor de estado local independiente (30 por defecto, o lo último tipeado en esa instancia del componente) — reproducido 3 veces cruzando contra DB. Con `deposit_percentage=50` guardado y el chip "50%" visualmente activo, click en "Otro" muestra "30". Es un campo que afecta cobros de seña reales: un admin que parte de 50%, quiere pasar a un valor cercano, hace click en "Otro", ve "30" por descuido y guarda, reduce silenciosamente la seña de 50% a 30% sin ningún aviso.
- **Evidencia:** `deposit_percentage=50` en DB con chip "50%" activo → click en "Otro" → input muestra "30" (screenshots `reservas-04-otro-click.png`, `reservas-18-otrofrom50.png`).
- **Ancla:** Heurística de Nielsen #5 (prevención de errores) — el campo cambia silenciosamente a un valor no relacionado con el real, en un setting que afecta plata (seña).
- **Reportado por:** Lote 2 P1 · agente Settings (agent-browser) · 2026-08-13

### [MEJORA-UX] En mobile, el nombre de un contacto sin cuenta se trunca de forma ilegible por el badge y el botón "Vincular" — Personas / Jugadores

- **Severidad:** 🟡 medio
- **Vista:** Personas / Jugadores (listado, mobile 390px) — **URL:** `/jugadores`
- **Observado:** En mobile, las filas `kind:'contact'` truncan el nombre de forma agresiva ("Cliente QA Test" → "Cliente Q..."). El badge "Sin cuenta" y el botón "Vincular" son `shrink-0` y compiten por el ancho con el `<span className="truncate">` del nombre, mientras las filas `kind:'player'` (sin badge/botón ahí) muestran el nombre completo en el mismo ancho. El `<span>` no tiene `title` de respaldo, y los contactos no tienen ficha propia donde ver el nombre completo — la única forma es abrir "Vincular".
- **Evidencia:** Screenshot con "e2e-player-b" completo junto a "Cliente Q..." truncado + badge "Sin cuenta" + botón "Vincular"; HTML sin atributo `title`.
- **Ancla:** Heurística de Nielsen #6 (reconocer antes que recordar) — la vista existe explícitamente para distinguir personas con nombres parecidos, y en mobile un contacto sin cuenta queda irreconocible (9 caracteres visibles) sin ninguna vía de acceso al nombre completo.
- **Reportado por:** Lote 2 P1 · agente Personas (agent-browser) · 2026-08-13

### [MEJORA-UX] En mobile, un badge de estado largo trunca el nombre de cancha/complejo hasta volverlo irreconocible — Mis reservas (jugador)

- **Severidad:** 🟡 medio
- **Vista:** Mis reservas (jugador, mobile 375px) — **URL:** `/mis-reservas`
- **Observado:** El badge de estado (`shrink-0 whitespace-nowrap`, `MisReservasView.tsx:263`) nunca cede espacio, mientras el nombre solo tiene `truncate` en un contenedor `flex-1 min-w-0` (líneas 250-257). Con el badge "Cancelado (sin reembolso)" visible, "Cancha E2E 3" se corta a "Can..." y "E2E Complejo Demo" a "E2E (" — perdiendo toda la información identificatoria — mientras tarjetas con badges cortos ("Expirado", "Jugada") muestran el nombre completo.
- **Evidencia:** Screenshot con "Can..." y "E2E (" junto al badge "Cancelado (sin reembolso)", comparado con nombres completos junto a badges cortos en la misma captura.
- **Ancla:** Heurística de Nielsen #6 (reconocer antes que recordar); checklist línea 1348 pide validar 375px explícitamente.
- **Reportado por:** Lote 2 P1 · agente Jugador (agent-browser) · 2026-08-13

### [MEJORA-UX] Gate de "el turno todavía no terminó" no se anticipa en 2 de 3 botones de acción — Detalle de reserva

- **Severidad:** 🟢 bajo
- **Vista:** Detalle de reserva — **URL:** `/reservas/[id]`
- **Observado:** Con un turno que todavía no terminó, "Marcar completada" y "Marcar ausente" abren su diálogo completo sin ningún aviso previo, y solo al confirmar el servidor devuelve "El turno todavía no terminó...". "Cancelar", en cambio, sí usa el estado `turnoEnded` del lado cliente para adaptar su propio preview. La inconsistencia entre los 3 botones de la misma vista (2 sin gate cliente, 1 con gate parcial) genera una experiencia irregular.
- **Evidencia:** Reproducido en vivo sobre un turno de 22:00-23:00 con hora actual ~21:35 ART: "Marcar completada" abrió el diálogo con normalidad, error recién al confirmar; mismo patrón en "Marcar ausente".
- **Ancla:** Heurística de Nielsen #5 (prevención de errores) — mejor impedir una acción imposible de antemano que dejar completar todo el flujo para recién ahí mostrar el error.
- **Reportado por:** Lote 2 P1 · agente Reservas (agent-browser) · 2026-08-13

### [MEJORA-UX] El header muestra brevemente el estado anónimo (Ingresar / Para complejos) en una ruta exclusiva de jugador autenticado — Mis reservas (jugador)

- **Severidad:** 🟢 bajo
- **Vista:** Mis reservas (jugador) — **URL:** `/mis-reservas`
- **Observado:** `PortalHeader.tsx` sirve siempre el HTML server-rendered en estado anónimo (para habilitar ISR en otras páginas) y recién reemplaza el chip de cuenta tras montar `PortalSessionProvider` client-side. En varias cargas, el header mostró "Explorar | Para complejos | Ingresar" por ~1-1.5s antes de pasar a "Explorar | Mis reservas | [avatar]", mientras el contenido privado ya estaba renderizado.
- **Evidencia:** Screenshots con ~1.5s de diferencia mostrando primero el header anónimo con el contenido privado ya visible, luego el header correcto.
- **Ancla:** Heurística de Nielsen #1 (visibilidad del estado del sistema) + regla del dueño "portal jugador: cero fricción, tipo ecommerce" (CLAUDE.md).
- **Reportado por:** Lote 2 P1 · agente Jugador (agent-browser) · 2026-08-13

### [MEJORA-UX] El botón "Elegir fecha" de la grilla pública no incluye la fecha visible en su nombre accesible — Perfil público del complejo

- **Severidad:** 🟢 bajo
- **Vista:** Perfil público del complejo — **URL:** `/e2e-complejo-demo`
- **Observado:** El botón que abre el selector de fecha (ícono calendario + fecha actual, ej. "Jueves, 13 de agosto") tiene `aria-label="Elegir fecha"` que reemplaza por completo el nombre accesible — un usuario de lector de pantalla no se entera de qué fecha está seleccionada, y un usuario de control por voz no puede decir "click Jueves 13 de agosto" para activarlo.
- **Evidencia:** `AvailabilityGrid.tsx:322-331` — `<button aria-label="Elegir fecha">...<span>{formatDateES(date)}</span></button>`; confirmado en el DOM real.
- **Ancla:** WCAG 2.5.3 Label in Name.
- **Reportado por:** Lote 2 P1 · agente Público (agent-browser) · 2026-08-13

### [MEJORA-UX] "Crear el primero" queda visible para el manager pero lleva a un dead-end silencioso — Torneos (listado + creación)

- **Severidad:** 🟢 bajo
- **Vista:** Torneos: listado + creación — **URL:** `/torneos`
- **Observado:** Logueado como manager con el tenant en 0 torneos, el EmptyState muestra "Crear el primero" habilitado y sin ninguna marca de restricción — a diferencia del botón "Nuevo torneo" del header, que sí está condicionado por `role==='admin'`. Al hacer click, el manager es redirigido en silencio de vuelta a `/torneos`, sin toast ni mensaje — no tiene forma de saber por qué el formulario desapareció. El propio módulo Torneos ya usa el patrón "candado, no desaparición" en otro lugar (`CorteZonasCard` en Posiciones, ícono Lock + tooltip "Solo el dueño puede...").
- **Evidencia:** Sesión manager con tenant en 0 torneos: snapshot con "Crear el primero" sin `disabled`; click → `GET /torneos/nuevo` → redirect server-side (`if (role !== 'admin') redirect('/torneos')`) sin mensaje visible.
- **Ancla:** Heurísticas de Nielsen #5 (prevención de errores) y #1 (visibilidad del estado del sistema).
- **Reportado por:** Lote 2 P1 · agente Torneos (agent-browser) · 2026-08-13

## 🟡 P2

### [BUG] El banner de notificaciones tapa el botón "Guardar" en viewports bajos y el click se pierde sin feedback — Configuración: Avisos

- **Severidad:** 🔴 crítico
- **Vista:** Configuración: Avisos — **URL:** `/settings/avisos` (viewport de altura ≤~620px, ej. laptop sin maximizar)
- **Esperado:** Un click real sobre "Guardar" debe ejecutar el submit y persistir el toggle de resumen diario — es la única función de la pantalla.
- **Observado:** En viewports de altura baja (Avisos es el form más corto de `/settings`, "Guardar" queda cerca del borde superior de la card), el banner fijo `PushNotificationManager` (mismo componente ya reportado en P0/P1 tapando navegación) se superpone exactamente sobre el botón. `elementFromPoint` sobre el centro del botón devuelve el `<p>` del banner, no el `<button>`. Confirmado con un click real (mousedown+mouseup, no sintético): el toggle seleccionado justo antes NO se persiste en DB, y no aparece ningún mensaje de error ni de éxito — el click se pierde en silencio. A viewports más altos (1920×1080) el mismo botón sí recibe el click. Es la manifestación más grave hasta ahora del mismo overlay ya reportado en P0/P1: acá no solo tapa un link de navegación, bloquea la única acción de la pantalla sin avisar.
- **Evidencia:** Rect de "Guardar" en 1366×620 → `elementFromPoint` devuelve el `<p>` del banner, no el botón; click real en esas coordenadas seguido de `SELECT settings->'daily_summary_email_opt_in' FROM tenants` → sin cambios pese al toggle previo. Control negativo en 1920×1080 y 1366×700: sin oclusión, el click sí llega.
- **Reportado por:** Lote 3 P2 · agente Config: Avisos (agent-browser) · 2026-08-14

### [BUG] Mensaje de validación en inglés al superar el largo máximo o no alcanzar el mínimo — Perfil del jugador

- **Severidad:** 🟡 medio
- **Vista:** Perfil del jugador (tab Datos) — **URL:** `/perfil`
- **Esperado:** Mensaje en español, igual que el resto del formulario ("Nombre requerido"/"Apellido requerido", que sí tienen mensaje custom).
- **Observado:** `profileSchema` (`src/app/(player)/perfil/actions.ts:12-17`) define `.max()`/`.min(6)` en first_name/last_name/phone/preferred_area SIN mensaje custom — Zod cae al default en inglés. Confirmado en vivo: nombre de 101 caracteres → "Too big: expected string to have <=100 characters"; teléfono de 5 caracteres (bajo el min de 6) → "Too small: expected string to have >=6 characters" en la respuesta de la Server Action. Mismo patrón sistémico ya visto en Onboarding/Register, Canchas/Equipo y Caja·Productos (P1) — ahora confirmado también en el perfil del jugador.
- **Evidencia:** Screenshot con el error en inglés bajo "Guardar cambios"; response de red con `{"success":false,"error":"Too small: expected string to have >=6 characters"}`.
- **Reportado por:** Lote 3 P2 · agente Jugador Perfil+Configuración (agent-browser) · 2026-08-14

### [BUG] Un apellido de solo espacios pasa la validación y deja el perfil roto — Perfil del jugador

- **Severidad:** 🟡 medio
- **Vista:** Perfil del jugador (tab Datos) — **URL:** `/perfil`
- **Esperado:** Checklist línea 2842 (mismo criterio que Nombre, línea 2841): apellido de solo espacios debe rechazarse con "Apellido requerido".
- **Observado:** `last_name: z.string().min(1, 'Apellido requerido').max(100)` no aplica `.trim()` antes del `min(1)` — una cadena de 5 espacios (`length=5`) pasa la validación y se persiste tal cual. La UI responde "Perfil actualizado" sin ningún error, pero el apellido queda efectivamente vacío/invisible: el avatar de iniciales pasa de "EP" a solo "E" y el nombre del header queda sin apellido visible.
- **Evidencia:** `SELECT last_name, length(last_name), encode(last_name::bytea,'hex') FROM players ...` → `length=5`, `hex=2020202020` (5 espacios puros, no NULL). Screenshot con el avatar roto tras el submit "exitoso".
- **Reportado por:** Lote 3 P2 · agente Jugador Perfil+Configuración (agent-browser) · 2026-08-14

### [BUG] Un offset de paginación fuera de rango muestra "no encontramos complejos" aunque sí existan — Explorar complejos

- **Severidad:** 🟡 medio
- **Vista:** Explorar complejos — **URL:** `/explorar?offset=12`
- **Esperado:** El mensaje de la página debe ser consistente con el contador del toolbar — o no debería poder llegarse a un estado donde el header dice "N complejos" y el cuerpo dice que no hay ninguno.
- **Observado:** El toolbar sigue mostrando el total real e inafectado por el offset ("6 complejos"), mientras el body renderiza el `EmptyResults` genérico y estático ("Probá ajustando tu búsqueda") — `EmptyResults` nunca recibe `total`, así que no puede distinguir "0 matches reales" de "matches existen pero esta página no tiene". Mismo patrón de clase que el ya reportado en Personas/Jugadores (P1, `?pagina=999`): un EmptyState condicionado solo al array de la página actual, no al total real. Puede ocurrir con un link de "Ver más" desactualizado tras bajar el total, o con URL tamperizada.
- **Evidencia:** `/explorar?offset=12` sin filtros → header con 6 complejos, body con "No encontramos complejos con los filtros seleccionados"; reproducido igual con `offset=999999`. DB confirma 6 tenants `active`/`trialing` reales.
- **Reportado por:** Lote 3 P2 · agente Explorar complejos (agent-browser) · 2026-08-14

### [BUG] El skip link "Saltar al contenido" no tiene destino en la home pública — Home landing pública

- **Severidad:** 🟡 medio
- **Vista:** Home landing pública — **URL:** `/`
- **Esperado:** Activar el skip link (primer elemento focuseable, WCAG 2.4.1 Bypass Blocks) debe mover el foco al contenido principal, saltando la navegación — función explícita del componente, que sí funciona en el resto de layouts del sitio (auth, business, admin, portal jugador).
- **Observado:** En `/` no existe ningún elemento con `id="main-content"` en todo el árbol — `page.tsx` (home pública) no está envuelto por ninguno de los layouts que sí lo definen. Al enfocar el skip link y presionar Enter, el foco no se mueve, `window.scrollY` sigue en 0 y `location.hash` cambia sin ningún efecto visible. Es la página de mayor tráfico del sitio.
- **Evidencia:** `!!document.getElementById('main-content')` → `false` en `/`; tras Tab+Enter sobre el skip link, `document.activeElement` sigue siendo el propio `<a>`, confirmado en 2 pasadas independientes.
- **Reportado por:** Lote 3 P2 · agente Home landing pública (agent-browser) · 2026-08-14

### [BUG] Título duplicado en la pestaña del navegador de "Complejo suspendido" — Complejo suspendido

- **Severidad:** 🟡 medio
- **Vista:** Complejo suspendido — **URL:** `/suspended`
- **Esperado:** Checklist línea 3280: title de la pestaña debe ser "Cuenta suspendida — TurnoGol", tal como lo fija `suspended/page.tsx:6`.
- **Observado:** El título final queda duplicado: "Cuenta suspendida — TurnoGol · TurnoGol". El layout raíz define un template (`'%s · ' + SITE_NAME`) que vuelve a concatenar "· TurnoGol" sobre un string que la página ya trae con "— TurnoGol" incluido. El mismo patrón se repite en `/reactivar` ("Reactivar cuenta — TurnoGol" → también duplicado), mientras el resto de páginas públicas sigue la convención correcta (título corto sin sufijo). Se propaga también a `og:title`.
- **Evidencia:** `document.title === 'Cuenta suspendida — TurnoGol · TurnoGol'` (eval en vivo). `tests/unit/suspended-route.test.ts` existe pero solo verifica `metadata.robots`, no `metadata.title` — por eso no lo atrapó CI.
- **Reportado por:** Lote 3 P2 · agente Complejo suspendido (agent-browser) · 2026-08-14

### [BUG] El botón FECHA del buscador se trunca en viewports de tablet — Home landing pública

- **Severidad:** 🟢 bajo
- **Vista:** Home landing pública (viewport 640-1023px) — **URL:** `/`
- **Esperado:** El valor de fecha seleccionado debe mostrarse completo, sin truncar, en cualquier ancho — el propio comentario de diseño del componente (`date-picker.tsx:136-138`) documenta el padding calibrado para eso.
- **Observado:** Con una fecha seleccionada, el botón FECHA muestra "14/08/20…" truncado en todo el rango 640-1023px. El padding `pr-8` fue calibrado solo contra el placeholder sin el botón "Limpiar fecha" (que aparece una vez hay valor) — con ambos elementos compitiendo por el mismo extremo, el padding ya no alcanza. A 375px y a 1280px el mismo valor entra completo.
- **Evidencia:** En 768px, `span.truncate` con `{offsetWidth:85, scrollWidth:88, isTruncated:true}`; barrido 640-1023px siempre truncado; 375px y 1280px sin truncar.
- **Reportado por:** Lote 3 P2 · agente Home landing pública (agent-browser) · 2026-08-14

### [MEJORA-UX] Dos mecanismos de error visualmente distintos conviven en el mismo formulario de Perfil — Perfil del jugador

- **Severidad:** 🟢 bajo
- **Vista:** Perfil del jugador (tab Datos) — **URL:** `/perfil`
- **Observado:** Nombre/Apellido vacíos disparan la validación nativa del navegador (atributo HTML `required`, tooltip nativo, ej. "Completa este campo") y nunca llegan al servidor. El resto de las validaciones del mismo form (longitud máxima, teléfono corto) usa un párrafo rojo custom con `role="alert"` debajo del botón "Guardar cambios". Dos mecanismos de error visualmente distintos conviven en el mismo formulario para errores de la misma naturaleza (campo inválido al submit).
- **Evidencia:** Eval tras limpiar `#first_name` y hacer submit: `{firstNameValid: false, firstNameValidity: "Completa este campo"}` (tooltip nativo, sin request al server) vs. el error Zod custom en pantalla para el caso de longitud.
- **Ancla:** Heurística de Nielsen #4 (consistencia y estándares) — elementos y acciones equivalentes deben tener la misma apariencia y comportamiento.
- **Reportado por:** Lote 3 P2 · agente Jugador Perfil+Configuración (agent-browser) · 2026-08-14

### [MEJORA-UX] Los toggles "Recibir por email"/"Solo push" no exponen su estado a tecnología asistiva — Configuración: Avisos

- **Severidad:** 🟡 medio
- **Vista:** Configuración: Avisos — **URL:** `/settings/avisos`
- **Observado:** Los dos botones (selección mutuamente excluyente, mismo patrón que un radio group) son `<button type="button">` cuya única señal de estado es color/borde, sin `aria-pressed` ni `role`. Confirmado en runtime: `aria-pressed` → `null`, `role` del fieldset → `null`. Un usuario de lector de pantalla escucha dos botones sueltos sin forma de saber cuál está activo.
- **Evidencia:** `AvisosForm.tsx:36-57` sin `aria-pressed`/`role` en ninguno de los dos botones; confirmado en runtime con eval sobre el botón ya montado.
- **Ancla:** Criterio de accesibilidad básico — estado de selección no expuesto vía ARIA (`aria-pressed`/`role="radiogroup"`).
- **Reportado por:** Lote 3 P2 · agente Config: Avisos (agent-browser) · 2026-08-14

### [MEJORA-UX] Los links secundarios de "Complejo suspendido" no cumplen el tap target mínimo — Complejo suspendido

- **Severidad:** 🟢 bajo
- **Vista:** Complejo suspendido (mobile 375px) — **URL:** `/suspended`
- **Observado:** "Contactar a soporte" y "Volver al inicio" miden 20px de alto cada uno, con solo 8px de espacio libre entre sí — ambos valores por debajo del mínimo de WCAG 2.5.8 (≥24px o ≥24px de espaciado). El CTA primario de la misma vista sí mide 44px. En un dedo real hay riesgo de tocar el link equivocado.
- **Evidencia:** `getBoundingClientRect()` en 375×667 → ambos links `height=20px`, gap vertical 8px.
- **Ancla:** WCAG 2.2 SC 2.5.8 Target Size (Minimum, nivel AA).
- **Reportado por:** Lote 3 P2 · agente Complejo suspendido (agent-browser) · 2026-08-14

### [MEJORA-UX] La tira de tabs de Configuración no hace scroll automático al tab activo en mobile — Configuración: Avisos

- **Severidad:** 🟢 bajo
- **Vista:** Configuración: Avisos (mobile 375px) — **URL:** `/settings/avisos`
- **Observado:** `ScrollTabs` no tiene lógica de `scrollIntoView` para el tab activo al montar. Al abrir `/settings/avisos` directo en 375px, la tira de tabs queda con `scrollLeft:0` y el tab "Avisos" (7mo y último, con `aria-current="page"`) queda fuera del viewport visible — en pantalla solo se ven los primeros 4 tabs, ninguno resaltado. El h2 de la card sí confirma la ubicación a un usuario vidente, pero la tira de tabs por sí sola no la comunica.
- **Evidencia:** Eval en 375×812 → `{navScrollLeft:0, navScrollWidth:630, navClientWidth:343, avisosVisible:false, avisosAriaCurrent:"page"}`.
- **Ancla:** Heurística de Nielsen #1 (visibilidad del estado del sistema).
- **Reportado por:** Lote 3 P2 · agente Config: Avisos (agent-browser) · 2026-08-14

## 🟢 P3

### [BUG] Cualquier slug de 1 segmento inexistente (incluidas rutas legacy /privacy y /terms) devuelve HTTP 200 en vez de 404 — Para complejos (marketing)

- **Severidad:** 🟡 medio
- **Vista:** Catch-all público `[slug]` — **URL:** `/para-complejoss`, `/privacy`, `/terms` (y cualquier slug de 1 segmento inexistente)
- **Esperado:** Checklist línea 3481: un typo de ruta debe redirigir a 404 o mostrar la página not-found de Next con status real.
- **Observado:** La ruta cae en el catch-all `[slug]/page.tsx`, que la interpreta como slug de tenant, no la encuentra y llama `notFound()` — pero gracias al ISR (`revalidate=300`) la respuesta HTTP real es 200 OK, no 404 (soft-404, mismo mecanismo ya reportado en P1 para Perfil público/Disponibilidad). Reproducido además en las rutas legacy en inglés `/privacy` y `/terms` (las que el propio checklist usa para las vistas 43/44): en vez de redirigir a `/privacidad`/`/terminos` o dar 404 real, muestran "Complejo no encontrado" con status 200 — cualquier link viejo o bookmark queda huérfano con una respuesta de éxito.
- **Evidencia:** `curl -i /para-complejoss` → `200 OK` + `x-nextjs-cache: HIT`; `curl -o /dev/null -w '%{http_code}' /privacy` → `200`; control negativo `/para-complejos/foo/bar` (2 segmentos, no matchea `[slug]`) → 404 real.
- **Reportado por:** Lote 3 P3 · agente Para complejos+Privacidad+Términos (agent-browser) · 2026-08-14

### [BUG] La Política de Privacidad describe una "cookie de PIN gate" que no existe en el código — Privacidad

- **Severidad:** 🟡 medio
- **Vista:** Privacidad — **URL:** `/privacidad`
- **Esperado:** El texto legal (Ley 25.326) debe describir con precisión los mecanismos reales de la plataforma — consistente con CLAUDE.md ("Sin sistema de PIN") y con el propio código.
- **Observado:** La sección 7 ("Cookies y seguridad") afirma "...la cookie de PIN gate para zonas sensibles del panel del complejo" — esa cookie no existe: el sistema de PIN fue eliminado con el modelo de 2 roles staff, y el acceso a zonas sensibles lo resuelve `requireOperatorStaff`/`requireAdminStaff` vía rol leído de `tenant_staff_members`, sin cookie.
- **Evidencia:** `privacidad/page.tsx:222-224` con el texto citado; grep de `tg_pin|pin_hash|pinHash|PIN_COOKIE` sobre `src/` → 0 resultados; comentario explícito en `analiticas/page.tsx:67-71` confirmando que "PinGate no existe en el repo".
- **Reportado por:** Lote 3 P3 · agente Para complejos+Privacidad+Términos (agent-browser) · 2026-08-14

### [BUG] El botón "Pagar (aprobado)" del mock de MercadoPago no cumple contraste AA en modo oscuro — Mock MercadoPago

- **Severidad:** 🟡 medio
- **Vista:** Mock MercadoPago (solo testing) — **URL:** `/mock-mp/checkout`
- **Esperado:** El design system garantiza AA para `bg-primary` + `text-primary-foreground` (7.9:1, MASTER §2.4) — el mismo botón en light mode sí resuelve el par correcto.
- **Observado:** `MockCheckoutView.tsx:88-94` fija `text-white` a mano en vez de `text-primary-foreground`. Como la página no fuerza un tema, en dark-mode (default del sistema) el botón renderiza blanco sobre emerald-500: contraste medido 2.59:1, bajo el 4.5:1 de AA. Forzando light mode el mismo botón da 5.56:1 (AA ok) — la falla es específica del branch dark.
- **Evidencia:** Medido en vivo con fórmula de luminancia relativa WCAG sobre el DOM real: dark → ratio 2.59; light forzado → ratio 5.56. `globals.css:360-361` documenta el par correcto para 7.9:1.
- **Reportado por:** Lote 3 P3 · agente Mock MercadoPago+Settings redirect (agent-browser) · 2026-08-14

### [BUG] Falta focus-visible ring en el botón más destructivo de la vista — Eliminar cuenta (jugador)

- **Severidad:** 🟢 bajo
- **Vista:** Eliminar cuenta (jugador) — **URL:** `/eliminar-cuenta`
- **Esperado:** Checklist línea 3149 y MASTER.md:544/588: todos los botones/inputs deben tener `focus-visible:ring-2`. El resto de los elementos interactivos de esta misma vista (botón de cuenta del header, los 2 botones del ConfirmDialog) sí lo cumplen.
- **Observado:** El botón disparador "Eliminar mi cuenta" (`DeleteAccountForm.tsx:33`) no tiene ninguna clase `focus-visible` — al enfocarlo con Tab real solo aparece el outline nativo del navegador, sin el ring esmeralda con offset que usa el resto del sistema de diseño en la misma vista. Es precisamente el botón más destructivo el que rompe el patrón de foco del resto de la página.
- **Evidencia:** `className` real del botón sin clases `focus-visible`; comparado con el botón de cuenta del header (`focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2`) y con `confirm-dialog.tsx:126,134`. Screenshot con outline nativo delgado tras Tab-focus.
- **Reportado por:** Lote 3 P3 · agente Eliminar cuenta (agent-browser) · 2026-08-14

### [BUG] El fondo de página del mock de MercadoPago sigue el tema del sistema, contradiciendo el propio comentario del código — Mock MercadoPago

- **Severidad:** 🟢 bajo
- **Vista:** Mock MercadoPago (solo testing) — **URL:** `/mock-mp/checkout`
- **Esperado:** Comentario propio del componente (`MockCheckoutView.tsx:22-27`): la vista NO debe usar los tokens de tema del resto de la app — debe reproducir el look real del checkout de MercadoPago, siempre claro, "deliberado, no un descuido de theming".
- **Observado:** El contenedor raíz de la vista no fija fondo propio, así que hereda `body { @apply bg-background }`, que sí sigue el tema del sistema. En dark-mode el fondo de la página completa se renderiza casi negro detrás de la tarjeta blanca fija — exactamente lo opuesto a lo que promete el comentario. La tarjeta en sí está bien fijada; solo el fondo de página quedó afuera de esa protección.
- **Evidencia:** `getComputedStyle(document.body).backgroundColor` → `rgb(3,7,17)` con tema del sistema en dark, vs `rgb(226,231,238)` forzando light.
- **Reportado por:** Lote 3 P3 · agente Mock MercadoPago+Settings redirect (agent-browser) · 2026-08-14

### [MEJORA-UX] El footer de las páginas de marketing (Para complejos) no tiene el fix de tap target de 44px que su componente hermano sí tiene — Para complejos (marketing)

- **Severidad:** 🟡 medio
- **Vista:** Para complejos (marketing) — **URL:** `/para-complejos`
- **Observado:** `SiteFooter.tsx` (usado en /privacidad y /terminos) trae un fix explícito y comentado para WCAG 2.5.5 (min-height 44px, "medían 16px de alto y eran difíciles de acertar con el pulgar"), verificado en vivo. `BusinessFooter.tsx` (usado en /para-complejos, /precios, /blog) no tiene ese mismo fix: en mobile, los 6 links del footer miden 16px de alto — el mismo problema ya identificado y corregido en el componente hermano, sin resolver acá.
- **Evidencia:** `getBoundingClientRect().height` de los links del footer en 375px → 16px en /para-complejos vs 44px en /terminos (mismo viewport).
- **Ancla:** WCAG 2.5.5 (tap target ≥44px) — el propio repo ya adoptó este estándar en el componente hermano.
- **Reportado por:** Lote 3 P3 · agente Para complejos+Privacidad+Términos (agent-browser) · 2026-08-14

### [MEJORA-UX] El header de marketing oculta toda la navegación en mobile sin un menú alternativo — Para complejos (marketing)

- **Severidad:** 🟢 bajo
- **Vista:** Para complejos (marketing, mobile <640px) — **URL:** `/para-complejos`
- **Observado:** `BusinessHeader.tsx` oculta por completo los links "Funciones", "Precios", "Blog" e "Ingresar" en mobile (clase `hidden ... sm:inline-flex`, sin ningún control de menú alternativo) — solo quedan visibles el logo y "Empezar gratis". Esos links solo son alcanzables scrolleando hasta el footer, que los repite.
- **Evidencia:** Screenshot mobile 375×812 con el header mostrando únicamente "TURNOGOL" + "Empezar gratis"; `BusinessHeader.tsx:37-58` sin botón/ícono de menú mobile.
- **Ancla:** Heurística de Nielsen #6 (reconocer antes que recordar).
- **Reportado por:** Lote 3 P3 · agente Para complejos+Privacidad+Términos (agent-browser) · 2026-08-14

## Transversales (auth, permisos, a11y, responsive, performance)

_(sin hallazgos todavía)_
