# Separación de puertas de acceso: complejo vs jugador — Design

**Fecha:** 2026-06-24
**Branch:** `worktree-para-complejos` (off `main` 21c6602)
**Alcance aprobado:** Dos puertas separadas · Estructura + refinar visual · URLs por audiencia

---

## 1. Problema

La identidad (jugador vs complejo) se resuelve tarde o nunca. Las dos audiencias
comparten la misma puerta y la página B2B usa el chrome del jugador. El enredo no
es solo visual: está en la capa de redirects.

1. **Una sola puerta para dos públicos.** `/login` es de hecho login de STAFF
   (email+password, placeholder `vos@complejo.com`, testimonial de dueño) con el
   acceso de JUGADOR escondido en un toggle (`PlayerAccess`,
   `src/app/(auth)/login/page.tsx:246`). Dos acciones (`loginAction` staff,
   `playerLoginAction` magic link) en la misma pantalla.
2. **`/register` es solo de complejos**, pero el header del jugador lo linkea como
   "Comenzar" (`PortalHeader.tsx:59`). El jugador real se crea al reservar
   (`LoginGate`), no ahí.
3. **La página B2B vive en el chrome del jugador.** `/para-complejos` está en
   `(public)` → hereda `PortalShell` (header/footer/bottom-nav del jugador) y
   además tiene su propio hero con CTAs. Dos identidades pisadas.
4. **La misma acción cambia de nombre** según la pantalla: "Ingresar" /
   "Iniciar sesión" / "Iniciá sesión"; "Comenzar" / "Comenzá gratis" / "Crear
   cuenta" / "Creá tu cuenta".
5. **Redirects mezclados.** `/login` es destino de ~30 guards de staff Y de ~14
   sitios de jugador (`(player)/*`, `reserva/[bookingId]/*`, `FavoriteButton`,
   `eliminar-cuenta` con `?deleted=1`). El jugador rebota a `/login` y debe cazar
   el toggle.

No hay `src/middleware.ts`: la auth se enforce por ruta vía `redirect('/login')`.
No hay punto central que tocar; el trabajo es repuntear redirects por archivo.

## 2. Objetivo y decisiones cerradas

**Objetivo:** dos puertas de entrada nítidas, una por audiencia, con navegación,
copy e identidad propias; sin features nuevas ni cambios de backend de auth.

- **Dos puertas separadas** (no una con bifurcación).
- **URLs por audiencia:** staff conserva `/login` + `/register` (0 churn, ~30
  refs intactas); jugador estrena `/ingresar` (español, matchea `/mis-reservas`,
  `/perfil`). Solo se repuntean las ~14 refs de jugador.
- **Profundidad:** ordenar rutas/IA/copy + refinar el look existente (sistema
  dark + emerald), sin inventar marca nueva.
- Jugador nuevo se sigue creando al reservar (`LoginGate`); `/ingresar` es para
  jugadores existentes / sesión vencida (mismo comportamiento que el toggle hoy).

## 3. Arquitectura de rutas

```
ANTES                                   DESPUÉS
/login  ──┬─ staff (form principal)     /login      → SOLO staff/complejo (limpio)
          └─ jugador (toggle oculto)    /register   → SOLO alta de complejo
/register → solo complejo               /ingresar   → NUEVO: solo jugador (magic link)
/para-complejos → chrome JUGADOR        /para-complejos → chrome B2B propio
```

**Grupos de rutas (App Router):**

- `(auth)` (layout mínimo, split-screen): `login`, `register`, `forgot-password`,
  `reset-password`, `verify`, **+ `ingresar` (nuevo)**.
- `(business)` **(nuevo)**: `para-complejos` (movido desde `(public)`). Layout
  propio con `BusinessHeader` + `BusinessFooter`. La URL sigue siendo
  `/para-complejos` (los grupos no afectan el path).
- `(public)` (sigue con `PortalShell` del jugador): `explorar`, `[slug]`,
  `privacy`, `suspended`, `terms`. Se le quita `para-complejos`.

Las páginas legales (`privacy`, `terms`) quedan con chrome de jugador; el footer
B2B las linkea igual. Aceptable: son neutrales.

