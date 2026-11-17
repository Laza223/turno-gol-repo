# Decisión: TurnoGol se vende como gratis, y la prueba del Completo baja a 14 días

**Fecha:** 2026-11-16 · **Decide:** Lazar (founder), en sesión. Es la decisión escrita que CLAUDE.md exige para cambios de lifecycle. **No cambia ningún precio.**

## Por qué

La venta titulaba "30 días gratis". El dueño leía "una prueba que se vence" y se enteraba del plan Gratis recién al final, cuando ya había decidido si le convenía o no. El freemium quedaba tapado por la frase que usan todos los competidores.

La regla en una frase: **afuera es gratis; adentro descubre el Completo y no quiere soltarlo.**

## Decisiones

1. **Afuera, TurnoGol es gratis.** La landing, `/para-complejos`, `/precios`, `/r/[code]`, el registro, la metadata, `llms.txt` y el contenido venden "gratis". No se anuncia la prueba ni la baja.
2. **El alta trae 14 días del Completo, siempre** (`TRIAL_DAYS = 14`). Adentro del panel se ve cuántos días le quedan. Al vencer baja a Gratis sin perder lo anotado.
3. **La palanca es la pérdida.** Probó los fijos que se cargan solos, los cobros, la caja y el encargado. Los avisos de 7 días y de 1 día antes del vencimiento se quedan, y nombran lo que pierde.
4. **Los que ya están probando conservan lo que tienen.** `trial_ends_at` ya está grabado: el cambio vale solo para las altas nuevas.

## Límite

"Gratis" es verdad porque el plan Gratis no vence. No se dice "todo gratis" ni "sin planes pagos". En `/precios` la tabla Gratis/Completo sigue a la vista, y los términos dicen que el alta incluye 14 días del Completo y después sigue en Gratis.

## Lo que supera o modifica

- [`2026-11-08-freemium.md`](2026-11-08-freemium.md), punto 1: los 30 días pasan a 14 y dejan de ser el titular.
- [`2026-11-15-freemium-corte-v2.md`](2026-11-15-freemium-corte-v2.md), "Lo que no cambia": la prueba al revés sigue, pero ya no dura 30 días.
- [`2026-10-22-alta-asistida.md`](2026-10-22-alta-asistida.md): el alta asistida usa los mismos 14 días.

## Lo que no cambia

- El precio: $30.000 por cancha, anual con 10% menos, asistente a $15.000 por cancha.
- El premio del referido: sigue siendo un mes (`REWARD_TRIAL_DAYS = 30`). El invitado entra como cualquier alta: gratis, con los 14 días.
- La baja a Gratis, el tope por cancha y lo demás del corte del 15/11.

## Copy del mismo día: fútbol 4 a 11

TurnoGol sirve para cualquier cancha de fútbol, desde fútbol 4 hasta fútbol 11 (`courts.format` acepta del 4 al 11). Ningún texto de venta dice "fútbol 5, 7 y 11" ni lo da a entender: es falso y achica el mercado. Cuando haga falta nombrar los formatos se dice "de fútbol 4 a fútbol 11", o "cualquier cancha de fútbol".
