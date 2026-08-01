# TurnoGol v2 — Decisiones de fase

**Fecha:** 2026-08-01
**Cadena de documentos:** visión (`2026-08-01-vision-producto-turnogol-v2.md`) → pase crítico (`2026-08-01-vision-v2-pase-critico.md`) → **este documento**.
**Estado:** decisiones cerradas. Listo para: (1) validación con prospectos, (2) bajada a plan de implementación por fase.
**Qué NO es:** visión nueva ni roadmap técnico. Acá no se rediseña nada: se decide y se ordena.

---

## 1. Lista cerrada de decisiones que bloqueaban el plan

Las ocho identificadas en el pase crítico (§3). Ninguna otra decisión de **negocio** bloquea las fases 0–4; las decisiones restantes que aparezcan durante la ejecución son de diseño/técnicas y se resuelven dentro de cada fase (la política de identidad de Clientes —ficha ligera para no registrados + vinculación manual por el staff, nunca merge automático— se fija acá como decisión de diseño, según pase crítico §2.7).

| # | Decisión | Bloqueaba | Estado |
|---|---|---|---|
| D1 | Política del hold (mostrador vs online) | Fase 5 | ✅ Decidida por el dueño (2026-08-01) |
| D2 | Pago dividido/mixto | Fases 1 y 3 | ✅ Decidida por el dueño (2026-08-01) |
| D3 | Notas de mostrador vs Ley 25.326 | Fase 4 | ✅ Decidida por el dueño (2026-08-01) |
| D4 | Identidad visual | Transversal | ✅ Decidida por el dueño (2026-08-01) |
| D5 | "Hoy" del manager | Fase 2 | ✅ Cerrada en este doc (reversible, con trigger) |
| D6 | WhatsApp | Automatizaciones §9.4/9.7 | ✅ Diferida con trigger explícito |
| D7 | Onboarding invertido | Onboarding (prioridad flotante) | ✅ Cerrada en este doc (reversible, con trigger) |
| D8 | Canal del resumen diario | Fase 2 | ✅ Cerrada en este doc (revisable con costo real) |

---

## 2. Las decisiones, una por una

### D1 — Hold: nace al iniciar el pago, no al elegir el slot ✅ dueño

**Decisión:** sin seña, la reserva confirma directo — no existe hold (el lapso entre elegir y confirmar es corto; la carrera la resuelve la restricción de solapamiento como hasta ahora). Con seña, la cancha se bloquea recién cuando el jugador **entra a pagar**: no pisable, con cuenta regresiva visible para el jugador y marca "pagando ahora" en la grilla del staff. Al expirar, se libera sola.
**Por qué:** es la opción que menos inventario congela (mirar disponibilidad y completar datos no bloquea nada) y la única que no crea el conflicto mostrador-vs-online que el pase crítico marcó como el más caro de errar (§2.2). Formaliza y hace **visible** una mecánica de expiración que el sistema ya tiene, en vez de inventar una nueva.
**Consecuencia de diseño:** el copy del flujo jugador cambia — la promesa no es "te guardamos la cancha 10 minutos" sino "confirmá rápido: la cancha es tuya cuando empezás a señar". La ansiedad "¿me la guardaron?" se responde con estados explícitos, no con inventario congelado.

### D2 — Cobro: un pagador, métodos mixtos permitidos ✅ dueño

**Decisión:** cada cobro se registra a **una** persona en **una** transacción, pero esa transacción puede partirse en métodos: $10.000 efectivo + $6.000 MP. Sin N pagadores (los parciales completos quedan fuera de alcance; seña+saldo sigue funcionando como el par que ya es).
**Por qué:** el dueño eligió el punto medio sobre mi recomendación de "un pagador, un método". Cubre el caso real más frecuente del mostrador (el grupo junta efectivo y le falta, uno completa por transferencia) sin abrir la contabilidad de terceros que hace pantanoso el arqueo.
**Consecuencia de diseño:** el control de cobro (panel de turno y modo venta) tiene el split por método como interacción de primera clase — dos campos que suman al total, no un flujo aparte. El cierre de caja discrimina por método (el efectivo esperado solo suma la pata efectivo). Costo aceptado: +1 concepto en el cobro y en el cierre; el criterio de salida de Fase 1 lo cubre.

