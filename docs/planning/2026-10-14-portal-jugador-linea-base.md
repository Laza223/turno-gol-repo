# Línea base del portal del jugador: cuánto cuesta reservar hoy

**Fecha:** 2026-10-14 · **Código medido:** `origin/main` `ece4ef34` · **Para:** el criterio de éxito de F3 en [`docs/decisions/2026-10-14-foco-jugador-rival.md`](../decisions/2026-10-14-foco-jugador-rival.md) ("un jugador nuevo reserva en su complejo desde el link que le pasó el complejo con menos toques que hoy, y cada error dice qué pasó y qué hacer").
**Método:** lectura de código. No se corrió la app ni se leyó producción. Lo que depende de datos o de pantallas de terceros va como [NO DETERMINADO] (ND).

## Cómo se compara el "después"

Para que la medición se pueda repetir, el "después" usa las mismas reglas:

- **Métrica principal:** toques + campos dentro de turnogol.app, recorridos A (jugador nuevo con Google) y B (jugador nuevo con email), complejo sin seña, turno de hoy, una cancha, sin opcionales. Los saltos (Google, mail, MercadoPago) se reportan aparte y no se suman.
- "Continuar con mi reserva" de `/verify` cuenta como toque (peor caso: el jugador no espera los 5 s).
- El "después" se mide con el mismo método (código) y además con la app corriendo.
- Errores: el inventario de §4 se vuelve a pasar con el mismo criterio (a: dice qué pasó, b: dice qué hacer).

Si el dueño prefiere otro criterio, se cambia antes del primer PR del rediseño, no después.

## Resumen

| Recorrido | Sin seña: pantallas · toques · campos · saltos | Con seña |
|---|---|---|
| **A. Nuevo, Google** | 6 · 5 (+≥1 dentro de Google) · 0 · 1 | 7 · 5 · 0 · 2 (Google, MercadoPago) |
| **B. Nuevo, email** | 7 · 6 (1 en el mail) · 3 (2 obligatorios) + checkbox · 1 | 8 · 6 · 3 · 2 (mail, MercadoPago) |
| **C. Vuelve, con sesión** | 3 · 2 · 0 · 0 | 4 · 2 · 0 · 1 (MercadoPago) |
| **D. Vuelve, sin sesión** | Igual que A o B: el código no lo distingue de un jugador nuevo (mismo `LoginGate`) | Igual que A o B con seña |

