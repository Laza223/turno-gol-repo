# TurnoGol — Guía corregida para usar Fable 5 sin procrastinación productiva

> Versión corregida con foco **launch-first**.
> Objetivo: usar Fable 5 para reducir riesgos reales de producción, no para generar una pila nueva de documentación.

---

## 0. Veredicto brutalmente honesto

La guía anterior estaba bien en una cosa: el **routing de modelos**.

Pero estaba mal en la prioridad: optimizaba demasiado el uso de Fable 5 y demasiado poco el lanzamiento de TurnoGol.

A esta altura, el éxito no es terminar con 14 `.md` prolijos. El éxito es que, si mañana un complejo real usa TurnoGol:

1. no se filtren datos entre complejos;
2. no haya doble reserva del mismo turno;
3. MercadoPago no deje reservas/pagos en estados corruptos;
4. puedas desplegar, observar, alertar y volver atrás si algo sale mal;
5. tengas un runbook mínimo para operar incidentes reales.

Todo lo demás es secundario.

La nueva regla es:

```text
Fable 5 no se usa para producir más documentos.
Fable 5 se usa para encontrar blockers P0, diseñar fixes correctos y auditar la salida antes del deploy.
```

---

## 1. Principios operativos nuevos

### 1.1. Launch readiness > token efficiency

Ahorrar cuota está bien, pero no puede mandar sobre el riesgo de negocio.

Si Fable 5 encuentra o puede encontrar un bug serio en:

- RLS / tenant isolation;
- concurrencia de reservas;
- MercadoPago/webhooks/idempotencia;
- migraciones/rollback;
- secretos/env vars;
- alertas y monitoreo;

entonces se gasta Fable sin culpa.

Un incidente de aislamiento de tenants o un pago mal registrado cuesta más que cualquier cuota.

---

### 1.2. Tres entregables máximos

La guía anterior generaba demasiada superficie de drift. Ahora solo se permiten tres archivos vivos:

```text
1. docs/launch/RISK_REGISTER.md
2. docs/launch/LAUNCH_BACKLOG.md
3. docs/launch/RUNBOOK_LAUNCH.md
```

Nada de context packs, tesis de arquitectura, PRDs nuevos, specs nuevas o auditorías monumentales salvo que haya una razón concreta.

Si algo no entra en esos tres documentos, probablemente no hace falta ahora.

---

### 1.3. Timeboxing obligatorio

Toda auditoría tiene límite.

Regla base:

```text
Si en 2 horas no aparece un blocker P0 en un área, se cierra y se avanza.
```

Excepción: si apareció un P0 real, se profundiza hasta entenderlo lo suficiente para corregirlo o aislarlo.

---

### 1.4. Código desde el día 1

No más “día 1-3 documentos, día 4 código”.

La nueva cadencia es:

```text
Fable detecta P0 → Sonnet implementa fix/test → Fable revisa el fix → se mergea si pasa verificación.
```

El sándwich sigue vigente, pero con foco quirúrgico:

```text
Fable 5: auditor/arquitecto para riesgos letales.
Sonnet 5: implementador y tester.
Fable 5: reviewer adversarial final solo en cambios críticos.
```

---

### 1.5. No duplicar CLAUDE.md

Tu repo ya tiene un `CLAUDE.md` con reglas críticas del proyecto: stack, RLS, `SET LOCAL`, enums, estados, tenants, MercadoPago, testing, etc.

No copies esas reglas enteras en cada prompt. Eso mete ruido y drift.

En cada prompt solo se debe decir:

```text
Respetá CLAUDE.md como contrato operativo. Si encontrás conflicto entre CLAUDE.md, docs y código, señalalo y priorizá código + seguridad.
```

La calidad del prompt no viene de repetir 60 reglas. Viene de:

- scope chico;
- archivos permitidos/prohibidos;
- criterios de aceptación verificables;
- comandos concretos de validación;
- timebox;
- definición clara de P0/P1/P2.

---

## 2. Qué te tiene que dar más miedo

Antes de abrir Fable, respondé esto en una línea:

```text
Si mañana un complejo real usa TurnoGol, ¿qué error me destruiría más confianza?
```

Para TurnoGol, mi ranking sería:

### P0. Tenant isolation / RLS

Que un admin de un complejo vea, modifique o infiera datos de otro complejo.

Esto mata el producto.

### P0. Doble reserva

Dos jugadores o un admin + jugador reservan el mismo slot por carrera de concurrencia.

Esto genera conflicto operativo inmediato en cancha.

### P0. Pagos/webhooks MercadoPago

Casos letales:

- webhook duplicado genera doble procesamiento;
- webhook retrasado pisa estado nuevo;
- pago aprobado no confirma reserva;
- pago rechazado deja reserva bloqueada;
- refund/cancelación queda inconsistente;
- token OAuth de MP de un tenant cobra a otro;
- idempotencia mal diseñada.

