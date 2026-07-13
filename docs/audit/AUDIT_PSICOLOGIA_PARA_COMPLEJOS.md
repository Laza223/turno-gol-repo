# Auditoría psicológica — Landing `/para-complejos`

> Fecha: 2026-07-13 · Alcance: solo auditoría (sin tocar código) · Archivo auditado: `src/app/(business)/para-complejos/page.tsx` (branch `chore/storybook-complete`)
> Lente: skill `marketing-psychology` (modelos mentales aplicados por sección) + Método Karpathy (evidencia archivo:línea, severidad, propuesta).
> Reglas de las propuestas: voseo, filtro "dueño tomando mate" (`docs/gtm/03-posicionamiento.md:3`), solo claims de la lista SE PUEDE PROMETER (`docs/gtm/10-playbook-ia.md:21-30`), **cero métricas/clientes/testimonios inventados**.

## Estado previo (para no re-litigar)

El sweep del 2026-07-12 (commit `5eb5eca`, ledger en `docs/audit/PROGRESS.md:533-555`) ya eliminó las violaciones literales de la lista negra: testimonios fabricados, stats "+10.000/50+/95%", "miles de jugadores", "cobrados automáticamente", "Dashboard". Grep 2026-07-13 contra el código vivo: cero matches. **Esta auditoría es la capa siguiente**: claims residuales que aquel sweep no cubrió + efectividad psicológica del copy que quedó.

Contexto estratégico que gobierna todo el análisis (`docs/gtm/01-diagnostico.md:13-14`): dolor del cliente 8/10 pero **urgencia de compra 4/10 — el dolor está tolerado y el competidor #1 es el status quo (WhatsApp + cuaderno)**, no ATC. Persona: Marcelo, 43, tech literacy 2.5/5, miedo a "tocar algo y romper todo" (`docs/spec/doc3_personas_jtbd.md:46-52`).

---

## Verificación de claims contra código (hecha antes de auditar)

| Claim en la landing | Veredicto | Evidencia |
|---|---|---|
| "30 días gratis" (metadata :20, stats :70, FinalCta :548) | ✅ FIRME | `src/modules/tenants/tenant.service.ts:55` — `trialEndsAt = Date.now() + 30 días` |
| "Si no paga en minutos, el turno se libera solo" (:38) | ✅ FIRME | TTL de hold = 6 min: `src/modules/bookings/booking.expiry.ts:81`, `src/shared/rate-limit/policies.ts:33` ("360s de TTL de hold") |
| "Las reservas nocturnas se notifican a las 8 AM" (:50) | ✅ FIRME | `src/modules/notifications/push-quiet-hours.ts:17` — `QUIET_HOURS_END = 8`, ventana 00:00–08:00 |
| "100% de la seña va a tu MercadoPago" (:67) | ✅ FIRME | Grep `application_fee\|marketplace_fee` en `src/lib/mercadopago.ts`: cero matches — TurnoGol no toma comisión (el fee de procesamiento de MP es de MP, como en cualquier cobro por MP) |
| "Configurado en 20 minutos" (:186, :69) | ✅ Permitido por decisión | `docs/gtm/03-posicionamiento.md:51` — claim aprobado explícito (sin dato empírico aún; es promesa de producto, no estadística) |
| "Soporte dedicado" (:186) | ⚠️ Sin respaldo definido | Ningún canal de soporte comprometido en código/docs más allá de `mailto:hola@turnogol.app` (footer). Ver H-03 |
| "Herramientas que nacieron de la operación diaria de complejos como el tuyo" (:346) | ❌ FALSO | `docs/gtm/01-diagnostico.md:16` — "Cero marca, cero clientes, cero casos de éxito". Ver H-05 |
| "Integración en un click" (:427) | ⚠️ Exagerado | Flujo real: `/api/mp/oauth-start` → login MP → consent → callback (2-3 interacciones + login). Ver H-11 |

---

## Hallazgos (orden de render)

