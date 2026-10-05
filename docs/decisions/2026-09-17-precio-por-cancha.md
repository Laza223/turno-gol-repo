# Decisión: precio por cancha, lineal y sin techo

**Fecha:** 2026-09-17 · **Decide:** Lazar (founder) · **Insumos:** [board del precio](../gtm/board/2026-09-15-precio-por-cancha.md) §7 y §8, medición de facturación real de un complejo en producción (2026-09-17), [teardown competitivo v2](../gtm/research/2026-09-01-competidores-v2.md).

**Supera a D3** de [`2026-09-02-experimento-30-dias.md`](2026-09-02-experimento-30-dias.md) ("Pricing: mensual por defecto, lista sin cambios"). **Acota D4**: el feature freeze sigue vigente para todo lo demás; lo único que se libera es el circuito de cobro del SaaS, que además entra por la excepción "circuitos de plata".

---

## P1 — La lista pasa a ser lineal por cancha

- **Decisión:** **$47.000 la primera cancha + $30.000 por cada cancha extra, por mes. Sin techo, sin bandas, sin descuento por volumen.** Se reemplazan los tres planes (Predio 1-3 $63.000 · Complejo 4-6 $99.000 · Estadio 7+ $129.000).
- **Cómo queda:** 1 cancha $47.000 · 3 canchas $107.000 · 4 canchas $137.000 · 5 canchas $167.000 · 6 canchas $197.000 · 8 canchas $257.000.
- **Evidencia:** con el ticket promedio de Luján ($5.000 por jugador), un complejo factura alrededor de $3,2M por cancha por mes. La lista nueva queda en **1,0-1,1% de lo que factura el complejo** en todos los tamaños, contra 0,50-0,77% de las bandas actuales, donde el regalo está arriba de cada banda. Board §8.3.
- **Confianza:** media para el nivel (modelo con supuestos declarados, cruzado contra una medición real); alta para la estructura (las bandas regalan margen por construcción).
- **Trigger de reversión:** 3 o más ventas perdidas por precio puro, con la definición estricta del board §7.7 C, en 8 ofertas escritas o menos. Fallback: misma estructura a $35.000 + $16.000.
- **Revisión:** 2026-12-15, con el veredicto de HP4.

## P2 — El anual pasa de 20% a 10% off

- **Decisión:** el ciclo anual descuenta **10%**, no 20%.
- **Evidencia:** con inflación de 1,5% a 2,5% mensual, un anual con 20% off entrega 25-29% menos que un mensual ajustado por trimestre. Board §8.4, punto 2: es el segundo lugar donde más margen se regalaba, después de la estructura de bandas.
- **Confianza:** alta.
- **Trigger de reversión:** si el anual deja de cerrar ventas que el mensual sí cierra.

## P3 — El techo de canchas por plan desaparece

- **Decisión:** `plans.max_courts` deja de existir como límite operativo. Agregar una cancha **no se bloquea**: cuesta $30.000 más por mes.
- **Consecuencia que hay que preservar:** el gate de canchas existía para que nadie operara de más pagando de menos ([`src/app/(admin)/canchas/actions.ts`](../../src/app/(admin)/canchas/actions.ts), comentario de `toggleStatus`). No se borra: se convierte en una confirmación con el monto nuevo. Apagar una cancha no baja la cuota sola; bajarla es una acción deliberada del dueño.
- **Confianza:** alta.

## P4 — Sumar una cancha se cobra desde el próximo mes

- **Decisión:** el cambio de cantidad de canchas **nunca se cobra prorrateado en el medio del período**. Lo que queda del mes en curso va sin cargo y la cuota nueva arranca en el próximo cobro. Vale en los dos sentidos.
- **Evidencia:** el objetivo declarado del founder es un precio sin sorpresas ("no quiero dar algo barato para después aumentar el precio por obviedades"). Un cargo prorrateado el día que alguien agrega una cancha es exactamente la sorpresa que se quiere evitar. Además elimina del código toda la maquinaria de proraeo, que es superficie de bug en un circuito de plata.
- **Confianza:** alta.

## P5 — Ninguna suscripción con cobro activo cambia de monto por esta decisión

- **Decisión:** la migración no le cambia el monto a nadie que ya esté pagando. Al 2026-09-17 no hay ningún complejo pagando, así que el caso es vacío — pero la salvaguarda queda escrita en la migración (`088`), que aborta si encuentra una sola suscripción con preapproval vivo cuyo monto cambiaría.
- **Excepción explícita del founder:** el complejo en prueba (P-Vagón, 5 canchas, prueba hasta el 2026-12-06) tiene un preapproval ya creado por $99.000. **Se actualiza a $167.000 sin cancelar ni acortar la prueba.** Es un paso manual, verificado antes en el sandbox de MercadoPago, no parte de la migración.
- **Confianza:** alta.

## P6 — La web pública `/precios` no se toca todavía

- **Decisión:** la página pública sigue mostrando los tres planes viejos hasta que el founder dé la orden. El panel del cliente y el cobro real pasan a precio por cancha ahora; la comunicación comercial se decide aparte.
- **Consecuencia asumida:** `src/app/(business)/precios/plans-data.ts` queda como snapshot de marketing congelado, desacoplado del catálogo real. El candado anti-drift (`tests/integration/pricing-sync.test.ts`) verifica esa divergencia **a propósito**, para que nadie la "corrija" por error.
- **Confianza:** alta como decisión; el riesgo es que un prospecto vea un precio y le cotizen otro. Mitigación: hoy no hay tráfico de conversión por esa página.
- **Revisión:** cuando el founder decida comunicar la lista nueva.

## P7 — El IVA sigue sin definirse

- **Decisión:** D9 de la decisión anterior sigue vigente y sin resolver. Ningún texto nuevo de la aplicación dice "+ IVA" ni "precio final". El desglose muestra el monto, nada más.
- **Revisión:** antes del primer cobro real.

---

## Qué cambia en el código

Detalle de implementación en el plan del esfuerzo. Los cambios de fondo:

- `plans` se colapsa a **una fila activa** (`slug = 'turnogol'`, `max_courts = NULL`) con `price_first_court_cents`, `price_extra_court_cents` y `annual_discount_bps`. Las tres filas viejas quedan inactivas, no se borran.
- `tenant_subscriptions` suma **`billed_courts`**: la cantidad de canchas sobre la que está calculado el cobro vigente, o sea lo que hay cargado en el preapproval de MercadoPago. No es "cuántas canchas tiene hoy el complejo".
- El monto sale de una función pura (`src/modules/billing/pricing.ts`), no de una columna.
- "Upgrade / downgrade de plan" deja de existir como concepto de producto: lo reemplaza "cambiar la cantidad de canchas facturadas".

## Lo que esta decisión NO habilita

Todo lo de la kill list de [`2026-09-02-experimento-30-dias.md`](2026-09-02-experimento-30-dias.md) sigue vigente, salvo el pricing en código. En particular: no se rediseña la web comercial, no se resuelve el IVA, no se destaca el anual en marketing, no se crean precios por complejo ni cupones, y no se activa `price_locked_until`.
