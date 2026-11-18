---
version: 1
slug: "src-app-player"
primary_target: "src/app/(player)"
related_targets: []
---

# Mis reservas y Cuenta del jugador (src/app/(player)/)

Modo: Operate. Visitante: el jugador que ya reservó. Entra por la barra de abajo ("Reservas", "Cuenta"), por el menú de cuenta o por el link de un mail, casi siempre desde el celular. Trabajo, de más a menos frecuente: saber cuándo y dónde juega, avisarle al grupo, llegar, reservar de nuevo, cancelar si no van; y, cada tanto, corregir sus datos, volver a un favorito o salir.

Mundo: portal de vidrio (DESIGN.md, Colors › Portal de vidrio), F6 de la decisión del 2026-11-13 ([`docs/decisions/2026-11-13-portal-vidrio.md`](../../docs/decisions/2026-11-13-portal-vidrio.md)). La Previa (R5 de 2026-10-20: `PlayerHeroBand` con resplandor y grilla, titulares en negra itálica con `.hero-accent-text`, píldoras y tarjetas `rounded-2xl`) se reemplazó por el vidrio el 2026-11-13; esas piezas ya no se usan. Se conserva toda la lógica y los flujos del brief de 2026-10-17 (abajo). El grupo marca `data-portal-fields` en `(player)/layout.tsx`: sube `--input` y `--ring` para que el borde de un control y el foco de las primitivas compartidas (diálogos) lleguen a 3:1.

## Decisiones del dueño (2026-10-17)

- **Cuenta es una sola página** en `/configuracion`: tus datos, favoritos, actividad, tema, salir, descargar tus datos y eliminar la cuenta. `/perfil` (con o sin `?tab=`) redirige ahí y lleva al bloque que corresponde.
- **Sin los interruptores de avisos.** No controlan ningún envío y el jugador no tiene push. En su lugar va una línea que dice qué mails llegan siempre (confirmación, cancelación, cambios de horario y vencimiento de la seña). Las columnas `notify_email` y `notify_push` quedan en la base sin tocar.
- **Apellido opcional** en tus datos, como en la reserva (el alta ya no pide apellido).

## Mis reservas (`/mis-reservas`)

- **La próxima, primero.** En Próximos, el orden va de la más cercana a la más lejana. La primera tarjeta es la próxima y se lee sola: "Hoy", "Mañana" o el día, la hora, la cancha con su formato, el complejo y la dirección. Historial sigue de la más nueva a la más vieja.
- **Cada tarjeta se puede abrir.** Lleva a `/reserva/{id}/exito` si está confirmada; ahí ya están "Avisarle al grupo", "Cómo llegar" y el calendario. En la tarjeta de la próxima, "Avisarle al grupo" va también a un toque. Cancelar sigue en la tarjeta, sin cambiar sus textos fijados.
- **La seña se ve.** Con seña pagada dice que está señada. Sin seña, "Pagás en el complejo". "Esperando seña" explica que falta la seña y que, si no se paga a tiempo, el turno se libera. Con precios ocultos no aparece ningún monto, salvo la seña propia y la devolución.
- **Estados que dicen qué pasó.** Una reserva cancelada dice quién la canceló. Un ausente dice qué significa, sin alarma. Una vencida dice que no se pagó a tiempo. "Reservar de nuevo" vuelve a la página del complejo en ese día y formato, en las jugadas, las canceladas, las vencidas y las ausentes. Los tonos salen de `status-visual.ts`, no del mockup: "Jugada" en verde y "Cancelada" apagada ("al jugador no se le grita"); ninguna etiqueta lleva ámbar.
- **Un turno que ya terminó** no ofrece "Cancelar" y va al final de Próximos; uno en juego después de medianoche sigue en Próximos. "Hoy" y "Mañana" salen del día del calendario, no del operativo.
- **El turno se lee "vie 13 mar, 18:00 a 19:00"**, igual que en `/exito`.
- **Próximos e Historial son links** (`<nav aria-label="Tus reservas">` de dos links con `aria-current`, `.pa-seg`): viven en la URL (`?tab=historial&pagina=N`), no es el `SegmentedControl` de radios. La píldora se desliza con `--i`.
- **Cargando y error propios.** Un `loading.tsx` con esqueletos de vidrio (`Skeleton variant="glass"`) del mismo ritmo que la lista. El error dice qué pantalla no cargó: el `error.tsx` del grupo no puede decir "reservas" en Cuenta.
- **Cancelar** es una hoja (`GlassConfirmSheet`, con `CancelReasonPicker look="glass"` y los motivos reales). El diálogo de la grilla y el detalle de la reserva del panel conservan el `look="panel"`.

