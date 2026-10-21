# Billion Dollar Board — Recepcionista de WhatsApp (extra pago)

> Fecha: 2026-10-21 · Pedido del founder · Estado: **precio decidido** (§7). El alta, el ajuste, la permanencia y la moneda siguen abiertos. No cambia nada en el código ni en la web. Decisión del producto: [`2026-10-20-bot-whatsapp.md`](../../decisions/2026-10-20-bot-whatsapp.md).

## 1. La propuesta del founder

- **TurnoGol paga toda la infraestructura**: Kapso, Anthropic y Meta.
- **El Vagón** paga al arrancar un monto que cubre la compra de todo. Después paga el fee mensual que pagaría cualquier complejo.
- **Se productiza para todos** después, cuando Meta apruebe a TurnoGol como Tech Provider.

## 2. Cuántos chats tendría El Vagón

**Datos medidos.**
- 5 canchas: 4 de F7 a $84.000 y 1 de F5 a $60.000 ([`insumos.md`](../../rediseno-panel/insumos.md)).
- Abre de lunes a sábado: 26 días por mes.
- Se midieron 1,8 turnos por cancha por día, y 2,6 el mejor día ([board del 2026-09-15](2026-09-15-precio-por-cancha.md) §7.2).
- No tiene reservas online: todo entra por WhatsApp, por teléfono o en el mostrador.

**Supuestos, no medidos.**
- Cada turno trae un chat. Además hay chats que no terminan en reserva: el que pregunta si hay lugar y no hay, el que pregunta el precio o la dirección, el que cancela.
- Chats por turno: 1,5 en un mes normal y 2,5 en un mes lleno. Con el horario central tomado, la mayoría pregunta y no consigue.
- El bot manda 3 mensajes por chat, el promedio del banco de pruebas. En el peor caso, 5: el máximo del banco.

| Escenario | Turnos/mes | Chats | Respuestas del bot | Meta | IA | Kapso | Total por mes |
|---|---|---|---|---|---|---|---|
| Normal (ritmo medido) | 234 | 351 | 1.053 | USD 1,4 | USD 0,5 | USD 25 | USD 27 ≈ $54.000 |
| Lleno | 338 | 845 | 2.535 | USD 39,9 | USD 2,1 | USD 25 | USD 67 ≈ $135.000 |
| Peor caso | 338 | 845 | 4.225 | USD 83,9 | USD 2,1 | USD 25 | USD 111 ≈ $223.000 |

Cómo se calcula cada columna:
- **Meta:** las primeras 1.000 respuestas del mes por número son gratis; desde ahí, USD 0,026 cada una.
- **IA:** USD 0,0014 por chat, el promedio medido. En los escenarios altos se usa USD 0,0025, el percentil 90.
- **Pesos:** dólar tarjeta a $2.008,50.

**Unidad que conviene recordar:** cada chat por encima del cupo gratis cuesta unos USD 0,08, o sea ~$160.

**El único costo fijo es Kapso, y se reparte entre complejos:**
- Pro incluye 3 números.
- Desde el 4º, USD 10 por número.
- Con 3 complejos, el mes normal del Vagón cuesta unos $20.500.

## 3. Cómo paga TurnoGol (documentación de Kapso, 2026-10-21)

- **Créditos de Kapso.** Se piden en el setup link con `partner_managed`.
  - TurnoGol carga saldo en dólares, Kapso le paga a Meta y lo descuenta.
  - Si la cuenta está en dólares, no hay margen cambiario. Una cuenta en otra moneda paga 5% de margen.
- **Saldo en cero frena el bot.**
  - Kapso corta todos los envíos del número, incluso los que Meta daría gratis.
  - Hace falta un saldo de colchón y alguien que lo mire.
- **Volver a la tarjeta del complejo exige un WABA nuevo y migrar el número.** Si TurnoGol paga siempre, no importa.
- **Con la app propia de Tech Provider:**
  - Los créditos de Kapso solo funcionan dentro de una Multi-partner Solution.
  - La Multi-partner Solution exige el plan Platform (USD 299 por mes) y un saldo mínimo.
  - Si los mensajes salen por infraestructura propia, se suma un 5% sobre lo que se le paga a Meta.
  - Una app propia sola no puede usar los créditos: cada complejo le pagaría a Meta con su tarjeta.