### H-01 · Metadata/SEO · 🟢
- Evidencia: `page.tsx:18-20` — title "TurnoGol para complejos — Reservas online y señas por MercadoPago"; description "Sistema de gestión para complejos de fútbol. Reservas online 24/7 por link, señas por MercadoPago directo a tu cuenta, grilla en tiempo real y caja completa. 30 días gratis."
- Qué pasa: correcto y verificable, pero es un inventario de features — no menciona el ausente, que es la puerta de entrada del posicionamiento ("La puerta se abre con el ausente y el teléfono", `03-posicionamiento.md:9`). En la SERP compite contra ATC/Turnito con el mismo vocabulario genérico.
- Modelo psicológico: **loss aversion en el primer contacto** — el snippet de Google es el primer touchpoint; una pérdida concreta ("si te cuelgan el turno, la seña queda para vos") diferencia más que una lista de sustantivos.
- Propuesta (description): `Reservas online con seña por MercadoPago directo a tu cuenta: si te cuelgan el turno, la seña queda para vos. Grilla en tiempo real, caja completa y turnos fijos. Hecho para complejos de fútbol en Argentina. 30 días gratis.`

### H-02 · Hero H1 · 🟡 · REQUIERE INPUT
- Evidencia: `page.tsx:145-158` — "Tu complejo, siempre lleno. / Reservas que no paran."
- Qué pasa: doble problema. (a) Es aspiración de **ganancia** genérica — podría firmarla cualquier turnera — cuando el diagnóstico dice que el dueño tolera el dolor y solo lo mueve la pérdida concreta. (b) "Siempre lleno / reservas que no paran" **insinúa generación de demanda**, que colinda con el prohibido "te traemos jugadores" (`10-playbook-ia.md:37`): TurnoGol ordena la demanda que el complejo YA tiene (`07-objeciones.md:46`), no la crea. Como puffery no cuantificado es legal (MASTER §9: puffery libre), pero siembra la expectativa equivocada que el GTM identifica como causa #1 de churn ("Vender a quien no va a activar… prometer el futuro", `01-diagnostico.md:47-48`).
- Modelo psicológico: **prospect theory / loss aversion** (las pérdidas pesan ~2× las ganancias — para vencer un status quo tolerado hay que nombrar la pérdida, no prometer el paraíso) + **status-quo bias** (el rival es el cuaderno: el H1 tiene que hacer visible el costo de seguir igual).
- Propuesta (variantes, decisión de posicionamiento del dueño):
  - A (pilar 1 verbatim, pérdida): `Que no te cuelguen más.` / línea gradiente: `La seña queda para vos.`
  - B (pérdida + mecánica): `El que te clava, ya te dejó la seña.` / gradiente: `Reservas online por MercadoPago.`
  - C (statu quo, teléfono): `Tu complejo atiende solo.` / gradiente: `Vos solo mirá el celu.`
