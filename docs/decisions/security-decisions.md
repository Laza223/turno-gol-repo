# Decisiones de Seguridad — TurnoGol

> Registro de decisiones de seguridad transversales que no encajan en un ADR de
> producto (doc11) pero que el equipo necesita poder justificar en una auditoría.
> Última actualización: 2026-06-01 (hardening v1).

---

## 1. CSRF — Riesgo aceptado, sin tokens custom

### Decisión

**No** implementamos tokens anti-CSRF propios (synchronizer token / double-submit
cookie) para v1. El riesgo de CSRF se considera **aceptado** porque ya está
cubierto por varias capas del framework y del transporte, reforzadas por la
validación `Sec-Fetch-*` de §2.

### Por qué es seguro sin tokens custom

CSRF requiere que el navegador de la víctima **adjunte automáticamente sus
credenciales** a una solicitud disparada desde un sitio atacante. En TurnoGol eso
está bloqueado por capas independientes:

1. **Server Actions (mutaciones de UI interna).** Todas las mutaciones del admin
   y del jugador (forms, cancelación por jugador) usan Server Actions de Next.js,
   no route handlers (ver `CLAUDE.md` → Reglas críticas). Next.js **rechaza por
   defecto** toda invocación de Server Action cuyo header `Origin` no coincida con
   el `Host` (o `X-Forwarded-Host`) del deploy, respondiendo 403. Un sitio
   cross-origin no puede invocarlas. Es protección CSRF integrada del framework,
   sin código nuestro.
   Ref: Next.js Security — Server Actions.

2. **Cookies `SameSite=Lax`.** Las cookies de sesión de Supabase (`@supabase/ssr`,
   default `SameSite=Lax`, `HttpOnly`, `Secure` en prod) y nuestras cookies
   propias de PIN y de tenant (`sameSite: 'lax'` explícito en
   `src/app/(admin)/actions/pin.ts`, `src/shared/middleware/with-pin.ts`,
   `src/modules/tenants/actions.ts`) **no se envían** en POST cross-site. Sin
   credenciales, un POST forjado a un route handler autenticado obtiene 401.

3. **Auth obligatoria en route handlers sensibles.** Los `/api/*` que mutan estado
   pasan por `withTenant` / `withAuth` (sesión Supabase) antes de tocar la DB. Sin
   sesión válida no hay efecto.

4. **`Sec-Fetch-*` en pagos y cancelaciones (§2).** Defensa en profundidad
   adicional sobre los route handlers de dinero/reservas: un navegador moderno
   marca toda solicitud cross-site y la rechazamos en el middleware.

### Qué NO cubre (límites del riesgo aceptado)

- Navegadores legacy que no envían `Sec-Fetch-*` dependen de las capas 1–3.
- Si en el futuro se exponen mutaciones vía route handler con auth por **bearer
  token** en header (no cookie), CSRF deja de aplicar (no hay credencial
  ambiente) — pero tampoco lo cubriría un token CSRF.

### Cuándo reevaluar

- Si se agregan route handlers que mutan estado y dependen **solo** de cookies
  (sin Server Action ni `Sec-Fetch`).
- Si se cambia alguna cookie de sesión a `SameSite=None`.
- Si aparece un caso de uso cross-site legítimo que obligue a relajar `Sec-Fetch`.

---

## 2. Validación `Sec-Fetch-*` (Fetch Metadata)

### Qué

Los navegadores modernos estampan en cada request headers `Sec-Fetch-*` que el
JavaScript de la página **no puede falsificar**. Usamos `Sec-Fetch-Site` para
aislar los endpoints sensibles de solicitudes cross-site.

Implementación: `src/shared/security/fetch-metadata.ts` (lógica pura) cableada en
`middleware.ts`. Tests: `tests/unit/fetch-metadata.test.ts`.

### Política

Para un endpoint sensible, una solicitud se **rechaza con 403
`CROSS_SITE_FORBIDDEN`** sólo si:

- el método es mutante (`POST` / `PUT` / `PATCH` / `DELETE`), **y**
- `Sec-Fetch-Site: cross-site`.

Todo lo demás pasa. En particular **se permiten**:

- ausencia del header (navegadores legacy, llamadas server-to-server),
- `same-origin`, `same-site`, `none`,
- cualquier método no-mutante (`GET`/`HEAD`/`OPTIONS`), para no romper
  navegaciones cross-site legítimas (links directos, callbacks OAuth).

La política es deliberadamente **permisiva**: en el path de conversión (dinero)
preferimos cero falsos positivos. `cross-site` es la única señal inequívoca de
abuso para una mutación.

### Endpoints cubiertos

Prefijos en `SENSITIVE_MUTATION_PREFIXES`:

- `/api/billing/*` — pagos / suscripción SaaS.
- `/api/bookings/*` — cancelación, completar, no-show, alta de reserva.
- `/api/player/bookings/*` — cancelación por el jugador.

### Endpoints excluidos a propósito (cross-site legítimo)

- `/api/webhooks/mercadopago` — POST server-to-server desde MercadoPago.
- `/api/mp/callback`, `/api/auth/callback` — navegaciones GET cross-site (OAuth /
  magic link). Aunque cayeran bajo un prefijo, son GET y la política nunca bloquea
  métodos no-mutantes.

### Notas

- El check vive en el middleware (edge), antes del rate-limiting, así que un
  cross-site malicioso se corta sin tocar la DB ni Upstash.
- No es un reemplazo de auth: es una capa adicional barata y de bajo riesgo.

---

## 3. CSP `report-uri` / `report-to` (referencia)

La Content-Security-Policy (`next.config.js`) reporta violaciones a
`/api/csp-report`, que las loguea en Sentry (nivel `warning`) con deduplicación.
Detalle en `src/shared/observability/csp-report.ts`. Permite detectar inyecciones
o recursos no permitidos en producción sin romper la página (modo enforce + report).
