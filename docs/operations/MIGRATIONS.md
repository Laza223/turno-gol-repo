# Migraciones — convención y deploy (TurnoGol)

> Reescrito **2026-07-26** en la fase **D7** de la auditoría de datos. La versión
> anterior (B11, 2026-05-25) describía un mundo que ya no existe: hablaba de 13
> migraciones, daba por "rechazado" un script de sincronización que hoy existe y
> se usa, y listaba una divergencia (`009`) resuelta hace meses.
>
> Acompaña a `doc13_database_schema.md` y `doc19_runbook.md` §11.

## Los dos árboles

| Árbol | Lo consume | Nombre |
|---|---|---|
| `src/shared/db/migrations/` | **Fuente de verdad.** CI (`ci.yml`) lo aplica con `psql` a su Postgres efímero | `NNN_nombre.sql` |
| `supabase/migrations/` | Espejo. `supabase db reset` (schema local) y **`supabase db push` (deploy a producción)** | `20260424<NNN 6 dígitos>_nombre.sql` |

Existen dos porque CI no instala el CLI de Supabase (peso de imagen, arranque en frío) y el CLI no entiende el formato numérico. **Contienen el mismo SQL**, solo cambia el nombre del archivo.

`pnpm db:sync-supabase` (`scripts/sync-supabase-migrations.mjs`) regenera el espejo entero desde la fuente. Está deny-listeado en `.claude/settings.json`, así que un agente copia el archivo a mano.

### El candado

`tests/unit/migrations-mirror-sync.test.ts` falla en CI si los árboles se separan: espejo faltante, espejo huérfano, nombre fuera de convención, contenido distinto, o hueco/duplicado en la numeración.

Existe porque la migración **061 estuvo sin espejo y nadie lo notó**. No es cosmético: `db push` solo mira el espejo, así que **una migración sin espejo NO llega a producción**.

## Cómo llega una migración a producción

```
PR con migración → CI verde → merge a main
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
          Vercel deploya el código      db-migrate.yml aplica
          (integración Git)             la migración a prod
```

`.github/workflows/db-migrate.yml` se dispara al mergear a `main` **si cambió algo en `supabase/migrations/`**. Corre `supabase db push --dry-run` (deja en el log qué va a aplicar), después el push real, y verifica al final que no quede nada pendiente.

**Antes de D7 este paso no existía**: CI migraba solo su Postgres efímero y Vercel deployaba el código igual. El resultado —código nuevo contra schema viejo— pasó tres veces: 048–051 (caja rota ~10 h en prod), 059/061, y 060–066.

### Secrets que necesita (Settings → Secrets and variables → Actions)

| Secret | De dónde sale |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Dashboard de Supabase → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | La contraseña de la base del proyecto |
| `SUPABASE_PROJECT_ID` | El *project ref* (lo ves en la URL del dashboard) |

Sin ellos el workflow falla en el primer paso con un mensaje explícito, no a mitad de camino.

### ⚠️ La carrera con Vercel

Vercel deploya por integración Git, no desde el workflow, así que **el código nuevo puede quedar arriba unos segundos antes de que la migración termine**. Secuenciarlos exigiría mover el deploy adentro de Actions (cambio grande, sin beneficio proporcional al volumen actual).

La forma correcta de convivir con esa ventana es que las migraciones sean **compatibles hacia atrás** — ver *expand & contract* abajo. Con eso, el peor caso de la ventana es una feature que todavía no funciona; sin eso, es un 500.

## Índices sobre tablas con datos: `CONCURRENTLY`

