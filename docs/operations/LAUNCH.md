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
- [ ] Webhook secret rotado y cargado en `MP_WEBHOOK_SECRET` (app Suscripciones) **y** `MP_WEBHOOK_SECRET_CHECKOUT` (app Checkout Pro) — dos apps de MP, cada una firma con su propia clave (`src/modules/payments/webhook-auth.ts`)
- [ ] OAuth redirect_uri whitelisted: https://<dominio>/api/mp/callback
- [ ] Test OAuth completo con 1 tenant piloto (link + delink)

## Email (Resend)
- [ ] Dominio verificado (SPF + DKIM + DMARC)
- [ ] From address activa: no-reply@turnogol.app (`src/modules/notifications/email.provider.ts`)
- [ ] Test end-to-end (magic link recibido en gmail + outlook)

## Sentry
- [ ] Project creado, DSN cargado (client + server)
- [ ] Alerts:
  - error rate > 5/min sobre 5 min
  - p95 latency /api/* > 2s sobre 10 min
- [ ] Release tracking activo (VERCEL_GIT_COMMIT_SHA)
- [ ] Source maps subidos en build de producción

## Privacy / Legal (Ley 25.326)
- [ ] Términos +18 publicados en /terminos
- [ ] Política de privacidad en /privacidad
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
- [ ] Crear booking online como player → redirige a MP (o confirma si `settings.requires_deposit=false`)
- [ ] Webhook MP llega y procesa (1 booking confirmado, 1 cash_flow, 1 payment)
- [ ] Cancelación player → estado canceled_*, cashflow ajustado

## Rollback plan
- [ ] Commit SHA de versión anterior anotado
- [ ] `vercel rollback <deployment-id>` documentado
- [ ] Última migración aplicada documentada

---

## Staging strategy (v1)

**[DEPRECADO por Addendum Launch-First Día 0]**
La decisión (B11) de usar Vercel Preview compartiendo base de datos con producción fue revertida por motivos de seguridad.
Staging **REQUIERE** su propia base de datos Supabase dedicada.
Ver `docs/launch/addendum-dia0.md` para la estrategia actualizada de Staging.

## Backup restore drill

Cumple done-criterion MASTER_PLAN B11 ("backup restaurado exitosamente al menos 1 vez").

- [ ] Drill ejecutado en los últimos 90 días siguiendo `docs/spec/doc19_runbook.md` §10.6.
  - Evidencia: `docs/audit/backup-drills/YYYY-MM-DD.md` con counts, screenshots, RTO/RPO medidos.
- [ ] Supabase plan: PITR habilitado (Pro+).

## Migration strategy

Ver `docs/operations/MIGRATIONS.md`. Dos trees coexistentes:
- `src/shared/db/migrations/` → autoridad CI (orden numérico `NNN_nombre.sql`, sin huecos).
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
