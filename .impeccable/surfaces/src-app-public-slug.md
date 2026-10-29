---
version: 1
slug: "src-app-public-slug"
primary_target: "src/app/(public)/[slug]"
related_targets: ["src/app/reserva/[bookingId]"]
---

# Página del complejo y reserva (src/app/(public)/[slug]/)

Modo: Operate. Visitante: el jugador amateur que llega por el link de su complejo (redes, WhatsApp) o desde la home y Explorar; casi siempre en el celular y muchas veces dentro del navegador de Instagram o de WhatsApp. No conoce TurnoGol. Trabajo: reservar un turno sin escribirle a nadie, entrar con su cuenta en el camino y avisarle al grupo.

Alcance: página del complejo (`(perfil)`, `disponibilidad` y el modal de la semana), reservar (`reservar`, con el ingreso adentro), la vuelta de la reserva (`src/app/reserva/[bookingId]/{exito,pendiente,error}`) y la vista previa del link en WhatsApp (`generateMetadata`).

## Estado vigente (2026-10-21): este mundo quedó solo en la ficha

El portal volvió a La Previa ([`docs/decisions/2026-10-20-vuelve-la-previa.md`](../../docs/decisions/2026-10-20-vuelve-la-previa.md)). **Excepción del dueño del 2026-10-21: la página del complejo `/[slug]` (logo, portada, elegir hora y después cancha) se queda COMO ESTABA, en La Reserva** (R3 se cerró sin mergear). Por eso este brief **sigue vigente para la ficha** (`(perfil)`, `not-found`, con `PortalWorld` y los tokens `portal-*`) y **ya no rige** para lo demás de su alcance original:

- **Confirmar** (`reservar`) y **la vuelta de la reserva** (`src/app/reserva/[bookingId]/*`) están en La Previa (`ReservaDarkShell`, `.reserva-*`, `.hero-accent-text`), con los cambios de flujo de [`docs/decisions/2026-10-21-confirmar-sin-casilla-y-modal.md`](../../docs/decisions/2026-10-21-confirmar-sin-casilla-y-modal.md): sin "Cómo pagás", un solo botón ("Pagar seña · $X" o "Reservar"), ingreso en un modal, solo email con nombre derivado y +18 por clickwrap sin casilla. Donde este brief dice "cómo se paga", "casilla del +18" o "Nombre y Email", vale esa decisión. Siguen: el estado en la URL, la confirmación sola al volver (`booking-intent.ts`), "Avisarle al grupo", los precios ocultos y la ausencia de cuenta regresiva.
- `/disponibilidad` y el modal de la semana se sacaron (redirige a la ficha).
- Home, Explorar, Mis reservas, Cuenta, el cromo y el ingreso suelto tienen su propio brief y están en La Previa.

## Reserva en tres pasos (2026-10-29)

Decisión del dueño: [`docs/decisions/2026-10-29-ficha-reserva-en-pasos.md`](../../docs/decisions/2026-10-29-ficha-reserva-en-pasos.md). Supera a este brief en todo lo que diga de chips de días, de horas como grupo de radios y de canchas desplegadas debajo de la hora.

- En el celular la reserva pasa a ser una pregunta por pantalla: "¿Qué día querés jugar?", "¿A qué hora?" y "¿En qué cancha?". Tocar una opción avanza y tocar la cancha lleva a confirmar.
- La barra del paso ("← Volver", "Paso N de 3" y tres segmentos) queda pegada debajo de la barra de TurnoGol. Debajo de lg, la sección ocupa la pantalla.
- El día es un paso propio aunque sea "Hoy". Cada día dice su estado: "Hay lugar", "Completo", "Sin horarios" o "Cerrado".
- El paso vive en la URL: sin `date` es el paso 1, con `date` el 2 y con `date` y `hora` el 3. El atrás del celular retrocede un paso.
- El paso entra de costado con una View Transition de la plataforma.

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

