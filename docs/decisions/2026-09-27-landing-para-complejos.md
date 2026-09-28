# Decisión: /para-complejos se reescribe con el posicionamiento del red team, y las dos landings se conectan

**Fecha:** 2026-09-27 · **Decide:** Lazar (founder) · **Insumos:** [red team §11.2](../gtm/TURNOGOL_MARKETING_RED_TEAM.md), [Business Map §1.6](../gtm/business-map-2026-09-01.md), [`10-aprendizajes.md`](../gtm/ejecucion/10-aprendizajes.md) (2026-09-01: los dos H1 públicos son los de la competencia; demos DEMO-1 y DEMO-2).

**Acota D4** de [`2026-09-02-experimento-30-dias.md`](2026-09-02-experimento-30-dias.md) y la frase de [`2026-09-26-referidos.md`](2026-09-26-referidos.md) "`/para-complejos` y `/precios` no cambian": el freeze sigue vigente para todo lo demás. Se libera **solo** `/para-complejos` en posicionamiento, copy, claims y diseño, más el switch entre las dos landings. **No se tocan** el precio, `/precios`, el lifecycle, la seña default ni referidos.

Se decide por urgencia comercial: octubre es el mes crítico, y `/para-complejos` es la página que ve un dueño después del contacto. Hoy le dice lo mismo que la competencia y promete cosas que nadie midió.

---

## L1 — Posicionamiento

- **Decisión:** la página vende lo que el red team fijó en §11.2.
  - **Principal:** "el sistema de señas para canchas de fútbol".
  - **Secundario:** "tu complejo con página propia".
  - **Enemigo:** la reserva de palabra.
- **Sale el H1 "Tu complejo, siempre lleno. Reservas que no paran."** Es casi literal el de Korus ("Tu complejo deportivo siempre lleno") y además promete distribución.
- **Veto que sigue:** no se vende "te traemos jugadores". La home del jugador no se usa como argumento para el dueño.
- **Vocabulario del dueño que sale de las demos:** turnos fijos, qué pasa si cancelan (el clavo) y cuánto cuesta. El trabajo que compra es control, no reemplazar al encargado. La seña se encuadra como opcional, porque un dueño la rechazó por "avara".

## L2 — Claims: solo lo que el código confirma

- **Quedan** estos hechos, verificados en código:
  - 30 días de prueba (`TRIAL_DAYS`).
  - La seña entra a la cuenta de MercadoPago del complejo.
  - El turno se libera si no pagan la seña.
  - Los avisos nocturnos llegan a las 8.
  - Soporte por WhatsApp: hoy lo atiende el founder, pero la página habla como empresa, en plural ("Escribinos", "Te ayudamos"), y el mensaje precargado no nombra a nadie (pedido del founder, 2026-09-28).
  - "Sin tarjeta, si no te sirve lo dejás": la prueba no pide tarjeta.
- **Salen:**
  - "Configurado en 20 minutos", que contradice el "menos de 2 minutos" de `/register` y ninguno de los dos está medido.
  - "Métricas en tiempo real".
  - "Integración en un click".
  - "Conectá MercadoPago" como paso 4 del alta. MercadoPago no está en el wizard: se conecta después, desde el checklist (`api/mp/callback/route.ts:297`).
  - La banda de cuatro números.
- **Los mockups** muestran el producto como es: turno de 60 minutos y rotulados como ejemplo.

## L3 — Dos landings, una por audiencia, conectadas

- **Decisión:** la home (`/`) sigue siendo del jugador y `/para-complejos` del dueño. Las une un switch "Jugadores | Complejos" en el header de las dos, y el footer tiene las dos puertas.
- **Por qué no una sola página:**
  - Jugador y dueño están en momentos distintos.
  - Partir el primer viewport en dos debilita a los dos botones principales.
- **Sin datos de tráfico:** Vercel Web Analytics no está activado. Si se quiere medir quién entra a `/`, activarlo es instrumentación permitida por D4, pero se decide aparte.

## Fuera de esta decisión

El panel lateral de `/register` promete "menos de 2 minutos" y "Cobros automáticos con MercadoPago". Queda anotado y no se toca sin OK.

Plan de ejecución: rediseño con impeccable, código primero, variantes elegidas por el founder viendo la página. Rama `feat/landing-rediseno`. El merge lo decide el founder.
