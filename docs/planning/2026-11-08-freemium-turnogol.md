# Freemium en TurnoGol: estrategia para decidir

**Fecha:** 2026-11-08. **Estado: DECIDIDO el mismo día** → [`docs/decisions/2026-11-08-freemium.md`](../decisions/2026-11-08-freemium.md). Esta es la propuesta que leyó el founder. Donde difiere, manda la decisión:
- el corte del gratis lleva **tope de reservas online por mes**;
- se lanza en **todo el país**, sin piloto en Luján;
- **no** se escribe la regla de no recortar;
- el que entra en mora **baja a gratis**;
- arranca **apenas esté listo**;
- la meta es **50 complejos en el mapa y 5 que pasan a pago a 90 días**.

**Insumos:**
- [`2026-11-08-ideas-del-founder.md`](2026-11-08-ideas-del-founder.md) (panel, punto 4);
- `docs/gtm/research/2026-09-01-competidores-v2.md` §11.4 (free tiers del mercado);
- [`docs/decisions/2026-10-22-solo-lectura-al-vencer-la-prueba.md`](../decisions/2026-10-22-solo-lectura-al-vencer-la-prueba.md).

**Revisión del mismo día.** El founder aprobó la idea, pero teme que "el argentino es muy tacaño" y que muchos se aprovechen. Preguntó si convenía seducir con un gratis amplio y recortar después. Esta versión:
- **corta más fuerte desde el día 1** (§3.2);
- **descarta recortar después** (§3.5);
- **prueba primero solo en Luján** (§3.6).

## 1. La pregunta real

La pregunta no es "freemium, prueba de 30 días o referidos". Es **qué pasa con el complejo que no paga**.

Hoy la respuesta va en contra de la tesis de distribución:
- vence la prueba;
- pasa 14 días a solo lectura;
- se bloquea;
- **desaparece del buscador y de RIVAL**: solo se listan los que están en `active` o `trialing` (`VISIBLE_TENANT_STATUSES`, `src/modules/tenants/search.service.ts:88`).

Cada prueba que no convierte es un complejo menos en el mapa del jugador. Con la tesis de competir por los jugadores, eso es una fuga del activo principal.

El freemium, mirado así, no es una táctica de precio: **es el motor de oferta de un mercado de dos lados**. El complejo que no paga igual queda en el mapa, y los jugadores tienen dónde reservar.

## 2. El panel

**Thompson, rey o peón.** Un plan gratis que **deja el flujo en TurnoGol** es jugada de rey: las reservas pasan por TurnoGol, el jugador es de TurnoGol y cada complejo gratis cuesta casi cero gracias al apalancamiento del código.
- Pasa 5 de sus 6 filtros: es activo, tiene apalancamiento, es dueño del flujo, es ofensiva y crece sola. La estructura legal no se evalúa acá.
- **Su advertencia:** gratis sin un motor de conversión es jugada de peón disfrazada de estrategia, porque subsidia el marketing del complejo. El mapa es un activo **solo si hay jugadores en esa zona**. Por eso el freemium va con RIVAL en Luján, no solo.

**Hormozi.** Su frase es "regalá los secretos, vendé la implementación". Para TurnoGol: **regalá la vidriera, vendé la noche.**
- El freemium no es descontar el plan pago; el precio no se toca (D5).
- Su argumento más fuerte es el costo de cambio. El complejo que usa el gratis ya tiene canchas, precios y jugadores cargados. Pasar a pago le cuesta cero tiempo y cero esfuerzo, y eso dispara la ecuación de valor del plan pago.
- **Disiente:** lo gratis atrae al que nunca va a pagar. Se acepta si ese no consume las horas de Lazar (ver §3.4).

**Godin.** "Gratis" solo no es una vaca púrpura: Korus, Don Potrero, Turnito, Clubin y Vibe ya lo dicen. Lo púrpura es **"gratis y aparecés donde los jugadores de tu zona buscan cancha y rival"**: el gratis con red. Sin RIVAL, es un free tier más.

**Brunson.** Arma la escalera de valor completa:
1. **Gratis:** aparecer en TurnoGol.
2. **La noche:** $30.000 por cancha.
3. **Plus:** el bot, $15.000 por cancha.
4. **Arriba:** torneos y cámaras.

Ninguna oferta se le vende a alguien que no subió el escalón anterior.

**Kennedy.** Son dos mensajes que no se mezclan:
- gratis: "Aparecé gratis donde los jugadores de tu zona buscan cancha";
- pago: "La noche de tu complejo, desde el celular".

