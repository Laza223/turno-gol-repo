# Competencia frente al freemium — relevamiento del 2026-11-15

Actualiza `2026-09-01-competidores-v2.md` y la tabla de §6 de `docs/visibilidad-ia/02-estrategia.md` (30/10). Se hizo después de la decisión del freemium ([`docs/decisions/2026-11-08-freemium.md`](../../decisions/2026-11-08-freemium.md)): hasta acá la comparativa asumía un único plan pago de $30.000 por cancha.

**Método.** Se leyeron las páginas oficiales con el navegador integrado de la app, el 15/11/2026. La geolocalización no se verificó. Las respuestas desplegables de los FAQ no se abrieron.
**Etiquetas.** `LEÍDO` = visto en la página oficial el 15/11. `TERCERO` = sale de una comparativa ajena (Orbyta Canchas, 30/9/2026, de un competidor), sin re-verificar. `NO VERIFICADO` = lo que no se pudo confirmar.

## 1. Qué es TurnoGol hoy

Según `origin/main` del 16/11 (#586, #587 y #603) y las decisiones [`2026-11-08-freemium.md`](../../decisions/2026-11-08-freemium.md) y [`2026-11-15-freemium-corte-v2.md`](../../decisions/2026-11-15-freemium-corte-v2.md). El 15/11 se leyó [turnogol.app/precios](https://turnogol.app/precios) con la versión anterior del Gratis (tope de 20 reservas online por mes y "ocupado" sin nombre); el corte v2 la reemplazó y no se re-leyó el sitio después.

| Plan | Precio | Qué trae |
|---|---|---|
| **Gratis** | $0, sin vencimiento | Buscador de TurnoGol y RIVAL; reservas online sin tope; agenda con nombre y teléfono, sin tope; fijos a mano; métricas con el resumen del mes. Sin precio ni cobros, caja, cantina, jugadores, encargado, seña ni bot |
| **Completo** | $30.000 por cancha, incluida la primera | Reservas sin tope, turnos con nombre y precio, fijos, caja y cantina, jugadores, encargado, métricas, soporte por WhatsApp, seña opcional |
| **Completo + WhatsApp** | +$15.000 por cancha | Lo de Completo más el asistente de WhatsApp |

Todos arrancan con 30 días de Completo sin tarjeta. Si no se paga, se baja a Gratis (no a `blocked`). Las condiciones del Gratis pueden cambiar con 30 días de aviso.

## 2. Fichas (`LEÍDO` el 15/11)

| Sistema | Precio publicado | Prueba | Lo que se ve |
|---|---|---|---|
| **Vibe** (vibe.com.ar) | **$0 para el complejo.** El cargo de servicio lo paga quien reserva (monto no publicado en la home; el 30/10 figuraba $1.000 por pago online) | Sin tarjeta ni contrato | Multi-deporte. Caja por turno con arqueo, bar con stock, reportes con Excel mensual, seña por MercadoPago, recordatorio automático antes del turno, base de clientes con asistencia. En la home no figuran turnos fijos ni cobro por equipo |
| **CanchaFija** | $10.000 (1 cancha), $18.000 (3), $25.000 (6), $50.000 (10), $60.000 (15) | 1er mes gratis | "Hasta 100% OFF cobrando online": los cobros online verificados acumulan descuento en la renovación. Falta Uno, Competiciones, Escuelitas, Para Profesores, directorio |
| **ATC** | $71.000 (1-3), $111.000 (4-6), $145.000 (7+); anual 20% menos ($57.000, $89.000, $116.000) | 1 mes | "Hablar con ventas". Control de acceso, caja y stock, filmación (Beelup), soporte 24/7, "Ventas 24/7" |
| **DeporTurnos** | $29.999 (1-3), $59.999 (4-6), $89.999 (7+); anual −25% | 1 mes sin tarjeta | Pádel, tenis y fútbol 5 a 11. Todo en todos los planes: torneos, circuitos, planes de socios, cámaras, stock y buffet, caja, recordatorios. Redes armadas (turnos libres y resultados). Grilla con arrastre, canchas divisibles, fijos. Dice 12 complejos y 6.670 jugadores |
| **Cancheria** (cancheria.com) | Agenda $69.000, Ecosistema $89.000 (ejemplo de 3 canchas); sale de la cantidad de canchas. Pagando cada 6 meses −10% | 14 días sin tarjeta | Asistente que contesta y anota turnos (con créditos), lista de espera, buffet, torneos. "El que reserva paga la cancha y nada más". Un mes de regalo por referido |
| **Complejo** (complejo.ar) | $59.000 (1-3), $99.000 (4-6), $119.000 (7+), con IVA incluido y factura electrónica; anual −20% | 14 días sin tarjeta | 36 funciones en todos los planes: fijos, cuenta de cada turno, caja y cantina, web propia, "Tito" (WhatsApp), club de puntos. Se compara contra ATC |
| **Clubo** (clubo.com.ar) | $25.000 por cancha de fútbol; $19.000 por cancha de otros deportes; anual −20% | 1 mes | Seña por MercadoPago, bot de WhatsApp, sin app para reservar |

Supuesto sin verificar: que "Cancheria" sea la misma "Canchería" que el founder usó de referencia para el onboarding.

## 3. Precio del plan pago, por mes (ARS)

| Canchas | TurnoGol | Clubo | ATC | Complejo | DeporTurnos | CanchaFija | Vibe |
|---|---|---|---|---|---|---|---|
| 3 | $90.000 | $75.000 | $71.000 | $59.000 | $29.999 | $18.000 | $0 |
| 6 | $180.000 | $150.000 | $111.000 | $99.000 | $59.999 | $25.000 | $0 |

Cancheria a 3 canchas: $69.000 o $89.000. A 6 no se leyó. `TERCERO` (30/9, sin re-verificar): Canchero $49.999, CanchaManager $49.000 y $99.000, Clubin $45.000 (1-3), CanchaLibre $35.000, Devolea $29.999 a $69.000.

El precio de TurnoGol es lineal por cancha y sin techo (decisión del 8/11, riesgo asumido): a 3 canchas es el más alto de los leídos, y a 6 canchas es el más alto con holgura.

## 4. El Gratis de TurnoGol contra el $0 de Vibe

| | TurnoGol Gratis | Vibe |
|---|---|---|
| Costo para el complejo | $0 | $0 |
| Costo para el jugador | $0 | Cargo de servicio por pago online |
| Reservas online | Sin tope | Sin tope publicado |
| Anotar turnos con nombre y teléfono | Sí | Sí |
| Caja con arqueo, bar con stock, reportes | No (plan pago) | Sí |
| Seña por MercadoPago | No (plan pago) | Sí |
| Turnos fijos y cobro por equipo | No (plan pago) | No figuran en su home |
| Aparecer en buscador propio y RIVAL | Sí | No visto |

`INFERENCE`: con el corte v2 el Gratis de TurnoGol es agenda y vidriera (turnos con nombre, mapa y reservas online); el de Vibe suma además la plata (caja, bar, reportes, seña). El dueño que quiere caja y bar sin pagar hoy encuentra eso en Vibe.

Los demás no tienen Gratis: dan 1 mes o 14 días de prueba. CanchaFija es lo más parecido a gratis por el descuento de renovación cobrando online. No se vio publicado en ninguno qué pasa al vencer la prueba, salvo Vibe, que no vence. (`TERCERO`: Turnito y ReservaSimple tienen plan gratis con tope de reservas por mes.)

## 5. Pros de TurnoGol frente a los multi-deporte

- **Sin cargo al jugador** en ningún plan (Vibe lo cobra; `TERCERO`: Canchero cobra 3%).
- **Prueba al revés:** al vencer los 30 días se baja a Gratis y se sigue en el mapa.
- **Cobro por equipo, precio por jugador y día operativo** (turno de la 1 AM en la noche que arrancó): ninguno lo menciona en lo leído.
- **Regla de no-show automática y pública:** 2 faltas en 90 días dejan 14 días sin reservar online (`src/shared/constants.ts:42-48`). Otros sancionan a mano o prometen porcentajes.
- **Fijos que se repiten solos**, caja y cantina integradas con la noche, `/jugadores` y etiquetas.
- **Self-service:** alta sin hablar con ventas (ATC pasa por "Hablar con ventas"; Clubo cierra por WhatsApp).
- **Solo fútbol** (segmentación; no hay evidencia de que el dueño la pague más).

## 6. Dónde pierde

- **Precio del plan pago** desde 3 canchas (sección 3).
- **Vibe** regala la parte operativa (caja, bar, reportes) que TurnoGol cobra.
- **DeporTurnos** incluye torneos, cámaras, socios y contenido para redes en todos los planes, por menos.
- **Distribución:** el Gratis vale si hay jugadores en la zona. ATC dice más de 2M de usuarios; DeporTurnos concentró 6.670 jugadores en una ciudad.
- **Bot de WhatsApp:** Clubo, Cancheria y Complejo lo ofrecen; en TurnoGol es el plan más caro.

## 7. Discrepancias con documentos anteriores

Las cinco se corrigieron en el lugar: Clubo el 15/11 y el resto el 16/11, por decisión de Lazar.

| Dónde | Decía | Hoy |
|---|---|---|
| `visibilidad-ia/02-estrategia.md` §6, `01-auditoria.md` y `03-plan` | Clubo "no existe dominio ni producto" | Existe en [clubo.com.ar](https://www.clubo.com.ar/), con precio publicado. **Corregido.** |
| `visibilidad-ia/02-estrategia.md` §3, fila de Plus | "Raro en el rubro" | Clubo, Cancheria y Complejo tienen bot o asistente de WhatsApp. **Corregido.** |
| `visibilidad-ia/02-estrategia.md` §3, fila de RIVAL | Un multideporte genérico no lo tiene ("No") | ATC, CanchaFija y Dónde Juego tienen Falta Uno o convocatoria. Lo propio de RIVAL es el partido oficial club contra club; que ninguno lo tenga no está verificado. **Corregido.** |
| `visibilidad-ia/02-estrategia.md` §3 (tabla de precios) y §6 | ATC USD 50, 80 y 100 | La página leída el 15/11 muestra ARS ($71.000, $111.000, $145.000), igual que el 2/9. El USD salió de búsquedas desde EE.UU. (30/10): puede depender del país del visitante, no verificado. **Corregido.** |
| `visibilidad-ia/01-auditoria.md` fila 23 | Precio vigente $30.000 por cancha como único plan | Hay tres planes desde el 8/11 (sección 1). **Corregido.** |

**Sin tocar a propósito:** los informes fechados de `visibilidad-ia/turnogol.app-audit/` (`FULL-AUDIT-REPORT.md:183`, `findings/sxo.md:60` y `:118`, `findings/content.md:109`) repiten ATC en USD con fecha 2/11. Son una foto de esa auditoría. Si se publica un precio de ATC, releer la fuente con fecha antes (como ya dice `findings/cluster.md:257`).

## 8. Qué no se verificó

- Korus, Canchero, CanchaManager, Clubin, CanchaLibre, Devolea, Turnito, ReservaSimple, Dónde Juego y EasyCancha: no se releyeron hoy.
- El monto actual del cargo de servicio de Vibe.
- Las respuestas de los FAQ (qué pasa al vencer la prueba o atrasarse con el pago) de cada sitio.
- Si algún competidor incluye IVA (solo Complejo lo dice).
- Cuántos complejos tiene cada uno.

## Fuentes (leídas el 15/11/2026)

- [Vibe](https://vibe.com.ar/) y [su guía contra ATC](https://vibe.com.ar/guias/vibe-o-atc-sports-en-que-se-diferencian) (actualizada 8/10)
- [CanchaFija, precios](https://canchafija.com.ar/precios)
- [ATC, precios](https://atcsports.io/software-gestion-deportiva)
- [DeporTurnos, complejos](https://deporturnos.com/complejos)
- [Cancheria](https://cancheria.com/)
- [Complejo, precios](https://complejo.ar/precios)
- [Clubo](https://www.clubo.com.ar/)
- [Orbyta Canchas, comparativa del 30/9](https://canchas.orbytasystems.com/comparativa-software-canchas-argentina) (`TERCERO`, es de un competidor)
- [TurnoGol, precios](https://turnogol.app/precios)
