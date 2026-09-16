-- ============================================================
-- 087_abonados_evento_gratis_sin_telefono.sql
-- D1 de docs/decisions/2026-09-15-evento-repetible-edicion-y-cobro-parcial.md
--
-- El Evento de la grilla se repite "cada semana" creando un abonado (mismo
-- camino que Turno fijo: createAbonadoAction, sesiones type='fixed'). Pero
-- un Evento puede ser una escuelita GRATIS (price_per_session=0) y su
-- responsable puede no tener teléfono a mano al cargarlo — a diferencia de
-- Turno fijo, que sigue pidiéndolo en la UI. abonados (004_isolated_tables.sql)
-- todavía exige las dos cosas:
--   * chk_abonado_price_positive: price_per_session > 0
--   * contact_phone TEXT NOT NULL
--
-- Se recrea el CHECK de precio como >= 0 (mismo patrón que chk_price_positive
-- en bookings, que ya acepta 0 para el evento de N horas "No se cobra") y se
-- afloja contact_phone a nullable. El teléfono NO se vuelve opcional en
-- Turno fijo ni en /abonados/nuevo: esos formularios lo siguen exigiendo en
-- la UI, esto solo destraba el CHECK de la base para el camino nuevo.
-- ============================================================

ALTER TABLE abonados
  ALTER COLUMN contact_phone DROP NOT NULL;

ALTER TABLE abonados
  DROP CONSTRAINT chk_abonado_price_positive;

ALTER TABLE abonados
  ADD CONSTRAINT chk_abonado_price_non_negative CHECK (price_per_session >= 0);
