# Documentación de TurnoGol

Mapa de toda la documentación del proyecto. La **fuente de verdad** son los 19 documentos canónicos en [`spec/`](#spec--especificación-canónica-fuente-de-verdad); el resto es contexto histórico, de proceso y operativo.

> Convención: los `docXX` se citan por su nombre lógico (ej. `doc12`) en CLAUDE.md y a lo largo de la doc; su ruta real es `docs/spec/docXX_*.md`.

## Estructura

| Carpeta | Qué contiene | Vigencia |
|---------|--------------|----------|
| [`spec/`](./spec) | Los 19 documentos canónicos (doc1–doc20, doc9 deprecado) | **Vigente — fuente de verdad** |
| [`launch/`](./launch) | Backlog de lanzamiento, runbook, risk register, guía launch-first | **Vigente — foco actual** |
| [`gtm/`](./gtm) | Sistema comercial: ICP, posicionamiento, oferta piloto, funnel, scripts, plan 7-30-90 | **Vigente — foco actual** |
| [`operations/`](./operations) | Lanzamiento, migraciones, soporte de navegadores | Vigente |
| [`planning/`](./planning) | Deploy playbook, pricing, cambios de reglas de negocio, icebox de features | Vigente |
| [`decisions/`](./decisions) | Decisiones de sistema y de seguridad transversales | Vigente |
| [`qa/`](./qa) | Triage de fixes, decisiones pendientes, inventario de vistas | Vigente |
| [`audit/`](./audit) | Auditorías: plan maestro, planes por fase, reports (código y docs), PROGRESS | Histórico (completadas) |
| [`business/`](./business) | Planes originales de negocio, sistema e historias de usuario (precursores de los doc) | Referencia histórica |
| [`superpowers/`](./superpowers) | Planes y specs de implementación (workflow superpowers) | Histórico |
| [`testing/`](./testing) | Prompts de testeo de vistas | Proceso |
| [`archive/`](./archive) | Planes de ataque, prompts one-shot, TODOs viejos, blueprints ejecutados, walkthroughs | Archivado |

Archivo suelto vigente: [`infraestructura.md`](./infraestructura.md) (plan de infra prod — lo cita `planning/deploy-playbook.md`).

## spec/ — Especificación canónica (fuente de verdad)

### Capa de Negocio
- `doc1` — Problema y mercado objetivo (complejos de fútbol, Argentina)
- `doc2` — Competitive teardown vs ATC Sports
- `doc3` — 3 Personas: Marcelo (Owner/Admin), Rodrigo (Empleado), Tomás (Jugador)
- `doc4` — Monetización: suscripción mensual por canchas, MercadoPago

### Capa Funcional
- `doc5` — Requisitos no funcionales (monolito Y1, 99.5% SLA, p95 <500ms)
- `doc6` — Entidades y state machines (19 tablas + system_admins)
- `doc7` — 9 flujos end-to-end con efectos secundarios
- `doc8` — ~42 user stories con Given/When/Then
- `doc9` — **DEPRECADO** (lifecycle SaaS unificado en doc4 §2)
- `doc10` — Onboarding: wizard 4 pasos, Aha Moment = primera reserva online

### Capa Técnica
- `doc11` — 12 ADRs
- `doc12` — Tenant isolation (RLS, SET LOCAL, JWT, RLS dual)
- `doc13` — SQL completo (19 tablas + system_admins, ENUMs, índices, RLS)
- `doc14` — Tech stack
- `doc15` — API contracts

### Capa de Calidad & Operaciones
- `doc16` — Testing (~140 unit, ~50 integration, ~10 e2e)
- `doc17` — Observabilidad (Sentry, logs, métricas)
- `doc18` — Privacy/Compliance (Ley 25.326)
- `doc19` — Runbook operativo
- `doc20` — Design System (ver `design-system/MASTER.md` como fuente visual)

## Otras referencias clave fuera de `docs/`
- `CLAUDE.md` — instrucciones del proyecto (raíz)
- `CONTRIBUTING.md` — setup, flujo de PR, migraciones, deploy (raíz)
- `design-system/MASTER.md` — fuente de verdad visual
