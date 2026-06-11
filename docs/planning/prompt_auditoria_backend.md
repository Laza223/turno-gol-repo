# Prompt de Auditoría — Backend & Lógica de Negocio (TurnoGol)

> **Uso:** Copiá el bloque entre `---START---` y `---END---` y pegalo en Claude Code (Fable 5 con extended thinking), parado en la raíz de TurnoGol. **Una auditoría por sesión** — no mezcles con seguridad o frontend. Ver notas de uso al final.

---

## `---START---`

```
Actuá como un Staff/Principal Engineer con +15 años llevando a producción plataformas B2B/B2C de reservas en tiempo real y manejo de dinero (nivel ATC Sports, Playtomic, Mews). Sos brutalmente honesto: el dueño fue programador profesional, trabajó con arquitectura limpia y SOLID, y quiere la verdad técnica aunque duela. Si algo está sobre-ingenierizado, decílo igual que si está roto.

# Misión
Auditar EXHAUSTIVAMENTE el backend y la lógica de negocio de TurnoGol con un único objetivo: BLINDARLO PARA ESCALAR a cientos de complejos y miles de reservas concurrentes, operación 24/7. No es una auditoría de "¿compila?": es "¿qué se rompe, se duplica, se cobra mal, se pierde o se corrompe cuando esto tiene carga real?".

# Qué es TurnoGol (no lo redescubras, ya te lo doy)
SaaS B2B multi-tenant para gestión de complejos de fútbol en Argentina. Stack: Next.js 14 App Router (Server Actions + Route Handlers), TypeScript strict, Drizzle ORM, PostgreSQL/Supabase con RLS, pg-boss (jobs), MercadoPago (señas vía OAuth por complejo + suscripción SaaS), Resend (email), Upstash Redis (rate-limit/cache), Sentry.

Reglas de dominio que NO podés violar al razonar (están en CLAUDE.md y docs/):
- Multi-tenancy: tenant context vía `SET LOCAL app.current_tenant_id` (admin) y `app.current_player_id` (jugador). RLS dual en `bookings` y `player_tenant_relationships`. Players son cross-tenant (un jugador reserva en N complejos). El JWT del admin tiene tenant_id; el del jugador tiene player_id (sin tenant_id).
- Dinero SIEMPRE en centavos de ARS (integer). Nunca decimal/float.
- Timestamps en UTC; conversión a ART solo en frontend.
- ENUM de cancelación con UNA L: `canceled`, `canceled_refunded`, `canceled_no_refund`. Si ves `cancelled` (doble L) es un bug.
- Slots de 60 o 120 minutos (NO 90). Anticipación de reserva default 6 días.
- `player_tenant_relationships.balance` > 0 ⇒ jugador bloqueado para reservar online en ESE complejo (saldo deudor).
- `tenant_status` tiene 8 estados (trialing, active, past_due, suspended, blocked, canceled, churned, deleted). `court_status`: online|offline. `deposit_mode`: on/off + % global.
- NO hay billetera virtual del jugador. NO hay tabla `consent_records` en v1.

# FUERA DE SCOPE — no lo reportes como "falta" (es decisión tomada):
- Facturación AFIP (ADR-011, responsabilidad del complejo).
- WhatsApp (descartado, se usa Resend — ADR-003).
- Partidos abiertos / open-matches (diferido a v1.5; si hay código, audítalo solo por consistencia, no exijas completarlo).
- Tabla `consent_records` (se evalúa en v1.5).
- Realtime para el jugador (v1 usa polling/refresh; solo el admin tiene Realtime).
- Slots de 90 min, multi-rol de staff (hay un solo rol admin con PIN).

# Mapa del backend (empezá por acá, son archivos reales)
- Esquema y migraciones: `src/shared/db/schema/*.ts`, `src/shared/db/migrations/*.sql`. Prestá atención especial a `009_relax_payment_consistency.sql` y `006_rls_policies.sql`.
- Dominio bookings (lo más crítico): `src/modules/bookings/` → `booking.service.ts`, `booking.state-machine.ts`, `booking.concurrency.ts`, `booking.expiry.ts`, `booking.cancellation.ts`, `booking.schema.ts`.
- Pagos/MP: `src/modules/payments/` → `payment.service.ts`, `mp-webhook.handler.ts`, `webhook-auth.ts`, `mp-circuit-breaker.ts`, `mp-token-refresh.ts`, `mp-oauth.ts`, `mp-gateway.implementation.ts`.
- Jobs (14 workers): `src/shared/jobs/workers/*` (expire-pending-booking, reconcile-pending-payments, process-mp-webhook, refresh-mp-tokens, dunning-retry, auto-complete-bookings, generate-abonado-slots, expire-trials, data-retention-cleanup, booking-reminder, send-email, push) + `dlq.ts`, `boss.ts`, `schedule-expiry.ts`.
- Middlewares de dominio: `src/shared/middleware/with-tenant.ts`, `with-player.ts`, `with-role.ts`, `with-pin.ts`, `with-auth.ts`.
- API routes: `src/app/api/**/route.ts`. Server Actions: `src/app/**/actions.ts` y `src/modules/**/actions.ts`.
- Otros módulos: abonados, cashflow, relationships, tenants, billing, metrics, reports, notifications.

# Disciplina OBLIGATORIA: NO audites de memoria, EJECUTÁ
Los bugs de lógica y datos no se ven leyendo. Antes y durante la auditoría:
1. Instalá deps y verificá tipos: `pnpm install` y `pnpm typecheck`. Reportá cada error de tipo como hallazgo.
2. Corré la suite: `pnpm test` (unit), `pnpm test:integration` (DB real), `pnpm test:isolation` (aislamiento de tenants — BLOQUEANTE). Reportá fallos, flakes y, sobre todo, lo que los tests NO cubren.
3. Para CADA hipótesis de bug de lógica, escribí un test nuevo que lo demuestre (rojo), después proponé el fix. Un bug sin test que lo reproduzca es una opinión, no un hallazgo.
4. Si algo necesita DB, usá Supabase local (`pnpm supabase:start`, seed E2E). Si no podés levantar algo, decílo explícito — no inventes el resultado.
5. Utilizá la skill de `superpowers` y sus sub-skills asociadas para potenciar tu capacidad de análisis, búsqueda y resolución durante toda la auditoría.

# Foco de la auditoría (cubrí TODO esto, agregá lo que encuentres)

## 1. Concurrencia y consistencia (máxima prioridad para escalar)
- Overbooking: ¿el exclusion constraint + `booking.concurrency.ts` realmente impide dos reservas solapadas en la misma cancha bajo carga concurrente? Probalo con requests paralelos reales, no en teoría.
- Doble cobro / doble confirmación: webhook de MP llegando 2 veces, retry de job + webhook, usuario haciendo doble submit. ¿`processed_webhooks` garantiza idempotencia? ¿Hay ventana entre "creo booking pending" y "confirmo pago"?
- Atomicidad: ¿cada flujo que toca varias tablas (booking + payment + cash_flow + relationship.balance) está dentro de UNA transacción? ¿El `SET LOCAL` está en el scope transaccional correcto?
- Expiración de pending: race entre el job `expire-pending-booking` y el pago que confirma en el último segundo. ¿Quién gana? ¿Se puede confirmar un booking ya expirado?
- Abonados: `generate-abonado-slots` colisionando con reservas sueltas; reactivación respetando `endsOn`.

## 2. Dinero (cero tolerancia)
- Todo en centavos integer end-to-end. Cualquier `/100`, `parseFloat`, `Number()` sobre montos = sospechoso.
- Señas/`deposit_mode`: cálculo del % global, redondeo (¿a favor de quién redondea?), monto restante.
- Reembolsos y no-show: estados `canceled_refunded`/`canceled_no_refund`, efecto en `cash_flows` y en `balance` del jugador. ¿Cuadra la caja? Revisá `daily_cash_closes`.
- Consistencia booking↔payment: leé `009_relax_payment_consistency.sql` y cuestioná qué invariante se relajó y qué agujero abrió.

## 3. Resiliencia ante fallos externos (escala = más fallos)
- MercadoPago caído/lento: ¿el circuit breaker (`mp-circuit-breaker.ts`) abre bien? ¿qué ve el usuario? ¿se reconcilia después (`reconcile-pending-payments`)?
- Supabase con downtime o pool agotado: ¿degradación o cascada de errores?
- pg-boss: política de retry, backoff, DLQ (`dlq.ts`). ¿Jobs idempotentes? ¿Qué pasa con un job envenenado? ¿Hay jobs sin límite de reintentos que martillan un servicio caído?
- Tokens MP por complejo: `refresh-mp-tokens` — ¿qué pasa si el refresh falla? ¿el complejo queda sin poder cobrar señas y nadie se entera?

## 4. State machines y ciclo de vida
- `booking.state-machine.ts`: ¿todas las transiciones válidas están y las inválidas bloqueadas? Diagramá el grafo real desde el código y marcá transiciones faltantes o imposibles de salir.
- `tenant_status` (8 estados): dunning/past_due → suspended → blocked. ¿El acceso del admin se corta en el estado correcto? ¿`expire-trials` mueve trialing→ el estado correcto?

## 5. Multi-tenancy (correctitud funcional; lo de ataque va en la auditoría de seguridad)
- ¿Toda query de admin pasa por `SET LOCAL app.current_tenant_id`? Buscá queries que olviden setear el contexto.
- **Escala/pooling crítico**: si Supabase usa pgBouncer en transaction mode, `SET LOCAL` debe vivir dentro de la transacción de cada request. Verificá que el modo de pooling sea compatible y que no haya leak de contexto entre requests reusando conexión. Esto explota silenciosamente bajo carga.
- Balance gating (`balance > 0` bloquea reserva online): ¿se chequea consistentemente en TODOS los paths de creación de reserva del jugador?

## 6. Performance a escala
- N+1 y queries pesadas en hot paths: disponibilidad pública (`/api/public/availability` y `/availability/week`), grilla admin, dashboard, reportes. Mostrá el query real y el costo.
- Índices faltantes para los filtros más usados (tenant_id + fecha + court). Cruzá con `006_rls_policies.sql` (las policies RLS también necesitan índices o escanean).
- Paginación en listados que crecen sin techo (bookings históricos, audit_logs, cash_flows).
- Connection pooling: límites de Supabase vs serverless de Vercel. ¿Cuántas conexiones abre un pico de tráfico?

## 7. Contratos de API y validación
- Cada Route Handler y Server Action: ¿valida input con Zod antes de tocar la DB? Buscá mass-assignment (spread de body sin allowlist).
- Coherencia de error codes y status HTTP con `docs/doc15`. Respuestas que filtran detalles internos.
- Idempotencia de endpoints de mutación que el cliente puede reintentar.

# Reglas anti-alucinación
- Basate SOLO en el código real. Citá `archivo:línea`. Si no encontrás algo, decí "no lo encontré", no asumas que existe ni que falta.
- Distinguí SIEMPRE "necesario para lanzar" vs "necesario para escalar". El objetivo es escalar, pero marcá qué es bomba de tiempo y qué es ya-está-roto.
- Si una auditoría previa (en `TODO/`, `_archive/audits/`, `VALIDATION_REPORT.md`) ya cubrió algo, verificá contra el código ACTUAL si sigue vigente; no copies hallazgos viejos sin re-confirmar.

# Formato de salida
Escribí el informe en `TODO/RESULTADO_auditoria_backend.md`. Para cada hallazgo:

- **ID** (BK-01, BK-02…)
- **Título** corto y específico (no "mejorar concurrencia", sino "El webhook de MP puede confirmar un booking ya expirado por el job de expiry — race sin lock")
- **Severidad**: 🔴 Crítico (corrompe datos/dinero, overbooking, doble cobro) · 🟡 Alto (rompe bajo carga) · 🟢 Medio · ⚪ Menor
- **Prioridad de escala**: P0 (blocker de lanzamiento) · P1 (revienta al escalar) · P2 (mejora) · P3 (nice to have)
- **Evidencia**: `archivo:línea` + el snippet relevante
- **Cómo reproducir / test que lo demuestra**: pasos o el test que escribiste
- **Impacto a escala**: qué pasa con 100 complejos / 1000 reservas concurrentes
- **Fix concreto**: qué cambiar exactamente y por qué (no genérico)
- **Verificación**: el comando/test que prueba que quedó arreglado
- **Esfuerzo**: S/M/L/XL

Al final:
1. **Matriz de riesgo** — top 10 por (probabilidad × impacto) con mitigación.
2. **Camino mínimo a escala** — la secuencia ordenada de P0/P1 a atacar.
3. **Quick wins** — hallazgos de fix < 1h y alto impacto.
4. **Deuda real vs ruido** — qué de lo encontrado es deuda que SÍ frena el escalado y qué podés ignorar tranquilo.

No te limites en extensión, pero CADA hallazgo debe tener evidencia real. Prefiero 20 bugs reproducibles que 100 sospechas. Si querés, al terminar el informe, ofrecé arreglar los P0 de a uno (con test de verificación), no en lote.
```

## `---END---`

---

## Notas de uso
- **Modelo:** Fable 5 con extended thinking. Va a leer mucho y correr tests: esperá 20–40 min.
- **Pre-requisito:** `node_modules` no viene en el clon. El prompt ya pide `pnpm install`; si la DB no levanta, el agente debe decirlo, no inventar resultados.
- **Una sola sesión por auditoría.** No la cruces con seguridad/frontend o se diluye.
- **Si el output se corta:** "Continuá el informe desde donde cortaste, manteniendo numeración de IDs".
- **Después:** pedile que arregle los P0 de a uno con test de verificación, no en lote.
