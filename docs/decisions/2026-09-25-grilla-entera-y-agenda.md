# La Grilla entra entera con 12 canchas, "No cobrado" dice lo mismo en todo el panel y Reservas pasa a ser la Agenda

**Fecha**: 2026-09-25 · **Estado**: implementada en `refactor/grilla-reservas`, sin mergear · **Decide**:
el dueño (variante de Grilla, forma de la Agenda, nombre, cuánto tocar la consulta) + esta sesión (cómo)

## Origen

Registrado en `docs/gtm/ejecucion/10-aprendizajes.md` (2026-09-25). El dueño, mirando El Vagón por
impersonación y un complejo de prueba de 10 canchas sembrado en local:

- Con 10 o 12 canchas la Grilla "se angosta demasiado": columnas de 136 px mínimo, dos canchas quedaban
  afuera sin ningún aviso y la noche no entraba sin scroll.
- El encabezado de la fecha era "raro": la tira de la semana descentrada y cinco grupos de controles.
- Reservas se sentía "inútil, difícil de entender y con mucho ruido" con muchas canchas: tres pestañas,
  seis filtros, dos columnas, hoy agrupado por cancha, y la misma plata dicha dos veces por fila.

La crítica de diseño (`impeccable critique`, 24/40, snapshots en `.impeccable/critique/2026-09-25*`)
encontró además que "No cobrado" significaba tres cosas distintas:

1. La celda de la Grilla se ponía roja recién con `status = 'completed'`, o sea ~30 min después de
   terminar (el auto-complete).
2. El chip "No cobrados hoy" sumaba `confirmed` con saldo, incluidos turnos que ni se habían jugado: con
   10 canchas decía "37 · $1.855.000" cuando lo jugado y no cobrado eran 11.
3. Reservas escribía "No cobrado" en turnos futuros.

Hoy (`today-board.ts`) ya usaba el instante físico de fin, que es el criterio correcto.

## Qué se decide

1. **Grilla, variante "Entra entera"** (elegida entre tres variantes de la misma grilla, con láminas a
   1280×650 y 390 px en claro y oscuro). A 1280×650 entran 12 canchas y la noche completa: columnas de
   4,75rem mínimo desde `lg`, filas que estiran hasta llenar el alto, mañana sin turnos plegada en una
   línea. Si igual hay scroll horizontal, un degradé y "N canchas →" lo avisan. La fecha va centrada en la
   barra superior ("‹ Viernes 25 de septiembre · Hoy · calendario ›") y abre la semana y un selector de
   fecha. El color de la celda es de la plata, como en Hoy: rojo lo jugado sin cobrar, verde lo pagado,
   gris lo que todavía no se jugó.
2. **Un solo "No cobrado"**: turno de cliente que **ya terminó** (`ends_at` pasado) con saldo, esté
   `confirmed` o `completed`. Lo aplican la celda, el chip ("N sin cobrar · $ X"), la Agenda, el detalle
   de un turno y el modal de cobro. `no_show` nunca. El portal del jugador no cambia (no pasa `ended`).
3. **Reservas se llama Agenda** en pantalla. La URL `/reservas` no cambia.
4. **La Agenda es un buscador con la lista de turnos.** Se eligió entre tres formas (lista, semana + día,
   calendario semanal de días × horas). Razones:
   - Lo que el encargado hace ahí es encontrar un turno cuando le escriben por WhatsApp ("¿a qué hora
     tenía?", "cancelá lo mío"). Eso es búsqueda (nombre, teléfono, número) y una lista en orden.
   - En El Vagón no se reservó nunca con más de 24 h: una semana adelante es casi todo vacío, y "¿hay
     lugar?" ya lo contesta la Grilla.
   - El calendario semanal de los SaaS de turnos sirve con un recurso; con 10 canchas cada casilla solo
     puede decir un número.
   - La lista se arma con la consulta que ya existía; las otras dos pedían una consulta nueva de
     ocupación.
5. **Cuánto se tocó la consulta** (autorizado por el dueño): "Próximos | Pasados" por instante físico
   (`ends_at` contra ahora: lo que se está jugando es próximo, lo terminado hoy ya es pasado) en lugar de
   Hoy/Próximas/Historial por fecha; "Todos" deja afuera cancelados y expirados; el teléfono viaja en la
   fila para mostrarse. Sin schema, sin Server Actions. Los links viejos (`?dia=hoy|proximas|historial`)
   se redirigen al segmento que corresponde.
6. **Sin chip "Sin cobrar" en la Agenda** (decisión del dueño). Cobrar es de Hoy, que desde este mismo día
   es la cola de cobro con "Turnos no cobrados" de días anteriores; una tercera lista de lo no cobrado era
   la repetición que marcó la crítica. En la Agenda lo no cobrado se ve en rojo en su fila.

## Qué NO se hizo

- Vistas alternativas de la Grilla (canchas en filas, por franja): el dueño pidió "misma grilla".
- La semana de 7 días en la barra: queda dentro del selector de fecha.
- Un chip "Online" en la Agenda: no hay una señal confiable sin tocar más la consulta.
- `/jugadores/[id]` sigue sin saber si un turno terminó (su consulta no trae `ends_at`): su badge queda
  como estaba. Mismo arreglo, esfuerzo aparte si se ve en uso.

## Verificación

Complejo de prueba de 10 canchas sembrado en local (`demo-grilla-10`) y capturas de la app real a
1280×650 y 390 px, en claro y oscuro, con el reloj fijo en las 20:10. Tests unitarios de la regla
unificada (celda, chip, Agenda, portal sin cambios) y de integración de los segmentos por instante.
