# Migración de autenticación: Magic Link → Email + Contraseña (solo Staff)

- **Fecha:** 2026-06-16
- **Estado:** Aprobado (diseño) — pendiente de plan de implementación
- **Alcance:** Staff / dueños de complejo. Jugadores y SuperAdmin sin cambios de login.
- **Tipo:** Refactor crítico de la capa de entrada de autenticación.

---

## 1. Contexto y motivación

El usuario promedio de TurnoGol del lado del panel es el **dueño/operador de complejo** (~40-50 años, persona Marcelo, doc3). El flujo Magic Link actual lo obliga, **en cada login**, a salir de la app → ir al email → buscar el enlace → volver. Ese ciclo es confuso para ese perfil.

Se reemplaza el login de Magic Link por **email + contraseña clásico** para el staff. El login pasa a ser síncrono y familiar; el email solo reaparece en dos momentos puntuales: confirmación de alta (una vez) y recuperación de contraseña.

El sistema **no está en producción** y no hay usuarios reales: los datos existentes son de prueba y pueden recrearse sin plan de migración de datos.

### Decisiones tomadas (dueño, 2026-06-16)

1. **Alcance: solo staff/dueños.** Los jugadores **siguen con Magic Link passwordless** (preserva la conversión del flujo de reserva / Aha Moment, doc10). El SuperAdmin sigue como está (script + MFA TOTP).
2. **Confirmar email en el alta** (`enable_confirmations=true`). Una sola vez al registrarse; el login posterior es contraseña pura, sin email.
3. **Recuperación dual:** SuperAdmin genera **contraseña temporal + cambio forzado** (soporte telefónico) **y** existe self-service "olvidé mi contraseña" por email.
4. **Google OAuth: eliminar** (`signInWithGoogle` es código muerto, sin botón en ninguna UI).

### Decisiones por defecto aprobadas

- **Política de contraseña:** mínimo 8 caracteres, **sin** requisitos de complejidad (largo > símbolos; NIST + demografía). Zod espeja el mínimo.
- **Registro conserva el estado `existing`** (estándar B2B; revela que el email existe, riesgo bajo aceptado). Login y "olvidé contraseña" devuelven respuestas **genéricas** para no filtrar.
- **Captcha diferido a v1.5** (el signup de alto volumen — jugador — sigue en Magic Link; el de staff es bajo volumen, con email-confirm + rate-limit).
- **`/login` suma un acceso secundario passwordless para jugadores** con sesión vencida.

---

## 2. Invariante crítico (NO se toca)

Toda la identidad del sistema se deriva del JWT de Supabase (`app_metadata`):

- **Staff:** `tenant_id`, `staff_user_id`, `role` (default `admin`).
- **Jugador:** `is_player=true`, `player_id`.
- **SuperAdmin:** `is_system_admin=true`, `system_admin_id`.

`extractAuthUser` / `extractRealAuthUser` (`src/modules/auth/auth.middleware.ts`), los ~40 server actions y guards, la RLS (`SET LOCAL app.current_tenant_id` / `app.current_player_id`), la capa de impersonación y **el schema de base de datos** (`staff_users`, `players`, `player_tenant_relationships`, `system_admins`) **no dependen del método de login y no cambian**.

> **Regla de oro:** el flujo de contraseña debe grabar exactamente los mismos claims (`staff_user_id`, `tenant_id`, `role`) y ejecutar el `refreshSession()` posterior, igual que hoy hace el callback. Si no, el primer request entra sin claims → caen guards y RLS (fail-closed). Ver riesgo R3.

La contraseña vive en `auth.users` de Supabase. **Ninguna tabla de negocio gana una columna de password.** El vínculo `auth.users ↔ staff_users/players` sigue siendo por `email`.

---

## 3. Arquitectura

### 3.1 Extracción del helper de provisión (refactor central)

Hoy la provisión + claims + ruteo del staff viven **solo** en `src/app/api/auth/callback/route.ts` (líneas ~102-140). Se extrae a `src/modules/auth/auth.service.ts`:

```ts
// Única fuente de verdad para provisión + claims + ruteo del staff.
// Llamada desde: (a) callback en confirmación de alta (type=signup),
//                (b) loginAction tras signInWithPassword.
async function provisionAndRouteStaff(user: User): Promise<{ path: string }>
```

Encapsula la secuencia actual, sin cambios de lógica:
1. `getOrCreateStaffUser(email, firstName, lastName, phone)` (idempotente).
2. `resolveStaffTenants(staffUserId)`.
3. Ramas:
   - `0 tenants` → set `staff_user_id` claim → `refreshSession` → `{ path: '/onboarding' }`.
   - `1 tenant` → `setStaffTenantClaim` → `refreshSession` → `{ path: '/dashboard' }`.
   - `N tenants` → `{ path: '/select-tenant' }`.

El callback (confirmación de alta) hace `NextResponse.redirect(path)`; `loginAction` hace `redirect(path)` de `next/navigation`.

### 3.2 Callback después del refactor (`src/app/api/auth/callback/route.ts`)

Conserva **solo** `token_hash` + `verifyOtp`, ramificando por `type`:

| `type` | Origen | Acción |
|---|---|---|
| `email` | Magic link del **jugador** | Rama `is_player` actual — **intacta** (`getOrCreatePlayer` + `player_id` + redirect a `next`). |
| `signup` | Confirmación de alta del **staff** | `provisionAndRouteStaff(user)` → redirect. |
| `recovery` | Reset de contraseña del **staff** | Redirect a `/reset-password` (sesión recovery activa). |

**Se elimina:** la rama `code` + `exchangeCodeForSession` (era PKCE/OAuth; con Google fuera ya no se usa — todos los flujos de email usan `token_hash`, ver memoria `magic-link-pkce-token-hash`). Se eliminan también `redirectVerifyError` solo si dejan de usarse; la página `/verify` **se conserva** (la sigue usando el jugador).

---

## 4. Flujos detallados (staff)

### 4.1 Registro

1. `register/page.tsx`: form `firstName / lastName / email / phone` + **`password`** + **`confirmPassword`** (`autoComplete="new-password"`).
2. `register/actions.ts`:
   - Zod: agrega `password` (min 8) y `confirmPassword` (match). Mantiene el chequeo de `staff_users` existente → estado `existing`.
   - **Agrega rate-limit `authRegister`** (hoy no tiene ninguno).
   - `supabase.auth.signUp({ email, password, options: { data: { first_name, last_name, phone }, emailRedirectTo: callback } })`.
   - Con `enable_confirmations=true`, `signUp` **no** crea sesión → estado `confirm` (nueva pantalla "Confirmá tu email", distinta del SentState de magic link).
3. Usuario hace click en el email → callback `type=signup` → `provisionAndRouteStaff` → `/onboarding`.

> El perfil (`first_name/last_name/phone`) viaja en `options.data` (igual que hoy con el OTP) y el callback lo persiste vía `getOrCreateStaffUser`.

### 4.2 Login

1. `login/page.tsx`: campos `email` + **`password`** (`autoComplete="current-password"`), toggle mostrar/ocultar, link "¿Olvidaste tu contraseña?". Se elimina `SentState`.
2. `login/actions.ts`:
   - Zod: `email` + `password`. Rate-limit **`authPassword`**.
   - `signInWithPassword({ email, password })`.
   - Error de credenciales o email no confirmado → mensaje **genérico** ("Email o contraseña incorrectos"). Caso email-no-confirmado: ofrecer reenviar confirmación.
   - OK → si `app_metadata.force_password_change` → redirect `/reset-password`; si no → `provisionAndRouteStaff` → `redirect(path)`.
3. `LoginState`: pasa de `idle | sent | error` a `idle | error` (el éxito redirige).

### 4.3 Olvidé mi contraseña (nuevo)

- **`/forgot-password`** (page + action): input email → `supabase.auth.resetPasswordForEmail(email, { redirectTo: callback?type=recovery })`. Respuesta **genérica** siempre ("Si existe una cuenta, te enviamos un email"). Rate-limit: **reusa `authMagicLink`** (keyBy email, ya `failMode: 'closed'`; un envío de reset comparte el perfil de un envío de magic link).
- Email → callback `type=recovery` → sesión recovery → redirect **`/reset-password`**.

