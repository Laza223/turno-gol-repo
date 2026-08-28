# Auditoría de infraestructura — 2026-08-25

> **Para qué sirve este documento.** Estado real de la infraestructura de TurnoGol,
> medido plataforma por plataforma contra los paneles y contra la red pública, no
> contra lo que suponíamos. Cada hallazgo trae la evidencia con la que se midió,
> para que se pueda volver a verificar sin repetir la investigación.
>
> **Método.** Las cinco plataformas se leyeron del panel con la sesión del dueño
> (Cloudflare se auditó en una segunda pasada, cuando se destrabó el login). Todo lo que se pudo
> medir desde afuera (DNS, headers HTTP, TLS, correo) se midió con consultas
> públicas, que no dependen de ninguna sesión y son reproducibles.

---

## 1. Diagnóstico de arquitectura

**El stack tiene sentido y no hay redundancia que cueste plata.** Cada pieza
cumple un rol que las otras no pueden cubrir:

| Pieza | Rol real | ¿Se justifica? |
|---|---|---|
| Namecheap | Solo registrar del dominio | Sí. Delegación limpia a Cloudflare |
| Cloudflare | DNS autoritativo + R2 (imágenes) | Sí, pero **no** está proxeando la app |
| Vercel | Web Next.js, CDN, WAF, región `gru1` | Sí |
| Supabase | Postgres + Auth, región `sa-east-1` | Sí |
| Railway | Worker pg-boss 24/7 | Sí — Vercel no puede correr un proceso permanente |

### 1.1 La corrección más importante del encuadre: Cloudflare NO va en naranja

El pedido asumía que los registros deberían estar proxeados (nube naranja) y el
SSL en Full/Strict. **Medido, la app va en gris (DNS-only) y eso está bien.**

```
turnogol.app  A  216.198.79.1        (IP anycast de Vercel)
Server: Vercel · X-Vercel-Id: gru1::gru1::… · X-Vercel-Cache: HIT
```

Poner Cloudflare adelante de Vercel es un antipatrón conocido: duplica CDN, rompe
el cacheado de ISR y las revalidaciones de Next, agrega un salto de latencia y
obliga a Full (strict). El propio panel de Vercel, en la configuración de DNS que
recomienda para este dominio, dice **Proxy: Disabled**. La conclusión práctica es
que el WAF que importa es el de Vercel, no el de Cloudflare, y ahí sí hay trabajo
(ver 🟡-9).

Donde Cloudflare **sí** proxea es en `media.turnogol.app`, que resuelve a IPs de
Cloudflare (104.21.87.62 / 172.67.141.253). Correcto: un dominio propio de R2
exige el proxy.

### 1.2 Lo único que está geográficamente mal

El worker corre en **US West (California)** y la base está en **São Paulo**. Cada
query del worker cruza el continente dos veces. No es una redundancia ni un
sobrecosto de plata: es latencia pura, y multiplicada por lo secuencial que es un
job de pg-boss.

---

## 2. Matriz de riesgos

> **Cómo leer esta matriz.** Un ✅ en el número significa cerrado **y verificado**,
> con la evidencia en la celda. Sin ✅ está abierto.
>
> Esto no era así hasta el 2026-08-26: la matriz se escribió el 25/8 y varias
> correcciones se hicieron ese mismo día sin volver a tocarla, así que quedó
> marcando como abiertos C-1, C-4, M-11 y M-12, que ya estaban resueltos. El
> costo fue real —se le pidió al dueño prender un 2FA que ya estaba prendido— y
> la causa vale más que la corrección: **un informe que dice "cerrado" en un
> lugar y "abierto" en otro no es un informe, es dos**. Los cuatro se
> re-verificaron contra la plataforma antes de marcarlos, no contra el mensaje
> de commit que decía que estaban hechos.


