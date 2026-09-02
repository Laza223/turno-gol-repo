# Decisión: experimento comercial de 30 días (caso cero + discovery)

**Fecha:** 2026-09-02 · **Decide:** Lazar (founder) · **Insumos:** [Business Map](../gtm/business-map-2026-09-01.md), [teardown competitivo v2](../gtm/research/2026-09-01-competidores-v2.md), [Billion Dollar Board](../gtm/board/2026-09-02-billion-dollar-board.md), [visión y expansión](../TURNOGOL_VISION_AND_EXPANSION.md).
**Sistema operativo del experimento:** [`docs/gtm/ejecucion/`](../gtm/ejecucion/00-README.md).

Contexto en una línea: 0 clientes pagos, 0 validados, 2 demos reales, primer piloto real desde 2026-09-02, ~90% del esfuerzo histórico en producto. Todo lo de abajo es provisional y tiene trigger de reversión escrito.

Escala de confianza: **alta** = respaldada por hechos observados y por el propio repo · **media** = razonamiento sobre datos secundarios con alguna señal de campo · **baja** = criterio, a validar con las primeras entrevistas.

---

## D1 — ICP provisional: 4-6 canchas (5-6 ideal)

- **Decisión:** priorizar comercialmente complejos de fútbol de 4-6 canchas, con turnos fijos, al menos un encargado y volumen operativo suficiente para que el dueño tenga problemas de control. Es **priorización, no prohibición**: un 3 o un 7+ excelente no se rechaza. No prospectar activamente 1-2 canchas.
- **Evidencia:** teardown §11 (a 1-2 canchas TurnoGol es el 3.º más caro de 8 y pierde contra dos free tiers; a 5-6 tiene su mejor precio relativo, $16.500/cancha); doc1/GTM 02 (1-2 canchas = dolor bajo, LTV bajo); Board §4.1.
- **Confianza:** media.
- **Trigger de reversión:** si los que activan y pagan son sistemáticamente de otro tamaño, o si el corredor tiene menos de 15 complejos puros de 4-6 (conteo pendiente, acción 5 del plan).
- **Revisión:** 2026-10-02, con la lista scoreada y las 10 entrevistas.

## D2 — Wedge provisional: D → C → B → A

- **Decisión:** **D** (fijos) como puerta de entrada · **C** ("el complejo funciona bajo control aunque el dueño no esté encima") como promesa general · **B** (caja/plata) como prueba cotidiana · **A** (seña) como mecanismo **opcional**, nunca titular ni condición. En demos y pilotos se arranca sin seña; si el dueño quiere probarla, ~10% o "la parte de un jugador", registrando siempre su reacción.
- **Evidencia:** FACT observado: en 2 de 2 demos preguntaron primero por fijos y cancelaciones; 1 de 2 rechazó culturalmente el pago anticipado. Scoring del Board §3 (D 42/55 sin el criterio de visión). Teardown: nadie lidera con fijos; "siempre lleno" y "% de cancelaciones" están comoditizados.
- **Confianza:** baja. **No está validado.** No se reescribe la estrategia alrededor de esto.
- **Trigger de reversión:** 10 entrevistas de discovery sin inducir. Si 3 de 5 nombran "turnos colgados / cancelaciones" antes que fijos o plata, la puerta vuelve a A. Si nombran algo que no es A/B/C/D, se abre E.
- **Revisión:** al completar la entrevista D10 o el 2026-10-02, lo que ocurra primero.

## D3 — Pricing: mensual por defecto, lista sin cambios

- **Decisión:** precios $63.000 / $99.000 / $129.000 se mantienen **como hipótesis**. Mensual por defecto durante esta fase; el anual -20% sigue disponible pero no se destaca hasta ≥10 clientes pagos. No bajar precios por CanchaFija ni tocar bandas. Precio comunicado al piloto desde el día 0 según sus canchas.
- **Evidencia:** teardown §11 (posición por tamaño), Board §4.1 y §1.9, decisión previa del founder de destacar el anual (marketing) revertida por etapa.
- **Confianza:** media para "no bajar"; baja para el número en sí.
- **Estado de implementación:** decidido, **no implementado** (ni web ni código, por decisión del founder hasta tener evidencia del caso cero). En la conversación se dice el precio mensual.
- **Trigger de reversión:** Van Westendorp en ≥10 charlas con "demasiado caro" mayoritario para el ICP; o ≥3 ventas perdidas por precio puro (no por valor).
- **Revisión:** 2026-10-02 y al primer cobro real.

## D4 — Feature freeze hasta 2026-11-01

- **Decisión:** no se construyen features especulativas. **Permitido:** bugs · seguridad · circuitos de plata · blockers observados en usuarios/clientes reales · fricción de adopción observada · instrumentación necesaria para medir · mejoras pequeñas justificadas directamente por uso real. **No permitido:** features especulativas · features copiadas de competidores sin evidencia · North Star · rankings · Cam · Falta Uno · profesores · marketplace · nuevas expansiones de producto.
- **Evidencia:** 90/10 producto/ventas (FACT declarado por el founder); Board unánime §4.4; teardown: la superficie del producto ya está en paridad o por encima en tabla-stakes.
- **Confianza:** alta.
- **Trigger de reversión:** un blocker de adopción observado en un cliente real que no entre en las excepciones (se documenta en `10-aprendizajes.md` antes de programar).
- **Revisión:** 2026-11-01. Guardrail espejado en `CLAUDE.md`.

