# Contribuir a TurnoGol

Guía operativa para desarrollar, testear, migrar y deployar TurnoGol.
Para el contexto del producto y las decisiones arquitectónicas, ver `CLAUDE.md` y `docs/`.
Para variables de entorno, deploy y restore de backups, ver también `README.md`.

---

## 1. Setup local

Requisitos: **Node ≥ 20**, **pnpm 8.15.0** (ver `packageManager` en `package.json`), Docker (para Supabase local).

```bash
pnpm install

# Variables de entorno
cp .env.example .env.local        # completar (ver README §Environment variables)
cp .env.test.example .env.test    # para los tests de integración (DATABASE_URL local)

# Postgres + Auth + Storage local en Docker (puerto DB 54322)
pnpm supabase:start

# Aplicar el schema. `supabase start`/`supabase db reset` ya corre las migraciones
# del espejo supabase/migrations. Para una DB Postgres pelada (sin Supabase CLI):
pnpm db:bootstrap   # ver nota abajo

pnpm dev            # http://localhost:3000
```

> No existe un script `db:bootstrap` por ahora; en una DB pelada corré directamente
> `node scripts/bootstrap-test-db.mjs` (crea los roles `turnogol_app` y `authenticated`
> y aplica todas las migraciones de `src/shared/db/migrations/`). Apunta por defecto a
> `postgres://postgres:postgres@127.0.0.1:54322/postgres`; sobreescribí con `DATABASE_URL=<url>`.

---

## 2. Flujo de trabajo (PRs)

**`main` está protegida. Nunca se pushea directo a `main`.** Todo cambio entra por Pull Request con CI verde.

1. Salí de `main` actualizada y creá una branch descriptiva:
   ```bash
   git checkout main && git pull
   git checkout -b <tipo>/<descripcion>   # ej: feat/buscador-explorar, fix/grilla-overlap, infra/ci-cd-setup
   ```
2. **Commits atómicos** con mensajes descriptivos (preferentemente Conventional Commits:
   `feat:`, `fix:`, `chore:`, `ci:`, `docs:`, `refactor:`).