### 4.4 Set / cambio de contraseña (nuevo)

- **`/reset-password`** (page + action): campos `password` + `confirmPassword` → `supabase.auth.updateUser({ password })`.
- Sirve a dos casos:
  1. **Recovery** (desde el email de "olvidé mi contraseña").
  2. **Cambio forzado** (tras reset del SuperAdmin): al terminar, **limpiar `app_metadata.force_password_change`** (vía admin client) + `refreshSession`.

### 4.5 Enforcement del cambio forzado

Flag `app_metadata.force_password_change=true`. Se chequea en:
- `src/app/(admin)/layout.tsx`, tras `extractAuthUser()` (línea ~52, antes de resolver tenant): si el flag está, `redirect('/reset-password')`.
- `loginAction` post-`signInWithPassword` (atajo, evita un render del layout).

---

## 5. Configuración de Supabase

`supabase/config.toml` (local) **y** dashboard de Supabase (producción — tarea explícita y separada):

| Setting | Antes | Después |
|---|---|---|
| `minimum_password_length` | 6 | **8** |
| `password_requirements` | `""` | `""` (sin cambios — sin complejidad obligatoria) |
| `[auth.email] enable_confirmations` | `false` | **`true`** |
| `[auth.email.template.confirmation]` | comentado | **crear + versionar** (`./supabase/templates/confirmation.html`) |
| `[auth.email.template.recovery]` | comentado | **crear + versionar** (`./supabase/templates/recovery.html`) |

Los templates deben usar el patrón `token_hash` (no PKCE `code`) para que el callback los procese (memoria `magic-link-pkce-token-hash`).

> ⚠️ **R6 — Divergencia local/prod:** `config.toml` solo aplica a local. Estos settings y templates se configuran a mano en el dashboard de Supabase prod. El plan debe incluir un ítem de checklist para prod, o el reset/confirmación quedan rotos en producción mientras los tests locales pasan en verde.

---

## 6. Seguridad

### 6.1 Rate-limiting (`src/shared/rate-limit/policies.ts`)

| Policy | Estado | Definición |
|---|---|---|
| `authPassword` | **nueva** | login staff. `keyBy` email+IP, límite estricto con lockout/backoff estilo `pinAttempts` (~8 intentos / 5 min), `failMode: 'closed'`. |
| `authRegister` | **nueva** | alta staff (hoy SIN rate-limit). `keyBy` IP, `failMode: 'closed'`. |
| `authMagicLink` | **se conserva** | jugador (Magic Link sigue vivo). |
| `authVerify` | **se conserva** | verificación OTP del jugador. |

Actualizar el comentario de `apply.ts` que enumera las policies `failMode: 'closed'`.

### 6.2 Enumeración de usuarios

- **Login** y **forgot-password:** respuestas genéricas, no revelan si el email existe.
- **Registro:** mantiene el estado `existing` explícito (decisión de UX B2B; trade-off aceptado).

### 6.3 Política de contraseña

Mínimo 8, sin complejidad obligatoria. Validación en Zod (login/register/reset) espejando el mínimo de Supabase. Opcional: denylist mínima de contraseñas triviales en Zod.

### 6.4 Captcha

Diferido a v1.5. Mitigación actual: email-confirm + `authRegister` rate-limit + bajo volumen de altas de staff. El signup público de alto volumen (jugador) sigue en Magic Link (no afectado).

---

## 7. SuperAdmin: reset de contraseña

Funcionalidad **nueva** (no reemplaza nada; ADR-002 sigue vigente para el jugador).

- **UI:** nuevo `SectionCard` en `src/app/(super-admin)/super-admin/tenants/[id]/_components/support-actions-panel.tsx`, siguiendo el patrón `run()` + `FeedbackText` existente.
- **Action:** `resetStaffPasswordAction` en `../actions`:
  1. Guard triple de SuperAdmin (ya existe) + rate-limit `superAdminAction` (ya existe).
  2. Lookup de `auth.users` por email (admin API; no hay columna `auth_user_id` → `listUsers` con filtro o GoTrue admin).
  3. Genera contraseña temporal robusta. `admin.updateUserById(authUserId, { password: temp, app_metadata: { ...meta, force_password_change: true } })`.
  4. Devuelve la contraseña temporal al SuperAdmin (la dicta por teléfono al titular).
  5. `audit_logs` con action **`support.user.password_reset`**.

