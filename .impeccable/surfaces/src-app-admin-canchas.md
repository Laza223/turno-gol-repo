---
version: 1
slug: "src-app-admin-canchas"
primary_target: "src/app/(admin)/canchas"
related_targets: []
---

# Canchas (src/app/(admin)/canchas)

Spec visual vigente de la pantalla. Vivía en DESIGN.md › Components y se movió acá el 2026-10-29 sin cambios de contenido, para que DESIGN.md quede con lo que comparten todas las pantallas (tokens, reglas y componentes compartidos), que sigue mandando sobre esto. Esta pantalla todavía no tiene brief de `shape`.

## Canchas

`/canchas` (`CourtList` + `CourtForm` + `price-setup/`), refinada el 2026-09-25: el dueño eligió "la tabla de B con el editor de A" entre tres variantes (`docs/decisions/2026-09-25-canchas-tabla-y-precio-simple.md`). Se toca en el alta del complejo y cuando algo cambia; lo que tiene que salir sin ayuda es cargar el precio.

- **Lista:** una tabla dentro de una tarjeta, una fila por cancha: miniatura y nombre ("Fútbol 5 · Sintético"), el precio del turno, "En tu perfil" (el badge Activa/Pausada con lo que ve el jugador: "Los jugadores la ven y la reservan" / "Los jugadores no la ven") y "Pausar"/"Reactivar" + "Editar". Desde `lg` es fila con encabezado de columnas; en el teléfono, la misma fila apilada (un solo DOM, sin `ResponsiveList`). Sin foto, la miniatura es un hueco punteado "Sin foto" que abre el editor en Fotos; el precio también es botón y abre el editor.
- **Precio en una línea:** "$ 60.000 hasta las 18:00 · $ 84.000 desde las 18:00", con los días en su propia columna cuando algún día cobra distinto ("Lun a Vie", "Sáb"). Lo que se edita hora por hora se resume como rango ("$ 70.000 a $ 110.000 según la hora"). Sin precio, "Sin precio" en ámbar.
- **Editor:** reemplaza a la lista (volver a "Canchas" arriba, nombre de la cancha como título), en `max-w-3xl` y una sola tarjeta con tres secciones: La cancha, Precio del turno y Fotos (con "Así la ve el jugador", la misma `CourtCard` del portal). "Guardar" va en una barra pegajosa al pie, arriba de la barra inferior en el teléfono.
- **Precio del turno:** dos preguntas por sí o no ("¿Cobrás distinto a la noche?" con "desde las", "¿Algún día cobrás distinto?" con los días en chips) y hasta cuatro precios; lo que se tipea ya vale, no hay "Aplicar". Debajo, "Así queda la semana": una barra por día con los tramos teñidos de verde según el precio (más caro, más oscuro), lo que falta en ámbar punteado y los días cerrados. "Igual que Cancha 1 y Cancha 2" copia el precio de otra cancha (las que cobran igual son una sola opción) y queda marcado mientras coincide. "Ajustar hora por hora" abre la grilla día × hora, plegada; si lo cargado no entra en las dos preguntas se edita solo ahí, nunca se pisa en silencio, y "Pasar a un precio simple" ofrece "Deshacer". Con un solo día abierto no se pregunta por otro día, y el "Sí" siempre deja al menos un día con el precio de siempre.
- **Pausar:** `ConfirmDialog` destructivo que dice qué deja de pasar (no se ve en el perfil, no entran turnos nuevos) y lista los turnos por delante y los fijos. Reactivar es un clic con "Deshacer", salvo que suba la cuota: ahí va el aviso de facturación, sin suavizar.
