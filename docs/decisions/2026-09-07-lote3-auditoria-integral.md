# Lote 3 de la auditoría integral — decisiones

**Fecha:** 2026-09-07
**Alcance:** los cuatro hallazgos que no dependían de una decisión del dueño
(AUD-15, AUD-08 mínima, la clase H-1 en torneos, y las cuatro mejoras de
hardening). PRs #286, #287, #288 y el de hardening.

Lo que sigue es el **porqué**. El qué está en el `git log` y en el cuerpo de
cada PR; el informe de la auditoría está en
`docs/audits/2026-09-06-auditoria-integral-fase-diagnostico.md`.

---

## D1 · El `55P03` se traduce en el wrapper, no en los route handlers

**Situación.** `billing.service.ts` llama a MercadoPago con el `FOR UPDATE` de
la fila de suscripción tomado (el gateway tiene 8 s de timeout) y el rol web
corta de esperar un lock a los 3 s (`lock_timeout`, migr. 055). La segunda
operación concurrente recibe `55P03 lock_not_available`, que no estaba mapeado
en ningún lado: caía en el catch genérico y salía como 500, con reporte a
Sentry incluido.

**Alternativas.**

| Opción | Por qué no / por qué sí |
|---|---|
| Mapear en los seis route handlers de `/api/billing/*` | Es lo que proponía el informe. Seis copias del mismo `if`, y deja afuera cualquier otra ruta transaccional que sufra lo mismo |
| Mapear en `billing.service.ts` | El service no construye respuestas HTTP: devolver un 409 desde ahí le mete la capa de transporte adentro del dominio |
| **Mapear en los dos catch de `with-tenant.ts`** ← elegida | La condición no es de facturación: es de cualquier ruta que abra una transacción. Esos dos catch son el único lugar por el que pasan todas |

**Consecuencia asumida.** Cualquier ruta bajo `withTenant`/`withBillingTenant`
que agote el `lock_timeout` responde ahora 409 `CONCURRENT_OPERATION` en vez de
500, y **deja de reportarse a Sentry**. Eso es deliberado —era un falso
positivo— pero significa que un lock patológico de verdad (una fila que nadie
suelta nunca) tampoco va a aparecer ahí. Si aparece esa sospecha, el rastro
queda en los logs de la plataforma, no en Sentry.

**Lo que esta solución NO hace.** Es la mínima del hallazgo. La causa —hablar
con MercadoPago con la fila bloqueada— sigue ahí. La incremental es el patrón
intent → MP → confirm que ya usa `createDepositPayment`, y sigue pendiente.

**Rollback:** revert del PR. Sin migración.

---

## D2 · `sending_since`: por qué una columna nueva y no una que ya existía

**Situación (AUD-15).** El claim pasa la notificación a `sending` y las tres
salidas de ese estado viven en la misma invocación del worker. Si el proceso
muere en el medio, la fila queda ahí para siempre: el barrido sólo mira
`queued`.

**La premisa del informe era falsa.** Proponía filtrar por
`updated_at < now() - 10 min`. `notifications` **no tiene `updated_at`**. Ver
también el gotcha en la skill `convenciones-stack`.

**Alternativas.**

- **`queued_at`**: es del alta y no se mueve en el claim. Una fila que entró a
  la cola hace rato pero cuyo envío arrancó recién se reclamaría en vuelo — o
  sea, el mismo mail dos veces. Descartada: el bug que introduce es peor que el
  que arregla.
- **Un trigger `updated_at` genérico**: más superficie (toda escritura a la
  tabla lo mueve) para una pregunta específica.
- **Columna propia escrita por el claim** ← elegida. Dice exactamente lo que se
  necesita saber y no significa nada en ningún otro estado.

**El umbral son 10 minutos y el margen es deliberado.** Un envío sano tarda
menos de un segundo, pero `email.provider.ts` no tiene timeout explícito: un
fetch colgado no se corta solo, y reclamar un envío TODAVÍA en vuelo manda el
mail duplicado. **Bajar el umbral sin ponerle antes ese timeout al proveedor de
mail es introducir el duplicado a mano.**

**Filas anteriores al deploy.** No hay backfill: las que ya estén clavadas
tienen la columna en NULL y el rescate cae a `queued_at` vía `coalesce`. Para
una fila abandonada, el alta en la cola es una cota inferior buena.

---

## D3 · La ventana de antigüedad del webhook de MercadoPago falla ABIERTA

**Situación.** El manifiesto que firma MercadoPago incluye `ts` y no se miraba,
así que un aviso firmado se podía repetir indefinidamente.

**El riesgo va en la dirección incómoda.** Este chequeo puede rechazar el aviso
de un pago YA COBRADO — eso cuesta plata y es silencioso. Lo que evita es
repetir un aviso cuyas ramas ya son idempotentes por `processed_webhooks` — eso
no cuesta nada. **Las dos puntas del error no valen lo mismo**, así que todo el
diseño se inclina a aceptar:

1. Ventana de **6 horas**. MercadoPago reintenta cada 15 minutos y después
   espacia, así que ni una cadena larga de reintentos llega.
2. **En la duda, acepta**: `ts` ilegible o fechado en el futuro (reloj
   desfasado) pasa. Antes de este chequeo no había ninguna ventana, así que
   fallar abierto nunca es peor que el comportamiento anterior.
3. **Normaliza segundos a milisegundos.** MercadoPago documenta milisegundos,
   pero si alguna vez llegara en segundos, restarlo crudo daría una antigüedad
   de décadas y rechazaría todos los avisos de producción a la vez.
4. Cuando SÍ rechaza, loguea `error` (no `warn`) para que llegue a Sentry: una
   firma válida tirada por vieja es la señal de que la ventana quedó corta.

**Si aparece ese log en producción, la ventana está mal y hay que ensancharla,
no investigar al emisor.**

---

## D4 · `isNonProductionRuntime` se mudó a `@/shared`

`NEXT_PUBLIC_E2E=1` apaga el rate limiting entero, y "nunca se setea en un
entorno real" era una convención escrita en un comentario, no un candado. El
prefijo `NEXT_PUBLIC_` significa que la variable viaja al bundle: alcanza con
que quede cargada una vez en el proyecto de Vercel para dejar producción sin
límites, en silencio.

`MP_MOCK_ENABLED` apaga una defensa del mismo calibre y ya estaba duro-gateada
por `isNonProductionRuntime()`. Para que el gate de rate-limit use **la misma**
definición hubo que mover la función a `@/shared/runtime-env.ts`: vivía en
`modules/payments/mock-mp.ts` y `@/shared` no puede importar `@/modules`
(regla `turnogol/capas-shared`). Tener una sola definición importa más que
dónde viva — los interruptores que apagan defensas fuera de producción tienen
que decidir todos con el mismo criterio.

---

## D5 · Torneos: la auditoría nombró dos puertas y eran tres

El informe listaba `addTeam` y `addTeamPlayer`. Buscando la clase apareció
`updateTeam`, que escribe el mismo `contact_player_id` al editar un equipo ya
anotado y es alcanzable desde `updateTeamAction`. Cerrar sólo el alta no
cerraba nada.

No es un descubrimiento nuevo del repo: es el mismo patrón que
`depositCashFlowDescription` (la seña tenía tres emisores). **Un hallazgo que
nombra llamadores es una muestra, no un inventario** — el grep por el campo
escrito es lo que cierra la clase.

---

## Fuera de alcance, a propósito

AUD-03, AUD-10, AUD-11 y AUD-12 dependen de decisiones del dueño (E3 a E6 del
informe) y no se tocaron.