### P0. Deploy/rollback/migraciones

Casos letales:

- deploy rompe producción y no sabés volver atrás;
- migración modifica datos y no tiene rollback probado;
- env var faltante rompe pagos;
- staging no representa producción;
- backup existe “en teoría” pero nunca probaste restore.

### P1. Observabilidad y alertas

No es tan grave como romper datos, pero si falla un webhook un sábado a la noche y nadie se entera, comercialmente estás ciego.

---

## 3. Routing de modelos corregido

| Trabajo | Modelo/herramienta | Por qué |
|---|---|---|
| Auditoría P0 de RLS, pagos, concurrencia | Fable 5 | Acá querés el mejor criterio disponible |
| Threat modeling de flujos críticos | Fable 5 | Necesitás pensar adversarialmente |
| Diseño del fix para un P0 complejo | Fable 5 | Reduce riesgo de parche incompleto |
| Implementar fix acotado | Sonnet 5 | Buen equilibrio costo/velocidad |
| Escribir tests unit/integration/e2e | Sonnet 5 | Trabajo repetible y verificable |
| Refactor chico/mediano | Sonnet 5 | No gastar Fable en albañilería |
| Review final de fix crítico | Fable 5 | Control de calidad de alto impacto |
| UX/UI real en navegador | agent-browser / Playwright | Verificación visual y flujo real |
| SDD largo para feature nueva | Superpowers SDD | Solo si no es blocker de launch |
| Bugs raros donde Sonnet se traba | Opus | Segunda opinión/intermedio antes de Fable |

---

## 4. Regla anti-quema de cuota

### 4.1. Regla humana

Ningún agente puede lanzar más agentes con Fable sin permiso explícito.

Texto para pegar al inicio de sesiones con Antigravity/Claude Code:

```text
Regla de costo obligatoria:
- No lances subagentes automáticamente.
- No lances tareas paralelas sin pedirme aprobación.
- Si necesitás subagentes, primero proponé: cantidad, modelo, objetivo, archivos, costo aproximado y criterio de corte.
- Por defecto, toda exploración, lectura masiva, implementación y tests van con Sonnet.
- Fable solo se usa para auditoría P0, diseño de fix crítico o review final.
- Si una herramienta intenta usar Fable para subagentes repetitivos, detenete y pedime autorización.
```

### 4.2. Regla técnica

La documentación actual de Claude Code indica que `CLAUDE_CODE_SUBAGENT_MODEL` puede fijar el modelo para todos los subagentes y que prevalece sobre otros mecanismos de selección de modelo.

Aun así, no lo trates como única defensa. Primero verificá tu versión local.

Comandos sugeridos:

```bash
claude --version
claude config list
printenv | grep CLAUDE
```

Si tu versión lo soporta, antes de abrir Claude Code para ejecución masiva:

```bash
export CLAUDE_CODE_SUBAGENT_MODEL=sonnet
claude
```

O, si usás `settings.json`, configurar algo equivalente en el entorno del proyecto.

Pero la defensa principal sigue siendo de proceso:

```text
Sin aprobación humana, no hay fan-out.
```

---

## 5. Plan comprimido: 3 días reales + 3 días opcionales

Este plan reemplaza el de 6 días documental.

La versión realista es:

```text
Día 0: preparación y baseline
Día 1: auditoría P0 + primeros fixes
Día 2: fixes + tests fuertes
Día 3: staging + smoke test + rollback + runbook
Día 4-6 opcionales: endurecimiento, UX, deuda P1/P2
```

---

# DÍA 0 — Preparación, baseline y freeze

## Objetivo

Arrancar con una foto real del estado del repo y evitar que Fable trabaje a ciegas.

## Tiempo máximo

2 a 3 horas.

## Resultado esperado

- branch de launch;
- baseline de tests;
- lista inicial de fallos reales;
- definición mínima de launch/demo;
- variables críticas revisadas;
- modelo/subagentes bajo control.

---

## 0.1. Crear branch de launch

```bash
git checkout main
git pull
git checkout -b launch-hardening
```

---

## 0.2. Instalar y levantar entorno local

```bash
pnpm install
pnpm supabase:start
pnpm dev
```

En otra terminal:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:isolation
```

Si falla algo, no entres en pánico. Registralo.

Crear:

```bash
mkdir -p docs/launch
```

Crear `docs/launch/RISK_REGISTER.md`:

```md
# TurnoGol — Risk Register Launch

| ID | Área | Riesgo | Severidad | Evidencia | Estado | Decisión |
|---|---|---|---|---|---|---|
```

Crear `docs/launch/LAUNCH_BACKLOG.md`:

```md
# TurnoGol — Launch Backlog

