# Mapa de series y fases — cuál es cuál

> **Por qué existe este archivo.** En TurnoGol conviven **cuatro** series de trabajo numeradas, y
> dos de ellas usan las MISMAS etiquetas. `B10` significa tres cosas distintas según quién lo diga;
> `D1`–`D8` significa dos. Eso ya hizo mapear mal bloques en al menos dos sesiones, y una sesión
> también arrancó a trabajar sobre ítems que estaban cerrados por leer la serie equivocada.
>
> **Antes de buscar "el informe de X", identificá la serie.** Última actualización: 2026-08-12.

## La tabla de desambiguación

| Etiqueta                | Puede ser…                              | Se distingue por                                                                                   |
| ----------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `B0`–`B16`              | **Deuda cero** (agosto 2026)            | vive en `docs/audit/PROGRESS.md` (secciones `## B5`, `## B10`…) y en el `git log` como `fix(b10):` |
| `B0`–`B11` + `F0`–`F14` | **Auditoría wave 1** (mayo 2026)        | vive en `docs/audit/STATE.md` como tabla, con reports en `docs/audit/reports/fase-bNN-*.md`        |
| `D1`–`D8`               | **Auditoría de datos** (julio 2026)     | vive en `docs/audit/STATE.md` + `MASTER_PLAN.md`; reports `fase-dN-*.md`                           |
| `D1`–`D8`               | **Decisiones de fase v2** (agosto 2026) | vive en `docs/planning/2026-08-01-decisiones-de-fase-v2.md` §2                                     |

**Las colisiones concretas, para no volver a pisarlas:**

- **`B10`** = route-guard + paginación (deuda cero) · **o** Observabilidad (auditoría mayo).
- **`B11`** = load testing (deuda cero) · **o** Operativo/Backups/Runbook (auditoría mayo).
- **`D1`** = schema físico e índices (auditoría datos) · **o** política del hold (decisiones de fase).
- **`D3`** = queries bajo rol real (auditoría datos) · **o** el set de etiquetas de cliente (decisiones de fase).
- **`D6`** = volumen y carga con k6 (auditoría datos) · **o** WhatsApp (decisiones de fase).
- **`D7`** = higiene de migraciones en prod (auditoría datos) · **o** onboarding invertido (decisiones de fase).

Y ojo con el cruce: **la deuda cero B11 fue a cerrar la auditoría-datos D6.** Un ítem de una serie
apuntando a otro de otra serie, con el mismo número enfrente. Es el caso más confuso del repo.

---

## Serie 1 — Bloques de deuda cero (B0–B16) · 17/17 CERRADOS

Deuda **técnica**, cero UI. Contrato: `docs/planning/2026-08-11-deuda-cero-bloques-restantes.md`.
Bitácora: `docs/audit/PROGRESS.md`.

