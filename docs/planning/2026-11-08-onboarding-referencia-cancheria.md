# Onboarding: lo que hace Canchería y qué nos llevamos

**Fecha:** 2026-11-08. **Insumo:** grabación del alta mobile de app.cancheria.com que pasó el founder (2:48, abierta desde el navegador interno de Instagram). Analizada cuadro por cuadro. No tiene audio útil. **Por qué:** es el paso B2 de [`2026-11-08-ideas-del-founder.md`](2026-11-08-ideas-del-founder.md). El founder considera que nuestro alta "se quedó muy atrás" y quiere acercarse lo más posible a este en mobile.

## El recorrido de Canchería

La grabación arranca en el paso 1, con la cuenta y el nombre del club ya cargados (esa parte no se ve). Lo que sigue, cronometrado, es **un poco más de 2 minutos**, y eso que el usuario vuelve atrás varias veces.

| Paso | Pregunta en pantalla | Control | Valor por defecto | Se tipea |
|---|---|---|---|---|
| 1 "Empecemos" | ¿Qué deportes se juegan en *Club X*? | chips multiselección | — | no |
| 2 | ¿Cuántas canchas de Pádel tenés? | stepper − N + | 1 | no |
| 3 | (igual para Fútbol; se deduce del salto 2→4) | stepper | 1 | no |
| 4 | ¿A qué hora abrís y a qué hora cerrás? "Si un día es distinto, lo cambiás después." | 2 selects | 8 hs / 12 de la noche | no |
| 5 | ¿Cuánto cobrás un turno de Pádel? | chips de duración 60/90/120, precio con teclado numérico y eco en vivo ("Un turno de 90 minutos: $60.000"), "¿A la noche (desde las 18 hs) cobrás distinto?" | 90 min, "No, es el mismo precio" | **el precio** |
| 6 | (igual para Fútbol) | igual | 60 min | **el precio** |
| 7 | ¿Cómo tomás los turnos hoy? "Así te decimos por dónde arrancar." | 4 opciones: cuaderno o planilla, WhatsApp, otra app, recién abro | — | no |
| 8 | ¿Cobrás seña para reservar? | Sí / No | — | no |
| 9 | ¿Tenés buffet o kiosco? "Si no, no te lo mostramos." | Sí / No | — | no |
| 10 | ¿Organizás torneos? | Sí / No | — | no |
| 11 | ¿Está todo bien? | resumen por bloques con links "Cambiar horario / canchas / precio" | — | no |
| Fin | "¡Listo! Tu club ya está abierto". Link público grande; CTA principal **"Compartir mi link"**, secundario "Ir a mi panel". "Los nombres de las canchas, tu logo y los precios por día los cambiás cuando quieras." | — | — | — |

Al entrar al panel aparecen:
- **"Prueba sin arrancar":** "Tus 14 días de prueba arrancan cuando cargues tu primer turno, no antes".
- **"No verificado":** "Tocá el link que te mandamos… Tu club funciona normal mientras tanto", con botón "Reenviar mail". El mail del video tenía un error de tipeo y el alta pasó igual.
- **"Bienvenido":** video corto, "Para arrancar → Tu primer día: pasar el cuaderno a la agenda y mandarle el link a tus jugadores".
- **Barra inferior:** Inicio · Agenda · Caja · Espera · Asistente · Más.

**Resultado:** después de la cuenta, se tipea **un solo dato por deporte (el precio)**. Todo lo demás son toques sobre valores ya puestos.

## Los trucos, en orden de impacto

1. **Una pregunta por pantalla, en segunda persona y con el nombre del club adentro.** No parece un formulario sino una charla.
2. **Todo viene con un valor por defecto.** La mayoría de las pantallas se resuelven con "Siguiente". Los números van con stepper y las opciones con chips. El precio tiene teclado numérico y eco en vivo.
3. **Frases que sacan el miedo a equivocarse:** "lo cambiás después", "si después cambia, lo actualizás". Nada es definitivo, así que nadie se traba pensando.
4. **Preguntas que restan producto:** buffet, torneos y seña. "Si no, no te lo mostramos": el panel nace con solo lo que usa. Es la "resta" que el founder pide en cada rediseño.
5. **Pregunta de segmentación** ("¿cómo tomás los turnos hoy?"): personaliza el primer paso del panel sin pedir un dato más.
6. **El final es compartir el link**, no cargar un turno. Su activación es que el jugador reserve solo, y eso además es su distribución.
7. **Nada bloquea:** el mail sin verificar no frena el alta y la prueba no corre hasta el primer turno.
8. **Anda dentro del navegador de Instagram.** Ojo con esto: Google bloquea su login dentro de navegadores internos (`disallowed_useragent`). Un alta con "Entrar con Google" se rompe justo en el tráfico de anuncios y de la bio. Mail y contraseña sin verificación bloqueante es lo que funciona ahí.

