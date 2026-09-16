# Ledger — Grilla: evento repetible, editar reserva, cobro parcial

**Decisión:** `docs/decisions/2026-09-15-evento-repetible-edicion-y-cobro-parcial.md`
**Rama:** `claude/dynamic-workflow-reservas-pagos-508356` (worktree)
**Orquesta:** Opus · **Ejecutan:** Sonnet (workflow)

## Contrato

- **D (diagnóstico):** causa raíz de "no se puede cobrar parcial en adelanto desde la grilla", reproducida con test.
- **A (cobro):** monto editable a la vista en los 3 modos del panel; adelanto con N líneas (`addBookingChargeAction` con `charges[]`, atómico).
- **B (evento semanal):** migr. 087 (`price_per_session >= 0`, `contact_phone` nullable); EventoForm "Una vez / Cada semana" vía `createAbonadoAction`; sesión sin jugador con nombre en la grilla.
- **C (editar):** migr. 088 (excepción del trigger con `app.booking_edit`); `editBooking` + `editBookingAction` + `BookingEditDialog` (nombre/teléfono, precio, duración).

**No se toca:** reserva online, reprogramación, fiados, alta de Turno fijo, `/abonados/nuevo`.

## Juez (inmutable)

`pnpm format:check` · `pnpm lint` · `pnpm typecheck` · `pnpm knip` + unit/integration de cada stream + `booking-price-immutability.test.ts` y `booking-reschedule.test.ts` sin regresión.

## Delegaciones

| # | Agente | Finalidad | Costo aprox. | Resultado |
|---|---|---|---|---|
| 0 | Explore ×2 | Mapa alta grilla/abonados/edición y mapa de cobros | ~510k tokens | Mapas con file:línea; "Turno fijo" ya existe como tipo; parcial escondido tras link |
