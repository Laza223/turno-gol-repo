---
version: 1
slug: "src-app-admin-grilla"
primary_target: "src/app/(admin)/grilla"
related_targets: ["src/lib/story-image"]
---

# Grilla de turnos y Placa para historias (src/app/(admin)/grilla)

Spec visual vigente de la pantalla. Vivía en DESIGN.md › Components y se movió acá el 2026-10-29 sin cambios de contenido, para que DESIGN.md quede con lo que comparten todas las pantallas (tokens, reglas y componentes compartidos), que sigue mandando sobre esto. Esta pantalla todavía no tiene brief de `shape`.

## Grilla de turnos

La pieza propia del panel (`BookingCard` + `gridMoneyVisual` en `slot-visual.ts`). Variante "Entra entera", elegida por el dueño el 2026-09-25 (`docs/decisions/2026-09-25-grilla-entera-y-agenda.md`).

- **Entra entera:** a 1280×650 entran 12 canchas sin scroll horizontal (columnas de 4,75rem mínimo desde `lg`, 3rem en el teléfono) y las horas estiran la fila hasta llenar el alto (`minmax(3.5rem, 1fr)`). La mañana sin turnos se pliega en una línea: "09:00–17:00 · Sin turnos · Mostrar". Si igual hay scroll horizontal (teléfono con más de 6 canchas, escritorio angosto), un degradé en el borde derecho y la pastilla "N canchas →" avisan que hay más.
- **Turno:** bloque de esquina de 6 px sobre `card`, con el **borde izquierdo de 3 px** y el tinte de su tono. **El color es de la plata**, como en Hoy: rojo "No cobrado" lo que ya terminó con saldo (por `ends_at`, esté `confirmed` o `completed`; nunca "deuda"), verde "Pagado", ámbar "Esperando seña". Lo que todavía no se jugó va neutro (`bg-secondary`, borde `slate`) con el monto en gris; ausente, sin cargo y bloqueo también (el bloqueo, rayado). El contenido responde al ancho de la celda con container queries: nombre en una o dos líneas (12 px, 14 px en celdas anchas), "Evento · N h" si entra, monto corto o "Falta $ X".
- **Ahora:** la línea roja pasa por debajo de las tarjetas (no tacha nombres) y la hora actual va en negrita con un punto rojo.
- **Libre:** solo las líneas de la grilla y un `+` tenue en lo que todavía no pasó. La reserva que entra por Realtime pulsa una vez (600 ms).
- **Encabezado:** la fecha centrada en la barra superior, "‹ Viernes 25 de septiembre · Hoy · calendario ›" (corta debajo de `xl`); tocarla abre la semana y un selector de fecha, y fuera de hoy aparece "Hoy" para volver. A la derecha, el chip rojo "N sin cobrar · $ X": cuenta solo lo jugado, igual que la celda y que Hoy, y al encenderse pone el único anillo de la grilla (2 px rojo) sobre esos turnos.

## Placa para historias (turnos libres del día)

Una imagen 9:16 (1080×1920, PNG) que el dueño sube a una historia de Instagram o a un estado de WhatsApp. Sale del botón de compartir de la barra de la Grilla (un ícono con tooltip en escritorio; en el teléfono va en la fila de abajo, con el rótulo "Compartir turnos" cuando no hay chip de "sin cobrar") y la dibuja `GET /api/public/story` (`src/lib/story-image/`). Lo hacían a mano con ChatGPT; acá sale con los datos reales y la paleta de la marca. No es una pantalla del panel: es una pieza de marketing con su propio mundo visual, siempre oscura (azul noche `#020617` con haces esmeralda y una cancha vertical en trazo finísimo), sin importar el tema del panel. De arriba a abajo:

- **Fecha → titular → complejo:** "HOY · MARTES", el titular "HOY SE JUEGA." (el día cambia: "MAÑANA SE JUEGA.", "SÁBADO SE JUEGA."; el punto va en esmeralda), el nombre del complejo y la pastilla "TURNOS DISPONIBLES". Archivo 900 itálica para los números y el titular, Inter 600 para el resto.
- **Horarios:** hasta cuatro, cada uno con la hora y "N canchas" libres. Con más de cuatro se muestran los primeros y una línea "y N horarios más": la tipografía **no se achica** para meterlos todos (una historia se lee a un tercio de su tamaño). Desde el 2026-10-26 el dueño puede **elegir cuáles** (hasta 4) con chips de horas debajo de los chips de día en el diálogo: sin tocar nada salen los primeros 4 como siempre; con horas elegidas salen solo esas, sin "y N horarios más" (`?hours=20:00,21:00`). El diálogo también se abre desde un botón flotante "Compartir horarios" en Hoy (con X; vuelve al día operativo siguiente).
- **Llamado y URL:** "RESERVÁ TU CANCHA" ("MIRÁ LOS HORARIOS" si el complejo no toma reservas online) y la URL real del portal, sin esquema. El logo de TurnoGol (`logo_principal.png`, el de fondos oscuros del manual de marca) es la única marca de agua, chico, al pie.
- **Margen seguro:** 250 px arriba y abajo, donde la interfaz de Instagram tapa la imagen. Todo lo que se lee vive en el medio; el fondo sale a sangre.
- **Ni hora de actualización, ni WhatsApp, ni "con TurnoGol":** el pedido del dueño los sacó a los tres. Nada que no venga de los datos del complejo.
- **Excepción a "nada de hex inline":** satori (el motor de `next/og`) no lee variables CSS ni tokens de Tailwind, así que los colores de marca se repiten en `render.tsx`, en un solo lugar. Si cambia un token de marca, hay que cambiarlo ahí también.
- **El enlace dibujado no se toca:** por eso el diálogo ofrece "Copiar link" aparte (para el sticker "Link" de Instagram o el mensaje de WhatsApp).