Además pide respuesta medible: altas gratis, paso de gratis a pago y días hasta pagar. La analítica entra con el PR #580.

**Cardone.** El mensaje en frío por WhatsApp pasa de "probalo 30 días" a "es gratis, te lo dejo andando hoy". Más "sí" con el mismo volumen de 15 mensajes por día.

**Belfort.** Hoy, para arrancar, el dueño necesita confiar en el producto, en vos y en la empresa. Con el gratis no necesita ninguna: arranca sin riesgo. La confianza se pide recién al pasar a pago, cuando el producto ya demostró lo suyo con sus datos.

**Gary Vee.** El plan gratis es una entrega de valor permanente sin pedir nada. El pedido aparece adentro del producto, justo en el momento del dolor (§3.3).

**Robbins.** Pide un resultado medible por trimestre, para que no sea "gratis por las dudas" (§6).

**Dónde chocan:** Godin y Hormozi temen que lo gratis diluya la marca, y Thompson y Brunson lo ven como el motor de la oferta. Se resuelve con la línea de corte del §3: **lo gratis es lo que vale para TurnoGol (visibilidad y reservas), y lo pago es lo que vale para el dueño (control de la noche)**. El research de competencia ya lo había visto (`competidores-v2.md:147`): el dueño de fútbol pide **control**, no ocupación.

## 3. La propuesta: prueba al revés (*reverse trial*) con corte duro

### 3.1 El recorrido

1. **El alta es igual que hoy**: 30 días con el plan completo y sin tarjeta.
2. Si al día 30 no pagó, **no se bloquea: baja a Gratis** y sigue en el mapa.
3. Pierde "la noche" y lo nota (aversión a la pérdida), pero sus reservas online siguen entrando.
4. Pasa a pago con un toque, sin recargar nada.

Junta las tres opciones que planteó el founder:
- **la prueba** se mantiene, y vale más porque ahora tiene un "después";
- **el gratis** atrapa a los que no pagaron, en vez de perderlos;
- **los referidos** se vuelven más fáciles: recomendar algo gratis no le cuesta nada al otro dueño.

### 3.2 La línea de corte (versión dura)

La regla en una frase: **gratis es lo que traen los jugadores; todo lo que anota el dueño es pago.** El tacaño tiene una vidriera que le trae jugadores, pero no puede dejar el cuaderno sin pagar.

| | **Gratis: "Aparecer en TurnoGol"** | **Plan: "La noche"** ($30.000 por cancha, sin cambios) |
|---|---|---|
| Página del complejo, buscador, RIVAL | ✅ | ✅ |
| Reservas online 24/7 (ver, confirmar y cancelar las que entran) | ✅ | ✅ |
| Marcar un horario como **"ocupado"** (lo que toma por teléfono) | ✅ (sin nombre ni nota) | ✅ |
| **Anotar una reserva propia** (quién juega, teléfono, precio) | — | ✅ |
| Turnos fijos automáticos (abonados) | — | ✅ |
| Cobro por equipo, caja y buffet | — | ✅ |
| Jugadores (`/jugadores`) y etiquetas | — | ✅ |
| Encargado (segundo usuario) | — | ✅ |
| Imagen de horarios libres para la historia | ✅ (con la marca TurnoGol, como hoy) | ✅ |
| Métricas | solo "este mes entraron X reservas online" | completas |
| Seña con Mercado Pago | — | ✅ (opcional, D9) |
| Bot de WhatsApp | — | Plus |
| Soporte | **solo ayuda escrita y en video** | WhatsApp |

**Por qué "ocupado" es gratis:** sin eso, un complejo gratis toma reservas por teléfono que la web sigue mostrando libres. Eso termina en una doble reserva, el jugador sale quemado y la red se ensucia.

**Por qué "ocupado" va sin nombre ni nota:** si llevara texto, se usaría como reserva y el corte se esquivaría. Hoy un bloqueo (`type='block'`) acepta `guestName` y `notesInternal` (`src/modules/bookings/booking.schema.ts`), así que en el gratis la spec tiene que sacarlos. De paso, se cumple el veto de texto libre sobre personas.

**Por qué anotar reservas propias es pago:** es lo que reemplaza al cuaderno, y el cuaderno es lo que el dueño quiere dejar. Los fijos (la mayoría de los turnos en fútbol) están adentro de eso.

### 3.3 Cuándo aparece el pedido de pasar a pago (adentro del producto)

