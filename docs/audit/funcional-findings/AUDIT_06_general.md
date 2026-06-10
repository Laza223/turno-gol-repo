# AUDIT 06 — Issues generales (transversales)

Hallazgos que cruzan varias vistas: seguridad/aislamiento, consola global, performance, accesibilidad, i18n y entorno.

---

## 🔴 1. Aislamiento de datos cross-tenant / cross-player roto (RLS no efectivo)

**El hallazgo más importante.** Detalle completo en `AUDIT_01` (sección crítica). Resumen:

- En el entorno local, el dev server conecta a Postgres como rol **`postgres`** (superusuario/owner) y las tablas (`courts`, `bookings`, `payments`, `abonados`, …) tienen RLS **habilitado pero NO forzado** (`relforcerowsecurity=f`). → **el rol bypassa todas las policies RLS**.
- Varias queries **dependen SOLO de RLS** (sin filtro `tenant_id`/`player_id` explícito) y por eso **fugan datos de otros tenants/jugadores**:
  - Perfil público `/[slug]` y disponibilidad: canchas/slots de otros complejos.
  - Grilla admin, Canchas admin (¡con botones Editar/Desactivar sobre canchas ajenas!), selector de cancha en Abonados.
  - **Reportes admin**: revenue y "por cancha" de **otros complejos** (fuga financiera).
  - **`/mis-reservas` del jugador**: reservas de **otros jugadores**.
- En contraste, **sí filtran explícito** (no fugan): el listado `/reservas` del admin y `/api/player/data-export`. → el codebase es **inconsistente** en su estrategia de aislamiento.

**Acción:** verificar el rol de DB en **producción**. Si prod usa `postgres`/owner → fuga real grave. Si usa un rol no-superusuario (`turnogol_app`) con RLS efectivo → el leak es artefacto de dev, pero (a) el entorno local no detecta regresiones de aislamiento navegando, y (b) conviene agregar filtros `tenant_id`/`player_id` explícitos (defense-in-depth) en las queries que hoy confían solo en RLS. Considerar `ALTER TABLE … FORCE ROW LEVEL SECURITY`.

---

## 🔴 2. Lockout de PIN: onboarding no setea PIN → Configuración/Equipo inaccesibles

Detalle en `AUDIT_03` y `AUDIT_04` (§PIN). Resumen:
- El wizard de onboarding (4 pasos) **nunca pide configurar el PIN de administrador**. Todo tenant nuevo queda sin `tenants.settings.staff_pin_hash`.
- `/staff` y `/settings/*` están detrás del gate "Zona protegida — Ingresá el PIN". Sin PIN configurado, ingresar cualquier valor da **"PIN no configurado. Configuralo en Ajustes → Seguridad"**, pero esa página (`/settings/pin`) está detrás del mismo gate → **catch-22 / lockout permanente** (verificado en vivo con un tenant recién onboarded).
- **Impacto de negocio:** el CTA "Elegir plan" del trial y "Conectar MercadoPago" del dashboard apuntan a `/settings/facturacion` (bloqueada) → **bloquea la conversión de trial a plan pago** y la reconfiguración posterior.
- **Inconsistencia adicional:** `/canchas` y `/reportes` (etiquetadas "Requiere PIN") **NO** aplican el gate (cargan directo; la creación de cancha funcionó sin PIN), mientras `/staff` y `/settings` SÍ. Zonas sensibles reales quedan desprotegidas.

---

## 🟡 3. CSP `connect-src` bloquea Supabase Realtime local (grilla "Sin conexión" en dev)