## Cuenta (`/configuracion`)

Bloques en este orden, en una columna. Cada uno es un `rv-panel glass-painted`.

1. **Quién sos** (`pa-me`): avatar con iniciales, nombre y email.
2. **Tus datos:** nombre (obligatorio), apellido (opcional), teléfono y zona. El email no se edita. Los errores van al lado de su campo y "Guardado" desaparece si se vuelve a editar. "Guardar cambios" confirma con un tilde dentro del botón.
3. **Perfil en Rival**, con el flag `rival`.
4. **Favoritos:** los complejos guardados, cada uno a un toque de su página. Si no hay, una salida a Explorar.
5. **Tu actividad:** partidos jugados, complejos y racha. Sin puntajes ni rankings.
6. **Tema** (`ThemeToggle variant="glass"`, el control segmentado con "Claro" y "Oscuro") y **Salir**.
7. **Tus datos personales:** "Descargar mis datos", en palabras de jugador y sin jerga legal. Avisa cuando la descarga terminó.
8. **Eliminar la cuenta:** un link sobrio a `/eliminar-cuenta`, sin tarjeta roja.

## Eliminar la cuenta (`/eliminar-cuenta`)

- Una sola explicación de qué se borra y qué queda, en palabras simples: reservas y pagos quedan sin tu nombre para el complejo. La ley se nombra una sola vez, al pie de esa explicación.
- Si hay reservas confirmadas por jugar, avisa cuántas y ofrece verlas antes (aviso en `--portal-warn`).
- "Descargar mis datos" está ahí mismo.
- El confirmar es `GlassConfirmSheet` con `phraseMatch="email"`: compara el email sin distinguir mayúsculas ni espacios en los bordes y con `autoCapitalize="none"`. El botón destructivo es `pill-danger`.
- Ninguna insignia o aviso lleva ámbar para algo que no sea escasez; el rojo es solo de lo irreversible.

## Contratos que se conservan o cambian a propósito

- h1 "Mis reservas", cada reserva como `<li>` dentro de `main` y los textos exactos de badges, botones y diálogos que fijan los e2e y los unit. Si alguno cambia, se cambia en el mismo PR.
- Las URLs `/mis-reservas`, `?tab=historial`, `?pagina=`, `/configuracion` y `/eliminar-cuenta`. `/perfil` redirige.
- `theme-toggle.spec.ts` sigue encontrando "Claro" y "Oscuro" en `/configuracion`.

## Fuera de alcance

Foto de perfil, posición, nivel y todo el perfil de RIVAL. Cambios de schema. El export en JSON (su formato es de ARCO): solo cambia su texto. Borrar el usuario de Supabase Auth al eliminar la cuenta y que los softbans sobrevivan a la baja van como REQUIERE INPUT aparte. La lógica de cancelar, reseñas, seña y MercadoPago.

## Spec visual

Lo que comparte todo el portal (vidrio, tokens, piezas, movimiento) está en DESIGN.md › Portal de vidrio.

- **Estructura común:** columna angosta sobre `portal-ambient` (`rv-col`, 480 px), titular `rv-h1` (Archivo 700, `font-stretch: 104%`), secciones `rv-h2`, tarjetas `glass-painted` que entran con `rv-rise` y esqueletos de vidrio. Las tarjetas y paneles son pintados, no desenfocados: se repiten en una lista.
- **Mis reservas:** `.pa-bk` por reserva; la próxima confirmada se destaca y es la única con "Avisarle al grupo" y "Cómo llegar". Acciones secundarias en píldora de 44 px sin relleno de acción ("Cancelar", "Dejar reseña", "Reservar de nuevo": The Quiet Ghost Rule). Vacío con `.rv-empty`; paginador compartido (`Pager`). Al cancelar, la tarjeta debería cerrarse sobre su alto y bajar un aviso de vidrio; hoy la revalidación desmonta la fila antes de poder animarla (pendiente de F9).
- **Mi cuenta:** secciones que aparecen al bajar; "Tema" y "Salir" en el mismo panel.
- **Errores (`(player)/error.tsx`, `mis-reservas/error.tsx`):** `PortalResult` rojo con "Reintentar" y la salida del grupo; con `digest`, el código de referencia. Reportan a Sentry.
