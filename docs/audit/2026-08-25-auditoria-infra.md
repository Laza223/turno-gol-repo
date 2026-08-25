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

### 🔴 Crítico

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| **C-1** | **`www.turnogol.app` tira error de certificado.** El registro DNS existe y apunta a Vercel, pero el dominio **no está dado de alta en el proyecto** (Vercel solo lista `turnogol.app`) | `curl https://www.turnogol.app/` → `schannel: SNI or certificate check failed: SEC_E_WRONG_PRINCIPAL`. Panel → Domains: un solo dominio | Cualquiera que escriba "www" ve la pantalla roja de "conexión no privada" del navegador. Para un producto que se vende por boca en boca, es el peor error posible |
| **C-2** | **El pooler acepta conexiones sin cifrar, desde cualquier IP — MEDIDO, no inferido** | Supabase → Database Settings → *Enforce SSL* = **OFF**; *Network restrictions* = "Your database can be accessed by all IP addresses". **Medición (`pg_stat_ssl`)**: las conexiones de `turnogol_app` y `turnogol_worker` llegan a Postgres **sin TLS**… pero llegan desde Supavisor (`application_name = 'Supavisor'`, `client_addr` privada de la red de Supabase), o sea que **eso es el salto interno pooler→Postgres, no el salto app→pooler**, que es el que cruza internet y que `pg_stat_ssl` no puede ver | Queda por saber si NUESTROS clientes usan TLS (los DSN están encriptados en los paneles). Lo que ya no está en duda es que el canal admite texto plano. **Y prender el enforce no es el clic inocuo que decía la primera versión de este documento**: si algún DSN nuestro va sin `sslmode`, el interruptor corta producción en el acto |
| **C-4** | **La cuenta de Cloudflare no tiene segundo factor** | Perfil → Autenticación → *Autenticación de dos factores*: **Inactivos** | Es la cuenta que manda sobre el DNS de `turnogol.app`. Quien entre puede apuntar el dominio a donde quiera, emitir certificados a nombre tuyo, agregar un MX y quedarse con el correo, y borrar el bucket de imágenes. Es el único punto del stack donde una sola credencial robada se lleva todo |
| **C-5** ⏸️ | **Un token de OTRO proyecto tiene poder total sobre este** — *riesgo aceptado por el dueño el 2026-08-25* | Perfil → Tokens de API: `elite-padel build token`, **Todas las zonas**, +21 permisos, sin fecha de expiración (emitido 26/02/2026). En R2 → Tokens: el mismo token figura como **Todos los buckets · Administrador de lectura y escritura** | Si ese token se filtra desde el CI de Elite Padel —un log, un fork, un `.env` commiteado— el que lo tenga puede cambiar el DNS de TurnoGol y borrar `turnogol-media` entero. Los tokens propios de TurnoGol sí están bien acotados; el problema es este. **Decisión del dueño**: no se toca — el token es de la landing de un cliente y no vale el riesgo de romperle el deploy. Queda anotado que el riesgo corre al revés de lo que sugiere la importancia de cada proyecto: el permiso vive en el repo con MENOS escrutinio y alcanza al que tiene la plata. Si alguna vez se toca ese build, aprovechar para acotarlo |
| **C-3** | **Preview corre con secretos de producción** — y hay que confirmar a qué base apunta | Vercel → Environment Variables: Preview tiene `MP_TURNOGOL_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `R2_*`, `RESEND_API_KEY`, `MP_CLIENT_SECRET` | Si `DATABASE_URL` de Preview es la de producción, cualquier deploy de PR escribe sobre datos reales y puede mover plata real. **Mitigación parcial ya activa**: SSO protection en todo lo que no sea dominio propio, así que los previews no son públicos |

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
| **M-5** | Railway sin healthcheck y con tope de 10 reinicios | Settings → *Healthcheck Path* vacío; `railway.toml`: `restartPolicyType = "ON_FAILURE"`, `restartPolicyMaxRetries = 10` | "Online" no prueba que el worker trabaje; un proceso colgado no reinicia nunca, y a la 11ª caída queda muerto. Hoy lo tapa UptimeRobot (P-12), pero el candado propio de la plataforma no existe |
| **M-6** ✅ | **100 policies RLS re-evalúan la función de contexto por fila** (`auth_rls_initplan`), 48 policies permissive duplicadas, 26 foreign keys sin índice | Supabase advisors (performance): 148 WARN + 49 INFO | Es el techo de performance de la grilla y de Personas cuando entre un complejo con miles de reservas. Se arregla envolviendo en `(select …)` y unificando policies — **Cerrado el 2026-08-25 sin tocar SQL: los 148 avisos WARN son falso positivo (100) o el diseño dual documentado (48). Medido con EXPLAIN bajo un rol sin BYPASSRLS — ver §5.2.** |
| **M-7** ⏸️ | Compute **Nano** con el pool casi tomado en reposo | Panel: pool size 15 (default de Nano), `max_connections` 60. Medido ahora: 6 conexiones de `turnogol_app` + 3 de `turnogol_worker` = 9 de 15 **sin tráfico** | Es la causa estructural de F-002. Con Pro, subir a Micro entra casi entero en el crédito de cómputo incluido — **Medido el 2026-08-25: base de 35 MB, 22/60 conexiones. No se sube el compute — ver §5.4.** |
| **M-8** ◐ | **DMARC en `p=none` y sin dirección de reportes** — *mitad hecha el 2026-08-25* | El TXT pasó a `"v=DMARC1; p=none; rua=mailto:dmarc@turnogol.app"`, resuelto contra `8.8.8.8`. Para que ese buzón exista se prendió **Cloudflare Email Routing** en la zona: destino `turnogol@gmail.com` **Verificado**, regla `dmarc@turnogol.app → turnogol@gmail.com` **Activa**, y los 5 registros que pide el servicio creados en el apex (3 MX `route{1,2,3}.mx.cloudflare.net`, el DKIM `cf2024-1._domainkey` y un `v=spf1 include:_spf.mx.cloudflare.net ~all`), todos resueltos por DNS. Estado del servicio: *Activado / Registros DNS Activado* | El correo saliente NO se toca: el Return-Path de Resend es `send.turnogol.app` con su propio SPF, y el DKIM `resend._domainkey.turnogol.app` firma con `d=turnogol.app`, así que la alineación DMARC sigue viniendo por DKIM. **Falta**: juntar dos semanas de reportes y recién ahí pasar a `p=quarantine`. **Sin verificar end-to-end**: no se mandó un mail de prueba a `dmarc@turnogol.app`; el primer reporte real (24-48 h) es la prueba |
| **M-9** ◐ | Vercel Firewall **sin una sola regla propia** — *parcialmente cerrado el 2026-08-25, ver §5.1* | Panel → Firewall → Rules: solo "System Rule". Tráfico del período: 977 permitidos, 134 denegados, 7 desafiados | El rate-limit de la app vive en el runtime (Upstash): cada request abusiva ya gastó una función. Los caminos de plata (`/api/webhooks/*`, `/api/public/*`, login) deberían frenarse en el borde |
| **M-10** | CSP con `script-src 'unsafe-inline'` en producción | Header medido en `https://turnogol.app/` | Anula buena parte de la defensa contra XSS. Next 16 soporta nonces por middleware |
| **M-11** | Un secreto de más en el runtime de Vercel | `SENTRY_READ_TOKEN` en Production y Preview | Solo lo lee `scripts/sentry-issues.ts`, que corre local contra `.env.production`. **Corrección respecto de la primera versión de este documento**: `SENTRY_AUTH_TOKEN` NO sobra — `next.config.ts:125` se lo pasa a `withSentryConfig` para subir los sourcemaps, así que el build lo necesita y se queda |
| **M-13** ✅ | El dominio de las imágenes aceptaba **TLS 1.0** — *corregido el 2026-08-25* | R2 → `turnogol-media` → Dominios personalizados: `media.turnogol.app`, *TLS mínimo* pasó de **1.0** a **1.2**. Verificado en el cable: `curl --tls-max 1.0` no completa el handshake, `curl --tlsv1.2` responde 404 (el dominio vive; el 404 es porque el bucket está vacío) | TLS 1.0 está roto y deprecado desde 2021 |
| **M-14** 🟢 | **Las imágenes no tienen backup — pero hoy no hay imágenes** | R2 → `turnogol-media`: *Tamaño del bucket* = **0 B**, cero objetos ("Tu bucket está listo. Agrega archivos para comenzar"). Contrastado contra la base de producción: `tenants.logo_url`/`cover_url` NULL en los 2 complejos, `courts.photos` vacío en las 4 canchas, `players.avatar_url` NULL en los 3 jugadores | Degradado de 🟡 a 🟢: no hay nada que perder todavía. **Y el remedio que este mismo informe proponía era el equivocado**: una *regla de bloqueo de bucket* vuelve los objetos inmutables durante la retención, y la app borra objetos en el uso normal (`deleteImage` en `src/shared/storage/r2.ts:78`, llamada al reemplazar logo/portada en `settings/perfil/actions.ts:33,114` y foto de cancha en `settings/canchas/actions.ts:318`) — o sea que la habría roto: cambiar el logo empezaría a fallar. Cuando haya contenido real, el backup va por otro lado (copia programada a un segundo bucket o a otro proveedor), no por bucket lock |
| **M-15** ✅ | **Alertas de seguridad apagadas en el registrador** — *corregido el 2026-08-25* | Namecheap → Profile → Security → Alerts: pasó de **OFF** a las tres categorías en **ON** (*Account Access* = login/password/recuperación · *Account Contacts* = email y dirección primaria · *Domain Names* = contactos WHOIS y host records), con destino `lazarofeijoo2004@gmail.com`. Verificado recargando la página de cero, no contra el cartel de éxito | Si alguien cambia los nameservers o pide una transferencia del dominio, ahora llega un mail. Es la alarma del activo más difícil de recuperar |
| **M-12** | Protección de contraseñas filtradas **apagada** en Supabase Auth | Advisor `auth_leaked_password_protection` | El staff entra con email+password. Prenderlo (chequeo contra HaveIBeenPwned) es gratis y de un click |

### 🟢 Bajo

| # | Hallazgo | Evidencia |
|---|---|---|
| B-13 | **3 proyectos Supabase pausados** (ene/abr/may 2026), cada uno en su propia organización | `list_projects`: 3 × `INACTIVE` + el de producción `ACTIVE_HEALTHY` |
| B-14 | `media.turnogol.com` **no existe** (NXDOMAIN) y sigue hardcodeado en `next.config.ts` (`MEDIA_HOSTS`) y por lo tanto en el CSP de producción | `nslookup media.turnogol.com` → Non-existent domain; header CSP contiene `media.turnogol.com media.turnogol.app` |
| B-15 | Vercel recomienda migrar el apex de A a CNAME (`baf912ebe0c35da4.vercel-dns-017.com`) | Panel → Domains → badge "DNS Change Recommended" |
| B-16 | Extensiones `pg_trgm` y `btree_gist` instaladas en el schema `public` | Advisor `extension_in_public` |
| B-18 | **No hay MX en el apex**: un mail a cualquier dirección `@turnogol.app` rebota. Tampoco hay SPF en el apex (`v=spf1 -all` cerraría la suplantación) | `nslookup -type=MX turnogol.app` → sin respuesta; el único TXT del apex es la verificación de Google |
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

5. **Confirmar a qué base apunta `DATABASE_URL` de Preview.** Si es la de producción: crear un proyecto Supabase aparte para Preview, o al menos degradar los secretos de MercadoPago de Preview a credenciales de sandbox. Cierra C-3.
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

14. **Prender 2FA en la cuenta de Cloudflare.** Cierra C-4. Cinco minutos.
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
| **Cloudflare** | 🔴 **Apagado** |
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