- **Errores:** 70 textos y estados inventariados; **40 fallan** en decir qué pasó o qué hacer.
- **Precios ocultos** (`settings.hide_public_prices`, #416) no cambian ningún conteo, solo textos (§3).
- Caso base: turno de HOY, una cancha, sin opcionales, sin contar los toques dentro de Google, del mail ni de MercadoPago.

Alias de rutas usados abajo: `@PUB` = `src/app/(public)/[slug]` · `@RSV` = `src/app/(public)/[slug]/reservar` · `@AUTH` = `src/app/(auth)` · `@PLY` = `src/app/(player)` · `@RET` = `src/app/reserva/[bookingId]` · `@CB` = `src/app/api/auth/callback/route.ts`.

---

## 1. Cómo se contó

**Link del complejo:** `https://<NEXT_PUBLIC_APP_URL>/<slug>`, sin parámetros. Lo arma `buildPublicLinkUrl` (`src/lib/utils.ts:16-28`). El complejo lo comparte (a) por WhatsApp desde el cierre del onboarding con el texto "¡Hola! Ya podés reservar tu turno en {nombre} online: {link} Elegí día, hora y cancha. ¡Sin llamar!" (`src/app/onboarding/listo/ShareActions.tsx:38-44`) o (b) copiándolo de la checklist del dashboard (`src/components/dashboard/onboarding-checklist.tsx:173-196`). Se muestra como `turnogol.app/{slug}` (`src/app/onboarding/components/StepIdentity.tsx:154-158`). Ningún link trae día, hora ni cancha. La home y `/explorar` no están en ningún recorrido: solo aparecen como salidas ("Seguir explorando", `@RET/exito/BookingSuccessCard.tsx:140-145`).

**Definiciones**
- **Toque:** tap en botón, link, selección (día, hora, cancha) o checkbox que el recorrido exige. Enfocar un campo para escribir no es toque (va en "Campos"). Los opcionales (compartir, favorito, mapa, calendario, comprobante, filtros) y las esperas (redirección automática de 5 s, sondeo) no cuentan.
- **Campo:** input de texto que el jugador escribe.
- **Salto:** salida de turnogol.app a otro sitio y vuelta (Google, mail, MercadoPago).
- **Pantalla:** vista distinta que el jugador mira, incluidas las de terceros. Las redirecciones sin interfaz no cuentan.
- Ningún paso pide teléfono ni completar `/perfil`: `getOrCreatePlayer` guarda `phone` NULL (`src/modules/players/player.service.ts:55-59`) y `createBookingAndCheckout` no lo exige.

**Supuestos (si cambian, cambia el conteo)**
- **S1.** Celular de 390 px. El jugador abre el link desde WhatsApp; ese toque es el punto de partida y no se cuenta.
- **S2.** Turno de HOY: la grilla abre en hoy (`@PUB/components/AvailabilityGrid.tsx:200-211`). Otro día cuesta +1 toque por día con la flecha (`:318-348`), o +2 con el selector de fecha (`:327-339`) y la pestaña de día del modal (`@PUB/components/WeeklyAvailabilityModal.tsx:193-206`).
- **S3.** La cancha se elige tocando su celda en esa hora (0 toques extra). El filtro por cancha (solo con más de una, `AvailabilityGrid.tsx:373-408`) es opcional. Con 3 canchas o más, a 390 px la tabla desborda a lo ancho (columna Hora de 64 px + 88 px por cancha = 328 px contra ≈290 px disponibles: `@PUB/(perfil)/page.tsx:79,92,107`; `AvailabilityGrid.tsx:305,433-446`).
- **S4.** Complejo abierto con `allow_online_booking` prendido. Si no, la grilla muestra "Contactar" (teléfono) y no hay recorrido (`AvailabilityGrid.tsx:158-171`).
- **S5.** "Sin seña" es el default de un complejo nuevo (`src/modules/tenants/tenant.service.ts:44`); acepta efectivo y transferencia, con "Efectivo" preseleccionado (`@RSV/components/PaymentMethodSelector.tsx:129`).
- **S6.** El mail llega y el link se abre en el mismo navegador y dispositivo.
- **S7.** Google y MercadoPago cuentan como pantalla y salto; sus toques y campos internos son ND.

---

## 2. Recorridos (celular de 390 px, desde el link del complejo)

### A. Jugador nuevo, entra con Google, complejo SIN seña

| # | Pantalla (ruta) | Qué ve | Toques | Campos | Salto | Evidencia |
|---|---|---|---|---|---|---|
| A1 | Perfil `/{slug}` | Portada, nombre, chips (Cómo llegar, teléfono, WhatsApp, Ver semana completa), Horarios, Fotos y Canchas (si hay) y recién después "Disponibilidad": esqueleto de carga y la grilla de hoy. [SCROLL hasta la grilla] | 1: "Reservar" en la celda | 0 | — | `@PUB/(perfil)/page.tsx:93-190`; `AvailabilityGrid.tsx:173-181` |
| A2 | `/{slug}/reservar?court&date&time&dur=60` (sin sesión) | "Confirmá tu reserva"; resumen; formulario "Confirmá con tu email": Nombre, Apellido, Email, checkbox "Soy mayor de 18 años y acepto los términos y condiciones de uso (declaración jurada).", "Continuar con email", "o", "Continuar con Google" (deshabilitado hasta tildar). [SCROLL probable hasta Google] | 2: checkbox + "Continuar con Google" | 0 (Nombre, Apellido y Email no se usan por este camino) | → Google | `@RSV/page.tsx:154-199`; `@RSV/components/LoginGate.tsx:75-171`; `@RSV/actions.ts:132-158` |
| A3 | Google | Selector de cuenta o consentimiento (ND) | ≥1 (ND) | ND | ← vuelve por `/api/auth/callback` | `@RSV/actions.ts:155-157`; `@CB:139-163` |
| A4 | `/verify?status=success&next=…&intent=booking` | "¡Cuenta confirmada!" / "Volvé para terminar tu reserva." / "Continuar con mi reserva" / "Te llevamos automáticamente en 5s…" | 1 (o esperar 5 s) | 0 | — | `@CB:112-122`; `@AUTH/verify/page.tsx:21-26,117-153`; `@AUTH/verify/SuccessRedirect.tsx:5-35` |
| A5 | `/{slug}/reservar?…` (con sesión) | Resumen + "Método de pago" (Efectivo preseleccionado, Transferencia) + "Confirmar reserva". [SCROLL: al límite] | 1: "Confirmar reserva" | 0 | — | `@RSV/page.tsx:129-135,182-192`; `@RSV/components/ConfirmBookingButton.tsx:44-55` |
| A6 | `/reserva/{id}/exito` | "¡Reserva confirmada!", complejo y cancha, fecha y hora, "Pagás al llegar al complejo.", QR + "Descargar comprobante", mapa, Compartir / Calendario / Cómo llegar, "Ver mis reservas", "Seguir explorando" | 0 | 0 | — | `@RSV/actions.ts:295-296,336`; `@RET/exito/page.tsx:105-127`; `BookingSuccessCard.tsx:46-148` |

**Total A (sin seña): 6 pantallas · 5 toques (+≥1 en Google; 4 si espera los 5 s de A4) · 0 campos · 1 salto.**
Si pasan más de 10 minutos en Google, vence la cookie de términos (`src/shared/security/google-terms-cookie.ts:30`) y aparece `/aceptar-terminos` (+2 toques: checkbox y "Continuar", `@AUTH/aceptar-terminos/AceptarTerminosForm.tsx:38-61`).

### B. Jugador nuevo, entra con email (enlace mágico), complejo SIN seña

| # | Pantalla (ruta) | Qué ve | Toques | Campos | Salto | Evidencia |
|---|---|---|---|---|---|---|
| B1 | Perfil `/{slug}` | Igual que A1. [SCROLL] | 1: "Reservar" | 0 | — | idem A1 |
| B2 | `/reservar` sin sesión | Igual que A2 | 2: checkbox + "Continuar con email" | 3: Nombre (obligatorio), Apellido (opcional), Email (obligatorio) | — | `LoginGate.tsx:84-135`; `@RSV/actions.ts:40-54,65-113` |
| B3 | Misma URL, estado "enviado" | "Revisá tu email" / "Te enviamos un enlace a {email}. Hacé click para confirmar tu reserva." (sin reenviar ni corregir el email) | 0 | 0 | → app de mail | `LoginGate.tsx:60-72` |
| B4 | Mail "Tu acceso a TurnoGol" | "Hacé click para entrar y ver tus reservas:" [Ingresar] | 1 (dentro del mail) | 0 | ← vuelve por `/api/auth/callback?…&token_hash=…&type=email` | `supabase/templates/magic_link.html:9-16`; `@CB:171-198` |
| B5 | `/verify?…&intent=booking` | Igual que A4 | 1 (o 5 s) | 0 | — | idem A4 |
| B6 | `/reservar` con sesión | Igual que A5 | 1 | 0 | — | idem A5 |
| B7 | `/reserva/{id}/exito` | Igual que A6 | 0 | 0 | — | idem A6 |

**Total B (sin seña): 7 pantallas · 6 toques (1 en el mail; 5 si espera los 5 s) · 3 campos (2 obligatorios) + 1 checkbox · 1 salto.**

### C. Jugador que vuelve, CON sesión abierta, complejo SIN seña

| # | Pantalla (ruta) | Qué ve | Toques | Campos | Salto | Evidencia |
|---|---|---|---|---|---|---|
| C1 | Perfil `/{slug}` | Igual que A1; el header pasa a avatar y aparece la barra inferior tras `GET /api/player/session`. [SCROLL] | 1: "Reservar" | 0 | — | `src/components/site/PortalSessionProvider.tsx:64-103`; `PortalHeader.tsx:115-132` |
| C2 | `/reservar` con sesión | Resumen + Método de pago + "Confirmar reserva". [SCROLL: al límite] | 1 | 0 | — | `@RSV/page.tsx:137-138,182-192` |
| C3 | `/reserva/{id}/exito` | Igual que A6 | 0 | 0 | — | idem A6 |

**Total C (sin seña): 3 pantallas · 2 toques · 0 campos · 0 saltos.**

### D. Jugador que vuelve, SIN sesión, complejo SIN seña

`/reservar` sin sesión siempre monta `LoginGate` (`@RSV/page.tsx:182-199`): no existe la variante "ya tengo cuenta".

| Camino | Pantallas | Toques | Campos | Saltos | Diferencias con A y B |
|---|---|---|---|---|---|
| D con Google | 6 | 5 (el checkbox vuelve a ser obligatorio para habilitar el botón, `LoginGate.tsx:158-168`) | 0 | 1 | `/verify` dice "¡Listo!" (`booking_returning`, `@CB:121`) en vez de "¡Cuenta confirmada!" |
| D con email | 7 | 6 | 3 + checkbox: vuelve a escribir nombre, apellido, email y la declaración +18, que el servidor exige (`@RSV/actions.ts:40-54`) y descarta para una cuenta existente (`player.service.ts:37-53`) | 1 | idem |
| Por "Ingresar" del header (`/ingresar`) | `/ingresar` → mail → `/verify` → `/mis-reservas` → volver al link → perfil → `/reservar` → éxito | ≥6 | 1 (email) | 1 | El link del header no lleva `next` (`PortalHeader.tsx:82,147`): se pierde el turno elegido |

### Variante CON seña por MercadoPago (aplica a A, B, C y D)

| Paso | Qué cambia | Toques | Salto | Evidencia |
|---|---|---|---|---|
| Resumen en `/reservar` | Con precios visibles: "Precio del turno $X", "Seña a pagar ahora $S", "Resto en el complejo $R" (default 30 %) | 0 | — | `@RSV/components/BookingSummary.tsx:53-75`; `tenant.service.ts:45` |
| Método de pago | Una sola opción, "MercadoPago — Pagás la seña online ahora", ya marcada | 0 | — | `PaymentMethodSelector.tsx:80-87,149-163`; `@RSV/page.tsx:129-135` |
| Botón | "Pagar seña y reservar" (reemplaza a "Confirmar reserva") | 1 (el mismo) | → MercadoPago; la retención del turno nace acá y dura 6 min | `ConfirmBookingButton.tsx:25`; `@RSV/actions.ts:295-306`; `src/shared/jobs/definitions.ts:38` |
| MercadoPago | Su interfaz; monto = seña | ≥1 (ND) | ← vuelve por `auto_return: approved` a `/reserva/{id}/exito` | `src/modules/payments/mp-gateway.implementation.ts:140-164` |
| Éxito (aviso de pago ya procesado) | Tarjeta completa con "Seña pagada: $S" y "Resta abonar en el complejo: $R" | 0 | — | `BookingSuccessCard.tsx:76-89` |
| Éxito (aviso de pago todavía no) | "Confirmando tu pago…" con cuenta regresiva; al confirmar, versión reducida sin QR ni comprobante | 0 | — | `@RET/exito/page.tsx:83-95`; `src/components/booking/PaymentStatusWatcher.tsx:85,130-147,217-239` |

| Recorrido con seña | Pantallas | Toques en TurnoGol | Campos | Saltos |
|---|---|---|---|---|
| A | 7 (+1 si "Confirmando…") | 5 | 0 | 2 (Google, MercadoPago) |
| B | 8 (+1) | 6 | 3 | 2 (mail, MercadoPago) |
| C | 4 (+1) | 2 | 0 | 1 (MercadoPago) |

Caso heredado: con `requires_deposit` y sin MercadoPago conectado, la página igual anuncia seña por MercadoPago (`@RSV/page.tsx:109-112,129-135`), pero la action confirma sin seña (`@RSV/actions.ts:249-262`).

### E. Cancelar desde `/mis-reservas`

| # | Pantalla | Qué ve | Toques | Campos |
|---|---|---|---|---|
| E1 | `/mis-reservas` (Próximos) | Tarjeta "Confirmada" con "Cancelar" | 1 para llegar + 1: "Cancelar" | 0 |
| E2 | Diálogo "¿Cancelar esta reserva?" | Detalle + consecuencia ("No hay seña que devolver." / "Se te devuelve la seña de $X." / "Perdés la seña de $X.") + "Motivo (opcional)" + [Volver] [Sí, cancelar] | 1: "Sí, cancelar" | 0 |
| E3 | Si hubo devolución | Diálogo "Reserva cancelada" con monto y contacto del complejo | +1 para cerrarlo | 0 |

Total E: 2 toques desde `/mis-reservas` (3 con devolución). Evidencia: `@PLY/mis-reservas/CancelBookingButton.tsx:42-46,78-118`; `RefundDialogProvider.tsx:38-45`.

### Pantallas que exigen scroll para llegar al botón principal

Estimado por las clases de Tailwind; sin renderizar, la magnitud exacta es ND.

| Pantalla | ¿Scroll? | Base |
|---|---|---|
| Perfil `/{slug}` | Sí, hasta la grilla: con portada, cabecera, Horarios, Fotos y Canchas queda ≈1–2 pantallas abajo | `@PUB/(perfil)/page.tsx:93-190`; `TenantHeader.tsx:51-166` |
| Grilla | Sí, hasta la hora buscada (≈56 px por fila); horizontal con 3 canchas o más | `AvailabilityGrid.tsx:423-446` |
| `/reservar` sin sesión | Probable: ≈960 px hasta "Continuar con Google" contra ≈740 visibles | `@RSV/page.tsx:154-199`; `LoginGate.tsx:75-171` |
| `/reservar` con sesión | Al límite: ≈700 px hasta "Confirmar reserva" contra ≈660 visibles | `PortalFrame.tsx:24-36`; `PlayerBottomNav.tsx:35-45` |
| `/verify`, `/ingresar`, `/aceptar-terminos` | No | |
| `/reserva/{id}/exito` | La confirmación está arriba; "Ver mis reservas" queda al final | `BookingSuccessCard.tsx:46-148` |

---

## 3. Qué cambia con precios ocultos

**Toques, campos y saltos: nada.** Cambian solo textos. La seña se sigue calculando con el precio real (`@RSV/page.tsx:84-86`).

| Superficie | Con precios | Ocultos | Evidencia |
|---|---|---|---|
| Tarjeta de cancha del perfil | "$X por jugador" / "$X el turno" | Sin precio | `CourtCard.tsx:10,57-69` |
| Grilla | No muestra precios | Igual | `AvailabilityGrid.tsx:97-182` |
| Resumen sin seña | "Precio del turno $X" + "Pagás el total en el complejo." | "Pagás en el complejo." | `BookingSummary.tsx:46-75` |
| Resumen con seña | Precio, seña y resto | "Para confirmar pagás una seña online con MercadoPago. El resto, en el complejo." | idem |
| MercadoPago | Monto de la seña | Igual: es la primera vez que el jugador ve el monto | `mp-gateway.implementation.ts:135` |
| Éxito y comprobante | Montos | "Pagás al llegar al complejo." / "Seña pagada. El resto lo abonás en el complejo." | `BookingSuccessCard.tsx:64-89`; `src/components/booking/BookingReceipt.tsx:67-92` |
| `/mis-reservas` | "$ precio" | Sin precio | `@PLY/mis-reservas/page.tsx:231`; `MisReservasView.tsx:279-283` |
| Diálogo de cancelar | "Se te devuelve / Perdés la seña de $S" | **Igual: muestra el monto de la seña** | `CancelBookingButton.tsx:42-46` |

---

## 4. Inventario de errores y estados vacíos

Criterio: **(a)** dice qué pasó en el idioma del jugador; **(b)** da una acción posible desde ahí. ❌ = falla (a) o (b). **70 filas, 40 con ❌.** Los textos del callback, de `/verify` y de cancelar que corrigen los PRs del 2026-10-14 (login y cancelación) están marcados con *(se corrige en 1A/1B)*.

### Perfil y grilla

| ID | Texto | Cuándo | Archivo:línea | a | b | Nota |
|---|---|---|---|---|---|---|
| E-01 | "Este complejo no está disponible temporalmente." | Complejo suspendido, bloqueado o dado de baja | `@PUB/(perfil)/page.tsx:50-60` | OK | ❌ | Sin salida |
| E-02 | "No encontramos este complejo. ¿Buscás otro?" + "← Volver al inicio" | Slug inexistente | `@PUB/not-found.tsx:7-16` | OK | OK | Va a `/`, no a `/explorar` |
| E-03 | "No pudimos cargar la disponibilidad de ese día. Revisá tu conexión e intentá de nuevo." | Falla de red o respuesta no-OK | `AvailabilityGrid.tsx:23-24,230-237,257-273,356-364` | ❌ | OK | Culpa a la conexión aunque la causa sea otra (`src/app/api/public/availability/route.ts:30,44,49`; `src/shared/lib/rejection-message.ts:11-13`). Sin "Reintentar" |
| E-04 | "No se pudo procesar la solicitud." | 500 de la API de disponibilidad | `availability/route.ts:55` | ❌ | ❌ | |
| E-05 | "Demasiados requests. Probá de nuevo en unos segundos." | 429 (30/min por IP) | `src/shared/rate-limit/apply.ts:104` | OK | OK | "requests" es jerga |
| E-06 | "Este complejo no tiene canchas disponibles por el momento." | Sin canchas online | `AvailabilityGrid.tsx:367-371` | OK | ❌ | |
| E-07 | "Sin turnos para esta fecha." | Día sin turnos | `AvailabilityGrid.tsx:412-418` | OK | ❌ | No dice por qué ni qué hacer |
| E-08 | "Los turnos de hoy ya pasaron. Probá con el día siguiente." | Hoy sin horas futuras | `AvailabilityGrid.tsx:414-416` | OK | OK | |
| E-09 | "Señando m:ss" / "Liberando…" | Turno retenido | `AvailabilityGrid.tsx:129-144` | ❌ | ❌ | La explicación solo está en `title`/`aria-label`, que no se ve en el celular |
| E-10 | "Ocurrió un error al cargar la disponibilidad de la semana." | Falla del modal semanal | `WeeklyAvailabilityModal.tsx:12,184-185` | OK | ❌ | |

### `/reservar`

| ID | Texto | Cuándo | Archivo:línea | a | b | Nota |
|---|---|---|---|---|---|---|
| E-11 | "Este complejo no acepta reservas online por el momento." + "Elegir otro turno" | Reservas online apagadas | `@RSV/page.tsx:54-61`; `CheckoutStates.tsx:137-154` | OK | ❌ | El botón contradice el texto y no ofrece teléfono |
| E-12 | "Faltan datos del turno. Elegí un horario desde la grilla." | Parámetros incompletos | `@RSV/page.tsx:63-82` | OK | OK | |
| E-13 | "No encontramos ese turno. Puede que haya cambiado la disponibilidad." | Turno inexistente | `@RSV/page.tsx:87-96` | OK | OK | |
| E-14 | "Ese turno ya no está disponible. Elegí otro horario." | Turno tomado, retenido o pasado | `@RSV/page.tsx:97-107` | OK | OK | Sale también si la retención es del propio jugador (F-13) |
| E-15 | "El complejo restringió tu cuenta: {motivo}. Volvés a poder reservar el {fecha}." | Bloqueo con motivo y fecha | `CheckoutStates.tsx:72-86` | OK | OK | |
| E-16 | "No podés reservar en este complejo actualmente." | Bloqueo sin motivo ni fecha | `CheckoutStates.tsx:82` | ❌ | ❌ | |
| E-17 | "Ya tenés reservas pendientes de pago en este complejo. Completá o esperá a que venzan antes de reservar otra." | 3 retenciones simultáneas | `CheckoutStates.tsx:88-97` | OK | ❌ | No hay dónde completarlas y "esperá" no dice cuánto (6 min) |
| E-18 | "Estás yendo muy rápido. Esperá unos segundos e intentá de nuevo." | Límite de pedidos | `CheckoutStates.tsx:99-106` | OK | OK | |
| E-19 | "No pudimos procesar la reserva: la cancha no está disponible o no tiene precio configurado para ese horario." | Validación, cancha offline o sin precio | `CheckoutStates.tsx:107-117` | ❌ | OK | Mezcla dos causas; "precio configurado" es lenguaje del panel |
| E-20 | "Ese turno ya no se puede reservar: quedó fuera de la fecha disponible para reservar online. Elegí otro turno." | Fecha fuera de rango | `CheckoutStates.tsx:118-128` | OK | OK | |
| E-21 | "No pudimos cargar esta página" + "Código de referencia: {digest}" | Excepción al crear la reserva (p. ej. falla de MercadoPago) | `src/app/(public)/error.tsx:21-30`; `src/components/ui/error-state.tsx:87,133` | ❌ | OK | Habla de cargar una página cuando falló el pedido; no dice si quedó una retención |

### `LoginGate` (checkout sin sesión)

| ID | Texto | Cuándo | Archivo:línea | a | b | Nota |
|---|---|---|---|---|---|---|
| E-22 | "Ingresá un email válido" | Email inválido | `@RSV/actions.ts:49` | OK | OK | |
| E-23 | "Ingresá tu nombre" / "Máximo 80 caracteres" | Nombre vacío o largo | `@RSV/actions.ts:50-51` | OK | OK | |
| E-24 | "Tenés que aceptar los términos." | Checkbox sin tildar | `@RSV/actions.ts:52` | OK | OK | |
| E-25 | "Datos inválidos." | Fallback de validación | `@RSV/actions.ts:84` | ❌ | ❌ | |
| E-26 | "Demasiados intentos. Esperá un minuto y probá de nuevo." | 5 pedidos por minuto por email | `@RSV/actions.ts:91-98` | OK | OK | |
| E-27 | "No pudimos enviar el email. Probá de nuevo." | Falla del envío | `@RSV/actions.ts:110-111` | OK | OK | |
| E-28 | "Revisá tu email" / "Te enviamos un enlace a {email}. Hacé click para confirmar tu reserva." | Mail enviado | `LoginGate.tsx:60-72` | OK | ❌ | El click no confirma la reserva (faltan 2 toques, F-02). Sin reenviar |
| E-29 | (sin texto) la página se recarga | Google no devuelve URL | `@RSV/actions.ts:155-156` | ❌ | ❌ | Falla silenciosa |
| E-30 | "Continuar con Google" deshabilitado; el motivo solo está en `title` | Checkbox sin tildar | `LoginGate.tsx:158-168` | ❌ | ❌ | El tooltip no se ve en el celular |

### Callback y `/verify`

| ID | Texto | Cuándo | Archivo:línea | a | b | Nota |
|---|---|---|---|---|---|---|
| E-31 | "No pudimos verificar tu enlace" + "Este enlace expiró. Generá uno nuevo desde Iniciar sesión." + "Volver a intentar" → `/login` | Enlace vencido o usado | `@AUTH/verify/page.tsx:9-11,170-201` | OK | ❌ | El botón principal va al login de complejos *(se corrige en 1B)* |
| E-32 | "No pudimos verificar el enlace. Probá de nuevo." | Callback sin `token_hash` ni `code` | `verify/page.tsx:11` | ❌ | ❌ | Dice "enlace" aunque haya entrado con Google *(1B)* |
| E-33 | "No pudimos completar el inicio de sesión. Probá de nuevo." | Falla del intercambio de sesión | `verify/page.tsx:12` | ❌ | ❌ | *(1B)* |
| E-34 | "Ese email ya tiene una cuenta de TurnoGol para complejos. Iniciá sesión en /login con tu contraseña." | Google con cuenta de complejo o super admin | `verify/page.tsx:17-18`; `@CB:73-80` | OK | ❌ | Observado en la demo del 2026-10-14 *(1B)* |
| E-35 | "¡Bienvenido a TurnoGol!" + "Ir al panel" | Cuenta de complejo que pide enlace desde el checkout | `@CB:208-251` | ❌ | ❌ | *(1B: se corta con `account_conflict`)* |
| E-36 | JSON crudo `{"error":{"code":"RATE_LIMITED",…}}` | 429 sobre `/verify` o el callback (10 por minuto por IP; cada ingreso gasta 2) | `middleware.ts:14-16,143-150`; `policies.ts:12` | ❌ | ❌ | Con IP compartida (wifi del complejo, redes móviles) es alcanzable |
| E-37 | (sin texto) 500 | Excepción al provisionar al jugador | `@CB:99-110` | ❌ | ❌ | *(1B: `provision_failed`)* |

### `/ingresar`, `/aceptar-terminos` y errores de `(auth)`

| ID | Texto | Cuándo | Archivo:línea | a | b | Nota |
|---|---|---|---|---|---|---|
| E-38 | "Ingresá un email válido." / "Demasiados intentos. Esperá un minuto." / "No pudimos enviar el email. Probá de nuevo." | `/ingresar` | `@AUTH/ingresar/actions.ts:37,41,51` | OK | OK | |
| E-39 | "Revisá tu email" / "Te enviamos un enlace de acceso a {email}." | También cuando el email no existe (no se envía nada, para no revelar qué emails tienen cuenta) | `IngresarForm.tsx:81-108`; `auth.service.ts:86-96` | ❌ | ❌ | El jugador espera un mail que no llega y no hay "¿No te llegó?" |
| E-40 | "Tenés que aceptar los términos." | `/aceptar-terminos` | `@AUTH/aceptar-terminos/actions.ts:14,36` | OK | OK | |
| E-41 | "Tuvimos un problema. El equipo ya fue notificado. Probá recargar." + "Ir a iniciar sesión" → `/login` | Excepción en `/ingresar`, `/verify`, `/aceptar-terminos` | `@AUTH/error.tsx:21-30` | OK | ❌ | El secundario va al login de complejos |

### Vuelta de la reserva `/reserva/{id}/*`

| ID | Texto | Cuándo | Archivo:línea | a | b | Nota |
|---|---|---|---|---|---|---|
| E-42 | (sin texto) redirección a `/ingresar` sin `next` | Éxito, pendiente o error sin sesión de jugador | `@RET/exito/page.tsx:65`; `@RET/pendiente/page.tsx:28`; `@RET/error/page.tsx:30` | ❌ | ❌ | |
| E-43 | "No encontramos tu reserva." + "Ver mis reservas" | Reserva inexistente o ajena | `BookingSuccessCard.tsx:150-163` | OK | OK | |
| E-44 | "No encontramos tu reserva. Revisá tus reservas en el panel." | `/pendiente` sin reserva | `@RET/pendiente/page.tsx:37-47` | OK | ❌ | "Panel" es palabra del complejo; sin link |
| E-45 | "Confirmando tu pago…" / "Te queda {mm:ss} para completar el pago." | Vuelta de MercadoPago antes del aviso de pago | `PaymentStatusWatcher.tsx:217-239` | OK | OK | Estado, no error |
| E-46 | "La reserva expiró" + "Reservar de nuevo" → `/` | Estado `expired` | `PaymentStatusWatcher.tsx:150-170` | OK | OK | El botón va a la home, no al complejo |
| E-47 | "Se acabó el tiempo" / "No recibimos la confirmación a tiempo…" | Venció la retención sin estado final | `PaymentStatusWatcher.tsx:192-214` | OK | OK | |
| E-48 | "No pudimos verificar tu pago" / "…te confirmamos por email apenas se acredite." | 5 fallos seguidos del sondeo | `PaymentStatusWatcher.tsx:199-205` | OK | OK | |
| E-49 | "Reserva cancelada" (sin descripción) | Cancelada mientras mira | `PaymentStatusWatcher.tsx:172-189` | ❌ | OK | |
| E-50 | "El pago no se procesó." + "Reintentar pago" o "Reservar de nuevo" | Pago rechazado | `@RET/error/BookingErrorCard.tsx:46-72` | OK | OK | |
| E-51 | (sin texto) "Reintentar pago" vuelve a la misma pantalla | Límite de pedidos y otras ramas | `@RSV/actions.ts:341-378` | ❌ | ❌ | |
| E-52 | "Tuvimos un problema mostrando tu reserva. Si ya pagaste, el pago está a salvo…" | Excepción en `/reserva/*` | `src/app/reserva/error.tsx:25-34` | OK | OK | "escribinos" sin canal |

### `/mis-reservas` (cancelar incluido)

| ID | Texto | Cuándo | Archivo:línea | a | b | Nota |
|---|---|---|---|---|---|---|
| E-53 | "Todavía no tenés reservas" + "Explorar complejos" | Próximos vacío | `MisReservasView.tsx:207-220` | OK | OK | |
| E-54 | "Historial vacío" + "Explorar complejos" | Historial vacío | idem | OK | OK | |
| E-55 | "Esa página no existe" / "Tus próximas reservas tiene menos que lo que pide este link." | Página fuera de rango | `MisReservasView.tsx:197-204` | OK | OK | Texto confuso y con error de concordancia |
| E-56 | Badge "Esperando seña" sin acción | Reserva pendiente de pago | `MisReservasView.tsx:297-343` | OK | ❌ | No hay "Pagar" ni "Cancelar" |
| E-57 | "No pudimos cargar tus reservas" + "Mis reservas" | Excepción en cualquier ruta del jugador | `@PLY/error.tsx:21-30` | ❌ | OK | El título sale también en `/perfil` y `/configuracion` |
| E-58 | "¿Cancelar esta reserva?" + consecuencia | Diálogo de cancelar | `CancelBookingButton.tsx:42-46,86-103` | OK | OK | Muestra el monto de la seña aun con precios ocultos |
| E-59 | "Datos inválidos." | Validación | `@PLY/mis-reservas/actions.ts:121` | ❌ | ❌ | |
| E-60 | "Demasiadas solicitudes. Esperá un momento." | Límite de pedidos | `mis-reservas/actions.ts:125` | OK | OK | |
| E-61 | "Reserva no encontrada." | Inexistente o ajena | `mis-reservas/actions.ts:156` | OK | ❌ | |
| E-62 | "No tenés permiso para cancelar esta reserva." | No es suya | `mis-reservas/actions.ts:169` | OK | ❌ | |
| E-63 | "La reserva no está en estado confirmado." | Ya cancelada, vencida o jugada (p. ej. un reintento) | `mis-reservas/actions.ts:172` | ❌ | ❌ | Observado en la demo del 2026-10-14 *(1A)* |
| E-64 | "El turno ya terminó. Contactá al complejo." | Cancelar después del fin | `mis-reservas/actions.ts:177` | OK | ❌ | Sin teléfono ni WhatsApp a mano |
| E-65 | "El complejo no está disponible para cancelar online." | Complejo bloqueado o dado de baja | `mis-reservas/actions.ts:183` | OK | ❌ | |
| E-66 | "No se pudo completar la acción." | Error sin mensaje | `src/components/ui/confirm-dialog.tsx:71` | ❌ | ❌ | |
| E-67 | "No se pudo completar la acción. Revisá tu conexión e intentá de nuevo." | Excepción de la action | `confirm-dialog.tsx:82` | OK | OK | Invita a reintentar a ciegas *(1A)* |
| E-68 | "Reserva cancelada" + "{Complejo} te tiene que devolver {monto}…" + WhatsApp/Teléfono/Email | Cancelación en plazo con seña pagada | `RefundDialogProvider.tsx:38-45`; `RefundContactPanel.tsx:94-143` | OK | OK | |
| E-69 | (sin mensaje) el diálogo se cierra y la tarjeta sale de Próximos | Cancelación sin seña o fuera de plazo | `CancelBookingButton.tsx:65-74` | ❌ | ❌ | No hay confirmación de que se canceló |
| E-70 | "Elegí una calificación." / "Ya dejaste una reseña…" / "No pudimos guardar tu reseña." | Reseñas | `LeaveReviewButton.tsx:30,41,51` | OK | ❌ (el 3.º) | |

---

## 5. Fricciones que deja ver el código (solo hechos)

### Pasos y confirmaciones
- **F-01.** Entre el ingreso y la reserva hay una pantalla propia: tras Google o el mail, el jugador cae en `/verify` ("¡Cuenta confirmada!", "Continuar con mi reserva", cuenta regresiva de 5 s) y recién después vuelve a `/reservar` (`@CB:112-122`; `@AUTH/verify/page.tsx:21-26,117-153`).
- **F-02.** Entrar no reserva: después del ingreso quedan 2 toques ("Continuar con mi reserva" y "Confirmar reserva"), pero los textos dicen otra cosa: "Hacé click para confirmar tu reserva" (`LoginGate.tsx:68-70`) y el mail "Hacé click para entrar y ver tus reservas" (`supabase/templates/magic_link.html:10`).
- **F-03.** Tres verbos para el mismo acto: "Reservar" (celda), "Confirmá tu reserva" (título) y "Confirmar reserva" / "Pagar seña y reservar" (botón). El primero solo navega.
- **F-04.** Con seña, el selector "Método de pago" tiene una sola opción ya marcada; sin seña pide elegir efectivo o transferencia aunque se paga en el complejo (`PaymentMethodSelector.tsx:113-147`; `@RSV/page.tsx:129-135`).
- **F-05.** Tres superficies muestran los mismos horarios libres (grilla, modal semanal y página "Ver semana completa").
- **F-06.** La grilla es lo sexto de la página, no hay botón ni ancla hacia ella arriba y llega después de cargar la página (esqueleto hasta que responde `/api/public/availability`). Las tarjetas de cancha parecen tocables pero no son link (`CourtCard.tsx:16`).
- **F-07.** Todas las celdas libres dicen "Reservar" y la hora solo está en la columna izquierda; con 3 canchas o más hay scroll horizontal a 390 px.

### Datos que ya tenemos
- **F-08.** Un jugador que vuelve sin sesión escribe otra vez nombre, apellido, email y la declaración +18; para una cuenta existente el servidor los descarta (`player.service.ts:37-53`).
- **F-09.** Con Google los tres campos siguen a la vista aunque no se usan, y el botón de Google es el último control, deshabilitado hasta tildar.
- **F-10.** "Ingresar" del header no lleva `next`: quien lo usa pierde el turno elegido. `/ingresar` por email no crea cuentas, pero Google sí, y manda a `/aceptar-terminos`.
- **F-11.** El checkbox de términos del checkout no tiene link a `/terminos`; el de `/aceptar-terminos` sí.
- **F-12.** La validación es solo del servidor y muestra un único mensaje (el primero), sin marcar el campo.

### Estados sin salida
- **F-13.** La retención propia se ve como ajena: un turno `pending_payment` queda "Señando m:ss" para todos, incluido quien lo retuvo, y `/reservar` le dice "Ese turno ya no está disponible". Quien cierra MercadoPago no puede retomar el pago: `/mis-reservas` muestra "Esperando seña" sin acción. La retención dura 6 min.
- **F-14.** El QR y el comprobante solo existen en `/reserva/{id}/exito`; ni `/mis-reservas` ni el mail de confirmación llevan ahí.
- **F-15.** Volver de MercadoPago sin la sesión de jugador en ese navegador deja en `/ingresar` sin `next`.
- **F-16.** La URL de éxito de una reserva ya jugada (`completed` o `no_show`) muestra "Confirmando tu pago…" con la cuenta regresiva vencida (`PaymentStatusWatcher.tsx:15-22,130-239`).
- **F-17.** "Reintentar pago" con límite de pedidos vuelve a la misma pantalla sin texto.
- **F-18.** El turno se puede perder durante el ingreso: la retención nace al enviar el último formulario, no al elegir el turno (`src/lib/booking/hold.ts:5-8`), y el recorrido por mail abre una ventana sin retención.
- **F-19.** Si el enlace se abre en otra pestaña o navegador, la original queda en "Revisá tu email" sin aviso ni reenvío.
- **F-20.** `/verify` y el callback comparten 10 pedidos por minuto por IP y cada ingreso gasta 2: con IP compartida (wifi del complejo, redes móviles) el rechazo es JSON crudo (E-36).
- **F-21.** El modal y la página semanal no respetan `allow_online_booking`: con reservas online apagadas llevan a E-11, mientras la grilla sí cambia a "Contactar".

### Textos y destinos
- **F-22.** Jerga o texto técnico: "no tiene precio configurado" (E-19), "Demasiados requests" (E-05, E-36), "estado confirmado" (E-63), "Código de referencia: {digest}", "/login" literal (E-34), "el panel" (E-44), "Señando" (E-09), "Cancelada (sin reembolso)" sin seña *(1A)*.
- **F-23.** Botones de recuperación que llevan a otra parte: "Volver a intentar" e "Ir a iniciar sesión" → `/login`, el login de complejos (E-31 a E-34 *(1B)*, E-41); "Reservar de nuevo" → `/` (E-46); "Elegir otro turno" cuando no hay turnos online (E-11).
- **F-24.** Cancelar: la action esperaba el despacho del mail antes de responder *(1A)*; sin devolución, el diálogo se cierra sin mensaje (E-69).
- **F-25.** El mail de confirmación dice "Si necesitás cancelar tu reserva, podés hacerlo desde la app hasta 12 horas antes." (`src/modules/notifications/templates/booking-confirmed.ts:30`). No hay app, el jugador puede cancelar hasta que termina el turno y las horas del complejo (default 12, configurables) solo deciden si se devuelve la seña.
- **F-26.** "Continuar con Google" no muestra que está cargando mientras redirige, y una falla vuelve a la pantalla sin mensaje (E-29).
- **F-27.** Cuentas separadas: Google con cuenta de complejo falla con E-34; por mail, la misma cuenta terminaba en "¡Bienvenido a TurnoGol! … Ir al panel" (E-35) *(1B)*.

---

## 6. No determinado

1. Toques y campos dentro de Google y MercadoPago (dependen de si el jugador ya tiene sesión en Google o cuenta en MercadoPago).
2. Altura real de las pantallas a 390 px y el scroll exacto (sin renderizar).
3. Texto, remitente y vencimiento del mail en producción: las plantillas de producción se cargan a mano en Supabase (`supabase/config.toml:155-157`); lo medido es la plantilla del repo.
4. Qué devuelve Supabase cuando el jugador cancela en Google *(1B lo mapea a `oauth_cancelled`)*.
5. Navegador interno de WhatsApp: cómo comparte cookies con el navegador del teléfono y cómo se comporta Google ahí. En la práctica no se puede distinguir C de D.
6. Si una sesión con el token vencido (`jwt_expiry = 3600`) se renueva al abrir `/reservar`, que no está en las rutas de refresco de `middleware.ts:19-67`. Si no se renueva, C se vuelve D.
7. Latencias: cancelar, crear el pago en MercadoPago, aviso de pago.
8. Datos de producción: cuántos complejos tienen seña, precios ocultos o una sola cancha.
