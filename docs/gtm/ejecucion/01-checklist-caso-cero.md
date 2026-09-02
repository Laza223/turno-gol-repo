# Checklist del caso cero (P1)

> P1 = primer piloto real. 3 meses gratis como **excepción de aprendizaje**. Objetivo: baseline antes de tocar nada, activación A1 en la semana 1, y evidencia real de A/B/C/D, precio y referidos. Datos crudos en `docs/gtm/data/baseline-P1.md` (fuera de git); acá solo se tildan pasos y se anotan conclusiones anonimizadas.

Regla de oro: **primero escuchar, después configurar.** Nada de mostrar pantallas hasta terminar la sección "Día 0 — antes de tocar".

## Día 0 — antes de tocar (una conversación, 45-60 min)

- [ ] **Encuadre honesto** (decirlo así): "Sos el primer complejo real. Los tres meses son gratis porque vos me enseñás cómo laburás y qué te sirve; no es el precio normal. Después del piloto, para tus [N] canchas el plan sale $[X] por mes. Te lo digo hoy para que no haya sorpresas."
- [ ] **Baseline completo** con [`02-plantilla-baseline-piloto.md`](02-plantilla-baseline-piloto.md). Sin saltear los de plata (fijos, mora, colgados, encargado).
- [ ] **Pregunta 1 de WTP** (textual, después del baseline): *"¿Qué tendría que pasar durante estos tres meses para que al final digas que no querés volver a manejar el complejo como antes?"* → anotar respuesta textual.
- [ ] **Pregunta 2 de WTP** (textual): *"Sabiendo que después del piloto el plan cuesta $[X] por mes, ¿qué tendría que resolver TurnoGol para que pagar eso tenga sentido?"* → anotar textual + reacción no verbal al número.
- [ ] **Número de éxito**: "¿Con qué número al día 90 decís 'esto me sirve'?" Que lo diga él (reservas, fijos al día, caja cuadrada, lo que sea). Anotar textual.
- [ ] **Contrato de aprendizaje** (por WhatsApp, escrito, ese mismo día): precio de lista al día 91 · su número de éxito · **un solo compromiso para la semana 1: pasarme la foto del cuaderno/Excel de fijos, precios y horarios** · garantía: "si en 48 h no está andando, los 3 meses arrancan cuando ande" · canal y horario de soporte (decir cuándo respondés y cuándo no).
- [ ] **Seña**: no proponerla. Si él la menciona, ofrecer "empezamos sin seña; cuando quieras, la prendemos chica, tipo la parte de un jugador (~10%), y vemos cómo reacciona la gente". Anotar textual qué dijo de la seña, aunque no la haya mencionado (preguntar al final: "¿cobrás algo por adelantado hoy?").
- [ ] **Referidos / grupos**: "¿Estás en algún grupo de WhatsApp con otros dueños de complejos? ¿Se pasan cosas entre ustedes?" → anotar cuántos grupos, qué se comparte, si reenviaría algo cuando tenga resultados.
- [ ] **Relación previa**: anotar cómo llegó (conocido, referido, frío) y hace cuánto esperaba usar TurnoGol.
- [ ] **Permiso de caso**: "Si esto anda, ¿te molestaría que cuente los números con el nombre del complejo?" → sí / no / después.
- [ ] Registrar en `10-aprendizajes.md`: 1 línea FACT por dato duro, 1 SIGNAL por reacción.

## Día 0 — configuración interna (después de la charla, sin el dueño)

- [ ] **Extender el trial a 90 días** desde el super-admin (acción de soporte de extensión de trial en el detalle del tenant). Sin esto, el cron bloquea a P1 el día 31.
- [ ] Verificar `requires_deposit = false` (default) y **no** tocar el 30% del código: si pide seña, se configura ~10% **en su tenant** desde Configuración → Reservas.
- [ ] Verificar `marketplace_visible` según lo que él quiera ("¿querés aparecer en el buscador público ya, o esperamos?").
- [ ] Crear el usuario `manager` del encargado (invitación desde Equipo) para el día 1-2.
- [ ] Anotar en el CRM la fila de P1 (etapa `piloto-activo`, `precio_comunicado = sí`, `fecha_fin_piloto`).

## Días 1-2 — grilla viva (la carga la hace el founder)

