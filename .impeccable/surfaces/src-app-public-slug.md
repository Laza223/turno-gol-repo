---
version: 1
slug: "src-app-public-slug"
primary_target: "src/app/(public)/[slug]"
related_targets: ["src/app/reserva/[bookingId]"]
---

# Página del complejo y reserva (src/app/(public)/[slug]/)

Modo: Operate. Visitante: el jugador amateur que llega por el link de su complejo (redes, WhatsApp) o desde la home y Explorar; casi siempre en el celular y muchas veces dentro del navegador de Instagram o de WhatsApp. No conoce TurnoGol. Trabajo: reservar un turno sin escribirle a nadie, entrar con su cuenta en el camino y avisarle al grupo.

Alcance: página del complejo (`(perfil)`), reservar (`reservar`, con el ingreso adentro), la vuelta de la reserva (`src/app/reserva/[bookingId]/{exito,pendiente,error}`) y la vista previa del link en WhatsApp (`generateMetadata`).

## Estado vigente (2026-11-13): todo en vidrio

Mundo: portal de vidrio (DESIGN.md, Colors › Portal de vidrio y Components › Portal de vidrio), F4 y F5 de la decisión [`docs/decisions/2026-11-13-portal-vidrio.md`](../../docs/decisions/2026-11-13-portal-vidrio.md). **La ficha ya no es La Reserva**: la excepción del 2026-10-21 (ficha plana, `PortalWorld`, tokens `portal-*` planos, reserva en tres pasos) quedó superada por el vidrio el 2026-11-13. `PortalWorld` todavía está montado en `(perfil)/layout.tsx` como resto a borrar en F9; ninguna pantalla nueva lo usa. La Previa (confirmar y vuelta de 2026-10-20, `.reserva-*`, `.hero-accent-text`) también se reemplazó.

- **La ficha deja los tres pasos.** Todo pasa en una pantalla: los días arriba en una fila, las horas en cuadrados y, al tocar una hora, sube desde abajo una barra con la cancha, el precio y el botón "Reservar". Lo que la decisión del 2026-10-29 ([`2026-10-29-ficha-reserva-en-pasos.md`](../../docs/decisions/2026-10-29-ficha-reserva-en-pasos.md)) resolvió por debajo sigue: el día, la hora y el tamaño viven en la URL, y los estados sin lugar, cerrado y con error se conservan.
- **Partidos abiertos** del complejo (`OpenMatches`), detrás del flag `rival`. Sin partidos publicados, la sección no aparece.
- **Confirmar** y **la vuelta de la reserva** siguen el flujo de [`docs/decisions/2026-10-21-confirmar-sin-casilla-y-modal.md`](../../docs/decisions/2026-10-21-confirmar-sin-casilla-y-modal.md): sin "Cómo pagás", un solo botón ("Pagar seña · $X" o "Reservar"), solo email con nombre derivado y +18 por clickwrap sin casilla. En vidrio, el ingreso es `LoginPanel`, una región de la pantalla y no un modal.
- `/disponibilidad` y el modal de la semana se sacaron (la URL redirige a la ficha con un 308).

## Decisiones del dueño (2026-10-15)