| ID | Prioridad | Tarea | Archivos | Criterio de aceptación | Comando de verificación | Estado |
|---|---|---|---|---|---|---|
```

Crear `docs/launch/RUNBOOK_LAUNCH.md`:

```md
# TurnoGol — Runbook de Lanzamiento

## Deploy

## Rollback

## Webhooks MercadoPago

## Backups/Restore

## Alertas

## Smoke test post-deploy

## Contactos y accesos
```

---

## 0.3. Definir mínimo demoable

Escribí arriba de `RUNBOOK_LAUNCH.md`:

```md
## Mínimo demoable para launch

TurnoGol se puede mostrar/vender si:

- un admin puede iniciar sesión;
- un complejo puede tener canchas, horarios y precios configurados;
- un jugador puede ver disponibilidad pública;
- un jugador puede reservar un turno;
- si hay seña, MercadoPago confirma o rechaza sin estado corrupto;
- el admin ve la reserva en grilla;
- una reserva no puede duplicarse;
- un admin no puede ver datos de otro tenant;
- existe rollback operativo;
- existe alerta si falla un webhook o error server crítico.
```

---

## 0.4. Verificar herramientas de costo

Antes de usar Fable en agente:

```bash
claude --version
claude config list
printenv | grep CLAUDE
```

Si vas a usar subagentes:

```bash
export CLAUDE_CODE_SUBAGENT_MODEL=sonnet
```

Y en el prompt:

```text
No lances subagentes sin aprobación explícita. Si necesitás subagentes, proponé primero cantidad, modelo y objetivo.
```

---

# DÍA 1 — Auditoría P0 y primeros fixes

## Objetivo

Detectar y empezar a corregir los tres riesgos letales:

1. tenant isolation/RLS;
2. doble reserva/concurrencia;
3. MercadoPago/webhooks/idempotencia.

## Tiempo máximo

- Fable read-only: 3 bloques de 60-90 min.
- Sonnet fixes: resto del día.

---

## 1.1. Auditoría Fable 1 — Tenant isolation / RLS

### Modelo

Fable 5.

### Modo

Read-only.

### Prompt

```text
Actuá como auditor senior de seguridad multi-tenant para un SaaS B2B con PostgreSQL/Supabase/RLS.

Contexto:
Estoy preparando TurnoGol para launch. El riesgo P0 es fuga de datos entre tenants.
Respetá CLAUDE.md como contrato operativo. Si hay conflicto entre docs y código, priorizá código + seguridad.

Reglas:
- Modo read-only.
- No edites archivos.
- No lances subagentes.
- Timebox: 90 minutos.
- No generes documentación larga.
- Buscá blockers P0/P1, no estilo.