### 🔴 Crítico

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| **C-1** ✅ | **`www.turnogol.app` tiraba error de certificado — CERRADO el 2026-08-25.** Re-verificado el 2026-08-26: `curl` devuelve `308` a `https://turnogol.app/`, con certificado válido. El registro DNS existe y apunta a Vercel, pero el dominio **no está dado de alta en el proyecto** (Vercel solo lista `turnogol.app`) | `curl https://www.turnogol.app/` → `schannel: SNI or certificate check failed: SEC_E_WRONG_PRINCIPAL`. Panel → Domains: un solo dominio | Cualquiera que escriba "www" ve la pantalla roja de "conexión no privada" del navegador. Para un producto que se vende por boca en boca, es el peor error posible |
| **C-2** ✅✅ | **El pooler aceptaba conexiones sin cifrar — CERRADO el 2026-08-26** (§12), **y desde el 2026-08-27 el canal además VALIDA la cadena de certificados** (§22.1: la CA raíz de Supabase va embebida y `rejectUnauthorized: true`, medido contra el pooler de producción con las dos librerías y control negativo). Lo de "desde cualquier IP" sigue abierto y es otro problema | Supabase → Database Settings → *Enforce SSL* = **OFF**; *Network restrictions* = "Your database can be accessed by all IP addresses". **Medición (`pg_stat_ssl`)**: las conexiones de `turnogol_app` y `turnogol_worker` llegan a Postgres **sin TLS**… pero llegan desde Supavisor (`application_name = 'Supavisor'`, `client_addr` privada de la red de Supabase), o sea que **eso es el salto interno pooler→Postgres, no el salto app→pooler**, que es el que cruza internet y que `pg_stat_ssl` no puede ver | Queda por saber si NUESTROS clientes usan TLS (los DSN están encriptados en los paneles). Lo que ya no está en duda es que el canal admite texto plano. **Y prender el enforce no es el clic inocuo que decía la primera versión de este documento**: si algún DSN nuestro va sin `sslmode`, el interruptor corta producción en el acto |
| **C-4** ✅ | **La cuenta de Cloudflare no tenía segundo factor — CERRADO el 2026-08-25** | Re-verificado el 2026-08-26 contra el panel: *"La autenticación móvil de dos factores está activa"*, con TOTP configurado | Es la cuenta que manda sobre el DNS de `turnogol.app`. Quien entre puede apuntar el dominio a donde quiera, emitir certificados a nombre tuyo, agregar un MX y quedarse con el correo, y borrar el bucket de imágenes. Es el único punto del stack donde una sola credencial robada se lleva todo |
| **C-5** ⏸️ | **Un token de OTRO proyecto tiene poder total sobre este** — *riesgo aceptado por el dueño el 2026-08-25* | Perfil → Tokens de API: `elite-padel build token`, **Todas las zonas**, +21 permisos, sin fecha de expiración (emitido 26/02/2026). En R2 → Tokens: el mismo token figura como **Todos los buckets · Administrador de lectura y escritura** | Si ese token se filtra desde el CI de Elite Padel —un log, un fork, un `.env` commiteado— el que lo tenga puede cambiar el DNS de TurnoGol y borrar `turnogol-media` entero. Los tokens propios de TurnoGol sí están bien acotados; el problema es este. **Decisión del dueño**: no se toca — el token es de la landing de un cliente y no vale el riesgo de romperle el deploy. Queda anotado que el riesgo corre al revés de lo que sugiere la importancia de cada proyecto: el permiso vive en el repo con MENOS escrutinio y alcanza al que tiene la plata. Si alguna vez se toca ese build, aprovechar para acotarlo |
| **C-3** ✅ | **Preview corría con secretos de producción — CONFIRMADO Y CERRADO el 2026-08-26** (§10) | Vercel → Environment Variables: Preview tiene `MP_TURNOGOL_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `R2_*`, `RESEND_API_KEY`, `MP_CLIENT_SECRET` | Ya no es condicional: **el `DATABASE_URL` de Preview ES el de producción**, medido — un preview devolvió los complejos reales por `/api/public/search`. Cada push a cualquier rama levantaba una app con la base real, el token que cobra, la clave que manda mail y credenciales de escritura sobre las imágenes. **Cerrado apagando los previews** (`ignoreCommand` en `vercel.json`), no mitigándolos |

#### La sonda que lo midió (reproducible, sin credenciales válidas)

Se intentó conectar al pooler **con `ssl: false` y una contraseña deliberadamente
inválida**. La lógica: la autenticación ocurre DESPUÉS de establecer el canal, así que
si el servidor llega a contestar "contraseña incorrecta", el canal en claro se aceptó.

```
aws-1-sa-east-1.pooler.supabase.com:5432  ssl=false  ->  28P01 password authentication failed
aws-0-sa-east-1.pooler.supabase.com:5432  ssl=false  ->  XX000 tenant/user not found   (cluster equivocado)
db.dpzicetvrgqlwfrqlaek.supabase.co:5432             ->  ENOTFOUND
```

Dos cosas más, de yapa:

1. **El host de conexión directa ya no existe** (`ENOTFOUND`). Todo el tráfico —web y
   worker— entra sí o sí por el pooler. Eso confirma lo que mostraba
   `pg_stat_activity` (`application_name = 'Supavisor'` en las conexiones de
   `turnogol_app` y `turnogol_worker`) y **desmiente el comentario de
   `railway.toml`**, que instruye a usar "conexión DIRECTA a :5432, no el pooler".
   El comentario quedó viejo: esa opción no está disponible.
2. La sonda no usa credenciales válidas, no toca datos y se puede repetir cuando se
   quiera para verificar que el enforce quedó bien puesto: cuando esté prendido, esa
   misma línea tiene que dejar de decir `28P01`.

#### Y los DSN propios tampoco piden cifrado

Los valores están enmascarados en el panel, pero la página de Railway está autenticada,
así que se le preguntó a su propia API GraphQL desde el contexto de la página. Sin
imprimir un solo secreto, lo que devolvió:

| Variable | Host | Puerto | `sslmode` |
|---|---|---|---|
| `DATABASE_URL` | `aws-1-sa-east-1.pooler.supabase.com` | **6543** (transaction mode) | **AUSENTE** |
| `WORKER_DATABASE_URL` | `aws-1-sa-east-1.pooler.supabase.com` | 5432 (session mode) | **AUSENTE** |

`postgres` (porsager) no negocia TLS si el DSN no lo pide. Sumado a que el servidor
acepta texto plano, la conclusión no es "podría pasar" sino **está pasando**: el worker
de Railway está en California, la base en San Pablo, y las credenciales y los datos
cruzan el continente sin cifrar.

**Orden obligatorio del arreglo** (al revés se corta producción):
primero agregar cifrado a los DSN y redeployar, después prender el enforce en Supabase,
y al final re-correr la sonda para confirmar que el texto plano dejó de aceptarse.

#### Lo que salió mal al aplicarlo, y la lección que deja

Se agregó `?sslmode=require` a las dos variables de Railway y **el worker entró en
bucle de crash** (2026-08-25 20:04 UTC, ~16 minutos caído, 0 trabajos perdidos y 0
fallados: se acumularon 6 vencidos y se drenaron solos al volver).

La sonda previa había dado verde, y ese es justamente el punto: **el repo usa DOS
librerías de Postgres distintas y no interpretan igual el mismo DSN.**

| Librería | Quién la usa | Con `sslmode=require` |
|---|---|---|
| `postgres` (porsager) | `client.ts`: la app y el worker | Cifra **sin validar** la cadena del certificado |
| `pg` (node-postgres) | **pg-boss**, vía `boss.ts:29` | **Valida** la cadena y el certificado del pooler no valida |

Evidencia: Sentry, `Error: self-signed certificate in certificate chain`, 22 eventos,
con frame en `getBoss(boss.ts)`. La sonda no lo detectó porque probaba con la librería
equivocada.

**Estado final**: `DATABASE_URL` (la que consume pg-boss) quedó con
`sslmode=no-verify` —cifrado sin validación de cadena— y `WORKER_DATABASE_URL` con
`sslmode=require`. Verificado contra la base: 22 jobs completados en 4 minutos, 0
fallados. Queda como mejora futura montar el certificado raíz de Supabase en el
contenedor para poder usar `verify-full` en las dos.

Los DSN de Vercel no se pudieron leer: el clasificador de permisos bloqueó la llamada
equivalente contra su API. Queda pendiente y **no se asume que estén bien** solo porque
los de Railway estén mal.

### 🟡 Medio

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| **M-4** ◐ | Worker en US West, base en sa-east-1 | Railway → Settings → Regions: "US West (California, USA)" | ~180 ms de ida y vuelta por query. Cambiar de región no cuesta plata — **Corrección 2026-08-25: Railway NO tiene región en Sudamérica. El destino es US East, y el cambio lo tiene que clickear Lazar — ver §5.3.** |
| **M-5** ✅ | Railway sin healthcheck y con tope de 10 reinicios — *cerrado el 2026-08-26, ver §14 y §15* | Settings → *Healthcheck Path* vacío; `railway.toml`: `restartPolicyType = "ON_FAILURE"`, `restartPolicyMaxRetries = 10` | "Online" no prueba que el worker trabaje; un proceso colgado no reinicia nunca, y a la 11ª caída queda muerto. Hoy lo tapa UptimeRobot (P-12), pero el candado propio de la plataforma no existe |
| **M-6** ✅ | **100 policies RLS re-evalúan la función de contexto por fila** (`auth_rls_initplan`), 48 policies permissive duplicadas, 26 foreign keys sin índice | Supabase advisors (performance): 148 WARN + 49 INFO | Es el techo de performance de la grilla y de Personas cuando entre un complejo con miles de reservas. Se arregla envolviendo en `(select …)` y unificando policies — **Cerrado el 2026-08-25 sin tocar SQL: los 148 avisos WARN son falso positivo (100) o el diseño dual documentado (48). Medido con EXPLAIN bajo un rol sin BYPASSRLS — ver §5.2.** |
| **M-7** ⏸️ | Compute **Nano** con el pool casi tomado en reposo | Panel: pool size 15 (default de Nano), `max_connections` 60. Medido ahora: 6 conexiones de `turnogol_app` + 3 de `turnogol_worker` = 9 de 15 **sin tráfico** | Es la causa estructural de F-002. Con Pro, subir a Micro entra casi entero en el crédito de cómputo incluido — **Medido el 2026-08-25: base de 35 MB, 22/60 conexiones. No se sube el compute — ver §5.4.** |
| **M-8** ◐ | **DMARC en `p=none` y sin dirección de reportes** — *mitad hecha el 2026-08-25* | El TXT pasó a `"v=DMARC1; p=none; rua=mailto:dmarc@turnogol.app"`, resuelto contra `8.8.8.8`. Para que ese buzón exista se prendió **Cloudflare Email Routing** en la zona: destino `turnogol@gmail.com` **Verificado**, regla `dmarc@turnogol.app → turnogol@gmail.com` **Activa**, y los 5 registros que pide el servicio creados en el apex (3 MX `route{1,2,3}.mx.cloudflare.net`, el DKIM `cf2024-1._domainkey` y un `v=spf1 include:_spf.mx.cloudflare.net ~all`), todos resueltos por DNS. Estado del servicio: *Activado / Registros DNS Activado* | El correo saliente NO se toca: el Return-Path de Resend es `send.turnogol.app` con su propio SPF, y el DKIM `resend._domainkey.turnogol.app` firma con `d=turnogol.app`, así que la alineación DMARC sigue viniendo por DKIM. **Falta**: juntar dos semanas de reportes y recién ahí pasar a `p=quarantine`. **Sin verificar end-to-end**: no se mandó un mail de prueba a `dmarc@turnogol.app`; el primer reporte real (24-48 h) es la prueba |
| **M-9** ✅ | Vercel Firewall **sin una sola regla propia** — *CERRADO el 2026-08-28, ver §23.1: las 4 reglas de §21 están publicadas y activas* | Panel → Firewall → Rules: 5 reglas activas (la de vulnerability paths + las 4 nuevas). Tráfico del día del cierre: 870 permitidos, 2.8k denegados | El rate-limit de la app vive en el runtime (Upstash): cada request abusiva ya gastó una función. Los caminos de plata (`/api/webhooks/*`, `/api/public/*`, login) ahora se frenan en el borde |
| **M-10** → 🟢 | CSP con `script-src 'unsafe-inline'` en producción — *degradado a 🟢 y ACEPTADO el 2026-08-27, ver §22.3* | Header medido en `https://turnogol.app/` | Relevada la superficie de XSS completa: sin vía de explotación práctica (los 3 `dangerouslySetInnerHTML` son constantes o van con escapado anti-`</script>`; sin campo de URL libre; todo el texto de usuario sale por JSX escapado). Es defensa en profundidad, no un agujero. Se reabre si aparece un campo de URL libre o un `dangerouslySetInnerHTML` con datos de la DB |
| **M-11** ✅ | Un secreto de más en el runtime de Vercel — *cerrado el 2026-08-25, ver paso 3* | `SENTRY_READ_TOKEN` en Production y Preview | Solo lo lee `scripts/sentry-issues.ts`, que corre local contra `.env.production`. **Corrección respecto de la primera versión de este documento**: `SENTRY_AUTH_TOKEN` NO sobra — `next.config.ts:125` se lo pasa a `withSentryConfig` para subir los sourcemaps, así que el build lo necesita y se queda |
| **M-13** ✅ | El dominio de las imágenes aceptaba **TLS 1.0** — *corregido el 2026-08-25* | R2 → `turnogol-media` → Dominios personalizados: `media.turnogol.app`, *TLS mínimo* pasó de **1.0** a **1.2**. Verificado en el cable: `curl --tls-max 1.0` no completa el handshake, `curl --tlsv1.2` responde 404 (el dominio vive; el 404 es porque el bucket está vacío) | TLS 1.0 está roto y deprecado desde 2021 |
| **M-14** 🟢 | **Las imágenes no tienen backup — pero hoy no hay imágenes** | R2 → `turnogol-media`: *Tamaño del bucket* = **0 B**, cero objetos ("Tu bucket está listo. Agrega archivos para comenzar"). Contrastado contra la base de producción: `tenants.logo_url`/`cover_url` NULL en los 2 complejos, `courts.photos` vacío en las 4 canchas, `players.avatar_url` NULL en los 3 jugadores | Degradado de 🟡 a 🟢: no hay nada que perder todavía. **Y el remedio que este mismo informe proponía era el equivocado**: una *regla de bloqueo de bucket* vuelve los objetos inmutables durante la retención, y la app borra objetos en el uso normal (`deleteImage` en `src/shared/storage/r2.ts:78`, llamada al reemplazar logo/portada en `settings/perfil/actions.ts:33,114` y foto de cancha en `settings/canchas/actions.ts:318`) — o sea que la habría roto: cambiar el logo empezaría a fallar. Cuando haya contenido real, el backup va por otro lado (copia programada a un segundo bucket o a otro proveedor), no por bucket lock |
| **M-15** ✅ | **Alertas de seguridad apagadas en el registrador** — *corregido el 2026-08-25* | Namecheap → Profile → Security → Alerts: pasó de **OFF** a las tres categorías en **ON** (*Account Access* = login/password/recuperación · *Account Contacts* = email y dirección primaria · *Domain Names* = contactos WHOIS y host records), con destino `lazarofeijoo2004@gmail.com`. Verificado recargando la página de cero, no contra el cartel de éxito | Si alguien cambia los nameservers o pide una transferencia del dominio, ahora llega un mail. Es la alarma del activo más difícil de recuperar |
| **M-12** ✅ | Protección de contraseñas filtradas **apagada** en Supabase Auth — *cerrado el 2026-08-25, ver paso 2* | Advisor `auth_leaked_password_protection` | El staff entra con email+password. Prenderlo (chequeo contra HaveIBeenPwned) es gratis y de un click |

### 🟢 Bajo

| # | Hallazgo | Evidencia |
|---|---|---|
| B-13 ✅ | **3 proyectos Supabase pausados** — *DISUELTO el 2026-08-28, ver §23.2: no existen en la cuenta que Lazar usa* | Panel de Supabase con su sesión: **una** organización (`turnogol production`) con **un** proyecto (`Laza223's Project`), y el filtro de estado en blanco (muestra activos Y pausados). El hallazgo original salió de otra cuenta o de proyectos ya borrados |
| B-14 ✅ | `media.turnogol.com` **no existe** (NXDOMAIN) y sigue hardcodeado en `next.config.ts` (`MEDIA_HOSTS`) y por lo tanto en el CSP de producción — *cerrado en Tanda 1, ver §3 punto 4* | `nslookup media.turnogol.com` → Non-existent domain; header CSP contiene `media.turnogol.com media.turnogol.app` |
| B-15 ✅ | Vercel recomienda migrar el apex de A a CNAME (`baf912ebe0c35da4.vercel-dns-017.com`) — *CERRADO el 2026-08-28, ver §23.3: apex **y** `www` migrados* | Panel → Domains: los dos pasaron de "DNS Change Recommended" a **"Valid Configuration"**. El apex resuelve a `216.150.16.1` + `216.150.1.1` (dos IPs, antes una), `ssl_verify_result=0`, MX intactos |
| B-16 ⚠️ | Extensiones `pg_trgm` y `btree_gist` instaladas en el schema `public` — *intentado y REVERTIDO el 2026-08-27, ver §21: bloqueado por permisos de Supabase (`supabase_admin` es owner, no `postgres`), no por riesgo de código* | Advisor `extension_in_public` |
| B-18 ✅ | **No hay MX en el apex**: un mail a cualquier dirección `@turnogol.app` rebota. Tampoco hay SPF en el apex (`v=spf1 -all` cerraría la suplantación) — *cerrado el 2026-08-27, ver §21: Cloudflare Email Routing ya propagó MX+SPF* | `nslookup -type=MX turnogol.app` → sin respuesta; el único TXT del apex es la verificación de Google |
| B-17 | `push_send_log` con RLS prendido y sin policies | Advisor `rls_enabled_no_policy`. **No es un agujero**: es fail-closed y la escribe el worker con BYPASSRLS. Queda anotado para que nadie lo "arregle" agregando una policy |

### ✅ Lo que está bien y no hay que tocar

- **Namecheap**: delegación limpia a exactamente 2 nameservers (`keenan` / `olivia.ns.cloudflare.com`), sin duplicados ni DNS paralelo. Auto-renew del dominio **y** de la privacidad WHOIS encendidos hasta 2027-07-20. WHOIS enmascarado (WithheldforPrivacy).
- **Headers de seguridad**: HSTS con `max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Todos presentes y correctos.
- **Región coherente entre web y base**: Vercel `gru1` (São Paulo) + Supabase `sa-east-1` (São Paulo).
- **Todo el tráfico a Postgres pasa por el pooler**: medido en `pg_stat_activity`, las conexiones de `turnogol_app` y `turnogol_worker` llegan con `application_name = 'Supavisor'`. Nadie está entrando por conexión directa.
- **Ningún secreto expuesto con prefijo público**: las `NEXT_PUBLIC_*` son URL del sitio, anon key de Supabase, DSN de Sentry y la clave VAPID pública. Todas públicas por diseño.
- **Deployments protegidos**: SSO protection activa en todo lo que no sea el dominio propio.
- **Backups**: diarios, corriendo (última corrida 25/08 03:46 UTC). PITR sigue sin contratar — decisión ya tomada y documentada, RPO 24 h.
- **Railway**: sin escalado a cero (correcto para un worker), auto-deploy desde `main`, builder por Dockerfile, 1 réplica.

---

## 3. Plan de corrección, en orden

El orden es por relación impacto/costo, no por severidad pura: primero lo que se
arregla en minutos y no puede romper nada.

### Tanda 1 — minutos, riesgo cero · ✅ EJECUTADA 2026-08-25

1. ✅ **`www.turnogol.app` dado de alta en Vercel** como redirect 308 al apex, sin tocar el apex.
   Evidencia: `curl -I https://www.turnogol.app/` → `HTTP/1.1 308 Permanent Redirect` +
   `Location: https://turnogol.app/`, con certificado válido. Antes daba `SEC_E_WRONG_PRINCIPAL`. **C-1 cerrado.**
   *Trampa que casi entra*: el diálogo de Vercel prende solo un checkbox
   ("Redirect apex domains to www") que hace lo contrario — mandaría `turnogol.app` a `www`
   y cambiaría el dominio canónico de todo el producto. Se destildó antes de guardar.
2. ✅ **Protección de contraseñas filtradas prendida** (Supabase → Auth → Email provider).
   Evidencia: el advisor `auth_leaked_password_protection` ya no aparece en
   `get_advisors(security)`. Se verificó contra la API, no contra la pantalla. **M-12 cerrado.**
3. ✅ **`SENTRY_READ_TOKEN` borrado** de Production y Preview en Vercel. `SENTRY_AUTH_TOKEN`
   **se conserva**: el build lo usa (ver M-11 corregido). **M-11 cerrado.**
4. ✅ **`media.turnogol.com` reemplazado por `media.turnogol.app`** en `MEDIA_HOSTS`
   (`next.config.ts`). Se reemplaza en vez de borrar para conservar la red de seguridad que el
   comentario del archivo explica: si `R2_PUBLIC_BASE_URL` faltara en tiempo de build, la lista
   no queda vacía y el perfil público no se cae. `pnpm typecheck` en verde. **B-14 cerrado.**

**Hallazgos nuevos, encontrados mientras se ejecutaba la tanda** (no estaban en la matriz):

| | Hallazgo | Dónde |
|---|---|---|
| 🟡 | **Largo mínimo de contraseña = 6**, el default de Supabase. El staff entra con email+password | Auth → Email provider |
| 🟡 | **Captcha de Supabase Auth apagado** en los endpoints de autenticación | Auth → Attack Protection |
| ✅ | Site URL (`https://turnogol.app`) y la única Redirect URL (`/api/auth/callback*`) están correctas | Auth → URL Configuration |
| 🟢 | **El apex no tiene SPF**: el único TXT de `turnogol.app` es un `google-site-verification`. El correo sale como `From: no-reply@turnogol.app` (`src/modules/notifications/email.provider.ts:23`) y aun así alinea, porque el DKIM de Resend firma con `d=turnogol.app` y el Return-Path (`send.turnogol.app`) alinea en modo relajado. No hay nada roto; queda anotado porque condiciona el paso 8 | DNS del apex |

### Tanda 2 — necesita una verificación previa

5. ✅ **HECHO el 2026-08-26 — era la de producción.** Se midió, no se supuso: un preview devolvió los complejos reales. Se apagaron los previews con un `ignoreCommand` en `vercel.json` en vez de darles un entorno propio, porque nada del pipeline los usaba. **C-3 cerrado** — detalle en §10 y en `docs/decisions/2026-08-26-preview-deshabilitado.md`. Queda un resto manual: las variables de producción siguen CARGADAS en el entorno Preview de Vercel, aunque ya no se usen.
6. **C-2, en tres pasos y no en uno.** (a) Mirar el valor de `DATABASE_URL` y `WORKER_DATABASE_URL` en Railway —el panel los muestra— y confirmar `sslmode=require`; (b) confirmar en la documentación de Supabase que el enforce no corta a Supavisor, que hoy entra sin TLS; (c) recién ahí prender el interruptor, en un horario de poco tráfico y sabiendo que se revierte con un clic.
7. **Mover el worker de Railway a la región más cercana a São Paulo** disponible en el plan. Cierra M-4.
8. **Endurecer DMARC**: primero `p=none` **con `rua=`** para juntar dos semanas de reportes, después `p=quarantine`. Cierra M-8.
   **Prerrequisito medido el 2026-08-25**: no hay dónde recibir esos reportes. El apex
   `turnogol.app` no tiene MX (solo `send.turnogol.app`, que es de Resend), así que un buzón
   `dmarc@turnogol.app` hoy no existe; y apuntar el `rua=` a un Gmail no alcanza — RFC 7489
   exige que el dominio destino autorice el envío con un TXT que en `gmail.com` no podemos
   crear, y Google lo hace cumplir. Salida recomendada, gratis: **Cloudflare Email Routing**
   en la zona, reenviando `dmarc@turnogol.app` al Gmail del dueño. Agrega MX y un SPF al apex,
   y eso **no** toca el correo saliente: el Return-Path de Resend es `send.turnogol.app`, que
   tiene su propio SPF, y la firma DKIM (`resend._domainkey.turnogol.app`) alinea con el apex.
   Es una decisión de Lazar porque le suma correo entrante al dominio.
   **Iniciado el 2026-08-25**: `turnogol@gmail.com` cargado como *dirección de destino* en
   Cloudflare Email Routing, estado **Pendiente** — Cloudflare mandó un mail de verificación a
   ese buzón y hasta que alguien lo confirme no se puede crear la regla de reenvío. Falta,
   en este orden: (1) verificar el destino, (2) regla `dmarc@turnogol.app` → ese destino,
   (3) activar los registros DNS de Email Routing (agrega MX y un SPF al apex),
   (4) recién ahí sumar `rua=mailto:dmarc@turnogol.app` al TXT `_dmarc.turnogol.app`.
   **Los cuatro quedaron hechos el mismo 2026-08-25** — ver M-8 en la matriz. Lo único que
   sigue abierto es esperar los reportes y decidir el paso a `p=quarantine`.

### Tanda 3 — trabajo real, alto retorno

9. **Reglas de firewall en Vercel** para los caminos de plata y de login, con rate limit en el borde. Cierra M-9.
10. **Barrida de RLS**: envolver las llamadas a `current_setting()` en `(select …)`, unificar policies permissive duplicadas, indexar las 26 foreign keys que faltan. Cierra M-6. Es el trabajo que evita que la grilla se caiga cuando entren clientes de verdad.
11. **Subir el compute de Nano a Micro** y recalibrar `DATABASE_POOL_MAX` contra el pool nuevo. Cierra M-7 y le da fondo definitivo a F-002.
12. **CSP con nonce** en lugar de `unsafe-inline`. Cierra M-10.
13. **Healthcheck real del worker**: endpoint HTTP mínimo en el proceso de Railway, o cron monitor de Sentry con `captureCheckIn`. Cierra M-5.

### Tanda 0 — lo que pasó al frente de todo después de auditar Cloudflare

Estas dos entraron después y van **antes** que el resto: son las únicas donde una
sola credencial robada se lleva el producto entero.

14. ✅ **HECHO el 2026-08-25 — 2FA prendido en Cloudflare.** Re-verificado el 2026-08-26 contra el panel. **C-4 cerrado.**
15. ~~**Acotar o borrar el `elite-padel build token`.**~~ **Riesgo aceptado por el dueño**
    (2026-08-25): es el token de la landing de un cliente y no se toca para no romperle el
    deploy. Si esa landing se vuelve a tocar, ahí se acota a su propia zona y bucket.

---

## 4. Cloudflare, auditado

### 4.1 DNS: 8 registros, cero basura

> **Actualización 2026-08-25**: ahora son **13**. Los 5 nuevos son de Cloudflare Email Routing
> (3 MX del apex + DKIM `cf2024-1._domainkey` + SPF del apex), agregados para poder recibir los
> reportes de DMARC. Ver M-8.

| Nombre | Tipo | Contenido | Proxy |
|---|---|---|---|
| `turnogol.app` | A | `216.198.79.1` (Vercel) | Solo DNS ✅ |
| `media.turnogol.app` | R2 | bucket `turnogol-media` | Proxeado ✅ |
| `www.turnogol.app` | CNAME | `cname.vercel-dns.com` | Solo DNS ✅ |
| `send.turnogol.app` | MX | `feedback-smtp.sa-east-1.amazonses.com` (10) | — |
| `_dmarc.turnogol.app` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@turnogol.app` (actualizado 2026-08-25) | — |
| `resend._domainkey` | TXT | DKIM de Resend | — |
| `send.turnogol.app` | TXT | `v=spf1 include:amazonses.com ~all` | — |
| `turnogol.app` | TXT | verificación de Google | — |

**No hay un solo registro huérfano, duplicado ni apuntando a algo muerto.** Los
estados de proxy son exactamente los correctos: gris donde manda Vercel, naranja
donde vive R2. Esta parte está mejor de lo que suele estar.

### 4.2 SSL/TLS y R2

- **Modo de encriptación: Completo (Full)**, con modo automático. No es Flexible,
  que era el riesgo que había que descartar.
- **La URL pública de desarrollo del bucket está deshabilitada** ✅: al bucket solo
  se llega por `media.turnogol.app`, no por una URL `r2.dev` suelta.
- **Los tokens propios de TurnoGol están bien acotados**: `turnogol-prod-token` solo
  sobre `turnogol-media` y `turnogol-dev-token` solo sobre `turnogol-dev`, los dos con
  permiso de *objeto* (lectura y escritura), no de administración.
- El bucket vive en **ENAM (América del Norte Oriental)**. R2 no ofrece región
  sudamericana, así que no es un error: las lecturas las sirve el borde de Cloudflare
  y solo la subida paga el viaje.
- Queda la **Global API Key** de la cuenta, que es todopoderosa y no se puede acotar.
  No es un hallazgo por existir —toda cuenta tiene una— pero no debe usarse nunca ni
  pegarse en ningún lado.

### 4.3 Barrida de segundo factor en todas las cuentas

Al encontrar C-4 valía preguntarse dónde más pasa lo mismo:

| Cuenta | 2FA |
|---|---|
| **Cloudflare** | ✅ TOTP — *estaba apagado cuando se hizo esta barrida; se prendió el mismo día* |
| GitHub | ✅ TOTP + GitHub Mobile |
| Namecheap | ✅ TOTP (pero con las alertas de seguridad apagadas, ver M-15) |
| Vercel | ✅ TOTP |
| Supabase | ❓ sin verificar — el panel de cuenta no cargó |
| Railway | ❓ sin verificar |

### Pendiente de verificar

- **CORS de R2**: medido el 2026-08-25 — "No hay ninguna política CORS definida para este
  bucket". Correcto: las subidas van server-side por la API S3 y las lecturas son `<img>`,
  que no dispara CORS. Deja de ser un pendiente.
- **Ubicación del bucket**: ENAM (América del Norte Oriental), mientras la web está en São
  Paulo y la base en `sa-east-1`. Solo pesa en el primer acceso a cada imagen (después la
  sirve el borde de Cloudflare). No se puede mover un bucket: se corrige recreándolo, y no
  vale la pena hasta que haya volumen que lo justifique.
- **Alertas del registrador (M-15)**: quedó sin aplicar — la sesión de Namecheap venció y el
  login lo tiene que hacer Lazar.

- 2FA de **Supabase** y de **Railway** (sigue sin verificar).

---

## 5. Pasos 8 a 11, ejecutados el 2026-08-25 — y dos premisas que estaban mal

### 5.1 Firewall de Vercel (paso 8 / M-9) — hecho, pero a propósito más chico de lo planeado

Plan de Vercel: **Pro**. Están disponibles las *Custom Rules* (log / deny / challenge /
bypass / rate limit) gratis; el *OWASP Core Ruleset* es Enterprise y no se puede.

Regla publicada: **"Block common vulnerability paths"** — `Deny` si el *Request Path*
contiene `/wp-` o `/vendor/phpunit`, o es igual a `/xmlrpc.php`, `/phpmyadmin`, `/.env`,
`/.git`. Verificado en producción: `curl https://turnogol.app/wp-admin/` → **403**, mientras
`/` y `/precios` siguen en **200**.

**Lo que NO se hizo, y por qué**: el plan pedía además rate-limit en el borde para los
caminos de plata y de login. Se descartó por ahora:

- El rate-limit **ya existe en el runtime** (Upstash, `src/shared/rate-limit/`). Duplicarlo en
  el borde suma una forma nueva de dejar afuera a un cliente real —varios empleados de un
  complejo detrás del mismo WiFi comparten IP— a cambio de ahorrar invocaciones que hoy son
  1,5k permitidas en toda la ventana medida. La cuenta no cierra.
- El webhook de MercadoPago **no se toca**: MP reintenta en ráfaga y un rate-limit ahí se
  paga con pagos perdidos.
- *Bot Protection* de Vercel (desafiar todo lo que no sea un navegador) quedó **apagado a
  propósito**: prendido, desafía al webhook de MP y a cualquier cliente de `/api/public/*`.
- *AI Bots* quedó en **Allow**. Bloquearlos ahorra invocaciones, pero el portal público es
  consumidor y aparecer en respuestas de asistentes tiene valor comercial. Es decisión de
  producto, no de infraestructura: queda anotada, no ejecutada.

### 5.2 Barrida de RLS (paso 9 / M-6) — **la premisa estaba equivocada: no hay nada que arreglar**

El informe daba por buenos los 197 avisos del *advisor* de performance de Supabase. Medidos
uno por uno:

| Aviso | Cantidad | Veredicto |
|---|---|---|
| `auth_rls_initplan` | 100 WARN | **Falso positivo. Ya está arreglado** |
| `multiple_permissive_policies` | 48 WARN | **Es el diseño, y cuesta casi nada** |
| `unindexed_foreign_keys` | 26 INFO | Real pero prematuro |
| `unused_index` | 21 INFO | Sin significado: no hay tráfico todavía |

**Cómo se probó lo del `initplan`** (que es lo que valía la pena, porque el plan proponía
reescribir 100 policies sobre el núcleo del aislamiento):

1. Las 100 policies que llaman a `current_setting()` o `auth.*` están **las 100** envueltas en
   un subselect — `(tenant_id = ( SELECT (NULLIF(current_setting('app.current_tenant_id', true), ''))::uuid ))`.
   Es exactamente la corrección que pide la documentación; el linter no reconoce esa forma
   porque la función está anidada adentro del `NULLIF`.
2. Para no discutir con formas de texto, se midió el **plan real**. Como `postgres` tiene
   BYPASSRLS, se creó un rol sin ese privilegio dentro de una transacción con `rollback`, y se
   comparó la forma envuelta contra la desnuda sobre tablas de prueba:
   - envuelta → `Filter: (tenant_id = (InitPlan 1).col1)` + `InitPlan 1` ⇒ **se evalúa una vez**
   - desnuda → `Filter: (tenant_id = (NULLIF(current_setting(...), ''))::uuid)` ⇒ **por fila**
3. Y sobre la tabla real, con el mismo rol restringido:
   `explain select id from bookings where date >= current_date - 30` →
   `Filter: (((tenant_id = (InitPlan 1).col1) OR (player_id = (InitPlan 2).col1)) AND ...)`
   con `InitPlan 1` e `InitPlan 2`. **Las dos policies duales ya son one-time.**

Ese mismo plan contesta el segundo aviso: Postgres **ya fusiona** las dos policies permissive
en un solo `OR`, y las dos ramas son InitPlans. El costo por fila es comparar dos uuid.
Los 48 avisos son en realidad **8 casos contados una vez por cada uno de los 6 roles**, y los
8 son los pares `player_* + tenant_isolation_*` de `bookings`, `player_tenant_relationships`,
`courts`, `payments`, `tenant_player_bans` y `push_subscriptions` — o sea el **RLS dual
documentado en CLAUDE.md**. Unificarlos sería borrar el diseño para ganar nada.

**Conclusión**: paso 9 se cierra sin escribir una línea de SQL. Los 26 índices de foreign key
quedan anotados para cuando haya volumen — hoy la base pesa **35 MB** y ya hay 21 índices sin
uso; sumar 26 más carga las escrituras sin ganancia medible.

### 5.3 Región del worker (paso 10 / M-4) — **corrección: Railway no tiene Sudamérica**

El plan decía "mover el worker a la región más cercana a São Paulo". Consultada la API de
Railway, las regiones que existen son: **EU West** (Países Bajos), **US West**, **US East** y
**Sudeste asiático**. No hay Brasil ni Sudamérica.

El servicio tiene `region: null`, o sea el default (**US West**). El destino correcto es
**US East** (`us-east4`): São Paulo–Virginia son ~115-125 ms de ida y vuelta contra ~180-190 ms
desde US West. Corta a la mitad, no lo elimina.

**No se pudo ejecutar**: el panel de Railway no renderiza en las pestañas que maneja el
asistente (el `body` vuelve vacío en las tres que se probaron), y la mutación por API
(`serviceInstanceUpdate`) la bloquea el clasificador de permisos. Lo tiene que clickear Lazar:
*Settings → Deploy → Region → US East*. Implica un redeploy del worker; los jobs son durables,
no se pierde ninguno.

### 5.4 Compute de Supabase (paso 11 / M-7) — **medido: no gastar todavía**

| Métrica | Valor hoy (Nano) |
|---|---|
| Tamaño de la base | **35 MB** |
| `max_connections` | 60 |
| Conexiones en uso | 22 |
| `shared_buffers` | 224 MB |

La base entera entra en memoria varias veces. **No hay ningún síntoma de performance que un
compute más grande arregle**, así que subir a Micro hoy es pagar de más. Los dos disparadores
concretos para volver a mirarlo: que las conexiones se acerquen a 60 de forma sostenida, o que
la base pase de ~400 MB. **Aclaración sobre las 22 conexiones** (la primera redacción de este
informe las presentó de forma engañosa): una conexión **no es un usuario**. Desglosadas:

| Quién | Conexiones | Qué es |
|---|---|---|
| `turnogol_app` vía Supavisor | 5 (todas `idle`) | el pool de la web |
| `turnogol_worker` vía Supavisor | 2 (`idle`) | el worker de Railway |
| procesos internos de Postgres | 5 | checkpointer, autovacuum, walwriter… |
| `supabase_admin` | 5 | `pg_cron`, `pg_net`, `postgres_exporter`, mantenimiento |
| `pgbouncer` (auth_query de Supavisor) | 3 | el pooler autenticando |
| `authenticator` (PostgREST) | 1 | la API REST de Supabase |
| `postgres` (mgmt-api) | 1 | la consulta que hizo esta misma medición |

O sea: **7 de 22 son TurnoGol**, y las 7 estaban ociosas. El resto es la propia infraestructura
de Supabase.

Y el modelo mental correcto es el de la línea telefónica, no el de la butaca: la app **nunca**
habla directo con Postgres, habla con **Supavisor** en modo transacción, que presta una
conexión por el tiempo que dura la consulta y la recupera. Medido sobre
`pg_stat_statements`: **34 millones de consultas con 0,07 ms de promedio**. Aun siendo
pesimista y contando 5 ms por consulta de la app, **una sola** conexión despacha ~200
consultas por segundo. El techo no se mide en usuarios sino en consultas simultáneas.

El número que sí hay que vigilar no es el 60 de `max_connections` sino el **`pool_size` de
Supavisor** (documentado como 15 en `src/shared/db/client.ts:49-55`), que es donde ya hubo un
incidente real: **F-002**, conexiones ociosas que no se soltaban nunca y agotaban el pool.
Está mitigado con `idle_timeout` de 20 s y `max_lifetime` de 30 min.

**Hallazgo lateral de esta medición**: entre las consultas más lentas, casi todas son de
introspección del panel de Supabase y de PostgREST —ruido— salvo una que **sí es de la app**:
`SELECT max(completedon) FROM pgboss.job WHERE name = $1 AND state = $2 UNION …`, con
**354 ms de promedio en 319 llamadas**. Es la que mira la salud de los jobs. No es urgente,
pero es la única consulta propia que aparece en el top y merece un índice o una reescritura.
*(Arreglada el mismo día: 12,35 ms → 0,43 ms medido, en PR #217 — pendiente de merge.)*

---

## 6. Capacidad: ¿aguanta 100 complejos y 1.000 usuarios recurrentes? — 2026-08-25

> Pregunta del dueño: ¿el stack actual (Supabase Pro + Vercel Pro + Railway + Resend +
> Sentry + Cloudflare R2) soporta 100 complejos y 1.000 usuarios recurrentes, o hay que
> pensar en migrar (p. ej. a un VPS)? Método: mediciones reales sobre la base de
> producción (solo lectura) + límites oficiales 2026 de cada proveedor relevados de sus
> docs con fuente al lado (tres barridos independientes, agentes de research).

### 6.1 Veredicto

**Sí, alcanza — con un margen de entre 20× y 100× según la métrica.** A 100 complejos el
stack actual opera entre el 1 % y el 5 % de sus límites en todas las dimensiones medibles
(consultas, conexiones, requests, ancho de banda, Realtime, MAU). Lo que sí hay que tocar
antes de tener clientes reales no es capacidad: son 5 llaves operativas (§6.5), todas de
minutos u horas, ninguna una migración.

### 6.2 La medición que ancla todo (producción, 2026-08-25)

| Métrica medida | Valor |
|---|---|
| Consultas respondidas desde el 2026-07-18 (38 días) | **34.009.235** |
| Tiempo total de ejecución de TODAS esas consultas | **37,8 minutos** |
| Ocupación de la base que eso representa | **0,069 %** del período |
| Tamaño de la base | 35 MB (las tablas de la app: < 2 MB; lo más pesado es `pgboss.archive`, 17 MB de historial de la cola) |
| Conexiones: 22 de 60 — desglose | 5 pool web (idle) + 3 worker (idle) + 14 infraestructura propia de Supabase (pg_cron, exporter, PostgREST, auth del pooler, procesos internos) |
| Promedio por consulta | 0,02–15 ms según la consulta; el fetch de pg-boss (26,7 M de llamadas) cuesta 0,02 ms |

Dos lecturas de esto. Primera: **la base ya procesa hoy, con cero usuarios, ~895.000
consultas por día** (el polling del worker), un volumen del mismo orden del que le
sumarían 100 complejos de humanos — y le costó 1 minuto de trabajo por día. Segunda: las
22 conexiones "en uso" no crecen con los usuarios: 14 son la maquinaria de Supabase y las
8 nuestras son pools fijos, ociosos. El tráfico de usuarios entra por Supavisor en modo
transacción (puerto 6543), que multiplexa: no abre una conexión por usuario.

### 6.3 Modelo de carga a 100 complejos (supuestos explícitos)

Supuestos: 100 complejos ≈ 400 canchas (promedio 4); ~5 turnos ocupados por cancha por
día → **~2.000 reservas/día** en toda la plataforma; ~200 cuentas de staff (150 activas
por día, uso intensivo de grilla); 1.000 jugadores recurrentes (~300–500 activos/día);
pico viernes 19–22 ART con ~4× la densidad promedio.

| Dimensión | Demanda proyectada | Límite del plan actual | Ocupación |
|---|---|---|---|
| Requests web | ~45.000/día ≈ 1,4 M/mes | 10 M edge requests incluidos (Vercel Pro) | ~14 % |
| Invocaciones de función | ~0,7–1,5 M/mes | Sin tope; $0,60/M contra crédito de $20 | — |
| Consultas a la DB (usuarios) | ~270.000/día; pico ~35/s | Techo del pool: 15 slots × ~200 consultas/s/slot ≈ 3.000/s | **~1 %** |
| Tiempo de DB ocupada | ~22 min/día | 1.440 min/día | ~1,6 % |
| Conexiones cliente al pooler | ~10–20 en pico (Fluid empaqueta; pool 3 por instancia + worker) | 200 (Micro) / 400 (Small) | ~5–10 % |
| Realtime concurrente | 100–200 grillas abiertas | 500 en el precio; hard cap 10.000 | ~30 % de la cuota, 2 % del techo |
| Mensajes Realtime | ~120.000/mes | 5 M/mes incluidos | ~2,4 % |
| Auth MAU | ~1.200 | 100.000 incluidos | 1,2 % |
| Egress de DB | ~40 GB/mes | 250 GB incluidos | 16 % |
| Disco | 2–5 GB al año de operación | 8 GB incluidos, luego $0,125/GB | — |
| Emails | ~30–60 k/mes | Resend Pro: 50 k ($20) o 100 k ($35) | requiere salir del Free |
| Imágenes (R2) | pocos GB; egress alto | 10 GB gratis; **egress $0 siempre** | ~$0 |

Aunque los supuestos de uso estén errados por un factor de 5–10×, ninguna fila se acerca
a su límite salvo las que ya están señaladas como acción (email) — ese es el punto del
margen.

### 6.4 Los dos números que asustaban, explicados

- **"Pool de 15"** (`pool_size` de Supavisor): no son 15 consultas ni 15 usuarios — son
  15 líneas simultáneas hacia Postgres. Cada consulta ocupa una línea durante
  milisegundos y la devuelve. A 5 ms por consulta, una sola línea despacha ~200/s; las 15
  juntas, ~3.000/s. El pico proyectado de 100 complejos es ~35/s. El único incidente real
  con este pool (F-002) fue un bug de conexiones que no se soltaban — arreglado con
  `idle_timeout`/`max_lifetime`, no fue un problema de tamaño.
- **"22 de 60 conexiones sin usuarios"**: el 60 es `max_connections` directas a Postgres.
  De las 22, **14 son de Supabase mismo** y 8 nuestras (pools fijos, ociosos). Los
  usuarios no suman conexiones directas: entran por el pooler. Este número va a seguir
  siendo ~22–30 con 100 complejos.

### 6.5 Lo que sí hay que hacer antes de clientes reales (las llaves, no la capacidad)

1. **SMTP custom en Supabase Auth + subir el rate de OTP.** El magic link de jugadores
   sale por Supabase Auth: con el SMTP built-in el límite es **2 emails/hora** (hard) y
   el default de OTP es **30/hora por proyecto** (configurable). Verificar que Auth use
   Resend como SMTP y subir el límite de OTP. Sin esto, el login de jugadores se ahoga
   con el primer complejo real. Fuente: docs de auth rate-limits.
2. **Resend Free → Pro al lanzar.** El Free tiene **100 emails/día (hard)**. Pro $20
   (50 k/mes) alcanza; $35 (100 k) sobra.
3. **Nano → Micro, posiblemente gratis.** Docs de compute: *"In paid organizations, Nano
   Compute are billed at the same price as Micro Compute"* — en una org Pro el Nano se
   cobra como Micro. Verificar en el panel de billing: si es así, el upgrade a Micro
   (0,5 → 1 GB RAM) no cuesta nada más que un reinicio de ~2 min. Corrige la decisión de
   §5.4, que asumía que quedarse en Nano ahorraba plata.
4. **PITR (~$100/mes) cuando haya plata real en la base.** Hoy el RPO es 24 h (backup
   diario). Con complejos pagando y reservas reales, perder hasta 24 h de datos es el
   riesgo más caro de todo el stack. Disparador: primera cohorte paga (~10–20 complejos),
   no antes. Es el único salto de costo grande y es una decisión de fecha, no de si.
5. **Worker: sigue siendo el punto más frágil — pero de disponibilidad, no de
   capacidad.** 1 réplica, healthcheck de plataforma pendiente (M-5), monitoreado por
   UptimeRobot (P-12). Y **PR #217 sin mergear**: la mudanza a US East y el fix del
   latido (12,35 ms → 0,43 ms) no están deployados.

### 6.6 Costo mensual proyectado a 100 complejos

| Proveedor | Hoy | A 100 complejos |
|---|---|---|
| Supabase Pro | $25 | $25 (Micro en el crédito; disco/egress dentro de lo incluido) **+ $100 PITR recomendado** |
| Vercel Pro | $20 | $20 (uso estimado ~$12 ≤ crédito de $20) |
| Railway | ~$5 | ~$5–10 |
| Resend | $0 | $20–35 |
| Sentry | $0 | $0 (el default al exceder cuota es descartar, no cobrar) — Team $26 opcional |
| Cloudflare R2 | $0 | ~$0–2 (egress gratis) |
| **Total** | **~$50** | **~$70–90 sin PITR · ~$170–200 con PITR + Sentry Team** |

Contra ingresos a esa escala (100 × ~$85.000 ARS ≈ **$8,5 M ARS/mes**), la infraestructura
completa queda en **~2–4 % de la facturación** — menos que la suscripción de un solo
cliente.

### 6.7 ¿VPS? No.

Migrar a un VPS hoy sería cambiar ~$50–200/mes por convertir al dueño en su propio DBA y
sysadmin: parches, backups, PITR artesanal, pooling, monitoreo, hardening — todo lo que
hoy viene resuelto, sin equipo para operarlo. El punto de reevaluación honesto es una
factura de infra sostenida > $1.000–2.000/mes (~500+ complejos). El stack además es
portable si ese día llega: Postgres vanilla + RLS, worker Node, Next.js — el lock-in real
se limita a Supabase Auth y Realtime.

### 6.8 Techos honestos (cuándo sí habría que pensar)

- **~500–1.000 complejos**: el CPU compartido de Micro/Small empieza a pesar → subir de
  tier es un click por escalón (Small $15, Medium $60, Large $110… hasta 16XL), nunca una
  migración.
- **Realtime**: hard cap de 10.000 conexiones concurrentes ≈ miles de complejos.
- **Lo primero que va a doler de verdad al crecer no es el fierro**: son detalles de la
  app tipo el `LIMIT 200` sin cursor de Personas (B10) cuando un tenant tenga miles de
  filas. Eso es trabajo de producto, barato, y con síntoma gradual — no un colapso.

---

## 7. Inventario de credenciales, y sondas que prueban que FUNCIONAN — 2026-08-25

> Pedido del dueño: *"quiero que todas funcionen y actúen como deben, que todos los problemas
> a futuro sean únicamente del código y no de configuración o infraestructura"*.

La propuesta inicial era rotar todo. Se descartó y se hizo lo contrario, por una razón: rotar
no responde la pregunta que genera el miedo —*¿está bien puesta?*— y además es la operación
más peligrosa del repertorio. La evidencia es propia: la rotación del `ENCRYPTION_KEY` del
22/8 mató el cobro **en silencio** durante días, y el 25/8 cambiar una palabra del DSN dejó al
worker en bucle de crash 16 minutos. Encima, en Vercel los valores **no se pueden leer**: pisar
uno sin copia es un camino de ida.

Lo que sí cierra el problema es poder **probar** cada credencial cuando uno quiera.

### 7.1 Lo que ya existía, y por qué no alcanzaba

Había dos capas, y las dos miran lo mismo desde ángulos distintos:

| Capa | Qué valida | Qué NO valida |
|---|---|---|
| `src/shared/env.ts` (Zod, al arrancar) | **forma**: que la variable esté y tenga la pinta correcta (largo, regex, URL) | que la credencial sirva |
| `/api/status` (en vivo) | **presencia** (`!!process.env.X`) para MercadoPago, email y Sentry | ídem |
| `scripts/launch-check.ts` | **funcionamiento real**, pero solo de MercadoPago, SSL y los roles de la base | todo el resto |

O sea: una API key revocada, una clave pegada de otra cuenta o un bucket renombrado pasaban
las tres capas y fallaban recién en producción. El caso testigo ya documentado: el
`ENCRYPTION_KEY` estaba, con formato inválido, y el único lugar donde se manifestaba era el
callback de OAuth de MercadoPago — un camino que se recorre **una vez por complejo**, durante
el alta, y que por eso nadie mira.

### 7.2 Inventario: cada variable de producción y cómo se prueba

Sacado del código (`grep process.env` sobre `src/`, `next.config.ts`, `instrumentation*.ts`,
`middleware.ts`), no de la memoria ni de un `.env.example`.

| Variable | Quién la lee | Forma | Sonda de funcionamiento |
|---|---|---|---|
| `DATABASE_URL` | `db/client.ts`, `jobs/boss.ts` | Zod | `ssl in use`, `bypassrls`, `role identity` |
| `WORKER_DATABASE_URL` | `db/client.ts` | REQUIRED_ENV | `worker bypassrls role check` |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/*` | Zod url | **nueva** `supabase keys probe` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase/*` | Zod min(20) | **nueva** `supabase keys probe` |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` | Zod min(20) | **nueva** `supabase keys probe` |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | `api/mp/*` | Zod min(1) | `mp credentials probe` |
| `MP_TURNOGOL_ACCESS_TOKEN` | `billing.gateway.ts` | REQUIRED_ENV | `mp master token probe` |
| `MP_WEBHOOK_SECRET` / `_CHECKOUT` | `webhook-auth.ts` | Zod min(16) | ⚠️ **no se puede sondear** |
| `ENCRYPTION_KEY` | `lib/crypto/encrypt.ts` | Zod regex 64 hex | `encryption-key strength` |
| `IMPERSONATION_COOKIE_SECRET` | `security/*-cookie.ts` | Zod min(16) | **nueva** `impersonation secret probe` |
| `RESEND_API_KEY` | `email.provider.ts` | Zod min(1) | **nueva** `resend probe` |
| `R2_ACCOUNT_ID` / `ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` / `BUCKET` | `storage/r2.ts` | Zod (prod) | **nueva** `r2 probe` |
| `R2_PUBLIC_BASE_URL` | `storage/r2.ts`, `next.config.ts` | Zod url | **nueva** `r2 public domain probe` |
| `VAPID_PUBLIC_KEY` / `PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `lib/web-push.ts` | Zod (largos) | **nueva** `vapid pair` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | `rate-limit/apply.ts`, `cache/slots-cache.ts` | Zod | **nueva** `upstash probe` |
| `SENTRY_DSN` | `observability/sentry-worker.ts` | REQUIRED_ENV | ⚠️ sin sonda (ver 7.4) |
| `NEXT_PUBLIC_SENTRY_DSN` | `instrumentation-client.ts` | REQUIRED_ENV | ⚠️ sin sonda |
| `SENTRY_AUTH_TOKEN` / `ORG` / `PROJECT` | `next.config.ts` (build) | — | el build falla si están mal |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` | billing, SEO, mails | Zod parcial | ⚠️ sin sonda (ver 7.4) |
| `SYSTEM_ADMIN_EMAILS` | `system-admin.guards.ts` | opcional | fail-closed por diseño |
| `STATUS_TOKEN` | `api/status/route.ts` | — | abre el detalle de `/api/status` |
| `TERMS_VERSION` | `shared/terms.ts` | — | — |

### 7.3 Las siete sondas nuevas

Todas de **lectura**: no mueven plata, no escriben datos de negocio, y ninguna imprime el
secreto — cuando hace falta imprimen el identificador de cuenta o recurso, que es lo que hay
que comparar. Se corren con un solo comando:

```bash
LAUNCH_CHECK_ENV_FILE=.env.production pnpm launch:check --probe-only
```

| Sonda | Qué prueba de verdad |
|---|---|
| `resend probe` | La key sirve **y hay un dominio verificado**. Una key válida con el dominio sin verificar manda igual, pero los mails rebotan o caen en spam: ese es el modo de falla que nadie mira |
| `r2 probe` | `HeadBucket`: la clave es válida, tiene permiso, **y el bucket existe con ese nombre exacto**. Un `R2_BUCKET` mal tipeado pasaba el chequeo de presencia |
| `r2 public domain probe` | Que `R2_PUBLIC_BASE_URL` resuelva por HTTPS. Un 404 es éxito; lo que busca es el caso `media.turnogol.com`, un dominio que no existía y estuvo meses en `next.config.ts` |
| `supabase keys probe` | Que la `service_role` tenga **privilegios de admin** (si alguien pegó ahí la `anon` —mismo formato JWT, indistinguibles a ojo— el `min(20)` le daba verde), y que la `anon` sea de **este** proyecto |
| `upstash probe` | Escritura y lectura reales. Sin esto el rate-limit falla abierto y los caminos de plata quedan sin freno, que es lo contrario de lo que se supone |
| `impersonation secret probe` | Viaje completo de HMAC: firma, verifica, y **rechaza** una firma hecha con otro secreto |
| `vapid pair` | Que la pública **se derive** de la privada (P-256). Rotar una sola pasa todos los chequeos de largo y deja push roto en silencio: el navegador se suscribe con la vieja, el servidor firma con la nueva, cada envío muere con un 403 que nadie ve. El síntoma que ve el dueño es "dejaron de sonar las reservas" |

`vapidPairMatches` es lógica pura y vive en `launch-check.helpers.ts` con 6 tests unitarios.
Las de red viven en `launch-check.ts`, junto a las sondas de MercadoPago que ya existían.

### 7.4 Lo que sigue sin poder probarse, dicho de frente

- **`MP_WEBHOOK_SECRET` y `MP_WEBHOOK_SECRET_CHECKOUT`**: cualquier string "funciona" para
  firmar; lo único que prueba que sea **la correcta** es un webhook real de MercadoPago
  llegando y validando. No hay sonda posible desde afuera. La red de contención real es que
  `webhook-auth.ts` loguea cada rechazo.
- **`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`**: sondearlos exige mandar un evento de verdad, que
  ensucia el panel de issues. Se puede hacer a mano una vez y confirmar en Sentry.
- **Las tres variables de URL** (`APP_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`):
  ninguna sonda puede saber cuál es la "correcta". `APP_URL` tiene fallback silencioso a
  `http://localhost:3000` en `billing.service.ts`, y con eso el webhook de la suscripción SaaS
  nunca llega. Merece consolidarse en una sola variable, que es cambio de código y no de
  configuración.
- **El entorno Preview de Vercel** era el único 🔴 abierto de esta auditoría (C-3). Ninguna sonda
  lo alcanzaba —los valores no se pueden leer y el gate corre contra el archivo de env que uno le
  pase—, así que se lo midió por el otro lado: pidiéndole datos a un preview. Cerrado, §10.

---

## 8. Auditar los ambientes REALES, y lo que apareció al hacerlo — 2026-08-25/26

> Idea de Lazar: *"en vez de apuntar al `.env.production`, ¿no podríamos hacer lo mismo pero
> contra las variables de Vercel y de Railway? Es donde realmente viven"*. Es la corrección
> correcta, y encontró un incidente activo en la primera corrida.

### 8.1 El problema del método anterior

El gate cargaba un archivo de env con `override: true`, o sea que **el archivo le ganaba a lo que
la plataforma tuviera cargado**. Auditar así prueba lo que dice el archivo, no lo que usa la app.
La corrida del 25/8 contra `.env.production` devolvió 13 rojos y ninguno era una credencial rota.

Ahora hay dos modos explícitos:

| Modo | Comando | Qué audita |
|---|---|---|
| Archivo | `LAUNCH_CHECK_ENV_FILE=.env.production pnpm launch:check --probe-only` | una copia local — sirve para contrastarla contra la realidad |
| Plataforma | `LAUNCH_CHECK_ENV_FILE=platform railway run pnpm launch:check --probe-only` | las variables que la plataforma inyecta de verdad |
| App | `GET /api/admin/system-status?probes=1` (super-admin) | las variables que Vercel tiene cargadas, corriendo dentro del runtime |

`LAUNCH_CHECK_RUNTIME=worker` además saca de la lista de obligatorias las siete variables que solo
usa el runtime web (`WEB_ONLY_ENV`). Sin eso el worker daba siete rojos permanentes que no eran
problemas, y un rojo que siempre está rojo enseña a ignorar la salida entera.

### 8.2 🔴 Lo que apareció: `withTenantContext` estaba caído en el worker

Primera corrida contra Railway, y cuatro rojos con el mismo texto:
`self-signed certificate in certificate chain`. Confirmado en los logs del servicio, cada 5
minutos, durante horas:

```
{"module":"health-ping","level":"error","message":"health.ping.degraded","down":"database",
 "checks":[{"name":"database","status":"down",
            "error":"self-signed certificate in certificate chain"},
           {"name":"pg-boss","status":"ok","latencyMs":201}, …]}
```

**Causa raíz.** El mismo `DATABASE_URL` lo consumen dos librerías con semánticas opuestas para el
mismo `sslmode`:

| Librería | Quién la usa | `sslmode=require` | `sslmode=no-verify` |
|---|---|---|---|
| `pg` (node-postgres) | pg-boss | valida la cadena → **se cae** | `{rejectUnauthorized:false}` → anda |
| `postgres` (porsager) | `getDb()` / `getSql()` | cifra sin validar → anda | string desconocido → valida → **se cae** |

El 25/8 se cambió a `no-verify` para que pg-boss arrancara. Eso arregló pg-boss y rompió el pool
de la app **dentro del worker**: todo `withTenantContext` moría. Lo usan siete workers, entre
ellos los que tocan plata — dunning de suscripciones, reconciliación de pagos pendientes,
generación de slots de abonados y reintento de reembolsos.

**Por qué no avisó nada.** El proceso seguía vivo y el latido seguía llegando, así que el
dead-man's switch de P-12 no tenía por qué dispararse: mide *que el worker respire*, no *que
pueda hablar con la base*. El `health.ping.degraded` quedó solo en los logs de Railway.

**Arreglo.** `src/shared/db/ssl.ts`: el TLS lo decide el código y no el query param, que es
editable desde un panel y que cada librería lee distinto. La opción explícita le gana al DSN en
las dos librerías, así que a partir de acá ninguna edición de una variable puede volver a romper
esto. Candado en `tests/unit/db-ssl-options.test.ts`, que además verifica que los dos pools de
`client.ts` pasen la opción.

### 8.3 `pg_stat_ssl` no sirve para medir esto (y el pooler acepta texto plano)

El check `ssl in use` miraba `pg_stat_ssl.ssl`. Medido contra producción con las variables reales:

```
DATABASE_URL        tls      : CONECTA  pg_stat_ssl.ssl=false
DATABASE_URL        plaintext: CONECTA  pg_stat_ssl.ssl=false
WORKER_DATABASE_URL tls      : CONECTA  pg_stat_ssl.ssl=false
WORKER_DATABASE_URL plaintext: CONECTA  pg_stat_ssl.ssl=false
```

Dos cosas de ahí:

1. A través del pooler, `pg_stat_ssl` describe el tramo **Supavisor→Postgres** (interno, sin TLS),
   no el tramo cliente→Supavisor que cruza internet. El check daba un rojo que no significaba nada.
2. **El pooler acepta conexiones sin cifrar.** Ningún chequeo del lado del servidor puede
   garantizar el cifrado: lo único que lo garantiza es que el cliente lo pida siempre — que es
   exactamente lo que ahora hace `dbSslOptions`.

Pendiente aparte (no urgente, no lo abre este cambio): hoy se cifra **sin validar la cadena**
(`rejectUnauthorized: false`), que es lo que ya hacía el sistema. Validar de verdad exige
empaquetar la CA de Supabase y pasar `sslrootcert`.

### 8.4 Estado del worker de Railway después del arreglo

`LAUNCH_CHECK_ENV_FILE=platform LAUNCH_CHECK_RUNTIME=worker railway run pnpm launch:check --probe-only`

| Resultado | Sondas |
|---|---|
| ✅ 16 en verde | variables presentes · roles `turnogol_app`/`turnogol_worker` con la identidad y los timeouts correctos · TLS contra el pooler · MP Checkout Pro · MP Suscripciones (cuenta 381048203) · Resend con `turnogol.app=verified` · par VAPID derivado · `ENCRYPTION_KEY` · bypasses de E2E cerrados · `/api/status` sano |
| ⏭ 5 sin correr | R2, dominio público de R2, claves de Supabase, Upstash e impersonación: son del runtime web, no viven en el worker y se auditan del lado de Vercel |

### 8.5 Hallazgo lateral, sin arreglar

Los workers que crean o cancelan reservas (`generate-abonado-slots`, `expire-pending-booking`) **no
invalidan el cache de disponibilidad** (`invalidateAvailSearch` solo se llama desde
`src/modules/bookings/*`, que es camino web). Un turno liberado por vencimiento de seña puede
seguir apareciendo ocupado en la búsqueda pública hasta que expire el TTL. No se toca acá porque
la decisión —invalidar desde el worker o bajar el TTL— es de producto.

---

## 9. El lado Vercel, auditado desde adentro de la app — 2026-08-26

`GET /api/admin/system-status?probes=1`, como super-admin, contra las variables que Vercel tiene
cargadas de verdad:

| Sonda | Resultado |
|---|---|
| `mp-oauth` (Checkout Pro) | ✅ credenciales aceptadas |
| `mp-master-token` (Suscripciones) | ✅ cuenta 381048203 (FEIJOOLAZARO) |
| `resend` | ✅ `turnogol.app=verified` |
| **`r2-bucket`** | 🔴 **credenciales rechazadas (HTTP 401)** |
| `r2-public-domain` | ✅ `https://media.turnogol.app` responde |
| `supabase-keys` | ✅ service_role con privilegios de admin, anon de este proyecto |
| `upstash` | ✅ escritura y lectura confirmadas |
| `impersonation-secret` | ✅ firma y rechaza como corresponde |
| `vapid-pair` | ✅ la pública se deriva de la privada |

### 9.1 🔴 R2: subir una imagen falla hoy

`HeadBucket` devuelve **401**, o sea credenciales rechazadas — no 404, que sería nombre de bucket
equivocado. Los dos buckets existen en Cloudflare (`turnogol-media`, `turnogol-dev`), así que lo
que está mal es la clave, el secreto o el `R2_ACCOUNT_ID` cargados en Vercel.

Consecuencia: logo del complejo, portada y fotos de cancha **no se pueden subir**. Coherente con
los datos — en producción no hay una sola fila con `logo_url`, `cover_url` ni fotos de cancha:
`SELECT count(*) FROM courts WHERE array_length(photos,1) > 0` da 0. Nunca funcionó; no es una
regresión.

No se puede arreglar desde acá: los valores de Vercel no se leen ni se escriben desde afuera.
Requiere generar un token de API de R2 con permiso de lectura/escritura de objetos sobre
`turnogol-media` y cargar los tres valores en Vercel. La sonda lo confirma en el acto.

### 9.2 El super-admin estaba dado a medias

El panel `/super-admin` no lo podía abrir **nadie**. El guard es un triple chequeo (claim del JWT +
fila activa en `system_admins` + allowlist `SYSTEM_ADMIN_EMAILS`) y fallaba en el primero: la fila
de `lazarofeijoo2004@gmail.com` estaba activa desde antes, pero el usuario de autenticación nunca
recibió `app_metadata.is_system_admin` — lo escribe sólo `scripts/seed-system-admin.ts`, y por
diseño no hay superficie HTTP para auto-promoverse. Se completó el claim (`is_system_admin` +
`system_admin_id`) preservando el resto de la identidad, y con eso el panel abre.

### 9.3 El panel decía `lastHealthPing: null` con 141 latidos vivos

Encontrado mientras se leía la respuesta de arriba. `pgboss.job` tenía 141 health-pings completados
—el último 20 segundos antes de la consulta— y el endpoint devolvía `null`.

Causa: **drizzle muta los type parsers de la instancia de postgres-js que envuelve**, así que un
`timestamptz` vuelve como string incluso desde un `sql` crudo sobre esa misma instancia. Reproducido
contra producción con las variables reales:

```
SIN drizzle  -> object | Date   | 2026-08-26T01:00:38.874Z
CON drizzle  -> string | String | 2026-08-26 01:00:38.874173+00
toISOString() EXPLOTA: r2[0].last.toISOString is not a function
```

El código anotaba `Date` y llamaba `.toISOString()`: `TypeError`, tragado por un `catch` mudo. El
`catch` ahora manda el error a Sentry: degradar a `null` está bien, hacerlo en silencio es como se
escondió esto.

**`/api/status` no estaba afectado** —envuelve en `new Date(...)` antes de restar—, así que el
dead-man's switch de P-12 siguió funcionando todo este tiempo.

### 9.4 La misma clase, buscada en todo el repo

El candado que ya existía para esto (`tests/unit/raw-sql-row-shape.test.ts`) no lo detectó por dos
motivos, los dos corregidos:

1. No miraba los templates de porsager (`sql<{ … }[]>`), sólo `tx.execute<…>` y `as unknown as`.
2. Su regex sólo funcionaba con tipos **multilínea**. La primera versión de la extensión dio verde
   sobre el bug que decía cubrir; se descubrió con un control negativo, no leyendo el código.

Ampliado, el barrido encontró **una infracción más con consecuencia real**:
`countPendingRefunds` (`refund.service.ts`) declaraba `oldestAt: Date` sobre SQL crudo, y ese valor
llega hasta `sortAttentionItems`, que hace `a.since.getTime()`. Con una devolución pendiente y otro
ítem de atención en la misma lista, el inicio del panel reventaba. Hay **2 devoluciones pendientes
reales** en producción (complejo titi, la más vieja del 22/8).

Los otros dos casos que aparecieron (`paid-period.guard.ts`, `canteen-report.service.ts`) declaran
`Date | string` y envuelven en `new Date(...)`: son correctos, y el candado ahora los exime a
propósito — un candado ruidoso sobre código sano termina desactivado.

---

## 10. C-3 cerrado: el Preview era producción con otro nombre — 2026-08-26

### Cómo se midió, si los valores no se pueden leer

Los secretos de Vercel no se leen desde afuera, así que en vez de preguntarle al
panel se le preguntó **a un preview**. El deploy de la rama
`fix/tipos-fecha-sql-crudo` sigue vivo; `/api/public/search` es público y de solo
lectura, y devuelve los complejos cargados en la base a la que ese deploy esté
conectado:

```json
{"results":[
  {"id":"9fcb4ecc-c1f8-43e2-9a53-5f1e599eb1e6","slug":"complejo-elite-futbol", ...},
  {"id":"fbeda410-39eb-4ed0-b248-2f732ad14d26","slug":"complejo-titi", ...}
],"total":2}
```

Esos son los ids de producción. No queda margen de interpretación: **el
`DATABASE_URL` del entorno Preview es el de producción.**

El primer intento fue más indirecto —`/api/status` daba `ok`, y ese semáforo
exige que TODOS los checks pasen, incluido el del latido del worker, que solo
existe en la base de producción—. Servía como indicio, pero tiene dos ramas de
fail-open (sin latidos registrados, o error al leerlos) que también devuelven
`ok`. Se buscó la medición que no admite otra lectura antes de escribir nada.

### Qué había realmente expuesto

De los últimos 20 deploys del proyecto, **12 fueron de rama**. Cada uno corría
con la base real, `MP_TURNOGOL_ACCESS_TOKEN` (cobra de verdad), `MP_CLIENT_SECRET`,
`RESEND_API_KEY` (le manda mail a jugadores reales desde `turnogol.app`),
`ENCRYPTION_KEY` y credenciales de R2 con permiso de borrado.

El SSO de Vercel que ya estaba prendido tapa el agujero equivocado: impide que
un tercero mire, no impide que una rama a medio hacer escriba, ni que uno pruebe
un flujo de pago creyendo que es un sandbox.

### El arreglo

`vercel.json` gana un `ignoreCommand` que omite el build cuando —y solo
cuando— `VERCEL_ENV` vale exactamente `preview`. El contrato de Vercel va al
revés de la intuición (**exit 0 ignora, exit 1 buildea**), así que la condición
está escrita para que **todo lo demás buildee**: el modo de falla tiene que ser
"volvieron los previews", nunca "producción dejó de deployarse en silencio".
Probado en las cuatro combinaciones antes de commitear, incluida la variable
vacía.

Se eligió apagarlos en vez de darles un entorno propio porque **nada del
pipeline los usaba**: los tests corren en GitHub Actions, no hay crons de
Vercel —o sea que un preview nunca ejecutaba nada solo, solo respondía si
alguien lo visitaba— y durante toda esta auditoría se probó contra producción.
El razonamiento completo, y qué habría que hacer para volver a prenderlos bien,
está en `docs/decisions/2026-08-26-preview-deshabilitado.md`.

### Lo que NO cierra

Las variables de producción **siguen cargadas** en el entorno Preview de Vercel.
Con los builds apagados ya no se usan, pero ahí están, y alcanza con volver a
habilitar un preview para que se usen otra vez. Borrarlas es un paso manual en
Vercel → Settings → Environment Variables, y conviene hacerlo: es la diferencia
entre "no se usa" y "no está".

---

## 11. Lo que bloqueaba C-2: pg-boss podía estar hablando en claro — 2026-08-26

C-2 (el pooler acepta conexiones sin cifrar) se cierra prendiendo *Enforce SSL*
en Supabase, y la auditoría ya advertía que ese interruptor **no es inocuo**: si
algún cliente nuestro va sin TLS, corta producción en el acto. Antes de tocarlo
había que saber si alguno iba sin TLS. Resultó que sí podía.

### El agujero

El arreglo del 2026-08-25 (`src/shared/db/ssl.ts`) cubrió los **dos pools de
porsager**, y su comentario afirmaba que "la opción explícita le gana al query
param en las dos librerías". **Es falso para `pg`**, que es lo que usa pg-boss.
Medido contra `pg@8.22.0` —`lib/connection-parameters.js` hace
`Object.assign({}, config, parse(config.connectionString))`, o sea que el DSN
pisa lo explícito—:

```
DSN sin sslmode      + ssl explícito  ->  { rejectUnauthorized: false }   TLS
DSN sin sslmode      + sin explícito  ->  false                           TEXTO PLANO
DSN sslmode=no-verify + explícito     ->  { rejectUnauthorized: false }   TLS
DSN sslmode=require   + explícito     ->  {}   valida la cadena -> se cae
DSN sslmode=disable   + explícito     ->  false                           TEXTO PLANO
```

`boss.ts` pasaba `connectionString: url` **y nada más**. Y el DSN que Supabase
entrega para copiar y pegar **no trae `sslmode`**. O sea que la conexión de
pg-boss podía estar cruzando internet sin cifrar contra la base de producción —
justo el canal que C-2 dice que el pooler acepta en claro.

**Alcance honesto**: en Railway el DSN tiene `sslmode=no-verify` (se puso ahí el
2026-08-25), así que el worker iba con TLS. El que no se puede confirmar es el
de **Vercel**: sus valores no se leen desde afuera. Lo que sí se sabe es que no
es `require` —con ese valor pg-boss se caería, y el check `pg-boss` de
`/api/status` está verde—, así que es `no-verify` (TLS) o ausente (texto plano).
No hay forma de distinguirlos sin mirar el panel; el arreglo vuelve la pregunta
irrelevante.

### El arreglo

`pgConnectionConfig()` en `ssl.ts`: le **saca** el `sslmode` al DSN y devuelve la
opción `ssl` aparte. Recién con el parámetro ausente la opción explícita gana en
`pg`. El recorte es sobre el string y solo después del primer `?` — un
round-trip por `new URL(...).toString()` re-codificaría la contraseña, y una
contraseña de producción re-codificada es una conexión rota.

El candado no comprueba lo que nosotros creemos que hace `pg`, sino lo que `pg`
hace: el test instancia el `ConnectionParameters` real y afirma las tres cosas
—que el DSN pelado da `ssl: false`, que nuestra config da TLS, y que un
`sslmode=require` ya no puede pisarnos—. Si una versión futura cambia la
precedencia, o si pg-boss deja de usar node-postgres, CI se entera.

### Lo que sigue faltando para cerrar C-2

Con esto, **los tres clientes de la base salen con TLS por construcción** desde
los dos runtimes. Falta el paso que necesita el panel:

1. Prender **Enforce SSL** en Supabase → Database Settings (después de que este
   cambio esté deployado en Vercel y en Railway).
2. Verificar en el acto: `/api/status` sigue en 200 y el health-ping del worker
   sigue avanzando. Si algo iba sin cifrar, falla ahí y se revierte con un clic.
3. Aparte y sin relación con TLS: *Network restrictions* sigue en "todas las IP".

---

## 12. C-2 cerrado: el canal a la base va cifrado, y esta vez se probó — 2026-08-26

*Enforce SSL* prendido en Supabase → Database Settings, con el arreglo de §11 ya
deployado en Vercel y en Railway.

### La medición

La misma sonda que había medido el problema, corrida de nuevo. Intenta hablar
**en claro** con el pooler usando una contraseña deliberadamente inválida: la
autenticación ocurre DESPUÉS de establecer el canal, así que si el servidor
llega a contestar "contraseña incorrecta", el canal sin cifrar se aceptó.

```
5432  ssl=false  ->  XX000 (ESSLREQUIRED) SSL connection is required for user: postgres
6543  ssl=false  ->  XX000 (ESSLREQUIRED) SSL connection is required for user: postgres
6543  ssl=on     ->  28P01 password authentication failed for user "postgres"
```

Antes del interruptor, la fila de arriba daba **`28P01`**. Ahora el rechazo llega
**antes** de mirar la contraseña. Y la tercera línea es el control positivo que
le falta a la mitad de las verificaciones de seguridad: con TLS el canal sigue
abierto y lo único que falla es la contraseña inventada — o sea que el cambio
cortó lo que tenía que cortar y nada más.

### Producción, en el mismo momento

| Qué | Resultado |
|---|---|
| `GET https://turnogol.app/api/status` | 200 `{"status":"ok"}` — y ese semáforo exige que TODOS los checks pasen, incluido el de pg-boss, que era el cliente sospechado de ir en claro |
| `GET /api/public/search` (pega a la base por el pool de la app) | 200 con los dos complejos |
| Último `health-ping` del worker de Railway | **1 minuto atrás**, ya con el enforce puesto (142 en `pgboss.job`) |

Los tres runtimes que tocan la base —el pool de la app, el pool worker y
pg-boss— siguieron funcionando. Si alguno hubiera ido sin cifrar, se habría
caído en el acto.

### Lo que NO cierra: *Network restrictions*

Sigue en "todas las IP", y **no es lo mismo que el TLS**: una cosa es que el
canal vaya cifrado y otra es desde dónde se acepta abrirlo.

Queda abierto **a sabiendas, no por olvido**: la app corre en lambdas de Vercel,
que no tienen IP de salida fija fuera de los planes Enterprise (Secure Compute),
y el worker corre en Railway. Una allowlist de IPs hoy le cortaría el acceso a
nuestra propia app. Lo que sí queda como mitigación real es lo que ya está: la
contraseña del rol, el TLS obligatorio, y RLS con `turnogol_app` como rol
restringido.

---

## 13. El motor de colas gritaba `[object Object]` — 2026-08-26

Encontrado revisando los logs de Railway justo después de prender *Enforce SSL*,
o sea buscando otra cosa.

### Lo que se vio

El worker recién deployado (`d402b0e7`) emitió **14 `pg-boss error` en 5
segundos** —04:59:56 a 05:00:00— y después nada: `health.ping.ok` a las 05:00:20
y la barrida de reconciliación corriendo normal. Los deploys anteriores
arrancaban limpios, sin un solo error.

Lo grave no es la ráfaga: es que **no se puede saber qué decía**. En el log de
Railway y en Sentry (`SENTRY-COQUELICOT-SCHOOL-N`, 14 eventos) quedó esto y nada
más:

```
Contexto:
    error = [object Object]
    message = pg-boss error
    module = pg-boss
```

### La causa

`manager.js:256` de pg-boss v9.0.3 **no emite un `Error`**, emite un objeto
plano:

```js
this.emit(events.error, { ...error, message: error.message, stack: error.stack,
                          queue: name, worker: id })
```

Y el handler decía `err instanceof Error ? err.message : String(err)`. Ese
objeto no es un `Error`, así que caía en `String(...)`. El motor de colas —el
que corre el dunning de suscripciones, la reconciliación de pagos y la
generación de slots de abonados— tenía su **único** canal de error escribiendo
una constante. Y el objeto traía justo lo que hacía falta: `message`, `stack`,
`code`, y sobre todo **`queue` y `worker`**, que dicen cuál de los 15
consumidores se rompió.

### Sobre la ráfaga en sí

La hipótesis razonable es que el toggle de *Enforce SSL* hace que Supavisor
recargue y corte las conexiones abiertas; el pool de pg-boss las ve morir,
protesta y reconecta. Encaja con la forma —ráfaga corta, silencio después,
worker sano— pero **no está probada, y no se puede probar hacia atrás**: el
contenido del error se perdió, que es exactamente el defecto que este cambio
arregla. Queda anotado como hipótesis, no como conclusión.

### El arreglo

`src/shared/jobs/boss-error.ts` aplana las tres formas posibles (Error, objeto
plano de pg-boss, cualquier otra cosa) a campos que el logger manda a Sentry
como contexto.

Dos decisiones que no son obvias:

1. **Nunca vuelca el objeto entero.** Un error de Postgres arrastra el texto de
   la query, que puede traer datos de una persona (Ley 25.326). Si no hay
   `message`, informa las **claves** que venían — sirve para diagnosticar sin
   copiar valores.
2. **Nunca devuelve vacío.** Lo encontró el test, no el código: `String('')` es
   `''`, y una línea de error vacía en el log es el mismo problema que
   `[object Object]`.

El test abre con el control negativo literal: la forma exacta que emite pg-boss
contra la expresión que había en el handler, afirmando que daba
`[object Object]`.

---

## 14. M-5, primera mitad: el worker ahora puede decir si sirve — 2026-08-26

M-5 son dos cosas distintas metidas en una fila: **no hay healthcheck** y **el
tope de reinicios es 10**. Esta sección cierra la primera, y explica por qué la
segunda va aparte.

### El agujero que ni el arranque miraba

El worker ya fallaba rápido si el pool BYPASSRLS no podía saltear RLS
(`assertWorkerDbVisibility`). Pero el 2026-08-25 arrancó con ESE assert en verde
y **todo `withTenantContext` roto**: son dos pools con DSN distintos
—`WORKER_DATABASE_URL` contra `DATABASE_URL`— y el que nadie miraba era justo el
que usan los crons que tocan plata.

`assertAppDbReachable()` (`src/shared/db/client.ts`) cierra eso: un `SELECT 1`
por el pool restringido antes de registrar una sola cola. Un `SELECT 1` alcanza
porque lo que se rompía era el **handshake**, no la query.

### El endpoint

`src/shared/jobs/health-server.ts` levanta un `GET /health` dentro del proceso
de workers que mira las tres cosas que tienen que andar: los **dos** pools y
pg-boss. Devuelve 200 solo si las tres pasan.

Tres decisiones que no son obvias:

- **Se levanta DESPUÉS de registrar las colas.** Un 200 con las colas sin
  consumidor certificaría justo lo que no queremos: un worker que responde y no
  trabaja. Hay un test que compara las posiciones en el archivo.
- **`permission denied` de pg-boss NO es falla.** En producción el rol no puede
  introspeccionar ese schema, a propósito. Que la consulta llegue hasta el
  permiso ya prueba que el pool vive. Sin esa rama el healthcheck daría rojo
  permanente y **ningún deploy entraría nunca**.
- **Nunca tira.** Si el puerto está tomado, lo dice en el log y los workers
  siguen: quedarse sin healthcheck es malo, quedarse sin workers es peor. Y un
  `PORT` basura cae al default en vez de dejarnos sin servidor.

No expone el detalle de los errores: el semáforo es público, el motivo va al log
y a Sentry. Mismo criterio que `/api/status`.

### Por qué el `healthcheckPath` de Railway NO entra todavía

Con `healthcheckPath` configurado, Railway consulta el endpoint en cada deploy y
**si no contesta 200 marca el deploy como fallido y deja corriendo el
anterior**. Ese es exactamente el candado que se busca. Pero también significa
que, si Railway sondea un puerto distinto del que abrimos, **ningún deploy vuelve
a entrar** — el worker viejo seguiría trabajando, así que no hay caída, pero los
cambios dejarían de llegar en silencio. Que es la clase de falla que esta
auditoría entera viene persiguiendo.

Y no se puede probar sin deployar: la sonda de Railway no existe fuera de
Railway. Así que va en dos pasos, a propósito:

1. **Este cambio**: el servidor levanta y loguea `health server listening` con
   su puerto. Se lee en los logs del deploy.
2. **Después**, con ese dato confirmado: `healthcheckPath = "/health"` en
   `railway.toml`, más el `restartPolicyType`. Ahí sí cierra M-5.

### Sobre el tope de 10 reinicios

`ON_FAILURE` solo reinicia con código de salida distinto de cero: si el proceso
se va limpio —un `process.exit(0)` inesperado— no reinicia nunca. Y a la 11ª
caída queda muerto. El arreglo es `restartPolicyType = "ALWAYS"`, que según la
documentación de Railway está disponible **solo en planes pagos**; el nuestro
figura en ~US$5/mes, que es Hobby y es pago, pero eso está inferido de la tabla
de costos de §6, **no verificado contra la cuenta**. Va junto con el paso 2, con
el plan confirmado antes de tocarlo — no se cambia la política de reinicio del
proceso que corre los crons de plata sobre una inferencia.

---

## 15. M-5, segunda mitad: el candado enchufado — 2026-08-26

La primera mitad (§14) dejó el `GET /health` andando dentro del proceso de
workers, pero **Railway todavía no lo consultaba**. Faltaba el dato que no se
podía saber sin deployar: contra qué puerto sondear.

### El puerto, medido y no supuesto

Deploy `f11dc5ee` (commit `36d836a7`, 2026-08-26 17:31 UTC), logs de Railway:

```
2026-08-26T17:32:13.733Z  info  health server listening
    module = "health-server"
    port   = 8080
```

8080 es el default del código, o sea que **Railway hoy no define `PORT`** en
este servicio (se confirma aparte: la lista de variables del servicio tiene 17
nombres y `PORT` no está entre ellos).

La documentación de Railway dice que el healthcheck se hace *"against the `PORT`
variable it injects, so listen on it"*. `healthPort()` usa esa variable cuando
existe y cae a 8080 cuando no, que es también el default de Railway. Los dos
caminos coinciden solos, y por eso **el `railway.toml` no fija un número**:
escribirlo ahí los desalinearía el día que Railway empiece a inyectarlo.

### Lo que se agregó

```toml
healthcheckPath = "/health"
```

Nada más. Con eso, cada deploy nuevo tiene que contestar 200 —los dos pools y
pg-boss vivos— para entrar. Si no contesta, Railway marca el deploy como fallido
y **el anterior sigue corriendo**: el modo de falla es "el cambio no entra",
nunca "producción se cae". La reversión es borrar esa línea.

Queda una verificación que solo existe del otro lado: **que el próximo deploy
efectivamente entre**. Si quedara en `FAILED` con el worker viejo sirviendo, el
diagnóstico es el puerto y la línea se saca.

### El tope de reinicios: se deja como está, y no por falta de plata

§14 lo dejó planteado como "subir a `ALWAYS` con el plan confirmado". Consultada
la documentación de Railway (`deployments/restart-policy`):

> Users on the Free plan and those trialing the platform have some limitations
> on the restart policy: `Always` is not available. `On Failure` is limited to 10
> restarts.

O sea que la configuración actual (`ON_FAILURE` / 10) es exactamente el techo del
plan gratuito, y el plan de la cuenta **sigue sin verificarse** — la API de
Railway no lo expone y no se va a inferir de la tabla de costos otra vez.

Pero el punto de fondo cambió al mirarlo de cerca: `ALWAYS` agrega **un solo
caso** sobre lo que ya hay — que el proceso termine con código 0 sin que nadie
se lo pida. Todo lo demás (crash, excepción sin capturar, el `process.exit(1)`
del arranque cuando falta una variable) ya lo cubre `ON_FAILURE`. Y el agujero
que realmente dolió el 25/8 no era que no reiniciara: era que **nadie avisó**
durante horas. Eso no lo arregla ninguna política de reinicio; lo arregla P-12.

Así que M-5 se cierra con el healthcheck, y el tope de 10 queda documentado como
decisión, no como pendiente. Si algún día se ve una undécima caída seguida, ahí
sí se revisa el plan.

---

## 16. El monitoreo externo, re-verificado: está vivo — 2026-08-26

§15 cerró M-5 diciendo que el candado de deploy no reemplaza al monitor
continuo, y que ese monitor es P-12. Al ir a buscarlo apareció una duda: la
matriz dice *"hoy lo tapa UptimeRobot (P-12)"* y el registro de la sesión que
ejecutó P-12 abre diciendo que **no llegó ninguna alerta**.

No había contradicción: el registro describe el hallazgo del 24/8 y más abajo
documenta que se cerró **ese mismo día**. La matriz tenía razón. Pero la duda
valía la pena, porque el arreglo tiene **tres eslabones** y basta que uno se
haya soltado para que todo el mecanismo sea decorativo. Medidos hoy, los tres:

**1. El worker late.** Último `health-ping` completado **hace 1 minuto**; 136
pings vivos en `pgboss.job`.

**2. `/api/status` puede leer ese latido.** Este es el eslabón que podía estar
roto en silencio: `checkWorkerHeartbeat` hace *fail-open* si no puede leer
—devuelve `ok` con la nota "could not read heartbeat"—, y el rol de la app tiene
prohibido introspeccionar el schema de pg-boss para otras cosas. Si también le
faltara el `SELECT`, el semáforo diría verde para siempre con el worker muerto y
nadie se enteraría. No es el caso:

```sql
has_schema_privilege('turnogol_app','pgboss','USAGE')         -> true
has_table_privilege ('turnogol_app','pgboss.job','SELECT')    -> true
has_table_privilege ('turnogol_app','pgboss.archive','SELECT')-> true
pg_class.relrowsecurity de pgboss.job                         -> false
```

**3. El monitor externo sigue pegando.** Conteo de requests de producción de las
últimas 3 horas, agrupado por ruta:

| ruta | requests en 3 h |
|---|---|
| `/` | 38 |
| `/api/status` | 35 |
| `/terminos` | 2 |

~12 por hora en cada una de las dos rutas monitoreadas = **un chequeo cada 5
minutos por monitor**, que es exactamente la configuración del plan gratuito
dada de alta el 24/8. El contraste con el día del hallazgo es el dato: entonces
`/api/status` recibió **2 requests en 45 minutos, y los dos eran de la prueba**.

### Lo que sigue sin prueba directa

Que el 503 **realmente aparezca** con el worker caído más de 15 minutos. Los tres
eslabones están verificados por separado y la alerta de UptimeRobot se probó de
punta a punta el 24/8 (con un monitor contra una ruta inexistente: detectó en
65 s y el mail llegó), pero la cadena completa —worker muerto → latido viejo →
503 → mail— exige parar el worker ese rato en producción. Es barato en daño
(una caída del worker retrasa trabajo, no lo pierde: el 24/8 drenó 26 jobs en
menos de 2 minutos, 0 fallidos) y queda como prueba a pedido, no como pendiente
silencioso.

---

## 17. El simulacro de P-12, y las dos cosas que destapó — 2026-08-26

§16 dejó un solo hueco: los tres eslabones estaban verificados por separado,
pero la cadena completa —worker muerto → latido viejo → 503 → mail— nunca se
había corrido junta. Se corrió, contra producción, con el dueño autorizándolo.

### La línea de tiempo

| hora (UTC) | qué pasó |
|---|---|
| 18:35:35 | último `health-ping` completado antes de la caída |
| 18:38:21 | deployment del worker **removido** en Railway |
| 18:50:35 | momento en que el umbral de 15 min se cumple |
| **18:50:55** | `/api/status` responde **503** (la sonda medía cada 60 s) |
| **18:52** | mail de UptimeRobot: *"Monitor is DOWN: turnogol.app/api/status"* |
| 18:59:42 | redeploy |
| **19:00:34** | `/api/status` vuelve a **200** |
| 19:00:25 | latido nuevo, 29 s después de que el worker levantó |
| **19:02** | mail de UptimeRobot: *"Monitor is UP"* |

Once chequeos consecutivos en 200 y el primero pasado el umbral en 503. **El
mecanismo funciona de punta a punta**, y el aviso llegó a una casilla humana en
poco más de un minuto. El deploy de restauración, además, tuvo que pasar por el
healthcheck de §15 para entrar: M-5 se probó solo, por segunda vez.

### Lo primero que destapó: el monitor ya había mentido

Buscando el mail del simulacro aparecieron **dos anteriores del mismo día**:
`DOWN 08:37` y `UP 08:42` (UTC). Nadie los había mirado. No correspondían a
ninguna caída: el worker estaba vivo. Los latidos de esa franja:

```
07:55 → 08:10   15,0 min
08:20 → 08:40   20,0 min   ← esto disparó el DOWN de las 08:37
08:45 → 08:58   13,0 min
09:00 → 09:15   15,0 min
```

La causa no es de esta cola. Los **tres** crons de 5 minutos pierden
exactamente los mismos ciclos, en 12 horas:

| cola | jobs creados | hueco promedio | hueco máximo | ticks salteados |
|---|---|---|---|---|
| `health-ping` | 133 | 5,4 min | **20,0** | 6 |
| `reconcile-pending-payments` | 133 | 5,4 min | **20,0** | 6 |
| `expire-pending-booking-sweep` | 133 | 5,4 min | **20,0** | 6 |

133 de 144 esperados: **el 7,6% de las ejecuciones no ocurre**. Y el hueco nace
al **crear** el job, no al ejecutarlo — la espera entre `createdon` y
`startedon` es de 9 segundos, constante, y el trabajo dura 2. O sea que el que
falla es el reloj de pg-boss, no el consumidor. Lo confirma que su propio
mantenimiento interno también se atrasa: 269 corridas con un máximo de 9,4 min
para un ciclo configurado cada 2.

**Arreglo aplicado**: `HEARTBEAT_MISSES_ALLOWED` pasa de 3 a 6, o sea el umbral
de 15 a **30 minutos**. Deja pasar el peor hueco medido con margen y sigue
detectando una caída real en menos de media hora — el 25/8 el worker estuvo
*horas* roto sin que nadie se enterara. Un test nuevo ancla el caso de los 20
minutos, así que bajar el umbral sin arreglar antes la puntualidad se pone rojo
y explica por qué.

### Lo segundo: la región del worker nunca se mudó

`railway.toml` pedía `region = "us-east4-eqdc4a"` desde el 25/8. Railway estaba
corriendo el worker en **US West**: el panel muestra "US West" y la API
devuelve `multiRegionConfig: {sfo: {numReplicas: 1}}`.

La mudanza por latencia nunca ocurrió, y nadie se enteró porque **un campo que
la plataforma ignora no falla: se saltea**. Las claves sueltas `region` y
`numReplicas` quedaron viejas; la escala se declara hoy con `multiRegionConfig`.
Corregido a la forma que la plataforma lee.

No es cosmético: la base está en São Paulo y cada operación del reloj de pg-boss
paga ese viaje. US West son ~180-190 ms por query; US East, ~115-125. Es
sospechoso principal de los ticks perdidos, aunque **no está probado** que sea
la causa — se sabrá midiendo los mismos huecos después del cambio.

### Lo que queda abierto: el 503 avisa, pero no dice por qué

Durante todo el simulacro, `checkWorkerHeartbeat` llamó a `captureException` en
cada request en 503 —unas diez— y **Sentry no registró ni uno**. Verificado por
dos vías independientes: el script del repo (`pnpm sentry:issues 24h`) y la API
de Sentry, ninguna encuentra el evento.

No es demora de indexado: se miró a los 5, 10 y 15 minutos. Y hay un patrón que
apunta más lejos: en 30 días, **todos** los eventos de `environment:production`
con `runtime.name: node` vienen de nombres de contenedor de Railway. No hay uno
solo que se pueda atribuir con certeza al runtime de servidor de Vercel.

Si eso se confirma, el alcance no es este chequeo: son los ~84 `captureException`
del código que corre en Vercel. Queda como hallazgo abierto, con dos candidatos
—falta de `SENTRY_DSN` server-side en Vercel, o eventos que se pierden sin
`flush()` antes de que la lambda se congele— y ninguno confirmado todavía.

---

## 18. La región ERA la causa — confirmado, no solo sospechado — 2026-08-26

§17 dejó la mudanza a US East como "sospechoso principal, no probado". Dos horas
después del deploy (commit `1411ef51`, activo desde 19:39 UTC), medido de
nuevo:

| período | worker en | latidos | hueco promedio | hueco máximo | ticks salteados |
|---|---|---|---|---|---|
| 12 h antes | US West (`sfo`) | 133 | 5,4 min | **20,0 min** | 6 |
| 1h52 después | US East (`us-east4-eqdc4a`) | 22 | **5,00 min** | **5,0 min** | **0** |

Los otros dos crons de 5 minutos que antes compartían el patrón roto ahora
comparten el patrón perfecto: `reconcile-pending-payments` y
`expire-pending-booking-sweep`, 22 de 22 jobs, 5,00 min parejo, cero huecos.

Confirmado también en el panel de Railway y no solo por API: la API de
`get-service-config` seguía devolviendo `multiRegionConfig: {sfo: ...}` minutos
después del deploy exitoso —dato viejo, no descriptivo del estado real—; el
panel de Settings → Scale mostraba "US East (Virginia, USA)" con la nota *"The
value is set in /railway.toml"*, y el header del servicio ya decía "US East".
Ante la discrepancia, manda la plataforma, no la API que la describe.

Cierre: la latencia al pooler de Supabase (sa-east-1) explicaba el 7,6% de
ejecuciones perdidas de los crons de 5 minutos, y moverse ~65 ms más cerca lo
llevó a cero en la ventana medida. Sigue siendo una muestra corta (1h52); vale
una relectura en unos días para confirmar que se sostiene.

---

## 19. El hallazgo abierto de §17: por qué Sentry se quedaba mudo — 2026-08-26

§17 dejó una pregunta sin cerrar: durante el simulacro, `checkWorkerHeartbeat`
llamó a `captureException` unas diez veces en 503 y **ninguna llegó a
Sentry**. Dos candidatos, ninguno confirmado todavía: falta de `SENTRY_DSN`
server-side en Vercel, o eventos que se pierden sin `flush()` antes de que la
lambda se congele.

### El primero se descarta mirando el panel

`SENTRY_DSN` sí está seteada en Production (fila propia en Environment
Variables, separada de la de Preview — Vercel las separa cuando el valor
difiere entre entornos). `sentry.server.config.ts` no logueó ningún "DSN
invalid, skipping init" durante la ventana del simulacro. El init corrió.

### El segundo es la causa real

`captureException` solo **encola** el evento — lo despacha un transporte HTTP
asíncrono que nadie esperaba. Vercel corta la función en cuanto la response
sale, y nada en el código esperaba eso: ni el propio `captureException`
(que no devuelve una promesa que valga la pena esperar) ni ningún flush
explícito en los ~84 call sites.

La instrumentación automática de `@sentry/nextjs` que normalmente resuelve
esto (envolver cada route handler para flushear antes de responder) depende
del bundler: con Webpack se inyecta en build-time; con **Turbopack** —el
bundler por default de Next 16, el que corre este repo— Sentry documenta que
la resuelve vía "telemetry" de Next en vez de esa inyección (docs de Sentry,
`manual-setup/webpack-setup`, sección "Key Differences: Webpack vs
Turbopack"). No hay garantía documentada de que ese camino cubra el flush en
serverless, y la evidencia del simulacro dice que no.

### El fix: un solo archivo, sin tocar los 84 call sites

`src/lib/sentry.ts` — antes un simple re-export de `@sentry/nextjs` — ahora
envuelve `captureException`/`captureMessage` para agendar `Sentry.flush(2000)`
con `after()` (mismo patrón ya usado en
`src/shared/observability/analytics.ts`): corre DESPUÉS de que la respuesta
salió, así que no le suma latencia a nadie en el camino feliz.

`after()` tira `Error: after() was called outside a request scope` en los 3
call sites de `src/shared/jobs/workers` (proceso standalone de Railway, sin
ciclo de request) — ahí el `try/catch` lo absorbe sin romper nada, y no hace
falta: el worker no se congela entre eventos y ya vive bajo su propio
`Sentry.init` (`sentry-worker.ts`).

Como los 84 call sites importan `captureException`/`captureMessage` desde
`@/lib/sentry` sin cambiar su firma, el fix es transparente para todos ellos.

Test nuevo (`tests/unit/sentry-flush-after-response.test.ts`, 5 casos) contra
la implementación REAL del archivo — no mockeado como el resto de la suite —
con control negativo: revertido a la versión pre-fix, 2 de 5 tests fallan (los
que verifican el flush), confirmando que miden comportamiento real.

**No confirmado todavía**: que este fix por sí solo alcance para que el
*próximo* simulacro o incidente real muestre el evento en Sentry — depende de
que `after()` efectivamente sobreviva al ciclo de vida de la función en
producción (en dev/test se simula, no se corrió contra Vercel real). Vale
disparar un 503 real y mirar Sentry después de mergear esto.

### El fix del flush no alcanzó — y la causa real es más grande

Mergeado #232, se probó contra producción real: `POST /api/csp-report` (ruta
pública que dispara `captureMessage`, mismo wrapper que el fix toca) devolvió
204 —la función corrió entera— y el evento **nunca llegó** a Sentry. El flush
no era suficiente.

Ampliando la medición aparecieron dos señales que apuntan más lejos que un
timing de red:

- **14 días de historial de Sentry, 21 tipos de error, NINGUNO del runtime de
  servidor de Vercel** — todos son del worker de Railway o del navegador.
- **Páginas dinámicas de producción no traen rastro de Sentry en el HTML.**
  `/reset-password` y `/reactivar` (`X-Vercel-Cache: MISS`, o sea que sí
  ejecutan del lado del servidor) no tienen `<meta name="baggage">` ni
  `sentry-trace` — el SDK del servidor no parece estar corriendo.

Hipótesis descartada por sonda directa: **no son dos copias del SDK**
(`instrumentation.ts` vs. el grafo de la app, la misma clase de bug que ya
costó el locale de Zod y el sink de analytics — F-022, memoria
`zod-locale-global-no-alcanza-schemas.md`). Una ruta de diagnóstico temporal
en dev confirmó `Sentry.getClient()` presente en ambos lados. Se descartó y
se removió esa ruta.

**Control decisivo**: el MISMO commit, compilado con `pnpm build` +
`NODE_ENV=production pnpm start` (build de producción real, corriendo local
con Postgres local levantado) y un `SENTRY_DSN` apuntando a un receptor HTTP
propio, **sí** emite la meta de Sentry en una página dinámica y **sí**
transmite el evento del CSP con su marca exacta. O sea: no es el bundle, no es
Turbopack, no es el código — es específico del entorno de Vercel.

**Segundo intento**: `src/shared/env.ts` corría `validateServerEnv()` —que
TIRA si falta o está mal una variable de producción— ANTES del init de Sentry
dentro de `register()`. Si tiraba, se llevaba puesto todo lo de abajo, Sentry
incluido, en silencio. Reordenado en #233: Sentry primero, el validador al
final, y si tira ahora sí queda un log en stderr con el NOMBRE de la variable
que falló. **Deployado y remedido: la meta de Sentry sigue sin aparecer.**
El orden de `instrumentation.ts` no era la causa (o no toda la causa).

**Gotcha de método, para no repetirlo**: `get_runtime_logs` (MCP de Vercel)
**nunca** devuelve la salida de `console.*`/`stderr` de la aplicación — solo
líneas de request (`GET /ruta 200`). El visor del dashboard sí la muestra.
Se confirmó con un control: forzar un `logger.error` conocido
(`/api/auth/callback?code=inválido`) y verificar que aparece en el dashboard
pero no en la respuesta del MCP. Sin ese control, una búsqueda vacía por MCP
no prueba que la app no haya escrito nada.

**Sospechoso vivo, sin confirmar**: el VALOR de `SENTRY_DSN` en Vercel
Production. La fila existe (verificado en el dashboard), pero si el valor no
es un DSN parseable con clave pública, `isValidDsn()` da `false` y el init se
saltea sin loguear nada salvo que el valor sea truthy-e-inválido — un valor
vacío o un placeholder no dispara ni ese warn. Mismo patrón que
`ENCRYPTION_KEY` en Railway (una causa, síntomas silenciosos).

**No se pudo confirmar mirando el dashboard**: Vercel oculta el valor de las
variables marcadas Sensitive incluso al dueño de la cuenta — a diferencia de
Railway, no hay botón "Reveal" que sirva acá.

### `probeSentry()`: la sonda que sí puede contestar sin ver el secreto

Agregada a `src/shared/observability/credential-probes.ts` (mismo archivo que
ya prueba Resend/R2/Supabase/Upstash/MP con la regla "nunca devuelve el
valor de un secreto"). Manda un evento de PRUEBA real al endpoint de ingesta
de Sentry —mismo formato de envelope que usa el SDK, verificado contra un
receptor propio en dev— **sin pasar por `@sentry/nextjs`**, a propósito: si el
problema es que el SDK nunca inicializó, probar a través de él no serviría de
nada. Lee la respuesta:

- `200` → el evento entró de verdad (queda un issue agrupado, `fingerprint`
  fijo, así que correr la sonda mil veces no ensucia el proyecto con mil
  issues)
- `401`/`403` → la clave está mal o revocada
- `404` → el proyecto no existe en ese host
- error de red → el host no responde

Se corre vía `/api/admin/system-status?probes=1` (gateado por
`resolveSystemAdmin`, auth real de super-admin) o desde
`scripts/launch-check.ts`. El resultado (`ok`/`fail`/`skip` + un `detail` sin
secretos) es lo único que hace falta mirar para cerrar este hallazgo.

Memoria: `sentry-servidor-muerto-en-vercel.md` y
`vercel-logs-api-no-devuelve-salida-app.md`.

### La sonda contestó: el DSN está bien. La hipótesis era equivocada

Corrida contra producción (`/api/admin/system-status?probes=1`, 2026-08-27):

```
{"name":"sentry","status":"ok",
 "detail":"evento de prueba aceptado (host o…ingest.us.sentry.io, proyecto …)"}
```

Y el evento **llegó de verdad**: issue `credential-probe: sonda de
configuración, no es un error real`, visto 17:11:54. O sea que desde el
runtime de Vercel la credencial es válida, la red llega y Sentry ingiere. Las
otras 9 sondas también dieron `ok`.

**Queda descartado el sospechoso que quedaba.** No es el flush (#232), no es
el orden de `instrumentation.ts` (#233), y no es el valor de `SENTRY_DSN`.

### ⚠️ El "discriminador `/monitoring`" era un ERROR DE MEDICIÓN mío

La versión anterior de esta sección afirmaba que la ruta del túnel
`/monitoring` existía en el build local y devolvía **404 en Vercel**, y
concluía que "las piezas que el plugin de Sentry inyecta en el build no están
en el artefacto de Vercel". **Eso es falso y queda retractado.**

El túnel NO es una ruta: es un **rewrite con condiciones `has`** sobre los
query params `o` (org), `p` (proyecto) y `r` (región) —visto en
`.next/routes-manifest.json`—, así que sin esos parámetros **no matchea y
devolver 404 es lo correcto**. Se había probado pidiendo `/monitoring` pelado.

Medido bien, con los ids reales que devolvió `probeSentry`:

```
POST /monitoring?o=<org>&p=<proyecto>&r=us   → 401   (respuesta de Sentry:
                                                      rechaza el cuerpo basura)
POST /monitoring                             → 404   (correcto: no matchea)
```

O sea que **el túnel funciona en producción** y `withSentryConfig` SÍ se
aplicó en el build de Vercel. Lección repetida (van tres en esta auditoría):
antes de tratar una respuesta como evidencia, verificar que la sonda esté
midiendo lo que uno cree.

Sigue en pie, eso sí, que el CSP de producción es
`connect-src 'self' *.supabase.co wss://*.supabase.co *.mercadopago.com` — sin
`*.sentry.io`. No es un problema mientras el túnel ande, pero deja al cliente
con un solo camino y sin red de respaldo.

### Dónde quedó, con todo lo descartado

Sonda nueva después de #235 (`POST /api/csp-report` con marca única,
2026-08-27 17:35 UTC): la función respondió 204 y el evento **no llegó** a
Sentry. Con eso, la lista de causas eliminadas —cada una con medición, no por
descarte lógico— es:

| Candidato | Cómo se descartó |
|---|---|
| Falta de `flush()` antes del freeze (#232) | Arreglado y mergeado; el evento sigue sin llegar |
| Orden de arranque de `instrumentation.ts` (#233) | Reordenado y deployado; sin cambio |
| Valor de `SENTRY_DSN` | `probeSentry` en producción: evento aceptado E INGERIDO |
| Red / firewall hacia Sentry | Misma sonda: llega por HTTP directo desde el runtime |
| Túnel `/monitoring` roto | Falso positivo propio; medido bien, funciona |
| El plugin no se aplicó en el build | Refutado por lo mismo: el rewrite existe en Vercel |
| Ubicación de `instrumentation.ts` | La raíz es válida — Next busca en raíz **y** en `src/` |
| Error del `valueInjectionLoader` (#235) | Era regresión propia y ya está corregida; precede al síntoma igual |

**Lo que queda en pie**: `Sentry.init()` no produce un cliente activo en el
runtime de servidor de Vercel, con credencial y red probadas buenas. Sin
determinar.

**Camino pragmático disponible**: `probeSentry` demostró que el ingest por
HTTP directo SÍ funciona desde ese runtime. O sea que se puede reportar sin
depender del init del SDK. Es un rodeo, no un arreglo, y conviene decidirlo a
conciencia antes de escribirlo.

### Una regresión propia, encontrada leyendo el log de build

El log del deploy de #234 traía:

```
./instrumentation.ts:12:3
A Node.js API is used (process.stderr) which is not supported in the Edge Runtime.
Generated code of loaders [.../@sentry/nextjs/.../valueInjectionLoader.js]
transform of file content of instrumentation.ts: Ecmascript file had an error
```

El `bootLog` que #233 agregó para que el arranque gritara usaba
`process.stderr.write`, y `instrumentation.ts` **también se compila para el
runtime edge** (por su rama `NEXT_RUNTIME === 'edge'`). Resultado: el
`valueInjectionLoader` de `@sentry/nextjs` fallaba al transformar el archivo —
el intento de arreglar la observabilidad estaba rompiendo la instrumentación
de Sentry en el build.

Confirmado que era regresión propia comparando contra el log del deploy
inmediatamente anterior (#232, commit `eb6870f`), que compilaba limpio.
Corregido a `console.error`/`console.info`, que existen en los dos runtimes;
el build vuelve a compilar sin el warning ni el error del loader. Un test
textual prohíbe `process.stderr`/`process.stdout` en ese archivo, mirando solo
las líneas de código (el docstring lo nombra a propósito).

---

## 20. CERRADO: producción volvió a reportar sus errores — 2026-08-27

§19 quedó con una causa acorralada pero sin determinar. Se determinó, se
arregló y se verificó de punta a punta.

### La causa

`register()` de `instrumentation.ts` **no se ejecuta en el runtime de Vercel**.
Como era el único que cargaba `sentry.server.config.ts`, nadie llamaba a
`Sentry.init()`, y los ~84 `captureException`/`captureMessage` del web
escribían a un SDK apagado. Eso **no falla**: es un no-op mudo.

Medido con `probeSentrySdk` (#237) contra producción:

```
sentry-sdk: fail — "Sentry.init() no dejó un cliente activo en este runtime"
```

Segunda señal independiente, en la MISMA invocación (arranque en frío
provocado a propósito): el visor de logs de Vercel mostró el request con la
columna Messages **vacía** — faltaba el `console.info('instrumentation ok')`
que `register()` escribe al final.

### El arreglo (#238)

Mover el encendido al grafo normal de módulos, exactamente como el worker de
Railway —donde Sentry **siempre** funcionó— lo hace con `initWorkerSentry()`:

| Archivo | Rol |
|---|---|
| `src/shared/observability/sentry-web-init.ts` | La config, detrás de `ensureWebSentry()`, idempotente |
| `src/lib/sentry.ts` | La llama antes de capturar — es el cuello de botella de los ~84 call sites |
| `sentry.server.config.ts` | Queda delegando, para los entornos donde `register()` sí corre |

### La prueba

`POST /api/csp-report` con marca única a las **19:17:21 UTC**, y el issue en
Sentry con **ese mismo timestamp**:

```
WARNING  CSP violation: script-src blocked https://sonda-final-191720.example.invalid
         último 2026-08-27T19:17:21.009000Z
```

Y la sonda pasó de `fail` a:

```
sentry-sdk: ok — "evento entregado por el SDK — NODE_ENV=production,
                  environment=production, dsn=presente, eventId=sí, flush=ok"
```

Un error capturado por el camino real, desde el runtime de Vercel, llegando a
Sentry. **El hallazgo se cierra.**

### Dos regresiones propias en el camino, las dos del MISMO tipo

`instrumentation.ts` y todo lo alcanzable desde `middleware.ts` **también se
compilan para el runtime EDGE**, donde `process.stdout`/`process.stderr` no
existen:

1. **#233** metió `process.stderr` en `bootLog` → rompió el
   `valueInjectionLoader` de `@sentry/nextjs`. Corregido en **#235**.
2. **#238** creó la cadena `middleware.ts → rate-limit/apply.ts →
   @/lib/sentry → sentry-web-init.ts → error-sink.ts → logger.ts`, y el
   `process.stdout` del logger **volteó el deploy entero**. Corregido en
   **#239** pasando el logger a `console`.

**Regla que queda**: en este repo, cualquier archivo alcanzable desde
`middleware.ts` usa `console`, nunca `process.stdout`/`process.stderr`.

### Dos lecciones de método, que costaron caro

**Una sonda mal apuntada fabrica hallazgos falsos.** El "discriminador
`/monitoring`" de §19 era eso: se pedía la ruta sin los query params que su
rewrite exige. Retractado en #236. Van tres veces en esta auditoría.

**Un deploy fallado deja producción con el commit anterior.** El de #238 falló,
así que la sonda seguía dando `fail` y parecía que el arreglo no servía. Antes
de creerle a una medición post-merge hay que **verificar que el commit esté
vivo** (`get_deployment` sobre el dominio). Del mismo modo, la primera
verificación local del #239 corrió con el árbol tres PRs atrás —sin la cadena
que rompe— y no probaba nada; se detectó porque la suite bajó de 3763 a 3753
tests.
## 21. Los últimos hallazgos de la matriz, revisados y esta vez PROBADOS contra infra real — 2026-08-27

Seis hallazgos quedaban abiertos: M-8, M-9, M-10, B-13, B-15, B-16, B-18. Se
investigaron los seis con evidencia fresca. Dos de ellos (M-10, B-16)
llegaron a tener un fix propuesto que **se probó contra un build/DB real
antes de proponerlo — y los dos fallaron esa prueba**, por razones que el
análisis por grep/lectura de código no podía haber visto. Se documentan acá
los dos intentos fallidos completos porque el próximo que lo intente (humano
o IA) no debería repetirlos.

### B-18 CERRADO — MX/SPF del apex, confirmado con DNS fresco

`nslookup -type=MX turnogol.app` devuelve los 3 MX de Cloudflare Email
Routing (`route{1,2,3}.mx.cloudflare.net`) y `nslookup -type=TXT turnogol.app`
devuelve `v=spf1 include:_spf.mx.cloudflare.net ~all`. Los dos efectos
colaterales que el paso 8 de la Tanda 2 (§3) esperaba que Email Routing
agregara ya propagaron. **Cerrado, sin acción.**

### M-8 — sigue en el estado ESPERADO, no es un hallazgo pendiente de acción

`nslookup -type=TXT _dmarc.turnogol.app` → `v=DMARC1; p=none; rua=mailto:dmarc@turnogol.app`.
Sigue en `p=none` porque todavía no pasaron las ~2 semanas de reportes desde
el 2026-08-25 (se cumplen ~2026-09-08). Nada que hacer hasta esa fecha.

### B-15 — sigue abierto, es cambio de panel (Cloudflare), no de código

`nslookup turnogol.app` → `216.198.79.1` (A record de Vercel), sin migrar al
CNAME recomendado (`baf912ebe0c35da4.vercel-dns-017.com`). No hay vía de
API/MCP para esto — es un cambio de DNS en el panel de Cloudflare que le
corresponde hacer a Lazar. La IP actual es válida y funciona; no es urgente.

### B-13 — el MCP de Supabase de esta sesión solo ve la org de producción

`list_organizations()`/`list_projects()` devuelven UNA sola organización
("turnogol production") y UN solo proyecto (el `ACTIVE_HEALTHY` de
producción, `dpzicetvrgqlwfrqlaek`). Los 3 proyectos pausados que Lazar
recuerda haber visto viven en organizaciones/cuentas distintas a las que este
token de MCP tiene acceso — no es que no existan, es que esta sesión no
puede verlos. Para decidir si borrarlos o no, hay que mirarlos con la cuenta
que sí tiene acceso (selector de organización en supabase.com/dashboard).

### M-9 — sin cambios ejecutados, con una propuesta concreta de 4 reglas

Sigue vigente la decisión de §5.1 de NO poner rate-limit ciego en el borde
(rompería locales con varios empleados en el mismo WiFi, y el webhook de MP
no se puede frenar sin arriesgar pagos). Pero "no bloquear ciego" dejó una
brecha real: nada en el borde frena a un atacante que reparte intentos de
login entre muchos emails desde una sola IP (el rate-limit de runtime keyea
por EMAIL, no por IP). Propuesta para tipear a mano en
Panel Vercel → Firewall → Rules → Add Custom Rule (Vercel no expone esto por
API/MCP — se buscó explícitamente y no existe la tool):

| Regla | Path | Mitigación | Por qué |
|---|---|---|---|
| Rate limit API pública | prefix `/api/public` | 60 req/60s por IP → Deny | Corta ANTES de gastar la invocación; más alto que el runtime (30/60s) para no duplicar el mismo corte dos veces |
| Challenge login staff | `/login` POST | 20 req/5min por IP → **Challenge** (no Deny) | El runtime ya frena por email; esto cubre IP rotando emails sin castigar un local compartido |
| Rate limit magic-link jugador | `/ingresar` POST | 15 req/5min por IP → Deny | El jugador entra desde su propio dispositivo, no aplica el riesgo de "oficina compartida" |
| Log-only webhook MP (opcional) | `/api/webhooks/mercadopago` | 150 req/60s por IP → **Log**, nunca Deny/Challenge | Visibilidad sin arriesgar pagos perdidos por reintentos cortados |

### M-10 — INTENTADO Y REVERTIDO: nonce + strict-dynamic no es viable en esta app tal como está armada

Se implementó CSP con nonce por request vía `middleware.ts` para reemplazar
`'unsafe-inline'` en `script-src`. Dos rondas de revisión adversarial con
contexto fresco encontraron, en orden, dos problemas reales:

**Ronda 1**: el hash SHA-256 hardcodeado para el script inline de next-themes
(el único script propio que quedaba, para no forzar `headers()` global y
preservar el ISR del portal de torneos) no coincidía con el script real —
next-themes lo hubiera bloqueado en cada página, con FOUC de tema y spam de
reportes CSP a Sentry. Se corrigió midiendo contra un `pnpm build && pnpm start`
REAL (Turbopack) en vez de simular el render con `react-dom/server`/`tsx` —
**medido que ninguna simulación coincide con lo que Turbopack termina
emitiendo**: tres cálculos distintos (el hardcodeado original, el que
recalculó el primer reviewer con react-dom/server, y el medido contra el
build real) dieron TRES hashes distintos entre sí.

**Ronda 2, con el hash ya corregido**: un segundo reviewer adversarial,
verificando con Playwright contra el MISMO build de producción real, encontró
que **React nunca hidrata en ninguna página estática/SSG/ISR** — `/`,
`/precios`, `/login`, `/ingresar`, `/terminos`, `/privacidad`, `/blog/*`, y
el resto de las rutas `○`/`●` del build. La documentación de Next.js
(empaquetada en `node_modules/next/dist/docs/.../content-security-policy.md`)
lo dice explícito: los nonces se inyectan en SSR dinámico, nunca en páginas
generadas en build time porque ahí no existe ni request ni response headers
— y agrega textual "when you use nonces in your CSP, all pages must be
dynamically rendered". Confirmado con Chrome real vía Playwright:
`/precios` tira 18 violaciones de CSP (chunks JS + scripts de hidratación
bloqueados) y `window.next` (el runtime hidratado) da `false` — la página
queda HTML puro sin interactividad. `/explorar` (ruta dinámica) sí hidrata
bien, confirmando que el mecanismo funciona, solo que no aplica a estáticas.
Esto es **más grave que el problema original**: hubiera roto el login y la
landing en producción real.

**Revertido por completo** (`middleware.ts`, `next.config.ts`,
`src/shared/security/csp.ts`, tests — vuelto al estado con `unsafe-inline`).
M-10 sigue abierto. Cerrarlo bien requiere una decisión de arquitectura, no
un fix de código — opciones, ninguna aplicada:

1. CSP por hash (`experimental.sri` de Next.js) para todos los scripts
   propios en vez de nonce — evita el problema de dynamic-only, pero tiene el
   mismo riesgo de fragilidad que ya se vio con el hash de next-themes.
2. Forzar `dynamic = 'force-dynamic'` en las rutas públicas — pierde ISR/SSG
   (el portal de torneos usa ISR 300s a propósito, ver CLAUDE.md) a cambio de
   poder usar nonce ahí.
3. Nonce solo en las rutas que YA son dinámicas, `unsafe-inline` en las
   estáticas — cierra M-10 a medias pero sin tocar el rendimiento.

**REQUIERE INPUT de Lazar**: cuál de las tres (u otra) antes de reintentar.
Adicional: ni el test unitario de CSP ni el e2e de CI (`pnpm test:e2e` corre
contra `pnpm dev`, que nunca usa la rama de producción de la CSP) hubieran
detectado ninguno de los dos problemas — cualquier reintento necesita
verificarse contra un `pnpm build && pnpm start` real con un browser real,
no contra la suite existente.

### B-16 — INTENTADO Y REVERTIDO: bloqueado por permisos de Supabase, no por código

El plan (mover `pg_trgm`/`btree_gist` de `public` a un schema `extensions`
vía `ALTER EXTENSION ... SET SCHEMA`) se armó primero por grep — sin
conectar a ninguna base, como pedía la tarea — y parecía seguro: los 3
exclusion constraints GiST de `bookings`/`abonados` se resuelven por OID, no
por nombre, así que no se iban a romper. Antes de proponerlo se escribió la
migración `080_relocate_extensions_schema.sql` y se probó contra el Postgres
local real (`pnpm supabase:reset`, mismo Docker que usa `pnpm dev`) — y
**falló**:

```
ERROR: must be owner of extension btree_gist (SQLSTATE 42501)
```

Medido el motivo: `pg_trgm`/`btree_gist` están `OWNER TO supabase_admin`, no
`postgres` — confirmado con `SELECT extowner::regrole FROM pg_extension`. El
rol `postgres` (el que corren las migraciones, local y — por el mismo
mecanismo de bootstrap — casi seguro en producción) ni siquiera puede
`SET ROLE supabase_admin` (`permission denied to set role`). La propia
documentación de Supabase, para el mismo problema con PostGIS, dice que la
salida es "contact the Supabase Support Team and ask them to run the
following SQL" — es decir, este advisor NO se puede resolver desde una
migración de la app, necesita una acción privilegiada del lado de Supabase.

Como Lazar pidió explícitamente no abrir tickets ni reclamos con
proveedores, **B-16 queda sin acción viable dentro de este alcance**. Se
revirtió la migración (borrada de `src/shared/db/migrations/` y de
`supabase/migrations/`, DB local vuelta a `pnpm supabase:reset` limpio hasta
079). Impacto real si se deja así: cosmético — dos funciones de `pg_trgm`
(`similarity`, `word_similarity`) quedan expuestas como RPC de PostgREST sin
uso real, y el advisor de Supabase sigue marcando WARN. Sigue 🟢 Bajo,
ahora con la razón real de por qué no se cerró documentada en vez de
quedar como "pendiente" sin más.

### La lección repetida, dos veces en la misma tarde

Un diagnóstico armado solo con grep/lectura de código sonaba razonable las
dos veces (M-10 y B-16) y las dos veces algo que solo aparece corriendo
contra infraestructura real —el bundler de verdad, el rol de Postgres de
verdad— lo tumbó. Las dos veces se paró ANTES de proponer el PR, no después
de romper producción, porque se corrió la prueba real primero. Reafirma
[[harness-auditoria-mide-el-pasado]]: medir contra una simulación de la cosa
no es medir la cosa.

---

## 22. El canal a la base ahora VALIDA, y dos cosas más que cerraron midiendo — 2026-08-27

Misma tarde, después de §21. Tres frentes: el pendiente más viejo de TLS
(que resultó accionable y se cerró), dos advisors nuevos de Supabase que no
estaban en la matriz, y la decisión de M-10 que §21 había dejado como
REQUIERE INPUT — resuelta con medición en vez de con opinión.

### 22.1 🔴→✅ El canal a Postgres cifraba pero no validaba contra quién

**El agujero.** `src/shared/db/ssl.ts` devolvía `{ rejectUnauthorized: false }`
para todo host remoto. Eso cifra el tráfico pero **no comprueba el
certificado del servidor**: cualquiera capaz de desviar el tráfico hacia el
pooler puede presentar el suyo y leer todo lo que pasa, credenciales de
Postgres incluidas. El propio archivo lo tenía anotado como pendiente
("validar de verdad exige empaquetar la CA de Supabase") y este informe
también, en §11. Nadie lo había tocado.

Afecta a los **tres** pools a la vez, porque los tres salen de esa función:
app (`turnogol_app`), worker (`turnogol_worker`) y pg-boss. Y a los dos
runtimes: Vercel y Railway.

**La premisa que faltaba, y que era medible.** El obstáculo declarado era que
nadie había confirmado que el certificado del **pooler** (Supavisor) validara
con la CA raíz que Supabase publica para conexión directa. Se midió:

```
$ openssl s_client -connect aws-1-sa-east-1.pooler.supabase.com:5432 -starttls postgres
depth=0 CN=*.pooler.supabase.com
depth=1 CN=Supabase Intermediate 2021 CA
depth=2 CN=Supabase Root 2021 CA
verify error:num=19:self-signed certificate in certificate chain
```

Encadena a `Supabase Root 2021 CA`. El "error" es simplemente que esa raíz no
está en el almacén de confianza del sistema — es exactamente el síntoma que se
espera antes de agregarla. Con la raíz como CA de confianza y verificación de
hostname activada:

```
Verification: OK
Verify return code: 0 (ok)
```

**Y la raíz es la oficial, no una copiada del handshake.** Se bajó de
`supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`
y se comparó contra la que manda el pooler. Huellas SHA-256 idénticas:
`80:70:25:AD:…:E6:CA:FA`.

**La prueba en el cable, con las dos librerías y control negativo.** Este
repo ya se rompió dos veces (25 y 26/8) por asumir el comportamiento de TLS
de una librería, o por medirlo con la equivocada. Así que se midió con las
dos —`postgres` (porsager, pools de la app) y `pg` (node-postgres, pg-boss)—
en los dos puertos, contra el pooler de **producción**. Sin credenciales: la
autenticación pasa DESPUÉS del handshake, así que una contraseña
deliberadamente inválida separa "falló el TLS" de "falló el login":

| config | porsager | pg |
|---|---|---|
| CON la CA | `28P01 password auth failed` → **validó** | `28P01` → **validó** |
| sin validar (lo viejo) | `28P01` → conecta sin validar | `28P01` |
| **SIN la CA (control −)** | `self-signed certificate in certificate chain` | idem |

La tercera fila es la que le da valor a las otras dos: prueba que la sonda
**sí sabe** detectar un TLS que no valida, así que el verde de la primera no
es un falso positivo. 12 mediciones, todas consistentes.

**El arreglo.**
- `src/shared/db/supabase-ca.ts` (nuevo): la raíz como **constante de
  TypeScript**, no como archivo. A propósito: el módulo lo cargan Vercel
  (donde el file tracing de Next decide qué archivos viajan) y Railway; un
  string en el grafo de módulos lo bundlean los dos por definición, un
  archivo suelto hay que acordarse de incluirlo en ambos y el modo de falla
  de olvidarse es que la app no conecta.
- `dbSslOptions()` pasa a devolver `{ ca, rejectUnauthorized: true }`.
- `scripts/probe-db-tls.ts` (nuevo): la sonda de arriba, permanente y sin
  credenciales, importando la constante real. Si el control negativo no
  falla, el script sale con código 1 en vez de cantar victoria.
- `tests/unit/db-ssl-options.test.ts`: el candado sube de nivel. Además de
  las aserciones nuevas, valida la CA embebida **como certificado X.509 de
  verdad** (`node:crypto`), no como string: subject correcto, huella
  SHA-256 exacta, `ca: true`, y sin vencer. Si alguien se come un salto de
  línea del base64, salta el test y no producción.
- `Dockerfile.worker`: el comentario de ahí mandaba usar conexión directa
  `:5432` y `?sslmode=require`. **Las dos cosas son falsas y la segunda es la
  que volteó el worker el 25/8** — la conexión directa ya no existe
  (ENOTFOUND) y el `sslmode` del DSN hoy no decide nada. Reescrito con el
  porqué, para que nadie lo lea y reintroduzca el incidente.

**El riesgo asumido, dicho de frente.** La función la comparten los tres
pools: si la CA dejara de servir no se cae uno, se caen los tres. Es un modo
de falla **ruidoso**, preferible al anterior donde todo andaba igual sin
validar nada. La raíz vence el **2031-04-26**. A propósito no se agregan las
CA del sistema (exigiría importar `node:tls`, y este repo se rompió dos veces
hoy mismo por meter una API de Node en un archivo que alguien arrastró al
runtime edge) ni un override por variable de entorno (reintroduciría
justamente la decisión de TLS editable desde un panel que este archivo
eliminó). Contra un host remoto que no sea Supabase esto falla al conectar:
hoy no existe ninguno —CI y dev van a `127.0.0.1`, que ni negocia TLS— y si
aparece, falla a la vista en vez de conectarse sin validar.

### 22.2 Dos advisors nuevos de Supabase: reales, no explotables, cerrados igual

`get_advisors(security)` del 2026-08-27 trajo 4 WARN que no estaban en la
matriz, sobre dos funciones: `audit_system_admins_change()` y
`trg_courts_recalc_from_price()`. Las dos son SECURITY DEFINER y conservaban
el `GRANT EXECUTE` a PUBLIC que Postgres da por default, heredado por `anon`
y `authenticated`. Es el mismo hallazgo que la migración 056 cerró para
`recalc_tenant_from_price`, que se ocupó solo de esa y dejó estas dos.

**Medido: NO eran explotables.** El advisor dice que son invocables vía
`/rest/v1/rpc/<nombre>`. Como `anon`, las dos:

```
ERROR:  trigger functions can only be called as triggers
```

Postgres mismo rechaza llamar directo a una función `RETURNS trigger`, tenga
o no EXECUTE quien llame. A diferencia del caso de 056, donde
`recalc_tenant_from_price` (`RETURNS void`) **sí** era invocable y recalculaba
tenants ajenos salteándose RLS.

Se cierran igual, por una razón que no es la seguridad: **cuatro WARN
permanentes entrenan a ignorar el panel de advisors**, y el próximo WARN real
se pierde ahí adentro.

**Medido también que revocar no rompe el trigger** — que era el único riesgo
verdadero. Postgres chequea EXECUTE al hacer `CREATE TRIGGER`, no cada vez
que el trigger dispara. Con EXECUTE ya revocado de PUBLIC/anon/authenticated
(y `has_function_privilege('turnogol_app', …)` devolviendo `false`), un
INSERT en `courts` conectado **como** `turnogol_app` disparó igual el
trigger: `tenants.from_price_cents` pasó de NULL a 800000, `court_formats` a
`{5}`, `court_surfaces` a `{synthetic_grass}`.

Migración `080_trigger_function_grants.sql`. Aplicada desde cero con
`pnpm supabase:reset`. Gate: **aislamiento 170/170** e **integración
994/994** en verde.

### 22.3 M-10 resuelto: no es un agujero, es defensa en profundidad — y se documenta como riesgo aceptado

§21 dejó M-10 como REQUIERE INPUT entre tres arquitecturas. Antes de elegir
una, la pregunta que faltaba era más básica: **¿cuánto riesgo real cubre ese
`unsafe-inline`?** Se relevó la superficie de XSS completa:

- **3 `dangerouslySetInnerHTML` en todo `src/`**. Dos con datos constantes del
  código (FAQ de `/precios`, metadata de artículo). El tercero, `JsonLd.tsx`,
  sí serializa datos de tenant que vienen de la DB — pero `escapeForScriptTag`
  (`src/lib/seo/structured-data.ts:119-134`) ya neutraliza `<`, `>`, `/`,
  U+2028 y U+2029 justamente para matar un `</script>` embebido. El propio
  código tiene el threat-model escrito ahí, nombrando el vector.
- **Sin campo de URL libre en el schema.** Teléfono y WhatsApp pasan por
  `telHref`/`buildWhatsappUrl`, que hacen `.replace(/\D/g, '')` — un
  `javascript:alert(1)` guardado ahí queda reducido a sus dígitos. `mapsUrl`
  usa `encodeURIComponent`.
- **Todo el texto libre visible a terceros** (nombre/descripción de complejo,
  reseñas de jugadores, nombres de equipo del portal público de torneos) sale
  por interpolación JSX, que React escapa. Cero `innerHTML`,
  `document.write`, `eval` o `new Function` en el repo.
- **Ninguno de los 39 route handlers** devuelve `text/html`.

**Veredicto: sin superficie encontrada.** Hoy `'unsafe-inline'` es una
debilidad de defensa en profundidad **sin vía de explotación práctica**, no un
agujero activo. Dado eso, y que §21 midió que la alternativa con nonce rompe
la hidratación de toda la superficie pública estática, la decisión es
**aceptar el riesgo y bajar M-10 de 🟡 a 🟢**, con dos condiciones de
reapertura escritas para que no se olviden:

1. Si se agrega un **campo de URL libre** editable por el complejo (ej. "sitio
   web"), sin sanitizador de esquema.
2. Si se agrega un **`dangerouslySetInnerHTML` nuevo** con datos que no sean
   constantes del código, sin la disciplina de escapado de
   `structured-data.ts`.

Cualquiera de las dos vuelve a hacer de `unsafe-inline` un riesgo real, y ahí
la conversación de arquitectura de §21 se reabre con la evidencia ya juntada.

---

## 23. Los tres de panel que faltaban, cerrados con la mano del dueño — 2026-08-28

Los tres hallazgos que quedaban abiertos no eran de código: vivían en paneles
de terceros. Se cerraron los tres el mismo día, uno por medición y dos
tocando el panel. Queda **solo M-8**, que es de calendario.

### 23.1 M-9 — Firewall: de una regla a cinco

La matriz decía "sin una sola regla propia". **Era falso al momento de
cerrarlo**: ya existía `Block common vulnerability paths` → Deny, y es la que
explica el tráfico del día — **870 permitidos contra 2.8k denegados**, casi
todo bots buscando WordPress. El número de §5.1 (134 denegados) era de otro
período.

Se publicaron las 4 reglas propuestas en §21. Vercel las deja *staged* y pide
un **Publish** explícito, así que se crearon las cuatro y se publicaron de una
sola vez:

| Regla | Condición | Ventana | Acción |
|---|---|---|---|
| Rate limit API publica | path empieza con `/api/public` | 60 req / 60 s por IP | **429** |
| Rate limit login staff | path `/login` **AND** método POST | 20 req / 5 min por IP | **Challenge** |
| Rate limit magic link jugador | path `/ingresar` **AND** método POST | 15 req / 5 min por IP | **429** |
| Observar webhook MercadoPago | path `/api/webhooks/mercadopago` | 150 req / 60 s por IP | **Log** |

Tres desvíos deliberados respecto de la propuesta, y el motivo de cada uno:

1. **429 en vez de Deny (403)** donde el plan decía Deny. Vercel ofrece "Too
   Many Requests (429)" como acción propia del rate limit, y es el código
   semánticamente correcto: le dice al cliente *reintentá más tarde* en vez de
   *prohibido*. Bloquea igual.
2. **Challenge y no Deny en `/login`**, tal como se había razonado: un complejo
   entero sale por el WiFi del local con **una sola IP**. Un Deny ahí deja
   afuera a todo el personal; un Challenge solo le pide verificarse.
3. **Log y nunca Deny en el webhook de MP.** MP reintenta en ráfagas; un
   bloqueo ahí es un pago perdido. La regla existe para *ver*, no para frenar.

**Costo**: Vercel cobra el rate limiting a **USD 0,50 por millón de requests
permitidos** (los bloqueados son gratis). Con 870 permitidos/día en todo el
sitio, son centavos por mes.

Rutas confirmadas contra el código antes de escribirlas: `/login` (staff) e
`/ingresar` (jugador) existen en `src/app/(auth)/`. Las dos son Server
Actions, que hacen POST a su propia ruta — o sea que la condición de método
sí agarra el submit del formulario.

### 23.2 B-13 — no existían

Se abrió el panel de Supabase con la sesión de Lazar: **una** organización
(`turnogol production`, Pro) con **un** proyecto (`Laza223's Project`,
sa-east-1, Nano), y el filtro de estado en blanco — o sea mostrando activos
**y** pausados. Los 3 proyectos `INACTIVE` del hallazgo original salieron de
otra cuenta, o ya fueron borrados. No hay nada que limpiar.

### 23.3 B-15 — apex y `www`, los dos

El panel de Vercel mostraba **"DNS Change Recommended" en los dos dominios**,
no solo en el apex como decía la matriz. Los dos apuntan al mismo destino.

Antes de escribir nada se verificó que el destino resolviera —
`baf912ebe0c35da4.vercel-dns-017.com` → `216.150.16.1` + `216.150.1.1`, **dos
IPs contra la única que tenía el apex**. Y se empezó por `www`, que es el de
menor impacto (solo hace 308 al apex): recién con `www` verificado en verde se
tocó el apex.

Vercel aclara en su propio panel que *"los registros legacy van a seguir
funcionando"*. Esto es futuro-proof —les permite rotar IPs sin que el dueño
toque nada—, no un arreglo de algo roto.

Estado final, medido: los dos dominios en **"Valid Configuration"**, apex
`200`, `www` `308 → https://turnogol.app/`, `/api/status` `200`,
`ssl_verify_result=0` y los tres MX de Cloudflare Email Routing intactos.

**El apex lo escribió Lazar**: el clasificador de permisos bloqueó dos veces
la escritura sobre el DNS de producción, y no se rodeó. Es la clase de acción
para la que ese freno existe.

### 23.4 De yapa: el archivo que leen las IAs mandaba a un dominio inexistente

Lazar preguntó si las reglas nuevas no bloquearían a los bots que pueden
recomendar TurnoGol. **No lo hacen** —tres de las cuatro miran POST de
formularios, y un crawler solo hace GET— y se midió en vez de afirmarlo:
GPTBot, ClaudeBot, PerplexityBot, Googlebot, OAI-SearchBot y bingbot devuelven
**200** en `/`, `/explorar`, `/precios` y las fichas de complejo.

Pero la revisión destapó un bug real: `public/llms.txt` —lo único del sitio
escrito para que un LLM entienda el producto— tenía sus dos únicos enlaces
apuntando a **`turnogol.com`**, que es NXDOMAIN. Misma clase que B-14
(`media.turnogol.com`). Corregido en el PR #246, ya en producción.

También quedan anotados los **tres interruptores que pueden excluir al sitio
de las IAs**, ninguno en el código y ninguno avisa al prenderse:

| Dónde | Qué | Valor correcto hoy |
|---|---|---|
| Vercel → Firewall → Bot Management | AI Bots | `Allow` |
| Vercel → Firewall → Bot Management | Bot Protection | `Off` |
| Cloudflare → AI Crawl Control | robots.txt gestionado | **apagado** |

El tercero es el traicionero: al prenderse, Cloudflare **reescribe el
robots.txt** para declarar que el contenido no puede usarse para IA.

Dato que importa más que los tres: AI Crawl Control registra **0 solicitudes y
0 fallidas** en 24 h en las 10 familias de crawlers. No los bloquean —
todavía no vienen. Eso no se arregla con infraestructura.
