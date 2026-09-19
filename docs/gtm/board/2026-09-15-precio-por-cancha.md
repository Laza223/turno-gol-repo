# Billion Dollar Board — precio lineal por cancha

> Fecha: 2026-09-15 · Pedido del founder · Estado: **validar antes de implementar** (decisión del founder, ver §4). Nada de este documento cambia precios en código ni en la web.
> Revisión 2026-09-17 (§7): el founder descarta Van Westendorp. El precio se evalúa contra el valor, con la facturación medida del complejo en prueba, y se valida con ofertas escritas y pagos reales.

## 1. La propuesta

Reemplazar las tres bandas vigentes (Predio 1-3 $63.000 · Complejo 4-6 $99.000 · Estadio 7+ $129.000, migración 071) por un precio lineal: **1 cancha $47.000/mes, cada cancha extra $30.000/mes**.

Tesis del founder: TurnoGol es la solución completa para complejos de fútbol, y no tiene un competidor directo porque el resto quiere abarcar todos los deportes. Por eso sube el precio y cobra por cancha extra.

## 2. Números

Precio mensual en miles de ARS. Competidores tomados de [`10-aprendizajes.md`](../ejecucion/10-aprendizajes.md) (2026-09-01, teardown).

| Canchas | Propuesta | Hoy | ATC | Clubo | Propuesta por cancha |
|---|---|---|---|---|---|
| 1 | 47 | 63 | 71 | 25 | 47,0 |
| 2 | 77 | 63 | 71 | 50 | 38,5 |
| 3 | 107 | 63 | 71 | 75 | 35,7 |
| 4 | 137 | 99 | 111 | 100 | 34,3 |
| 5 | 167 | 99 | 111 | 125 | 33,4 |
| 6 | 197 | 99 | 111 | 150 | 32,8 |
| 7 | 227 | 129 | 145 | 175 | 32,4 |
| 8 | 257 | 129 | 145 | 200 | 32,1 |

- En el ICP (D1, 4-6 canchas), TurnoGol pasa de estar 11% por debajo de ATC a estar entre 23% y 77% por encima. También queda arriba de Clubo.
- Con 1 cancha baja 25%, pero D1 no prospecta complejos de 1-2 canchas.
- Referencia de valor: tres canchas F5 facturan entre $8M y $15M por mes (doc1). $30.000 por cancha extra equivale a cerca del 1% de lo que esa cancha factura.

## 3. Board

**Hormozi — Value Equation.** Cobrar por cancha es defendible: $30.000 es alrededor del 1% de lo que factura cada cancha. Pero hoy el término más débil es la *probabilidad percibida*: 0 clientes pagos y ningún caso publicable. Subir el precio justo en ese punto baja la conversión. Pregunta: ¿qué prueba ve Marcelo que justifique pagar $197k y no los $111k de ATC?

**Hormozi — Grand Slam / garantías.** Un precio premium necesita reversión de riesgo, y hoy no hay ninguna. La garantía de arranque en 48 h del board del 2026-09-02 sigue sin usarse.

**Dunford — posicionamiento.** Que "no hay competidor directo" es cierto como categoría, pero no como ancla de precio. El dueño compara contra lo que conoce (ATC, WhatsApp, el cuaderno), y los dueños comparan precios entre ellos (H3). "Hecho solo para fútbol" justifica un premium solo si la web muestra lo que únicamente TurnoGol hace: fijos, día operativo, torneos. Hoy el H1 dice lo mismo que todos.

**Schwartz — sofisticación.** El mercado ya conoce varias soluciones. En esa etapa, el mensaje "el especialista para vos" es el correcto. A favor de la tesis.

**Cialdini — objeciones.** En 2 de 2 demos preguntaron "cuánto cuesta". Casi duplicar el precio del ICP sin prueba social deja la objeción de precio sin respuesta.

**AARRR.** El cuello de botella está en adquisición y activación (0 pagos, 1 piloto), no en revenue por cuenta. Subir el ARPA optimiza un escalón que hoy no tiene volumen.

**JTBD.** El trabajo contratado (ordenar reservas, fijos, cobrar la seña) crece con la cantidad de canchas. El value metric por cancha está alineado. A favor.

**SaaS pricing.** El modelo lineal elimina el salto de 3 a 4 canchas (+57%, HP2) y los nombres de plan. Tiene tres riesgos:

- El precio por cancha casi no baja con el volumen ($47k a $32k), mientras que el ancla del mercado por cancha es Clubo a $25k.
- Si se cobra por canchas online, apagar una cancha en el sistema pasa a ser la forma de pagar menos.
- Una cuota que sube sola al sumar una cancha genera sorpresa.

