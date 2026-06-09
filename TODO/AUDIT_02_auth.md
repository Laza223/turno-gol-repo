# AUDIT 02 — Autenticación (login, register, verify)

Auth = **Supabase Magic Link** (PKCE, sin contraseñas). En dev, los emails se capturan en **Inbucket** (`:54324`). Verificado el flujo real end-to-end (login y registro-vía-reserva) navegando el magic link de Inbucket.

---

# Login — `/login`

## Archivo fuente
- `src/app/(auth)/login/page.tsx` + `actions.ts` (`loginAction` → `signInWithMagicLink`)
- `src/modules/auth/auth.service.ts`, `src/app/api/auth/callback/route.ts`

## Comportamiento esperado
- Form de email → `signInWithMagicLink(email, origin/api/auth/callback)` → estado "sent" ("Revisá tu email"). El callback resuelve: jugador→`next`; staff con 1 tenant→`/dashboard`; staff con 0 tenants→`/onboarding`; staff con N→`/select-tenant`.

## Resultado del test
- ✅ Renderiza: panel imagen + form (Email, "Enviar enlace mágico"), link "Creá tu cuenta"→/register.
- ✅ **Enviar enlace mágico** (email válido): botón → "Enviando…" → estado "Revisá tu email". El email llega a Inbucket.
- ✅ **Magic link real** (admin + admin-fresh + player): verify Supabase (PKCE, el browser tiene el code_verifier del submit) → `/api/auth/callback` → redirige correctamente (admin→/dashboard, admin-fresh→/onboarding, player→destino). Verificado para los 3 roles.
- 🟢 `/login` no redirige a usuarios ya autenticados (un admin logueado igual ve el form). Menor.
- 🟢 El asunto del email es **"Your Magic Link"** (template default de Supabase, en inglés). En prod podría personalizarse. Menor i18n.

## Severidad
🟢 Funciona correctamente.

---

# Register — `/register`

## Archivo fuente
- `src/app/(auth)/register/page.tsx` + `actions.ts`

## Comportamiento esperado
- Form de alta de complejo (Nombre, Apellido, Email, Celular AR) → magic link → callback (staff 0 tenants) → `/onboarding`.

## Resultado del test
- ✅ Renderiza: copy de marketing ("30 días gratis sin tarjeta", "MercadoPago integrado", "Setup <2 min"), form (Nombre*, Apellido*, Email*, Celular* "+54 9"), "Crear cuenta", link "Iniciá sesión"→/login.
- ✅ **Validación server-side por campo** (al enviar vacío): Nombre "Ingresá tu nombre" ✓, Apellido "Ingresá tu apellido" ✓, Celular "Formato: +54 9 11 1234-5678" ✓.
- 🟡 **Email: "Invalid email" en INGLÉS** (mensaje crudo de Zod) — inconsistente con el resto en español. **Mismo bug que el form de `/reservar`** → es un patrón sistémico (el `.email()` de Zod sin mensaje custom). Ver `AUDIT_06`.
- ⚠️ Sin validación client-side previa: el form se envía vacío (botón "Creando…") y recién el server devuelve los errores.
- El happy path (crear cuenta) usa el mismo mecanismo de magic link que login (verificado). No lo ejecuté para no crear usuarios extra.

## Severidad
🟡 Mensaje de email en inglés.

---

# Verify — `/verify`

## Archivo fuente
- `src/app/(auth)/verify/page.tsx`
- El callback (`/api/auth/callback`) redirige acá con `?error=<code>` cuando falla (invalid / exchange_failed).

## Resultado del test
- ✅ `/verify?error=exchange_failed`: "No pudimos verificar tu enlace — No pudimos completar el inicio de sesión. Probá de nuevo." + "Volver a intentar" → `/login`. Página de error clara en español.

## Severidad
🟢 Funciona correctamente.