## 4. Componentes y archivos

### 4.1 `/ingresar` — puerta del jugador (NUEVO)

- `src/app/(auth)/ingresar/page.tsx` — split-screen como login, pero orientado a
  jugador: solo email (magic link), copy de consumidor, imagen de cancha/jugador
  (sin testimonial de dueño).
- `src/app/(auth)/ingresar/actions.ts` — mueve acá `playerLoginAction` (hoy en
  `login/actions.ts:111`). Mantiene `?next=` (default `/mis-reservas`,
  `sanitizeNext`) y rate-limit `authMagicLink`.
- Incluye el `DeletedNotice` (`?deleted=1`) movido desde login.
- Nudge: "¿Primera vez? Reservá tu cancha en Explorar" → `/explorar`.
- Estados: `idle` (form) | `sent` (revisá tu email).

### 4.2 `/login` — puerta del complejo (LIMPIAR)

- `src/app/(auth)/login/page.tsx`: **eliminar** `PlayerAccess`
  (`:246-294`) y su render (`:113-116`), y `DeletedNotice` (`:26-43`, render
  `:142-144`) → se va a `/ingresar`.
- `src/app/(auth)/login/actions.ts`: **mover** `playerLoginAction` (+ tipo
  `PlayerLoginState`) a `ingresar/actions.ts`. Quedan `loginAction` y
  `resendConfirmationAction` (confirmación de alta staff).
- Resultado: `/login` 100% staff (email+password), sin rastros de jugador.

### 4.3 Grupo `(business)` + `para-complejos`

- `src/app/(business)/layout.tsx` (nuevo): compone `BusinessHeader` +
  `BusinessFooter` alrededor del contenido. No usa
  `PortalSessionProvider`/`PortalFrame` del jugador.
- `src/app/(business)/para-complejos/page.tsx`: movido desde
  `src/app/(public)/para-complejos/page.tsx`. Contenido intacto; CTAs con copy
  unificado (§6).

### 4.4 Chrome