## Contra el nuestro (medido en el código el 2026-11-08)

| | Canchería | TurnoGol hoy |
|---|---|---|
| Datos tipeados hasta el panel | cuenta + nombre + 1 precio por deporte | **13** campos obligatorios con 1 cancha: registro 6, complejo 4, cancha 2, primera reserva 1 |
| Mail | no bloquea | **bloquea**: hay que confirmar en `/verify` antes de seguir |
| Pantallas | 11, todas de toques | 6 pantallas: registro, verificación y 4 pasos con formularios |
| Datos que pide y no hacen falta para abrir | ninguno | apellido, repetir contraseña, dirección, ciudad, provincia, nombre de cada cancha |
| Precio | uno por deporte, más "¿a la noche cobrás distinto?" | precio por cancha (`onboarding.schema.ts:23,28`) |
| Resta | pregunta por buffet, torneos y seña, y oculta lo que no usa | todo visible |
| Final | "Compartir mi link" | `/onboarding/listo` ya tiene el link y compartir (`ShareActions`), pero antes obliga a la primera reserva |
| Prueba | arranca con el primer turno | 30 días desde el alta (`TRIAL_DAYS`, `src/shared/constants.ts:64`) |

## Propuesta para TurnoGol (solo fútbol)

Mismo patrón: una pregunta por pantalla, valores por defecto y toques. Adaptado a lo que ya tenemos:

1. **Cuenta:** mail y contraseña, sin repetirla. El nombre del complejo va en la misma pantalla o en la siguiente.
2. **¿Qué canchas tenés?** Un stepper por formato (Fútbol 5, 7, 8, 11), que ya existe como `courts.format`. Los nombres se generan solos ("Cancha 1"…).
3. **¿A qué hora abrís y cerrás?** Dos selects con valores por defecto. Contempla cerrar pasada la medianoche con `closes_next_day` y los helpers de `src/shared/time/operating-day.ts`.
4. **¿Cuánto cobrás el turno?** Un precio por formato, con teclado numérico y eco en vivo. Después, "¿A la noche cobrás distinto?", que entra justo en el modelo de **un precio por franja con puntos de corte**. El turno es de 60 min fijo, así que no se pregunta la duración.
5. **¿Cómo tomás los turnos hoy?** Cuaderno, WhatsApp, otra app o recién abro. Personaliza la checklist del panel: con cuaderno, "pasá tus turnos fijos a la grilla"; con WhatsApp, el link (y el bot como extra).
6. **¿Tenés equipos fijos todas las semanas?** Es nuestro diferencial (turnos fijos) y prepara el primer uso real.
7. **¿Tenés buffet o kiosco?** Si no, Productos y la venta en Hoy no se muestran.
8. **Resumen** con "Cambiar".
9. **Listo** con "Compartir mi link" como acción principal. La reserva de prueba pasa a la checklist.

Ni la seña ni Mercado Pago van en el alta (D9; ya se mudó a la checklist). Torneos tampoco: el flag `tournaments` está apagado.

## Decisiones del founder (2026-11-08, por select)

1. **El mail deja de bloquear el alta: sí.** Se usa el panel sin confirmar, con un aviso "No verificado" y "Reenviar mail". Es un cambio de auth: la spec define qué queda limitado hasta verificar (por ejemplo, el cobro del plan) y cómo se recupera una cuenta con el mail mal tipeado.
2. **El alta termina en "Compartir mi link": sí.** El paso obligatorio "primera reserva" sale del wizard y pasa a la checklist del panel. Esto redefine el momento en que el dueño ve el valor de doc10 (la primera reserva online): ahora es compartir el link para que reserven los jugadores. Hay que actualizar doc10 en la misma entrega.
3. **Ocultar lo que no usa: sí.** Si dice que no tiene buffet o kiosco, Productos y la venta en Hoy no aparecen hasta que los active.
4. **Prueba desde el primer turno: no.** Sigue en 30 días desde el alta (`TRIAL_DAYS`), así que el lifecycle no cambia.

Lo que sigue es la spec (`entrega-feature` + `impeccable`, mobile primero). Archivos: `src/app/(auth)/register/*`, `src/modules/onboarding/*` y `src/app/onboarding/*`. Reusa `createTenantWithTrial` y `resolveWizardStep`. El alta asistida del super-admin (`2026-10-22-alta-asistida.md`) arranca el wizard nuevo en el paso que le corresponda.