1. **Página del complejo.** Barra de TurnoGol; portada; nombre, dirección y si está abierto; Cómo llegar y WhatsApp. Debajo, la reserva en tres pasos (2026-10-29):
   - **Paso 1, el día:** hoy más los de `booking_advance_days`, con "Reservás hasta 6 días antes" y el estado de cada día.
   - **Paso 2, la hora:** arriba el formato, solo si el complejo tiene más de uno ("Todos", "Fútbol 5", "Fútbol 7"); debajo, las horas con su estado.
   - **Paso 3, la cancha:** las canchas libres a esa hora. Tocar una cancha lleva a confirmar.

   Después de la reserva: canchas con fotos, fotos, horarios y servicios, cómo llegar y reseñas (torneos, con el flag).
2. **Confirmá tu reserva.** "Volver" deja el día y la hora elegidos. Resumen (complejo, día, de qué hora a qué hora, cancha, formato y precio si se ve), cómo se paga y una línea con la política de cancelación, sacada de la regla real. Con sesión: botón fijo "Confirmar reserva" (o "Pagar la seña"). Sin sesión: fila del +18 (casilla, ADR-012) y "Continuar con Google" y "Continuar con mi email" (nombre y email, sin apellido), uno debajo del otro y del mismo alto; el verde, uno solo, en el envío del email. Sin seña, la línea "Entrás y la reserva queda confirmada." y el "enviado" dice "Cuando lo toques, tu reserva queda confirmada."; con seña, ninguna promesa: el "enviado" dice que el enlace trae de vuelta a esta pantalla para confirmar. Tocar un botón sin la casilla marca el error en la casilla, no deshabilita nada. En navegadores internos (Instagram, Facebook, TikTok) va primero el email, con la aclaración de que Google puede no abrir ahí. Email enviado: a qué dirección, "Reenviar enlace" (con su espera) y "Usar otro email", como en `/ingresar`.
3. **Vuelta del ingreso.** Sin la pantalla de `/verify` ni su cuenta regresiva: vuelve a confirmar y, sin seña, la reserva se confirma sola ("Confirmando tu reserva…"), porque el jugador ya tocó "Continuar". Con seña, toca "Pagar la seña". El vínculo vale 60 minutos por mail (lo que dura el enlace) y 10 por Google; si no vale (vencido, otra cuenta, otro turno), queda la pantalla normal con "Tocá Confirmar reserva para terminar.". Si el turno se ocupó mientras entraba, "Ese turno se ocupó mientras entrabas" y la salida "Ver otras horas del {día}", a las horas de ese día.
4. **¡Reserva confirmada!** Resumen con el formato y una sola acción principal, "Avisarle al grupo" (WhatsApp con día, hora, cancha, formato, dirección y el link del complejo). Secundarias, sin competir: Cómo llegar, Agregar al calendario, Ver mis reservas. Pendiente: "Confirmando tu pago…" a quien ya pagó, sin cuenta regresiva ni "Te queda 6:00". Error: qué pasó con el pago y con el turno, y qué hacer.

## Resultado y prueba

- Vara F3 contra `docs/planning/2026-10-14-portal-jugador-linea-base.md`, complejo sin seña, turno de hoy:
  - A, nuevo con Google: de 5 toques a 4 (hora, cancha, casilla, Google). Con seña se suma "Pagar la seña": son 5.
  - B, nuevo con email: de 6 toques y 3 campos a 5 y 2 (hora, cancha, casilla, "Continuar", el enlace del mail). Con seña se suma "Pagar la seña": son 6.
  - D, vuelve sin sesión: de 5 a 4.
  - C, vuelve con sesión: de 2 a 3 (hora, cancha, confirmar). Es el costo de elegir hora y después cancha; a cambio, la página entra en el celular con cualquier cantidad de canchas y el formato se ve antes de reservar. La barra inferior deja "Reservas" y "Reservar de nuevo" a un toque; "Tu próximo turno" en la home quedó fuera del 2.5 hasta que el uso lo pida.
