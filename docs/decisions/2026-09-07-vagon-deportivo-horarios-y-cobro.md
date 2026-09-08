# 2026-09-07 — El Vagón Deportivo: horarios de madrugada, borrado de canchas y cuándo se cobra

**Contexto.** Un complejo real de prueba avisó por WhatsApp que "solo lo dejaba
cargar 2 canchas". El síntoma reportado era falso: no había ningún techo
frenándolo (el trial exime del techo de plan). Lo que estaba roto era el editor
de precios, y el daño real era mucho peor que el reportado — sus canchas estaban
irreservables de lunes a viernes, 5 de los 6 días que opera, sin que nadie lo
supiera.

El complejo abre lunes a viernes de 08:00 a 01:00 (`closes_next_day`), sábado
08:00 a 22:00 y domingo cierra. `pricing-grid.ts` calculaba la ventana de cada
día sin conocer `closes_next_day`, así que para esos días daba `close(1) <=
open(8)` y los descartaba enteros: no se podían editar, y al guardar se borraban
sus reglas de precio. Sin regla, `calculatePrice` devuelve `null` y
`createBooking` tira `PriceUnavailableError`. El backstop del servidor
(`validatePricingRulesCoverage`) tenía el mismo defecto, con lo cual exigía cero
cobertura para esos días y nunca avisó nada.

Detalle de la investigación y del arreglo: los cuatro commits de este PR.

## D1 — Cuándo sale el primer cobro de MercadoPago

Al tocar "Activar plan" se creaba el preapproval al instante y **sin fecha de
inicio**, así que MercadoPago podía cobrar mientras al complejo todavía le
quedaban días de prueba. Le pasó a este complejo: quedó con una suscripción viva
y 90 días de trial por delante.

- **Elegido:** el primer cobro se difiere hasta `tenants.trial_ends_at`
  (`auto_recurring.start_date`). Elegir plan no le puede sacar plata a nadie
  antes de que termine la prueba prometida.
- **Descartado — cobrar al activar, avisándolo bien:** no cambiaba código, pero
  contradice lo que el complejo entiende cuando se le prometen 90 días gratis.
- **Descartado — prorratear:** lo más justo en teoría y lo más caro de construir
  y de explicar.

Se usa `start_date` y no `free_trial` porque este último se define por duración
(30 días) y no por fecha, y no sirve para alinearse con un trial que soporte
puede haber extendido a una fecha arbitraria. Además el SDK instalado sólo tipa
`free_trial` en las respuestas, no en el body de creación.

**Riesgo que queda abierto:** el formato exacto que MercadoPago espera en
`start_date` se verificó contra los tipos del SDK y la documentación pública, no
contra una llamada real. Antes de confiar en el diferimiento conviene probar una
suscripción real y mirar cuándo sale el primer cobro. Si la interpretara como
"fecha de activación" en vez de "fecha del primer cobro", el efecto sería cobrar
más tarde de lo previsto, nunca antes.

## D2 — No se agrega borrado de canchas

El complejo se quejó de no poder eliminar una "Cancha de prueba", solo
desactivarla.

- **Elegido:** dejarlo como está. Se puede desactivar, y los casos raros los
  resuelve soporte.
- **Descartado — borrar si nunca se usó:** era el camino recomendado, pero el
  problema real que motivaba el pedido era otro (ver D3) y se resuelve sin
  agregar una operación destructiva sobre una tabla de la que cuelgan reservas,
  caja y torneos.

## D3 — Una cancha apagada no ocupa lugar en el plan

El repo usaba **dos criterios distintos** para la misma pregunta: el gate que
deja crear una cancha contaba todas, y el que deja bajar de plan contaba solo las
activas. Una cancha de prueba, rota o en obra te comía cupo para siempre.

- **Elegido:** cuentan solo las canchas activas, en los dos lados.
- **Descartado — contar todo:** evitaría que alguien apague canchas un rato para
  esquivar el techo, pero castiga permanentemente al complejo con una cancha
  fuera de servicio, que es el caso real y frecuente.

Esto es lo que de verdad resolvía el pedido de D2: la cancha de prueba
desactivada deja de empujar el plan.

## D4 — Qué pasa con las horas que quedan sin precio

Cuando el complejo amplía su horario, las horas nuevas quedan sin precio en las
canchas ya cargadas. Hasta ahora eso pasaba en silencio y el jugador se chocaba
con un error recién al intentar reservar.

- **Elegido:** las horas sin precio heredan el de la franja de al lado y se le
  avisa al dueño cuántas se completaron, para que las revise. Mismo criterio que
  el botón "Copiar precios de otra cancha", que ya existía.
- **Descartado — frenar el cambio de horario hasta cargar los precios:** lo más
  seguro, pero mete fricción justo cuando el complejo quiere agrandar el horario,
  que es algo bueno para el negocio.
- **Descartado — avisar y dejarlo seguir:** es lo que pasaba, apenas visible. El
  dueño puede ignorar el cartel y quedarse con turnos que no se pueden reservar.

Orden de herencia: hora anterior del mismo día, hora siguiente, misma hora de
otro día abierto, y por último el precio más frecuente. Si la cancha nunca tuvo
precio no se inventa ninguno.

**Efecto lateral buscado:** esto es también lo que repara las canchas que hoy ya
tienen huecos. Se arreglan solas cuando el dueño abre el editor o guarda
horarios, sin correr ningún script contra la base de producción.
