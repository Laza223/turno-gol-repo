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
| **Lenguaje** | TypeScript | 6.x (`package.json`: `^6.0.3`) | — |
| **Runtime** | Node.js | 20 LTS (`engines.node: >=20.9`) | — |
| **Framework fullstack** | Next.js (App Router, Turbopack) | 16.x (`^16.2.11`) | ADR-008 |
| **UI Library** | React | 19.x (`^19.2.7`) | ADR-008 |
| **Component Library** | shadcn/ui + Radix UI | Latest | — |
| **Estilos** | Tailwind CSS | 4.x (`^4.3.2`) | — |
| **Design System** | Propio (design-system/MASTER.md) | — | — |
| **Base de datos** | PostgreSQL | 15.x (vía Supabase) | ADR-001 |
| **ORM / Query Builder** | Drizzle ORM | `^0.45.2` | — |
| **Autenticación** | Supabase Auth | Managed | ADR-002 |
| **Real-time** | Supabase Realtime | Managed | ADR-006 |
| **Storage** | **Cloudflare R2** (`src/shared/storage/r2.ts`, SDK `@aws-sdk/client-s3`) — NO Supabase Storage | Managed | — |
| **Background Jobs** | pg-boss | `^9.0` | ADR-005 |
| **Pagos** | MercadoPago SDK | `^2.0` | ADR-004 |
| **Email** | Resend | `^6.18` | ADR-003 |
| **Validación** | Zod | `^4.4` | — |
| **Hosting App** | Vercel | Pro plan | ADR-009 |
| **Hosting DB** | Supabase | Pro plan | ADR-009 |
| **Hosting Worker (pg-boss)** | Railway (`Dockerfile.worker` + `railway.toml`) | — | — |
| **Error Tracking** | Sentry | `@sentry/nextjs ^10.65` | — |
| **Analytics** | Vercel Analytics | Included | — |
| **Autocompletado de direcciones** | Google Places API | Latest | — |
| **Testing** | Vitest + Playwright | `vitest ^3.2` / `@playwright/test ^1.61` | — |
| **Package Manager** | pnpm | 10.x+ (`packageManager: pnpm@10.34.5`) | — |

> [!NOTE]
> **Google Places API** (Decisión de auditoría 2026-07-21 — ARG-10): se usa en el onboarding
> para autocompletar la dirección del complejo (Places Autocomplete) y derivar lat/long.
> Requiere API key de Google Cloud con billing habilitado; el costo es **por request**
> (Autocomplete + Place Details) con un tier gratuito mensual — barato al volumen de v1
> (alta de complejos), pero hay que monitorear que no se dispare. Si la API no está disponible
> o el complejo prefiere no usarla, hay **fallback a carga manual de dirección** (ver Doc 10,
> onboarding). (Implementación de código pendiente — hoy no está integrada.)

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

> [!NOTE]
> El árbol de 3.1 es el layout **original de diseño**, previo a la implementación, y quedó
> desactualizado en varios puntos: `src/modules/*` tiene **23 slices** reales (no ~11 —
> faltan acá `canteen`, `tournaments`, `relationships`, `staff`, `players`, `bans`, `favorites`,
> `reviews`, `metrics`, `onboarding`, `super-admin`, `home`, entre otros), `src/app/*` tiene
> además los route groups `(business)` y `(super-admin)` (no listados acá), y existe una capa
> `src/server/` (composition root del runtime web: middleware de auth/tenant/rol, wrappers de
> route handler) que no aparece en este árbol — ver CLAUDE.md "Arquitectura del código" para el
> mapa real y actualizado. Se conserva el árbol de abajo como referencia histórica del diseño
> original de carpetas, no como fuente de verdad de la estructura actual.

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

> [!NOTE]
> Verificado contra `package.json` (2026-08-27). Se listan las libs con equivalente directo en
> el diseño original; el `package.json` real tiene más (R2/S3, rate limiting con Upstash,
> Storybook, Leaflet para mapas, `mercadopago`, `web-push`, etc.) — ver el archivo para la lista completa.

