# Plantilla de baseline del piloto

> Copiar a `docs/gtm/data/baseline-Pn.md` (fuera de git) y llenar **antes** de configurar TurnoGol. En git solo va el resumen anonimizado (última sección). Cada campo lleva fecha y fuente (`Pn`, dueño / encargado / observado). No inventar: si no se sabe, `UNKNOWN` y cómo se va a obtener.

```
Piloto: Pn · Fecha baseline: AAAA-MM-DD · Quién respondió: dueño / encargado / ambos
```

## A. El complejo (FACT)

| Campo | Valor | Fuente |
|---|---|---|
| Cantidad exacta de canchas y tipo (F5/F7/F11, techadas) | | |
| ¿Pádel u otros deportes? ¿cuántas canchas? | | |
| Horario de apertura y cierre por día; ¿cierra pasada la medianoche? | | |
| Precio del turno prime / off-prime / finde (ARS) | | |
| Reservas por semana (aprox.) y % que son fijos | | |
| Cuántos turnos fijos activos (equipos) | | |
| Cuántas personas atienden el mostrador; roles; horarios | | |
| Sueldo aproximado del encargado (solo en `data/`, nunca en git) | | |
| Herramientas actuales: cuaderno / Excel / Calendar / WhatsApp / otro sistema (¿cuál? ¿lo dejó? ¿por qué?) | | |
| ¿Cobra algo por adelantado hoy? ¿cómo? (seña, transferencia, nada) | | |
| Medios de cobro: efectivo / transferencia / MP / tarjeta; ¿tiene MP de negocio? | | |
| ¿Cierra caja? ¿cómo? ¿cuadra? | | |
| Instagram activo (última publicación) / bio con "reservas por WhatsApp" | | |

## B. El costo del status quo (FACT si lo cuenta él; SIGNAL si es estimación)

| Campo | Valor | Fuente |
|---|---|---|
| Turnos colgados la última semana / mes; qué hizo con el hueco | | |
| Fijos que deben hoy: cuántos y cuánto (monto solo en `data/`) | | |
| Cuánto tarda en cobrar un fijo atrasado; cómo lo persigue | | |
| Mensajes de "¿tenés cancha?" por día (que mire el WhatsApp una semana) | | |
| Horas del dueño en el complejo por día; ¿puede irse un finde? | | |
| Última vez que se pisó un turno o se cobró mal; qué pasó | | |
| Cuánto "falta" en la caja por mes (si lo sabe) | | |
| Huecos que nunca se venden (franja / día) | | |

## C. El dolor, en sus palabras (textual — no resumir)

1. *"¿Qué es lo que más te rompe la cabeza del complejo?"* →
2. *"¿Cómo manejás los fijos hoy?"* →
3. *"¿Qué pasa cuando un fijo o un grupo cancela?"* →
4. *"¿Qué hace el encargado cuando vos no estás?"* →
5. *"¿Por qué querés probar TurnoGol? ¿Qué esperás que te resuelva?"* →

Codificar `dolor_principal` (una sola letra, lo primero que nombró sin que lo mencionaras vos): **A** seña/colgados · **B** plata/caja/deudas · **C** control/encargado/no estar · **D** fijos · **E** otro: ____ · **X** ocupación/"llenar".

## D. Precio y willingness-to-pay (SIGNAL — nunca FACT hasta que pague)

| Pregunta | Respuesta textual | Reacción |
|---|---|---|
| Precio comunicado: $____/mes para ___ canchas (fecha) | | |
| WTP-1: *"¿Qué tendría que pasar en estos 3 meses para que no quieras volver a manejarlo como antes?"* | | |
| WTP-2: *"Sabiendo que después sale $X por mes, ¿qué tendría que resolver para que pagar eso tenga sentido?"* | | |
| Su número de éxito al día 90 (lo dice él) | | |
| Van Westendorp: ¿a qué precio sería tan barato que desconfiarías? / una ganga / caro pero lo pagarías / demasiado caro | | |

## E. Seña (SIGNAL)

| Campo | Valor |
|---|---|
| ¿La mencionó él? ¿en qué términos? (textual) | |
| Reacción a "la parte de un jugador (~10%)" si se ofreció | |
| ¿La prende en el piloto? fecha / % / motivo | |

## F. Referidos y grupos (SIGNAL)

| Campo | Valor |
|---|---|
| ¿En qué grupos de WhatsApp de dueños está? ¿cuántos miembros? ¿qué se comparte? | |
| ¿Reenviaría un mensaje con sus resultados? (textual) | |
| Otros dueños que nombró (solo en `data/`) | |

## G. Relación y contexto

| Campo | Valor |
|---|---|
| Cómo llegó (conocido / referido por / frío) y desde cuándo esperaba | |
| Permiso de caso con nombre: sí / no / después | |
| Canal y horario de soporte acordado | |

---

## Resumen anonimizado (esto sí va a git, en `10-aprendizajes.md`)

```
Pn · AAAA-MM-DD · N canchas (Fx), fijos: N, encargados: N, cierra: HH:MM
Herramientas: … · Cobro adelantado hoy: sí/no · MP negocio: sí/no
dolor_principal: [A-E/X] · segundo: [ ] · seña: [reacción en 5 palabras]
WTP-1: [síntesis 10 palabras] · WTP-2: [síntesis] · Van Westendorp: [4 números o "no dio"]
Grupos de dueños: N · reenviaría: sí/no · Permiso de caso: sí/no/después
```