- Marca "ocupado" en el mismo horario dos semanas seguidas → "¿Es un fijo? Con el plan anotás quién juega y se carga solo todas las semanas."
- Toca "ocupado" → "¿Querés anotar quién juega y cuánto paga? Eso es con el plan."
- Al cerrar la noche → "¿Cuánto entró hoy? Con el plan, la caja te lo dice."
- Quiere sumar al encargado → "El encargado entra con el plan."
- Una vez por mes → "Este mes los jugadores te reservaron X turnos online."

### 3.4 Barandas para que la red no se ensucie

- **Verificado para aparecer en el buscador.** Un complejo nuevo se ve por su link directo, pero entra al buscador y a RIVAL recién cuando está verificado (teléfono confirmado, más el chequeo de que existe). Evita complejos falsos que toman reservas.
- **Pausa automática.** Si un complejo gratis cancela muchas reservas online en un mes, se pausan sus reservas online hasta que confirme que tiene sus "ocupado" al día. El umbral lo pone la spec.
- **Soporte sin horas de Lazar.** El gratis tiene ayuda escrita y videos cortos por pantalla, como el panel de Canchería. Las horas de Lazar son el recurso escaso de verdad, mucho más que la infraestructura, y el WhatsApp de soporte es solo del plan.

### 3.5 Regla: lo que se da no se recorta después

Se descarta "seducir con un gratis amplio y recortarlo cuando todos lo usen":
- **Es la forma más cara de ser tacaño.** Sacar lo que diste genera más bronca que no haberlo dado nunca. Pasó con Heroku al eliminar su plan gratis (2022) y con Unity y su cobro por instalación (2023), que terminó dando marcha atrás.
- **En este mercado pega peor.** Los dueños de una zona están en los mismos grupos de WhatsApp. "Era gratis y ahora cobra" corre tan rápido como un referido y quema el único canal (misma lógica que la regla "encuadre, nunca número").
- **Por eso el corte es duro desde el día 1** (§3.2), con las condiciones del gratis escritas en `/precios` y en los términos.
- **Si algún día hay que ajustar**, vale solo para los que entran desde ese día. El que ya estaba conserva sus condiciones.

### 3.6 Primero solo en Luján

Para no apostar todo a una hipótesis sin datos, se arranca por una zona:
- **El gratis existe solo para complejos de Luján** (la zona de RIVAL) durante **60 a 90 días**, con reglas escritas.
- **Afuera sigue la prueba de 30 días** como hoy: el plan de noviembre no cambia.
- Es un límite real (una zona), no escasez inventada. Se explica tal cual: "arrancamos por Luján".
- Al cierre se mide lo del §6, y recién ahí se decide si pasa a todo el país, si se ajusta el corte (sin tocar a los que ya están, §3.5) o si se vuelve a la prueba sola.

## 4. Por qué las otras dos solas no alcanzan

- **Vender mejor la prueba** (alta de 2 minutos, "te lo dejo andando hoy", casos con permiso en redes) hace falta en cualquier escenario. Pero sola mantiene la fuga del §1: el que no paga se va del mapa.
- **Los referidos** (1 mes por referido que paga) no tienen evidencia de que los dueños se recomienden entre sí (H3, `2026-09-26-referidos.md:10`). Necesitan que el referido pague, así que con freemium mejoran.

## 5. Riesgos, con cómo se miden

**El miedo a que se aprovechen, en limpio.** El que usa el gratis para siempre no le saca plata a TurnoGol: pone su complejo en el mapa, trae jugadores y cuesta casi cero en infraestructura. Pierde TurnoGol solo con el que **pagaría y no paga**, y con el corte duro, el que quiere manejar la noche tiene que pagar. Además hoy pagan 0, así que no hay plata existente que canibalizar. El riesgo más probable no es el abuso: es que no lo adopte nadie.