### D3 — Notas de cliente: solo etiquetas predefinidas, sin texto libre ✅ dueño

**Decisión:** la ficha de cliente admite únicamente etiquetas de un set predefinido y neutral (del estilo: VIP / paga tarde / no fiar / conflictivo — set final a definir en Fase 4). No existe campo de texto libre sobre personas.
**Por qué:** el dueño priorizó riesgo legal mínimo sobre expresividad, contra mi recomendación de texto libre con aviso. Con etiquetas redactadas por el producto, lo que un cliente puede leer ejerciendo derecho de acceso (Ley 25.326) está controlado en origen — nunca aparece un "chanta, no atenderle el teléfono" escrito a las 2 AM.
**Consecuencia de diseño:** el set de etiquetas ES la funcionalidad — se valida con prospectos ("¿qué anotás hoy de un cliente en el cuaderno?") antes de fijarlo. Las etiquetas siguen siendo dato personal accesible por el titular: se redactan para poder ser leídas.

### D4 — Identidad: clara para el trabajo, oscura para el deseo, un solo ADN ✅ dueño

**Decisión:** la herramienta (admin) es clara — legibilidad de jornada completa, mostrador con luz, usuarios de 50 años. El lado jugador y el marketing pueden ser oscuros (fútbol de noche). Una sola familia: misma tipografía, mismo verde, misma voz, mismos radios.
**Por qué:** ratifica la recomendación de la visión (§8): dos climas al servicio de dos contextos de uso, un ADN para que la marca no se parta en el paso más delicado (el dueño llegando desde la página de venta al producto).
**Consecuencia de diseño:** Fase 0 fija la gramática clara del admin; las superficies oscuras públicas no se tocan hasta Fase 5/marketing, pero cualquier retoque que reciban ya respeta el ADN común. La regla de conflicto sigue siendo P7: si el clima le cuesta legibilidad a la herramienta, pierde el clima.

### D5 — "Hoy" es solo del admin; el manager vive en la Grilla ✅ cerrada acá (reversible)

**Decisión:** no existe versión manager de Hoy. El manager aterriza en la Grilla, y las alertas operativas del turno (caja sin abrir, turno sin cobrar) viven embebidas ahí — donde ya está mirando.
**Por qué:** evita dos pantallas distintas con el mismo nombre (pase crítico §2.5): doble mantenimiento y soporte confuso, para un beneficio hipotético. La alternativa embebida pone la alerta en el contexto de la acción.
**Reversibilidad:** total — agregar una vista de resumen para el manager después es aditivo. **Trigger de revisión:** si los design partners con encargados reales piden un resumen propio de turno, se reabre.

### D6 — WhatsApp: fuera del plan v2, con trigger de reapertura ✅ diferida

**Decisión:** ninguna automatización dependiente de WhatsApp entra al plan (re-oferta de horas liberadas §9.4, recordatorio al jugador §9.7). No se degradan a email: se caen del plan, porque por email llegan tarde o no se leen (pase crítico §2.8).
**Trigger de reapertura:** ≥10 complejos activos pagando, o un design partner dispuesto a cubrir el costo del canal. Recién ahí se evalúa costo por conversación, opt-in y templates.
**Por qué:** decisión de plata recurrente sin clientes que la amorticen; hoy sería teatro de automatización.

### D7 — Onboarding invertido: grilla usable primero, MP como misión ✅ cerrada acá (reversible)

