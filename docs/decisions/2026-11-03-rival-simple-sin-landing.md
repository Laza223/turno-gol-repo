# Decisión: RIVAL simple, sin landing y entrando por lo que necesitás

**Fecha:** 2026-11-03. **Decide:** Lazar (founder), después de usar la app, con tres preguntas cerradas.

**Por qué:** en palabras del dueño, RIVAL "no se entiende qué es". Además le falta intuición: no reconoce la intención del usuario con sentido común, y le falta limpieza, menos ruido y orden.

**Lo que se vio en el código** (`origin/main` `d84b2a6a`):
- `/rival` es una landing de 10 escenas con scroll (GSAP). Casi todas dicen "Próximamente": club, categorías, Corona, tapa, cancha y Temporada Cero. Vende lo que viene, no lo que hoy se puede hacer.
- Hoy se pueden hacer dos cosas: el link del partido para el grupo, con "Voy", y el tablón.
- Armar lleva tres tiempos: crear el partido, después "Publicar en el tablón" en otra pantalla y ahí adentro el WhatsApp.
- El tablón calcula "Faltan N" como `capacity − confirmed_count`. Si los amigos del organizador no tocan "Voy" con su cuenta, el tablón dice que le faltan todos.

**Enmienda:**
- [`docs/rival/landing.md`](../rival/landing.md): las decisiones 1, 2 y 4 y todo el documento, que queda como archivo;
- [`2026-10-28-rival-bienvenida-y-tablon-despues-de-crear.md`](2026-10-28-rival-bienvenida-y-tablon-despues-de-crear.md): la decisión 3;
- [`2026-11-01-rival-copys-auditoria.md`](2026-11-01-rival-copys-auditoria.md): las decisiones 1, 9 y 10;
- [`2026-10-22-rival-v1.md`](2026-10-22-rival-v1.md): la decisión 1, en la forma de publicar.

Lo que no se nombra acá sigue igual. La visión de [`docs/rival/README.md`](../rival/README.md) y la decisión del [2026-10-29](2026-10-29-rival-cultura-de-turnogol.md) siguen vigentes como rumbo: cambia qué se muestra en la app, no hacia dónde va RIVAL.

## Decisiones

1. **Se saca la landing.** `/rival` pasa a ser el tablón.
   - `/rival/tablon` redirige a `/rival` y conserva `complejo` y `despues`, porque hay links compartidos.
   - La app no muestra nada "Próximamente". La visión vive en `docs/rival/` hasta que se construya cada ola, y cada ola trae su pantalla cuando existe.
   - `/rival` sigue indexable, con el título y la descripción del tablón.
2. **Se arma empezando por lo que necesitás.** El primer paso de Armar es "¿Qué necesitás?", con tres opciones:
   - **Me faltan jugadores:** sale al tablón con "Faltan N".
   - **Busco rival:** tu equipo está completo y sale al tablón como "Busca rival".
   - **Solo para mi grupo:** el link para el WhatsApp, sin tablón.

   Las dos primeras **publican al crear**, con el WhatsApp, su consentimiento y la casilla "Guardar este número" en el mismo form (las reglas de la decisión 4 del 2026-10-28 no cambian). Esto enmienda la decisión 3 del 2026-10-28: el tablón vuelve al momento de crear, pero como la intención misma y no como un interruptor. El P1 de aquella critique era sumar una segunda tarea, y acá no la hay. "Publicar en el tablón" desde la vista del partido queda solo para un partido "Solo para mi grupo" que después quiere salir.
3. **"Ya somos X" es un número.** El organizador dice cuántos le faltan aunque sus amigos no tengan cuenta.
   - Se guarda como un número de lugares cubiertos fuera de la app: `rival_matches.offline_count`, **sin contar al organizador** (ya es una fila `confirmed`; por eso, al armar, `offline_count = capacity − faltan − 1`, y en "Busco rival" `format − 1`). No guarda nombres ni ningún dato de personas.
   - "Faltan N" = `capacity − confirmed_count − offline_count`. El cupo, el banco y "Se juega" cuentan igual.
   - Las lecturas del tablón devuelven `confirmed_count` ya sumado ("lugares cubiertos") y la tarjeta dice "Ya son X de N".
   - `filled_at` solo se estampa si cierra el cupo gente de la app (un confirmado además del organizador): un "Busco rival" no nace "completo". Decisión del 2026-11-03.
   - Límite aceptado: si amigos sin cuenta tocan "Voy" por el link, se suman a los de afuera y el tablón puede mostrar "Completo" con faltantes. Se mira con uso real.
   - En "Busco rival", el equipo del capitán se da por completo.
   - Necesita una migración nueva, que aplica Lazar.

## El modelo: tres intenciones de sentido común

| Llega con… | Ve primero | Hace |
|---|---|---|
| "Me falta gente" | **Me faltan jugadores** | Arma y sale al tablón con "Faltan N" |
| "Tengo equipo, quiero jugarle a alguien" | **Busco rival** | Arma y sale al tablón como "Busca rival" |
| "Quiero jugar" | La lista del tablón | Toca un partido y "Pedir sumarme" |

**Reglas de pantalla** para todo RIVAL del jugador:
- una sola acción verde por pantalla;
- lo secundario va a un menú o debajo;
- el vocabulario de pantalla no cambia: tablón, Voy, banco, Pedir sumarme, "Falta 1" (nunca "Falta Uno").

## Copy propuesto

Se ajusta viendo pantallas; el sentido no cambia.

- **Encabezado del tablón:** "Armá tu partido o sumate a uno en los complejos de TurnoGol." Debajo van dos botones, **Me faltan jugadores** y **Busco rival**, y después la lista.
- **Paso 1 de Armar, "¿Qué necesitás?":**
  - Me faltan jugadores: "Sale al tablón para que se sumen."
  - Busco rival: "Tu equipo está completo. Sale al tablón para que alguien te juegue."
  - Solo para mi grupo: "Te damos el link para el WhatsApp. No sale al tablón."
- **"¿Cuántos te faltan?"**, con un stepper. Ayuda: "En el tablón va a decir «Faltan N»."
- **Vista del partido:** "Faltan 3 · Ya son 7 de 10", sin nombres de quienes no tienen cuenta.

## Qué no cambia

- Los vetos: sin texto libre sobre personas (Ley 25.326), sin cupos ni confirmados inventados, sin chat. El `offline_count` lo declara el organizador sobre su propio partido, igual que la capacidad; no es un número de RIVAL.
- "Ya tengo la cancha" sigue siendo obligatorio sin reserva.
- La bienvenida en dos momentos (decisiones 1, 2 y 13 a 15 del 2026-10-28).

## Cómo se ejecuta

Son cuatro PRs: este documento (PR0); `/rival` como tablón, borrando la landing y sus menciones en `DESIGN.md` (PR1); Armar por intención más la migración (PR2); y la vista del partido ordenada (PR3, después del PR2). El plan y su registro están en el ledger [`2026-10-rival-v1-ledger.md`](../planning/2026-10-rival-v1-ledger.md).
