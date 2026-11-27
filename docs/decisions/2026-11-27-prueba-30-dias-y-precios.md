# Prueba de 30 días sin freemium, precios y recordatorio al jugador

Fecha: 2026-11-27. Decisor: Lazar, en el chat. **Estado del código:** la prueba de 30 días y el precio del bot ya están aplicados; el punto 1.1 y 1.2 (sin plan gratis y `trial_expired`) faltan.

## 1. Sin freemium, prueba de 30 días

1. Se termina el plan gratis. Cada complejo tiene 30 días de prueba y después paga.
2. Al vencer la prueba el complejo pasa a un estado nuevo, `trial_expired`: ficha pública sin horarios, panel en solo lectura (salvo operar las reservas ya confirmadas), bot mudo, al final del buscador. Con un control del superadmin para despublicar y registro de los clics de contacto para recuperar al cliente.
3. Copy: "Probalo 30 días gratis, sin tarjeta" está habilitado. "Sin permanencia" está prohibido; usar "cancelás cuando querés" o "sin contratos".

Supera a [`2026-11-08-freemium.md`](2026-11-08-freemium.md), [`2026-11-08-freemium-spec-y-estado-free.md`](2026-11-08-freemium-spec-y-estado-free.md), [`2026-11-15-freemium-corte-v2.md`](2026-11-15-freemium-corte-v2.md) y [`2026-11-16-se-vende-gratis-prueba-14-dias.md`](2026-11-16-se-vende-gratis-prueba-14-dias.md).

Hoy en el código: estado `free`, `isFreePlan()` / `allowFree`, `transitionToFree`.

## 2. Precios

- **Plan:** rige la fórmula por cantidad exacta de canchas de [`2026-11-23-precio-por-cantidad.md`](2026-11-23-precio-por-cantidad.md). Sin cambios.
- **Bot de WhatsApp:** $50.000 por mes fijo por complejo, tenga las canchas que tenga. Es provisorio: se están evaluando los costos. Reemplaza la columna "Asistente" de la tabla del 23/11. Aplicado en `pricing.ts` (`PLUS_LIST_MONTHLY_CENTS`).

Esta decisión no cambia por sí sola el monto de ninguna suscripción ya autorizada: el código no toca preapprovals. El mismo 2026-11-27 Lazar confirmó por el chat que el único mandato con bot tiene que pasar al precio nuevo; se aplica a mano desde Superadmin (**Aplicar tarifa de lista**).

El precio especial del bot por complejo, cuando exista, es un monto mensual (no por cancha).

## 3. Recordatorio de turno al jugador

Deja sin efecto el punto 5 de [`2026-11-16-push-urgente-permiso-y-recordatorio-jugador.md`](2026-11-16-push-urgente-permiso-y-recordatorio-jugador.md) como regla de producto de la web: viene la app oficial de TurnoGol para iOS y Android, y el recordatorio queda anotado como idea para esa app ([`../planning/2026-11-27-app-nativa-ideas.md`](../planning/2026-11-27-app-nativa-ideas.md)). El worker `player-reminders` sigue en el código; apagarlo o no es una decisión pendiente. El resto de la decisión del 16/11 no cambia.