**Decisión:** el onboarding pide lo mínimo para ver la propia grilla y anotar un turno (canchas, horarios, precios base); MercadoPago, foto y portal quedan como misiones post-setup visibles en Hoy.
**Por qué:** time-to-value — dar la herramienta usable en <10 minutos y que cada misión desbloquee un beneficio visible (visión §4.12). El costo conocido: retrasa la activación de señas.
**Reversibilidad:** alta (es re-secuenciar pasos). **Trigger de reversión:** si de los primeros 5 onboardings reales, la mayoría no conecta MP en 7 días **y** declara que cobrar señas era su motivo de alta, se vuelve a MP-en-wizard. Se instrumenta desde el primer onboarding real.
**Prioridad flotante:** no pertenece a una fase del rediseño — se implementa cuando la venta lo exija (primer prospecto por firmar), porque es gate de conversión comercial, no de producto interno.

### D8 — Resumen diario: push si hay PWA, email opt-in ✅ cerrada acá (revisable)

**Decisión:** el resumen diario del dueño sale por push a quien tenga la PWA instalada; por email solo si el dueño lo activa (opt-in, no default).
**Por qué:** el push es gratis y el email tiene costo por tenant×día; sin clientes, el default barato manda. **Revisión:** con costo real medido y feedback de los primeros dueños (si nadie instala la PWA, el email opt-out se reconsidera).

---

## 3. Orden final de ejecución, con criterios de entrada y salida

Reglas heredadas del pase crítico (§5): apuestas seguras primero; lo estructural mientras no haya clientes (la ventana expira con el primer contrato); **cada fase termina en algo mostrable en una reunión de venta**. Regla anti-túnel: ninguna fase pasa de su cierre sin que su artefacto se haya mostrado a al menos un prospecto real.

### Fase 0 — La gramática (sistema de interacción sobre el producto actual)
Sin criterio de entrada: arranca ya, no depende de ninguna D.
**Criterios de salida (todos binarios):**
- [ ] Cero acciones de plata fuera de la jerarquía única de acciones (barrido completo del producto, verificado).
- [ ] Toda acción destructiva/costosa clasificada en la matriz deshacer-vs-confirmar y comportándose según su clase (lista de acciones auditada; cero confirmaciones genéricas "¿Estás seguro?").
- [ ] 100% de los inputs de monto usando el control de plata (error de magnitud $25/$25.000 imposible de tipear sin verlo).
- [ ] Plantillas de error y vacío aplicadas a todas las pantallas existentes; cero "Algo salió mal" a secas.
- [ ] Los 🔴 de la auditoría 2026-08-01 de estas clases: cerrados y verificados.

### Fase 1 — La plata visible
**Entrada:** Fase 0 cerrada (la gramática existe antes de construir encima).
**Criterios de salida:**
- [ ] Caja muestra cobrado / pendiente / estado del día SIEMPRE, incluido con el día abierto.
- [ ] "Plata en la calle" operativa: agrega los tres orígenes de deuda (turnos, fiados, cuotas de torneo) con cobro directo por fila.
- [ ] Cobro con método mixto (D2) registrable; el cierre discrimina por método.
- [ ] Cierre guiado: esperado pre-calculado visible antes de contar; diferencia con motivo capturado en el momento.
- [ ] Fuente única de agregados: el mismo número en toda superficie que lo muestre, garantizado por diseño y verificado con test de consistencia — no a ojo.
- [ ] Proxies de medición de §11 de la visión instrumentados (baseline-ready para el primer cliente real).

### Fase 2 — "Hoy" (solo admin, por D5)
**Entrada:** taxonomía de alertas cerrada por escrito (lista finita de eventos y alertas, con prioridad y umbral cada una).
**Criterios de salida:**
- [ ] Pantalla con los 3 números + "Mientras no estabas" + "Necesita tu atención"; cero gráficos.
- [ ] Alertas v1 operativas: caja de ayer sin cerrar, turno terminado sin cobrar, seña fallida.
- [ ] Resumen diario según D8.
- [ ] **Demo comercial armada que abre con Hoy, usada en ≥1 reunión real con prospecto.** (Acá arranca la venta en paralelo — no espera al final del rediseño.)