- Header CSP (de las respuestas): `connect-src 'self' *.supabase.co *.mercadopago.com`.
- En la grilla admin, el WebSocket de Realtime apunta a **`ws://127.0.0.1:54331/realtime/v1/websocket`** (Supabase local) → **bloqueado por CSP** → banner **"Sin conexión. Los datos pueden no estar actualizados."** y fallback a polling.
- En **producción** Supabase Realtime es `wss://<proj>.supabase.co` (sí permitido), así que probablemente funcione. Pero en **dev el realtime nunca conecta**. Conviene que el CSP de desarrollo incluya `ws://127.0.0.1:* localhost:*` (o `connect-src` dinámico por entorno) para poder probar la grilla en vivo localmente.
- El resto de los **security headers es correcto** (positivo): `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera/mic deshabilitados, geo=self), CSP con `report-uri /api/csp-report`. `img-src` incluye `*.tile.openstreetmap.org` (mapa de /explorar) y `frame-src *.mercadopago.com`.

---

## 🟡 4. Asset faltante: `/sounds/notification.mp3` → 404 en todo el panel admin

- En cada página del admin (grilla, reservas, caja, etc.) se hace `GET /sounds/notification.mp3` → **404** (×2). Es el sonido de la notificación push de reservas (CLAUDE.md: "sonido fijo"). En `public/sounds/` solo existe `README.md`.
- Efecto: cuando llega una reserva online, **no suena** (el sonido no carga). Falta agregar el archivo `public/sounds/notification.mp3`.

---

## 🟡 5. i18n: strings en inglés filtrados en UI 100% español

- **"Invalid email"** (mensaje crudo del `.email()` de Zod) en los forms de **`/reservar`** y **`/register`** al ingresar un email inválido. Patrón sistémico (falta `z.string().email({ message: '…' })`).
- **Caja** (`/caja`): la tabla de movimientos y el "Desglose por método" muestran los **valores de ENUM crudos**: TIPO **"Income"**, CATEGORÍA **"booking"**, MÉTODO **"Cash"** — en vez de Ingreso/Reserva/Efectivo. Falta el mapeo enum→label español.
- Asunto del email de magic link: **"Your Magic Link"** (template default de Supabase).

---

## 🟢 6. Capitalización de fechas: "3 De Junio" / "Junio De 2026"

- En varias vistas (perfil público, detalle de reserva admin, reportes) las fechas aparecen como **"Miércoles, 3 De Junio"** o **"Junio De 2026"** — con "De"/mes capitalizados por aplicar `text-transform: capitalize` sobre el string completo. Debería ser "3 de junio" / "junio de 2026". (En `/perfil` y `/mis-reservas`, donde se usa `toLocaleDateString` sin capitalize, sale bien.)

---

## 🟡 7. Accesibilidad: doble landmark `contentinfo` (footer) en todas las vistas `(public)`

- El layout `(public)` renderiza **dos `<footer>`** (LegalFooter con Privacidad/Términos + SiteFooter con marca/Contacto). Resultan **2 landmarks `contentinfo`** por página (explorar, perfil, disponibilidad, para-complejos, legales). Redundancia visual + confunde a lectores de pantalla. (La landing raíz `/` tiene un solo footer.)
- **Positivos a11y observados**: "Saltar al contenido" (skip link), regiones `aria-live` para notificaciones/errores, `nav` con labels, headings jerárquicos, inputs con labels asociados.

---

## 🟢 8. Meta tag deprecado (global)

- `<meta name="apple-mobile-web-app-capable" content="yes">` está deprecado; el browser sugiere agregar `<meta name="mobile-web-app-capable" content="yes">`. Viene del layout raíz → aparece en todas las vistas.

---

## 🟡 9. Performance / estabilidad

- **Polling redundante en la grilla**: con el realtime caído, la grilla hace múltiples `GET /api/bookings?date=…` seguidos (se observaron ~7 tras una sola acción). Revisar de-duplicación/intervalo.
- **Loop de reintento de WebSocket**: el WS bloqueado por CSP (tanto el de Console Ninja como, en dev, el de Supabase Realtime) reintenta agresivamente y **mantiene la página ocupada** — al punto que la captura de screenshot vía DevTools hizo **timeout** repetidamente en varias vistas (grilla, register, onboarding). Es mayormente artefacto de dev, pero el reintento sin backoff es mejorable.
- Navegación RSC fluida (sin recargas completas) en las vistas públicas; landing con ISR (`revalidate=300`).

---

## ⚙️ 10. Incidente de entorno (no es bug de código): build `.next` corrupto

- Durante la sesión, el dev server entró en un estado con la caché `.next` corrupta: chunks `_next/static/chunks/{main-app.js, app-pages-internals.js, layout.css, …}` devolvían **404 (text/html)** y `/icon` `/apple-icon` **500** por `ENOENT … .next\server\edge-chunks\wasm_*.wasm`. Esto **rompía la hidratación client-side** del panel admin.
- **No es un defecto del código fuente** — se resolvió **deteniendo el server, borrando `.next` y reiniciando** (todos los chunks 200). Probable disparador: muchas recompilaciones/navegaciones e interrupciones. Se documenta por transparencia; si reaparece de forma reproducible en `next build` (no dev), sería investigable (el route `/icon` usa runtime Edge + WASM).

---

## 📝 Notas de método y limitaciones de la auditoría

- **Auth en browser**: se usó el flujo real de magic link capturando los emails en **Inbucket** (`:54324`). Verificado para player, admin y admin-fresh.
- **Quirk de automatización (no es bug de la app)**: el `click` del MCP sobre botones con `hover:-translate-y`/`active:scale` a veces **solo enfocaba** sin disparar el submit React (landing "Buscar", `/perfil` "Guardar"). Se confirmó con `form.requestSubmit()` y verificación en DB que esos forms **sí funcionan**. **Recomendación: re-verificar manualmente** que esos botones submitean con click de mouse real en los navegadores objetivo.
- **No testeado** (bloqueado): `/staff` y `/settings/*` por el lockout de PIN; flujo de seña con MercadoPago (mock-mp/checkout, /pendiente, /error) por requerir contexto de pago; "Cerrar caja"; "Marcar ausente" (probable mismo crash que "Marcar completada").
- **Datos de prueba creados** en el tenant demo (re-seedeables con `pnpm e2e:seed`): cancha "Cancha Audit Test", movimiento de caja $5.000, reserva walk-in (luego completada falló), reserva online del player (creada y cancelada), tenant "Complejo Audit Onboarding" (admin-fresh).
- **No ejecutado** por ser destructivo/fuera de scope: borrado de cuenta del jugador, desactivar canchas ajenas, modificar el PIN del tenant en DB.