**Coincidencias.** Hormozi (VE) y JTBD coinciden en que la *estructura* es correcta. Cialdini, AARRR y Pricing coinciden en que el *nivel* es prematuro sin evidencia.

## 4. Síntesis y decisiones

1. **La estructura lineal es correcta y separable del nivel de precio.** Si base y cancha extra se guardan como dato en DB, cambiar los montos después es una migración.
2. **El nivel es la apuesta riesgosa**: pega de lleno en el ICP, sin evidencia de disposición a pagar.
3. **Choca con D3, con el gate de precio (`09-gates.md`) y con el freeze.**

Decisiones del founder (2026-09-15):

| # | Decisión |
|---|---|
| 1 | **Validar antes.** No se programa. Se cotiza $47k + $30k por cancha extra en las próximas charlas, con Van Westendorp (hipótesis HP4 en [`07-tablero-hipotesis.md`](../ejecucion/07-tablero-hipotesis.md)). Revisión junto con D3, el 2026-10-02. **Método reemplazado el 2026-09-17: ver §7.** |
| 2 | **Cancha extra = "confirma y ajusta".** El dueño contrata N canchas. Al prender la N+1 ve "+$30.000/mes", confirma, y la cuota sube desde el próximo cobro, sin prorrateo. |
| 3 | **Se mantiene el anual con 20% off.** El mensual queda por defecto (D3). |
| 4 | **P1 no tiene precio pactado:** al día 91 entra con la lista vigente en ese momento. |

## 5. Contrato para cuando se implemente

- Base y precio por cancha extra (mensual y anual) guardados como dato en DB, no hardcodeados. `plans-data.ts` sigue en sync con la tabla.
- Cantidad contratada por tenant. Prender una cancha por encima del contratado pide confirmación y hace PUT del monto del preapproval (`updatePreapprovalAmount`), efectivo desde el próximo cobro.
- Cuentan solo las canchas `online`, igual que el criterio de hoy.
- Tenants ya suscriptos: definir grandfathering antes de migrar (hoy es de hecho: el preapproval queda con el monto firmado).
- Superficies afectadas (relevamiento 2026-09-15): `billing.service` (subscribe/upgrade/downgrade/reactivate), el guard de canchas (`canchas/actions.ts`, `onboarding.service`), `/precios` (`PlanSelector`, `CalculadoraClavo`, `plans-data.ts`), `/settings/facturacion` (`ActivatePlanSection`, `ChangePlanSection`), `/reactivar`, super-admin (MRR, filtros, cambio de plan), `/terminos`, `/privacidad`, alrededor de 40 tests y el seed del slug `predio` del alta con trial.

## 6. Hallazgos laterales del relevamiento

- **🔴 El cobro anual estaba roto** (bug de plata, lo permite el freeze). `price_annual` es el equivalente mensual, pero se mandaba como monto de un preapproval anual con `frequency_type: 'years'`, un valor que el SDK de MP no documenta. Se corrige en código aparte de esta decisión; ver [`10-aprendizajes.md`](../ejecucion/10-aprendizajes.md) 2026-09-15.
- **Drift sin tocar:**
  - `price_versions` no se lee en ningún lugar de `src/`: todo sale de `plans`. Esto contradice `CLAUDE.md` ("los precios, del `price_version` vigente").
  - `/terminos` describe los cortes de la migración 043 (1-2 / 3-5 / 6+).
  - Los docs de GTM `02-icp`, `06-scripts`, `07-objeciones` y `10-playbook-ia` citan $55k / $85k / $115k.
  - `tenant_subscriptions.price_locked_until` nunca se lee ni se escribe.

## 7. Revisión 2026-09-17: precio por valor y validación sin charlas

### 7.1 Qué cambió

- **El founder descarta Van Westendorp.** Preguntarle a un dueño cuánto pagaría devuelve lo que le conviene decir, no lo que vale. No se hacen esas charlas.
- **Dato nuevo, medido en producción.** P-Vagón (5 canchas, en prueba, Luján) usa TurnoGol de verdad desde el 2026-09-14. En sus 3 días operativos completos facturó en promedio unos **$0,86M por día hábil** (rango $0,60M a $1,13M; el día más bajo fue el de la primera carga). El número que el founder vio en el panel ("$500.000 o más por día") se confirma y queda corto.
- Otros hechos del mismo corte: 12% de lo que entra es cantina, 86% de los cobros de turnos son en efectivo, **0 reservas online** (todo lo carga el staff), seña apagada, **0 turnos jugados sin cobrar**, 65% del horario central lleno un miércoles.
- Los datos crudos están en `docs/gtm/data/2026-09-17-facturacion-p-vagon.md`, fuera de git.
- Límite de la medición: son 3 días, todos de semana, y el complejo puede no estar cargando todo todavía. Es un piso.