```json
{
  "dependencies": {
    // Framework
    "next": "^16.2.11",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",

    // Base de datos
    "drizzle-orm": "^0.45.2",
    "postgres": "^3.4",               // PostgreSQL driver (postgres.js)

    // Autenticación
    "@supabase/supabase-js": "^2.43",  // Client SDK
    "@supabase/ssr": "^0.3",           // Server-side helpers

    // Background Jobs
    "pg-boss": "^9.0",

    // Pagos
    "mercadopago": "^2.0",             // SDK oficial de MercadoPago

    // Email
    "resend": "^6.18.0",

    // Validación
    "zod": "^4.4.3",

    // Storage (Cloudflare R2, NO Supabase Storage)
    "@aws-sdk/client-s3": "^3.1079.0",

    // UI (componentes primitivos — el design system visual se define en design-system/MASTER.md)
    "@radix-ui/react-dialog": "^1.0",
    "@radix-ui/react-dropdown-menu": "^2.0",
    "@radix-ui/react-popover": "^1.0",
    "@radix-ui/react-toast": "^1.1",
    "class-variance-authority": "^0.7",
    "clsx": "^2.1",
    "tailwind-merge": "^3.6.0",
    // Iconos: lucide-react (definido en doc20, master design system)

    // Utilidades
    "date-fns": "^3.6",               // Manipulación de fechas
    "date-fns-tz": "^3.1",            // Timezone conversions (UTC ↔ ART)

    // Monitoring
    "@sentry/nextjs": "^10.65.0"
  }
}
```

### 4.2 Dependencias de desarrollo

```json
{
  "devDependencies": {
    // TypeScript
    "typescript": "^6.0.3",
    "@types/node": "^20",
    "@types/react": "^19.2.17",

    // Testing
    "vitest": "^3.2.7",
    "@playwright/test": "^1.61",

    // Linting
    "eslint": "^9.39.5",
    "eslint-config-next": "^16.2.10",
    "typescript-eslint": "^8.64.0",

    // DB tooling
    "drizzle-kit": "^0.31.10",        // Migrations CLI (drizzle-kit push/generate; usar SÓLO para generar tipos — las migraciones reales son SQL a mano, ver §7.4)
    "supabase": "^1.150",             // Supabase CLI

    // Estilos
    "tailwindcss": "^4.3.2",
    "@tailwindcss/postcss": "^4.3.2",
    "postcss": "^8",

    // Formatting
    "prettier": "^3.9"
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

> [!NOTE]
> Ejemplo desactualizado (verificado contra `src/shared/env.ts`, no `shared/config/env.ts` —
> ese archivo no existe). El schema real usa Zod 4 y valida, entre otras, `ENCRYPTION_KEY`
> (64 hex exactos), `IMPERSONATION_COOKIE_SECRET`, `MP_CLIENT_ID`/`MP_CLIENT_SECRET`
> (OAuth Checkout Pro) + `MP_WEBHOOK_SECRET`/`MP_WEBHOOK_SECRET_CHECKOUT` (dos apps MP, ver
> CLAUDE.md), `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`/`R2_PUBLIC_BASE_URL`
> (storage), `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (push), `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
> (rate limiting) y `SYSTEM_ADMIN_EMAILS`. No valida `MP_ACCESS_TOKEN` ni `EMAIL_FROM` con ese
> nombre. Varias son opcionales en dev/test y requeridas solo en prod (`isProd` branch), no un
> único schema fijo como el ejemplo original sugiere.

```typescript
// src/shared/env.ts
import { z } from 'zod';

function makeSchema(isProd: boolean) {
  return z.object({
    DATABASE_URL: z.string().min(1),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
    MP_CLIENT_ID: z.string().min(1),
    MP_CLIENT_SECRET: z.string().min(1),
    MP_WEBHOOK_SECRET: isProd ? z.string().min(16) : z.string().min(16).optional(),
    RESEND_API_KEY: z.string().min(1),
    // ...ver src/shared/env.ts para el schema completo
  });
}

