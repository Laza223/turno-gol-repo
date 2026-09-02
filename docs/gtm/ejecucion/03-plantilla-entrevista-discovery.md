# Entrevista de discovery (Dnn)

> 20-30 minutos, presencial o por WhatsApp/llamada. Objetivo: saber qué le duele **sin decirle qué le duele**. No es una demo. Notas crudas en `docs/gtm/data/entrevistas/AAAA-MM-DD-Dnn.md` (fuera de git); acá solo el método. Al terminar: una fila en el CRM y, si aportó algo, una línea en [`10-aprendizajes.md`](10-aprendizajes.md).

## Reglas de no inducción (leer antes de cada charla)

1. **Prohibido nombrar** seña, no-show/colgados, fijos, caja, plata, control, "llenar", TurnoGol o software **antes de que el dueño lo haga**. Si lo nombra él, se puede repreguntar.
2. Las preguntas se hacen **en este orden**. La primera es la que vale: lo primero que dice es `dolor_principal`.
3. Silencio de 3 segundos después de cada respuesta. Lo segundo que dice suele ser lo verdadero.
4. No corregir, no vender, no "nosotros justo…". Si pregunta qué es TurnoGol: "un sistema para complejos de fútbol; después te cuento, primero quiero entender cómo laburás vos".
5. Anotar textual, no resumido. Entre comillas.

## Apertura (1 min)

"Soy de acá, de Luján, estoy armando un sistema para complejos de fútbol y antes de mostrarle nada a nadie quiero entender cómo se maneja un complejo de verdad. ¿Tenés 15 minutos? No te vendo nada hoy."

## Las 5 preguntas (en orden)

| # | Pregunta | Qué mide | Cómo codificar |
|---|---|---|---|
| 1 | *"¿Qué es lo que más te rompe la cabeza del complejo, en el día a día?"* | `dolor_principal` | Primera cosa nombrada → A/B/C/D/E/X |
| 2 | *"Contame cómo manejás los turnos de los que vienen siempre, los de todas las semanas."* | D (fijos): volumen, mora, cómo cobra, cuánto lo persigue | `fijos_n`, `mora`, `cobro_fijos` |
| 3 | *"¿Y qué pasa cuando alguien te cancela a último momento o no viene?"* | A (colgados) y qué hace con el hueco | `colgados_sem`, `hueco` |
| 4 | *"Cuando vos no estás, ¿cómo sabés qué pasó? ¿Quién atiende?"* | C (control / encargado) y B (caja) | `encargado`, `caja_como` |
| 5 | *"Si mañana pudieras cambiar una sola cosa de cómo funciona el complejo, ¿cuál sería?"* | Confirma o contradice la #1 | `dolor_secundario` |

## Precio (solo si la charla fluyó; nunca antes de la pregunta 5)

Van Westendorp, 4 preguntas, en este orden, sobre "un sistema que te resuelva [lo que él nombró]":
- *"¿A qué precio por mes te parecería tan barato que desconfiarías?"*
- *"¿A qué precio te parecería una ganga?"*
- *"¿A qué precio empezaría a parecerte caro, pero lo pagarías igual?"*
- *"¿A qué precio sería demasiado caro y ni lo considerarías?"*

Más dos anclas: *"¿A cuánto está tu turno hoy?"* y, si hay confianza, *"¿cuánto te cuesta por mes el encargado, más o menos?"* (monto solo en `data/`).

## Observables de ICP (anotar sin preguntar)

Canchas (contar en Maps/IG si no lo dijo) · fútbol puro o mixto · cierra pasada la medianoche · dueño presente · IG activo · bio con "reservas por WhatsApp" · usa MP · grupo de WhatsApp de dueños (preguntar al cierre: *"¿tenés contacto con otros dueños de la zona?"*).

## Cierre (1 min)

"Gracias, me sirvió mucho. ¿Te puedo mostrar en 10 minutos cómo quedarían tus fijos cargados en el sistema, con tus canchas? Sin compromiso." → si sí: demo con SUS datos precargados (mínimo: canchas y horarios; ideal: fijos que nombró). Si no: "¿Conocés otro dueño al que le pase lo mismo?"

## Registro (5 min después, no al día siguiente)

- CRM: fila completa (ver [`04-crm-campos.md`](04-crm-campos.md)), `dolor_principal` y `objecion_principal`.
- `data/entrevistas/AAAA-MM-DD-Dnn.md`: textual de las 5 respuestas + Van Westendorp.
- `10-aprendizajes.md`: solo si cambió algo (nueva objeción, dolor fuera de A/B/C/D, precio sorpresa).
- Tablero [`07`](07-tablero-hipotesis.md): sumar 1 al conteo de H1 en la columna que corresponda.

## Lo que hace que una entrevista NO cuente para H1

Si nombraste vos primero alguno de los temas, si fue durante una demo (ya vio el producto), o si el dueño es conocido/amigo (sesgo de cortesía): se registra igual, pero marcada `inducida = sí` y no suma al 3-de-5.
