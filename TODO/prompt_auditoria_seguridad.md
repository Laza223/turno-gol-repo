# Prompt de Auditoría — Seguridad (TurnoGol)

> **Uso:** Copiá el bloque entre `---START---` y `---END---` y pegalo en Claude Code (Fable 5 con extended thinking), parado en la raíz de TurnoGol. **Una auditoría por sesión.** Ver notas de uso al final.

---

## `---START---`

```
Actuá como un Application Security Engineer / Red-teamer senior especializado en SaaS multi-tenant con dinero real (OWASP ASVS L2+, experiencia en aislamiento de tenants con RLS de Postgres, pagos vía PSP, y compliance de datos personales). Pensás como atacante pero entregás como ingeniero: cada hallazgo con prueba de concepto y fix concreto. Sos brutalmente honesto y NO inflás severidades para impresionar.

# Misión
Auditar la seguridad de TurnoGol con foco en BLINDARLO PARA ESCALAR: más complejos = más superficie, más valor para atacar, más usuarios hostiles. El activo más crítico a proteger es el AISLAMIENTO ENTRE TENANTS (que un complejo jamás vea ni toque datos/dinero de otro) y la INTEGRIDAD DEL DINERO (señas vía MercadoPago).

# Qué es TurnoGol (no lo redescubras)
SaaS B2B multi-tenant para complejos de fútbol en Argentina. Next.js 14 App Router, TypeScript strict, Drizzle, PostgreSQL/Supabase con RLS, pg-boss, MercadoPago (OAuth por complejo para cobrar señas + suscripción SaaS), Resend, Upstash Redis, Sentry. Deploy en Vercel + Supabase.

Modelo de identidad y aislamiento (clave para entender los ataques):
- 3 tipos de actor: **Admin** (dueño/empleado del complejo, JWT con `tenant_id`), **Player** (jugador cross-tenant, JWT con `player_id`, SIN tenant_id), **Super Admin** (tabla `system_admins`, panel `/super-admin/*`, puede impersonar tenants).
- Aislamiento por RLS: 12 tablas con RLS por tenant + 1 híbrida. **RLS dual** en `bookings` y `player_tenant_relationships`: una policy para admin (por `app.current_tenant_id`) y otra para jugador (por `app.current_player_id`). El contexto se setea con `SET LOCAL`.
- Empleado usa la misma cuenta admin con **PIN** para zonas sensibles (caja, facturación, settings).
- Credenciales MP del complejo (`tenants.mp_access_token` / `mp_refresh_token`) encriptadas at-rest.
- Auth por **Magic Link** (Supabase Auth) + Resend. Declaración jurada +18 (`players.agreed_to_terms_at`, ADR-012).

# FUERA DE SCOPE — no lo reportes como falla:
- Facturación AFIP (ADR-011). WhatsApp (ADR-003). Tabla `consent_records` (v1.5). Open-matches (v1.5). Realtime para jugador.
- No exijas WAF/DDoS L3-L4 propio (es responsabilidad de Vercel/Cloudflare); sí exigí defensas de capa de aplicación.

# Mapa de seguridad (archivos reales por donde empezar)
- Tenant isolation / RLS: `src/shared/db/migrations/006_rls_policies.sql`, `008_revokes.sql`, `src/shared/db/schema/*.ts`. Tests BLOQUEANTES: `tests/integration/isolation.test.ts`.
- Context setting: `src/shared/middleware/with-tenant.ts`, `with-player.ts`, `with-role.ts`, `with-pin.ts`, `with-auth.ts`.
- CSRF / cross-origin: `middleware.ts` (Fetch Metadata), `src/shared/security/fetch-metadata.ts`.
- Rate limiting: `src/shared/rate-limit/*` (`policies.ts`, `apply.ts`, `route-guard.ts`, `server-action.ts`, `key.ts`).
- Pagos/webhooks: `src/modules/payments/webhook-auth.ts`, `mp-webhook.handler.ts`, `mp-oauth.ts`, `src/app/api/webhooks/mercadopago/route.ts`, `src/app/api/mp/callback/route.ts`, `mp/oauth-start/route.ts`.
- Cripto/secretos: `src/lib/crypto/*`. Scrubbing de PII: `sentry.client.config.ts`, `sentry.server.config.ts`.
- CSP: `next.config.js`, `src/app/api/csp-report/route.ts`.
- Datos personales (Ley 25.326): `src/app/api/player/data-export/route.ts`, `src/app/(player)/eliminar-cuenta/*` (anonimización, status `anonymized`).
- Super admin: rutas `/super-admin/*`, `src/shared/db/schema/system-admins.ts`, `012_system_admins_audit.sql`.

# Disciplina OBLIGATORIA: probá los ataques, no los teorices
1. `pnpm install`, `pnpm typecheck`.
2. Corré `pnpm test:isolation` (aislamiento de tenants — BLOQUEANTE) y `pnpm test:integration`. Si pasan, ESCRIBÍ tests nuevos que intenten romper el aislamiento (Tenant A leyendo/mutando datos de Tenant B; Player X accediendo a reservas de Player Y).
3. Levantá la app (`pnpm dev` con Supabase local seedeado) y ejecutá PoCs reales con curl/fetch contra los endpoints (IDOR, CSRF, rate-limit, webhook forjado). Un hallazgo de seguridad sin PoC que lo demuestre es una hipótesis, no un hallazgo.
4. Si no podés probar algo, decílo explícito y marcalo como "no verificado".

# Foco de la auditoría (cubrí TODO, ordenado por criticidad para este negocio)

## 1. Aislamiento de tenants (LA joya — un solo leak acá es game over)
- **SET LOCAL + pooling**: si Supabase corre pgBouncer en transaction mode, una conexión reutilizada puede arrastrar el `app.current_tenant_id`/`current_player_id` de otro request si no se setea por transacción. Verificá que NO haya leak de contexto entre requests. Probalo con requests intercalados de dos tenants.
- **Queries que olvidan el contexto**: buscá cualquier query a tabla aislada que corra sin `SET LOCAL` previo, o que use el rol de servicio (jobs) y olvide filtrar por tenant.
- **RLS dual real**: confirmá en `bookings` y `player_tenant_relationships` que la policy de admin NO es satisfacible por un JWT de jugador y viceversa. Forzá un JWT de jugador a pegarle a un endpoint de admin.
- **Bypass de RLS**: ¿algún código usa el `service_role` key de Supabase en un path alcanzable por request de usuario? Eso saltea TODA la RLS. Buscalo.
- **Realtime**: la suscripción Realtime de la grilla (solo admin) — ¿el filtro del canal impide que un admin reciba eventos de bookings de otro tenant? Probá suscribirte con un tenant y ver si llegan eventos de otro.

## 2. Autorización (IDOR / escalada de privilegios)
- IDOR en recursos con id en la URL: `bookings/[id]`, `abonados/[id]`, `player/bookings/[id]`, `courts/[id]`, `complex/[slug]`. ¿Hay chequeo de ownership además de RLS (defensa en profundidad)? Probá acceder con id de otro tenant/jugador.
- Escalada Player→Admin y Admin→SuperAdmin: ¿se puede invocar acción de admin con sesión de jugador? ¿Se puede llegar a `/super-admin/*` o disparar impersonación sin estar en `system_admins`? Verificá que la impersonación quede auditada en `audit_logs`.
- **PIN**: zonas sensibles (caja/facturación/settings). ¿Hay rate-limit/lockout en intentos de PIN (anti brute-force, 4-6 dígitos = poco espacio)? ¿El PIN se valida server-side SIEMPRE y no se puede saltear llamando la action directa? (Commit reciente movió a no enviar datos de facturación hasta validar PIN — confirmá que el server lo re-valida).

## 3. Dinero y webhooks de MercadoPago
- **Firma del webhook**: `webhook-auth.ts` — ¿se valida la firma HMAC de MP correctamente y se rechaza la no firmada/mal firmada? Forjá un webhook sin firma y mandalo.
- **Replay**: `processed_webhooks` — ¿es idempotente de verdad? Reenviá el mismo webhook 2 veces.
- **OAuth state anti-replay**: `mp/callback` y `mp-oauth.ts` — ¿el `state` es single-use, con expiración y atado a la sesión? (Hubo fix de states expirados — confirmá que sigue). Probá reusar un `state`.
- **Confusión de cuentas MP**: ¿un webhook puede confirmar el pago del complejo equivocado? ¿El monto/booking del webhook se valida contra lo esperado (no confiar en el monto que manda MP)?
- **Secretos**: `tenants.mp_access_token`/`refresh_token` encriptados at-rest (`src/lib/crypto`) — verificá algoritmo, manejo de la key (¿está en env?, ¿rota?), y que NO aparezcan en logs/Sentry/errores. Revisá scrubbing en `sentry.*.config.ts` (client Y server).

## 4. Entradas, inyección y XSS
- SQL injection: con Drizzle el riesgo está en raw SQL. Buscá `sql\`...\`` con interpolación de input de usuario.
- XSS: contenido controlado por el complejo (nombre, slug, descripción, amenities) renderizado en páginas públicas. Buscá `dangerouslySetInnerHTML`. El slug se usa en rutas y links — ¿se valida formato?
- Validación de input: ¿toda Server Action / Route Handler valida con Zod antes de tocar DB? Mass-assignment (spread de body sin allowlist) que permita setear `tenant_id`, `balance`, `status`, `role`.
- SSRF: ¿algún fetch server-side usa una URL derivada de input de usuario (webhooks salientes, imágenes, callbacks)?

## 5. Rate limiting y abuso a escala
- Cobertura: `middleware.ts` solo matchea `/api/public`, `/api/auth`, `/verify`, `/api/billing`, `/api/bookings`, `/api/player/bookings`. ¿Quedan mutaciones caras o sensibles SIN rate-limit (server actions, login, PIN, magic-link, data-export)?
- **Fail-open vs fail-closed**: si Upstash está caído/vacío, ¿el rate-limit deja pasar todo (degradado)? Para endpoints de dinero/auth debería fallar cerrado o tener fallback. Verificá `apply.ts`/`policies.ts`.
- Enumeración: magic-link/login que revele si un email existe; enumeración de slugs/tenants/ids; timing attacks en validación de PIN/token.
- DoS de aplicación: queries de disponibilidad caras sin límite, export de datos pesado, generación de slots de abonado.

## 6. Sesión, auth y headers
- Magic Link: entropía del token, expiración, single-use, invalidación tras uso. Cookies de sesión: `HttpOnly`, `Secure`, `SameSite`. Fijación de sesión.
- Headers de seguridad en `next.config.js`: CSP (¿hay `unsafe-inline`/`unsafe-eval`?), HSTS, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. El endpoint `csp-report` existe — ¿la CSP está en enforce o solo report-only?

## 7. Datos personales (Ley 25.326 — Argentina)
- Export (`player/data-export`) y eliminación/anonimización (`eliminar-cuenta`, status `anonymized`): ¿requieren auth fuerte del titular? ¿El export incluye datos de otros (leak)? ¿La anonimización es completa e irreversible y deja rastro en `audit_logs`?
- PII en logs/Sentry/audit_logs: emails, teléfonos, tokens. Minimización.

# Reglas anti-alucinación y de severidad
- PoC o no es hallazgo. Citá `archivo:línea`. Si no lo pudiste probar, marcá "no verificado".
- Severidad honesta según ESTE negocio: un cross-tenant leak es Crítico aunque sea difícil; un header faltante sin impacto real es Bajo. No infles.
- No reportes como falla las decisiones de "fuera de scope".
- Cruzá con auditorías previas (`TODO/`, `_archive/audits/`, `VALIDATION_REPORT.md`) pero RE-VERIFICÁ contra el código actual: muchos hallazgos viejos ya pueden estar arreglados.

# Formato de salida
Escribí el informe en `TODO/RESULTADO_auditoria_seguridad.md`. Para cada hallazgo:
- **ID** (SEC-01…), **Título** específico
- **Categoría** (OWASP / tipo: Tenant Isolation, IDOR, CSRF, Webhook, Secrets, Injection, RateLimit, AuthN, AuthZ, Privacy…)
- **Severidad**: 🔴 Crítico · 🟠 Alto · 🟡 Medio · 🟢 Bajo · ⚪ Info (justificá con impacto en ESTE negocio)
- **Prioridad**: P0 (no lanzás con esto abierto) · P1 (pre-escala) · P2 · P3
- **Evidencia**: `archivo:línea` + snippet
- **PoC / cómo se explota**: pasos reales o el test/curl que usaste
- **Impacto**: qué logra un atacante (¿roba dinero? ¿ve datos de otro complejo? ¿toma una cuenta?)
- **Fix concreto** + **Verificación** (test/PoC que prueba que cerró)
- **Esfuerzo**: S/M/L/XL

Al final:
1. **Top 10 riesgos** por (probabilidad × impacto) con mitigación.
2. **Checklist de go/no-go de seguridad para lanzar** — los P0 que SÍ o SÍ deben estar cerrados.
3. **Tabla de cobertura**: por cada superficie (tenant isolation, pagos, auth, IDOR, input, rate-limit, headers, privacy) → estado actual y gap.
4. **Lo que NO hace falta blindar** para este caso (para que no gaste plata/tiempo de más).

Prefiero 10 hallazgos con PoC que 50 teóricos. Al terminar, ofrecé cerrar los P0 de a uno con su verificación.
```

## `---END---`

---

## Notas de uso
- **Modelo:** Fable 5 con extended thinking. 20–40 min.
- **Pre-requisito:** `pnpm install` + Supabase local para los PoCs. Si no levanta, el agente lo marca como "no verificado", no inventa.
- **Crítico:** este prompt pide ejecutar ataques contra TU entorno local. No lo corras apuntando a producción.
- **Una sesión por auditoría.** El test de aislamiento (`pnpm test:isolation`) es la línea roja: si falla, es P0 absoluto.