- La página es de TurnoGol (marca y marco) y, adentro, del complejo: su nombre, su foto, sus datos y sus reglas.
- Se elige la hora y después la cancha.
- La reserva termina con "Avisarle al grupo". Sin QR (#423) y sin "Seguir explorando".
- Al volver de Google o del mail la reserva se confirma sola.
- "Lo importante es que se entienda muy bien el flujo en mobile, que sea interactivo y cualquier persona sepa reservar."

## Flujo

1. **Página del complejo** (`ProfileLayout`). Cabecera (`ComplexHero`): portada de fondo (decorativa, velada para que el texto llegue a AA; es el LCP y nunca arranca escondida) y tarjeta de vidrio con el nombre, la dirección, si está abierto (`OpenStatus`), "Cómo llegar", WhatsApp o "Llamar", compartir y guardar. Debajo, la reserva en una pantalla (`ReserveSection`):
   - **Días** (`DayList`, `.daystrip`): hoy y los de `booking_advance_days`, en una fila deslizable. Cada día dice su estado con palabra o punto ("Hay lugar", "Completo", "Sin horarios", "Cerrado"); los sin lugar no se pueden elegir. Desde 1024 px se ven 7 y el resto se desliza.
   - **Tamaño** (`FormatChips`): solo si el complejo tiene más de uno. Filtra, no avanza.
   - **Horas** (`HourGrid`, `.hgrid`): cuadrados, cuatro por fila, con la hora y debajo cuántas canchas quedan. Estados: "N libres", "Queda 1" (ámbar, la única escasez real), "Libre" (el filtro deja una sola cancha: neutro), "Señando" (alguien paga la seña y puede liberarse: borde punteado y ayuda visible de 13 px) y "Completo" (tachada, deshabilitada).
   - **Barra de "Reservar"** (`ReserveBar`): al tocar una hora sube con las canchas libres a esa hora (una por radio, la primera elegida) y el botón, que lleva a confirmar (`/reservar?court&date&time&dur`). Sin reserva online, el botón abre WhatsApp con el pedido escrito o llama.
   
   Después: canchas (`CourtTile`), fotos, horarios y servicios, cómo llegar, partidos abiertos, torneos (con el flag) y reseñas.
2. **Confirmá tu reserva.** "Volver" deja el día y la hora elegidos. Resumen (complejo, día, de qué hora a qué hora, cancha, formato y precio si se ve), una línea con la política de cancelación sacada de la regla real y un solo botón. Sin sesión: el ingreso en la misma pantalla.
3. **Vuelta del ingreso.** Sin la pantalla de `/verify`: vuelve a confirmar y, sin seña, la reserva se confirma sola ("Confirmando tu reserva…"). Con seña, toca "Pagar seña". Si el turno se ocupó mientras entraba, "Ese turno se ocupó mientras entrabas" y la salida "Ver otras horas del {día}".
4. **¡Reserva confirmada!** Insignia, título, el turno en un ticket y una sola acción principal, "Avisarle al grupo" (WhatsApp con día, hora, cancha, formato, dirección y el link del complejo; nunca lleva montos). Secundarias, sin competir: "Cómo llegar", "Agregar al calendario" y "Ver mis reservas". "Falta la seña" y "Pago rechazado" usan solo la insignia y el título: no celebran.

## Estado en la URL y Atrás

`date`, `hora` y `formato` viven en la URL (`parseReserveState`; sin `date` es hoy). Elegir hora empuja una entrada con la marca `tgReserve` (`pushReserveUrl`, `hasReserveStepMark` en `src/lib/booking/reserve-url.ts`), así Atrás cierra la barra antes de salir de la ficha; día y tamaño reemplazan. Lo que se toca con la barra abierta y la cierra (otro día, un tamaño sin lugar a esa hora) se guarda en `pending` y se aplica en el `popstate`. Un link viejo que apunta a un paso abre la misma pantalla con ese día y esa hora elegidos. `profile.viewed` se emite desde `ReserveSection`, una vez por pestaña y complejo, cuando la primera disponibilidad queda resuelta. Pedidos: al entrar se piden la semana y el día (2 contra el balde de `publicAvailability`); cada día nuevo suma 1.

## Estados y rangos

- Canchas: no hay techo; se diseña y se prueba con 1, 3, 5, 10 y 16. Formatos de Fútbol 4 a 11, mezclados en el mismo complejo.
- Horas: las de hoy que ya pasaron no se muestran. Con `closes_next_day`, las de la madrugada van al final del mismo día operativo. El estado de un día cuenta todas las canchas, sin el filtro de tamaño.
- Si se llega por link a un día sin turnos libres: aviso con causa (`DayEmptyState`: cerrado, sin horarios, lleno, sin canchas o error por causa) y una salida arriba del pliegue (el próximo día con lugar, WhatsApp o reintentar). "Tu elección sigue guardada".
- Si el horario se ocupó mientras tanto: la barra sacude 6 px una vez, lo dice y deja elegir otra hora; no se cierra sola.
- Precios visibles: en cada cancha, en la barra y en el resumen. Ocultos (`hidePrices`): ningún monto en ninguna pantalla (el servidor manda `null` y el componente lo vuelve a chequear); con seña, "Para confirmar pagás una seña online con MercadoPago. El resto, en el complejo."
- Pago: sin seña, "Pagás en el complejo"; con seña, MercadoPago (pendiente, aprobada, rechazada).
- Sin portada, fotos, reseñas, WhatsApp o coordenadas: cada bloque desaparece sin dejar hueco. Un nombre de 40 caracteres no rompe la tarjeta, la ficha ni el ticket.
- Carga: la página es ISR (`revalidate = 300`); lo que depende del reloj del visitante (hoy, abierto o cerrado, qué horas quedan) se hidrata en el cliente con un esqueleto de vidrio del mismo alto (`ReserveSkeleton`). La sección lleva `data-state` (`loading`, `ready`, `closed`, `error`) y `aria-busy` solo en `loading`.
- Claro y oscuro de primera, con el tema del sistema.

## Interacción y layout

- Celular primero, con margen de 16 px. Objetivos de 44 px o más (las horas, de 64 px de alto mínimo), campos de 16 px, textos de 13 px o más. La barra de "Reservar" y las hojas respetan el área segura.
- Desde 1024 px, dos columnas: cabecera y resto a la izquierda y la reserva fija a la derecha (480 px). Confirmar y el éxito van en una columna de 480 px.
- Semántica: los días y las horas son botones con `aria-pressed`, no radios (las flechas de un grupo de radios elegirían, y abrirían la barra, sin querer). Tamaño y cancha de la barra sí son grupos de opción única. El nombre accesible de un día lo dice entero ("Viernes 16. Hay lugar") en un `sr-only`. Foco visible, nada depende del hover.
- La barra de "Reservar" va en portal a `<body>` (un `.glass` encerraría a su `fixed`), arrastra hacia abajo para cerrar y Esc la cierra; la página sigue usable detrás.

## Movimiento (dirección §4.5)

Portada de escala 1,08 a 1 y la tarjeta del nombre sube. Elegir día: la píldora se llena con fundido de 150 ms y hace su toque; las horas viejas se apagan en 90 ms y las nuevas entran escalonadas a 24 ms (esqueleto si tarda más de 150 ms). Elegir hora: el cuadrado hace su toque y, en Android, vibra 8 ms. La barra sube con el resorte hoja y la barra de abajo baja en el mismo gesto. Cambiar de cancha: el punto del radio hace su toque y el precio cambia por reemplazo, nunca contando. Decidido en F9: la foto de la tarjeta de `/explorar` se transforma en la portada de la ficha (`complejo-foto-<slug>`) y entrar a la ficha entra 24 px desde la derecha.

**La reserva confirmada es el momento de la app** (`BookingSuccessCard`, `CelebrateOnce`): la insignia entra con el resorte toque y su resplandor florece; se traza el tilde (120 ms), sube el título (200), la bajada (320), el ticket se imprime de arriba hacia abajo con `transform` desde una ranura (`.rv-slot`, 420 ms), el código aparece letra por letra (760) y suben los botones (900). Una vez por reserva: la última festejada se guarda en la cookie `tg_celebrated` (`path=/reserva`), así el servidor pinta `data-seen` al recargar. En Android, una vibración corta doble. Sin confeti.

## Restricciones y decisiones abiertas

- No cambian la lógica de reserva, seña y MercadoPago, ni el panel. La confirmación sola al volver del ingreso dispara la misma Server Action de hoy, una sola vez.
- Contratos de tests: los encabezados que fijan e2e y stories (TG-HP-101 a 106, "¡Reserva confirmada!") se conservan o se cambian a propósito en el mismo PR. Los tests de precios ocultos van en el DoD.
- Nada de datos inventados: canchas libres, formatos, precios y reseñas salen de la base.
- Sin probar: que Google no abra en los navegadores internos. Se prueba en teléfonos reales antes de decidir si el email va primero siempre.

## Spec visual

Lo que comparte todo el portal (vidrio, tokens, piezas, movimiento) está en DESIGN.md › Portal de vidrio. Acá, lo propio de la ficha y la vuelta.

### La ficha del complejo

`/[slug]`, en `src/app/(public)/[slug]/(perfil)/` y `components/` (estilos en `ficha.css` y `ficha-rest.css`).

- **Cabecera (`ComplexHero`):** nombre con `font-display` 700, `font-stretch: 104%`, hasta tres líneas con `text-balance` y `overflow-wrap: anywhere`; debajo, dirección y ciudad y una línea apagada de datos ("5 canchas · Fútbol 5 y 7"); sin dato no se pinta. Accesos en píldora (`pill-link`, 44 px); compartir y guardar, solo ícono de 44×44.
- **Estado de apertura (`OpenStatus`):** una línea siempre en palabras ("Abierto · hasta la 01:00", "Cerrado · abre a las 18:00", "Cerrado hoy"). Antes de hidratar deja una línea vacía del mismo alto. Los cálculos (cierre pasada la medianoche incluido) salen de `src/lib/schedule/open-status.ts`.
- **Reserva (`ReserveSection`, `.reserve glass`):** vidrio real. Título propio con `tabIndex=-1` para recibir el foco. Un `<p role="status" class="sr-only">` anuncia lo elegido.
- **Horas:** `data-state` da el color. Libre en el verde de lugar (`--portal-slot-*`); "Queda 1" en `--portal-warn*`; la elegida, en el verde de acción (degradé del botón) con tilde. Cada estado lleva palabra.
- **Canchas con foto y datos (`CourtTile`):** vidrio pintado de puro texto: nombre en 17 px semibold, "Fútbol 5 · Techada" en 14 px y, si el precio se ve, "Desde $ 60.000" tabular. `CourtCard` es del panel y del onboarding; la ficha no lo usa.
- **Detalles, servicios, torneos y reseñas:** cada bloque desaparece sin dejar hueco cuando no hay dato; sin reseñas no se monta ni un vacío.
- **Partidos abiertos (`OpenMatches`):** tarjetas pintadas con el tipo, la hora y "Ya son N de M", sin personas (como el tablón). Cada una lleva a `/rival/partido/<id>`. Server Component: la ficha es ISR.

### La vuelta de la reserva

`/reserva/[bookingId]/{exito,pendiente,error}`, en `src/app/reserva/`. `reserva/layout.tsx` monta `PortalShell`; cada página y cada `loading.tsx` pone su propio `ReservaDarkShell` (`.portal-ambient` y la columna `.rv-col`). Sin sesión, las tres mandan a `/ingresar?next=/reserva/{id}/{vista}`. Una reserva que no existe, purgada o de otra cuenta (RLS) es `ReservaNotFound`.

- **Resultado (`PortalResult`, `src/components/world/PortalResult.tsx`):** la forma común de pendiente, error, el error de carga y "No encontramos tu reserva", compartida con Rival, `/explorar`, Mis reservas y los `error.tsx` del jugador. Insignia (verde, roja o de vidrio neutro), título, qué pasó y la salida; rojo solo cuando algo falló. Una sola salida verde por pantalla.
- **Éxito (`BookingSuccessCard`):** "¡Reserva confirmada!" (varios tests lo buscan: no cambia), el ticket (`.rv-ticket glass-painted`) con su código, `BookingSummary` con la seña pagada y **una sola acción principal: "Avisarle al grupo"** (`<a href="https://wa.me/?text=…">`; el mensaje lo arma `src/lib/booking/group-share.ts`). Después `BookingSuccessExtras`.
- **Pendiente (`PaymentStatusWatcher` / `PaymentStatusView`):** "Esperando tu pago…" cuando ofrece pagar y "Confirmando tu pago…" a quien ya pagó, sin cuenta regresiva ni "Te queda 6:00"; pasados 30 s, una nota con dónde mirar. Una reserva ya confirmada redirige a `/exito`. Los estados terminales ("La reserva expiró", "Reserva cancelada", "Esta reserva ya pasó", "Se acabó el tiempo", "No pudimos verificar tu pago") dicen qué pasó y qué hacer.
- **Error (`BookingErrorCard`, vistas `retry` / `released` / `canceled` / `past`):** "El pago no se procesó" con "Reintentar pago" mientras el hold lo permite; si no, "Reservar de nuevo"; cancelada y pasada, "Ver mis reservas".
- **Error de carga (`reserva/error.tsx`):** `PortalResult` rojo, "No pudimos cargar esta página", con "Reintentar" y "Ver mis reservas". Reporta a Sentry.
