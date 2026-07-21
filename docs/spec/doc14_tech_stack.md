# DOC 14 — Tech Stack & Arquitectura
## TurnoGol: El Mapa Técnico Completo

> **Propósito**: Consolidar todas las decisiones técnicas (ADRs 001-010) en un documento
> de referencia operativa. De acá salen las decisiones de setup de repositorio,
> dependencias, estructura de proyecto, pipeline de CI/CD y ambientes.

> [!NOTE]
> Las justificaciones detalladas de cada decisión están en Doc 11 (ADRs).
> Este documento asume que las decisiones ya fueron tomadas y se enfoca en
> **cómo se implementan** y **cómo se conectan entre sí**.

---

## 1. Stack Completo — Vista Rápida

| Capa | Tecnología | Versión target | ADR |
|---|---|---|---|
| **Lenguaje** | TypeScript | 5.x | — |
| **Runtime** | Node.js | 20 LTS | — |
| **Framework fullstack** | Next.js (App Router) | 14.x / 15.x | ADR-008 |
| **UI Library** | React | 18.x / 19.x | ADR-008 |
| **Component Library** | shadcn/ui + Radix UI | Latest | — |
| **Estilos** | Tailwind CSS | 3.x | — |
| **Design System** | Propio (design-system/MASTER.md) | — | — |
| **Base de datos** | PostgreSQL | 15.x (vía Supabase) | ADR-001 |
| **ORM / Query Builder** | Drizzle ORM | Latest | — |
| **Autenticación** | Supabase Auth | Managed | ADR-002 |
| **Real-time** | Supabase Realtime | Managed | ADR-006 |
| **Storage** | Supabase Storage | Managed | ADR-009 |
| **Background Jobs** | pg-boss | Latest | ADR-005 |
| **Pagos** | MercadoPago SDK | Latest | ADR-004 |
| **Email** | Resend | Latest | ADR-003 |
| **Validación** | Zod | Latest | — |
| **Hosting App** | Vercel | Pro plan | ADR-009 |
| **Hosting DB** | Supabase | Pro plan | ADR-009 |
| **Error Tracking** | Sentry | Latest | — |
| **Analytics** | Vercel Analytics | Included | — |
| **Testing** | Vitest + Playwright | Latest | — |
| **Package Manager** | pnpm | 8.x+ | — |

---

## 2. Arquitectura de Alto Nivel

### 2.1 Diagrama de despliegue

```
                          ┌─────────────────────────────┐
                          │         INTERNET             │
                          └──────────┬──────────────────┘
                                     │
                          ┌──────────▼──────────────────┐
                          │     Vercel Edge Network      │
                          │     (CDN global + SSL)       │
                          └──────────┬──────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
           ┌───────▼───────┐ ┌──────▼──────┐ ┌──────▼──────┐
           │  Static Assets│ │  SSR/SSG    │ │  API Routes │
           │  (JS, CSS,    │ │  Pages      │ │  (Backend)  │
           │  images)      │ │             │ │             │
           │  → CDN cache  │ │  → Serverless│ │ → Serverless│
           └───────────────┘ └──────┬──────┘ └──────┬──────┘
                                    │                │
                                    └────────┬───────┘
                                             │
                              ┌──────────────▼──────────────┐
                              │        Supabase              │
                              │                              │
                              │  ┌────────────────────────┐  │
                              │  │  PostgreSQL 15          │  │
                              │  │  • RLS policies         │  │
                              │  │  • pg-boss tables       │  │
                              │  │  • btree_gist ext       │  │
                              │  └────────────────────────┘  │
                              │                              │
                              │  ┌────────────────────────┐  │
                              │  │  Auth (GoTrue)          │  │
                              │  │  • Magic link/Password  │  │
                              │  │  • Google OAuth         │  │
                              │  │  • JWT issuance         │  │
                              │  └────────────────────────┘  │
                              │                              │
                              │  ┌────────────────────────┐  │
                              │  │  Realtime               │  │
                              │  │  • postgres_changes     │  │
                              │  │  • Broadcast            │  │
                              │  └────────────────────────┘  │
                              │                              │
                              │  ┌────────────────────────┐  │
                              │  │  Storage (S3)           │  │
                              │  │  • Logos, fotos         │  │
                              │  │  • Exports (CSV)        │  │
                              │  └────────────────────────┘  │
                              └──────────────────────────────┘
                                             │
                     ┌───────────────────────┼──────────────────────┐
                     │                       │                      │
              ┌──────▼──────┐        ┌───────▼──────┐      ┌───────▼──────┐
              │ Meta Cloud  │        │   Resend     │      │ MercadoPago  │
              │ (REMOVIDO)  │        │   (Email)    │      │ (Pagos)      │
              └─────────────┘        └──────────────┘      └──────────────┘
```