## D5 — North Star vigente, avance por gates

- **Decisión:** [`TURNOGOL_VISION_AND_EXPANSION.md`](../TURNOGOL_VISION_AND_EXPANSION.md) sigue completamente vigente. El freeze no la abandona. La regla es **Operations → Distribution → Identity → Competition → Media**, con saltos por gates y evidencia, no por calendario ni entusiasmo. Los números del Board son referencia, no ley; el principio de gates sí es ley.
- **Evidencia:** Board §4.5; vetos previos del repo (`posible_nuevas_features` §4-5, vision v2 §10).
- **Confianza:** alta en el principio; los umbrales son hipótesis.
- **Trigger de reversión:** ninguno para el principio. Los umbrales se recalibran con datos en `09-gates.md`.
- **Revisión:** en cada cierre de gate.

## D6 — Piloto 1 = caso cero de aprendizaje

- **Decisión:** los 3 meses gratis son una **excepción de aprendizaje**, no oferta comercial. Baseline capturado **antes** de que TurnoGol toque su operación. Precio normal comunicado desde el inicio. Se hacen explícitamente las dos preguntas de WTP (ver `01-checklist-caso-cero.md`). Una respuesta positiva **no** valida willingness-to-pay; la validación fuerte es el pago real al día 91 o la disposición concreta a contratar bajo condiciones normales.
- **Evidencia:** Board §1.2 (contrato de aprendizaje), `pricing_y_oferta` §2 (precio pactado día 0).
- **Confianza:** alta como método.
- **Trigger de reversión:** —
- **Revisión:** día 7, 14, 30, 60 y 91 del piloto.

## D7 — Activación en tres niveles: A1 / A2 / A3

- **Decisión:** **A1** activación del complejo (TurnoGol entra en la operación: fijos, staff, caja, grilla) · **A2** activación del jugador (primera reserva online real de un jugador desconocido) · **A3** activación de red (un jugador que entró por un complejo reserva en **otro** sin que ese otro le haya mandado el link). A2 fallando en un solo complejo en 30 días **no** invalida el North Star: es señal diagnóstica. A3 es el verdadero inicio de la distribución.
- **Evidencia:** Board §1.7 (disenso AARRR), doc10 (aha = primera reserva online, ahora desdoblado).
- **Confianza:** alta como definición; A3 hoy solo tiene proxy (ver `06-metricas-activacion.md`).
- **Trigger de reversión:** —
- **Revisión:** con el primer A2 real.

## D8 — Referidos: 1 referido pago → 1 mes bonificado, manual

- **Decisión:** provisionalmente, un complejo referido que paga su primer mes bonifica un mes al referidor. **No se construye**. Antes se valida a mano: si los grupos de dueños existen, si el piloto está dispuesto a reenviar, si aparecen contactos diciendo "me lo pasó X".
- **Evidencia:** insight del founder (los dueños se conocen y tienen grupos de WhatsApp) — HYPOTHESIS; Board §4.2 (2→1 mal calibrado a base chica); CanchaFija ya opera meses por referidos.
- **Confianza:** baja.
- **Trigger de reversión:** si en 30 días no aparece ni un grupo ni un reenvío, referidos pasa a accesorio.
- **Revisión:** 2026-10-02.

## D9 — Situación fiscal: pendiente externo

- **Decisión:** pendiente externo: resolver régimen fiscal con contador antes del primer cobro. No modificar IVA ni facturación en código hasta tener esa definición profesional. El pricing se comunica como hipótesis; no se afirma ni "+IVA" ni "precio final".
- **Confianza:** —
- **Revisión:** antes del primer cobro real (día 91 del piloto a más tardar).

---

## Lo que esta decisión NO habilita (kill list vigente)

Ads pagos · reels/IG viral/avatares · WhatsApp Business API · cobro automático de abonados · billetera del jugador · Falta Uno · lista de espera · profesores/escuelitas · torneos (flag off) · Cam · rankings · perfil público del jugador · red social · marketplace como promesa · mejoras a `/explorar` · app nativa · importador ATC · read-only del día 31 (build) · IVA en código · precio fundador · pausa estacional · tarjeta al alta · expansión fuera del corredor · nuevas secciones de la web · cambios de default anual, seña, lifecycle, referidos o instrumentación **hasta tener evidencia del caso cero**.

## Docs superados parcialmente por esta decisión

`docs/gtm/02-icp.md` (ICP 3-6 → 4-6 prioridad), `03-posicionamiento.md` (orden de pilares → D→C→B→A, seña opcional), `04-oferta-piloto.md` (sin precio fundador; precio día 0; 3 meses = excepción; un compromiso en semana 1), `05-funnel.md` (horario de visitas 14-17 → ventanas compatibles con empleo), `docs/spec/doc10` (aha único → A1/A2/A3). Se conservan con banner; el razonamiento histórico no se reescribe.