- **El WABA queda atado a la solución con la que se dio de alta.**
  - Si El Vagón pasa después a la app propia, probablemente haya que repetir el alta: el QR, unos 5 minutos.
  - Queda a confirmar con Kapso.
- **A confirmar al abrir la cuenta:** que el plan Pro con la app de Kapso acepte créditos.

**Consecuencia para productizar:**
- Hasta unos 30 complejos, Kapso Pro con su propia app es más barato que Platform: USD 25 + 10 por número, contra USD 299.
- Hasta esa escala, Tech Provider no ahorra plata: da independencia y marca.
- No hace falta esperar la aprobación de Meta para vender.

## 4. El board

**Hormozi — Value Equation.**
- **Resultado soñado:** el WhatsApp se contesta solo, a cualquier hora, y los turnos libres se llenan sin que el dueño agarre el celular.
- **Probabilidad percibida:** alta. Ya vio funcionar el bot de un tercero.
- **Esfuerzo:** casi nulo. Un QR de 5 minutos, sin cambiar de número.
- **Valor en plata:** un turno de F7 son $84.000. Si el bot le salva un turno por mes de los que hoy se pierden por no contestar a tiempo, el extra se paga solo.
- **Cambio:** cotizar contra ese turno, no contra el costo de TurnoGol.

**Hormozi — Grand Slam / riesgo.**
- Que el pago inicial cubra la compra de la infraestructura es razonable: el arranque cuesta unos USD 50, entre Kapso y el saldo de Meta.
- Pero llamarlo "compra de infraestructura" es frágil, porque el monto es chico y se puede ver.
- **Cambio:** encuadrarlo como **alta y puesta en marcha**. Se configura con sus horarios y precios, y la primera semana se revisan los chats todos los días.
- Para sacarle el riesgo: sin permanencia. Si al mes no le sirve, se apaga y no paga más. Esto es REQUIERE INPUT.

**April Dunford — alternativa competitiva.**
- Para el Zurdo, la alternativa no es Clubo. Es el bot de terceros que le ofrecieron, o seguir contestando él desde el celular.
- Para los próximos complejos sí son Clubo ($25.000 por cancha) y JuegaFácil ($80.000 hasta 2 canchas), que **traen el bot incluido**.
- Como extra pago, el bot pelea contra algo que otros incluyen.
- **Pregunta:** ¿cuánto le pedía el tercero al Zurdo? Ese es el ancla real del piloto.

**Jobs-to-be-Done.**
- El trabajo no es "reservar online". El Vagón tiene 0 reservas online y el link de TurnoGol no lo convenció.
- El trabajo es **que alguien conteste el WhatsApp** mientras el dueño atiende la caja y la cantina, y no contestar 20 veces por día "sí, hay a las 21".
- El bot está alineado con eso.
- **Cambio:** que la oferta hable de "tu WhatsApp contesta y reserva solo", no de inteligencia artificial.

**SaaS pricing — value metric.**
- El costo lo mueven los chats, no las canchas. Pero los chats siguen a los turnos, y los turnos siguen a las canchas.
- Cobrar **por cancha** es coherente con el plan, que es lineal por cancha, y el dueño lo entiende sin pensar.
- **Riesgo 1:** sin tope de uso, un mes lleno o un bot muy charlatán se come el margen. **Cambio:** un uso justo en chats y un excedente por bloque.
- **Riesgo 2:** el costo está en dólares y el precio en pesos. **Cambio:** una cláusula de ajuste.
- **Techo:** el board de septiembre marcó como cómodo pagar entre el 1% y el 1,1% de lo que se factura.
  - El Vagón factura unos $19M por mes.
  - Plan más bot: ~1,2-1,3% con la opción A y ~1,3-1,4% con la B. Ya queda arriba de ese techo.

