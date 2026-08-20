-- 078 — `tenant_subscriptions.mp_payer_email`: con qué cuenta de MercadoPago
-- paga el complejo su suscripción, desacoplado del email de login.
--
-- POR QUÉ
--
-- `subscribe()`/`reactivate()` mandaban a MP el email del dueño leído de
-- `staff_users` (el de login). MP exige que ese `payer_email` tenga una cuenta
-- real ("Both payer and collector must be real or test users") y el mensaje de
-- error ofrecía dos salidas: crear una cuenta de MercadoPago con ese email, o
-- cambiar el email de la cuenta de TurnoGol.
--
-- La segunda puede estar CERRADA, y por un camino natural, no raro (reproducido
-- en producción 2026-08-19): la persona probó TurnoGol como jugadora con su
-- email real (fila en `players` + `auth.users`), después abrió su complejo con
-- OTRO email, y su cuenta de MercadoPago es la del primero. Cambiar el email
-- del staff a ese falla — `auth.users.email` es único y ya lo ocupa su propio
-- registro de jugadora. El dueño queda encerrado: el error le dice qué hacer y
-- la app no lo deja hacerlo.
--
-- Son dos cosas distintas que estaban pegadas: con qué identidad entra a
-- TurnoGol y con qué cuenta paga. La API de MP acepta cualquier `payer_email`
-- (es obligatorio, pero no tiene por qué ser el de login), así que el arreglo
-- barato es declararlo, no unificar identidades (eso tocaría `auth.users`,
-- `app_metadata` y la RLS dual — descartado por el dueño 2026-08-19).
--
-- NULL = usar el email del dueño. Sin backfill a propósito: el default correcto
-- para todos los complejos existentes es el que ya venían usando.

ALTER TABLE tenant_subscriptions ADD COLUMN mp_payer_email TEXT;

COMMENT ON COLUMN tenant_subscriptions.mp_payer_email IS
  'Email de la cuenta de MercadoPago con la que el complejo paga la suscripción SaaS. NULL = se usa el email del dueño (staff_users). Desacoplado del email de login a propósito (migr. 078).';