### 7.2 Modelo de valor (5 canchas, por mes)

Base de facturación: **piso $2,2M por cancha** ($500.000 × 22 días hábiles ÷ 5) y **central $3,8M por cancha** (promedio medido × 22 ÷ 5). Los sábados no se cuentan porque no hay medición. doc1 da $2,7M a $5M por cancha, así que el central está dentro.

| Componente | Supuesto | Bajo | Central | Alto | Tipo |
|---|---|---|---|---|---|
| Turnos colgados recuperados | Sin seña. La grilla deja liberar y revender el turno que se cae, y el softban frena al reincidente. Recupera 1 / 2 / 4 turnos por mes, a ~$81.000 (precio medio cobrado). La calculadora de `/precios` supone 2 plantones por semana. | $81k | $163k | $325k | duro |
| Horas del encargado | 0,5 / 1 / 1,5 h por día menos de WhatsApp, cuaderno y arqueo, a ~$8.000 la hora (sueldo más cargas ≈ $1,6M por 200 h, **sin verificar**). 22 / 22 / 26 días. | $88k | $176k | $312k | blando |
| Control de caja | Fuga sin sistema de 0,5% (sobre el piso) / 1% / 2% (sobre el central): turnos jugados sin cobrar, parciales perdidos, fiados olvidados, cantina sin anotar. P-Vagón hoy tiene 0 turnos sin cobrar, pero no hay baseline de antes, así que no se puede atribuir. | $55k | $189k | $378k | duro |
| Señas | Apagada en P-Vagón y opcional por D2. El upside queda dentro de "colgados". | — | — | — | — |
| **Total** | | **$224k** | **$528k** | **$1.015k** | |
| Solo plata dura | | $136k | $352k | $703k | |

"Blando" quiere decir que la hora ahorrada es plata solo si el dueño paga menos horas o vende algo con ese tiempo. La mayoría no baja sueldos, así que el dueño la percibe menos de lo que vale.

### 7.3 Precio contra facturación y contra valor ($47k + $30k)

Montos en miles de ARS por mes. El valor por cancha se escala lineal desde el modelo de 5 canchas; con 1-2 canchas eso lo sobreestima, porque el encargado no ahorra lo mismo.

| Canchas | Precio | % facturación (central) | % facturación (piso) | Valor central | Valor ÷ precio (bajo / central / alto) | Lista hoy | ATC |
|---|---|---|---|---|---|---|---|
| 1 | 47 | 1,24% | 2,14% | 106 | 1,0 / 2,2 / 4,3 | 63 | 71 |
| 2 | 77 | 1,02% | 1,75% | 211 | 1,2 / 2,7 / 5,3 | 63 | 71 |
| 3 | 107 | 0,94% | 1,62% | 317 | 1,3 / 3,0 / 5,7 | 63 | 71 |
| 4 | 137 | 0,91% | 1,56% | 422 | 1,3 / 3,1 / 5,9 | 99 | 111 |
| 5 | 167 | 0,88% | 1,52% | 528 | 1,3 / 3,2 / 6,1 | 99 | 111 |
| 6 | 197 | 0,87% | 1,49% | 634 | 1,4 / 3,2 / 6,2 | 99 | 111 |
| 7 | 227 | 0,86% | 1,47% | 739 | 1,4 / 3,3 / 6,3 | 129 | 145 |
| 8 | 257 | 0,85% | 1,46% | 845 | 1,4 / 3,3 / 6,3 | 129 | 145 |

ATC tomado del teardown del 2026-09-01 (tiene 16 días; subió 46% en 7 meses).

### 7.4 Contra ATC y contra no usar nada (5 canchas)

| Opción | Por mes | Qué da | Valor central ÷ precio |
|---|---|---|---|
| No usar nada (WhatsApp, cuaderno, encargado) | $0 | Nada. Pierde ~$0,5M por mes en el escenario central, ~$0,35M en plata dura | — |
| TurnoGol, lista de hoy | $99k | Lo mismo que abajo | 5,3× |
| ATC Estándar | $111k (anual $89k) | Back-office más marketplace. **En Luján el buscador de ATC devuelve 0 complejos** (2026-09-01), así que ahí el marketplace no suma | 4,8× |
| **TurnoGol $47k + $30k** | **$167k (anual $133,6k)** | Fijos, día operativo pasada la medianoche, cobro por equipo y por jugador, cantina | **3,2×** |
| TurnoGol 1% de la facturación | ~$189k, variable | Lo mismo | 2,8× |
| TurnoGol $60k + $40k | $220k | Lo mismo | 2,4× |

