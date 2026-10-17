---
version: 1
slug: "src-app-public-slug"
primary_target: "src/app/(public)/[slug]"
related_targets: ["src/app/reserva/[bookingId]"]
---

# Página del complejo y reserva (src/app/(public)/[slug]/)

Modo: Operate. Visitante: el jugador amateur que llega por el link de su complejo (redes, WhatsApp) o desde la home y Explorar; casi siempre en el celular y muchas veces dentro del navegador de Instagram o de WhatsApp. No conoce TurnoGol. Trabajo: reservar un turno sin escribirle a nadie, entrar con su cuenta en el camino y avisarle al grupo.

Alcance: página del complejo (`(perfil)`, `disponibilidad` y el modal de la semana), reservar (`reservar`, con el ingreso adentro), la vuelta de la reserva (`src/app/reserva/[bookingId]/{exito,pendiente,error}`) y la vista previa del link en WhatsApp (`generateMetadata`). Home, Explorar, Mis reservas, Perfil, el cromo (barra, pie, "Ingresar" con `next`) y el ingreso suelto (`/ingresar`, `/verify`, `/aceptar-terminos`) van en sus PRs y heredan este mundo.

## Decisiones del dueño (2026-10-15)

- Mundo: el estándar de la categoría, sin mundo temático. Flujo de referencia: ATC. Terminación: más linda y moderna que la de ATC, sin perder accesibilidad. "Lo importante es que se entienda muy bien el flujo en mobile, que sea interactivo y cualquier persona sepa reservar."
- Se elige la hora y después la cancha.
- La página es de TurnoGol (marca y marco) y, adentro, del complejo: su nombre, su foto, sus datos y sus reglas.
- La reserva termina con "Avisarle al grupo". Sin QR (#423) y sin "Seguir explorando".
- Confirmó este brief: al volver de Google o del mail la reserva se confirma sola, y `/disponibilidad` y el modal de la semana se sacan, con redirección a la página del complejo en ese día.

## Qué se toma de ATC y qué se hace mejor

Relevado el 2026-10-15 en el celular, sobre un complejo de F5 y F7 de Moreno, por el link directo de su ficha (capturas en el scratchpad de la sesión).

- Se toma: la reserva arriba en la ficha; formato, día, hora y cancha en ese orden; tocar la cancha lleva directo a confirmar, sin resumen intermedio; la ventana de reserva dicha en palabras; el día cerrado con salida al próximo día abierto; confirmar corto con el botón fijo abajo; la elección guardada en la URL.
- Se hace mejor: nada encima de la página (ni aviso de app, ni banner, ni chat); el formato con palabras y no con un ícono; lo elegido inequívoco (relleno verde y tilde, en ATC es un gris casi blanco); "N libres" y "Completo" a la vista en vez de horas que desaparecen sin explicación; el ingreso con lo elegido a la vista y con salida, sin botón de "usar la app"; precios con separador de miles; textos de 13 px o más, campos de 16 px, toques de 44 px o más y contraste AA; errores y vacíos que dicen qué hacer, arriba del pliegue.

## Flujo

1. **Página del complejo.** Barra de TurnoGol; portada; nombre, dirección y si está abierto; Cómo llegar y WhatsApp. Debajo, la reserva: formato (solo si el complejo tiene más de uno: "Todos", "Fútbol 5", "Fútbol 7"), días (hoy más los de `booking_advance_days`, con "Reservás hasta 6 días antes"), horas del día con su estado y, al tocar una hora, las canchas libres a esa hora. Tocar una cancha lleva a confirmar. Después: canchas con fotos, fotos, horarios y servicios, cómo llegar y reseñas (torneos, con el flag).
2. **Confirmá tu reserva.** "Volver" deja el día y la hora elegidos. Resumen (complejo, día, de qué hora a qué hora, cancha, formato y precio si se ve), cómo se paga y una línea con la política de cancelación, sacada de la regla real. Con sesión: botón fijo "Confirmar reserva" (o "Pagar la seña"). Sin sesión: fila del +18 (casilla, ADR-012) y "Continuar con Google" y "Continuar con mi email" (nombre y email, sin apellido), uno debajo del otro y del mismo alto; el verde, uno solo, en el envío del email. Desde el 2.3b2, la línea "Entrás y la reserva queda confirmada"; hasta entonces, el "enviado" dice que el enlace trae de vuelta a esta pantalla para confirmar. Tocar un botón sin la casilla marca el error en la casilla, no deshabilita nada. En navegadores internos (Instagram, Facebook, TikTok) va primero el email, con la aclaración de que Google puede no abrir ahí. Email enviado: a qué dirección, "Reenviar enlace" (con su espera) y "Usar otro email", como en `/ingresar`.
3. **Vuelta del ingreso.** Sin la pantalla de `/verify` ni su cuenta regresiva: vuelve a confirmar y la reserva se confirma sola, porque el jugador ya tocó "Continuar". Si el turno se ocupó mientras entraba, lo dice y lo lleva a las horas de ese día. (llega en el 2.3b2)
4. **¡Reserva confirmada!** Resumen con el formato y una sola acción principal, "Avisarle al grupo" (WhatsApp con día, hora, cancha, formato, dirección y el link del complejo). Secundarias, sin competir: Cómo llegar, Agregar al calendario, Ver mis reservas. Pendiente: "Confirmando tu pago…" a quien ya pagó, sin cuenta regresiva ni "Te queda 6:00". Error: qué pasó con el pago y con el turno, y qué hacer.

## Resultado y prueba

- Vara F3 contra `docs/planning/2026-10-14-portal-jugador-linea-base.md`, complejo sin seña, turno de hoy:
  - A, nuevo con Google: de 5 toques a 4 (hora, cancha, casilla, Google). Los 4 se alcanzan con la confirmación sola del 2.3b2; en el 2.3b1 el jugador vuelve a esta pantalla y confirma: son 5.
  - B, nuevo con email: de 6 toques y 3 campos a 5 y 2 (hora, cancha, casilla, "Continuar", el enlace del mail). Los 5 se alcanzan con la confirmación sola del 2.3b2; en el 2.3b1 se suma el toque de confirmar al volver: son 6.
  - D, vuelve sin sesión: de 5 a 4.
  - C, vuelve con sesión: de 2 a 3 (hora, cancha, confirmar). Es el costo de elegir hora y después cancha; a cambio, la página entra en el celular con cualquier cantidad de canchas y el formato se ve antes de reservar. "Tu próximo turno" y "Repetir" en la home (PR 2.5) lo compensan.
- Cada error dice qué pasó y qué hacer (la línea base inventaría 70 textos; 40 fallan hoy).

## Estados y rangos

- Canchas: no hay techo; se diseña y se prueba con 1, 3, 5, 10 y 16. Formatos de Fútbol 4 a 11, mezclados en el mismo complejo. El formato va en cada cancha, en el resumen, en el éxito y en el mensaje al grupo: hoy `PublicCourt` no lo trae y se suma el campo a la lectura (`public.service.ts:147-153`).
- Días: día cerrado o feriado del complejo, visible y deshabilitado con "Cerrado". Día sin turnos libres: "No quedan horarios el jueves 15" y un botón al próximo día con lugar.
- Horas: las de hoy que ya pasaron no se muestran. Con `closes_next_day`, las de la madrugada van al final del mismo día operativo, como hoy. Por hora: "N libres", "Queda 1" (dato real), "Completo" tachado y deshabilitado. Si el formato elegido deja una sola cancha, la hora libre dice "Libre", sin ámbar: con una cancha, "Queda 1" sería urgencia falsa. Si lo único que queda está retenido por alguien que paga la seña, se respeta la decisión v2 D1: "Señando", que puede liberarse.
- Precios visibles: en cada cancha y en el resumen. Ocultos (`hidePrices`): ningún monto en ninguna pantalla; con seña, "Para confirmar pagás una seña online con MercadoPago. El resto, en el complejo."
- Pago: sin seña, "Pagás en el complejo" (elegir efectivo o transferencia solo si acepta los dos); con seña, MercadoPago (pendiente, aprobada, rechazada).
- Sin reserva online: se ven las horas y tocar una cancha abre WhatsApp con el pedido escrito (teléfono si no hay WhatsApp).
- Sin portada, fotos, reseñas, WhatsApp o coordenadas: cada bloque desaparece sin dejar hueco. Nombre largo: pasados ~28 caracteres baja a 24 px para entrar en dos líneas; tres líneas como tope.
- Errores: no cargan las horas (reintentar); se ocupó el turno; el pago falló o se canceló; la cuenta es de un complejo (el mensaje de F5).
- Claro y oscuro de primera, con el tema del sistema.

## Interacción y layout

- Celular primero: margen de 16 px; las horas entran en la primera pantalla con al menos dos filas a la vista; grilla de horas que cuenta columnas por el ancho de su contenedor (3 por debajo de 328 px, 4 desde ahí y 6 desde 640 px); filas de cancha de 64 px o más; botón fijo de 52 px con el área segura del iPhone.
- Desde 1024 px, dos columnas: el complejo a la izquierda y la reserva fija a la derecha. Confirmar y el éxito van en una columna de ~560 px.
- Semántica: días, formatos y horas como grupos de opción única con teclado; el cambio de lista se anuncia; foco visible; nada depende del hover.
- La elección vive en la URL (día, formato, hora): el link compartido y "Volver" la conservan.

## Restricciones y decisiones abiertas

- No cambian la lógica de reserva, seña y MercadoPago, ni el panel. Lecturas nuevas: `format` en `PublicCourt` y la política de cancelación en reservar. La confirmación sola al volver del ingreso dispara la misma Server Action de hoy, una sola vez; la vuelta directa toca el callback de auth (PR 1B) y lleva revisión fresca.
- Tokens propios del portal bajo `[data-world]` (PR 2.0), sin tocar `:root`, `.dark`, `.dark-surface` ni `src/components/ui/*`. Fuentes: Archivo e Inter, ya cargadas; ninguna nueva.
- Contratos de tests: los encabezados que fijan e2e y stories (TG-HP-101 a 106, "¡Reserva confirmada!") se conservan o se cambian a propósito en el mismo PR. Los tests de precios ocultos van en el DoD.
- Nada de datos inventados: canchas libres, formatos, precios y reseñas salen de la base.
- Decidido (2026-10-15): `/disponibilidad` y el modal de la semana se sacan. `/disponibilidad` redirige a la página del complejo en ese día (los links viejos siguen andando) y `profile.viewed`, que hoy sale de ahí, pasa a la primera carga de horas de la página del complejo, con la nota del cambio en las métricas.
- Sin probar: que Google no abra en los navegadores internos. Se prueba en teléfonos reales antes de decidir si el email va primero siempre.

## Direction contract

THESIS: Reservar es lo primero de la página: el jugador elige la hora y después la cancha, como en ATC, y llega a confirmar con todo escrito. Es el estándar de las apps de reservas de canchas con terminación de primera; rechaza la ficha de perfil con la grilla enterrada bajo fotos, canchas y reseñas, y cualquier disfraz temático.
OWN-WORLD: Superficies planas: blanco con bordes de 1 px en claro, en oscuro, el fondo y las tarjetas del panel (`--background`, #030711, y `--card`); sin sombras, halos ni vidrio. Un solo verde de marca (emerald-700 con texto blanco; emerald-500 con texto slate-950 en oscuro) para lo elegido y la acción principal; ámbar solo para "Queda 1". Archivo 800 recta en el nombre del complejo y los títulos, Inter en el resto, cifras tabulares en horas y precios. Días en chips, horas en botones de 12 px de radio en grilla, canchas en filas tocables con el formato como etiqueta; lo elegido lleva relleno verde y tilde, nunca solo color.
STORY: Ve que está en su complejo (foto, nombre, si está abierto, cómo llegar), entiende de un vistazo qué horas quedan libres y cuántas canchas, toca una hora, toca la cancha con su formato, lee cuándo, dónde, cuánto y qué pasa si cancela, entra con Google o con su email y la reserva queda hecha; después le avisa al grupo.
FIRST VIEWPORT: A 390×844: barra de TurnoGol de 56 px; portada a lo ancho de ~160 px con radio de 16 px (sin portada no hay bloque); nombre en 28 px, dirección y "Abierto · hasta la 01:00"; Cómo llegar y WhatsApp de 44 px; formatos si hay más de uno; chips de días; grilla de horas de hoy con "N libres", "Queda 1" y "Completo" tachado, con dos filas a la vista. Firma: tocar una hora despliega debajo, en el lugar, las canchas libres a esa hora, y tocar una cancha lleva a confirmar; si la lista queda fuera de vista, la página baja lo justo. Movimiento: de 150 a 200 ms, ease-out, sin rebotes; con reduce-motion, nada se anima.
FORM: El estándar de la categoría: la salida permanente de la ronda, fuera de la lista ordenada de candidatos. Boceto aprobado `.impeccable/mocks/decision/canon.html`, con un cambio: la cancha se toca y lleva a confirmar, sin radio ni barra fija en la página del complejo (el botón fijo queda en confirmar). Seed 2cd7b7ed.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
