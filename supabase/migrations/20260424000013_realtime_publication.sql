-- ============================================================
-- 013_realtime_publication.sql
-- Versiona la membresía de `bookings` en la publication
-- `supabase_realtime` (requisito de postgres_changes para la grilla admin).
--
-- Antes estaba habilitado SOLO vía dashboard Supabase (no versionado): un
-- re-provision o un staging nuevo caería a polling 30s silenciosamente,
-- rompiendo el done-criteria "<2s" sin error visible. Esto lo versiona
-- idempotentemente.
--
-- GUARDED: en plain-postgres CI (postgres:15-alpine, sin `supabase start`)
-- la publication `supabase_realtime` no existe -> el bloque se saltea sin
-- error. En Supabase real la publication existe y se agrega la tabla si
-- aún no es miembro (idempotente).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'bookings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
    END IF;
  END IF;
END $$;

-- REPLICA IDENTITY FULL: hace que los payloads de UPDATE/DELETE de
-- postgres_changes incluyan la fila `old` completa (no solo la PK). El
-- handler de DELETE del hook filtra por `old.date`; sin esto el DELETE se
-- ignora. v1 no borra bookings (cancela vía UPDATE), pero es defensa barata
-- y deja el realtime semánticamente completo. Idempotente.
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
