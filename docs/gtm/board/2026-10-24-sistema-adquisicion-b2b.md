# Billion Dollar Board — Sistema de adquisición B2B (propuesta de otra IA)

> Fecha: 2026-10-24 · Pedido del founder · Estado: **para decidir** (§9). El artefacto es la propuesta de un tercero: un sistema de 45 días de "vidriera en Instagram + ManyChat de un paso + outbound + Meta Ads + prueba en vivo del bot", con un prompt maestro para generar las piezas. Este doc la contrasta con el código y con la doctrina GTM del repo, la pasa por los 9 marcos del board y dos lentes de afuera, y la deja reescrita. No cambia nada en el código ni en la web.

## 1. La propuesta, en cinco líneas

- **Diagnóstico.** El orgánico de Instagram no llega a dueños, así que IG se usa como vidriera y el motor es outbound + pauta. Esto es correcto y ya estaba en el repo (§4).
- **Embudo.** Reel → comentar "CANCHA" → un DM de ManyChat → wa.me → "Prueba en Vivo de 30 segundos" con el bot de TurnoGol Plus → cálculo de ahorro → asesor humano.
- **Argumento de plata.** «Costo de Inacción ($120.000 ARS/mes perdidos por cancelaciones vs. $107.000 ARS/mes del software)», más un «Mecanismo de Seña Mínima» del 15-20% contra un supuesto miedo fiscal a bancarizar.
- **Ritmo.** Semana 1 armando la vidriera; semanas 2 a 6 con «15 complejos por día» de outbound y una «Micro-campaña paga» desde la semana 3.
- **Entregable.** Un prompt maestro en 4 fases (perfil, cierre, 9 Reels, plan de 45 días) para que otra IA escriba las piezas.

## 2. Qué se puede prometer hoy

Contra `docs/gtm/10-playbook-ia.md` (PROHIBIDO PROMETER, :34-40) y contra el código. 🔴 = la propuesta lo promete y no existe o es falso · 🟡 = existe con condiciones que la propuesta no dice · ✅ = se puede decir tal cual.

