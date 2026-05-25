# TurnoGol — Launch Checklist (manual ops)

Ítems no automatizables. El operador debe verificar en consola la condición antes de tildar.
`pnpm launch:check` cubre lo automatizable.

## Infraestructura
- [ ] Dominio comprado y DNS apuntando a Vercel
- [ ] Certificado HTTPS válido (verificar en navegador)
- [ ] Supabase project en plan Pro (no free, sin auto-pausa)
- [ ] Backups Supabase configurados (daily, retención ≥7 días)
- [ ] Vercel project: branch production = main, preview = PR
- [ ] Env vars cargadas en Vercel (production + preview)
- [ ] Upstash Redis project creado, URL+TOKEN en Vercel

## MercadoPago
- [ ] App MP en "Producción" (no sandbox)
- [ ] Webhook URL: https://<dominio>/api/webhooks/mercadopago
- [ ] Webhook secret rotado y cargado en MP_WEBHOOK_SECRET
- [ ] OAuth redirect_uri whitelisted: https://<dominio>/api/mp/callback
- [ ] Test OAuth completo con 1 tenant piloto (link + delink)

## Email (Resend)
- [ ] Dominio verificado (SPF + DKIM + DMARC)
- [ ] From address activa: noreply@<dominio>
- [ ] Test end-to-end (magic link recibido en gmail + outlook)

## Sentry
- [ ] Project creado, DSN cargado (client + server)
- [ ] Alerts:
  - error rate > 5/min sobre 5 min
  - p95 latency /api/* > 2s sobre 10 min
- [ ] Release tracking activo (VERCEL_GIT_COMMIT_SHA)
- [ ] Source maps subidos en build de producción

## Privacy / Legal (Ley 25.326)
- [ ] Términos +18 publicados en /legal/terminos
- [ ] Política de privacidad en /legal/privacidad
- [ ] Process documentado para ARCO requests
- [ ] Email legal@<dominio> configurado

## Observabilidad
- [ ] /api/status responde 200 desde dominio público
- [ ] Uptime monitor externo configurado → /api/status
- [ ] VAPID keys (Web Push) generadas y cargadas

## Rate limit
- [ ] Upstash env vars en Vercel production
- [ ] Sanity check: 31º request a /api/public/availability misma IP → 429

## Smoke test post-deploy
- [ ] `/` carga sin errores
- [ ] `/explorar` muestra al menos 1 tenant
- [ ] Login admin → /dashboard sin errores
- [ ] Crear booking manual desde grilla admin → OK
- [ ] Crear booking online como player → redirige a MP (o confirma si deposit_mode=off)
- [ ] Webhook MP llega y procesa (1 booking confirmado, 1 cash_flow, 1 payment)
- [ ] Cancelación player → estado canceled_*, cashflow ajustado

## Rollback plan
- [ ] Commit SHA de versión anterior anotado
- [ ] `vercel rollback <deployment-id>` documentado
- [ ] Última migración aplicada documentada

---

## Staging strategy (v1)

**Decisión (B11):** v1 usa **Vercel Preview Deployments** como staging. NO hay
Supabase staging project separado.

- Cada PR a `main` genera un preview deployment automático en Vercel.
- El preview usa las **mismas** env vars que prod (mismo `DATABASE_URL`,
  mismas keys MP, etc.). Excepción: `NEXT_PUBLIC_APP_URL` apunta al preview URL.
- E2E + integration + isolation tests corren en CI antes del merge (`.github/workflows/ci.yml`).
- Tras merge a `main`: `deploy.yml` deploya a Vercel production.

**Riesgo aceptado v1:** el preview lee/escribe la misma DB de prod. Compensación:
- CI integration usa DB ephemeral (Postgres GitHub Action service), no toca prod.
- Pruebas manuales en preview deben usar tenants/users de testeo conocidos
  (no datos reales de clientes).
- El stress test corre LOCAL contra Supabase local, nunca contra prod.

**Trigger v1.5 (Supabase staging dedicado):**
- 10+ clientes en prod (riesgo de "preview toca prod" crece), o
- Feature flags + tests destructivos en preview, o
- Requerimiento contractual de aislamiento staging/prod.

## Backup restore drill

Cumple done-criterion MASTER_PLAN B11 ("backup restaurado exitosamente al menos 1 vez").

- [ ] Drill ejecutado en los últimos 90 días siguiendo `docs/doc19_runbook.md` §10.6.
  - Evidencia: `docs/audit/backup-drills/YYYY-MM-DD.md` con counts, screenshots, RTO/RPO medidos.
- [ ] Supabase plan: PITR habilitado (Pro+).

## Migration strategy

Ver `docs/MIGRATIONS.md`. Dos trees coexistentes:
- `src/shared/db/migrations/` → autoridad CI (orden numérico 001…012).
- `supabase/migrations/` → mirror Supabase CLI (timestamped).

- [ ] Última migration aplicada está en AMBOS trees (verificar antes de cada deploy).

## Checks adicionales B11

- [ ] `pnpm launch-check` ejecutado con env vars de prod, incluyendo:
  - `bypassrls role check` — current_user NO tiene `rolbypassrls=true`.
  - `encryption-key strength` — `ENCRYPTION_KEY` ≥64 hex chars, no es el placeholder.
  - `mp credentials probe` — POST `/oauth/token` retorna 400 (creds válidas, grant rechazado).
- [ ] Procedure de magic link debugging conocido (doc19 §3.10).
- [ ] Procedure de rotación JWT secret conocido (doc19 §3.11).
- [ ] Procedure de rotación ENCRYPTION_KEY conocido (doc19 §3.12).
- [ ] Stress test ritual conocido (doc19 §4.4).
- [ ] DPA template draft revisado por counsel legal (escalado, fuera de scope dev).
- [ ] AAIP inscripción submitted (status en `docs/legal/aaip-status.md`).
