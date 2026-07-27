# Fase D7 — Higiene de migraciones en prod vivo — Report

**Fecha:** 2026-07-26 | **Rama:** `audit/data-d7` | **Estado:** ✅ cerrada (pendiente 1 acción del dueño: cargar 3 secrets)

## Contexto

Última fase técnica de la wave 2. El gap que cierra ya se había cobrado **tres incidentes de producción**, todos de la misma clase: el pipeline aplicaba migraciones solo al Postgres efímero de CI, mientras Vercel deployaba el código igual.

| Incidente | Qué pasó |
|---|---|
| 048–051 (rediseño de caja) | `/caja` con 500 durante ~10 h en prod |
| 059/061 (fase D4) | Quedaron sin aplicar tras el merge |
| 060–066 (detectado 2026-07-26) | Prod en la 059 con el repo en 066. Torneos zafó **solo** porque su feature flag corta antes de tocar la DB; el daño real fue "Deshacer ausente" rechazado por el trigger viejo |

## Hallazgo principal — D7-H1 🔴: el registro de migraciones de prod estaba inutilizable

El plan asumía que D7 era "agregar un paso al pipeline". **Falso.** Antes de poder automatizar nada había que reparar el registro.

**Evidencia (prod, antes):**
```
supabase_migrations.schema_migrations → 19 filas
versiones: 20260723140717, 20260723143116, …, 20260726165219
```
Esas versiones son **el timestamp de cuándo se aplicó cada migración a mano** (vía `apply_migration` del MCP), no la versión de los archivos del repo (`20260424000001`…`20260424000066`). Las primeras 47 migraciones **nunca se registraron** — se aplicaron a mano meses atrás sin dejar rastro.

**Por qué es un bloqueante y no un detalle:** `supabase db push` decide qué aplicar comparando ese registro contra `supabase/migrations/`. Con versiones que no coinciden, habría concluido que **ninguna de las 66 estaba aplicada** y las habría corrido todas de nuevo sobre una base que ya las tenía. Enchufar el pipeline sin reparar esto primero era la receta para romper prod de un modo peor que el problema original.

**Fix aplicado** (aprobado por el dueño): reemplazar las 19 filas por las 66 versiones reales, derivadas de los nombres de archivo con la misma convención que `scripts/sync-supabase-migrations.mjs` (`20260424` + secuencia de 6 dígitos). **Ninguna migración se ejecutó** — solo se escribió el registro.

Salvaguardas: respaldo previo en `supabase_migrations.schema_migrations_backup_20260726` (19 filas), y huella del schema antes/después.

| Métrica | Antes | Después |
|---|---|---|
| Tablas | 34 | 34 |
| Columnas | 437 | 437 |
| Policies | 97 | 97 |
| Índices | 150 | 150 |
| Constraints | 211 | 211 |
| Valores de enum | 180 | 180 |
| Funciones | 226 | 226 |

**Verificación final** (lo que vería `db push` hoy): 66 en prod / 66 en repo / **0 pendientes** / **0 huérfanas**.

## D7-H2 🟡: el espejo de la 061 seguía faltando en `main`

66 archivos en `src/shared/db/migrations/`, 65 en `supabase/migrations/`. La 061 (índices de reconciliación) nunca tuvo espejo.

No es cosmético: **`db push` solo mira el espejo**, así que una migración sin espejo no llega a producción aunque el pipeline funcione. Y `supabase db reset` deja el schema local divergiendo de prod sin avisar.

Fix: espejo creado + **candado automático** (ver T3).

## D7-H3 🟢: el runner de CI soporta `CONCURRENTLY`

`ci.yml:118-121` aplica cada archivo con `psql -f` **sin** `--single-transaction` → autocommit → `CREATE INDEX CONCURRENTLY` funciona. Preocupación del plan original, descartada con evidencia. Queda documentada la restricción real: falla si la migración trae un `BEGIN;` explícito.

## Cambios aplicados

### T1 — Reparación del registro de prod
Ver D7-H1. Sin cambios de código.

