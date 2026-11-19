# Planes y servicios de TurnoGol, para vender

**Fecha:** 2026-11-19 · **Qué es:** inventario de lo que ofrece cada plan y cuánto cuesta, armado para pensar cómo vender TurnoGol ahora que es freemium. No es una decisión: es una foto verificada contra el código. Si algo cambia, mandan [`2026-11-15-freemium-corte-v2.md`](../decisions/2026-11-15-freemium-corte-v2.md), [`2026-11-16-se-vende-gratis-prueba-14-dias.md`](../decisions/2026-11-16-se-vende-gratis-prueba-14-dias.md), [`billing-precio.md`](../../.claude/rules/billing-precio.md) y el código.

La regla en una frase: **gratis es quién juega; el plan es quién pagó.**

## Precios

| | Gratis | Completo | Completo + WhatsApp |
|---|---|---|---|
| Mensual, por cancha | $0 | $30.000 | $45.000 |
| Anual, por cancha por mes (10% off) | n/a | $27.000 ($324.000 al año) | $40.500 ($486.000 al año) |
| Ejemplo con 3 canchas, mensual | $0 | $90.000 | $135.000 |

- La primera cancha ya se paga. Sin techo ni bandas, sin comisión por reserva, mes a mes, sin prorrateo. Los cambios de cantidad rigen desde el próximo período.
- El Plus de WhatsApp es $15.000 por cancha por mes de lista. En el anual el 10% se aplica a la suma plan + Plus.
- **Prueba:** el alta trae 14 días del Completo (`TRIAL_DAYS = 14`). Al vencer baja a Gratis sin perder lo anotado. Afuera no se anuncia la prueba: se vende "gratis".
- **Mora:** a los 7 días pasa a solo lectura, a los 14 baja a Gratis. No se bloquea.
- **Referido:** el premio es 1 mes del Completo.

## Plan Gratis

**Tiene:**

- Canchas sin límite. Crea, edita, activa y desactiva canchas, sube fotos y puede ocultar los precios al público.
- Reservas online **sin tope** desde un link propio. El jugador no baja ninguna app. Reserva sin seña y paga en el complejo.
- Página pública del complejo, con aparición en el buscador (`/explorar`), en RIVAL y en el sitemap/SEO.
- Grilla con **turnos de 1 hora**, anotando nombre y teléfono. Puede corregir esos dos datos después.
- Marcar un turno como completado o "no vino" (y revertirlo), cancelarlo y liberar bloqueos.
- Bloqueos con tres motivos fijos: Ocupado, Mantenimiento y Cancha cerrada.
- Pantalla "Hoy", sin cobros ni pendientes de plata.
- Aviso push al dueño cuando entra una reserva online (respeta el horario silencioso de 00 a 08).
- Imagen de horarios libres para la historia, con el logo de TurnoGol.
- Métricas mínimas: cuántas reservas online hubo en el mes.
- Ajustes: reservas por internet, horarios, página pública, notificaciones, bajar tus datos e invitar a otro complejo.
- Soporte con ayuda escrita y en video (según la decisión; no figura en `/precios`).
- No vence.

**No tiene:**

- **Turnos fijos.** Se anotan a mano cada semana. El panel avisa "¿es un fijo?" cuando el mismo turno repite tres semanas.
- **Caja, cantina y consumos.** Tampoco cobros, "no cobrado" ni deudas.
- **Precio, notas y seña** en el turno.
- **Eventos de varias horas** y mover o reprogramar turnos.
- **Clientes y etiquetas.** Tampoco vincular un jugador al turno.
- **Encargado.** Solo entra el dueño.
- **Seña con MercadoPago.**
- **Asistente de WhatsApp.**
- **Métricas completas** y logo del complejo en la imagen de la historia.

**Condiciones del Gratis:**

- Si el dueño cancela 5 reservas online en el mes, se pausan las reservas online hasta que confirme (la página pasa a WhatsApp/Llamar).
- 6 meses sin uso: aviso por mail y borrado a los 90 días.
- Las condiciones pueden cambiar con 30 días de aviso.

## Plan Completo (todo lo del Gratis, más)

