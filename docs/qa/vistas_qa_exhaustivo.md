# QA Exhaustivo de Vistas - TurnoGol

> Matriz QA accionable para testers humanos, QA automation y pruebas con Playwright.
> Cubre testing funcional, visual, UX, accesibilidad, resiliencia y edge cases.
> **Total: 36 vistas** agrupadas en P0/P1/P2/P3 + tests transversales. Generado a partir del inventario `vistas.md` y del codigo fuente real.

## Leyenda de prioridad

| Prioridad | Criterio |
|-----------|----------|
| 🔴 **P0 — Critico** | Genera dinero, bloquea acceso o corrompe datos. Falla = producto roto. |
| 🟠 **P1 — Alto** | Flujo principal de uso diario. Falla = experiencia degradada severa. |
| 🟡 **P2 — Medio** | Funcionalidad importante pero no bloquea el negocio inmediatamente. |
| 🟢 **P3 — Bajo** | Contenido estatico, rutas de salida rara o paginas informacionales. |

Cada caso de prueba esta prefijado con una etiqueta **[Categoria]** para facilitar el filtrado y el mapeo a specs de Playwright.

---

## Convenciones de testing transversal

Los siguientes comportamientos se testean **una sola vez** en las secciones transversales al final del documento (🧪 Tests Generales Extras) y **no se repiten en cada vista individual**, salvo que la vista tenga un comportamiento único:

| Comportamiento | Sección transversal | Aplica a |
|---|---|---|
| Acceso sin sesión → redirect `/login` | [Autenticación y sesiones](#autenticacion-y-sesiones) | Todas las vistas autenticadas |
| Sesión expirada → redirect `/login` | [Autenticación y sesiones](#autenticacion-y-sesiones) | Todas las vistas autenticadas |
| Tipo de usuario incorrecto (player→admin, admin→player) | [Autenticación y sesiones](#autenticacion-y-sesiones) | Todas las vistas autenticadas |
| Cross-tenant RLS (admin A no ve datos de tenant B) | [Autenticación y sesiones](#autenticacion-y-sesiones) | Todas las vistas admin |
| PinGate en zonas sensibles | [Autenticación y sesiones](#autenticacion-y-sesiones) | canchas, reportes, staff, settings/*, abonados |
| Contraste WCAG AA genérico | [Accesibilidad global](#accesibilidad-global) | Todas las vistas |
| Focus-visible ring genérico | [Accesibilidad global](#accesibilidad-global) | Todas las vistas |
| Navegación por teclado genérica (Tab/Enter/Esc) | [Accesibilidad global](#accesibilidad-global) | Todas las vistas |

En cada vista, solo se documentan tests de auth/permisos/a11y **específicos y únicos** de esa vista (ej: "staff sin tenant → redirect `/onboarding`", "booking de otro player → 404 por RLS").

---

## 🔴 P0 — Criticas (8 vistas)

### 1. Grilla de canchas
**URL:** `/grilla` · **Archivo:** `src/app/(admin)/grilla/page.tsx` · **Por que P0:** Herramienta de trabajo diaria del admin. Sin ella no pueden operar.

- [ ] **[Render]** Cargar /grilla sin parámetro date: debe mostrar grilla de hoy (ART, con offset -3hs de UTC), con columnas de canchas y filas de slots horarios.
- [ ] **[Render]** Verificar que la grilla renderiza todas las canchas configuradas en el complejo como encabezados de columna, con sus nombres visibles.
- [ ] **[Render]** Si el complejo no tiene canchas configuradas (courts.length === 0): mostrar EmptyState con icono LayoutGrid, título 'Sin canchas configuradas', descripción correspondiente.
- [ ] **[Render]** Si el día es cerrado (dayHours.closed === true o closedDates incluye la fecha): mostrar EmptyState con icono MoonStar, título 'Complejo cerrado este día'.
- [ ] **[Render]** En una cancha offline (court.status === 'offline'): mostrar nombre con badge '(offline)' en gris; los slots NO son clickeables (sin cursor-pointer, sin background hover).
- [ ] **[Render]** Verificar banner offline gris (OFFLINE status): 'Sin conexión. Los datos pueden no estar actualizados.' Solo aparece si status === 'OFFLINE'.
- [ ] **[Render]** Slots pasados (antes de la hora actual ART): fondo gris (bg-slate-50) + opacidad 60%, no clickeables (isPast === true).
- [ ] **[Render]** Slots futuros y disponibles (online court, no bloqueado, después de ahora): fondo blanco con cursor: pointer, hover:bg-emerald-50, ring focus visible.
- [ ] **[Happy path]** Clic en slot vacío disponible: abre BookingFormModal con información de cancha, fecha, hora inicial y cierre (timeStart → timeStart + duration).
- [ ] **[Happy path]** Seleccionar duración 60 min (default): confirmación debe reflejar timeEnd calculado como timeStart + 60 min.
- [ ] **[Happy path]** Seleccionar duración 120 min: confirmación debe reflejar timeEnd como timeStart + 120 min.
- [ ] **[Happy path]** Enviar formulario sin invitado (solo duración, notas opcionales): createBookingAction ejecuta con playerId ausente y guestName/guestPhone ausentes.
- [ ] **[Happy path]** Enviar formulario con invitado: ingresa nombre + teléfono, modal los envía al servidor vía Server Action, se crea booking con esos datos.
- [ ] **[Happy path]** Reserva se crea exitosamente: toast verde muestra 'Reserva creada' + cancha + horario, modal cierra, slot queda bloqueado en grilla sin recargar (Realtime).
- [ ] **[Happy path]** Navegación Anterior: clic en botón '← Anterior' pushes /grilla?date=YYYY-MM-DD (dia anterior), grilla se refresca con reservas de ese día.
- [ ] **[Happy path]** Navegación Siguiente: clic en botón 'Siguiente →' pushes /grilla?date=YYYY-MM-DD (día siguiente), grilla se refresca.
- [ ] **[Happy path]** Navegación Hoy: clic en 'Hoy' pushes /grilla?date=hoy (ART), vuelve a la fecha actual.
- [ ] **[Validacion]** Modal sin invitado pero con teléfono solamente: al submit, inline validation muestra 'Ingresá un nombre para el teléfono.' (o similar según refine).
- [ ] **[Validacion]** Modal con nombre invitado pero sin teléfono: phoneError = 'Ingresá un teléfono para el invitado.' No envía si falta.
- [ ] **[Validacion]** Nombre invitado > 200 caracteres: input tiene maxLength=200, no deja ingresar; al submit schema rechaza si trunca en cliente.
- [ ] **[Validacion]** Teléfono > 50 caracteres: maxLength=50, no deja ingresar.
- [ ] **[Validacion]** Notas internas > 1000 caracteres: textarea maxLength=1000, schema rechaza si excede.
- [ ] **[Validacion]** courtId formato inválido (no UUID): schema createManualBookingSchema rechaza, retorna error 'UUID inválido'.
- [ ] **[Validacion]** date formato inválido (no YYYY-MM-DD): schema rechaza, error 'Formato YYYY-MM-DD requerido'.
- [ ] **[Validacion]** timeStart/timeEnd formato inválido (no HH:MM): schema rechaza, error 'Formato HH:MM requerido'.
- [ ] **[Validacion]** durationMins fuera de [60, 120]: solo esos valores permitidos, schema rechaza otros (ej. 90 min).
- [ ] **[Vacio]** Grilla con canchas pero SIN reservas ese día: todos los slots muestran vacío (cell.kind === 'free'), fondo blanco para slots futuros.
- [ ] **[Vacio]** Cambiar a fecha futura sin reservas: grilla renderiza todos los slots como libres.
- [ ] **[Carga]** Mientras el modal hace submit (isPending === true): botón 'Confirmar' muestra spinner + 'Guardando…', disabled=true, no permite segundo submit.
- [ ] **[Carga]** Realtime fallido (OFFLINE): si Realtime cae y fallback a polling (30s), banner amber advierte; al pasar 400ms de INSERT/UPDATE, scheduleReconcile refetch /api/bookings.
- [ ] **[Error 409]** Dos admins crean simultáneamente en el mismo slot: el segundo recibe 'Este turno acaba de ser tomado.' (SlotTakenError mapped), modal queda abierto con error visible.
- [ ] **[Error 400]** Schema validation falla en servidor (ej. date mal formateado): retorna error con mensaje del schema, toast rojo muestra el error.
- [ ] **[Error 404]** Cancha no existe (courtId incorrecto): court.find() en handleSlotClick retorna undefined, handleSlotClick temprana retorna sin abrir modal.
- [ ] **[Error 500]** Server Action lanza excepción no controlada (ej. DB error): caught por catch en handleSubmit, Sentry.captureException(err) reporta, toast muestra 'No pudimos crear la reserva. Revisá tu conexión e intentá de nuevo.'
- [ ] **[Red/Timeout]** Fetch falla (OFFLINE realtime, no hay polling): hook fallback a 30s polling; grilla sigue mostrando ultimo estado conocido hasta siguiente reconcile.
- [ ] **[Red/Timeout]** Servidor no responde al submit: setTimeout en startTransition catch, error genérico, boton no queda colgado.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Además, tests únicos de esta vista:
- [ ] **[Permisos]** Staff sin tenant (staff_user_id válido pero no vinculado): getStaffTenant() === null, redirect('/onboarding').
- [ ] **[Sesion]** Auth token expira durante form submit: Server Action redirige a /login, modal cierra (específico por el estado del modal).
- [ ] **[Doble submit]** Click rápido dos veces el botón 'Confirmar': isPending pasa a true en primer click, button.disabled=true, segundo click no ejecuta.
- [ ] **[Doble submit]** Click en la celda del mismo slot dos veces antes de cargar modal: selectedSlot state solo guardamuestra un slot a la vez, modal una sola instancia dinamica.
- [ ] **[Concurrencia]** En pestana A abrir modal para slot 09:00, en pestana B abrir el mismo slot, confirmar en B primero: B abre modal de confirmación MP; A luego confirma pero recibe error slot_taken, no redirige a MP.
- [ ] **[Concurrencia]** Múltiples reservas simultáneas (>10) en una hora del mismo admin: rate limiting adminRateLimited(tenant.id) bloquea si excede tasa, retorna error limitado.
- [ ] **[Concurrencia]** INSERT en DB visible via Realtime: hook recibe postgres_changes INSERT, normalizeRealtimeRow mapea, scheduleReconcile llama fetchFromApi despues de 400ms para backfill nombres (guestName ausente en realtime payload).
- [ ] **[Concurrencia]** UPDATE de booking en DB (ej. estado changed a no_show): Realtime UPDATE event llama setBookings, cell recalcula estado visual (rojo 'No vino').
- [ ] **[Concurrencia]** DELETE de booking en DB: Realtime DELETE event filtra ese booking_id de state, slot queda free nuevamente.
- [ ] **[Responsive]** Tablet (768px): buttons min-h-11 md:min-h-9, input min-h-11 md:min-h-10, layout adapta a pantalla. Grilla scrollable horizontal (overflow-x-auto touch-pan-x).
- [ ] **[Responsive]** Mobile (375px): tabla grilla con sticky left-0 z-10 en columna Hora, celdas 160px/court, scrolleable lateral. Dialog modal fixed, centered, max-w-md.
- [ ] **[Responsive]** Cambiar orientacion mobile: grilla mantiene sticky header + scroll, modal reflow adapta a max-w-md.
- [ ] **[A11y]** Botones navigation y duración: tabindex navegable, Enter/Space activan (onKeyDown handler en BookingCard para slots).
- [ ] **[A11y]** Slot clickeable: role='button', tabIndex=0, aria-label='Reservar turno HH:MM', keyboard Enter/Space abre modal.
- [ ] **[A11y]** Focus visible en slots y botones de navegación (ver también [Accesibilidad global](#accesibilidad-global) para tests genéricos de focus).
- [ ] **[A11y]** Error phoneError: role='alert' en <p>, announce a screen readers cuando falta teléfono.
- [ ] **[A11y]** Input labels: <label htmlFor='guestName'> linked, required indicators visibles ('(opcional)' o '(requerido si hay nombre)').
- [ ] **[A11y]** Form contrast: texto rojo-600 en alertas, fondo rojo-50, meets 4.5:1 o mejor.
- [ ] **[A11y]** Dialog focus trap: Dialog.Root + Dialog.Content, ESC cierra modal, focus vuelve a trigger (slot).
- [ ] **[Persistencia]** Refresh F5 en /grilla?date=2024-12-20: search param date preservado en URL, SSR re-fetch bookings de ese dia, grilla renderiza igual estado.
- [ ] **[Persistencia]** Abrir modal, llenar nombre, cerrar (ESC), reabrir el mismo slot: form.reset() llamado en handleOpenChange, campos limpios, duration reinicia a default.
- [ ] **[Navegacion]** Back del navegador desde /grilla?date=future: vuelve a /grilla sin date param (o anterior date param en history), grilla carga esa fecha.
- [ ] **[Navegacion]** Forward despues Back: navega adelante restoring date param, grilla carga correctamente.
- [ ] **[Deep link]** Acceso directo /grilla?date=YYYY-MM-DD con fecha invalid (ej. 2024-13-32): pagina renderiza pero date string no corresponde a dia real, slots generados con open/close defaults, sin error visible (mejor: date parser deberia validar).
- [ ] **[Deep link]** /grilla?date=pasado (ej. 2020-01-01): renderiza, todos slots isPast=true, grises, no clickeables.
- [ ] **[Visual]** Booking confirmed (estado default): fondo green-50, border-l-4 green-600, nombre+horario en verde oscuro (text-green-800).
- [ ] **[Visual]** Booking pending_payment: fondo amber-50, border-l-4 amber-500, badge 'Pendiente', texto amber-800.
- [ ] **[Visual]** Booking no_show: fondo red-50, border-l-4 red-500, badge 'No vino', texto red-700, opacidad 90%.
- [ ] **[Visual]** Booking completed: fondo slate-50, border-l-4 slate-300, badge 'Completada', texto slate-500, opacidad 80%.
- [ ] **[Visual]** Booking type='block': fondo slate-100, border-l-4 slate-400, badge 'Bloqueo', texto slate-600.
- [ ] **[Visual]** Horario en slots: tabular-nums mono font, alineados columnar.
- [ ] **[Visual]** Nombre truncado: ellipsis si > 20 chars, texto-xs.
- [ ] **[Visual]** Modal: fixed centered (left-50% top-50% -translate), z-50 encima de overlay z-40, sombra-xl, 600px max-w-md.
- [ ] **[Visual]** Offline banner: border-amber-200 bg-amber-50 texto-amber-800, tamaño px-4 py-2 text-sm.
- [ ] **[Edge]** Booking que cruza medianoche (ej. 23:00-01:00): timeStart=23:00, timeEnd=00:00, rowSpan calcula 1hr (24*60 - 23*60 = 60min). Verificar no overflow de tabla.
- [ ] **[Edge]** 50+ canchas en complejo: tabla tiene minWidth dinámico (80 + courts.length * 160px), horizontal scroll adapta, performance verificar (computeCells O(slots × courts)).
- [ ] **[Edge]** Booking con playerId=null, guestName=null (admin anónimo): card renderiza horario+status sin nombre.
- [ ] **[Edge]** Booking priceSnapshot=0 (reserva sin precio): grilla renderiza normal, no muestra precio (campo no visible en card anyway).
- [ ] **[Edge]** 8+ digitos PIN en zone sensible luego grilla: PinGate es per-zona, grilla no pide PIN (no zona sensible); en /settings/* si pide.
- [ ] **[Edge]** Cambio rapido de date: router.push(/grilla?date=X), antes de render anterior refetch, currentKey={dateStr} recomputa cells, useEffect cleanup previene race conditions.
- [ ] **[Edge]** Tenant status = 'suspended' / 'blocked' / 'canceled' / 'churned': tenant.ts check, redirect /suspended antes de entrar grilla.
- [ ] **[Edge]** Tenant status = 'trialing': grilla renderiza normal, days restantes mostrados en /settings, no afecta /grilla.
- [ ] **[Edge]** Tenant status = 'past_due': grilla renderiza normal, alerta de pago en /settings, no bloquea /grilla.
- [ ] **[Edge]** openingHours con close=24:00 o '00:00': timeSlots generator maneja closeMins=0 → 24*60, slot ultimo es 23:00.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS IDENTIFICADOS: 1) Date validation en deep links: /grilla?date=YYYY-MM-DD no valida que la fecha sea real (ej. 2024-13-32 se renderiza sin error). 2) computeCells rowSpan calculo assume slots de 60min; booking 120min genera rowSpan=2, pero si último slot de día es 23:00 y booking empieza 23:00-01:00, cálculo maneja 01:00→00:00 via 24*60 offset; verificar edge case de medianoche. 3) Realtime payload falta playerFirstName/playerLastName; hook scheduleReconcile backfilla via /api/bookings fetch, pero si hook unmount antes de 400ms timeout, reconcile queda pendiente (no crítico, siguiente event lo gatilla). 4) Validación phone: solo lado cliente en modal (inline check), server schema requiere guestName→guestPhone refine, pero si cliente lo bypasea (devtools), server rechaza; no es riesgo pero asimetría. 5) EmptyState estados: sin canchas OR cerrado hoy, pero NO hay estado de error si listCourts falla en SSR (excepto si Server Action lanza, redirect a /onboarding). 6) Rate limiting adminRateLimited puede retornar string error message, pero schema validation falla ANTES con "Datos inválidos" — no hay precedencia clara en doc. 7) Tenant context RLS: withTenantContext en SSR fetch maneja el SET LOCAL, pero si JWT tenant_id != meta.tenant_id en auth middleware, redirect /login ocurre post-middleware; grilla nunca carga datos ajenos. 8) isPast check: artNow se calcula una sola vez en useEffect(), no se refresca cada minuto; slot que pasó hace 50min sigue mostrando como futuro hasta refresh. 9) Realtime channel key 'bookings:{tenantId}' — no hay RLS policy en realtime event listener, pero supabase auth + session tenant_id implícito en connection; verificar no hay leak.

---

### 2. Confirmacion de reserva (checkout jugador)
**URL:** `/{slug}/reservar?court=...&date=...&time=...&dur=...` · **Archivo:** `src/app/(public)/[slug]/reservar/page.tsx` · **Por que P0:** Es el momento del pago. Errores aqui = perdida de conversion o cobro incorrecto.

- [ ] **[Render]** Al cargar la página de confirmación con parámetros validos (court, date, time, dur), se muestra el resumen: nombre del complejo, ciudad, cancha, fecha, hora inicio-fin, precio total, monto de seña, y botón Confirmar.
- [ ] **[Render]** Si el complejo NO requiere depósito (requiresDeposit=false o depositPercentage=0), el resumen muestra solo precio total y el mensaje 'Este complejo no requiere seña. Pagás el total en el complejo.'
- [ ] **[Render]** Si el complejo SÍ requiere depósito (requiresDeposit=true y depositPercentage>0), el resumen muestra seña (precio*depositPct/100 en centavos, formateado como $X.XX ARS) y 'Resto en el complejo' con monto restante.
- [ ] **[Render]** El campo 'Precio del turno' siempre muestra el precio completo sin importar depósito.
- [ ] **[Render]** La hora de fin se calcula correctamente: duracion=60min suma 60 a la hora inicio; duracion=120min suma 120.
- [ ] **[Happy path - No deposit]** Usuario autenticado, complejo sin depósito: clic en 'Confirmar reserva' redirige a /reserva/{bookingId}/exito (status=confirmed en DB).
- [ ] **[Happy path - With deposit]** Usuario autenticado, complejo CON depósito: clic en 'Pagar seña y reservar' redirige a checkout MercadoPago con monto=depositAmount.
- [ ] **[Happy path - LoginGate]** Usuario NO autenticado: se muestra formulario LoginGate con campos nombre, apellido, email, checkbox términos, botón 'Continuar con email'. Submit envía magic link y muestra 'Revisá tu email'.
- [ ] **[LoginGate - Validacion]** Si email está vacío, se muestra error 'Ingresá un email válido' y NO se envía magic link.
- [ ] **[LoginGate - Validacion]** Si nombre está vacío, se muestra error 'Ingresá tu nombre' y NO se envía magic link.
- [ ] **[LoginGate - Validacion]** Si email es inválido (sin @, formato malformado), se muestra error 'Ingresá un email válido'.
- [ ] **[LoginGate - Validacion]** Si checkbox de términos NO está marcado, se muestra error 'Tenés que aceptar los términos.' y NO se envía.
- [ ] **[LoginGate - Validacion]** Nombre puede tener hasta 80 caracteres; si excede, se trunca o rechaza con error.
- [ ] **[LoginGate - Validacion]** Apellido es opcional, máximo 80 caracteres, puede estar vacío.
- [ ] **[LoginGate - Validacion]** Email se normaliza (trim, lowercase) antes de validar.
- [ ] **[LoginGate - Rate limit]** Enviar 6 magic links al mismo email en 60 segundos: el 6to muestra 'Demasiados intentos. Esperá un minuto y probá de nuevo.' (authMagicLink: 5/60s).
- [ ] **[LoginGate - Estado 'sent']** Tras envío exitoso, se reemplaza formulario con card 'Revisá tu email' + icono Mail verde + texto 'Te enviamos un enlace a {email}. Hacé click para confirmar tu reserva.'
- [ ] **[LoginGate - Submit disabled]** Mientras se procesa el envío, botón muestra spinner + 'Enviando…' y está disabled.
- [ ] **[Error slot_taken]** Si entre que el jugador vio la disponibilidad y confirma, otro jugador toma el slot, redirige a reservar?court=...&error=slot_taken + muestra alert rojo 'Ese turno acaba de ser tomado. Elegí otro horario.'
- [ ] **[Error banned]** Si el jugador está globalmente baneado (player.status='banned') o baneado en ese tenant, redirige a reservar?court=...&error=banned + muestra alert rojo 'No podés reservar en este complejo actualmente.'
- [ ] **[Error unavailable]** Si la cancha está offline o el precio no se puede calcular (CourtOfflineError, PriceUnavailableError), redirige a reservar?court=...&error=unavailable + muestra alert rojo.
- [ ] **[Deep link - Invalid date]** URL con date=2099-13-45 (inválido): se muestra InvalidState 'Faltan datos del turno. Elegí un horario desde la grilla.' + botón 'Elegir otro turno' (sin crash).
- [ ] **[Deep link - Invalid date]** URL con date=25-06-2026 (formato incorrecto, no YYYY-MM-DD): se muestra InvalidState.
- [ ] **[Deep link - Invalid time]** URL con time=25:99 (hora inválida): se muestra InvalidState.
- [ ] **[Deep link - Invalid time]** URL con time=14:30:45 (formato con segundos): se muestra InvalidState (espera HH:MM).
- [ ] **[Deep link - Invalid duration]** URL con dur=90 (solo 60 o 120 válidos): se muestra InvalidState 'Faltan datos del turno...'
- [ ] **[Deep link - Invalid duration]** URL con dur=abc (no numérico): se muestra InvalidState.
- [ ] **[Deep link - Missing params]** URL sin court param: se muestra InvalidState.
- [ ] **[Deep link - Missing params]** URL sin date param: se muestra InvalidState.
- [ ] **[Deep link - Missing params]** URL sin time param: se muestra InvalidState.
- [ ] **[Deep link - Missing params]** URL sin dur param: se muestra InvalidState.
- [ ] **[Deep link - Court not found]** court=00000000-0000-0000-0000-000000000000 (UUID válido pero inexistente en ese tenant): se muestra InvalidState 'No encontramos ese turno. Puede que haya cambiado la disponibilidad.'
- [ ] **[Deep link - Slot not found]** Parámetros validos pero el slot fue ocupado entre que se generó el link y que se abre: se muestra InvalidState 'No encontramos ese turno...'
- [ ] **[Deep link - Slot no longer free]** URL con slot que tenía status!=free (booked, blocked, offline): se muestra InvalidState 'Ese turno ya no está disponible. Elegí otro horario.'
- [ ] **[Deep link - Expired slug]** URL con slug=complejo-inexistente: se muestra página 404 (notFound).
- [ ] **[Tenant unavailable - suspended]** tenant.status='suspended' y allowOnlineBooking=false: se muestra InvalidState 'Este complejo no acepta reservas online por el momento.' + botón rojo 'Elegir otro turno'.
- [ ] **[Tenant unavailable - blocked]** tenant.status='blocked': se muestra InvalidState.
- [ ] **[Tenant unavailable - canceled]** tenant.status='canceled': se muestra InvalidState.
- [ ] **[Tenant unavailable - churned]** tenant.status='churned': se muestra InvalidState.
- [ ] **[Tenant unavailable - deleted]** tenant.status='deleted': se muestra InvalidState.
- [ ] **[Tenant unavailable - allowOnlineBooking=false]** tenant.status='active' pero allowOnlineBooking=false: se muestra InvalidState.
- [ ] **[Doble submit]** Usuario autenticado hace doble clic en 'Pagar seña y reservar' en corto tiempo: rate limit playerBooking (20/60s) bloquea el 2do intento, redirige a reservar?error=rate_limited.
- [ ] **[Navegación atras]** Jugador en la página de confirmación, navega atrás con el botón del navegador: vuelve a disponibilidad sin crear booking.
- [ ] **[Navegación adelante]** Jugador cancela reserva, navega adelante: el navegador puede intentar reenviar el form pero la acción es idempotente (crea otro booking), o el servidor bloquea con rate limit.
- [ ] **[Persistencia - Reload]** Jugador completa la acción, antes de redireccionarse hace reload de la página: la acción ya ocurrió (server side), redirige normalmente tras reload.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Test único de esta vista:
- [ ] **[Auth - Otro tenant]** Jugador autenticado intenta acceder a URL de otro tenant (cambio slug en URL): se valida que el court_id pertenezca a ese tenant, si no redirige a InvalidState.
- [ ] **[Responsive - Mobile]** En viewport 375x667 (iPhone SE): resumen y botón se muestran en una columna, máximo ancho ~100%, padding adecuado.
- [ ] **[Responsive - Tablet]** En viewport 768x1024 (iPad): resumen en max-w-md (~28rem), centrado, boton 100% ancho, legible sin zoom.
- [ ] **[Responsive - Desktop]** En viewport 1920x1080: resumen en max-w-md, centrado en pantalla, bien espaciado.
- [ ] **[A11y - Labels]** Inputs en LoginGate tienen asociados correctamente con <label for>.
- [ ] **[A11y - Role alert]** Los mensajes de error (slot_taken, banned, rate_limited) tienen role='alert' para anunciarse a screen readers.
- [ ] **[A11y - Focus]** Botón primario recibe focus visible (ring-2 ring-emerald-500) al tabular.
- [ ] **[A11y - Keyboard]** Jugador puede tab a través de: LoginGate inputs → checkbox → botón Submit; Enter en el botón dispara submit; Tab en el input de botón lleva al siguiente o sale del form.
- [ ] **[A11y - Color contrast]** Alert rojo (red-700 text on red-50 bg) cumple WCAG AA (>4.5:1).
- [ ] **[A11y - Spinner]** Mientras submitea, spinner tiene aria-hidden=true (es decorativo) y el texto 'Enviando…' lo anuncia.
- [ ] **[Visual - Paddings]** Resumen tiene p-5 (padding 20px), inputs tienen px-3 py-? (paddding 12px horizontal), altura h-11 (44px botones para mobile touch).
- [ ] **[Visual - Borders]** Card de resumen: rounded-2xl border border-slate-200 bg-white shadow-sm, coherente con sistema de diseño.
- [ ] **[Visual - Icons]** CalendarDays, Clock, MapPin, Mail, ShieldCheck usan h-4 w-4, text-emerald-600 o aria-hidden=true.
- [ ] **[Visual - Overflow]** Nombre del complejo muy largo (>40 chars) no rompe layout, trunca o wrappea.
- [ ] **[Visual - Monospace]** Tiempos (HH:MM–HH:MM) y montos ($X.XX) usan tabular-nums para alineación.
- [ ] **[Visual - Precio 0]** Si price=0 (gratis), se muestra '$0.00'; depositAmount también $0.00.
- [ ] **[Visual - Centered]** Heading h1 'Confirmá tu reserva' y card de resumen están centrados en max-w-md con mx-auto.
- [ ] **[Edge - Deposit 100%]** depositPercentage=100: depositAmount=price, 'Resto en el complejo'=$0.00.
- [ ] **[Edge - Deposit < 1%]** depositPercentage=0.5, price=10000: depositAmount=Math.round(10000*0.5/100)=50 centavos=0.50 ARS (no se redondea a 0).
- [ ] **[Edge - Duracion 60 min]** dur=60, price=80000, timeStart=18:00, timeEnd=19:00 (18:00 + 60min).
- [ ] **[Edge - Duracion 120 min]** dur=120, price=150000, timeStart=14:00, timeEnd=16:00 (14:00 + 120min).
- [ ] **[Edge - TimeEnd medianoche]** timeStart=23:00, dur=60, timeEnd=00:00 (cruza medianoche, formato correcto: addMinsToHHMM maneja % 24).
- [ ] **[Edge - TimeEnd 23:59]** timeStart=22:00, dur=120, timeEnd=00:00 (modulo 24 funciona).
- [ ] **[Edge - Precio centavos]** price=10000 (100 ARS), depositPercentage=33: depositAmount=Math.round(10000*33/100)=3300 centavos ($33 ARS), resto=6700 centavos.
- [ ] **[Edge - Player balance deudor]** player_tenant_relationships.balance>0: el jugador está bloqueado para reservar online, pero la validacion ocurre en createOnlineBooking que lanza error interceptado (chequear que no rompe flujo).
- [ ] **[Edge - Anticipacion pasada]** date en el pasado (ayer), booking_advance_days=6: el servidor rechaza en validacion de disponibilidad, se muestra InvalidState.
- [ ] **[Edge - Fuera horarios complejos]** timeStart=02:00, complejo cierra a 01:00: se muestra InvalidState.
- [ ] **[Edge - Email duplicado]** Dos jugadores usan el mismo email en LoginGate: el sistema crea o usa el player_id existente, magia link redirige a /reserva/{bookingId}/exito o /api/auth/callback.
- [ ] **[MP OAuth]** tenant.mpAccessToken null: booking se crea con status=confirmed (sin cobro) o redirige a /reserva/{bookingId}/pendiente (pago diferido).
- [ ] **[MP OAuth]** tenant.mpAccessToken válido: se invoca resolveTenantGateway + createDepositPayment, genera preferencia MP con initPoint (URL checkout).
- [ ] **[Formato fecha]** date='2026-06-15' se formatea como 'Domingo, 15 de junio' (capitalizeFirst en es-AR, timeZone='UTC' para evitar desvío).
- [ ] **[Formato ARS]** 150000 centavos se formatea como '$1.500' (Intl.NumberFormat es-AR, maximumFractionDigits=0 — sin decimales).
- [ ] **[URL params preservados]** nextUrl=`/${slug}/reservar?court=...` se preserva en forms ocultos para mantener contexto en errores/redirects.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS Y HALLAZGOS CRITICOS: 1) No hay validacion servidor de que court pertenezca al tenant especificado en URL (line 51 page.tsx compara court.id === court param, pero el court se obtiene via getPublicAvailability(tenant) sin verificar tenant ownership en el controlador de acceso). Riesgo: inyeccion de court_id de otro tenant. 2) El mensaje de error 'rate_limited' en line 97 actions.ts redirige a &error=rate_limited pero NO hay condicion en page.tsx para mostrar alert (solo slot_taken y banned), el error se pierde silenciosamente. 3) LoginGate form action sendPlayerMagicLink no maneja 'sent' status adecuadamente para prevenir double-click: tras enviarse, el formulario desaparece pero si el usuario clickea el submit button que aun existe en DOM (race condition), puede reenviar. 4) El campo 'next' en LoginGate es hardcoded sin validacion server-side explícita de que sanitizeNext() lo bloquee correctamente (aunque llama sanitizeNext en line 61). 5) Cuando error='slot_taken' o 'banned', no hay boton para volver a disponibilidad (solo un alert), el jugador debe cerrar el alert o usar browser back - UX mejorable con CTA explícito. 6) Texto del alert en LoginGate no usa role='status' o aria-live, solo role='alert' sin aria-live='polite' para cambios de estado (cuando pasa a 'sent'). 7) El balance deudor (player_tenant_relationships.balance > 0) bloquea reservas pero ese check ocurre en booking.service via PlayerBannedError - confirmar que el error es atrapado y redirige a &error=banned correctamente. 8) Si date es hoy pero time ya pasó (ej. 09:00 pero son las 10:00), la validacion de disponibilidad lo rechaza en el servidor sin mensaje explícito (InvalidState genérico), no "Ese horario ya pasó". 9) Los inputs de LoginGate usan required + HTML5 validation client-side pero NO se deshabilita submit si la validacion HTML falla (useFormStatus() se activa antes), permitiendo que se envíe un form incompleto al servidor.

---

### 3. Reserva exitosa (post-pago)
**URL:** `/reserva/[bookingId]/exito` · **Archivo:** `src/app/reserva/[bookingId]/exito/page.tsx` · **Por que P0:** Estado final del flujo de pago. Errores aqui = jugador no sabe si pago o no.

- [ ] **[Render]** Cargar la página sin parámetros inválidos: el título 'Reserva confirmada' aparece con icono verde de checkmark.
- [ ] **[Render]** Con status=confirmed renderizar el resumen completo: nombre cancha, nombre complejo, fecha, hora inicio, hora fin visible en la UI.
- [ ] **[Render]** Con status=confirmed y depositStatus=not_required mostrar el texto 'Pagás $X.XX al llegar al complejo'.
- [ ] **[Render]** Con status=confirmed y depositStatus=paid mostrar el desglose: 'Seña pagada: $X.XX' y 'Resta abonar en el complejo: $Y.YY'.
- [ ] **[Render]** Con status pending_payment renderizar PaymentStatusWatcher con spinner animado en lugar del resumen completo.
- [ ] **[Render]** En estado pending_payment mostrar 'Confirmando tu pago…' como encabezado y countdown de tiempo restante visible.
- [ ] **[Render]** Verificar que el botón 'Ver mis reservas' existe y apunta a /mis-reservas.
- [ ] **[Render]** Con BookingSuccessExtras renderizar tres botones: Compartir (WhatsApp), Calendario, Cómo llegar.
- [ ] **[Render]** Con latitude y longitude válidas mostrar el mini-mapa de Leaflet (altura h-44).
- [ ] **[Render]** Sin latitude/longitude (null) no renderizar el mapa pero sí mostrar los botones de acciones.
- [ ] **[Render]** Verificar que los montos se formatean en ARS con punto como separador de decimales (ej: $1.234,50).
- [ ] **[Render]** Verificar que la hora se muestra en formato HH:MM (slice(0,5) de timeStart/timeEnd).
- [ ] **[Happy path]** Booking con status=confirmed: cargar página, verificar heading confirmada visible, verificar monto pagado en centavos convertido correctamente (10000 -> $100,00).
- [ ] **[Happy path]** Booking con depositStatus=not_required: mostrar mensaje 'Pagás $X.XX al llegar', no mostrar línea de 'Seña pagada'.
- [ ] **[Happy path]** Booking con depositStatus=paid: mostrar ambas líneas (seña + resta), verificar que remainingAmount = priceSnapshot - depositAmount es correcto.
- [ ] **[Happy path]** Hacer click en botón 'Ver mis reservas' → navegar a /mis-reservas sin error.
- [ ] **[Happy path]** Hacer click en botón 'Compartir' → abre URL de WhatsApp con texto que incluye nombre complejo, cancha y fecha.
- [ ] **[Happy path]** Hacer click en botón 'Calendario' → descarga archivo .ics con nombre reserva-{slug}-{date}.ics.
- [ ] **[Happy path]** Hacer click en botón 'Cómo llegar' → abre Google Maps en pestaña nueva con ubicación correcta.
- [ ] **[Vacio]** Booking inexistente (id uuid válido pero no existe en DB): renderizar '404 Not Found' con heading 'No encontramos tu reserva' y botón 'Ver mis reservas'.
- [ ] **[Vacio]** Booking pertenece a otro jugador (RLS blocks): renderizar la pantalla 404 idéntica al caso anterior.
- [ ] **[Vacio]** BookingId con formato uuid inválido (no es uuid): redirigir a /404 o mostrar error sin crash.
- [ ] **[Carga]** Durante polling en pending_payment, spinner está animado (animate-spin visible).
- [ ] **[Carga]** Countdowner en pending_payment decrementa segundo a segundo desde expiresAt hacia 0:00.
- [ ] **[Carga]** Nota de 'Tarda? Te avisamos' aparece después de 30 segundos de estar en pending_payment sin transición a terminal.
- [ ] **[Carga]** BookingMiniMap renderiza con ssr=false: skeleton placeholder visible primero (h-44 bg-slate-100 animate-pulse).
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones).
- [ ] **[Doble submit]** Hacer click en botón 'Ver mis reservas' dos veces rápido: navegar una sola vez, no duplicar navegaciones.
- [ ] **[Doble submit]** Botones de Compartir/Calendario/Cómo llegar pueden clickearse múltiples veces sin error.
- [ ] **[Concurrencia]** Webhook llega durante polling: PaymentStatusWatcher detecta cambio en siguiente poll (3s) y renderiza confirmed.
- [ ] **[Concurrencia]** Webhook llega ANTES de que el jugador vea pending_payment: cargar /exito directo con confirmed.
- [ ] **[Concurrencia]** Dos jugadores cargan /exito del mismo booking: ambos ven su propia pantalla de error 404 gracias a RLS.
- [ ] **[Responsive]** En mobile (375px) botones full-width, en tablet/desktop contenido centrado max-w-md. BookingSuccessExtras grid adapta de 1 col (mobile) a 3 cols (desktop).
- [ ] **[A11y]** CheckCircle2 icon tiene aria-hidden=true (no lee el icono).
- [ ] **[A11y]** PaymentStatusWatcher renderea aria-live=polite para anunciar cambios de estado a lectors de pantalla.
- [ ] **[A11y]** Spinner Loader2 tiene aria-hidden=true.
- [ ] **[A11y]** BookingMiniMap tiene aria-label='Ubicación de {tenantName}'.
- [ ] **[A11y]** Todos los botones tienen tipo button explícito o son <a> con href válido.
- [ ] **[A11y]** Links 'Ver mis reservas' son navegables con Enter/Tab; focus visible con outline.
- [ ] **[Persistencia]** Refresh la página con status=confirmed: datos se recargan desde DB correctamente, no cache stale.
- [ ] **[Persistencia]** Refresh durante polling pending_payment: mantiene la misma expiresAt (no se recalcula), countdown continúa.
- [ ] **[Navegacion]** Botón atrás del navegador tras llegar a /exito desde /mock-mp/checkout: vuelve a /mock-mp/checkout (historial preservado).
- [ ] **[Navegacion]** Deep link: abrir /reserva/[bookingId]/exito en pestaña nueva con sesión válida → carga correctamente.
- [ ] **[Deep link]** Deep link sin sesión autenticada: redirigir a /login, no cargar la reserva.
- [ ] **[Deep link]** Deep link con bookingId que pertenece a otro tenant/jugador: mostrar 404 (RLS blocks).
- [ ] **[Visual]** Verificar padding consistente: mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12.
- [ ] **[Visual]** Icon container: h-16 w-16 rounded-full bg-emerald-100 ring-8 ring-emerald-50 (estilos correctos).
- [ ] **[Visual]** Botones con color emerald-600 hover:emerald-700 transition-colors (hover state visible).
- [ ] **[Visual]** BookingSuccessExtras grid layout: grid-cols-1 gap-2 sm:grid-cols-3 (3 botones en desktop, 1 fila en mobile).
- [ ] **[Visual]** Overflow en textos muy largos (tenantName, courtName, address): no hay truncamiento no deseado, wrap normal.
- [ ] **[Edge]** depositAmount=0: mostrar 'Seña pagada: $0,00' y 'Resta abonar: $X.XX' correctamente.
- [ ] **[Edge]** priceSnapshot=0: mostrar 'Pagás $0,00' o monto restante=$0,00 sin error.
- [ ] **[Edge]** date in future by 10 years: renderizar sin errores, formato date mostrado tal cual en DB.
- [ ] **[Edge]** timeStart y timeEnd con milisegundos en la DB (HH:MM:SS.sss): slice(0,5) muestra HH:MM correctamente.
- [ ] **[Edge]** latitude/longitude como strings '0.0' o '-90.0': convertir a Number y pasar a Leaflet sin crash.
- [ ] **[Edge]** tenantName de 255+ caracteres: renderizar sin truncamiento abrupto.
- [ ] **[Edge]** Booking creado hace 15+ minutos: countdown llega a 0:00, watcher esperaría timeout/expired (si lo implementan).
- [ ] **[Edge]** createdAt con timezone UTC convertido correctamente a ART: expiresAt en ISO correcto.
- [ ] **[Edge]** PaymentStatusWatcher initialStatus=null o undefined: comportarse como pending_payment (fallback).
- [ ] **[Edge]** Webhook duplicado del mismo bookingId: polling no crea duplicados, idempotencia via processed_webhooks.
- [ ] **[Edge]** Hacer back desde /exito → si session válida regresar a /mis-reservas; si inválida redirigir a /login.
- [ ] **[Edge]** Browser con localStorage deshabilitado: Supabase auth aún funciona (cookies), página carga.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: (1) La query SQL en loadBooking no filtra por player_id explícitamente; confía en RLS. Si RLS falla silenciosamente, otro jugador podría ver la reserva (aunque el test suite lo cubre). (2) ExpiryCountdown: useState initializa 'now' con Date.now() en el constructor, puede tener race condition muy pequeña si renderiza antes del primer setInterval. (3) El componente BookingMiniMap usa dynamic import con ssr:false pero no hay fallback explícito para error de carga de Leaflet (solo skeleton). (4) formatRemaining() no maneja ms < 0 elegantemente (Math.max(0) lo previene, pero no hay UI explícita para '0:00 expirado'). (5) fmtArs() asume locales='es-AR' con ',' decimal; si el dispositivo tiene otra locale el formato puede variar. (6) PaymentStatusWatcher no detecta si polling falla permanentemente (fetch silenciosamente falla sin retry exponencial). (7) El estado 'expired' en PaymentStatusWatcher solo llega si el webhook lo actualiza; no hay timeout explícito del lado del cliente. (8) No hay manejo de status='canceled_refunded'/'canceled_no_refund' después de haber sido 'pending_payment' (salvo que el webhook lo cambie). (9) Link a 'Cómo llegar' usa google.com/maps/search pero no valida que mapsQuery sea una ubicación válida (puede no encontrar nada). (10) El cálculo de expiresAt en el endpoint /status usa createdAt en bruto sin normalización UTC, aunque la DB almacena TIMESTAMPTZ (bajo riesgo pero vale vigilar).

---

### 4. Reserva pendiente (ventana de 15 min)
**URL:** `/reserva/[bookingId]/pendiente` · **Archivo:** `src/app/reserva/[bookingId]/pendiente/page.tsx` · **Por que P0:** Ventana critica donde el jugador espera confirmacion de pago.

- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Render]** Cargar el page como player válido sin bookingId en URL: debe renderizar error genérico 'No encontramos tu reserva'.
- [ ] **[Render]** Cargar el page como player válido con bookingId UUID válido pero que pertenece a OTRO jugador: debe mostrar 'No encontramos tu reserva' (RLS las oculta).
- [ ] **[Render]** Cargar el page con bookingId inválido (no UUID): debe renderizar error 'No encontramos tu reserva' (loadBooking retorna null).
- [ ] **[Render]** Cargar el page como player válido con booking suyo en status pending_payment: debe mostrar spinner animado, countdown de 15 min y mensaje 'Confirmando tu pago…'.
- [ ] **[Render]** Verificar que se renderiza el componente PaymentStatusWatcher con initialStatus=pending_payment y expiresAt correcto (createdAt + 15 min).
- [ ] **[Render]** Verificar que el aria-live='polite' en PaymentStatusWatcher anuncia cambios de estado al lector de pantalla cuando se actualiza el status.
- [ ] **[Render]** Cargar página en mobile (375px): verificar que el layout centrado cabe sin overflow, botones son clickeables, texto legible.
- [ ] **[Render]** Cargar página en tablet (768px): verificar padding/spacing, máximo ancho 448px (max-w-md) se mantiene.
- [ ] **[Render]** Verificar sr-only span 'Reserva {bookingId}' está presente en DOM pero invisible (accesibilidad para lectores de pantalla).
- [ ] **[Happy path]** Abrir página pendiente con booking pending_payment; esperar a que webhook confirme el status a confirmed dentro de 15 min: PaymentStatusWatcher debe cambiar a estado confirmado con CheckCircle2, botón 'Ver mis reservas' con href=/mis-reservas.
- [ ] **[Happy path]** Polling cada 3s en PaymentStatusWatcher debe detectar cambio de status dentro de 3-6s de que el backend actualice; verificar que Link a /mis-reservas es funcional.
- [ ] **[Happy path]** User abre dos pestañas del mismo bookingId pendiente; una recibe webhook y cambia a confirmed: ambas pestañas deben mostrar estado confirmado (link funcional).
- [ ] **[Carga]** En loading.tsx se renderiza Skeleton con h-16 w-16 (círculo) + h-7 w-48 (título) + dos líneas más mientras el page.tsx carga (force-dynamic).
- [ ] **[Carga]** Verificar que expiresAt se calcula como ISO string de (createdAt + 15 * 60 * 1000 ms) en el servidor, pasado correctamente al cliente.
- [ ] **[Carga]** Countdown en ExpiryCountdown debe mostrar MM:SS correcto: si quedan 14:59, debe mostrar '14:59', no '15:00'.
- [ ] **[Carga]** Si user abre el page después de que el 15-min window haya expirado: loadBooking aún carga si booking existe; PaymentStatusWatcher muestra status actual (puede ser pending_payment pero countdown negativo → '0:00').
- [ ] **[Validacion]** El bookingId en URL se valida con uuid.safeParse en route /api/player/bookings/[id]/status: enviar bookingId='not-a-uuid' en polling debe retornar 400 INVALID_ID.
- [ ] **[Validacion]** El timestamp createdAt se parsea del DB; si malformado (null, inválido), el date math falla → error al calcular expiresAt. Verificar que loadBooking siempre retorna Date válida o null.
- [ ] **[Vacio]** Cargar page para booking inexistente (borrado, cancelado, no belong to player): renderiza div con texto 'No encontramos tu reserva. Revisá tus reservas en el panel.' sin spinner ni countdown.
- [ ] **[Vacio]** Verificar que el div vacío usa same layout (mx-auto, flex, min-h-dvh) para centering consistente en mobile/desktop.

- [ ] **[Error 401]** GET /api/player/bookings/[id]/status sin auth header: withPlayer retorna 401 'Autenticación requerida.' (code: AUTH_REQUIRED).
- [ ] **[Error 403]** GET /api/player/bookings/[id]/status como staff (no player): withPlayer retorna 403 'Se requiere una cuenta de jugador.' (code: PLAYER_REQUIRED).
- [ ] **[Error 404]** GET /api/player/bookings/[bookingId]/status para booking inexistente o de OTRO player (RLS oculta): retorna 404 'La reserva no existe.'.
- [ ] **[Error 404]** GET /api/player/bookings/[id]/status con bookingId='invalid-uuid': retorna 400 'ID inválido.' (code: INVALID_ID), no 404.
- [ ] **[Error 429]** El endpoint /api/player/bookings/[id]/status usa rate limit 'bookingStatus': 60 req/60s por player. Enviar >60 en 60s retorna 429 throttled.
- [ ] **[Error 429]** Verificar que failMode='open' para bookingStatus: si Upstash/Redis down, permite la request (no bloquea).
- [ ] **[Red/Timeout]** Simular network error en fetch `/api/player/bookings/{id}/status`: el catch {} silencioso en polling continúa sin que el UI muestre error. Luego, cuando la red se recupera, polling detecta el cambio.
- [ ] **[Red/Timeout]** Si fetch timeout (>default en NextFetch), setInterval continúa intentando cada 3s. Verificar que UI no se congelaa y countdown sigue andando.
- [ ] **[Red/Timeout]** Desconectar internet mientras page está abierta: countdown sigue andando (es client-side); polling falla pero se reintenta; cuando vuelve internet, status se sincroniza.
- [ ] **[Concurrencia]** Webhook llega al backend mientras user está en el page pendiente: backend transición booking pending_payment→confirmed; polling detecta y re-renderiza. Verificar que el click en 'Ver mis reservas' no intenta cambiar status nuevamente.
- [ ] **[Concurrencia]** Dos webhooks para el MISMO bookingId llegan en rápida sucesión (idempotencia via processed_webhooks): el segundo webhook es ignorado; polling ve status=confirmed una sola vez.
- [ ] **[Concurrencia]** User hace polling mientras admin en otra sesión cancela el booking (pending_payment→canceled_refunded): la siguiente poll (/api/.../status) retorna canceled_refunded; UI muestra XCircle + 'Reserva cancelada'.
- [ ] **[Permisos]** Player A intenta acceder a /reserva/[bookingId-de-PlayerB]/pendiente: extractAuthUser retorna player A; loadBooking via withPlayerContext(...playerA.id) + RLS NO ve booking de player B → null → error page.

- [ ] **[Sesion]** User abre dos tabs del mismo booking; en tab A cambia su password/logout; session invalida → tab B intenta polling y obtiene 401 → continúa intentando cada 3s (no retira la UI).
- [ ] **[Doble submit]** User hace click en 'Ver mis reservas' en estado confirmed; antes de que la navegación se complete, hace click otra vez: Link es <a> nativo, evita doble-submit a nivel HTTP.
- [ ] **[Doble submit]** Verificar que PaymentStatusWatcher no tiene botón de submit/acción (solo Links); no hay form que se pueda double-submit.
- [ ] **[Visual]** Verificar color del spinner (Loader2 animate-spin text-emerald-600) = emerald-600. Verificar el fondo del círculo (bg-emerald-100 ring-8 ring-emerald-50) es consistente.
- [ ] **[Visual]** Verificar font size de h2 'Confirmando tu pago…' = text-2xl font-bold; color = text-slate-900.
- [ ] **[Visual]** Verificar que los párrafos (<p>) usan text-sm text-slate-600 (fuente pequeña, gris). No hay contraste insuficiente (<4.5:1 WCAG AA).
- [ ] **[Visual]** Verificar que el countdown en <strong> no tiene estilos especiales (heredaPadre); formato MM:SS se ve sin cortes.
- [ ] **[Visual]** En estado confirmado, verificar que CheckCircle2 icon + 'Reserva confirmada' + botón 'Ver mis reservas' layout es idéntico (flexbox centered).
- [ ] **[Visual]** En estado expired, verificar que XCircle icon + 'La reserva expiró' + botón 'Reservar de nuevo' (href=/) layout y colores (slate vs emerald) son consistentes.
- [ ] **[Visual]** En estado canceled, verificar que XCircle icon + 'Reserva cancelada' + botón 'Ver mis reservas' (cancelados tienen bg-red-100 ring-red-50, no emerald).
- [ ] **[Edge]** Booking creado a las 10:00 UTC, user abre page a 10:14:59 (justo antes de expirar): expiresAt = 10:15:00; countdown muestra '0:01', luego '0:00'; si webhook no llegó, status sigue pending_payment.
- [ ] **[Edge]** Booking creado a las 10:00, pero NOW() en el backend está 5 min atrás (clock skew): expiresAt cálculo usa createdAt del DB (UTC real), no client-side now → resiliente.
- [ ] **[Edge]** Status en DB es 'pending_payment' pero la query de polling retorna depositStatus='not_required': el UI aún muestra spinner (status es la main gate para terminal states).
- [ ] **[Edge]** Status en DB es 'completed' o 'no_show' (TERMINAL_STATUSES): PaymentStatusWatcher no renderiza—devuelve null. Page debería NO mostrar estos estados en pendiente (son de después del evento).
- [ ] **[Edge]** Booking con deposit_amount=0 (sin seña, depositStatus='not_required') transiciona a confirmed: UI muestra 'Reserva confirmada' sin mención de seña.
- [ ] **[Edge]** Player intenta cargar /reserva/[bookingId]/pendiente 2 horas DESPUÉS de que el booking expiró (status='expired' en DB): loadBooking retorna {status:'expired', createdAt: old date}; expiresAt cálculo aún es correcto (createdAt+15min). Page abierta en otro tab vio spinner y cambió a expired hace rato.
- [ ] **[Edge]** Rate limit policy 'bookingStatus': si es hit, route returns 429 con json {ok:false, code:'RATE_LIMITED'}. Client polling ve status 429 (not ok) → catch silent, reintenta.
- [ ] **[A11y]** Teclado: abrir page en confirmed state, Tab hasta el botón 'Ver mis reservas', Enter debe navegar. Verificar focus ring visible.
- [ ] **[A11y]** Teclado: countdown es span dentro de <strong>, no interactive—no tab stop requerido.
- [ ] **[A11y]** Lector de pantalla: aria-live='polite' en PaymentStatusWatcher anuncia cambios de h2/p cuando status cambia (e.g., 'Reserva confirmada' cuando llega webhook).
- [ ] **[A11y]** Lector de pantalla: aria-hidden='true' en todos los iconos (CheckCircle2, XCircle, Loader2) para no repetir el contenido de texto.
- [ ] **[A11y]** Lector de pantalla: sr-only span 'Reserva {bookingId}' se lee pero no se ve (content no visible).
- [ ] **[A11y]** Color contrast: spinner emerald-600 sobre bg-emerald-100 = ~4.8:1 (cumple WCAG AA). XCircle red-500 sobre bg-red-100 = ~5:1.
- [ ] **[A11y]** Focus management: cuando status cambia a confirmado, el focus sigue en el spinner viejo. Podría mejorar pero no es bloqueante para v1 (aria-live lo anuncia).
- [ ] **[Persistencia]** User abre page, cierra tab, reabre tab (browser history): URL es /reserva/[bookingId]/pendiente → new page load, loadBooking nuevamente, status potencialmente diferente ahora (webhook hizo landing).
- [ ] **[Persistencia]** Refresh (F5) mientras spinner: se invoca page.tsx, loadBooking nuevamente, PaymentStatusWatcher reinicializa con nuevo initialStatus, polling reinicia—seamless.
- [ ] **[Persistencia]** Refresh mientras confirmado: loadBooking retorna status=confirmed, PaymentStatusWatcher muestra 'Reserva confirmada' + link (no vuelve a polling).
- [ ] **[Navegacion]** User abre page pendiente, luego hace back del browser: vuelve a la página anterior (e.g., /[slug]/reservar). Pendiente page no persiste en history.
- [ ] **[Navegacion]** User hace back tras haber navegado a /mis-reservas desde confirmed: vuelve al state confirmado del page (si browser cache). Booking status en DB no regresa a pending_payment.
- [ ] **[Deep link]** URL /reserva/[bookingId]/pendiente compartida a otro player: al abrir, loadBooking con ese jugador's playerId NO ve el booking (RLS) → error page 'No encontramos tu reserva'.
- [ ] **[Deep link]** URL /reserva/[bookingId]/pendiente con typo en UUID: no valida en page.tsx (params.bookingId es string raw); loadBooking ejecuta pero WHERE b.id = $1 con UUID inválido = null → error page.
- [ ] **[Deep link]** URL /reserva/invalid/pendiente donde 'invalid' no es uuid: page.tsx lo pasa a loadBooking("invalid", playerId); la query raw SQL se ejecuta con cast implícito fallido o null match → error page.

> ⚠️ **Riesgo detectado en codigo:** BUGS Y RIESGOS DETECTADOS:

1. **Sin redirect automático en PaymentStatusWatcher**: El componente usa Link (navegación manual) en lugar de useRouter/redirect(). No hay hardredirect a /exito o /error. User debe clickear el link manualmente. Checklist pedía 'redirige a /exito' y 'redirige a /error'—no ocurre automáticamente.

2. **Falta manejo para status='completed' y 'no_show'**: TERMINAL_STATUSES incluye estos estados, pero PaymentStatusWatcher no tiene case para ellos. Si un booking transiciona a completed/no_show (imposible en v1 ya que solo pending→confirmed/canceled/expired), el componente devolvería null. El fallback 'default: pending_payment' nunca la mostraría.

3. **Countdown puede mostrar negativos**: Si user abre el page 20 min después de creación (expiración pasada), ExpiryCountdown calcula remaining = new Date(expiresAt).getTime() - now, que será negativo → formatRemaining(negative) → '0:00' (clamped a Math.max(0, ...)). Sin embargo, el status en DB ya sería 'expired' (background job). Si status es aún pending_payment por lag, countdown negativo podría confundir.

4. **Rate limit failMode='open'**: Si Redis/Upstash cae, bookingStatus permite unlimited polling (failMode='open'). Podría ser DoS sin protección en outage.

5. **No manejo visual de error de polling**: Si GET /api/player/bookings/.../status falla con 4xx/5xx (error no '404'), el catch {} silencio no lo reporta. User sigue viendo spinner indefinidamente sin feedback.

6. **Delay note después de 30s sin visual indicator de problemas**: showDelayNote aparece a los 30s con texto 'Tarda? Te avisamos por email apenas se confirme.' pero no hay CTA para cancelar o reintentar manualmente.

7. **Deep link a booking de otro tenant**: Si booking pertenece a tenant suspendido/blocked/canceled, y player intenta acceder vía deep link, loadBooking usa RLS via withPlayerContext que solo filtra por player_id (no tenant_status). Pero la URL del page no incluye tenant slug, así que no hay visible feedback de qué complejo es. RLS previene el acceso pero UX vacío.

8. **Conversión de timestamp createdAt**: page.tsx y /exito cargabajo loading.tsx Skeleton; ambas páginas son force-dynamic. Si hay cache key collision o SSR inconsistency, createdAt podría ser estale. Mitigado por cache-bust en polling (?t=Date.now()).

9. **No validación del formato ISO de expiresAt**: PaymentStatusWatcher recibe expiresAt como string ISO, pasado directo a ExpiryCountdown. Si no es válido, new Date(expiresAt) resulta en Invalid Date → NaN en countdown. Mitigado porque el servidor lo calcula; pero sin schema validation en el cliente.

10. **Posible race condition SSR→client hydration**: page.tsx renderiza PaymentStatusWatcher con initialStatus. Si el servidor tarda >3s y el polling ya actualizó el status, hay un flash de estado viejo. Mitigado por useEffect que reinicializa polling.

11. **Link href sin validación en confirmed/canceled states**: Links usan hardcoded href='/mis-reservas', '/', etc. Si esas rutas no existen o están protegidas, user queda atrapado. No hay fallback.

---

### 5. Reserva con error de pago
**URL:** `/reserva/[bookingId]/error` · **Archivo:** `src/app/reserva/[bookingId]/error/page.tsx` · **Por que P0:** Comunicar fallo de pago claramente evita soporte innecesario.

- [ ] **[Render]** Cargar /reserva/[bookingId]/error con usuario jugador autenticado dentro de la ventana de 15 min con booking valid en pending_payment: página renderiza con heading "El pago no se procesó.", icono XCircle rojo, descripción "El pago fue rechazado o cancelado. Podés intentar de nuevo con otro medio.", y botón "Reintentar pago" visible en verde.
- [ ] **[Render]** Cargar /reserva/[bookingId]/error con booking expired (más de 15 min desde createdAt): página renderiza con heading "El pago no se procesó.", pero botón "Reintentar pago" NO aparece, solo aparece Link "Reservar de nuevo" en verde apuntando a /${tenantSlug}.
- [ ] **[Render]** Cargar /reserva/[bookingId]/error cuando booking.tenantSlug es null (tenant deletedo o no encontrado): link "Reservar de nuevo" apunta a '/' en lugar de /${slug}.
- [ ] **[Render]** Verificar loading skeleton mientras se carga la página: debe mostrar Skeleton h-16 w-16 rounded-full, tres skeleton de texto con h-7 w-48, h-4 w-56, h-4 w-40 antes de renderizar contenido real.
- [ ] **[Happy path]** Usuario con bookingId válido dentro de ventana de 15 min hace clic en botón "Reintentar pago": la acción retryDepositPaymentAction se ejecuta, validando el bookingId (UUID válido), que el jugador actual es el dueño del booking, que el status es pending_payment; si todo es válido redirige a MercadoPago checkout.
- [ ] **[Happy path]** Después de hacer clic "Reintentar pago" dentro de ventana, jugador es redirigido a /mock-mp/checkout?booking=<bookingId> o a URL real de MP: booking mantiene status pending_payment en DB, un nuevo registro de pago se crea, y bookings.payment_id se actualiza al nuevo payment_id.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos:
- [ ] **[Validacion]** bookingId no es UUID válido (ej: "invalid-id" o "123"): retryDepositPaymentAction redirige a '/' sin procesar.
- [ ] **[Validacion]** bookingId es UUID válido pero booking no existe en DB: retryDepositPaymentAction redirige a '/', sin error página blanca.
- [ ] **[Validacion]** bookingId existe pero pertenece a otro jugador (IDOR): retryDepositPaymentAction redirige a '/' sin revelar existencia del booking, sin mutar DB.
- [ ] **[Validacion]** bookingId existe pero no está en estado pending_payment (ej: confirmed, canceled_refunded, completed): retryDepositPaymentAction redirige a /reserva/${bookingId}/exito si webhook ya llegó, sin permitir reintentar.
- [ ] **[Rate limit]** Jugador hace clic en "Reintentar pago" 3+ veces en < 60s (rate limit playerBooking 20/60s): tercer clic redirige a /reserva/${bookingId}/error (no cambia URL pero recarga página), sin crear nuevos registros de pago.
- [ ] **[Sesion]** Sesión Supabase expira entre el renderizado de la página y el clic en "Reintentar pago": extractAuthUser retorna null, retryDepositPaymentAction redirige a /login, booking no se muta.
- [ ] **[Sesion]** Cookie de sesión es borrada manualmente antes de hacer clic "Reintentar pago": getUser() en extractAuthUser retorna error, redirige a /login, no hay mutación.
- [ ] **[Permisos IDOR]** Jugador A abre /reserva/[bookingId]/error de un booking creado por Jugador B (bookingId válido pero pertenece a otro): loadBooking via withPlayerContext + RLS retorna null (no error), página se renderiza como si booking no existiera ("No encontramos tu reserva" implicado por lógica), Link apunta a /mis-reservas o home.
- [ ] **[Permisos multi-tenant]** Jugador A y Jugador B comparten un tenant, Jugador A intenta hacer clic Reintentar en booking de B: withPlayerContext con playerId=A + RLS dual en bookings (by app.current_player_id) filtra el booking, retryDepositPaymentAction redirige a /.
- [ ] **[Vacio]** Cuando loadBooking retorna null (booking no encontrado o purga por RGPD): página no renderiza heading "El pago no se procesó", sino que mostraría estado de fallback (actualmente not handled en el component—riesgo: blank page o error layout).
- [ ] **[Doble submit]** Dos eventos de submit del formulario se disparan en < 500ms (doble clic, JavaScript manual): el servidor procesa solo el primero, redirige a MP, el segundo intento encuentra rate limit o redirige nuevamente sin mutar booking dos veces (la re-invocación de createDepositPayment es idempotente, solo actualiza bookings.payment_id).
- [ ] **[Concurrencia]** Mismo jugador con dos pestañas abiertas en /reserva/[bookingId]/error: clic "Reintentar pago" en pestaña A redirige a MP y crea payment nuevo; pestaña B hace clic segundos después y vuelve a ejecutar retryDepositPaymentAction, creando un segundo payment pendiente (ambos en DB, bookings.payment_id apunta al último, no hay error visto por jugador pero dos payments en tabla).
- [ ] **[Concurrencia]** Webhook de MP llega y confirma booking entre el clic de Reintentar y antes de que el jugador sea redirigido a MP: retryDepositPaymentAction en línea 177-179 detecta que status ya no es pending_payment, redirige a /reserva/${bookingId}/exito, jugador ve página de éxito en lugar de checkout.
- [ ] **[Concurrencia]** Webhook duplicado o tardío: processed_webhooks tabla de idempotencia evita que el mismo webhook_id (ej: mercadopago event_id) mute booking dos veces; retryDepositPaymentAction es agnostico a esto pero createDepositPayment puede crear múltiples payments (idempotencia por (booking_id, type) no existe en schema, solo por payment_id en webhooks).
- [ ] **[Responsive]** Viewport 375px (iPhone SE): página centrada, max-w-md respetado, texto no desborda, botón toca altura h-11 y es clickeable (min 44px height), padding horizontal px-4 = 16px a cada lado.
- [ ] **[Responsive]** Viewport 768px (iPad): max-w-md sigue siendo max, página no expande a ancho completo, icono XCircle y layout centrado visualmente balanceado.
- [ ] **[Responsive]** Viewport 1920px (desktop): max-w-md sigue siendo max (384px), centered, no hay overflow, layout no expande innecesariamente.
- [ ] **[A11y]** XCircle icon tiene aria-hidden="true": screen reader no anuncia "circle" redundante (heading ya comunica el error).
- [ ] **[A11y]** SR-only span "Reserva {bookingId}" está presente para usuarios sin vista: communica al screen reader que la página es para este booking específico.
- [ ] **[A11y]** Botón "Reintentar pago" tiene h-11 (44px min height), px-6, font-semibold visible, contraste blanco sobre bg-emerald-600 cumple WCAG AA 4.5:1, hover state es visible (bg-emerald-700).
- [ ] **[A11y]** Navegación por teclado: Tab avanza al botón (Reintentar pago o Reservar de nuevo), Enter activa submit o Link, focus ring visible sobre botón (Tailwind default ring, si no aplicado—riesgo: no hay focus-visible explícito).
- [ ] **[A11y]** Rol de Link "Reservar de nuevo": screen reader lo identifica como link (role=link implícito de <Link> Next.js), href visible en URL bar, no hay confusion con botón.
- [ ] **[Visual]** Icono rojo XCircle (text-red-600) sobre fondo claro (bg-red-100) con ring-8 ring-red-50 crea círculo concéntrico de tonos rojos, altura w-16 h-16 y padding interno visible (flex center), consistente con brand error.
- [ ] **[Visual]** Heading h1 "El pago no se procesó." es text-2xl font-bold tracking-tight color text-slate-900: contraste suficiente sobre blanco, tamaño legible.
- [ ] **[Visual]** Párrafo descripción color text-slate-600 (gris), text-sm: contraste 4.5:1+ sobre blanco, legible pero softer que heading.
- [ ] **[Visual]** Espaciado vertical: mb-5 entre icono y heading, mt-3 entre heading y párrafo, mt-8 entre párrafo y botón, mt-2 entre párrafos si hay multiple (pendiente: estructura de multi-párrafos no existe en current code pero prep para extensiones).
- [ ] **[Visual]** Botón tiene inline-flex h-11 items-center (verticalmente centrado), rounded-lg (border radius suave), px-6 (padding horiz), text-sm font-semibold (peso y tamaño consistente), transición smooth via transition-colors en hover.
- [ ] **[Visual]** Layout principal es flex min-h-dvh (dynamic viewport height) flex-col items-center justify-center: center verticalmente y horizontalmente en pantalla, mx-auto max-w-md lo limita a 384px de ancho, px-4 en top container = 16px gutters en mobile.
- [ ] **[Visual]** Overflow text muy largo: heading y párrafo no tienen overflow-hidden, long text puede wrap múltiples líneas o truncarse con... (no está aplicado—riesgo: puede desbordarse en viewports angostos si slug o tenantSlug es muy largo).
- [ ] **[Deep link]** Acceso directo a /reserva/[uuid]/error sin navegar desde checkout: extractAuthUser redirige a /login si no hay sesión, si hay sesión loadBooking consulta por playerId via withPlayerContext + RLS y retorna null si no es owner, mostrando página en blanco (riesgo).
- [ ] **[Deep link]** URL con bookingId que es string pero no UUID válido (ej: /reserva/not-a-uuid/error): retryDepositPaymentAction rechaza regex UUID_RE, pero loadBooking aún intenta queries—Drizzle y Postgres pueden no encontrar coincidencias (null retorno).
- [ ] **[Navegacion]** Botón Reintentar hace POST con formAction=retryDepositPaymentAction: cliente debe javascript activado para que form envíe; sin JS, formulario intenta POST a la misma página (sin handler en servidor)—riesgo: necesita mecanismo de fallback o advertencia.
- [ ] **[Navegacion]** Link "Reservar de nuevo" en href=`/{tenantSlug}` abre nueva navegación: si tenantSlug es null fallback es href="/", navegación es segura (no error), pero no es específico al complejo original—riesgo: UX pobreza, deja al jugador en home en lugar de back al complejo.
- [ ] **[Persistencia]** Refresh F5 en /reserva/[bookingId]/error: force-dynamic=true previene cacheo, loadBooking consulta DB nuevamente, página re-renderiza con datos frescos (status y timestamps actuales), sin stale data.
- [ ] **[Persistencia]** Cambio de booking status a confirmed en DB entre render inicial y clic de reintentar: retryDepositPaymentAction línea 177 detecta status !== pending_payment, redirige a /exito, no permite reintentar (detectado correctamente).
- [ ] **[Persistencia]** Cambio de booking status a expired (si existe ENUM expired) entre render y clic: loadBooking ya renderizó página con withinWindow=true (15 min check), pero retryDepositPaymentAction valida status === pending_payment, redirige a /exito si expired, previniendo reintento en estado inválido.
- [ ] **[Edge]** Tenant borrado (tenant.id inválido) después de que booking fue creado: loadBooking JOIN tenants retorna tenantSlug=null, página renderiza botón Reintentar, clic ejecuta retryDepositPaymentAction, consulta tenant por id falla (no encontrado), mpAccessToken es null, redirige a /reserva/${bookingId}/pendiente (fallback sin MP).
- [ ] **[Edge]** MP credentials (mpAccessToken) expiradas o revocadas: retryDepositPaymentAction obtiene mpAccessToken en línea 191, resolveTenantGateway con token inválido, createDepositPayment puede fallar con error de gateway, propagado (no es `catch`-ed), potencial 500 error.
- [ ] **[Edge]** Booking con depositAmount=0, depositStatus=not_required: user navega desde checkout (no hay pago MP requerido), llega a /error page (implausible pero si ocurre): form intenta reintentar, createDepositPayment crea un payment (incluso si no requerido), comportamiento graceful pero lógicamente inconsistente.
- [ ] **[Edge]** Booking con status=pending_payment pero payment_id ya asignado (partial webhook): retryDepositPaymentAction permite reintentar, createDepositPayment crea segundo payment (no unique constraint en schema), bookings.payment_id apunta al nuevo, el viejo payment queda orfano en tabla payments.
- [ ] **[Edge]** Extremo de ventana: booking creado exactamente hace 15:00 minutos (15 * 60 * 1000 ms), now === createdAt + 15min: línea 35 evalúa `> now`, entonces withinWindow=false (ventana cerrada), botón Reintentar no aparece, solo "Reservar de nuevo" mostrado—UX es correcta (ventana expirada por 1ms).
- [ ] **[Error 401]** extractAuthUser retorna null (sin sesión): redirect('/login') en línea 27, response es 307 redirect, no hay content body, navegador sigue redirect a /login.
- [ ] **[Error 403]** No hay verificación explícita 403 en el código, pero RLS en loadBooking puede resultar en 0 filas (null retorno) que se trata como 404 implícito, no como 403.
- [ ] **[Error 404]** booking no encontrado en loadBooking (null return): página se renderiza sin contenido visible (no hay condicional if (!booking))—RIESGO CRÍTICO: se renderiza heading "El pago no se procesó" + botón Reintentar aunque no sea el estado real; debería haber if (!booking) return fallback similar a /exito page.
- [ ] **[Error 404]** retryDepositPaymentAction con bookingId válido pero no encontrado: línea 175 redirige a '/', no 404 page, silent failure user experience.
- [ ] **[Error 429 Rate Limit]** playerBooking rate limit excedido (20/60s): línea 162 en retryDepositPaymentAction redirige a /reserva/${bookingId}/error (recarga la misma página), no hay toast/error mensaje visible, user no sabe por qué reintentar no funciona—UX opaca.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: (1) Línea 29 en page.tsx: loadBooking retorna null si booking no existe, pero no hay condicional if (!booking) antes de usar booking en línea 34-35, lo que causaría TypeError null.status; debería renderizar fallback UI como en /exito page. (2) Línea 59: Link href fallback a '/' cuando tenantSlug es null es silencioso; no hay error estado, deja jugador en home en lugar de redirigir a complejo original. (3) Línea 46: span sr-only usa bookingId sin sanitizar, aunque es UUID validado, buena práctica. (4) Falta focus-visible en botón: no hay outline-offset o focus:ring explícito para a11y de teclado. (5) retryDepositPaymentAction línea 199-200: createDepositPayment se re-invoca, permitiendo múltiples payments pendientes en tabla (idempotencia débil—sin UNIQUE constraint en (booking_id, type)). (6) No hay toast/banner visible para rate limit 429; user hace clic pero nada ocurre aparentemente. (7) Página renderiza incluso cuando booking no existe (si loadBooking retorna null), no hay if-check; plantilla se aplica a datos null—crash esperado en prod.

---

### 6. Login (magic link)
**URL:** `/login` · **Archivo:** `src/app/(auth)/login/page.tsx` · **Por que P0:** Sin login no existe ningun flujo autenticado.

- [ ] **[Render]** Al cargar /login sin autenticación, verificar que aparecen: heading 'Iniciá sesión', párrafo 'Te enviamos un enlace mágico', input email con label, botón 'Enviar enlace mágico', link 'Creá tu cuenta' (register), y en desktop el panel hero con imagen de cancha está visible.
- [ ] **[Render]** En mobile (viewport <1024px), verificar que: el panel hero NO está visible, el botón 'Volver' aparece en esquina superior izquierda, logo TG está visible, grid es single-column y responsive.
- [ ] **[Render]** En desktop (viewport >=1024px), verificar que: la grid muestra 2 columnas, el panel izquierdo (hero) con imagen, overlay gradient y testimonio de Marcelo es visible, botón 'Volver' está hidden.
- [ ] **[Happy path]** Completar el flujo básico: escribir email válido (ej. test@complejo.com), hacer click en 'Enviar enlace mágico', verificar que la página transiciona al estado SentState mostrando: heading 'Revisá tu email', email en bold, icon Mail, link 'probá de nuevo' y mensaje 'Hacé click para entrar'.
- [ ] **[Happy path]** En SentState, el email mostrado coincide exactamente con el que se envió (manejo case insensitive: TEST@COMPLEJO.COM → test@complejo.com).
- [ ] **[Validacion]** Email vacío/solo espacios: hacer click en submit sin completar → HTML5 browser validation previene submit (type='email' requerido); verificar que no avanza a SentState.
- [ ] **[Validacion]** Email inválido sin @: llenar 'notanemail', hacer click en submit → error servidor 'Ingresá un email válido.' aparece bajo el input con role='alert', aria-invalid=true en el input, NO avanza a SentState.
- [ ] **[Validacion]** Email inválido con @ pero sin dominio (ej. test@): hacer click en submit → error 'Ingresá un email válido.' aparece, aria-invalid=true, NO avanza a SentState.
- [ ] **[Validacion]** Email con espacios al inicio/final (ej. '  test@complejo.com  '): server-side `.trim()` limpia, envío debe funcionar normalmente; verificar SentState con email trimmed.
- [ ] **[Validacion]** Email en mayúsculas (ej. TEST@COMPLEJO.COM): server-side `.toLowerCase()` convierte, envío funciona; SentState muestra 'test@complejo.com'.
- [ ] **[Validacion]** Email extremadamente largo (250 caracteres + dominio): servidor rechaza con 'Ingresá un email válido.', input tiene aria-invalid=true.
- [ ] **[Validacion]** Email con caracteres especiales/emoji (ej. test+tag@complejo.com): Zod rechaza con mensaje de error, aria-invalid=true, NO avanza.
- [ ] **[Validacion]** Email válido pero no registrado aún (nuevo): servidor envía magic link normalmente, SentState aparece (STaff se crea en callback).
- [ ] **[Carga]** Mientras se envía el email, verificar que: botón deshabilitado (disabled=true), texto cambia a 'Enviando…', spinner Loader2 aparece y anima, usuario NO puede hacer click.
- [ ] **[Carga]** Si el envío toma >1 segundo, el spinner sigue animando sin saltar pasos, botón sigue deshabilitado hasta que estado cambia a sent/error.
- [ ] **[Error 400]** Email inválido por servidor (edge case de validación): error 'Ingresá un email válido.' aparece, aria-invalid=true, botón re-habilitado, usuario puede reintentar.
- [ ] **[Error 429]** Rate limit: 6 envíos en 60s con el mismo email → sexto intento falla con error 'Demasiados intentos. Probá de nuevo en un minuto.', aria-invalid=true, botón re-habilitado.
- [ ] **[Error 429]** Verificar que rate limit se cuenta por EMAIL (case-insensitive), no por IP: test@complejo.com y TEST@COMPLEJO.COM comparten el mismo bucket de 5 intentos/60s.
- [ ] **[Error 500]** Si Supabase signInWithOtp falla (network/timeout): error 'No pudimos enviar el email. Probá de nuevo.' aparece, aria-invalid=true, botón re-habilitado, usuario puede reintentar inmediatamente.
- [ ] **[Red/Timeout]** Simular timeout de red durante submit: servidor devuelve error 'No pudimos enviar el email', UI se recupera, usuario permanece en FormCard, botón deshabilitado se re-habilita.
- [ ] **[Red/Timeout]** Simular servidor caído (5xx repetido): múltiples reintentos con mismo email muestran error consistente, no crash, UI sigue responsiva.
- [ ] **[Sesion]** Completar login magic link en otra pestaña, volver a esta pestaña con /login abierto: verificar que la página NO redirige automáticamente (no hay Realtime en auth layout), usuario debe refresh o navegar manualmente.
- [ ] **[Sesion]** Si JWT expira después de 30 días (refresh token), usuario intenta enviar magic link: request se procesa normalmente (no requiere sesión previa), email se envía.
- [ ] **[Doble submit]** Llenar email, hacer click en botón, esperar carga, hacer click nuevamente mientras está deshabilitado: segundo click no genera segundo envío (disabled=true + useFormStatus previene).
- [ ] **[Doble submit]** Usar JavaScript para forzar dos submit mientras uno está pending (ej. form.submit() en consola): comportamiento indeterminado esperado, pero rate limit lado servidor previene 2 emails en el mismo segundo.
- [ ] **[Navegacion]** Desde FormCard, hacer click en 'Creá tu cuenta' → navega a /register sin perder estado del formulario (link estándar, no client-side state).
- [ ] **[Navegacion]** Desde SentState, hacer click en 'probá de nuevo' → vuelve a FormCard (estado reseteado a 'idle'), input vacío, listo para nuevo email.
- [ ] **[Navegacion]** Desde FormCard, hacer click en 'Volver' (mobile) o link TG (desktop) → navega a / (landing), no se pierde nada (es navegación simple).
- [ ] **[Navegacion]** Browser back button desde SentState → vuelve a FormCard (estado puede estar en history, depende del navegador; idealmente debería volver a 'idle').
- [ ] **[Navegacion]** Browser back button desde FormCard → vuelve a página anterior (ej. /) si es la primer vez, o muestra /login nuevamente si fue reciente.
- [ ] **[Deep link]** Navegar directo a /login?invalid_param=123 → parámetro ignorado, página carga normalmente en estado idle.
- [ ] **[Deep link]** Intentar navegar a /login#token=abc o /login?code=xyz → parámetros ignorados (auth callback maneja ?code en /api/auth/callback, no /login).
- [ ] **[Visual]** Verificar padding/margin consistentes: input tiene 3.5 (px-3.5), botón h-11 = 44px, espaciado vertical (space-y-4, space-y-6), borders emerald-500 en focus.
- [ ] **[Visual]** En error, el mensaje rojo ('text-red-600', 'text-xs') aparece directamente bajo el input sin saltos de línea, sin truncamiento con 100 caracteres de texto de error.
- [ ] **[Visual]** En SentState, el icono Mail (h-6 w-6, text-emerald-700) está centrado en círculo (bg-emerald-100, h-14 w-14), alineación vertical/horizontal OK.
- [ ] **[Visual]** Focus ring: al tablear al input, ring emerald-500 2px aparece alrededor del input; al tabular al botón, ring emerald-500 2px aparece alrededor del botón; z-index no causa ocultamiento.
- [ ] **[A11y]** Input email tiene label 'Email' asociada correctamente (htmlFor='email', id='email'), acceso por label en AT.
- [ ] **[A11y]** Input email tiene aria-invalid=true solo cuando status='error', aria-invalid=undefined en 'idle'/'sent'.
- [ ] **[A11y]** Mensaje de error tiene role='alert' → anunciado automáticamente por screen reader cuando aparece.
- [ ] **[A11y]** Botón submit es <button type='submit'> con texto visible 'Enviar enlace mágico' (o 'Enviando…'), accesible por AT.
- [ ] **[A11y]** Taborder: tab entra al input, luego al botón, saltos lógicos sin trampa; shift+tab retrocede.
- [ ] **[A11y]** Contraste: texto slate-900 en white/slate-50 cumple WCAG AA (4.5:1+); texto error red-600 en white cumple WCAG AA.
- [ ] **[A11y]** Links en SentState son <Link> Next.js (o <a>, ambos OK): 'probá de nuevo' (text-emerald-700, underline al hover) es accesible por teclado.
- [ ] **[A11y]** Placeholder 'vos@complejo.com' es texto descriptivo, NO reemplaza el label 'Email'.
- [ ] **[Persistencia]** Escribir email, hacer click en enviar, verificar que el input NO guarda el valor en localStorage/sessionStorage (idealmente se vacía tras envío correcto).
- [ ] **[Persistencia]** Si el servidor retorna error, el email escrito permanece en el input para re-intentar sin reescribir.
- [ ] **[Edge]** Email válido pero inactivo (ej. cuenta baneada o tenant suspendido): server permite envío de magic link normal (auth no valida estado de tenant en /login, eso es en callback), SentState aparece.
- [ ] **[Edge]** Mismo email registrado como admin y jugador (impossible en Supabase, pero hipotético): post-callback, JWT determines role (admin vs player), /login solo inicia OTP, callback define rol.
- [ ] **[Edge]** Email ya en uso: Supabase signInWithOtp no rechaza (reutiliza usuario), magic link se envía al mismo usuario; SentState aparece (es el flujo normal de login reiterativo).
- [ ] **[Edge]** Email con + addressing (test+admin@complejo.com vs test@complejo.com): ambos son válidos, Zod no rechaza, se envían magic links separados (Supabase trata como usuarios distintos por default).
- [ ] **[Edge]** Fuerte de conexión lenta: submit demora 5+ segundos, spinner sigue visibles sin timeout timeout visual, botón permanece deshabilitado (no hay timeout de fetch visible; dependería de NODE_ENV timeout global).
- [ ] **[Responsive]** En tablet (768px): grid 1 col, logo TG visible, input y botón a ancho completo (max-w-md = 448px), readable.
- [ ] **[Responsive]** En desktop pequeño (1024px): transición grid 1→2 cols, panel hero aparece bruscamente, layout no quiebra.
- [ ] **[Responsive]** Zoom 200%: texto no se superpone, input/botón siguen clickeables, no scroll horizontal forzado.
- [ ] **[Permisos]** Usuario anónimo sin JWT: puede acceder a /login y usar el formulario normalmente (no hay protección, es pública).
- [ ] **[Permisos]** Si admin_storageState ya existe en cookies, /login SÍ es visible y funcional (no hay redirect a /dashboard automático en /login).
- [ ] **[Visual error]** Botón disabled mientras carga: opacity-60, sin translate (translate-y-0), sin shadow interactivo, visualmente distinguible de estado normal.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: (1) NO HAY REDIRECCIÓN SI YA AUTENTICADO: Un usuario que llega a /login con JWT válido en cookies puede ver el formulario. El auth layout no valida ni redirige. Recomendación: agregar validación en layout o usar layout redirect. (2) RATE LIMIT MESSAGING: El error dice 'minuto' pero la ventana es exactamente 60s; si el usuario reintenta en segundo 59, debe esperar 1s más. Claridad discutible. (3) SOLO VALIDACIÓN SERVIDOR-SIDE PARA FORMATO: Aunque HTML5 type='email' hace validación nativa, un navegador sin JavaScript o tan viejo que no valida permitiría submit inválido; servidor valida pero el flujo no es óptimo. (4) MISSING RETRY LOGIC: Si Supabase falla, no hay botón 'Reintentar' visible; usuario ve solo error genérico. (5) NO TIMEOUT VISUAL: Si conexión es muy lenta (5+ seg), no hay esqueleto o timeout message, botón solo permanece disabled indefinidamente. (6) CASE SENSITIVITY EN RATE LIMIT: La política usa 'email' como key después de `.toLowerCase()` (correcto), pero no hay documentación de esto en el error. (7) NO PREVENCIÓN DE XSS EN ERRORES: Si Supabase retorna un error personalizado en campo 'message', se renderiza en `<p role='alert'>` sin sanitización explícita. Riesgo bajo si message es trusted, pero se debe validar. (8) SUPABASE OTP BEHAVIOR: El código confía en que Supabase siempre acepta signInWithOtp; si hay validaciones de dominio o throttling en Supabase mismo, no hay feedback. (9) NO TEST E2E DE PLAYER MAGIC LINK DESDE /login: Los tests actuales (admin-login.spec.ts) cubren el flujo básico pero no el path full jugador sin autenticar.

---

### 7. Verificacion de magic link
**URL:** `/verify` · **Archivo:** `src/app/(auth)/verify/page.tsx` · **Por que P0:** Es donde el login se completa. Falla = usuario no puede entrar.

- [ ] **[Render]** Cargar /verify sin parámetro error: mostrar spinner verde circular (h-14 w-14) con icono Loader2 animado, texto "Verificando tu enlace…", subtítulo "Esto tarda un instante. No cierres esta pestaña.", fondo gradiente slate-emerald, logo TG clickeable a home.
- [ ] **[Render]** Cargar /verify?error=invalid: mostrar alerta roja circular con AlertCircle, titulo "No pudimos verificar tu enlace", mensaje del diccionario ERROR_COPY, botón "Volver a intentar" (href=/login), NO mostrar spinner ni Loader2.
- [ ] **[Render]** Cargar /verify?error=expired: mostrar mensaje ERROR_COPY["expired"] = "Este enlace expiró. Generá uno nuevo desde Iniciar sesión." y botón "Volver a intentar".
- [ ] **[Render]** Cargar /verify?error=used: mostrar mensaje ERROR_COPY["used"] = "Este enlace ya fue utilizado. Iniciá sesión nuevamente." y botón "Volver a intentar".
- [ ] **[Render]** Cargar /verify?error=exchange_failed: mostrar mensaje ERROR_COPY["exchange_failed"] = "No pudimos completar el inicio de sesión. Probá de nuevo." y botón "Volver a intentar".
- [ ] **[Render]** Cargar /verify?error=CODIGO_NO_DOCUMENTADO (ej: unknown, server_error): mostrar el fallback ERROR_COPY.invalid (mensaje genérico "No pudimos verificar el enlace. Probá de nuevo.").
- [ ] **[Happy path]** Administrador hace click en magic link con código válido: /verify sin error param → API callback intercambia el código → sesión exitosa → redirect automático a /dashboard (1 tenant) O /select-tenant (N tenants) O /onboarding (0 tenants).
- [ ] **[Happy path]** Jugador hace click en magic link con código válido: /verify sin error param → API callback intercambia código → player_id en JWT → redirect a parámetro next sanitizado o fallback /mis-reservas.
- [ ] **[Happy path - Redirect con next param]** Magic link generado con ?next=/mi-slug/reservar → callback valida sanitizeNext() y redirige a /mi-slug/reservar (no a fallback /mis-reservas).
- [ ] **[Happy path - Redirect seguro]** Magic link con ?next=//evil.com rechazado: sanitizeNext retorna /mis-reservas (fallback) en lugar de redirigir a dominio externo.
- [ ] **[Happy path - Redirect seguro]** Magic link con ?next=/\\backslash evitado: sanitizeNext retorna /mis-reservas (fallback), no interpreta / invertida.
- [ ] **[Happy path - Redirect fallback]** Magic link sin ?next param o next=null → callback redirige al fallback /mis-reservas.
- [ ] **[Error HTTP 400]** Callback recibe ?code= vacío o omitido: codeSchema.safeParse falla → redirectVerifyError(req, 'invalid') → /verify?error=invalid.
- [ ] **[Error HTTP 400]** Callback recibe ?code=STRING_MUY_LARGO (>512 caracteres): validación Zod max(512) falla → /verify?error=invalid.
- [ ] **[Error exchange_failed]** Supabase.auth.exchangeCodeForSession retorna error (código expirado, usado, revocado, etc): callback captura error → track.auth('auth.exchange_failed') → /verify?error=exchange_failed.
- [ ] **[Error exchange_failed]** Supabase.auth.exchangeCodeForSession retorna data sin user: callback detecta !data.user → /verify?error=exchange_failed.
- [ ] **[Error exchange_failed - Staff]** Post-exchange: email falta en user metadata (is_player=false) → callback retorna /verify?error=invalid (línea 79).
- [ ] **[Error exchange_failed - Player]** Post-exchange: email falta en user metadata (is_player=true) → callback retorna /verify?error=invalid (línea 50).
- [ ] **[Error exchange_failed - App metadata]** getOrCreatePlayer/getOrCreateStaffUser falla (DB error): callback catches exception → logging + /verify?error=exchange_failed.
- [ ] **[Multi-tenant - Staff 0 tenants]** Staff verificado pero sin tenant asignado: resolveStaffTenants retorna [] → redirect /onboarding.
- [ ] **[Multi-tenant - Staff 1 tenant]** Staff verificado con 1 tenant: setStaffTenantClaim carga tenant_id en JWT → redirect /dashboard.
- [ ] **[Multi-tenant - Staff N tenants]** Staff verificado con N>1 tenants: resolveStaffTenants retorna lista → redirect /select-tenant.
- [ ] **[Multi-tenant - Staff tenant filtered]** Staff intenta acceder via magic link a tenant eliminado (status=deleted/churned/blocked/suspended): resolveStaffTenants excluye ese tenant del resultado.
- [ ] **[Multi-tenant - Player cross-tenant]** Mismo player intenta verifica magic link en 2 complejos diferentes: player_id es global en app_metadata → accede a ambos complejos (no bloqueado por tenant).
- [ ] **[RLS - Player identity]** Callback carga is_player=true + player_id en app_metadata → future Server Components usan app.current_player_id vía RLS.
- [ ] **[RLS - Staff identity]** Callback carga staff_user_id + tenant_id en app_metadata → future Server Components usan app.current_tenant_id vía SET LOCAL.
- [ ] **[Refresh timeout]** Verificacion tarda >30s (timeout de Supabase): callback no retorna respuesta → navegador en /verify mantiene spinner indefinidamente (SIN FALLBACK EN UI).
- [ ] **[Sesion expirada]** User tiene cookies + CSRF token válido pero el código en URL expiró hace >15 minutos: Supabase rechaza → /verify?error=exchange_failed.
- [ ] **[Concurrencia]** Dos pestañas abren el mismo magic link URL y hacen POST-exchange simultáneamente: una gana el intercambio (token usado), la otra obtiene /verify?error=used.
- [ ] **[Deep link - Sin codigo]** Acceso directo a /verify: renderiza estado LoadingState (spinner), esperando que callback redirija acá (estado de transición).
- [ ] **[Deep link - codigo invalido]** Acceso directo a /verify?error=invalid&foo=bar: renderiza ErrorState con fallback mensaje genérico, ignora parámetros no soportados.
- [ ] **[Navegacion atras]** Usuario en /verify?error=expired hace click "Volver a intentar" (→ /login) y luego back: vuelve a /verify?error=expired (historial preservado).
- [ ] **[Visual - Mobile]** /verify sin error en viewport <640px: spinner, título y párrafo centrados, botón full-width (clase h-11 w-full), sin desbordamiento.
- [ ] **[Visual - Desktop]** /verify en viewport >1024px: card max-w-md centrada con gap respetado entre logo (mb-8) y contenedor rounded-2xl (p-8).
- [ ] **[Visual - Contraste]** LoadingState: Loader2 color emerald-700 sobre bg emerald-100; ErrorState: AlertCircle red-600 sobre bg red-100; ambos pasan WCAG AA.
- [ ] **[A11y - Icono decorativo]** Spinner Loader2 y AlertCircle tienen aria-hidden=true (no anunciados por screen readers).
- [ ] **[A11y - Heading]** LoadingState h1="Verificando tu enlace…"; ErrorState h1="No pudimos verificar tu enlace" (semantica correcta, no spans).
- [ ] **[A11y - Alerta de error]** ErrorState renderiza <p role="alert"> con mensaje de error (anunciable por screen reader cuando entra en el DOM).
- [ ] **[A11y - Focus visible]** Botón "Volver a intentar" tiene focus-visible:ring-2 ring-emerald-500; tabulable y navegable sin ratón.
- [ ] **[A11y - Link a home]** Logo TG es <Link href="/"> (semántica correcta, no <div> clickeable).
- [ ] **[A11y - Color no único]** Diferencia entre LoadingState (verde) y ErrorState (rojo) va más allá del color (icono + texto diferente).
- [ ] **[Persistencia]** Usuario en /verify?error=expired hace refresh F5: error param se preserva en URL, ErrorState se renderiza de nuevo.
- [ ] **[Persistencia - Session storage]** No usa localStorage ni sessionStorage; estado es 100% URL-driven (seguro para auth flow).
- [ ] **[Visual - Animacion spinner]** Loader2 tiene animate-spin (rotación continua); usuario ve movimiento mientras espera intercambio backend.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS: (1) Falta fallback visual si intercambio tardío Supabase tarda >30s—usuario ve spinner indefinidamente sin timeout UI. (2) El verdadero flujo de autenticación ocurre en /api/auth/callback (Route Handler Node.js); /verify es solo la puerta de llegada—errores tipográficos en callback (ej: redirect a ?error=typo) mostrarían fallback genérico. (3) No hay protección CSRF explícita en /verify (es GET puro); Supabase maneja PKCE en callback. (4) La vista NO valida estructura de error param (aceptaría ?error=cualquier_string y mostraría fallback), lo cual es buena defensiva. (5) El estado LoadingState es de transición—si callback falla, el usuario nunca ve ErrorState (redirect instantáneo), esto es correcto pero silencioso. (6) No hay retry automático ni botón en LoadingState; si usuario cierra la pestaña, no puede retomar el intercambio (debe pedir nuevo magic link). (7) Refresh de sesión en líneas 69, 98, 106 del callback sucede DESPUÉS del updateUserById, generando latencia—si cookies se pierden, siguiente page load en /verify causará redirect al callback de nuevo. (8) El parámetro ?next NO está visible en la UI ni documentado al usuario; es un parámetro técnico pasado desde login (buena práctica de ocultamiento).

---

### 8. Caja diaria
**URL:** `/caja` · **Archivo:** `src/app/(admin)/caja/page.tsx` · **Por que P0:** Gestion financiera diaria. Datos incorrectos = perdida de confianza del admin.

- [ ] **[Render]** Visita /caja sin parámetros de fecha: debe renderizar hoy (ART), título "Caja — YYYY-MM-DD", tres cards de resumen (Total ingresos, Ajustes, Balance) con montos en $X.XX formato, tabla de movimientos vacía o con filas según datos.
- [ ] **[Render]** Con movimientos del día registrados: tabla "Movimientos del día" con 6 columnas (Tipo, Categoría, Método, Descripción, Monto, Hora), montos en $X.XX, hora en formato HH:MM ART (toLocaleTimeString es-AR), descripción truncada con max-w-xs.
- [ ] **[Render]** Cuando la caja está cerrada (isClosed=true): mostrar badge "Cerrada por [staffUserId]" al lado del título, botones "Agregar movimiento" y "Cerrar caja" desaparecen (CajaActions retorna null), el texto aún visible.
- [ ] **[Render]** Navegación de fechas: 3 botones "← Anterior", "Hoy", "Siguiente →" cambios href a ?date=YYYY-MM-DD, Link hacia /caja (Hoy), Anterior lleva a la fecha anterior, Siguiente a la siguiente.
- [ ] **[Render - Desglose]** Con movimientos por múltiples métodos (efectivo, transfer, mercadopago, other): card "Desglose por método" visible solo si byMethod tiene entradas, lista cada método con su total en $X.XX, etiquetas en español (Efectivo, Transferencia, MercadoPago, Otro).
- [ ] **[Render - Desglose vacío]** Con un solo método de pago el día: card "Desglose por método" debe mostrar ese método único, no debe desaparecer.
- [ ] **[Render - Desglose]** Sin movimientos el día: card "Desglose por método" debe desaparecer completamente (Object.keys(summary.byMethod).length === 0).
- [ ] **[Happy path - Agregar movimiento]** Click en "+ Agregar movimiento": abre RegisterMovementModal con formulario de tipo (income/adjustment), categoría dinámica (income → booking/other; adjustment → no_show_correction/other), método (cash/transfer/mercadopago/other), monto en pesos, descripción, guardar con createCashFlowAction.
- [ ] **[Happy path - Agregar movimiento]** Llenar formulario: tipo=income, categoría=booking, método=cash, monto=1500.50 pesos (=150050 centavos), descripción="Reserva x2 horas", click Guardar: success=true, toast "Movimiento registrado", modal cierra, página refresca mostrando movimiento.
- [ ] **[Happy path - Agregar movimiento fecha histórica]** Cuando date != hoy (ART), agregar movimiento: occurredAt debe ser parsed como new Date(`${date}T12:00:00-03:00`) (mediodía ART), no la hora actual.
- [ ] **[Happy path - Cerrar caja]** Click en "Cerrar caja": abre ConfirmDialog con input "Efectivo contado (opcional, pesos)", textarea "Nota (opcional)", mostrando "Balance calculado: $X.XX" en read-only.
- [ ] **[Happy path - Cerrar caja sin diferencia]** Ingresa Efectivo=same as balance, sin nota: diff=0, nota NO requerida, botón Cerrar habilitado, closeDayAction(date, declaredCents, undefined), success=true, toast "Caja cerrada", página refresca, badge "Cerrada" aparece.
- [ ] **[Happy path - Cerrar caja con diferencia y nota]** Ingresa Efectivo distinto del balance, mostrando diferencia de $X: diff≠0, alerta "Diferencia de $X. La nota es obligatoria.", nota requerida, completar nota, closeDayAction(date, declaredCents, note), success=true.
- [ ] **[Happy path - Cerrar caja sin Efectivo]** Deja vacío el input de Efectivo, declaredCents=undefined: nota no requerida, closeDayAction(date, undefined, undefined), closeDailyRegister llama con opts.declaredCash=0, balance calculado como totalIncome+totalAdjustments.
- [ ] **[Validacion]** Agregar movimiento monto=0: handleSubmit rechaza "Ingresá un monto válido mayor a 0.", error visible, form no envía.
- [ ] **[Validacion]** Agregar movimiento monto negativo: Number.isFinite() rechaza, error visible.
- [ ] **[Validacion]** Agregar movimiento descripción vacía: error "Ingresá una descripción.", form no envía.
- [ ] **[Validacion]** Agregar movimiento descripción solo espacios: description.trim().length < 1, error visible.
- [ ] **[Validacion]** Agregar movimiento descripción >500 caracteres: boundedText(500) en schema, createCashFlowAction retorna {success:false, error:"Datos inválidos."}.
- [ ] **[Validacion]** Cerrar caja Efectivo=texto inválido ("abc"): declaredCents undefined, Number.isFinite()=false, onConfirm retorna {success:false, error:"Efectivo declarado inválido."}.
- [ ] **[Validacion]** Cerrar caja Efectivo=número con más de 2 decimales (100.123 pesos): Math.round(100.123*100)=10012 centavos (correcto), sin redondeo explícito. Si el input permite step=0.01, backend acepta.
- [ ] **[Validacion]** Cerrar caja Efectivo negativo: min=0 en input HTML, además backend moneyCents schema rechaza negativos.
- [ ] **[Validacion]** Cerrar caja con diferencia pero nota vacía: error "Hay diferencia: la nota es obligatoria.", onConfirm rechaza.
- [ ] **[Validacion]** Cerrar caja con diferencia pero nota solo espacios: note.trim().length < 1, error visible.
- [ ] **[Validacion]** Cerrar caja nota >500 caracteres: boundedText(500), closeDayAction retorna {success:false, error:"Datos inválidos."}.
- [ ] **[Validacion]** Cambiar tipo income→adjustment en modal: categoría resetea a first option de adjustment ([no_show_correction]), no queda categoría obsoleta.
- [ ] **[Validacion]** Monto en pesos con muchos decimales (1234.5678): Math.round(1234.5678*100)=123456.78 redondeado a 123457 centavos, esperado.
- [ ] **[Vacio]** Día sin movimientos: tabla muestra EmptyState con icon Receipt, title="Sin movimientos", description="No hay movimientos registrados para este día."
- [ ] **[Vacio]** Día sin movimientos, summary.balance=0: cards muestran $0.00, suma correcta.
- [ ] **[Vacio - Desglose]** Sin movimientos, byMethod vacío: card "Desglose por método" no renderiza (Object.keys === 0).
- [ ] **[Carga]** Visita /caja: loading.tsx renderiza Skeleton con h-8 w-56, grid 3 skeletons h-24, skeleton h-64, aria-busy=true.
- [ ] **[Carga]** Mientras RegisterMovementModal submit está en vuelo (isPending=true): botón Guardar muestra "Guardando…" y disabled=true, Cancelar disabled=true, modal cierra deshabilitada (handleOpenChange bails).
- [ ] **[Carga]** Mientras closeDayAction en vuelo: ConfirmDialog confirmLabel deshabilitado, esperar resultado.
- [ ] **[Error 400]** createCashFlowSchema.safeParse falla (type o category inválidos): createCashFlowAction retorna {success:false, error:"Datos inválidos."}, modal muestra error con role=alert.
- [ ] **[Error 403]** User type no staff: page.tsx redirect('/login') en línea 48, antes de tenant check.
- [ ] **[Error 404]** getStaffTenant retorna null: page.tsx redirect('/login') en línea 51.
- [ ] **[Error 409]** Intenta agregar movimiento a día ya cerrado: createCashFlow ejecuta closeCheck, DayAlreadyClosedError throw, action retorna {success:false, error:"La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio."}.
- [ ] **[Error 409]** Intenta cerrar caja que ya fue cerrada (mismo día dos veces): closeDailyRegister ejecuta existing check, DayAlreadyCloseExistsError throw o unique constraint violation (code 23505), action retorna {success:false, error:"La caja del YYYY-MM-DD ya fue cerrada."}.
- [ ] **[Error 422]** closeDaySchema.safeParse falla en dateStr (formato inválido): closeDayAction retorna {success:false, error:"Datos inválidos."}.
- [ ] **[Error 429]** adminRateLimited(tenant.id) retorna error string: createCashFlowAction y closeDayAction retornan {success:false, error:"rate limit message"}.
- [ ] **[Error 500]** Unexpected database error durante createCashFlow: withTenantContext no captura (throws), page.tsx error.tsx renderiza ErrorState "No pudimos cargar la caja", Sentry capture.
- [ ] **[Error 500]** closeDailyRegister throws algo no esperado: closeDayAction no captura, propaga a error.tsx.
- [ ] **[Red/Timeout]** RegisterMovementModal submit lanza exception no esperada: catch Sentry.captureException, error set a "No pudimos registrar el movimiento...", isPending vuelve a false (avoid stuck), usuario puede reintentar.
- [ ] **[Red/Timeout]** Navegación ?date=YYYY-MM-DD falla (DB down): page.tsx error.tsx captura con Sentry, ErrorState mostrado.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Permisos - Admin]** User.type=staff, staffUserId válido, tenant válido: acceso total a /caja, botones visibles (si no cerrada), CajaActions funcional.
- [ ] **[Permisos - Empleado PIN]** Staff con PIN configurado: caja con PinGate si es zona sensible.
- [ ] **[Permisos - Otro tenant]** Staff de tenant A intenta alcanzar caja de tenant B: withTenantContext(tenant.id) usa RLS SET LOCAL, datos aislados por DB.
- [ ] **[Sesion]** Token JWT expira durante submit de agregarMovimiento: Server Action detecta no auth, createCashFlowAction requireStaffTenant() redirect('/login') (específico por el modal abierto).
- [ ] **[Doble submit]** Formulario agregar movimiento: submit una vez, handleSubmit setea isPending=true, handleSubmit novamente: startTransition va a cola, esperado (normal para React 19 transitions).
- [ ] **[Doble submit]** Button disabled={isPending} previene click mientras guardando.
- [ ] **[Doble submit]** Cerrar caja: ConfirmDialog onConfirm await, si done=true antes, close abre de nuevo: setOpen(true) solo si isPending=false, previene reabrir.
- [ ] **[Doble submit]** Cerrar caja doble Click en botón confirmación: transición única, segundo await espera primero.
- [ ] **[Navegacion rapida]** Click "Siguiente" tres veces rápido en botones de fecha: cada Link ?date=X navega a nueva página, loading.tsx renderiza, prior page descarta, esperado.
- [ ] **[Navegacion atras]** Visita /caja?date=2026-06-05, luego 2026-06-06, browser back button: vuelve a 2026-06-05 estado anterior, esperado HTML Link behavior.
- [ ] **[Navegacion adelante]** Después de back, browser forward: vuelve a 2026-06-06, esperado.
- [ ] **[Deep link]** Visita /caja?date=2026-06-05 directamente (sin navegar): page.tsx toma searchParams.date, carga ese día (artDateOf UTC→ART mapeado), muestra título correcto.
- [ ] **[Deep link]** ?date=invalid ("2026-13-45"): dateStr validation en closeDaySchema rechaza, pero página read getDaySummary(tenantId, date, tx) ejecuta raw SQL con date::date cast, Postgres rechaza o trata como inválido. Frontend no valida; backend SQL podría fallar o tirar error.
- [ ] **[Deep link]** ?date=null o ?date omitido: artDateOf(new Date()) computa hoy, esperado.
- [ ] **[Deep link]** ?date=future ("2099-01-01"): getDaySummary ejecuta query, devuelve empty, summary.balance=0, render sin error, esperado.
- [ ] **[Responsive - Mobile]** Viewport 375px (iPhone SE): grid grid-cols-1 sm:grid-cols-3 → 1 col, 3 cards apiladas, tabla scrolleada horizontalmente, hora visible, esperado.
- [ ] **[Responsive - Tablet]** Viewport 768px (iPad): grid → 3 cols, botones navegación stack o inline, esperado.
- [ ] **[Responsive - Desktop]** Viewport 1280px: layout full width, tabla con todas las cols visibles.
- [ ] **[Responsive - Modal]** RegisterMovementModal mobile: input height h-11 md:h-10, textarea min-h-[44px] md:min-h-0 para touch targets, overflow manejado con dialog scrolling.
- [ ] **[A11y - Keyboard]** RegisterMovementModal: Tab por fields (tipo → categoría → método → monto → descripción → botones), Enter en submit, Escape cierra (handleOpenChange check).
- [ ] **[A11y - Keyboard]** CloseDayButton: Tab por Efectivo input → Nota textarea → botones, Escape cierra.
- [ ] **[A11y - Keyboard]** PinGate (si caja está detrás de PIN): PIN input autoFocus, Enter submit, disabled cuando locked.
- [ ] **[A11y - Labels]** Todos inputs tienen htmlFor label paired (id=cf-type, label htmlFor=cf-type, etc.), semanticamente correcto.
- [ ] **[A11y - Errores]** RegisterMovementModal error: p role=alert aria-live implícito, anunciado.
- [ ] **[A11y - Errores]** CloseDayButton alerta diferencia: role=alert, anunciada.
- [ ] **[A11y - Errores]** PinGate locked: p role=alert "Bloqueado hasta 0:45".
- [ ] **[A11y - Esqueleto]** Loading state: aria-busy=true en div, esperado para async loading.
- [ ] **[A11y - Tabindex]** Botones navegación fecha orden natural, primer link "Anterior", último "Siguiente".
- [ ] **[Persistencia]** Agregar movimiento, refresh página: getDaySummary y getCashFlows ejecutan query, movimiento existe en DB, renderiza nuevamente.
- [ ] **[Persistencia]** Cerrar caja, refresh: getDaySummary.close valida daily_cash_closes row, isClosed=true, badge visible, botones desaparecen.
- [ ] **[Persistencia]** Navigate /caja?date=X → agregar movimiento → Back → Forward: forward navega a /caja sin ?date o ?date anterior, carga hoy o esa fecha, movimiento refleja si en ese día.
- [ ] **[Visual - Montos]** Centavos 0-9: formatARS(5) → $0.05, formatARS(100) → $1.00, formatARS(10000) → $100.00, sin error.
- [ ] **[Visual - Montos]** Montos negativos (si ocurren): formatARS(-5000) → -$50.00 en Intl, esperado (aunque lógicamente adjustments pueden restar).
- [ ] **[Visual - Montos]** Tabular numbers (tabular-nums class): cifras alineadas verticalmente en tabla y cards, monospace numeral.
- [ ] **[Visual - Truncado]** Descripción muy larga (>max-w-xs ~256px): TD max-w-xs truncate, overflow-hidden, ellipsis, no rompe layout.
- [ ] **[Visual - Colores]** Card "Total ingresos": text-green-700, "Total ajustes": text-emerald-700, "Balance": text-slate-900, esperado.
- [ ] **[Visual - Estados button]** Botón "+ Agregar movimiento": bg-emerald-600, hover:bg-emerald-700, disabled:opacity-60, transición smooth.
- [ ] **[Visual - Estados button]** Botón "Cerrar caja": bg-slate-900, hover:bg-slate-800, variant=destructive en dialog, rojo.
- [ ] **[Visual - Badge cerrada]** inline-flex rounded-full bg-slate-100 px-3 py-1, ring-1 ring-slate-500/20, text-sm, visual distincto.
- [ ] **[Visual - Modal dialog]** RegisterMovementModal DialogContent max-w-md, centrado, overlay dimmed, esperado.
- [ ] **[Visual - Empty state]** icon Receipt (lucide-react), title y description centered, esperado.
- [ ] **[Edge - Fecha UTC/ART]** artDateOf(ts): new Date(ts.getTime() - 3*3600_000) simula -3h offset (UTC→ART), date slice(0,10) extraño YYYY-MM-DD. Si ts=2026-06-08T23:00:00Z, artDateOf = 2026-06-08T20:00:00Z → 2026-06-08, correcto.
- [ ] **[Edge - Fecha histórica movimiento]** RegisterMovementModal date="2026-06-01", hoy=2026-06-08, occurredAt=2026-06-01T12:00:00-03:00, getDaySummary usa (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = date::date, mapeado correcto.
- [ ] **[Edge - Centavos precisión]** Math.round(pesos*100) en JavaScript: 1500.50*100=150050.00, round=150050, esperado. Decimales >2: 1500.505*100=150050.5, round=150051, pequeña pero clara.
- [ ] **[Edge - Montos SUM]** getDaySummary SUM(amount)::int AS total castea a int, evita decimales, espera todos amounts en centavos (integers en DB).
- [ ] **[Edge - Balance negativo]** totalIncome=10000, totalAdjustments=-15000, balance=-5000: formatARS(-5000)="-$50.00", esperado. Restas para correcciones.
- [ ] **[Edge - Metodo label fallback]** METHOD_LABELS[method] ?? method: si method no está en map (unknown enum), renderiza raw value, fallback.
- [ ] **[Edge - Categoria label fallback]** CATEGORY_LABELS[cf.category] ?? cf.category: fallback para valores inesperados.
- [ ] **[Edge - Tipo label fallback]** TYPE_LABELS[cf.type] ?? cf.type: fallback.
- [ ] **[Edge - Timezone conversor]** cf.occurredAt.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'}): convierte UTC Date a hora ART legible, 14:30 ej.
- [ ] **[Edge - Spinner centering]** Loading: flex min-h-[40vh] items-center justify-center, spinner h-6 w-6 animate-spin, aria-label, role=status, esperado.
- [ ] **[Edge - Rate limit mock]** Si adminRateLimited(tenant.id) retorna truthy string: ambas actions retornan {success:false, error:message}, mostrada en modal/dialog.
- [ ] **[Edge - Idempotencia cierre]** Dos requests closeDayAction mismo tenant/date simultáneos: primera wins, segunda DayAlreadyCloseExistsError (unique constraint o select check), error "La caja del X ya fue cerrada."
- [ ] **[Edge - Idempotencia movimiento]** Dos requests createCashFlow simultáneos, mismo amount/method/description, same day: ambas crean rows (no primary key collision), esperado (duplicados posibles si el usuario resubmite; debería tener idempotency key pero no lo tiene).
- [ ] **[Edge - Hora ART vs UTC]** Caja cargada a las 23:00 UTC (20:00 ART): todayArt=2026-06-08 en artDateOf, visualizado como 2026-06-08 en el UI, correcto.
- [ ] **[Edge - Suma vacia]** byMethod vacío, Object.keys(byMethod).length === 0 falso, no renderiza card.
- [ ] **[Edge - Suma múltiples métodos]** 3 movimientos: 100 cash + 50 transfer + 200 mercadopago, byMethod={cash:100, transfer:50, mercadopago:200}, suma 350, balance correcto.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: (1) Sin validación frontend de formato de fecha en parámetro ?date; Deep link con ?date=invalid no rechazan antes de query DB, Postgres podría fallar silenciosamente. (2) No hay idempotency key en createCashFlowAction: doble submit/retry puede crear movimientos duplicados (único control es el disabled button durante isPending, pero network retry puede burlar). (3) RegisterMovementModal catchea exception en startTransition pero si el error es de la DB (ej. constraint), Sentry captura pero user ve \"No pudimos registrar\" genérico sin reintento estructurado. (4) artDateOf() usa offset hardcodeado -3h en milisegundos (3*3600_000), frágil para cambios de DST o si Argentina cambia UTC offset (debería usar Intl o date-fns con zona). (5) Method/Category/Type label maps son strings simples sin i18n, no escalable a múltiples idiomas. (6) Tabla usa raw SQL con AT TIME ZONE 'America/Argentina/Buenos_Aires' pero artDateOf usa offset: potencial desajuste si una usa DST y otra no. (7) Si closeDayAction falla mid-flight (DB error después de validación), ConfirmDialog no captura la exception (similar a RegisterMovementModal), error propagaría a error.tsx. (8) CajaActions condicionalmente retorna null si isClosed; no hay visual feedback que los botones están deshabilitados vs ausentes — debería haber badge o mensaje para claridad. (9) Sin validación de tenant_status (suspended/blocked/past_due) en page.tsx; solo kill-switch feature flag para suspended. Tenant past_due podría cargar /caja sin bloqueo (por diseño, pero riesgo de facturación con cuenta vencida)."

---

## 🟠 P1 — Altas (12 vistas)

### 9. Onboarding (wizard 4 pasos)
**URL:** `/onboarding` · **Archivo:** `src/app/onboarding/page.tsx`

- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Render]** Paso 1 renderiza: campo nombre requerido, dirección requerida, ciudad requerida, provincia dropdown requerida, teléfono requerido, email requerida, botón 'Continuar →', indicador 'Paso 1 de 4' y barra progreso al 25%.
- [ ] **[Render]** Logo TurnoGol (TG badge verde + 'TurnoGol' texto) aparece centrado en el header del wizard.
- [ ] **[Render]** Paso 2 renderiza: heading 'Tus Canchas', mensaje de info en box emerald, botón 'Continuar →', indicador 'Paso 2 de 4' y barra progreso al 50%.
- [ ] **[Render]** Paso 3 renderiza: heading 'Horarios', tabla de 7 días (Lunes-Domingo), columnas Apertura/Cierre/Estado, 7 inputs de tiempo (HH:MM) para each día, 7 checkboxes de abierto/cerrado, botón 'Continuar →', indicador 'Paso 3 de 4' y barra progreso al 75%.
- [ ] **[Render]** Paso 4 (sin MP conectado) renderiza: heading '¿Cobrás seña?', botón 'Conectar MercadoPago', botón 'Terminar sin seña', indicador 'Paso 4 de 4' y barra progreso al 100%.
- [ ] **[Render]** Paso 4 (con MP ya conectado) renderiza: heading 'MercadoPago', mensaje verde 'MercadoPago conectado exitosamente', botón 'Ir al dashboard →' (NO aparecen botones de conectar/saltar).
- [ ] **[Render]** Staff con onboarding_completed=true redirige inmediatamente a /dashboard sin renderizar wizard.
- [ ] **[Happy path]** Completar Paso 1 con todos los campos válidos: nombre 'Complejo Test', dirección 'Av. Test 123', ciudad 'Buenos Aires', provincia 'CABA', teléfono '+5491100000001', email 'admin@test.com' → submit avanza a Paso 2 y guarda tenant en DB.
- [ ] **[Happy path]** Completar Paso 2 presionando botón 'Continuar →' sin agregar canchas → avanza a Paso 3 (nota: no hay validación de al menos 1 cancha en wizard, eso ocurre después).
- [ ] **[Happy path]** Completar Paso 3 con horarios pre-rellenados (lunes 08:00-22:00, etc.) presionando 'Continuar →' → avanza a Paso 4 y guarda openingHours en DB.
- [ ] **[Happy path]** Completar Paso 4 presionando 'Terminar sin seña' (sin conectar MP) → redirect a /dashboard con onboarding_completed=true.
- [ ] **[Happy path]** Flujo completo 4 pasos: Step 1 submit → Step 2 continue → Step 3 continue → Step 4 'Terminar sin seña' → /dashboard con tenant creado y onboarding marcado completado.
- [ ] **[Validacion]** Paso 1: nombre vacío + submit → form HTML required impide submit O server rechaza; error 'Mínimo 2 caracteres' aparece.
- [ ] **[Validacion]** Paso 1: nombre 1 carácter 'A' + submit → error 'Mínimo 2 caracteres' mostrado.
- [ ] **[Validacion]** Paso 1: nombre 101+ caracteres + submit → error 'máximo 100 caracteres' (validación Zod en servidor).
- [ ] **[Validacion]** Paso 1: dirección '<5 caracteres' ej 'ABC' + submit → error 'Dirección muy corta' mostrado.
- [ ] **[Validacion]** Paso 1: dirección 200+ caracteres + submit → error 'máximo 200 caracteres'.
- [ ] **[Validacion]** Paso 1: ciudad vacía + submit → form required rechaza O server error 'Mínimo 2 caracteres'.
- [ ] **[Validacion]** Paso 1: provincia dropdown sin seleccionar (defaultValue='') + submit → form required rechaza.
- [ ] **[Validacion]** Paso 1: teléfono vacío + submit → form required rechaza O server error 'Teléfono inválido'.
- [ ] **[Validacion]** Paso 1: teléfono 6 dígitos '123456' + submit → error 'Teléfono inválido' (min 8 caracteres).
- [ ] **[Validacion]** Paso 1: teléfono 26+ caracteres + submit → error 'máximo 25 caracteres'.
- [ ] **[Validacion]** Paso 1: email vacío + submit → form required rechaza O server error 'Email inválido'.
- [ ] **[Validacion]** Paso 1: email sin @ 'admintest.com' + submit → error 'Email inválido'.
- [ ] **[Validacion]** Paso 1: email formato válido pero >255 caracteres + submit → error 'Email inválido' (Zod email validation falla).
- [ ] **[Validacion]** Paso 1: email con espacios ' admin@test.com ' (trim) + submit → trimmed o rechazado según Zod email().
- [ ] **[Validacion]** Paso 1: nombre con emojis '🏟️ Complejo' + submit → slug generado sin emojis (normalize/regex strip); nombre se guarda con emoji si no hay validación de caracteres.
- [ ] **[Validacion]** Paso 1: nombre con tildes 'Complejo Información' + submit → slug normalizado a 'complejo-informacion' (normalize NFD + regex).
- [ ] **[Validacion]** Paso 1: teléfono con solo espacios '        ' + submit → error (required rechaza o trim vacía).
- [ ] **[Validacion]** Paso 1: slug auto-generado mostrado bajo nombre (si nombre >= 2 chars) → URL preview 'turnogol.app/{slug}' actualizado en real-time.
- [ ] **[Validacion]** Paso 1: slug único en DB → si slug existe, generator en backend agrega sufijo '-1', '-2', etc (uniqueness asegurado).
- [ ] **[Validacion]** Paso 3: horario apertura en formato HH:MM válido ej '08:00' + submit → aceptado.
- [ ] **[Validacion]** Paso 3: horario apertura formato inválido ej '8:30' (sin 0 al inicio) + submit → error 'Formato HH:MM requerido'.
- [ ] **[Validacion]** Paso 3: horario apertura '25:00' (inválido) + submit → error 'Formato HH:MM requerido' (regex /^([01]\d|2[0-3]):[0-5]\d$/).
- [ ] **[Validacion]** Paso 3: marcar día como 'Cerrado' (checkbox) → inputs de hora se deshabilitan (disabled state visual); al submit, se guarda closed=true para ese día.
- [ ] **[Validacion]** Paso 3: cambiar día a 'Cerrado' y volver a 'Abierto' → inputs se habilitan nuevamente y pueden editarse.
- [ ] **[Carga]** Paso 1: submit válido → botón cambia a 'Creando...' con spinner/disabled state; no acepta múltiples clicks.
- [ ] **[Carga]** Paso 2: presionar 'Continuar →' → botón cambia a 'Guardando...' con disabled state.
- [ ] **[Carga]** Paso 3: submit válido con horarios → botón cambia a 'Guardando...', inputs deshabilitados, no acepta múltiples submits.
- [ ] **[Carga]** Paso 4: presionar 'Terminar sin seña' → botón cambia a 'Finalizando...' con disabled state; redirect a /dashboard luego (delay de transicion).
- [ ] **[Carga]** Paso 4: presionar 'Conectar MercadoPago' (link a /api/mp/oauth-start) → redirección a OAuth MP sin UI de carga (es link, no button).
- [ ] **[Carga]** Paso 1: submit lento (3+ segundos) → botón permanece 'Creando...' visualmente; timeout no visible al usuario, depende de red.
- [ ] **[Error 400]** Paso 1: nombre contiene caracteres especiales '!@#$%' → backend rechaza O slug generado los elimina; si validación es lax, se guarda.
- [ ] **[Error 400]** Paso 1: todos los campos llenos pero email 'invalid' (sin dominio) + submit → error 'Email inválido' mostrado en red alert.
- [ ] **[Error 400]** Paso 3: actualizar horarios con formato cierre < apertura ej apertura '10:00' cierre '08:00' → backend no valida lógica (RIESGO: permitiría garaje invertido).
- [ ] **[Error 401]** Sesión expirada durante Step 1: submit action → Server Action redirige a /login (extractAuthUser() retorna null).
- [ ] **[Error 401]** Sesión expirada durante Step 3: submit action → Server Action redirige a /login; estado local del formulario se pierde.
- [ ] **[Error 409]** Slug duplicado: dos requests simultáneos crean tenant con mismo nombre → segundo recibe UNIQUE constraint violation en DB.
- [ ] **[Error 429]** Paso 1: múltiples submits en <1 segundo (rate limit) → segundo submit rechazado con error 'Demasiadas operaciones en poco tiempo. Esperá unos segundos e intentá de nuevo.' (adminRateLimited en server-action.ts)
- [ ] **[Error 429]** Paso 2, 3, 4: rate limit por tenant.id (adminRateLimited) → mismo mensaje genérico, interfiere con UX.
- [ ] **[Error 500]** Paso 1: createTenantAction lanza excepción no manejada → error 'Datos inválidos' mostrado OR respuesta vacía.
- [ ] **[Error 500]** Paso 1: database connection timeout → server-side error; UI podría quedar en estado 'Creando...' sin feedback.
- [ ] **[Error 500]** Paso 3: updateScheduleAction falla al guardar openingHours en DB → error 'Tenant no encontrado' O excepción genérica.
- [ ] **[Red/Timeout]** Paso 1: submit inicia, conexión se corta antes de response → página podría quedar en estado 'Creando...' indefinidamente (no hay timeout visual).
- [ ] **[Red/Timeout]** Paso 3: submit y conexión se pierde → estado local mantenido en cliente; al reconectar, usuario puede reintentarr.
- [ ] **[Red/Timeout]** Paso 4: 'Conectar MercadoPago' link redirige a /api/mp/oauth-start pero conexión falla → usuario se queda sin feedback o en página de error MP.
- [ ] **[Permisos]** Staff con tenantId=null pero staffUserId válido → puede acceder Paso 1 (createTenantAction crea tenant); luego tenantId se setea vía JWT claim.
- [ ] **[Sesion]** Paso 1 en progreso, JWT refresca en background → no afecta Paso 1 (local form state persiste).
- [ ] **[Sesion]** Paso 1 submit + JWT expira durante request → Server Action detecta extractAuthUser()=null, redirige a /login; formulario no guardado.
- [ ] **[Sesion]** Paso 3 en progreso, JWT expiración durante setStaffTenantClaim en Paso 1 → catch non-fatal, wizard continúa (linea 54-56 en actions.ts).
- [ ] **[Doble submit]** Paso 1: presionar 'Continuar →' dos veces rápidamente → segundo click deshabilitado (button disabled durante isPending); solo 1 request enviado.
- [ ] **[Doble submit]** Paso 1: submit válido, luego refrescar página antes de que cargue Paso 2 → navegador redirige a Paso 2 tras revalidatePath; estado sincronizado.
- [ ] **[Doble submit]** Paso 3: submit dos veces en rápida sucesión → botón deshabilitado; rate limit + revalidatePath + estado del servidor sincroniza.
- [ ] **[Concurrencia]** Dos pestañas: ambas en Paso 1, ambas presionan 'Continuar →' con datos diferentes → segunda siempre sobrescribe (último write wins, no transacción).
- [ ] **[Concurrencia]** Dos pestañas: Pestaña A en Paso 3, Pestaña B en Paso 4 (porque avanzó primero) → A presiona continuar, redirige a Paso 4 pero B ya está ahí; pueden desincronizarse.
- [ ] **[Responsive]** Desktop 1920px: Wizard card (max-w-md=448px) centrado horizontalmente, layout vertical no se rompe.
- [ ] **[Responsive]** Tablet 768px: Card (max-w-md) centrado, inputs flexibles, tabla Paso 3 puede hacer scroll-x si necesario (overflow-x-auto presente).
- [ ] **[Responsive]** Mobile 375px: Card 100% - padding (p-4=16px*2), inputs full-width, tabla Paso 3 con overflow-x-auto para horarios, readable.
- [ ] **[Responsive]** Paso 3 tabla en mobile: columnas no se cortan; overflow-x-auto permite scroll horizontal sin romper layout.
- [ ] **[Responsive]** Botones en mobile: full-width h-11 (44px), tappable; texto 'Continuar →' no se trunca en pantallas pequeñas.
- [ ] **[A11y]** Labels: Paso 1 inputs tienen htmlFor + ids matching (id='identity-name' + label htmlFor='identity-name'), excepto checkboxes Paso 3.
- [ ] **[A11y]** Paso 3 checkboxes: label envuelve input + texto, accesible por click en cualquier parte del label; tabindex implícito.
- [ ] **[A11y]** Error messages: role='alert' en Paso 1 (línea 163), anuncian via screen reader; Paso 3/4 sin role='alert' (RIESGO: no anunciados).
- [ ] **[A11y]** Contraste color: texto slate-900 (cerca-negro) en bg white (100% contrast, OK); botones emerald-600 text-white (verificar ratio WCAG).
- [ ] **[A11y]** Indicadores de requerido: * rojo en labels de Paso 1; no hay aria-required (RIESGO: screen reader no lo sabe).
- [ ] **[A11y]** Orden tabulación Paso 1: nombre → dirección → ciudad → provincia → teléfono → email → botón (natural top-to-bottom).
- [ ] **[A11y]** Orden tabulación Paso 3: checkbox día → input apertura → input cierre → [repite 7 veces]; navegable con Tab pero confuso (RIESGO: bad UX para screen reader).
- [ ] **[A11y]** Placeholder no reemplaza label: Paso 1 tiene label + placeholder; placeholder desaparece; labels necesarias para screen reader.
- [ ] **[Persistencia]** Paso 1 Submit válido → currentStep incrementa a 2 en servidor (revalidatePath + recarga page.tsx).
- [ ] **[Persistencia]** Página recargada en Paso 2 → server re-evalúa settings.onboarding_step, renderiza Paso 2 (no vuelve a Paso 1).
- [ ] **[Persistencia]** Local state de Paso 1 (values en inputs) se pierde al avanzar (form en cliente no se sincroniza; es expected, nueva página tiene form vacío).
- [ ] **[Persistencia]** Paso 3 horarios: pre-rellenados desde DB (openingHours prop) → cambios locales se sincronizan al submit; volver a la página muestra valores guardados.
- [ ] **[Navegacion]** Botón atrás del navegador en Paso 2 → vuelve a Paso 1? Depende del middleware page.tsx; si currentStep=2, renderiza Paso 2 (botón atrás no decrementa step).
- [ ] **[Navegacion]** Deep link /onboarding sin query params → server detecta paso actual vía settings.onboarding_step en DB; página renderiza el paso correcto.
- [ ] **[Navegacion]** Deep link /onboarding?step=3 (query param, si existiera) → NO es soportado; server ignora query params, usa settings.onboarding_step.
- [ ] **[Navegacion]** Navegar a /onboarding varias veces (no submits) → GET request, no side-effects; página renderiza el mismo paso.
- [ ] **[Deep link]** URL /onboarding en Step 3 + Browser back → en Step 3 porque server refresquó; browser history tiene /onboarding, y cada carga renderiza Step 3 (sin efecto de back).
- [ ] **[Deep link]** Copiar URL /onboarding en otra ventana → nueva ventana renderiza el paso actual del servidor (Paso determinado por settings.onboarding_step del tenant).
- [ ] **[Deep link]** staffUserId válido pero tenant no existe (DB inconsistencia) → getStaffTenant retorna null, tenantData=null, currentStep=1, renderiza Paso 1.
- [ ] **[Visual]** Padding: card tiene p-8 (32px), inputs p-3.5 (14px), labels mb-1.5 (6px) — espaciado consistente.
- [ ] **[Visual]** Botón 'Continuar →' (emerald-600) vs 'Terminar sin seña' (bg-white border-slate-200) — contraste visual claro, CTA primaria vs secundaria.
- [ ] **[Visual]** Progress bar: transition-all duration-500 ease-out; animación suave al avanzar de paso.
- [ ] **[Visual]** Step indicator: 4 barras horizontales (h-1 rounded-full), llenas hasta currentStep con emerald-500; vacías después con slate-200.
- [ ] **[Visual]** Error message Paso 1 (role='alert'): texto red-500, padding arriba del botón; visible sin popup modal.
- [ ] **[Visual]** Error message Paso 3 (role='alert'): mismo rojo, misma posición; accesible a screen reader.
- [ ] **[Visual]** Disabled state botones: opacity-50, cursor-not-allowed, hover effects deshabilitados; claramente inactivos.
- [ ] **[Visual]** Input disabled (Paso 3 campos cerrados): bg-slate-100, text-slate-400, sin focus ring; indicador visual claro de inactivo.
- [ ] **[Visual]** Focus rings: focus-visible:ring-2 focus-visible:ring-emerald-500; 2px ring verde para keyboard navigation.
- [ ] **[Visual]** Placeholder Paso 1: text-slate-400, desaparece al escribir; ayuda visual inicialmente.
- [ ] **[Visual]** Heading Paso 1 'Tu Complejo': text-2xl font-bold tracking-tight; subheading 'Datos básicos del complejo' en text-sm text-slate-600.
- [ ] **[Visual]** Tooltip Paso 1: 'URL: turnogol.app/{slug}' aparece si nombre >= 2 caracteres, text-xs text-slate-500, actualizado en real-time.
- [ ] **[Visual]** Paso 2 info box: bg-emerald-50 border border-emerald-200 text-emerald-900; mensaje contextual claro.
- [ ] **[Visual]** Paso 3 tabla: borders subtle, text-sm, columnas alineadas; estado 'Abierto'/'Cerrado' en label pequeño.
- [ ] **[Visual]** Paso 4: dos botones apilados vertically (space-y-3); textos alineados izquierda, no centrados.
- [ ] **[Visual]** Logo TG: h-9 w-9 bg-emerald-500, shadow-lg shadow-emerald-500/30; shadow verde consistente con tema.
- [ ] **[Edge]** Nombre 'complejo' (minúscula, común) → slug 'complejo'; si existe, genera 'complejo-2', 'complejo-3', etc (collision handling OK).
- [ ] **[Edge]** Nombre vacío o solo espacios '   ' → required HTML rechaza O servidor rechaza 'Mínimo 2 caracteres'.
- [ ] **[Edge]** Email del staff pre-rellenado si formData.email vacío: fallback formData.phone = user.email.split('@')[0]; email fallback = user.email.
- [ ] **[Edge]** Paso 1 → Paso 2 con MP no conectado (mpConnectedAt=null) → Paso 4 renderiza opción 'Conectar MercadoPago'.
- [ ] **[Edge]** Paso 1 → Paso 2 → Paso 3 → Paso 4 pero tenant.mpConnectedAt ya fue seteado (via OAuth) → StepPayments renderiza 'MercadoPago conectado'.
- [ ] **[Edge]** Completar Paso 4 'Terminar sin seña' → completeOnboarding(tenant.id) + redirect /dashboard (sin require MP, optional).
- [ ] **[Edge]** Completar Paso 4 'Conectar MercadoPago' → link a /api/mp/oauth-start (GET) → redirige a auth.mercadopago.com; state firmado con HMAC.
- [ ] **[Edge]** Volver a Paso 1 (via botón atrás navegador) NO decrementa onboarding_step; si presiona 'Continuar →' nuevamente, intenta createTenantAction pero tenantId ya existe.
- [ ] **[Edge]** CreateTenantAction: si tenantId ya existe en staffTenants.length > 0, getStaffTenant no falla pero línea 26 redirige si onboarding_completed=false; si true, redirige /dashboard.
- [ ] **[Edge]** Paso 1: crear tenant con éxito pero setStaffTenantClaim falla → catch non-fatal (linea 54-56); wizard continúa, claim se setea en next login.
- [ ] **[Edge]** Horarios Paso 3: si día está 'Cerrado' (closed=true), no hay validación de coherencia; se guarda como closed=true.
- [ ] **[Edge]** Horarios todos los días 'Cerrado' → se guardan todos con closed=true (sin validación de 'debe haber al menos 1 día abierto').
- [ ] **[Edge]** Paso 3 dropdown provincia: 24 opciones (Buenos Aires - Tucumán), visibles en select, accesibles por teclado.
- [ ] **[Edge]** Provincia default value='' deshabilitada; submit sin seleccionar → HTML5 required rechaza.
- [ ] **[Edge]** Tipo de dato: todo en centavos? Paso 1-4 no toca montos, pero tenant.settings.deposit_percentage default=30 (porcentaje, no centavos).
- [ ] **[Edge]** Timestamps: paso 1 crea tenant con trialEndsAt = now + 30 días; timezones en UTC (backend), mostrado como ISO si rendered.
- [ ] **[Edge]** Trial period: DEFAULT_SETTINGS.onboarding_step = 1, onboarding_completed = false; tenant comienza en trialing status.
- [ ] **[Edge]** Cambiar navegador mid-wizard: sesión basada en cookies Supabase → nueva pestaña/navegador sin cookies redirige a /login.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS:
1. **Validación lógica de horarios**: Paso 3 no valida que cierre > apertura; permite horarios invertidos (apertura 22:00, cierre 08:00).
2. **Error messages no anunciados**: Paso 3 y 4 no usan role='alert' en error messages (a11y risk, screen readers no las anuncian).
3. **Falta aria-required**: Labels de Paso 1 usan * rojo pero no tienen aria-required; screen readers no lo detectan.
4. **State inconsistency en concurrencia**: Dos pestañas pueden desincronizarse si una avanza a Paso 4 y la otra intenta avanzar desde Paso 3; no hay lock optimista.
5. **Timeout sin feedback visual**: Requests lentos dejan botón en estado 'Guardando...' indefinidamente sin timeout message.
6. **Rate-limit genérico**: Error 429 retorna mensaje genérico que no diferencia entre Paso 1 (crear tenant) vs Paso 2/3/4 (avanzar); confuso para usuarios.
7. **Validación de horarios**: No hay validación backend que requiera al menos 1 día abierto (podría completar onboarding con todos los días cerrados).
8. **Slug duplication**: Si dos requests llegan simultáneamente con mismo nombre, UNIQUE constraint falla; cliente no recibe error clara, podría quedar en 'Creando...'.
9. **Back button behavior**: Presionar back en navegador no decrementa onboarding_step; si reintenta submit en Paso 1, llamaría a createTenantAction en un tenant que ya existe (error no manejado claramente).
10. **MP OAuth sin timeout**: Link 'Conectar MercadoPago' redirige a tercero sin timeout/feedback; si MP está down, usuario queda sin indicador visual.
11. **openingHours NULL risk**: Paso 3 pasa openingHours como prop; si DB lo devuelve null, StepSchedule puede fallar (tipo mismatch).
12. **Placeholder as label**: Algunos inputs tienen ambos label + placeholder que es redundante (label correcta, placeholder nice-to-have).

---

### 10. Dashboard del admin
**URL:** `/dashboard` · **Archivo:** `src/app/(admin)/dashboard/page.tsx`

- [ ] **[Render]** Cargá /dashboard con admin autenticado: debe mostrarse título 'Inicio', fecha actual en formato largo (ej: 'domingo, 8 de junio'), 3 tarjetas de KPI y si onboarding_completed=false, debe aparecer el checklist de onboarding.
- [ ] **[Render]** Cuando onboarding_completed=true Y public_link_shared=true: el checklist de onboarding NO debe aparecer, solo KPIs y el espacio debe estar limpio sin alerts.
- [ ] **[Render]** Los 3 KPI deben renderizar con iconos de lucide-react (CalendarCheck verde, Banknote verde, Users verde) dentro de badges de fondo emerald-50.
- [ ] **[Render]** En grid de KPIs, verificá responsive: en mobile (sm<640px) debe ser 1 columna, en tablet/desktop (sm:grid-cols-3) debe ser 3 columnas.
- [ ] **[Happy path]** Complejo nuevo sin reservas: bookingsToday=0, revenueTodayCents=0, activeAbonados=0; los valores deben mostrarse como '0', '$0' y '0' sin errores.
- [ ] **[Happy path]** Después de recibir una reserva confirmada: bookingsToday incrementa en 1, revenueTodayCents suma el priceSnapshot en centavos, mostrado como formato ARS (ej: $150.00).
- [ ] **[Happy path]** Clic en checklist item 'Datos del complejo completados' con href nulo: no debe navegar, ítem se marca tachado si complexData=true.
- [ ] **[Happy path]** Checklist: hacer clic en 'Al menos una cancha configurada' (hasCourts=false): navega a /canchas y vueltas atrás vuelve a /dashboard intacto.
- [ ] **[Happy path]** Checklist: clic en 'Horarios definidos' (hasSchedule=false): navega a /settings/horarios.
- [ ] **[Happy path]** Checklist: clic en 'MercadoPago conectado' (mpConnected=false): navega a /settings/facturacion.
- [ ] **[Happy path]** Checklist: clic en botón 'Copiar link' cuando publicLinkShared=false: copia URL al portapapeles (ej: https://app.turnogol.app/c/mi-complejo), button cambia a 'Copiado!' por 2s, luego vuelve a 'Copiar link'.
- [ ] **[Happy path]** Después de copiar link: markPublicLinkSharedAction() se ejecuta, settings.public_link_shared se pone true, y en reload del dashboard desaparece el checklist.
- [ ] **[Happy path]** Checklist: cuando publicLinkShared=true y firstBookingReceived=false, se muestra texto 'Compartí tu link para recibir reservas.' junto al item 'Primera reserva online recibida'.
- [ ] **[Carga]** KPIs: Promise.all() de getDashboardMetrics + getChecklistState debe completar en < 500ms (p95); si tarda, verificá que no hay N+1 queries.
- [ ] **[Carga]** La query getDashboardMetrics usa withTenantContext (RLS isolation) y filtra solo por tenantId del admin, confirmá SUM() retorna número válido incluso si 0.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Permisos]** Admin con otro tenant_id: withTenantContext aísla queries, ve solo sus métricas (cross-tenant RLS).
- [ ] **[Permisos]** Empleado accede a /dashboard: se muestra normalmente, no pide PIN (dashboard no es zona sensible).
- [ ] **[Sesion]** Durante carga de KPIs si la sesion expira: Promise.all() rechaza o DB query falla, página renderiza error o reinicia login (verificar error.tsx si existe).
- [ ] **[Doble submit]** Hacé clic 2 veces rápido en 'Copiar link': la segunda llamada a markPublicLinkSharedAction() debe ser silenciosa (idempotente, no duplica error) debido a rate limiting adminRateLimited().
- [ ] **[Doble submit]** Rate limit adminRateLimited() se activa: markPublicLinkSharedAction() retorna void sin actualizar settings, UI muestra 'Copiado!' pero los datos no persisten; refresh muestra rollback.
- [ ] **[Navegacion]** Browser back desde /settings/horarios a /dashboard: vuelve intacto, KPIs no se recargan (cachea en navegador).
- [ ] **[Navegacion]** Browser forward después de back: vuelve a /settings/horarios sin reload innecesario.
- [ ] **[Deep link]** Acceder directamente a /dashboard con token JWT válido en cookie: página carga sin redirecciones múltiples.
- [ ] **[Deep link]** Parámetro query inválido (?foo=bar) en /dashboard: se ignora, página renderiza normalmente.
- [ ] **[Visual]** Checklist completo (100%): mostrado como minimizado con 'Tu complejo está 100% listo!' y botón 'Ver checklist'; clic expande.
- [ ] **[Visual]** Checklist expandido: barra de progreso se llena de color emerald, porcentaje se actualiza dinámicamente, botón 'Minimizar' visible.
- [ ] **[Visual]** Checkmark icon en items completados: CheckCircle2 (emerald-600), text tachado (line-through, slate-400); icon pendiente: Circle (slate-300), text normal (slate-700).
- [ ] **[Visual]** Hover en MetricCard: sombra aumenta (shadow-lg), borde se oscurece (border-slate-300), card sube -translate-y-0.5; no click handler, purely visual.
- [ ] **[Visual]** Sub-texto 'Reservas confirmadas y completadas' bajo 'Revenue hoy': visible en gris slate-500, justificado en xs.
- [ ] **[Visual]** Fecha header 'Hoy' (h2, text-xl font-semibold): posicionada encima del grid de 3 KPIs.
- [ ] **[A11y]** aria-hidden=true en lucide icons: screen reader ignora el ícono, lee solo el label/value.
- [ ] **[A11y]** Títulos h1 y h2 con jerarquía correcta: h1='Inicio', h2='Hoy' / 'Progreso de configuración'.
- [ ] **[A11y]** Botones con labels claros: 'Copiar link', 'Copiado!', 'Configurar', 'Minimizar', 'Ver checklist'.
- [ ] **[A11y]** Contraste de colores: fondo emerald-50/red-50 + texto emerald-900/red-800 cumple WCAG AA.
- [ ] **[A11y]** Keyboard: Tab entre botones del checklist (Copiar link, Configurar, Minimizar), Enter activa, Escape cierra si aplica.
- [ ] **[A11y]** Focus visible: botones tienen :focus-visible outline, keyboard-only users ven el foco.
- [ ] **[Edge]** formatARS(0) retorna '$0' (minimumFractionDigits=0 en Intl.NumberFormat).
- [ ] **[Edge]** formatARS(10000) retorna '$100.00' (10000 centavos = 100 pesos).
- [ ] **[Edge]** formatARS(1) retorna '$0' (redondeo hacia abajo con minimumFractionDigits=0).
- [ ] **[Edge]** Complejo trialing (status='trialing', trialEndsAt=mañana): StatusBanner muestra días restantes en verde, checklist sigue visible si onboarding no completo.
- [ ] **[Edge]** Complejo past_due (status='past_due', periodEnd=hoy+2d): StatusBanner rojo 'Tu pago falló', pero /dashboard sigue cargando (no redirect en layout).
- [ ] **[Edge]** Complejo suspended (status='suspended'): StatusBanner rojo 'Tu cuenta está suspendida', pero si layout tiene redirectIfTenantSuspended, va a /suspended antes de /dashboard.
- [ ] **[Edge]** Complejo deleted (status='deleted'): debe ser rechazado en layout o redirect, no renderiza dashboard normal.
- [ ] **[Edge]** 7 items en checklist: accountCreated, complexData, hasCourts, hasSchedule, mpConnected, publicLinkShared, firstBookingReceived; contar=7 exactos.
- [ ] **[Edge]** Fecha hoy 1/1/2024 (Año Nuevo, fecha especial): todayInArgentina() retorna Date correcta, queries filtran por esa fecha, métricas son 0 o reales según DB.
- [ ] **[Edge]** Fecha hoy último día de mes: todayInArgentina() maneja mes/año correctamente.
- [ ] **[Edge]** Zona horaria Argentina: todayInArgentina() convierte a 'es-AR' locale, formato 'en-CA' (YYYY-MM-DD), retorna new Date(str) en medianoche local ART.
- [ ] **[Edge]** Múltiples reservas hoy: revenueTodayCents sums correctamente, no overflow, montos en centavos son integers (no decimales).
- [ ] **[Edge]** Tenant sin canchas (hasCourts=false): checklist muestra item 'Al menos una cancha' incompleto, botón 'Configurar' navega a /canchas.
- [ ] **[Edge]** Solo first booking con staff-created=true: firstBookingReceived=false (isNull(createdByStaff)), no se cuenta como 'primera reserva online'.
- [ ] **[Edge]** Si appUrl (NEXT_PUBLIC_APP_URL) no configura: publicUrl falla o muestra URL vacía, copia link retorna cadena vacía; debería tener fallback.
- [ ] **[Concurrencia]** 2 tabs abiertas en /dashboard, en tab A copias link y en B sin copiar: cada tab tiene state local independiente, no interfieren, pero markPublicLinkSharedAction() es global (revalidatePath).
- [ ] **[Consistencia]** Reload /dashboard: KPIs se recalculan en vivo desde DB, checklist state se recomputa, no caché stale.
- [ ] **[Consistencia]** Timestamp de fecha 'Hoy' es 00:00 UTC convertida a ART: si UTC 2024-06-09 00:00 = ART 2024-06-08 21:00 ayer, ajusta día correctamente.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS Y POTENCIALES BUGS DETECTADOS:

1. **URL vacía de app**: Si NEXT_PUBLIC_APP_URL no configura en .env, publicUrl en OnboardingChecklist queda vacío o 'c/undefined'; copia link falla silenciosamente. NO hay validación de appUrl ni fallback visible.

2. **Falta error.tsx**: No hay src/app/(admin)/dashboard/error.tsx. Si getDashboardMetrics() o getChecklistState() lanzan error, Next.js renderiza error genérico o blank page; no hay recovery UI.

3. **Rate limit silencioso**: adminRateLimited() retorna void si limited=true; markPublicLinkSharedAction() ejecuta `if (limited) return` sin error, settings NO se actualiza. UI ya mostró 'Copiado!' (optimistic), pero persisten rollback silencioso sin feedback al usuario.

4. **Timezone edge case**: todayInArgentina() convierte a 'en-CA' y crea Date(str); si la BD tiene timestamps en UTC pero la query compara date='2024-06-08', puede haber off-by-one si la zona es ART (UTC-3) vs UTC.

5. **MetricCard sin interactividad documentada**: Checklist original dice 'clic en KPI navega a la seccion', pero MetricCard es div estático sin onClick ni href. Especificación vs implementación divergen; aclaración necesaria.

6. **RLS dual en bookings no verificada**: La query usa `eq(bookings.tenantId, tenantId)` dentro de withTenantContext, pero no verifica explícitamente si RLS policy `FOR SELECT USING (tenant_id = app.current_tenant_id)` está activa. Si RLS deshabilitada, filtro client-side es la única barrera (riesgo).

7. **Status banner solo en layout, no en página**: StatusBanner muestra 'suspended', 'past_due', etc. en AdminLayoutShell, pero layout.tsx redirige si onboarding_completed=false antes de renderizar dashboard. Conflicto: si complejo está suspended Y onboarding incompleto, ¿qué gana?

8. **No validación explícita de checklistState keys**: Si getChecklistState retorna object sin una key (ej: falta 'hasCourts'), el checklist mapea ITEMS pero state[key] retorna undefined, falso. Silent failure, no error.

9. **Navegación buttons sin loading state**: 'Configurar' y 'Copiar link' no tienen disabled state durante transición; usuario puede hacer clic múltiples veces antes de revalidatePath completa."

---

### 11. Detalle de reserva
**URL:** `/reservas/[id]` · **Archivo:** `src/app/(admin)/reservas/[id]/page.tsx`

- [ ] **[Render]** Carga inicial de pagina con reserva confirmed: muestra fecha/hora, cancha, jugador, telefono, estado, precio, seña, metodo pago, y botones Marcar completada, Marcar ausente, Cancelar habilitados.
- [ ] **[Render]** Carga inicial con reserva en estado pending_payment: NO muestra botones (render null porque status != confirmed).
- [ ] **[Render]** Carga inicial con reserva canceled_refunded: NO muestra botones, muestra motivo de cancelacion y nota del jugador si existen.
- [ ] **[Render]** Carga inicial con reserva no_show: NO muestra botones (status != confirmed).
- [ ] **[Render]** Carga inicial con reserva completed: NO muestra botones (status != confirmed).
- [ ] **[Render]** Carga inicial con reserva expired: NO muestra botones (status != confirmed).
- [ ] **[Render]** Boton Marcar completada deshabilitado mientras pending (transicion en curso), despues del submit refresca la pagina.
- [ ] **[Render]** Boton Marcar ausente deshabilitado mientras pending, despues del submit refresca la pagina.
- [ ] **[Render]** Boton Cancelar deshabilitado mientras pending, abre dialog destructivo con titulo/descripcion/campos.
- [ ] **[Render]** Formato de montos en pesos ARS: precio 10000 centavos muestra $100.00 (sin decimales si es entero), seña muestra igual.
- [ ] **[Render]** Fecha formateada en Spanish locale con weekday completo (p.ej. 'martes 15 de junio') mayuscula primera letra.
- [ ] **[Render]** Hora mostrada en formato HH:MM (no incluye segundos).
- [ ] **[Render]** Si jugador no existe (NULL) pero guest_name existe, muestra guest_name en lugar de jugador.
- [ ] **[Render]** Si no hay nota del jugador (notesPlayer NULL), no muestra seccion 'Nota del jugador'.
- [ ] **[Render]** Si hay nota del jugador, muestra en seccion separada con border-top y texto slate-700.
- [ ] **[Render]** Si no hay motivo de cancelacion (canceledReason NULL), no muestra seccion 'Motivo de cancelación'.
- [ ] **[Render]** Si hay motivo de cancelacion, muestra en seccion separada con border-top y texto slate-700.
- [ ] **[Render]** Si seña no esta pagada (depositAmount = 0), muestra 'Sin seña' en lugar de cantidad.
- [ ] **[Render]** Si seña pagada, muestra cantidad + estado entre parentesis (p.ej. 'Seña $30.00 (paid)').
- [ ] **[Render]** Si metodo de pago NULL, muestra '—' (raya media).
- [ ] **[Render]** Botones con estilos correctos: Marcar completada verde (emerald), Marcar ausente gris neutro, Cancelar rojo (red-200 border, red-600 text).
- [ ] **[Happy path]** Admin clickea Marcar completada en reserva confirmed sin validacion previa: POST a completeBookingAction, exito refresca pagina y estado pasa a completed.
- [ ] **[Happy path]** Admin clickea Marcar ausente, abre dialog, confirma: POST a markNoShowAction, exito refresca pagina, estado pasa a no_show, toast 'Marcada como ausente'.
- [ ] **[Happy path]** Admin clickea Cancelar, abre dialog, ingresa motivo >= 3 caracteres, elige 'Sin reembolso', clickea Cancelar: POST a cancelBookingAction con shouldRefund=false, exito refresca, estado a canceled_no_refund, toast 'Reserva cancelada'.
- [ ] **[Happy path]** Admin clickea Cancelar, opcion 'Con reembolso' si seña pagada (hasPaidDeposit=true), metodo MP: aviso dice 'Se reembolsará vía MercadoPago', POST con shouldRefund=true, resultado canceled_refunded.
- [ ] **[Happy path]** Admin clickea Cancelar, opcion 'Con reembolso' si pago fue cash/transfer: aviso dice 'Coordiná el reembolso' (no automatico), POST con shouldRefund=true, resultado canceled_refunded.
- [ ] **[Happy path]** Admin clickea back (ChevronLeft) a /reservas desde detalle: link href=/reservas, navegacion correcta.
- [ ] **[Validacion]** Dialog cancelar: razon < 3 caracteres, error 'Ingresá un motivo (mínimo 3 caracteres)', boton confirmar deshabilitado hasta llenar.
- [ ] **[Validacion]** Dialog cancelar: razon con solo espacios (trim = ''), muestra error validacion.
- [ ] **[Validacion]** Dialog cancelar: razon con emoji/caracteres especiales se acepta (no validacion client-side de formato).
- [ ] **[Validacion]** Dialog cancelar: razon > 1000 caracteres se acepta en client, validacion server si aplica.
- [ ] **[Validacion]** Radio button reembolso: si depositAmount = 0, los radios NO aparecen (hasPaidDeposit = false), aviso dice 'no tiene seña pagada'.
- [ ] **[Validacion]** Radio button reembolso: si depositAmount > 0, radios habilitados (hasPaidDeposit = true).
- [ ] **[Validacion]** Dialog cancelar: click Volver cierra dialog sin enviar, reason se limpia, shouldRefund vuelve a false.
- [ ] **[Vacio]** Reserva sin jugador (playerId NULL, guestName NULL): muestra '—' en campo Cliente.
- [ ] **[Vacio]** Reserva sin telefono (playerPhone NULL, guestPhone NULL): muestra '—' en campo Teléfono.
- [ ] **[Vacio]** Reserva con precio 0 (block booking): muestra '$0.00'.
- [ ] **[Carga]** Boton Marcar completada durante transicion: disabled=true, opacidad 60%, click ignorado.
- [ ] **[Carga]** Boton Marcar ausente durante transicion: disabled=true, opacidad 60%, click ignorado.
- [ ] **[Carga]** Boton Cancelar durante transicion: disabled=true, opacidad 60%, click ignorado.
- [ ] **[Carga]** Dialog Cancelar: mientras procesando, boton 'Cancelar reserva' muestra 'Procesando…', deshabilitado.
- [ ] **[Carga]** Dialog NoShow: mientras procesando, boton 'Marcar ausente' muestra 'Procesando…', deshabilitado.
- [ ] **[Carga]** Page.tsx renderiza skeleton/suspense si query getBookingDetail es lenta (si aplica loading.tsx).
- [ ] **[Error 404]** URL con booking ID inexistente: notFound() dispara error boundary, muestra 404 Not Found.
- [ ] **[Error 404]** Booking pertenece a OTRO tenant (tenant_id diferente): query retorna null, notFound() dispara 404.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Error 400]** completeBookingAction: reserva en estado != confirmed, retorna error 'La reserva no está en estado confirmado'.
- [ ] **[Error 400]** completeBookingAction: turno todavia no termino (tiempo actual < timeEnd): retorna error 'El turno todavía no terminó. Podés marcarla completada recién después del horario de fin.'.
- [ ] **[Error 400]** markNoShowAction: reserva no en confirmed, retorna error 'La reserva no está en estado confirmado'.
- [ ] **[Error 400]** markNoShowAction: turno todavia no empezo (tiempo actual < timeStart): retorna error 'El turno todavía no empezó. Podés marcar ausente recién después del horario de inicio.'.
- [ ] **[Error 400]** cancelBookingAction: reserva no en confirmed, retorna error 'La reserva no está en estado confirmado'.
- [ ] **[Error 429]** adminRateLimited dispara (3+ requests en segundos): retorna 'Demasiadas operaciones en poco tiempo...' en todos los botones, sin enviar mutation.
- [ ] **[Error 500]** completeBookingAction: exception desconocida en booking.service lanza error 500, error boundary captura, Sentry logs.
- [ ] **[Error 500]** markNoShowAction: exception desconocida en booking.cancellation lanza error 500, error boundary captura.
- [ ] **[Error 500]** cancelBookingAction: exception desconocida (p.ej. falla MP gateway) lanza error 500, error boundary captura.
- [ ] **[Red/Timeout]** completeBookingAction: timeout en network request (revalidatePath tarda > 30s): spinner muestra 'Procesando…', despues erro/timeout toast.
- [ ] **[Red/Timeout]** markNoShowAction: timeout, spinner muestra 'Procesando…', retry logic si configura.
- [ ] **[Red/Timeout]** cancelBookingAction con shouldRefund=true: falla MP gateway (conexion perdida), error 'No se pudo procesar el reembolso' pero booking ya cancelado en DB (idempotente).
- [ ] **[Red/Timeout]** Si router.refresh() falla despues del exito (Revalidate path error), toast aun muestra success pero pagina puede estar stale.
- [ ] **[Permisos]** Admin de tenant A accede /reservas/[id] de booking de tenant B: query retorna null, 404 (cross-tenant RLS).
- [ ] **[Permisos]** Empleado con PIN en zona sensible: debe pasar PinGate antes (si esta ruta requiere PIN en layout superior).
- [ ] **[Sesion]** Admin con sesión expirada durante dialog Cancelar: cancelBookingAction llama requireStaffTenant que redirect('/login') (específico por el dialog abierto).
- [ ] **[Sesion]** JWT refresh en medio de completeBookingAction: server renueva JWT si aplica, mutation procede normalmente.
- [ ] **[Doble submit]** Usuario clickea Marcar completada 2 veces rapidamente: pending=true desactiva segundo click, solo una mutation se envía.
- [ ] **[Doble submit]** Usuario abre dialog Cancelar, ingresa razon, hace doble click en 'Cancelar reserva': isPending=true en ConfirmDialog desactiva, solo una mutation.
- [ ] **[Doble submit]** Dos tabs abiertos, mismo booking, uno clickea Marcar completada, el otro clickea Marcar ausente casi simultaneamente: ambos llegan al servidor, primero gana (second obtiene status!=confirmed error), tab 2 muestra error.
- [ ] **[Concurrencia]** Webhook MP llega FUERA DE ORDEN (e.g. refund antes de capture): idempotencia via processed_webhooks previene duplicados, estado consistente.
- [ ] **[Concurrencia]** Admin Y otro admin del mismo tenant clickean Marcar completada al mismo tiempo: SELECT FOR UPDATE en booking lock, serializa, uno gana, otro obtiene error (si aplica).
- [ ] **[Responsive]** Desktop (1920px): grid 2 columnas para detalles (Fecha/Cancha, Cliente/Teléfono, etc), botones en fila flex horizontal.
- [ ] **[Responsive]** Tablet (768px): grid 1 columna para detalles, botones wrap flex-wrap gap-2, legible.
- [ ] **[Responsive]** Mobile (375px): grid 1 columna, detalles comprimidos, botones stack verticalmente si necesario, overflow hidden trunca texto largo.
- [ ] **[Responsive]** Dialog Cancelar en mobile: ancho max-w-md, scroll si contenido > viewport, footer buttons accesibles.
- [ ] **[A11y]** Botones con aria-label o text content descriptivo (no solo iconos).
- [ ] **[A11y]** ConfirmDialog: rol=alertdialog (si aplica), focus trap dentro dialog, escape cierra si no isPending.
- [ ] **[A11y]** Labels en dialog Cancelar: htmlFor='cancel-reason', <label> asociado correctamente a textarea.
- [ ] **[A11y]** Textarea cancel-reason: focus-visible ring-2 ring-emerald-500, enter o ctrl+enter envia si desired (si aplica).
- [ ] **[A11y]** Error messages: role='alert', anunciado al screen reader cuando aparece.
- [ ] **[A11y]** Tabaxi: puede navegar boton Marcar completada -> Marcar ausente -> Cancelar -> back link, enter activa cada uno.
- [ ] **[A11y]** Contraste: botones rojo (red-600 text) sobre fondo claro cumple WCAG AA (>= 4.5:1).
- [ ] **[A11y]** Nota jugador y motivo cancelacion: texto slate-700 sobre bg-white, contraste >= 4.5:1.
- [ ] **[A11y]** Radio buttons en dialog: pueden navegarse con arrow keys si no custom styled.
- [ ] **[Persistencia]** Despues de cancelar exitosamente, usuario refresh F5: getBookingDetail retorna estado canceled_no_refund, botones no aparecen.
- [ ] **[Persistencia]** Despues de Marcar completada, usuario cierra tab, reabre /reservas/[id]: estado es completed, botones no aparecen.
- [ ] **[Persistencia]** Dialog Cancelar abierto, usuario refresh F5 mid-dialog: pagina recarga desde inicio, dialog se cierra, reason no persiste.
- [ ] **[Navegacion]** Click back (ChevronLeft link): navega a /reservas, lista se re-carga con bookings actualizados.
- [ ] **[Navegacion]** Click back durante dialog abierto: dialog cierra, navega a /reservas.
- [ ] **[Navegacion]** Browser back button despues de exitoso completeBookingAction: puede ir a pagina anterior, si se vuelve a /reservas/[id] se recarga desde servidor.
- [ ] **[Navegacion]** Browser back durante dialog Cancelar abierto: navegador no avanza, dialog sigue abierto (dialog maneja escape).
- [ ] **[Deep link]** URL directa /reservas/[id-invalido]: 404, muestra error boundary.
- [ ] **[Deep link]** URL directa /reservas/[id-valido]: carga pagina, renderiza detalles, botones (si confirmed).
- [ ] **[Deep link]** URL copiada y pegada en otro browser: tenantId extraido de middleware, si user de otro tenant -> 404.
- [ ] **[Deep link]** URL con id pero usuario no autenticado: redirect a /login antes de query.
- [ ] **[Visual]** Grid detalles: gap-x-6 gap-y-3, padding p-6 alrededor, max-width 2xl.
- [ ] **[Visual]** Labels (dt) en mayusculas tracking-wide text-slate-500, valores (dd) text-slate-900 font-medium.
- [ ] **[Visual]** Boton back link: text-slate-600 hover:text-slate-900, gap-1.5, icon 4x4.
- [ ] **[Visual]** H1 'Detalle de la reserva': text-2xl font-semibold text-slate-900.
- [ ] **[Visual]** Border around card: border-slate-200 rounded-xl shadow-sm bg-white, p-6.
- [ ] **[Visual]** Dialog destructive: titulo en color neutral, contenido en amber warning box (bg-amber-50 ring-amber-600/20 text-amber-700).
- [ ] **[Visual]** Botones en dialog: flex justify-end gap-2, cancel left gris, confirm right rojo (destructive) o verde (default).
- [ ] **[Visual]** Textarea: border-slate-200, rounded-md, px-3 py-2, focus:border-emerald-600 focus-visible:ring-2 ring-emerald-500.
- [ ] **[Edge]** Booking con canceledReason = '' (string vacio): no muestra seccion motivo (porque !booking.canceledReason).
- [ ] **[Edge]** Booking con notesPlayer = '' (string vacio): no muestra seccion nota.
- [ ] **[Edge]** Precio snapshot = -1 (invalido pero en DB): muestra $0.00 o se trunca, sin crash.
- [ ] **[Edge]** Fecha booking = 2099-12-31, timeStart=23:50, timeEnd=23:59: formatDate funciona correctamente, hora muestra 23:50–23:59.
- [ ] **[Edge]** Seña depositAmount = 1 centavo: muestra $0.01 (rounded correctly).
- [ ] **[Edge]** Guest name muito largo (200+ chars): trunca con ellipsis o wraps en grid col, no overflow.
- [ ] **[Edge]** Jugador nombre con caracteres unicode (e.g. José, María, ñ): renderiza correctamente en UI.
- [ ] **[Edge]** Tiempo servidor vs cliente UTC <-> ART offset: fecha mostrada en UTC en formato, pero zona horaria NO mencionada para evitar confusion (usa Z en ISO).
- [ ] **[Edge]** Seña con status = 'captured' (cuando no-show con penalidad): deposito visible, status muestra 'captured'.
- [ ] **[Edge]** Booking de tipo 'block': status confirmed, precio 0, seña 0, sin jugador (guest_name). Muestra '—' para cliente. Botones funciona normalmente si timings ok.
- [ ] **[Edge]** Cancelacion por SYSTEM (p.ej. por expiracy): canceledReason puede ser null, canceledBy='system', muestra sin error.
- [ ] **[Edge]** Dialog cancelar con refund=true pero MP access token invalid/expired: cancelBookingAction lanza error 'No se pudo procesar reembolso', error mostrado en dialog.

> ⚠️ **Riesgo detectado en codigo:** Riesgos detectados: (1) En BookingActions.tsx linea 30, si status !== 'confirmed' devuelve null SIN error boundary - si API retorna estado invalido, la pagina se queda sin botones silenciosamente. (2) formatDate usa hardcoded 'T12:00:00Z' que ignora el timeStart real de la reserva - puede mostrar fecha incorrecta si booking cruza medianoche UTC (aunque unlikely en Argentina). (3) getBookingDetail query LEFT JOINs player pero si el JOIN falla silenciosamente, playerName seria null pero notesPlayer aún aparecería - inconsistencia posible. (4) Dialog Cancelar no valida razon MIN length en side server nuevamente (solo client-side en BookingActions) - vulnerabilidad si client bypassed. (5) formatARS usa maximumFractionDigits: 0 en page.tsx pero 2 en BookingActions (linea 18) - inconsistencia de formato entre precio general y seña en dialog. (6) revalidateBooking() en actions.ts linea 104-107 revalida ambas rutas pero si una falla, la otra podría ser stale. (7) No hay validacion server-side de que booking.date + timeEnd no sea en el pasado ANTES de Marcar completada/ausente - race condition posible si timings del servidor skewed.

---

### 12. Perfil publico del complejo
**URL:** `/{slug}` · **Archivo:** `src/app/(public)/[slug]/page.tsx`

- [ ] **[Render]** Cargar perfil público de complejo activo (status=active) con todas las secciones: header con datos del complejo, galería de fotos, lista de canchas, grilla de disponibilidad en Suspense, reseñas. Verificar que todas las secciones renderean sin errores y en el orden correcto.
- [ ] **[Render]** Cargar perfil público de complejo sin galería (sin coverUrl ni fotos en canchas): header sigue visible, galería no renderiza, resto de secciones presentes.
- [ ] **[Render]** Cargar perfil público con canchas vacías (getPublicCourtCards retorna []): sección de canchas no renderiza, grilla sigue disponible.
- [ ] **[Render]** Cargar perfil público con reseñas vacías (total=0): sección de reseñas muestra ícono de megáfono + 'Todavía no hay reseñas de este complejo'.
- [ ] **[Happy path]** Usuario navega a /{slug} válido, página carga completa, observar que SEO metadata incluye title=tenantName, description con ciudad, og:image=coverUrl, structured data LocalBusiness + Breadcrumb List.
- [ ] **[Happy path]** Usuario ve grilla de disponibilidad en fecha inicial (hoy ART), luego hace clic en botón 'Día siguiente', grilla recarga con nuevos slots y cambio visible en la etiqueta de fecha.
- [ ] **[Happy path]** Usuario ve slot libre 'Reservar' en la grilla, hace clic en él, navega a /{slug}/reservar?court={id}&date=2026-XX-XX&time=HH:MM&dur=60.
- [ ] **[Happy path]** Usuario sin sesión hace clic en 'Guardar en favoritos' (FavoriteButton), recibe 401, redirige a /login?next=/{slug}, login completo, vuelve a /{slug}, favorito persiste en sesión.
- [ ] **[Happy path]** Usuario en ProfileHeader hace clic en 'Compartir', elige 'Copiar enlace', clipboard contiene URL completa del complejo, toast muestra 'Enlace copiado'.
- [ ] **[Happy path]** Usuario en ProfileHeader hace clic en 'Compartir' > 'WhatsApp', abre wa.me/?text=Mensaje+URL, URL está incluida.
- [ ] **[Validacion]** Cargar /{slug-invalido}, slug no existe en DB, servidor llama notFound(), retorna 404 page con heading 'Not Found'.
- [ ] **[Validacion]** GET /api/public/availability?slug=demo&date=2026-13-32 (fecha inválida), API retorna 400 con {error: 'invalid_params'}.
- [ ] **[Validacion]** GET /api/public/availability?slug=DEMO (slug con mayúsculas), query validation rechaza (slug regex solo lowercase + guiones), API retorna 400.
- [ ] **[Validacion]** GET /api/public/availability?slug=demo&date=2026-05-22&extra_param=bomb, query schema ignora parámetro extra, API procesa slug y date normalmente.
- [ ] **[Validacion]** GET /api/public/reviews/{tenantId}?limit=999 (limit muy grande), schema limita max, API retorna página reducida (10 máximo por defecto).
- [ ] **[Validacion]** GET /api/public/reviews/{invalid-uuid}, API retorna 400 con {error: 'invalid_params'}.
- [ ] **[Vacio]** Cargar /{slug} de complejo con allowOnlineBooking=false: slots muestran botón 'Contactar' (tel:) en lugar de botones 'Reservar'.
- [ ] **[Vacio]** AvailabilityGrid renderiza pero getPublicCourtCards retorna [] (sin canchas en DB): 'Este complejo no tiene canchas disponibles por el momento'.
- [ ] **[Carga]** Navegar a /{slug}, Suspense muestra Skeleton while grilla carga, luego reemplaza skeleton con tabla de disponibilidad cuando Promise.all resuelve.
- [ ] **[Carga]** AvailabilityGrid, usuario hace clic en 'Día siguiente', loading=true, Skeleton visible por 200ms, luego tabla reemplaza skeleton sin parpadeo.
- [ ] **[Carga]** FavoriteButton, usuario hace clic en corazón, icono cambia optimista (fill), request en flight, si falla después 800ms revierte fill y muestra toast destructivo.
- [ ] **[Carga]** ReviewsSection botón 'Ver más reseñas', loading=true, botón disabled, spinner visual, luego disabled=false y reseñas se añaden al final.
- [ ] **[Error 400]** GET /api/public/availability?slug=demo (falta date), API retorna 400.
- [ ] **[Error 400]** GET /api/public/availability?date=2026-05-22 (falta slug), API retorna 400.
- [ ] **[Error 404]** GET /api/public/availability?slug=nonexistent&date=2026-05-22, tenant no existe, API retorna 404 con {error: 'not_found'}.
- [ ] **[Error 400]** GET /api/public/availability?slug=demo&date=2026-05-22 pero date < today (ART), API retorna 400 con {error: 'date_out_of_range'}.
- [ ] **[Error 400]** GET /api/public/availability?slug=demo&date=2026-07-22 pero date > maxDate (today + bookingAdvanceDays), API retorna 400.
- [ ] **[Error 429]** AvailabilityGrid, usuario hace clic en 'Día siguiente' 10 veces en 5 segundos, último request puede recibir 429. Grid mantiene datos stale hasta éxito.
- [ ] **[Error 500]** getPublicTenant retorna error de base de datos, Promise.all .catch previene crash, página entera retorna 500 (como fallara el await inicial en page.tsx).
- [ ] **[Error 500]** getPublicCourtCards falla: Promise.all .catch retorna [], sección de canchas no renderiza, resto de página sigue visible (resiliente).
- [ ] **[Error 500]** getReviewsByTenant falla: Promise.all .catch retorna {reviews:[], total:0}, sección reseñas muestra 'Todavía no hay reseñas'.
- [ ] **[Red/Timeout]** AvailabilityGrid, fetch a /api/public/availability timeout (30s+), .catch silencia error, loading=false, tabla no actualiza, mantiene datos previos, usuario puede reintentar.
- [ ] **[Red/Timeout]** ReviewsSection botón 'Ver más reseñas', fetch falla (network timeout), .catch silencia error, button sigue activo para reintentar sin toast error visible.
- [ ] **[Permisos]** URL /{slug} es totalmente pública: usuario anónimo, otro tenant, admin de otro tenant, todos ven igual. RLS en getPublicCourtCards y getPublicAvailability protege con withTenantContext.
- [ ] **[Permisos]** FavoriteButton sin autenticación (401 response): no actualiza favorito en DB, redirige a /login, después de login vuelve a /{slug}.
- [ ] **[Permisos]** GET /api/public/reviews/{tenantId} no requiere auth: anónimo puede listar reseñas (públicas por diseño, Ley 25.326 anonimiza).
- [ ] **[Sesion]** Usuario logueado como jugador A, ve grilla en /{slug}, recarga página (F5): JWT en cookie, página sigue visible, FavoriteButton usa la sesión para el toggle.
- [ ] **[Sesion]** Usuario logueado, JWT expira (> 1 hora), hace clic en 'Guardar favorito', FavoriteButton fetch retorna 401, redirige a /login automático.
- [ ] **[Doble submit]** FavoriteButton, usuario hace doble click rápido (100ms), pending flag previene segundo request, solo 1 fetch se ejecuta.
- [ ] **[Doble submit]** ReviewsSection 'Ver más reseñas', usuario hace doble click, loading=true setLoading(true) previene duplicado, solo 1 fetch.
- [ ] **[Doble submit]** AvailabilityGrid, usuario hace clic en botones 'Día siguiente' y 'Día anterior' simultáneamente, loading state previene ambos, solo el último click ejecuta.
- [ ] **[Concurrencia]** Dos pestañas abiertas en /{slug}, ambas cargan misma página, TenantHeader renderiza con mismos datos (no hay state compartido), sin conflicto.
- [ ] **[Concurrencia]** Dos pestañas /{slug}, pestana A hace clic en 'Día siguiente', grilla A recarga. Pestana B sigue en hoy. Navegación independiente.
- [ ] **[Concurrencia]** Pestana A marca favorito, Pestana B carga página, FavoriteButton en B muestra initialFavorited=false (desde DB al render, no sync en tiempo real).
- [ ] **[Responsive]** Abrir /{slug} en mobile 375px: TenantGallery muestra foto grande (4/4 cols), no thumbnails. Resto del layout responde con gap y padding adecuados.
- [ ] **[Responsive]** Abrir /{slug} en tablet 768px: TenantGallery muestra foto grande (2 cols) + 2 thumbs. CourtCard grid es 2x2. AvailabilityGrid tabla scrollable horizontal.
- [ ] **[Responsive]** Abrir /{slug} en desktop 1200px: TenantGallery full layout 4x2 con 5 fotos visibles. CourtCard grid 4 columnas. AvailabilityGrid tabla cabe sin scroll.
- [ ] **[A11y]** TenantGallery lightbox tiene role=dialog, aria-modal=true, aria-label. Esc cierra, Arrow keys navegan, Tab accesible.
- [ ] **[A11y]** TenantHeader enlaces 'Cómo llegar', 'Llamar', 'WhatsApp' tienen aria-label o title descriptivos. Phone link es tel: protocol.
- [ ] **[A11y]** AvailabilityGrid table tiene scope=col en <th>, <td> anidados correctamente, encabezados asociados.
- [ ] **[A11y]** FavoriteButton tiene aria-pressed={fav}, aria-label descriptivo. Keyboard: Tab > Enter/Space alterna favorito.
- [ ] **[A11y]** ReviewsSection heading h2, lista <ul>, items <li> semánticamente correctos. Rating stars accessible con aria-hidden en iconos.
- [ ] **[A11y]** Contraste de colores: TenantHeader texto en slate-900/slate-700 sobre white, pasa WCAG AA. Links emerald-700 sobre white OK.
- [ ] **[A11y]** Orden de tabulación: Header > Botones (Compartir, Guardar) > Canchas > Grilla (fecha nav, slots) > Reseñas > botón Ver más. Sin saltos.
- [ ] **[Persistencia]** Usuario en /{slug}, abre galería (lightbox), cierra browser, reabre tab: galería cerrada (no persistent, es useState).
- [ ] **[Persistencia]** AvailabilityGrid, usuario navega a 2026-05-25, recarga página: URL param ?date=2026-05-25 se pasa a /{slug}?date=..., grilla carga esa fecha inicial.
- [ ] **[Persistencia]** FavoriteButton, usuario marca favorito, recarga página: initialFavorited viene de servidor (no re-query), favorito visual persiste.
- [ ] **[Navegacion]** Usuario en /{slug}, hace clic en 'Reservar' en slot, navega a /{slug}/reservar?court=...&date=...&time=...&dur=60, URL preserva contexto.
- [ ] **[Navegacion]** Usuario en /{slug}/reservar, hace click atrás (back button), vuelve a /{slug}, AvailabilityGrid mantiene su estado (fecha, página cargada).
- [ ] **[Navegacion]** Usuario en /{slug}, scrollea hasta reseñas, scrollea hasta arriba, botones en TenantHeader siempre accesibles (sticky o siempre visibles).
- [ ] **[Deep link]** Usuario abre directamente /{slug}?date=2026-05-25: pageProps.searchParams.date se valida (regex + between todayStr y maxStr), AvailabilityGrid carga esa fecha inicial.
- [ ] **[Deep link]** Usuario abre /{slug}?date=2026-13-32 (fecha inválida): regex rechaza, initialDate = todayStr, grilla carga hoy.
- [ ] **[Deep link]** Usuario abre /{slug}?date=2026-03-15 (antes de hoy): validacion rechaza, initialDate = todayStr.
- [ ] **[Visual]** TenantHeader: logo 56x56, border radius lg, shadow sm. Nombre h1 text-2xl bold. Description p text-sm muted. Verificar paddings y gaps.
- [ ] **[Visual]** AvailabilityGrid tabla: th uppercase tracking-wide, td padding 1.5 vertical 2 horizontal. Fila hover:bg-slate-50. Slot button hover:bg-green-100.
- [ ] **[Visual]** ReviewsSection: header flex justify-between, reseñas <ul> divide-y, cada item <li> py-4 first:pt-0. Botón 'Ver más' centrado, mt-4.
- [ ] **[Visual]** FavoriteButton overlay: icono 18px, circle 36px (h-9 w-9), shadow-sm, backdrop-blur, hover color cambio rojo. Disabled opacity-60.
- [ ] **[Visual]** Gallery: grid 4 cols, main foto col-span-2 row-span-2 en sm+, thumbs 1x1. Lightbox modal z-[100], inset-0, background slate-950/95.
- [ ] **[Visual]** CourtCard: aspect[4/3], border border-slate-200, shadow-sm. Badges capacity/surface con bg-emerald-50 / bg-slate-100. Precio tabular-nums.
- [ ] **[Edge]** Complejo con status=suspended: notFound() NO se llama, página renderiza message 'Este complejo no está disponible temporalmente.' con NoIndex metadata.
- [ ] **[Edge]** Complejo con status=blocked: mismo que suspended, página mostra unavailable message, noIndex=true en metadata.
- [ ] **[Edge]** Complejo con status=canceled: unavailable message renderiza.
- [ ] **[Edge]** Complejo con status=churned: unavailable message renderiza.
- [ ] **[Edge]** Complejo con status=deleted: unavailable message renderiza.
- [ ] **[Edge]** Complejo con status=trialing (ej. nuevo): página renderiza normal (no está en UNAVAILABLE_STATUSES), usuario puede reservar.
- [ ] **[Edge]** Complejo con status=past_due (alerta de pago): página renderiza normal, no bloquea reservas jugador (bloquea admin).
- [ ] **[Edge]** Complejo con 50+ fotos en galería: thumbs muestra primeras 4, última thumb + 1 overlay '+{extra}' si extra > 0, ejemplo '+46 fotos más'.
- [ ] **[Edge]** Complejo con nombre muy largo (100+ chars): h1 en TenantHeader no trunca, text-2xl font-semibold, puede wrappear.
- [ ] **[Edge]** Complejo sin horarios (todos null/closed): TenantHeader 'Horarios' section renderiza pero vacía (DAY_ORDER.map filtra nulls, return null).
- [ ] **[Edge]** Complejo sin teléfono (phone=''): TenantHeader link Tel no renderiza, WhatsApp sí (if whatsappUrl).
- [ ] **[Edge]** Complejo sin WhatsApp (whatsapp=null): link WhatsApp no renderiza.
- [ ] **[Edge]** Complejo sin descripción (description=null): TenantHeader p text-sm no renderiza.
- [ ] **[Edge]** Complejo sin logo (logoUrl=null): img logo no renderiza, nombre h1 sin logo adelante.
- [ ] **[Edge]** Slot duration puede ser 60 o 120 mins: SlotCell renderiza label 'Reservar' igual, duración en URL ?dur=60 o ?dur=120.
- [ ] **[Edge]** Precio centavos: slot.price=10000 (100 ARS), SlotCell renderiza Intl.NumberFormat es-AR con $100.00. Si null, no renderiza precio bajo 'Reservar'.
- [ ] **[Edge]** AvailabilityGrid, user at maxDate (último día permitido), botón 'Día siguiente' disabled, clic no hace nada.
- [ ] **[Edge]** AvailabilityGrid, user at todayStr, botón 'Día anterior' disabled, clic no hace nada.
- [ ] **[Edge]** Canonical URL metadata: buildMetadata path=`/${slug}`, absoluteUrl genera https://domain/{slug}, alternates.canonical correcto.
- [ ] **[Edge]** Metadata para complejo unavailable: noIndex=true, description generada, og:image puede ser null fallback a DEFAULT_OG_IMAGE.
- [ ] **[Edge]** Structured data LocalBusiness: buildLocalBusiness crea JSON-LD con nombre, dirección, phone, url, image. Breadcrumb tiene 3 items: Inicio, Explorar, ComplexName.
- [ ] **[Edge]** TenantGallery con 1 sola foto: prev/next buttons disabled o hidden en lightbox (photos.length > 1 check).
- [ ] **[Edge]** ReviewsSection total=0 pero API retorna error después: initial=[], fallback a empty state, resiliencia OK.
- [ ] **[Edge]** FavoriteButton con initialFavorited=true: renderiza 'Guardado', filled heart, red color, luego puede untoggle.
- [ ] **[Edge]** ShareButton sin url prop: usa window.location.href (client-side), copia el href actual.
- [ ] **[Edge]** Timezone conversión: getArtToday() manualmente resta 3 horas (UTC-3), retorna YYYY-MM-DD. Slots con time HH:MM ya en ART (display), sin conversión adicional.
- [ ] **[Edge]** bookingAdvanceDays default=6, maxStr=addDaysStr(todayStr, 6), user intenta acceder fecha en +7 días: fecha fuera rango, botón siguiente disabled, API rechaza.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: 1) AvailabilityGrid fetch falla silenciosa mantiene datos stale sin indicar error (loading=false pero tabla desincronizada). 2) date validation regex en page.tsx `/^\d{4}-\d{2}-\d{2}$/` no valida día/mes reales (2026-02-30 pasaría regex pero es inválida). 3) ReviewsSection loading=false pero si fetch falla, button sigue clickeable pero estado inconsistente. 4) Gallery key basado en photo+index en map puede causar rerender si fotos duplicadas existen en array. 5) SlotCell renderiza tel: link en markup inline onClick pero no event.preventDefault, puede haber doble navegación. 6) Metadata noIndex para status unavailable es correcto pero página renderiza siempre (no 404), confusión de UX posible. 7) ShareButton resolveUrl() usa window.location en cliente, pero button renderiza en server, copia href actual (navegador actual) no la URL del server.

---

### 13. Disponibilidad semanal
**URL:** `/{slug}/disponibilidad` · **Archivo:** `src/app/(public)/[slug]/disponibilidad/page.tsx`

- [ ] **[Render]** Cargar la vista /{slug}/disponibilidad con un tenant activo y sin parámetros: se debe mostrar título 'Disponibilidad semanal', link de back con el nombre del tenant, 7 botones de días de la semana (lun-dom) con formato corto (ej. 'Lun 15 jun'), el primer día activo (verde), grilla de canchas con columnas de hora y cancha, leyenda de colores (Libre/Ocupado/Pasado).
- [ ] **[Render]** Verificar que la grilla tabular semanal renderiza headers correctamente: columna 'Hora' a la izquierda, seguidas de columnas para cada cancha online, texto 'Cancha X' centrado en cada header.
- [ ] **[Happy path]** Desde /{slug}/disponibilidad, hacer clic en un slot libre (verde, status=free) de una cancha: debe navegar a /{slug}/reservar?court={courtId}&date={YYYY-MM-DD}&time={HH:MM}&dur={60|120} con URL correcta.
- [ ] **[Happy path]** En la grilla semanal, hacer clic en el botón 'Día siguiente' (ChevronRight) cuando no es el último día permitido: debe cargar la disponibilidad del día siguiente via GET /api/public/availability con spinner visible durante la carga, leyenda y grilla reemplazarse, fecha mostrada actualizada.
- [ ] **[Happy path]** En la grilla semanal, hacer clic en el botón 'Día anterior' (ChevronLeft) cuando no es hoy: debe cargar la disponibilidad del día anterior, spinner visible, grilla reemplazarse con nueva fecha.
- [ ] **[Happy path]** En la vista WeeklyAvailability, hacer clic en una de las 7 pestañas de día (ej. botón del miércoles): debe cambiar el día activo (verde) sin navegar, mostrar solo canchas/slots para ese día. Debe ser instantáneo (no spinner, estado local).
- [ ] **[Vacio]** Cuando no hay canchas online en un día: mostrar mensaje 'Sin canchas disponibles este día.' centrado, sin tabla, sin leyenda.
- [ ] **[Vacio]** Cuando hay canchas en un día pero el campo free.length === 0 para todas: mostrar 'Sin turnos libres.' bajo el nombre de cada cancha, sin botones de reserva.
- [ ] **[Carga]** Al cargar /{slug}/disponibilidad por primera vez: mostrar loading skeleton con 7 filas de Skeleton (h-5 w-32) para nombres de cancha, 8 Skeleton (h-8 w-20) por fila de slots, ningún contenido real visible hasta que cargue.
- [ ] **[Carga]** Mientras carga la grilla tabular (AvailabilityGrid) tras hacer clic en 'Día siguiente': mostrar Skeleton (h-48) en lugar de la tabla, botones Prev/Next deshabilitados (opacity-40, cursor-not-allowed).
- [ ] **[Carga]** Al cambiar de día en WeeklyAvailability (pestañas): cambio debe ser instantáneo sin spinner (estado local useState), sin petición HTTP.
- [ ] **[Error 400]** GET /api/public/availability con slug='' o ausente: retorna {error: 'invalid_params'} status 400, la grilla mantiene datos stale sin crash.
- [ ] **[Error 400]** GET /api/public/availability con date='invalid' o fuera de rango YYYY-MM-DD: retorna {error: 'invalid_params'} status 400 o {error: 'date_out_of_range'} status 400.
- [ ] **[Error 400]** GET /api/public/availability con date < hoy (ART) o date > hoy + bookingAdvanceDays: retorna {error: 'date_out_of_range'} status 400, UI mantiene última fecha válida.
- [ ] **[Error 404]** GET /api/public/availability con slug='nonexistent': retorna {error: 'not_found'} status 404, AvailabilityGrid sigue en pantalla (cache de stale data).
- [ ] **[Error 404]** Acceder a /{nonexistent-slug}/disponibilidad: Page.tsx llama getPublicTenant('nonexistent-slug'), retorna null, notFound() renderiza página 404 del app.
- [ ] **[Error 404]** Tenant con status='suspended'|'blocked'|'canceled'|'churned'|'deleted': page.tsx chequea UNAVAILABLE.has(status), llama notFound(), no renderiza WeeklyAvailability.
- [ ] **[Error 404]** GET /api/public/availability con tenant status cambió a 'suspended' entre peticiones: retorna {error: 'not_found'}, UI mantiene datos previos.
- [ ] **[Red/Timeout]** GET /api/public/availability falla (network error, timeout): AvailabilityGrid catch silencia error en loadDate(), mantiene disponibilidad previa, user puede reintentar con botón Día siguiente/Anterior.
- [ ] **[Red/Timeout]** Primera carga de /{slug}/disponibilidad falla (getPublicWeeklyAvailability cae): Server Component falla, 500 error page renderiza (error.tsx del layout).
- [ ] **[Permisos]** Acceder a /{slug}/disponibilidad como jugador anónimo: debe funcionar igual que cualquier otro, sin JWT requerido, es ruta pública.
- [ ] **[Permisos]** Acceder a /{slug}/disponibilidad como jugador autenticado con player_id: debe funcionar igual, disponibilidad es pública (no filtra por player).
- [ ] **[Permisos]** Acceder a /{slug}/disponibilidad de tenant A siendo admin del tenant B (JWT tiene tenant_id de B): disponibilidad de A se muestra igual, es ruta pública (no hay RLS en getPublicAvailability, usa publicTenant).
- [ ] **[Permisos]** Tenant con allowOnlineBooking=false y status='active': slots aún se cargan, pero en AvailabilityGrid, SlotCell renderiza <a href='tel:{phone}'> 'Contactar' en lugar de Link a /reservar.
- [ ] **[Sesion]** Navegación entre días en WeeklyAvailability (pestañas locales): ningún refresh de auth requiere, estado persiste.
- [ ] **[Sesion]** Si JWT expira mientras usuario navega en WeeklyAvailability: no afecta vista pública, solo afecta si intenta reservar (entraría a /reservar que requiere login).
- [ ] **[Doble submit]** Hacer clic dos veces rápido en el botón 'Día siguiente': loadDate() se ejecuta dos veces, pero loading=true deshabilita botones en segundo clic. Ambas peticiones pueden ir, pero setAvailability() last-write-wins.
- [ ] **[Concurrencia]** Con dos pestañas del browser en /{slug}/disponibilidad sincronizadas: cambiar día en pestaña A (setState date, setAvailability) no afecta pestaña B (componentes independientes, sin Realtime).
- [ ] **[Concurrencia]** Botón 'Día siguiente' deshabilitado cuando date === maxDate: maxDate = today + bookingAdvanceDays (ej. 6 días), 7º día no puede avanzar más, botón tiene disabled={true}.
- [ ] **[Responsive]** En mobile (viewport 375x667): grilla de pestañas de días (flex gap-2 overflow-x-auto) debe ser scrolleable horizontal sin overflow-y, cada botón day min-w-[68px].
- [ ] **[Responsive]** En mobile: tabla de disponibilidad (overflow-x-auto) debe scrollear horizontal sin romper layout, headers Hora/Cancha visibles.
- [ ] **[Responsive]** En tablet (768px): tablas y botones deben ocupar espacio apropiado (max-w-3xl en page), sin truncamiento indebido.
- [ ] **[A11y]** Botones día de la semana: cada uno tiene aria-pressed={isActive} (true para día activo, false para otros).
- [ ] **[A11y]** Section con aria-label='Disponibilidad semanal' en WeeklyAvailability y aria-label='Grilla de disponibilidad' en AvailabilityGrid.
- [ ] **[A11y]** Botones Día anterior/siguiente: aria-label='Día anterior' y 'Día siguiente', ChevronLeft/Right tienen aria-hidden=true.
- [ ] **[A11y]** Tabla: <table> con <thead> <th scope='col'> para cada header, <tbody> con <tr/td>, headers semánticos.
- [ ] **[A11y]** Slots sin status (null): renderiza '—' en texto, no debe confundir screen reader.
- [ ] **[A11y]** Verificar contraste: slots ocupados (text-red-600 on bg-red-50), slots libres (text-green-700 on bg-green-50), pasados (text-slate-400 on bg-slate-100): todos ≥ 4.5:1 WCAG AA.
- [ ] **[A11y]** Link 'Contactar' en SlotCell (cuando allowOnlineBooking=false): aria-label='Contactar al complejo para reservar', Phone icon aria-hidden=true.
- [ ] **[Visual]** Botón día activo: bg-emerald-600 text-white border-emerald-600, botón inactivo: bg-white text-slate-600 border-slate-200.
- [ ] **[Visual]** Slots libres: bg-green-50 text-green-700 ring-1 ring-green-600/20, hover:bg-green-100, active:scale-[0.98].
- [ ] **[Visual]** Slots ocupados: bg-red-50 text-red-600 ring-1 ring-red-600/20, no hover (span, no clickeable).
- [ ] **[Visual]** Slots pasados: bg-slate-100 text-slate-400, renderiza '—'.
- [ ] **[Visual]** Heading h1: text-xl font-bold tracking-tight text-slate-900 'Disponibilidad semanal'.
- [ ] **[Visual]** Heading h3 en WeeklyAvailability dentro de cada cancha: text-sm font-semibold text-slate-900, nombre de cancha.
- [ ] **[Visual]** Heading h2 en AvailabilityGrid: text-base font-semibold 'Disponibilidad', alineado left en flex entre botones navegación.
- [ ] **[Visual]** Botones Prev/Next: h-8 w-8, border border-slate-200, hover:bg-slate-50, cuando disabled opacity-40 cursor-not-allowed.
- [ ] **[Visual]** Leyenda (legend en AvailabilityGrid): flex wrap gap-3 pt-2 border-t border-slate-100, 3 items (Libre, Ocupado, Pasado) con cuadrados de color + texto.
- [ ] **[Edge]** Slot que cae exactamente en hora de cierre (ej. close='23:00', slot en 22:00 con dur=60 min): debe incluirse (start <= lastStart donde lastStart = closeMins - durationMins).
- [ ] **[Edge]** Slot que empieza 1 minuto antes de ahora en el mismo día: generateSlots() marca como past (isToday && start < nowMins).
- [ ] **[Edge]** Fecha histórica (antes de hoy en ART) en WeeklyAvailability: la vista no debería ofrecer esa pestaña, las 7 fechas comienzan en hoy (startDateStr = getArtToday()).
- [ ] **[Edge]** Complejo con closing hours='00:00' (medianoche, significa fin de día 24:00): closeMins se ajusta a 24*60=1440, slots finales hasta las 23:XX se generan correctamente.
- [ ] **[Edge]** Complejo con bookingDurationMinutes=[60,120]: getPublicWeeklyAvailability usa solo el primer valor (120min para la grilla semanal). Si se necesita 60min, debe cambiar en settings, solo renderiza 1 duración por día.
- [ ] **[Edge]** Día cerrado (dayHours.closed=true O fecha en closedDates[]): generateSlots() retorna [], se muestra 'Sin turnos libres' bajo la cancha, o 'Sin canchas' si TODAS las canchas cierran.
- [ ] **[Edge]** Slot con price=null: formatARS() no se ejecuta, slot renderiza sin precio en AvailabilityGrid (span vacío en <span className='text-[10px]'>), en WeeklyAvailability tampoco muestra precio.
- [ ] **[Edge]** Slot status='occupied' pero el precio se muestra (en código: SlotCell verifica ocupado ANTES de verificar precio): slot ocupado renderiza badge rojo 'Ocupado', sin precio visible.
- [ ] **[Edge]** Booking creado hace 1 segundo vs booking de ayer: ambos salen de la query (fecha dentro de rango, status != canceled), se restan del timeSlot según rangos (timeStartMins/timeEndMins overlap).
- [ ] **[Edge]** Tenant con timezone='America/Argentina/Buenos_Aires': openingHours se interpreta en UTC en la DB pero convertido a ART (UTC-3) vía la lógica getArtToday() que resta 3 horas al timestamp.
- [ ] **[Edge]** Dos slots separados por < 60 mins (ej. 12:00 y 12:30 con dur=60): si noDuration=60, ambos caben simultáneamente solo si no hay overlap. generateSlots() itera start+=durationMins, entonces solo genera 12:00, 13:00, etc.

> ⚠️ **Riesgo detectado en codigo:** Riesgos y bugs potenciales detectados: (1) WeeklyAvailability componente no rechaza arrays vacíos de days[], podría renderizar pestañas indefinidas; (2) AvailabilityGrid mantiene stale data silenciosamente en catch() de fetch error, sin UI que avise al user que falló la carga; (3) loadDate() no valida el resultado JSON antes de setAvailability(), si la API retorna formato inválido podría causar runtime error en buildTimeRows(); (4) No hay validación de límite de rate en frontend, user teóricamente podría spam los botones Día siguiente, cada una abre GET request; (5) Slug en URL no se valida hasta SSR (getPublicTenant), podrían entrar slugs con caracteres especiales que rompen query string; (6) El código de formatDayTab en WeeklyAvailability usa Date.UTC pero interpreta dateStr como ISO (sin horas), puede haber timezone mismatch si no se maneja bien; (7) Doble-click en slot puede navegar dos veces seguidas a /reservar antes de que React cierre la navegación; (8) No hay indicador visual cuando la ventana de reserva (6 días) cambia entre peticiones (ej. avanza 1 día, maxDate muta).

---

### 14. Mis reservas (jugador)
**URL:** `/mis-reservas` · **Archivo:** `src/app/(player)/mis-reservas/page.tsx`

- [ ] **[Render]** Cargar /mis-reservas sin parámetros como jugador autenticado: se renderiza la página con título 'Mis Reservas', dos tabs ('Próximos' y 'Historial'), tab 'Próximos' preseleccionado (borde inferior emerald-600 + texto emerald-700).
- [ ] **[Render]** En tab 'Próximos' con reservas futuras: lista de tarjetas (card blanco con borde) con cancha, complejo, fecha, hora, precio en $, badge de estado (ej. 'Confirmado' verde) y botón rojo 'Cancelar' visible solo en status='confirmed'.
- [ ] **[Render]** En tab 'Historial' con reservas pasadas: lista con estados 'Completado', 'Cancelado', 'Ausente', sin botón 'Cancelar' (solo aparece en confirmed); botón 'Dejar reseña' visible solo en status='completed' sin review previa.
- [ ] **[Render]** Formato de fecha: "jue. 1 ene" en zona horaria ART (UTC-3), extraído de bookingDate en UTC convertido a localeDateString con timeZone='America/Argentina/Buenos_Aires'.
- [ ] **[Render]** Formato de precio: montos en centavos mostrados como $X.XX (ejemplo: 10000 centavos = $100.00) usando Intl.NumberFormat con estilo currency y locale 'es-AR'.
- [ ] **[Render]** Badge de estado correcta: confirmed='Confirmado' (verde), pending_payment='Pago pendiente' (ámbar), completed='Completado' (gris), canceled_refunded='Cancelado' (gris), canceled_no_refund='Cancelado' (gris), no_show='Ausente' (rojo).
- [ ] **[Render]** Estado vacío tab Próximos: icono CalendarX, texto 'No tenés reservas próximas.' cuando bookings.length===0 y tab='proximos'.
- [ ] **[Render]** Estado vacío tab Historial: icono CalendarX, texto 'No tenés reservas en el historial.' cuando bookings.length===0 y tab='historial'.
- [ ] **[Render]** Badge 'Turno fijo' en gris (bg-slate-100) visible si booking.type='fixed', independiente del status.
- [ ] **[Happy path]** Click en tab Historial href='/mis-reservas?tab=historial': página no recarga (navegación client-side Link), cambia a Historial, vuelve a Próximos sin perder estado del formulario de cancelación si uno estaba abierto.
- [ ] **[Happy path]** Click en botón rojo 'Cancelar' en reserva confirmada: abre ConfirmDialog con descripción de la reserva, cancha, fecha, hora, explicación de plazo y reembolso, textarea opcional para motivo (max 500 chars).
- [ ] **[Happy path]** Completar cancelación dentro del plazo de horas (inPolicy=true): dialog cierra, refresh de página, reserva pasa a status='canceled_refunded', badge cambia a 'Cancelado' (gris), botón 'Cancelar' desaparece.
- [ ] **[Happy path]** Completar cancelación fuera del plazo (inPolicy=false): dialog cierra, refresh, status='canceled_no_refund', badge 'Cancelado' sin cambio visual, tooltip o copy sobre pérdida de seña no visible en v1 (solo en audit log del backend).
- [ ] **[Happy path]** Dejar reseña en reserva completed: click 'Dejar reseña', se abre Dialog, selector de 5 estrellas (radio group), textarea 500 chars, contador '0/500', botón 'Publicar reseña'. Click en estrella 5: se llena de ámbar. Comentario opcional.
- [ ] **[Happy path]** Enviar reseña completa (rating >= 1, comment opcional): POST a /api/player/reviews con {bookingId, rating, comment?}, respuesta 201, toast '¡Gracias por tu reseña!', dialog cierra, refresh, botón 'Dejar reseña' desaparece de la tarjeta.
- [ ] **[Happy path]** 'Reservar de nuevo' en completed: link href='/{tenant_slug}' navega a la página pública del complejo para reservar otra cancha.
- [ ] **[Validacion]** Motivo cancelación vacío o solo espacios: envía reason=undefined a la action, no causa error.
- [ ] **[Validacion]** Motivo cancelación 500+ caracteres: textarea tiene maxLength=500, no permite editar más, lado cliente solo.
- [ ] **[Validacion]** Motivo cancelación con emoji/caracteres especiales: se acepta y se guarda en canceled_reason (sin validación especial).
- [ ] **[Validacion]** Reseña sin estrella seleccionada: click 'Publicar reseña' sin elegir rating deshabilitado (rating < 1) → toast 'Elegí una calificación.' (destructive), dialog abierto.
- [ ] **[Validacion]** Reseña comentario vacío: se envía comment=undefined, API acepta (comentario opcional).
- [ ] **[Validacion]** Reseña comentario > 500 chars: contador muestra "501/500" visualmente pero submit sin validar lado cliente → cae a 500 en DB (schema max 500).
- [ ] **[Carga]** Durante submit de cancelación: botón 'Sí, cancelar' deshabilitado, muestra 'Procesando…', no se puede volver a clickear.
- [ ] **[Carga]** Durante fetch de reseña: botón 'Publicar reseña' deshabilitado (pending=true), muestra 'Enviando…', textarea readonly implícitamente (no interactúa).
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Error HTTP 404]** ID de booking inexistente en cancelación: Backend retorna error 'Reserva no encontrada.', dialog mantiene abierto, toast o error inline 'Reserva no encontrada.' (verificar donde se muestra error en ConfirmDialog).
- [ ] **[Error HTTP 409]** Enviar reseña en booking ya con review: API retorna 409 conflict, handleConfirm en LeaveReviewButton ve res.status === 409, toast 'Ya dejaste una reseña para esta reserva.', dialog cierra, refresh.
- [ ] **[Error HTTP 422]** Intentar cancelar reserva en status != 'confirmed': Backend tiende BookingNotInConfirmedError → 'La reserva no está en estado confirmado.', error mantenido en dialog (si está implementado el error display).
- [ ] **[Error HTTP 429]** Rate limit excedido (enforce 'playerBooking' falla): Backend retorna 429, frontend NO recibe error específico si lo maneja en el form (verificar routing del error).
- [ ] **[Error de red]** Conexión perdida durante POST /api/player/reviews: fetch falla, catch en try/finally, toast 'No pudimos guardar tu reseña.' (destructive), dialog abierto, rating y comentario preservados, permite reintentar.
- [ ] **[Error de red]** Timeout de 30s+ en cancelMyBookingAction: async function espera, si no hay timeout explícito en Next.js, el servidor eventualmente responde o timeout del navegador, UI muestra 'Procesando…' indefinidamente (risk: UX pobre, no hay re-intento automático).
- [ ] **[Permisos]** Jugador A intenta cancelar reserva de Jugador B (inyección de ID): withPlayerContext y RLS policy player_own_bookings_select filtran solo bookings.player_id=${playerId}, backend retorna 'Reserva no encontrada.' (defensa en profundidad).
- [ ] **[Permisos]** Jugador intenta reseñar booking de complejo diferente donde no jugó: backend verifica bookings.playerId === playerId, error 'La reserva ... no existe o no es tuya.'
- [ ] **[Permisos]** Jugador baneado en complejo X intenta ver su historial: la vista /mis-reservas NO tiene validación de player_status='active' o de tenant_player_bans; carga todas sus reservas en ese complejo. Riesgo potencial: si el complejo marca al jugador como banned, el jugador sigue viendo sus reservas pasadas (verificar si esto es intencionado).
- [ ] **[Sesion]** JWT expira durante navegación (click a Historial sin refrescar): el navegador tiene cookie de sesión, Next.js no re-valida hasta que haga una Server Action o refetch; la carga de reservas en el servidor sigue funcionando. Si expira durante cancelación, Supabase auth falla en extractAuthUser, retorna null, redirect('/login').
- [ ] **[Sesion]** JWT expira entre que se abre el dialog de cancelación y se confirma (5 min): cancelMyBookingAction requiere player, extractAuthUser falla, retorna error 'Dados inválidos.' o redirect; usuario ve dialog abierto o error, no puede continuar.
- [ ] **[Doble submit]** Dos clicks rápidos en 'Cancelar' botón: estilo activo scale-[0.98], pero sin debounce; CancelBookingButton solo tiene onClick setOpen(true), no previene doble click de handleConfirm en ConfirmDialog. ConfirmDialog usa isPending, primer click dispara handleConfirm, segundo click en el botón no hace nada (confDisabled=true), OK.
- [ ] **[Doble submit]** Click 'Sí, cancelar' dos veces rapidísimo en el dialog: useTransition(startTransition) de React 19, primer handleConfirm → startTransition → cancelMyBookingAction, isPending=true, confirmButton deshabilitado, segundo click sin efecto. Backend recibe una sola request (OK).
- [ ] **[Doble submit]** Click 'Publicar reseña' dos veces: setPending(true), submit disabled, segundo click sin efecto. Backend recibe una sola POST (OK).
- [ ] **[Concurrencia]** Cancelar mismo booking en dos pestañas: Pestaña A cancela → status='canceled_refunded', router.refresh() → revalidatePath('/mis-reservas') invalida el cache. Pestaña B carga lista desactualizada, intenta cancelar el mismo booking → backend lockBooking no encuentra status='confirmed' (ya fue cancelado) → error 'Reserva no confirmada.' en dialog, toast muestra error. Pestaña B no puede cancelar (correct behavior).
- [ ] **[Concurrencia]** Reservar mismo slot en dos tabs mientras uno está mirando el historial: /mis-reservas solo LISTA, no reserva, por lo que no hay race condition en esta vista.
- [ ] **[Responsive]** Pantalla móvil (375px): px-4 contenedor, max-w-lg, buttons h-11 (44px min tap target), textarea con filas=2, badges inline con shrink-0, lista stacked, tabs flex-1 (50% cada uno), OK.
- [ ] **[Responsive]** Pantalla tablet (768px): max-w-lg aplica, layout igual, sin cambios breakpoint específicos (probablemente se ve bien pero verificar overflow en estrellas de reseña 5x8px).
- [ ] **[Responsive]** Pantalla desktop (1440px): max-w-lg limita ancho a ~32rem en centro, margen auto, lista stacked, OK.
- [ ] **[A11y]** Tabs navegables con Tab key: Links href, focusables, no role=tab explícito pero <a> es focusable (verificar si hay focus-visible ring).
- [ ] **[A11y]** Tab Próximos: texto alterado según searchParams.tab, visualmente claro con borde+color diferente, pero screenreader no anuncia "página" o "selected" (no tiene aria-current='page' o similar).
- [ ] **[A11y]** Dialog cancelación: DialogHeader > DialogTitle anunciado al abrir, description en <div> leída, error anunciado con role='alert', botones 'Volver' y 'Sí, cancelar' claros. OK.
- [ ] **[A11y]** Selector de estrellas reseña: role='radiogroup' aria-label='Calificación', cada botón role='radio' aria-checked={rating===n} aria-label='N estrella(s)', muestra focus-visible ring-2, accessible (OK).
- [ ] **[A11y]** Labels en formularios: label htmlFor='cancel-reason', 'review-comment', 'confirm-phrase', todos asociados a inputs, OK. Contrastes: check después en estático (no en ejecución).
- [ ] **[Persistencia]** Abrir dialog cancelación, escribir motivo, cerrar con X: useTransition pending, dialog cierra, reason state se pierde. Volver a abrir: reason='' nuevamente. OK (expected).
- [ ] **[Persistencia]** Escribir reseña, cerrar dialog sin enviar: comentario='' se pierde, rating=0 reseteado (useState). Volver a abrir: formulario limpio. OK.
- [ ] **[Navegacion]** Back button del navegador en /mis-reservas?tab=historial → vuelve a /mis-reservas (sin tab), tab por defecto='proximos' (en else rama de tap === 'historial'). Re-renderiza con tab='proximos', usuario ve cambio abrupto (minor UX issue: debería recordar tab en bfcache o history.state).
- [ ] **[Navegacion]** Forward button después de back: vuelve a /mis-reservas?tab=historial, vuelve a historial. OK.
- [ ] **[Deep link]** Cargar /mis-reservas?tab=historial directamente: searchParams.tab='historial' en server, tab='historial', renderiza Historial, OK.
- [ ] **[Deep link]** Cargar /mis-reservas?tab=invalid: searchParams.tab='invalid', tap === 'historial' ? no, resulta en tab='proximos', renderiza Próximos (fallback OK).
- [ ] **[Deep link]** Cargar /mis-reservas?tab=proximos&unknown=param: searchParams solo lee 'tab', ignora 'unknown', funciona OK.
- [ ] **[Visual]** Tarjeta con cancha muy larga (>30 chars): truncación no explícita en page.tsx, p className='text-sm font-semibold text-slate-900' sin truncate, probablemente wrap (check screenshot).
- [ ] **[Visual]** Precio con 0 centavos (10000 = $100.00): formatARS(10000) muestra correctamente.
- [ ] **[Visual]** Precio con 1 centavo (101 = $1.01): muestra correctamente.
- [ ] **[Visual]** Hora con segundos (14:30:45): formatDate usa time_start.slice(0, 5) → '14:30', OK, segundos ignorados.
- [ ] **[Visual]** Timestamp futuro calculado artToday(): `new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)`, restar 3 horas simula ART. Si el servidor está en UTC, calcula bien; si en ART, resta 3 horas extra (potential bug: timezone dependencia en servidor).
- [ ] **[Visual]** Modal error en dialog cancelación: error state muestra en <p role='alert'> rojo, sin visual distractor (OK). Si error es muy largo (>200 chars), puede wrapar.
- [ ] **[Visual]** Botón 'Cancelar' rojo hover:text-red-700 → click desactiva visualmente (scale-[0.98] active, motion-reduce:scale-100 inclusive). OK.
- [ ] **[Edge]** Cancelación por complejo bloqueado (tenant_status='blocked' o 'deleted'): Backend checkea tenantStatus, lanza TenantInactiveError, handler retorna error (riesgo: error message genérico 'No se pudo completar' vs específico 'El complejo está bloqueado').
- [ ] **[Edge]** Sena pendiente de pago (deposit_status='pending'): reserva status='pending_payment', no muestra botón 'Cancelar' (solo confirmed). Si complejo completa pago después, status→'confirmed', refresh, botón 'Cancelar' aparece. OK.
- [ ] **[Edge]** Sena pagada pero fuera de plazo de cancelación: deposit_status='paid', status='confirmed', inPolicy=false, newDepositStatus='captured' (no reembolso). Botón 'Cancelar' sigue presente, usuario ve 'Cancelado' pero seña no refundada. Dialog dice 'la seña queda como cargo del complejo' (educacional, OK).
- [ ] **[Edge]** Reserva con payment_id=null pero deposit_status='paid': el backend checkea `if (b.deposit_status === 'paid') { if (inPolicy && b.payment_id && gateway)` → si payment_id es null, no reembolsa vía MP (error mitigation).
- [ ] **[Edge]** Ventana de 15 minutos (pending_payment timeout): booking status expire → status='expired' automáticamente (scheduler/cron). Vista lista solo pending_payment, no expired (¿aparece en Próximos o no?). Verificar si filter en page.tsx incluye 'expired' (probablemente se excluye). Risk: UI inconsistente si pending_payment->expired ocurre después de que el jugador ve la lista.
- [ ] **[Edge]** Reseña creada después de no-show: booking.status='no_show', canReview retorna false, LeaveReviewButton no renderiza. Si booking='completed' y user intenta reseñar via API, createReview verifica booking.status === 'completed', tiende ReviewBookingNotCompletedError → 422, toast 'Solo podés reseñar un partido que ya jugaste.' OK.
- [ ] **[Edge]** Borrado ARCO (anonymized): player_status='anonymized', usuario redirigido a /login o /logout (no implementado en esta vista). Si via backend player intenta reseñar, createReview no valida player_status, pero RLS policy en reviews table puede bloquear. Risk: verificar que deleted player no pueda reseñar (probablemente bloqueado en nivel DB).
- [ ] **[Edge]** bookingId en URL inválida (no UUID): searchParams.tab controla, no hay bookingId en URL, riesgo bajo. Si alguien manually POST /api/player/reviews con bookingId='invalid', validatedJson falla en safeParse, retorna validationError (422).
- [ ] **[Edge]** Timestamp en booking en futuro lejano (2099): formatDate y artToday() funcionan OK con dates válidas. Spinner durante carga no explícito en page (async server component, sin Suspense; por defecto muestra skeleton en Next.js 14).
- [ ] **[Edge]** Más de 200 reservas en el historial: query LIMIT 200, solo carga 200. Si jugador tiene 201+, ve solo 200 más recientes (OK para v1, puede ser feature de paginación después).
- [ ] **[Edge]** Reserva con court_name=null o tenant_name=null: JOIN garantiza courts y tenants exist (FK), pero si DB corrupto, puede ser null. Renderiza como empty string en <p>, OK sin crash.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: (1) Gestión de errores incompleta en CancelBookingButton: handleConfirm NO retorna resultado al diálogo, por lo que si la Server Action falla, el usuario nunca ve el error inline en el dialog (solo en consola). El return { success: false, error } se pierde. (2) Falta de validación en el cliente para artToday(): resta 3 horas asumiendo servidor en UTC; si el servidor está en ART, el cálculo de 'hoy' será incorrecto por 3 horas extra, causando que reservas 'hoy' aparezcan en Próximos vs Historial según hora del servidor. (3) Ausencia de manejo de sesión expirada explícito durante operaciones async: si JWT expira entre setOpen y handleConfirm, extractAuthUser falla silenciosamente y redirect('/login') ocurre, pero el usuario ve el dialog aún abierto (UX pobre, no hay feedback). (4) Ningún timeout explícito en server actions o API calls: si MP gateway cuelga durante reembolso, el usuario queda indefinidamente en estado 'Procesando...' sin opción de volver atrás (botón Cancel deshabilitado). (5) Validación de estado 'banned' (player_status o tenant_player_bans) no se ejecuta en /mis-reservas: un jugador baneado puede seguir viendo sus reservas (puede ser intencional pero riesgoso). (6) Estado 'pending_payment' con timeout de 15 min no es visible en la UI: si una reserva expira a 'expired' mientras el usuario mira la página, la lista se desactualiza (necesita refresh manual). (7) Timezone en artToday() depende de zona del servidor; calcula ART asumiendo servidor UTC, pero Next.js en producción puede estar en otra zona, causando off-by-one-day bug. (8) ConfirmDialog.onConfirm NO muestra error si la action falla sin retornar { success:false }: si cancelMyBookingAction lanza un error no capturado, se propaga y no hay error en dialog.

---

### 15. Configuracion: Politicas de reserva
**URL:** `/settings/reservas` · **Archivo:** `src/app/(admin)/settings/reservas/page.tsx`

- [ ] **[Render]** Cargar /settings/reservas como admin con PIN configurado: la página debe mostrar PinGate con spinner, luego el formulario de políticas de reserva con todos los campos visibles (radio de seña, porcentaje, reservas online, cancelación, penalidad no-show).
- [ ] **[Render]** Cargar /settings/reservas como admin SIN PIN configurado: PinGate debe ser un no-op, el formulario debe renderear directamente sin prompt de PIN.
- [ ] **[Render]** Verificar tab navegación: en /settings/reservas el tab 'Reservas' debe estar activo (border-emerald-600, text-emerald-700), otros tabs inactivos (border-transparent, text-slate-500).
- [ ] **[Happy path]** Habilitar seña (radio 'Requerir seña' = true), establecer porcentaje = 25, habilitar reservas online, cancelación = 6 horas, penalidad = ban_days con threshold=3 y days=10, click Guardar cambios: debe mostrarse feedback de éxito (revalidatePath ejecutado, página refresca), valores persistidos.
- [ ] **[Happy path]** Deshabilitar seña (radio 'Sin seña' = true), porcentaje se ignora, habilitar reservas online, cancelación = 0, penalidad = none, click Guardar: debe guardar settings con requires_deposit=false sin errores.
- [ ] **[Happy path]** Cambiar penalidad de 'Ban temporal' a 'Sin penalidad': los campos de threshold y días se ignoran, debe guardar no_show_penalty.type='none'.
- [ ] **[Validacion]** Porcentaje = 9 (por debajo de 10): el schema rechaza el valor, submit retorna error 'Datos inválidos' o mensaje de validación específico.
- [ ] **[Validacion]** Porcentaje = 101 (por encima de 100): el schema rechaza el valor, submit retorna error de validación.
- [ ] **[Validacion]** Porcentaje = texto o caracteres especiales: HTML5 input type=number rechaza entrada, submit no se ejecuta o navegador rechaza formData no numérica.
- [ ] **[Validacion]** Porcentaje vacío con seña activa: schema valida que el número es obligatorio (min(10)), submit retorna error; NO debe permitir guardar con porcentaje nulo/undefined.
- [ ] **[Validacion]** Anticipación cancelación = -1 (negativo): schema rechaza min(0), submit retorna error.
- [ ] **[Validacion]** Anticipación cancelación = 73 (por encima de 72): schema rechaza max(72), submit retorna error.
- [ ] **[Validacion]** Anticipación cancelación = 0 (sin límite): debe guardarse sin error (especificado en hint 'sin límite de anticipación').
- [ ] **[Validacion]** Threshold no-show = 0 (por debajo de 1): schema rechaza min(1), submit retorna error.
- [ ] **[Validacion]** Threshold no-show = 11 (por encima de 10): schema rechaza max(10), submit retorna error.
- [ ] **[Validacion]** Días ban = 0 (por debajo de 1): schema rechaza min(1), submit retorna error.
- [ ] **[Validacion]** Días ban = 31 (por encima de 30): schema rechaza max(30), submit retorna error.
- [ ] **[Validacion]** Espacios en blanco en porcentaje (p.ej., ' 50 '): input type=number limpia espacios, Number() convierte, debe funcionar normalmente (50).
- [ ] **[Carga]** Al hacer click Guardar con valores válidos, el botón debe mostrar estado disabled/disabled-like mientras se procesa (isPending vía useTransition).
- [ ] **[Carga]** Spinner o indicador visual durante el submit: si hay implementación, debe mostrarse. Si no hay, debe haber cambio visual del botón.
- [ ] **[Error 400]** Schema rechaza datos inválidos (ej. porcentaje string): retorna { success: false, error: 'Datos inválidos.' }, no deshabilita formulario, usuario puede reintentar.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Error 403]** PinGate requiere PIN pero usuario no lo verifica: verifyPinAction retorna locked=true con retryAtMs, UI muestra countdown, formulario inaccesible hasta desbloqueo.
- [ ] **[Error 500]** DB connection falla durante updateReservasPolicyAction: withTenantContext throws, server action captura error, retorna { success: false, error: ... }, UI muestra error.
- [ ] **[Red/Timeout]** FormData no se envía (network error): servidor no procesa, client-side puede reintentar; debe haber feedback visual de error.
- [ ] **[Red/Retry]** Después de un error temporal, usuario puede hacer click de nuevo en Guardar sin borrar datos.
- [ ] **[Permisos/PIN]** Admin tiene PIN configurado, intenta acceder a /settings/reservas sin pasar PinGate: verifyPinAction falla por PIN incorrecto, attemptsLeft decrece, after 5 intentos fallidos se bloquea por 5 min.
- [ ] **[Permisos/PIN]** Después de 5 intentos fallidos de PIN, botón Confirmar deshabilitado, countdown visible, intento de submit rechazado by UI.
- [ ] **[Permisos/PIN]** Si hay PIN configurado pero checkPinSessionAction retorna false (sesión expirada), se re-solicita el PIN.
- [ ] **[Permisos]** Empleado usando la misma cuenta admin CON PIN: PinGate bloquea acceso, debe ingresar PIN 4-8 dígitos.
- [ ] **[Sesion]** Token JWT expira durante el submit: extractAuthUser en el action retorna null, redirect('/login'), form no se procesa.
- [ ] **[Sesion]** Si el usuario cierra sesión en otra pestaña, intenta guardar formulario: checkPinSessionAction o extractAuthUser fallan, redirect al login.
- [ ] **[Doble submit]** Click rápido doble en Guardar cambios: useTransition previene doble ejecución, solo 1 request enviado, UI disables button.
- [ ] **[Doble submit]** Submit mientras está pendiente + cambios rápidos en campos: valores enviados son los del último estado antes del pending.
- [ ] **[Concurrencia]** Dos tabs abiertas con /settings/reservas, admin A cambia porcentaje a 50 en tab 1, admin B cambia a 40 en tab 2: el último en guardar win (merge via settings || patch), ambos cambios persisten (JSONB merge merge), no conflict error.
- [ ] **[Responsive]** En mobile (<640px), labels de campos deben ser visibles, inputs no truncados, botón Guardar full-width o accesible, gap y padding mantenidos.
- [ ] **[Responsive]** En tablet (768px), grid de threshold/dias debe apilar en 1 columna (grid-cols-2 media query), no overflow horizontal.
- [ ] **[A11y]** Labels htmlFor vinculados correctamente: <Label htmlFor='depositPercentage'> → <Input id='depositPercentage'>, focus lleva al campo correcto.
- [ ] **[A11y]** Legend y fieldset estructura: fieldset 'Seña' y 'Penalidad por no-show' deben estar semánticamente correctos para lectores de pantalla.
- [ ] **[A11y]** Orden de tabulación: radio buttons, inputs, botón Guardar accesibles con Tab, no saltos de foco.
- [ ] **[A11y]** Mensajes de error anunciados: role='alert' en PinGate (PIN incorrecto, bloqueado), notificación de validación visible.
- [ ] **[A11y]** Contraste: labels slate-700/slate-600, inputs slate-900, hints slate-500: todos >= 4.5:1 contra fondo blanco/gris claro.
- [ ] **[A11y]** Hints de entrada (p.ej., 'Entre 10% y 100%', '0 = sin límite') deben tener id y aria-describedby en inputs, o estar asociados por context claro.
- [ ] **[Persistencia]** Guardar, recargar F5: página recupera valores savedos (defaultValue={s.deposit_percentage}), sin pérdida de datos.
- [ ] **[Persistencia]** Cambiar pestaña a /settings/pin, volver a /settings/reservas: valores persisten (revalidatePath ejecutado, servidor re-fuerza defaultValues).
- [ ] **[Navegacion]** Click back del navegador después de guardar: vuelve a página anterior sin perder cambios (revalidatePath asegura sync).
- [ ] **[Navegacion]** Navegar a /settings/horarios mientras está pendiendo el submit: la acción debería completarse o cancelarse sin error.
- [ ] **[Deep link]** Acceder a /settings/reservas directo vía URL: renderea sin error, PinGate se interpone si hay PIN, luego form carga con datos correctos.
- [ ] **[Deep link]** Acceder a /settings/reservas con query string inválido (ej. ?invalid=true): parámetro se ignora, página funciona normalmente (no hay query params en lógica).
- [ ] **[Visual]** Botón Guardar cambios: bg-emerald-600, hover:bg-emerald-500, text white, no-underline, height apropiado, padding consistente.
- [ ] **[Visual]** Padding form: space-y-6 entre secciones, space-y-3 dentro de fieldsets, space-y-1.5 en label+input, visualmente balanceado.
- [ ] **[Visual]** Radio buttons: accent-emerald-600, label text slate-600, cursor-pointer en label, gap-2 entre icon y text.
- [ ] **[Visual]** Input fields: border slate-200, focus ring emerald-500, bg white, disabled:opacity-50, placeholder slate-400, height h-10/h-11 responsive.
- [ ] **[Visual]** Fieldset legend: font-medium text-sm text-slate-700, bordes/background, spacing uniforme.
- [ ] **[Visual]** Tab navigation: active border-emerald-600 (bottom-2), inactive border-transparent, hover:text-slate-900, smooth transition-colors, alineación baseline.
- [ ] **[Edge]** Tenant status = 'suspended': layout redirige a /suspended antes de renderear settings (redirectIfTenantSuspended), form nunca se muestra.
- [ ] **[Edge]** Tenant status = 'blocked'/'canceled'/'churned': mismo redirect, protección contra mutaciones en tenant inválido.
- [ ] **[Edge]** Tenant en trial: puede guardar políticas, settings se persisten, onboarding_completed debe ser true para acceder (checked en layout).
- [ ] **[Edge]** Tenant past_due: puede guardar políticas (no es suspensión), permite mutations.
- [ ] **[Edge]** Settings JSONB corruptos (ej. malformed JSON en DB): getStaffTenant falla al parsear, error durante rendering o en action, graceful error handling.
- [ ] **[Edge]** Simultaneous updates: dos requests concurrentes del mismo admin, ambos leen settings, hacen patches, ejecutan `sql || patch`: merge JSONB resuelve, sin data loss.

> ⚠️ **Riesgo detectado en codigo:** Riesgos detectados: 1) No hay feedback visual claro del usuario (toast/modal) tras guardar exitosamente el formulario - solo revalidatePath silencioso, sin confirmación explícita. 2) El formulario NO usa useFormStatus ni useTransition para disabled state del botón durante submit - puede permitir múltiples clics rápidos aunque server-side sea idempotente. 3) Validación de schema solo server-side (Zod) - validación HTML5 basic via type=number/min/max, pero sin personalización de mensajes de error específicos por campo. 4) No hay manejo explícito de race conditions en JSONB merge si dos admins actualizan simultáneamente el mismo tenant (aunque JSONB || operator resuelve at DB level). 5) PinGate cierra bien si no hay PIN (pinRequired=false), pero no hay warning/toast si admin intenta guardar sin pasar el gate. 6) Tipo de radio buttons con formData no garantiza valor válido si JavaScript deshabilitado - dependencia de client-side input de HTML5. 7) Campo depositPercentage puede ser enviado como string vacío en formData, Number() convierte a NaN, schema.parse() luego falla, pero mensaje de error es genérico. 8) Si tenant.settings es null (edge case raro), defaultValue de inputs falla - no hay fallback visible en UI.

---

### 16. Configuracion: Horarios
**URL:** `/settings/horarios` · **Archivo:** `src/app/(admin)/settings/horarios/page.tsx`

- [ ] **[Render]** Al cargar la página sin PIN configurado: la vista se renderizan completa sin bloquearse por PinGate, mostrando la sección de Horarios (7 días) y Días cerrados (vacío o con fechas).
- [ ] **[Render]** Al cargar la página CON PIN configurado y sin sesión PIN verificada: PinGate bloquea la vista y muestra el modal de ingreso PIN (Lock icon, label 'Zona protegida', input PIN, botón 'Confirmar').
- [ ] **[Render]** Grid de horarios visible con exactamente 7 filas: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo (labels en español), cada una con inputs 'type=time' Apertura y Cierre.
- [ ] **[Render]** Valores por defecto en inputs de horarios: apertura 08:00 (lunes-jueves, viernes), 09:00 (sábado-domingo); cierre 00:00 (lunes-jueves), 01:00 (viernes-sábado), 23:00 (domingo) según DB schema. Si el tenant tiene horarios guardados, se cargan desde DB.
- [ ] **[Render]** Pestañas de Settings superior: Reservas, Horarios (activa con borde inferior verde esmeralda), Facturación, Seguridad. Pestaña activa tiene borde-bottom 'border-emerald-600' + texto 'text-emerald-700'.
- [ ] **[Render]** Botón 'Guardar horarios' (clase bg-emerald-600) en la sección Horarios. Botón 'Agregar' en la sección Días cerrados. Botón 'Quitar' rojo en cada fecha cerrada existente.
- [ ] **[Render]** Input date picker para agregar días cerrados con atributo 'min' establecido al día actual (previene seleccionar fechas pasadas en el cliente). Label 'Agregar día cerrado'.
- [ ] **[Vacio]** Sección 'Días cerrados' cuando no hay fechas cerradas: muestra mensaje 'No hay días cerrados configurados.' (texto gris 'text-slate-500').
- [ ] **[Vacio]** Sección 'Días cerrados' cuando hay fechas: lista renderizada con sort().map() para mostrar en orden ascendente (YYYY-MM-DD de la DB).
- [ ] **[Happy path]** Guardar horarios válidos: cambiar apertura lunes a 09:00 y cierre a 20:00, hacer click 'Guardar horarios', la acción updateHorariosAction se ejecuta sin errores (validación Zod pasa: regex /^([01]\d|2[0-3]):[0-5]\d$/), DB se actualiza, revalidatePath ejecuta, página recarga con los nuevos valores persistidos.
- [ ] **[Happy path]** Agregar fecha cerrada futura: seleccionar una fecha 5 días adelante en el date picker, click 'Agregar', la acción addClosedDateAction se ejecuta, la fecha se añade al array closedDates del tenant, aparece en la lista ordenada alfabet. (YYYY-MM-DD).
- [ ] **[Happy path]** Eliminar fecha cerrada: hacer click 'Quitar' en una fecha cerrada existente, la acción removeClosedDateAction se ejecuta con FormData{ date }, esa fecha se filtra del array closedDates, lista se actualiza al recargar.
- [ ] **[Validacion]** Formato de hora INVÁLIDO en apertura (p.ej. '25:99'): Zod rechaza la validación regex en updateHorariosAction, retorna { success: false, error: 'Formato HH:MM' }. El cliente NO ve feedback (BUG: el form retorna resultado pero no hay consumer).
- [ ] **[Validacion]** Formato de hora VÁLIDO en apertura (p.ej. '14:30'): pasa regex /^([01]\d|2[0-3]):[0-5]\d$/, Zod.safeParse exitoso, actualiza DB.
- [ ] **[Validacion]** Hora cierre ANTERIOR a apertura (p.ej. apertura 18:00, cierre 14:00): NO HAY VALIDACION en el código (Zod solo valida formato). Guarda valores inválidos sin error, produciendo un horario imposible (BUG CRÍTICO).
- [ ] **[Validacion]** Fecha cerrada en formato INVÁLIDO (p.ej. '32-13-2025'): la acción addClosedDateAction valida regex /^\d{4}-\d{2}-\d{2}$/, rechaza y retorna error. Input type='date' del navegador no permite ingresar fechas inválidas.
- [ ] **[Validacion]** Fecha cerrada en el PASADO: el input tiene min={new Date().toISOString().split('T')[0]}, el navegador bloquea seleccionar fechas < hoy. No hay validación server-side de fecha pasada (confiar en cliente).
- [ ] **[Validacion]** Agregar la MISMA fecha cerrada dos veces: acción valida if (!existing.includes(date)) antes de añadir, idempotencia = no duplica en DB (línea 92 de actions.ts).
- [ ] **[Carga]** Mientras se procesa updateHorariosAction: el formulario es un plain HTML form (sin useFormStatus), NO hay spinner/loading state visual. Botón permanece clickeable, riesgo de doble submit si usuario hace click rápido.
- [ ] **[Carga]** Mientras se procesa addClosedDateAction: igual, NO hay loading state. Input date + botón Agregar permanecen activos.
- [ ] **[Carga]** Mientras PinGate verifica sesión PIN (mounted, verificando si tiene sesión válida): spinner renderizado ('h-6 w-6 animate-spin border-2 border-emerald-600' con aria-label 'Verificando...', role='status').
- [ ] **[Error 400]** updateHorariosAction con FormData malformado (campos faltantes): los DAYS.map() construye el objeto raw; si falta un día, Zod.safeParse falla, retorna { success: false, error: issues[0]?.message }. Cliente no ve error.
- [ ] **[Error 401]** extractAuthUser() retorna null o user.type !== 'staff': action redirige a /login (no retorna result). PinGate puede estar visible pero session expiró en background.
- [ ] **[Error 403]** checkPinSessionAction() retorna false (PIN requerido pero no verificado): updateHorariosAction retorna { success: false, error: 'PIN requerido.' }. Cliente no ve error (BUG).
- [ ] **[Error 409]** adminRateLimited(tenant.id) retorna mensaje de rate limit: acción retorna { success: false, error: limited }. Cliente no obtiene feedback (BUG).
- [ ] **[Error 500]** DB falla (withTenantContext lanza): la Server Action falla, error propagado, cliente recibe error boundary genérico (no typed result).
- [ ] **[Red/Timeout]** Si la red se corta DURANTE updateHorariosAction: Server Action timeout (default 30s), cliente obtiene error genérico o 500. Sin retry automático. Usuario no sabe si se guardó.
- [ ] **[Red/Timeout]** Si la red se corta al enviar addClosedDateAction: timeout, error genérico. Usuario intenta click nuevamente (duplicación posible si acción fue half-success).
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Permisos]** Admin SIN PIN configurado en tenant intenta guardar: checkPinSessionAction() retorna true (PIN no requerido), acción procede sin bloqueo.
- [ ] **[Permisos]** Empleado del MISMO complejo intenta acceder: tiene user.staffUserId vinculado al tenant via tenantStaffMembers, getStaffTenant() retorna tenant, acceso permitido (pueden cambiar horarios si pasan PIN).
- [ ] **[Permisos]** Admin del COMPLEJO_A intenta modificar horarios mientras está logeado en COMPLEJO_B: extractAuthUser() retorna correctamente staff del complejo B, getStaffTenant(staffUserId) retorna tenant B, modifica tenant B (no hay cross-tenant tampering en el código).
- [ ] **[Sesion]** JWT auth expira DURANTE el guardado: en medio de updateHorariosAction, extractAuthUser() en línea 35 ya extrae user (antes de caducar). Si caduca DESPUÉS de eso pero ANTES de DB update, condición user check pasa pero DB update puede fallar. Error 500 sin retry.
- [ ] **[Sesion]** PIN verificado hace 10 horas, luego usuario navega a otra pestaña y vuelve a /settings/horarios: checkPinSessionAction() valida que aún hay sesión (sin timeout explícito en el código visible). Si sesión expiró, retorna false.
- [ ] **[Doble submit]** Usuario hace click 'Guardar horarios' dos veces rápido: form HTML estándar, sin button disabled, SIN useFormStatus. Segundo click envía FormData nuevamente. DB update idempotente (eq tenants.id), segundo UPDATE escribe los MISMOS valores. Operación idempotente, UI no sufre pero hay 2 DB queries innecesarias.
- [ ] **[Doble submit]** Usuario hace click 'Agregar' en días cerrados dos veces rápido: la acción valida `if (!existing.includes(date))` antes de añadir. Si ambos requests llegan casi juntos, race condition posible: A lee existing=[X], B lee existing=[X], ambas añaden Y, resultado podría ser [X,Y,Y] si no hay sincronización.
- [ ] **[Concurrencia]** Dos ventanas del MISMO admin abiertas. En ventana A guardar apertura=09:00. En ventana B guardar apertura=10:00. Último write wins (B). Ambas hacen updateHorariosAction contra el mismo tenant.id, última actualización sobrescribe. Sin conflicto de DB, pero UI de A no se refresca (BUG: no hay Realtime ni polling).
- [ ] **[Responsive]** Grid de horarios en mobile (320px): inputs 'type=time' con className='h-10 w-32' podrían no caber. Grid es 3 columnas (label, open, close), puede overflow en viewport pequeño. Sin media queries responsive aparentes en el código.
- [ ] **[Responsive]** Fecha cerrada lista en mobile: items con flex items-center justify-between, botón Quitar puede estar comprimido. Fecha formateada con toLocaleDateString puede ocupar mucho espacio.
- [ ] **[A11y]** Input apertura/cierre SIN labels explícitas: ARIA falla. Input está dentro de <grid> y recibe nombre implícito de <Label> anterior, pero no htmlFor. Potencial issue de asociación.
- [ ] **[A11y]** PinGate modal: botón 'Confirmar' tiene className pero sin aria-label para screen readers. Input PIN tiene inputMode='numeric' pero sin aria-describedby para el error.
- [ ] **[A11y]** Orden de tabulación en página completa: tab navega por SETTINGS_TABS (links), luego inputs horarios (7×2=14 inputs), luego botón Guardar, luego input date, botón Agregar, luego botones Quitar. Orden lógico left-to-right, top-to-bottom.
- [ ] **[A11y]** Error de validación mostrado por Zod (p.ej. 'Formato HH:MM'): texto en <p role='alert'> pero NUNCA se renderiza porque NO HAY client-side consumer del resultado. Si hubiera toast, necesitaría aria-live='polite'.
- [ ] **[Visual]** Colores: active tab borde 'border-emerald-600', botones Guardar/Confirmar 'bg-emerald-600', botón Quitar 'text-red-600 hover:text-red-700'. Contraste con fondos debe cumplir WCAG AA (no verificado aquí).
- [ ] **[Visual]** Espaciado: form 'space-y-3' entre filas de grid. Botón 'pt-2' antes de Guardar. Fecha cerrada lista 'space-y-2'. Consistencia de padding/margin según Tailwind scale.
- [ ] **[Visual]** Overflow: fecha cerrada muy larga (p.ej. 'Miércoles, 32 de diciembre de 2025' si JavaScript permite): sin truncamiento, puede romper layout del li.
- [ ] **[Edge]** Guardar con apertura=00:00, cierre=00:00 (mismo horario): Zod valida OK (ambos pasan regex), se guarda. Semánticamente es cerrado 24/7. No hay validación lógica.
- [ ] **[Edge]** Agregar fecha cerrada para HOY: input tiene min={today}, pero IGUAL día podría permitirse en algunas implementaciones. Sin validación server-side de 'no today', si hoy es 2025-01-15 y user logra enviar 2025-01-15 (bypass cliente), servidor la acepta.
- [ ] **[Edge]** closedDates muy larga (100+ fechas cerradas): la lista se renderiza sin paginación. Cada <form> con <input hidden> + <Button> es 40+ bytes × 100 = 4KB+ de HTML. No hay virtualization.
- [ ] **[Edge]** Horario cierre 'anterior' a apertura (p.ej. apertura=22:00, cierre=06:00): sin validación, se guarda. El sistema de generación de slots puede fallar al calcular duraciones. BUG CRÍTICO de lógica.
- [ ] **[Persistencia]** Guardar horarios, recargar página (F5), verificar valores: si revalidatePath('/settings/horarios') se ejecutó, getStaffTenant() rellena nuevamente desde DB, valores mostrados son los guardados.
- [ ] **[Persistencia]** Agregar fecha cerrada, limpiar cache del navegador, recargar: fecha debe estar en DB via closedDates array. Visible en getStaffTenant().closedDates.
- [ ] **[Persistencia]** Guardar horarios pero NO confirmar PIN (PIN requerido pero usuario cancela): checkPinSessionAction() retorna false, acción retorna error 'PIN requerido.', cambios NO se guardan (correctamente bloqueado).
- [ ] **[Navegacion]** Desde /settings/horarios, click en pestaña 'Reservas': navega a /settings/reservas (href='/settings/reservas'), componente correspondiente se renderiza. Historial de navegación funciona.
- [ ] **[Navegacion]** Desde /settings/horarios, botón atrás del navegador: va a página anterior (p.ej. /grilla), historial respetado.
- [ ] **[Deep link]** Acceder directamente a /settings/horarios sin sesión: extractAuthUser() retorna null, redirige a /login. No hay fallback a home.
- [ ] **[Deep link]** URL tiene typo /settings/horaios: Next.js 404, página no encontrada.
- [ ] **[Integracion]** Guardar horarios que luego afectan disponibilidad de slots (6 días de anticipación): sin validación de impacto, horarios se guardan. Sistema de slot generation usando `booking_advance_days` de settings debe re-generar slots respetando openingHours, pero no sincroniza.
- [ ] **[Integracion]** Agregar fecha cerrada hoy (bypass cliente + server): la fecha aparece en closedDates. Cron B5 de generación de slots respeta closedDates cuando genera para los próximos 8 días. Integración correcta si no hay race.
- [ ] **[Edge]** PinGate con PIN requerido pero extractAuthUser() retorna user sin staffUserId: línea 34 hasPin = !!tenant.settings.staff_pin_hash; si tenant es null (línea 30 redirige antes de llegar aquí), PinGate nunca se renderiza. Flujo seguro.

> ⚠️ **Riesgo detectado en codigo:** BUGS CRÍTICOS DETECTADOS: 1) No hay validación de cierre >= apertura: usuario puede guardar apertura=18:00, cierre=14:00 sin error, horario imposible que rompe lógica de slots. 2) Sin feedback visual (toast/error) del resultado de las acciones: HorariosActionResult es retornado pero nunca consumido en el cliente; errores de validación (Zod), rate limit, PIN no se muestran a usuario. 3) Fechas cerradas pasadas se renderizan: línea 102 ordena pero no filtra closedDates.filter(d => d >= today); Si admin no elimina manualmente, lista se ensucia. 4) Sin loading state durante submit: form HTML puro sin useFormStatus, usuario puede hacer click múltiples veces, aunque operación sea idempotente en DB. 5) Race condition leve en addClosedDateAction: lee existing.includes(), luego add; si dos requests simultáneos, duplicación posible (aunque unlikely). 6) Sin sincronización Realtime: dos admins en ventanas diferentes pueden pisar horarios mutuamente, último write wins, no hay notificación. 7) Validación de formato de fecha cerrada solo regex /^\\d{4}-\\d{2}-\\d{2}$/, no valida fechas imposibles (2025-02-30). 8) Input type=time no tiene validation de cierre >= apertura antes de submit.

---

### 17. Configuracion: Facturacion (SaaS + MP)
**URL:** `/settings/facturacion` · **Archivo:** `src/app/(admin)/settings/facturacion/page.tsx`

- [ ] **[Render]** Admin accede a /settings/facturacion sin PIN configurado: ver tabs de navegación (Reservas, Horarios, Facturación activo en emerald, Seguridad) y sección de Suscripción con 3 columnas (Plan, Estado, Próximo cobro) más sección MercadoPago.
- [ ] **[Render]** Admin con PIN configurado accede a /settings/facturacion: PinGate se carga con spinner 150ms, verifica sesión PIN, y si no hay sesión PIN válida muestra formulario con campo numerado, placeholder '••••', botón Confirmar deshabilitado, texto '••••', icono Lock.
- [ ] **[Happy path - Sin suscripción]** Admin sin suscripción ve texto 'Todavía no tenés una suscripción activa. Conectá MercadoPago para empezar a cobrar señas y activar tu plan.' en sección Suscripción.
- [ ] **[Happy path - Con suscripción trialing]** Admin en estado trialing ve Plan (ej. 'Predio'), Estado ('Período de prueba'), Próximo cobro (fecha formateada es-AR), sin botón desconectar MP.
- [ ] **[Happy path - Con suscripción active]** Admin en estado active ve Plan, Estado ('Activa'), Próximo cobro (fecha), sección MP con badge verde 'Conectado' y botón Desconectar (si implementado).
- [ ] **[Happy path - Con suscripción past_due]** Admin en estado past_due ve Plan, Estado ('Pago pendiente'), Próximo cobro (fecha roja o destacada), sección MP con indicador de estado, sin opción desconectar.
- [ ] **[Happy path - Sin MP conectado]** Sección MercadoPago muestra icono CreditCard, descripción 'Conectá tu cuenta para cobrar las señas...', botón 'Conectar MercadoPago' con ícono ExternalLink, link href '/api/mp/oauth-start'.
- [ ] **[Happy path - Con MP conectado]** Sección MercadoPago muestra badge 'Conectado' con CheckCircle2, sin botón Conectar (botón desaparece), descripción visible.
- [ ] **[Happy path - MP OAuth flujo completo]** Click en 'Conectar MercadoPago' → redirige a /api/mp/oauth-start → crea state HMAC con tenantId + ts → redirige a https://auth.mercadopago.com/authorization con client_id, response_type=code, platform_id=mp, state, redirect_uri → callback almacena tokens encriptados en DB → redirige a /dashboard.
- [ ] **[PinGate]** Con PIN configurado, al entrar a /settings/facturacion si pinRequired=true y no hay cookie tg_pin_session válida: muestra modal PIN. Al ingresar PIN incorrecto tras 5 intentos en 5 min: bloquea entrada durante lockout, muestra 'Demasiados intentos fallidos. Volvé a intentar en X min.', cuenta regresiva M:SS.
- [ ] **[PinGate - Locked state]** Cuando está bloqueado (lockedUntilMs > now), campo PIN deshabilitado, botón Confirmar deshabilitado, texto rojo de bloqueo, el intervalo actualiza el countdown cada 1s, al expirar lockout se limpia error y se habilita campo.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Permisos - Otro tenant]** Staff del Tenant A accede a /settings/facturacion: ve solo datos del Tenant A (RLS via withTenantContext).
- [ ] **[Error carga suscripción - try-catch]** getSubscriptionState lanza SubscriptionNotFoundError: try-catch en línea 38-42 captura, asigna sub=null, sección Suscripción muestra texto de 'sin suscripción' (no crash, no error screen).
- [ ] **[Error carga suscripción - tenant eliminado]** Tenant borrado de DB, getSubscriptionState lanza error: catch asigna sub=null, page renderiza normalmente sin sección de plan (graceful fallback).
- [ ] **[Validación PIN - Min length]** Campo PIN con pattern [0-9]{4,8}, ingresar '123': no cumple min 4 dígitos, botón Confirmar deshabilitado, no se ejecuta verifyPinAction.
- [ ] **[Validación PIN - Max length]** Ingresar '123456789' (9 dígitos): pattern rechaza, HTML5 validation, input no acepta 9º dígito, botón sigue deshabilitado.
- [ ] **[Validación PIN - Non-numeric]** Ingresar 'abcd' o '12ab': pattern [0-9] rechaza letras, HTML5 validation, input solo acepta dígitos vía inputMode=numeric.
- [ ] **[Validación PIN - Espacios y emoji]** Input de PIN con spaces o emoji: inputMode=numeric + pattern descartan, no se envían a servidor.
- [ ] **[Error 401 - extractAuthUser****: Supabase retorna error al llamar getUser() en middleware: extractAuthUser() retorna null → redirect('/login').
- [ ] **[Error 401 - getStaffTenant]** Staff_user borrado de DB: getStaffTenant retorna null → línea 35 redirect('/login').
- [ ] **[Error 403 - Tenant suspendido]** Admin layout chequea redirectIfTenantSuspended() → si feature flag suspended=true → redirect('/suspended'), nunca llega a /settings/facturacion.
- [ ] **[Error 403 - tenant.status bloqueado]** Tenant con status='blocked', 'suspended', 'canceled', 'churned': with-tenant.ts middleware redirección (si implementado) → admin no accede a panel.
- [ ] **[Error 500 - Billing gateway]** MP_CLIENT_ID o MP_CLIENT_SECRET faltante en .env al clickear 'Conectar MP': /api/mp/oauth-start redirige a /onboarding?error=mp_not_configured, no crash.
- [ ] **[Error 500 - Token exchange fail]** MP token endpoint retorna 500: /api/mp/callback redirige a /onboarding?error=mp_token_failed, transacción sin estado de DB corrupto.
- [ ] **[Network timeout - getSubscriptionState]** DB timeout al cargar suscripción: catch en línea 40-42 captura error, sub=null, fallback graceful.
- [ ] **[Network timeout - PinGate checkPinSessionAction]** Llamada a cookies() o DB timeout en checkPinSessionAction: catch asigna verified=false, PinGate muestra prompt PIN (no spinner infinito).
- [ ] **[Doble click - Conectar MP]** Clickear 'Conectar MercadoPago' dos veces rápido: primer click redirige a OAuth URL, segundo click no ejecuta porque navegación ya ocurrió.
- [ ] **[Doble click - PIN submit]** Con PIN válido, clickear Confirmar dos veces: startTransition desactiva evento, verifyPinAction idempotente (verifyPin() siempre retorna mismo resultado), cookie se setea una vez.
- [ ] **[Navegacion atras - PIN gate locked]** Bloqueo PIN 5 min, presionar back del navegador: back no limpia lockout (estado en React), si intentas submit sigue bloqueado hasta que pase ms.
- [ ] **[Navegacion atras - Desde MP OAuth]** Después de redirigir a MP OAuth, presionar back: vuelves a /api/mp/oauth-start (sin code en params) → GET redirige a /onboarding?error=... (código ausente).
- [ ] **[Deep link - URL sin auth]** Acceder directamente a URL pública con /settings/facturacion sin sesión: redirect('/login'), no renderiza ni intenta cargar datos.
- [ ] **[Deep link - URL malformada]** /settings/facturacion?invalid=param: Next.js ignora params unknowns, page renderiza normalmente (params no usados en server component).
- [ ] **[Responsive - Mobile]** En mobile (375px): nav tabs se apilan verticalmente, sección 2x2 grid se colapsa, botón 'Conectar MP' llena ancho, PinGate max-w-sm se ajusta.
- [ ] **[Responsive - Tablet]** En tablet (768px): grid 2x3 se mantiene, nav tabs en fila, botones y campos se expanden bien, checkCircle icon visible en badge.
- [ ] **[Responsive - Desktop]** En desktop (1440px): sección 3-col grid completa, nav tabs en fila, campos y botones tamaños standard, shadow-sm visible en cards.
- [ ] **[Accesibilidad - Teclado PIN]** Tab entra en campo PIN → type PIN → Tab a botón → Enter submit → if ok, listener llama setVerified(true), se renderiza children (no trap de foco).
- [ ] **[Accesibilidad - Labels]** Campo PIN tiene <Label htmlFor="pin">PIN</Label>, asociación label-input correcta, aria-label en spinner cuando verified===null.
- [ ] **[Accesibilidad - ARIA alerts]** Errores PIN renderean con role="alert" o role="status", screen readers anuncian 'PIN incorrecto', 'Bloqueado hasta X'.
- [ ] **[Accesibilidad - Contraste]** Texto slate-900 sobre bg-white: ratio >= 4.5:1. Botón emerald-600 con emerald-700 hover: ratio >= 3:1. Badge emerald-50 texto emerald-700: contraste OK.
- [ ] **[Accesibilidad - Orden tabulación]** En PinGate: focus entra en PIN (autoFocus), Tab→Confirmar botón, Tab→outside modal. En Suscripción: tab links y botón en orden visual natural.
- [ ] **[Persistencia - Refresh tras PIN]** Admin pasa PinGate, se setea cookie tg_pin_session (30 min TTL), refresh la página: checkPinSessionAction() verifica cookie, verified=true, no re-pide PIN.
- [ ] **[Persistencia - Refresh tras error PIN]** Admin falla PIN, limpia campo (setPin('')), refresh: verified=null → vuelve a pedir PIN (estado React no persiste).
- [ ] **[Persistencia - Logout y login]** Admin logout: Supabase destruye sesión, borra cookies auth. Login nuevamente: nueva sesión auth pero cookie PIN vieja es inválida (verifyPinCookie chequea timestamp y HMAC), re-pide PIN.
- [ ] **[Datos vacios - Sin tenant]** getStaffTenant retorna null: línea 35 redirige, nunca alcanza renderizado.
- [ ] **[Datos vacios - Sin subscription row]** DB sin tenant_subscriptions row para tenant: getSubscriptionState lanza SubscriptionNotFoundError → catch, sub=null, renderiza fallback 'sin suscripción'.
- [ ] **[Datos vacios - MP tokens null]** tenant.mpConnectedAt es null: mpConnected=false, botón Conectar visible, no intenta desencriptar tokens.
- [ ] **[Estados suscripción - formatDate]** currentPeriodEnd='2026-07-08T00:00:00Z' → formatDate retorna '8 de julio de 2026' (es-AR locale, sin hora).
- [ ] **[Estados suscripción - STATUS_LABELS****: trialing→'Período de prueba', active→'Activa', past_due→'Pago pendiente', suspended→'Suspendida', canceled→'Cancelada', churned→'Baja', blocked→'Bloqueada'. Si status desconocido, muestra status.status (fallback).
- [ ] **[Estados suscripción - Sin plan]** sub es null pero status era 'trialing': línea 73 condición sub? muestra texto fallback.
- [ ] **[Edge - Refresh token rotation]** Token MP expira, refresh_token usado en bg job: tokens se actualizan en DB, mpConnectedAt se mantiene, no afecta vista (estática).
- [ ] **[Edge - Cuenta MP desconexa]** Cambiar password en MP, token invalida: próxima llamada de API MP falla, pero /settings/facturacion solo lee estado, no llama MP (error no aparece en esta página).
- [ ] **[Edge - Trialing proximo terminar]** Tenant en trialing con trialEndsAt=mañana: status='trialing', page renderiza normal. (Nota: esta página NO muestra countdown trialing ni CTA activar como en checklist original — eso va en home/dashboard).
- [ ] **[Visual - Tab activa vs inactiva]** Tab Facturación: border-b-2 border-emerald-600, text-emerald-700. Otros tabs: border-transparent, text-slate-500, hover:text-slate-900 (transición suave).
- [ ] **[Visual - Alineación sección]** Suscripción y MP: rounded-xl, border slate-200, bg-white p-6, shadow-sm, consistente padding. h2 font-semibold text-base.
- [ ] **[Visual - Badge conectado]** CheckCircle2 icono 3.5x3.5, inline-flex items, gap-1, bg-emerald-50, ring-emerald-600/20, ring-1 inset, px-2.5 py-1, text-xs font-medium emerald-700.
- [ ] **[Visual - Icono CreditCard]** h-5 w-5 en h2, text-emerald-600, aria-hidden=true (no redundante con texto).
- [ ] **[Visual - Spinner]** Cuando verified===null en PinGate: div h-6 w-6, border-2, border-t-transparent, animate-spin, aria-label='Verificando...', role='status'.
- [ ] **[Visual - Overflow datos largo]** Plan name muy largo: dd en grid, text-slate-900 font-medium, overflow-hidden implícito (grid cell), texto trunca o wraps (verificar con nome='Complejo de Fútbol Abierto 24/7 con Canchas Futsal + Cancha 11').
- [ ] **[Edge - Tenant status transición****: Si durante render tenantStatus cambia (ej. webhook llega, dunning activa): /settings/facturacion es SSR, re-render con status nuevo a next load, user ve actualizado (no realtime en esta vista).
- [ ] **[Edge - settings.staff_pin_hash corrupto]** Valor de staff_pin_hash malformado (no formato salt:hash): verifyPin parsea, split(':') da 2 partes pero hash base64 inválido → Buffer.from error → async error → verifyPinAction catch no lo trata → posible crash (RIESGO).
- [ ] **[Edge - MP callback sin tenant]** /api/mp/callback con tenantId extraído de state pero tenant borrado: connectMercadoPago query encuentra 0 rows, UPDATE silencioso (no error en endpoint). Page nunca lo ve (callback redirige a /dashboard).

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: 1) PIN hash parsing: si staff_pin_hash está corrupto (malformado), verifyPin() hace split(':') pero Buffer.from con base64 inválido puede crash — falta try-catch en crypto. 2) getSubscriptionState dentro try-catch gracefully asigna sub=null, pero si DB tira un timeout indefinido, nunca resuelve (considera timeout explícito). 3) Page renderiza con sub=null gracefully, pero no muestra ni error toast ni hint de por qué falló — UX silenciosa, podría confundir admin. 4) Trialing countdown no se muestra en esta página (line 90-92 muestra solo texto genérico) — si requiremento es mostrar días restantes, falta implementar. 5) No hay refresh manual de suscripción (refresh button) ni auto-refresh tras OAuth callback. 6) MP OAuth state HMAC valida integrity pero no tied a user sesión — replay attack si attacker copia state string (mitigado por timing `Date.now()` en payload, pero sin explicit timestamp validation window). 7) PinGate tiene lockout rate-limit pero no logs de attempts en audit_logs (si cumplimiento lo requiere). 8) POST/PUT/DELETE de suscripción no visible aquí (read-only page) — cambios vía endpoints separados (upgrade, downgrade, cancel), testing esos requiere rutas distintas. 9) Acceso a /settings/facturacion gated por PinGate pero es page.tsx SSR, si PinGate está en CLIENT (`'use client'`), hay mismatch server/client render (PinGate es ClientComponent, pero usado en AsyncServerComponent — Next.js permite pero SSR del children ocurre antes de verificación, potencial leak de datos sensibles si verificación falla post-SSR).

---

### 18. Nuevo abonado
**URL:** `/abonados/nuevo` · **Archivo:** `src/app/(admin)/abonados/nuevo/page.tsx`

- [ ] **[Render]** Cargar la página como admin autenticado: debe mostrar el breadcrumb 'Abonados' con vínculo clicable, título 'Nuevo abonado', y formulario con campos Cancha, Día de la semana, Hora inicio, Hora fin, Nombre de contacto, Teléfono, Precio por turno, Precio mensual, Desde, Método de pago y Notas.
- [ ] **[Render]** Los campos requeridos (Cancha, Día, Hora inicio, Hora fin, Nombre, Teléfono, Precio por turno, Precio mensual, Desde) deben mostrar el atributo `required` en HTML.
- [ ] **[Render]** El select de Día de la semana debe mostrar las 7 opciones: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo con valores 1-6 y 0.
- [ ] **[Render]** El select de Método de pago debe mostrar 'Efectivo' (valor: cash) y 'Transferencia' (valor: transfer) con 'Efectivo' como default.
- [ ] **[Render]** El campo de precio por turno debe aceptar decimales (type=number, step=0.01) y mostrar inputMode=decimal.
- [ ] **[Render]** El campo de precio mensual debe aceptar decimales (type=number, step=0.01) y mostrar inputMode=decimal.
- [ ] **[Render]** Los inputs de hora deben ser type=time con formato HH:MM.
- [ ] **[Render]** El input de fecha 'Desde' debe ser type=date con formato YYYY-MM-DD.
- [ ] **[Render]** El textarea de Notas debe permitir máximo 2 filas iniciales y ser opcional (sin atributo required).
- [ ] **[Render]** El botón principal debe mostrar 'Vista previa de slots' inicialmente con fondo verde (emerald-600).
- [ ] **[Render]** Navegación breadcrumb: hacer clic en 'Abonados' debe redirigir a /abonados.
- [ ] **[Happy path]** Completar formulario válido (cancha, lunes, 10:00-11:00, Juan Pérez, 1234567890, $50, $200, 2026-06-15) y hacer clic en 'Vista previa de slots': debe mostrar la vista previa con lista de fechas y sus estados (OK / Conflicto).
- [ ] **[Happy path]** En la vista previa de slots, con 8 fechas generadas sin conflictos (goodCount=8): debe mostrar 'Se crearán 8 slots' y botones 'Volver a editar' y 'Confirmar creación' habilitados.
- [ ] **[Happy path]** Hacer clic en 'Confirmar creación' en la vista previa: debe redirigir a /abonados con el nuevo abonado creado y todos los slots confirmados.
- [ ] **[Happy path]** Hacer clic en 'Volver a editar' en la vista previa: debe volver al formulario sin limpiar los datos ingresados.
- [ ] **[Validacion]** Intentar enviar el formulario sin seleccionar una cancha: debe mostrar el error 'Elegí una cancha'.
- [ ] **[Validacion]** Intentar enviar el formulario sin ingresar nombre de contacto: debe mostrar el error 'Nombre requerido'.
- [ ] **[Validacion]** Intentar enviar el formulario sin ingresar teléfono: debe mostrar el error 'Teléfono requerido'.
- [ ] **[Validacion]** Intentar enviar el formulario sin ingresar precio por turno o con valor 0: debe mostrar el error 'El precio por sesión es requerido'.
- [ ] **[Validacion]** Intentar enviar el formulario sin ingresar precio mensual o con valor 0: debe mostrar el error 'El precio mensual es requerido'.
- [ ] **[Validacion]** Intentar enviar el formulario sin seleccionar fecha 'Desde': debe mostrar el error de validación del navegador.
- [ ] **[Validacion]** Ingresar horario inválido (p.ej., '25:00') en 'Hora inicio': debe rechazarse con error 'Horario inválido'.
- [ ] **[Validacion]** Ingresar horario inválido en 'Hora fin': debe rechazarse con error 'Horario inválido'.
- [ ] **[Validacion]** Ingresar hora fin menor o igual a hora inicio (p.ej., 10:00 a 10:00): debe mostrar error de validación de servidor 'Horario inválido'.
- [ ] **[Validacion]** Ingresar nombre de contacto vacío o solo espacios: debe mostrar el error 'Nombre requerido'.
- [ ] **[Validacion]** Ingresar teléfono vacío o solo espacios: debe mostrar el error 'Teléfono requerido'.
- [ ] **[Validacion]** Ingresar nombre de contacto con más de 120 caracteres: debe rechazarse con error de validación en servidor.
- [ ] **[Validacion]** Ingresar teléfono con más de 40 caracteres: debe rechazarse con error de validación en servidor.
- [ ] **[Validacion]** Ingresar notas con más de 1000 caracteres: debe rechazarse con error de validación en servidor.
- [ ] **[Validacion]** Ingresar precio por turno negativo: el campo debe rechazarlo (type=number, min=0).
- [ ] **[Validacion]** Ingresar precio mensual negativo: el campo debe rechazarlo (type=number, min=0).
- [ ] **[Vacio]** Con cero canchas disponibles en el complejo (sin canchas creadas): debe mostrar el select de cancha vacío (solo opción deshabilitada 'Elegí una cancha') y el formulario debe ser válido hasta intentar enviar.
- [ ] **[Vacio]** Con cero canchas online pero algunas offline: debe mostrar todas las canchas creadas en el select (no filtrar por estado).
- [ ] **[Carga]** Al hacer clic en 'Vista previa de slots', el botón debe mostrar estado 'Cargando…' y estar deshabilitado hasta que la vista previa se complete.
- [ ] **[Carga]** Durante el envío de 'Confirmar creación', el botón debe mostrar 'Guardando…' y ambos botones deben estar deshabilitados (noSlots || isConfirming).
- [ ] **[Carga]** Si la vista previa genera 0 slots válidos (todas las fechas tienen conflictos): el botón 'Confirmar creación' debe estar deshabilitado y mostrar alerta 'No se generarán slots'.
- [ ] **[Error 409]** Si en el mismo slot horario y día hay ya un abonado activo del mismo complejo: debe mostrar en preview el error 'Ya existe un turno fijo activo en ese horario.'.
- [ ] **[Error 409]** Si al hacer 'Confirmar creación' hubo una carrera (otro admin creó un abonado en el mismo slot entre preview y submit): debe mostrar el error del servidor y volver al formulario.
- [ ] **[Error 429]** Si se excede el rate-limit de operaciones admin en poco tiempo: debe mostrar el error 'Demasiadas operaciones en poco tiempo. Esperá unos segundos e intentá de nuevo.'.
- [ ] **[Error 500]** Si el servidor devuelve un error 500 durante la preview: debe mostrar el error en la zona de alerta roja bajo el formulario.
- [ ] **[Error 500]** Si el servidor devuelve un error 500 durante la creación: debe mostrar el error en la zona de alerta roja y volver al formulario (no redirigir).
- [ ] **[Red/Timeout]** Desconexión de red durante preview: debe mostrar el error en la zona de alerta o permitir reintentar.
- [ ] **[Red/Timeout]** Timeout durante la generación de preview: debe mostrar mensaje informativo 'Cargando slots disponibles…'.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos:
- [ ] **[Permisos]** Como staff de un tenant diferente al mostrado: no debe poder visualizar las canchas del tenant actual (RLS bloquea).
- [ ] **[Sesion]** Si la sesión expira mientras está en la página de preview: debe intentar enviar y luego redirigir a /login (el Server Action chequea auth).
- [ ] **[Sesion]** Refrescar la página en mitad del flujo (form -> preview): debe volver al formulario limpio (state se pierde).
- [ ] **[Doble submit]** Hacer clic en 'Vista previa de slots' dos veces rápidamente: la segunda llamada debe ser ignorada o colisionada por el mismo transition.
- [ ] **[Doble submit]** Hacer clic en 'Confirmar creación' dos veces rápidamente: el segundo clic debe ser ignorado (botón deshabilitado con isConfirming).
- [ ] **[Doble submit]** Completar el flujo y hacer clic en el navegador 'Atrás' después del redirect a /abonados: debe mostrar la lista de abonados (no permitir reenvío del formulario).
- [ ] **[Concurrencia]** Dos admins del mismo complejo crean abonados con el mismo horario (misma cancha, día, hora): el primero debe lograrse, el segundo debe recibir el error 'Ya existe un turno fijo activo en ese horario.'.
- [ ] **[Concurrencia]** Admin A crea un abonado en lunes 10:00-11:00, Admin B simultáneamente crea una reserva online en ese mismo slot: la preview en A debe detectar el conflicto antes de confirmar.
- [ ] **[Concurrencia]** Las fechas generadas para el abonado se recalculan en tiempo real basadas en closedDates del tenant: fechas cerradas no deben aparecer en slots.
- [ ] **[Responsive]** En mobile (375px ancho): el formulario debe ser responsive, con grid de 1 columna, y todos los campos deben ser accesibles sin overflow horizontal.
- [ ] **[Responsive]** En tablet (768px): el grid debe cambiar a 2 columnas según media query sm:grid-cols-2, sin overflow.
- [ ] **[Responsive]** En desktop (1024px+): el layout debe mostrarse correctamente con max-width-2xl centrado.
- [ ] **[A11y]** Todos los inputs deben tener asociada una label via htmlFor.
- [ ] **[A11y]** El rol='alert' debe estar presente en la zona de error (previewError), permitiendo que screen readers anuncien el error.
- [ ] **[A11y]** Navegación por teclado Tab debe recorrer Cancha → Día → Hora inicio → Hora fin → Nombre → Teléfono → Precio sesión → Precio mensual → Desde → Método pago → Notas → Botón submit en orden lógico.
- [ ] **[A11y]** Enter en un input no debe submitir el formulario hasta hacer clic en el botón 'Vista previa de slots'.
- [ ] **[A11y]** Los labels deben ser visibles y estar en contraste suficiente (WCAG AA).
- [ ] **[A11y]** El mensaje de error en la preview (noSlots) debe tener role='alert' y ser anunciado por lectores de pantalla.
- [ ] **[Persistencia]** Ingresar datos en el formulario, refrescar la página (F5): todos los datos deben limpiarse (no hay persistencia client-side).
- [ ] **[Persistencia]** Pasar a preview y hacer F5: debe volver al formulario (state se pierde, es esperado).
- [ ] **[Navegacion]** Hacer clic en el breadcrumb 'Abonados': debe redirigir a /abonados sin guardar el borrador.
- [ ] **[Navegacion]** Usar botón Atrás del navegador en el formulario: debe ir a la página anterior (probablemente /abonados).
- [ ] **[Navegacion]** Usar botón Atrás después de estar en preview: debe volver al formulario, no duplicar datos.
- [ ] **[Deep link]** Acceder directamente a /abonados/nuevo sin estar autenticado: debe redirigir a /login.
- [ ] **[Deep link]** Acceder a /abonados/nuevo con un token staff pero sin tenant asignado: debe redirigir a /login.
- [ ] **[Deep link]** Acceder a /abonados/nuevo con un token staff pero onboarding_completed=false: debe redirigir a /onboarding (validado en admin layout).
- [ ] **[Visual]** El formulario debe tener max-width-2xl, estar centrado, con padding, borde, fondo blanco, sombra y esquinas redondeadas (rounded-xl).
- [ ] **[Visual]** El titulo 'Nuevo abonado' debe ser text-2xl font-semibold.
- [ ] **[Visual]** Los labels deben ser font-medium, color slate-900.
- [ ] **[Visual]** Los inputs deben tener borde slate-200, focus:ring emerald-500 (2px), bordes redondeados lg.
- [ ] **[Visual]** El botón 'Vista previa de slots' deshabilitado debe tener opacity-60.
- [ ] **[Visual]** El botón 'Confirmar creación' deshabilitado (noSlots || isConfirming) debe tener opacity-60.
- [ ] **[Visual]** El botón 'Volver a editar' debe tener borde, fondo hover:bg-slate-50, sin color de fondo base.
- [ ] **[Visual]** Los badges en la preview deben mostrar 'OK' en verde (success) y 'Conflicto' en ámbar (warning).
- [ ] **[Visual]** El contador 'Se crearán N slot(s)' debe ser singular ('1 slot') o plural ('N slots').
- [ ] **[Edge]** Crear un abonado el mismo día con hora inicio = fin: debe ser rechazado por la validación timeEnd > timeStart en DB y/o schema.
- [ ] **[Edge]** Crear un abonado con día de semana fuera de rango (7, 8, etc): debe ser rechazado por validación min(0).max(6).
- [ ] **[Edge]** Crear un abonado con fecha 'Desde' en el pasado (ayer): debe aceptarse (el servidor usa artToday() para el cálculo, no rechaza fechas pasadas).
- [ ] **[Edge]** Crear un abonado con fecha 'Desde' muy lejana (año 2099): debe aceptarse, pero slots solo hasta endsOn (si existe) o infinito (si no).
- [ ] **[Edge]** Crear un abonado con endsOn menor a startsOn: debe rechazarse con validación.
- [ ] **[Edge]** Montos en centavos: ingresar $100.50 debe guardarse como 10050 centavos en BD (Math.round(100.50 * 100)).
- [ ] **[Edge]** Montos con redondeo: ingresar $10.005 debe redondearse a 10.01 (1001 centavos) o $10.00 (1000), según redondeo del navegador.
- [ ] **[Edge]** El slot generator debe generar exactamente 8 fechas (count: 8) respetando el día de semana y closedDates.
- [ ] **[Edge]** Con todas las fechas cerradas (closedDates cubre todas las próximas 8 semanas): debe generar 0 slots y deshabilitar el botón de confirmación.
- [ ] **[Edge]** Nombre de contacto con emoji (👋): debe ser rechazado o permitido según la validación de schema (actualmente trim + min(1), sin charset restringido).
- [ ] **[Edge]** Teléfono con caracteres especiales (+54 9 11 1234-5678): debe ser aceptado (sin validación específica de formato).
- [ ] **[Edge]** Notas con saltos de línea y caracteres especiales: debe ser aceptado (sin restricción especial).

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: (1) La validación de timeEnd > timeStart ocurre solo en el constraint CHECK de la DB, no en el cliente ni en schema Zod — si el usuario ingresa 11:00 a 10:00 navegador acepta y preview también (sin validación de orden). Recomendación: agregar validación en Zod. (2) El endpoint preview NO valida conflicto de abonado existente (checkAbonadoSlotConflict), solo conflicto de booking — una carrera entre preview y submit podría generar 'Ya existe un turno' después de confirmación visual. (3) Los precios se convierten a centavos con Math.round() en submitNewAbonado, pero el input es type=number step=0.01 — puede haber inconsistencias de redondeo si el navegador pasa valores con muchos decimales. (4) El estado 'Cargando…' durante preview y 'Guardando…' durante submit no muestra spinner visual (solo disables el botón) — UX podría ser mejorada. (5) No hay validación client-side explícita de email o teléfono (ambos aceptan cualquier string); la DB no tiene CHECK constraints ni formatos esperados. (6) El formulario no valida que startsOn >= hoy ART; puede aceptar fechas pasadas (comportamiento esperado pero no documentado). (7) Si closedDates no está sincronizado en el tenant, el preview puede mostrar fechas que luego no se generan como bookings (gap entre preview y ejecución).

---

### 19. Listado de reservas (admin)
**URL:** `/reservas` · **Archivo:** `src/app/(admin)/reservas/page.tsx`

- [ ] **[Render]** Cargar /reservas sin parámetros: renderizar título 'Reservas', botón 'Ir a la grilla' en verde, 5 filtros de estado (Todas, Confirmadas, Pago pendiente, Completadas, Ausentes), tabla vacía o con filas (según data).
- [ ] **[Render]** Con 0 reservas en el tenant: mostrar EmptyState con icono CalendarX, título 'Sin reservas', descripción 'No hay reservas para los filtros seleccionados.'
- [ ] **[Happy path]** Tenant con 5 reservas confirmadas, acceder a /reservas: tabla muestra 5 filas, cada una con fecha+hora, nombre cancha, cliente, badge 'Confirmada' (fondo emerald), precio en $X.XX, ordenadas por fecha DESC, hora DESC.
- [ ] **[Happy path]** Clickear en celda de fecha de una fila: navegar a /reservas/[id] detail page (no abre modal, es navegación).
- [ ] **[Happy path]** Filtrar por 'Confirmadas' (status=confirmed): URL pasa a /reservas?status=confirmed, tabla muestra solo confirmadas, filtro button activo (bg-emerald-600 text-white), otros buttons no-active (ring-1).
- [ ] **[Happy path]** Filtrar por 'Pago pendiente': URL /reservas?status=pending_payment, tabla muestra solo pending_payment, badge ámbar 'Pago pendiente'.
- [ ] **[Happy path]** Filtrar por 'Ausentes': URL /reservas?status=no_show, tabla muestra solo no_show, badge rojo 'Ausente'.
- [ ] **[Happy path]** Filtrar por 'Completadas': URL /reservas?status=completed, tabla muestra solo completed, badge gris 'Completada'.
- [ ] **[Happy path]** Click en 'Todas': volver a /reservas (sin status param), mostrar todos los estados.
- [ ] **[Vacio]** Tenant sin reservas confirmadas, filtrar por confirmed: mostrar EmptyState, no error toast.
- [ ] **[Vacio]** Tenant con reservas pero todas canceladas, filtrar por confirmed: EmptyState mostrada.
- [ ] **[Edge]** Status enum tiene 'expired' pero no está en FILTERS: si existe una reserva expired en DB, aparece en listado 'Todas' con badge label 'Expirada' (o fallback r.status si no en labels).
- [ ] **[Edge]** Dos reservas con status canceled_refunded y canceled_no_refund: ambas muestran badge 'Cancelada' (labels coinciden), colores iguales (gris).
- [ ] **[Edge]** Precio snapshot es 0 centavos: mostrar $0 (sin decimales por maximumFractionDigits: 0).
- [ ] **[Edge]** Precio snapshot es 50 centavos: mostrar $0 (redondeo hacia abajo) o $1 según Intl.NumberFormat exacto — verificar comportamiento de locale es-AR.
- [ ] **[Edge]** Precio snapshot es 999999999 centavos (~$10M ARS): mostrar correctamente sin overflow, sin truncamiento visual.
- [ ] **[Edge]** Nombre jugador es NULL, guestName es NULL: mostrar '—' en columna Cliente.
- [ ] **[Edge]** Nombre jugador es NULL, guestName es 'Torneo Futsal XYZ': mostrar 'Torneo Futsal XYZ'.
- [ ] **[Edge]** Nombre jugador es 'Juan Perez', guestName es 'Otro': mostrar 'Juan Perez' (prioridad player > guest).
- [ ] **[Edge]** Nombre cancha es muy largo (50+ chars): mostrar sin truncamiento en row, verificar no causa overflow horizontal (tabla tiene overflow-x-auto).
- [ ] **[Edge]** Fecha booking es '2099-12-31': formatDate parsea como UTC, muestra día semana+día+mes español correctamente sin error.
- [ ] **[Edge]** Fecha booking es '1900-01-01': formatDate no falla, muestra formato válido (aunque sea pasado muy lejano).
- [ ] **[Edge]** Time start es '00:00' (medianoche): mostrar '00:00' en columna Fecha, no falla parsing.
- [ ] **[Edge]** Time start es '23:59': mostrar '23:59' correctamente.
- [ ] **[Render]** Tabla con 200 reservas: renderizar todas (LIMIT 200 en query), performance sin visible lag/skeleton spinner desaparecido.
- [ ] **[Edge]** Tenant tiene 201 reservas: mostrar solo primeras 200 (LIMIT 200), sin indicador de 'hay más' o paginación (limitación conocida).
- [ ] **[Visual]** Header row en tabla: background slate-200, texto xs uppercase tracking-wide, alineación text-left, right para columna Precio.
- [ ] **[Visual]** Body rows: hover bg-slate-50, border-y divide-slate-100, padding px-4 py-3 consistente, tabular-nums en fecha y precio.
- [ ] **[Visual]** Badges status: inline-flex, rounded-full px-2 py-0.5 text-xs font-medium, ring-1 ring-inset, colores por status (emerald para confirmed, amber para pending_payment, red para no_show, slate para completed/canceled/expired).
- [ ] **[Visual]** Link en Fecha (date+time): color emerald-700, hover underline, no fuera de estilo sidebar.
- [ ] **[Visual]** Botón 'Ir a la grilla': h-9, bg-emerald-600, px-4, text-sm font-semibold, hover bg-emerald-700 transition-colors, no wrap.
- [ ] **[Responsive]** Tabla overflow-x-auto en mobile: scrollable horizontally si viewport < 640px, no colapsa ni oculta columnas (responsive implementado con overflow, no media queries acá).
- [ ] **[Responsive]** Filtros nav flex flex-wrap gap-2: buttons se envuelven en mobile sin quebrar layout.
- [ ] **[A11y]** Tabla tiene estructura semántica: thead, tbody, tr, th, td.
- [ ] **[A11y]** Link en fecha tiene color de contraste emerald-700 sobre fondo white/hover-slate-50: validar WCAG AA (ratio >= 4.5:1).
- [ ] **[A11y]** Badge status tiene suficiente contraste color texto vs bg (emerald-700 sobre emerald-50, amber-700 sobre amber-50, rojo sobre rojo, gris sobre gris).
- [ ] **[A11y]** Filtros buttons tienen tabindex natural, keyboard navegable con Tab, activables con Enter/Space.
- [ ] **[A11y]** Tabla links (fecha) navegables con Tab, Enter va a detail.
- [ ] **[Error 401]** User type NO es 'staff' (es 'player' o 'system_admin'): redirect('/login') ejecutado en page.tsx línea 47, no renderiza tabla.
- [ ] **[Error 401]** staffUserId es null: redirect('/login'), no renderiza.
- [ ] **[Error 401]** getStaffTenant retorna null: redirect('/login'), no renderiza.
- [ ] **[Error 404]** URL /reservas/[id] con ID inexistente en tenant: notFound() ejecutado, mostrar Next.js 404 page.
- [ ] **[Permisos]** Admin del tenant A intenta ver /reservas: data filtrada por tenant_id via withTenantContext RLS, solo ve sus reservas.
- [ ] **[Permisos]** Admin del tenant B login, intenta cambiar URL a /reservas: JWT tiene tenant_id B, RLS filtra, ve solo datos de B (protección multi-tenant).
- [ ] **[Permisos]** Player (no staff) intenta acceder a /reservas: extractAuthUser retorna type='player', redirect('/login'), no acceso.
- [ ] **[Permisos]** Super admin (system_admin): extractAuthUser retorna type='system_admin', redirect('/login'), no acceso a admin routes.
- [ ] **[Permisos]** Staff sin PIN configurado accede a /reservas: PinGate en layout es no-op (pinRequired=false), acceso directo a /reservas permitido.
- [ ] **[Permisos]** Staff CON PIN configurado accede a /reservas: PinGate en admin layout requiere PIN antes de renderizar children, /reservas bloqueada hasta verificar PIN (15 intentos, 2min lockout).
- [ ] **[Sesion]** JWT expirado: extractAuthUser().error || !data.user, redirect('/login'), no renderiza tabla.
- [ ] **[Sesion]** Sesion válida al cargar /reservas, luego JWT expira, user hace refresh: nuevo JWT requerido, si invalid redirect('/login') (manejo en middleware/layout).
- [ ] **[Deep link]** URL /reservas?status=confirmed&extra=param: ignorar param extra, procesar solo status. status = 'confirmed' aplicado.
- [ ] **[Deep link]** URL /reservas?status=invalid_status: status != en FILTERS, query ejecuta con filters.status='invalid_status', RLS/casting da error 400 o vacío (validation a nivel SQL via ::booking_status cast).
- [ ] **[Deep link]** URL /reservas (sin params): searchParams.status undefined, listTenantBookings llamada sin filtro, retorna todas.
- [ ] **[Concurrencia]** Dos tabs abiertas /reservas: cada una hace query independiente, ambas muestran data consistente (lecturas, no mutaciones, sin race).
- [ ] **[Navegacion]** Clickear fecha row → detail page /reservas/[id] → back button 'Reservas' → URL /reservas: vuelve a listado, filtro anterior preservado si URL tenía ?status=X.
- [ ] **[Navegacion]** Browser back button después de abrir detail: vuelve a listado, estado (scroll position) NO preservado (SSR, no clieny-side cache).
- [ ] **[Navegacion]** Cambiar filtro A → B: URL actualiza a /reservas?status=B, tabla re-renderiza, scroll al top (Next.js default).
- [ ] **[Persistencia]** Refresh F5 en /reservas?status=confirmed: URL preservada, query re-ejecutada, misma data mostrada (no client cache, siempre server).
- [ ] **[Carga]** Page.tsx es async Server Component: no skeleton loader visible, renderiza en server, HTML enviado al cliente (sin loading.tsx override específico acá, usa default admin layout loading).
- [ ] **[Carga]** listTenantBookings retorna en ~50ms (DB fast), tabla renderiza inmediatamente sin spinner.
- [ ] **[Carga]** listTenantBookings retorna en ~2s (DB slow, >200 rows): HTML renderizado en server en 2s, cliente recibe HTML completo sin partial rendering (Server Component).
- [ ] **[Red/Timeout]** DB timeout durante query (9000ms > timeoutMs): unhandled exception, error.tsx catchea, muestra error page.
- [ ] **[Red/Timeout]** DB conecta pero query retorna error `permission denied`: RLS violation o role error, SQL error, error.tsx.
- [ ] **[Validacion]** formatARS(null): TypeScript type error en build, previene null input en template.
- [ ] **[Validacion]** formatDate(null): TypeScript type error en build.
- [ ] **[Validacion]** Nombre jugador contiene emoji '😊 Juan': mostrar como-es (sin sanitización), sin XSS (Next.js escapes content por default).
- [ ] **[Validacion]** Nombre jugador contiene comillas dobles '"Juan"': mostrar as-is, sin quebrar HTML.
- [ ] **[Validacion]** Nombre jugador es string 1000-char: mostrar sin overflow en table cell (text-slate-700, px-4, table scrollable, sin max-width).
- [ ] **[Doble submit]** Trigger refetch de /reservas dos veces rápido (SPA nav): browser segunda request, server responde con data idéntica, no duplicate renders (Server Component, no optimistic updates).
- [ ] **[Edge]** Booking sin court_id (foreign key constraint violated en DB): query JOIN falla, error.tsx, no lista incompleta mostrada.
- [ ] **[Edge]** Precio snapshot es negativo (debería ser invalid pero data existe): mostrar $- número (Intl.NumberFormat formatea negativo con signo), sin crash.
- [ ] **[Edge]** tenantId en query NO coincide con JWT tenant_id (RLS bypass attempt): RLS policy rechaza, query retorna empty rows, tabla vacía mostrada (seguridad).

> ⚠️ **Riesgo detectado en codigo:** 1. LIMIT 200 sin paginación: si tenant >200 reservas, demás no visibles. Asumir es por diseño (admin ve últimas 200 recientes DESC).

2. formatDate usa hardcoded T12:00:00Z + timeZone: 'UTC': lógica correcta para YYYY-MM-DD inputs pero complejidad innecesaria. Riesgo bajo.

3. formatARS redondeo: Intl.NumberFormat('es-AR') con maximumFractionDigits: 0 redondea hacia nearest (banker's rounding), no hacia abajo. Validar con 50¢ y 150¢.

4. FILTERS no incluye 'expired', 'canceled_refunded', 'canceled_no_refund': STATUS_LABELS cubre todos, pero FILTERS solo 5. Reservas con esos estados aparecen en 'Todas' pero sin filtro directo.

5. STATUS_CLASSES fallback a 'completed' si status unknown: fallback silencioso, color gris mostrado.

6. Queries retornan sql`` crudo sin runtime validation: riesgos de null unexpectedly o casting issues. Aunque Drizzle tipado, casting manualSQL sin safe parsing.

7. LEFT JOIN players: ambos playerName y guestName pueden ser null (guest anónimo), mostrar '—'. Sin validación de al menos UNO populated.

8. PinGate vive en admin layout, no acá: /reservas heredará pin requirement si PIN configurado, pero no hay implementación explícita en page.tsx.

9. extractAuthUser y getStaffTenant validations suceden en page.tsx antes de query: buena protección, pero no validate tenant_id en searchParams (aunque RLS lo hace post-facto).

10. No error boundaries implementadas: page-level error.tsx existe, pero error durante query rendering no caught (loading.tsx y error.tsx generados por Next.js por defecto)."

---

### 20. Registro de nuevo admin
**URL:** `/register` · **Archivo:** `src/app/(auth)/register/page.tsx`

- [ ] **[Render]** Página /register carga con título 'Creá tu cuenta', 4 campos de input (firstName, lastName, email, phone) etiquetados, botón 'Crear cuenta', y link a /login con texto '¿Ya tenés cuenta?'.
- [ ] **[Render]** En desktop (lg+), panel izquierdo con imagen de cancha, gradiente oscuro superpuesto, logo TG, y copy de valor ('Empezá hoy...', '30 días gratis', 'MercadoPago integrado', 'Setup en menos de 2 minutos').
- [ ] **[Render]** En mobile (<1024px), imagen de cancha ocultada (hidden lg:block), botón 'Volver' visible en top-left con ArrowLeft icon, logo TG pequeño bajo el botón.
- [ ] **[Happy path]** Llenar firstName='Juan', lastName='Pérez', email='juan@complejo.com', phone='+54 9 11 1234-5678' y hacer click en 'Crear cuenta': formulario desaparece, se muestra pantalla 'Revisá tu email' con mensaje 'Te enviamos un enlace a juan@complejo.com' y ícono Mail verde.
- [ ] **[Happy path]** Tras envío exitoso, state cambia a status='sent' y email se renderiza en el componente SentState sin cambio de URL (/register permanece en el navegador pero visualmente se muestra sent state).
- [ ] **[Validacion]** Campo firstName vacío: al hacer submit, no avanza a sent state (HTML5 required + posible validación server). El campo debe tener aria-invalid=true cuando hay error.
- [ ] **[Validacion]** Campo firstName='A' (1 carácter): envío al servidor, retorna fieldErrors.firstName='Ingresá tu nombre'. Inline error render bajo el input en rojo.
- [ ] **[Validacion]** Campo firstName con 81+ caracteres: Zod schema max(80), envío retorna error. Si envío, debe rechazarse.
- [ ] **[Validacion]** Campo firstName con espacios al inicio/final ('  Juan  '): schema .trim(), debe procesar como 'Juan'. Si tiene validación de longitud después del trim, debe pasar si resultado >= 2.
- [ ] **[Validacion]** Campo firstName con emojis ('Juan 🎉'): Zod no rechaza, trimmed. Envío debería pasar la validación de firstName pero el string se almacena con emoji.
- [ ] **[Validacion]** Campo lastName vacío: requisito no validado por Zod (min(2)), pero es required en el input. Intenta submit, server rechaza con fieldErrors.lastName.
- [ ] **[Validacion]** Campo lastName='P' (1 carácter): enviado, retorna fieldErrors.lastName='Ingresá tu apellido'.
- [ ] **[Validacion]** Campo lastName con 81+ caracteres: max(80), enviado, rechazado con error.
- [ ] **[Validacion]** Email vacío: required. Intenta submit, no avanza (HTML5 type=email previene).
- [ ] **[Validacion]** Email='notanemail' (sin @): type='email' + Zod .email(). Server rechaza con fieldErrors.email='Ingresá un email válido'.
- [ ] **[Validacion]** Email='juan@' (sin dominio): rechazado por Zod email(). Inline error bajo el input.
- [ ] **[Validacion]** Email='juan@test.c' (TLD muy corto pero válido formalmente): Zod email() permite. Envío continúa. Backend debería crear magic link sin validación adicional.
- [ ] **[Validacion]** Email con espacios ('juan @test.com'): .trim() en schema, se convierte a 'juan@test.com'. Válido.
- [ ] **[Validacion]** Email case insensitive ('JUAN@TEST.COM'): .toLowerCase() en schema, normalizado a 'juan@test.com'.
- [ ] **[Validacion]** Email='juan+alias@test.com' (plus addressing): Zod email() lo valida. Permite envío.
- [ ] **[Validacion]** Phone vacío: required. Intenta submit, no avanza.
- [ ] **[Validacion]** Phone='+549' (incompleto): phoneRegex requiere al menos 2-4 dígitos + 4-4 dígitos después. Regex: /^\+?54\s?9?\s?\d{2,4}\s?\d{4}-?\d{4}$/. Rechazado, fieldErrors.phone='Formato: +54 9 11 1234-5678'.
- [ ] **[Validacion]** Phone='011 1234-5678' (sin +54): regex inicia con \+?54, requiere dígitos después de 54. '011...' no encaja. Rechazado.
- [ ] **[Validacion]** Phone='+54 9 11 1234-5678' (con espacios, correcto): Válido. Cumple regex. Envío exitoso.
- [ ] **[Validacion]** Phone='+5491112345678' (sin espacios, correcto): Válido. Regex permite espacios opcionales. Envío exitoso.
- [ ] **[Validacion]** Phone='+54-9-11-1234-5678' (guiones): Regex tiene guion opcional solo en el último par (5678). '-' entre 1234 y 5678 es ?, pero no entre otros. Rechazado o parcialmente validado según la intención del regex.
- [ ] **[Validacion]** Phone='+54 9 11 1234 5678' (sin guion final): Regex requiere -? antes de \d{4}. Sin guion debería pasar si regex es /^\+?54\s?9?\s?\d{2,4}\s?\d{4}-?\d{4}$/. Pero 1234 (5678 sin guion) requiere ajuste. Depende de regex exacto. Testear empíricamente.
- [ ] **[Validacion]** Phone='+54 9 2261234567' (interior Argentina, 4 dígitos después de 9): Regex \d{2,4}\s?\d{4}, espera 2-4 + 4 dígitos. '226 1234567' = 226 (3) + 1234567 (7). No encaja. Rechazado.
- [ ] **[Validacion]** Phone='+54 9 1100001234' (buenos aires, 10 dígitos sin espacios): Regex \d{2,4}\s?\d{4}-?\d{4}. '1100001234' = 11 (2) + 0000 (4) + 1234 (4). Cumple. Válido.
- [ ] **[Validacion]** Phone='549 9 11 1234-5678' (sin +): Regex comienza con \+?. '+?' = opcional, así que debería validar. '549 9 11 1234-5678' = 54 + 9 + 11 + 1234 + 5678. Depende si el regex asume el 9 es obligatorio. Testear.
- [ ] **[Validacion]** error._form: Si Supabase signInWithOtp retorna error genérico (ej: network), fieldErrors._form='No pudimos enviar el email. Probá de nuevo.' se muestra en <p role=alert> roja arriba del botón submit.
- [ ] **[Carga]** Durante submit, botón 'Crear cuenta' se deshabilita (disabled=true), opacidad 60%, texto cambia a 'Creando…' + Loader2 spinner animado.
- [ ] **[Carga]** Mientras pending=true, campo firstName, lastName, email, phone quedan disabled=false (clickeables pero no útiles). Solo el botón cambia estado.
- [ ] **[Carga]** Si submit toma >5 segundos (slow network), usuario ve spinner continuamente. No hay timeout o retry automático en la UI.
- [ ] **[Error 409]** Email ya registrado como StaffUser (según US-ONB-001 edge case): Supabase signInWithOtp NO retorna 409 directamente. El backend probablemente NO valida duplicado. Caso: email duplicado continúa; jugador recibe magic link y login sigue. RIESGO: documentación dice mostrar 'Ya tenés una cuenta' pero código no lo maneja.
- [ ] **[Error 500]** Supabase API retorna 500 Internal Error: registerAction captura, returnea {status: 'error', fieldErrors: { _form: 'No pudimos enviar el email. Probá de nuevo.' }}. Usuario ve mensaje genérico.
- [ ] **[Error 503]** Supabase auth service down: mismo manejo, fieldErrors._form con mensaje genérico.
- [ ] **[Red/Timeout]** Fetch timeout durante signInWithOtp (>30s de espera): Promise rechazada, catch en registerAction convierte a fieldErrors._form.
- [ ] **[Red/Timeout]** Network desconectada antes de submit: fetch falla inmediatamente, fieldErrors._form renderizado.
- [ ] **[Red/Timeout]** Network se recupera tras error: usuario puede re-submit el form desde el mismo estado de error (no hay retry automático, debe hacer click de nuevo).
- [ ] **[A11y]** Cada Field tiene <label htmlFor={id}> vinculada al <input id={id}>. Screenreader anuncia label al enfocar.
- [ ] **[A11y]** Todos los inputs tienen aria-invalid=true solo cuando props.error existe. Con error, <p role=alert> está siempre renderizado si error != null.
- [ ] **[A11y]** Helper text (phone: 'Formato argentino con prefijo +54 9') no tiene role alert, es instructivo. Renderizado como <p className='text-xs text-slate-500'>. Screenreader lo enuncia solo si es aria-describedby, actualmente NO lo es.
- [ ] **[A11y]** Color rojo solo para errores (#dc2626 text-red-600). Contraste >= 4.5:1 contra fondo blanco. Verificar WCAG AA.
- [ ] **[A11y]** Focus visible: focus-visible:ring-2 focus-visible:ring-emerald-500 en inputs. Verde emerald visible. Tab order: firstName → lastName → email → phone → submit button → 'Iniciá sesión' link.
- [ ] **[A11y]** Botón submit tiene text 'Crear cuenta' o 'Creando…' (nunca vacío). Loading state mantiene aria labels. Icono Loader2 tiene aria-hidden.
- [ ] **[A11y]** Imagen hero 'Cancha de fútbol al atardecer' tiene alt descriptivo. Div.aria-hidden=true contiene gradiente puro (decorativo).
- [ ] **[Persistencia]** Estado form.status=idle por defecto. Al cargar page.tsx, useFormState(registerAction, initial) retorna state=initial. No persiste en localStorage.
- [ ] **[Persistencia]** Si usuario llena firstName, recarga página: el valor se pierde (input values no persisten via localStorage). Solo a través de formulario completo con server state.
- [ ] **[Navegacion]** Link 'Volver' (#mobile) href='/' redirige a landing page. En desktop, no visible.
- [ ] **[Navegacion]** Link '¿Ya tenés cuenta?' href='/login' redirige a /login.
- [ ] **[Navegacion]** Logo TG en esquina superior (mobile) y superior-izquierda (desktop, en ImagePane) son links a '/' con className text-white en ImagePane, redirigen a home.
- [ ] **[Navegacion]** Presionar ESC en input: no cancela form. No hay manejo de ESC en el código.
- [ ] **[Navegacion]** Browser back button tras submit: regresa a /register en status=sent state. User ve 'Revisá tu email' (el state persiste en el URL o context, NO en navegación de back).
- [ ] **[Deep link]** URL /register accede directamente. No requiere autenticación. Page renderiza form o sent state según el state inicial (siempre idle si primer acceso).
- [ ] **[Deep link]** URL /register?email=test@test.com (query param): no es capturado por el formulario. Field value es undefined a menos que JS lo populate.
- [ ] **[Doble submit]** Hacer click rápido 2x en 'Crear cuenta' mientras pending=true: solo un submit se envía (HTML disabled=true en botón previene clics adicionales). userFormStatus retorna pending=true en segundo click, pero el evento no se dispara.
- [ ] **[Doble submit]** Hacer click en submit, esperar 2s (request en progreso), hacer click nuevamente: pending sigue true, segundo click se ignora. Solo un registerAction en vuelo.
- [ ] **[Concurrencia]** Dos pestañas abiertas en /register simultáneamente, ambas llenas y submit en la tab A, luego en la tab B: A recibe sent state, B aún en idle (sin comunicación entre pestañas). B puede enviar otro magic link al mismo email. Supabase permite múltiples magic links al mismo email (los anteriores expiran).
- [ ] **[Responsive]** Mobile (<640px): grid grid-cols-1 firstName + lastName stacked verticalmente (NO lado a lado). Button ancho completo. Form width max-w-md. Padding px-4.
- [ ] **[Responsive]** Tablet (640px-1023px): grid sm:grid-cols-2 firstName + lastName lado a lado. Button ancho completo.
- [ ] **[Responsive]** Desktop (1024px+): grid 2 cols (image + form). FormPane visible a la derecha.
- [ ] **[Visual]** Border radii: inputs rounded-lg (8px). Card rounded-2xl (16px). Botón rounded-lg.
- [ ] **[Visual]** Sombra card: shadow-xl shadow-slate-900/5 (sutil, gris oscuro 5% opacity). Inputs shadow-sm. Botón shadow-lg shadow-emerald-600/25 (verde, hover aumenta).
- [ ] **[Visual]** Background: card bg-white/90 backdrop-blur-md (frost glass efecto). FormPane bg-gradient-to-br from-slate-50 via-white to-emerald-50/60.
- [ ] **[Visual]** Border card: border border-slate-200/60 (gris muy claro, 60% opacity). Inputs border-slate-200 (más opaco).
- [ ] **[Visual]** Espaciado: form space-y-4 entre campos. Header mb-8. p-8 en card. py-12 en FormPane.
- [ ] **[Visual]** Hover botón: bg-emerald-500 (más oscuro), -translate-y-0.5 (sube 2px), shadow aumenta. Transición smooth (duration-200).
- [ ] **[Visual]** Hover link 'Iniciá sesión': underline aparece, color emerald-800 (más oscuro que emerald-700).
- [ ] **[Visual]** Mobile layout: padding sm:px-6 lg:px-8, adapta según breakpoint. Logo TG tamaño h-8 w-8 (mobile), h-9 w-9 (desktop).
- [ ] **[Visual]** Text hierarchy: h1 text-3xl font-extrabold (título form). p text-sm (subtítulo y helper). Helper phone text-xs text-slate-500 (muy chico). Errores text-xs text-red-600.
- [ ] **[Visual]** Placeholder colores: placeholder:text-slate-400 (gris claro). En focus o con valor, text-slate-900 (casi negro).
- [ ] **[Edge]** Envío con firstName='Juan ', lastName=' Pérez' (espacios internos permitidos): .trim() elimina inicio/final, pero espacios internos se preservan. Resultado 'Juan' y 'Pérez'. Válido.
- [ ] **[Edge]** Envío con email='JUAN@TEST.COM': toLowerCase() en schema, normalizado a 'juan@test.com'. Supabase crea usuario con email minúscula.
- [ ] **[Edge]** Magic link expiró (>15 minutos, FUERA del scope de esta vista, sucede en /api/auth/callback o verify): usuario hace click en link vencido, callback retorna redirectVerifyError con code='exchange_failed'. Distinto de esta vista.
- [ ] **[Edge]** Magic link duplicado: mismo email enviado 2x antes de verificar el primero. Ambos links son válidos y usan el mismo token (Supabase maneja esto internamente). Al verificar cualquiera, sesión se crea y la otra se invalida automáticamente.
- [ ] **[Edge]** Intento de registro desde IP sospechosa / proxy / Tor: sin validación CAPTCHA en el código. Supabase puede tener rate-limiting backend. Código no lo maneja visiblemente.
- [ ] **[Edge]** Helper text en phone input ('Formato argentino con prefijo +54 9') se muestra cuando NO hay error. Si hay error, se reemplaza por el texto de error.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: (1) **Email duplicado no manejado**: US-ONB-001 y Flujo 1 especifican que si el email ya existe como StaffUser, debe mostrar 'Ya tenés una cuenta. ¿Querés agregar otro complejo?' con link a login. El código registerAction NO valida contra tabla staff_users; solo captura errores genéricos de signInWithOtp. Supabase probablemente permite múltiples magic links al mismo email (sin bloqueo de duplicado en auth). Backend callback en /api/auth/callback:89 ejecuta getOrCreateStaffUser() que retorna existing[0] si email existe; pero registerAction NO lo chequea antes de enviar el magic link. ESTO ES UN BUG: un usuario puede recibir magic link sin saber que ya tiene cuenta. (2) **Validación del lado cliente solo para type=email**: HTML5 valida formato email en el input, pero si JavaScript está deshabilitado o el navegador es viejo, Zod server-side .email() lo valida de nuevo. Cubierto. (3) **No hay CAPTCHA**: sin protección contra spam/abuse masivo de registros. Backend puede ratelimit. (4) **Helper text no vinculado con aria-describedby**: screenreader no lo enuncia automáticamente. (5) **Phone regex AMBIGUO**: regex /^\\+?54\\s?9?\\s?\\d{2,4}\\s?\\d{4}-?\\d{4}$/ permite variaciones pero el guion es opcional solo al final. Testeadores pueden encontrar formatos legítimos rechazados (ej: '+54 9 226 1234-5678' con 4 dígitos de área).

---

## 🟡 P2 — Medias (11 vistas)

### 21. Gestion de canchas
**URL:** `/canchas` · **Archivo:** `src/app/(admin)/canchas/page.tsx`

- [ ] **[Render]** Cargar /canchas sin canchas creadas: mostrar EmptyState con ícono LayoutGrid, título 'Sin canchas todavía', descripción 'Creá la primera para aparecer en búsquedas públicas.' y botón '+ Nueva cancha'.
- [ ] **[Render]** Cargar /canchas con 3 canchas: listar todas en orden de creación ascendente, cada una mostrando nombre, superficie (label traducido: 'Césped sintético', etc.), capacidad, estado (badge verde 'Online' o gris 'Offline'), botones 'Editar' y 'Activar'/'Desactivar'.
- [ ] **[Render]** CourtCard mostrar nombre y superficie con truncamiento si superan ancho disponible (verificar sin overflow).
- [ ] **[Happy path - Crear]** Hacer clic '+ Nueva cancha' → mostrar formulario dinámico lazy-loaded con skeleton; ingresar nombre 'Cancha A', superficie 'Césped sintético', capacidad '7 jugadores', agregar franja horaria (L-V 08:00-18:00: $100/$180); hacer clic 'Crear cancha' → recibir éxito, lista actualizada con nueva cancha en estado 'online'.
- [ ] **[Happy path - Editar]** Hacer clic 'Editar' en cancha existente → pre-llenar nombre, superficie, capacidad y reglas actuales; cambiar nombre a 'Cancha A Modificada', cambiar precio 60min a $120; clic 'Guardar cambios' → cancha actualizada en la lista sin recargar página.
- [ ] **[Happy path - Toggle Online]** Con cancha en estado 'offline', clic 'Activar' → cambiar a 'online' inmediatamente (optimistic update), sin confirmación, revalidar path tras success.
- [ ] **[Happy path - Toggle Offline]** Con cancha en estado 'online' sin reservas futuras ni abonados activos, clic 'Desactivar' → mostrar ConfirmDialog, clic 'Desactivar' en el diálogo → cambiar a 'offline', toast éxito 'Cancha desactivada'.
- [ ] **[Happy path - Pricing Complexity]** Crear cancha con 3 reglas: (L-J 08:00-17:00: $80/$150), (L-J 17:00-23:00: $120/$200), (V-D 08:00-23:00: $150/$280) → todas guardadas y recuperadas correctamente en edición.
- [ ] **[Validacion - Nombre vacío]** Intentar crear sin nombre: mostrar error inline 'Nombre requerido' y deshabilitar submit.
- [ ] **[Validacion - Nombre > 100 caracteres]** Ingresar nombre con 101 caracteres: recibir error server 'Datos inválidos' y mostrar en UI.
- [ ] **[Validacion - Nombre con espacios]** Ingresar nombre '   Cancha 1   ': trimear y guardar; verificar que se persista sin espacios extras.
- [ ] **[Validacion - Nombre con caracteres especiales]** Ingresar 'Cancha #1 (lado sur)': guardar sin sanitizar (cadena literal permitida).
- [ ] **[Validacion - Nombre con emoji]** Ingresar 'Cancha ⚽': recibir error server o guardar según validación; verificar comportamiento consistente.
- [ ] **[Validacion - Capacidad inválida]** Intentar seleccionar capacidad no en lista (5, 7, 8, 9, 11): select previene; verificar que solo estos valores estén disponibles.
- [ ] **[Validacion - Superficie requerida]** Intentar crear sin seleccionar superficie: error 'Tipo de superficie inválido'.
- [ ] **[Validacion - Pricing: sin reglas]** Crear con array vacío de reglas: error 'Al menos una regla de precio requerida'.
- [ ] **[Validacion - Pricing: precio 60min negativo]** Ingresar '-50' en campo 60min: rechazar con error 'Precio 60min debe ser positivo'.
- [ ] **[Validacion - Pricing: precio 120min cero]** Ingresar '0' en campo 120min: rechazar con error 'Precio 120min debe ser positivo'.
- [ ] **[Validacion - Pricing: regla sin días]** Crear regla sin seleccionar ningún día (todos deseleccionados): error 'Al menos un día requerido'.
- [ ] **[Validacion - Pricing: hora from inválida]** Ingresar time '25:00' o '12:60': navegador rechaza (input type=time), no enviar.
- [ ] **[Validacion - Pricing: hora to = 00:00 válida]** Ingresar 'Desde 22:00, Hasta 00:00' (medianoche): interpretar como cobertura hasta fin de día, guardar y recuperar sin error.
- [ ] **[Validacion - Pricing: gaps en horario de operación]** Tenant abre L-V 08:00-23:00. Crear regla L-V 08:00-12:00 solamente: recibir error 'Precios sin cubrir: L 13:00, L 14:00...' (muestra sample de 3 gaps).
- [ ] **[Validacion - Pricing: centavos conversion]** Ingresar '100.50' en campo 60min: parsear como 10050 centavos (100.50 * 100), guardar, recuperar y mostrar '100.50'.
- [ ] **[Validacion - Pricing: muy alto]** Ingresar '999999' ARS en campo: aceptar (no hay límite explícito, solo integer positivo).
- [ ] **[Carga - Skeleton]** Hacer clic '+ Nueva cancha' → mostrar loader skeleton (4 líneas: h-9, h-32, h-48, 2x h-10) con aria-busy=true, aria-label='Cargando formulario…' antes de que CourtForm renderice.
- [ ] **[Carga - Submit deshabilitado]** En formulario, clic 'Crear cancha' → botón pasa a 'Guardando...', disabled=true, prevenir clicks adicionales (idempotencia visual).
- [ ] **[Carga - Edit en spinner]** Mientras se guarda edición, botones 'Editar' y 'Activar/Desactivar' en CourtCard muestran '…' y disabled=true.
- [ ] **[Error 400 - JSON pricing]** Enviar pricing malformado (JSON inválido): recibir 'Formato de precios inválido'.
- [ ] **[Error 400 - Datos inválidos]** Enviar capacity string 'abc': recibir error schema 'Datos inválidos' (fallback de Zod).
- [ ] **[Error 401 - Sin auth]** Acceder /canchas sin JWT: redirigir a /login (extractAuthUser falla).
- [ ] **[Error 401 - Usuario no staff]** JWT válido pero user.type='player': redirigir a /login.
- [ ] **[Error 403 - Otro tenant]** Staff A intenta updateCourtAction(court_id_de_B, ...): recibir 'Cancha no encontrada' (RLS en la query, no acceso).
- [ ] **[Error 404 - Tenant no encontrado]** extractAuthUser retorna staff_id inexistente, getStaffTenant retorna null: redirigir a /onboarding.
- [ ] **[Error 404 - Cancha no existe]** toggleCourtStatusAction('id-inexistente'): recibir 'Cancha no encontrada'.
- [ ] **[Error 409 - Límite de plan]** Tenant con plan 'predio' (máx 3 canchas) intenta crear la 4ª: recibir 'Tu plan soporta hasta 3 canchas. Hacé upgrade para agregar más.'.
- [ ] **[Error 429 - Rate limit]** Enviar 5+ createCourtAction en <1s: recibir 'Demasiadas operaciones en poco tiempo. Esperá unos segundos e intentá de nuevo.'.
- [ ] **[Error 500 - DB timeout]** Simular DB lenta/inaccesible en server action: timeout o error genérico esperado.
- [ ] **[Red/Timeout - Reconexión]** Request en progreso, perder red → no hay retry automático (UI muestra estado previo); al recuperar red, usuario debe re-submit manualmente.
- [ ] **[Red/Timeout - Toast error]** toggleCourtStatusAction falla: mostrar toast rojo con descripción error, revertir UI al estado anterior (currentStatus vuelve a online si se intentó offline).
- [ ] **[Permisos - Admin]** Staff con rol 'admin': acceso total a crear, editar, toggle status, ver impact.
- [ ] **[Permisos - Empleado]** Staff sin PIN requerido (tenant.settings.staff_pin_hash = null): acceso directo (PinGate renderiza children sin prompt).
- [ ] **[Permisos - Empleado con PIN]** Staff con PIN requerido: antes de llegar a CourtList, PinGate bloquea con prompt numérico.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[PinGate - Verificado]** Llamar checkPinSessionAction() al montar PinGate: si cookie PIN válida, mostrar children sin prompt.
- [ ] **[PinGate - No verificado]** Sin PIN cookie válida: mostrar formulario PinGate (Lock icon, título 'Zona protegida', input PIN, botón 'Confirmar').
- [ ] **[PinGate - Carga inicial]** Al abrir /canchas con PIN requerido: spinner centrado mientras se verifica sesión; luego formulario o children.
- [ ] **[PinGate - PIN correcto]** Ingresar PIN válido (4-8 dígitos, hashea como config): setVerified=true, renderizar children, cookie httpOnly+secure creado.
- [ ] **[PinGate - PIN incorrecto]** Ingresar PIN incorrecto: error 'PIN incorrecto.', campo limpiado, mostrar 'Te quedan N intentos' si N<=2.
- [ ] **[PinGate - Intento de fuerza bruta]** 5 intentos fallidos en <5min (por tenant): lockout 'Demasiados intentos fallidos. Volvé a intentar en X min.', countdown descendente cada segundo, input disabled.
- [ ] **[PinGate - Countdown activo]** Con lockout activo: mostrar 'Bloqueado hasta 4:32', decrementar cada segundo, cuando llega a 0:00 liberar y limpiar error.
- [ ] **[Sesion - Auth expires mid-form]** Rellenar formulario, JWT expira antes de submit (> 1 hora de inactividad): crear submit, server action redirige a /login.
- [ ] **[Sesion - Auth refresh]** Si el backend tiene mecanismo de refresh (re-extract en action), verificar que el JWT nuevo se usa.
- [ ] **[Sesion - PIN expires mid-toggle]** PIN cookie expira entre toggle click y confirmación: servidor rechaza; PinGate debe re-prompts (no automático, usuario debe guardar y reintentar desde canchas).
- [ ] **[Doble click - Submit]** Hacer clic 'Crear cancha' dos veces rápido: solo una request enviada (disabled=true + startTransition previene).
- [ ] **[Doble click - Toggle]** Clic 'Activar' mientras isPending=true: prevenir con disabled attribute.
- [ ] **[Navegacion rapida - Back/Forward]** Abrir form, cancelar, clic navegador atrás → mantener lista; adelante → si estaba en form, mostrar form de nuevo (estado local preservado en useState).
- [ ] **[Navegacion rapida - New tab]** Abrir /canchas en tab A, hacer cambios en tab B (misma sesión): cambios en tab A no se sincronizan automáticamente (sin Realtime client-side en lista); refresh manual necesario.
- [ ] **[Concurrencia - Dos admins, toggle]** Admin A abre /canchas, Admin B desactiva la misma cancha vía API; Admin A clic 'Activar' → el toggleCourtStatusAction de A ejecuta, optimistic UI pone online, server-side retorna success (idempotente = toggle a online completado); mostrar online.
- [ ] **[Concurrencia - Dos admins, editar]** Admin A edita nombre, Admin B edita capacidad simultáneamente: último commit win (BBDD última escritura); UI de A ve su cambio, refresh mostraría cambio de B (revalidatePath en ambas acciones).
- [ ] **[Concurrencia - Crear dos]** Dos admins crean cancha simultáneamente con plan límite 2 canchas, 1 existente: ambos submitean, uno recibe error 'Tu plan soporta hasta 2...', otro crea exitoso.
- [ ] **[Concurrencia - Reservas futuras]** Admin A intenta desactivar cancha; mientras carga el deactivation impact, se realiza una reserva nueva online: impactDialog muestra futureBookings contados hace 100ms atrás (no real-time), al deactivar igual ejecuta (Booking sigue existiendo en offline).
- [ ] **[Responsive - Desktop]** Resolver en >1024px: layout max-w-4xl centrado, grid form 2 cols (nombre|superficie, capacidad|capacidad), botones lado-a-lado.
- [ ] **[Responsive - Tablet]** Resolver en 640-1024px: layout reduce a 1 col para inputs básicos, pricing rules stackean verticalmente.
- [ ] **[Responsive - Mobile]** Resolver en <640px: max-w-4xl, padding 1rem, inputs full-width, botones stack vertical, cards no se deforman.
- [ ] **[Responsive - Input overflow]** Nombre muy largo sin espacios (>50 caracteres): truncar con ellipsis o word-break (verificar CSS no rompe layout).
- [ ] **[A11y - Teclado]** Tab: foco en botones, inputs en orden (Nombre → Superficie → Capacidad → Reglas → Precio 60 → Precio 120 → Agregar franja → Crear), Enter en botón activa click.
- [ ] **[A11y - Labels]** Todos los inputs tienen <label> asociada con htmlFor/id (nombre, superficie, capacidad, time from/to, precios).
- [ ] **[A11y - ARIA]** CourtForm.tsx sin aria-label visible; PinGate.tsx tiene aria-label='Verificando...' en spinner, role='status', aria-label en inputs.
- [ ] **[A11y - Error messages]** Errores en <p role='alert'> (PinGate) o inline (CourtForm); screen reader anuncia cambios.
- [ ] **[A11y - Contraste]** Badge verde Online (bg-green-50 text-green-700) vs Offline (bg-slate-100 text-slate-500): verificar WCAG AA contrast ratio.
- [ ] **[A11y - Focus visible]** Input focus-visible:ring-2 ring-emerald-500 visible en todos los navegadores.
- [ ] **[Persistencia - Refresh]** Crear cancha, F5: /canchas recarga, listCourts() retorna del servidor, cancha persiste en lista.
- [ ] **[Persistencia - Editar y refrescar]** Editar nombre, NO hacer refresh inmediato; cerrar formulario → lista muestra nombre actualizado (optimistic en state); refresh fuerza revalidatePath.
- [ ] **[Persistencia - Estado form abierto]** Hacer clic '+ Nueva cancha', llenar parcialmente, refrescar: form se cierra (showForm=false en state), formulario perdido (intención: evitar guardar parcial).
- [ ] **[Navegacion - Deep link]** Acceder directamente /canchas (no desde menú): si auth OK, renderizar normalmente; si no auth, redirect a /login.
- [ ] **[Navegacion - URL params]** /canchas?id=court-x (parámetro no usado por componente): ignorar, mostrar lista normal.
- [ ] **[Navegacion - Atras del navegador]** En /canchas, clic 'Nueva cancha', atras: showForm vuelve a false, mostrar lista (localStorage no usado, solo state).
- [ ] **[Visual - Padding/margin]** CourtCard padding 1rem, espacio vertical 0.75rem entre cards, max-width 4xl centrado: verificar sin margins colapsados.
- [ ] **[Visual - Botones color]** Crear: bg-emerald-600 hover:emerald-500; Editar: text-emerald-700 hover:emerald-800; Desactivar: border slate, text slate (no rojo).
- [ ] **[Visual - Badge estado]** Online: bg-green-50 text-green-700 ring-1 green-600/20; Offline: bg-slate-100 text-slate-500 ring-1 slate-200 (colores consistentes).
- [ ] **[Visual - Truncamiento]** Nombre >30 caracteres: verificar si trunca con ellipsis u overflows (actualmente min-w-0 debería prevenir overflow en flex).
- [ ] **[Visual - Z-index]** ConfirmDialog (Radix) debe estar encima de CourtList (verificar modal backdrop).
- [ ] **[Visual - Loader skeleton]** CourtForm skeleton: 4 líneas con alturas h-9, h-32, h-48, 2x h-10; proporciones visuales aproximadas al form real.
- [ ] **[Edge - Plan upgrade]** Crear cancha #3 en plan Predio (límite 3): success; intentar #4: error con sugerencia upgrade. Verificar UX clara.
- [ ] **[Edge - 0 capacidad]** Intentar crear con capacidad 0: schema refine rechaza (solo 5,7,8,9,11), error 'Capacidad inválida'.
- [ ] **[Edge - Nombre duplicado]** Crear cancha 'Cancha 1', luego 'Cancha 1': permitir (no hay unique constraint en DB para (tenant, name)); ambas existen.
- [ ] **[Edge - Precio 1 centavo]** Ingresar '0.01' ARS (1 centavo): parsear como 1, guardar y mostrar '$0.01' correctamente.
- [ ] **[Edge - Precio en centavos fraccionarios]** Ingresar '100.555' ARS: parsear como 10055 centavos (truncar decimales), mostrar '$100.55'.
- [ ] **[Edge - Regla 24 horas]** Regla 08:00-23:00 no cubre 23:00-08:00 (noche): si tenant abre 24hs, error gaps; si abre 08:00-23:00, válida.
- [ ] **[Edge - Abonados activos]** Cancha tiene 2 abonados activos; desactivar sin eliminarlos: impact warning 'Hay 2 abonado(s) activo(s) en esta cancha.'; desactivación permite (no bloquea).
- [ ] **[Edge - Reservas futuras lejanas]** Cancha tiene reserva confirmada hace 3 meses atrás: NOT incluida en futureBookings (query filtra date >= hoy); desactivar no muestra warning por esa reserva.
- [ ] **[Edge - RLS violation]** Interno: court.tenantId != currentTenant en DB, updateCourt filtra por (id, tenantId) → no retorna → 'Cancha no encontrada' (no leak de otro tenant's court).
- [ ] **[Edge - NULL values]** Crear sin description: null permitido, mostrar solo nombre+superficie; editar y enviar description='': convertir a null en DB.
- [ ] **[Edge - Photos empty]** Crear sin fotos (photos=[]): aceptar, campo no visible en form v1.
- [ ] **[Edge - Pricing with null price]** Ingresar 0 en campo (input allows): rechazar server-side 'debe ser positivo', no guardar.
- [ ] **[Tenant status - Trialing]** Tenant en estado 'trialing': acceso a /canchas permitido (no hay redirect a /suspended).
- [ ] **[Tenant status - Past_due]** Tenant estado 'past_due': acceso permitido pero se mostraría alerta de pago en dashboard (no en /canchas específicamente).
- [ ] **[Tenant status - Suspended]** Tenant estado 'suspended': redirect automático a /suspended en middleware antes de llegar a CanchasPage (no tested aquí, pero importante contextuar).
- [ ] **[Tenant status - Blocked]** Tenant estado 'blocked': redirect a /suspended (similar a suspended).
- [ ] **[Import/Export]** No función export/import de configuración de cancha en v1.
- [ ] **[Batch operations]** No bulk-edit, bulk-toggle o bulk-delete en v1.
- [ ] **[Photos]** No gestión de fotos en form v1; photos campo en DB pero no visible en UI.
- [ ] **[Descripción]** Campo description en form (opcional, max 500 chars) pero no visible en lista CourtCard; validación server-side.

> ⚠️ **Riesgo detectado en codigo:** BUGS POTENCIALES DETECTADOS: (1) En CourtList.tsx línea 161, cuando se falla un deactivation impact fetch, se asigna {futureBookings: 0, activeAbonados: 0} sin avisar al usuario que no se pudo obtener la info de impacto. (2) CourtForm.tsx no valida que el rango from-to no sea 00:00-00:00 (medianoche a medianoche = 24 horas, válido pero inusual; validar si es intención). (3) Sin validación client-side que al menos una regla cubra horas de operación del complejo; solo se valida server-side, pudiendo causar envío fallido (UX confusa). (4) Falta UI para mostrar los gaps de precios encontrados con detalle (solo "Precios sin cubrir: L 09:00, L 10:00..." parcial). (5) No hay indicador visual cuando se alcanza límite de canchas del plan antes de intentar crear; solo error en submit. (6) El PIN session check en PinGate corre una sola vez en mount; si la sesión expira en la mitad de una operación, el user sigue viéndolo como verificado hasta refresh manual. (7) No hay validación que impida dos reglas con días/horarios superpuestos (podría ser intención pero UI no lo previene ni advierte).

---

### 22. Abonados (listado)
**URL:** `/abonados` · **Archivo:** `src/app/(admin)/abonados/page.tsx`

- [ ] **[Render]** Cargar /abonados como admin staff autenticado: debe mostrar la tabla con encabezados 'Día / Horario', 'Contacto', 'Precio sesión', 'Precio mensual', 'Estado' y 'Acciones'.
- [ ] **[Render]** Al renderizar abonados con status 'active': el badge debe mostrar 'Activo' con variante success (verde).
- [ ] **[Render]** Al renderizar abonados con status 'paused': el badge debe mostrar 'Pausado' con variante warning (amarillo).
- [ ] **[Render]** Al renderizar abonados con status 'canceled': el badge debe mostrar 'Cancelado' con variante secondary (gris).
- [ ] **[Render]** La columna 'Día / Horario' debe mostrar formato 'Dom|Lun|Mar|Mié|Jue|Vie|Sáb HH:MM-HH:MM' (ej: 'Lun 19:00-20:30').
- [ ] **[Render]** El encabezado 'Contacto' debe mostrar nombre en línea 1 y teléfono en gris/xs en línea 2.
- [ ] **[Render]** El botón '+ Nuevo Abonado' debe estar en el top-right y tener clase bg-primary con estilo hover:bg-primary/90.
- [ ] **[Vacio]** Con 0 abonados: mostrar EmptyState con ícono Users, titulo 'Sin abonados registrados' y CTA verde '+ Nuevo Abonado' linked a /abonados/nuevo.
- [ ] **[Vacio]** El EmptyState description debe decir: 'Creá el primer abonado para que aparezca acá.'
- [ ] **[Happy path - Pausar]** Con un abonado active, clic en botón 'Pausar' abre ConfirmDialog con titulo 'Pausar abonado' y description con texto 'Eliminará todas las reservas futuras de este abonado. Podés reactivar después.'
- [ ] **[Happy path - Pausar]** En el dialog Pausar, confirmar llama pauseAbonadoAction(id), y en success: toast dice 'Abonado pausado correctamente.' y dialog cierra.
- [ ] **[Happy path - Pausar]** Tras pausar: revalidatePath('/abonados') ejecuta y la fila se recarga con status 'paused'.
- [ ] **[Happy path - Pausar]** Abonado ya paused: muestra botones 'Reactivar' (verde) y 'Cancelar' (rojo), NO muestra 'Pausar'.
- [ ] **[Happy path - Reactivar]** Clic en 'Reactivar' en un abonado paused abre dialog con titulo 'Reactivar abonado' y state.reactivatePreviewLoading = true.
- [ ] **[Happy path - Reactivar]** En loading de preview: dialog muestra 'Cargando slots disponibles…'.
- [ ] **[Happy path - Reactivar]** previewAbonadoSlotsAction({courtId, dayOfWeek, timeStart, timeEnd, startsOn: todayART()}) ejecuta, retorna {success: true, dates: [], conflicts: []}.
- [ ] **[Happy path - Reactivar]** Si preview success: dialog muestra 'Se generarán N slot(s)' + lista scrolleable de fechas con badges OK/Conflicto.
- [ ] **[Happy path - Reactivar]** Confirmar en Reactivar llama reactivateAbonadoAction(id), en success: toast dice 'Reactivado. Se generaron X slot(s).' y dialog cierra.
- [ ] **[Happy path - Reactivar]** Tras reactivar: revalidatePath('/abonados') ejecuta y status cambia a 'active'.
- [ ] **[Happy path - Cancelar]** Clic en 'Cancelar' abre ConfirmDialog destructive con titulo 'Cancelar abonado' y confirmationPhrase 'CANCELAR'.
- [ ] **[Happy path - Cancelar]** En dialog Cancelar: label 'Cancelar desde' + date input defaultValue = hoy+7 días (en ART), min=todayART().
- [ ] **[Happy path - Cancelar]** El date input tiene id=`cancel-date-${abonadoId}` para asociarse al label.
- [ ] **[Happy path - Cancelar]** Cambiar fecha en el input actualiza state.cancelFromDate via onCancelFromDateChange.
- [ ] **[Happy path - Cancelar]** Confirmar en dialog Cancelar llama cancelAbonadoAction(id, state.cancelFromDate), en success: toast dice 'Abonado cancelado.' y dialog cierra.
- [ ] **[Happy path - Cancelar]** Tras cancelar: revalidatePath('/abonados') ejecuta y status cambia a 'canceled'.
- [ ] **[Happy path - Cancelar]** Abonado canceled: NO muestran botones, solo fila inerte (read-only state).
- [ ] **[Validacion - Precio]** Montos en centavos: 1000 centavos = $10,00 (Intl.NumberFormat es-AR).
- [ ] **[Validacion - Precio]** Precio con 99 centavos: 1099 centavos = $10,99.
- [ ] **[Validacion - Horario]** timeStart y timeEnd en formato HH:MM (ej: '19:00', '20:30').
- [ ] **[Validacion - Dia]** dayOfWeek es integer 0-6 (0=Dom, 6=Sáb).
- [ ] **[Validacion - JSON]** contactName y contactPhone permiten espacios, caracteres especiales, emojis (no validacion lado cliente en tabla).
- [ ] **[Carga]** Al presionar Pausar, botones en fila quedan disabled (isPending = state.dialog !== null) hasta que acción completa.
- [ ] **[Carga]** Durante dialog Pausar/Cancelar: botón 'Pausar'/'Cancelar' en dialog tiene pending state (ConfirmDialog maneja isSubmitting).
- [ ] **[Error 404]** Si pauseAbonadoAction retorna {success: false, error: 'Abonado X no encontrado.'}, mostrar error en toast y NO revalidar.
- [ ] **[Error 409]** Si reactivateAbonadoAction retorna error 'Este horario ya tiene un turno fijo activo. Cancelalo primero.': toast error y dialog cierra.
- [ ] **[Error - Alreadycanceled]** Si pauseAbonadoAction en abonado 'canceled': retorna {success: false, error: 'El abonado ya fue cancelado.'} y NO revalidar.
- [ ] **[Error - Alreadycanceled]** Si reactivateAbonadoAction en abonado 'canceled': retorna {success: false, error: 'El abonado ya fue cancelado.'} y NO revalidar.
- [ ] **[Error - Red/Timeout]** Si pauseAbonadoAction falla por network timeout (fetch error no catcheado): error se propaga y maneja por try-catch en ConfirmDialog.
- [ ] **[Error - Red/Reactivate Preview]** Si previewAbonadoSlotsAction retorna {success: false, error: 'Tenant no encontrado.'}: mostrar 'No se pudo cargar la vista previa: Tenant no encontrado.' en rojo.
- [ ] **[Error - Rate limit]** Si action retorna {success: false, error: 'Demasiadas operaciones en poco tiempo. Esperá unos segundos e intentá de nuevo.'}: mostrar en toast.
- [ ] **[Error 422 - Reactivate]** Si fromDate de cancel no es YYYY-MM-DD valido: cancelAbonadoAction rechaza con 'Datos inválidos.' sin revalidar.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Permisos - Tenant isolation]** Abonados listados filtrados por tenant_id en SQL. RLS enforced en DB.
- [ ] **[Permisos - Super admin]** Super admin NO puede ver abonados de otros tenants via /abonados (necesita /super-admin/*).
- [ ] **[Sesion - Expirada]** Si JWT expira durante dialog abierto y se confirma acción: server action redirige a /login, modal queda pendiente.
- [ ] **[Sesion - Refresh]** Tras revalidatePath('/abonados'): los datos en AbonadosList se refetchen, no persistent en browser state.
- [ ] **[Doble click]** Doble clic en botón 'Pausar': isPending bloquea segundo clic (disabled={isPending}).
- [ ] **[Doble click]** Si dos requests pauseAbonadoAction llegan simultáneamente: DB idempotencia via row lock en Drizzle, el 2do falla con AbonadoAlreadyCanceledError u otro error.
- [ ] **[Doble submit]** En dialog Cancelar: si usuario confirma dos veces rápido, ConfirmDialog disabled buttons hasta Promise resuelve.
- [ ] **[Doble submit]** Si dialogo visible por reactivate preview lento: clicking Reactivar antes de que preview cargue usa empty dates preview, aun asi reactivateAbonadoAction ejecuta en backend.
- [ ] **[Navegacion - Back]** Botón browser back tras cerrar dialog: cierra dialog (onOpenChange false), vuelve a /abonados, revalidatePath NO afecta historial.
- [ ] **[Navegacion - Atras del navegador]** Con dialog abierto, clic back del navegador: cierra dialog y vuelve a /abonados.
- [ ] **[Deep link]** URL /abonados con parámetros query no soportados (ej: ?status=xxx): no valida lado cliente, renderiza todos los abonados sin filtrar.
- [ ] **[Deep link - Redireccion]** URL /abonados con user no autenticado: redirige a /login en page.tsx (server-side, no client).
- [ ] **[Visual - Truncamiento]** Nombre muy largo (ej: 50 caracteres en contactName): fila puede wrap o truncarse sin testing visual. Verificar overflow-hidden en td.
- [ ] **[Visual - Modal z-index]** Dialog abierto debe estar encima de toda la tabla. ConfirmDialog usa Radix Portal (z-index auto).
- [ ] **[Visual - Responsive mobile]** En mobile (320px): tabla scrollea horizontalmente, columnas visible. Botones Pausar/Cancelar como texto link comprimido. Verificar touch targets min 44px.
- [ ] **[Visual - Responsive tablet]** En tablet (768px): tabla completa visible. Espaciado p-3 en celdas. Acciones en línea sin wrap.
- [ ] **[Visual - Contraste]** Badge success (verde) debe cumplir WCAG AA contra fondo. Badge warning (amarillo) debe tener suficiente contraste con texto oscuro.
- [ ] **[A11y - Keyboard]** Tabbing a través de botones Pausar/Cancelar debe seguir orden de lectura left-to-right. Acceso a date input en dialog.
- [ ] **[A11y - Foco]** Al abrir dialog: foco automático a botón Confirmar. Cerrar dialog devuelve foco al botón que lo abrió (ConfirmDialog maneja focus-trap).
- [ ] **[A11y - Labels]** Date input en dialog Cancel tiene label 'Cancelar desde' con htmlFor asociado.
- [ ] **[A11y - ARIA]** Dialog con role='alertdialog' si es destructive. ReactivatePreview con role='alert' en error message.
- [ ] **[A11y - Anuncio de error]** Si preview falla: error message renderiza con role='alert' para screen readers.
- [ ] **[A11y - Lectura de tabla]** Encabezados <th> en thead. Filas <tr> en tbody. Screen reader debe leer fila como: 'Lun 19:00-20:30 Juan Pérez +5491... $500.00 $2000.00 Activo Pausar Cancelar'.
- [ ] **[Persistencia - Reload]** F5 tras pausar abonado: revalidatePath('/abonados') ya ejecutó, nuevos datos cargan en page.tsx. Status persiste en DB.
- [ ] **[Persistencia - Session storage]** Dialog state (cancelFromDate, reactivatePreviewDates) NO persiste tras reload. React useState se reinicia.
- [ ] **[Persistencia - DB]** Tras acción exitosa: cambio en abonados.status guardan en DB. SELECT posterior refleja cambio (read-after-write en page.tsx).
- [ ] **[Concurrencia - Doble pestaña]** Pestaña A pausar abonado, Pestaña B intenta pausar mismo abonado: B recibe error 'El abonado ya fue cancelado.' (via pauseAbonado lógica que chequea status).
- [ ] **[Concurrencia - Reactivar conflicto]** Pestaña A reactivar + Pestaña B pausar mismo horario: B puede frenarse si reactivar ganó la carrera, preview muestra conflicto.
- [ ] **[Concurrencia - Cancelar desde fecha]** Si Pestaña A cancela desde 2026-06-15 y Pestaña B intenta desde 2026-06-10 simultáneamente: ambos DELETE ejecutan, ambos pueden succeed (no transaccion cruzada).
- [ ] **[Edge - Abonado sin playerId]** abonado.playerId puede ser null (contacto sin jugador vinculado). La fila NO valida playerId, renderiza normale solo con contactName y contactPhone.
- [ ] **[Edge - Fecha fin null]** endsOn puede ser null (suscripción abierta). generateSlotDates genera desde startsOn al infinito (8 semanas). UI no muestra endsOn, renderiza fecha como empty.
- [ ] **[Edge - 60 min]** Abonado de 60 minutos: 19:00-20:00 renderiza normalmente.
- [ ] **[Edge - 120 min]** Abonado de 120 minutos: 19:00-21:00 renderiza normalmente.
- [ ] **[Edge - Conflict preview]** Reactivar preview con 8 fechas, todas con conflicto: dialog muestra 'Se generarán 0 slot(s) (8 con conflicto, se saltarán).'
- [ ] **[Edge - Closed dates]** tenant.closedDates (ej: fechas de feriados) se usan en generateSlotDates. Preview excluye esas fechas de la cuenta.
- [ ] **[Edge - Empty contact]** contactName vacio (schema requiere min 1): form validation en /abonados/nuevo previene, listado solo muestra válidos.
- [ ] **[Edge - Large phone]** Teléfono con 40+ caracteres (internacional): se trunca en xs/muted-foreground. Verificar overflow.
- [ ] **[Edge - Notes field]** abonado.notes puede tener 500+ caracteres. UI NO renderiza notes en listado (no visible). Guardado en DB.
- [ ] **[Edge - Status label unknown]** Si DB contiene status no en enum (ej: 'archived'): fallback a mostrar el valor raw (STATUS_LABELS[a.status] ?? a.status).
- [ ] **[Edge - Badge variant unknown]** Si status unknown: STATUS_VARIANT[status] retorna undefined, Badge recibe undefined como variant, fallback a 'secondary'.
- [ ] **[Edge - Formato ARS**]** Monto negativo (ej: -1000): Intl.NumberFormat formatea como -$10,00. Schema no valida negativos en listado, solo en create.
- [ ] **[Edge - Timestamp display]** createdAt/updatedAt en DB son timestamps. UI NO renderiza timestamps en listado (no visible en tabla).
- [ ] **[Schema - RLS multi-tenant]** Todos los abonados en query filtered WHERE tenant_id = ${tenant.id}. SET LOCAL app.current_tenant_id protege a DB level.
- [ ] **[Schema - Soft delete]** NO hay soft delete para abonados. canceled status es el equivalente (row remains in DB, status changed, bookings deleted).
- [ ] **[Schema - Audit log]** pauseAbonado/reactivateAbonado/cancelAbonado insertan en audit_logs con action 'abonado.paused'/'abonado.reactivated'/'abonado.canceled'.
- [ ] **[Callback - Toast success]** Toast message en Pausar: 'Abonado pausado correctamente.' (variant: 'success').
- [ ] **[Callback - Toast success reactivate]** Toast en Reactivar: 'Reactivado. Se generaron N slot(s).' (pluraliza si N !== 1).
- [ ] **[Callback - Toast success cancel]** Toast en Cancelar: 'Abonado cancelado.' (variant: 'default', no es destructive toast).
- [ ] **[Callback - Toast error]** Toast en error: header red, mensaje del error backend, variant default/error context (from toast hook).
- [ ] **[Callback - Dialog close]** onClose() resetea state a defaultRowState: { dialog: null, cancelFromDate: defaultCancelDate(), ... }.
- [ ] **[Revalidate - After pause]** revalidatePath('/abonados') tras pausar: invalidates Page-level cache, AbonadosList refetches abonados via getAbonados(tenant.id, {}).
- [ ] **[Revalidate - After reactivate]** revalidatePath('/abonados') tras reactivar: refetch trae status='active', UI remonta fila con botones 'Pausar' y 'Cancelar'.
- [ ] **[Revalidate - After cancel]** revalidatePath('/abonados') tras cancelar: refetch trae status='canceled', UI remonta fila sin botones.
- [ ] **[Revalidate - Conflict case]** Si reactivateAbonadoAction retorna error (no revalidated), admin sigue viendo status='paused' + preview con error msg en dialog.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS Y BUGS POTENCIALES DETECTADOS:

1. **Missing filter UI**: El checklist pide "filtrar por estado" pero el código NO implementa filtrado lado cliente. getAbonados acepta {status?} pero la UI no expone selectores. Los abonados siempre se cargan sin filtro. Esto es un gap de UX vs especificación.

2. **Status fallback en Badge**: Si un abonado llega con status not in enum (ej 'archived'), STATUS_LABELS[status] ?? status renderiza el valor raw. No hay validación que rechace valores fuera del enum en DB, solo en Drizzle schema level.

3. **Timezone en todayART()**: El código calcula hoy-7 como defaultCancelDate() restando 3 horas UTC. Esto puede fallar en periodos de transición horaria (DST) si Argentina cambia. Actualmente sin DST pero frágil.

4. **RLS a nivel schema, no visible en tests UI**: El aislamiento multi-tenant se asegura via RLS + SET LOCAL en Drizzle, NO en lado cliente. Un test de seguridad debe verificar que otro tenant NO puede ver/mutar abonados via CORS/API directo. La UI per se confía en backend.

5. **No validación de fechas futuras en cancelFromDate**: El input date tiene min=todayART() pero NO valida que cancelFromDate <= endsOn. Puedo cancelar desde fecha mayor a endsOn sin error. Backend ignora, pero UX es confusa.

6. **Preview no valida colisión con otros tenants**: previewAbonadoSlotsAction no explícitamente filtra por tenant en getAbonadoSlotConflicts. Pero withTenantContext + SET LOCAL lo asegura. Sin testing cruzado de tenants.

7. **Dialog anidado en tbody <tr>**: El <tr> con colSpan={6} que renderiza AbonadoDialogs es un anti-pattern. Si la tabla tiene padding/border, el modal puede quedar mal posicionado. Radix Portal debería elevarlo, pero CSS stacking puede fallar.

8. **Falta manejo de tenant suspendido/blocked**: layout.tsx redirige si tenant.status in [suspended, blocked, canceled, churned], pero NO mostrar banner/warning antes. Admin es redirigido, no ve mensaje de por qué.

9. **Montos sin validación lado cliente**: pricePerSession y monthlyPrice son numéricamente positivos pero no validados en listado. Si DB contiene 0 o negativo, tabla los renderiza como está. Schema CHECK(price_per_session > 0) previene en creación, pero campo legacy puede violar.

10. **Date picker UX**: Input date min=todayART() pero no hay hardening contra inyección de dates inválidas via devtools. Backend rechaza con 'Datos inválidos.' si no YYYY-MM-DD, pero UX es mala.

---

### 23. Reportes mensuales
**URL:** `/reportes` · **Archivo:** `src/app/(admin)/reportes/page.tsx`

- [ ] **[Render]** Cargar /reportes sin parámetros: la página muestra el título "Reportes", mes actual en formato español (p.ej. "mayo 2026"), botón Mes anterior y Mes siguiente, y los 4 KPI (Ingresos, Ajustes, Balance, Reservas).
- [ ] **[Render]** Con mes vacío (sin reservas ni ingresos): la página muestra solo el mensaje "Sin movimientos en este período." sin KPI cards, tablas ni botón de exportación.
- [ ] **[Render]** Con datos en el período: se renderiza el grid de 4 KPI cards con valores en ARS con formato $X.XX (centavos → pesos), sin decimales en centavos.
- [ ] **[Happy path]** Usuario admin navega a /reportes, ve mes actual con datos: Ingresos = suma de cash_flows tipo 'income', Ajustes = suma de tipo 'adjustment', Balance = Ingresos + Ajustes, Reservas = COUNT bookings con status confirmed|completed|no_show.
- [ ] **[Happy path]** Tabla "Por cancha" muestra cada cancha que tiene bookings: court_name, ingresos (sum cash_flows), reservas (count), ocupación (booked_minutes / available_minutes * 100, redondeado a 1 decimal).
- [ ] **[Happy path]** Tabla "Por método de pago" muestra métodos: cash, transfer, mercadopago, other; cada uno con total sumado desde cash_flows.method, solo si total > 0.
- [ ] **[Happy path]** KPI "Ingresos" muestra cambio porcentual vs mes anterior (↑ 25% o ↓ 30%) si mes anterior tiene datos; si mes anterior vacío, sin badge de cambio.
- [ ] **[Happy path]** Ocupación en tabla "Por cancha" = 0% cuando hay 0 canchas online, incluso si hay bookings (courtCount = 0 retorna 0 en calcAvailableMinutes).
- [ ] **[Happy path]** Botón "Exportar CSV" descarga archivo con nombre reporte-YYYY-MM-DD-YYYY-MM-DD.csv conteniendo fecha, tipo, categoría, monto_ars, método, descripción, cancha; columnas correctas y escapadas RFC 4180.
- [ ] **[Happy path]** CSV exportado incluye rows con commas y comillas escapadas correctamente: comas dentro del field envoladas en " ", comillas internas convertidas a "".
- [ ] **[Validación]** Parámetro ?month=YYYY-MM válido (ej. 2026-05): aceptado, renderiza ese mes. Formato check: /^\d{4}-(0[1-9]|1[0-2])$/ debe pasar.
- [ ] **[Validación]** Parámetro ?month=2026-13: rechazado, fallback a mes actual (currentMonthStr).
- [ ] **[Validación]** Parámetro ?month=2026-00: rechazado, fallback a mes actual.
- [ ] **[Validación]** Parámetro ?month=26-05: rechazado, fallback a mes actual (4 dígitos obligatorio).
- [ ] **[Validación]** Parámetro ?month=2026-5: rechazado (sin cero padding), fallback a mes actual.
- [ ] **[Validación]** Parámetro ?month=abc: rechazado, fallback a mes actual.
- [ ] **[Validación]** Parámetro ?month= (vacío): aceptado, fallback a mes actual.
- [ ] **[Validación]** Sin parámetro month: renderiza mes actual (via currentMonthStr que usa Date.now() UTC).
- [ ] **[Validación]** Múltiples parámetros ?month=2026-05&month=2026-06: usa el primero (typeof string check, rest ignorado).
- [ ] **[Validación]** Cambio porcentual: con prev_income=0 e income=100: badge null (no divide por 0, retorna null).
- [ ] **[Validación]** Cambio porcentual: con prev_income=100 e income=120: badge "↑ 20% vs mes ant." (delta = round((120-100)/100*100) = 20).
- [ ] **[Validación]** Cambio porcentual: con prev_income=100 e income=80: badge "↓ 20% vs mes ant." (valor negativo mostrado como ↓ sin -).
- [ ] **[Vacio]** Mes con 0 ingresos pero N reservas: renderiza "Sin movimientos" (isEmpty = report.income === 0 && report.bookingCount === 0).
- [ ] **[Vacio]** Mes con N ingresos pero 0 reservas: renderiza KPIs sin tabla "Por cancha" (byCourt.length = 0, condicional no renderiza sección).
- [ ] **[Vacio]** Mes sin datos en cash_flows ni bookings: prevPeriod = null, KPI change badges no se muestran.
- [ ] **[Vacio]** Tabla "Por método de pago" no renderiza si byMethod.length = 0.
- [ ] **[Carga]** Al cargar la página sin PIN configurado (tenant.settings.staff_pin_hash = falsy): PinGate pasa pinRequired=false, no muestra overlay de PIN, renderiza contenido directo.
- [ ] **[Carga]** Al cargar con PIN configurado: PinGate muestra spinner mientras verifica session (verified=null), luego input de PIN si no verificado.
- [ ] **[Carga]** CSV descargado desde enlace /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv : status 200, Content-Type text/csv, Content-Disposition attachment.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Error 401]** Endpoint CSV sin auth válida: retorna unauthorized() (401), no descarga archivo.
- [ ] **[Error 403]** Usuario staff de otro tenant accede CSV: getStaffTenant(staffUserId) retorna tenant diferente, queries usan tenant.id para RLS, datos ocultos (RLS policy), CSV vacío.
- [ ] **[Error 429]** Descarga CSV mientras rate limit alcanzado (adminCrud bucket): rateLimit429() retorna 429 Too Many Requests.
- [ ] **[Navegación]** Click botón "Mes anterior" desde ?month=2026-05: POST form method=get a /reportes con input hidden name=month value=2026-04 → URL ?month=2026-04.
- [ ] **[Navegación]** Click botón "Mes siguiente" desde ?month=2026-04: POST form a /reportes con value=2026-05 → URL ?month=2026-05.
- [ ] **[Navegación]** Click "Mes siguiente" con month=currentMonthStr: botón disabled (next > currentMonthStr), click sin efecto, URL sin cambio.
- [ ] **[Navegación]** Desde ?month=2020-06, click prev: URL /reportes?month=2020-05 (prevMonthStr retorna anterior).
- [ ] **[Navegación]** Desde ?month=2026-01, click prev: URL /reportes?month=2025-12 (year boundary, enero → diciembre anterior).
- [ ] **[Navegación]** Desde ?month=2025-12, click next: URL /reportes?month=2026-01 (year boundary, diciembre → enero siguiente).
- [ ] **[Deep link]** Acceder directo a /reportes?month=2000-01 (enero 2000): renderiza sin errores, "Sin movimientos" si vacío.
- [ ] **[Deep link]** Acceder a /reportes?month=2099-12 (futura): renderiza sin errores; botón siguiente disabled porque next=2100-01 > currentMonthStr.

- [ ] **[Permisos]** Empleado con PIN requiere ingresarlo: PinGate muestra formulario, tras 5 intentos fallidos en 5 min bloqueado, cuenta atrás visible.
- [ ] **[Permisos]** PIN correcto (staff con PIN): setVerified(true) via verifyPinAction, renderiza contenido, cookie PIN_SESSION set por COOKIE_TTL_MS.
- [ ] **[Sesión]** PinGate checkPinSessionAction verifica cookie: si válida retorna true → verified=true, no pide PIN nuevamente en sesión.
- [ ] **[Sesión]** Sesión expirada durante render: JWT inválido, extractAuthUser retorna null, redirige a /login (no renderiza reportes parciales).
- [ ] **[Sesión]** Cambio de tenant durante sesión (otro tenantId en meta): getStaffTenant retorna otro tenant, reportes muestran datos del nuevo tenant (RLS aislado).
- [ ] **[Doble submit]** Click doble en botón Exportar CSV: primer request inicia download, segundo request simultáneo deduplicado por navegador (sin efecto adicional).
- [ ] **[Doble submit]** Click rápido prev→prev→next→next: cada click es form submit independiente (method=get), URL actualiza para cada uno, sin duplicación de estado.
- [ ] **[Responsive]** Desktop (1024+): grid de KPI grid-cols-4, tablas ancho completo con scroll horizontal si necesario.
- [ ] **[Responsive]** Tablet (768-1023): grid de KPI grid-cols-2 sm:grid-cols-4, espaciado reducido.
- [ ] **[Responsive]** Mobile (< 640): grid de KPI no especificado (default 1 col), flex-wrap items-center justify-between en header cabe en 2 líneas con arrow buttons stacked.
- [ ] **[Accesibilidad]** Botón "Mes anterior" tiene aria-label="Mes anterior", screen reader anuncio.
- [ ] **[Accesibilidad]** Botón "Mes siguiente" tiene aria-label="Mes siguiente".
- [ ] **[Accesibilidad]** Botón "Mes siguiente" disabled=true cuando next > currentMonthStr: aria-disabled propagado, no activable por teclado.
- [ ] **[Accesibilidad]** Tablas: thead con th role=columnheader, tbody con tr anidadas, estructura semántica correcta para screen readers.
- [ ] **[Accesibilidad]** Ícono Lucide-react Download en botón CSV tiene aria-hidden="true", no duplica anuncio de botón.
- [ ] **[Accesibilidad]** Mensaje vacío "Sin movimientos en este período." es accesible como párrafo (no oculto en display:none).
- [ ] **[Edge]** Período con solo cashflows de tipo 'adjustment' (adjustment = 1000, income = 0): isEmpty=true (income=0 && bookingCount=0), no renderiza tablas pese a adjustment > 0.
- [ ] **[Edge]** Valor formatARS(0): retorna "$0" (Intl.NumberFormat 'es-AR', minimumFractionDigits=0, sin centavos).
- [ ] **[Edge]** Valor formatARS(100000): retorna "$1.000,00" en locale es-AR (100000 centavos = 1000 ARS, formato con punto de mil y coma decimal).
- [ ] **[Edge]** Valor formatARS(-50000): retorna "-$500" (negativo posible si adjustments negativos).
- [ ] **[Edge]** Month bounds: getMonthBounds('2026-02') retorna from=2026-02-01T00:00:00Z, to=2026-03-01T00:00:00Z (febrero 28 días incluido).
- [ ] **[Edge]** Año bisiesto: getMonthBounds('2024-02') a getMonthBounds('2024-03') = 29 días (leap year), calcAvailableMinutes correcto.
- [ ] **[Edge]** Ocupación con 0 canchas online: calcOccupancyPct(X, 0) = 0 (no divide por 0, returns 0).
- [ ] **[Edge]** Ocupación con booked_minutes > available_minutes (data inconsistency): calcOccupancyPct(1200, 960) = round(1.25*1000)/10 = 125 (sin cap a 100, data-driven).
- [ ] **[Edge]** CSV vacío: toCsv([]) retorna '' (empty string, no header row).
- [ ] **[Edge]** CSV con row null/undefined: toCsv([{a: null, b: undefined}]) = "a,b\r\n,," (valores convertidos a '').
- [ ] **[Edge]** CSV descargado del mes de hoy ?to=YYYY-MM-DD: to calculado como new Date(to.getTime() - 86400000) (resta 1 día, inclusive al final del mes).
- [ ] **[Visual]** KPI card: border border-slate-200, bg-white, p-4, shadow-sm, rounded-lg, ratio 2:1 en desktop.
- [ ] **[Visual]** KPI label: text-xs, font-medium, uppercase, tracking-wide, text-slate-500.
- [ ] **[Visual]** KPI valor: text-xl, font-semibold, tabular-nums (monoespaciado para alineación vertical).
- [ ] **[Visual]** Change badge color: ↑ = text-emerald-600 (verde), ↓ = text-red-600 (rojo).
- [ ] **[Visual]** Tabla header: border-b border-slate-100, px-6 py-3, uppercase, text-xs.
- [ ] **[Visual]** Tabla row: border-b border-slate-50, last:border-0, px-6 py-3 text-slate-700, alternancia sin color fondo.
- [ ] **[Visual]** Header layout: flex flex-wrap items-center justify-between gap-3, h1 text-2xl font-semibold.
- [ ] **[Visual]** Month label: min-w-[11rem] text-center text-sm font-medium (suficiente para "mayo 2026").
- [ ] **[Visual]** CSV link: border border-slate-200, bg-white, px-4 py-2, text-sm, shadow-sm, hover:bg-slate-50, inline-flex gap-2.
- [ ] **[Persistencia]** Cargar /reportes?month=2026-05, cerrar pestaña, reabre desde historial: URL preserved, mes=2026-05 renderizado nuevamente.
- [ ] **[Persistencia]** Clickear prev desde ?month=2026-05 → ?month=2026-04, refresh página: mes=2026-04 persiste en searchParams.
- [ ] **[RLS]** Tenant A staff accede /reportes, reportes muestra solo bookings/cashflows de Tenant A (withTenantContext aislamiento RLS, query eq(tenantId, tenant.id)).
- [ ] **[RLS]** Tenant B staff descarga CSV desde ?from=2026-05-01&to=2026-05-31: only cashflows de Tenant B (getCashFlowsForExport con tenantId filter).
- [ ] **[RLS]** Admin intenta acceder reporte de otro tenant via direct DB: RLS policy deniega reads, cached report=null, 403 o redirect.
- [ ] **[Concurrencia]** Dos admin browsers en mismo tenant, ambos descargando CSV simultaneamente: rate_limit enforce('adminCrud', tenant.id) puede rechazar 2da request si limite alcanzado.
- [ ] **[Formato]** Ingresos mostrados sin decimal: $10.000,00 para 1000000 centavos (ARS 10000).
- [ ] **[Formato]** Timestamp en DB (occurred_at): UTC, conversión a ART en frontend: formatMonthLabel usa toLocaleDateString('es-AR', {timeZone: 'UTC'}).
- [ ] **[Formato]** Ocupación porcentaje: 33.3%, 50%, 100%, redondeado a 1 decimal (round((bookedMinutes/availableMinutes)*1000)/10).
- [ ] **[Formato]** CSV fecha columna: YYYY-MM-DD (fecha.toISOString().split('T')[0]).
- [ ] **[Formato]** CSV monto_ars columna: number (centavos directos, sin conversión a pesos).
- [ ] **[CSV]** Descarga con nombre: reporte-2026-05-01-2026-05-31.csv (from, to del rango, -1 día aplicado al to para inclusive).

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: (1) No hay validación de tenant_status (trialing, past_due, suspended, etc.) en el reportes page.tsx — el layout ya chequea suspended flag, pero no rechaza past_due ni trialing; reportes debería mostrar alerta si tenant.status !== 'active'. (2) isEmpty check solo valida income + bookingCount, ignorando adjustment — si hay solo adjustment, renderiza \"Sin movimientos\" sin tablas, pero el dato existe. (3) Endpoint CSV /api/reports/revenue no valida date ranges malformados (from/to podrían ser fechas inválidas si parseSafeParse falla silenciosamente). (4) PinGate depende de verifyPinAction en Server Action, pero si PIN hash corrupto o hash mismatch returns error sin re-intentos coherentes — el UI muestra \"attemptsLeft\" pero no sincroniza con backend rate-limit state en edge cases. (5) formatARS usa minimumFractionDigits=0, puede ocultar errores de precision en cálculos de centavos si hay truncamiento previo. (6) calcOccupancyPct sin cap a 100% — si booked > available (data corruption), renderiza >100. (7) prevMonthStr/nextMonthStr asumen formato válido, no validan año/mes durante parsing (crash si mes=''). (8) CSV encoding: BOM no incluido (utf-8 sin BOM es default, puede causar parsing issues en Excel Windows si usuario abre sin configurar encoding). (9) RLS dual para byCourt queries no listado explícitamente en report.service — confía en withTenantContext, pero sin policy audit explícita. (10) No hay rate-limit en GET /reportes page (solo en CSV endpoint), admin puede recargar infinito times sin throttle.

---

### 24. Staff
**URL:** `/staff` · **Archivo:** `src/app/(admin)/staff/page.tsx`

- [ ] **[Render]** Al cargar /staff, la página muestra título "Equipo" con subtítulo indicando número de admins activos (ej: "1 admin activo", "2 admins activos"), botón "Agregar admin", y tabla vacía con ícono de sobre + texto "No hay miembros de equipo aún." cuando no hay registros.
- [ ] **[Render]** Al cargar /staff con 3 miembros (2 activos, 1 inactivo), la tabla muestra exactamente 3 filas con columnas: Nombre (con badge "(vos)" solo para el usuario actual), Email, Estado (verde "Activo" o gris "Inactivo"), y Acciones (icono ⋮ solo para miembros distintos del usuario logueado).
- [ ] **[Happy path - Agregar admin]** Hacer clic en "Agregar admin" → abre modal "Invitar nuevo admin"; completar Nombre, Apellido, Email válido; enviar: debe mostrar toast de éxito, cerrar modal, refrescar tabla con el nuevo miembro (estado Inactivo), y el usuario debe recibir email de invitación de Supabase.
- [ ] **[Validacion - Email inválido]** Enviar formulario con email vacío: form requiere entrada, no permite submit. Enviar con texto "no-es-email": muestra error "Email inválido", no envía action.
- [ ] **[Validacion - Email ya activo]** Intentar invitar email ya miembro activo del complejo: devuelve error "Este email ya es miembro activo del complejo.", cierra modal pero mantiene el diálogo abierto o muestra error sin cerrar, sin agregar duplicado a la tabla.
- [ ] **[Validacion - Nombre vacío]** Intentar enviar Nombre vacío: form requiere entrada, deshabilita submit. Igual para Apellido.
- [ ] **[Validacion - Nombre/Apellido máximo 100 caracteres]** Enviar Nombre con 101 caracteres: devuelve error "Nombre inválido"; 100 caracteres aceptados.
- [ ] **[Validacion - Espacios en blanco]** Enviar Nombre " " (solo espacios): rechazado con error "Nombre requerido" (tras trim). Igual para Apellido y Email.
- [ ] **[Validacion - Email con mayúsculas]** Invitar ADMIN@TEST.COM: se convierte a admin@test.com en BD, y la búsqueda de duplicados es case-insensitive.
- [ ] **[Validacion - Emoji en Nombre]** Invitar con Nombre "Juan🎉Pérez": se almacena tal cual (si el campo lo permite). Si tiene restricción de caracteres, rechazar.
- [ ] **[Vacio]** Cargar /staff con 0 miembros: tabla vacía, subtítulo dice "0 admins activos" (¿o muestra 0 con singular?), ícono de sobre visible.
- [ ] **[Carga - Skeleton/Spinner]** Mientras se carga la lista de miembros desde BD, mostrar spinner o skeleton (si está implementado); no mostrar tabla vacía hasta que se confirme length === 0.
- [ ] **[Carga - Spinner en submit]** Clickear "Enviar invitación" en modal: botón cambia a "Procesando…" y se deshabilita durante la acción; al terminar vuelve a "Enviar invitación". Si la acción falla, vuelve a habilitarse sin cerrar modal.
- [ ] **[Doble submit]** Clickear "Enviar invitación" dos veces rápido: la form/button debe estar deshabilitada durante pending, evitando dos invitaciones. Usar startTransition.
- [ ] **[Doble submit - Desactivar]** Clickear "Desactivar" en dialog, confirmar, y luego clickear de nuevo antes de que se refresque: debe no permitir una segunda acción (button deshabilitado o dialog ya cerrado).
- [ ] **[Error 409 - Invitacion duplicada]** Supabase inviteUserByEmail devuelve error con 'already been registered': la acción captura este caso y devuelve { success: true } (silencio); el miembro se agrega o reactiva en BD sin error al usuario.
- [ ] **[Error 5xx - Supabase invitacion caida]** inviteUserByEmail falla con error que NO contiene 'already been registered': devuelve { success: false, error: 'Error enviando invitación: ...' }, modal muestra error y permanece abierto.
- [ ] **[Error 429 - Rate limit invite]** Invitar 5+ admins en 1 minuto (threshold adminCrud): devuelve error "Demasiadas operaciones en poco tiempo. Esperá unos segundos e intentá de nuevo.", modal muestra error sin cerrar.
- [ ] **[Error 429 - Rate limit desactivar]** Desactivar 5+ miembros en 1 minuto: devuelve error rate-limit, dialog muestra error en alert, permanece abierto.
- [ ] **[Error - Única admin activa]** Con 1 admin activo (el usuario actual), clickear dropdown de ese usuario: no hay opciones (el else en StaffActions valida que el miembro sea distinto del usuario). Con 1 admin activo y otro inactivo, clickear ⋮ en el inactivo: mostrar "Reenviar invitación", no "Desactivar". Con 2+ activos, clickear ⋮ en activo: "Desactivar" habilitado, clickearlo abre dialog destructivo.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Permisos - Admin logueado]** Cargar /staff como staff_user con tenantId válido e isActive=true: acceso permitido.
- [ ] **[Permisos - Admin desactivado]** staff_user actual isActive=false: getStaffTenant no lo devuelve (WHERE isActive=true), redirige a /login.
- [ ] **[Permisos - Otro tenant]** Admin del Tenant A solo ve miembros del Tenant A (getStaffTenant filtra por usuario).
- [ ] **[Permisos - PinGate sin PIN]** Tenant sin PIN configurado (staff_pin_hash NULL): PinGate { pinRequired={false} }, se salta la gate, ve tabla directamente.
- [ ] **[Permisos - PinGate con PIN]** Tenant con PIN configurado: PinGate { pinRequired={true} }, muestra modal "Zona protegida", requiere PIN válido (4-8 dígitos). Tras verificar, sesión válida 30 min (COOKIE_TTL_MS), puede invitar/desactivar sin re-entrar PIN. Al expirar la sesión, vuelve a pedir PIN si vuelve a /staff.
- [ ] **[Sesion - PIN expirado]** Verificar PIN, esperar 30 min + 1 seg en /staff: al intentar invitar, ¿verifica PIN nuevamente? Si la acción usa verifyPinAction, checkPinSessionAction devuelve false, y el componente re-renderiza con el gate bloqueado. Si no lo verifica, invitación funciona sin re-autenticar (riesgo de seguridad).
- [ ] **[Sesion - Refresh de auth JWT]** Durante invitación, el JWT expira (1 hora típico): extractAuthUser falla, redirect('/login') en la action. Modal muestra error genérico o usuario es redirigido a login antes de enviar.
- [ ] **[Navegacion - Atras/Adelante]** Navegar a /staff, invitar un admin (refrescar tabla), clickear atras: se regresa a página anterior. Clickear adelante: vuelve a /staff. La tabla debe reflejarse con revalidatePath('/staff').
- [ ] **[Deep link - URL invalida]** Acceder a /staff/123 o /staff?foo=bar: no es una ruta válida en el app router. Redirige a /404 o mantiene en /staff ignorando parámetros. Si no hay subrotas, estos accesos no deben afectar /staff.
- [ ] **[Visual - Truncamiento]** Nombre largo (40+ caracteres): ¿se trunca con elipsis o wrappea? Email muy largo (80+ chars): en td px-6, debe encajar sin quebrar layout. Revisar en desktop y mobile.
- [ ] **[Visual - Hover/Focus]** Fila de miembro: hover:bg-slate-50 visible. Botón "Agregar admin": hover:bg-emerald-500, focus-visible:ring. Dropdown del ⋮: focus visible en MenuItem (cursor-pointer, colors), opción desactivada (disabled) debe verse opaca.
- [ ] **[Visual - Modal invite]** Al abrir modal, debe estar centrado, max-w-md, con padding correcto. Inputs tienen h-10. Label, Input, Helper text "Recibirán un email para activar su cuenta." visible en español. Botón submit verde emerald-600.
- [ ] **[Visual - Dialog confirmar desactivar]** Al desactivar miembro, dialog destructive (botón rojo), título "Desactivar Nombre Apellido", descripción con bullets (acceso inmediato, sesiones invalidas, historial). Debe haber input para escribir el email (confirmationPhrase={member.email}).
- [ ] **[A11y - Labels]** Todos los inputs (Nombre, Apellido, Email, PIN en PinGate) tienen <label htmlFor>. Los aria-label en iconos (Mail, MoreHorizontal, UserPlus, Lock).
- [ ] **[A11y - Foco]** Clickear "Agregar admin": foco debe ir al input Nombre. En modal (dynamic import), foco manejado por Radix Dialog (autoFocus en firstName). En PinGate, autoFocus en PIN input.
- [ ] **[A11y - Error announced]** Enviar invitación con email inválido: mensaje de error debe estar en <p role="alert"> o similar. En PinGate, errores mostrados con role="alert". En dialog de confirmación, error mostrado sin role específico, pero visible. Revisar si screen reader lo anuncia.
- [ ] **[A11y - Orden tabulación]** Filas: Nombre → Email → Estado → (⋮ si aplica). Modal invite: Nombre → Apellido → Email → Botón. Dialog: (opcional input) → Cancel → Confirm. PinGate: PIN → Confirm. Usar keyboard para navegar sin mouse.
- [ ] **[A11y - Contraste]** Badge "Activo" verde (bg-green-50, text-green-700): contraste > 4.5:1. Badge "Inactivo" gris (bg-slate-100, text-slate-600): revisar contraste. Textos en modal/dialog suficientemente contrastados.
- [ ] **[A11y - Screenreader]** Tabla: <th> con scope="col" implícito (revisar Radix/shadcn). Badge de estado: ¿es aria-label o solo texto? Icono del ⋮: aria-label="Opciones". Mail en tabla vacía: aria-hidden="true" (correcto).
- [ ] **[Concurrencia - Invitar mientras desactiva]** Dos pestanas abiertas en /staff. En tab A: clickear "Desactivar" en miembro X, confirmar. En tab B (antes de refrescar): intentar "Desactivar" en miembro Y. Ambas acciones deben completarse sin conflicto (son staff diferentes). Pero si son la misma, segunda intenta deactivateStaffAction con ID ya desactivado → error "Miembro no encontrado."
- [ ] **[Concurrencia - Refrescar entre invite y resend]** Tab A: invitar ADMIN@TEST.COM. Tab B: antes de que se refrescar la tabla en A, intentar "Reenviar invitación" en ADMIN@TEST.COM en B. Ambas acciones deben manejar el estado correctamente (insert + onConflictDoUpdate asegura idempotencia).
- [ ] **[Responsive - Mobile (375px)]** Tabla: ¿se scrollea horizontalmente o se reordena? Header y sidebar: logo/menu visible. Botón "Agregar admin" accesible. Modal: max-w-md en mobile, inputs full-width, botones full-width o stacked.
- [ ] **[Responsive - Tablet (768px)]** Tabla visible, columnas comprimidas o todas visible. Modal no debe ocupar toda la pantalla. Header adaptado.
- [ ] **[Responsive - Desktop (1440px)]** Tabla con padding normal, todos los detalles visibles, modal centrado.
- [ ] **[Edge - Invite de super-admin]** ¿Puede el super-admin (system_admins) acceder a /staff de un tenant específico? No, porque usa super-admin/*. La ruta /staff requiere staff_user con tenant_id.
- [ ] **[Edge - Cambio de tenant]** ¿Un staff_user puede ser miembro de múltiples tenants? Sí (tabla tenant_staff_members permite). Pero la página /staff actual solo muestra el tenant del JWT. Si el usuario alterna tenants, debería ir a /staff del nuevo tenant y ver sus miembros.

> ⚠️ **Riesgo detectado en codigo:** **Riesgos detectados:** 1) resendInviteAction no valida si el email corresponde a un miembro del tenant actual — potencialmente reenviada invitación de un jugador global o de otro tenant (la action toma solo email, sin tenant context). 2) En inviteStaffAction, si Supabase inviteUserByEmail falla con 'already been registered', la acción devuelve {success:true} silenciosamente, pero la BD ya insertó el miembro con onConflictDoUpdate — inconsistencia potencial. 3) PinGate solo se valida al cargar la página (checkPinSessionAction), pero no se re-valida durante invitación/desactivación — si la sesión expira mientras se procesa, la acción podría ejecutarse sin PIN. 4) Dialog de confirmación requiere escribir email exactamente (case-sensitive trim), pero en BD el email se almacena lowercase — riesgo de que el usuario escriba con mayúsculas y falle. 5) No hay validación en el frontend si el tenant está en estado 'suspended', 'blocked', 'canceled', 'churned', 'deleted' — solo el kill-switch y AdminLayoutShell lo validan. Si ambos fallan, un admin bloqueado podría invitar/desactivar miembros. 6) Tabla sin límite de filas ni paginación — si un complejo tiene 1000+ staff, la carga de BD sin LIMIT pagina solo 1, pero la carga UI puede ser lenta. 7) Nombres con caracteres especiales (emojis, caracteres Unicode): se almacenan tal cual, pero la UI puede renderizar mal o cortarse en ciertos anchos.

---

### 25. Configuracion: PIN
**URL:** `/settings/pin` · **Archivo:** `src/app/(admin)/settings/pin/page.tsx`

- [ ] **[Render]** Cuando NO hay PIN configurado, la página muestra el título 'Configurar PIN de administrador', subtítulo 'Sin PIN configurado, las zonas sensibles no están protegidas.', icono escudo verde, 3 campos de input (newPin, confirmPin, sin currentPin) y botón 'Configurar PIN' en color emerald.
- [ ] **[Render]** Cuando YA hay PIN configurado, la página muestra el título 'Cambiar PIN de administrador', subtítulo 'El PIN protege precios, configuración y gestión de equipo.', 4 campos de input (currentPin, newPin, confirmPin) y botón 'Cambiar PIN' en color emerald.
- [ ] **[Render]** La pestaña 'Seguridad' está activa (border-bottom emerald-600, texto emerald-700) y las otras 3 pestañas (Reservas, Horarios, Facturación) están inactivas (border-transparent, texto slate-500).
- [ ] **[Render]** Cuando NO hay PIN, aparece un banner de alerta ámbar debajo del formulario: 'Recomendado: Configurá un PIN antes de dar acceso a empleados.'
- [ ] **[Render]** El formulario contiene un label 'Nuevo PIN', descripción '4 a 8 dígitos numéricos.' con texto-xs slate-500, e inputs con `placeholder='••••'` y `inputMode='numeric'`.
- [ ] **[Happy path]** Sin PIN previo: llenar newPin con '1234', confirmPin con '1234', hacer submit → acción setPinAction se invoca y el PIN se guarda (verificar via getStaffTenant que tenant.settings.staff_pin_hash ahora tiene valor).
- [ ] **[Happy path]** Con PIN previo: llenar currentPin con el PIN correcto existente, newPin con '5678', confirmPin con '5678', hacer submit → setPinAction verifica PIN actual, guarda el nuevo hash, revalidate de página.
- [ ] **[Validacion]** Ingreso newPin con 3 dígitos ('123'), la validación del input HTML (`pattern='[0-9]{4,8}'`) invalida el campo (no permite submit en navegadores strict).
- [ ] **[Validacion]** Ingreso newPin con 9 dígitos ('123456789'), la validación HTML pattern invalida el campo (máximo 8).
- [ ] **[Validacion]** Ingreso newPin con caracteres no numéricos ('abc1'), el pattern rechaza (solo [0-9] permitido).
- [ ] **[Validacion]** Ingreso newPin con espacios ('1 2 3 4'), el pattern rechaza (espacios no son [0-9]).
- [ ] **[Validacion]** Ingreso newPin '1234', confirmPin '5678' (no coinciden) → backend rechaza con error 'Los PINes no coinciden.' (Zod refine en changePinSchema/setPinSchema).
- [ ] **[Validacion]** Ingreso newPin con emoji o caracteres especiales ('1234!'), el pattern HTML rechaza.
- [ ] **[Validacion]** Sin PIN previo: intento submit con newPin vacío → el input requerido (validación HTML) impide submit.
- [ ] **[Validacion]** Con PIN previo: intento submit sin llenar currentPin → formulario no se envía (validación HTML requerida).
- [ ] **[Validacion]** Con PIN previo: ingreso currentPin '0000' (PIN incorrecto), newPin '1234', confirmPin '1234', submit → backend retorna error 'PIN actual incorrecto.' (verifyPin falla en pin.ts:70-72).
- [ ] **[Carga]** Hacer submit en el formulario → button debe cambiar de estado (indicador visual de carga/disabled) mientras la Server Action procesa. [BUG POTENCIAL: el código NO usa useFormStatus, el botón NO se deshabilita ni muestra spinner].
- [ ] **[Error 400]** Enviar formData con newPin inválido (falla Zod) → backend retorna `{ success: false, error: 'El PIN debe ser numérico.' }` pero la UI no lo muestra (CRÍTICO: falta manejo de error).
- [ ] **[Error 422]** newPin coincide exactamente con currentPin (no cambia) → backend no lo rechaza explícitamente, pero la UX debe permitir guardar el mismo PIN (no hay validación de "diferente al anterior").
- [ ] **[Error 429]** Exceder rate limit adminCrud → adminRateLimited retorna mensaje 'Demasiadas operaciones en poco tiempo. Esperá unos segundos e intentá de nuevo.' pero la UI no lo muestra (falta UI error handling).
- [ ] **[Error 500]** withTenantContext o tx.update en _savePinHash falla → setPinAction devuelve excepción (no capturada), el servidor error; UI no muestra nada útil.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones).
- [ ] **[PinGate]** Con PIN previo, acceder a /settings/pin → PinGate({ pinRequired: true }) se activa. Si no hay PIN session cookie válido → mostrar modal 'Zona protegida' pidiendo PIN antes de poder acceder al formulario de cambio.
- [ ] **[PinGate]** Ingresar PIN incorrecto 5 veces → brute-force defense activa (enforce('pinAttempts')), en el 6to intento aparece 'Demasiados intentos. Volvé a intentar en X min.' y el input se deshabilita con countdown visible.
- [ ] **[PinGate]** Ingresar PIN correcto en el PinGate → buildPinCookie() crea cookie con HMAC, TTL 30min, la página se debloquea y muestra el formulario de cambio.
- [ ] **[Sesion]** Con PIN session válida, cambiar el PIN (guardar new PIN) → la cookie PIN session anterior sigue siendo válida 30 min más (no se invalida tras cambio de PIN).
- [ ] **[Sesion]** Esperar 30 minutos (COOKIE_TTL_MS) con PIN session activa → cookie expira, siguiente acceso a /settings/pin pide PIN gate de nuevo.
- [ ] **[Sesion]** Hacer logout (invalidar JWT auth) → mantener PIN session cookie abierta, acceder a /settings/pin → extractAuthUser falla (no autenticado) → redirect a /login.
- [ ] **[Doble submit]** Hacer submit, y ANTES de que la action retorne, hacer otro click en 'Cambiar PIN' → el navegador/Next.js repite la Server Action (sin deduplicación explícita), checkPinSessionAction se ejecuta 2 veces, _savePinHash potencialmente 2 veces; el rate limit adminCrud lo detiene en el 2do.
- [ ] **[Doble submit]** Simular lentitud de servidor (latencia 5s en setPinAction), hacer submit, esperar 1s, hacer back y forward del navegador → Next.js revalidatePath en el servidor, la página se refetch con el estado actualizado (PIN guardado).
- [ ] **[Deep link]** Ir directamente a /settings/pin?utm_source=email — la query string es ignorada, la página carga normalmente sin comportamiento especial.
- [ ] **[Deep link]** Acceder a /settings/pin/invalid-route → Next.js 404, no existe child route.
- [ ] **[Visual]** En desktop (>1024px), el formulario max-w-md se centra, labels alineados a la izquierda, inputs full-width del contenedor, botón full-width con hover state emerald-500.
- [ ] **[Visual]** En mobile (<640px), el formulario se adapta (padding p-6 se mantiene, inputs ocupan ancho disponible, botón completo), no hay overflow horizontal.
- [ ] **[Visual]** Los inputs password (type='password') muestran bullets, NO el texto plano del PIN.
- [ ] **[Visual]** Cambiar a otro tab y volver a /settings/pin → el estado del formulario se limpia (Next.js Server Component, no hay estado local; campos quedan vacíos), el PIN guardo en el servidor, pero los inputs de entrada se resetean.
- [ ] **[A11y]** Label 'PIN actual', 'Nuevo PIN', 'Confirmar nuevo PIN' asociados a sus inputs via htmlFor/id.
- [ ] **[A11y]** Botón tipo submit tiene aria-label implícito (texto 'Cambiar PIN'), accesible via teclado (Tab, Enter).
- [ ] **[A11y]** Inputs tienen `inputMode='numeric'` que indica al navegador/lector de pantalla que es entrada numérica.
- [ ] **[A11y]** Error del formulario (ej. 'PIN actual incorrecto') debe ser anunciado al usuario. [BUG: falta role='alert' en el mensaje de error que debería mostrar setPinAction en la UI].
- [ ] **[A11y]** Con PinGate activo, el modal tiene focus trap (autoFocus en input, role='status' para countdown), descripción clara 'Ingresá el PIN de administrador para continuar.'

> ⚠️ **Riesgo detectado en codigo:** CRÍTICO: La página `page.tsx` NO maneja el resultado de `setPinAction`. El formulario invoca la Server Action pero NO captura `{ success, error }`. El usuario hace submit y NUNCA sabe si el PIN se guardó o si hubo un error (validación Zod, PIN incorrecto, rate limit, etc.). Falta:
1. Component wrapper con `useActionState` para capturar el resultado de setPinAction
2. UI para mostrar errores (toast, alert, o campo de error inline)
3. Spinner/disabled state en el botón durante la acción
4. Confirmación visual de éxito (toast, redirect, revalidatePath + refetch)
Esta es una brecha arquitectónica mayor: todas las settings actions devuelven `PinConfigResult` pero NO hay infraestructura en la UI para mostrar el resultado. El mismo patrón aplica a /settings/reservas, /settings/horarios, /settings/facturacion (deberían auditarse también). El archivo `pin.test.ts` cubre verifyPinAction pero NO setPinAction. El error handling del backend está OK (Zod, rate limit, PIN verification), pero la UI es ciega a los errores.

---

### 26. Perfil del jugador
**URL:** `/perfil` · **Archivo:** `src/app/(player)/perfil/page.tsx`

- [ ] **[Render]** Cargar perfil del jugador autenticado: visualizar heading 'Mi Perfil', avatar o iniciales, nombre + email, form con 4 campos (Nombre, Apellido, Teléfono, Zona preferida) + botón 'Guardar cambios', y aviso de términos aceptados si corresponde.
- [ ] **[Render]** Con avatarUrl poblado en DB: mostrar imagen circular (64x64) con object-cover, no iniciales de fondo.
- [ ] **[Render]** Sin avatarUrl (NULL): mostrar círculo verde esmeralda (bg-emerald-600) con iniciales en blanco en mayúsculas (formato 'AC' para Andrés Conti).
- [ ] **[Render]** Con términos aceptados: mostrar card gris inferior con icono Usuario, texto 'Términos aceptados el {fecha formateada}' y versión si existe.
- [ ] **[Render]** Sin términos aceptados: NO mostrar card de términos.
- [ ] **[Happy path]** Editar nombre: cambiar firstName, submit, verificar feedback verde 'Perfil actualizado', hacer GET a DB con context player y confirmar firstName actualizado en tabla players.
- [ ] **[Happy path]** Editar apellido: cambiar lastName, submit, verificar feedback verde, DB assert lastName modificado.
- [ ] **[Happy path]** Editar teléfono: ingresar teléfono válido (ej. '+54 9 11 1234-5678'), submit, DB assert phone actualizado.
- [ ] **[Happy path]** Limpiar teléfono: borrar valor existente en phone, submit, DB assert phone=NULL.
- [ ] **[Happy path]** Editar zona preferida: ingresar 'Caballito', submit, DB assert preferred_area actualizado.
- [ ] **[Happy path]** Limpiar zona preferida: borrar valor existente, submit, DB assert preferred_area=NULL.
- [ ] **[Happy path]** Editar múltiples campos: cambiar firstName + lastName + phone simultáneamente, submit, verificar todos actualizados en DB en una transacción.
- [ ] **[Validacion]** Nombre vacío: limpiar campo, submit, recibir error inline rojo 'Nombre requerido', NO hacer UPDATE en DB, button sigue habilitado.
- [ ] **[Validacion]** Apellido vacío: limpiar campo, submit, error 'Apellido requerido', sin UPDATE.
- [ ] **[Validacion]** Nombre > 100 caracteres: ingresar string de 101 caracteres, submit, error 'Nombre requerido' (max(100) en Zod), sin UPDATE.
- [ ] **[Validacion]** Apellido > 100 caracteres: string de 101 chars, error por validación Zod, sin UPDATE.
- [ ] **[Validacion]** Teléfono 5 caracteres: ingresar '12345', submit, error por min(6) en Zod, sin UPDATE.
- [ ] **[Validacion]** Teléfono 31 caracteres: ingresar 31 dígitos/caracteres, error por max(30), sin UPDATE.
- [ ] **[Validacion]** Teléfono válido de 6 caracteres: '123456' (límite inferior), submit sin error, UPDATE exitoso.
- [ ] **[Validacion]** Teléfono válido de 30 caracteres: string de 30 chars, submit sin error, UPDATE exitoso.
- [ ] **[Validacion]** Zona preferida > 100 caracteres: ingresar 101 chars, error por max(100), sin UPDATE.
- [ ] **[Validacion]** Teléfono con espacios/puntos: '+54 9 11 1234 5678' (válido, dentro del rango), submit exitoso.
- [ ] **[Validacion]** Teléfono solo espacios: '      ', trim resulta vacío, falla por min(6), error inline.
- [ ] **[Validacion]** Nombre solo espacios: '     ', error 'Nombre requerido'.
- [ ] **[Validacion]** Apellido solo espacios: '     ', error 'Apellido requerido'.
- [ ] **[Carga]** Durante submit: verificar button muestra texto 'Guardando…', está disabled, cursor not-allowed, opacidad 60%.
- [ ] **[Carga]** Spinner/esqueleto al cargar página: verificar que Loading component se muestra brevemente antes de hidratación (testing en SSR).
- [ ] **[Error 400]** Zod parse falla (ej. nombre vacío): DevTools Network observe Zod error parsing, recibir response `{ success: false, error: '...' }`, mostrar alert rojo.
- [ ] **[Error 401]** En updateProfileAction: si extractAuthUser devuelve null (sesión expirada), redirect('/login') se ejecuta, request falla con redirect 303.
- [ ] **[Error 403]** Si JWT user.type !== 'player': redirect('/login') en page.tsx y action.
- [ ] **[Error 404]** Si withPlayerContext query devuelve rows[0]=undefined: redirect('/login') en page.tsx.
- [ ] **[Error 404]** Si en action withPlayerContext no encuentra el player: no hay validación explícita, UPDATE falla silenciosamente (affected=0), revalidatePath ocurre, pero success=true devuelto (POTENCIAL BUG: no verificar affected rows).
- [ ] **[Error 500]** DB conectividad perdida durante submit: catch aquí ocurre en server, pero ProfileForm.tsx NO tiene try-catch alrededor useFormState, exception propaga, uncaught server error (POTENCIAL BUG: sin manejo).
- [ ] **[Red/Timeout]** Latencia alta de DB (>5s): button permanece disabled, user ve 'Guardando…', eventualmente server timeout; sin reintentos automáticos (DIFERENCIA vs MercadoPago: no hay retry loop).
- [ ] **[Red/Reconexion]** Después de error de red, re-submit form: Zod reprocesa, action reintenta UPDATE, puede ejecutarse (sin idempotencia garantizada salvo contraint PK).
- [ ] **[Permisos]** Jugador con player_status='banned': puede cargar /perfil y editar (NO hay guard sobre banned en esta vista).
- [ ] **[Permisos]** Jugador con player_status='anonymized': NO debería existir sesión válida, redirect login.
- [ ] **[Sesion]** Sesión expira durante typing: user puede seguir escribiendo, submit intenta updateProfileAction, extractAuthUser devuelve null, redirect('/login') ocurre, form submission interceptada por redirect.
- [ ] **[Sesion]** Token refresh en Supabase (automático): si Supabase backend regenera token antes de submit, extractAuthUser obtiene user válido, action procede, UPDATE exitoso (transparent to form).
- [ ] **[Sesion]** Logout en otra pestaña mientras user edita: form sigue reactive, submit dispara action, extractAuthUser devuelve null (sesión no compartida cross-tab), redirect('/login').
- [ ] **[Doble submit]** Click doble en Guardar: primer click desactiva button (disabled=true via useFormStatus), segundo click no dispara (browser behavior), action se ejecuta UNA VEZ.
- [ ] **[Doble submit]** Form submit + directamente fetch updateProfileAction: client form es primaria, pero si hiciera fetch directo, action ejecutaría sin guardia extra (sin idempotencia DB).
- [ ] **[Concurrencia]** Dos pestañas abiertas en /perfil, la A cambia nombre A1, la B cambia nombre B1, ambas submit: ambas llegan a DB (último UPDATE gana, no hay conflict detection), último cambio visto es B1.
- [ ] **[Concurrencia]** Editando perfil en /perfil mientras otro admin edita mismo player vía Supabase Studio: next.js cache revalidatePath pero no suscripción Realtime para player (no implementado v1), después de refresh manual user ve versión DB.
- [ ] **[Responsive]** Mobile (375px): form fields en grid 2 cols se stackean, avatar + nombre en flexbox flexible, botón full-width, labels visibles, input altura 11 (44px finger-friendly).
- [ ] **[Responsive]** Tablet (768px): form con 2 cols se mantiene, max-w-lg limita ancho, spacing consistente.
- [ ] **[Responsive]** Desktop (1440px): max-w-lg mantiene ancho máximo 32rem, centralizad (mx-auto).
- [ ] **[A11y]** Labels linked: cada input tiene id único + label htmlFor, screen reader anuncia nombre del campo (Nombre, Apellido, Teléfono, Zona preferida, Email).
- [ ] **[A11y]** Focus ring: focus-visible en inputs muestra ring-2 ring-emerald-500, visible en keyboard navigation.
- [ ] **[A11y]** Email read-only: no input interactivo, es div con role implícito, screen reader lee 'El email no puede modificarse.'.
- [ ] **[A11y]** Error message: role='alert', screen reader anuncia en cambio de state, texto rojo legible.
- [ ] **[A11y]** Success message: role='status', screen reader anuncia 'Perfil actualizado' en cambio, no es alert (menos intrusivo).
- [ ] **[A11y]** Heading jerarquía: h1 'Mi Perfil', no skip de niveles, Landmarks (main) presentes del Layout.
- [ ] **[A11y]** Button submit: type='submit', texto descriptivo 'Guardar cambios', no solo icono, durante pending state 'Guardando…' sigue descriptivo.
- [ ] **[A11y]** Contraste: text-slate-900 sobre fondo blanco (WCAG AA mínimo), labels slate-700, helper text slate-500 (verificar ratio con herramienta).
- [ ] **[A11y]** Tabulación: tab order Nombre → Apellido → Teléfono → Zona → Email (display-only) → Guardar cambios, flujo lógico LTR.
- [ ] **[Persistencia]** Cambiar nombre, submit, esperar revalidatePath, refrescar F5: página re-renderiza con nombre actualizado desde DB (Server Component hidratación).
- [ ] **[Persistencia]** Editar perfil, router.back() inmediatamente: redirect a página anterior, regresar con browser back: /perfil re-fetch desde servidor, data actualizado (no client-side cache problema aquí).
- [ ] **[Persistencia]** Cambiar teléfono, completar form, submit, cerrar browser tab: data guardado en DB, reopenar /perfil en nueva sesión muestra teléfono actualizado.
- [ ] **[Navegacion]** Desde /perfil click link a /mis-reservas en BottomNav: ProfileForm state se pierda (client state), en mis-reservas new page load OK.
- [ ] **[Navegacion]** Browser back desde /perfil: regresa a página anterior (ej. /mis-reservas), forward: vuelve a /perfil, hidratación limpia desde servidor.
- [ ] **[Navegacion]** Deep link directo a /perfil con hash (#): Next.js ignora hash en SSR, form renderiza normalmente, hash no afecta comportamiento.
- [ ] **[Deep link]** URL /perfil?foo=bar: query params ignorados, page renderiza igual (no se pasan a page component).
- [ ] **[Visual]** Avatar imagen: aspect-ratio 1:1, rounded-full (border-radius 50%), object-cover evita deformación, 64x64 se ve nítida (crisp en densidad normal).
- [ ] **[Visual]** Avatar iniciales: bg-emerald-600 (#059669 Tailwind), texto blanco, tamaño 'text-xl' (1.25rem), centrado flex.
- [ ] **[Visual]** Nombre + email: nombre text-base font-semibold (700), email text-sm text-slate-500, alineamiento vertical gap-4 da separación visual clara.
- [ ] **[Visual]** Card términos: border-slate-200, bg-slate-50, icono text-slate-400, texto text-xs slate-500, padding px-4 py-3, gap-3, rounded-lg.
- [ ] **[Visual]** Form spacing: space-y-4 entre divs, dentro de cada div space-y-1 entre label + input, consistencia visual clara.
- [ ] **[Visual]** Input states: border-slate-200 normal, focus:ring-2 ring-emerald-500 focus:border-emerald-500, no shadow en reposo, shadow-md en button, rounded-md inputs, rounded-lg buttons.
- [ ] **[Visual]** Button estados: bg-emerald-600 normal, hover:bg-emerald-500 + hover:-translate-y-0.5 + shadow-lg, active:scale-[0.98], disabled:opacity-60 cursor-not-allowed, transición duration-200.
- [ ] **[Visual]** Truncamiento: nombres largos (>50 chars) pueden reflow a dos líneas naturalmente, teléfono largo ej '+54 9 11 1234-5678' toma espacio input, no overflow x, no truncate applied.
- [ ] **[Visual]** Email readonly: bg-slate-50 indica no editable, texto slate-500 más tenue, input-like styling pero con clase div (no <input disabled>), helper text 'El email no puede modificarse.' en xs slate-400.
- [ ] **[Edge]** Nombre con caracteres especiales: 'José María', 'Müller', 'O\'Brien' — Zod string.min/max no rechaza, DB text column no restrict, UPDATE exitoso, display correcto UTF-8.
- [ ] **[Edge]** Teléfono con caracteres internacionales: '+54-9-11-1234-5678' (guiones, espacio), string no validado por regex estricto, pasa min(6).max(30) si cabe, UPDATE exitoso (ventaja: flexible para ej. +39 Italia).
- [ ] **[Edge]** Nombre vacío después de trim: JavaScript FormData no trimea automáticamente, si user ingresa solo espacios ' ', Zod.string().min(1) lo rechaza (una L), error 'Nombre requerido'.
- [ ] **[Edge]** firstName lastName ambos inician con números: '123Name', Zod no rechaza, UPDATE exitoso, display 'Mi Perfil' name '123Name LastName' válido pero raro.
- [ ] **[Edge]** Zona preferida emojis: 'Zona 🏟️ Villa Crespo', string cabe <100 chars, Zod pasa, UPDATE exitoso, display emoji renderiza en browser.
- [ ] **[Edge]** Formulario sin cambios: user carga perfil, no modifica nada, hace submit: Zod valida OK, UPDATE SET con valores identicos, affected=0 (logicamente), success=true devuelto, feedback 'Perfil actualizado' mostrado igualmente (sin diferenciación).
- [ ] **[Edge]** Teléfono valor '0' (un carácter): min(6) rechaza, error Zod 'Teléfono requerido' (mensaje genérico Zod si no fue especificado, fallback 'Datos inválidos.').
- [ ] **[Edge]** Número teléfono con código de país: '+54 11 1234 5678', length check > 6 && < 30, pasa, UPDATE exitoso (no regex strict).
- [ ] **[Edge]** Avatar URL inválido en DB (quebrada/404): Image component renderiza, src inválido, browser no carga imagen, fallback a alt text (no mostrado en este caso), entonces initials muestran? NO — lógica es if (avatarUrl) else initials, entonces imagen rota se muestra vacía (POTENCIAL BUG: sin error boundary o fallback).
- [ ] **[Edge]** Términos aceptados pero sin termsVersion: mostrar card con 'Términos aceptados el {fecha}' sin paréntesis ni (versión ...) (ternary en page.tsx maneja esto).
- [ ] **[Edge]** agreedToTermsAt muy antigua (2020): formatDate convierte a 'es-AR' locale, muestra 'enero' (mes en español), día sin leading zero, año 4-digit, resultado ej. '15 de enero de 2020' (correcto format).
- [ ] **[Edge]** firstName o lastName es un único carácter: 'J' o 'A', initials devuelve 'JX' (primer char de cada), display válido, UPDATE exitoso.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: (1) En actions.ts línea 34, el schema.safeParse falla, se devuelve error del PRIMER issue (Zod collections múltiples issues pero se reporta solo el primero — si user envía nombre vacío Y teléfono muy corto, solo ve el error de nombre). (2) Línea 37, mensaje fallback 'Datos inválidos.' — genérico, puede confundir. (3) No hay verificación de affected rows después del UPDATE (línea 48) — si player ID no existe, UPDATE silenciosamente no hace nada, pero success=true se devuelve igual (POTENCIAL BUG: indicador falso de éxito). (4) En ProfileForm.tsx línea 19, INITIAL_STATE hardcodeado a { success: true }, esto significa en render inicial el form nunca muestra error (correcto), pero si la action falla silenciosamente (ej. DB down), error no visible hasta next submit. (5) Línea 114-122, feedback messages solo mostrados si didSubmit=true, esto es intencional para evitar mostrar estado en render inicial, pero significa user no ve feedback si hace submit fallido silencioso. (6) No hay try-catch en updateProfileAction alrededor withPlayerContext(tx) — si DB falla, exception no capturada, propaga al client como uncaught error (sin manejo). (7) En page.tsx, extractAuthUser() puede retornar null pero hay check if (!user), sin embargo no hay verificación si user.playerId es válido UUID (edge case, pero teóricamente posible). (8) No hay RLS policy verificada en comentarios — se asume withPlayerContext + SET LOCAL maneja context, pero no hay assertion sobre RLS policy funcionando en esta vista (aunque sí verificado en doctests de RLS). (9) Email es display-only texto, no input deshabilitado — accesibilidad podría beneficiarse de aria-label explícito o role='presentation' (minor). (10) Avatar Image component tiene alt='Avatar', generic, podría ser 'Avatar de {nombre}' para accesibilidad (minor). (11) Validación de teléfono solo por longitud (6-30), sin regex de formato — permite '+54911234', '(11)1234', o incluso 'XXXXXX', flexible pero riesgoso (by design parece intencionado, sin formato estricto). (12) InitalsFunction no protegido contra firstName/lastName undefined — usa ?? '' fallback en JSX (firstName[0] ?? ''), correcto, pero si firstName es '' (string vacío), substring [0] es undefined, ternary cubre bien.

---

### 27. Explorar complejos
**URL:** `/explorar` · **Archivo:** `src/app/(public)/explorar/page.tsx`

- [ ] **[Render]** Cargar /explorar sin params: debe mostrar encabezado 'Explorá complejos de fútbol', SearchBar (Buscar, Localidad, Fecha, Hora), ExplorarToolbar con contador de resultados, sidebar de filtros (desktop), y grid de tarjetas de complejos con 12 items si están disponibles.
- [ ] **[Render]** En desktop (>=1024px): el sidebar de filtros debe estar sticky en top-20 con border, rounded, shadow-sm; en móvil (<1024px) debe estar oculto (hidden) y accesible vía drawer modal 'Filtros'.
- [ ] **[Render]** SearchBar debe tener 4 campos visibles en desktop (Buscar, Localidad, Fecha, Hora) en grid-cols-12 (col-span-4, 3, 2, 2 + botón col-span-1); en móvil apilados verticalmente en grid-cols-1.
- [ ] **[Render]** Cada TenantCard debe mostrar: imagen de portada (o fallback con iniciales), badge 'Reserva online' si allowOnlineBooking=true (esquina superior izquierda con icono Zap), botón favorito (corazón, esquina superior derecha, z-10), precio 'Desde $X' (esquina inferior izquierda), rating si reviewCount>0 (esquina inferior derecha).
- [ ] **[Render]** ExplorarToolbar debe mostrar: contador de complejos (ej '45 complejos'), botón 'Filtros' con badge de count activos (solo mobile), select de ordenamiento, toggle Lista/Mapa con aria-pressed.
- [ ] **[Happy path]** Escribir en Buscar 'Cancha X', cambiar Localidad a 'La Plata', presionar botón Buscar: la URL debe actualizarse a /explorar?q=Cancha+X&city=La+Plata, resultados re-fetcheados (conteo y grid actualizados).
- [ ] **[Happy path]** Seleccionar 'Sintético' en Superficie, 'Fútbol 7' en Formato, 'Estacionamiento' en Servicios, presionar 'Aplicar filtros': URL debe tener ?surfaces=synthetic_grass&formats=7&amenities=estacionamiento, grid recarga con subset de complejos.
- [ ] **[Happy path]** Marcar rango de precio 100-500 ARS (inputs mínimo y máximo), presionar 'Aplicar': URL contiene ?minPrice=10000&maxPrice=50000 (en centavos), resultados filtrados por rango.
- [ ] **[Happy path]** Cambiar ordenamiento a 'Precio más bajo' en select: URL = ?sort=price, complejos ordenados ascendente por fromPriceCents (NULL últimos).
- [ ] **[Happy path]** Cambiar ordenamiento a 'Mejor valorado': URL = ?sort=rating, complejos ordenados por avgRating DESC, reviewCount DESC (sin romper geolocalización).
- [ ] **[Happy path]** Presionar botón 'Mapa', vista cambia a map=true; mapa carga dinámicamente (ExplorarMapLoader → ExplorarMap), mostrando pins con precio/iniciales, opción clickeable para ver popup con nombre, dirección, rating.
- [ ] **[Happy path]** En vista map, seleccionar ordenamiento 'Más cercano': solicita geolocalización al navegador (tolerance 8s), pasa lat/lng a URL (?sort=distance&lat=..&lng=..), mapa re-centra y pins se re-ordenan por distancia.
- [ ] **[Happy path]** Paginación: si total > 12 en vista lista, aparece botón 'Ver más complejos' al pie; al clickear, carga página 2 (?offset=12), agrega 12 items más a la grilla (no reemplaza, no recarga la página).
- [ ] **[Happy path]** Marcar checkbox 'Solo con reserva online', presionar 'Aplicar': URL = ?online=1, solo complejos con allowOnlineBooking=true aparecen.
- [ ] **[Happy path]** Presionar botón favorito (corazón) en una tarjeta: sin estar logueado, redirige a /login?next=%2Fexplorar%3F... (encodeURIComponent de URL actual).
- [ ] **[Vacio]** Aplicar filtros que no devuelven resultados (ej: q=XYZABC, o precio min=100000): debe mostrarse icono SearchX, mensaje 'No encontramos complejos con esos filtros.', link 'Limpiar búsqueda' que navega a /explorar (sin params).
- [ ] **[Vacio]** Vista map con 0 complejos con coordenadas (todos tienen lat/lng=null): debe mostrar icono MapPin, mensaje 'Los complejos de esta búsqueda todavía no tienen ubicación cargada en el mapa.'
- [ ] **[Carga]** Mientras ExplorarMapLoader renderiza (ssr:false), debe mostrar skeleton pulse (h-[70vh], rounded-2xl, border, aria-busy=true, aria-label='Cargando mapa').
- [ ] **[Carga]** Presionar 'Ver más complejos' en lista: el botón debe mostrarse disabled o con spinner mientras se fecthea la siguiente página (16 items mínimo: 12 + nuevos).
- [ ] **[Carga]** Al cambiar dropdown de ordenamiento o cargar página con ?sort=distance, debe haber feedback visual (disabled select, skeleton de tarjetas, o spinner); no debe quedar congelado.
- [ ] **[Validacion]** En SearchBar, si escribis '  ' (solo espacios), presionar Buscar: debe ignorar y no agregar ?q= a la URL (trim() devuelve ''). Resultado: mismos complejos que sin parámetro q.
- [ ] **[Validacion]** En ExplorarFilters, campo minPrice: si escribis caracteres no numéricos (ej 'abc'), input rechaza (inputMode=numeric); si dejas vacío, se trata como undefined (no aplica filtro).
- [ ] **[Validacion]** En ExplorarFilters, si minPrice=500 y maxPrice=100 (mín > máx), presionar 'Aplicar': sin validación explícita, URL se arma con ambos, pero resultados pueden ser vacíos (rango inválido). Backend debería manejar o UI avisar.
- [ ] **[Validacion]** Campo de fecha (input type='date'): debe tener atributo min={today} (hoy UTC en ISO format); no permite seleccionar fechas pasadas ni hoy (depende de navegador).
- [ ] **[Validacion]** En SearchBar, ciudad: dropdown es select, no libre. Solo opciones de listPublicCities() son seleccionables; no hay way de escribir ciudad inexistente.
- [ ] **[Validacion]** En ExplorarFilters, precio: inputs type='number' con min=0. Si tries pegar numero negativo (copy-paste), navegador rechaza o muestra valor vacío.
- [ ] **[Validacion]** Checkboxes de Cerramiento, Superficie, Servicios, online: deben respetar required=false (todos opcionales). Si ninguno checkeado, URL sin params de filtro avanzado.
- [ ] **[Error 400]** Si URL contiene ?formats=99 (capacidad no válida), backend silenciosamente ignora (filter en DRIZZLE, no error 400). UI no tiene error handling visible.
- [ ] **[Error 400]** Si URL contiene ?minPrice=-1000 o ?maxPrice=abc, backend debería rechazar. Pero frontend no lo valida, URL se puede armar inválida si usuario tamperiza con herramientas dev.
- [ ] **[Error 500]** Si searchPublicTenants lanza (DB error, timeout), page.tsx no atrapa; error bubbles a error.tsx boundary. Usuario ve generic error page sin contexto (no es amigable a diferencia de vacio).
- [ ] **[Red/Timeout]** Presionar 'Más cercano' en ordenamiento sin que navegador pueda geolocalizar (user denies, no GPS): debe mostrar toast destructivo 'Activá la ubicación para ordenar por cercanía.', ordenamiento NO cambia, vuelve a 'Nombre (A-Z)'.
- [ ] **[Red/Timeout]** Geolocalización timeout (8s sin respuesta): mismo toast destructivo, ordenamiento no cambia.
- [ ] **[Red/Timeout]** FavoriteButton: si /api/player/favorites/toggle devuelve 500, toast 'No pudimos actualizar tus favoritos.', estado local se revierte a pre-toggle, botón puede ser presionado de nuevo.
- [ ] **[Red/Timeout]** Si network muere mientras está fetcheando la página 2 (Ver más), link debe quedar en estado hover/normal (no disabled), usuario puede re-intentar clickear.
- [ ] **[Sesion]** Presionar favorito en TenantCard sin estar logueado: redirige a /login?next=/explorar%3Fq%3D... (preserva query string actual). Si login exitoso, vuelve a /explorar con mismo estado de filtros.
- [ ] **[Sesion]** Si JWT de login caduca mientras estás viendo /explorar (aplicable en session refresh), y presionas favorito: debe devolver 401, redirigir a login. No debe mostrar error genérico.
- [ ] **[Doble submit]** Presionar 'Aplicar filtros' twice rapidly: debe evitarse doble aplicacion (router.push debe deduplicarse o botón disablado). URL solo cambia una vez.
- [ ] **[Doble submit]** Presionar botón Buscar en SearchBar dos veces: router.push(buildExplorarUrl(...)) ejecuta dos veces, pero como es misma URL, navegador/Next.js evita re-render (no visible).
- [ ] **[Doble submit]** Presionar favorito (corazón) dos veces rápido: FavoriteButton tiene pending flag, segundo click es ignorado (if (pending) return) hasta respuesta.
- [ ] **[Concurrencia]** Dos pestañas abiertas en /explorar?sort=price. En tab A, cambias a sort=rating. Tab B sigue viendo sort=price. Refreshear tab B: carga sort=price nuevamente (sin sincronización realtime de filtros entre tabs).
- [ ] **[Concurrencia]** Presionar favorito en tab A de una tarjeta: tab B no se entera (FavoriteButton no suscribe a cambios). Tarjeta en tab B sigue con corazón vacío hasta refresh.
- [ ] **[Responsive]** En móvil (375px width): SearchBar debe stack vertically (grid-cols-1), botón Buscar full-width (w-full en lg:col-span-1). ExplorarToolbar botones 'Filtros', select sort, toggle map/list deben caber sin overflow (probablemente en dos rows).
- [ ] **[Responsive]** En tablet (768px): Sidebar filters oculto (lg:hidden), drawer modal aparece. Grid de tarjetas pasar a grid-cols-2 (sm:). Botón 'Ver más' debe tener height consistente (h-11).
- [ ] **[Responsive]** En desktop (1280px): Sidebar visible (lg:block), grid grid-cols-3 (xl:), botones grandes. Mapa 70vh, lista apilada a lado del sidebar en grid 256px (sidebar) + minmax(0,1fr) (contenido).
- [ ] **[A11y]** SearchBar: cada input/select debe tener label vinculado via htmlFor (aria-label fallback). Search, Localidad, Fecha, Hora todos con labels (visible en mobile, probablemente hidden en desktop vía grid class).
- [ ] **[A11y]** Botón 'Buscar' en SearchBar: aria-label='Buscar' (text 'Buscar canchas' visible solo en mobile lg:hidden). En desktop, solo ícono Search visible (sr-only span dentro del botón).
- [ ] **[A11y]** ExplorarToolbar toggle lista/mapa: role='group' aria-label='Vista', buttons con aria-pressed={true|false} (toggles). Deben ser accesibles por teclado (Tab, Space/Enter).
- [ ] **[A11y]** Filtros checkboxes: todos con <label> wrapping input + text. Focus visible con focus-visible:ring. Orden de tabulación: Cerramiento → Superficie → Formato → Servicios → Precio → Online → Aplicar/Limpiar.
- [ ] **[A11y]** TenantCard: <Link> del título tiene ::after pseudoelemento para stretched-link. Pero HTML sigue siendo válido (FavoriteButton fuera del Link, en z-10). Keyboard nav: Tab en card debe alcanzar Link y FavoriteButton por separado.
- [ ] **[A11y]** RatingStars: role='img' + aria-label (descritivo: '4.5 de 5 estrellas, 23 reseñas'). Si no hay reseñas, label 'Sin reseñas' o similar (actualmente solo dice '0.0 de 5').
- [ ] **[A11y]** ExplorarMapLoader durante carga: aria-busy='true', aria-label='Cargando mapa'. Asistente de voz anuncia estado de loading.
- [ ] **[A11y]** Mensaje de vacío (No encontramos complejos...): texto descriptivo debe ser suficiente para screen reader. Link 'Limpiar búsqueda' debe tener href=/explorar (navegable por teclado).
- [ ] **[Persistencia]** Presionar favorito en tarjeta, esperar respuesta exitosa (/api/player/favorites/toggle 200 OK), presionar F5: Botón permanece con estado favorito (rojo/lleno) o se revierte a vacío? Si revierte, FavoriteButton tiene initialFavorited=false hardcoded en TenantCard (no integrado con backend state).
- [ ] **[Persistencia]** Aplicar filtros (?surfaces=synthetic_grass), presionar F5: URL se mantiene, SearchBar se reinicializa (params.get() → useState), ExplorarFilters reinicializa estado desde URL (useEffect), grid recarga con mismos filtros aplicados.
- [ ] **[Persistencia]** Cambiar ordenamiento a ?sort=price, presionar back button, luego forward button: URL vuelve a sort=price, grid debe mantener sort (no recarga a default name).
- [ ] **[Navegacion]** Presionar link 'Limpiar búsqueda' en estado vacío: navega a /explorar (sin params), debe mostrar grid completo de complejos default (sort=name, offset=0).
- [ ] **[Navegacion]** Presionar botón 'Volver' en navegador tras navegar de /explorar a /${slug} (profile de complejo): debe volver a /explorar?q=... (preserva URL con params si fue referrer).
- [ ] **[Navegacion]** En vista mapa, clickear un pin → popup → link dentro del popup (hacia /${slug}): navega a profile. Back button → /explorar?view=map (restaura mapa, no lista).
- [ ] **[Deep link]** Cargar /explorar?q=Cancha&city=CABA&sort=price&view=map&minPrice=5000&maxPrice=50000: todos los params se respetan, filtros ya aplicados, mapa visible, dropdown sort=price, input mín/max llenan con los pesos (5000/50000).
- [ ] **[Deep link]** Cargar /explorar?offset=999999: backend limita offset (Math.max, limit), devuelve 0 resultados pero sin error 404. UI muestra estado vacío. Debería haber validación o redirect a /explorar (page 1).
- [ ] **[Deep link]** Cargar /explorar?surfaces=INVALID&formats=abc: backend ignora claves inválidas (filter), resultados normales sin error. Sin feedback visual de params ignorados.
- [ ] **[Visual]** TenantCard con imagen: debe tener aspect-ratio 16/9 (aspect-[16/9]), imagen escala en hover (scale-105 group-hover, motion-reduce-safe), overlay gradient oscuro arriba abajo.
- [ ] **[Visual]** TenantCard sin imagen (coverUrl=null): fallback a gradient emerald-50 → slate-100 con iniciales del nombre (primeras 2 letras, UPPERCASE, bold, size-3xl, color emerald-600/40).
- [ ] **[Visual]** Badge 'Reserva online': positioned absolute left-3 top-3, inline-flex items-center gap-1, bg-emerald-600, px-2.5 py-1, text-xs font-semibold white, Zap icon h-3 w-3. Shadow-sm.
- [ ] **[Visual]** FavoriteButton (overlay): positioned absolute right-3 top-3 z-10, h-9 w-9 rounded-full bg-white/90 backdrop-blur, hover text-red-600, active:scale-90 (no scale si motion-reduce). Fill en corazón si fav=true.
- [ ] **[Visual]** Precio badge: positioned absolute bottom-3 left-3, inline-flex, bg-white px-2.5 py-1 text-sm font-bold slate-900. Mostrar 'Desde $X' (ej 'Desde $150' para 15000 centavos). Tabular-nums para alineación.
- [ ] **[Visual]** Rating badge: positioned absolute bottom-3 right-3, bg-white/95 px-2 py-1 rounded-full shadow-sm. RatingStars compact variant (star + number + count).
- [ ] **[Visual]** TenantCard group hover: border pasa slate-200 → emerald-400/60, shadow-sm → shadow-xl shadow-emerald-500/10, translate-y-1 → translate-y-0 (motion-reduce-safe), h3 text slate-900 → emerald-700 (text-emerald-700 group-hover).
- [ ] **[Visual]** SearchBar form: rounded-2xl border slate-200 bg-white p-3 sm:p-4 shadow-sm. Inputs fieldClass: h-12, border-slate-200, focus:ring-emerald-500. Botón bg-emerald-600 hover:emerald-700, active:scale-0.99 motion-reduce-safe.
- [ ] **[Visual]** ExplorarFilters: flex flex-col gap-6. Cada fieldset gap-2 (checkboxes). Precio inputs lado-a-lado (flex gap-2). Botones Aplicar (bg-emerald-600) + Limpiar (border slate-200 bg-white) separados por gap-2, pt-4 con border-t.
- [ ] **[Visual]** ExplorarToolbar: flex flex-wrap justify-between gap-3. Contador text-sm slate-500 (bold slate-900 número). Filtros button mobile, sort select, toggle group inline-flex rounded-lg border bg-white (active: bg-emerald-600 text-white). Botones h-9, text-sm font-medium.
- [ ] **[Visual]** Grid resultados: grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5. En mobile 1 columna, tablet 2, desktop 3. Cards all flex flex-col (stretch height).
- [ ] **[Visual]** Botón 'Ver más': inline-flex h-11 items-center px-6 text-sm font-semibold, border slate-200 bg-white text-slate-700 shadow-sm, hover:bg-slate-50. Centrado (flex justify-center wrapper).
- [ ] **[Visual]** Sidebar (desktop): position sticky top-20, rounded-2xl border slate-200 bg-white p-5 shadow-sm. Ancho 256px fijo, gap-6 entre secciones. Responsive max-width-7xl para el contenedor padre (mx-auto).
- [ ] **[Visual]** Drawer modal filtros (mobile): DialogContent (shadcn/ui), DialogTitle 'Filtros', contiene ExplorarFilters con onApplied={() => setOpen(false)} para cerrar tras aplicar.
- [ ] **[Edge]** Complejo con fromPriceCents=0: debe mostrar 'Desde $0' (formatArs(0) → 0 ARS). No omitir badge.
- [ ] **[Edge]** Complejo con nombre 1 letra (ej 'A'): fallback inicial muestra 'A' (slice(0,2).toUpperCase() = 'A'). OK.
- [ ] **[Edge]** Complejo con 300+ caracteres en nombre: truncate en TenantCard h3 (no especificado en código). En badge del mapa, formatea sin truncate (puede overflow popup).
- [ ] **[Edge]** Complejo sin amenities (amenities={} o null): activeAmenities devuelve []. TenantCard no renderiza <ul> (mt-auto pt-1). Valido, card más compacta.
- [ ] **[Edge]** Complejo sin courFormats/courtSurfaces (arrays vacíos): TenantCard no renderiza badges de formato/superficie. Valido.
- [ ] **[Edge]** Búsqueda con q='...' (dots/ellipsis): ilike en backend hace LIKE '%...%', valido. Si q='%' (wildcard manual), LIKE '%\%%' escapa? Probable INJECTION risk si backend no parametriza (pero usa ilike helper de Drizzle, debería ser safe).
- [ ] **[Edge]** Buscar con ciudad que tiene 0 resultados (válida pero sin complejos): dropdown permite seleccionar (porque listPublicCities la incluyó), pero resultados vacíos. OK (es válido flujo).
- [ ] **[Edge]** Cambiar ordenamiento a distance sin tener coords en navegador (no soportado o rechazado): toast 'Tu navegador no soporta geolocalización.' Si timeout, 'Activá la ubicación...'. Dos casos cubiertos.
- [ ] **[Edge]** Complejo con rating=5.0 reviewCount=1: RatingStars muestra '5.0 (1)' compact. Label a11y '5.0 de 5 estrellas, 1 reseña' (singular reseña no reseñas). OK.
- [ ] **[Edge]** Complejo con rating=2.3 (decimal): RatingStars redondea a 2.3 (Math.round(2.3*10)/10). Full variant pinta 2 estrellas completas + 0.3 de tercera (width 30%). OK.
- [ ] **[Edge]** Max 50 complejos en mapa view: si total=200, mapa muestra primeros 50 (limit=view==='map'?50:12). FitBounds ajusta zoom/pan para los 50, no aviso de 'viendo 50 de 200'.
- [ ] **[Edge]** Presionar 'Limpiar' en ExplorarFilters: URL se construye sin surfaces/formats/amenities/online/minPrice/maxPrice, pero PRESERVA q/city/date/time/sort/view/offset (solo limpia filtros avanzados, no SearchBar).
- [ ] **[Edge]** Precio muy alto (ej ?minPrice=999999999): convertido a number, backend compara con fromPriceCents (integer). Funciona si dentro de rango número válido (no overflow). Sin validación de límite superior.
- [ ] **[Edge]** Marcar checkbox 'Techado' en cerramiento: añade 'techado' a amenities CSV. Al aplicar, amenities en URL = 'techado,estacionamiento,...'. Al recargar, cerramiento está checkeado, no en la sección 'Servicios' (lógica separada, correcto).

> ⚠️ **Riesgo detectado en codigo:** RIESGOS Y BUGS POTENCIALES DETECTADOS:

1. **Validación de precio solo client-side**: ExplorarFilters convierte ARS a centavos sin validar si minPrice > maxPrice. Si un usuario pone min=1000 max=100, la UI lo permite pero el backend debería validar orden. No hay feedback visual de conflicto.

2. **Geolocalización sin timeout fallback**: En ExplorarToolbar.setSort('distance'), si el timeout de 8000ms se cumple, muestra toast destructivo pero no intenta ubicación aproximada o fallback a nombre.

3. **Estado de borrador en ExplorarFilters no persiste entre navegaciones**: Si aplicas filtros, vuelves atrás (back button), y vuelves a /explorar, el borrador se reinicializa desde URL (correcto), pero no hay skeleton/loading visual mientras se re-fecth.

4. **Map sin geocoding inverso**: Si un complejo no tiene latitude/longitude cargada, desaparece del mapa silenciosamente. En vista lista si que aparece. Inconsistencia.

5. **SearchBar campos no se vacian al cambiar ciudad**: Si escribis en Buscar, cambias ciudad y vuelves a la ciudad anterior, el texto sigue ahí. No hay "clear on city change".

6. **Offset inválido no protegido**: Si un usuario navega a ?offset=-1 o ?offset=999999, el backend Math.max/limit la manejará, pero la UI no valida ni muestra error.

7. **Paginación "Ver más" solo visible si view=list y hasMore=true**: Si cambias a map y vuelves a list, el estado no se sincroniza visualmente al instante (hay re-fetch pero delay perceptible).

8. **formatLabel(capacity) no maneja capacidades no soportadas**: Si courtFormats contiene 3, 4, o 6, devuelve "Fútbol 3" sin warning. Debería ser más defensivo.

9. **activeAmenities() devuelve array vacío si amenities es null/undefined, pero AMENITIES record puede tener claves inexistentes**: Si el backend manda amenity key no prevista, RatingStars/TenantCard intenta buscarla en AMENITIES y falla silenciosamente (sin error visual).

10. **Falta manejo de error en searchPublicTenants si la DB cae**: La page.tsx es async Server Component sin try/catch explícito. Si searchPublicTenants lanza, tira error boundary genérico sin contexto amigable.

11. **centsToPesos redondea direccion no especificada**: En ExplorarFilters línea 16, Math.round(n / 100) puede redondear 1.5 hacia arriba o abajo depende del motor (banker's rounding JS). No hay validación de que el redondeo es intencional.

12. **Toggle vista map/list sin preservar offset**: buildExplorarUrl({ ... }, { resetOffset: false }) preserva offset, pero si cambias a map (que ignora offset en el límite 50), y vuelves a list, no hay feedback visual de "estás en la misma búsqueda pero diferente página".

13. **Realtime de favoritos fuera de vista**: FavoriteButton hace fetch a /api/player/favorites/toggle, pero la UI de tarjeta (TenantCard) no suscribe a cambios en tiempo real. Si dos pestañas abiertas, una marcas favorito y la otra no se entera.

14. **RatingStars no maneja rating=0**: Si avgRating es 0 y reviewCount es 0, muestra "0.0 de 5 estrellas" sin aclaración "sin reseñas". Confuso.

15. **Ningún test visual del responsive**: La UI declara breakpoints (lg:grid, lg:hidden, sm:) pero no hay validación del comportamiento en móvil (ej: drawer vs sidebar de filtros, buttons a full-width, select options tiny).

---

### 28. Configuracion del jugador
**URL:** `/configuracion` · **Archivo:** `src/app/(player)/configuracion/page.tsx`

- [ ] **[Render]** Carga inicial de la página /configuracion sin errores: debe mostrar título 'Mi cuenta', saludo personalizado con firstName del jugador, dos cards (Tus datos personales y Eliminar mi cuenta) con iconos, descripciones y botones alineados, layout responsivo con max-w-lg centrado, sin elementos rotos ni console errors.
- [ ] **[Render]** La página tiene metadata noIndex: true (robots: 'noindex') y no aparece indexada en SEO; verificar header HTTP x-robots-tag y tags meta en HTML.
- [ ] **[Render]** Card 'Tus datos personales' contiene icono Download (lucide-react h-5 w-5), heading h2 'Tus datos personales' en font-semibold, párrafo descriptivo mencionando 'ARCO' y 'Ley 25.326', y botón DataExportButton dentro; border-slate-200, bg-white, shadow-sm, rounded-lg.
- [ ] **[Render]** Card 'Eliminar mi cuenta' tiene fondo rojo (bg-red-50, border-red-200), icono Trash2, heading rojo (text-red-900), texto rojo explicando anonimización irreversible y conservación de historial legal; botón Link rojo a /eliminar-cuenta visible.
- [ ] **[Render]** Header de la página contiene span 'TurnoGol' (font-semibold text-base), sticky top-0 z-10, fondo slate-900, con botón 'Salir' (signOutAction) alineado a la derecha.
- [ ] **[Render]** En mobile (<640px): layout ocupa 100% del ancho con px-4, cards no tienen overflow, botones full-width (w-full h-11), textos legibles (text-sm, text-base), sin horizontal scroll.
- [ ] **[Render]** En tablet (640-1024px): cards mantienen layout single-column, max-w-lg centra contenido, paddings proporcionales, navegación bottom nav visible.
- [ ] **[Render]** En desktop (>1024px): max-w-lg centra la página, márgenes laterales balanceados, espaciado vertical consistente (space-y-6, space-y-3), sin compresión visual.
- [ ] **[Happy path - DataExportButton]** Usuario autenticado como jugador hace clic en 'Descargar mis datos': debe cambiar a 'Generando...', deshabilitarse (disabled:opacity-60), fetchar GET /api/player/data-export con credentials: include, recibir JSON con exportación completa (profile, bookings, payments, tenant_relationships, bans, consents), descargar archivo JSON con nombre 'turnogol-mis-datos-YYYY-MM-DD.json', volver a 'Descargar mis datos' sin error visible.
- [ ] **[Happy path - Eliminar cuenta]** Usuario hace clic en 'Iniciar eliminación' → Link dirige a /eliminar-cuenta sin errores de navegación; página destino carga exitosamente con ConfirmDialog preconfigurado (título, descripción, email de confirmación, botones Eliminar/No volver).
- [ ] **[Render - Skeleton]** Durante carga inicial de /configuracion (antes de que se resuelva extractAuthUser + query de players): loading.tsx muestra Skeleton h-7 w-32, h-4 w-48, dos h-32 w-full, layout idéntico al final, sin parpadeo ni FOUC.
- [ ] **[Render - Dark mode]** Página soporta dark mode vía Tailwind (bg-white, text-slate-900 convierten a valores oscuros); botones mantienen contraste accesible (>= WCAG AA 4.5:1).
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos:
- [ ] **[Validacion - Player borrado]** withPlayerContext retorna rows vacío (player no existe): page.tsx retorna redirect('/login').
- [ ] **[DataExportButton - Carga]** Durante fetch a /api/player/data-export: botón muestra 'Generando...' con opacity-60 y disabled=true; múltiples clics no generan múltiples fetches (handlers pueden ser llamados pero respuesta anterior espera).
- [ ] **[DataExportButton - Error 401]** Fetch a /api/player/data-export retorna 401 (no autenticado / JWT expirado): DataExportButton recibe res.ok=false, setStatus('error'), muestra mensaje 'No se pudo generar la exportación. Intentá de nuevo en unos minutos.' en párrafo role='alert' (accesible).
- [ ] **[DataExportButton - Error 403]** Fetch retorna 403 (JWT válido pero permiso denegado por withPlayer middleware): res.ok=false, mismo comportamiento que 401 (mensaje genérico de error).
- [ ] **[DataExportButton - Error 404]** Fetch retorna 404 (endpoint no existe / player borrado): res.ok=false, muestra error genérico sin exponer URL interna.
- [ ] **[DataExportButton - Error 500]** Fetch retorna 500 (servidor falla): res.ok=false, error genérico; Sentry captura excepción del lado servidor.
- [ ] **[DataExportButton - Error network]** Fetch lanza exception (net::ERR_FAILED, timeout CORS, net::ERR_CONNECTION_REFUSED): catch bloque atrapa, setStatus('error'), muestra mensaje de error; usuario puede reintentar.
- [ ] **[DataExportButton - JSON parsing]** Fetch retorna 200 pero response.json() falla (malformed JSON): catch bloque atrapa el parsing error, muestra error genérico; no crashea UI.
- [ ] **[DataExportButton - Missing data field]** Fetch retorna 200 con JSON pero falta campo 'data' (respuesta malformada): `const data = (await res.json()) as { data: unknown }` tipifica pero bundle = data.data sería undefined; createObjectURL y download fallan; usuario ve error.
- [ ] **[DataExportButton - File download]** Tras generar bundle JSON: createObjectURL(blob) genera data: URL, anchor element creado, appendChild, click(), removeChild, revokeObjectURL limpian memoria; archivo descarga sin fugas de memoria en múltiples descargas.
- [ ] **[DataExportButton - Timestamp local]** Nombre de archivo usa toLocaleDateString con timeZone 'America/Argentina/Buenos_Aires': verifica que fecha en filename es ART (UTC-3), no UTC; ej. si en servidor es 2026-06-08 23:59 UTC, debe ser 2026-06-08 en filename (mismo día en ART).
- [ ] **[DataExportButton - Data bundle contents]** JSON descargado contiene todas las secciones según spec: exported_at (ISO), retention_policy, profile (id, email, first_name, last_name, phone, preferred_area, status, avatar_url, agreed_to_terms_at, terms_version, created_at, last_login_at), consents, bookings (últimos 12 meses), payments (últimos 5 años), tenant_relationships, bans; sin campos internos del servidor.
- [ ] **[DataExportButton - Bookings export]** Bookings en export incluyen: id, tenant_id, court_id, date, time_start, time_end, type, status, price_snapshot, deposit_amount, deposit_status, created_at, updated_at, canceled_at, canceled_reason; status ENUM usa cancelado con UNA L (canceled_refunded, canceled_no_refund, no canceled con doble L).
- [ ] **[DataExportButton - Payments export]** Payments incluyen: id, tenant_id, booking_id, amount, currency, type, method, status, mp_payment_id, processed_at, created_at; status es enum correcto (pendiente, completado, cancelado con una L).
- [ ] **[DataExportButton - Permissions cross-tenant]** Jugador exporta datos de N complejos (player_id sin tenant_id en JWT): export retorna tenants_relationships para todos; RLS bypassea via getSql() (service-role) pero FILTRADO solo por player_id; sin fugas de otros jugadores.
- [ ] **[DataExportButton - ARCO compliance]** API endpoint está documentado para ARCO Art. 14 (right of access): export sin requisito de confirmación por email (inline), retorna JSON listo para descargar; página /configuracion accessible via /configuracion directo sin wizard.
- [ ] **[Eliminar cuenta - Link**] Botón 'Iniciar eliminación' es Link (not button) a href='/eliminar-cuenta' con clases inline-flex, h-11, border-red-300, bg-white, text-red-700, hover:bg-red-50, active:scale-[0.98]; navegación funciona sin JavaScript.
- [ ] **[Accesibilidad - Labels]** Botón DataExportButton es <button type='button' onClick={handleDownload}> con texto 'Descargar mis datos' (label implícito), accesible por pantalla de lectores.
- [ ] **[Accesibilidad - Alertas]** Error en DataExportButton renderiza <p role='alert'> con aria semántica; screen reader anuncia el mensaje de error al aparecer.
- [ ] **[Accesibilidad - Colores]** Contraste texto rojo en red-50 (text-red-700 sobre bg-red-50): verificar ratio >= WCAG AA 4.5:1; texto blanco en botón emerald-600 (text-white): verificar ratio >= WCAG AAA 7:1.
- [ ] **[Accesibilidad - Teclado]** Navegación sin mouse: Tab recorre botón 'Descargar', Link 'Iniciar eliminación', botón 'Salir' en orden lógico; Enter activa botones; Space no requiere (buttons usan onClick, no pattern mousedown).
- [ ] **[Accesibilidad - Focus visual]** Botones tienen hover:bg-* y active:scale-[0.98] para feedback visual; focus state (outline-blue-500 via Tailwind defaults o custom) visible en dark mode y light mode.
- [ ] **[Accesibilidad - Orden de tabulación]** Header (Salir) > Main > h1 'Mi cuenta' > Card 1 heading > botón Descargar > Card 2 heading > Link Iniciar eliminación; sin z-index traps, accesible arriba/abajo.
- [ ] **[Accesibilidad - Semántica HTML]** Página usa <h1>, <h2> para encabezados, <p> para párrafos, <button>, <Link>, no divs como buttons; estructura jerárquica correcta h1 > h2s.
- [ ] **[Persistencia - Refresh]** Usuario en /configuracion recarga F5: extractAuthUser + query DB redibujan página idéntica, firstName del jugador se actualiza si cambió en BD, sin pérdida de estado (state React local es component-level).
- [ ] **[Persistencia - Volver atrás]** Usuario navega a /configuracion, luego a /disponibilidad, presiona atrás: regresa a /configuracion, página renderiza normalmente sin cached stale data.
- [ ] **[Deep link - URL**] Usuario abre directamente /configuracion en pestaña nueva (sin history): page.tsx ejecuta extractAuthUser + query, renderiza; sin errores si autenticado y player existe.
- [ ] **[Deep link - URL inválida]** Usuario accede a /configuracion-typo o /configuracion/123: Next.js retorna 404; no aparece página de jugador.
- [ ] **[Doble submit - DataExport]** Usuario hace clic 'Descargar mis datos' 2 veces rápido: primer fetch en progreso, botón disabled, segundo onclick ignorado (disabled=true previene dispatch); sin duplicadas exportaciones.
- [ ] **[Doble submit - Link]** Usuario hace clic 'Iniciar eliminación' 2 veces rápido: Link navega a /eliminar-cuenta, router pushea una sola vez (Next.js Link maneja), sin doble navegación.
- [ ] **[Error - Player anonymized]** Player ya tiene status='anonymized' (eliminado antes): withPlayerContext aún retorna row, pero page renderiza nombres como '[eliminado]' o vacío si anonymizePlayer ya corrió; usuario puede ver página sin error 500.
- [ ] **[Error - Concurrent anonymize]** Dos pestañas del mismo jugador abren /eliminar-cuenta, ambas hacen submit concurrentemente: primer requestDeleteAccountAction() correo anonymizePlayer(playerId), segundo también llama pero PlayerAlreadyAnonymizedError es caught y retorna success=true (idempotent); ambas se redirigen a /login?deleted=1.
- [ ] **[Timeout - Fetch data-export]** Fetch a /api/player/data-export tarda >30s (servidor slow): browser timeout capturado como error en catch, muestra error genérico; no cuelga UI.
- [ ] **[Reconexión - Offline]** Usuario en /configuracion, desconecta red, intenta descargar: fetch lanza error (no connection), catch muestra error; usuario reconecta, reintenta, funciona.
- [ ] **[Visual - Card spacing]** Ambas cards tienen padding p-4, border rounded-lg, espaciado interno space-y-3; verificar consistencia visual (no asimetrías, alineación icon+heading aligned top).
- [ ] **[Visual - Icon sizing]** Download e iconos h-5 w-5, color slate-600 en card normal, red-600 en card rojo; alignment con heading via flex gap-2 items-center, no desajustes verticales.
- [ ] **[Visual - Button states]** Botón 'Descargar mis datos' en emerald-600 (hover:emerald-500, disabled:opacity-60), Link en red-700 (hover:bg-red-50, active:scale-[0.98]); estados visuales claros sin ambigüedad.
- [ ] **[Visual - Text overflow]** firstName muy largo (>100 caracteres): 'Hola {firstName}' trunca o wraps correctamente; test con firstName='A'.repeat(200).
- [ ] **[Visual - Descripciones]** Párrafos descriptivos usan text-sm text-slate-600 o text-red-800 (suficiente contraste); sin ilegibilidad, line-height normal.
- [ ] **[A11y - Links color]** Link 'Iniciar eliminación' (text-red-700) diferenciable de texto no-link (text-red-800) en red-50; verificar que es claramente un botón, no solo texto.
- [ ] **[Edge - Empty firstName]** Jugador tiene firstName='' (vacío): '{ firstName }' renderiza 'Hola , gestioná tus datos'; no crashea pero es poco amistoso (debería validarse en signup).
- [ ] **[Edge - Special characters]** firstName='José María'; page.tsx destructura {firstName} = player, renderiza correctamente sin XSS; verificar encoding UTF-8.
- [ ] **[Edge - Very long email]** confirmEmail para eliminar-cuenta es email muy largo (300+ caracteres): Link a /eliminar-cuenta navega, DeleteAccountForm recibe prop, ConfirmDialog mostrar email completo sin truncamiento o en field de entrada.
- [ ] **[Performance - Lighthouse]** CLS <= 0.1 (sin layout shift al cargar DataExportButton), LCP <= 2.5s (titulo 'Mi cuenta' visible rápido), FID <= 100ms (botón responde rápido); verificar via lighthouse audit.
- [ ] **[Performance - Bundle]** Código de /configuracion no incluye dependencias pesadas (lucide-react icons son tree-shaken); tamaño JS < 50KB después de bundle + minify.
- [ ] **[Metadata - Title]** buildMetadata retorna title='Mi cuenta', description contiene 'Configuración' + 'datos personales' + 'Ley 25.326'; aparecen en <head> de HTML.
- [ ] **[Metadata - noIndex]** buildMetadata(... noIndex: true) genera robots: 'noindex' en meta tags; página no indexada en Google Search Console y bots respetan directiva.

> ⚠️ **Riesgo detectado en codigo:** **Riesgos detectados:** 1) En DataExportButton, si el servidor retorna 200 pero el JSON está malformado o falta el campo 'data', la línea `const bundle = data.data` será undefined y createObjectURL fallará silenciosamente en el catch (error genérico); sin validación de schema en cliente. 2) El endpoint /api/player/data-export no logea acceso en audit_logs (comentado en doc18) por que es cross-tenant; sin trazabilidad de descargas ARCO. 3) Timestamp en nombre de archivo usa 'en-CA' locale pero timezone 'America/Argentina/Buenos_Aires'; el formato es correcto pero si el servidor UTC y el cliente están desajustados en hora, la fecha en filename podría ser del día anterior/siguiente. 4) DataExportButton no muestra loading skeleton mientras está buscando; solo cambia texto a "Generando..." (es tolerable pero menos UX). 5) Si player.firstName es null o vacío, el saludo 'Hola {firstName}' renderiza mal ("Hola , ..."); sin validación en schema (firstName es text notNull pero podría insertarse vacío vía migration). 6) No hay confirmación de email para descargar datos ARCO (inline download); algunos reguladores pueden requerir 2FA o reconfirmación.

---

### 29. Eliminar cuenta (jugador)
**URL:** `/eliminar-cuenta` · **Archivo:** `src/app/(player)/eliminar-cuenta/page.tsx`

- [ ] **[Render]** Cargar /eliminar-cuenta como jugador autenticado: se muestra h1 'Eliminar mi cuenta', tarjeta roja de advertencia, tarjeta de info sobre qué se anonimiza/conserva, link a /configuracion, botón rojo 'Eliminar mi cuenta' con fondo bg-red-600.
- [ ] **[Render]** El email confirmEmail renderizado en el label del ConfirmDialog debe ser exactamente el del jugador logueado (no truncado, no modificado).
- [ ] **[Render]** La tarjeta de advertencia debe mostrar AlertTriangle icon (rojo), texto bold 'Esta acción es irreversible', descripción sobre Ley 25.326.
- [ ] **[Render]** La tarjeta de info debe listar en dos secciones: Se anonimiza (Nombre, Email, Teléfono, Vinculaciones) y Se conserva (Historial, Pagos 5 años, Logs auditoría).
- [ ] **[Render]** El link 'descargar tus datos' en la tarjeta ámbar debe apuntar a /configuracion y ser underlineado.
- [ ] **[Render]** Skeletons en loading.tsx deben mostrar estructura: h7 (título), 3 cards, 1 botón (durante server component fetch).
- [ ] **[Render]** Viewport responsive: en mobile (375px) las cards y botón deben ocupar ancho 100% con px-4 padding, no overflow.
- [ ] **[Happy path]** Jugador autenticado hace click en 'Eliminar mi cuenta': se abre ConfirmDialog con title '¿Eliminar tu cuenta TurnoGol?', description con texto y link, input type-to-confirm.
- [ ] **[Happy path]** En el dialog, escribir el email exacto (case-sensitive, sin espacios extra) en el input: el botón 'Eliminar mi cuenta' pasa de disabled a enabled.
- [ ] **[Happy path]** Hacer click en botón 'Eliminar mi cuenta' (destructive rojo) del dialog: se ejecuta requestDeleteAccountAction(), muestra 'Procesando…' en botón.
- [ ] **[Happy path]** Tras anonimización exitosa: dialog cierra, player es redirigido a /login?deleted=1 automáticamente (router.push), sesión termina (signOut en Supabase excepto E2E).
- [ ] **[Happy path]** Visitar /login?deleted=1: se muestra mensaje de despedida ('Tu cuenta fue eliminada exitosamente') o similar con opción de crear nueva cuenta.
- [ ] **[Validacion]** Input type-to-confirm: si email tiene espacios al inicio/final, no debe ser considerado válido (usar trim()).
- [ ] **[Validacion]** Input type-to-confirm: case-sensitive — escribir 'Juan@EXAMPLE.COM' si el email es 'juan@example.com' NO debe habilitar botón.
- [ ] **[Validacion]** Input type-to-confirm vacío: botón 'Eliminar mi cuenta' permanece disabled.
- [ ] **[Validacion]** Input type-to-confirm con email parcial (ej 'juan@' si email es 'juan@example.com'): botón permanece disabled.
- [ ] **[Validacion]** Input type-to-confirm: copiar-pegar el email exacto debe habilitar el botón instantáneamente.
- [ ] **[Validacion]** Input type-to-confirm: borrar 1 carácter del email correcto debe deshabilitar el botón.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones).
- [ ] **[Error 409]** Anonimizar jugador que ya está anonymized (ej 2 tabs simultáneos): requestDeleteAccountAction devuelve { success: false, error: '...' }, dialog muestra error en p[role=alert], botón se habilita de nuevo.
- [ ] **[Error 400]** Si anonymizePlayer falla por validación DB (constraint, type mismatch): throw err sin catch → 500 server error, jugador redirigido a error boundary.
- [ ] **[Error 500]** Si Supabase signOut falla (network): error no es capturado (opcional en E2E por design), pero player fue anonimizado. Jugador sigue siendo redirigido a /login?deleted=1.
- [ ] **[Red/Timeout]** Network timeout durante requestDeleteAccountAction (> 30s): el request puede reintentar o fallar; si falla, dialog muestra error y permite reintentar.
- [ ] **[Doble submit]** Hacer click 2 veces rápidamente en 'Eliminar mi cuenta' cuando está habilitado: solo 1 request se envía (isPending en useTransition previene doble).
- [ ] **[Doble submit]** Mientras se procesa (isPending=true), hacer click en 'No, volver': button está disabled, click no funciona (handleOpenChange retorna early).
- [ ] **[Doble submit]** Mientras se procesa, escribir más en el input: onChange no actualiza estado (input sigue readonly? NO: input es editable siempre, pero onConfirm previene doble submit).
- [ ] **[Persistencia]** Refrescar página durante ConfirmDialog abierto: el dialog cierra y se recarga la página (state se pierde, es esperado).
- [ ] **[Persistencia]** Refrescar página después de escribir el email en type-to-confirm (antes de submit): página recarga, estado se pierde, input vacío nuevamente.
- [ ] **[Navegacion]** Abrir ConfirmDialog, hacer click 'No, volver': dialog cierra, input se limpia (setTyped('')), error se limpia.
- [ ] **[Navegacion]** Abrir ConfirmDialog, presionar Escape: dialog cierra (si isPending=false), input se limpia.
- [ ] **[Navegacion]** Abrir ConfirmDialog, hacer click fuera del modal (backdrop): dialog cierra (si isPending=false).
- [ ] **[Navegacion]** Navegar a otra página (/mis-reservas) mientras ConfirmDialog está abierto: dialog cierra, user navega.
- [ ] **[Deep link]** URL /eliminar-cuenta?deleted=1 acceso directo: página carga normalmente (query param se ignora, es solo para /login).
- [ ] **[Visual]** Botón 'Eliminar mi cuenta' (DeleteAccountForm): bg-red-600, hover:bg-red-700, text-white, active:scale-[0.98], h-11, w-full, rounded-lg, text-sm font-semibold.
- [ ] **[Visual]** ConfirmDialog botón confirm (destructive): bg-red-600 hover:bg-red-700 (no emerald como default), disabled:opacity-50.
- [ ] **[Visual]** ConfirmDialog botón cancel: bg-white border-slate-200, hover:bg-slate-50, disabled:opacity-60.
- [ ] **[Visual]** Input type-to-confirm en dialog: border-slate-200, focus:border-emerald-600, ring-emerald-500 (a pesar de ser destructive dialog).
- [ ] **[Visual]** Error text en dialog: text-red-600, text-xs, con role='alert' para a11y.
- [ ] **[Visual]** Layout max-w-lg mx-auto px-4 py-5 space-y-5: cards y botón centrados, ancho máximo 32rem.
- [ ] **[A11y]** Input type-to-confirm debe tener label asociado htmlFor='confirm-phrase', label en gris oscuro.
- [ ] **[A11y]** Botones en dialog deben ser accesibles vía teclado (Tab order: cancel primero, confirm segundo).
- [ ] **[A11y]** Error en dialog debe tener role='alert' para screen readers (ya implementado).
- [ ] **[A11y]** Dialog title (DialogTitle) debe ser h1 o h2 semánticamente (verificar estructura).
- [ ] **[A11y]** Contraste: texto rojo sobre fondo rojo en warning card debe cumplir WCAG AA (rojo-700 sobre rojo-50 es suficiente).
- [ ] **[A11y]** Focus ring: todos los botones e inputs deben tener focus-visible ring-2 ring-emerald-500.
- [ ] **[Sesion]** Sesión expirada mientras está en /eliminar-cuenta: extractAuthUser devuelve null → redirect a /login.
- [ ] **[Sesion]** JWT refresh fail durante requestDeleteAccountAction: Supabase signOut falla (error capturado? NO), pero error no rompre flow; player fue anonimizado en DB.
- [ ] **[Edge]** Jugador con email ultralargo (255+ chars): input type-to-confirm debe aceptar y validar correctamente.
- [ ] **[Edge]** Email con caracteres especiales (ñ, acentos): type-to-confirm debe validar case-sensitive exactamente.
- [ ] **[Edge]** Jugador con reservas futuras confirmed: anonimización NO bloquea (según código, es permitido). Booking preserva historia pero player_id → NULL.
- [ ] **[Edge]** Jugador con saldo deudor (balance > 0 en player_tenant_relationships): anonimización permite (sin restricción). Datos financieros se conservan.
- [ ] **[Edge]** Jugador con ban activo (tenant_player_bans): anonimización borra el ban_reason, ban_until.
- [ ] **[Edge]** Jugador inactivo 12+ meses: puede eliminar cuenta (no hay restricción temporal).
- [ ] **[SEO]** Metadata debe incluir noIndex: true → robots index:false follow:false en header.
- [ ] **[SEO]** Canonical URL debe ser absoluteUrl('/eliminar-cuenta') con site URL correcto.

> ⚠️ **Riesgo detectado en codigo:** Riesgos/hallazgos: (1) NO hay validación en el frontend para reservas futuras confirmed — el código permite anonimizar aunque jugador tenga reservas activas; es potencialmente un UX issue (perderían acceso). (2) El ConfirmDialog usa trim() para validar phrase pero es correcto; verificar que el email del jugador no tenga espacios al guardarse en DB. (3) signOut se salta en E2E (NEXT_PUBLIC_E2E=1) — el test debe considerar que sesión persiste falsamente en E2E. (4) requestDeleteAccountAction devuelve early para PlayerAlreadyAnonymizedError sin error message al usuario — es idempotent pero silencioso; podría mejorar UX. (5) Dialog error display es p[role=alert] genérico — si error es undefined, muestra 'No se pudo completar la acción.' (fallback adecuado). (6) No hay confirmación visual post-redirect a /login?deleted=1 — depende de la page /login para mostrar mensaje.

---

### 30. Home landing publica
**URL:** `/` · **Archivo:** `src/app/page.tsx`

- [ ] **[Render]** Cargar la URL / sin autenticación: debe mostrarse el hero con fondo imagen, buscador, ciudades populares, y nav overlay con links 'Explorar', 'Para complejos', 'Iniciar sesión' y botón 'Comenzar'.
- [ ] **[Render]** Verificar que el título H1 contiene el texto 'Encontrá tu cancha y reservá en segundos' con gradiente verde en la parte 'reservá en segundos'.
- [ ] **[Render]** Verificar que el subtítulo en hero dice 'Buscá complejos de fútbol cerca tuyo, mirá la disponibilidad en tiempo real y asegurá tu turno online. Sin llamados, sin esperas.'
- [ ] **[Render]** Inspeccionar el metadata <title> en el DOM: debe ser exactamente 'TurnoGol — Encontrá y reservá tu cancha de fútbol'.
- [ ] **[Render]** Inspeccionar el metadata <meta name='description'> en el DOM: debe contener 'Buscá complejos de fútbol cerca tuyo, mirá disponibilidad en tiempo real y reservá tu cancha online en segundos. Sin llamados, sin esperas.'
- [ ] **[Render]** Verificar que el componente SiteNav usa variant='overlay' (posicion absoluta, no sticky, para lucir sobre el hero background).
- [ ] **[Render]** Verificar que la sección HowItWorks tiene 3 steps con números '01', '02', '03' y títulos 'Buscá tu cancha', 'Elegí tu horario', 'Reservá y jugá'.
- [ ] **[Render]** Verificar que StatsBar renderiza 4 celdas con valores '+10.000', '50+', '95%', '<2 min' y sus labels correspondientes.
- [ ] **[Render]** Verificar que OwnerBanner muestra el ícono de Building2, título '¿Tenés un complejo de fútbol?' y botón 'Conocé más' que enlaza a /para-complejos.
- [ ] **[Render]** Verificar que SiteFooter contiene links a 'Explorar', 'Iniciar sesión', 'Contacto' (mailto), 'Privacidad', 'Términos' y el año actual.
- [ ] **[Happy path]** Ingresar 'Buenos Aires' en el selector de Localidad, dejar Fecha en hoy, dejar Hora en 'Cualquiera', presionar 'Buscar canchas': debe redirigir a /explorar?city=Buenos+Aires.
- [ ] **[Happy path]** Ingresar 'Córdoba' en Localidad, seleccionar una fecha futura (ej. +3 días), seleccionar '14:00' en Hora, presionar 'Buscar': debe redirigir a /explorar?city=Córdoba&date=YYYY-MM-DD&time=14%3A00.
- [ ] **[Happy path]** Dejar todos los campos en su default (Localidad='Todas las ciudades', Fecha=hoy, Hora='Cualquiera') y presionar 'Buscar': debe redirigir a /explorar sin parámetros de query.
- [ ] **[Happy path]** Hacer clic en 'Buenos Aires' en las ciudades populares (bajo el buscador): debe navegar a /explorar?city=Buenos+Aires.
- [ ] **[Happy path]** Hacer clic en 'Ver todos' en la sección FeaturedComplexes: debe navegar a /explorar.
- [ ] **[Happy path]** Hacer clic en una tarjeta de complejo destacado (FeaturedComplexCard): debe navegar a /{tenant.slug} (ej. /complejo-deportivo-central).
- [ ] **[Happy path]** Hacer clic en una tarjeta de partido abierto (OpenMatchCard): debe navegar a /{match.tenant.slug}.
- [ ] **[Happy path]** Hacer clic en 'Conocé más' del OwnerBanner: debe navegar a /para-complejos.
- [ ] **[Validacion]** Dejar en blanco el selector de Localidad, seleccionar fecha futura, seleccionar hora, presionar 'Buscar': debe enviar sin parámetro city (query string vacío para esa clave).
- [ ] **[Validacion]** Seleccionar una fecha anterior a hoy en el input date: el input debe rechazarla (atributo min={today} previene submission).
- [ ] **[Validacion]** Intentar escribir en el input date manualmente caracteres inválidos: el input type='date' valida formato automáticamente.
- [ ] **[Validacion]** Seleccionar una hora (ej. 18:00), luego cambiar a 'Cualquiera' y presionar Buscar: debe omitir el parámetro time de la query.
- [ ] **[Vacio]** Si la DB devuelve cities=[]: el selector de Localidad debe mostrar solo 'Todas las ciudades' como opción y estar funcional.
- [ ] **[Vacio]** Si loadFeatured() devuelve []: la sección FeaturedComplexes no debe renderizarse (condición {featured.length > 0 &&}).
- [ ] **[Vacio]** Si loadOpenMatches() devuelve []: la sección OpenMatchesShowcase no debe renderizarse (condición {openMatches.length > 0 &&}).
- [ ] **[Vacio]** Cuando ambas loadFeatured() y loadOpenMatches() devuelven []: solo HowItWorks, StatsBar, OwnerBanner y Footer deben ser visibles.
- [ ] **[Carga]** Verificar que Reveal component aplica transición fade-up con delay (60ms * índice) a las tarjetas de featured complexes (escalonado).
- [ ] **[Carga]** Verificar que el atributo revalidate=300 en la página genera ISR con revalidación cada 5 min (no force-dynamic, mejor LCP).
- [ ] **[Carga]** Durante la carga inicial (antes de que Promise.all resuelva), la página debe renderizar sin esperar a loadCities/loadFeatured/loadOpenMatches (server-side pre-rendering).
- [ ] **[Carga]** Si loadFeatured tarda >5 seg, loadCities() o loadOpenMatches() devuelven [] en el intervalo: la página debe seguir renderizándose con esas secciones vacías (resiliente).
- [ ] **[Error 500]** Si loadCities() lanza una excepción: catch {} devuelve [] y el selector Localidad muestra solo 'Todas las ciudades' (sin romper el render).
- [ ] **[Error 500]** Si loadFeatured() lanza una excepción: catch {} devuelve [] y la sección FeaturedComplexes no se renderiza (sin romper la landing).
- [ ] **[Error 500]** Si loadOpenMatches() lanza una excepción: catch {} devuelve [] y la sección OpenMatchesShowcase no se renderiza (sin romper la landing).
- [ ] **[Error 500]** Si todas tres funciones lanzan excepciones simultáneamente: la landing sigue renderizándose con Hero, HowItWorks, StatsBar, OwnerBanner y Footer (máxima resiliencia).
- [ ] **[Responsive]** En mobile (320px): verificar que el hero text (H1) reduce tamaño de text-7xl a text-4xl, padding pt-32 a pt-32 y el buscador es grid-cols-1 (stacked).
- [ ] **[Responsive]** En mobile: el selector de Localidad (lg:col-span-4) debe ocupar el ancho completo, Fecha (lg:col-span-3) ocupa ancho completo, Hora (lg:col-span-2) ocupa ancho completo, Buscar (lg:col-span-3) ocupa ancho completo.
- [ ] **[Responsive]** En tablet (640px): el buscador debe pasar a grid-cols-2 (sm:grid-cols-2), con Localidad en su propio row y Fecha+Hora+Buscar en el siguiente.
- [ ] **[Responsive]** En desktop (1024px): el buscador debe usar grid-cols-12 lg:grid-cols-12 con Localidad=4 col, Fecha=3 col, Hora=2 col, Buscar=3 col (alineados en una fila).
- [ ] **[Responsive]** En mobile: FeaturedComplexes grid debe ser grid-cols-1 (1 tarjeta por fila), en tablet sm:grid-cols-2 (2 por fila), en desktop lg:grid-cols-3 (3 por fila).
- [ ] **[Responsive]** En mobile: HowItWorks grid debe ser grid-cols-1 (pasos stacked), en desktop sm:grid-cols-3 (alineados).
- [ ] **[Responsive]** En mobile: StatsBar grid debe ser grid-cols-2 (2 stats por fila), en desktop sm:grid-cols-4 (4 en una fila).
- [ ] **[Responsive]** En mobile: OwnerBanner flex debe ser flex-col (content stacked), en desktop sm:flex-row (content y botón lado a lado).
- [ ] **[Responsive]** En mobile: SiteNav nav links ('Explorar', 'Para complejos') deben estar hidden (md:flex), solo visible en desktop medio+.
- [ ] **[Responsive]** Verificar que todas las imágenes de featured complexes usan sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw' para responsive srcset.
- [ ] **[A11y]** El form del HeroSearch tiene aria-label='Buscar canchas de fútbol'.
- [ ] **[A11y]** El input de Localidad tiene label asociada con htmlFor='hero-city', texto visible 'Localidad'.
- [ ] **[A11y]** El input de Fecha tiene label asociada con htmlFor='hero-date', texto visible 'Fecha'.
- [ ] **[A11y]** El input de Hora tiene label asociada con htmlFor='hero-time', texto visible 'Hora'.
- [ ] **[A11y]** El botón 'Buscar canchas' es un <button type='submit'>, accesible por teclado (Tab) y Enter.
- [ ] **[A11y]** Los íconos decorativos (MapPin, CalendarDays, Clock, Search, etc.) tienen aria-hidden=true (no anunciados por screen readers).
- [ ] **[A11y]** El componente RatingStars en tarjetas tiene role='img' y aria-label='X.X de 5 estrellas, N reseñas'.
- [ ] **[A11y]** Los componentes Reveal respetan prefers-reduced-motion: reduce (aplica transition-none y muestra contenido al instante, sin fade-up).
- [ ] **[A11y]** El texto del hero H1 que dice 'Encontrá tu cancha y reservá en segundos' tiene buen contraste (white text en dark overlay gradient).
- [ ] **[A11y]** El selector de ciudades populares es navegable por teclado (links dentro de <Link> tags).
- [ ] **[Persistencia]** Recargar la página (F5) después de completar el buscador: el estado del formulario (city, date, time) se resetea a defaults (sin persistencia en localStorage).
- [ ] **[Navegacion]** Hacer clic en el logo 'TG TurnoGol' en la nav: debe redirigir a / (home).
- [ ] **[Navegacion]** Hacer clic en 'Explorar' en la nav: debe redirigir a /explorar.
- [ ] **[Navegacion]** Hacer clic en 'Para complejos' en la nav (desktop, md:inline): debe redirigir a /para-complejos.
- [ ] **[Navegacion]** Hacer clic en 'Iniciar sesión' en la nav: debe redirigir a /login.
- [ ] **[Navegacion]** Hacer clic en 'Comenzar' (botón blanco en mobile, 'Ingresar' en nav solid): debe redirigir a /register.
- [ ] **[Navegacion]** Presionar la tecla Tab repetidamente desde el inicio del form: debe navegar por todos los inputs (Localidad, Fecha, Hora, Buscar) en orden.
- [ ] **[Navegacion]** Con focus en el botón Buscar, presionar Enter: debe submitir el formulario.
- [ ] **[Deep link]** Abrir /explorar?city=Mendoza directamente (sin pasar por la landing): debe cargar la página /explorar con filtro city pre-aplicado.
- [ ] **[Deep link]** Abrir /{tenant.slug} directamente: debe cargar la página pública del complejo.
- [ ] **[Deep link]** Abrir /para-complejos directamente: debe cargar la página de marketing para complejos.
- [ ] **[Visual]** Verificar el color de fondo hero: debe ser con gradiente 'from-slate-950/95 via-slate-950/80 to-emerald-900/70'.
- [ ] **[Visual]** Verificar que FeaturedComplexCard tiene transición hover:-translate-y-1 (sube 4px) y hover:border-emerald-400/40 (borde verde emerge).
- [ ] **[Visual]** Verificar que el icono 'Reserva online' (Zap) en tarjetas aparece solo si tenant.allowOnlineBooking=true.
- [ ] **[Visual]** Verificar que el precio 'Desde $X' aparece en la tarjeta solo si tenant.fromPriceCents no es null.
- [ ] **[Visual]** Verificar que las amenities en tarjetas se muestran en orden (techado, iluminación, estacionamiento, duchas, etc.) y max 4 por tarjeta.
- [ ] **[Visual]** Verificar que el rating stars de tarjeta (compact variant) muestra '★ 4.5 (12)' si el complejo tiene reseñas.
- [ ] **[Visual]** Verificar que OpenMatchCard muestra 'Falta 1 jugador' (singular) si slotsRemaining=1, 'Faltan X jugadores' si > 1.
- [ ] **[Visual]** Verificar que el ícono 'Sumarme' (arrow →) en OpenMatchCard tiene transición translate al hover.
- [ ] **[Visual]** Verificar que el StatsBar tiene grid gap-px (separador fino) con bg-white/5 y cada celda tiene bg-slate-900/50.
- [ ] **[Visual]** Verificar que OwnerBanner tiene borde border-emerald-400/20 y gradiente de fondo from-emerald-900/30.
- [ ] **[Visual]** Verificar que el botón 'Conocé más' en OwnerBanner tiene bg-emerald-500, transición hover:-translate-y-0.5 (sube) y shadow-emerald-500/30.
- [ ] **[Visual]** Con prefers-color-scheme: light, la página sigue renderizándose (pero los estilos van a dark bg-slate-950, inconsistente).
- [ ] **[Edge]** Enviar un string muy largo (>100 chars) en el campo de Localidad y presionar Tab: el select debe permitir el valor solo si existe en options.
- [ ] **[Edge]** Seleccionar una fecha +180 días en el futuro: el atributo min={today} no tiene max, así que debe aceptar cualquier fecha >= hoy.
- [ ] **[Edge]** Seleccionar Hora='08:00' (primera opción de HOURS) y presionar Buscar: debe incluir time=08%3A00 en la query string.
- [ ] **[Edge]** Seleccionar Hora='23:00' (última opción de HOURS que tenga): debe incluir time=23%3A00 en la query string.
- [ ] **[Edge]** Si cities devuelve 100+ ciudades: el selector debe mostrar todas (sin truncamiento, pero scroll).
- [ ] **[Edge]** Si un complejo destacado tiene fromPriceCents=0 (gratis): debe mostrar 'Desde $0' (no null, se renderiza).
- [ ] **[Edge]** Si un complejo tiene coverUrl=null: FeaturedComplexCard muestra un placeholder con initials (primeras 2 letras del nombre en uppercase, ej. 'CP' de 'Complejo Parque').
- [ ] **[Edge]** Si un complejo tiene amenities={} vacío: la sección de amenities badges no se renderiza (condición amenities.length > 0).
- [ ] **[Edge]** Si un partido abierto tiene expiresAt=null: OpenMatchCard omite el badge de 'XY fecha, HH:MM' (condición when &&).
- [ ] **[Edge]** Si un partido abierto tiene restrictions.level=null y restrictions.gender=null: no muestra badges de restricción (condición level && y gender &&).
- [ ] **[Edge]** Si un partido tiene slotsRemaining=0: no debería renderizarse en la landing (status='open' en getOpenMatches, pero el negocio puede querer mostrar 'full' también).
- [ ] **[Doble submit]** Hacer clic dos veces rapidamente en el botón 'Buscar' del hero: debe navegar solo una vez a /explorar (client-side router.push previene dobles).
- [ ] **[Doble submit]** Hacer clic en 'Buscar', luego inmediatamente hacer clic en una tarjeta de complejo: debe navegar a la tarjeta (el router no bloquea paralelas).
- [ ] **[Concurrencia]** Abrir dos pestañas con /: ambas deben renderizar la landing con datos en caché ISR (revalidate=300), sin múltiples queries DB simultáneas.
- [ ] **[Integracion API]** Verificar que searchPublicTenants({sort:'rating', limit:6}) trae complejos ordenados por rating DESC y máx 6 resultados.
- [ ] **[Integracion API]** Verificar que listPublicCities() trae ciudades ordenadas por count DESC, city ASC, solo tenants con status IN ('active', 'trialing').
- [ ] **[Integracion API]** Verificar que getOpenMatches({status:'open', limit:6}) trae partidos con status='open', expiresAt > now(), máx 6, ordenados por expiresAt ASC.
- [ ] **[Integracion API]** Verificar que searchPublicTenants filtra por allowOnlineBooking=true si onlineOnly=true es pasado (aunque no se usa en la landing, es parte de API).
- [ ] **[SEO]** Verificar que la página genera JsonLd con buildOrganization() y buildWebSite() en el <head>.
- [ ] **[SEO]** Verificar que los links de featured complexes tienen href='/{slug}' (sin protocolo), navegables por buscadores.
- [ ] **[SEO]** Verificar que los links de ciudades populares tienen href=/explorar?city=... (navegables por buscadores, parametros capturan intent).
- [ ] **[SEO]** Inspeccionar el og:title y og:description en metadata (via buildMetadata) para compatibilidad social media.

> ⚠️ **Riesgo detectado en codigo:** RIESGOS DETECTADOS: (1) No hay validación de input en el lado servidor para los parámetros de query del buscador—si alguien manipula la URL con caracteres especiales, el router.push la pasa así. (2) Las funciones loadCities/loadFeatured/loadOpenMatches usan try-catch pero solo loguean el error implícitamente (withSpan); no hay telemetría de fallo explícita. (3) RatingStars en tarjetas solo muestra si reviewCount > 0, pero si es exactamente 0, no aparece—correcto, pero verifica que la UI maneja la ausencia visualmente. (4) El selector de Localidad toma cities.city (string único por fila), pero listPublicCities agrupa por (city, province)—si dos provincias tienen 'Buenos Aires', el map genera dos opciones con el mismo value; esto causaría sobrescritura. Riesgo: si Buenos Aires está en dos provincias, solo la última se muestra. (5) El ISR revalidate=300 es sólido, pero si la DB cae antes del primer build, la página puede quedar sin datos hasta el siguiente revalidate; considerar stale-while-revalidate header. (6) Los atributos aria-hidden en decorativos son correctos, pero el Sr-only pada 'Reserva online' en tarjetas se muestra solo en sm+; en mobile está hidden, perdiendo accesibilidad. (7) El todayLocal() usa new Date() del cliente, pero en server-side pre-rendering se evalúa en servidor—puede haber desfase de 1 día si la landing se pre-renderiza a medianoche UTC vs horario Argentina. Investigar si date={today} en HeroSearch es UTC-aware en Next.js SSR."

---

### 31. Complejo suspendido
**URL:** `/suspended` · **Archivo:** `src/app/(public)/suspended/page.tsx`

- [ ] **[Render]** Cargar /suspended sin auth: página muestra ícono PauseCircle en contenedor amber-100/amber-600, h1 'Tu cuenta está temporalmente suspendida', párrafo descriptivo, botón verde Contactar a soporte, link Volver al inicio.
- [ ] **[Render]** Verificar que la sección tiene min-h-[60vh], max-w-xl, contenido centrado (flex-col items-center justify-center) y padding px-6 py-16 en desktop.
- [ ] **[Happy path]** Admin redirigido desde /admin/** a /suspended: acceder a /admin/dashboard con token JWT admin válido pero con tenant que tiene suspended flag TRUE en feature-flags → recibir redirect 307 a /suspended.
- [ ] **[Happy path]** Usuario anonimo accede a /suspended: carga sin error 200, HTML válido, no requiere auth.
- [ ] **[Validacion - SEO]** Verificar metadata.robots.index = false y robots.follow = false en el <head> de la página (no debe ser indexada por buscadores).
- [ ] **[Validacion - SEO]** Title de la pestaña debe ser 'Cuenta suspendida — TurnoGol'.
- [ ] **[Validacion - Link]** Botón 'Contactar a soporte' es <a href='mailto:soporte@turnogol.app'> → clic abre cliente de email con destinatario correcto.
- [ ] **[Validacion - Link]** Link 'Volver al inicio' es <Link href='/'> (Next.js) → clic navega a raiz sin refetch de página.
- [ ] **[Validacion - Clase CSS]** PauseCircle icon tiene aria-hidden='true' → no lee el ícono en screenreaders (solo el texto).
- [ ] **[Visual - Iconografia]** PauseCircle renderizado con h-8 w-8, color text-amber-600, dentro de div h-16 w-16 rounded-full con bg-amber-100 y ring-8 ring-amber-50.
- [ ] **[Visual - Tipografia]** h1 con text-2xl font-bold tracking-tight text-slate-900 → contraste AAA mínimo.
- [ ] **[Visual - Tipografia]** Párrafo con text-sm leading-relaxed text-slate-600 → contraste AA mínimo contra fondo blanco.
- [ ] **[Visual - Tipografia]** Botón con text-sm font-semibold text-white sobre bg-emerald-600 → contraste AAA en estado normal.
- [ ] **[Visual - Estados botón]** Botón Contactar a soporte tiene hover:bg-emerald-700 → color oscurece al pasar ratón.
- [ ] **[Visual - Estados botón]** Botón tiene transition-colors → cambio de color es suave (sin salto abrupto).
- [ ] **[Visual - Link]** Link 'Volver al inicio' mt-4 text-sm font-medium text-slate-500 hover:text-slate-700 → color sube a más contraste al hover.
- [ ] **[Visual - Espaciado]** Icono mb-6 respecto a h1; h1 mt-0 (relativo a icono); párrafo mt-3 respecto a h1; botón mt-8 respecto a párrafo; link mt-4 respecto a botón.
- [ ] **[Responsive - Mobile]** En viewport 375x667 (iPhone SE): sección ocupa min-h-[60vh], px-6 es respetado, contenido NO desborda, texto es legible (no < 14px en pantalla).
- [ ] **[Responsive - Tablet]** En viewport 768x1024 (iPad): layout igual que mobile (responsive es vertical), max-w-xl es respetado, sin cambios de layout en esta view.
- [ ] **[Responsive - Desktop]** En viewport 1440x900: layout igual que mobile, max-w-xl es respetado (contenido no ocupa todo el ancho), bg-background es visible alrededor.
- [ ] **[A11y - Foco teclado]** Tab desde SiteNav → foco entra en botón Contactar a soporte (outline visible), tab nuevamente → foco en link Volver al inicio, tab nuevamente → entra en SiteFooter.
- [ ] **[A11y - Foco teclado]** Shift+Tab desde botón Contactar a soporte → regresa a SiteNav (orden de tabulación en reverse).
- [ ] **[A11y - Foco botón]** Botón Contactar a soporte al recibir foco muestra outline (ring o focus-visible) → accesible sin ratón.
- [ ] **[A11y - Anuncio de error]** Si JavaScript bloqueado: página aún carga (Server Component), contenido HTML estático visible, botón mailto: sigue funcionando (no necesita JS).
- [ ] **[A11y - Contraste]** Verificar que text-slate-900 sobre bg-white cumple WCAG AA mínimo (7:1 esperado).
- [ ] **[A11y - Contraste]** Verificar que text-slate-600 sobre bg-white cumple WCAG AA mínimo (4.5:1 esperado).
- [ ] **[A11y - Contraste]** Verificar que text-amber-600 sobre bg-amber-100 cumple WCAG AA mínimo (~5:1 esperado).
- [ ] **[A11y - Labels]** Elemento <a> tiene contenido visible en texto ('Contactar a soporte', 'Volver al inicio') → accesible para lectores de pantalla.
- [ ] **[Navegacion]** Usuario llega a /suspended desde URL directa (deep link): carga página correctamente sin redirección adicional.
- [ ] **[Navegacion]** Usuario presiona botón Volver al inicio → navega a / (home) sin refresh, historial de navegación es registrado.
- [ ] **[Navegacion]** Usuario presiona back del navegador desde /suspended → vuelve a la página anterior (puede ser /admin si fue redirigido).
- [ ] **[Navegacion - DeepLink]** URL /suspended/foo (ruta inválida): Next.js retorna 404 NOT_FOUND (no 200 en /suspended).
- [ ] **[Navegacion]** Admin intenta acceder a /suspended?admin=true o con parámetros query: parámetros son ignorados, página se renderiza igual.
- [ ] **[Persistencia]** Recargar /suspended con F5 o Ctrl+R: página sigue siendo visible, no redirige a home, contenido es idéntico.
- [ ] **[Persistencia]** Usar DevTools para simular offline → ir a /suspended: página sigue visible (es Server Component estático, no requiere fetch de datos).
- [ ] **[Carga]** Al primer acceso a /suspended: página carga en < 500ms, sin skeleton o spinner (contenido es completamente estático).
- [ ] **[Carga]** Medir Largest Contentful Paint (LCP) en /suspended: < 2.5s (Lighthouse metric), típicamente < 500ms para página estática.
- [ ] **[Carga]** Medir First Input Delay (FID): < 100ms cuando usuario hace clic en botón (sin layout shift).
- [ ] **[Carga]** Medir Cumulative Layout Shift (CLS): < 0.1 (sin movimiento de elementos durante carga).
- [ ] **[Error - HTTP]** Acceso a /suspended sin sesión válida: retorna 200 (página pública), NO 401.
- [ ] **[Error - HTTP]** Acceso a /suspended con token inválido o expirado: página sigue cargando (sin validación), token no afecta la vista pública.
- [ ] **[Permisos]** Admin con tensor_status='active' NO es redirigido a /suspended (redirección solo si suspended flag TRUE en feature-flags).
- [ ] **[Permisos]** Jugador autenticado accede a /suspended: página carga (es pública), pero no es flujo normal de un jugador.
- [ ] **[Permisos]** Super-admin accede a /suspended: puede ver la página como cualquier usuario, puede impersonar un tenant suspended desde super-admin panel.
- [ ] **[Permisos]** Usuario no autenticado (anonimo) accede a /suspended: página carga sin error, sin requerimiento de login.
- [ ] **[Meta tags]** <meta name='robots' content='noindex, nofollow'> está presente en <head>.
- [ ] **[Meta tags]** <meta property='og:title'> o <meta name='description'> NO están presentes (noIndex pages típicamente no tienen OG tags en TurnoGol).
- [ ] **[Meta tags]** Verificar que <link rel='canonical'> NO está presente (páginas noIndex generalmente no tienen canonical).
- [ ] **[Layout - Integracion]** SiteNav (header) está visible encima de la sección suspended (z-index=30).
- [ ] **[Layout - Integracion]** SiteFooter está visible debajo de la sección suspended (flex-1 para main es respetado).
- [ ] **[Layout - Integracion]** main id='main-content' contiene la sección suspended (accesibilidad para screenreaders).
- [ ] **[Visual - Overflow]** Párrafo con leading-relaxed NO desborda a la derecha en pantalla de 375px (max-w-xl y px-6 previenen overflow).
- [ ] **[Visual - Alineacion]** h1, párrafo, botón, link están alineados al centro (text-center, items-center).
- [ ] **[Visual - Espaciado]** Gap entre sección contenida (flex-col) muestra spacing correcto (mb-6, mt-3, mt-8, mt-4).
- [ ] **[Edge - Emoji]** Verificar que ícono PauseCircle es SVG from lucide-react (no es emoji fallido, no necesita font-emoji).
- [ ] **[Edge - Encoding]** URL /suspended se renderiza con UTF-8 (accent agudo en 'suspendida' es visible en h1).
- [ ] **[Edge - Localizacion]** Todos los textos están en español (Argentina): 'Tu cuenta', 'suspendida', 'Contactar a soporte' (sin mezcla de idiomas).
- [ ] **[Edge - Email]** mailto:soporte@turnogol.app es una dirección de email válida (no hay typos, no es mail de testing).
- [ ] **[Sesion - Expirada]** Admin con sesión expirada intenta acceder a /admin/** → redirige a /login, luego si intenta /admin nuevamente → redirige a /login (NO a /suspended).
- [ ] **[Sesion - Expirada]** Admin con sesión válida pero tenant pasó a estado suspended durante su sesión → si recarga /admin → recibe redirect a /suspended.
- [ ] **[Doble click]** Clic doble en botón Contactar a soporte → abre cliente de email una sola vez (no envía dos emails, comportamiento estándar de <a href='mailto:'>).
- [ ] **[Doble click]** Clic doble en link Volver al inicio → navega a home una sola vez (no causa múltiples navigations, Next.js Link maneja esto).
- [ ] **[Concurrencia]** Dos pestañas A y B, ambas en /suspended: si en A se recarga la página, B no es afectada (son sesiones independientes).
- [ ] **[Acceso multi-tenant]** Admin de Complejo X redirigido a /suspended; entra en otra pestaña como admin de Complejo Y (activo) → acceso a /admin/dashboard de Y es permitido; /suspended solo es para X.

> ⚠️ **Riesgo detectado en codigo:** Riesgos detectados: (1) No hay manejo de estados condicionales en metadata.robots (hardcoded a false/false) → si algún día /suspended necesita cambiar a noIndex=true dinámicamente, el código debe ser actualizado. (2) El botón Contactar a soporte es mailto: puro → no hay fallback si el cliente de email no está configurado (UX en desktop/mobile puede variar). (3) Link 'Volver al inicio' no valida que el usuario llegó desde /admin/** → un jugador puede llegar a /suspended manualmente y ver "Volver al inicio" sin contexto de por qué fue redirigido. (4) La página es completamente estática → no hay telemetría de cuántos tenants son suspendidos ni por cuánto tiempo (posible dato de negocio faltante). (5) Sin tests unitarios específicos para esta página en el codebase actual (no hay page.test.tsx en suspended/), solo metadata test en seo-metadata.test.ts. (6) Redirección en (admin)/layout.tsx usa redirectIfTenantSuspended que es async pero no tiene timeout explícito → si DB está lenta, el usuario verá delay antes de ser redirigido.

---

## 🟢 P3 — Bajas (5 vistas)

### 32. Para complejos (marketing)
**URL:** `/para-complejos` · **Archivo:** `src/app/(public)/para-complejos/page.tsx`

- [ ] **[Render]** Cargar /para-complejos sin autenticación: debe renderizar la página completa con secciones Hero, Features, Stats, Showcase, Testimonios y Final CTA visibles.
- [ ] **[Render]** Verificar que el título de página en <title> sea "TurnoGol para complejos — Gestión y reservas online para tu cancha" según buildMetadata.
- [ ] **[Render]** Verificar que la descripción meta sea "El software de gestión hecho para complejos de fútbol argentinos. Reservas online 24/7, cobros automáticos con MercadoPago y la grilla en tiempo real. Probá 30 días gratis, sin tarjeta."
- [ ] **[Render]** Confirmar que la imagen hero-bg.png (/hero-bg.png) carga sin error 404 y se renderiza como background en la sección Hero.
- [ ] **[Render]** Confirmar que la imagen de Unsplash (https://images.unsplash.com/photo-1486286701208-1d58e9338013?q=80&w=2000&auto=format&fit=crop) carga sin error en la sección ShowcaseStrip (F12 Network tab, sin mixed-content warnings).
- [ ] **[Render]** Verificar que los 6 iconos Lucide en la sección Features (Calendar, CreditCard, LineChart, Bell, Wallet, Users) renderizan sin errores.
- [ ] **[Render]** Verificar que los 5 iconos adicionales en Hero y otras secciones (Zap, CheckCircle2, ArrowRight, Quote, Shield, Star) renderizan correctamente.
- [ ] **[Happy path]** Usuario hace click en "Comenzá gratis 30 días" en sección Hero: debe redirigir a /register con status 200.
- [ ] **[Happy path]** Usuario hace click en "Iniciar sesión" en sección Hero: debe redirigir a /login con status 200.
- [ ] **[Happy path]** Usuario hace click en "Crear mi cuenta" en sección Final CTA: debe redirigir a /register con status 200.
- [ ] **[Happy path]** Usuario hace click en "Ya tengo cuenta" en sección Final CTA: debe redirigir a /login con status 200.
- [ ] **[Navegacion]** Hacer click en el logo TurnoGol (TG + texto) en SiteNav debe redirigir a /.
- [ ] **[Navegacion]** Hacer click en "Explorar" en SiteNav debe redirigir a /explorar.
- [ ] **[Navegacion]** Hacer click en "Para complejos" en SiteNav debe mantener la navegación en /para-complejos (sin redirigir).
- [ ] **[Navegacion]** Hacer click en "Ingresar" en SiteNav en versión solid (con fondo blanco) debe redirigir a /login.
- [ ] **[Deep link]** Navegar directamente a /para-complejos via URL bar: debe renderizar la página sin errores.
- [ ] **[Deep link]** Navegar a /para-complejos con query params (ej: ?source=google): debe ignorar los params y renderizar normalmente.
- [ ] **[Anclas]** Hacer click en el link de anclaje "#features" desde cualquier parte: debe scrollear a la sección Features (id="features" existe en el código).
- [ ] **[Anclas]** Hacer click en el link de anclaje "#testimonios" desde cualquier parte: debe scrollear a la sección Testimonios (id="testimonios" existe en el código).
- [ ] **[Footer]** Hacer click en "Explorar" en el pie debe redirigir a /explorar.
- [ ] **[Footer]** Hacer click en "Iniciar sesión" en el pie debe redirigir a /login.
- [ ] **[Footer]** Hacer click en "Contacto" (mailto:hola@turnogol.app) debe abrir el cliente de email del usuario.
- [ ] **[Footer]** Hacer click en "Privacidad" en el pie debe redirigir a /privacy con status 200.
- [ ] **[Footer]** Hacer click en "Términos" en el pie debe redirigir a /terms con status 200.
- [ ] **[Visual]** Sección Hero: verificar que el gradient overlay (from-slate-950/95 via-slate-950/80 to-emerald-900/70) se aplica correctamente sobre la imagen de fondo sin bloquear el texto.
- [ ] **[Visual]** Sección Hero: verificar que el heading h1 "Tu complejo de fútbol, lleno todos los días" tiene padding y max-width (max-w-3xl) correctos para no exceder límites en desktop.
- [ ] **[Visual]** Sección Hero: verificar que el gradient text (from-emerald-300 via-emerald-400 to-emerald-200) en "lleno todos los días" se renderiza como texto verde gradiente sin cortes.
- [ ] **[Visual]** Sección Features: verificar que los 6 feature cards se disponen en 1 columna en mobile, 2 en tablet (md), 3 en desktop (lg).
- [ ] **[Visual]** Sección Features: verificar que cada card tiene border border-white/10 y respeta el hover effect (-translate-y-1, border-emerald-400/40).
- [ ] **[Visual]** Sección Stats: verificar que los 4 stats se muestran en 2 columnas en mobile (grid-cols-2) y 4 en desktop (sm:grid-cols-4) sin overflow.
- [ ] **[Visual]** Sección Showcase: verificar que el grid se renderiza en 1 columna en mobile y 2 en desktop (lg:grid-cols-2).
- [ ] **[Visual]** Sección Showcase: verificar que la grilla simulada de slots (grid grid-cols-4 gap-2) se renderiza correctamente con 20 items (horarios 18:00 a 21:45).
- [ ] **[Visual]** Sección Testimonios: verificar que los 3 testimonios se muestran en 1 columna en mobile, 3 en desktop (md:grid-cols-3).
- [ ] **[Visual]** Verificar que los padding globales (px-4 sm:px-6 lg:px-8) se aplican correctamente en mobile/tablet/desktop sin horizontal overflow.
- [ ] **[Visual]** Verificar que los heading h2 (text-3xl sm:text-5xl) crecen correctamente con el breakpoint sin truncarse.
- [ ] **[Visual]** Verificar que la imagen del Logo TG en SiteNav (h-8 w-8, bg-emerald-600) mantiene aspecto cuadrado y es visible en ambas variantes (overlay y solid).
- [ ] **[Responsive]** En vista mobile (375px width): verificar que el heading h1 cae a text-4xl (no text-7xl) y no excede el ancho.
- [ ] **[Responsive]** En vista mobile: verificar que los CTA buttons se apilan verticalmente (flex-col) con gap-3.
- [ ] **[Responsive]** En vista mobile: verificar que "Para complejos" no aparece en SiteNav (hidden sm:inline).
- [ ] **[Responsive]** En vista tablet (768px): verificar que "Para complejos" aparece en SiteNav.
- [ ] **[Responsive]** En vista desktop (1024px+): verificar que todos los elementos tienen spacing óptimo (max-w-7xl, gap-6, etc).
- [ ] **[Responsive]** En vista mobile: verificar que el Showcase Strip se renderiza con grid-cols-1 y el paso 4 ("Conectá MercadoPago") es visible sin scroll horizontal.
- [ ] **[Responsive]** En vista mobile: verificar que la grilla de slots simulada no excede el ancho (overflow-hidden, responsive padding).
- [ ] **[Responsive]** Cambiar viewport de desktop a mobile y volver a desktop: verificar que no hay layout shift o re-render indeseado.
- [ ] **[A11y]** Verificar que el atributo alt de la imagen hero-bg.png es vacío y aria-hidden=true (es decorativa).
- [ ] **[A11y]** Verificar que el atributo alt de la imagen FEATURE_BG (Unsplash) es vacío y aria-hidden=true (es decorativa).
- [ ] **[A11y]** Verificar que los div overlay (gradient) tienen aria-hidden=true para no ser anunciados por screen readers.
- [ ] **[A11y]** Verificar que el main element tiene id="main-content" (accesibilidad skip-to-main).
- [ ] **[A11y]** Verificar que todos los Links tienen texto descriptivo (no links vacías).
- [ ] **[A11y]** Verificar que los heading siguen estructura jerárquica (h1 en Hero, h2 en Features/Stats/Showcase/Testimonios/Final CTA, h3 en contenido).
- [ ] **[A11y]** Navegar con Tab desde el inicio: verificar que el foco se mueve en orden lógico (logo -> nav links -> CTA buttons -> footer links).
- [ ] **[A11y]** Verificar que los botones (Links con className button-like) tienen focusring visible con outline o ring cuando reciben foco (tabular).
- [ ] **[A11y]** Verificar que el color de los textos (text-white, text-slate-300, etc) sobre fondos oscuros (bg-slate-950, bg-slate-900/50) tienen contraste >= 4.5:1 (WCAG AA).
- [ ] **[A11y]** Verificar que el color del texto highlight en gradient (text-emerald-300/400/200) en fondo oscuro tiene contraste suficiente.
- [ ] **[A11y]** Usando screen reader (NVDA/JAWS): verificar que la navegación se anuncia correctamente ("navigation") y los links tienen label claro.
- [ ] **[A11y]** Usando screen reader: verificar que la sección Testimonios anuncia "Figure" para cada testimonio y el blockquote es interpretado como cita.
- [ ] **[A11y]** Usando screen reader: verificar que los badges ("Sin tarjeta", "Configuración en menos de 2 minutos", "Soporte por email") son anunciados como lista (ul).
- [ ] **[A11y]** Verificar que los iconos decorativos (lucide-react icons con aria-hidden=true) no son anunciados por screen readers.
- [ ] **[A11y]** Verificar que el email link (mailto:hola@turnogol.app) es un link válido y anunciado como link.
- [ ] **[Vacio]** Verificar que la página no contiene elementos vacíos (divs sin contenido, listas vacías, etc).
- [ ] **[Persistencia]** Cargar la página, esperar 5 segundos, refrescar (F5): verificar que el contenido se mantiene y no hay diferencias visuales.
- [ ] **[Persistencia]** Abrir la página en una pestaña nueva en incógnito/privado: verificar que renderiza idénticamente sin dependencias de cookies/storage.
- [ ] **[Carga]** Medir el tiempo de First Contentful Paint (FCP) y Largest Contentful Paint (LCP) con Chrome DevTools: ambos deben ser < 3s en conexión 4G/Good.
- [ ] **[Carga]** Verificar que las imágenes Next.js Image (hero-bg.png, Unsplash) usan lazy loading por defecto (excepto priority en Hero) y no bloquean FCP.
- [ ] **[Carga]** Verificar que el archivo JavaScript del cliente es < 200KB (bundlesize) y no hay script bloqueante antes de la carga del contenido.
- [ ] **[Carga]** Verificar que no hay layout shift (CLS < 0.1) al cargar la página (checklist de hero badges, imagenes, etc).
- [ ] **[Red]** Desactivar la red (offline en DevTools): el sitio debe seguir renderizando contenido estaticamente (SSR), aunque las imágenes no carguen.
- [ ] **[Red]** Simular conexión 3G lenta en DevTools: verificar que la página es usable sin las imágenes (alt text, fallback backgrounds).
- [ ] **[Red]** Simular latencia alta (2000ms) en la carga de la imagen Unsplash: verificar que el layout no se rompe y el contenido es legible.
- [ ] **[Red]** Descargar la página y servirse offline con un service worker: verificar que funciona sin error de red (si está configurado sw.js).
- [ ] **[Sesion]** Sin cookie de sesión: la página debe renderizar normalmente (no redirigir a login).
- [ ] **[Sesion]** Con cookie de sesión válida: la página debe renderizar normalmente (no redirigir a /dashboard o equivalente).
- [ ] **[Sesion]** Espiar las cookies enviadas en la solicitud GET /para-complejos: debe estar vacía o contener solo cookies no-auth (analytics, etc).
- [ ] **[Error 404]** Navegar a /para-complejoss (typo): debe redirigir a 404 o mostrar not found page de Next.js.
- [ ] **[Error 404]** Navegar a /para-complejos/foo/bar (ruta anidada inexistente): debe redirigir a 404.
- [ ] **[Error 500]** Si buildMetadata() falla (NEXT_PUBLIC_SITE_URL inválido): la página debe renderizar al menos el contenido sin crashing.
- [ ] **[Edge]** Verificar que el evento Google Analytics (si está configurado) se dispara cuando la página carga (gtag.pageview).
- [ ] **[Edge]** Verificar que Sentry no registra errores no intencionales al cargar la página (status ok en Sentry).
- [ ] **[Edge]** Verificar que no hay console.error, console.warn o logs de React DevTools que indiquen problemas.
- [ ] **[Edge]** Abrir el sitio en navegadores antiguos (IE11, Safari 11): la página debe degradarse gracefully (sin CSS custom properties críticamente ausentes).
- [ ] **[Edge]** En navegadores sin soporte para backdrop-filter (backdrop-blur-sm): verificar que el diseño no depende críticamente de él y es legible.
- [ ] **[Edge]** Verificar que los estilos de Tailwind CSS (clsx, CVA) no generan conflictos ni sobrescrituras indeseadas en las secciones (p.ej. border-white/10 vs border-emerald-400/40).
- [ ] **[Edge]** Verificar que el logo badge (TG) tiene shadow-lg y shadow-emerald-500/30: debe ser visible sin efecto fantasma (ghost shadow).
- [ ] **[Edge]** Simular carga muy lenta de imagen (5+ segundos): verificar que el Largest Contentful Paint (LCP) se reasigna correctamente (no se queda esperando imagen).
- [ ] **[Edge]** Verificar que los números en Stats ("50+", "<2 min", "+10.000") se renderizan como texto y no como imagen (para accesibilidad y performance).
- [ ] **[Edge]** Verificar que la lista de features (6 items) tiene estructura ordenada (ol o ul) o está comentada explícitamente como no-ordenada.
- [ ] **[Edge]** Verificar que los testimonios incluyen un atributo key único (usando nombre o índice) en el map() para evitar warnings de React.
- [ ] **[Edge]** Verificar que los step numbers del Showcase ("01", "02", "03", "04") se renderizan como texto y no como número formateado dinámicamente.
- [ ] **[Edge]** Hacer zoom al 200% en desktop: verificar que el layout sigue siendo usable sin scroll horizontal excesivo.
- [ ] **[Edge]** Hacer zoom al 50% en mobile: verificar que el contenido no se vuelve ilegible.
- [ ] **[Edge]** Abrir DevTools mobile en Firefox y verificar la vista responsive: debe ser igual a Chrome mobile.
- [ ] **[Edge]** Verificar que la paleta de colores (emerald-500, slate-950, slate-300, etc) es consistente en toda la página (sin typos en clase).
- [ ] **[Visual]** Verificar que el separador visual "9 reservas confirmadas hoy" en Showcase está alineado a la izquierda (text-left) sin truncamiento.
- [ ] **[Visual]** Verificar que el badge "En vivo" (con dot animado animate-pulse) parpadea suavemente sin flicker o jitter.
- [ ] **[Visual]** Verificar que el overlay gradient en Hero tiene altura correcta (h-40 bottom-0) sin superposición incómoda con el contenido.
- [ ] **[Visual]** Verificar que la imagen de fondo del Showcase tiene una altura mínima respetable (min-h) para ser visible en móviles.
- [ ] **[Visual]** Verificar que los iconos en los feature cards están centrados (inline-flex, items-center, justify-center) sin desalineación.
- [ ] **[Visual]** Verificar que el ancho max de contenido (max-w-7xl) se respeta en desktop sin que el texto se esparza demasiado.
- [ ] **[Visual]** Verificar que los espacios entre secciones (py-24 sm:py-32) proporcionan respiro visual sin parecer vacío.
- [ ] **[Visual]** Verificar que el gradient text en h1 (bg-clip-text text-transparent) no tiene artefactos de renderizado o pixelado en edges.
- [ ] **[Edge]** Verificar que la estructura semántica HTML es correcta: main > section* > div > (h1|h2|h3) + p* (sin anidamiento incorrecto).
- [ ] **[Edge]** Verificar que no hay atributos deprecated (p.ej. role="button" en divs sin onClick) que causen issues de accesibilidad.
- [ ] **[Edge]** Verificar que la página no hace fetch() o llamadas a API innecesarias (debe ser completamente estática/SSR).
- [ ] **[Edge]** Verificar que el Open Graph image (DEFAULT_OG_IMAGE) se genera correctamente y tiene dimensiones 1200x630px según buildMetadata.

> ⚠️ **Riesgo detectado en codigo:** Riesgos detectados: (1) DEFAULT_OG_IMAGE (/opengraph-image) usa un ruta generada dinámicamente en Next.js pero no existe como archivo estático — necesita validar que opengraph-image.tsx genera la imagen correctamente. (2) Unsplash URL externo (https://images.unsplash.com/...) puede fallar si la CDN está down o si el photo-id cambia — considerar mirror o local fallback. (3) La página no tiene validación de entrada (no aplica aquí, es estática), pero SiteNav tiene links que redirigen; necesita verificar que /login, /register, /explorar existen y no retornan 404. (4) aria-hidden=true en overlays es correcto, pero verificar que los divs decorativos (gradients) no esconden contenido importante. (5) El color de texto emerald-300/400/200 sobre fondo slate-950 debe testearse para contraste WCAG; visualmente parece OK pero necesita validación con herramienta. (6) No hay formularios en esta página (es puro marketing), así que no hay validación de campos; los CTAs solo redirigen a /register que está en otra ruta. (7) Tailwind Arbitrary values (bg-white/[0.03], ring-inset, etc) deben compilarse correctamente — no hay evidencia de problemas pero vigilar en build. (8) Performance: imagen Unsplash es un CDN externo, puede causar LCP lenta; heroImage tiene priority=true lo cual es correcto pero FEATURE_BG no, verificar si se justifica. (9) Responsive: sm, md, lg breakpoints siguen Tailwind defaults pero verificar que la grilla de features (grid-cols-1 md:grid-cols-2 lg:grid-cols-3) se comporta en breakpoint 768px exactamente."

---

### 33. Privacidad
**URL:** `/privacy` · **Archivo:** `src/app/(public)/privacy/page.tsx`

- [ ] **[Render]** Cuando se carga /privacy sin autenticación, la página renderiza con h1 'Política de Privacidad' y subtítulo 'Última actualización: 25 de mayo de 2026' visibles en viewport.
- [ ] **[Render]** Al cargar /privacy, las 9 secciones (Quiénes somos, Qué datos, Para qué, Con quién, Retención, Derechos, Cookies, AAIP, Cambios) renderizaban sin corte de texto y cada h2 es distintamente visible.
- [ ] **[Render]** Los 9 títulos de sección (h2) tienen clase 'text-xl font-semibold text-slate-900' aplicada y se visualizan sin truncamiento en desktop 1920px.
- [ ] **[Visual]** El artículo principal tiene padding px-4 en mobile (< 640px), px-6 en tablet (640px-1024px), y px-8 en desktop (>1024px) confirmado con DevTools.
- [ ] **[Responsive]** En pantalla mobile (320px), el h1 'Política de Privacidad' renderiza con clase 'text-3xl' (sin sm:text-4xl que aplica solo en sm+) y es legible sin overflow.
- [ ] **[Responsive]** En pantalla tablet (768px), el max-w-3xl se aplica correctamente (768px max-width), el texto no cruza bordes laterales de viewport.
- [ ] **[Responsive]** En pantalla desktop (1920px), el artículo centra dentro de max-w-3xl (768px), margins izquierda y derecha distribuyen el espacio blanco simétricamente.
- [ ] **[Visual]** Los 6 links externos (privacidad@turnogol.app por email, argentina.gob.ar/aaip, /privacy redirect interno, /terms redirect interno) tienen clase 'text-emerald-700 hover:underline' aplicada visualmente.
- [ ] **[Happy path]** El usuario anónimo abre /privacy desde el footer (Link href='/privacy'), la página carga en < 2s, renderiza toda la política sin requiere scroll excesivo (max 5 scrolls en mobile para leer todo).
- [ ] **[Happy path]** El usuario navega /privacy → lee sección 'Derechos (ARCO)' → encuentra el endpoint '/api/player/data-export' entre backticks con clase 'rounded bg-slate-100 px-1 py-0.5 text-sm', confirma que es formateado como código.
- [ ] **[Link validation]** El link 'argentina.gob.ar/aaip' en sección 8 tiene target='_blank' y rel='noopener noreferrer' (verificable en DevTools), al hacer clic abre en pestaña nueva sin referer leak.
- [ ] **[Link validation]** El link 'privacidad@turnogol.app' abre el cliente de email predeterminado (href='mailto:...' sin protocolo custom), sin error 404 ni console warning.
- [ ] **[Link validation]** El Link interno a /terms (Link href='/terms') funciona sin recargar página (navegación SPA Next.js), renderiza page.tsx de terms sin error.
- [ ] **[Link validation]** El Link interno a /privacy (Link href='/privacy' en sección 9) no causa redirección circular: el usuario sigue en /privacy, no hay refresh de página.
- [ ] **[A11y]** Cada h2 de sección tiene role implícito heading (landmark), navegación de teclado Tab pasa por todos los h1/h2 sin saltar ninguno (order correcto: h1 → h2[1] → h2[2] ... → h2[9]).
- [ ] **[A11y]** Los links (internos Next.js Link + <a> externos) son enfocables con Tab, tienen :focus-visible visible (outline), teclado Enter ejecuta el link (test con navegación Tab → Enter).
- [ ] **[A11y]** El text-slate-700 (color de párrafos) vs fondo white tiene contraste >= 4.5:1 según WCAG AA (verificable con tools: #4c5a6b vs #ffffff = 8.3:1).
- [ ] **[A11y]** El text-slate-500 (subtítulo 'Última actualización') tiene contraste >= 3:1 con fondo white (#78859a vs #ffffff = 4.5:1).
- [ ] **[A11y]** El text-emerald-700 (links) tiene contraste >= 4.5:1 con fondo white (#047857 vs #ffffff = 5.2:1).
- [ ] **[A11y]** Las listas no ordenadas (ul.list-disc) renderizan con bullets visibles, screen reader anuncia 'list' + 'n items' (NVDA/JAWS test), cada li es anunciada por orden.
- [ ] **[A11y]** El elemento <code> '/api/player/data-export' tiene backgroundColor diferente (bg-slate-100), visualmente distintivo, screen reader lo enuncia como 'code'.
- [ ] **[Deep link]** Navegar directamente a /privacy (URL bar) carga la página correctamente sin redirect, metadata title es 'Política de Privacidad', description es presente en HEAD.
- [ ] **[Deep link]** Actualizar la página (/privacy con F5 o Ctrl+R) preserva todo contenido, no hay pérdida de estado (es página estática, no hay estado en cliente).
- [ ] **[Navigation]** Hacer clic en 'Privacidad' en el footer desde /explorar navega a /privacy sin error 404, sin timeout, sin consola warning o error.
- [ ] **[Navigation]** Hacer clic en 'Privacidad' en el footer desde /login navega a /privacy, URL es /privacy (no ?from=login ni redirect param), página renderiza normal.
- [ ] **[Navigation]** Botón back del navegador tras visitar /privacy → /explorar vuelve a /explorar sin error, historial preservado.
- [ ] **[Navigation]** Botón forward tras visitar /explorar → /privacy → back vuelve a /explorar, forward vuelve a /privacy sin recarga de servidor (SPA).
- [ ] **[Persistencia]** Recargar la página /privacy 3 veces consecutivas renderiza idéntico contenido cada vez, el estado de scroll no persiste (es comportamiento correcto: cada refresh es fresh load).
- [ ] **[Vacio]** Las secciones no tienen estado vacío porque toda la política está hardcoded en el JSX; verificar que ninguna sección renderiza componente vacío, skeleton o null condicionalmente.
- [ ] **[Carga]** El page.tsx no tiene await en el componente (_ no es async), por lo tanto la página renderiza inmediatamente sin skeleton o suspense boundary; verificar que en DevTools no hay delayed rendering.
- [ ] **[Render]** En sección 2 'Qué datos', la lista incluye item sobre 'Historial de reservas' con substring 'montos en centavos de pesos argentinos', confirmando literalidad.
- [ ] **[Render]** En sección 3 'Para qué usamos', la lista menciona 'planes Predio, Complejo y Estadio', coincide con domain TurnoGol doc4 (monetización por plan).
- [ ] **[Render]** En sección 6 'Derechos ARCO', el endpoint code '/api/player/data-export' está presente, coincide con doc B09 audit fix P1.
- [ ] **[Edge]** El metadata export tiene title 'Política de Privacidad' y description 'Cómo TurnoGol recolecta...Ley 25.326', descripción sin truncamiento en search results (< 160 chars verificable).
- [ ] **[Edge]** Todas las mencionadas de 'Ley 25.326' en la página coinciden con exactitud (no variaciones tipo 'Ley 25.326 de Protección' vs 'Ley 25.326'), 8 menciones verificadas por count.
- [ ] **[Edge]** El email 'privacidad@turnogol.app' aparece 3 veces en el texto (sección 1, sección 6 twice), links de mailto funcionan todos igual.
- [ ] **[Visual]** Los párrafos (<p>) tienen mt-10 entre secciones (space-y-4 en contenedor), el spacing visual entre secciones es consistente (~40px en desktop).
- [ ] **[Visual]** Las listas de items (<ul>) usan pl-6 para padding-left (indent de bullets), lista en sección 2 y sección 4 alineadas correctamente.
- [ ] **[Visual]** Strong emphasis (<strong>) text renderiza con font-weight 700 (bold), visualmente prominente vs texto normal en mismo párrafo (p.e., 'responsable del tratamiento').
- [ ] **[Visual]** Los colores del componente page.tsx matchean el design system: text-slate-900 (h1/h2), text-slate-700 (body), text-slate-500 (metadata), text-emerald-700 (links interactivos).
- [ ] **[Visual]** El max-w-3xl container con mx-auto centra el contenido, verificar simetría de margins en desktop (left margin = right margin).
- [ ] **[HTML Structure]** La página usa <article> como raíz semántica, contiene <header> + múltiples <section> numerados, estructura válida sin nested articles.

> ⚠️ **Riesgo detectado en codigo:** La página de privacidad es un componente estático sin lógica dinámica, sin servidor, sin fetches, sin interactividad más allá de links. No hay validaciones de formulario, estados de carga, errores HTTP, autenticación requerida, ni operaciones transaccionales. La auditoría B09 reporta que esta página ya fue creada como parte del cumplimiento Ley 25.326. Riesgos detectados: (1) El endpoint /api/player/data-export mencionado en sección 6 debe existir y estar implementado (B09 lo confirmó), pero la página no linkea directamente a él — usuarios deben saberlo del texto. (2) La fecha 'Última actualización: 25 de mayo de 2026' está hardcoded; no hay mecanismo automático de actualización. (3) No hay versioning de la política en el JSX (el doc18 menciona players.terms_version, pero esta página no renderiza versión). (4) El link a /terms y /privacy son interno Next.js Link (correctos), pero no hay validación en tiempo de build que ambas rutas existan. (5) En caso de que el contenido legal sea modificado, no hay DPA (Data Processing Agreement) template mencionado en la página (según doc18 §10, es documento separado). Ninguno de estos son bugs UI/UX sino consideraciones operativas/legales.

---

### 34. Terminos y condiciones
**URL:** `/terms` · **Archivo:** `src/app/(public)/terms/page.tsx`

- [ ] **[Render]** Cargar /terms en el navegador: la página debe renderizar con título h1 'Términos y Condiciones', fecha de actualización '25 de mayo de 2026' y 10 secciones numeradas (1-10).
- [ ] **[Render]** Verificar que se renderiza el componente SiteNav (sticky header) con logo TurnoGol, links 'Explorar', 'Para complejos', botón 'Ingresar' y que sea navegable.
- [ ] **[Render]** Verificar que se renderiza SiteFooter (footer oscuro) con copyright del año actual, logo TG y links a /explorar, /login, /privacy, /terms visibles.
- [ ] **[Render]** Verificar estructura semantic: <article> contiene <header> y 10 <section> ordenadas; cada sección con <h2> numerado + párrafos/listas <ul> con <li>.
- [ ] **[Metadata]** Verificar que las etiquetas meta en <head> incluyen: title='Términos y Condiciones · TurnoGol', description='Términos de uso de la plataforma TurnoGol.', lang='es'.
- [ ] **[Metadata]** Verificar que robots.txt permite /terms (userAgent='*', allow=['/terms']) y que sitemap.xml incluye la ruta con priority=0.3 y changeFrequency='yearly'.
- [ ] **[Contenido]** Sección 1 (Objeto del servicio): verificar que menciona 'intermediario tecnológico', 'TurnoGol no es la cancha', 'MercadoPago' como procesador.
- [ ] **[Contenido]** Sección 2 (Responsabilidad del complejo): verificar que lista 5 puntos de responsabilidad del complejo, menciona 'ADR-011' y facturación AFIP fuera de alcance.
- [ ] **[Contenido]** Sección 3 (Declaración jurada +18): verificar que menciona 'mayor de 18 años', 'ADR-012' y consecuencia de suspensión de cuenta.
- [ ] **[Contenido]** Sección 4 (Pagos): verificar que menciona 'seña' que va a MP del complejo directamente, 'suscripción SaaS' recurrente, procedimiento de disputa.
- [ ] **[Contenido]** Sección 5 (Cancelaciones): verificar que explica que el complejo define la política, ventana mínima de cancelación configurable, y que TurnoGol es herramienta técnica.
- [ ] **[Contenido]** Sección 6 (SaaS B2B): verificar que lista 3 planes (Predio 1-3 canchas, Complejo 4-6, Estadio 7+), menciona cobro mensual, ciclo 'past_due' y 'suspended', retención 90 días en estado 'churned'.
- [ ] **[Contenido]** Sección 7 (Suspensión/Baja): verificar que lista 4 casos de suspensión, menciona 'banned' global y bans específicos por complejo, email privacidad@turnogol.app para apelación.
- [ ] **[Contenido]** Sección 8 (Limitación de responsabilidad): verificar que limita responsabilidad sobre disputas, MercadoPago, SLA 0.5% mensual (doc5), daños indirectos.
- [ ] **[Contenido]** Sección 9 (Ley aplicable): verificar que menciona 'República Argentina' y 'Ciudad Autónoma de Buenos Aires' como jurisdicción, Ley 24.240 de Defensa del Consumidor.
- [ ] **[Contenido]** Sección 10 (Cambios): verificar que menciona notificación por email 30 días antes, próxima aceptación al ingresar, link a /terms y email privacidad@turnogol.app.
- [ ] **[Links internos]** Hacer click en link href='/terms' (en sección 10): debe mantener en la misma página /terms sin recarga visible.
- [ ] **[Links internos]** Verificar que todas las instancias del link a /terms usan <Link> de Next.js (no <a href>) en el código fuente.
- [ ] **[Links externos - Email]** Hacer click en mailto:privacidad@turnogol.app (aparece 3 veces): debe abrir cliente de email con TO prefilled, sin errors en consola.
- [ ] **[Links externos - Email]** Verificar que los 3 links mailto:privacidad@turnogol.app (secciones 7, 10) usan <a> con href correcto y clase 'text-emerald-700 hover:underline'.
- [ ] **[A11y - Teclado]** Navegar con Tab desde el inicio: order debe ser SiteNav > articulo content > footer, con foco visible en cada link (h1 no debe recibir foco, es decorativo).
- [ ] **[A11y - Teclado]** Hacer Tab a cada link (internos y externos): Enter debe activarlos; Tab+Shift debe ir hacia atrás.
- [ ] **[A11y - Lectores de pantalla]** Verificar que la página tiene rol <article> implícito, header con h1, 10 <section> con h2, estructura de heading jerárquica (h1 > h2, sin h3/h4).
- [ ] **[A11y - Lectores de pantalla]** Verificar que <main id='main-content'> es accesible y que el skip link 'Saltar al contenido' (sr-only focus:not-sr-only) funciona con Enter.
- [ ] **[A11y - Contraste]** Verificar que h1/h2 (text-slate-900, font-bold) cumplen WCAG AA sobre fondo bg-background (white). Verificar links (text-emerald-700) sobre fondo cumplen AA.
- [ ] **[A11y - Listas]** Verificar que las 5 listas <ul class='list-disc'> (secciones 2, 7, 6, 8, y Privacy) tienen <li> accesibles con bullets visibles, sin overflow.
- [ ] **[Responsive - Mobile]** Viewport 375x667 (iPhone SE): verificar padding px-4 aplica, max-w-3xl respeta, h1 (text-3xl en mobile) es legible, no overflow horizontal.
- [ ] **[Responsive - Mobile]** En mobile, verificar que SiteNav se adapta (hidden md:flex para 'Para complejos', logo y 'Ingresar' visibles), footer es flex-col en mobile.
- [ ] **[Responsive - Tablet]** Viewport 768x1024 (iPad): verificar padding px-6, h1 sigue legible, sticky header funciona sin jank, footer es flex-row con gap-4.
- [ ] **[Responsive - Desktop]** Viewport 1920x1080: verificar max-w-3xl centra el contenido, h1/h2 (text-4xl/text-xl) son proporcionados, spacing (mt-10, space-y-4) es consistente.
- [ ] **[Visual - Spacing]** Verificar que header.mb-10 crea espacio entre h1 y primer párrafo, space-y-4 entre párrafos en sections, mt-10 entre secciones consecutivas.
- [ ] **[Visual - Typography]** Verificar que h1 es 'text-3xl sm:text-4xl font-bold tracking-tight', párrafos son 'text-slate-700', subtítulo es 'text-sm text-slate-500', links son 'text-emerald-700'.
- [ ] **[Visual - Listas]** Verificar bullets de listas (list-disc pl-6 space-y-1) se alinean bien, no hay indentación excesiva, items son legibles en mobile/tablet/desktop.
- [ ] **[Visual - Colores]** Verificar fondos: article bg-background (white), footer bg-slate-950 (muy oscuro), header border-b border-slate-200, todos los textos legibles sin glitch de color.
- [ ] **[Visual - Overflow]** Verificar que max-w-3xl + padding evita líneas muy largas (>80 caracteres por línea), el contenido no overflow en ningún viewport.
- [ ] **[Navegacion - Breadcrumb]** Verificar que no hay breadcrumb en la página (es ruta top-level /terms, no anidada como /[slug]/reservar).
- [ ] **[Navegacion - SiteNav]** Hacer click en logo 'TurnoGol' en SiteNav: debe navegar a / y volver desde /terms sin error.
- [ ] **[Navegacion - SiteNav]** Hacer click en 'Explorar': debe navegar a /explorar desde /terms, luego back() del navegador vuelve a /terms.
- [ ] **[Navegacion - SiteNav]** Hacer click en 'Para complejos': debe navegar a /para-complejos (hidden en mobile, visible en sm:), luego volver a /terms con history.back().
- [ ] **[Navegacion - SiteNav]** Hacer click en botón 'Ingresar': debe navegar a /login desde /terms, no debe requerir autenticación previa.
- [ ] **[Navegacion - Footer]** Hacer click en 'Explorar' en footer: debe navegar a /explorar desde /terms.
- [ ] **[Navegacion - Footer]** Hacer click en 'Privacidad' en footer: debe navegar a /privacy desde /terms.
- [ ] **[Navegacion - Footer]** Hacer click en 'Términos' en footer: debe mantener en /terms (refresh implícito o no-op).
- [ ] **[Navegacion - Browser]** Desde /terms, presionar back del navegador: debe volver a la página anterior (ej. / o /explorar, según el historial).
- [ ] **[Navegacion - Browser]** Desde /terms, presionar forward del navegador (tras haber presionado back): debe avanzar de vuelta a /terms.
- [ ] **[Carga]** Cargar /terms directamente vía URL: debe resolver 200 OK con Content-Type text/html, sin redirects.
- [ ] **[Carga]** Medir tiempo de carga: TTFB < 500ms, FCP < 1s, LCP < 2s (métricas Web Vitals para página estática).
- [ ] **[Carga]** En slow 3G (Devtools throttle): página debe ser navegable en < 10s, contenido legible incluso si imágenes no cargan (no hay imágenes en /terms).
- [ ] **[Error - 404 original]** Desde /terms, cambiar URL a /termss (typo): debe recibir 404 Not Found, error boundary Publicmonado muestra ErrorState.
- [ ] **[Error - 404 recovery]** En error 404, hacer click en 'Explorar complejos' (en el error boundary): debe navegar a /explorar sin estado de error persidente.
- [ ] **[Sesion - Anonimo]** Acceder a /terms como usuario anónimo (sin JWT): debe renderizar la página íntegra sin pedir login (es public).
- [ ] **[Sesion - Con JWT jugador]** Acceder a /terms con JWT player_id válido en cookie: debe renderizar la página sin cambios, botón 'Ingresar' se mantiene (no cambia a 'Perfil' ni datos del jugador).
- [ ] **[Sesion - Con JWT admin]** Acceder a /terms con JWT admin (tenant_id válido) en cookie: debe renderizar la página sin cambios, botón 'Ingresar' se mantiene, no hay redirect a /admin.
- [ ] **[Sesion - Sesión expirada]** Acceder a /terms, esperar a que JWT expire (mock/fake expiry), refrescar: página debe seguir siendo accesible, no hay error de auth.
- [ ] **[Deep link]** Enviar a otro usuario link completo https://turnogol.app/terms: debe abrirse sin error, renderizar idéntico, sin requerimiento de autenticación.
- [ ] **[Deep link - Fragmento]** Acceder a /terms#7 (hash a sección 7): debe hacer scroll a la sección 'Suspensión y baja de cuenta' (behavior: auto/smooth), URL mantiene el hash.
- [ ] **[Persistencia]** Cargar /terms, refrescar F5: debe mantener toda la estructura y contenido, sin recarga visible (SSG static generation esperado).
- [ ] **[Persistencia]** Cargar /terms, navegar a /privacy, volver a /terms con back: debe renderizar /terms sin estado adicional guardado en sessionStorage (stateless).
- [ ] **[Cache]** Verificar que /terms NO tiene Cache-Control (es ruta estática del layout public, no es /api/public/*). Responsabilidad de Vercel CDN.
- [ ] **[Cache]** Verificar en DevTools: Network tab muestra /terms como cached (status 304) en segunda visita, si la CDN lo permite (Vercel default behavior).
- [ ] **[Multi-idioma]** Verificar que la página está íntegra en español (títulos, contenido, links). No hay selector de idioma ni fallback a inglés (es Argentina-only en v1).
- [ ] **[Legal - Actualizacion]** Verificar que la fecha 'Última actualización: 25 de mayo de 2026' se muestra en el header y es consistente en ambas secciones que la mencionan.
- [ ] **[Legal - Citaciones internas]** Verificar que menciones a 'ADR-011', 'ADR-012', 'doc4', 'doc5' son consistentes con la arquitectura: facturación out-of-scope, mayoría de edad, SLA 0.5%.
- [ ] **[Legal - Email]** Verificar que privacidad@turnogol.app aparece en secciones 7 y 10; el href es mailto:privacidad@turnogol.app (sin espacios, sin typos).
- [ ] **[Legal - MercadoPago]** Verificar que MercadoPago aparece exactamente 3 veces: sección 1 (procesador), sección 4 (seña + suscripción), sección 8 (inconvenientes de API).
- [ ] **[SEO]** Verificar que meta Open Graph (og:type='website', og:title, og:description) están presentes en el layout root y aplicables a /terms.
- [ ] **[SEO]** Verificar que canonical URL no está explícito en /terms (Next.js auto-genera como <link rel='canonical' href='https://turnogol.app/terms'>).
- [ ] **[Validacion - HTML]** Correr validador HTML (W3C) en la página estática: debe pasar sin errores (estructura semantic correcta, no tags inválidos).
- [ ] **[Validacion - Lighthouse]** Correr Lighthouse en /terms: Accessibility >= 90, Performance >= 90 (SSG estático), SEO >= 90, Best Practices >= 90.
- [ ] **[Validacion - TypeScript]** Verificar que src/app/(public)/terms/page.tsx compila sin errores de tipo: no uses 'any', imports resuelven bien.
- [ ] **[JS - Sin interactividad]** Verificar que /terms es un Server Component pure (no 'use client'), toda la página renderiza en server, cero JS enviado al cliente (excepto layout wrappers).
- [ ] **[JS - Eventos]** Verificar que no hay onclick handlers, form submissions, useState, useEffect ni listeners en el componente TermsPage.
- [ ] **[WCAG 2.1 AA - Color contrast]** Debugear h1 (text-slate-900 = rgb(15,23,42)) sobre bg-background (white = rgb(255,255,255)): ratio 16.6:1, pasa AAA.
- [ ] **[WCAG 2.1 AA - Color contrast]** Debugear links (text-emerald-700 = rgb(4,120,87)) sobre white: ratio 6.5:1, pasa AA strict.
- [ ] **[WCAG 2.1 AA - Color contrast]** Debugear párrafos (text-slate-700 = rgb(55,65,81)) sobre white: ratio 7.5:1, pasa AA strict, legible en todos los viewports.
- [ ] **[Link validation]** Hacer click en cada link <a> y <Link> y verificar que no hay 404, 5xx, ni broken hrefs: /explorar, /privacy, /terms, /login, /para-complejos, /.
- [ ] **[Link validation]** Verificar que los links internos usan href relativo (/terms, /privacy) y no absoluto (turnogol.app/terms), permitiendo dev/staging.
- [ ] **[Performance - TTFB]** Medir Time-to-First-Byte para /terms en production Vercel: debe ser < 100ms (SSG pre-built).
- [ ] **[Performance - Bundle]** Verificar que el bundle JS para /terms no incluye librerías innecesarias (ej. no hay Drizzle, no hay React Query, minimal icons desde lucide).
- [ ] **[Performance - Image]** Verificar que no hay <Image> sin lazy loading (actual: no hay imágenes en /terms, pero heredar buena práctica).
- [ ] **[Truncamiento - Contenido largo]** Verificar que párrafos muy largos (ej. sección 8 sobre limitación de responsabilidad) no truncan, se hacen text-wrap normal.
- [ ] **[Truncamiento - Títulos]** Verificar que h1 'Términos y Condiciones' y h2 (max 50 caracteres) no truncan en mobile, padding/wrapping es correcto.
- [ ] **[Layout - Article wrapper]** Verificar que <article> con mx-auto max-w-3xl py-12 crea margen superior/inferior, no se pega al header/footer.
- [ ] **[Layout - Sticky header]** Verificar que header.sticky top-0 z-30 no cubre el contenido al hacer scroll, footer aparece cuando se scrollea al final sin overlaps.
- [ ] **[Layout - Main landmark]** Verificar que <main id='main-content'> está correctamente anidado en layout: <html> > <body> > <header> > <main> > content > <footer>.
- [ ] **[Email links - Mailto]** En mailto:privacidad@turnogol.app, verificar que se abre cliente de email (Outlook, Gmail, etc.) sin leakage de datos a terceros.
- [ ] **[External links]** Verificar que no hay <a> con rel='nofollow' en /terms (todos los links son internos o mailto, no hay SEO penalty esperado).
- [ ] **[Tipografia - Readability]** Verificar que font-size base es 16px (Inter font), line-height es hereda normal (~1.5), spacing es legible para lectura sostenida.

> ⚠️ **Riesgo detectado en codigo:** Riesgos detectados: (1) La página es completamente estática; no hay validación del lado del servidor a nivel de schema, pero el contenido está hardcoded. No hay riesgo de inyección SQL/XSS porque es SSG. (2) Los links mailto:privacidad@turnogol.app pueden cambiar en el futuro (email rotativo?); no hay valor del env. (3) Fecha de actualización es hardcoded ('25 de mayo de 2026'); riesgo si se olvida actualizar en futuros cambios de T&C. (4) No hay versionado de T&C ni changelog; el documento no indica qué cambió desde la anterior versión. (5) ADR-011 y ADR-012 se mencionan como referencias pero no son links a docs (acceptable para legal, pero reduce discoverability). (6) La página NO tiene patrón de consentimiento de aceptación explícita en formulario; es informativa solamente (el consentimiento se captura en el signup del jugador, no en /terms). (7) No hay header de caching explícito; la CDN Vercel lo maneja automáticamente (revalidate en sitemap.ts = 3600s sugiere revalidation periodic).

---

### 35. Mock MercadoPago (solo testing)
**URL:** `/mock-mp/checkout` · **Archivo:** `src/app/mock-mp/checkout/page.tsx`

- [ ] **[Render]** Cargar /mock-mp/checkout con MP_MOCK_MODE=1 y booking ID válido: debe mostrar banner amarillo "Entorno de prueba (MOCK) — no se cobra dinero real", tarjeta blanca con "Pago de seña" como título, datos de la reserva (complejo, cancha, fecha, horario, seña) en sección gris, y 3 botones verdes/rojos/gris sin disabled.
- [ ] **[Render]** Verificar que el formato de seña es $X.XX (ej: 10000 centavos → "$100,00" con locale es-AR, coma como separador decimal).
- [ ] **[Render]** Verificar que la hora muestra solo HH:MM (ej: 10:30–11:30) sin segundos ni zona horaria.
- [ ] **[Render]** Confirmar que el ID de reserva aparece en texto pequeño gris al pie de la tarjeta en formato UUID válido.
- [ ] **[Render]** Verificar que el fondo es neutro, la tarjeta tiene shadow-sm y border-slate-200, los textos usan colores slate según jerarquía (slate-400 label, slate-800 valor, slate-900 total).
- [ ] **[Happy path]** Hacer clic en "Pagar (aprobado)": debe hacer POST a /api/webhooks/mercadopago?tenant={tenantId} con payload tipo 'payment', outcome 'approved', esperar respuesta 2xx, luego redirigir a /reserva/{bookingId}/exito sin error.
- [ ] **[Happy path]** Hacer clic en "Pago rechazado": debe hacer POST a /api/webhooks/mercadopago con payload outcome 'rejected', luego redirigir a /reserva/{bookingId}/error.
- [ ] **[Happy path]** Hacer clic en "Cancelar": debe redirigir a /reserva/{bookingId}/error SIN hacer POST al webhook.
- [ ] **[Validacion]** Acceder a /mock-mp/checkout sin parámetro ?booking=: debe retornar 404 (notFound).
- [ ] **[Validacion]** Acceder a /mock-mp/checkout?booking=invalid-uuid (no es UUID válido): debe retornar 404 (validacion Zod en parseBookingId falla).
- [ ] **[Validacion]** Acceder a /mock-mp/checkout?booking={uuid-valido-inexistente}: debe retornar 404 (loadBookingSummary retorna null).
- [ ] **[Validacion]** Acceder a /mock-mp/checkout?booking= (string vacío): debe retornar 404.
- [ ] **[Validacion]** Acceder a /mock-mp/checkout?booking=00000000-0000-0000-0000-000000000000 (UUID todas ceros, valido sintacticamente): debe retornar 404 (booking no existe en DB).
- [ ] **[Validacion]** Intentar enviar form con booking modificado a mano (ej: <input value="otro-uuid">): parseBookingId debe validar contra Zod, rechazar si no es UUID válido, retornar 404.
- [ ] **[Vacio]** Si una booking existe pero deposit_amount es 0: debe mostrar "$0,00" sin errores, los botones deben funcionar igual.
- [ ] **[Vacio]** Si court_name o tenant_name son strings vacíos: debe mostrar la celda vacía sin quiebre de layout.
- [ ] **[Carga]** Verificar que NO hay skeleton, spinner ni disabled state durante la carga inicial (page.tsx es async pero ejecuta antes de renderizar).
- [ ] **[Carga]** Al hacer clic en botón Pagar: el botón debe estar habilitado (NO disabled), la navegación es optimista via redirect() (no hay loading visual esperado en esta arq).
- [ ] **[Error 404]** Acceder a /mock-mp/checkout cuando MP_MOCK_MODE ≠ '1': debe retornar 404 en el middleware/notFound().
- [ ] **[Error 404]** Acceder a /mock-mp/checkout cuando MP_MOCK_MODE = '0': debe retornar 404.
- [ ] **[Error 404]** Acceder a /mock-mp/checkout cuando env var no existe (undefined): debe retornar 404 (interpretado como falso).
- [ ] **[Error Red/Timeout]** Simular que el POST a /api/webhooks/mercadopago falla (timeout, 500, conexion perdida): las actions mockPay y mockReject logean warning en Sentry, pero redirects ocurren igual a /exito o /error (no reintenta, no muestra error al usuario, fire-and-forget).
- [ ] **[Error Red/Timeout]** Si el webhook POST devuelve 4xx (400 missing tenant, 401 invalid signature): la action loguea warning, redirige igual (el usuario no ve error, pero booking queda en pending_payment).
- [ ] **[Error 400/401]** Si el webhook recibe ?tenant= vacío: debe retornar 400 (missing tenant en route.ts), la action loguea pero redirige igual.
- [ ] **[Error 401]** Si el webhook recibe header x-webhook-secret inválido: debe retornar 401 (verifyWebhookSecret falla), la action loguea pero redirige igual (intent: las actions no validan respuesta webhook en tiempo real).
- [ ] **[Permisos]** La página NO tiene protección de auth (no es ruta admin ni player): cualquiera con URL válida puede acceder (testing/public).
- [ ] **[Permisos]** Las actions usan guardMockMode() como defense-in-depth: si alguien intenta llamar mockPay() en producción (MP_MOCK_MODE ≠ '1'), debe retornar 404 antes de procesar.
- [ ] **[Permisos]** Las actions reemplazan el bookingId del form → imposible explotar: parseBookingId valida contra Zod antes de resolveTenantId.
- [ ] **[Sesion]** No hay mecanismo de sesión en esta página (no hay auth, es testing only): no aplica token expiry, refresh, logout.
- [ ] **[Sesion]** El contexto de tenant se pasa via ?tenant={tenantId} en el webhook, no via sesión: desacoplado de auth.
- [ ] **[Doble submit]** Hacer clic dos veces rápido en "Pagar": ambos POSTs se envían (no hay debounce en el button), ambas redirects ocurren (la primera win-race), la segunda puede causar navegacion doble o flash (no hay guard de idempotencia en UI).
- [ ] **[Doble submit]** Alternar clicks entre "Pagar" y "Cancelar" rápidamente: el último clic prevalece, pero si ambos se envían, los POSTs pueden cruzarse en flight.
- [ ] **[Concurrencia]** Abrir 2 tabs con el mismo booking en mock checkout: ambas pueden hacer clic en Pagar simultáneamente, generando 2 webhooks con mismo event ID (processed_webhooks maneja deduplicacion, no UI).
- [ ] **[Responsive]** Vista en mobile (375px): la tarjeta debe estar centrada con px-4, max-w-md limita ancho, botones full-width (w-full h-11), textos readables sin overflow.
- [ ] **[Responsive]** Vista en tablet (768px): max-w-md mantiene ancho fijo, centrado horizontal, padding exterior adecuado.
- [ ] **[Responsive]** Vista en desktop (1920px): max-w-md mantiene ancho fijo, centrado en viewport, no hay horizontal scroll.
- [ ] **[A11y]** Verificar que los botones tienen labels descriptivos: "Pagar (aprobado)", "Pago rechazado", "Cancelar" (sin aria-label adicionales, confían en botón nativo).
- [ ] **[A11y]** La etiqueta de "Entorno de prueba" tiene aria-hidden="true" en el emoji: verificar que no afecta foco ni anuncio de screenreader.
- [ ] **[A11y]** Los botones deben ser focusables vía Tab, visibles con outline visible cuando tienen foco (check contraste botón rojo sobre blanco).
- [ ] **[A11y]** Verificar orden de tabulacion: form arriba, botones en orden visual (Pagar → Rechazar → Cancelar), ID de reserva al pie (no debe estar en tab order si no es interactivo).
- [ ] **[A11y]** El texto "Seña" tiene font-semibold, el monto tiene font-bold: verificar que el contraste cumple WCAG AA (slate-700 vs slate-50, y slate-900 vs slate-50).
- [ ] **[A11y]** Verificar que el form NO tiene autocomplete indeseado (hidden input booking, no hay inputs de usuario).
- [ ] **[Persistencia]** Refresh F5 en /mock-mp/checkout?booking={id}: debe renderizar igual (force-dynamic + query param, no session state).
- [ ] **[Persistencia]** Navegacion atras desde /reserva/{id}/exito → debe volver a /mock-mp/checkout con estado renderizado igual (server-side, sin contexto local).
- [ ] **[Navegacion]** Clic en botón Pagar redirige a /reserva/{id}/exito: verificar que la URL es exacta, sin dobles barras, ID correctamente escapado.
- [ ] **[Navegacion]** Clic en botón Cancelar redirige a /reserva/{id}/error: URL debe ser /reserva/{id}/error, no /error.
- [ ] **[Deep link]** Acceder directamente a /mock-mp/checkout?booking={uuid}&pref=mock-pref-xxx: el parámetro pref es ignor ado en la página (usado por SDK MP real, no aquí), debe cargar igual.
- [ ] **[Deep link]** Acceder a /mock-mp/checkout?booking={uuid}&pref=&extra=foo: los parámetros extra son ignorados, la página carga con booking válido.
- [ ] **[Visual]** El banner amarillo tiene border border-amber-300, bg-amber-50, text-amber-800: verificar que es visualmente distinguible sin color (suficiente contraste).
- [ ] **[Visual]** Los 3 botones tienen heights h-11 consistentes, gaps gap-3 entre ellos, sin desbordamiento horizontal en mobile.
- [ ] **[Visual]** El botón "Pagar (aprobado)" tiene bg-emerald-600, hover:bg-emerald-700: verificar transicion suave, ningún salto en hover.
- [ ] **[Visual]** El botón "Pago rechazado" tiene border border-red-300 (no fill, solo outline): verificar que es distinguible del botón cancelar (no tiene borde visible).
- [ ] **[Visual]** El botón "Cancelar" no tiene borde ni fondo (solo hover:bg-slate-50 suave): debe parecer menos prominente que los otros dos.
- [ ] **[Visual]** La sección de detalles (dl) usa dl/dt/dd semánticos, borders para separar, no usa tabla: verificar alignment justifica bien label y valor.
- [ ] **[Visual]** Truncamiento: si tenant_name o court_name son muy largos (>30 chars), verificar que no rompen el layout (DL tiene flex justify-between gap-2, podría causar wrap).
- [ ] **[Edge]** Booking con deposit_amount negativo: formatPesos((−100)/100) = "−1,00" (mostrado como negativo). Verificar que no hay validacion en schema DB que evite esto, y UI acepta el render.
- [ ] **[Edge]** Booking con deposit_amount muy grande (999999999 centavos = $9,999,999.99): formatPesos debe renderizar sin overflow, verificar que toLocaleString no trunca.
- [ ] **[Edge]** Booking con date distante en pasado (1970-01-01): debe mostrarse sin error, sin formato relativo (show absolute date).
- [ ] **[Edge]** Booking con timeStart = '00:00:00', timeEnd = '23:59:59': debe mostrar "00:00–23:59" correctamente.
- [ ] **[Edge]** Booking con court_name = '中文' o emojis: verificar que se renderiza sin quiebre, i18n no afecta (es solo display).
- [ ] **[Edge]** Si el webhook POST falla PERO el estado de la booking fue actualizado (race condition): la action sigue redirigiendo a /exito, asumiendo éxito. No hay retry-polling en esta arq, responsabilidad del backend.
- [ ] **[Edge]** Tenant en query param del webhook POST contiene caracteres especiales: ej tenant=uuid%20con-espacio, debe ser decodificado correctamente por URL API.
- [ ] **[Edge]** El mock event ID y payment ID son determinísticos: buildMockEventId y buildMockPaymentId generan IDs basados en outcome + bookingId, no son UUIDs random, verificar que son parseable por parseMockPaymentId regex.

> ⚠️ **Riesgo detectado en codigo:** Riesgos y hallazgos detectados:

1. **Fire-and-forget webhook sin confirmacion**: Las actions mockPay/mockReject hacen POST al webhook y redirigen sin esperar respuesta exitosa. Si el webhook falla (500, timeout, etc), la action loguea warning pero redirige igual a /exito o /error, dejando al usuario en estado inconsistente. El booking quedaría en pending_payment indefinidamente. No hay retry ni feedback visual de error.

2. **Sin debounce de submit**: Hacer doble-click en cualquier botón envia dos POSTs simultaneos. Aunque processed_webhooks deduplicará por mpEventId, hay una carrera en redirects que podría causar navegación doble o flash.

3. **Validacion de UUID solo en parseBookingId**: Si alguien modifica el hidden input antes de submit (DevTools), Zod rechaza en server. Esto es correcto (defense-in-depth), pero NO hay validacion cliente que prevenga tamper obvio.

4. **tenant_id no validado contra JWT**: Las actions no verifican que el tenantId resuelto de la DB coincida con el tenant autenticado. Como no hay auth en esta página (es testing-only), esto es aceptable, pero en produccion seria un IDOR si MP_MOCK_MODE estuviera activo accidentalmente.

5. **Parámetro pref ignorado**: El URL builder incluye ?pref= pero la página no lo usa. No es bug (es intencional para compat con SDK MP real), pero puede ser confuso.

6. **Sin validacion de tenant_id resuelto**: resolveTenantId() retorna null → notFound() si booking no existe. Pero si booking existe con tenant_id válido, la action confia que la DB está consistente (FK). No hay validacion que tenant_id sea UUID válido (confia en DB schema).

7. **Webhook secret vacío en local**: process.env.MP_WEBHOOK_SECRET ?? '' significa que si env var no está seteado, se envía header vacio. El webhook chequeará signature contra '' (likely falla). No hay advertencia en logs si secret es missing.

8. **No hay error handling de JSON parse**: El webhook route.ts parsea body con await req.json(). Si ocurre error (malformed JSON), retorna 400. Las actions capturan fetch errors pero no invalidan respuesta (solo logea), así que un 400 desde el webhook se procesa silenciosamente.

9. **formatPesos usa es-AR hardcoded**: No es un bug, es intencional (TurnoGol es Argentina), pero si se deploya en otro pais, fallaría. No es parametrizable.

10. **race condition de updateAt**: Si el webhook procesa la booking entre parseBookingId y redirect, el updatedAt cambia pero UI no lo refleja. No es bug (testing page), pero notable.

---

### 36. Settings (redirect)
**URL:** `/settings` · **Archivo:** `src/app/(admin)/settings/page.tsx`

- [ ] **[Render]** Acceder a /settings sin autenticar redirige a /login en lugar de seguir el flujo.
- [ ] **[Happy path]** Usuario staff autenticado accede a /settings y es redirigido automáticamente a /settings/reservas sin demora perceptible.
- [ ] **[Happy path]** Verificar que la URL en la barra del navegador cambia de /settings a /settings/reservas después del redirect.
- [ ] **[Happy path]** El contenido de /settings/reservas se renderiza completo (formulario de políticas de reserva, pestañas, PinGate si aplica) tras el redirect.
- **[Auth/Permisos]** → Ver sección transversal [Autenticación y sesiones](#autenticacion-y-sesiones). Tests únicos de esta vista:
- [ ] **[Permisos]** Usuario staff con tenant_id faltante redirige a /onboarding en lugar de a /settings.
- [ ] **[Sesion]** Refresh de página en /settings redirige correctamente a /settings/reservas (sin loop).
- [ ] **[Tenant]** Tenant en estado 'suspended' (kill switch): acceso a /settings redirige a /suspended (no a /settings/reservas).
- [ ] **[Tenant]** Tenant en estado 'blocked': layout detecta y redirige a /suspended.
- [ ] **[Tenant]** Tenant en estado 'canceled': layout detecta y redirige a /suspended.
- [ ] **[Tenant]** Tenant en estado 'churned': layout detecta y redirige a /suspended.
- [ ] **[Tenant]** Tenant en estado 'trialing' (activo): acceso a /settings redirige normalmente a /settings/reservas.
- [ ] **[Tenant]** Tenant en estado 'past_due': acceso a /settings redirige a /settings/reservas (sin bloquear, solo alerta visual).
- [ ] **[Tenant]** Onboarding incompleto (onboarding_completed = false): redirect a /onboarding en layout, antes de settings.
- [ ] **[Navegacion]** Navegar hacia atrás en el navegador después del redirect (back button) no retorna a /settings.
- [ ] **[Navegacion]** Navegar hacia adelante después de back no causa loop de redirect.
- [ ] **[Deep link]** Acceso directo por URL a /settings con parámetros query inválidos (?foo=bar) aun redirige correctamente a /settings/reservas (query se descarta).
- [ ] **[Deep link]** Link con hash (#section) en /settings redirige a /settings/reservas sin hash (hash no se preserva).
- [ ] **[Responsive]** En mobile (viewport 375x667) el redirect a /settings/reservas ocurre sin erro de renderizado.
- [ ] **[Responsive]** En tablet (viewport 768x1024) el redirect funciona correctamente.
- [ ] **[Responsive]** En desktop (viewport 1920x1080) el redirect funciona correctamente.
- [ ] **[Error 404]** Si /settings/reservas no existe (fuera de scope, pero verificar), error 404 se muestra en lugar de bloqueo de renderizado en /settings.
- [ ] **[Error 500]** Si extractAuthUser falla (error en Supabase), layout redirige a /login (graceful fallback).
- [ ] **[Error 500]** Si getStaffTenant retorna null, layout redirige a /login.
- [ ] **[Doble submit]** Doble click o acceso rápido a /settings dos veces no causa estado inconsistente en /settings/reservas.
- [ ] **[Concurrencia]** Dos pestañas abiertas simultáneamente en /settings redirigen ambas a /settings/reservas sin conflicto de estado de tenant.
- [ ] **[PinGate]** Tenant con PIN configurado: /settings redirige a /settings/reservas, que requiere PIN en PinGate antes de renderizar el formulario.
- [ ] **[PinGate]** Tenant sin PIN configurado: /settings redirige a /settings/reservas, que renderiza el formulario directamente (PinGate es no-op).
- [ ] **[Accesibilidad]** Redirect no genera cambios de foco inesperados; screen reader no anuncia duplicados del heading 'Configuración' tras redirect.
- [ ] **[Consistencia]** El redirect preserva la autenticación: la sesión del usuario staff permanece válida en /settings/reservas.
- [ ] **[Visual]** No hay parpadeo, flash o FOUC entre el redirect desde /settings a /settings/reservas.

> ⚠️ **Riesgo detectado en codigo:** Riesgos mínimos en esta vista ultra-simple. (1) El redirect() en el root settings/page.tsx es síncrono y lanza una excepción Next's NEXT_REDIRECT control-flow, lo cual es el patrón esperado; sin embargo, si hubiera algún error en la cadena de autenticación antes, podría no llegar nunca aquí. (2) El layout protege correctamente pero si tenant.id faltara, getStaffTenant retornaría null y se redirige a /login (correcto). (3) Sin PinGate en settings/page.tsx mismo (lo tiene /settings/reservas), no hay lockout de acceso a la carpeta /settings, lo cual es arquitecturamente correcto. (4) No hay validación de tenant_status en settings/page.tsx (delegada al layout y kill-switch), lo cual es el patrón. (5) Verificar que /settings/reservas siempre existe en el árbol de rutas; si fuera eliminada, redirect roto.

---

## 🧪 Tests Generales Extras

> Pruebas transversales que cruzan multiples vistas. Aplican a todo el producto.

### Seguridad

- [ ] **[RLS - Admin]** Auditor ingresa como admin de Complejo A, intenta consultar GET /api/bookings con bookingId perteneciente a Complejo B; valida que la respuesta sea 404 (no 200 con datos de B).
- [ ] **[RLS - Admin]** Auditor ingresa como admin de Complejo A, intenta PATCH /settings/reservas con validaciones internas de RLS; verifica que los datos guardados solo afecten settings de Complejo A, nunca de B.
- [ ] **[RLS - Player]** Dos jugadores A y B en mismo complejo; A intenta GET /api/player/bookings/[B's booking id] → validar 404 (RLS oculta la reserva de B).
- [ ] **[RLS - Player]** Player A intenta POST /api/player/bookings/[B's booking id]/cancel sin autenticación válida o con JWT falso → 401/403, sin mutar datos de B.
- [ ] **[IDOR - Balance Block]** Player A con balance > 0 en Complejo X intenta crear reserva online en ese complejo; verificar que reciba error de bloqueo y que la reserva NO se cree.
- [ ] **[IDOR - Balance Block]** Player B con balance > 0 en Complejo X pero balance == 0 en Complejo Y intenta reservar en Y → debe permitirse; valida que el bloqueo sea per-tenant, no global.
- [ ] **[IDOR - Booking Detail]** Admin de Complejo A intenta POST /api/bookings/[id from B]/cancel con status confirmed; valida que no aparezca en la grilla de A ni se mutase ningún estado de B.
- [ ] **[IDOR - Staff Enumeration]** Auditor obtiene JWT staff válido de Complejo A; intenta cambiar email de miembro staff de B via POST /api/staff [sin endpoint, verifica via staff/actions] → debe fallar con auth/404.
- [ ] **[Encryption - MP Tokens]** Auditor inspecciona base de datos y confirma que mp_access_token y mp_refresh_token en tabla tenants están cifrados (no en plaintext), usando AES-256-GCM.
- [ ] **[Encryption - MP Tokens]** Auditor intenta descargar un token encriptado, lo modifica en la base, y verifica que decrypt() lance excepción (verificar que el tag de autenticación proteja contra tampering).
- [ ] **[CSP - Headers]** Browser genera una solicitud GET a /admin/grilla con origen cruzado intencionalmente; valida que Content-Security-Policy bloquee inline scripts y solo permita 'self'.
- [ ] **[CSP - Reporting]** Auditor inspecciona el header Content-Security-Policy y verifica presencia de report-uri y report-to (ambos apuntan a /api/csp-report).
- [ ] **[HSTS]** Auditor inspecciona response headers en HTTPS y confirma presencia de Strict-Transport-Security con max-age >= 63072000 e includeSubDomains.
- [ ] **[X-Frame-Options]** Browser intenta cargar /admin/grilla dentro de <iframe src=...> desde origen cruzado; valida que X-Frame-Options: DENY bloquee el frame.
- [ ] **[CSRF - Fetch Metadata]** Auditor ejecuta POST a /api/bookings/[id]/cancel desde <form> en sitio malicioso (origin: attacker.com); middleware valida Sec-Fetch-Site === 'cross-site' y rechaza con 403.
- [ ] **[CSRF - Server Action]** Auditor intenta ejecutar Server Action updateReservasPolicyAction sin Sec-Fetch-Site header o con 'cross-site'; valida que Next.js rechace la mutación.
- [ ] **[XSS - Tenant Name]** Admin crea un complejo con nombre: <img src=x onerror='alert(1)'>, luego ingresa en /configuracion y verifica que el nombre se escapa correctamente en HTML (sin ejecutar JS).
- [ ] **[XSS - Cancellation Note]** Admin cancela una reserva con nota: <svg onload=alert(1)>, jugador intenta ver detalles; verifica que la nota se escape y el script nunca se ejecute.
- [ ] **[XSS - Review]** Player deja una review con texto: <script>fetch('http://attacker')</script>, otros players leen la review; valida que el script se escape y nunca se ejecute.
- [ ] **[Enumeration - Slug]** Auditor intenta GET /api/public/complex/invalid-slug-zzz123; valida que la respuesta sea 404 sin fugar lista de slugs válidos ni estructura de BD.
- [ ] **[Enumeration - Email]** Auditor intenta POST /api/auth/login con email no-registrado vs registrado; valida que el tiempo de respuesta y el mensaje de error sean idénticos (no fugar existencia de email).
- [ ] **[Rate Limit - Magic Link]** Auditor ingresa el mismo email 6 veces en /login en 60 segundos; valida que la 6a solicitud reciba 429 con header Retry-After.
- [ ] **[Rate Limit - PIN Brute Force]** Auditor intenta verificar 6 PINs diferentes en 5 minutos en /settings/pin; valida que el 6o intento bloquee con retryAtMs futuro.
- [ ] **[Rate Limit - Public Availability]** Auditor ejecuta 31 GET /api/public/availability desde la misma IP en 60 segundos; valida que la 31a reciba 429.
- [ ] **[PIN Exposure]** Auditor verifica logs de aplicación (Sentry, stdout) cuando se ejecuta verifyPinAction con PIN correcto; valida que el PIN NUNCA aparezca en logs (ni como parámetro ni en mensajes).
- [ ] **[PIN Exposure]** Auditor ejecuta network trace durante PIN gate y verifica que el PIN se transmita en HTTPS POST a Server Action (no en URL query string).
- [ ] **[robots.txt - Sensitive Paths]** Auditor solicita GET /robots.txt; valida que /admin/*, /super-admin/*, /configuracion, /eliminar-cuenta estén en disallow.
- [ ] **[robots.txt - Meta Tag]** Auditor accede a /suspended y /mock-mp/checkout; verifica que metadata.robots = { index: false, follow: false } en el HTML (o robots=noindex,nofollow).
- [ ] **[Tenant Status - Access]** Tenant en estado 'suspended' o 'blocked' intenta acceder a /dashboard; auditor valida que el middleware redirige a /suspended sin mostrar datos del panel.
- [ ] **[Tenant Status - Access]** Tenant en estado 'past_due' accede a /dashboard; auditor valida que vea un banner de alerta pero el panel permanezca accesible (no redireccionado).
- [ ] **[Booking Status Enum]** Auditor inspecciona el schema y el UI; valida que NUNCA aparezca estado 'cancelled' (doble L) — debe ser 'canceled' (una L) en toda la aplicación.
- [ ] **[Redirect Safety]** Auditor inspecciona sendPlayerMagicLink y verifica que sanitizeNext() bloquea redirects a '//attacker.com' y '/\\x' (doble barra/barra-backslash).
- [ ] **[Mock MP Guard]** Auditor intenta POST a /mock-mp/checkout/pay en producción; valida que guardMockMode() lance 404 si MP_MOCK_MODE !== '1'.
- [ ] **[Idempotency - Webhook]** Auditor envía el mismo webhook de MercadoPago dos veces con idempotency key; verifica que processed_webhooks evite procesar duplicados (solo una mutación).
- [ ] **[Idempotency - Cancellation]** Auditor cancela la misma reserva dos veces en rápida sucesión (POST /api/bookings/[id]/cancel); valida que la segunda reciba 409 (conflict) sin refundar dos veces.
- [ ] **[Player Anonymization]** Player ejecuta DELETE /eliminar-cuenta; auditor verifica que players.status = 'anonymized' y que los datos personales (firstName, lastName) se reemplacen por valores genéricos.

> ⚠️ **Nota:** Hallazgos de seguridad detectados:

1. **SET LOCAL implementado correctamente**: Middleware de RLS usa SET LOCAL app.current_tenant_id y app.current_player_id con transacciones, lo que evita fuga cross-tenant (líneas 86-87 en client.ts).

2. **Encryption at-rest verificado**: AES-256-GCM con IV, tag y ciphertext (líneas 11-17 en encrypt.ts); el tag previene tampering.

3. **CSP strict en producción**: Content-Security-Policy bloquea eval/inline; en dev se relaja solo para webpack HMR. X-Frame-Options: DENY, HSTS, X-Content-Type-Options: nosniff configurados (next.config.js).

4. **Fetch Metadata CSRF**: Middleware valida Sec-Fetch-Site === 'cross-site' en mutaciones sensibles (/api/billing, /api/bookings, /api/player/bookings) con rechazo 403 (middleware.ts línea 36-46).

5. **Rate limiting multi-política**: authMagicLink (5/60s por email), authVerify (10/60s por IP), pinAttempts (5/5m por tenant) con failMode=closed (denegar en outage); publicAvailability (30/60s por IP) con failMode=open.

6. **PIN brute-force**: 5 intentos cada 5 minutos por tenant (10k combinaciones = ~7 días exhaustivo), cookie HttpOnly+Secure, rotatoria por sesión (verifyPinAction líneas 37-46).

7. **robots.txt correcto**: Disallow: /api/, /admin/, /super-admin/, /player/, /login, /register, /onboarding, /mock-mp (robots.ts). Meta tag robots en /suspended y /mock-mp (index: false, follow: false).

8. **Safe redirect**: sanitizeNext() bloquea '//', '/\\' y paths sin '/' (safe-redirect.ts).

9. **Enum corrección**: bookingStatusEnum usa 'canceled' (una L), nunca 'cancelled' (doble L) (enums.ts línea 44-52).

10. **Mock MP guard**: guardMockMode() 404 si MP_MOCK_MODE !== '1' (mock-mp/checkout/actions.ts línea 19-23).

11. **Player-tenant isolation**: player_tenant_relationships.balance bloquea reservas online si > 0 (per-tenant). RLS dual en bookings (admin vía app.current_tenant_id, player vía app.current_player_id).

12. **idempotency webhook**: processed_webhooks previene procesos duplicados de MercadoPago.

13. **PIN no expuesto**: verifyPinAction no loguea el PIN, solo attemptsLeft. Transmisión via HTTPS POST body en Server Action.

Riesgos potenciales observados:
- No hay rate limiting en POST /api/public/complex/[slug] (enumeración de slugs viable pero endpoint es GET cacheado).
- POST /api/admin/metrics no valido en lectura de archivos.
- Balance field en player_tenant_relationships schema lista 'balance' pero en Read no la detecté asignada — podría estar faltante (verificar en queries de booking).

Sin embargo, la mayoría de defensas críticas están implementadas.

### Autenticacion y sesiones

- [ ] **[Magic Link Expiración]** Enviar magic link para admin, esperar 24h (simular vencimiento), hacer clic en /verify con code expirado → error "Este enlace expiró" mostrado en /verify, botón "Volver a intentar" redirige a /login.
- [ ] **[Magic Link Reuso]** Enviar magic link para admin, hacer clic en /verify y completar exchange exitosamente, intentar reusar el mismo code en otra pestaña → error "Este enlace ya fue utilizado" mostrado en /verify.
- [ ] **[Magic Link Token Inválido]** Acceder a /verify?code=INVALID_CODE o code='' → error "No pudimos verificar el enlace" mostrado en /verify.
- [ ] **[Magic Link Exchange Failed]** Simular fallo en Supabase auth.exchangeCodeForSession (500, timeout), hacer clic en magic link → error "exchange_failed" mostrado en /verify con mensaje "No pudimos completar el inicio de sesión".
- [ ] **[JWT Admin con tenant_id]** Login como admin del complejo Predio X, verificar en app_metadata del JWT que tenant_id está presente y correcto; verificar que cookies de sesión de Supabase (.sb-auth) tienen el JWT codificado.
- [ ] **[JWT Jugador con player_id sin tenant_id]** Login como jugador sin asociación a complejo específico, verificar en app_metadata que player_id está presente, tenantId es NULL, y type=player.
- [ ] **[Sesión Expirada Durante Checkout]** Admin inicia checkout en /reserva/[id]/pendiente, espera a que JWT expire (simular token exp claim vencido), intenta confirmar pago → debería redirigir a /login o mostrar error de autenticación.
- [ ] **[Sesión Expirada Durante Cerrar Caja]** Admin en /caja/CloseDayButton hace clic en "Cerrar caja", JWT expira durante la llamada closeDayAction, respuesta 401 (Unauthorized) → UI muestra error y redirige a /login.
- [ ] **[Refresh Token Transparente]** Admin hace login, JWT expira, hace una acción (ej: POST a API), Supabase intercepta y usa refresh token automáticamente, JWT se renueva sin que el usuario lo note (sesión continúa).
- [ ] **[Logout Invalida Sesión en Todas Pestañas]** Admin abre panel en Tab1 y Tab2 (misma sesión), hace logout desde Tab1, intenta hacer cualquier acción en Tab2 → redirige a /login (sesión Supabase invalidada globalmente).
- [ ] **[PinGate Una Vez por Sesión]** Admin login, accede a /settings/pin (requiere PIN), ingresa PIN 1234 correctamente, cookie tg_pin_session set con TTL 30m, accede a /caja sin re-pedir PIN, hace logout y vuelve a login → PinGate vuelve a pedir PIN (nueva sesión).
- [ ] **[PinGate Tras Logout]** Admin verifica PIN en /settings/pin, cookie tg_pin_session=active, hace logout, vuelve a login, accede a /settings/pin → PinGate vuelve a pedir PIN (cookie invalidada con sesión anterior).
- [ ] **[Redirect Post-Login Destino Original Deep Link]** Acceder a /settings/pin sin autenticación → redirect a /login?next=/settings/pin, hacer login, debería redirigir a /settings/pin (no a /dashboard).
- [ ] **[Redirect Post-Login Destino Open Redirect Bloqueado]** Acceder a /login?next=//malicious.com → POST login, sanitizeNext() rechaza, redirige a fallback /mis-reservas (no a malicious.com).
- [ ] **[Acceso a Ruta Admin Sin Sesión]** Acceder a /dashboard sin cookies de sesión → middleware AdminLayout valida extractAuthUser()=null, redirige a /login.
- [ ] **[Acceso a Ruta Admin con Sesión de Jugador]** Login como jugador, acceder a /dashboard → middleware valida user.type!=='staff', redirige a /login (403 implícito).
- [ ] **[Acceso a Ruta Jugador Sin Sesión]** Acceder a /mis-reservas sin cookies → middleware PlayerLayout valida user.type!=='player', redirige a /login.
- [ ] **[Acceso a Ruta Jugador con Sesión Admin]** Login como admin, acceder a /mis-reservas → middleware valida user.type!=='player', redirige a /login.
- [ ] **[PinGate Cookie Expiracion TTL]** Admin verifica PIN, cookie tg_pin_session set, espera 30m, cookie expira (TTL=30m), accede a /caja → PinGate vuelve a pedir PIN (cookie expired, timestamp > COOKIE_TTL_MS).
- [ ] **[PinGate Brute Force Rate Limit]** Admin intenta PIN incorrecto 5 veces en 5 minutos via verifyPinAction → enforce('pinAttempts', tenant.id) falla, retorna locked=true con retryAtMs, UI muestra "Demasiados intentos. Volvé a intentar en X min", botón deshabilitado hasta retry.
- [ ] **[PinGate Pin Incorrecto Intento 1]** Admin ingresa PIN 0000 (incorrecto), verifyPinAction devuelve {ok:false, error:'PIN incorrecto', attemptsLeft:4}, UI muestra error y cuenta atrás (4 intentos restantes).
- [ ] **[PinGate Sin PIN Configurado]** Tenant sin PIN configurado (staff_pin_hash=null), accede a /settings/pin → PinGate verifica pinRequired=false (deducido de !!tenant.settings.staff_pin_hash), renderiza children sin gate (no-op).
- [ ] **[Magic Link para Jugador]** Player hace login en /[slug]/reservar, recibe magic link con is_player=true + profile metadata, hace clic en /verify, auth callback extrae player_id y provisiona player en DB, redirige con next=/mis-reservas.
- [ ] **[Onboarding Redirect Sin Tenant]** Staff hace login sin tenant asignado (tenants.length=0), auth callback redirige a /onboarding, layout AdminLayout verifica tenant.settings.onboarding_completed, redirige a /onboarding si false.
- [ ] **[Multi-Tenant Staff Select Tenant]** Staff tiene acceso a 2+ tenants, auth callback redirige a /select-tenant (out of scope pero valida el enum de rutas).
- [ ] **[Session Validation During Critical Operation]** Admin en /caja/closeDayAction, JWT válido, ejecuta closeDayAction(date, declaredCents, note), transacción DB se completa, `router.refresh()` refetch data, confirmación toast muestra "Caja cerrada".

> ⚠️ **Nota:** Lectura exitosa de implementación real. Hallazgos críticos: 1) Magic link TTL controlado por Supabase (24h default), el callback valida code via exchangeCodeForSession; 2) JWT admin lleva tenant_id en app_metadata, JWT jugador lleva player_id sin tenant_id (RLS dual); 3) Refresh token automático vía Supabase client en hooks de sesión; 4) Logout via signOut() invalida sesión globalmente en Supabase; 5) PinGate es cookie firma HMAC sobre timestamp (tg_pin_session), TTL=30m, brute-force rate-limit via enforce('pinAttempts', tenant_id); 6) Deep link redirect via sanitizeNext() bloquea open-redirect (// y /\ rechazados); 7) Rutas admin/player protegidas en layout.tsx antes de render; 8) Checkout tiene ventana 15m (booking.createdAt + 15m), PaymentStatusWatcher vigila vía polling; 9) Cerrar caja es Server Action con context de tenant vía withTenantContext; 10) No hay refresh automático en tiempo real para jugador (polling/refresh manual). Todos los casos apuntan a flujos transversales: intercepción de token, invalidación global, rate-limit, deep-link hijacking, cross-role access, brute-force PIN, operaciones críticas bajo sesión expirada.

### Reservas y concurrencia

- [ ] **[Concurrencia]** Dos jugadores reservando el MISMO slot (28 min, court_id, date fijo): El FIRST POST gana (booking confirmed), el segundo recibe error SlotTakenError; exclusion constraint `no_overlapping_bookings` con WHERE status IN ('pending_payment','confirmed') lo bloquea a nivel DB y evita race condition.
- [ ] **[Exclusion Constraint]** Crear manualmente slot 15:00-16:00 cancha X el 15/6, luego intentar via API otro booking 15:30-16:30 mismo día mismo cancha: El segundo falla con SlotTakenError (23P01 violation caught en isExclusionViolation); constraint usa tsrange overlap (&&) sobre DATE + TIME.
- [ ] **[Ventana de Expiración]** Crear booking online CON seña (pending_payment, depositAmount>0, deposit_status='pending'): Esperar 15 min sin pagar → Sistema expira automáticamente vía sweep (Hallazgo 1 + 2 en code); slot se libera (cache invalidate), nuevo jugador puede reservar.
- [ ] **[Ventana de Expiración Rescheduled]** Crear booking pending_payment + una payment en status='in_process': Esperar 16 min → Job reschedula a 48h (no expira todavía); esperar total 48h01 → Ahora SÍ expira; admin notificado vía 'admin_transfer_expired'.
- [ ] **[Cambio Horarios = Slot Invalido]** Admin tiene booking pending_payment 18:00-19:00 fecha X; mientras jugador está en form de pago, admin edita closing_hours a 17:30 vía /settings/horarios: Slot ya fuera de rango visible en grilla, pero booking TX aún se completa (lock-then-check pattern, checkOverlapOrThrow lo permite si está pending).
- [ ] **[Slot en Límite Apertura]** Cancha abre a 08:00. Intentar reservar 08:00-09:00 (60 min): generateSlots produce slot si openMins (480) <= lastStart (1320-60=1260); disponible. Intentar 23:00-00:00 (120 min, close 23:00, lastStart=1260): closeMins=1380, lastStart=1260; SLOT NO GENERADO (no entra en loop start <= lastStart).
- [ ] **[Reserva 120min cruza cierre]** Cancha cierra a 23:00. Intentar 22:30-00:30 (120min): timeStart_mins=1350, timeEnd_mins=1530; close_mins=1380. checkOverlapOrThrow ejecuta tsrange overlap: ('2000-01-01'::date+'22:30'::time) && ('2000-01-01'::date+'23:00'::time) = [22:30, 00:30) && [08:00, 23:00) → NO overlap (22:30 < 23:00 pero cierre es hard stop). Slot no generado en UI.
- [ ] **[Cancelación en Límite Anticipación]** Política anticipación = 6 días. Booking confirmado para mañana a las 09:00; hoy 18:00. Jugador cancela via /reservas/[id]/cancelar: La validación de anticipación ocurre en el handler (6 días=144h), comparando createdAt vs NOW(); cancelación permitida si NOW() <= start_time - 6d. En este caso SÍ (mañana - 6d << hoy).
- [ ] **[Abonado Activo vs Reserva Puntual Mismo Slot]** Abonado lunes 18:00-19:00 ACTIVO genera booking para próx lunes. Jugador intenta simultáneamente reservar lunes 18:30-19:30 via online: checkBookingOverlap (abonado.service) falla; o exclusion constraint falla en DB. Abonado genera slot OK, individual rechazada (SlotTakenError).
- [ ] **[Doble Submit Confirmar+Pagar]** Jugador en /reserva/[id]/pendiente hace doble-click rápido en 'Confirmar y Pagar': Primer POST createDepositPayment crea `payments` row + MP preference. Segundo POST llega viendo booking.payment_method='mercadopago' + payment_id ya set → BookingNotPendingPaymentError (status NO changed en Transizione desde pending_payment a confirmed YA pasó). UX muestra error 'Pago ya iniciado'.
- [ ] **[Cambio Precio en Checkout]** Jugador abre checkout de seña ($100 ARS snapshot). Admin durante el checkout edita pricing rules vía /settings/canchas/[id]/precios: El price_snapshot de la booking se CONGELA en createOnlineBooking (calculatePrice ejecutado DENTRO del TX). MP preference usa depositAmount = snapshot * depositPct / 100 (values ya fijos en INSERT). Admin no puede cambiar seña mid-checkout.
- [ ] **[Webhook Duplicado MP]** MP envía mismo mpEventId 2 veces (timeout interno MP, retry). Primer webhook: lockMpEvent crea row en `processed_webhooks` con UNIQUE(mp_event_id); transición booking pending → confirmed. Segundo webhook (idempotent): lockMpEvent CONSTRAINT violación → webhook_idempotency no-op (processed). Una sola reserva confirmada.
- [ ] **[RLS Dual Admin vs Jugador]** Admin de Complejo A intenta SELECT bookings WHERE court_id = <cancha de Complejo B>: RLS policy `tenant_isolation_select` bloquea (tenant_id != current_tenant_id). Jugador de Player ID X intenta SELECT own booking de Complejo B (cross-tenant): policy `player_own_bookings_select` ALLOW (player_id match). Admin NUNCA ve.
- [ ] **[Balance Deudor Bloquea Online]** player_tenant_relationships.balance > 0 (saldo deudor en centavos). Jugador intenta createOnlineBooking: checkPlayerBanned verifica deuda vía PTR (si implement existe); rechaza. Si no existe balance check en code, fallará en MP authorize. Implementación debe validar balance > 0 → error antes de createBooking.
- [ ] **[Tenant Suspended Bloquea Admin]** tenant_status = 'suspended' (8 estados: trialing, active, past_due, suspended, blocked, canceled, churned, deleted). Admin intenta entrar /grilla: middleware verifica tenant.status, redirige a /suspended con motivo ('past_due', 'billing_issue', etc.). No puede crear/cancelar bookings; estado mostrado en header rojo.
- [ ] **[Deposit vs No-Deposit Flow]** Court A: deposit_mode ON, depositPct=30%. Reserva de $1000 → depositAmount=300 centavos, status='pending_payment'; requiere MP. Court B: deposit_mode OFF → depositAmount=0, deposit_status='not_required', status='confirmed' DIRECTAMENTE; sin pago. Ambas rutas testeadas: flujo completo con pago vs confirmación inmediata.
- [ ] **[PinGate Zonas Sensibles]** Admin intenta editar horarios en /settings/horarios (zona PinGate) con PIN=1234 configurado: Primer acceso del día → <PinGate> modal, pide PIN, SET context con PIN válido (sesión 1h). Segundo acceso (mismo admin) → skips modal, reutiliza contexto. Logout → limpia PIN contexto.

> ⚠️ **Nota:** Hallazgos clave en el código real: (1) booking.service.ts usa SELECT FOR UPDATE en lockCourtOrThrow (serialización de INSERTs concurrentes). (2) checkOverlapOrThrow ejecuta raw SQL con tsrange overlap (&&) sobre bookings activos (pending_payment+confirmed). (3) NO hay EXCLUDE constraint en Drizzle, pero SQL migration 004 lo define: no_overlapping_bookings con EXCLUDE USING gist y WHERE status IN (...). (4) isExclusionViolation captura code='23P01'. (5) transitionFromPendingPayment es race-safe (UPDATE con WHERE status='pending_payment' atomico). (6) lockMpEvent + processed_webhooks tabla con UNIQUE(mp_event_id) para idempotencia. (7) RLS policies en bookings: tenant_isolation_* para admin (by app.current_tenant_id), player_own_bookings_select para jugador (by app.current_player_id cross-tenant). (8) PinGate es middleware React en admin screens sensibles (canchas, reportes, settings/*). (9) Abonados genera bookings via insertBookingsForSlots, checkBookingOverlap (SQL raw) antes de INSERT. (10) tenant_status tiene 8 valores (trialing..deleted); middleware redirige a /suspended si suspended/blocked/canceled/churned.

### MercadoPago y webhooks

- [ ] **[Idempotencia]** Enviar el mismo webhook dos veces con idéntico `mp_event_id` → la segunda vez retorna `alreadyProcessed=true` sin efectos secundarios; `processed_webhooks` tiene exactamente 1 fila para ese evento.
- [ ] **[Idempotencia]** Recibir 20 webhooks idénticos concurrentemente (mismo `mp_event_id`, mismo payload) → exactamente 1 lock en `processed_webhooks` se gana (unique constraint), resto retorna duplicado sin procesar; booking transiciona a `confirmed` solo una vez.
- [ ] **[Webhook Tardío]** Booking creado, ventana de 15 min expira y se cancela automaticamente → webhook aprobado llega 20 min después → debe grabar la fila de pago (audit trail) pero NO transicionar el booking, enqueue notificacion admin de 'late_payment_attempt' con monto y status terminal.
- [ ] **[Webhook Fuera de Orden]** Recibir `rejected` (mp_event_id=X, status='rejected') → después `approved` (mp_event_id=Y, status='approved') para el MISMO `mp_payment_id` → pagina debe upsertear paymentRow segun el estado mas reciente del gateway; si came aprobado despues, la transicion del booking NO ocurre (ya esta en terminal).
- [ ] **[Monto Inconsistente]** Webhook aprobado con `amount=240000 (centavos)` pero `booking.deposit_amount=300000` → grabar pago con el monto del webhook (240000), audit log registra discrepancia, admin notificado manualmente para resolver diferencia.
- [ ] **[Firma Inválida]** POST a `/api/webhooks/mercadopago?tenant=<id>` sin header `x-webhook-secret` (o valor incorrecto) cuando `MP_WEBHOOK_SECRET` esta configurado → respuesta 401 con 'invalid signature', NO enqueue job, NO INSERT en `processed_webhooks`.
- [ ] **[Firma Válida en Dev]** `MP_WEBHOOK_SECRET` no configurado en dev/test + header vacío → webhook acepta (fail-open en non-prod), procesa normalmente, idempotencia mediante `processed_webhooks`.
- [ ] **[Firma Válida en Prod]** `MP_WEBHOOK_SECRET` no configurado en NODE_ENV=production → webhook rechaza con 401, log de intento, NO procesa.
- [ ] **[Firma Timing-Safe]** `MP_WEBHOOK_SECRET='abc'` + header='xbc' (misma longitud, 1 bit distinto) → timing-safe compare rechaza sin timing leak, respuesta 401.
- [ ] **[Tenant Mismatch - Booking]** Webhook con `tenant=A` pero gateway retorna `externalReference=bookingOfTenantB` → throw 'webhook tenant mismatch' antes de side effect, job falla, pg-boss reintenta (max 5 veces).
- [ ] **[Tenant Mismatch - SaaS Upgrade]** Webhook con `tenant=A` pero external_reference contiene `saas-upgrade:B:prePlan` (parsed tenantId=B) → throw 'webhook tenant mismatch' sin alterar preapproval de B.
- [ ] **[OAuth Token Expirado]** Webhook procesa y gateway.getPaymentStatus() retorna 401 (token expirado) → llamar refreshTenantMpToken(tenantId), obtener nuevo access_token encriptado, persistir en `tenants.mp_access_token`, reintentar getPaymentStatus() con token fresco.
- [ ] **[OAuth Token Revocado]** tenant.mp_access_token expirado + refreshMpToken falla (HTTP 401 de MP: refresh token revocado) → throw TenantMpNotConnectedError, job falla, pg-boss reintenta; admin debe reconectar OAuth desde Settings.
- [ ] **[Mock Mode - Determinístico]** `MP_MOCK_MODE=1` en ruta webhook → no cola job via pg-boss, ejecuta `handleMpWebhookJob` inline syncronamente; mock payment id `MOCK-APPROVED-<bookingId>` resuelve a 'approved' sin gateway real.
- [ ] **[Mock Mode Solo en Desarrollo]** `MP_MOCK_MODE=1` pero `process.env.NODE_ENV='production'` → LocalMockGateway activado (peligro: código mock en prod); tests deben validar que MOCK_MODE=1 solo en test/dev.
- [ ] **[Estado Front vs Backend]** Frontend muestra 'pending' (status polling aún espera), pero webhook aprobado ya llegó y backend cambió booking a 'confirmed' → polling trae response confirmada, frontend transiciona a confirmed screen con checkout exito visual.
- [ ] **[Estado Inconsistente Confirmación]** Booking en pending_payment, webhook trae 'approved' pero transitionFromPendingPayment retorna `won=false` (otro worker ya movio booking a terminal) → upsert payment row igualmente, enqueue late-payment-attempt admin notification, NO transicion booking.
- [ ] **[Refund Parcial vs Total]** Pago original 300000, refund request 150000 → `createRefund(paymentId, 150000)` valida balance (0 refundos previos = 300000 disponible >= 150000 solicitado), crea NEW payment row type='refund' con 150000, status='approved' desde gateway, NO genera cash_flow.
- [ ] **[Refund Sobre-refundado]** Pago original 300000, refund #1=150000, refund #2=200000 → suma previa=150000, disponible=150000, solicitud=200000 > disponible → throw RefundAmountExceedsOriginalError, NO crear row refund, admin ve error en UI.
- [ ] **[Refund Doble]** Mismo paymentId, dois webhooks de refund consecutivos (mismo mpRefundId desdes dos eventos) → primer webhook crea payment row refund, segundo webhook trae mismo mpRefundId → UPSERT en lugar de INSERT (mp_payment_id es unique), idempotente.
- [ ] **[In-Process Booking Pendiente]** Webhook `status='in_process'` (transferencia bancaria) → upsert payment row status='in_process', booking queda en pending_payment (NO transicion), futuro expiry job debe usar 48h cutoff en lugar del default 15min cuando encuentra `EXISTS(SELECT 1 FROM payments WHERE status='in_process')`.
- [ ] **[Webhook Mal Formado]** POST body no es JSON o falta campos requeridos → webhook schema validation falla, respuesta 400, NO INSERT processed_webhooks, NO enqueue job.
- [ ] **[Tenant Query Param Faltante]** POST `/api/webhooks/mercadopago` sin `?tenant=<id>` → respuesta 400 'missing tenant', validacion route-level antes de signature check.
- [ ] **[Webhook Event Type Ignorado]** `eventType='product_sold'` (no está en HANDLED_TYPES: payment, subscription_authorized_payment, subscription_preapproval) → respuesta 200 con `ignored=product_sold`, NO procesar, idempotencia NO aplicada.
- [ ] **[Webhook Processing Timeout]** handleMpWebhookJob toma > 30s (gateway lento, DB lock) → pg-boss timeout expira, job vuelve a queue, reintentos sucesivos; frontend PaymentStatusWatcher espera 30s antes de mostrar 'tarda' message.
- [ ] **[PaymentStatusWatcher Polling]** Cliente en `/reserva/[id]/pendiente` con `initialStatus='pending_payment'` → polling cada 3s a `/api/player/bookings/[id]/status?t=<timestamp>` (cache bust) → cuando backend retorna `status='confirmed'`, efecto useEffect mata polling, muestra success screen.
- [ ] **[PaymentStatusWatcher Expiry]** ExpiryCountdown muestra 15 min restantes, no interacción usuario → countdown llega a 0 → componente renderiza 'expiró' sin polling, link a home para nueva reserva.

> ⚠️ **Nota:** Riesgos detectados durante auditoría: 1) No hay validación de que tenant_id en query param exista (podría procesar webhook para tenant fantasma). 2) Mock mode siempre está ON si MP_MOCK_MODE=1, sin otra barrera en prod (confía en env variables). 3) Late-payment admin notifications solo si booking está en estado terminal (TERMINAL_BOOKING_STATUSES), pero si webhook llega UNA VEZ en limbo entre canceled y confirmed, podría no notificar. 4) Refund balance tracking usa LIKE % description pattern, frágil si descriptions colisionan. 5) No hay validación de cantidad de dinero (monto webhook vs booking.deposit_amount) antes de confirmar pago—se graba discrepancia en audit log pero booking transiciona igual.

### WebSockets / realtime / sincronizacion

- [ ] **[Realtime Admin]** Conectarse a grilla admin (`/grilla?date=2024-12-01`) dispara CONNECTING → (tras <100ms) SUBSCRIBED en el hook `useBookingRealtime`, y realtime canaliza eventos postgres_changes de la tabla `bookings` para el tenant actual únicamente (RLS dual por `tenant_id` en la policy SUBSCRIBED de Realtime).
- [ ] **[Realtime Deduplicación]** Quando un evento INSERT de booking llega DOS VECES en el realtime (duplicado por red/infraestructura), el hook normaliza ambos via `normalizeRealtimeRow()` y aplica la lógica de búsqueda `prev.findIndex((b) => b.id === normalized.id)` → solo sobrescribe la entrada existente una vez (el estado final es idéntico); NO se agrega el booking dos veces al array `bookings`.
- [ ] **[Realtime Reconciliación]** Cuando realtime emite INSERT o UPDATE de booking sin `player.first_name/last_name` (payload incompleto), el hook dispara `scheduleReconcile()` que debouncea a 400ms y después llama `fetchFromApi()` (GET `/api/bookings?date=...&limit=200`) para backfill de nombres; el `playerFirstName`/`playerLastName` quedan `null` en la grilla hasta el fetch.
- [ ] **[Realtime Modo Offline]** Al perder conexión realtime (evento `CHANNEL_ERROR`, `TIMED_OUT` o `CLOSED`), `useBookingRealtime` pasa a status=OFFLINE, detiene el channel, inicia polling cada 30 segundos via `setInterval()` y muestra banner amber "Sin conexión. Los datos pueden no estar actualizados." en `BookingGrid`.
- [ ] **[Realtime Recuperación]** Cuando realtime se reconecta tras caída (SUBSCRIBED nuevamente), el polling se cancela via `clearInterval()`, el status pasa a SUBSCRIBED, y se ejecuta `fetchFromApi()` una sola vez para capturar eventos perdidos durante la ventana offline (Supabase NO garantiza cola de eventos).
- [ ] **[Realtime Reconciliación Crítica]** Cuando una reserva se crea via `/api/bookings/create` en OTRO tab y llega via realtime al tab principal (INSERT event), el hook normaliza la fila y ADEMÁS enrola `scheduleReconcile()` para refetch después de 400ms; sin esto el nombre del jugador no aparecería en la grilla hasta refresh manual.
- [ ] **[Realtime Filtrado por Fecha]** Un evento realtime INSERT o UPDATE para una fecha DISTINTA a `opts.date` (ej. insert para 2024-12-02 mientras estás en 2024-12-01) es IGNORADO (early return en las líneas 113-118 del hook) — la grilla muestra solo bookings del día, aunque llegen eventos de otros días.
- [ ] **[PaymentStatusWatcher Polling]** Cuando el jugador va a `/reserva/[bookingId]/pendiente` con status=pending_payment, el componente `PaymentStatusWatcher` inicia polling cada 3 segundos via `setInterval()` contra `/api/player/bookings/[bookingId]/status?t=<timestamp>` (cache-bust) hasta alcanzar status terminal (confirmed/expired/canceled_*). Polling se detiene cuando TERMINAL_STATUSES.has(status)=true.
- [ ] **[PaymentStatusWatcher Timeout]** Si la reserva en pending_payment no se confirma en 15 minutos (ventana de depósito), el backend dispara un job expiry que transiciona a status=expired, y el polling en el frontend detecta ese cambio en la siguiente llamada (/status endpoint) y muestra "La reserva expiró".
- [ ] **[PaymentStatusWatcher Éxito]** Cuando MercadoPago webhook confirma el depósito y la transacción `dispatchPaymentInfo(info, tenantId, tx)` transiciona booking a status=confirmed, el polling detecta `status=confirmed` en la siguiente llamada y PageComponent renderiza CheckCircle2 + "¡Reserva confirmada!" + link a /mis-reservas.
- [ ] **[PaymentStatusWatcher Delay Note]** Si el polling en `/reserva/[bookingId]/pendiente` aún está en pending_payment después de 30 segundos (desde mount), renderiza nota gris `showDelayNote=true` con texto "¿Tarda? Te avisamos por email apenas se confirme." para tranquilizar al usuario.
- [ ] **[Web Push Deduplicación Multi Tab]** Cuando el Service Worker recibe un push notification de reserva confirmada, envía broadcast en canal `notif-dedupe` con {id, courtName, dateLabel, timeLabel, url}. La PRIMERA tab a responder con {id, ack:true} muestra toast + reproduce audio; otras tabs ven el `seen.has(data.id)=true` y NO muestran notificación (early return línea 107 de PushNotificationManager).
- [ ] **[Web Push Sonido Fijo]** Cuando una reserva se confirma online (status=confirmed), el push notification ejecuta una sola reproducción de audio `/sounds/notification.mp3` preload=auto. El audio NO es configurable por complejo (ADR-006 fijo). Si hay múltiples reservas simultáneas, cada una es 1 job en cola y potencialmente suena N veces si N subscriptions están activas.
- [ ] **[Web Push Una Sola Vez por Reserva]** El webhook MP (mp-webhook.handler.ts:207) dispara `notifyAdminPush(tenantId, {type: 'booking.confirmed_online', bookingId, ...})` UNA sola vez cuando la transacción confirma el depósito (result='confirmed' en línea 154). Si el webhook MP llega DUPLICADO, `lockMpEvent()` bloquea la ejecución del segundo via UNIQUE constraint en `processed_webhooks.mp_event_id`, evitando duplicar el push.
- [ ] **[Web Push Fallback Nativo]** Cuando la BroadcastChannel en PushNotificationManager está soportada y tab activa acusa recibo (ack:true), la notificación es silenciosa en el navegador (solo toast + audio). Si ningun tab responde (todos cerrados o sin soporte), el SW llama `registration.showNotification()` fallback que muestra notificación nativa del SO con sonido/vibración default.
- [ ] **[Web Push Subscripción Eliminada 410]** Si el push send retorna statusCode 410 (gone), el push.worker detiene, marca `result.gone=true` y el webhook handler ejecuta `DELETE FROM push_subscriptions WHERE id=...` atomicamente. El admin es silenciosamente desuscripto sin error en UI (worker catch-free, tracking vía Sentry).
- [ ] **[Orden de Eventos Concurrentes]** Si dos jugadores reservan SIMULTÁNEAMENTE la misma cancha/hora, ambos INSERTs se procesan por la DB; uno va a fallar por `exclusion constraint` (tsrange overlap), lanzando error en `createOnlineBooking()` → SlotTakenError. La grilla realtime solo refleja el que ganó (committed INSERT). Un refresh manual revela el estado actual al jugador fallido.

> ⚠️ **Nota:** Hallazgos críticos encontrados al leer el código real: (1) `useBookingRealtime` debouncea reconciliaciones a 400ms porque el payload realtime carece de nombres de jugadores. (2) El webhook MP puede llegar DUPLICADO pero está protegido por UNIQUE(mp_event_id) en processed_webhooks — el segundo intento es bloqueado por la DB. (3) Web Push solo para admin (grilla), jugador usa polling en PaymentStatusWatcher (NO realtime). (4) BroadcastChannel deduplicación en PushNotificationManager: primera tab a responder con ack:true muestra notificación; otras tabs ven duplicados bloqueados por `seen.has(id)`. (5) Realtime canaliza postgres_changes pero juega 30s polling fallback si cae, evitando pérdida de datos. (6) PaymentStatusWatcher polling es idempotente: 3s interval, se detiene automáticamente al alcanzar estado terminal. (7) Convención de enums: 'canceled' (una L), NUNCA 'cancelled' (doble L). (8) Multi-tenant RLS: realtime policy dual `app.current_tenant_id` para admin; sin RLS Realtime en player_tenant_relationships en v1. (9) Transacción de confirmación de depósito dispara push DESPUÉS de commit (try/catch wrap evita rollback si push falla). (10) Detección de fecha desactualizada: timestamp conversion ART a UTC para comparación, tabla de conversión de puntos de corte horarios."

### Performance y stress

- [ ] **[Grilla-Realtime-Stress]** Cargar /grilla con 10 canchas, 96 slots horarios (08:00-23:00 cada 15 min), y simular 50 eventos realtime concurrentes (reservas confirmadas en diferentes canchas a ritmo de 1 evento/100ms). Verificar: LCP <2.5s, INP <200ms, sin jank visual, DOM actualiza correctamente cada celda sin re-renderizar árbol completo (React.memo de BookingCard efectivo).
- [ ] **[Listado-200-Reservas-Scroll]** En /reservas (listado de todas las reservas del complejo) con filtro status='', cargar 200 reservas en tabla con tbody scrollable. Medir: TTI <3s, FCP <1.5s, scroll FPS constante >50fps, CLS <0.05 (sin movimientos inesperados al cargar imágenes de avatar o nombres de jugadores dinámicos). Inspeccionar: Network tab debe mostrar UN solo request a DB (listTenantBookings LIMIT 200), no N+1 en players/courts.
- [ ] **[Paginación-Explorar-Offset-100]** En /explorar con offset=0,12,24,36,48,...,96 (8 páginas × 12 complejos), hacer 8 clics en 'Ver más complejos' consecutivos. Verificar: cada página tarda <600ms, bundle gzipped <250KB en cada ruta pública, bundle de /explorar específicamente <50KB delta vs shared, sin memory leak acumulativo (heap debe volver a baseline después de descargar página).
- [ ] **[Grilla-Realtime-200-Reservas-Multi-Court]** Con 6 canchas, 120 slots, y lista inicial de 200 reservas historicas, subscribirse a Realtime channel `bookings` y disparar 100 INSERT events rapidamente (simular pico 15:00-15:30 de viernes 18-23hs). Verificar: BookingGrid no queda congelada, CLS permanece <0.1, computeCells ejecuta en O(slots×courts) sin busquedas O(N) inline (validar via DevTools Performance timeline que no hay long tasks >50ms).
- [ ] **[Reportes-CSV-Export-Mes-Grande]** En /reportes para mes='2026-05', hacer clic en 'Exportar CSV' de 30 días × 4 canchas × ~20 registros/día = ~2400 registros. Esperar descarga. Verificar: UI no bloquea (INP <200ms en cualquier elemento de la página durante descarga), archivo CSV genera <2s en servidor (getCashFlowsForExport batch query, no loop con queries), CLS =0 (loading state o spinner predecible, sin layout shift sorpresivo).
- [ ] **[ISR-Home-5min-Revalidate]** Home /page tiene export const revalidate=300 (5 min ISR). Cargar home, medir LCP/CLS/INP, verificar que métricas son <2.5s/0.1/200ms. Cambiar Featured Complexes en BD (simular insert en tenants), esperar <5min, revalidar (purgar CDN si es caso real). Home debe mostrar complejo nuevo. Verificar: sin staleness extrema (>5min) ni data stale >3dias (Featured Complexes outdated sería dealbreaker).
- [ ] **[Bundle-Home-Public-Landing]** Ejecutar `pnpm build && pnpm analyze` en rama main. Verificar: bundle gzipped compartido <140KB (post-Sentry-Replay removal de F12), rutas públicas (/ /explorar /[slug]) con JS <50KB cada una (excluye shared). Comparar vs baseline F0 (150KB shared, 161KB /grilla). Si alguna ruta crece >10%, investigar dynamic imports omitidos.
- [ ] **[Grilla-Dynamic-Import-RegisterMovement]** En /caja, verificar que RegisterMovementModal NO está en el First Paint bundle. Hacer clic en botón 'Registrar movimiento'. Verificar: modal dynamic import tarda <500ms (Network tab muestra chunk nuevo), sin suspense freeze (loading fallback es null, no visible), modal abre fluidamente INP <100ms.
- [ ] **[Skeleton-Layout-Shift]** En /grilla/loading.tsx, página muestra skeleton mientras carga server component. Verificar: skeleton placeholder (Skeleton className=h-64) no causa CLS cuando verdadero contenido reemplaza (BookingGrid DOM stabil en altura/anchura). Si no hay skeleton, verificar que initial SSR de BookingGrid renderiza en <800ms.
- [ ] **[AvailabilityGrid-Public-1000-Slots]** En /(public)/[slug]/disponibilidad página con 6 canchas + 168 slots (cada 15min, 24 horas). Cargar página. Verificar: Lighthouse perf score >85 (LCP <2.5s), bundle de AvailabilityGrid.tsx con buildTimeRows() corre en O(courts×slots) sin nested loops costosos. Si hay cliente-side re-sort de slots, medir impact (debe ser <100ms en init, <50ms en cambio de fecha via flecha navs).
- [ ] **[Dashboard-Admin-Multiples-Cards-KPIs]** En /dashboard (si existe), mostrar 4 KPI cards paralelos (ingresos mes, reservas, ocupación, balance). Cargar dashboard. Verificar: Promise.all() batching queries no causa waterfall (must complete <800ms total, no secuencial). Si hay sparklines o charts pequeños, medir: React render de cada Card <16ms (60fps), no jank en scroll.
- [ ] **[Query-N+1-Reportes-ByCourt]** En getRevenueReport() query via report.service.ts, verificar que report.byCourt NO dispara N queries (1 per court). Schema actual: Q2a joinea cashFlows→bookings→courts groupBy courts.id (1 query aggregate). Validar SQL: debe ser INNER JOIN + GROUP BY, no un fetch() seguido de loop map() con queries adicionales. Si existe N+1, reportar y proponer índice compuesto.
- [ ] **[Player-Mis-Reservas-Paginacion]** En /(player)/mis-reservas con list de 50+ reservas del jugador (multi-tenant). Verificar: queries filtran por player_id + tenant_id via RLS, resultados van a lista table. Si no hay paginación, LIMIT 200 debe aplicarse. Cargar 50 reservas. Verificar: TTI <2s, table scroll smooth >50fps, no N+1 en courts/tenants lookup.
- [ ] **[Inline-Realtime-Booking-Updates]** Admin en /grilla, evento realtime cambia status booking de pending_payment → confirmed en celda visible. Verificar: React DevTools Profiler muestra que SOLO el BookingCard afectado re-renderiza (thanks to React.memo), resto de grid inmutable. Timestamp de update <200ms visible. INP <100ms para interaction.
- [ ] **[CSS-Bundle-Tailwind-Unused]** Post-build, analizar generated CSS. Verificar: si BookingGrid clases (px-4 py-3 border-slate-200 etc) no aparecen en output CSS, son treeshaked (Next.js 14 Tailwind JIT perfecto). Si hay clases <1% usage (dead code), investigar. Bundle CSS debe ser <50KB gzipped (shared).
- [ ] **[Web-Vitals-Sentry-Sample]** En prod (o staging con NODE_ENV=production), cargar /grilla. Verificar: WebVitalsReporter.tsx captura LCP/CLS/INP cada visitor al 25% sample. Sentry dashboard debe mostrar mensaje `web-vital:LCP` con tags metric/rating + extra value/delta. Después de 1 semana tráfico, visualizar distribución p75 sin query. Si sample es muy alto, verificar costo Sentry.
- [ ] **[Dynamic-Imports-PushNotificationManager]** En layout admin, PushNotificationManager cargado via dynamic(() => ..., {ssr:false, loading:null}). Verificar: admin layout First Paint no espera por PushNotificationManager chunk, NotificationCenter + permission flow cargan después de LCP. Medir: /admin LCP <2.5s sin waiting on push chunk.
- [ ] **[Empty-State-Suspense-CLS]** En /reservas, si no hay reservas filtradas, muestra EmptyState con ícono + texto. Si hay Suspense fallback arriba (e.g., Skeleton), verificar: transición entre fallback → real content no causa CLS. Layout debe ser predictable (ícono 40px, text line-height stable, sin sudden size change).
- [ ] **[Open-Matches-Multi-tenant-Cross-Load]** En home /(public)/ loadOpenMatches() corre en Promise.all() paralelo. Verificar: no hace N queries por complejo. Si usa getOpenMatches(limit:6) query correcta, debe fetchear 6 matches + tenant data en 1-2 queries batch, no secuencial. Medir latency <600ms.
- [ ] **[Lighthouse-LCP-Offline-Banner-Bug-F12]** Conocido: /grilla Lighthouse simulated muestra LCP 3.8s con banner 'Sin conexión'. En F12 se fixeó rendering. Re-run Lighthouse en CI: si LCP baja a <2.5s post-offline banner fix, gate pasa (error assertion minScore:0.9). Si permanece >2.5s por estructura headless, documentar gap honesto (no gamear score).

> ⚠️ **Nota:** Casos fundamentados en: (1) doc5_rnf.md especifica latencia p95 grilla <500ms, dashboard <800ms, reportes <2000ms, bundle <300KB; (2) Fase F12-performance report documenta O(slots×courts×bookings²) bottleneck en BookingGrid (ahora O(slots×courts) post-fix), Sentry Replay removido, dynamic imports AddedMovementModal + PushNotificationManager, Web Vitals integrado; (3) exploracion de código: /grilla carga bookings LIMIT (sin N+1 explícito en grid cells indexing), /reportes exports CSV via getRevenueReport() batch aggregate queries (Q1-Q3 Promise.all), /reservas listTenantBookings LIMIT 200 con JOIN courts/players, home ISR 300s; (4) ISR config en /page.tsx revalidate=300 + resiliente catch() en loadCities/loadFeatured/loadOpenMatches; (5) F12 improvements: BookingCard React.memo efectivo, useMemo en slots/cells/bookingsByKey, useCallback en handlers, Lighthouse error gate (perf 0.9 + LCP 2500 + CLS 0.1). Gaps: Memory leak regression suite diferida (singleThread conflict), INP real no medible en Lighthouse simulated (requiere RUM en prod con Sentry web-vitals 25% sample post-deploy), bundle delta post-Sentry-Replay requiere `pnpm analyze` comparación lado-a-lado."

### Accesibilidad global

- [ ] **[Navegacion Teclado - Grilla]** Navegar la grilla de reservas (`/grilla`) con Tab/Shift-Tab desde el primer slot vacío hasta el último + hacia el header (navegación de botones): todos los slots clickeables deben recibir foco visible (ring emerald-500) en orden lógico L-a-R, T-a-B; verificar que Enter/Space activan reserva y Esc cierra modal si está abierto.
- [ ] **[Navegacion Teclado - Formulario Reserva]** Completar formulario modal de reserva (`BookingFormModal`) usando solo teclado (Tab entre campos, cambiar duración con Tab+Enter, escribir nombre/teléfono, Tab a 'Confirmar'): verificar que Esc cierra el modal sin guardar y el foco retorna al slot abierto.
- [ ] **[Focus Trap Modal Reserva]** Abrir modal de reserva en grilla admin: Tab desde último campo (botón Confirmar) debe volver al primer campo (label Duración), nunca salir del modal; Shift-Tab desde primer campo debe ir al último; Esc cierra y retorna foco al slot.
- [ ] **[Focus Restoration Grilla]** Abrir modal de reserva desde slot vacío, cerrar sin guardar (Esc o Cancelar): foco debe restaurarse al slot original (verificar con document.activeElement).
- [ ] **[Focus Trap Dialog Confirmacion]** Abrir diálogo de confirmación (`ConfirmDialog` en cancelación de reserva): Tab debe circular solo entre botones Cancel/Confirmar; Esc debe cerrar sin confirmar.
- [ ] **[Labels Asociados Inputs]** Completar formulario de creación de cancha (`/canchas/nuevo`): todos los inputs (nombre, superficie, capacidad, horarios, precios) deben tener labels con `htmlFor` asociado; verificar con screenreader que lee label al hacer focus en input.
- [ ] **[Aria-Live Toasts]** Mostrar toast de error en formulario de reserva (ej: teléfono sin nombre): toast debe tener `role="status"` o `aria-live` y anunciarse al usuario; verificar que toast persiste mínimo 3s.
- [ ] **[Aria-Invalid Validacion]** Intentar enviar modal de reserva sin teléfono (teniendo nombre): campo debe tener `aria-invalid="true"` + mensaje con `role="alert"`; verificar que screenreader anuncia validación.
- [ ] **[Estados Pagos Aria-Live]** Esperar confirmación de pago en `PaymentStatusWatcher` desde pending_payment hasta confirmed: contenedor debe tener `aria-live="polite"` y anunciar cambio de estado ("¡Reserva confirmada!") sin refrescar página.
- [ ] **[Badges Estado Contraste]** Verificar contraste WCAG AA (4.5:1 min) en badges de estado de booking en grilla: pending (amber-50 texto amber-800), confirmed (green-50 texto green-800), no_show (red-50 texto red-700), completed (slate-50 texto slate-500).
- [ ] **[Contraste Botones Focus]** Verificar contraste WCAG AA en botones con focus: default emerald-600, destructive red-600, outline slate-200 border + slate-900 texto.
- [ ] **[Orden Tabulacion Formulario]** Llenar CourtForm con Tab: nombre → superficie → capacidad → agregar franja → días (L-D) → desde → hasta → precios → guardar. Verificar que el orden es lógico y no salta ni se repite.
- [ ] **[Skip-to-Content]** Presionar Tab en cualquier página (home, login, grilla): primer elemento focusable debe ser enlace "Saltar al contenido" (sr-only, fondo emerald-600 visible al focus), al presionar Enter navega a `#main-content`.
- [ ] **[Reduce Motion Spinner]** Activar `prefers-reduced-motion: reduce` en DevTools: spinners en botones disabled y en PinGate deben dejar de animar; verificar que no usan `animate-spin` ni `animate-in/out`.
- [ ] **[PinGate Accesibilidad]** Usar PinGate con PIN configurado: input PIN debe tener label asociada, errores deben tener `role="alert"`, intento fallido debe tener mensaje accesible; verificar que al desbloquear (30s timeout) el foco vuelve al input.
- [ ] **[Breadcrumb/Nav Semantica]** En `/settings/*` y `/canchas`: verificar que navegación tiene semántica correcta (nav, aria-current para página actual), breadcrumbs si existen.
- [ ] **[Aria-Label Botones Icono]** Todos los botones con solo icono (ej: cerrar modal, copiar link en onboarding, eliminar en tablas): deben tener `aria-label` descriptivo (no solo icono).
- [ ] **[Dialogo Terminologia ARIA]** `Dialog` y `ConfirmDialog` deben tener `role="dialog"` + `aria-labelledby` (apunta a DialogTitle) + `aria-modal="true"` para máxima compatibilidad con lectores de pantalla.
- [ ] **[Foco Visible en Inputs]** Todos los inputs (text, email, tel, password, number, select, textarea): al hacer focus, borde o ring emerald-500 visible (focus-visible:ring-2 focus-visible:ring-emerald-500); no desaparecer con outline:none sin replacement.
- [ ] **[Icono Aria-Hidden]** Todos los iconos decorativos (Lucide icons como `<CheckCircle2 aria-hidden />`): deben tener `aria-hidden="true"` para no contaminar el árbol de accesibilidad; solo iconos informativos (`aria-hidden` omitido o con aria-label en el padre).

> ⚠️ **Nota:** Implementación muy sólida: Radix UI aporta a11y nativa; skip-to-content, aria-live, aria-invalid, reduce-motion, focus-visible todos presentes. Faltas detectadas: (1) celdas de grilla sin tabindex/role=button completo (están con onClick pero sin tab-entry), (2) focus trap no verificable sin e2e tests, (3) algunas labels faltantes en duration buttons en modal, (4) `aria-live` no en grilla realtime (solo en PaymentStatusWatcher), (5) contraste en badges solo visualmente verificable. Los test cases apuntan a automatizar estas validaciones con Playwright/Vitest e2e."

### Responsive y cross-browser

- [ ] **[ViewportMobile]** Verificar que login `/login` adapta dos columnas (Hero + Formulario en lg) a una sola en mobile (<640px): imagen Hero oculta, formulario centrado, flecha Volver visible, botón "Enviar enlace" ocupa 100% del ancho con padding-x.
- [ ] **[ViewportMobile]** Verificar que vista pública `/{slug}` en iPhone 12 (390px) no tiene overflow horizontal: galería fotos responsive, CourtCard grid 2 columnas (gap-3), tabla semanal WeeklyAvailability con scroll-x-auto dentro de contenedor sin exceder viewport.
- [ ] **[ViewportMobile]** Verificar que grilla admin `/grilla` en tablet 8" (768px) muestra tabla con sticky left:0 en columna Hora, scroll horizontal sin romper layout, columnas Cancha ancho 160px min, responsive en md:lg para desktop (7 canchas visibles sin scroll).
- [ ] **[KeyboardVirtual]** Verificar que en dispositivo iOS (Safari), input email en login y los campos del booking modal (guestName, guestPhone) NO se tapen cuando aparece teclado virtual: formulario se desplaza hacia arriba o modal scrollea internamente.
- [ ] **[KeyboardVirtual]** Verificar que en Android (Chrome), checkout page `/{slug}/reservar` (BookingSummary + ConfirmBookingButton) no oculta botón "Pagar seña" cuando aparece teclado: padding-bottom o scroll mantienen button visible.
- [ ] **[SafeAreaIOS]** Verificar que en iPhone 14 Pro Max con Dynamic Island, AdminHeader no se solapa con safe-area-inset-top (usando pt-[env(safe-area-inset-top)]), y PlayerBottomNav respeta pb-[env(safe-area-inset-bottom)] en home bar: navegación visible sin cortes.
- [ ] **[SafeAreaIOS]** Verificar que modal BookingFormModal en iPhone en landscape (Dynamic Island activo) cierra correctamente sin exceder viewport, titulo Dialog.Title + descripción + inputs + botones (gap-2) caben en max-h-[90vh] o similar.
- [ ] **[TabletLandscape]** Verificar que en iPad Pro 12.9" (landscape, 1366px), tabla Caja `/caja` con 6 columnas (Tipo, Categoría, Método, Descripción, Monto, Hora) renderiza sin scroll horizontal, y summary cards (3 cols) expanden a 3 cols sin contraerse.
- [ ] **[TabletLandscape]** Verificar que grilla admin en iPad 10.2" landscape (1024px) muestra 4-5 canchas sin scroll horizontal, si hay 8 canchas el scroll está disponible pero no es forzado inicialmente, sticky header Hora queda fijo.
- [ ] **[ResponsiveBadges]** Verificar que badges de estado en tabla Reservas `/reservas` y mis-reservas jugador (confirmed, pending_payment, completed, no_show, canceled_refunded) no se rompen en mobile: inline-flex con px-2 py-0.5 mantiene formato incluso con 2-3 lineas de ancho reducido.
- [ ] **[ResponsiveTable]** Verificar que tabla Movimientos de Caja `/caja` en mobile <640px tiene overflow-x-auto con touch-pan-x, min-width calculado dinámica, headers y cells alineados verticalmente sin desajustes, scrollbar no oculta contenido (visible pero no invasivo).
- [ ] **[ResponsiveGrilla]** Verificar que tabla BookingGrid `/grilla` renderiza correctamente en vertical (mobile portrait) sin overflow: si <640px y >4 canchas, muestra scroll horizontal; fixed width col 80px para Hora sticky, 160px por cancha; no hay jitter en scroll.
- [ ] **[ButtonTouchTarget]** Verificar que todos los botones móviles cumplen mínimo 44px height (min-h-11): Login submit, duration toggle en modal (60/120min), Cancel/Confirm en modal, CancelBookingButton en mis-reservas, filtros status en `/reservas`.
- [ ] **[FormResponsive]** Verificar que formulario BookingFormModal adapta en mobile: labels encima (block), inputs 100% ancho, spacing gap-4 mantiene distancia, textarea rows=2 en mobile con min-h-[44px] para touch, zoom y visor no se distorsiona.
- [ ] **[OverflowHorizontal]** Verificar que NO hay overflow-x:hidden u overflow automitico en `<body>` ni divs wrapper: BookingGrid, Reservas, Caja son contenedores con overflow-x-auto explícitos, sin afectar scroll global de página.
- [ ] **[ColorContrast]** Verificar que badges de estado en ambas plataformas (Chrome/Firefox/Safari) tienen ratio de contraste >=4.5:1 para texto: amber-50/amber-700 (pending_payment), green-50/green-700 (confirmed), slate-100/slate-600 (completed) cumplen WCAG AA.
- [ ] **[ChromeEdge]** Verificar que en Chrome y Edge desktop, grilla `/grilla` con Realtime renderiza sin lag visual, tabla con tableLayout:fixed y minWidth calculado no causa CLS (Cumulative Layout Shift), botones (Anterior/Hoy/Siguiente) tienen focus-ring-2 visible.
- [ ] **[SafariFirefox]** Verificar que en Safari macOS y Firefox Linux, ScrollBar de tabla Caja es nativo (no customizado), `touch-pan-x` en elemento no causa issues de scroll, inputs con focus-visible tienen ring-offset correcto.
- [ ] **[FormInput]** Verificar que input email en login en todos los navegadores acepta autocomplete=email y no muestra validación nativa html5 roja cuando vacío (aria-invalid=true con custom styling rojo de TurnoGol), clase "aria[invalid=true]:border-red-500" aplica.

> ⚠️ **Nota:** Auditoría sobre componentes responsivos y cross-browser en TurnoGol. Se leyeron: login, layouts públicos (hero+form dos columnas), grilla admin (tabla sticky), tablas móviles (reservas, caja, mis-reservas), WeeklyAvailability con tab scroll, booking modal, bottom nav jugador, admin sidebar+header con safe-area. Hallazgos: (1) Modales (BookingFormModal) usan max-w-md sin explicit height cap para landscape (riesgo truncación en Dynamic Island). (2) Tabla Caja tiene 6 columnas sin responsive collapse en mobile—requiere scroll horizontal. (3) BookingGrid con minWidth dinámico funciona pero CLS risk en Realtime updates. (4) Safe-area-inset aplicado en AdminHeader y PlayerBottomNav pero no testeado realmente en hardware iOS. (5) Overflow horizontal sin overflow-x:hidden global es correcto pero requiere verificación en WebKit. Sin acceso a ejecución real (no sourceRead de config tailwind/viewport), tests se basan en análisis de JSX y clases visibles.

### Observabilidad y logging

- [ ] **[Sentry Error Capture]** Crear reserva online fallida (timeout de checkout) captura exception en Sentry con booking_id y tenant_id como tags, sin exponer mp_access_token o email completo en el evento.
- [ ] **[Sentry Scrubbing]** Webhook de MercadoPago con mp_access_token, mp_refresh_token y authorization headers en el evento Sentry se redacta a [REDACTED] antes de envío.
- [ ] **[Request ID Correlation]** Server Action createBookingAction genera request_id único; request_id aparece en logger.info('booking.created'), en Sentry.setTag('request_id'), y en el header x-request-id de la response.
- [ ] **[Loading State Recovery]** PaymentStatusWatcher queda colgado en 'Confirmando tu pago...' durante 45+ segundos → después 30s, aparece 'Te avisamos por email' sin cambiar a estado terminal; al llegar webhook de MP, status transiciona a 'confirmed' y UI se actualiza.
- [ ] **[Webhook Idempotency Logging]** Webhook de MP duplicado (mismo mp_event_id) llega 2x → primer intento crea processed_webhooks row + payment.approved log → segundo intento retorna sin duplicar, logueando mp.webhook.duplicate con mpEventId y action='ignored'.
- [ ] **[Booking Cancellation Audit]** Player cancela reserva en /mis-reservas → insertAuditLog registra action='booking.canceled' con actorType='player', metadata incluye inPolicy=true/false, depositStatus='refunded'/'captured'/'paid', NO incluye datos de pago o PIN.
- [ ] **[Admin Cancelation Audit]** Staff cancela booking con refund desde /admin/reservas/[id] → audit_logs recibe action='booking.canceled_by_admin', actorId=staffUserId, metadata contiene shouldRefund y reason, sin exponer credenciales MP.
- [ ] **[PII Scrubbing in Logs]** Cuando Server Action falla y Sentry.captureException(err) en catch, parámetros con email/phone/mp_access_token son redactados; logger también omite campos sensibles por defecto (request-context incluye tenant_id/user_id/user_type, NO datos personales).
- [ ] **[No-Show Ban Audit]** Player acumula 3 no-shows en 30 días → handleNoShow inserta tenant_player_bans row + audit_logs con action='player.banned_no_show', tenantId específico, reason='3 no-shows en los últimos 30 días', metadata tracking del threshold y fecha de ban.
- [ ] **[Player Anonymization Audit]** POST /api/player/data-export/delete ejecuta anonymizePlayer → crea una row de audit_logs POR TENANT con action='player.anonymized', reason='Ley 25.326 derecho de supresión', usando SYSTEM_ACTOR_ID, registrando que PII fue blanqueada.
- [ ] **[Checkout Error on Server Action]** RegisterMovementModal lanza Server Action que falla (DB error) → catch captura, Sentry.captureException(err), toast muestra 'No pudimos registrar' sin detalles técnicos, loading state cleared (isPending→false).
- [ ] **[Webhook Logging with Context]** handleMpWebhookJob en reconcile-pending-payments recibe webhook, logguea payment.reconcile.confirmed con bookingId, paymentId, amount_centavos, NO datos de tarjeta o tokens de MP.
- [ ] **[Metrics Collection Audit]** metrics-collector cron job cada hora logguea metrics.hourly con active_tenants, mrr_centavos, bookings_today, email_sent_today, etc., usando logger.info sin exponer senhas/pines de ningun tenant.
- [ ] **[Audit Log Completeness for Bans]** Cuando system ban a player en 3+ no-shows O admin ban manual, audit_logs registra siempre: tenantId, action='player.banned_[reason]', resourceId=playerId, metadata con bannedUntil date.
- [ ] **[Conversion Funnel Tracking]** Player inicia checkout → PaymentStatusWatcher monta con initialStatus='pending_payment' → polling fetch /api/player/bookings/[id]/status cada 3s → al recibir status='confirmed' de webhook procesado, logguea payment.deposit.approved con bookingId y confirmTime para medir latencia de conversión.

> ⚠️ **Nota:** Hallazgos clave en implementacion: (1) Sentry captura exceptions en Client Components y Server Actions (BookingFormModal.tsx l.98, RegisterMovementModal.tsx l.77) + scrubbing automático en sentry-pii-scrub.ts redacta mp_access_token, mp_refresh_token, authorization, email, phone. (2) Logger estructurado emite JSON con request_id correlacionado desde request-context; Sentry.setTag('request_id') une logs y traces. (3) PaymentStatusWatcher (PaymentStatusWatcher.tsx) polling cada 3s con cache-bust ?t= param, delay note a 30s si sigue pending, pero NO hay timeout que transicione a 'expired' en el cliente — depende de backend reconcile-pending-payments worker. (4) Webhook idempotency via processed_webhooks table verificado en mp-webhook.test.ts, logguea mp.webhook.duplicate con action='ignored'. (5) Audit logs completos: insertAuditLog en booking.cancellation.ts (l.137-145), insertSystemAuditLog en player.anonymization.ts (l.97-103), incluyen metadata pero NO datos sensibles. (6) Metrics-collector worker logguea events de negocio sin PII. (7) Server Actions (createCashFlowAction, createBookingAction) capturan exceptions silenciosas y recuperan UI loading state (isPending cleared en catch). UNA BRECHA POTENCIAL: PaymentStatusWatcher no tiene timeout explícito client-side si webhook no llega en 15 min — UI queda en 'Confirmando' indefinidamente; cliente ve 'Te avisamos por email' pero reserva nunca transiciona. Backend debería expiar y logguear booking.expired pero frontend no refleja eso sin refresh manual.

### Recuperacion ante fallos

- [ ] **[Error Boundary]** Cuando un admin intenta acceder a /grilla y la query de reservas del día falla (p.ej., timeout DB), verificar que se muestra ErrorState con título 'Error en el panel de administración', botón 'Reintentar' y enlace secundario 'Ir al dashboard'. El digest debe ser un UUID válido (no stacktrace del server).
- [ ] **[Error Boundary]** Cuando un jugador intenta ver /mis-reservas y la consulta de sus reservas falla (p.ej., 500 de RLS), verificar que se muestra ErrorState con título 'No pudimos cargar tus reservas', descripción accionable, botón 'Reintentar' que llama a reset() y no muestra código técnico.
- [ ] **[404]** Cuando un jugador accede a /reserva/[uuid-invalido]/pendiente, verificar que se muestra la página 404 con título '404', descripción 'La página que buscás no existe o fue movida', y botón 'Volver al inicio' redirige a /.
- [ ] **[404]** Cuando un admin intenta acceder a /complejos/[slug-inexistente], verificar que se muestra 404 con ícono de Compass y no expone detalles de DB ni estructura de rutas.
- [ ] **[Retry Post Fallo Red]** Cuando un jugador llena el formulario de login (/login) y al enviarlo hay timeout de red, verificar que el error de validación Zod se captura y retorna { status: 'error', message: 'No pudimos enviar el email. Probá de nuevo.' } sin crash del form.
- [ ] **[Retry Post Fallo Red]** Cuando un jugador intenta crear una reserva vía POST /[slug]/reservar/create-booking y el servidor retorna 500, verificar que se redirige a /?error=server_error (o similar) con mensaje accionable, no a una página de error genérica.
- [ ] **[Idempotencia Pago]** Cuando el webhook de MP llega 2 veces con el mismo mpEventId para una reserva pending_payment, verificar que processed_webhooks registra exactamente 1 fila (INSERT ON CONFLICT), el booking se confirma una sola vez y no se generan 2 confirmaciones duplicadas.
- [ ] **[Idempotencia Pago]** Cuando el webhook llega desordenado (rechazado ANTES que approved para el mismo bookingId), verificar que el lockMpEvent descarta el rechazado tardío (already processed) y el estado final del booking es confirmed (no se regresa a pending_payment).
- [ ] **[Recuperación Wizard]** Cuando un admin está en paso 2 (agregar canchas) del onboarding y presiona F5 (refresh), verificar que settings.onboarding_step se recupera desde DB y el wizard muestra 'Paso 2 de 4' con la barra de progreso en 50% sin perder datos ingresados previamente.
- [ ] **[Recuperación Wizard]** Cuando un admin completa paso 3 (horarios), cierra el navegador y reabre la sesión, verificar que /onboarding redirige automáticamente al paso 4 (pagos) porque onboarding_step=3 está guardado en tenant.settings.
- [ ] **[Recuperación Wizard]** Cuando un admin completa el paso 4 y presiona 'Finalizar', verificar que settings.onboarding_completed=true se guarda atomicamente con updateOnboardingStep y /onboarding redirige a /dashboard (no queda atrapado en el wizard tras refresh).
- [ ] **[Cierre Caja - Fallo Parcial]** Cuando un admin presiona 'Cerrar caja' para 2024-06-08 y el INSERT a daily_cash_closes falla por constraint (ej: PK duplicate si concurrentemente otro admin cierra el mismo día), verificar que se captura DayAlreadyCloseExistsError y retorna { success: false, error: 'La caja del 2024-06-08 ya fue cerrada.' }. La transacción se revierte atomicamente.
- [ ] **[Cierre Caja - Fallo Parcial]** Cuando un admin cierra caja con diferencia de efectivo (declaredCash != balance) y presiona 'Cerrar caja', verificar que closeDailyRegister inserta la fila con diffAmount = balance - declaredCash y insertAuditLog registra el cierre atomicamente. Si el audit falla, la caja NO se cierra.
- [ ] **[Cierre Caja - Estado Inconsistente]** Cuando un admin está en el dialog CloseDayButton y ve 'Balance calculado: $1.234,56', presiona 'Cerrar caja', pero antes de que completa el servidor falla con 500, verificar que router.refresh() NO se ejecuta y el dialog permanece abierto permitiendo reintentar (no deja caja semi-abierta en BD).
- [ ] **[Ventana 15min - Limpieza]** Cuando una reserva pending_payment se crea a las 14:00 UTC y el job expirePendingBookingWithPolicy se ejecuta a las 14:16 UTC, verificar que la reserva pasa a 'expired', se libera el slot y se dispara notificación al jugador 'Tu reserva expiró'.
- [ ] **[Ventana 15min - Limpieza]** Cuando el sweep de 5 minutos (sweepExpiredPendingBookings) detecta N=10 reservas que debieron expirar pero sus jobs nunca corrieron, verificar que todas se limpian atomicamente en una transacción y el webhook de 'late_payment_attempt' NO se dispara para bookings ya expirados.
- [ ] **[Reconciliación Pago]** Cuando la reconcile-pending-payments cron (cada 5min) encuentra un booking pending_payment desde hace 10 min con mpPreferenceId, consulta MP Payment Search API por external_reference (bookingId) y encuentra una payment.status='approved', verificar que dispatchPaymentInfo confirma el booking sin requerir webhook tardío.
- [ ] **[Reconciliación Pago]** Cuando reconcile-pending-payments ejecuta y se conecta a MP pero el acceso_token ha expirado, verificar que resolveTenantGateway intenta un refresh automático vía OAuth y no falla con 401 desnudo (se reintentan los bookings en la próxima pasada).
- [ ] **[Realtime Degradación]** Cuando un admin está viendo /grilla con Realtime SUBSCRIBED y la conexión se cae (CHANNEL_ERROR), verificar que useBookingRealtime cambia status a 'OFFLINE', inicia fallback polling cada 30s vía fetchFromApi() y la grilla no queda congelada mostrando datos stale.
- [ ] **[Realtime Degradación]** Cuando la conexión Realtime se recupera (SUBSCRIBED de nuevo), verificar que se cancela el polling, se ejecuta un fetchFromApi() reconciliador para capturar cambios perdidos, y status = 'SUBSCRIBED' sin duplicados de reservas.
- [ ] **[Retry Reserva - Pago Fallido]** Cuando un jugador completa el flujo de reserva pero obtiene 'Pago rechazado' (payment.status='rejected'), presiona 'Reintentar pago' en /reserva/[id]/error, verificar que retryDepositPaymentAction crea una NEW fila en payments (id distinto, mismo booking_id) y redirige a nuevo MP preference.initPoint.
- [ ] **[Retry Reserva - Pago Fallido]** Cuando un jugador está en /reserva/[id]/error (payment rechazado) y entre tanto el webhook tardío llega confirmando el pago, presiona 'Reintentar', verificar que retryDepositPaymentAction detecta booking.status !== 'pending_payment' y redirige a /reserva/[id]/exito (no crea pago duplicado).
- [ ] **[Errores Accionables]** Cuando un jugador intenta reservar en una cancha offline (court_status='offline'), verificar que se captura CourtOfflineError y se redirige con &error=unavailable + mensaje 'Esta cancha no está disponible' (no 'Error interno').
- [ ] **[Errores Accionables]** Cuando un jugador intenta reservar pero su player_tenant_relationships.balance > 0 (deuda), verificar que createOnlineBooking rechaza con mensaje específico 'Tenés un saldo deudor de $X,XX. Regularizalo para reservar online en este complejo.'
- [ ] **[Errores Accionables]** Cuando un jugador banned globalmente (player.status='banned') intenta reservar, verificar que se captura PlayerBannedError y se muestra 'No podés reservar en este complejo' (sin exponer razón ni detalles técnicos).
- [ ] **[Errores Accionables]** Cuando un complejo suspendido (tenant.status='suspended') intenta que su admin ingrese a /grilla, verificar que se detecta en middleware y se redirige a /suspended con mensaje 'Tu cuenta está suspendida por falta de pago. Contactá a soporte.'
- [ ] **[RLS - Admin Aislamiento]** Cuando admin1 (tenant_id=uuid_A) intenta acceder a /grilla, verifica que RLS policy en bookings filtra WHERE tenant_id = app.current_tenant_id (uuid_A). Si intenta forzar tenant_id=uuid_B vía SQL injection, RLS descarta la fila silenciosamente (no error, solo vacío).
- [ ] **[RLS - Jugador Aislamiento]** Cuando un jugador accede a /mis-reservas vía Player Auth JWT (sin tenant_id, con player_id), verifica que RLS policy en bookings usa app.current_player_id y solo devuelve sus bookings cross-tenant (no de otros jugadores, incluso en mismo complejo).

> ⚠️ **Nota:** Hallazgos detectados: (1) ErrorState component no expone stacktraces en UI, solo digest UUID — bien implementado. (2) lockMpEvent usa INSERT ON CONFLICT para idempotencia de webhooks — robusta. (3) closeDailyRegister es atómica: audit falla => caja no se cierra. (4) useBookingRealtime fallback a polling cada 30s si Realtime cae — buena degradación. (5) Wizard state se recupera desde onboarding_step en DB, no en localStorage — seguro. (6) retryDepositPaymentAction permite reintentos sin duplicar si webhook ya confirmó (detecta status !== pending_payment). (7) Errores específicos (CourtOfflineError, PlayerBannedError, etc.) se capturan y redirigen con &error=code, no siempre con mensajes amigables en el formulario — algunos podrían ser más detallados. (8) RLS policies en admin vs jugador son duales: tenant_id para staff, player_id para players — correcto. (9) processed_webhooks.mp_event_id tiene UNIQUE constraint — bloquea true duplicados. Riesgo bajo: webhook recibido 3+ veces podría saturar retries de pg-boss antes de que processed_webhooks bloquee.

---

## ➕ Vistas sugeridas para cobertura futura

> NO forman parte de las 36 vistas del inventario. Se sugieren a partir del dominio (CLAUDE.md) por riesgo de quedar sin testear.

- [ ] **[Super Admin]** Panel `/super-admin/*` (tabla `system_admins`): ver todos los tenants, impersonar, metricas globales. No esta en el inventario y maneja datos cross-tenant: alto riesgo de fuga de aislamiento.
- [ ] **[Error boundary]** Pagina global `not-found` (404) y `error` (500) de App Router: deben mostrar UI amigable y noindex, sin stacktrace.
- [ ] **[Auth callback]** Route Handler de callback de Supabase Auth: manejo de error de intercambio, redirect seguro (open-redirect), parametros manipulados.
- [ ] **[OAuth MP callback]** Callback de OAuth de MercadoPago por complejo: token denegado por el usuario, state invalido, doble vinculacion.

---

## Resumen por prioridad

| Prioridad | Cantidad | Vistas |
|-----------|----------|--------|
| 🔴 P0 | 8 | grilla, /[slug]/reservar, reserva-exito, reserva-pendiente, reserva-error, login, verify, caja |
| 🟠 P1 | 12 | onboarding, dashboard, reservas/[id], /[slug], disponibilidad, mis-reservas, settings/reservas, settings/horarios, settings/facturacion, abonados/nuevo, reservas-listado, register |
| 🟡 P2 | 11 | canchas, abonados, reportes, staff, settings/pin, perfil, explorar, configuracion, eliminar-cuenta, home, suspended |
| 🟢 P3 | 5 | para-complejos, privacy, terms, mock-mp, settings-redirect |

## Orden de ejecucion sugerido

```
Semana 1 (P0):
  1. login + verify
  2. /[slug]/reservar -> reserva-pendiente -> reserva-exito -> reserva-error
  3. grilla
  4. caja

Semana 2 (P1 core):
  5. onboarding (bloquea todo lo demas)
  6. dashboard
  7. settings/horarios + settings/reservas + settings/facturacion
  8. reservas/[id]

Semana 2 (P1 jugador):
  9. mis-reservas
 10. /[slug] + disponibilidad

Semana 3 (P2):
 11. canchas + abonados + staff
 12. reportes
 13. explorar
 14. perfil + configuracion + eliminar-cuenta

Semana 4 (P3 + regresion):
 15. home, para-complejos, legal
 16. mock-mp (validacion de ambiente)
```

## Notas transversales

- **PinGate**: rutas protegidas con PIN (canchas, reportes, staff, settings/*, abonados, caja) bloquean si hay PIN configurado y lo solicitan una sola vez por sesion.
- **Montos en centavos**: toda vista que muestra dinero formatea centavos correctamente (10000 -> $100.00 ARS).
- **Timestamps UTC -> ART**: fechas y horas se muestran en hora argentina, no UTC.
- **Estados de tenant**: complejo suspended/blocked/canceled/churned bloquea acceso al panel admin con redirect a /suspended.
- **RLS**: ninguna vista debe mostrar datos de otro tenant. Verificar con 2 cuentas.
- **Responsive**: priorizar mobile en vistas del jugador (publicas), desktop en vistas del admin.
- **ENUMs**: en listas y badges verificar que nunca aparece `cancelled` (doble L) — solo `canceled`.
