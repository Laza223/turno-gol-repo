# Decisión: el gratis pasa a ser la agenda, y el plan cobra la plata y el equipo

**Fecha:** 2026-11-15 · **Decide:** Lazar (founder), por select, después de leer la propuesta [`docs/planning/2026-11-15-freemium-v2.md`](../planning/2026-11-15-freemium-v2.md). Es la decisión escrita que CLAUDE.md exige para cambios de lifecycle. **No cambia ningún precio.**

## Por qué

El gratis del 8/11 dejaba al dueño marcar "Ocupado" sin nombre. Con eso no podía dejar el cuaderno: anotaba cada turno dos veces, y el gratis le sumaba trabajo en vez de sacárselo. El complejo que no usa el panel para trabajar tampoco tiene los horarios al día, y esa era justo la oferta que el gratis tenía que darle al jugador.

Lo que se cobra pasa a ser lo que el dueño de fútbol pidió sin que nadie le pregunte: los fijos que se cargan solos, la plata y el equipo.

La regla en una frase: **gratis es quién juega; el plan es quién pagó.**

## Decisiones

1. **Agenda con nombre gratis.** El complejo gratis anota sus turnos con nombre y teléfono, sin tope. Sigue sin poder cargar precio, cobros ni notas.
2. **Tope de reservas online: 20 por cancha por mes.** Reemplaza las 20 por complejo. Un complejo de 5 canchas tiene 100.
3. **Los turnos fijos son todos pagos.** En gratis el fijo se anota a mano cada semana. No hay cupo de fijos gratis.
4. **Con el plan, el logo del complejo va primero** en la imagen de horarios libres para la historia, y el de TurnoGol queda más chico. En gratis la imagen sigue como hoy, con el logo de TurnoGol.

## Cómo quedan los planes

|                                      | Gratis                | Completo ($30.000 por cancha) | Completo + WhatsApp (+ $15.000) |
| ------------------------------------ | --------------------- | ----------------------------- | ------------------------------- |
| Canchas                              | sin límite            | sin límite                    | sin límite                      |
| Anotar turnos con nombre y teléfono  | sí, sin tope          | sí                            | sí                              |
| Reservas online                      | 20 por cancha por mes | sin tope                      | sin tope                        |
| Página, buscador y RIVAL             | sí                    | sí                            | sí                              |
| Turnos fijos                         | a mano                | se cargan solos               | se cargan solos                 |
| Cobros, "no cobrado", caja y cantina | no                    | sí                            | sí                              |
| Encargado                            | no                    | sí                            | sí                              |
| Jugadores y etiquetas                | no                    | sí                            | sí                              |
| Métricas                             | resumen del mes       | completas                     | completas                       |
| Seña y penalidad por cancelar tarde  | no                    | opcional                      | opcional                        |
| Imagen para la historia              | logo de TurnoGol      | logo del complejo primero     | logo del complejo primero       |
| Soporte                              | ayuda escrita y video | WhatsApp                      | WhatsApp                        |
| Asistente de WhatsApp                | no                    | no                            | sí                              |

## Consecuencias

- **Al bajar a gratis**, lo que el complejo ya anotó conserva el nombre. Se sigue ocultando la plata. Los fijos dejan de generar fechas, y las que ya estaban cargadas quedan con su nombre.
- **Los avisos de pasar al plan** cambian de lugar. Ya no va el de "¿querés anotar quién juega?". Van el del cierre de la noche ("¿se cobró?"), el del mismo nombre y horario repetido tres semanas ("¿es un fijo?") y el del tope por cancha, con contador a la vista.
- **`/precios` y los términos** tienen que decir "20 por cancha" y que anotar turnos con nombre es gratis.
- **El veto de texto libre sobre personas no cambia.** En gratis se anota nombre y teléfono, nada más.

## Riesgo asumido

Dar es fácil y sacar es caro. Si más adelante los nombres vuelven a ser pagos, son 30 días de aviso y bronca en los grupos de dueños. Se decide a sabiendas, sin datos del gratis anterior: tenía una semana.

## Lo que supera o modifica

- [`2026-11-08-freemium.md`](2026-11-08-freemium.md), punto 2: se van "marcar ocupado sin nombre ni nota" y el tope por complejo. El resto sigue vigente.
- `2026-11-08-freemium-spec-y-estado-free.md` (en `main`), decisiones 1 y 4: el tope pasa a ser por cancha, y al bajar a gratis lo anotado ya no se muestra como "Ocupado".
- Para actualizar en la misma entrega: `CLAUDE.md`, `.claude/rules/billing-precio.md`, `/precios` y los términos.

## Lo que no cambia

- El precio: $30.000 por cancha, anual con 10% menos, y el asistente a $15.000 por cancha.
- La prueba al revés de 30 días y la baja a gratis del que no paga.
- La pausa automática por cancelar muchas reservas online y el borrado del gratis abandonado.
- La seña sigue opcional y nunca titular.
- La meta a 90 días: 50 complejos en el mapa y 5 que pasan a pago.

## Para la spec, sin decidir todavía

- **Qué canchas cuentan para el tope.** Propuesta: las que están online al momento de la reserva.
- **Si un cambio a favor del complejo necesita los 30 días de aviso** o alcanza con comunicarlo. Se confirma leyendo los términos.
- **Cortesía la primera vez que llega al tope:** dejarle ese mes abierto.
- **Cargarle los fijos a mano al que paga el año.** Son horas del founder.
- **Qué se mide además de la meta:** complejos gratis que anotaron turnos en la semana, días hasta el primer pago, porcentaje que paga a 30, 60 y 90 días, y horas del founder por complejo gratis.

## Ajuste del 2026-11-16, en la entrega

Lazar lo decidió por select al arrancar la entrega:

- **Reservas online del gratis: sin tope.** Reemplaza la decisión 2. Cortar la reserva online le genera fricción al jugador, que también es cliente de TurnoGol. La pausa automática por cancelar muchas reservas online sigue igual.
- **No se manda el mail de 30 días.** Los términos piden avisar cualquier cambio del gratis, pero este cambio solo suma: nombres y reservas sin tope, y nada empeora.
- Con eso dejan de aplicar dos puntos de "Para la spec": qué canchas cuentan para el tope y la cortesía del primer tope.
- El aviso de pasar al plan por el tope ya no existe. Quedan "¿Se cobró?" y "¿Es un fijo?", que van en un segundo PR junto con el logo del complejo en la imagen de horarios.

## Estado del código

La entrega va en dos PRs desde `main`. El primero lleva el corte (agenda con nombre gratis), la baja del tope, `/precios`, los términos, `CLAUDE.md` y `.claude/rules/billing-precio.md`. El segundo lleva los avisos y la imagen. La columna `tenants.online_cap_month` queda sin uso; borrarla es una migración aparte.