### Fase 3 — La Grilla
**Entrada:** máquina de estados del slot documentada cubriendo TODAS las combinaciones reales de reserva+seña+cancelación (no solo los 6 estados felices); prototipo navegable mostrado a ≥3 dueños/encargados prospecto.
**Criterios de salida:**
- [ ] Colores por estado de cobro según la máquina de estados; "terminado sin cobrar" como única alarma visual.
- [ ] Panel lateral: cobrar (con mixto D2), cantina al turno, marcar ausente (con su fricción de matriz), reprogramar — todo sin navegar fuera de la grilla.
- [ ] Popover de alta: ≤3 campos visibles, precio pre-calculado por el sistema, Enter confirma.
- [ ] Proxy de "alta de reserva ≤10 s" midiendo en uso propio/demo.
- [ ] Sin barra de comando (explícito — degradada a experimento post-v2).

### Fase 4 — La reorganización estructural
**Entrada:** pantallas madre (Hoy, Grilla, Caja) existentes; set inicial de etiquetas (D3) definido y validado con ≥2 prospectos; política de identidad de Clientes aplicándose (ficha ligera + vinculación manual, §1).
**Criterios de salida:**
- [ ] Navegación de 6 espacios activa; cero rutas huérfanas ni ítems del menú viejo colgando.
- [ ] Clientes fusionado: UNA lista de personas; fijos como pestaña; ficha-panel abrible desde Grilla, Caja y deudas sin navegar.
- [ ] Etiquetas D3 operativas en la ficha.
- [ ] Grilla-lista mobile (lista por hora con swipe entre canchas) reemplazando a la matriz apretada.
- **Nota de ventana:** esta fase se ejecuta SIN clientes reales o aceptando explícitamente el costo de migración de hábitos si ya los hay. Si el primer contrato llega antes, la decisión de secuencia se revisa — no se arrastra por inercia.

### Fase 5 — El flujo jugador
**Entrada:** D1 implementada (hold al iniciar pago); ≥1 complejo real compartiendo su link (tráfico que optimizar — antes de eso, no hay embudo).
**Criterios de salida:**
- [ ] Tres pantallas; identidad al final; verificación de email fuera del checkout (el link sirve para volver, no para comprar).
- [ ] Hold según D1: countdown visible al jugador, "pagando ahora" en la grilla del staff, liberación automática.
- [ ] Confirmación como tarjeta compartible (WhatsApp-ready) + límite de cancelación sin costo visible.
- [ ] Embudo instrumentado de punta a punta (portal → confirmada), con baseline del flujo viejo si aún existe tráfico comparable.

### Paralelo permanente (no es fase: es régimen)
- Venta con prototipo desde Fase 2 en adelante; captación activa de 1–2 design partners.
- Instrumentación creciente desde Fase 1 (nada se rediseña dos veces por no haber medido).
- D7 (onboarding) se ejecuta cuando la venta lo exija, interrumpiendo la fase en curso si hace falta: un prospecto por firmar vale más que la prolijidad de la secuencia.

---

## 4. Qué validar con prospectos (el puente a la siguiente etapa)

Cinco cosas, en orden de qué tan caro es equivocarlas:

1. **La jornada asumida** (¿quién atiende? ¿cuántas llamadas? ¿cuaderno o Excel o ATC?) — valida o rompe las personas de la visión (§2.1 del pase).
2. **"Plata en la calle" y "Hoy"**: mostrar el prototipo y medir la reacción a la frase "te muestra la plata que se te está escapando" — es el pitch entero.
3. **La grilla con estados de cobro**: ¿leen los colores como plata sin que se los expliquen?
4. **El set de etiquetas D3**: "¿qué anotás hoy de un cliente?" — el set final sale de ahí.
5. **Onboarding D7**: ¿qué los haría empezar hoy — anotar turnos ya, o cobrar señas ya? (alimenta el trigger de reversión).

---

*Cerrado el 2026-08-01 con cuatro decisiones del dueño (D1, D2, D3, D4 — D2 y D3 contra la recomendación del diseñador, registrado a propósito: la divergencia documentada vale más que el consenso retroactivo) y cuatro del documento con reversibilidad y triggers explícitos (D5–D8). Próximo artefacto: prototipo de las pantallas madre para las reuniones de validación (§4).*