### 7.5 Board

**Hormozi — Value Equation.** Contra la facturación el precio parece barato (0,9%). Contra el valor es 3,2× en el central y 2,1× en plata dura, y un dueño sin prueba social compra cómodo desde ~5× percibido. El término débil sigue siendo la probabilidad percibida, pero ahora hay un caso con números propios. Cambio: la oferta a P-Vagón se arma con **sus** números del panel, no con promesas. Pregunta: ¿qué número de su mes vale, a ojos del dueño, más que $167k?

**Hormozi — Grand Slam / garantías.** Preferencia revelada exige plata o firma con fecha límite. La urgencia legítima existe: la lista mensual se ajusta cada 3 meses (doc4 §5) y el anual la congela 12 meses. No inventar escasez ni "precio fundador", que está en la kill list. Cambio: garantía de devolución proporcional en el anual prepago (REQUIERE INPUT).

**Hormozi — $100M Leads.** Ningún umbral de precio se puede leer con 1 cliente. Si al 2026-12-15 hay menos de 5 ofertas escritas, el problema es volumen y no precio.

**Dunford — posicionamiento.** Para P-Vagón la alternativa real no es ATC: es WhatsApp, cuaderno y encargado, y ATC ni siquiera tiene oferta de marketplace en Luján. El +50% sobre ATC se defiende con lo que solo TurnoGol hace y P-Vagón ya usa: día operativo que cierra a la 01:00, cobro por equipo y por jugador, cantina en el mismo mostrador. Pregunta: ¿la oferta escrita nombra esas tres cosas, o dice "sistema de gestión"?

**Schwartz — consciencia.** P-Vagón está en el nivel más alto: ya lo usa. La oferta va directa, sin educar. Los prospectos saben que existen soluciones, así que necesitan el caso de P-Vagón.

**Cialdini — compromiso y coherencia.** En 3 días P-Vagón registró el 100% de sus cobros, incluida la cantina, y pidió cambios que se hicieron. Quien invierte así ya está comprometido, y pedir el anual es coherente con eso. Riesgo: si el día 0 se le dijo otro precio, cambiárselo rompe la confianza del único caso que después sirve de prueba social (REQUIERE INPUT).

**AARRR.** La activación A1 está lograda en una cuenta. A2 (reserva online de un desconocido) en P-Vagón está en cero: no tiene ni una reserva online. Revenue se puede medir recién con ofertas reales, por eso los umbrales se cuentan sobre **ofertas escritas**, no sobre charlas.

**JTBD.** El trabajo que P-Vagón le contrata a TurnoGol hoy es el **mostrador**: cargar, cobrar en efectivo y en partes, y no perder la cantina. No es reservas online ni seña. Por eso el valor está en caja y tiempo (C y B), y "turnos colgados" es el componente más flojo. El value metric por cancha sigue alineado: más canchas, más mostrador.

**SaaS pricing.** Anclar el cobro a la facturación queda **descartado** por tres razones:

- Cobra más cuanto más registra el dueño, así que empuja a no cargar la cantina ni los parciales, que es justo el valor de caja.
- No es verificable, y varía mes a mes.
- doc4 §1 ya descartó comisión.

Sirve como argumento de venta ("menos del 1% de lo que entra") y no como fórmula de cobro. Van Westendorp estaba mal elegido para n < 30 en B2B chico, así que el descarte es correcto. Riesgo nuevo: `/precios` sigue mostrando $99.000 a 4-6 canchas y el freeze no deja cambiarlo, así que cualquier oferta a $167k compite con ese número público.

**Coincidencias.** Hormozi (VE), JTBD y Pricing coinciden en que el % de facturación engaña: TurnoGol no genera la facturación de P-Vagón (0 reservas online, horario central ya lleno sin marketplace), la ordena y la protege. Dunford y Cialdini coinciden en que la prueba es P-Vagón y hay que cuidarla.

### 7.6 Veredicto y recomendación

- **$47k + $30k es justo.** No es bajo: el 0,9% de la facturación engaña, porque contra el valor protegido es 3,2× (central) y 1,3× (escenario bajo). Es alto solo contra el ancla de mercado (+50% sobre ATC a 5 canchas, +69% sobre la lista de hoy).
- **No subir.** $60k + $40k cae a 2,4× el valor central y duplica a ATC sin ningún pago. La medición prueba que el complejo **puede** pagar, no que el valor sea mayor.
- **No bajar antes de ofertar.** Bajar sin una oferta rechazada es negociar contra uno mismo.
- **Estructura:** lineal por cancha contratada, con "confirma y ajusta" (§4.2). No anclada a la facturación.
- **Montos:** mensual $47.000 + $30.000 por cancha extra. Anual prepago con 20% off: $37.600 + $24.000 por mes equivalente. A 5 canchas son $1.603.200 por año.
- **Argumento de venta:** "dos turnos de F7 por mes" (2 × $84.000 = $168.000). Solo sirve donde el turno vale unos $80.000 o más; con turnos de $60.000 son casi 3.
- **Si la validación mata el nivel:** misma estructura con el total de hoy a 5 canchas, $35.000 + $16.000 (5 canchas = $99.000, 8 canchas = $147.000).

