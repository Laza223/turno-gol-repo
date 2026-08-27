# El canal a la base valida la cadena, con la CA embebida en el código

**Fecha**: 2026-08-27
**Estado**: aplicado
**Cierra**: la mitad que faltaba de C-2 en `docs/audit/2026-08-25-auditoria-infra.md` (ver §22.1)
**Toca**: `src/shared/db/ssl.ts`, `src/shared/db/supabase-ca.ts`, `scripts/probe-db-tls.ts`

## Lo que pasaba

`dbSslOptions()` devolvía `{ rejectUnauthorized: false }` para todo host
remoto. Eso **cifra el canal pero no comprueba contra quién**: quien pueda
desviar el tráfico hacia el pooler presenta su propio certificado y lee todo,
credenciales de Postgres incluidas. No es un pool: la función la comparten los
tres (app, worker y pg-boss) en los dos runtimes (Vercel y Railway).

Estaba anotado como pendiente en el propio archivo desde el 2026-08-26. Lo que
lo trababa no era el trabajo sino una premisa sin confirmar: **nadie había
verificado que el certificado del pooler (Supavisor) validara con la CA raíz
que Supabase publica**, que está documentada para conexión directa a Postgres
—y la conexión directa a esta base ya no existe—.

## Lo que se midió antes de decidir

La premisa era medible y se midió. Cadena que presenta el pooler:

```
depth=0 CN=*.pooler.supabase.com
depth=1 CN=Supabase Intermediate 2021 CA
depth=2 CN=Supabase Root 2021 CA
```

Con esa raíz como CA de confianza, y con verificación de hostname activada:
`Verify return code: 0 (ok)`.

Y la raíz **no** se tomó del handshake (sería circular): se bajó del sitio
oficial de Supabase y se comparó. Huellas SHA-256 idénticas.

Después, la prueba en el cable contra el pooler de **producción**, con las dos
librerías (`postgres`/porsager y `pg`/node-postgres, que tienen semánticas de
TLS distintas y por eso ya rompieron producción dos veces) y los dos puertos.
Sin credenciales: la autenticación pasa DESPUÉS del handshake, así que una
contraseña deliberadamente inválida separa "falló el TLS" de "falló el login".

| config | resultado (idéntico en las dos librerías) |
|---|---|
| CON la CA | `28P01 password auth failed` → **validó** |
| sin validar (lo viejo) | `28P01` → conecta sin validar |
| **SIN la CA (control −)** | `self-signed certificate in certificate chain` |

La tercera fila es la que le da valor a las otras dos: prueba que la sonda
**sabe** detectar un TLS que no valida, así que el verde de la primera no es un
falso positivo. Reproducible con `pnpm tsx scripts/probe-db-tls.ts`.

## Las alternativas que se descartaron, y por qué

### Dónde vive la CA

| Opción | Por qué NO |
|---|---|
| Archivo `.crt` en el repo, leído con `readFileSync` | En Railway entraría solo (`COPY . .`), pero en Vercel depende del *file tracing* de Next, que decide qué archivos viajan a la función. El modo de falla de que no lo incluya es que **la app no conecta a la base**. No vale la pena depender de eso |
| Variable de entorno con el PEM | Habría que mantener la misma variable sincronizada a mano en dos paneles (Vercel y Railway), y desincronizarlas tira abajo un runtime y el otro no |
| **Constante de TypeScript** ✅ | Un string en el grafo de módulos lo bundlean los dos runtimes **por definición**. Sin tracing, sin paneles, sin sincronizar nada |

No es un secreto: es la mitad pública del par de claves, la misma que recibe
cualquiera que abra una conexión contra el pooler.

### Qué se confía

| Opción | Por qué NO |
|---|---|
| CA de Supabase **+** las del sistema (`tls.rootCertificates`) | Es más tolerante —un host remoto que no sea Supabase seguiría validando— pero exige importar `node:tls` en `ssl.ts`. **Este repo se rompió dos veces el mismo día** por meter una API de Node en un archivo que después alguien arrastró al runtime edge (ver `docs/audit/...` §19 y §21). El beneficio es hipotético; el riesgo ya se materializó dos veces |
| Override por variable de entorno (`DATABASE_CA_CERT`) | Reintroduce exactamente lo que `ssl.ts` había eliminado: una decisión de TLS editable desde un panel. Todo el archivo existe porque el `?sslmode=` del DSN causó dos incidentes |
| **Solo la CA de Supabase** ✅ | Contra un host remoto que no sea Supabase falla al conectar. Hoy no existe ninguno (CI y dev van a `127.0.0.1`, que ni negocia TLS) y si aparece, **falla fuerte y a la vista** en vez de conectarse sin validar |

## Lo que falla en silencio — y lo que no

**No falla en silencio**: si la CA deja de servir, se caen los tres pools a la
vez y con un mensaje explícito (`self-signed certificate in certificate
chain`). Es peor que un pool solo, pero es ruidoso — a diferencia del estado
anterior, donde el sistema andaba perfecto sin validar nada y nadie se enteraba.

**Sí puede fallar en silencio la constante**: si alguien edita el PEM y se come
un salto de línea o corta una línea de base64, el string sigue siendo un string.
Por eso el test la valida como **certificado X.509 de verdad** (`node:crypto`):
subject, huella SHA-256 exacta, `ca: true`, y que no esté vencida. Salta ahí y
no en producción.

**La fecha que importa**: la raíz vence el **2031-04-26**. Cuando Supabase la
rote hay que actualizar la constante; el síntoma es el error de arriba en todos
lados a la vez. `scripts/probe-db-tls.ts` reproduce la medición sin credenciales.

## Efecto colateral: un comentario que era una trampa

`Dockerfile.worker` decía que `DATABASE_URL` debía ser la conexión **directa**
a Postgres (`:5432`) y llevar `?sslmode=require`. Las dos cosas son falsas hoy,
y **la segunda es exactamente la que volteó el worker el 2026-08-25**: hacía
que `pg` validara la cadena sin tener la CA. `railway.toml` ya se había
corregido; el Dockerfile no. Reescrito con el porqué.
