-- Verificación de mail propia del dueño (alta por toques): el registro ya no espera
-- la confirmación de GoTrue, así que el mail se prueba con nuestro token.
-- NULL en email_verified_at = "No verificado". Solo limita activar el plan y invitar al equipo.
ALTER TABLE staff_users
  ADD COLUMN email_verified_at timestamptz,
  ADD COLUMN email_verify_token_hash text,
  ADD COLUMN email_verify_sent_at timestamptz;

-- Todas las filas existentes pasaron por la confirmación de GoTrue, el alta asistida o una invitación.
UPDATE staff_users SET email_verified_at = created_at;

-- En la base va solo el sha256 del token (32 bytes aleatorios): el hash no sirve para armar el link.
-- La policy staff_see_same_tenant_staff deja que otro staff del mismo complejo lea la fila (y por
-- ende el hash): no es un secreto útil, el link necesita el token original.
CREATE UNIQUE INDEX idx_staff_users_email_verify_token_hash
  ON staff_users (email_verify_token_hash)
  WHERE email_verify_token_hash IS NOT NULL;
