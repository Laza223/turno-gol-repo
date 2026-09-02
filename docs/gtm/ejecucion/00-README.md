# Panel del experimento de 30 días

> **Fuente de verdad operativa del experimento comercial.** Se actualiza la sección ESTADO después de cada conversación con un dueño; el resto es referencia. Decisiones que lo rigen: [`docs/decisions/2026-09-02-experimento-30-dias.md`](../../decisions/2026-09-02-experimento-30-dias.md).

## ESTADO (actualizar acá, solo acá)

| | |
|---|---|
| **Fecha** | 2026-09-02 |
| **Fase** | Semana 1 · caso cero arranca hoy |
| **Hoy toca** | Baseline de P1 **antes** de configurar nada → [`01-checklist-caso-cero.md`](01-checklist-caso-cero.md) día 0 |
| **Bloqueado por** | — |

### Métricas (valor actual · umbral 30 días)

| Métrica | Hoy | Umbral | Fuente |
|---|---|---|---|
| Mensajes de discovery enviados | 0 | 160 (40/sem) | CRM |
| Tasa de respuesta | — | ≥20% | CRM |
| Charlas de dolor registradas | 0 | ≥10 | `data/entrevistas/` |
| Demos hechas | 2 (pre-experimento) | +4 | CRM |
| Pilotos activos | 1 (P1) | 3 | CRM |
| **A1** complejo activado | — | P1 en semana 1 | [`06`](06-metricas-activacion.md) |
| **A2** reserva online de desconocido | 0 (nunca ocurrió) | ≥1 en 30 d (diagnóstico) | [`06`](06-metricas-activacion.md) |
| **A3** activación de red | 0 | — (proxy) | [`06`](06-metricas-activacion.md) |
| Clientes pagos | 0 | 0 (P1 paga día 91) | — |
| Referido "me lo pasó X" | 0 | ≥1 | CRM |
| Caso con nombre publicado | 0 | 1 (semana 4) | [`10`](10-aprendizajes.md) |

### Hipótesis abiertas

| # | Hipótesis | Estado | Umbral | Detalle |
|---|---|---|---|---|
| H1 | El dolor #1 es control (fijos/caja/encargado), no ocupación ni no-shows | ABIERTA · 0/10 entrevistas | 3 de 5 nombran fijos/plata antes que colgados, sin inducir | [`07`](07-tablero-hipotesis.md) |
| H2 | La seña al ~10% como "compromiso" la aceptan dueños y jugadores | ABIERTA · 1 rechazo al 30% (SIGNAL) | ≥50% de pilotos la prenden solos en 30 d | [`07`](07-tablero-hipotesis.md) |
| H3 | Los dueños se refieren entre sí por WhatsApp | ABIERTA | ≥1 grupo, ≥1 reenvío, ≥1 contacto "me lo pasó X" | [`07`](07-tablero-hipotesis.md) |
| H4 | El ICP 4-6 tiene masa en el corredor (≥15 complejos puros) | ABIERTA | lista scoreada | [`05`](05-scorecard-icp.md) |

### Próximos gates

| Cuándo | Gate | Rojo → |
|---|---|---|
| Día 7 (2026-09-09) | P1 con A1 (fijos cargados, staff en grilla ≥5 días, caja cerrada ≥5 días) · ≥40 mensajes · ≥3 charlas | A1 rojo = blocker de adopción (única razón válida para programar) · charlas rojo = volumen de horas |
| Día 14 (2026-09-16) | ≥6 charlas · ≥2 demos · P1 link en bio y QR | Kill criteria del piloto ([`01`](01-checklist-caso-cero.md)) |
| Día 30 (2026-10-02) | 10 charlas · H1 resuelta · A2 diagnóstico · 1 caso · revisión de D1/D2/D3 | Ver [`09-gates.md`](09-gates.md) |

## Cómo se opera (30 segundos)

1. **Antes de hablar con un dueño**: abrí el checklist que toque ([`01`](01-checklist-caso-cero.md) para P1, [`03`](03-plantilla-entrevista-discovery.md) para discovery).
2. **Después**: una fila en el CRM (columnas en [`04`](04-crm-campos.md)), las notas crudas en `docs/gtm/data/entrevistas/AAAA-MM-DD-Dnn.md` (fuera de git), y **una línea** en [`10-aprendizajes.md`](10-aprendizajes.md) si cambió algo.
3. **Viernes**: actualizar ESTADO de este panel y el tablero [`07`](07-tablero-hipotesis.md); mirar [`09-gates.md`](09-gates.md).

Las tres superficies diarias son: **el checklist, el CRM y `10-aprendizajes.md`**. Todo lo demás es metodología.

## Etiquetas (obligatorias en todo dato)

Todo dato lleva `(AAAA-MM-DD, fuente)`. Fuentes: `P1` piloto 1 · `D01..Dnn` discovery · `DEMO-1/2` las dos demos previas · `CRM` · `repo` · `teardown`.

| Etiqueta | Significa | Ejemplo |
|---|---|---|
| **FACT** | Hecho observado y verificable. Incluye conteos reales sobre muestras chicas | "3 de 5 dueños nombraron fijos primero (D01-D05)" |
| **SIGNAL** | Observación de pocos casos que sugiere algo sobre el mercado | "1 de 2 dueños rechazó el pago anticipado (DEMO-1)" |
| **HYPOTHESIS** | Generalización sobre el mercado, todavía no probada | "El dolor #1 de los complejos de 4-6 canchas es el control de los fijos" |
| **DECISION** | Lo que se decidió, con fecha y trigger de reversión | "ICP 4-6 (2026-09-02, D1)" |

Regla: **hecho observado ≠ generalización sobre el mercado.** "3 de 5 nombraron fijos" es FACT; "los dueños tienen como dolor principal los fijos" sigue siendo HYPOTHESIS aunque salga de ese FACT. El tamaño de la muestra no cambia la veracidad del dato; cambia lo que se puede generalizar.

## Archivos

| Archivo | Para qué | Cuándo |
|---|---|---|
| [`01-checklist-caso-cero.md`](01-checklist-caso-cero.md) | Días 0 a 91 de P1, paso a paso | Cada contacto con P1 |
| [`02-plantilla-baseline-piloto.md`](02-plantilla-baseline-piloto.md) | Qué capturar antes de configurar | Día 0 de cada piloto |
| [`03-plantilla-entrevista-discovery.md`](03-plantilla-entrevista-discovery.md) | 5 preguntas sin inducir + precio | Cada charla de dolor |
| [`04-crm-campos.md`](04-crm-campos.md) | Columnas y enums del Sheet | Setup y cada fila |
| [`05-scorecard-icp.md`](05-scorecard-icp.md) | A quién contactar primero | Armar lista |
| [`06-metricas-activacion.md`](06-metricas-activacion.md) | A1/A2/A3 y cómo se miden hoy | Viernes |
| [`07-tablero-hipotesis.md`](07-tablero-hipotesis.md) | A/B/C/D y H1-H4 con evidencia | Viernes |
| [`08-calendario-30-dias.md`](08-calendario-30-dias.md) | Ventanas compatibles con 9-17 | Domingo |
| [`09-gates.md`](09-gates.md) | Umbrales y qué hacer en rojo | Día 7/14/30 |
| [`10-aprendizajes.md`](10-aprendizajes.md) | Log append-only | Siempre |
| `docs/gtm/data/` (fuera de git) | CRM export, baselines llenos, entrevistas crudas | — |