### 2.2 Diagrama de capas de la aplicación

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                         │
│                                                                 │
│  (public)/*         → SSR pages (SEO, complejos, booking flow)  │
│  (admin)/*          → Client-side SPA (dashboard, grilla, caja) │
│  (auth)/*           → Auth pages (login, register, magic link)  │
│  components/ui/*    → shadcn/ui primitivos (diseño via design system propio) │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP (fetch / server actions)
┌──────────────────────────────▼──────────────────────────────────┐
│                         API LAYER                               │
│                                                                 │
│  Server Actions       → Mutaciones desde UI interna (forms      │
│                         del admin, cancelación por jugador)      │
│  app/api/*            → Route Handlers para:                    │
│                         • Webhooks de MP                         │
│                         • Endpoints públicos cross-origin        │
│                         • Auth callbacks                         │
│  middleware.ts        → Auth guard, tenant context, rate limit  │
│                                                                 │
│  Responsabilidades:                                             │
│  • Validar input (Zod)                                          │
│  • Autenticar y autorizar                                       │
│  • Setear tenant context (SET LOCAL)                            │
│  • Delegar a service layer                                      │
│  • Serializar response                                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ function calls
┌──────────────────────────────▼──────────────────────────────────┐
│                       SERVICE LAYER                             │
│                                                                 │
│  modules/bookings/booking.service.ts                            │
│  modules/payments/payment.service.ts                            │
│  modules/notifications/notification.service.ts                  │
│  ...                                                            │
│                                                                 │
│  Responsabilidades:                                             │
│  • Business logic pura                                          │
│  • State machine transitions                                    │
│  • Orquestar operaciones cross-module                           │
│  • Encolar background jobs                                      │
│  • NO conoce HTTP, headers, ni responses                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │ ORM calls
┌──────────────────────────────▼──────────────────────────────────┐
│                        DATA LAYER                               │
│                                                                 │
│  shared/db/schema.ts      → Drizzle schema definitions          │
│  shared/db/client.ts      → Connection pool, transaction helper │
│  shared/db/migrations/*   → SQL migrations                      │
│                                                                 │
│  Responsabilidades:                                             │
│  • CRUD operations                                              │
│  • Queries optimizadas                                          │
│  • Transacciones atómicas                                       │
│  • RLS es transparente (PostgreSQL lo aplica)                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                     INFRASTRUCTURE LAYER                        │
│                                                                 │
│  PostgreSQL (Supabase)    → DB + RLS + pg-boss                  │
│  Supabase Auth            → JWT, password, magic link, OAuth    │
│  Supabase Realtime        → postgres_changes → SSE              │
│  Supabase Storage         → Files (logos, fotos, exports)       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Estructura del Proyecto

### 3.1 Layout del repositorio (monorepo con Next.js)

```
turnogol/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint + test en PRs
│       ├── deploy-preview.yml        # Preview deploy en PRs
│       └── deploy-production.yml     # Deploy a producción
│
├── public/                           # Static assets (favicon, robots.txt)
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (public)/                 # Rutas públicas (SSR, SEO)
│   │   │   ├── [slug]/              # Página del complejo
│   │   │   │   ├── page.tsx         # SSR: info del complejo + canchas
│   │   │   │   ├── disponibilidad/
│   │   │   │   │   └── page.tsx     # Grilla de disponibilidad pública
│   │   │   │   └── reservar/
│   │   │   │       └── page.tsx     # Booking flow del jugador
│   │   │   └── explorar/
│   │   │       └── page.tsx         # Buscar complejos
│   │   │
│   │   ├── (auth)/                   # Rutas de autenticación
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   ├── verify/
│   │   │   │   └── page.tsx         # Magic link verification
│   │   │   └── layout.tsx           # Layout sin sidebar
│   │   │
│   │   ├── (admin)/                  # Panel admin (autenticado)
│   │   │   ├── layout.tsx           # Auth guard + sidebar + tenant context
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── grilla/
│   │   │   │   └── page.tsx         # Grilla de reservas (real-time)
│   │   │   ├── reservas/
│   │   │   │   ├── page.tsx         # Lista de reservas
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx     # Detalle de reserva
│   │   │   ├── abonados/
│   │   │   │   ├── page.tsx
│   │   │   │   └── nuevo/
│   │   │   │       └── page.tsx
│   │   │   ├── caja/
│   │   │   │   └── page.tsx
│   │   │   ├── reportes/
│   │   │   │   └── page.tsx
│   │   │   ├── configuracion/
│   │   │   │   ├── page.tsx         # General
│   │   │   │   ├── canchas/
│   │   │   │   ├── horarios/
│   │   │   │   ├── precios/
│   │   │   │   ├── equipo/          # Staff users
│   │   │   │   └── facturacion/     # Suscripción SaaS
│   │   │   └── onboarding/
│   │   │       └── page.tsx         # Wizard de onboarding (Doc 10)
│   │   │
│   │   ├── (player)/                 # Área del jugador (autenticado)
│   │   │   ├── layout.tsx
│   │   │   ├── mis-reservas/
│   │   │   │   └── page.tsx
│   │   │   └── perfil/
│   │   │       └── page.tsx
│   │   │
│   │   ├── api/                      # API Route Handlers (backend)
│   │   │   ├── bookings/
│   │   │   │   ├── route.ts         # GET (list), POST (create)
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts     # GET, PATCH, DELETE
│   │   │   ├── courts/
│   │   │   │   └── route.ts
│   │   │   ├── abonados/
│   │   │   │   └── route.ts
│   │   │   ├── payments/
│   │   │   │   └── route.ts
│   │   │   ├── cash-flows/
│   │   │   │   └── route.ts
│   │   │   ├── notifications/
│   │   │   │   └── route.ts
│   │   │   ├── reports/
│   │   │   │   └── route.ts
│   │   │   ├── tenant/
│   │   │   │   └── route.ts         # Configuración del complejo
│   │   │   ├── billing/
│   │   │   │   └── route.ts         # Suscripción, upgrade/downgrade
│   │   │   ├── public/
│   │   │   │   ├── complex/
│   │   │   │   │   └── [slug]/
│   │   │   │   │       └── route.ts # Datos públicos del complejo
│   │   │   │   └── availability/
│   │   │   │       └── route.ts     # Disponibilidad pública
│   │   │   ├── auth/
│   │   │   │   └── callback/
│   │   │   │       └── route.ts     # OAuth callback
│   │   │   └── webhooks/
│   │   │       └── mercadopago/
│   │   │           └── route.ts     # Webhooks de MP
│   │   │
│   │   ├── layout.tsx               # Root layout
│   │   ├── not-found.tsx
│   │   └── error.tsx
│   │
│   ├── modules/                      # Business logic (ADR-007 monolito modular)
│   │   ├── auth/
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.middleware.ts   # JWT validation
│   │   │   └── tenant-context.middleware.ts
│   │   │
│   │   ├── tenants/
│   │   │   ├── tenant.service.ts
│   │   │   ├── tenant.schema.ts     # Zod schemas
│   │   │   └── tenant.types.ts
│   │   │
│   │   ├── courts/
│   │   │   ├── court.service.ts
│   │   │   ├── court.schema.ts
│   │   │   └── court.types.ts
│   │   │
│   │   ├── bookings/
│   │   │   ├── booking.service.ts
│   │   │   ├── booking.state-machine.ts
│   │   │   ├── booking.schema.ts
│   │   │   ├── booking.concurrency.ts   # SELECT FOR UPDATE logic
│   │   │   └── booking.types.ts
│   │   │
│   │   ├── abonados/
│   │   │   ├── abonado.service.ts
│   │   │   ├── abonado.schema.ts
│   │   │   └── slot-generator.ts    # Genera bookings futuros
│   │   │
│   │   ├── payments/
│   │   │   ├── payment.service.ts
│   │   │   ├── mp-gateway.ts        # Interfaz abstracta + implementación MP
│   │   │   ├── mp-webhook.handler.ts
│   │   │   └── payment.schema.ts
│   │   │
│   │   ├── billing/
│   │   │   ├── billing.service.ts   # Suscripciones SaaS
│   │   │   ├── dunning.service.ts
│   │   │   ├── upgrade.service.ts   # Prorrateo
│   │   │   └── billing.schema.ts
│   │   │
│   │   ├── notifications/
│   │   │   ├── notification.service.ts
│   │   │   ├── email.provider.ts
│   │   │   ├── email.templates.ts
│   │   │   └── templates/
│   │   │       ├── booking-confirmed.ts
│   │   │       ├── trial-welcome.ts
│   │   │       ├── dunning-payment-failed.ts
│   │   │       └── ...
│   │   │
│   │   │
│   │   ├── cashflow/
│   │   │   ├── cashflow.service.ts
│   │   │   └── cashflow.schema.ts
│   │   │
│   │   ├── reports/
│   │   │   └── report.service.ts
│   │   │
│   │   └── audit/
│   │       └── audit.service.ts     # INSERT only
│   │
│   ├── shared/                       # Código compartido
│   │   ├── db/
│   │   │   ├── client.ts            # Drizzle client + connection pool
│   │   │   ├── schema.ts            # Re-exports all table schemas
│   │   │   ├── schema/
│   │   │   │   ├── tenants.ts
│   │   │   │   ├── courts.ts
│   │   │   │   ├── bookings.ts
│   │   │   │   ├── ...
│   │   │   │   └── index.ts
│   │   │   └── migrations/          # SQL migration files
│   │   │
│   │   ├── middleware/
│   │   │   ├── with-auth.ts         # HOF: require authentication
│   │   │   ├── with-tenant.ts       # HOF: require + set tenant context
│   │   │   ├── with-role.ts         # HOF: require specific role
│   │   │   ├── with-feature.ts      # HOF: require feature flag
│   │   │   └── rate-limiter.ts
│   │   │
│   │   ├── jobs/
│   │   │   ├── boss.ts              # pg-boss instance + config
│   │   │   ├── definitions.ts       # Queue definitions + retry config
│   │   │   └── workers/
│   │   │       ├── send-email.worker.ts
│   │   │       ├── process-mp-webhook.worker.ts
│   │   │       ├── expire-trials.worker.ts
│   │   │       ├── generate-abonado-slots.worker.ts
│   │   │       ├── auto-complete-bookings.worker.ts
│   │   │       ├── dunning-retry.worker.ts
│   │   │       └── data-retention-cleanup.worker.ts
│   │   │
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts        # Browser client
│   │   │   │   ├── server.ts        # Server client (Route Handlers)
│   │   │   │   └── admin.ts         # Service role client (system operations)
│   │   │   ├── mercadopago.ts       # MP SDK config
│   │   │   ├── resend.ts            # Email SDK config
│   │   │   └── sentry.ts            # Error tracking config
│   │   │
│   │   ├── utils/
│   │   │   ├── currency.ts          # Centavos ↔ ARS formatting
│   │   │   ├── dates.ts             # UTC ↔ ART conversions
│   │   │   ├── slug.ts              # Slug generation
│   │   │   ├── errors.ts            # Custom error classes
│   │   │   └── types.ts             # Shared TypeScript types
│   │   │
│   │   └── config/
│   │       ├── env.ts               # Environment variables (validated with Zod)
│   │       └── constants.ts         # Business constants
│   │
│   └── components/                   # UI Components
│       ├── ui/                       # shadcn/ui primitivos (estilizados por design system)
│       │   ├── button.tsx
│       │   ├── input.tsx
│       │   ├── dialog.tsx
│       │   ├── table.tsx
│       │   └── ...
│       ├── layout/
│       │   ├── admin-sidebar.tsx
│       │   ├── admin-header.tsx
│       │   └── public-header.tsx
│       ├── booking/
│       │   ├── booking-grid.tsx      # Grilla de reservas (real-time)
│       │   ├── booking-form.tsx
│       │   └── booking-card.tsx
│       ├── court/
│       │   └── court-card.tsx
│       └── ...
│
├── supabase/                         # Supabase local config
│   ├── config.toml
│   ├── migrations/                   # SQL migrations (source of truth)
│   │   ├── 001_extensions.sql
│   │   ├── 002_enums.sql
│   │   ├── 003_global_tables.sql
│   │   ├── 004_isolated_tables.sql
│   │   ├── 005_triggers.sql
│   │   ├── 006_rls_policies.sql
│   │   └── 007_seed_data.sql
│   └── seed.sql                      # Datos de desarrollo
│
├── tests/
│   ├── unit/                         # Vitest
│   │   ├── bookings/
│   │   │   ├── booking.service.test.ts
│   │   │   └── state-machine.test.ts
│   │   ├── payments/
│   │   ├── billing/
│   │   └── ...
│   ├── integration/                  # Vitest con DB real
│   │   ├── isolation.test.ts         # Tests de aislamiento (Doc 12 §10)
│   │   ├── booking-flow.test.ts
│   │   └── ...
│   └── e2e/                          # Playwright
│       ├── onboarding.spec.ts
│       ├── booking.spec.ts
│       └── ...
│
├── .env.example                      # Template de variables de entorno
├── .env.local                        # Variables locales (no commiteado)
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── drizzle.config.ts                 # Drizzle ORM config
├── vitest.config.ts
├── playwright.config.ts
├── package.json
├── pnpm-lock.yaml
└── README.md
```

### 3.2 Reglas de importación entre módulos (ADR-007)

```
PERMITIDO:
  ✅ Un módulo importa de shared/*
  ✅ Un módulo importa del .service.ts de otro módulo
  ✅ Un API route importa del .service.ts de un módulo
  ✅ Un componente importa de components/ui/*

PROHIBIDO:
  ❌ Un módulo importa de los internos de otro módulo
     (ej: bookings/ NO puede importar de payments/mp-gateway.ts)
  ❌ Un módulo importa de app/ (la UI no es dependencia del backend)
  ❌ shared/ importa de modules/ (shared es la base, no conoce modules)
  ❌ Un service importa de un API route (el flujo es route → service, nunca al revés)
```

```
FLUJO DE DEPENDENCIAS (unidireccional):

  app/api/*  ──▶  modules/*.service.ts  ──▶  shared/db/*
       │                  │                       │
       │                  ▼                       │
       │           shared/jobs/*  ◀───────────────┘
       │                  │
       ▼                  ▼
  app/(admin)/*    shared/lib/* (supabase, mp, resend)
  app/(public)/*
```

---

## 4. Dependencias Clave

### 4.1 Dependencias de producción

```json
{
  "dependencies": {
    // Framework
    "next": "^14.2",
    "react": "^18.3",
    "react-dom": "^18.3",

    // Base de datos
    "drizzle-orm": "^0.30",
    "postgres": "^3.4",               // PostgreSQL driver (postgres.js)

    // Autenticación
    "@supabase/supabase-js": "^2.43",  // Client SDK
    "@supabase/ssr": "^0.3",           // Server-side helpers

    // Background Jobs
    "pg-boss": "^9.0",

    // Pagos
    "mercadopago": "^2.0",             // SDK oficial de MercadoPago

    // Email
    "resend": "^3.2",

    // Validación
    "zod": "^3.23",

    // UI (componentes primitivos — el design system visual se define en design-system/MASTER.md)
    "@radix-ui/react-dialog": "^1.0",
    "@radix-ui/react-dropdown-menu": "^2.0",
    "@radix-ui/react-select": "^2.0",
    "@radix-ui/react-toast": "^1.1",
    "class-variance-authority": "^0.7",
    "clsx": "^2.1",
    "tailwind-merge": "^2.3",
    // Iconos: lucide-react (definido en doc20, master design system)

    // Utilidades
    "date-fns": "^3.6",               // Manipulación de fechas
    "date-fns-tz": "^3.1",            // Timezone conversions (UTC ↔ ART)
    "nanoid": "^5.0",                  // IDs cortos para tokens

    // Monitoring
    "@sentry/nextjs": "^7.110"
  }
}
```

### 4.2 Dependencias de desarrollo

```json
{
  "devDependencies": {
    // TypeScript
    "typescript": "^5.4",
    "@types/node": "^20",
    "@types/react": "^18",

    // Testing
    "vitest": "^1.6",
    "@playwright/test": "^1.43",

    // Linting
    "eslint": "^8",
    "eslint-config-next": "^14",
    "@typescript-eslint/eslint-plugin": "^7",

    // DB tooling
    "drizzle-kit": "^0.20",           // Migrations CLI
    "supabase": "^1.150",             // Supabase CLI

    // Estilos
    "tailwindcss": "^3.4",
    "postcss": "^8",
    "autoprefixer": "^10",

    // Formatting
    "prettier": "^3.2"
  }
}
```

### 4.3 ¿Por qué Drizzle ORM y no Prisma?

| Criterio | Drizzle | Prisma |
|---|---|---|
| Type safety | ✅ SQL-like, TypeScript-first | ✅ Generado del schema |
| Bundle size | ~50KB | ~2MB+ (Prisma Engine) |
| Serverless compatibility | ✅ Pure JS, sin engine binario | ⚠️ Requiere Prisma Engine (frío lento) |
| Raw SQL support | ✅ Nativo (sql template tag) | ⚠️ `$queryRaw` menos ergonómico |
| RLS de Supabase | ✅ Compatible (usa postgres.js directo) | ⚠️ No soporta SET LOCAL trivialmente |
| Migrations | SQL puro | Schema-based (abstrae el SQL) |
| Performance en Vercel | ✅ Cold start < 200ms | ⚠️ Cold start 1-3s (engine) |

**Decisión**: Drizzle ORM. Bundle mínimo, compatible con serverless (Vercel), soporte nativo de SQL raw para `SET LOCAL` y exclusion constraints, y migrations en SQL puro que son auditables.

---

## 5. Flujo de un Request (End to End)

### 5.1 Request de staff autenticado (ej: crear reserva manual)

```
1. POST /api/bookings
   Header: Authorization: Bearer <JWT>
   Body: { court_id, date, time_start, time_end, player_id?, notes? }

2. middleware.ts (Next.js Middleware)
   ├── Verificar JWT con Supabase Auth
   ├── Extraer user_id, type, tenant_id del JWT
   ├── Si no autenticado → 401
   └── Adjuntar user al request context

3. app/api/bookings/route.ts (POST handler)
   ├── Parsear y validar body con Zod (bookingCreateSchema)
   ├── Si inválido → 400 con errores de validación
   ├── Obtener tenant context del middleware
   └── Llamar a bookingService.createManualBooking(data, ctx)

4. modules/bookings/booking.service.ts
   ├── db.transaction(async (tx) => {
   │     // SET LOCAL ya fue ejecutado por el middleware
   │
   │     // a. Verificar que la cancha existe y está activa
   │     const court = await tx.select().from(courts).where(eq(courts.id, data.courtId))
   │     if (!court || court.status !== 'online') → throw CourtNotFoundError
   │
   │     // b. Verificar disponibilidad con lock exclusivo
   │     const conflict = await tx.execute(sql`
   │       SELECT id FROM bookings
   │       WHERE court_id = ${data.courtId}
   │         AND date = ${data.date}
   │         AND time_start < ${data.timeEnd}
   │         AND time_end > ${data.timeStart}
   │         AND status IN ('pending_payment', 'confirmed')
   │       FOR UPDATE
   │     `)
   │     if (conflict.length > 0) → throw SlotUnavailableError
   │
   │     // c. Calcular precio
   │     const price = calculatePrice(court.pricing, data.date, data.timeStart)
   │
   │     // e. Crear la reserva
   │     const booking = await tx.insert(bookings).values({
   │       tenant_id: ctx.tenantId,
   │       court_id: data.courtId,
   │       player_id: data.playerId,
   │       date: data.date,
   │       time_start: data.timeStart,
   │       time_end: data.timeEnd,
   │       type: 'spontaneous',
   │       status: 'confirmed',  // manual = inmediatamente confirmada
   │       price_snapshot: price,
   │       created_by_staff: ctx.userId,
   │     }).returning()
   │
   │     // e. Encolar email de confirmación (atómico con la transacción)
   │     if (data.playerId) {
   │       await boss.send('send-email', {
   │         type: 'booking_confirmed',
   │         booking_id: booking.id,
   │       }, { db: tx })
   │     }
   │
   │     // f. Registrar en audit log
   │     await auditService.log(tx, {
   │       action: 'booking.created',
   │       resource_type: 'booking',
   │       resource_id: booking.id,
   │       after_state: booking,
   │     })
   │
   │     return booking
   │   })
   └── Retornar booking creado

5. app/api/bookings/route.ts
   └── Retornar 201 con booking serializado

6. Background (async, no bloquea el response)
   ├── pg-boss worker: send-email
   │   ├── Leer template "booking_confirmed"
   │   ├── Renderizar con React Email + Llamar Resend API
   │   ├── Actualizar notifications.status = 'sent'
   │   └── Si falla: retry con backoff (1min, 5min, 30min)
   └── Supabase Realtime
       └── postgres_changes emite el INSERT de bookings
       └── Panel admin del recepcionista actualiza la grilla en vivo
```

---

## 6. Ambientes

### 6.1 Tres ambientes

| Ambiente | Propósito | URL | DB | Deploy |
|---|---|---|---|---|
| **Local** | Desarrollo | localhost:3000 | Supabase local (Docker) | `pnpm dev` |
| **Preview** | Review de PRs | pr-123.turnogol.vercel.app | Supabase branch DB | Automático por PR |
| **Production** | Producción | turnogol.app | Supabase Pro | Manual o merge a `main` |

### 6.2 Variables de entorno

```bash
# .env.example — Template de variables

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # SOLO en servidor, NUNCA en cliente
DATABASE_URL=postgres://user:pass@host:5432/db

# MercadoPago
MP_ACCESS_TOKEN=APP_USR-xxx
MP_PUBLIC_KEY=APP_USR-xxx
MP_WEBHOOK_SECRET=xxx

# Email (Resend)
RESEND_API_KEY=re_xxx
EMAIL_FROM=noreply@turnogol.app

# Sentry
SENTRY_DSN=https://xxx@sentry.io/xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx

# App
NEXT_PUBLIC_APP_URL=https://turnogol.app
NODE_ENV=production
```

### 6.3 Validación de env vars al iniciar

```typescript
// shared/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().startsWith('postgres'),

  // MercadoPago
  MP_ACCESS_TOKEN: z.string().min(1),
  MP_WEBHOOK_SECRET: z.string().min(1),

  // Email (Resend)
  RESEND_API_KEY: z.string().startsWith('re_'),
  EMAIL_FROM: z.string().email(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']),
});

// Si falta alguna variable, la app falla al iniciar con un error claro
export const env = envSchema.parse(process.env);
```

---

## 7. Pipeline de CI/CD

### 7.1 En cada Pull Request

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: supabase/postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate:test          # Correr migrations en DB de test
      - run: pnpm test:integration
      - run: pnpm test:isolation           # Tests de aislamiento (BLOQUEANTE)
```

### 7.2 Deploy a producción

```yaml
# .github/workflows/deploy-production.yml
name: Deploy Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile

      # 1. Correr TODOS los tests
      - run: pnpm test:unit
      - run: pnpm test:integration
      - run: pnpm test:isolation

      # 2. Correr migrations en Supabase producción
      - run: npx supabase db push --linked

      # 3. Deploy a Vercel (automático vía integración Git)
      # Vercel deploya automáticamente al detectar push a main
```

### 7.3 Estrategia de deploy zero-downtime

```
1. Vercel detecta push a `main`
2. Build del nuevo código en un contenedor aislado
3. Nuevo deployment se crea pero NO se activa aún
4. Health check del nuevo deployment
5. Si pasa → se routea el tráfico al nuevo deployment (atomic swap)
6. Si falla → rollback automático al deployment anterior

Las DB migrations son SIEMPRE backward-compatible:
  - Nunca eliminar una columna en el mismo deploy que deja de usarla
  - Paso 1: Deploy que deja de usar la columna pero no la elimina
  - Paso 2: Deploy que elimina la columna (ya nadie la usa)

Esto garantiza que durante el swap atómico, tanto el código viejo
como el nuevo pueden funcionar con el schema actual.
```

---

## 8. Desarrollo Local

### 8.1 Setup inicial

```bash
# 1. Clonar el repo
git clone https://github.com/turnogol/turnogol.git
cd turnogol

# 2. Instalar dependencias
pnpm install

# 3. Iniciar Supabase local (requiere Docker)
npx supabase start
# → Levanta PostgreSQL, Auth, Realtime, Storage localmente

# 4. Copiar variables de entorno
cp .env.example .env.local
# → Editar con los valores de Supabase local (se muestran al iniciar)

# 5. Correr migrations
pnpm db:migrate

# 6. Seed de datos de desarrollo
pnpm db:seed

# 7. Iniciar la app
pnpm dev
# → http://localhost:3000
```

### 8.2 Scripts de package.json

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",

    "lint": "eslint src/ --ext .ts,.tsx",
    "type-check": "tsc --noEmit",
    "format": "prettier --write src/",

    "db:migrate": "drizzle-kit push:pg",
    "db:migrate:test": "drizzle-kit push:pg --config=drizzle.test.config.ts",
    "db:generate": "drizzle-kit generate:pg",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx supabase/seed.ts",

    "test:unit": "vitest run --dir tests/unit",
    "test:integration": "vitest run --dir tests/integration",
    "test:isolation": "vitest run tests/integration/isolation.test.ts",
    "test:e2e": "playwright test",
    "test": "pnpm test:unit && pnpm test:integration",

    "jobs:dev": "tsx src/shared/jobs/worker.ts",

    "supabase:start": "npx supabase start",
    "supabase:stop": "npx supabase stop",
    "supabase:reset": "npx supabase db reset"
  }
}
```

### 8.3 Worker de background jobs en desarrollo

En desarrollo, los background jobs corren en un proceso separado:

```bash
# Terminal 1: App
pnpm dev

# Terminal 2: Background jobs worker
pnpm jobs:dev
```

En producción, el worker se inicia junto con la app o como un proceso separado (depende del hosting). En Vercel, los cron jobs simples se manejan con `vercel.json` cron, y los workers de colas con un servicio auxiliar si es necesario.

> [!WARNING]
> **pg-boss en Vercel serverless tiene una limitación**: las funciones de Vercel son efímeras
> (mueren después de cada request). Un worker de pg-boss necesita un proceso persistente
> que escuche la cola. **Solución para v1**: correr el worker en un servicio separado
> (Railway, Fly.io, o un VPS de $5/mes) que se conecte a la misma DB de Supabase.
> Alternativa: usar Supabase Edge Functions con `pg_cron` para jobs scheduled,
> y procesar los jobs de colas en un Vercel Cron que corre cada minuto.

---

## 9. Seguridad

### 9.1 Checklist de seguridad

| Área | Medida | Implementación |
|---|---|---|
| **Autenticación** | Staff: email+password (ADR-013). Jugadores: Magic Link/OAuth. | Supabase Auth |
| **JWT** | Access 1h, Refresh 30d rotativo | Supabase Auth config |
| **HTTPS** | Obligatorio | Vercel SSL automático |
| **Tenant Isolation** | RLS en 13 tablas | Doc 12 — 6 capas de protección (incluye `push_subscriptions`) |
| **Input Validation** | Todos los inputs | Zod schemas en cada endpoint |
| **SQL Injection** | Queries parametrizadas | Drizzle ORM (nunca concatenar SQL) |
| **XSS** | CSP headers | next.config.js headers |
| **CSRF** | SameSite cookies | Supabase Auth maneja cookies |
| **Rate Limiting** | Por IP en auth y búsqueda | Middleware custom o Vercel WAF |
| **Secrets** | Env vars | Vercel encrypted env vars |
| **Datos de tarjeta** | NUNCA almacenados | MP maneja PCI DSS |
| **Audit Trail** | INSERT only, 12 meses | Tabla audit_logs + RLS |
| **OWASP Top 10** | Mitigaciones documentadas | Doc 5 §4 |

### 9.2 Content Security Policy

```javascript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",  // Next.js requiere esto
      "style-src 'self' 'unsafe-inline'",                   // Tailwind
      "img-src 'self' *.supabase.co data: blob:",           // Supabase Storage
      "font-src 'self'",
      "connect-src 'self' *.supabase.co *.mercadopago.com",
      "frame-src *.mercadopago.com",                         // MP Checkout
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];
```

---

## 10. Performance

### 10.1 Targets (Doc 5)

| Métrica | Target | Estrategia |
|---|---|---|
| FCP | < 1.5s | SSR para páginas públicas, skeleton UI para admin |
| LCP | < 2.5s | Image optimization (next/image), font preload |
| TTI | < 3.5s | Code splitting por ruta, lazy loading de componentes pesados |
| CLS | < 0.1 | Dimensiones fijas en imágenes, skeleton con tamaño correcto |
| Bundle (gzipped) | < 300KB | Tree shaking, dynamic imports, no librerías pesadas |
| Grilla load | < 500ms | Index en (tenant_id, date), RLS transparente |
| Confirmar reserva | < 2s | Transacción atómica, email async |

### 10.2 Estrategias de rendering por ruta

| Ruta | Rendering | Justificación |
|---|---|---|
| Landing page | SSG | Estática, no cambia entre requests |
| `/[slug]` (complejo público) | SSR + ISR (60s) | SEO + datos relativamente estáticos |
| `/[slug]/disponibilidad` | SSR | Datos en tiempo real, no cacheables |
| `/[slug]/reservar` | Client-side | Flujo interactivo con estado local |
| `/login`, `/register` | SSR | Formularios simples |
| `/dashboard` | Client-side + SWR | Data fetching con revalidación |
| `/grilla` | Client-side + Realtime | Supabase Realtime para updates en vivo |
| `/configuracion/*` | Client-side | Formularios CRUD |
| `/reportes` | SSR | Datos pesados, pre-renderizados en servidor |

### 10.3 Caching

```
Vercel Edge Cache (CDN):
  • Static assets (JS, CSS, images): cached indefinidamente (hash en filename)
  • SSG pages: cached en edge, revalidated por deploy
  • ISR pages (complejo público): cached 60 segundos, stale-while-revalidate

Application Cache:
  • Plan del tenant: cached 5 minutos en memory (invalidar al cambiar plan)
  • Horarios del complejo: cached 1 hora (raramente cambian)
  • Feature flags del plan: cached junto con el plan (5 min)

NO cachear:
  • Disponibilidad de canchas (siempre real-time)
  • Datos financieros (caja, pagos)
  • Datos de auth (JWT, sesiones)
```

---

## 11. Observabilidad (Preview — Doc 17 expande)

### 11.1 Error tracking

```typescript
// shared/lib/sentry.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 0.1,            // 10% de requests traceados
  profilesSampleRate: 0.05,          // 5% profiling
  environment: env.NODE_ENV,
  ignoreErrors: [
    'AbortError',                    // Request cancelado por el usuario
    'Network request failed',        // Problemas de red del cliente
  ],
});
```

### 11.2 Logging estructurado

```typescript
// shared/utils/logger.ts
function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
    tenant_id: getCurrentTenantId(),  // Si hay contexto de tenant
  };
  console[level](JSON.stringify(entry));
}

// Uso
log('info', 'booking.created', {
  booking_id: 'uuid',
  court_id: 'uuid',
  method: 'manual',
});
```

### 11.3 Health check

```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = {
    database: await checkDatabase(),
    supabase_auth: await checkSupabaseAuth(),
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
  };

  const isHealthy = Object.values(checks).every(v =>
    typeof v === 'string' || v === true
  );

  return Response.json(checks, { status: isHealthy ? 200 : 503 });
}
```

---

## 12. Costos Estimados (Year 1)

### 12.1 Con 50 complejos activos (primeros 6 meses)

| Servicio | Plan | Costo/mes (USD) |
|---|---|---|
| Vercel | Pro | $20 |
| Supabase | Pro | $25 |
| Dominio (.com.ar) | — | $5 |
| Email (Resend) | Starter | $20 |
| Sentry | Developer (gratis) | $0 |
| **Total** | | **~$70/mes** |

Con 10-20 clientes activos de TurnoGol ($160-320 USD/mes en MRR al precio más bajo), la infra se paga sola.

### 12.2 Con 200 complejos activos (mes 12)

| Servicio | Plan | Costo/mes (USD) |
|---|---|---|
| Vercel | Pro | $20 |
| Supabase | Pro (8GB DB, posible upgrade) | $25-50 |
| Dominio | — | $5 |
| Resend (email) | Pro | $50 |
| Sentry | Team | $26 |
| **Total** | | **$126-151/mes** |

### 12.3 Con 500 complejos (target Year 1)

| Servicio | Plan | Costo/mes (USD) |
|---|---|---|
| Vercel | Pro | $20 |
| Supabase | Team o self-hosted | $50-200 |
| Resend | Business | $100 |
| Sentry | Team | $26 |
| Worker para pg-boss (Railway/Fly) | Basic | $10-20 |
| **Total** | | **$206-366/mes** |

**Comparación con revenue**: Con 500 complejos al precio más bajo ($55.000 ARS/mes = ~$55 USD):
MRR estimado = 500 × $55 = **$27.500 USD/mes**. Infra = 0.7-1.3% del MRR. **Margen excelente.**

---

## 13. Decisiones Técnicas Pendientes (a resolver en desarrollo)

| Tema | Opciones | Cuándo decidir |
|---|---|---|
| Form management | Server Actions para mutaciones UI, Route Handlers para webhooks/API pública (decidido — CLAUDE.md) | ✅ Decidido |
| State management (admin) | Zustand vs Jotai vs React context | Sprint 1 |
| Table component | TanStack Table vs custom | Sprint 2 |
| Chart library (reportes) | Recharts vs Tremor | Sprint 4 |
| PWA strategy | next-pwa vs custom service worker | Sprint 5 |
| Image processing | Sharp en Edge Function vs Supabase transform | Sprint 3 |
| i18n (si se internacionaliza) | next-intl vs i18next | Post-Year 1 |

> [!NOTE]
> Estas decisiones NO son ADRs porque no impactan la arquitectura del sistema.
> Son decisiones de implementación que se toman en el momento del desarrollo
> con información fresca del ecosistema.

---

## 14. Resumen: El Stack en Una Imagen Mental

```
┌─────────────────────────────────────────────────────────────┐
│                    TURNOGOL v1 STACK                         │
│                                                             │
│  Browser ──────▶ Vercel CDN ──────▶ Next.js (SSR/API)      │
│                                          │                  │
│                                     Drizzle ORM             │
│                                          │                  │
│                          ┌───────────────┼───────────────┐  │
│                          │               │               │  │
│                     Supabase DB    Supabase Auth    Supabase│ │
│                     (PostgreSQL     (Magic Link     Realtime│ │
│                      + RLS          + OAuth)        + SSE)  │ │
│                      + pg-boss)                             │ │
│                          │               │                  │ │
│                          └───────────────┼──────────────────┘ │
│                                          │                    │
│                  ┌───────────────────────┼──────────────────┐ │
│                  │                       │                  │ │
│                  MercadoPago              Resend               │
│                  (Pagos)                 (Email)               │
│                                                             │
│  Lenguaje: TypeScript                                       │
│  UI: React + shadcn/ui + Tailwind (design system: MASTER.md)  │
│  Testing: Vitest + Playwright                               │
│  Monitoring: Sentry + Vercel Analytics                      │
│  CI/CD: GitHub Actions → Vercel                             │
└─────────────────────────────────────────────────────────────┘
```