- Desde el 2026-10-29 el día es un paso propio y cada camino suma un toque. Por ejemplo, C pasa a 4: día, hora, cancha y confirmar. El dueño eligió ese costo a cambio de una sola cosa para tocar por pantalla ([`2026-10-29-ficha-reserva-en-pasos.md`](../../docs/decisions/2026-10-29-ficha-reserva-en-pasos.md)).
- Cada error dice qué pasó y qué hacer (la línea base inventaría 70 textos; 40 fallan hoy).

## Estados y rangos

- Canchas: no hay techo; se diseña y se prueba con 1, 3, 5, 10 y 16. Formatos de Fútbol 4 a 11, mezclados en el mismo complejo. El formato va en cada cancha, en el resumen, en el éxito y en el mensaje al grupo: hoy `PublicCourt` no lo trae y se suma el campo a la lectura (`public.service.ts:147-153`).
- Días: cada fila del paso 1 dice "Hay lugar", "Completo", "Sin horarios" o "Cerrado"; las tres últimas van deshabilitadas. El estado sale de la consulta de la semana y cuenta todas las canchas, sin el filtro de formato (que está en el paso 2 y en el 1 no se ve); mientras carga, si falla o pasada la semana, la fila se toca sin estado. Si se llega por link a un día sin turnos libres: "No quedan horarios el jueves 15" y un botón al próximo día con lugar.
- Horas: las de hoy que ya pasaron no se muestran. Con `closes_next_day`, las de la madrugada van al final del mismo día operativo, como hoy. Por hora: "N libres", "Queda 1" (dato real), "Completo" tachado y deshabilitado. Si el formato elegido deja una sola cancha, la hora libre dice "Libre", sin ámbar: con una cancha, "Queda 1" sería urgencia falsa. Si lo único que queda está retenido por alguien que paga la seña, se respeta la decisión v2 D1: "Señando", que puede liberarse.
- Precios visibles: en cada cancha y en el resumen. Ocultos (`hidePrices`): ningún monto en ninguna pantalla; con seña, "Para confirmar pagás una seña online con MercadoPago. El resto, en el complejo."
- Pago: sin seña, "Pagás en el complejo" (elegir efectivo o transferencia solo si acepta los dos); con seña, MercadoPago (pendiente, aprobada, rechazada).
- Sin reserva online: se ven las horas y tocar una cancha abre WhatsApp con el pedido escrito (teléfono si no hay WhatsApp).
- Sin portada, fotos, reseñas, WhatsApp o coordenadas: cada bloque desaparece sin dejar hueco. Nombre largo: pasados ~28 caracteres baja a 24 px para entrar en dos líneas; tres líneas como tope.
- Errores: no cargan las horas (reintentar); se ocupó el turno; el pago falló o se canceló; la cuenta es de un complejo (el mensaje de F5).
- Claro y oscuro de primera, con el tema del sistema.

## Interacción y layout

- Celular primero, con margen de 16 px. Tamaños mínimos: días de 64 px, horas de 64 px y canchas de 72 px, todos con borde de control. Botón fijo de 52 px con el área segura del iPhone.
- La grilla de horas cuenta columnas por el ancho de su contenedor: 3, y 6 desde 640 px.
- Al cambiar de paso, solo debajo de lg, la página se alinea al instante con la barra del paso. Después el paso nuevo entra de costado, 200 ms en total; con reduce-motion cambia sin animarse. El foco va al título del paso y una región viva dice "Paso N de 3".
- Desde 1024 px, dos columnas: el complejo a la izquierda y la reserva fija a la derecha, con los mismos tres pasos, la barra sin pegar y sin mover la página. Confirmar y el éxito van en una columna de ~560 px.
- Semántica: los días, las horas y las canchas que avanzan son botones, no radios, porque las flechas de un grupo de radios avanzarían de paso sin querer. El formato filtra y sigue siendo un grupo de opción única. Foco visible y nada que dependa del hover.
- La elección vive en la URL (día, formato, hora). Avanzar hace `pushState` y el formato `replaceState`. El link compartido y "Volver" la conservan.

## Restricciones y decisiones abiertas