// Si falta alguna variable requerida, la app falla al iniciar con un error claro
export const env = validateServerEnv(process.env);
```

---

## 7. Pipeline de CI/CD

### 7.1 En cada Pull Request

> [!NOTE]
> Ejemplo ilustrativo del diseño original, desactualizado frente al `.github/workflows/ci.yml`
> real: hoy tiene 7 jobs (`lint-and-types`, `unit-tests`, `stories-shards`, `stories`,
> `integration-and-isolation`, `e2e-tests`, `visual-regression`), no 3. `e2e-tests` y
> `visual-regression` solo corren en push a `main` (no en todos los PRs, ver CLAUDE.md §CI).
> `visual-regression` **ya NO usa** `continue-on-error` (se sacó el 2026-08-10, PR #123 —
> comentario en el propio `ci.yml` job `visual-regression`: "ya no hay que fingir verde para no
> trabar un merge que este job nunca pudo trabar"): hoy el check refleja el resultado real.
> (`docs/testing/VISUAL_REGRESSION.md` no está actualizado con este cambio — sigue documentando
> `continue-on-error`, pero ese archivo no forma parte de este lote de sync.)

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

> [!NOTE]
> No existe `deploy-production.yml` (verificado: `.github/workflows/` no lo tiene). Dos
> mecanismos separados, ambos disparados por push a `main`, sin dependencia explícita entre sí:
>
> - **Deploy de la app**: Vercel por integración Git directa (no un GitHub Action) — no re-corre
>   tests, ya corrieron en `ci.yml`.
> - **Migraciones de producción**: `.github/workflows/db-migrate.yml`, dispara SOLO si cambiaron
>   archivos en `supabase/migrations/**`. Corre `supabase db push` con `--dry-run` primero (deja
>   registrado qué va a aplicar antes de tocar nada) y tiene `concurrency` para que dos merges
>   seguidos no pusheen en paralelo. Si falla, el workflow queda rojo y la app sigue con el
>   schema viejo (estado seguro).
>
> Hay una **carrera conocida** entre ambos: Vercel puede deployar código nuevo unos segundos
> antes de que termine la migración. Por eso las migraciones son obligatoriamente
> backward-compatible (expand & contract, ver §7.3 y `docs/operations/MIGRATIONS.md`).

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

### 7.4 Migraciones: dos árboles con sync automatizado

Hay dos árboles de migraciones SQL escritas a mano:

- `src/shared/db/migrations/0*.sql` — **autoridad**. Orden numérico (`001…`), aplicadas por
  psql en el job de integración de CI.
- `supabase/migrations/*.sql` — **espejo** con formato timestamp para el Supabase CLI (local + prod).

El espejo NO se mantiene a mano: se regenera desde el árbol autoritativo con
`pnpm db:sync-supabase` (`scripts/sync-supabase-migrations.mjs`, copia `src/shared/db/migrations/`
→ `supabase/migrations/` con prefijo timestamp).

> [!NOTE]
> **Decisión de auditoría 2026-07-21 (TEC-05):** cablear `db:sync-supabase` en CI —o un check
> pre-PR— que regenere el espejo y **falle el pipeline si detecta drift** entre los dos árboles.
> Así se elimina la duplicación manual (una sola fuente de verdad: `src/shared/db/migrations/`).
> Implementación de código pendiente (hoy el sync se corre a mano).

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

# 5. Aplicar migraciones (SQL a mano en src/shared/db/migrations/0*.sql,
#    vía psql o el CLI de Supabase — drizzle-kit push NO es el camino:
#    "db:migrate"/"db:push" están DENEGADOS en .claude/settings.json, ver §7.4)

# 6. Seed de datos (según necesidad)
pnpm e2e:seed            # datos para e2e
pnpm seed:system-admin    # bootstrap del primer super-admin

# 7. Iniciar la app
pnpm dev
# → http://localhost:3000
```

### 8.2 Scripts de package.json

> [!NOTE]
> Lista real verificada contra `package.json` (2026-08-27) — la fuente de verdad viva es
> `CLAUDE.md` §Comandos, este bloque es un subset ilustrativo. `db:push`/`db:migrate` (alias de
> `drizzle-kit push`) están **DENEGADOS** en `.claude/settings.json`: las migraciones reales son
> los SQL a mano de `src/shared/db/migrations/0*.sql` (§7.4). No existe script `db:seed`.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",

    "lint": "eslint src/ tests/ scripts/",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write src/ tests/ scripts/",

    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio",
    "db:sync-supabase": "node scripts/sync-supabase-migrations.mjs",

    "test": "vitest run tests/unit src",
    "test:integration": "vitest run --dir tests/integration --exclude \"**/isolation.test.ts\"",
    "test:isolation": "vitest run tests/integration/isolation.test.ts",
    "test:e2e": "playwright test",

    "jobs:start": "tsx src/shared/jobs/run-workers.ts",

    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "supabase:reset": "supabase db reset"
  }
}
```

### 8.3 Worker de background jobs en desarrollo

En desarrollo, los background jobs corren en un proceso separado:

```bash
# Terminal 1: App
pnpm dev