3. Antes de pushear, corré localmente lo mismo que corre CI:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm test:integration   # requiere DATABASE_URL + migraciones aplicadas
   pnpm test:isolation     # tests de aislamiento RLS — BLOQUEANTES (docs/doc16)
   ```
4. Abrí el PR contra `main`. Los workflows corren automáticamente (ver §4).
5. **Merge solo con CI en verde** y al menos 1 review aprobada. Preferir *squash merge*.

---

## 3. Protección de la branch `main`

> Estas reglas se configuran **a mano** en GitHub (Settings → Branches → Branch protection rules → `main`).
> No se aplican por API/código en este repo; esta sección documenta qué tildar.

Configuración recomendada para `main`:

- ✅ **Require a pull request before merging**
  - ✅ Require approvals: **1**
  - ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging
  - Status checks requeridos (nombres exactos de los jobs tal como aparecen en GitHub):
    - `Lint & Types`                       — workflow **CI** (`.github/workflows/ci.yml`)
    - `Unit Tests`                         — workflow **CI**
    - `Integration & Isolation (BLOCKING)` — workflow **CI**
    - `E2E Tests`                          — workflow **CI** (solo en PRs a `main`)
    - `gitleaks`                           — workflow **security** (`.github/workflows/security.yml`)
    - `pnpm-audit`                         — workflow **security**
- ✅ **Require conversation resolution before merging**
- ✅ **Require linear history** (combinable con squash merge)
- ✅ **Do not allow bypassing the above settings** (aplica también a admins)
- ✅ **Block force pushes**
- ✅ **Restrict deletions**

> Los checks `gitleaks` y `pnpm-audit` viven en `security.yml` (no en `ci.yml`), pero igual gatean el PR:
> GitHub permite requerir checks individuales sin importar en qué workflow estén definidos.

---

## 4. CI / CD

Tres workflows en `.github/workflows/`:

| Workflow | Archivo | Dispara en | Jobs |
|---|---|---|---|
| **CI** | `ci.yml` | push a `main`/`claude-code`, PRs a `main` | `Lint & Types`, `Unit Tests`, `Integration & Isolation (BLOCKING)`, `E2E Tests` (solo PRs a `main`) |
| **security** | `security.yml` | push a `main`, todos los PRs | `gitleaks`, `pnpm-audit` (`pnpm audit --prod --audit-level=high`) |
| **Deploy to Vercel** | `deploy.yml` | al completarse **CI** con éxito sobre `main` | Deploy a Vercel producción (ver §6) |

Detalle de los jobs de CI:

- **Lint & Types**: `pnpm lint` + `pnpm typecheck`.
- **Unit Tests**: `pnpm test` (Vitest, `tests/unit`).
- **Integration & Isolation (BLOCKING)**: levanta un service container `postgres:15-alpine`, crea los roles
  (`turnogol_app`, `authenticated`), aplica **todas** las migraciones de `src/shared/db/migrations/0*.sql`
  con `psql`, y corre `pnpm test:integration` + `pnpm test:isolation`. Si una migración rompe, el job falla
  (o sea: el CI ya verifica que las migraciones aplican limpio). Los tests de aislamiento son **bloqueantes**.
- **E2E Tests**: solo en PRs a `main`. Levanta Postgres, crea roles, aplica migraciones, instala Chromium y
  corre `pnpm test:e2e:ci`. Sube `test-results/` como artifact si falla.

`pnpm-audit` usa `--audit-level=high` → el job falla solo ante vulnerabilidades **high** o **critical**.

---

## 5. Migraciones (SQL versionado)

La estrategia a producción es **SQL versionado**, no `drizzle-kit push:pg`.
`push:pg` (`pnpm db:push`) difunde el schema sin versionar y **no debe correrse contra producción** — solo
sirve para iterar rápido en local.

### Fuente de verdad

`src/shared/db/migrations/*.sql`, con prefijo numérico de 3 dígitos que ordena lexicográficamente:

```
NNN_descripcion.sql      ej: 001_extensions.sql … 014_push_subscriptions.sql
```

Es lo que aplican el CI, `bootstrap-test-db.mjs` y el flujo de producción (ver README §Running migrations).

### Espejo para Supabase CLI

`supabase/migrations/*.sql` es un **espejo generado** (con prefijos de timestamp) que usa `supabase db reset`
en el entorno local de Supabase. Se regenera desde la fuente de verdad con:

```bash
pnpm db:sync-supabase   # copia src/shared/db/migrations → supabase/migrations con timestamps
```

> Mantené ambas en sync: cuando agregás una migración en `src/shared/db/migrations/`, corré
> `pnpm db:sync-supabase` para actualizar el espejo, y commiteá ambos cambios juntos.

### Roles

Las policies RLS referencian los roles `turnogol_app` (creado en `008_revokes.sql`) y `authenticated`
(provisto por Supabase). En una Postgres pelada esos roles no existen: `scripts/bootstrap-test-db.mjs`
los crea antes de aplicar las migraciones (el CI hace lo mismo con un paso `psql`).

### Flujo para crear una migración

1. Crear `src/shared/db/migrations/NNN_descripcion.sql` con el siguiente número correlativo.
2. Escribir el DDL/DML (idealmente idempotente: `IF NOT EXISTS`, etc.).
3. Aplicar y testear en local (`node scripts/bootstrap-test-db.mjs` contra una DB de prueba, o `supabase db reset`).
4. Correr `pnpm test:integration` + `pnpm test:isolation`.
5. `pnpm db:sync-supabase` para regenerar el espejo.
6. **Commitear** el `.sql` nuevo + el espejo + el código que lo necesita.

> Las migraciones son **append-only**: nunca edites ni borres una `.sql` ya aplicada en producción.
> Para revertir, escribí una nueva migración que deshaga el cambio (ver §6 Rollback).

---

## 6. Deploy y rollback

### Deploy

El deploy a Vercel es **automático**: cuando el workflow **CI** termina con éxito sobre `main`, `deploy.yml`
se dispara (`workflow_run`) y deploya a producción. No hay paso manual.

Secrets requeridos en GitHub (Settings → Secrets and variables → Actions) — los configura el owner:
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
El resto de los secrets (Supabase, MercadoPago, Resend, `ENCRYPTION_KEY`) viven como env vars encriptadas en
el dashboard de Vercel. Ver `README.md`.

### Rollback

**Código (Vercel):**
1. Vercel Dashboard → Deployments.
2. Elegí el último deployment bueno → **Promote to Production** (o `vercel rollback`).
3. El rollback de código es instantáneo y no toca la DB.

**Base de datos:**
- Las migraciones son append-only. Para revertir un cambio de schema, creá una **migración reversa** (nueva
  `.sql` que deshaga el cambio) y deployala por el flujo normal.
- Para incidente mayor / corrupción de datos: restaurar desde backup PITR de Supabase a un proyecto temporal,
  verificar, exportar selectivamente. Ver `README.md` §Restoring a backup y `docs/doc19`.
- **Importante:** un rollback de código a una versión anterior **no revierte** las migraciones ya aplicadas.
  Diseñá migraciones *backward-compatible* (expand/contract) siempre que puedas.

---

## 7. Decisiones de producto pendientes (requieren al owner)

Ítems de la **Fase 1** del `TODO.md` que **no se implementan acá** porque dependen de decisiones de negocio,
contratación de planes o acceso a cuentas externas:

- [ ] **Dónde correr los workers de pg-boss** (Railway / Fly.io / VPS). **No puede ser Vercel serverless.**
      Decidir host y deployar `pnpm jobs:start` ahí.
- [ ] **Proyecto de Supabase staging** separado de dev/prod. Requiere contratar el plan.
- [ ] **Deploy a Vercel**: crear el proyecto, cargar los secrets (`VERCEL_*`, `SENTRY_*`) y las env vars
      encriptadas. `deploy.yml` ya está listo para usarlos.
- [ ] **Supavisor** (connection pooler de Supabase Pro) como `DATABASE_URL` de producción. Requiere Supabase Pro.
- [ ] **Pool de Postgres**: bajar `max` a **3** para el runtime serverless y mantener **10** solo para el
      worker de pg-boss.

Ver `TODO.md` → "Fase 1 — Infraestructura y Deploy" para el listado completo.

---

## 8. Convención de fin de línea

El repo fuerza **LF** vía `.gitattributes` (`* text=auto eol=lf`). Si tenés Windows, Git normaliza al
checkout/commit. Los archivos ya commiteados con CRLF se normalizan recién cuando se tocan (o con
`git add --renormalize .`). Ver `.gitattributes` para las excepciones (`*.bat`/`*.cmd` quedan CRLF, binarios sin tocar).