| #   | Qué                                          | Estado                                                                               |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| B0  | Higiene                                      | ✅                                                                                   |
| B1  | Retención 90 días                            | ✅                                                                                   |
| B2  | Reportes en día operativo                    | ✅                                                                                   |
| B3  | Stories + candado                            | ✅                                                                                   |
| B4  | `analytics_events`                           | ✅                                                                                   |
| B5  | knip                                         | ✅                                                                                   |
| B6  | Capas `@/shared`                             | ✅                                                                                   |
| B7  | `react-hooks` en `error`                     | ✅                                                                                   |
| B8  | Tipos de SQL crudo                           | ✅ (#135/#136/#140) — el barrido mecánico de ~190 casts queda sin hacer, a propósito |
| B9  | Tests debilitados                            | ✅                                                                                   |
| B10 | Route-guard + paginación                     | ✅ (#137/#138/#139 + #145)                                                           |
| B11 | Load testing → cierra auditoría-datos **D6** | ✅ parcial — **k6 SIN hacer**                                                        |
| B12 | Etiquetas de cliente (migr. 074)             | ✅                                                                                   |
| B13 | Merge de Clientes                            | ✅                                                                                   |
| B14 | "Hoy: $X" en el sidebar                      | ✅                                                                                   |
| B15 | Visibilidad del hold                         | ✅                                                                                   |
| B16 | Torneos                                      | ✅ (#126)                                                                            |

## Serie 2 — Auditoría wave 1 (mayo 2026) · 26/26 CERRADA

Backend `B0`–`B11` + frontend `F0`–`F14`. Tabla y reports en `docs/audit/STATE.md`.
**Es la que colisiona con la serie 1.** Ya está cerrada, así que si alguien cita un `B10` "abierto",
no es esta.

## Serie 3 — Auditoría de datos (D1–D8) · 7/8

| #      | Qué                                   | Estado                                                                                                                       |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| D1     | Schema físico e índices               | ✅ (migr. 053)                                                                                                               |
| D2     | RLS performance                       | ✅ (migr. 052)                                                                                                               |
| D3     | Queries bajo rol real                 | ✅ (migr. 054)                                                                                                               |
| D4     | Flujos de integridad dinámica         | ✅ (migrs. 059/060/061)                                                                                                      |
| D5     | Infra de datos                        | ✅ (migrs. 055/056)                                                                                                          |
| **D6** | **Volumen y carga (k6, p95 de doc5)** | 🟡 **la única abierta** — la deuda-cero B11 midió 16 hot paths con `EXPLAIN`, pero **la carga HTTP con k6 sigue sin correr** |
| D7     | Higiene de migraciones en prod        | ✅ (`db-migrate.yml`)                                                                                                        |
| D8     | Checkpoint post-merge de caja         | ✅                                                                                                                           |

## Serie 4 — Decisiones de fase v2 (D1–D8) · 8/8 decididas

No son trabajo, son **decisiones del dueño**. Todas tomadas el 2026-08-01.

| #   | Qué                      | Dónde impacta                                                                  |
| --- | ------------------------ | ------------------------------------------------------------------------------ |
| D1  | Política del hold        | Fase 5 (implementada por B15)                                                  |
| D2  | Pago dividido/mixto      | Fases 1 y 3                                                                    |
| D3  | Etiquetas vs Ley 25.326  | Fase 4 (implementada por B12)                                                  |
| D4  | Identidad visual         | transversal                                                                    |
| D5  | "Hoy" es solo del admin  | Fase 2                                                                         |
| D6  | WhatsApp                 | diferido — trigger: ≥10 complejos pagando                                      |
| D7  | Onboarding invertido     | prioridad flotante — trigger: primer prospecto por firmar. **NO implementado** |
| D8  | Canal del resumen diario | Fase 2                                                                         |

---

## Y encima, las fases del rediseño v2 (0–5)

Otra numeración más, esta sí secuencial. Contrato:
`docs/planning/2026-08-01-decisiones-de-fase-v2.md` §3.

| Fase | Qué                                                         | Estado                                      |
| ---- | ----------------------------------------------------------- | ------------------------------------------- |
| 0    | Gramática visual del admin                                  | ✅                                          |
| 1    | Caja + "Plata en la calle"                                  | ✅ CERRADA (2026-08-02)                     |
| 2    | "Hoy"                                                       | ✅ CERRADA (2026-08-04)                     |
| 3    | La Grilla                                                   | ✅ CERRADA (2026-08-05)                     |
| 4    | Reorganización estructural (6 espacios, Clientes fusionado) | ✅ CERRADA (2026-08-11, vía B12 + B13)      |
| 5    | **El flujo jugador**                                        | ⛔ **BLOQUEADA — por venta, no por código** |

**Fases 0–4 son el panel del complejo. Fase 5 es el jugador**, la única que mira hacia afuera.

**Por qué Fase 5 no arranca:** su criterio de entrada pide **≥1 complejo real compartiendo su
link** — _"antes de eso, no hay embudo"_. La otra condición (D1, el hold) ya está. O sea: **no queda
código del plan por hacer; lo que sigue es comercial.**

Lo mismo aplica a **D7 (onboarding invertido)**: está sin implementar y sin bloqueos técnicos, pero
su trigger es "primer prospecto por firmar".

## Lo que sí queda, y no pertenece a ninguna serie

- 🔴 **CI en `main` viene rojo** de forma determinística desde ≥5 merges: `E2E Tests`
  (`reservas-crud.spec.ts:413`, el badge "Esperando seña" no aparece) y `Regresión visual`
  (`landing.png`, 12% de píxeles — baseline vieja de Fase 4). Los otros workflows (Semgrep,
  React Doctor, security) están verdes y **tapan el color** al mirar `gh run list` sin filtrar por
  workflow.
- **16 route handlers sin `runRequestObservability`**: sus errores vuelven sin id de correlación.
- **k6** (auditoría-datos D6): requiere instalar k6 y env en el worktree.