### 7.7 Validación por preferencia revelada

Solo cuentan plata o una firma con fecha. "Me parece caro" o "lo pagaría" no son evidencia.

**Precondición común.** La web muestra $99.000 para 4-6 canchas y el freeze no deja cambiarla. Toda oferta escrita dice "lista para altas nuevas; la web se actualiza al terminar el freeze". Si el complejo cita los $99.000 de la web, se anota en la fila de la oferta.

**A. P-Vagón** (fin de prueba 2026-12-06):

| Fecha | Qué |
|---|---|
| 2026-10-14 | 30 días de uso real. Informe de su mes con sus números del panel, más oferta escrita por WhatsApp con dos opciones y fecha límite. |
| Opción 1, hasta 2026-10-31 | **Anual prepago $1.603.200** (5 canchas, 20% off), por link de pago de MercadoPago de la cuenta master. Cubre 2026-12-07 a 2027-12-06 y congela el precio 12 meses. |
| Opción 2, hasta 2026-11-30 | **Mensual $167.000** desde el 2026-12-07. La firma es autorizar la suscripción. |
| Si dice "caro" | Una sola contraprueba, sin regatear: la lista de la web ($99.000). Si firma ahí, su disposición a pagar está entre $99k y $167k, y cuenta como venta perdida por precio puro para HP4. |
| 2026-12-07 | Primer cobro de la opción 2. La evidencia es el pago, no la firma. |

Antes de cobrar hay que resolver cuatro cosas:

1. **D9 (régimen fiscal).** Sin eso no se cobra nada, y la preventa vence el 2026-10-31.
2. **El cobro de $167k no existe en código.** Hoy el sistema le cobraría la banda Complejo ($99.000). El precio lineal se implementa entre el 2026-11-01 y el 2026-12-06 con el contrato §5, y solo si hubo pago o firma.
3. **Un anual pagado por fuera tiene que quedar reflejado en el tenant antes del 2026-12-06.** Si no, el cron lo bloquea cuando vence el trial. Es circuito de plata, así que el freeze lo permite.
4. **Qué precio se le comunicó el día 0** (REQUIERE INPUT).

**B. Prospectos del ICP.**

- Desde que el founder apruebe la lista, toda demo completa termina con **oferta escrita**: $47k + $30k, anual prepago con 20% off y fecha límite a 14 días, o mensual. Incluye arranque asistido en 48 h.
- La preventa del anual es la señal más fuerte. Se cobra por link manual, igual que P-Vagón, y el período arranca cuando se activa el complejo.
- Cada oferta es una fila del CRM (`04-crm-campos.md`) con fecha, canchas, monto, opción y resultado: `pagó`, `firmó`, `perdida-precio`, `perdida-valor`, `mixta` o `sin respuesta`. Al cerrarse va una línea en `10-aprendizajes.md`.

**C. Venta perdida por precio puro.** Cuenta solo si se cumplen las cuatro condiciones:

1. Es ICP y usó la prueba o vio la demo completa.
2. Recibió la oferta por escrito, con monto y fecha límite.
3. No pagó ni firmó a tiempo, y nombró el precio como motivo principal sin que se lo sugieran.
4. Hay contraprueba: firma a un precio menor concreto (la lista de la web), o contrata una alternativa más barata en los 60 días siguientes.

**No cuenta**, y se registra con su propio resultado:

- "Lo pienso" o silencio (`sin respuesta`).
- "Caro" dicho en la demo antes de la oferta, que es una objeción.
- No activó la prueba, que es un problema de activación.
- Se queda con ATC por marketplace o por contrato (`perdida-valor`).
- No es él quien decide.
- Precio mezclado con otro motivo (`mixta`, no suma al umbral).

**D. Umbrales y plazos** (propuestos por el board, a confirmar):

