# Ledger — visita a El Vagón (2026-11-07)

Decisión: [`docs/decisions/2026-11-07-cobrar-varios-y-dar-por-perdido.md`](../decisions/2026-11-07-cobrar-varios-y-dar-por-perdido.md)

| Paso | Dónde | Estado |
|---|---|---|
| 0. Registrar observación y decisión | rama `worktree-dar-por-perdido` | hecho |
| A. Dar por perdido | rama `worktree-dar-por-perdido` | en curso |
| B. Cobrar varios | sesión aparte (`cobrar-varios`) | propuesta |
| C. Copys: tabla para aprobar | sesión aparte (`copys-tabla`) | propuesta |
| C. Copys: aplicar | después de A y B | pendiente |

## Delegaciones

| Agente | Finalidad | Costo aprox. | Resultado |
|---|---|---|---|
| Explore ×3 | mapa de cobro, saldo/métricas y copys | ~500k tokens | cobro reutilizable por tarjeta; causa de métricas = auto-credit 24 h; ~80 textos marcados |
| architecture-decision-reviewer | revisar tabla `booking_write_offs` | ~170k tokens | aprobada con cambios: no_show borra, releer bajo lock, trampa del JOIN en `sumBookingChargesByBooking`, ~20 sitios |
| sonnet-implementer | backend de Dar por perdido | ~255k tokens | 48 archivos, juez + unit verdes; integración/aislamiento sin correr (Docker apagado) |
| sonnet-implementer | UI de Dar por perdido | ~170k tokens | botón, confirmación, deshacer, Perdido en Grilla/modal/reservas, Cuentas y Analíticas; CourtBoard y BookingCharges los arreglé yo |
| sonnet-adversarial-reviewer | revisar Dar por perdido | ~155k tokens | aprobado con reservas: 3 🟡 (carrera auto-credit, "Cobrado ✓" en Hoy días anteriores, perfil del jugador) arreglados acá + deshacer limitado a 15 min en servidor; leyenda de la grilla sin tocar (la eligió el dueño) |
| tests integración | aplicar 108 y correr suite | — | 1687/1695 verdes; arreglados: REVOKE UPDATE en la 108 y cleanup de seed-e2e; queda rojo push-send-idempotency (ajeno, viene del #572) |