- **Plata en el turno:** precio, seña manual, cobrar, "no cobrado", deudas y registro de devoluciones. Las devoluciones las hace el complejo, TurnoGol solo las registra.
- **Turnos fijos:** se cargan una vez y se generan solos todas las semanas, con control de quién pagó. También se pueden importar.
- **Caja:** Cuentas y Productos, cierre del día con arqueo, gastos, cantina con stock y venta desde Hoy. Los consumos se anotan al turno y se cobran junto con la cancha.
- **Clientes:** personas, historial, stats, ausencias y 5 etiquetas cerradas. No hay texto libre sobre personas.
- **Encargado:** segundo usuario con rol `manager`. Ve Hoy, grilla, reservas, caja y jugadores, pero no Ajustes ni Métricas.
- **Grilla ampliada:** eventos de N horas con precio editable o "no se cobra", y mover o reprogramar turnos.
- **Notas** internas y para el jugador.
- **Seña online con MercadoPago:** opcional, viene apagada (30% por defecto). La plata va directo al complejo.
- **Métricas completas** de ocupación y facturación, con motivos de cancelación.
- **Logo del complejo primero** en la imagen de la historia.
- **Soporte por WhatsApp.**
- **Protección contra el que no viene:** `/precios` lista que el que reserva online y reincide queda 14 días sin poder reservar. Para quien cancela tarde sin seña hay una escalera de avisos y bloqueos.

## Plan Completo + WhatsApp (todo lo del Completo, más)

- Un asistente con IA atiende el WhatsApp del complejo, muestra turnos libres y toma reservas a cualquier hora.
- Responde con los horarios y precios reales del complejo.
- Se enchufa por coexistencia (Kapso), sin cambiar de número.
- Se apaga solo si el complejo baja a Gratis.
- Es solo el bot: sin mensajes masivos ni recordatorios por WhatsApp.

## Lo que no cierra (revisar antes de vender)

1. **Cancelar tarde y ausencias en Gratis.** La tabla de la decisión del 15/11 dice que Gratis no tiene penalidad por cancelar tarde, y `/precios` pone el ban por ausencias en Completo. En el código ninguna de las dos cosas está cerrada: `late_cancel_hours` se guarda sin chequear el plan (`src/app/(admin)/settings/reservas/actions.ts`) y `markNoShowAction` está abierta para Gratis (`src/app/(admin)/reservas/actions.ts`). No venderlas como exclusivas del Completo sin decidir si se cierran.
2. **Plus en el anual.** La tarjeta de `/precios` muestra "Completo + $15.000/mes" a precio de lista. El cobro real aplica el 10% a la suma, así que el Plus sale $13.500 por cancha en el anual ([`pricing.ts`](../../src/modules/billing/pricing.ts)).
3. **Docs viejos.** [`2026-11-08-freemium.md`](../decisions/2026-11-08-freemium.md) habla de 20 reservas de tope y 30 días de prueba. Hoy es sin tope y 14 días.
4. **Sin verificar:** si el resumen semanal por mail y el recordatorio push al jugador (24 h y 2 h antes) dependen del plan.

## Qué no existe, para no prometerlo

- Torneos: detrás de un flag apagado.
- Canchas divisibles: pausadas, sin implementar.
- Facturación AFIP.
- Billetera virtual del jugador.
- Reembolso automático por API.
- Mensajes masivos por WhatsApp.

## De dónde sale cada cosa

- Qué abre el Gratis: la lista cerrada de [`allow-free-guard.test.ts`](../../tests/unit/allow-free-guard.test.ts), los guards de [`staff/guards.ts`](../../src/modules/staff/guards.ts) y [`free-plan-block.ts`](../../src/modules/bookings/free-plan-block.ts).
- Qué muestra `/precios`: `PlanSelector.tsx` y `page.tsx` en `src/app/(business)/precios/`.
- Visibilidad en buscador y RIVAL: `VISIBLE_TENANT_STATUSES` en [`search.service.ts`](../../src/modules/tenants/search.service.ts).
- Navegación del panel y qué ítems pide el plan: [`admin-sidebar.tsx`](../../src/components/layout/admin-sidebar.tsx).
