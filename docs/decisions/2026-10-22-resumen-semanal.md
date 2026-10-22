# Decisión: resumen semanal por mail para el dueño

**Fecha:** 2026-10-22 · **Decide:** Lazar (founder) · **Para qué:** que el dueño de El Vagón vea cada semana lo que TurnoGol le ordena sin entrar al panel, antes del primer cobro (2026-12-06).

## Decisiones

1. **Contenido: solo lo que entró y por dónde.** Total de la semana (el mismo `income` que Métricas, sin egresos ni ajustes), desglose por efectivo / MercadoPago / transferencia (siempre los tres; "Otro" solo si hubo) y el **% contra la semana anterior**. Sin comparación si la anterior no tuvo ingresos.
   Descartados por Lazar: ocupación por cancha, reservas online y "te deben hoy". "Jugado y no cobrado" además da casi siempre 0 en una semana cerrada, porque lo no cobrado se acredita solo a las 24 h (`.claude/rules/caja.md`).
2. **Cuándo:** los lunes a las 08:00 ART, con la semana operativa lun–dom que cerró ayer. Usa el cutoff nocturno del complejo (`nightCutoffMins`), igual que Métricas. **Si la semana dio $ 0, no sale** (aunque la anterior haya tenido plata): un mail que dice "entraron $ 0" no le sirve al dueño.
3. **Opt-in, apagado por defecto:** `settings.weekly_summary_email_opt_in`, en Ajustes → Vos y tu equipo, al lado del diario. Solo por email.
4. **Solo a administradores:** el Encargado no ve Métricas, así que tampoco recibe la plata de la semana.
5. **Sin template ni cola propios:** cuelga del cron del resumen diario (`daily-summary.worker.ts`) y viaja por el template `daily_summary` con `kind: 'weekly'`. El registro de templates y las colas los comparte RIVAL; si el semanal crece, se le da template propio.
6. **En Ajustes, los dos resúmenes llevan nombre visible** ("Diario" y "Semanal", bajo "Resúmenes"). Antes el diario era el único grupo y su leyenda iba solo para el lector de pantalla. Con dos grupos de opciones juntos, el que no tiene nombre queda como opciones sueltas.

## Riesgos aceptados

- **No duplicar es "fijarse y después insertar", no atómico.** Antes de encolar se busca un semanal del mismo complejo en los últimos 6 días. Dos barridos exactamente a la vez podrían mandarlo dos veces, pero el cron de pg-boss corre una sola instancia por tick. Lo que sí cubre es un barrido que se vuelve a correr el mismo lunes.
- **Una pestaña abierta con el form de antes apaga el semanal al guardar.** Ese form no manda el campo nuevo, y la action lo lee como "no". Como viene apagado por defecto, solo pasa si alguien lo prendió y después guarda desde una pestaña que no recargó.
- **Un complejo que cierra después de las 08:00** (cutoff nocturno mayor a 8 h) todavía está en el domingo operativo cuando corre el cron. Ese lunes no le sale y le sale el martes, con la misma semana.