- [ ] Cargar **todos los fijos** con su día, hora, cancha y precio por sesión (abonados) — es la puerta D.
- [ ] Cargar precios por franja, horarios, `closes_next_day` si cierra pasada la medianoche.
- [ ] Cargar como reservas manuales los turnos ya tomados de esta semana (grilla llena desde el día 1).
- [ ] Logo/portada solo si los tiene a mano; no pedir fotos.
- [ ] **Entrenar al encargado 20 min** (presencial o video): grilla, reserva manual, marcar pago de fijo, cobrar en mostrador, cerrar caja. Instalar el push en el celu del dueño y del encargado.
- [ ] Definir con el dueño **qué se anota primero en TurnoGol y qué en el papel** esta semana: la meta es que el papel quede solo como respaldo.
- [ ] `10-aprendizajes.md`: cuánto tardó la carga, qué no entró en el modelo (fricción de adopción = excepción válida del freeze, **solo si se observa**).

## Días 3-7 — A1 (activación del complejo)

Medir cada día (2 minutos, desde super-admin → Actividad, o preguntando):

- [ ] ¿El encargado abrió la grilla hoy? (meta: ≥5 de 7 días)
- [ ] ¿Se cerró la caja en TurnoGol hoy? (meta: ≥5 de 7 días)
- [ ] ¿Se marcaron los pagos de fijos de la semana? (meta: 100% de los fijos con estado)
- [ ] ¿Se cargó al menos una reserva nueva a mano?
- [ ] ¿Volvieron al papel en algún momento? ¿Por qué? (textual)
- [ ] Problemas encontrados → `10-aprendizajes.md` con etiqueta `BLOCKER` o `FRICCIÓN` (solo esto habilita programar).

**Checkpoint día 7:** A1 = sí si se cumplen las tres metas. Recién ahí:
- [ ] Proponer los otros tres compromisos: link en bio de IG, QR en el mostrador, responder "¿tenés cancha?" con el link (texto guardado listo).
- [ ] Preguntar cómo se sintió el encargado (escala 1-5 y textual). Es la persona que decide la adopción.
- [ ] Registrar A1 en el panel ([`00-README.md`](00-README.md) ESTADO).

## Días 8-14 — A2 en observación

- [ ] Link publicado (bio, estado de WhatsApp, QR) — fecha exacta de publicación.
- [ ] Contar reservas online por semana y **quién** las hizo: fijos/conocidos vs desconocidos (A2 = desconocido).
- [ ] Si el dueño prende la seña: fecha, %, y textual de por qué. Medir reservas con seña vs sin.
- [ ] **Kill criteria (día 14):** el link no está publicado pese a 2 recordatorios · nadie abrió la grilla 7 días seguidos · el dueño evita la charla. Si pasa: conversación honesta ([GTM 04](../04-oferta-piloto.md) tiene el texto), registrar el motivo. No es fracaso del producto: es dato.

## Día 30 — primer cierre

- [ ] Números de P1: fijos cargados, % de fijos con pago marcado a tiempo, días con caja cerrada, reservas manuales, reservas online (fijos / conocidos / desconocidos), seña prendida sí/no, problemas.
- [ ] A2: ocurrió o no. Si no, diagnóstico: ¿el link circuló? ¿hubo visitas al perfil? No es prueba en contra del North Star; es señal.
- [ ] Repetir la **pregunta 2 de WTP** con el número real: "van [N] fijos al día y [M] días de caja cerrada; sabiendo que sale $[X], ¿tiene sentido?" → textual. Sigue siendo SIGNAL, no validación.
- [ ] **Pedido de referido** (si A1 ocurrió y él está contento): "¿Conocés otro dueño al que le pase lo mismo con los fijos? ¿Le reenviás esto?" + texto listo con SUS números. Registrar si reenvió.
- [ ] Borrador del **caso** (anonimizado hasta tener permiso): 5 números, 1 frase textual del dueño.
- [ ] Actualizar [`07-tablero-hipotesis.md`](07-tablero-hipotesis.md) con lo que P1 aportó a H1, H2, H3.

## Día 60 — conversación de continuidad (no el 90: no negociar contra el vencimiento)

- [ ] Recordar el contrato: precio, su número de éxito, dónde está hoy contra ese número.
- [ ] Preguntar directo: "¿Seguimos el día 91 a $[X]?" → sí / no / condiciones. Textual.
- [ ] Si duda: **no extender gratis**. La concesión posible es "primer mes pago con garantía: si al final del mes decís que no te sirvió, te lo devuelvo" (REQUIERE INPUT de Lazar antes de ofrecerla).

## Día 91 — la única validación fuerte de WTP

- [ ] Paga → FACT: WTP validado en N=1, a precio de lista, sin descuento. Registrar método de pago y fricción del checkout.
- [ ] No paga → FACT igual de valioso: motivo textual, contra qué comparó, qué le faltó. Registrar sin defender el producto.

## Qué NO hacer con P1

No prometer export del complejo (hoy solo hay CSV de métricas), aviso por WhatsApp al jugador, cobro automático de fijos, ni "te traigo jugadores". No programar nada que P1 no haya pedido **después de usarlo**.
