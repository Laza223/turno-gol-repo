# Decisión: clientes que dejaron de venir (`/jugadores`)

**Fecha:** 2026-10-22 · **Decide:** Lazar (founder) · **Ola 2** del levantamiento del freeze ([`2026-10-22-se-levanta-el-freeze.md`](2026-10-22-se-levanta-el-freeze.md)), feature #4.

## Problema

El dueño no tiene forma de ver quién dejó de venir. El dato está (`bookings`), pero `/jugadores` solo ordena por la última reserva y no marca a nadie. El objetivo es que el complejo recupere al cliente con un mensaje suyo, uno por uno.

## Decisiones (brainstorm del 2026-10-22, por select)

1. **Umbral fijo: 4 semanas** sin reservar. No es configurable (regla del dueño: nada de configurabilidad "por las dudas").
2. **Mínimo: 3 reservas** que no se cayeron. El que vino una o dos veces no es un cliente que se fue.
3. **Dónde:** un filtro con contador en `/jugadores`, "Dejaron de venir · N", al lado del buscador.
4. **Hoy:** nada. Si hace falta un aviso, el lugar es el resumen semanal por mail, más adelante.
5. **Mensaje precargado: saludo con link** a la ficha pública del complejo. El dueño lo puede editar antes de mandarlo:
   > Hola Diego! ¿Cómo andás? Te escribimos de El Vagón. Hace un tiempo que no te vemos por acá. Si querés volver, reservá acá: https://turnogol.com.ar/el-vagon

   El nombre es la primera palabra del nombre de la persona. Si no hay una URL absoluta de la app (`NEXT_PUBLIC_APP_URL`), el mensaje sale sin la última oración: un link relativo no le sirve a nadie.

## Definición (se calcula al leer, NO se guarda)

Una persona dejó de venir si cumple las cuatro condiciones:

1. Tiene **3 o más reservas que no se cayeron** en este complejo. Se cuentan todos los estados salvo `canceled_refunded`, `canceled_no_refund` y `expired`. Un `no_show` cuenta, porque reservó.
2. La **última** de esas reservas empezó hace más de 4 semanas (`starts_at < NOW() - 28 días`). Como se mira la última, cualquier reserva futura activa la saca sola de la lista.
3. **No tiene un turno fijo vigente**, o sea `abonados.status = 'active'` y `ends_on` vacío o de hoy en adelante (hoy en día ART; `ends_on` es inclusivo, igual que en el generador de turnos). Tampoco protegen:
   - Un fijo activo con la fecha de fin vencida, aunque nadie lo haya dado de baja: ya no genera turnos (decisión del dueño, 2026-10-22, por select).
   - Uno pausado (estado legacy: pausar ya no existe).
4. Si tiene cuenta: no está anonimizada, no tiene un ban global vigente y no está bloqueada en este complejo (`tenant_player_bans` vigente). Escribirle "hace rato que no venís" a alguien bloqueado no tiene sentido.

**Qué reservas son "suyas":**
- Con cuenta: las de `player_id` más las de sus turnos fijos. Al vincular un contacto, las reservas pasadas de su fijo quedan con `player_id NULL`, y sin este agregado un fijo de meses que se dio de baja no contaría.
- Sin cuenta (contacto derivado de abonados): las de sus turnos fijos, igual que hoy.

"Dormido" **no es una etiqueta**: no toca el ENUM de 5 ni escribe nada en la base. Tampoco hay texto libre (Ley 25.326).

## UI

- Pastillas debajo del buscador: **Todas** · **Dejaron de venir · N**. Es el patrón de `/abonados`. La URL es `?filtro=dejaron-de-venir` y se combina con `q` y `pagina`. N respeta la búsqueda.
- Con el filtro puesto:
  - La lista muestra solo a esas personas, de la que se fue hace menos a la que se fue hace más: la más reciente es la más fácil de recuperar.
  - Cada fila dice "Última vez hace 5 semanas" y la acción de la fila es **WhatsApp**: un link `wa.me` con `buildWhatsappUrl`, que ya normaliza el 9 del móvil.
  - Las ausencias y los fijos no se muestran (decisión del dueño, 2026-10-22, por select). Lo que importa es cuándo vino por última vez, y en el filtro nadie tiene un fijo vigente.
  - Sin teléfono marcable, la fila no lleva botón. "Vincular" se sigue haciendo desde "Todas".
- Sin nadie en el filtro: "Nadie dejó de venir. Acá aparecen los clientes con 3 reservas o más que hace 4 semanas no reservan."
- El mensaje precargado es la voz del complejo: lo manda el dueño o el encargado, desde su WhatsApp, uno por uno. Nada masivo ni automático.
- **Encargado (manager):** ve lo mismo que el dueño. Atiende a los clientes en el día a día y el teléfono ya lo ve en esta lista.

## Contrato de `listTenantClients` (aditivo)

- `filters: { q?: string; dormant?: boolean }`: `dormant` es nuevo y opcional.
- Cada fila suma `lastActiveAt: string | null`, el ISO del `starts_at` de su última reserva que no se cayó.
- La página suma `dormantTotal: number`, contado en la misma pasada con `COUNT(*) FILTER (...) OVER()`.
- Los campos existentes y el orden de "Todas" no cambian. La sesión de export de datos, que lee la función, no se entera.

## Fuera de alcance

- El aviso en Hoy y en el mail semanal.
- Una marca en la ficha `/jugadores/[id]`.
- Guardar el estado.
- Envíos masivos o automáticos: están vetados.
- Hacer el umbral configurable.

## Imprecisión aceptada

- Si se pide una página fuera de rango (`?pagina=99`), no vuelve ninguna fila y el contador de la pastilla da 0. Es el mismo caso borde que ya tiene su propio "Volver al principio".
- "N reservas" en la fila sigue contando todas, canceladas incluidas, como hoy. El umbral de 3 cuenta solo las que no se cayeron.
- La búsqueda de contactos filtra fijo por fijo antes de agrupar. Si una persona sin cuenta tiene un fijo cargado con un nombre y otro con otro, y la búsqueda encuentra solo uno, el cálculo ve únicamente ese. Es la misma imprecisión que ya tiene "Todas" con la búsqueda.
- El cálculo recorre las reservas del complejo en cada carga de la página. Medido con 60.000 reservas sintéticas, cuesta unos 120 ms y crece en forma lineal. Si un complejo grande lo vuelve lento, se mira con datos reales antes de agregar un índice o un caché.
