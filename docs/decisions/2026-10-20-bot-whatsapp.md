# Decisión: bot de WhatsApp con IA como extra pago ("Recepcionista")

**Fecha:** 2026-10-20 · **Decide:** Lazar (founder) · **Insumos:** charla con el dueño del piloto (El Vagón) del 2026-10-20 ([`10-aprendizajes.md`](../gtm/ejecucion/10-aprendizajes.md)); relevamiento de competidores ([`2026-09-01-competidores-v2.md`](../gtm/research/2026-09-01-competidores-v2.md)); investigación de la WhatsApp Business Platform, Kapso y pricing de Meta y Anthropic del 2026-10-20.

**Acota D4** de [`2026-09-02-experimento-30-dias.md`](2026-09-02-experimento-30-dias.md) y **F2** de [`2026-10-14-foco-jugador-rival.md`](2026-10-14-foco-jugador-rival.md). El freeze sigue para todo lo demás. Se libera un solo producto: un bot que atiende el WhatsApp del complejo, contesta consultas y reserva turnos. Entran también las pantallas mínimas del panel que el bot necesita.

**Supera** "WhatsApp descartado para v1" de `CLAUDE.md`. El ADR-003 que se citaba es de email y no analiza WhatsApp. Las razones del descarte eran de costo: [`doc4`](../spec/doc4_monetizacion.md) §WhatsApp y [`DECISIONES_SISTEMA.md`](DECISIONES_SISTEMA.md) ("es muy caro"). Con el pricing de Meta vigente desde el 2026-10-01, ese costo lo paga el complejo y las primeras 1.000 respuestas por mes y por número son gratis.

Se decide **a sabiendas** de dos cosas:
- La evidencia es un solo cliente. Le ofrecieron un bot de terceros, le gustó más que el link de reserva de TurnoGol y dijo que paga. Es una señal, no una validación.
- JuegaFácil y Clubo traen el bot incluido en el plan. Para ellos es lo mínimo esperable, no un diferencial.

---

## W1 — Qué hace (v1)

- Contesta las preguntas frecuentes con los datos que el complejo ya cargó: dirección, horarios, canchas, precios, seña y política de cancelación.
- Muestra los turnos libres y **reserva dentro del chat**. Respeta `settings.requires_deposit`: si el complejo pide seña, manda el link de MercadoPago y confirma por WhatsApp cuando se acredita.
- Pasa la conversación a un humano con un motivo de **enum cerrado**, y se calla en un chat cuando el dueño contesta desde su celular.
- **No** es un asistente general. Los términos de Meta (§4.7, vigentes desde el 2026-01-15) prohíben los bots de IA de propósito general y permiten los de atención de un negocio.

## W2 — Canal

- Usa **coexistencia**: el número del complejo sigue en su app WhatsApp Business y además se conecta a la Cloud API. No soporta WhatsApp para Windows.
- **Piloto vía Kapso** (Kapso Inc., Solution Partner), con un setup link por complejo y webhook `kind: "kapso"` (payload v2). Se eligió ese y no `kind: "meta"` porque trae la transcripción de los audios y el origen del mensaje, que separa al dueño contestando desde el celular de los envíos del bot. Todo lo de Kapso vive en `src/lib/kapso/`; al pasar a Tech Provider se reemplaza ese parser.
- **En paralelo**, TurnoGol tramita ser **Tech Provider** propio de Meta. Al aprobarse, la app propia se conecta a Kapso como "own Meta app" y después se evalúa dejar Kapso.
- **TurnoGol paga toda la infraestructura, Meta incluida** (decisión del dueño, 2026-10-21; reemplaza "el complejo le paga a Meta con su tarjeta"):
  - A Meta se le paga con créditos de Kapso (`partner_managed` en el setup link), cargados en dólares. El complejo no carga ninguna tarjeta.
  - **Si el saldo llega a cero, Kapso frena todos los envíos del número**, incluso los gratis. Hace falta colchón y alerta.
  - Volver después a la tarjeta del complejo exige un WABA nuevo. No importa mientras pague TurnoGol.
  - Con la app propia de Tech Provider, los créditos de Kapso solo funcionan dentro de una Multi-partner Solution, que exige el plan Platform (USD 299 por mes).
  - Números y opciones de precio: [board del 2026-10-21](../gtm/board/2026-10-21-recepcionista-whatsapp.md).
- Se descartan las librerías no oficiales (Baileys y similares): violan los términos y si banean el número el complejo pierde su canal de atención.

## W3 — IA

- **Un solo proveedor: Anthropic**, con `claude-haiku-5-5`. Medido en el banco de pruebas (76 conversaciones, USD 0,10 / 0,50 por millón de tokens): USD 0,0014 por conversación en promedio y 0,0025 en el percentil 90.
- Si falla: reintento, y si sigue fallando se pasa a humano.
- Sin proveedores de respaldo, para no sumar subprocesadores por centavos de ahorro.
- Los audios usan la transcripción que manda Kapso. Groq y OpenAI no se suman como subprocesadores.
- **Sin texto libre configurable por el dueño** ("reglas del bot"), por el veto de texto libre sobre personas (Ley 25.326).