**Cialdini — la objeción que mata la venta.**
- **"¿Y si le contesta mal a un cliente mío?"** Principio: prueba y control.
  - Mostrarle conversaciones reales del banco de pruebas.
  - Recordarle que ve todos los chats en su app, que el bot se calla cuando él contesta y que ante un reclamo pasa a una persona.
- **En los próximos complejos, "Clubo lo trae incluido".** Se contesta con el job: el bot de TurnoGol reserva sobre la grilla real del complejo, con seña.

**AARRR / Core Four.**
- Cobrado aparte, el bot es palanca de **Revenue** con los clientes que ya están, no de **Acquisition**. Clubo lo usa para captar en sus anuncios.
- **Pregunta para después del piloto:** ¿el bot es un extra que se cobra o el gancho que vende el plan?
- Se contesta con los datos del piloto: chats, reservas hechas por el bot y porcentaje fuera de horario. Ya quedan en `whatsapp_messages`.

**Coincidencias.**
- Hormozi y JTBD coinciden en que el valor está en el turno que no se pierde, no en la tecnología.
- Dunford y AARRR coinciden en que, para vender a otros complejos, "extra pago" es la posición débil frente a competidores que lo incluyen. Para el Vagón, que pidió el bot y dijo que paga, no lo es.

## 5. Opciones de precio (REQUIERE INPUT)

**Igual en las dos opciones:**
- **Alta:** $100.000, una sola vez, encuadrada como puesta en marcha. Cubre el primer mes: Kapso y el saldo inicial de Meta.
- **Uso justo:** 120 chats por cancha por mes. Para El Vagón son 600, casi el doble de su mes normal estimado.
- **Excedente:** $20.000 cada 100 chats. A TurnoGol le cuestan unos $16.000.

| | Opción A | Opción B |
|---|---|---|
| Mensual por cancha | $15.000 | $20.000 |
| El Vagón por mes | $75.000 | $100.000 |
| Margen en un mes normal, con El Vagón como único cliente | ~$21.000 | ~$46.000 |
| Margen en un mes normal, con 3 complejos en Kapso Pro | ~$54.000 | ~$79.000 |
| Plan + bot sobre lo que factura El Vagón | ~1,2-1,3% | ~1,3-1,4% |

**El peor caso no lo cubre el excedente:** son 5 respuestas por chat y depende de lo charlatán que sea el bot. Se mira en el primer mes. Si aparece, se achica con el prompt antes que con el precio.

## 6. Síntesis, por impacto

1. **Ejecutable ya.** Cotizarle al Zurdo un precio de piloto con revisión a los 60 días, dicha de entrada.
   - El primer mes da el dato que falta: los chats reales.
   - Con ese dato se fija el fee "para cualquiera".
2. **REQUIERE INPUT.** Los montos: la opción A, la B u otra. También si el alta se cobra o se bonifica.
3. **REQUIERE INPUT.** La cláusula de ajuste, porque los costos están en dólares. Propuesta: actualizar cada 3 meses por dólar oficial.
4. **REQUIERE INPUT.** Sin permanencia: si no le sirve, se apaga.
5. **Ejecutable.** Productizar sin esperar a Tech Provider.
   - Kapso Pro con USD 10 por número alcanza hasta unos 30 complejos.
   - La página comercial del extra espera el fin del freeze (2026-11-01) y los datos del piloto.
   - El cobro automático entra en el preapproval después del cambio a $30.000 por cancha.
   - Mientras tanto, se le cobra al Vagón a mano.

## 7. Decisión del founder (2026-10-21)

- **Opción B para el piloto:** $20.000 por cancha. El Vagón paga $100.000 por mes y su dueño ayuda a montarlo.
- **Cuando haya más complejos**, el extra baja a $15.000 por cancha: la opción A.
- **Quedan para cuando se defina la suscripción:** el alta, el ajuste, la permanencia y la moneda. El founder evalúa cobrar en dólares.
- **No se sabe** cuánto pedía el bot del tercero. El ancla de Dunford queda vacía.
