# Turnos saldados, packs por cantidad y acuerdos mensuales

**27 de noviembre de 2026.** Decisiones de producto de Lazar para los complejos que cobran por mes o por pack (escuelitas, grupos fijos, torneos de varias fechas) en vez de turno por turno. Migración 121.

## Qué se decidió

1. **Impacto en Caja.** Al registrar un mes, un pack o marcar saldado, el staff elige en el momento:
   - **Cobrar ahora en Caja**: entra un ingreso real hoy (`cash_flows`, medio simple o mixto) por el monto acordado, aunque difiera de `N x tarifa`.
   - **Ya estaba saldado**: marca los turnos como saldados sin crear ningún ingreso en Caja hoy.
2. **Cobertura de un acuerdo recurrente.** Se soportan los dos modos: por cantidad de turnos (default 4, editable) o **Todo el mes** (mes calendario elegido, cubra 4 o 5 semanas; si el fijo arranca a mitad de mes cubre desde ese día hasta fin de mes).
3. **Superficies.** Alta en la Grilla (Turno, Turno fijo, Evento) y en `/abonados/nuevo`. Gestión en `/abonados` (estado de cobertura, cobrar o saldar, editar el acuerdo), en el modal del turno (Hoy y Grilla) y en `/reservas/[id]`. Eventos de **varias fechas** y **Saldar varios** en la Grilla para lotes ya cargados. El flag `tournaments` no cambia.
4. **Cancelación y ausencia.**
   - Pack de N turnos y cancelación (con aviso): el crédito pasa solo al próximo turno sin cubrir.
   - Acuerdo mensual o ausencia (`no_show`): la fecha se consume. No extiende el mes, no traslada crédito y no genera deuda.
5. **Deshacer.** Un "Ya estaba saldado" se puede deshacer. Un saldado con plata en Caja no se borra solo: el movimiento de Caja queda como está.

## Cómo está resuelto

- Tabla `booking_settlements` (una fila por mes, pack o lote) y `bookings.settlement_id`. Un turno con `settlement_id` no debe nada: lo lee igual la Grilla, Hoy, `/reservas`, Caja y el crédito automático.
- `abonados.billing_mode` (`per_session`, `monthly`, `pack`) y `abonados.agreed_amount`. Los turnos de un fijo mensual nacen con precio 0 y se ven como "Por mes" o "Mes sin saldar", nunca como deuda.
- El ingreso de Caja lleva `cash_flows.settlement_id`, y el reporte por cancha usa la cancha del acuerdo cuando el cobro no cuelga de un turno puntual.
- Sin texto libre sobre personas (Ley 25.326): quién y cuándo salen de `created_by_staff`, `voided_by_staff` y `audit_logs`.

## Cómo se lleva con lo que ya existía

- **Dar por perdido** (migr. 108): un turno saldado no se da por perdido y uno dado por perdido no se salda. Lo imponen `writeOffBooking` y `settleBookingsBatch`; hay un test de integración.
- **Consumos anotados** (migr. 116): el cobro de un anotado sigue su propio camino (`canteen_tabs`, categoría de cantina) y no se mezcla con el saldado del turno.
- **Prueba vencida** (`trial_expired`): las acciones nuevas de crear y editar acuerdos no tienen `allowExpired`; las de saldar y cobrar tampoco. Quedan fuera de la lista de excepciones hasta decidir lo contrario.

## Para revisar

- Si la cancelación **tardía** de un turno de pack también devuelve el crédito, o solo la cancelación con aviso. Hoy devuelve en cualquier cancelación.
- Si saldar la prueba vencida debería poder hacerse (hoy no).