Un `CREATE INDEX` normal **bloquea las escrituras** de la tabla mientras se construye. Sobre `bookings` o `cash_flows` con datos reales, eso es la app congelada.

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_algo ON tabla(col);
```

Dos requisitos:

1. **No puede correr dentro de una transacción.** El runner de CI usa `psql -f` sin `--single-transaction` (autocommit), así que funciona. **Si la migración tiene un `BEGIN;` explícito, `CONCURRENTLY` adentro falla.**
2. **Va solo en su propio archivo**, sin otros statements que necesiten atomicidad.

Si falla a mitad, deja un índice `INVALID` que hay que dropear a mano antes de reintentar:

```sql
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
```

**Hoy las tablas de prod están vacías**, así que un `CREATE INDEX` común es instantáneo — por eso las migraciones 053 y 061 no lo usan. La regla arranca a aplicar **desde el primer complejo con datos reales**.

## Cambios de columna en caliente: expand & contract

Renombrar o borrar una columna que el código en producción todavía usa **rompe la app en la ventana de deploy**. Se hace en dos releases:

| Fase | Release | Qué se hace |
|---|---|---|
| **Expand** | 1 | Agregar lo nuevo (columna/tabla), sin tocar lo viejo |
| **Dual-write** | 1 | El código escribe en ambos lados y lee del viejo |
| **Backfill** | 1 | Copiar los datos históricos a lo nuevo |
| **Switch** | 2 | El código lee de lo nuevo |
| **Contract** | 2 (o 3) | Recién ahí, dropear lo viejo |

Ejemplo: renombrar `bookings.notas` a `bookings.observaciones` **no** es `ALTER TABLE ... RENAME COLUMN`. Es: agregar `observaciones` → escribir en las dos → backfill → cambiar las lecturas → dropear `notas` en la release siguiente.

**Es seguro sin expand & contract** (aditivo, el código viejo lo ignora): agregar tabla, agregar columna nullable, agregar índice, agregar valor de enum, agregar constraint que los datos actuales ya cumplen.

**Necesita expand & contract**: renombrar o dropear columna/tabla, cambiar tipo, agregar `NOT NULL` sin default, achicar un `CHECK`.

## Idempotencia

Sigue siendo obligatoria: local se re-aplica sobre bases existentes y una migración que falla a mitad tiene que poder reintentarse.

| Operación | Forma idempotente |
|---|---|
| Crear tabla | `CREATE TABLE IF NOT EXISTS …` |
| Agregar columna | `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` |
| Crear índice | `CREATE INDEX IF NOT EXISTS …` |
| Crear extensión | `CREATE EXTENSION IF NOT EXISTS …` |
| Función | `CREATE OR REPLACE FUNCTION …` ⚠️ ver gotcha abajo |
| Trigger | `DROP TRIGGER IF EXISTS …; CREATE TRIGGER …` |
| Valor de enum | `ALTER TYPE … ADD VALUE IF NOT EXISTS …` |
| Constraint | `ALTER TABLE … DROP CONSTRAINT IF EXISTS …; ALTER TABLE … ADD …` |
| Policy RLS | `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE …) THEN CREATE POLICY … END IF; END $$;` |

### Gotchas que ya mordieron

- **`CREATE OR REPLACE FUNCTION` resetea `proconfig`.** Borra el `SET search_path` que puso un `ALTER FUNCTION` anterior. Hay que re-declararlo **en la definición**, o se deshace el hardening de la migr. 056 en silencio (la 060 lo contempla).
- **Un valor de enum recién agregado no se puede usar como literal en la misma transacción** (`55P04`). Comparar por `::text` (precedente: migrs. 025, 050, 066).
- **Índices de expresión con funciones no-`LEAKPROOF` son inusables bajo RLS.** `timezone()` y `lower()` no bajan como `Index Cond` debajo de una policy → Seq Scan silencioso. La migr. 054 dropeó dos índices así, y la 063 movió un `lower()` a columna generada. El drift test lo verifica.
- **Policies RLS: envolver `current_setting()` en `(SELECT …)`.** Desnudo se re-evalúa por fila; envuelto, una vez por query (migr. 052).

## Agregar una migración

```bash
# 1. Siguiente número (sin huecos ni duplicados: el test los caza)
ls src/shared/db/migrations/ | tail -1

# 2. Escribir la canónica
$EDITOR src/shared/db/migrations/067_mi_cambio.sql

# 3. Generar el espejo
pnpm db:sync-supabase
#    (o copiar a mano: supabase/migrations/20260424000067_mi_cambio.sql)

# 4. Probar contra una base limpia
pnpm supabase:reset

# 5. Probar idempotencia: aplicarla dos veces seguidas, tiene que pasar las dos
docker exec -i -e PGPASSWORD=postgres supabase_db_TurnoGol \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  -f - < src/shared/db/migrations/067_mi_cambio.sql

# 6. Gate
pnpm test:isolation && pnpm test:integration && pnpm typecheck && pnpm lint
```

Al mergear, `db-migrate.yml` la aplica a producción solo.

## Si el deploy de una migración falla

1. El workflow queda **rojo** y GitHub notifica. La base queda con el schema viejo (estado seguro, no uno a medias).
2. Mirar el log del paso *dry run*: dice exactamente qué intentó aplicar.
3. Arreglar la migración en un PR nuevo (**nunca editar una ya mergeada** — el registro la da por aplicada y no la vuelve a correr).
4. Re-disparar con *Run workflow* (`workflow_dispatch`) o esperar al próximo merge que toque migraciones.

Para inspeccionar el estado real de producción:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
```

Debe coincidir con los últimos archivos de `supabase/migrations/`.

## Nota histórica: la reparación del registro (2026-07-26)

Hasta D7, `supabase_migrations.schema_migrations` en producción tenía **19 filas con la fecha de cuándo se aplicó cada migración a mano** (`20260723…`, `20260726…`), no con la versión de los archivos (`20260424…`). Las primeras 47 nunca se registraron.

Consecuencia: un `supabase db push` habría concluido que **ninguna** de las 66 estaba aplicada y las habría corrido todas de nuevo sobre una base que ya las tenía.

La reparación reemplazó esas 19 filas por las 66 versiones reales, **sin ejecutar ninguna migración**, con respaldo previo en `supabase_migrations.schema_migrations_backup_20260726` y verificación de que el schema quedara idéntico (34 tablas / 437 columnas / 97 policies / 150 índices / 211 constraints / 180 valores de enum / 226 funciones, antes y después).