| Riesgo | Por qué importa | Cómo se cubre o se mide |
|---|---|---|
| **Canibalización:** el que pagaría se queda gratis | Baja la plata futura | El corte duro deja todo lo que anota el dueño del lado pago. Se mide qué % de las pruebas vencidas de Luján pagan contra cuántas bajan a gratis. |
| El gratis come las horas de Lazar | Él es uno | Sin WhatsApp de soporte para el gratis. Se miden las horas por semana dedicadas a complejos gratis. |
| Nadie lo adopta | El mapa no crece | Se mide cuántos complejos de Luján entran al gratis en el piloto |
| "Gratis = no sirve" (Godin) | Diluye la marca | Se nombra "Aparecer en TurnoGol", no "TurnoGol gratis". El plan pago es el ancla. |
| Complejos fantasma en el mapa | El jugador reserva y no existe | Verificación antes del buscador (§3.4) |
| Se esquiva el corte con "ocupado" | El gratis reemplaza al cuaderno | "Ocupado" sin nombre ni nota (§3.2) |
| La charla de pago del día 21 pierde fuerza ("me quedo gratis") | Plan de noviembre | Afuera de Luján no cambia nada. En Luján, la charla pasa a ser "el día 31 dejás de poder anotar tus turnos, tus fijos y la caja". |
| Un complejo que paga se pasa a gratis | Plata hoy | Ningún complejo que usa fijos, caja o cobro por equipo puede bajar sin perderlos. Se mira caso por caso antes de lanzar. |

## 6. Cómo se sabe si funciona (cierre del piloto de Luján)

Los números los pone el founder:
- **N** complejos de Luján en el mapa (gratis + pagos);
- **M** reservas online por mes en complejos gratis;
- **K** complejos que pasaron de gratis a pago, y los días que tardaron;
- **% de pruebas vencidas** que pagan, contra el resto del país;
- **horas por semana** de Lazar dedicadas a complejos gratis.

**Criterio para volver atrás:** si al cierre del piloto el gratis no sumó complejos al mapa ni pasos a pago, se vuelve a la prueba sola. Los que ya estaban conservan sus condiciones (§3.5).

## 7. Qué cambia en el producto (para la spec, no se decide acá)

- **Lifecycle:** al vencer la prueba, un complejo de Luján baja a gratis en vez de "solo lectura → `blocked`". Esto supera, en ese punto y para esa zona, [`2026-10-22-solo-lectura-al-vencer-la-prueba.md`](../decisions/2026-10-22-solo-lectura-al-vencer-la-prueba.md) y doc4 §2.
- **Mora** (un complejo que pagaba y dejó de pagar): bajarlo a gratis en vez de bloquearlo es una decisión aparte (ver §9).
- **Modelo:** ¿es un estado nuevo de `tenant_status` o un plan separado del estado? Es una decisión de arquitectura (`decision-arquitectura`). La inclinación es no tocar el FSM de 8 estados y sumar un nivel de plan, porque el estado describe la cuenta y el plan describe las funciones.
- **Guards por función**, no por estado: anotar reservas, los fijos, la caja, los jugadores y el encargado piden el plan. Es el mismo patrón opt-in que `allowReadOnly`.
- **"Ocupado" sin texto en el gratis:** el bloqueo no guarda `guestName` ni `notesInternal`.
- **Visibilidad:** `VISIBLE_TENANT_STATUSES` tiene que incluir a los gratis verificados.
- **Zona del piloto:** cómo se define "Luján" (ciudad del complejo) lo resuelve la spec.
- **Copy y web:**
  - `/precios` con dos columnas y las condiciones del gratis por escrito;
  - `/para-complejos` con "Aparecé gratis" para Luján;
  - si el piloto pasa a todo el país, las comparativas pueden decir "gratis" con verdad, y las consultas "sistema de gestión de canchas gratis" pasan a ser terreno propio para SEO y las IAs.

## 8. "Páginas sin reclamar" (lo que no se entendió)

Es que TurnoGol arme **por su cuenta** la página de un complejo que nunca se registró, con datos públicos de Google Maps (nombre, dirección y teléfono). Así aparece en el buscador, y cuando el dueño se entera la "reclama" y la administra él. Es como funcionan Google Maps o Tripadvisor.

**Recomendación: no por ahora.** En Luján los dueños se conocen, y aparecer sin permiso puede caer mal justo con los complejos que se están visitando. El plan gratis ya es la puerta de entrada.

## 9. Decisiones del founder (REQUIERE INPUT)

1. **¿Freemium con prueba al revés y el corte duro del §3.2?** Gratis: vidriera, reservas online y "ocupado" sin texto. Pago: todo lo que anota el dueño.
2. **¿Piloto solo en Luján, y por cuánto?** 60 o 90 días.
3. **¿La regla del §3.5 queda escrita?** Lo que se da no se recorta; si se ajusta, vale solo para los nuevos.
4. **¿Sin límite de canchas en el gratis?** Recomendado: sí, sin límite. Lo que separa es la función, no el tamaño.
5. **¿El que deja de pagar (mora) también baja a gratis en vez de bloquearse?**
6. **Los números de cierre del §6** (N, M y K) y la fecha de arranque del piloto.