## W4 — Datos y privacidad

- Mensajes y chats se guardan 30 días y después se purgan. Son también la instrumentación del piloto: reservas, respuestas, porcentaje de audios y costo.
- Anthropic y Kapso se suman a los subprocesadores de `/privacidad`.
- La reserva por WhatsApp es sin cuenta (`guest_name`/`guest_phone`). El ban por complejo se cruza por teléfono contra `tenant_player_bans`, que es el mismo mecanismo de siempre.

## W5 — Arquitectura habilitada

- Un tercer webhook: `/api/webhooks/whatsapp`. Route Handlers siguen siendo solo para webhooks, `/api/public/*` y auth callbacks.
- El turno del bot corre en un job de pg-boss en los workers de Railway, nunca en Vercel.
- Feature flag `whatsapp_bot` (global en `false`) más `whatsapp_connections.enabled` como corte por complejo.
- `bookings.whatsapp_chat_id` va **sin foreign key**. Con `ON DELETE SET NULL`, purgar un chat haría un UPDATE sobre reservas terminales, y el trigger de invariantes lo prohíbe: la purga de 30 días abortaba entera. Sin FK, el id sobrevive y sigue marcando el origen de la reserva.
- **Reservas sin seña por el bot: hasta 2 futuras por chat** (decisión del dueño, 2026-10-20). Para la tercera, el bot manda el link de la página del complejo en TurnoGol, donde rigen las reglas de siempre. Quien reserva por WhatsApp no tiene cuenta y no acumula strikes por ausencia; si aparecen ausencias reales en el piloto, el strike por teléfono se diseña con esa evidencia.
- El tope anti-abuso es de 30 respuestas del bot por chat y por hora, contado en la base. No usa el rate limiter de Upstash, porque el worker de Railway no depende de él.
- Si MercadoPago devuelve al jugador a la web después de pagar la seña, cae en `/reserva/{id}/whatsapp`, una página estática sin datos. El resultado del pago se le confirma por el chat.
- **Respuestas del dueño a las preguntas de la revisión final** (2026-10-21):
  1. **Pausa:** cuando el dueño contesta un chat desde su celular, el bot se calla **6 h** en ese chat, no 4. Es un plazo fijo.
  2. **Reservas sin seña:** se aceptan las que llegan desde teléfonos no verificados, con el tope de 2 por chat. No se pide verificación.
  3. **Monitoreo del consumo:** lo mira el dueño. Se va a hacer en una sección nueva del panel de superadmin, con el contador mensual de Kapso, el gasto en Anthropic y la salud del bot, como esfuerzo aparte. Hasta que exista, se mira en los dashboards de Kapso y de Anthropic.

## Qué queda abierto

- **Precio del extra: fijado por el dueño el 2026-10-21.**
  - Piloto: **$20.000 por cancha por mes**. El Vagón son $100.000. El dueño del Vagón ayuda a montarlo.
  - Cuando haya más complejos: **$15.000 por cancha**.
  - Siguen abiertos: el monto del alta, el ajuste, la permanencia y la moneda (el dueño evalúa cobrar en dólares). Se definen junto con la suscripción.
  - El cobro automático se implementa después del cambio a $30.000 por cancha, porque toca `pricing.ts` y el preapproval. Hasta entonces se cobra a mano.
- **Costos al 2026-10-21** (dólar tarjeta $2.008,50):
  - **TurnoGol paga**:
    - Kapso Pro: USD 25 por mes para hasta 3 números, y USD 10 por cada número extra.
    - Anthropic: menos de USD 2 por mes aun con 600 chats.
    - Un complejo solo: unos $52.000 por mes. Con 3 complejos en el mismo plan: unos $18.000 cada uno.
  - **Meta, también a cargo de TurnoGol** (W2):
    - Las primeras 1.000 respuestas del mes por número son gratis; desde la 1.001, USD 0,026 cada una (cambio del 2026-10-01).
    - El bot manda 3 mensajes por conversación en promedio: unos 330 chats por mes entran en el cupo.
  - Estimado para El Vagón a partir de sus turnos medidos: unos $54.000 por mes en un mes normal y unos $135.000 en un mes lleno. Detalle y opciones de precio en el [board del 2026-10-21](../gtm/board/2026-10-21-recepcionista-whatsapp.md).
- Razón social visible en el sitio para la verificación de negocio de Meta.

## Lo que NO habilita

Recordatorios por template, validación de comprobantes de transferencia, mensajes masivos o de marketing, asistente de propósito general. Cada uno necesita evidencia y decisión propias.