- No cambian la lógica de reserva, seña y MercadoPago, ni el panel. Lecturas nuevas: `format` en `PublicCourt` y la política de cancelación en reservar. La confirmación sola al volver del ingreso dispara la misma Server Action de hoy, una sola vez; la vuelta directa toca el callback de auth (PR 1B) y lleva revisión fresca.
- Tokens propios del portal bajo `[data-world]` (PR 2.0), sin tocar `:root`, `.dark`, `.dark-surface` ni `src/components/ui/*`. Fuentes: Archivo e Inter, ya cargadas; ninguna nueva.
- Contratos de tests: los encabezados que fijan e2e y stories (TG-HP-101 a 106, "¡Reserva confirmada!") se conservan o se cambian a propósito en el mismo PR. Los tests de precios ocultos van en el DoD.
- Nada de datos inventados: canchas libres, formatos, precios y reseñas salen de la base.
- Decidido (2026-10-15): `/disponibilidad` y el modal de la semana se sacan. `/disponibilidad` redirige a la página del complejo en ese día (los links viejos siguen andando) y `profile.viewed`, que hoy sale de ahí, pasa a la primera carga de horas de la página del complejo, con la nota del cambio en las métricas.
- Sin probar: que Google no abra en los navegadores internos. Se prueba en teléfonos reales antes de decidir si el email va primero siempre.

## Direction contract

THESIS: Reservar es lo primero de la página: el jugador elige la hora y después la cancha, como en ATC, y llega a confirmar con todo escrito. Es el estándar de las apps de reservas de canchas con terminación de primera; rechaza la ficha de perfil con la grilla enterrada bajo fotos, canchas y reseñas, y cualquier disfraz temático.
OWN-WORLD: Superficies planas: blanco con bordes de 1 px en claro, en oscuro, el fondo y las tarjetas del panel (`--background`, #030711, y `--card`); sin sombras, halos ni vidrio. Un solo verde de marca (emerald-700 con texto blanco; emerald-500 con texto slate-950 en oscuro) para lo elegido y la acción principal; ámbar solo para "Queda 1". Archivo 800 recta en el nombre del complejo y los títulos, Inter en el resto, cifras tabulares en horas y precios. Días en filas a lo ancho con su estado, horas en botones de 12 px de radio en grilla de 3 y canchas en tarjetas tocables con el formato como etiqueta, todos con borde de control; lo elegido lleva relleno verde y tilde, nunca solo color.
STORY: Ve que está en su complejo (foto, nombre, si está abierto, cómo llegar), entiende de un vistazo qué horas quedan libres y cuántas canchas, toca una hora, toca la cancha con su formato, lee cuándo, dónde, cuánto y qué pasa si cancela, entra con Google o con su email y la reserva queda hecha; después le avisa al grupo.
FIRST VIEWPORT: A 390×844: barra de TurnoGol de 56 px; portada a lo ancho de ~160 px con radio de 16 px (sin portada no hay bloque); nombre en 28 px, dirección y "Abierto · hasta la 01:00"; Cómo llegar y WhatsApp de 44 px. Debajo, el paso 1: "Paso 1 de 3" con sus segmentos, "¿Qué día querés jugar?" y los primeros días a la vista, "Hoy" arriba. Firma: una pregunta por pantalla. Tocar un día sube la página hasta la barra del paso, pegada bajo la de TurnoGol, y el paso nuevo entra de costado. Tocar una hora lleva a las canchas y tocar una cancha, a confirmar. "Volver" y el atrás del celular retroceden un paso. Movimiento: 200 ms en total, el paso viejo se apaga antes de que el nuevo se asiente, sin rebotes; con reduce-motion, nada se anima.
FORM: El estándar de la categoría: la salida permanente de la ronda, fuera de la lista ordenada de candidatos. Boceto aprobado `.impeccable/mocks/decision/canon.html`, con un cambio: la cancha se toca y lleva a confirmar, sin radio ni barra fija en la página del complejo (el botón fijo queda en confirmar). Seed 2cd7b7ed.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