### T2 — `.github/workflows/db-migrate.yml` (nuevo)
Se dispara al mergear a `main` **solo si cambió algo en `supabase/migrations/`**. Pasos: verificar secrets → link al proyecto → `db push --dry-run` (deja en el log qué va a aplicar **antes** de tocar nada) → push real → verificar que no quede pendiente.

Salvaguardas: `concurrency` (dos merges seguidos no pushean en paralelo), `environment: production` (si el repo define ese Environment con reviewers, GitHub pide aprobación humana), `workflow_dispatch` como escotilla manual, y fallo explícito si falta un secret en vez de morir a mitad.

**Requiere 3 secrets** (acción del dueño): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`.

### T3 — `tests/unit/migrations-mirror-sync.test.ts` (nuevo, 4 casos)
Falla en CI si los árboles se separan: espejo faltante, espejo huérfano, nombre fuera de convención, contenido divergente, hueco o duplicado en la numeración.

**Control positivo ejecutado**: se removió el espejo de la 061 y el test falló nombrando el archivo exacto y cómo arreglarlo; restaurado, vuelve a verde. Un test que no puede fallar no prueba nada.

### T4 — `docs/operations/MIGRATIONS.md` (reescrito)
El doc anterior (B11, 2026-05-25) describía 13 migraciones (hoy 66), daba por "rechazado" un script de sync que existe y se usa, y listaba una divergencia (`009`) resuelta hace meses.

La versión nueva documenta: los dos árboles y el candado, el flujo de deploy a prod con sus secrets, **la carrera conocida con Vercel** y por qué expand & contract es la mitigación (no un nice-to-have), `CONCURRENTLY` con sus dos requisitos y cómo limpiar un índice `INVALID`, la tabla expand & contract con qué es seguro sin ella, los 4 gotchas que ya mordieron (proconfig, 55P04, leakproof/RLS, initplan), el paso a paso para agregar una migración, y qué hacer si el deploy falla.

## Verificación (gate)

| Check | Resultado |
|---|---|
| `pnpm test` (unit) | ✅ **2232/2232** (2228 de referencia + 4 del candado) |
| `pnpm typecheck` | ✅ 0 errores |
| `pnpm lint` | ✅ 0 errores (35 warnings pre-existentes) |
| Control positivo del candado | ✅ falla sin el espejo, verde con él |
| YAML del workflow | ✅ claves requeridas presentes, sin tabs |
| Schema de prod antes/después de la reparación | ✅ idéntico en las 7 métricas |
| Estado que vería `db push` | ✅ 0 pendientes / 0 huérfanas |

## Gaps remanentes

1. ~~3 secrets sin cargar~~ **CERRADO 2026-07-27**: los 3 cargados y el pipeline **probado end-to-end** contra prod ([run 30283704750](https://github.com/Laza223/turno-gol-repo/actions/runs/30283704750), 16:13 UTC): link + dry-run + push + verificación, todo verde, `Remote database is up to date`, schema intacto (34 tablas / 97 policies / 150 índices, 66 migraciones registradas). El 1er intento falló con `28P01 password authentication failed for user "postgres"` — el secret `SUPABASE_DB_PASSWORD` no matcheaba la contraseña real; recargado, verde al reintento. Nota: `postgres` ya no lo usa nadie más que este pipeline (ver D5-H1), así que rotar esa contraseña dejó de ser riesgoso.
2. **La carrera con Vercel no se elimina, se mitiga.** Secuenciar migración→deploy exigiría mover el deploy adentro de Actions; se difiere por costo/beneficio al volumen actual. La mitigación es expand & contract, ahora documentado y obligatorio.
3. **`CONCURRENTLY` no se retrofitea** a las migraciones existentes: las tablas de prod están vacías, un `CREATE INDEX` común es instantáneo. La regla aplica desde el primer complejo con datos reales.
4. **La tabla de respaldo `schema_migrations_backup_20260726` queda en prod.** Borrarla cuando el pipeline tenga un par de corridas verdes.
