# Bot de WhatsApp: turnos por teléfono y persona neutra — ledger del esfuerzo

Origen (2026-10-29, El Vagón): un jugador saludó al dueño ("Zurdo, ¿cómo estás?"). El bot lo llamó Zurdo y le dijo "no figura ninguna reserva a tu nombre", pero tenía un turno ese día cargado por el staff.

Lo lanza a prod el dueño, con su OK. Sigue con Haiku: se decidió no pasar a Sonnet.

## Causas y arreglo

1. **El bot solo veía las reservas de su propio chat.**
   - `whatsapp-bot.turn.ts` suma "Otros turnos de este teléfono": confirmados y vigentes del complejo que coinciden en los últimos 8 dígitos. El teléfono se busca en el `guest_phone` de la reserva, en la cuenta del jugador y en el contacto del abonado. Es la misma regla que `/jugadores`.
   - Son de solo lectura. `cancelar` devuelve `reservada_por_otro_lado` y el bot pasa la conversación a una persona.
2. **La persona "alguien del complejo" lo llevaba a confundir nombres.**
   - Ahora es el asistente virtual del complejo: amable y al grano, no llama a nadie por su nombre y no da charla.
   - Si el mensaje es algo personal para alguien del complejo, lo pasa a una persona.
3. **Auditoría de las 67 conversaciones reales.**
   - Al prompt se sumaron cuatro casos:
     - rival o jugadores → pasa la conversación;
     - una imagen o un archivo (puede ser un comprobante) → pasa la conversación;
     - "a las 8" cuando el complejo abre a la mañana y a la noche → pregunta cuál antes de reservar;
     - un mensaje dirigido al dueño.

## Delegaciones

| Para qué                                                                 | Agente                      | Costo aprox. | Resultado                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | --------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auditar las 67 conversaciones de Kapso buscando fallas de la misma clase | sonnet-reconnaissance       | ~147k tokens | 5 patrones; 4 atacados en el prompt y 1 a REQUIERE INPUT (hilos que inicia el dueño)                                                                                                                                                                                                      |
| Revisión adversarial del diff                                            | sonnet-adversarial-reviewer | ~82k tokens  | APROBADO CON CAMBIOS. Aplicados el 1 (contradicción con el saludo), el 2 ("contestá con las dos listas"), el 3 (tests de otro complejo y de seña sin pagar) y el 6. Aceptados 🟢: el 4 (falsos positivos por coincidir en 8 dígitos) y el 5 (el teléfono de la cuenta no está verificado) |

## Pendiente

- REQUIERE INPUT:
  - ¿El bot puede cancelar turnos que no salieron del chat?
  - ¿Rival e imágenes pausan el chat 12 h?
  - Hilos que inicia el dueño: el eco no se guarda si el chat no existe (minimización, Ley 25.326), así que el bot no se pausa.
- Sin confirmar: c66 ("el sistema me dice que ese turno no está disponible") puede ser una falla de `reservar`.
- `pnpm test:bot-bench` (gasta plata) antes del deploy.
