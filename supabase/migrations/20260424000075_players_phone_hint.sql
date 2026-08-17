-- 075 — `players.phone_hint8`: la cola de 8 dígitos del teléfono, materializada.
--
-- POR QUÉ UNA COLUMNA Y NO UN ÍNDICE DE EXPRESIÓN
--
-- La lista de Personas (/jugadores, B13) sugiere vincular a un titular de turno
-- fijo sin cuenta con el jugador registrado cuyo teléfono termina igual. El JOIN
-- comparaba una EXPRESIÓN sobre `players.phone`
-- (`RIGHT(REGEXP_REPLACE(phone,'\D','','g'), 8)`), que ningún índice de columna
-- puede resolver.
--
-- El paso obvio sería un índice de expresión. No sirve, y está medido: es el
-- mismo hallazgo que la migración 054 documentó para los índices en ART.
-- `regexp_replace` no es LEAKPROOF, y con RLS encima el planner NO baja una
-- función no-LEAKPROOF a Index Cond — la deja como Filter y vuelve al plan malo.
--
-- Medición con el rol REAL `turnogol_app` (5.000 jugadores, 800 turnos fijos sin
-- cuenta, un solo complejo):
--
--     hoy, con la expresión en el predicado ....... 52.341 ms
--     + índice de expresión sobre esa expresión ... 52.708 ms  (ni lo mira)
--     + esta columna generada e indexada .......... 14,2 ms
--
--     control negativo: la MISMA query con el MISMO índice de expresión,
--     corrida como superusuario (sin RLS) .......... 21,6 ms
--
-- O sea: no era el índice, era quién lo consultaba. Una COLUMNA no es una
-- llamada a función, así que RLS no tiene nada que bloquear y el Index Cond
-- vuelve a aparecer.
--
-- Además de lento, era un límite duro: `turnogol_app` tiene
-- `statement_timeout = 15s` (migr. 055), así que a ese volumen la pantalla no
-- iba a ir lenta — iba a fallar con error.
--
-- La expresión de acá tiene que decir lo MISMO que `suggestionPhoneSql()` en
-- src/modules/relationships/contact-identity.ts; el test de integración
-- `contact-identity.test.ts` compara los dos caminos y se pone rojo si se
-- separan. El `COALESCE` está porque `phone` es nullable y la expresión de una
-- columna generada tiene que ser total.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS phone_hint8 text
  GENERATED ALWAYS AS (
    CASE
      WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone, ''), '\D', '', 'g')) >= 8
      THEN RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\D', '', 'g'), 8)
    END
  ) STORED;

COMMENT ON COLUMN players.phone_hint8 IS
  'Últimos 8 dígitos del teléfono (NULL si no llegan a 8). Materializada para que el JOIN de sugerencia de /jugadores use índice bajo RLS. Espejo de suggestionPhoneSql().';

-- Parcial: las filas sin teléfono utilizable no se sugieren nunca, así que no
-- tienen por qué ocupar el índice.
CREATE INDEX IF NOT EXISTS idx_players_phone_hint8
  ON players (phone_hint8)
  WHERE phone_hint8 IS NOT NULL;