Scope permitido:
- CLAUDE.md
- docs/spec/doc12*
- docs/spec/doc13*
- src/shared/db/**
- src/**/actions/**
- src/**/services/**
- src/**/repositories/**
- src/app/api/**
- tests/integration/**

Tu tarea:
1. Identificá todos los caminos de lectura/escritura que deberían estar aislados por tenant.
2. Buscá uso incorrecto o ausente de SET LOCAL / app.current_tenant_id / app.current_player_id.
3. Buscá queries que usen service role o bypass de RLS sin justificación.
4. Buscá endpoints/actions que acepten tenant_id desde input del cliente de forma peligrosa.
5. Revisá si los tests de aislamiento cubren staff, jugador y casos negativos.
6. Detectá drift entre CLAUDE.md, docs y schema real solo si afecta seguridad.

Output máximo:
- Top P0/P1 findings.
- Evidencia concreta: archivo + función + por qué es riesgo.
- Fix recomendado mínimo.
- Test que debería fallar antes y pasar después.
- Si no hay blocker P0, decilo explícitamente.
```

### Qué hacer con el output

Solo aceptar findings con evidencia concreta.

Cada finding real va a `RISK_REGISTER.md` y, si requiere acción, a `LAUNCH_BACKLOG.md`.

Formato:

```md
| TG-P0-001 | RLS | Posible bypass en X | P0 | archivo:línea/función | Abierto | Fix + test aislamiento |
```

---

## 1.2. Sonnet implementa fix RLS

### Modelo

Sonnet 5.

### Prompt plantilla

```text
Implementá SOLO el fix TG-P0-___ del LAUNCH_BACKLOG.

Reglas:
- Respetá CLAUDE.md.
- No toques archivos fuera del scope permitido.
- No refactors oportunistas.
- No cambies docs salvo RISK_REGISTER/LAUNCH_BACKLOG si corresponde.
- Agregá o ajustá tests que prueben el bug.

Archivos permitidos:
[PEGAR LISTA EXACTA]

Criterio de aceptación:
[PEGAR CRITERIO EXACTO]

Comandos obligatorios al final:
pnpm typecheck
pnpm test:isolation
pnpm test:integration

Salida:
- Archivos modificados.
- Qué bug corrigió.
- Qué test lo cubre.
- Resultado de comandos.
```

---

## 1.3. Auditoría Fable 2 — Doble reserva / concurrencia

### Modelo

Fable 5.

### Prompt

```text
Actuá como auditor senior de concurrencia transaccional para reservas de turnos.

Contexto:
TurnoGol no puede permitir doble reserva del mismo slot/cancha/tenant. Este es un riesgo P0 de launch.
Respetá CLAUDE.md. Priorizá código + invariantes de DB por encima de intención documentada.

Reglas:
- Modo read-only.
- No edites archivos.
- No lances subagentes.
- Timebox: 90 minutos.
- No generes arquitectura ideal; buscá fallos concretos.

Scope:
- schema/migrations de bookings/courts/availability/payments
- servicios/actions de creación de reservas
- helpers de slots/disponibilidad
- tests de concurrencia/stress/isolation
- scripts/stress-test.ts si existe

Preguntas obligatorias:
1. ¿Existe constraint real de DB que impida doble reserva confirmada/pending para misma cancha+fecha+hora?
2. ¿El flujo de reserva depende solo de check previo de disponibilidad? Si sí, es sospechoso.
3. ¿Qué pasa si dos requests llegan al mismo tiempo?
4. ¿Qué pasa si un pago confirma después de expirar el hold?
5. ¿Qué pasa con reservas manuales admin vs reservas públicas simultáneas?
6. ¿Hay test de carrera real o solo unit tests felices?

Output máximo:
- P0/P1 findings con evidencia.
- Invariante correcta recomendada.
- Test de concurrencia mínimo.
- Fix mínimo, sin rediseñar todo.
```

### Verificación mínima esperada

Si no existe, crear o mejorar test que simule concurrencia.

Comandos:

```bash
pnpm test:integration
pnpm stress:bookings
```

Si `stress:bookings` no funciona todavía, convertirlo en una tarea P1/P0 según criticidad.

---

## 1.4. Auditoría Fable 3 — MercadoPago/webhooks/idempotencia

### Modelo

Fable 5.

### Prompt

```text
Actuá como auditor senior de pagos/webhooks para MercadoPago en SaaS multi-tenant.

Contexto:
TurnoGol usa MercadoPago para señas y OAuth por complejo. El riesgo P0 es estado corrupto de reserva/pago, doble procesamiento, token equivocado o webhook duplicado/retrasado.
Respetá CLAUDE.md. Priorizá código + seguridad.

Reglas:
- Read-only.
- No edites.
- No lances subagentes.
- Timebox: 90 minutos.

Scope:
- src/app/api/**mercadopago**
- src/app/api/**webhook**
- src/**/payments/**
- src/**/booking/**
- src/shared/db/**processed_webhooks**
- migraciones relacionadas a payments, bookings, tenant mp tokens
- tests integration/e2e relacionados

Preguntas obligatorias:
1. ¿El webhook es idempotente ante duplicados?
2. ¿Hay tabla/constraint para processed_webhooks o equivalente?
3. ¿El webhook consulta a MercadoPago para confirmar estado real antes de mutar DB?
4. ¿Qué pasa si el webhook llega tarde después de expiración/cancelación?
5. ¿Qué pasa si MercadoPago manda pending/in_process/rejected/approved/refunded?
6. ¿Se usa token OAuth correcto del tenant y está cifrado at-rest?
7. ¿Hay riesgo de cobrar o asociar pago al tenant incorrecto?
8. ¿Hay logs/alertas si falla procesamiento?

Output máximo:
- P0/P1 findings.
- Evidencia concreta.
- Fix mínimo.
- Tests obligatorios: duplicado, retrasado, aprobado, rechazado, expirado.
```

### Tests mínimos esperados

Crear o verificar casos:

```text
- webhook approved duplicado no duplica booking/payment/cashflow;
- webhook rejected libera/cancela hold correctamente;
- webhook approved después de expiración no revive una reserva inválida sin regla explícita;
- webhook desconocido se loguea y responde de forma segura;
- tenant A no puede procesar pago/MP token de tenant B.
```

---

# DÍA 2 — Fixes + tests fuertes

## Objetivo

Convertir findings P0/P1 en código probado.

## Regla central

Nada de features nuevas.

Solo:

```text
P0: corregir sí o sí.
P1: corregir si bloquea launch o si es barato.
P2: backlog post-launch.
```

---

## 2.1. Orden de ejecución

1. RLS/tenant isolation.
2. Doble reserva/concurrencia.
3. MercadoPago/webhooks.
4. Env vars/secrets.
5. Observabilidad mínima.

---

## 2.2. Prompt de implementación Sonnet para cada ticket

```text
Implementá el ticket [ID] del LAUNCH_BACKLOG.

Contexto:
Estamos en etapa launch-hardening. No agregues features ni refactors no pedidos.

Reglas:
- Respetá CLAUDE.md.
- No lances subagentes.
- No modifiques archivos fuera de la lista permitida.
- El fix debe ser mínimo y verificable.
- Si el fix requiere una migración, explicá riesgo y rollback.
- Agregá test que falle antes y pase después.

Ticket:
[PEGAR TICKET]

Archivos permitidos:
[LISTA]

Comandos obligatorios:
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:isolation

Si tocás reservas/concurrencia:
pnpm stress:bookings

Si tocás UI crítica:
pnpm test:e2e

Salida obligatoria:
1. Qué cambiaste.
2. Qué riesgo elimina.
3. Qué test lo prueba.
4. Qué comando corriste y resultado.
5. Qué queda pendiente, si queda algo.
```

---

## 2.3. Review Fable solo para fixes críticos

No uses Fable para revisar cada cambio menor.

Usalo cuando el ticket sea:

- RLS;
- concurrencia;
- pagos/webhooks;
- migración irreversible;
- seguridad de tokens/secretos;
- auth.

Prompt:

```text
Actuá como reviewer adversarial de launch para este diff crítico.

Contexto:
Este cambio intenta cerrar el ticket [ID] del LAUNCH_BACKLOG.
Área crítica: [RLS/concurrencia/pagos/etc.]
Respetá CLAUDE.md.

Reglas:
- No propongas refactors cosméticos.
- No pidas documentación extra salvo que sea necesaria para operar el launch.
- Buscá si el fix es incompleto, inseguro o introduce regresión.
- Verificá que el test realmente cubra el riesgo.

Revisá:
1. ¿El bug original queda eliminado?
2. ¿Hay bypass o edge case no cubierto?
3. ¿El test puede dar falso positivo?
4. ¿La migración es segura?
5. ¿Hay rollback o mitigación?

Output:
- Aprobado / No aprobado.
- Blockers concretos.
- Cambios mínimos requeridos.
```

---

## 2.4. Limpieza de drift conocido

El repo ya declara drift crítico en `CLAUDE.md`, por ejemplo:

- `open_matches` / `open_match_players` fuera de scope v1;
- enum `read_only` eliminado por decisión pero todavía presente;
- specs con conteo de tablas/RLS desactualizado;
- posibles restos de `in_process` según cambios ya decididos.

No limpies todo por limpieza.

Criterio:

```text
Si el drift puede romper launch, pagos, permisos, disponibilidad o tests, se arregla.
Si solo molesta estéticamente, queda post-launch.
```

Prompt Fable corto para decidir:

```text
Analizá SOLO estos drift items conocidos:
- open_matches/open_match_players fuera de v1
- enum read_only pendiente
- referencias a in_process/pagos lentos

Decime cuáles son blockers reales de launch y cuáles pueden quedar post-launch.
No edites. No hagas arqueología general. Timebox 45 min.
Output: decisión por item + razón + test/comando de verificación.
```

---

# DÍA 3 — Staging, smoke test, rollback y runbook real

## Objetivo

Demostrar que TurnoGol puede sobrevivir un deploy realista.

No alcanza con un documento de “launch readiness”. Tiene que haber prueba operativa.

---

## 3.1. Pre-staging checklist

Correr local:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:isolation
pnpm test:e2e
pnpm launch:check
```

Si alguno falla, decidir:

```text
¿Es P0/P1 launch blocker o se acepta como deuda post-launch?
```

Registrar en `LAUNCH_BACKLOG.md`.

---

## 3.2. Staging real

Necesitás una URL de staging/preview y una base que no sea producción.

Verificar:

- env vars de Supabase staging;
- MercadoPago sandbox/test credentials;
- Sentry DSN staging/prod separados si aplica;
- Resend sandbox/test o dominio verificado;
- Vercel preview/prod env separadas;
- `ENCRYPTION_KEY` presente y con formato correcto;
- `SUPABASE_SERVICE_ROLE_KEY` jamás expuesta al browser.

Agregar al `RUNBOOK_LAUNCH.md`:

```md
## Env vars verificadas

| Variable | Local | Staging | Producción | Nota |
|---|---|---|---|---|
| DATABASE_URL |  |  |  |  |
| NEXT_PUBLIC_SUPABASE_URL |  |  |  |  |
| NEXT_PUBLIC_SUPABASE_ANON_KEY |  |  |  |  |
| SUPABASE_SERVICE_ROLE_KEY |  |  |  | Nunca browser |
| ENCRYPTION_KEY |  |  |  | 64 hex chars |
| MP_CLIENT_ID |  |  |  |  |
| MP_CLIENT_SECRET |  |  |  |  |
| SENTRY_DSN |  |  |  |  |
| RESEND_API_KEY |  |  |  |  |
```

---

## 3.3. Smoke test end-to-end obligatorio

Usar `agent-browser`, Playwright o manual asistido.

### Flujo admin

```text
1. Login admin.
2. Crear/ver complejo demo.
3. Configurar cancha.
4. Configurar horarios.
5. Configurar precio.
6. Ver grilla.
7. Crear reserva manual.
8. Cancelar reserva manual.
9. Ver caja/reportes si aplica.
```

### Flujo jugador

```text
1. Abrir portal público.
2. Ver complejo.
3. Ver disponibilidad.
4. Elegir turno.
5. Completar datos.
6. Iniciar pago/seña sandbox.
7. Confirmar pago sandbox.
8. Volver a TurnoGol.
9. Ver reserva confirmada.
10. Admin ve reserva en grilla.
```

### Flujo webhook forzado

Tenés que simular o reenviar:

```text
1. webhook approved normal;
2. webhook approved duplicado;
3. webhook rejected;
4. webhook tardío después de expiración;
5. webhook desconocido / malformed.
```

El resultado esperado debe estar en tests o documentado en runbook.

---

## 3.4. Prompt agent-browser

```text
Usá agent-browser para ejecutar un smoke test UX/UI de TurnoGol en staging.

Objetivo:
Detectar blockers de uso real para admin y jugador antes del launch.

Reglas:
- No modifiques código.
- No evalúes diseño cosmético salvo que impida completar el flujo.
- Priorizá errores que bloquean reserva, pago, login, grilla o confirmación.

Flujos:
1. Admin login → grilla → crear reserva manual → cancelar.
2. Jugador portal público → disponibilidad → reserva → pago sandbox → confirmación.
3. Responsive mobile para jugador.

Output:
- Blockers P0/P1 con pasos para reproducir.
- Screenshots si la herramienta permite.
- Ruta exacta donde falla.
- Qué esperabas vs qué pasó.
- Recomendación mínima de fix.
```

---

## 3.5. Rollback probado

El rollback no puede ser “sé que Vercel tiene botón”.

Tiene que estar escrito y probado, aunque sea con preview/staging.

En `RUNBOOK_LAUNCH.md`:

```md
## Rollback app Vercel

1. Ir a Vercel → Project → Deployments.
2. Identificar último deployment bueno.
3. Promote / Instant Rollback al deployment anterior.
4. Verificar:
   - home carga;
   - login admin carga;
   - portal público carga;
   - webhook endpoint responde;
   - Sentry no recibe error masivo.

CLI alternativo:

```bash
vercel rollback [deployment-url-or-id]
```
```

### Rollback de migración

Para cada migración nueva que metas en launch-hardening:

```md
## Migración [ID]

- Qué cambia:
- Riesgo:
- Es backward-compatible: sí/no
- Requiere downtime: sí/no
- Rollback SQL:
- Restore necesario si falla: sí/no
- Probado en staging: sí/no
```

Si una migración no tiene rollback razonable, no se mete salvo que sea P0.

---

## 3.6. Backup/restore probado

No alcanza con “Supabase hace backups”.

Mínimo:

```text
- confirmar plan actual de Supabase;
- confirmar si hay daily backups/PITR;
- documentar cómo restaurar a proyecto temporal;
- hacer un restore drill si estás cerca de producción real.
```

En `RUNBOOK_LAUNCH.md`:

```md
## Backup / Restore

Plan Supabase actual:
Retención:
PITR habilitado: sí/no
Último backup visible:

Restore drill:
- Fecha:
- Proyecto temporal:
- Comando/test ejecutado:
- Resultado:
- Responsable:
```

Comando recomendado contra temp project:

```bash
DATABASE_URL=<temp-project-url> pnpm test:isolation
```

---

## 3.7. Alertas mínimas

Tu repo tiene Sentry configurado. El problema no es tener SDK; es enterarte.

Mínimo antes del launch:

```text
1. Alerta de errores server críticos.
2. Alerta de fallo en webhook MercadoPago.
3. Alerta de tasa anormal de errores 5xx.
4. Canal donde realmente lo veas: email, Slack, Discord, push o lo que uses.
```

En `RUNBOOK_LAUNCH.md`:

```md
## Alertas

| Alerta | Herramienta | Canal | Probada | Qué hago si dispara |
|---|---|---|---|---|
| Error server crítico | Sentry |  |  |  |
| Webhook MP falló | Sentry/log |  |  |  |
| 5xx alto | Vercel/Sentry |  |  |  |
```

---

# DÍAS 4-6 — Opcionales si ya no hay P0

Usalos solo si Día 1-3 salió limpio o los P0 ya están cerrados.

## Día 4 — UX/UI real + mobile

Modelo/herramienta:

- agent-browser;
- Playwright;
- Sonnet para fixes chicos;
- Fable solo si hay decisión compleja de flujo.

Foco:

- mobile jugador;
- claridad de disponibilidad;
- errores de pago;
- empty states;
- loading states;
- formularios rotos;
- textos críticos.

No rediseñar toda la app.

---

## Día 5 — Performance mínima y carga operativa

Foco:

- grilla admin;
- disponibilidad pública;
- queries N+1;
- índices faltantes;
- estrés de reservas.

Comandos:

```bash
pnpm lighthouse
pnpm lighthouse:public
pnpm stress:bookings
```

Fable solo para:

```text
Analizá resultados de stress/performance y decime si hay un P0/P1 para launch o si queda post-launch.
```

---

## Día 6 — Go/No-Go final

Fable como auditor final, no como escritor de documento largo.

Prompt:

```text
Actuá como release manager adversarial para TurnoGol.

Contexto:
Estamos decidiendo Go/No-Go de launch.
Respetá CLAUDE.md y los archivos docs/launch/RISK_REGISTER.md, LAUNCH_BACKLOG.md y RUNBOOK_LAUNCH.md.

Reglas:
- No propongas features nuevas.
- No pidas documentación adicional salvo que sea operativamente necesaria.
- Clasificá solo blockers reales.

Revisá:
1. P0 abiertos.
2. P1 aceptables o no aceptables.
3. Evidencia de tests.
4. Smoke test staging.
5. Rollback probado.
6. Backup/restore documentado o probado.
7. Alertas mínimas.
8. Env vars/secrets.

Output:
- GO / NO-GO.
- Si NO-GO: máximo 5 blockers concretos.
- Si GO: riesgos aceptados explícitamente.
- Primeras 24h post-launch: qué mirar.
```

---

## 6. Cómo usar Superpowers sin convertirlo en burocracia

Superpowers SDD sirve cuando estás diseñando una feature grande.

Para launch-hardening, usalo solo si:

```text
La tarea requiere más de 2-3 horas, toca varias capas y necesita dividirse en subtareas.
```

No lo uses para:

- fix chico de RLS;
- test de webhook duplicado;
- corregir env var;
- ajustar un endpoint;
- un bug reproducible de UI.

Regla:

```text
P0 launch bug → ticket directo.
Feature post-launch → Superpowers SDD.
```

---

## 7. Formato de ticket bueno

Cada ticket de `LAUNCH_BACKLOG.md` debe tener esto:

```md
## TG-P0-001 — [Título]

Prioridad: P0
Área: RLS / Pagos / Concurrencia / Deploy / Observabilidad
Estado: Abierto

### Riesgo

### Evidencia

### Archivos permitidos

### Archivos prohibidos

### Criterio de aceptación

### Test obligatorio

### Comandos de verificación

### Rollback / mitigación
```

Ejemplo:

```md
## TG-P0-002 — Webhook MercadoPago duplicado no debe reprocesar pago

Prioridad: P0
Área: Pagos/Webhooks
Estado: Abierto

### Riesgo
Un webhook approved duplicado podría procesar dos veces el mismo pago y dejar estado inconsistente.

### Evidencia
[archivo/función]

### Archivos permitidos
- src/app/api/mercadopago/webhook/**
- src/shared/payments/**
- tests/integration/**

### Archivos prohibidos
- src/app/admin/**
- docs/spec/** salvo que el test demuestre drift blocker

### Criterio de aceptación
Enviar dos veces el mismo webhook approved produce una sola mutación efectiva.

### Test obligatorio
Test integration que llame dos veces al handler con mismo payment/webhook id.

### Comandos
pnpm typecheck
pnpm test:integration

### Rollback
Revert del commit + mantener logging de webhook para reprocesar manualmente si aplica.
```

---

## 8. Criterio de corte por severidad

### P0 — Bloquea launch

- fuga entre tenants;
- doble reserva posible;
- pagos con estado corrupto;
- deploy sin rollback;
- migración irreversible no probada;
- secreto expuesto;
- app no puede completar reserva principal.

### P1 — Arreglar antes de launch si entra

- error UX que confunde pero no corrompe datos;
- alertas incompletas;
- caso borde de horario;
- performance mala pero tolerable en demo;
- test flakey en flujo no crítico.

### P2 — Post-launch

- limpieza de docs;
- refactor estético;
- nombres inconsistentes que no afectan runtime;
- features futuras;
- mejoras de diseño no bloqueantes.

---

## 9. Prompts finales de uso frecuente

### 9.1. Prompt “decime qué hago ahora”

```text
Leé docs/launch/RISK_REGISTER.md y docs/launch/LAUNCH_BACKLOG.md.

Decime cuál es la próxima tarea con mayor impacto para launch.

Reglas:
- No propongas más de 1 tarea.
- No propongas documentación salvo que desbloquee deploy/operación.
- Priorizá P0 > P1 > P2.
- Si todos los P0 están cerrados, elegí el P1 más barato de cerrar.

Output:
- Próxima tarea.
- Por qué ahora.
- Modelo recomendado: Fable/Sonnet/Opus/humano.
- Criterio de aceptación.
```

---

### 9.2. Prompt “stop doing bullshit”

Usalo cuando notes que el agente quiere armar plan gigante.

```text
Frená.

Estamos en launch-hardening, no en discovery.

Reducí tu propuesta a:
1. un riesgo concreto;
2. un archivo o flujo concreto;
3. un test verificable;
4. una decisión: fix ahora / aceptar riesgo / post-launch.

No generes frameworks nuevos.
No generes documentación larga.
No lances subagentes.
```

---

### 9.3. Prompt “Fable auditor final de pagos”

```text
Actuá como auditor final de pagos MercadoPago para launch.

Revisá solo el diff y los tests relacionados a pagos/webhooks.

Criterios:
- idempotencia ante duplicados;
- webhook tardío;
- estados rejected/approved/refunded;
- tenant correcto;
- token OAuth correcto;
- logging/alerta ante fallo;
- no doble cashflow/payment/booking mutation.

Output:
Aprobado / No aprobado.
Si no aprobado, máximo 3 blockers concretos.
```

---

### 9.4. Prompt “Fable auditor final RLS”

```text
Actuá como auditor final de tenant isolation/RLS para launch.

Revisá solo el diff y tests relacionados.

Criterios:
- admin tenant A no lee/escribe tenant B;
- jugador solo accede a sus datos permitidos;
- service role no se usa en caminos públicos salvo justificación fuerte;
- SET LOCAL correcto;
- tests negativos existen.

Output:
Aprobado / No aprobado.
Si no aprobado, máximo 3 blockers concretos.
```

---

## 10. Checklist GO/NO-GO

No hay GO si alguno de estos está en rojo:

```md
# GO/NO-GO TurnoGol

## Seguridad multi-tenant
- [ ] pnpm test:isolation pasa
- [ ] No hay P0 RLS abierto
- [ ] No hay uso peligroso de service role en flujo público

## Reservas
- [ ] No hay doble reserva bajo concurrencia
- [ ] Test/stress de bookings pasa o hay mitigación clara
- [ ] Expiración de holds funciona

## Pagos MercadoPago
- [ ] Pago approved confirma reserva
- [ ] Pago rejected no deja slot bloqueado indebidamente
- [ ] Webhook duplicado es idempotente
- [ ] Webhook tardío tiene regla segura
- [ ] Token MP es tenant-correct y cifrado at-rest

## Deploy
- [ ] CI verde
- [ ] Staging probado
- [ ] Rollback Vercel probado o documentado paso a paso
- [ ] Migraciones nuevas tienen rollback/mitigación

## Datos
- [ ] Backup Supabase confirmado
- [ ] Restore a proyecto temporal probado o calendarizado antes de clientes reales

## Observabilidad
- [ ] Sentry recibe errores server/client
- [ ] Existe alerta visible para errores críticos
- [ ] Fallo de webhook genera evento/log rastreable

## Smoke test
- [ ] Admin crea/cancela reserva
- [ ] Jugador reserva desde mobile
- [ ] Pago sandbox completa flujo
- [ ] Admin ve reserva final
```

---

## 11. Mi recomendación concreta para vos

No vuelvas a pedir:

```text
Auditá todo el repo y hacé un plan completo.
```

Pedí:

```text
Auditá SOLO pagos/webhooks como P0 de launch. Timebox 90 min. Dame blockers con evidencia y tests.
```

Después:

```text
Implementá SOLO TG-P0-003 con estos archivos permitidos y estos comandos de verificación.
```

Y después:

```text
Revisá adversarialmente SOLO este diff crítico. Aprobado o no aprobado.
```

Esa es la forma correcta de usar Fable 5 en TurnoGol ahora.

---

## 12. Orden exacto recomendado desde este momento

1. Crear `launch-hardening`.
2. Correr baseline completo.
3. Crear los tres docs de launch.
4. Fable audit RLS 90 min.
5. Sonnet fija P0 RLS si aparece.
6. Fable review solo si hubo fix crítico.
7. Fable audit concurrencia 90 min.
8. Sonnet test/fix.
9. Fable audit MercadoPago 90 min.
10. Sonnet test/fix.
11. Staging.
12. Smoke test con agent-browser/Playwright.
13. Webhook duplicado/tardío forzado.
14. Rollback app probado.
15. Backup/restore definido.
16. Alertas mínimas.
17. Fable GO/NO-GO.

Si en cualquier punto aparece P0, todo lo demás se pausa hasta cerrarlo o aceptar explícitamente el riesgo.

