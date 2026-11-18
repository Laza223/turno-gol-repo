-- Consumos anotados al turno (docs/decisions/2026-11-17-consumos-anotados-al-turno.md).
-- Un fiado puede quedar ligado al turno donde se consumió: "2 birras" se anotan en
-- la cancha 3 de las 21 y se cobran junto con el turno. El fiado ya anota los ítems,
-- descuenta el stock al entregar y no toca la caja hasta saldarse; lo único que le
-- faltaba era saber de qué turno es.
--
-- Aditiva: columna nullable, sin backfill (los fiados existentes son de una persona).
-- ON DELETE SET NULL: borrar o anonimizar un turno no puede bloquear ni arrastrar un
-- registro de plata. El FK corre con los permisos del dueño de la tabla y no ve RLS:
-- que el turno sea del mismo complejo lo valida `createTab`.
ALTER TABLE canteen_tabs
  ADD COLUMN booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL;

-- Lo que lee el modal de cobro: los anotados abiertos de UN turno.
CREATE INDEX idx_canteen_tabs_booking_open
  ON canteen_tabs (tenant_id, booking_id)
  WHERE status = 'open' AND booking_id IS NOT NULL;