# Terminal 2: Background jobs worker
pnpm jobs:start
```

> [!NOTE]
> **Decidido e implementado** (ya no es una decisión pendiente): el worker de pg-boss corre como
> proceso standalone, desacoplado de Next.js, en un servicio separado — **Railway**
> (`Dockerfile.worker` + `railway.toml` en la raíz del repo), conectado a la misma DB de Supabase
> vía `WORKER_DATABASE_URL` (rol `turnogol_worker`, BYPASSRLS). Entrypoint: `src/shared/jobs/run-workers.ts`
> (14 workers registrados, ver CLAUDE.md). La limitación original de pg-boss en funciones
> serverless efímeras de Vercel sigue siendo la razón de fondo, pero ya no aplica: la app web
> vive en Vercel y el worker vive en Railway.

---

## 9. Seguridad

### 9.1 Checklist de seguridad

| Área | Medida | Implementación |
|---|---|---|
| **Autenticación** | Staff: email+password (ADR-013). Jugadores: Magic Link/OAuth. | Supabase Auth |
| **JWT** | Access 1h, Refresh 30d rotativo | Supabase Auth config |
| **HTTPS** | Obligatorio | Vercel SSL automático |
| **Tenant Isolation** | RLS en 23 tablas tenant-aisladas (actualizado 2026-08-27, verificado contra `src/shared/db/migrations/*.sql`; no cuenta híbridas ni self-scoped como `system_admins`) | Doc 12 — 6 capas de protección (incluye `push_subscriptions`) |
| **Input Validation** | Todos los inputs | Zod schemas en cada endpoint |
| **SQL Injection** | Queries parametrizadas | Drizzle ORM (nunca concatenar SQL) |
| **XSS** | CSP headers | next.config.js headers |
| **CSRF** | SameSite cookies | Supabase Auth maneja cookies |
| **Rate Limiting** | Por IP/email/tenant/player según endpoint (§9 doc15) | Upstash Redis (`@upstash/ratelimit`, `src/shared/rate-limit/`) |
| **Secrets** | Env vars | Vercel encrypted env vars |
| **Datos de tarjeta** | NUNCA almacenados | MP maneja PCI DSS |
| **Audit Trail** | INSERT only, 12 meses | Tabla audit_logs + RLS |
| **OWASP Top 10** | Mitigaciones documentadas | Doc 5 §4 |

### 9.2 Content Security Policy

> [!NOTE]
> Ejemplo simplificado — desactualizado frente a `next.config.ts` (no `next.config.js`; el repo
> es TypeScript). La CSP real es condicional dev/prod (`unsafe-eval` en `script-src` solo en dev),
> agrega `img-src` para `images.unsplash.com`, tiles de OpenStreetMap y los hosts de media (R2),
> y agrega `report-uri`/`report-to` apuntando a `/api/csp-report`
> (`src/shared/observability/csp-report.ts`) — endpoint no documentado en este archivo ni en
> doc15. Ver `next.config.ts` para las directivas completas.

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

Application Cache (v1): NO se usa cache in-memory a nivel de aplicación.
  • En las funciones serverless de Vercel (efímeras, un proceso por request) un cache
    in-process es un MISS en cada request: no cachea nada. (Decisión de auditoría
    2026-07-21: se quita del spec de v1.)
  • Plan del tenant / horarios del complejo / feature flags del plan: se leen por-request
    con una query barata (indexada). Es más simple y correcto que un cache que no funciona.
  • Si a futuro se necesita cache compartido, requiere una capa EXTERNA (Upstash Redis o
    Vercel Edge Config). Diferido — fuera de v1.

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
