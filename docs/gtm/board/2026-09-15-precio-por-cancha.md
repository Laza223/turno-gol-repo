# Billion Dollar Board — precio lineal por cancha

> Fecha: 2026-09-15 · Pedido del founder · Estado: **validar antes de implementar** (decisión del founder, ver §4). Nada de este documento cambia precios en código ni en la web.

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
| 1 | **Validar antes.** No se programa. Se cotiza $47k + $30k por cancha extra en las próximas charlas, con Van Westendorp (hipótesis HP4 en [`07-tablero-hipotesis.md`](../ejecucion/07-tablero-hipotesis.md)). Revisión junto con D3, el 2026-10-02. |
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