- **Confirma:** al 2026-12-15, al menos 2 pagos a lista, con como mucho 1 venta perdida por precio puro. P-Vagón puede ser uno de los pagos. El anual cuenta cuando se paga; el mensual, en su primer cobro.
- **Mata:** 3 o más ventas perdidas por precio puro en 8 ofertas escritas o menos, en el ICP. Si mata, se pasa a $35k + $16k.
- **Sin veredicto:** menos de 5 ofertas escritas al 2026-12-15. El problema es volumen y se extiende un mes.
- **Puntos de control:**
  - 2026-10-02, junto con D3: cantidad de ofertas escritas. Si son menos de 3, el cuello es adquisición.
  - 2026-10-31: preventa de P-Vagón.
  - 2026-12-15: veredicto.

### 7.8 Hallazgos laterales

- `CalculadoraClavo` en `/precios` ofrece turnos de $20.000 a $40.000. En P-Vagón valen $60.000 y $84.000, así que la calculadora subestima la pérdida 2 a 4 veces. No se toca por el freeze.
- El trigger de D3 (`docs/decisions/2026-09-02-experimento-30-dias.md`) todavía nombra Van Westendorp.

### 7.9 REQUIERE INPUT

1. ¿Qué precio se le comunicó a P-Vagón el día 0, y es P1? Si fue $99.000, el board recomienda honrarlo (y ofrecerle el anual congelado a ese precio) y validar $47k + $30k solo con prospectos.
2. ¿Se aprueba $47.000 + $30.000 como lista a ofertar por escrito desde ahora, sin tocar la web, con anual prepago al 20% off?
3. Ante un rechazo por precio, ¿se ofrece la lista de la web como contraprueba y se cierra ahí, o se deja la venta perdida sin contraoferta?
4. ¿Hay garantía en el anual prepago: devolución proporcional si cancela en los primeros 60 días?
5. D9: ¿para cuándo está definido con el contador quién factura y con qué condición? La preventa de P-Vagón vence el 2026-10-31.
6. ¿Se aceptan los umbrales de §7.7 D y el fallback $35k + $16k? ¿Se actualiza también el trigger de D3?

## 8. Segunda pasada 2026-09-17: el complejo promedio, y dónde está el margen regalado

El founder aclara dos cosas que cambian el análisis de §7: **a P-Vagón nunca se le comunicó un precio** (cae la pregunta 1 de §7.9), y **P-Vagón es el complejo más caro de Luján**, así que no sirve como base. El objetivo que pone es explícito: el precio más alto que a un complejo le siga resultando cómodo, fijado de una vez, sin "aumentos por obviedades" después.

### 8.1 Datos nuevos

| Dato | Valor | Fuente y fecha |
|---|---|---|
| Ticket por jugador, Luján | $5.000 promedio, $4.500 el más barato, $6.000 P-Vagón | Founder, 2026-09-17 |
| Ticket por jugador, CABA | $3.300 a $10.000 según barrio | El Destape, 2026-05-22 (el mismo artículo mide subas de 23-30% por encima de la inflación entre oct-2024 y abr-2025) |
| Ticket por jugador, Salta | $3.000 a $5.000 | Qué Pasa Salta, 2025-10-30 |
| Ocupación típica de un complejo | **SIN DATO** de fuente confiable. Lo que circula sale de notas genéricas o de 2013 | — |
| Costo de un encargado | Básico de Comercio ago-2026 ~$1.320.000; con presentismo y cargas, costo empresa $1,72M a $1,84M por mes, o sea **$8.600 a $9.200 la hora** | iProfesional, sept-2026, más cálculo propio |
| ATC | Publica en **dólares**: USD 50 / 80 / 100 por 1-3 / 4-6 / 7+ canchas, con 20% off anual. Desde IP argentina, el 2026-09-01 mostraba $71.000 / $111.000 / $145.000 | Verificación 2026-09-17 desde IP no argentina, más teardown 2026-09-01 |
| Clubo | $25.000 por cancha para fútbol, $19.000 para otros deportes | Verificación 2026-09-17 |
| CanchaFija | $10.000 (1 cancha) / $18.000 (3) / $25.000 (6) / $50.000 (10) / $60.000 (15) | Verificación 2026-09-17 |
| Monotributo, categoría K | Tope $126.610.838 por año, cuota $1.614.446 por mes | ARCA, vigente desde el 2026-08-01 |
| Tamaño del mercado | HoySeJuega declara 1.645 complejos y 4.466 canchas, o sea 2,7 canchas por complejo. Es autodeclarado: es piso, no censo | HoySeJuega, consultado 2026-09-17 |

Que ATC esté en dólares importa más de lo que parece: su lista se ajusta sola y la de TurnoGol no.

### 8.2 El complejo promedio

Supuestos: mezcla de 70% F5 (10 jugadores) y 30% F7 (14), 26 días operativos por mes y 2,2 turnos vendidos por cancha por día. En P-Vagón se midieron 1,8 en promedio y 2,6 el mejor día, y no hay fuente pública de ocupación, así que ese número es una estimación declarada.

