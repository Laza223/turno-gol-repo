# Prueba de 30 días sin freemium, precios y recordatorio al jugador

Fecha: 2026-11-27. Decisor: Lazar, en el chat. **El código todavía no refleja estas decisiones**: aplicarlas es una tarea aparte.

## 1. Sin freemium, prueba de 30 días

1. Se termina el plan gratis. Cada complejo tiene 30 días de prueba y después paga.
2. Al vencer la prueba el complejo pasa a un estado nuevo, `trial_expired`: ficha pública sin horarios, panel en solo lectura (salvo operar las reservas ya confirmadas), bot mudo, al final del buscador. Con un control del superadmin para despublicar y registro de los clics de contacto para recuperar al cliente.
3. Copy: "Probalo 30 días gratis, sin tarjeta" está habilitado. "Sin permanencia" está prohibido; usar "cancelás cuando querés" o "sin contratos".

Supera a [`2026-11-08-freemium.md`](2026-11-08-freemium.md), [`2026-11-08-freemium-spec-y-estado-free.md`](2026-11-08-freemium-spec-y-estado-free.md), [`2026-11-15-freemium-corte-v2.md`](2026-11-15-freemium-corte-v2.md) y [`2026-11-16-se-vende-gratis-prueba-14-dias.md`](2026-11-16-se-vende-gratis-prueba-14-dias.md).

Hoy en el código: `TRIAL_DAYS = 14`, estado `free`, `isFreePlan()` / `allowFree`, `transitionToFree`.

## 2. Precios

- **Plan:** rige la fórmula por cantidad exacta de canchas de [`2026-11-23-precio-por-cantidad.md`](2026-11-23-precio-por-cantidad.md). Sin cambios.
- **Bot de WhatsApp:** $50.000 por mes fijo por complejo, tenga las canchas que tenga. Es provisorio: se están evaluando los costos. Reemplaza la columna "Asistente" de la tabla del 23/11. Hoy `pricing.ts` todavía cobra esa escala.

Esta decisión no cambia el monto de ninguna suscripción ya autorizada.

## 3. Recordatorio de turno al jugador

Deja sin efecto el punto 5 de [`2026-11-16-push-urgente-permiso-y-recordatorio-jugador.md`](2026-11-16-push-urgente-permiso-y-recordatorio-jugador.md) como regla de producto de la web: viene la app oficial de TurnoGol para iOS y Android, y el recordatorio queda anotado como idea para esa app ([`../planning/2026-11-27-app-nativa-ideas.md`](../planning/2026-11-27-app-nativa-ideas.md)). El worker `player-reminders` sigue en el código; apagarlo o no es una decisión pendiente. El resto de la decisión del 16/11 no cambia.

## 4. Detalle de `trial_expired` (decidido el mismo día, por select)

1. **Las tres salidas del pago van al mismo estado.** Prueba vencida, mora terminada (7 + 14 días) y baja voluntaria al terminar el período pagado pasan a `trial_expired`. El banner cambia el texto: "venció tu prueba" si nunca pagó, "tu plan no está activo" si pagó alguna vez.
2. **Los complejos que hoy están en `free` pasan a `trial_expired` sin mail.** El aviso se dio por otro canal.
3. **Las pruebas en curso se extienden a 30 días** desde el alta. Las altas nuevas traen 30 (`TRIAL_DAYS`).
4. **Nunca se borran** canchas, precios, fotos, configuración ni historial de un complejo en `trial_expired`. Sale del borrado por inactividad que tenía el gratis.
5. **Despublicar** reusa `tenants.marketplace_visible` (superadmin): saca al complejo del buscador, del sitemap y de RIVAL. La ficha sigue por su link.
6. **Clics de contacto** de fichas vencidas (WhatsApp o teléfono) van a `analytics_events`, sin datos personales. Sin PostHog por ahora.
7. **Solo lectura con una excepción:** se pueden operar las reservas ya confirmadas (dar por jugado, ausente, cobrar, cancelar, devolver). No se crean turnos ni se toca la configuración. El bot no contesta.

## Estado del código

La entrega va en tres PRs: la migración 118 (agrega el valor, sola en su archivo), el código, y la migración que pasa las filas de `free` a `trial_expired` cuando el código ya está en producción.
