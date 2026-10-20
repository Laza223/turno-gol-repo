---
version: 1
slug: "src-app-player"
primary_target: "src/app/(player)"
related_targets: []
---

# Mis reservas y Cuenta del jugador (src/app/(player)/)

Modo: Operate. Visitante: el jugador que ya reservó. Entra por la barra inferior ("Reservas", "Cuenta"), por el menú de cuenta o por el link de un mail, casi siempre desde el celular. Trabajo, de más a menos frecuente: saber cuándo y dónde juega, avisarle al grupo, llegar, reservar de nuevo, cancelar si no van; y, cada tanto, corregir sus datos, volver a un favorito o salir.

Mundo: La Reserva (DESIGN.md, sección del portal), igual que la página del complejo y la vuelta de la reserva. Este brief no abre un mundo nuevo: hereda el de `src-app-public-slug.md`. Se va La Previa del contenido: banda hero con glow y grilla, títulos en itálica negra, levante y sombra en tarjetas, colores de paleta fuera de tokens, textos de 10 y 12 px.

## Decisiones del dueño (2026-10-17)

- **Cuenta es una sola página** en `/configuracion`: tus datos, favoritos, actividad, tema, salir, descargar tus datos y eliminar la cuenta. `/perfil` (con o sin `?tab=`) redirige ahí y lleva al bloque que corresponde.
- **Sin los interruptores de avisos.** No controlan ningún envío y el jugador no tiene push. En su lugar va una línea que dice qué mails llegan siempre (confirmación, cancelación, cambios de horario y vencimiento de la seña). Las columnas `notify_email` y `notify_push` quedan en la base sin tocar.
- **Apellido opcional** en tus datos, como en la reserva desde el 2.3b1.

## Mis reservas (`/mis-reservas`), PR 2.4a

- **La próxima, primero.** En Próximos, el orden va de la más cercana a la más lejana. La primera tarjeta es la próxima y se lee sola: "Hoy", "Mañana" o el día, la hora, la cancha con su formato, el complejo y la dirección. Historial sigue de la más nueva a la más vieja.
- **Cada tarjeta se puede abrir.** Lleva a `/reserva/{id}/exito` si está confirmada; ahí ya están "Avisarle al grupo", "Cómo llegar" y el calendario. En la tarjeta de la próxima, "Avisarle al grupo" va también a un toque. Cancelar sigue en la tarjeta, sin cambiar sus textos fijados.
- **La seña se ve.** Con seña pagada dice que está señada. Sin seña, "Pagás en el complejo". "Esperando seña" explica que falta la seña y que, si no se paga a tiempo, el turno se libera (la reserva retenida dura minutos y `/reserva/{id}/error` habla de un pago rechazado, así que no lleva a ningún lado). Con precios ocultos no aparece ningún monto, salvo la seña propia y la devolución.
- **Estados que dicen qué pasó.** Una reserva cancelada dice quién la canceló. Un ausente dice qué significa, sin rojo de alarma. Una vencida dice que no se pagó a tiempo. "Reservar de nuevo" vuelve a la página del complejo en ese día y formato, en las jugadas, las canceladas, las vencidas y las ausentes. Es un link liviano, sin borde.
- **Un turno que ya terminó** no ofrece "Cancelar" y va al final de Próximos; uno en juego después de medianoche sigue en Próximos. "Hoy" y "Mañana" salen del día del calendario, no del operativo.
- **El turno se lee "vie 13 mar, 18:00 a 19:00"**, igual que en `/exito` (DESIGN.md). Los e2e que fijaban la raya se cambiaron en el 2.4a.
- **Pestañas Próximos e Historial** como navegación con nombre y `aria-current`. La URL no cambia (`?tab=historial&pagina=N`).
- **Cargando y error propios.** Un `loading.tsx` con el mismo ritmo de la lista. El error dice qué pantalla no cargó: el `error.tsx` del grupo no puede decir "reservas" en Cuenta.
- **Diálogos de cancelar y reseña** con La Reserva: campos de 16 px, errores de 13 px o más, sin levante.

## Cuenta (`/configuracion`), PR 2.4b

Bloques en este orden. En el celular es una columna; en escritorio, la misma columna centrada.

1. **Quién sos:** nombre y email, sin banda hero.
2. **Tus datos:** nombre (obligatorio), apellido (opcional), teléfono y zona. El email no se edita (se muestra en "Quién sos"). Los errores van al lado de su campo y "Guardado" desaparece si se vuelve a editar.
3. **Favoritos:** los complejos guardados, cada uno a un toque de su página. Si no hay, una salida a Explorar.
4. **Tu actividad:** partidos jugados, complejos y racha. Sin puntajes ni rankings. Con cero, una salida a reservar.
5. **Tema** (el `ThemeToggle` en su variante del portal) y **Salir**.
6. **Tus datos personales:** "Descargar mis datos", en palabras de jugador y sin jerga legal en el texto principal. Avisa cuando la descarga terminó.
7. **Eliminar la cuenta:** un link sobrio a `/eliminar-cuenta`, sin tarjeta roja.

## Eliminar la cuenta (`/eliminar-cuenta`), PR 2.4b

- Una sola explicación de qué se borra y qué queda, en palabras simples: reservas y pagos quedan sin tu nombre para el complejo. La ley se nombra una sola vez, al pie de esa explicación.
- Si hay reservas confirmadas por jugar, avisa cuántas, con la concordancia bien, y ofrece verlas antes.
- "Descargar mis datos" está ahí mismo, sin ir a Cuenta y volver.
- El confirmar compara el email sin distinguir mayúsculas ni espacios en los bordes y con `autoCapitalize="none"`. En la página, el botón destructivo no ocupa todo el ancho apenas termina el texto; en el diálogo, debajo de `sm`, los dos botones se apilan a todo el ancho (rojo arriba).
- Un solo color de alarma, el del botón final. No se apilan tarjetas roja, naranja y ámbar.

## Contratos que se conservan o cambian a propósito

- h1 "Mis reservas", cada reserva como `<li>` dentro de `main` y los textos exactos de badges, botones y diálogos que fijan los e2e y los unit (lista del mapa del 2.4a). Si alguno cambia, se cambia en el mismo PR.
- Las URLs `/mis-reservas`, `?tab=historial`, `?pagina=`, `/configuracion` y `/eliminar-cuenta`. `/perfil` pasa a redirigir: `player-profile.spec.ts`, TG-HP-109, 110 y 112 se reescriben en el 2.4b.
- `theme-toggle.spec.ts` sigue encontrando "Claro" y "Oscuro" en `/configuracion`.

## Fuera de alcance

Foto de perfil, posición, nivel y todo el perfil de RIVAL. Cambios de schema. El export en JSON (su formato es de ARCO): solo cambia su texto. Borrar el usuario de Supabase Auth al eliminar la cuenta y que los softbans sobrevivan a la baja van como REQUIERE INPUT aparte. La lógica de cancelar, reseñas, seña y MercadoPago.