| Ticket por jugador | Facturación por cancha/mes |
|---|---|
| $4.500 (el más barato de Luján) | $2,9M |
| **$5.000 (promedio)** | **$3,2M** |
| $6.000 (P-Vagón) | $3,8M |

Para P-Vagón el modelo da $3,8M por cancha, que es lo que se midió en producción. La base es conservadora y cierra con la medición.

### 8.3 Precio contra facturación y contra valor, con el complejo promedio

Ticket $5.000, escenario medio. "Valor" es lo que TurnoGol le protege por mes (turnos colgados recuperados, horas del encargado a $8.800, fuga de caja del 1%), con los supuestos de §7.2.

| Canchas | Factura | Valor | $47k+$30k | 30k/cancha | 40k/cancha | Hoy | ATC | Clubo |
|---|---|---|---|---|---|---|---|---|
| 3 | $9,6M | $392k | 107k · 1,11% · 3,7× | 90k · 0,94% | 120k · 1,25% | 63k · 0,66% | 71k · 0,74% | 75k |
| 4 | $12,8M | $447k | 137k · 1,07% · 3,3× | 120k · 0,94% | 160k · 1,25% | 99k · 0,77% | 111k · 0,87% | 100k |
| 5 | $16,0M | $501k | 167k · 1,04% · 3,0× | 150k · 0,94% | 200k · 1,25% | 99k · 0,62% | 111k · 0,69% | 125k |
| 6 | $19,2M | $555k | 197k · 1,03% · 2,8× | 180k · 0,94% | 240k · 1,25% | 99k · 0,52% | 111k · 0,58% | 150k |
| 8 | $25,6M | $664k | 257k · 1,00% · 2,6× | 240k · 0,94% | 320k · 1,25% | 129k · 0,50% | 145k · 0,57% | 200k |

Tres anclas del mismo número, a 5 canchas: **1% de lo que factura**, **0,6 turnos de F5 por cancha por mes** y **9% de lo que cuesta un solo encargado**.

### 8.4 Dónde está el margen regalado, ordenado por plata

Con 100 complejos y una mezcla supuesta de tamaños (promedio 4,5 canchas):

1. **La estructura de bandas.** Pasar a lineal sube el MRR de $9,2M a $15,2M, **+65%**, sin tocar el nivel de la banda del medio. Hoy un complejo de 6 canchas paga el 0,52% de lo que factura y uno de 8 el 0,50%, contra el 0,77% de uno de 4: el regalo está arriba de cada banda.
2. **El anual con 20% off.** Si el mensual se ajusta cada trimestre por inflación, con 1,5% a 2,5% mensual el anual termina entregando **25% a 29% menos** que el mensual. Es más plata que toda la discusión del nivel.
3. **No tener regla de ajuste escrita.** Una lista en pesos quieta pierde 25-30% en un año, mientras la de ATC se ajusta sola por estar en dólares.
4. **El IVA al pasar a Responsable Inscripto.** Si la lista es precio final, son **17,4% menos** de ingreso.

Entre $30.000 y $35.000 por cancha hay $2,2M de MRR; entre las bandas y lo lineal hay $6M. La estructura pesa tres veces más que el nivel.

### 8.5 La trampa fiscal: más precio no es más ganancia

Con la lista $47k + $30k, IVA adentro del precio, MercadoPago al 3% más IVA, infraestructura $400.000, IIBB 3% y Ganancias al 35% marginal como persona humana:

| Complejos | Facturado | Régimen | Neto por mes |
|---|---|---|---|
| 50 | $7,6M | Monotributo K | $5,3M |
| 69 | $10,5M | Monotributo K | **$8,1M** |
| 70 | $10,6M | Responsable Inscripto | **$5,0M** |
| 100 | $15,2M | Responsable Inscripto | $7,3M |
| 150 | $22,8M | Responsable Inscripto | $11,1M |

Entre 69 y 70 complejos el neto **cae 38%**. Y con 100 complejos, la lista de hoy deja $6,9M netos contra $7,3M de la lista nueva: **subir el precio 65% mejora el neto 6%**, porque el salto de régimen se come el aumento.

Las palancas reales son fiscales, no de precio:

- **SAS más Economía del Conocimiento**: Ganancias baja de 35% a 15%, o sea alrededor de $9,5M netos con 100 complejos. Exige persona jurídica y cumplir los requisitos del régimen.
- **Trasladar el IVA** ("+ IVA" en la lista): sube el neto a unos $8,9M, pero el cliente de 5 canchas pasa a pagar $202.000, que es el 1,26% de lo que factura y rompe el techo cómodo.