- REQUIERE INPUT: cambiar el H1 es cambiar el posicionamiento público — y además existe la ⚠️ HIPÓTESIS abierta del GTM (`03-posicionamiento.md:55`: ¿el ausente es realmente el dolor #1?). Decisión de Lazar. Contrato de test: la story fija `/tu complejo, siempre lleno/i` (`page.stories.tsx:26`) — cualquier cambio la actualiza.

### H-03 · Hero checklist "Soporte dedicado" · 🟡
- Evidencia: `page.tsx:186` — `'Sin tarjeta de crédito', 'Configurado en 20 minutos', 'Soporte dedicado'`
- Qué pasa: "Soporte dedicado" es vocabulario enterprise vacío (¿dedicado a qué? ¿SLA? ¿equipo?) y no hay canal comprometido en ningún lado (solo un `mailto:` en el footer). La realidad — founder solo que da su celular directo (`07-objeciones.md:29`: "tenés mi celular directo — no un mail de soporte que contesta el lunes") — es **más vendedora que el claim genérico**.
- Modelo psicológico: **pratfall effect + liking/similarity** — "hablás con el que lo hizo" humaniza y diferencia de ATC; un claim corporativo genérico ni se registra. También **regret aversion**: el miedo documentado de Marcelo es "¿qué pasa si dejan de dar soporte?" (`doc3:79`) — la respuesta específica calma más que el adjetivo "dedicado".
- Propuesta: `Hablás directo con quien lo hizo` (o `Soporte directo, sin robots`). REQUIERE INPUT menor: qué canal de soporte está dispuesto Lazar a comprometer públicamente (¿email? ¿WhatsApp del founder? — hoy no hay WhatsApp en la página).

### H-04 · Softban ausente en toda la landing · 🟡
- Evidencia: grep `bloque|reinciden|corta|dos semanas|14 días` sobre `page.tsx`: cero matches. La frase central aprobada incluye "al que falta seguido el sistema le corta solo las reservas online por dos semanas" (`03-posicionamiento.md:7`) y es el **diferenciador técnico #1** de `.agents/product-marketing.md:10`.
- Qué pasa: el único feature que ningún competidor tiene (castigo automático al reincidente) no aparece en la página de venta. La card de señas (:36-38) cuenta la seña pero no el bloqueo.
- Modelo psicológico: **JTBD de protección económica** (doc3:59-61) — la seña cubre UNA cancelación; el bloqueo automático responde la pregunta siguiente del dueño ("¿y si me cuelgan el turno de nuevo?"). Es además el claim con mejor relación potencia/veracidad del producto: 100% mecánico, 100% verificable.
- Propuesta: sumar a la description de la card "Señas por MercadoPago" (:38): `…el turno se libera solo. Y al que falta seguido, el sistema le corta las reservas online por dos semanas — sin que muevas un dedo.` (Cabe en retoque de copy; no requiere sección nueva.)

### H-05 · Features subhead — claim de origen falso · 🔴
- Evidencia: `page.tsx:346` — "Herramientas que nacieron de la operación diaria de complejos como el tuyo."
- Qué pasa: afirma que el producto nació de complejos reales operándolo. Hay cero clientes (`01-diagnostico.md:16`). Es un claim de origen **verificable y falso** — la primera pregunta de un dueño en demo es "¿quién lo usa?" (`07-objeciones.md:39-40`, respuesta oficial: "estás entre los primeros, no te voy a mentir") y la landing dice lo contrario. Viola la regla dura #2 del playbook ("Nunca inventar métricas, clientes, casos", `10-playbook-ia.md:15`) y el piso legal de MASTER §9 ("ningún claim verificable puede ser falso", Ley 24.240).
- Modelo psicológico: **authority/social proof falsificado** — exactamente la categoría que el sweep 5eb5eca vino a matar; sobrevivió porque está redactado como origen y no como número. El costo es el descrito en §9: un claim que el prospecto puede desmentir en la primera charla invierte el efecto y contamina los claims verdaderos de al lado.
- Propuesta: `Pensado para cómo labura un complejo de fútbol de verdad: el viernes a la noche, los fijos, la caja. Todo lo que necesitás, nada que sobre.` (puffery de intención — legal y en idioma mate; conserva la segunda frase actual, que está bien).

### H-06 · Features eyebrow + H2 — corporate-speak · 🟡
- Evidencia: `page.tsx:336` — "Funcionalidades que generan resultados"; `page.tsx:343` — "Cada función está diseñada para aumentar tu ocupación."
- Qué pasa: "funcionalidades", "generan resultados", "está diseñada para aumentar tu ocupación" — ninguna la diría un dueño tomando mate (regla `03-posicionamiento.md:3`); "aumentar tu ocupación" es además promesa de resultado (suave, no cuantificada — legal, pero del género que el GTM evita). Marcelo no piensa en "ocupación": piensa en ausencias, teléfono y caja.
- Modelo psicológico: **curse of knowledge** — es vocabulario de quien construyó el producto, no de quien lo compra. La skill lo dice directo: "Your product seems obvious to you but confusing to newcomers".
- Propuesta: eyebrow `Lo que hace por vos` · H2 `Menos teléfono, menos ausencias, la caja clara.` (los 3 pilares comprimidos, en el orden de dolor del GTM).

### H-07 · Card "Métricas en tiempo real" · 🟢
- Evidencia: `page.tsx:42-44` — "Facturación, ocupación y reservas del día en una sola vista. Tomá decisiones basadas en datos reales."
- Qué pasa: "Tomá decisiones basadas en datos reales" es frase de consultora. El job real es concreto: "Domingo a la tarde, tranquilo en casa → ver cuánto facturé esta semana y cuáles canchas rindieron más" (`doc3:66`).
- Modelo psicológico: **Jobs to be Done** — describir el momento de uso vende más que describir la capacidad.
- Propuesta: `Cuánto entró hoy, cómo viene el mes y qué canchas rinden más. Lo ves desde el celu, estés donde estés.`

### H-08 · Card "Caja unificada" — pierde el diferencial de gastos · 🟢
- Evidencia: `page.tsx:54-56` — "Caja unificada / Reservas, cantina y abonados unificados en un solo cierre diario. Olvidate de las planillas."
- Qué pasa: (a) el pilar 3 real es "turnos + cantina + **gastos** + cierre diario" — y control de gastos es diferencial contra ATC ("ATC no tiene gastos", `01-diagnostico.md:28`) que la card omite; (b) "unificada/unificados" repetido es semi-corporate; (c) "abonados" — la guía dice "fijo (no 'abonado' al principio)" (`03-posicionamiento.md:40`).
- Modelo psicológico: **contrast effect** desaprovechado — el único punto donde se le puede ganar a ATC por feature se deja afuera.
- Propuesta: título `La caja te cierra` · description `Turnos, cantina y gastos en un solo cierre diario. Sabés cuánto entró, cuánto salió y por dónde — sin planillas.`

### H-09 · Card "Abonados y partidos fijos" — título · 🟢
- Evidencia: `page.tsx:60-62` — título "Abonados y partidos fijos" (la description ya está correcta post-5eb5eca: "Registrás quién pagó cada sesión").
- Qué pasa: "Abonados" primero, cuando la guía de vocabulario pide entrar por "los fijos" (`03-posicionamiento.md:40`).
- Modelo psicológico: **similarity/unity** — hablar el idioma del gremio señala "soy de acá"; cada palabra de sistema lo diluye.
- Propuesta: título `Los fijos de siempre, en piloto automático` (description queda como está).

### H-10 · PanelMockup — cifras de demo · 🟢
- Evidencia: `page.tsx:293` "$ 184.500" · `:299` "9 reservas hoy" · `:320-321` toast "Nueva reserva online / hace 1 minuto".
- Qué pasa: como mockup ilustrativo (`aria-hidden`, claramente un panel de ejemplo) NO viola la cláusula §9 — no es un contador de tracción ni un testimonio; es la convención estándar de mostrar el producto. Dos matices: (a) verificar la **plausibilidad aritmética** — $184.500 / 9 reservas ≈ $20.500 por turno; si el precio de mercado real de un turno F5 en 2026 es bastante mayor, el dueño hace esa cuenta en un segundo y el panel "suena raro"; (b) el toast "hace 1 minuto" está bien porque vive DENTRO del mockup — nunca sacarlo de ese marco (fuera del mockup sería urgencia fabricada).
- Modelo psicológico: **availability heuristic** — el mockup es la simulación mental de "mi complejo adentro del sistema"; cuanto más plausible el número, más real la simulación. Un número que no cierra rompe la fantasía.
- Propuesta: revisar la cifra contra precios reales de turno del mercado objetivo (dato que tiene Lazar, no el repo) y ajustar para que la división cierre a ojo.

### H-11 · Paso 04 "Integración en un click" · 🟢
- Evidencia: `page.tsx:427` — "Conectá MercadoPago / Integración en un click. Empezá a recibir señas online en tu cuenta."
- Qué pasa: el flujo real es OAuth: click → login en MercadoPago → autorizar → volver. Para un usuario tech 2.5/5 que espera literalmente "un click", encontrarse un login de MP en el medio es fricción no anunciada — pequeña, pero justo en el paso de mayor desconfianza (plata).
- Modelo psicológico: **expectation gap / peak-end del onboarding** — prometer menos fricción de la real cobra intereses en el momento exacto donde el usuario ya está nervioso. Mejor anclar la expectativa correcta: sigue siendo fácil.
- Propuesta: `Entrás con tu cuenta de MercadoPago, autorizás, y listo: las señas caen directo ahí.`

### H-12 · Mock de grilla con slots de 15 minutos · 🟡 (cross-ref triage #92)
- Evidencia: `page.tsx:506` — genera `18:00, 18:15, 18:30, 18:45…` (20 celdas de 15 min). El producto solo tiene turnos de 60 min (`SLOT_DURATION_MINUTES = 60`, `src/shared/constants.ts:8`).
- Qué pasa: ya registrado como `docs/qa/triage_fixes.md:112` (#92, LOW) como bug funcional. Esta auditoría le sube el peso: es un **claim visual de producto inexistente** en la página de venta — el mockup muestra una granularidad que el dueño con turnos de 90 min o media hora va a pedir en la demo, y la respuesta va a ser "no existe". Mismo género que H-05: expectativa falsa → churn.
- Modelo psicológico: **map ≠ territory aplicado al mockup** — el prospecto toma el mock como el producto. Todo lo que el mock muestre debe existir.
- Propuesta: regenerar el mock con slots de 60 min (ej. 18:00–22:00 × 4 canchas = 20 celdas, misma grilla visual). Mantiene el layout, mata la mentira.

### H-13 · Pasos de setup — falta el escape hatch humano · 🟡 · REQUIERE INPUT
- Evidencia: `page.tsx:423-428` — los 4 pasos son 100% self-service. El claim aprobado tiene dos patas: "Lo configurás en 20 minutos, **o te lo dejo configurado yo**" (`03-posicionamiento.md:51`); la respuesta a la objeción #5 es "me mandás una foto del cuaderno y en 48 horas te lo entrego andando" (`07-objeciones.md:20`).
- Qué pasa: para el Marcelo con miedo "no voy a poder configurarlo solo" (`doc3:77`), los 4 pasos —por simples que sean— siguen siendo una tarea técnica que él hace solo. La segunda pata (lo hace el founder) elimina esa barrera por completo y hoy no está en ningún lado de la página.
- Modelo psicológico: **BJ Fogg (Behavior = Motivation × Ability × Prompt)** — acá la ability percibida es el cuello de botella, no la motivación; ofrecer el camino asistido es la palanca de ability más barata que existe. También **zero-price effect** sobre el servicio: "te lo dejo andando yo, gratis" es una oferta desproporcionadamente atractiva.
- Propuesta: una línea bajo los 4 pasos: `¿Cero tiempo? Mandanos una foto del cuaderno y te lo entregamos andando.` — REQUIERE INPUT: promete horas del founder en un canal self-service abierto (en GTM ese servicio se ofrece 1:1 en pilotos). ¿Lazar quiere comprometerlo públicamente y a qué plazo? (el "48 horas" de la objeción #5 NO ponerlo sin su ok).

### H-14 · FinalCta H2 genérico · 🟡 · REQUIERE INPUT
- Evidencia: `page.tsx:545` — "Tu complejo merece funcionar al máximo."
- Qué pasa: cierre motivacional intercambiable (cualquier SaaS de cualquier rubro). Es la última impresión de la página y no deja ni el dolor ni la mecánica — desperdicia el slot de memoria más valioso. El subhead de abajo (:548) en cambio es excelente y no se toca.
- Modelo psicológico: **peak-end rule** — la página se recuerda por el pico y el final; el final actual es ruido blanco. Cierre con pérdida concreta = el dueño se va con la cuenta mental del último ausente en la cabeza.
- Propuesta (variantes, alineadas con lo que se decida en H-02):
  - A: `¿Cuántas veces te colgaron este mes?` (la pregunta de apertura del GTM, `03-posicionamiento.md:36` — convierte el cierre en la misma conversación que el founder tiene en persona)
  - B: `El próximo que te cuelgue el turno, ya te dejó la seña.`
- REQUIERE INPUT: misma decisión de posicionamiento que H-02 (los dos extremos de la página deben contar la misma historia).

---

## Lo que ya está bien (no romper en futuros fixes)

| Qué | Dónde | Por qué funciona |
|---|---|---|
| Subheadline del hero | `page.tsx:163-165` | Es la frase central aprobada casi verbatim: pérdida concreta ("si te cuelgan el turno, la seña queda para vos") + mecánica + unity ("Hecho específicamente para complejos de fútbol en Argentina"). Lo mejor de la página. |
| Card "Señas por MercadoPago" | `page.tsx:36-38` | Mecánico, verificable, mata la objeción #14 ("TurnoGol no la toca") y el TTL es real. Solo sumarle el bloqueo automático (H-04). |
| Card "Avisos al instante" | `page.tsx:48-50` | Claim verificado (quiet hours 8AM real) y habla al JTBD del descanso — honestidad convertida en feature. |
| StatsBar completo | `page.tsx:66-71` | Patrón correcto post-5eb5eca: 4 claims mecánicos verificados (100% / 24/7 / 20 min / 30 días) en el slot visual donde antes había social proof falso. Es "proof of mechanism" en lugar de social proof — para pre-launch, la jugada honesta correcta. |
| Subhead del FinalCta | `page.tsx:548` | Risk reversal + regret aversion de manual: "Sin tarjeta, sin compromiso. Si no ves resultados, lo dejás." |
| Estructura de CTAs | Hero + FinalCta | Hick's law respetada: un primario (`Empezar gratis` → `/register`), un secundario. Sin precio en la landing → el anchoring se hace en `/precios` con good-better-best; correcto no duplicarlo acá. |
| 4 pasos del showcase | `page.tsx:423-428` | Chunking (Miller) + goal gradient; reduce activation energy. Solo ajustar paso 04 (H-11) y sumar escape hatch (H-13). |

## Gaps estructurales (secciones que NO existen) — todos REQUIERE INPUT

El usuario excluyó secciones nuevas del alcance de fix; se listan como oportunidades para decidir en frío:

1. **Contraste antes/después** (status-quo bias + contrast effect): el rival es el cuaderno, y la página nunca lo nombra. Una franja "Hoy: el teléfono suena a las 23:40 / Con TurnoGol: la reserva ya entró señada" haría visible el costo del status quo sin burlarse del cuaderno (línea roja del GTM, `03-posicionamiento.md:33`).
2. **Objeción de la seña** ("la seña me espanta clientes", `07-objeciones.md:13-14`): la landing asume que el dueño quiere cobrar seña; el diagnóstico la marca como fricción real (`01-diagnostico.md:40`). Una línea mecánica la desactiva: "La seña la manejás vos: elegís el porcentaje o la apagás". Cabe como frase en la card de señas o como FAQ (en `/precios` ya hay FAQ; acá no).
3. **Social proof honesto pre-launch**: no existe sustituto inventable (regla dura). La única jugada disponible es el **pratfall del pionero** (objeción #11: "Estás entre los primeros — por eso el trato es distinto: gratis, te lo configuro yo, mi celular directo") convertido en sección "precio fundador". Es decisión comercial pura (¿anunciar públicamente condición de pionero?), no de copy.

## Contratos de test (para el fix futuro)

- `src/app/(business)/para-complejos/page.stories.tsx:23-33` — fija H1 `/tu complejo, siempre lleno/i` (afecta H-02), texto exacto `Reservas online 24/7`, y todos los links `/empezar gratis/i` → `/register`.
- `tests/e2e/landing.spec.ts:28-34` — CTA "Empezar gratis" visible → `/register`.
- `tests/unit/business-header.test.tsx:19-28` — header: `Ingresar` → `/login`, `Empezar gratis` → `/register`, sin nav de jugador.
- El resto del copy (H2s, features, stats, steps, FinalCta) NO está fijado por ningún test — cambiarlo no rompe nada.

## Cross-refs de deuda existente

- **MASTER §13 P2.7** (`docs/spec/design-system/MASTER.md:602-605`): sigue listando los stats fabricados ("+10.000", "50+") como deuda abierta, pero `5eb5eca` los eliminó — el ítem quedó desactualizado. La regla del propio §13 es "al cerrar un ítem, borrarlo de acá". REQUIERE INPUT (o cerrar P2.7, o reescribirlo apuntando a los residuos de esta auditoría: H-05, H-12).
- **triage #92** (`docs/qa/triage_fixes.md:112`): mock 15 min = H-12 (esta auditoría le sube la prioridad efectiva con el argumento psicológico). Nota: el triage cita la ruta vieja `(public)/para-complejos`; hoy es `(business)/`.
- **triage #134** (`docs/qa/triage_fixes.md:154`): fondo Unsplash hotlinkeado sin fallback (`page.tsx:24-25`) — no es hallazgo psicológico, se referencia porque cualquier fix de esta página debería aprovechar y cerrarlo.

## Resumen ejecutivo

1 🔴 (H-05: claim de origen falso — única violación legal/ética viva), 6 🟡 (H-02 H1, H-03 soporte, H-04 softban ausente, H-06 corporate-speak, H-12 mock 15 min, H-13/H-14 con REQUIERE INPUT), 5 🟢 (pulido de copy). Si solo se arregla una cosa: **H-05** (borra la última mentira). Si se arreglan tres: H-05 + H-04 (el diferenciador #1 entra a la página) + H-12 (el mock deja de vender un producto que no existe). El reposicionamiento del H1/cierre (H-02/H-14) es la palanca de conversión más grande pero es decisión de negocio con hipótesis GTM abierta — decidir antes de tocar.
