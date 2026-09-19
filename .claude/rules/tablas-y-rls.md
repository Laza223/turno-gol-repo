---
paths:
  - "src/shared/db/**"
  - "supabase/migrations/**"
---

# Inventario de tablas y su régimen de RLS

- **Tablas aisladas** (tenant_id + RLS): courts, bookings, abonados, payments, cash_flows, daily_cash_opens, daily_cash_closes, tenant_subscriptions, notifications, audit_logs, tenant_player_bans, tenant_staff_members, push_subscriptions, analytics_events, canteen_products, canteen_tabs, stock_movements, tournaments, tournament_teams, tournament_team_players, tournament_stages, tournament_matches, tournament_match_events
- **Globales sin RLS** (sin tenant_id y sin policies): tenants, plans, price_versions, processed_webhooks. El rol de la app las lee y escribe, pero **no las borra** y el catálogo comercial es de sólo lectura (migr. 085).
- **Globales CON RLS** (sin tenant_id, pero con policies + FORCE): players, staff_users. Medido el 2026-09-05 — la lectura de un jugador desde el panel depende de que exista la relación con el complejo.
- **Híbridas** (tenant_id + RLS por jugador): player_tenant_relationships (dual staff/player), reviews (lectura pública + insert del jugador dueño del booking), player_favorites (por `app.current_player_id`)
- **Del sistema, denegada para la app**: `push_send_log` — RLS + FORCE y **cero permisos** para el rol web (migr. 059); la escribe sólo el pool de workers.
- **Operacional**: feature_flags (fila con tenant_id NULL = default global; con tenant_id = override por complejo). **Del sistema**: `system_admins` — RLS + FORCE self-scoped, **sin policy de INSERT**; el bootstrap inserta vía pool worker BYPASSRLS.
- **`analytics_events`** (migr. 072): destino durable de `track.*`. `tenant_id` NULLABLE — el tráfico público no tiene complejo, y la policy de INSERT acepta NULL por eso; la de SELECT sigue estricta. Append-only (sin UPDATE + REVOKE). **No guarda identificadores de persona** (`PII_KEYS` filtra `playerId`/`staffUserId`/`endpoint`), lo que la mantiene fuera del régimen de datos personales. La escribe el pool BYPASSRLS vía `after()`. `breadcrumbs.ts` es isomórfico y **NO la importa**: el sink se registra al revés, desde `instrumentation.ts` y `run-workers.ts`.
- **RLS dual** en `bookings` y `player_tenant_relationships`: policy para admin (`app.current_tenant_id`) + policy para jugador (`app.current_player_id`). Policy Realtime solo en `bookings`.

Cómo setear contexto, defensa en profundidad y checklist de tabla nueva: skill `convenciones-stack`.
