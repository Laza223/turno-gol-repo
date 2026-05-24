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
