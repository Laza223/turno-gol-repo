# Infraestructura — TurnoGol

> Análisis de sistema y plan de infraestructura para llevar TurnoGol a producción de forma **escalable, robusta y barata** en año 1. Fuente de verdad operativa: complementa `docs/LAUNCH.md` y `docs/DECISIONES_SISTEMA.md`.

## 1. El sistema tiene DOS mitades

TurnoGol no es una sola app: son dos procesos con ciclos de vida distintos.

```
┌──────────────────────────┐        ┌───────────────────────────────┐
│  WEB (Next.js 14)         │        │  WORKERS (pg-boss)            │
│  request → response       │        │  proceso Node 24/7            │
│  efímero, serverless       │        │  run-workers.ts (pnpm jobs:start) │
│                           │        │                               │
│  → Vercel                 │        │  → NO puede correr en Vercel  │
└───────────┬──────────────┘        └───────────────┬───────────────┘
            │                                        │
            └──────────────┬─────────────────────────┘
                           ▼
                  ┌──────────────────┐
                  │  PostgreSQL       │
                  │  (Supabase)       │
                  │  + Realtime + Auth │
                  └──────────────────┘
```

- **Web**: Next.js App Router (Server Components, Server Actions, Route Handlers). Efímera, escala horizontal automática. Vercel la corre perfecto.
- **Workers**: `src/shared/jobs/run-workers.ts` es un entrypoint Node **standalone que se queda prendido para siempre**. Procesa webhooks de MP, expira reservas pending, refresca tokens de MP, manda emails, reconcilia pagos, dunning, cierre de trials, slots de abonados, data-retention. Son 14 workers (`src/shared/jobs/workers/*`).

## 2. El agujero bloqueante: ¿dónde corren los workers?

**Vercel es serverless** → no existe un "proceso prendido 24/7". El `deploy.yml` actual deploya **solo la web**. Hoy **nada deploya ni corre los workers**.

Si los workers no corren, se cae la mitad invisible del negocio:

| Worker que no corre | Consecuencia |
|---|---|
| `process-mp-webhook` | La seña se cobra pero la reserva nunca se confirma |
| `expire-pending-booking` | Reservas pending traban canchas para siempre |
| `refresh-mp-tokens` | A los días el complejo no puede cobrar señas |
| `reconcile-pending-payments` | Pagos quedan en limbo |
| `send-email` / `booking-reminder` | No salen emails ni recordatorios |
| `dunning-retry` / `expire-trials` | Se rompe el ciclo de cobro del SaaS |

**Esto es línea roja de infraestructura.** El código existe; falta *dónde correrlo*. Ni Vercel Pro ni Supabase Pro lo resuelven solos.

## 3. Stack recomendado (no migrar — agregar la pieza faltante)

| Pieza | Para qué | Costo aprox/mes |
|---|---|---|
| **Vercel Pro** | Web Next.js | ~US$20 |
| **Supabase Pro** | DB + Auth + Realtime + backups diarios | ~US$25 |
| **Railway** (o Render / Fly.io) | **Correr `pnpm jobs:start` 24/7** ← la pieza faltante | ~US$5–10 |
| Upstash Redis | Rate-limit / cache | Free → ~US$10 |
| Resend | Emails transaccionales | Free (3k) → ~US$20 |
| Sentry | Observabilidad de errores | Free / Team |

**Total año 1: ~US$50–85/mes.** Para un SaaS que cobra suscripción mensual por complejo, con ~5 complejos ya está pago.

**Por qué Railway para los workers:** corre el mismo repo con un comando, se reinicia solo si se cae, y **pg-boss es resiliente** — los jobs viven en Postgres; si el worker reinicia, los retoma donde quedaron. Render (background worker) y Fly.io son equivalentes. Este repo incluye `Dockerfile.worker` + `railway.toml` listos para esto.

## 4. Connection pooling (ajuste obligatorio)

`src/shared/db/client.ts` abre `postgres()` con `max: 10` **por instancia** y `prepare: false`. En serverless, Vercel levanta muchas instancias en paralelo → 10×N puede agotar las conexiones de Postgres.

Reglas:

- **Web (Vercel):** `DATABASE_URL` debe apuntar al **pooler de Supabase (Supavisor), transaction mode, puerto `6543`** — NO al directo `5432`. El código ya es compatible: `prepare: false` + `SET LOCAL` dentro de transacciones funciona en transaction-mode pooling.
- **Workers (Railway):** un solo proceso estable con pocas conexiones → usar la **conexión directa (`5432`)**. pg-boss mantiene su propio pool y necesita conexión estable para `LISTEN/NOTIFY`.

> Verificación: en prod, `DATABASE_URL` de Vercel termina en `:6543/...?pgbouncer=true`; el de Railway en `:5432`.

## 5. Robustez y recuperación

- **Backups:** Supabase Pro trae backups diarios (retención 7 días). Para una app de dinero, activá **PITR (Point-in-Time Recovery)** — restaura a cualquier minuto, no solo al snapshot diario. Probá un restore al menos una vez.
- **Rollback web:** Vercel → Deployments → promover el deploy anterior.
- **Workers HA:** año 1, **1 réplica con auto-restart** alcanza (pg-boss persiste en DB). Para alta disponibilidad futura, subir a 2 réplicas: pg-boss hace locking y no duplica jobs.
- **DLQ:** los jobs que fallan repetido caen en la dead-letter queue (`src/shared/jobs/dlq.ts`) — revisarla periódicamente, no se pierden silenciosos.

## 6. Variables de entorno del worker (Railway)

El servicio de workers necesita (además de las de la web):

- `DATABASE_URL` — **conexión directa** (`:5432`) a Supabase Postgres.
- `NODE_ENV=production`
- Credenciales que usan los workers: `RESEND_API_KEY`, encryption key de tokens MP, claves de MercadoPago, `SUPABASE_*` (las que requieran los workers de push/email), VAPID keys (push), `SENTRY_DSN`.
- Mantener estos secrets en el dashboard de Railway, replicando los de Vercel que apliquen.

## 7. ¿Cuándo migrar? (para no sobre-construir hoy)

Vercel + Supabase dejan de cerrar **mucho más arriba** de donde estás:

- El costo de Vercel se dispara recién con tráfico/bandwidth alto (cientos de miles de visitas/mes). Problema de "tengo 200 complejos" — bueno de tener.
- Salida natural si llega ese día: **no se reescribe nada** — se mete la web Next.js en un contenedor (Docker) y se corre en el mismo Railway/Fly/Render de los workers, dejando Supabase como DB. Mismo código. Horizonte: 2+ años.

**Regla de fondo:** el único agujero de infra real hoy es *dónde corren los workers*. Resuelto eso (Railway), apuntá `DATABASE_URL` al pooler en la web, activá PITR, y el stack aguanta el año 1 entero por menos de US$100/mes. Lo demás es optimización prematura.