| Lo que dice la propuesta | | Lo que hay de verdad |
|---|---|---|
| «complejos deportivos (fútbol 5/7/11, pádel, tenis)» | 🔴 | Solo fútbol (CLAUDE.md, primera línea). Es la diferenciación, no un detalle. |
| «Base 1 cancha = $47.000 ARS/mes \| Cada cancha adicional = +$30.000 ARS/mes \| Anual = 20% OFF», «(3 canchas): $107.000» | 🔴 | $30.000 por cancha, incluida la primera; anual 10% off (`src/modules/billing/pricing.ts:10-11`). 3 canchas = $90.000; el ICP de 4-6 = $120.000 / $150.000 / $180.000. |
| «Calendario de reservas online 24/7 en tiempo real» | 🔴 en "tiempo real" | El jugador no tiene Realtime en v1 (solo la grilla del admin). El claim ya se sacó de la home el 2026-09-27 (`ejecucion/10-aprendizajes.md:87`). "Reservas online 24/7" sí. |
| «Prueba en Vivo de 30 segundos» / «entorno de 'Cancha Demo'» | 🔴 | No hay complejo demo en prod ni número demo. Lo único es el seed local "Complejo La Redonda" (`scripts/demo/seed-demo-tenant.ts`), para grabar videos. Un número demo con el bot quemaría el tope de Kapso Free (2.000 mensajes por mes, entrantes y salientes, `10-aprendizajes.md:113`), que puede ser compartido con El Vagón. |
| «el bot da vuelta la conversación mostrando cómo se vio eso en el panel de control y calculando su ahorro» | 🔴 | No existe. El bot tiene cuatro herramientas: `ver_disponibilidad`, `reservar`, `cancelar`, `pasar_a_humano` (`src/modules/whatsapp-bot/whatsapp-bot.tools.ts:106/231/368/515`). Atiende jugadores del complejo; no le vende TurnoGol a nadie. |
| «seña mínima del 15-20% sin complicarte con impuestos» | 🔴 | Promesa fiscal. Lo que se publicita integra el contrato (Ley 24.240, art. 8). TurnoGol no sabe ni decide la situación impositiva del complejo. |
| «elimina faltantes y robo hormiga» | 🔴 | El control de stock existe (Caja › Productos, "Para reponer"); "elimina faltantes" es un resultado no medido y "robo hormiga" insinúa que el empleado roba (R6 de `decisions/2026-09-26-referidos.md`). El repo ya tiene el encuadre honesto: «No es que te roban. Es que el papel pierde.» (`13-guiones-higgsfield.md:32`). |
| «Con recuperar 4 turnos al mes, el software sale gratis.» | 🔴 | Con la seña chica que la misma propuesta recomienda, el que falta deja la seña ($6.000 sobre un turno de $30.000), no el turno. "Recuperar" el turno entero solo pasa si se vuelve a alquilar, y eso nadie lo midió (`10-playbook-ia.md:40`). |
| «TurnoGol Plus: Bot de WhatsApp que responde disponibilidad y toma reservas automáticamente 24/7» | 🟡 | Construido y conectable desde Ajustes. Pero: 0 chats reales (El Vagón todavía no lo conectó), se calla 6 h cuando contesta el dueño, máximo 2 reservas futuras sin seña por chat, tope de Kapso, y es un **extra de $20.000 por cancha** (`pricing.ts:27`) con el cobro probado solo contra el mock de MP (#495). |
| «(ej. $5.000 o $6.000 ARS, el 15%-20%)» | 🟡 | La seña es un porcentaje de 10 a 100 (`src/app/(admin)/settings/reservas/actions.ts:30`), default 30. No es un monto. Sobre un F5 de Luján ($45.000-60.000) el 15-20% da $6.750-12.000. |
| «ni perseguir comprobantes truchos» | 🟡 | Vale solo si la seña va por MercadoPago. Los comprobantes de transferencia no se validan. |
| «el dinero va directo a la cuenta del complejo» | ✅ | Checkout Pro con OAuth del complejo; TurnoGol no toca la plata (`para-complejos/page.tsx:155`). |
| Turnos fijos, caja diaria, encargado con su usuario | ✅ | Todo existe (`para-complejos/page.tsx:200-217`). |

**Lo que la propuesta no usa y sí se puede prometer:** página propia del complejo con su link · seña opcional que entra a su MercadoPago · regla de cancelación tardía para el que no quiere seña (aviso → 7 días → 30 días sin reservar online, en 60 días; apagada por defecto) · el que falta 2 veces en 90 días queda 14 días sin reservar online · fijos que se repiten solos · cobro por equipo ("Equipo 1 pagó · falta Equipo 2") · la caja de la noche con lo jugado y no cobrado en rojo · placa de turnos libres para historias · precios ocultables en la página pública · "antes de irte, te bajás reservas, fijos y clientes en CSV" (`10-aprendizajes.md:117`) · «Te ayudamos a configurarlo por WhatsApp: canchas, precios y horarios» (`para-complejos/page.tsx:255`).

**El playbook también quedó viejo** (no lo toca este doc, va a la lista de §4): `10-playbook-ia.md:7` tiene los precios por bandas de antes; `:30` promete «reembolso automático MP», que se eliminó (CLAUDE.md, MercadoPago); `:35` prohíbe «Avisos por WhatsApp», que sigue siendo cierto para avisos y recordatorios, pero el asistente ya existe como Plus.

## 3. Números y fuentes inventados → reemplazo honesto

La propuesta **no usa cupos falsos ni testimonios inventados**. Sí fabrica números y fuentes:

| Lo que dice | Por qué no va | Reemplazo honesto |
|---|---|---|
| «Facturación Bruta Mensual Canchas = 3 canchas x 5 turnos x 30 días x $30.000 = $13.500.000» | Supuesto presentado como cuenta. Lo medido en El Vagón: 1,8 turnos por cancha por día, 26 días abiertos (board 2026-10-21). | Los números del prospecto, dichos por él: "¿Cuántos turnos por día te salen en la semana? ¿Y el finde?" |
| «$120.000 ARS/mes de pérdida directa» | Turno de $30.000 inventado (el F5 de Luján está en $45.000-60.000) y un ausente por semana supuesto. | La calculadora de `/precios`, con SU turno y SUS colgados. En chat: "Pasanos a cuánto está tu turno y cuántos te colgaron este mes, y te hacemos la cuenta." |
| «el software sale gratis» / «seguro contra pérdidas que se paga solo» | Ver §2. | "Por cancha, sale menos de lo que cobrás un turno en el mes." Y si viene al caso: "unas tres horas y media de un encargado por cancha" (a $8.600-9.200 la hora). |
| «Ejemplo complejo promedio (3 canchas)» | El ICP decidido es 4-6 canchas (D1, `decisions/2026-09-02-experimento-30-dias.md`). | Ejemplos con 4, 5 y 6 canchas. |
| «0,65 a la quinta potencia = 0,116 (11,6%)» | El 65% es inventado. La idea (cada paso pierde gente) es buena; el número no. | "Cada paso de más pierde gente: un solo paso de Instagram a WhatsApp." Sin cifra. |
| Las cuatro «(Fuente: …)» sobre PyMEs deportivas, límites de tokens, comportamiento de Claude y SIRTAC/IIBB | No nombran autor, documento ni enlace. Son afirmaciones con forma de cita. | Tratarlas como hipótesis. Solo la de Meta Transparency Center es verificable, y coincide con lo que ya tiene el red team (B.6, `TURNOGOL_MARKETING_RED_TEAM.md:195`). |
| «IIBB (entre 1,5% y 5%…)», «esto me manda al frente con el contador» | El miedo fiscal no apareció en ninguna charla registrada. La única objeción real a la seña fue cultural: DEMO-1 la sintió «avaro / desconfiado» (`10-aprendizajes.md:10`). El primo real es otro: El Vagón oculta sus precios porque el dueño del terreno lo controla (`10-aprendizajes.md:96`). | Preguntarlo en visitas y anotarlo como SIGNAL. En el pitch, sin hablar de impuestos: "La seña es opcional. Si la pedís, el porcentaje lo elegís vos y el resto lo cobrás como siempre." |
| «repeler al 99% de los usuarios», «dueños de canchas de 45 años» | Cifra y edad inventadas. | Sacarlas. |
| Reels con «cuerpo con números reales de Argentina» | No hay cifras de clientes publicables. El testimonio T1 está autorizado sin nombre y sin números. | Los números del que mira (calculadora), precios públicos de la zona o la mecánica del producto. |

## 4. Contra lo que ya tenemos

**Repite (y el repo lo tenía mejor o igual):**
- IG como «Sala de exhibición, NO motor» (`TURNOGOL_MARKETING_RED_TEAM.md:442`) y orgánico sin geografía (B.6, `:195`).
- CTA directo a wa.me y la calculadora (ya está en `/precios`, `CalculadoraClavo.tsx`).
- Outbound desde Maps e Instagram (`02-icp.md`, `06-scripts.md`).
- Meta click-to-WhatsApp geo (E3, `:795`), y "primero el cierre, después el tráfico" (el gate de E3 es justamente el pitch calibrado).
- El test de dos ganchos de su sección 5 es una versión más pobre de E1 (`:793`): 20 conversaciones, tres aperturas sin números, criterio de corte escrito.
- Su variante B («Dejá de renegar pidiendo comprobantes…») es el hook del segmento S8 (`:214`).
- Las palancas de venta en versión honesta ya están en `06-scripts.md:175-188`.

**Contradice:**
- **ManyChat.** Descartado como default (`:47`, `:546`) y listado como DISTRACCIÓN (`:848`). El presupuesto del mes 1 es $20-40k y $0 en ManyChat.
- **«15 complejos por día».** Luján tiene 16 en Maps; la lista «NO es renovable» y la doctrina es «20 buenas > 200 quemadas» (§13.A), desde un número de WhatsApp Business dedicado con 7-10 días de calentamiento y filtrando el Registro No Llame cada 30 días (B.2, `:187`). A 15 por día, la zona se quema en la primera semana.
- **Pauta desde la semana 3.** El gate de E3 pide pitch calibrado por E1 y prerequisitos técnicos cerrados.
- **El bot como gancho de adquisición.** El board del 21/10: «Cobrado aparte, el bot es palanca de **Revenue** con los clientes que ya están, no de **Acquisition**» (`board/2026-10-21-recepcionista-whatsapp.md:109`).
- **La seña como titular.** D2: seña «opcional, nunca titular ni condición; en demos y pilotos se arranca sin seña» (`decisions/2026-09-02-experimento-30-dias.md:22`).
- **Multideporte, "complejo promedio de 3 canchas", "Construcción de la Trampa"** (el encuadre de trampa empuja el tono hacia el que el red team ya descartó), y **número y audio del founder** en vez de voz de empresa.
- **Semana 1 entera para el perfil.** Con 30 días de prueba, solo las altas hasta el ~8/11 llegan a pagar dentro de la ventana de 45 días (~8/12). La semana 1 es la más cara para no salir a hablar.

**Aporta (y se conserva):**
- La objeción fiscal **como hipótesis a preguntar**, no como verdad a contestar.
- La demo del bot en el celular del dueño como imán. Con esta secuencia: hoy, en persona; cuando haya un chat real, un video de 35-45 s; un número demo solo con Kapso pago.
- Nombrar al dueño en los primeros 3 segundos de cada pieza.
- Una destacada de "Caja y cantina" (sin "robo hormiga").
- Seguimiento rápido a 2 h / 24 h / 72 h para el que escribió solo. El frío sigue en +2 / +5 / +12 días (`06-scripts.md:98`).
- Partir el prompt en fases. Útil, pero de poco valor de negocio.

**Le falta:**
- **Referidos, con la única fecha real que tenemos: altas hasta el 31/10** (R2), dentro de 7 días. El dueño de El Vagón está en un grupo de WhatsApp de dueños (`10-aprendizajes.md:85`) y el mensaje está escrito (`06-scripts.md:154`).
- **El Vagón pagando:** prueba hasta el 6/12 sin débito autorizado.
- **Visitas en frío** (2-4 por semana, E2 `:794`) y **proveedores del rubro** (`:445`).
- **El trabajo real del dueño:** en P1 se juntaron «cientos de miles de pesos en turnos jugados y no cobrados: el encargado no los registra» (`10-aprendizajes.md:67`). La fuga medida es lo jugado y no cobrado, no el ausente.
- **Medición:** no hay registro de volumen ni de respuestas de outbound desde el 2/9, y no hay analítica web.

**Contradicciones del repo que la propuesta destapa** (se señalan, no se resuelven acá):
1. **Posicionamiento.** D2 dice fijos y control con seña opcional; L1 y la landing dicen «TurnoGol es el sistema de señas para canchas de fútbol» (`para-complejos/page.tsx:75`). Puede ser por segmento (S8 sí pide seña), pero no está escrito.
2. **Pauta.** E3 la pone en fase 2 con gate; el doc 09 dice "hasta 10 pagos".
3. **Cupos.** R2 y `06-scripts.md:187` dicen «no hay un límite real», pero el red team todavía tiene «los 5 lugares de piloto acompañado del mes» (O1, `:474-486`), «Quedan [N real] lugares» (O3) y «Cinco, no más» (`:738`), y `04-oferta-piloto.md` habla de 5 pilotos.
4. **Tope de referidos.** `10-aprendizajes.md:86` dice 12 meses; la decisión vigente dice 6 (`decisions/2026-09-26-referidos.md:20`).
5. **Voz del founder en scripts vigentes.** `06-scripts.md:162` («Lo hizo Lazar… Escribile»), `:120` («escribime y en 48hs te dejo el sistema andando») y la promesa de O1.
6. **La misma sobrepromesa que la propuesta, adentro del repo:** `CalculadoraClavo.tsx:203` («Con la seña, el turno colgado lo paga el que no vino. No vos.», cuando la seña cubre su porcentaje) y `06-scripts.md:111` («Con que te salve un ausente por mes ya se pagó solo»).
7. **Precio viejo** en `06-scripts.md:171` y `:182` ($47.000 + $30.000) y en `10-playbook-ia.md:7`.
8. **El Vagón y las reservas online.** El board del 21/10 dice que no tiene (`board/2026-10-21-recepcionista-whatsapp.md:17` y `:88`); el 16/10 entraron 10 jugadores nuevos y 9 reservas online (`10-aprendizajes.md:103`).
9. **Seña.** Default 30% en el producto, ~10% en D2, 15-20% en la propuesta.

## 5. El board

**Hormozi — Value Equation.**
- **Veredicto:** ataca el precio con un número que se cae, y eso baja la probabilidad percibida, que es el término que más le falta a una empresa con cero clientes pagos. «Con recuperar 4 turnos al mes, el software sale gratis.»
- El resultado soñado que dijo un cliente real no es plata: «Ahora siento que me sobra el tiempo» (T1.3, `11-testimonios.md`). Y el job medido es control: «el presupuesto ya existe (sueldo); el job es control, no reemplazo» (`10-aprendizajes.md:11`).
- **Cambio:** resultado = "el WhatsApp y la caja dejan de depender de que estés vos"; probabilidad = demo en SU celular + T1 sin nombre; demora = "te lo dejamos andando con tus canchas"; esfuerzo = "no cargás nada"; precio contra SU turno, nunca contra una pérdida inventada.

**Hormozi — Grand Slam (garantías y escasez).**
- **Veredicto:** no hay oferta, hay una demo: termina en «el pase a un asesor humano para activarlo». No hay garantía, ni reversión de riesgo, ni razón para decidir hoy.
- El riesgo cero ya existe y no se usa: «Sin tarjeta. Si no te sirve, lo dejás.» (`para-complejos/page.tsx:86`), la configuración acompañada (`:255`), el export "antes de irte". La única urgencia real es el 31/10 de referidos, y vale para el que refiere, no para el prospecto.
- **Cambio:** oferta en una línea: "30 días gratis y sin tarjeta. Te lo dejamos andando con tus canchas, precios y fijos. Si no te sirve, lo dejás y te llevás tus datos."
- **Pregunta (REQUIERE INPUT 3):** ¿se suma la garantía de O1, «Si en 48hs no está andando, el mes gratis arranca cuando ande»? Cuesta cero y se puede cumplir siempre; el board no la decide.

**Hormozi — $100M Leads (Core Four).**
- **Veredicto:** salta directo a frío masivo y pago, y se saltea los dos canales más baratos: contactos tibios y "lead getters". «Identificar 15 complejos por día en zonas objetivo…»
- Tibio: el grupo de dueños de El Vagón y referidos con fecha. Lead getters: el que vende césped sintético, el distribuidor de bebidas, el organizador de torneos (`TURNOGOL_MARKETING_RED_TEAM.md:445`). Y todo depende de que Lazar escriba y grabe.
- **Cambio:** orden tibio → frío medido (20 por semana + 2-4 visitas) → vidriera → pago con gate. El frío sale de un número de la empresa, para que no dependa de una persona.

**April Dunford — posicionamiento.**
- **Veredicto:** categoría equivocada. «(fútbol 5/7/11, pádel, tenis)» regala lo único que nos distingue, y "bot de reservas" nos pone en la góndola de Clubo ($25.000 por cancha con bot incluido) y JuegaFácil.
- La alternativa real del dueño no es otro software: es WhatsApp + planilla + un empleado (T1: «un sueldo pagado para agendar turnos», `10-aprendizajes.md:90`).
- **Cambio:** "Solo fútbol, hecho para el mostrador": fijos que se repiten solos, cobro por equipo, la caja de la noche. Plus entra como mejora, no como titular.
- **Pregunta (REQUIERE INPUT 8):** el titular del frío ¿señas (L1), control y fijos (D2) o el asistente? ¿O que lo decida E1?

**Eugene Schwartz — consciencia y sofisticación.**
- **Veredicto:** buen instinto, mecanismo ajeno. «DEBEN aclarar siempre el 'Mecanismo de Seña Mínima'». En un mercado en etapa 3-4 (Clubo con ≥23 anuncios activos, `10-aprendizajes.md:18`) hace falta un mecanismo propio, pero "seña chica" no es nuestro, es la configuración por defecto de cualquiera.
- Además el nivel de consciencia cambia por canal: el frío por Maps no sabe que tiene un problema "de sistema"; el que llega por un Reel ya lo sospecha.
- **Cambio:** mecanismos que solo tiene TurnoGol: "el asistente contesta en tu mismo número y se calla cuando contestás vos"; "el fijo se repite solo y marcás quién pagó"; "Equipo 1 pagó · falta Equipo 2"; "la regla de cancelación tardía avisa y suspende sola". Un mensaje por nivel: pregunta de dolor para el frío, mecanismo para el que llega de IG, oferta para el que ya vio la demo.

**Cialdini — objeciones y persuasión.**
- **Veredicto:** ataca una objeción que nadie dijo. «'No quiero pasar todo por Mercado Pago por el contador'» no aparece en ningún registro de campo.
- Las que sí aparecieron, cada una con su principio:
  - "La seña es de avaro" (DEMO-1) → **consistencia**: "La seña es opcional. Si no la querés, prendés la regla de cancelación tardía."
  - "Configurarlo cuesta" (El Vagón, `10-aprendizajes.md:75`) → **reciprocidad**: "Te lo dejamos andando antes de que pagues un peso."
  - "No quiero que se vean mis precios" (El Vagón, `:96`) → se pueden ocultar en la página pública.
  - "¿Y si me voy?" → riesgo cero: el export.
  - "¿Y si el bot contesta mal?" → ves todos los chats, se calla 6 h cuando contestás vos, y pasa a humano.
- **Unidad**: «Hecho en Luján, solo para complejos de fútbol.» (`06-scripts.md:186`). **Escasez**: solo la fecha del 31/10. Nada de comparaciones con ATC ni cantidad de clientes (R6).

**Pirate Metrics (AARRR).**
- **Veredicto:** optimiza una conversión de embudo que no existe. «Tasa de llegada a WhatsApp = 0,65 a la quinta potencia». El cuello está antes: Acquisition no tiene ni registro desde el 2/9.
- La palanca de Activation ya está medida: el día que El Vagón publicó su link entraron 10 jugadores y 9 reservas online (`10-aprendizajes.md:103`). Revenue hoy depende de dos cosas: El Vagón autoriza el débito antes del 6/12, y las altas nuevas entran antes del ~8/11.
- **Cambio:** planilla semanal por etapa desde el día 1: contactados → respondieron → visita o demo → empezó la prueba → publicó su link → primera reserva online → pagó. Meta de 45 días = pruebas activadas (link publicado + primera reserva online) + El Vagón pagando, no "clientes" en abstracto.

**Jobs-to-be-Done.**
- **Veredicto:** de sus dos ganchos, B es un trabajo y A es un número. «a 10 entráles con el ángulo "Dejá de perder $120.000 al mes…" y a los otros 10 con "Dejá de renegar pidiendo comprobantes de transferencia…"».
- B describe algo que el dueño hace con las manos (S8). A pone una cifra inventada sobre la seña, en un complejo donde el 86% de los turnos se cobra en efectivo (`board/2026-09-15-precio-por-cancha.md:93`). Y los trabajos que sí se observaron son fijos, cancelaciones y control de lo cobrado (`10-aprendizajes.md:9`, `:67`).
- **Cambio:** correr E1 como está escrito (tres aperturas sin números). La B de la propuesta entra como cuarta variante solo para complejos que ya cobran seña por transferencia.

**SaaS pricing (value metric / ProfitWell).**
- Van Westendorp no se usa: el founder lo descartó el 2026-09-17 («Preguntarle a un dueño cuánto pagaría devuelve lo que le conviene decir», `board/2026-09-15-precio-por-cancha.md:91`). Esta lente mira value metric y anclaje.
- **Veredicto:** precio viejo y producto equivocado como ancla. «Ejemplo complejo promedio (3 canchas): $107.000». Con el bot como gancho, la referencia real es plan + Plus = $50.000 por cancha: El Vagón pasaría de 0,8% a ~1,3% de lo que factura, arriba del techo de comodidad de 1-1,1% (board 2026-09-15). Un complejo de solo F5 al mismo ritmo quedaría en 1,8-2,1%, el doble que Clubo con bot incluido.
- El value metric (canchas) está bien: el dueño piensa en canchas.
- **Cambio:** vender el plan; Plus después de activar. Ancla: "$30.000 por cancha: menos que un turno por cancha en el mes."
- **Pregunta (REQUIERE INPUT 2):** ¿Plus es gancho, incluido en la prueba, o extra después de activar?

**Coincidencias.**
- Hormozi (Value Equation) y JTBD coinciden en que el valor es tiempo y control, no la pérdida por ausentes.
- Dunford y SaaS pricing coinciden en que poner el bot al frente nos compara con competidores que lo incluyen.
- Core Four y AARRR coinciden en que el canal tibio tiene fecha (31/10) y está apagado.
- Schwartz y Cialdini coinciden en que la "seña mínima" es buena respuesta a una objeción mal diagnosticada.

## 6. Fuera del board

**Dan Kennedy — respuesta directa.** *(fuera del board)*
- **Veredicto:** un solo mecanismo de respuesta para todas las piezas impide saber qué funciona. «CTA a la palabra 'CANCHA'». Tampoco hay deadline ni medición por pieza.
- **Cambio:**
  - Cada pieza con su wa.me y su texto precargado, que no nombra a nadie: "Hola! Vi el video de la caja. Tengo un complejo de __ canchas en __." Así se cuenta qué pieza trae conversaciones y se califica en el mismo mensaje.
  - Deadline solo si es real: el 31/10 para referidos. Nunca uno inventado.
  - Cada lunes: conversaciones por pieza; la que no trae nada en dos semanas, se corta.
  - Confesión que vende: "Somos chicos: te atendemos nosotros por WhatsApp."

**Aaron Ross — Predictable Revenue.** *(fuera del board)*
- **Veredicto:** «usás esos 90 minutos diarios en dos motores predecibles» describe tiempo, no un proceso. Nada se puede pasar a otra persona: el número, el audio y la voz son del founder.
- **Cambio:**
  - Separar tres trabajos: armar la lista (la IA la arma, una persona la revisa; la IA no manda nada, regla 4 de `10-playbook-ia.md:17`), prospectar y cerrar.
  - Cadencia escrita: D0 pregunta → +2 valor → +5 visita o llamada → +12 cierre (`06-scripts.md:98`). Inbound: 2 h / 24 h / 72 h.
  - Número y voz de la empresa, para que la cadencia la pueda seguir otro.
  - Semillas (referidos) y lanzas (frío 1:1) ahora; redes (pauta) después de E1.
  - Tensión a decir: el activo de confianza de esta fase es «el pibe de acá que vino al complejo» (`TURNOGOL_MARKETING_RED_TEAM.md:397`). Voz de empresa no es sin cara: quien visita se presenta "de TurnoGol".

## 7. Síntesis, por impacto

1. **Ejecutable ya.** Lo tibio, antes del 31/10.
   - Pedirle al dueño de El Vagón que reenvíe al grupo de dueños el mensaje de `06-scripts.md` §8b, en voz de empresa (versión en §8.4).
   - Que El Vagón autorice el débito antes del 6/12. Es el único Revenue posible dentro de la ventana.
2. **Ejecutable ya.** El motor de frío, medido desde el día 1.
   - 20 contactos por semana desde el número de TurnoGol, más 2-4 visitas, con las tres aperturas de E1.
   - La vidriera de IG se arma en una tarde, no en una semana.
   - Planilla por etapa (§5, AARRR) en `docs/gtm/data/` (git-ignored) o fuera del repo: tiene teléfonos de terceros.
3. **Ejecutable ya.** Antes de pedirle una sola pieza a otra IA, corregir la ficha del prompt: precio, solo fútbol, seña opcional del 10 al 100%, cancelación tardía, Plus construido pero sin clientes vivos, y nada de impuestos, "robo hormiga" ni "tiempo real". Un wa.me por pieza. El prompt corregido está en §8.4.
4. **REQUIERE INPUT.** Plus como gancho o como extra, y qué demo se muestra (preguntas 2 y 6).
5. **REQUIERE INPUT.** La seña en el pitch y por defecto, la garantía, extender referidos y la pauta (preguntas 1, 3, 4 y 5).

## 8. La versión potenciada

Mismo esqueleto que la propuesta, con los cambios del board aplicados. Lo que va entre comillas o en bloque es copy listo, en voz de empresa.

### 8.1 Veredicto y criterios

- **Objetivo real de 45 días (24/10 → 8/12):** El Vagón pagando y pruebas activadas (link publicado + primera reserva online). Las altas tienen que entrar antes del ~8/11 para que paguen dentro de la ventana.
- **Restricciones efectivas:**
  1. Lista finita: Luján tiene 16 complejos en Maps y H4 (≥15 del ICP puro en el corredor) sigue abierta.
  2. Tiempo: founder con trabajo de tiempo completo, ~90 minutos por día.
  3. Plata: $20-40k el mes 1, $0 en pauta y en ManyChat hasta que pase el gate.
  4. Prueba social: un testimonio sin nombre ni números. Cero cifras de clientes publicables.
- **Criterio divisor:** conversaciones con dueños reales por hora invertida, medidas por pieza, sin prometer nada que no esté construido.

### 8.2 Hallazgos del board

1. El argumento de plata se cae con la propia seña de la propuesta; el valor que dijo un cliente es tiempo y control.
2. Lo tibio (referidos hasta el 31/10, el grupo de dueños) es el canal más barato y el único con fecha real.
3. Poner el bot al frente cambia de góndola y de precio: nos compara con quien lo incluye.
4. Sin planilla por etapa y por pieza, a los 45 días no vamos a saber qué funcionó.

### 8.3 Qué se conserva

- IG como vidriera, no como motor.
- Nombrar al dueño en los primeros 3 segundos: "Si tenés un complejo de fútbol…".
- Un solo paso de la pieza a WhatsApp.
- La demo del bot, cuando haya un chat real que mostrar.
- Seguimiento rápido al que escribió solo.
- Primero el cierre, después el tráfico.

### 8.4 Sistema corregido

**Cambio de enfoque:** de "vidriera + tráfico" a "conversaciones con dueños, medidas".

**Semana 1 (24/10 → 31/10): lo tibio y el arranque.**
- Mensaje al grupo de dueños vía El Vagón (abajo), antes del 31/10.
- El Vagón autoriza el débito.
- Primeros 20 contactos con las aperturas de E1, chequeando antes el Registro No Llame.
- Vidriera en una tarde: bio, 4 destacadas, 3 fijados.
- Planilla por etapa armada.

**Semanas 2 a 6 (1/11 → 8/12): el motor.**
- 20 contactos nuevos por semana con cadencia +2 / +5 / +12, más 2-4 visitas (14-17 h).
- Dos piezas por semana a la vidriera, cada una con su wa.me.
- Video de 35-45 s del asistente cuando exista un chat real (de El Vagón, con su permiso y los datos tapados).
- Pauta solo si pasa el gate y con presupuesto aprobado (REQUIERE INPUT 5).
- Revisión cada lunes: qué apertura, qué pieza y qué canal trajo conversaciones.

**Costos y desventajas.**
- Se pierde la escala de ManyChat y el volumen de 15 por día. Es deliberado: la zona no se renueva.
- El frío 1:1 es lento y no se puede mostrar como "tracción" en redes.
- Sin número de empresa propio, la cadencia sigue atada a una persona (REQUIERE INPUT 10).

**Mensaje para el grupo de dueños, en voz de empresa** (lo edita y lo manda el dueño que refiere; lo que va entre `[ ]` entra solo si es verdad para él):

```
Muchachos, les paso algo que uso en [complejo] hace [N] semanas: TurnoGol.
[Lo que más le sirvió, con sus palabras.] En el mostrador se anota cada
turno y cada venta de la cantina, y ves qué se cobró y qué no [sin estar
ahí]. Es un sistema de Luján, solo para complejos de fútbol: te lo dejan
andando con tus canchas y tus precios, y lo probás 30 días gratis, sin
tarjeta. Escribiles: [wa.me de TurnoGol con "Hola, vengo de parte de [complejo]"]
```

**Aperturas de frío (E1, voz de empresa).** Una sola pregunta, sin números:
- A: "Hola, ¿cómo andás? Te escribimos de TurnoGol, un sistema para complejos de fútbol de la zona. Una pregunta corta: ¿cuántos turnos te colgaron este mes?"
- B: "Hola, ¿cómo andás? Te escribimos de TurnoGol, un sistema para complejos de fútbol de la zona. ¿Cómo controlás hoy las reservas del día: cuaderno, planilla, WhatsApp?"
- C: "Hola, ¿cómo andás? Te escribimos de TurnoGol, un sistema para complejos de fútbol de la zona. ¿Tus jugadores pueden reservar solos desde una página del complejo?"
- Si contesta: "Si querés, pasamos 10 minutos por el complejo y te lo mostramos en tu celular, con tus canchas."

**Seguimiento del frío:**
- +2: "Te dejamos un video de un minuto de cómo un jugador reserva desde la página del complejo: [link]. Cualquier duda, escribinos."
- +5: "¿Pudiste verlo? Si nos pasás a cuánto está tu turno, te hacemos la cuenta de lo que se va con los turnos colgados y te mostramos cómo queda con tus canchas." (Sin "ya se pagó solo".)
- +12: "Último mensaje, así no te llenamos el WhatsApp. Si los turnos por WhatsApp te andan bien, listo. Si algún finde de colgados te hace ruido, escribinos y te lo dejamos andando."

**Seguimiento del que escribió solo:** 2 h "¿Cuántas canchas tenés y en qué zona? Así te mostramos cómo queda." · 24 h "¿Te queda bien que pasemos 10 minutos por el complejo, o preferís que te lo mostremos por videollamada?" · 72 h "Te dejamos el link para probarlo 30 días sin tarjeta: [link]. Si preferís, te lo configuramos nosotros."

**Prompt maestro corregido** (para pegarle a otra IA; reemplaza el de la propuesta):

```
<rol>
Sos copywriter de respuesta directa para un SaaS B2B vertical en Argentina.
Escribís en español rioplatense, en voz de empresa ("te escribimos",
"escribinos", "te ayudamos"), nunca en primera persona de un fundador.
Palabras del dueño: "turno colgado", "te colgaron un turno", "el que no
viene", "ausente". Nunca "clavo": no es de uso común en los complejos.
</rol>

<producto> (ficha verificada al 2026-10-24; no agregues nada que no esté acá)
- TurnoGol: sistema para complejos de FÚTBOL en Argentina. Solo fútbol.
- Página propia del complejo con su link: los jugadores reservan solos, 24/7.
- Seña OPCIONAL: si el complejo la pide, elige el porcentaje (de 10% a 100%)
  y la plata entra directo a su MercadoPago. TurnoGol no toca la plata.
  Si el jugador no paga a tiempo, el turno se libera solo.
- Sin seña: regla de cancelación tardía (opcional): el que cancela encima de
  la hora suma un aviso, después 7 días y después 30 días sin reservar online.
  El que falta 2 veces en 90 días queda 14 días sin reservar online.
- Turnos fijos que se repiten solos; se marca quién pagó cada vez.
- Cobro por equipo ("Equipo 1 pagó · falta Equipo 2").
- La caja de la noche: reservas, cantina y lo que falta cobrar en un cierre;
  lo jugado y no cobrado aparece en rojo. Stock de la cantina con "Para reponer".
- El encargado entra con su usuario; Configuración y Métricas quedan para el dueño.
- Placa de turnos libres para historias. Precios ocultables en la página.
- Antes de irse, el complejo se baja reservas, fijos y clientes en CSV.
- TurnoGol Plus (EXTRA pago): un asistente que contesta en el mismo WhatsApp
  del complejo, muestra turnos libres, reserva, cancela y pasa a una persona.
  Se calla cuando contesta el dueño. No tiene clientes usándolo todavía:
  no escribas resultados ni testimonios del asistente.
</producto>

<precio>
- $30.000 por cancha por mes, incluida la primera. Pagando el año, 10% menos.
- Plus: $20.000 por cancha por mes, aparte.
- 30 días de prueba sin tarjeta. Si no le sirve, lo deja.
- [IVA: pendiente de definir. No escribas "+IVA" ni "precio final".]
</precio>

<prohibido>
- Inventar números de resultados, clientes, testimonios, cupos o fuentes.
  Los únicos números válidos: el precio, la mecánica del producto y los
  números que diga el propio dueño.
- Decir "sale gratis", "se paga solo" o "recuperás $X".
- Prometer nada impositivo o contable.
- "Robo", "robo hormiga" o insinuar que el empleado roba. Encuadre válido:
  "No es que te roban. Es que el papel pierde."
- "Tiempo real" para el jugador. Pádel, tenis u otros deportes.
- Recordatorios automáticos, mensajes masivos, validar comprobantes de
  transferencia, app para bajar, facturación AFIP, billetera.
- Comparar con competidores por nombre.
</prohibido>

<camino>
Cada pieza termina en UN link wa.me de TurnoGol con texto precargado propio
de esa pieza, que no nombra a ninguna persona, por ejemplo:
"Hola! Vi el video de la caja. Tengo un complejo de __ canchas en __."
No hay ManyChat ni palabra clave. Del otro lado contesta una persona.
</camino>

<fase_1>
Escribí completo, sin marcadores tipo "[insertar beneficio]":
1. Bio de Instagram (máx. 150 caracteres) + texto del link.
2. 4 historias destacadas, 4 placas cada una (texto en pantalla + qué se ve):
   "Cómo funciona", "Seña y faltas", "Caja y cantina", "Precio".
3. 3 publicaciones fijadas (carrusel placa por placa):
   - "La cuenta del turno colgado": el dueño pone SU turno y SUS colgados.
   - "Una reserva de punta a punta": capturas con datos de ejemplo, marcadas así.
   - "Lo que nos preguntan": ¿y los fijos?, ¿y si cancelan?, ¿cuánto sale?
Arrancá solo con la FASE 1.
</fase_1>
```

**Copy de la fase 1** (punto de partida; la IA lo desarrolla):
- **Bio:** "Sistema para complejos de fútbol. Reservas online, fijos, seña opcional y la caja de la noche. Hecho en Luján. Escribinos 👇" · link: wa.me de TurnoGol con "Hola! Vengo del Instagram. Tengo un complejo de __ canchas en __."
- **Destacadas:**
  - "Cómo funciona": tu página → el jugador elige turno → aparece en tu grilla → fijos y cobro por equipo.
  - "Seña y faltas": la seña es opcional y el porcentaje lo elegís vos · entra directo a tu MercadoPago · si no paga, el turno se libera solo · sin seña, la regla de cancelación tardía.
  - "Caja y cantina": la caja de la noche en un cierre · lo jugado y no cobrado en rojo · "Para reponer" · "No es que te roban. Es que el papel pierde."
  - "Precio": $30.000 por cancha por mes, incluida la primera · 10% menos pagando el año · 30 días sin tarjeta · si no te sirve, lo dejás y te llevás tus datos · extra: el asistente de WhatsApp.
- **Fijados:** los tres de `<fase_1>`. El tercero sale de las preguntas que hicieron los dueños en las dos demos (`10-aprendizajes.md:9`), no de objeciones supuestas.

**Cómo pedir las fases siguientes:**
- **Fase 2 (el cierre en WhatsApp):** "Escribí las respuestas de una persona de TurnoGol a los primeros mensajes de cada pieza: calificar (canchas y zona) en un mensaje, ofrecer 10 minutos en el complejo o videollamada, y el seguimiento a 2 h, 24 h y 72 h. Sin bot, sin cálculo de ahorro automático."
- **Fase 3 (Reels):** "Escribí 6 guiones de 30-45 s: 2 de dolor sin números inventados (el WhatsApp a las 11 de la noche, el fijo que no avisó), 2 de mecanismo (fijo que se repite, cobro por equipo, caja de la noche) y 2 de oferta (30 días sin tarjeta, te lo dejamos andando). Hook de 3 segundos que nombre al dueño de un complejo de fútbol. CTA al wa.me de cada pieza."
- **Fase 4 (plan de 45 días):** "Armá el calendario semanal: 20 contactos nuevos con la cadencia D0/+2/+5/+12, 2-4 visitas, 2 piezas a la vidriera y la revisión de los lunes con la planilla por etapa. La pauta queda en un apartado aparte, condicionada al gate de E3."

### 8.5 Incertidumbres y cómo resolverlas

- **¿Qué apertura abre más conversaciones?** E1 (`TURNOGOL_MARKETING_RED_TEAM.md:793`): 20 conversaciones rotando A/B/C. Gana la que saque ≥1,5x con 10 o más conversaciones; si la respuesta total es <10%, el problema es el canal o la lista, no el gancho.
- **¿Visita o WhatsApp?** E2 (`:794`): 10 visitas vs 20 WhatsApp en la misma semana y zona; se mide demos por hora. El que gana se lleva el 70% de las horas.
- **¿Existe el miedo fiscal?** Preguntarlo en cada visita, sin inducir ("¿Qué te frena de cobrar la seña por MercadoPago?"), y anotarlo como SIGNAL en `10-aprendizajes.md`.
- **¿Plus vende o retiene?** Se decide con los chats reales de El Vagón cuando conecte (cuántos mensajes, cuántas reservas cerró el asistente, si llega al tope de Kapso).
- **¿Pauta?** E3 (`:795`), solo con el gate: 8-10 días a USD 5-8 por día, un conjunto de anuncios a ~25 km, mensaje precargado que califica. Éxito: costo por conversación calificada ≤$10.000; fracaso: >$25.000. Se cuenta a mano en la planilla, con origen.
- **¿Cuántos complejos del ICP hay en el corredor?** H4 sigue abierta; se cierra armando la lista de la semana 1.

## 9. REQUIERE INPUT

1. **Seña en el pitch y por defecto.** ¿Decimos "es opcional, el porcentaje lo elegís vos (desde 10%)", recomendamos un porcentaje, o arrancamos sin seña como dice D2? ¿Se baja el 30% por defecto del producto?
2. **Plus.** ¿Es el gancho de la primera charla e incluido en la prueba, o un extra que se ofrece después de activar?
3. **Garantía.** ¿Se ofrece la de O1, «Si en 48hs no está andando, el mes gratis arranca cuando ande»? ¿Hay un límite real de configuraciones acompañadas por semana, y se dice (sin convertirlo en cupo)?
4. **Referidos después del 31/10.** ¿Se extienden? ¿Hasta qué fecha, por escrito? (Aparte: `10-aprendizajes.md:86` dice tope de 12 meses y la decisión vigente dice 6.)
5. **Pauta (E3).** ¿Hay presupuesto para una ráfaga de ~$100-150k? ¿Qué gate manda: el de E3 (pitch calibrado + prerequisitos) o el del doc 09 (10 pagos)?
6. **Demo.** ¿Complejo demo en prod sin bot, número demo con el asistente (Kapso pago; el tope gratis de 2.000 mensajes puede ser compartido con El Vagón) o solo un video con un chat real?
7. **IVA (D9 sigue abierta).** ¿Los $30.000 son precio final o "+IVA"?
8. **Titular del frío.** ¿Señas (L1), control y fijos (D2) o el asistente? ¿Uno por segmento, o lo decide E1?
9. **El Vagón.** ¿Le pedís que reenvíe el mensaje al grupo de dueños esta semana? ¿Se puede usar su chat real (con su permiso y los datos tapados) para el video del asistente?
10. **Número del outbound.** ¿El WhatsApp de TurnoGol (`src/lib/contact.ts`) es de la empresa o personal? ¿Sacamos un chip de WhatsApp Business dedicado, con 7-10 días de calentamiento?