Esto es de D9 y del contador, no del board. Pero cambia la respuesta a "quiero la ganancia más alta posible": el precio no es donde está.

### 8.5.1 Cuánto queda por mes con la regla $47.000 + $30.000

Supuesto: el complejo promedio tiene 4,5 canchas, así que paga **$151.700 por mes**. Costos descontados: MercadoPago 3% más IVA, infraestructura ($200.000 a $400.000 según escala) y el impuesto que corresponda. Tabla del monotributo vigente desde el 2026-08-01 (ARCA).

| Complejos | Facturás por mes | Por año | Impuesto | Cuánto te saca por mes | Te queda |
|---|---|---|---|---|---|
| 10 | $1,52M | $18,2M | Monotributo C | $66.020 (4,4%) | **$1,20M** (79%) |
| 25 | $3,79M | $45,5M | Monotributo G | $230.313 (6,1%) | **$3,17M** (84%) |
| 50 | $7,58M | $91,0M | Monotributo I | $963.748 (12,7%) | **$6,05M** (80%) |
| 69 | $10,47M | $125,6M | Monotributo K (el tope) | $1.614.446 (15,4%) | **$8,07M** (77%) |
| 100 | $15,17M | $182,0M | Responsable Inscripto | IVA $2,63M + IIBB $0,38M + Ganancias 35% | **$7,29M** (48%) |

Dos cosas que se ven acá:

- **Con 69 complejos ganás más que con 100.** A los 69 te quedan $8,07M y a los 100, $7,29M. El monotributo topea en $126,6M de facturación al año, que con esta lista son 69 complejos y medio. Pasando ese número entran IVA, Ingresos Brutos y Ganancias, y de cada $100 que facturás te quedan $48 en vez de $77.
- **La cuota del monotributo salta fuerte en las últimas categorías**: $66.020 con 10 complejos, $230.313 con 25, $963.748 con 50. De 25 a 50 complejos la cuota se multiplica por cuatro.

La salida no es cobrar más caro: es resolver la forma jurídica antes de llegar a los 69 complejos (D9). Con SAS más Economía del Conocimiento, Ganancias baja de 35% a 15% y con 100 complejos quedan alrededor de $9,5M por mes en vez de $7,29M.

### 8.6 Sobre "solo fútbol"

El premio del especialista ya está adentro del número: $47k + $30k son un 45% más por cancha que ATC en el ICP. Ese premio no lo paga el eslogan, lo paga lo que el dueño ve que ATC no hace igual: turnos fijos, día operativo que cierra pasada la medianoche, cobro por equipo y por jugador, cantina en el mismo mostrador. Riesgo: ATC cobra en dólares, así que puede bajar en pesos sin tocar su lista.

### 8.7 Veredicto de la segunda pasada

- **$47.000 + $30.000 es justo y está en el techo de lo cómodo**, no debajo. Para el complejo promedio es el 1,0-1,1% de lo que factura. Subir a $40.000 por cancha lo lleva al 1,25% y a 2,1-2,8 veces el valor estimado: ahí empieza "carero" sin un caso que lo sostenga.
- **Mantener nivel y estructura.** El margen que se está regalando no está en el nivel.
- **Escribir la regla de ajuste en el contrato desde la primera venta**: la lista se ajusta cada trimestre por IPC, avisando 30 días antes (doc4 §5 ya lo pide para el producto). Así el aumento nunca es una sorpresa, que es exactamente lo que el founder quiere evitar.
- **Bajar el descuento anual de 20% a 10%**, o dejarlo solo como herramienta de cierre. Con la regla de ajuste escrita, el anual ya vale por congelar 12 meses.
- **Definir el IVA antes de la primera factura** (D9): precio final o "+ IVA".
- Techo de comodidad hacia adelante: **1% de lo que factura el complejo**. Si el ticket del mercado sube, la lista puede subir con él sin volverse cara.

### 8.8 REQUIERE INPUT (segunda pasada)

1. ¿Cuánto querés ganar neto por mes con 100 complejos? Con esta lista son ~$7,3M como persona humana en RI. Si el objetivo es más alto, la palanca es la estructura fiscal o la cantidad de complejos, no el precio.
2. ¿Bajás el anual de 20% a 10%, o lo dejás en 20% solo para cerrar?
3. ¿La lista se publica con ajuste trimestral por IPC escrito en el contrato desde la primera venta?
4. ¿El precio es final con IVA adentro, o pasa a "+ IVA" cuando seas Responsable Inscripto?
5. D9: ¿hablás con el contador sobre SAS más Economía del Conocimiento **antes** de llegar a los 70 complejos? Ahí está la diferencia entre $5,0M y $9,5M netos.