> Aplica solo a **staff** (alineado con el alcance). El reset de un jugador no aplica (siguen passwordless; si pierden acceso, piden un nuevo magic link).

---

## 8. Edge case: `/login` y el jugador

`src/app/(player)/layout.tsx` redirige a `/login` cuando no hay sesión de jugador. `/login` pasa a ser el form de contraseña de **staff**.

- Para que un jugador con sesión vencida no quede atrapado (y para corregir un **bug preexistente**: hoy `/login` no setea `is_player`, así que un jugador que entra por ahí cae en el path de staff), `/login` suma un acceso secundario: **"¿Sos jugador? Ingresá con tu email"** → form passwordless que dispara un Magic Link con `is_player` (sin perfil, para jugadores existentes).
- Toque mínimo; mantiene a los jugadores funcionando sin contraseña.

---

## 9. Datos de prueba y seeds

Sin usuarios reales → recrear (no migrar):

- `scripts/seed-e2e.ts`: `admin.createUser({ email_confirm: true, password: <fijo de test>, app_metadata })` para los usuarios staff. Centralizar la contraseña de test en una constante exportada (solo test, gateada por `NODE_ENV`/flag — nunca a prod, sería backdoor).
- `scripts/seed-system-admin.ts`: agregar `password` al `createUser` (o documentar set vía recovery).
- `tests/e2e/_helpers/auth-state.ts`: reemplazar la danza `generateLink → verifyOtp → setSession` (staff) por `signInWithPassword → setSession`. El jugador conserva el flujo Magic Link.
- `tests/e2e/global-setup.ts`: la pre-generación serial deja de ser necesaria para staff (ya no hay invalidación de tokens); actualizar comentario.

---

## 10. Limpieza de código (deuda técnica)

**Eliminar (solo staff):**
- `signInWithMagicLink` (staff) en `auth.service.ts`.
- `signInWithGoogle` en `auth.service.ts` (código muerto).
- `supabase.auth.signInWithOtp` inline en `register/actions.ts`.
- `SentState` + rama `status==='sent'` en `login/page.tsx` y `register/page.tsx`.
- Copy "enlace mágico" / "Sin contraseñas" en `login/page.tsx`, `register/page.tsx`.
- Paso "01 … Magic link, sin contraseñas" en `src/app/(public)/para-complejos/page.tsx`.
- Rama `code` / `exchangeCodeForSession` en el callback.

**Conservar (jugador):** `signInWithPlayerMagicLink`, `sendPlayerMagicLink`, `LoginGate.tsx`, rama `is_player` del callback, `/verify`, `authMagicLink`, `authVerify`, templates de magic link.

---

## 11. Impacto en tests

**Reescribir:**
- `tests/e2e/critical-flows/player-magic-link.spec.ts` → separar: caso staff a password (renombrar), caso player se mantiene magic link.
- `tests/e2e/admin-login.spec.ts` → login con password → `/dashboard`; sumar campo password.
- `tests/e2e/cross-browser/login-smoke.spec.ts` → assert de input password.
- `tests/e2e/onboarding.spec.ts` → comentario de cabecera + campo password en `/register`.
- `tests/integration/login-rate-limit.test.ts` → mock `signInWithPassword`, policy `authPassword`, casos de credenciales inválidas y lockout.
- `tests/integration/rate-limit-fail-mode.test.ts` → sumar `authPassword` y `authRegister` (fail closed).
- `tests/unit/register-existing-account.test.ts` → mock `signUp`, validación de fuerza de password.

**Nuevos:**
- `/forgot-password` y `/reset-password` (action + presentación).
- Reset de contraseña del SuperAdmin (action + audit).
- Validación de política de contraseña (Zod).
- Enforcement de `force_password_change` (guard del layout admin).

---

## 12. Fuera de alcance

