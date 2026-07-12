# Setup local: los dos `ALTER ROLE` que las migraciones no hacen

Si en tu máquina `pnpm build` o `pnpm test:e2e` fallan con esto:

```
password authentication failed for user "turnogol_app"
password authentication failed for user "turnogol_worker"
```

**no es la contraseña.** Los roles existen pero tienen `LOGIN = false`, y Postgres reporta un rol
NOLOGIN con exactamente el mismo mensaje que una contraseña incorrecta. El mensaje miente.

Verificalo:

```sql
select rolname, rolcanlogin from pg_roles where rolname like 'turnogol%';
--  turnogol_app    | f     ← no puede loguearse
--  turnogol_worker | f     ← tampoco
```

## Por qué pasa

Es **por diseño**. `src/shared/db/migrations/037_turnogol_app_grants.sql` y
`038_turnogol_worker_role.sql` lo dicen explícitamente:

> `ALTER ROLE turnogol_app WITH LOGIN PASSWORD '...'` se hace **A MANO fuera de las migraciones**
> (nunca una contraseña en un archivo versionado).

Las migraciones crean los roles como `NOLOGIN` y les dan los GRANT. El `LOGIN` + `PASSWORD` es un paso
de setup manual que hay que hacer una vez por entorno — y que es fácil que nadie haya hecho nunca en
una máquina nueva.

## Por qué no te enterás enseguida

Los **tests de integración funcionan igual**, así que la suite verde te da una falsa tranquilidad:
`tests/helpers/tenant.ts → ensureRoles()` se conecta como `postgres` (superusuario) y hace
`SET LOCAL ROLE turnogol_app` para ejercitar RLS. **Nunca hace login como el rol.**

La **app**, en cambio, sí:

- `getDb()` → pool con RLS, DSN `DATABASE_URL` → rol `turnogol_app`
- `getWorkerDb()` → pool BYPASSRLS, DSN `WORKER_DATABASE_URL` → rol `turnogol_worker` (pg-boss)

Resultado: `/api/status` devuelve **503** (`database: down`), el dev server escupe cientos de
`PostgresError` por corrida, `next build` revienta al prerenderizar `/sitemap.xml`, y Playwright ni
siquiera arranca porque su `webServer` espera un `/api/status` que nunca da 200.

## El fix

Una vez por entorno, con la contraseña que ya tenés en `.env.local`:

```bash
# Leé las passwords de DATABASE_URL y WORKER_DATABASE_URL en .env.local y corré:
docker exec -i supabase_db_TurnoGol psql -U postgres -d postgres <<SQL
ALTER ROLE turnogol_app    WITH LOGIN PASSWORD '<password de DATABASE_URL>';
ALTER ROLE turnogol_worker WITH LOGIN PASSWORD '<password de WORKER_DATABASE_URL>';
SQL
```

Verificá:

```bash
curl -s localhost:3000/api/status   # debe dar 200 con database: ok y pg-boss: ok
```

Para revertir: `ALTER ROLE turnogol_app NOLOGIN;` (idem worker).

> **Ojo**: `supabase db reset` recrea la DB desde las migraciones, así que los roles vuelven a quedar
> `NOLOGIN`. Hay que repetir el `ALTER ROLE` después de cada reset.