- `src/components/site/BusinessHeader.tsx` (nuevo): dark, sticky
  (`bg-slate-950/80 backdrop-blur`, `border-b border-white/10`). Logo → `/`;
  anclas `Funciones` (#features) · `Testimonios` (#testimonios); CTAs
  `Ingresar` → `/login` (ghost) + `Empezar gratis` → `/register` (emerald
  sólido). Mobile: oculta anclas, conserva CTAs. Touch ≥44px, focus visible.
- `src/components/site/BusinessFooter.tsx` (nuevo): slim, dark. Logo, ©
  Argentina, links `Ingresar` → `/login`, `Empezar gratis` → `/register`,
  `Privacidad`, `Términos`, `Contacto`.
- `src/components/site/PortalHeader.tsx` (editar): variante overlay logged-out
  reemplaza `[Iniciar sesión→/login, Comenzar→/register]` por
  `[Ingresar→/ingresar]`; variante solid logged-out `Ingresar` → `/ingresar`
  (era `/login`). Nav `[Explorar, Para complejos]` y `AccountMenu` (con sesión)
  intactos.
- `src/components/site/SiteFooter.tsx` (editar, footer del jugador): "Iniciar
  sesión" → `/ingresar` (era `/login`).

## 5. Inventario de repunteo

### 5.1 Pasan a `/ingresar` (jugador) — ~16 sitios

> NOTA (verificado por workflow 2026-06-24): los números de línea de archivos de
> chrome (`PortalHeader`, `para-complejos`, `register`, `login`) derivaron en
> `main`. **Editar por contenido**, no por línea. El plan
> (`docs/superpowers/plans/2026-06-24-acceso-complejos-jugadores.md`) trae los
> snippets exactos. Se suman 3 comentarios a repuntear:
> `eliminar-cuenta/actions.ts:46`, `FavoriteButton.tsx:19`,
> `auth.service.ts:46-48`.

Redirects de guard:
- `src/app/(player)/layout.tsx:9`
- `src/app/(player)/perfil/page.tsx:74,85` · `perfil/actions.ts:26,88`
- `src/app/(player)/mis-reservas/page.tsx:67` · `mis-reservas/actions.ts:34`
- `src/app/(player)/configuracion/page.tsx:24,31`
- `src/app/(player)/eliminar-cuenta/page.tsx:23,43` · `actions.ts:18` ·
  `actions.ts:31` (`/login?deleted=1` → `/ingresar?deleted=1`)
- `src/app/(player)/eliminar-cuenta/DeleteAccountForm.tsx:42`
  (`/login?deleted=1` → `/ingresar?deleted=1`)
- `src/app/reserva/[bookingId]/pendiente/page.tsx:24` · `exito/page.tsx:71` ·
  `error/page.tsx:27`
- `src/app/(public)/[slug]/reservar/actions.ts:185`

Links de UI:
- `src/components/public/FavoriteButton.tsx:53` (`/login?next=` →
  `/ingresar?next=`)
- `src/components/site/PortalHeader.tsx:53,59,107` (ver §4.4)
- `src/components/site/SiteFooter.tsx:14`

Comentario:
- `src/modules/auth/auth.service.ts:48` (referencia a "/login (form secundario
  passwordless)" → `/ingresar`).

### 5.2 Quedan en `/login` (staff) — sin cambios

Todos los `(admin)/*` (~25), `src/modules/staff/guards.ts:33,77,80`,
`src/app/select-tenant/{page,actions}`, `src/app/onboarding/{page,actions}`,
`src/app/api/mp/oauth-start/route.ts:12`,
`src/modules/auth/system-admin.guards.ts:107`, cross-links internos de
`(auth)/{login,register,verify,forgot-password}`.

### 5.3 SEO

- `src/app/robots.ts`: agregar `/ingresar` al `disallow` (junto a
  `/login`, `/register`).

## 6. Vocabulario de acciones (copy)

Misma acción = mismo nombre en todos los puntos de entrada. Login de jugador y de
complejo comparten la etiqueta "Ingresar" pero nunca aparecen juntos (superficies
distintas), así que no hay ambigüedad.

| Acción | Etiqueta (links/CTA) | Destino / submit |
|---|---|---|
| Login jugador | **Ingresar** | `/ingresar` |
| Login complejo | **Ingresar** | `/login` |
| Alta complejo (trial) | **Empezar gratis** | `/register` |
| Submit form login staff | **Ingresar** | acción `loginAction` |
| Submit form alta staff | **Crear cuenta** | acción `registerAction` |
| Submit magic link jugador | **Enviarme el enlace** | acción `playerLoginAction` |

Puntos a alinear:
- `para-complejos` hero: "Comenzá gratis 30 días" → **Empezar gratis**; "Iniciar
  sesión" → **Ingresar**. FinalCta: "Crear mi cuenta" → **Empezar gratis**; "Ya
  tengo cuenta" → **Ingresar**.
- `login/page.tsx` submit "Iniciar sesión" → **Ingresar**; cross-link "¿Sos
  nuevo? Creá tu cuenta" → "¿Sos nuevo? **Empezar gratis**" (→ `/register`).
- `register/page.tsx` submit **Crear cuenta** (queda); cross-link "¿Ya tenés
  cuenta? Iniciá sesión" → "¿Ya tenés cuenta? **Ingresar**" (→ `/login`).
- `OwnerBanner` (`src/app/page.tsx`): "Conocé más" → `/para-complejos` (queda).
- **Header del jugador (home + portal):** pierde a propósito el CTA standalone a
  `/register` ("Comenzar"). Queda solo **"Ingresar"** → `/ingresar`. El alta de
  complejo se alcanza por el link **"Para complejos"** → `/para-complejos`
  (puerta B2B). Así ninguna superficie de jugador empuja al alta de staff.

## 7. Refinamiento visual (alcance)

Dentro del sistema actual (dark slate-950 + emerald, tipografías ya cargadas).
Sin marca nueva, sin paleta nueva.

- **`BusinessHeader`/`BusinessFooter`**: coherentes con el hero de
  `para-complejos`; le dan a la superficie B2B una navegación propia (sin
  "Explorar", sin bottom-nav de jugador).
- **`/ingresar`**: reutiliza el patrón split-screen de `/login` con paleta
  igual; el pane de imagen cambia a tono jugador (sin testimonial de dueño).
- **`/login`**: queda más limpio al sacar el bloque del jugador.
- Sin cambios de layout estructural en `para-complejos` salvo que ahora tiene
  header/footer propios encima/abajo del contenido existente.

Quality floor (igual que el resto del portal): responsive a 375px sin scroll
horizontal, focus visible, `prefers-reduced-motion` respetado, touch ≥44px.

## 8. Fuera de alcance

- Cambios en la lógica de auth (Supabase, magic link, password, OAuth MP).
- Registro standalone de jugador (sigue creándose al reservar).
- Página `/precios` o secciones nuevas de marketing.
- Rediseño del dashboard admin `(admin)/*`.
- Identidad/marca B2B nueva (el usuario eligió refinar, no rebrandear).
- i18n / cambios de backend / migraciones.

## 9. Criterios de aceptación

1. Un jugador deslogueado que entra a `/mis-reservas`, `/perfil`,
   `/configuracion`, favoritea (`FavoriteButton`) o vuelve de borrar cuenta
   aterriza en **`/ingresar`** (no en `/login`), con `?next=`/`?deleted=1`
   preservados.
2. Un staff deslogueado que entra a cualquier `(admin)/*`, `onboarding`,
   `select-tenant` o `mp/oauth-start` sigue aterrizando en **`/login`**.
3. `/login` no muestra ningún acceso de jugador (sin toggle "¿Sos jugador?", sin
   `DeletedNotice`).
4. `/ingresar` envía magic link a un jugador existente y muestra estado `sent`;
   ofrece ir a `/explorar` para primera reserva.
5. `/para-complejos` se renderiza con `BusinessHeader` + `BusinessFooter` y SIN
   el header/bottom-nav del portal del jugador.
6. El header del jugador (landing y portal) ya no linkea a `/register`; su CTA de
   acceso va a `/ingresar`.
7. Todo punto de entrada usa el vocabulario de §6 (no quedan "Comenzar" /
   "Iniciar sesión" / "Comenzá gratis" sueltos en superficies de usuario).
8. `pnpm typecheck` y `pnpm lint` limpios; sin scroll horizontal a 375px; focus
   visible en header/CTAs nuevos.

## 10. Testing

- **Unit nuevos:** `tests/unit/ingresar-*.test.tsx` (presentación + estados
  idle/sent; patrón mock `react-dom` de `useFormState`/`useFormStatus`).
- **Mover/actualizar:** `tests/unit/login-deleted-notice.test.tsx`
  (DeletedNotice ahora en `/ingresar`); cualquier aserción de "¿Sos jugador?"
  sobre `/login`.
- **Sin cambio esperado:** `tests/unit/login-password-action.test.ts`,
  `register-existing-account.test.ts`, `tests/integration/login-rate-limit.test.ts`
  (staff `/login` intacto) — confirmar que pasan.
- **e2e a actualizar:** `tests/e2e/critical-flows/player-magic-link.spec.ts`
  (flujo por `/ingresar`), `tests/e2e/player-delete-account.spec.ts`
  (`/ingresar?deleted=1`), `tests/e2e/landing.spec.ts` (CTAs del header).
  `tests/e2e/admin-login.spec.ts` y `cross-browser/login-smoke.spec.ts` no deben
  cambiar (staff).

## 11. Riesgos

- **Refs de jugador olvidadas:** un `redirect('/login')` de jugador sin repuntear
  deja al jugador en la pantalla de staff. Mitigación: el inventario §5.1 es la
  checklist; grep final de `/login` confirmando que solo quedan refs de staff.
- **Mover `playerLoginAction`** puede romper imports. Mitigación: typecheck tras
  el movimiento; `login/page.tsx` deja de importarla.
- **`para-complejos` fuera de `(public)`:** verificar que ningún test/import
  asuma su ubicación previa; la URL no cambia.
- **`?next=` de jugador** debe seguir pasando por `sanitizeNext` en `/ingresar`.