- **Migración del jugador a contraseña** (decisión: queda passwordless con Magic Link).
- **🔴 Gap preexistente (ticket aparte):** `src/modules/players/player.anonymization.ts` (`anonymizePlayer`) reescribe `players.email` pero **no toca `auth.users`**. Con el modelo actual queda una fila `auth.users` huérfana y un eventual re-registro del mismo email puede colisionar. Es un problema del **jugador** (que no migra en este refactor), por lo que se **señala** pero no se aborda aquí. Recomendación: ticket de compliance (Ley 25.326) que extienda la anonimización para borrar/rotar la fila de `auth.users`.

---

## 13. Riesgos y mitigaciones

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Romper el contrato de claims `app_metadata` → caen guards + RLS | `provisionAndRouteStaff` graba los mismos claims + `refreshSession`; tests de aislamiento (bloqueantes, doc16) deben pasar. |
| R2 | Fuerza bruta de credenciales / alta masiva | `authPassword` (lockout, fail-closed) + `authRegister` + email-confirm. |
| R3 | Provisión perdida al saltear el callback en login | Helper único `provisionAndRouteStaff` invocado desde login action **y** callback; incluye `refreshSession`. |
| R4 | Romper accidentalmente el flujo del jugador al tocar `auth.service`/callback | Aislar cambios a funciones staff; rama `is_player` del callback intacta; tests e2e de booking del jugador en verde. |
| R5 | Declaración jurada +18 del jugador (no migra) | El flujo del jugador no se toca → consentimiento sigue capturándose en `getOrCreatePlayer` vía el callback. |
| R6 | Divergencia config local vs prod (password length, confirmations, templates) | Ítem de checklist explícito de configuración del dashboard de Supabase prod en el plan. |
| R7 | Tests anclados en copy ("Revisá tu email", "enlace mágico") | Actualizar todos los specs staff en el mismo cambio; el copy del jugador se conserva. |
| R8 | `force_password_change` mal enforced → usuario entra sin cambiar temp | Chequeo en el guard del layout admin **y** post-login; limpiar flag solo tras `updateUser` exitoso. |

---

## 14. Archivos afectados (consolidado)

**Modificar:**
- `src/modules/auth/auth.service.ts` — agregar `signInWithPassword`, `signUpStaff`, `provisionAndRouteStaff`; quitar `signInWithMagicLink` (staff) y `signInWithGoogle`.
- `src/app/api/auth/callback/route.ts` — branch por `type`; quitar rama `code`.
- `src/app/(auth)/login/actions.ts` + `login/page.tsx` — password, `authPassword`, sin `SentState`.
- `src/app/(auth)/register/actions.ts` + `register/page.tsx` — password+confirm, `signUp`, `authRegister`, estado `confirm`.
- `src/app/(admin)/layout.tsx` — enforcement `force_password_change`.
- `src/shared/rate-limit/policies.ts` + `apply.ts` — `authPassword`, `authRegister`.
- `src/app/(super-admin)/super-admin/tenants/[id]/_components/support-actions-panel.tsx` + `../actions.ts` — reset de password.
- `supabase/config.toml` — password length, confirmations, templates.
- `src/app/(public)/para-complejos/page.tsx` — copy.
- `scripts/seed-e2e.ts`, `scripts/seed-system-admin.ts`, `tests/e2e/_helpers/auth-state.ts`, `tests/e2e/global-setup.ts`.

**Crear:**
- `src/app/(auth)/forgot-password/page.tsx` + `actions.ts`.
- `src/app/(auth)/reset-password/page.tsx` + `actions.ts`.
- `supabase/templates/confirmation.html`, `supabase/templates/recovery.html`.
- Tests nuevos (ver §11).

**Conservar sin cambios (jugador / núcleo):**
- `src/app/(public)/[slug]/reservar/components/LoginGate.tsx`, `reservar/actions.ts` (`sendPlayerMagicLink`).
- `src/modules/auth/auth.middleware.ts`, `types.ts`.
- `src/app/(auth)/verify/page.tsx`.
- Schema de BD (`staff_users`, `players`, `player_tenant_relationships`, `system_admins`).
- RLS, impersonación, los ~16 templates de Resend.
