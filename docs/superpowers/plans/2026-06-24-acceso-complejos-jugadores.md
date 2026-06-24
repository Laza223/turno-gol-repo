# Separación de puertas de acceso (complejo vs jugador) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar la entrada del complejo (staff: `/login` + `/register`) de la del jugador (nuevo `/ingresar`, magic link), y sacar la landing B2B `/para-complejos` del chrome del jugador, sin tocar la lógica de auth ni el backend.

**Architecture:** Tres grupos de rutas: `(auth)` gana `/ingresar`; `(business)` (nuevo, chrome propio) recibe `para-complejos` movido desde `(public)`; `(public)` conserva `PortalShell` del jugador. La `playerLoginAction` (hoy en `/login`) se mueve a `/ingresar`; los ~16 redirects/links de jugador a `/login` se repuntean a `/ingresar`; los ~40 de staff quedan en `/login`. Refinamiento visual dentro del sistema dark slate-950 + emerald existente.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind, lucide-react, Vitest + @testing-library/react (happy-dom), Playwright e2e.

## Global Constraints

- TypeScript strict; nunca `any`. Correr `pnpm typecheck` después de cada cambio (filtrar ruido: `pnpm typecheck 2>&1 | grep -v TurnoGol-audit-f02/`).
- Lint en worktree anidado: `npx eslint --no-eslintrc --config .eslintrc.json --resolve-plugins-relative-to . <archivos>` (correr `pnpm install` una vez en el worktree antes).
- **Staff conserva `/login` + `/register`** (no se tocan sus ~40 redirects). **Jugador estrena `/ingresar`.**
- **Vocabulario de acciones (verbatim):** login (cualquier audiencia) = etiqueta **"Ingresar"**; alta de complejo = **"Empezar gratis"** en CTAs de marketing y **"Crear cuenta"** en el submit del form; submit magic link jugador = **"Enviarme el enlace"**.
- **Editar por CONTENIDO, no por número de línea**, en `PortalHeader.tsx`, `para-complejos/page.tsx`, `register/page.tsx`, `login/page.tsx`: las líneas del spec §5.1 derivaron en `main`. Usar los snippets exactos incluidos en cada tarea.
- **Sistema visual:** dark slate-950 + emerald; sin marca nueva. Touch ≥44px, focus visible, `prefers-reduced-motion` respetado, sin scroll horizontal a 375px. Montos en centavos / timestamps UTC (no aplica aquí).
- **Correcciones al spec** (verificadas por workflow, este plan manda): §5.1 usa líneas viejas → editar por contenido; se agregan 3 comentarios olvidados (`eliminar-cuenta/actions.ts:46`, `FavoriteButton:19`, `auth.service.ts:46-48`). §6: el header del jugador (home + portal) **pierde a propósito el CTA a `/register`**; el alta de complejo se alcanza por el link "Para complejos".

## Ordering hazards (de cumplimiento obligatorio)

1. `/ingresar` (page + action) DEBE existir antes de repuntear cualquier redirect de jugador (Task 1 antes de Task 2), si no el jugador deslogueado cae en 404.
2. Mover `para-complejos` y crear `(business)/layout.tsx` DEBE pasar en la misma tarea (Task 4): sin layout queda sin chrome; medio movido, 404.
3. Mover `playerLoginAction` y limpiar `PlayerAccess` de `login/page.tsx` (que la importa) + actualizar el mock del test DEBE ser atómico (Task 1), si no rompe typecheck.
4. `?deleted=1` (eliminar-cuenta) repunta a `/ingresar?deleted=1` solo cuando `/ingresar` ya renderiza `DeletedNotice` (Task 1 antes de Task 2).
5. `robots.ts` agrega `/ingresar` recién cuando la ruta existe (Task 2, post Task 1).
6. e2e `player-magic-link` / `player-delete-account` cambian en lockstep con Task 1/2 (Task 5).

## File Structure

- `src/app/(auth)/ingresar/page.tsx` (nuevo) — pantalla de acceso del jugador (magic link).
- `src/app/(auth)/ingresar/actions.ts` (nuevo) — `playerLoginAction` + `PlayerLoginState` (movidos).
- `src/app/(auth)/login/page.tsx` (editar) — quitar `PlayerAccess` + `DeletedNotice`; copy.
- `src/app/(auth)/login/actions.ts` (editar) — quitar `playerLoginAction` + `PlayerLoginState`.
- `src/app/(auth)/register/page.tsx` (editar) — copy cross-link.
- `src/app/(business)/layout.tsx` (nuevo) — `BusinessHeader` + `BusinessFooter`.
- `src/app/(business)/para-complejos/page.tsx` (movido desde `(public)`) — copy CTAs.
- `src/components/site/BusinessHeader.tsx` (nuevo).
- `src/components/site/BusinessFooter.tsx` (nuevo).
- `src/components/site/PortalHeader.tsx` (editar) — CTAs de jugador → `/ingresar`, drop `/register`.
- `src/components/site/SiteFooter.tsx` (editar) — link → `/ingresar`.
- ~16 archivos de jugador (editar) — `redirect/href '/login' → '/ingresar'`.
- `src/app/robots.ts` (editar) — `/ingresar` a disallow.
- `src/modules/auth/auth.service.ts` (editar) — comentario.
- Tests: `tests/unit/ingresar-page.test.tsx` (nuevo), relocaliza `login-deleted-notice`, actualiza e2e.

---

### Task 1: Crear `/ingresar` y limpiar `/login` (atómico)

**Files:**
- Create: `src/app/(auth)/ingresar/actions.ts`
- Create: `src/app/(auth)/ingresar/page.tsx`
- Create: `tests/unit/ingresar-page.test.tsx`
- Modify: `src/app/(auth)/login/actions.ts` (quitar `playerLoginAction` + `PlayerLoginState`)
- Modify: `src/app/(auth)/login/page.tsx` (quitar `PlayerAccess`, `PlayerSubmitButton`, `playerInitial`, `DeletedNotice`, imports; copy submit + cross-link)
- Modify: `src/app/(auth)/register/page.tsx` (copy cross-link)
- Modify/relocate: `tests/unit/login-deleted-notice.test.tsx` → `tests/unit/ingresar-page.test.tsx` cubre `DeletedNotice`

**Interfaces:**
- Produces: `playerLoginAction(prev, formData): Promise<PlayerLoginState>` y `type PlayerLoginState = { status:'idle' } | { status:'sent'; email:string } | { status:'error'; message:string }` ahora en `@/app/(auth)/ingresar/actions`.
- Consumes: `signInWithExistingPlayerMagicLink`, `enforce('authMagicLink', …)`, `sanitizeNext(raw, '/mis-reservas')`.

- [ ] **Step 1: Crear `src/app/(auth)/ingresar/actions.ts`** (mover la acción verbatim + helper `callbackOrigin`)

```ts
'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { signInWithExistingPlayerMagicLink } from '@/modules/auth/auth.service'
import { enforce } from '@/shared/rate-limit/apply'
import { sanitizeNext } from '@/lib/safe-redirect'

export type PlayerLoginState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string }

function callbackOrigin(): string {
  return headers().get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
}

// Magic link de re-acceso para un jugador EXISTENTE (sesión vencida). El alta de
// jugador nuevo sigue ocurriendo al reservar (LoginGate), no acá.
export async function playerLoginAction(
  _prev: PlayerLoginState,
  formData: FormData,
): Promise<PlayerLoginState> {
  const email = z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Ingresá un email válido' })
    .safeParse(formData.get('email'))
  if (!email.success) return { status: 'error', message: 'Ingresá un email válido.' }

  const rl = await enforce('authMagicLink', email.data)
  if (!rl.ok) {
    return { status: 'error', message: 'Demasiados intentos. Esperá un minuto.' }
  }

  const nextRaw = formData.get('next')
  const safeNext = sanitizeNext(typeof nextRaw === 'string' ? nextRaw : null, '/mis-reservas')
  const redirectTo = `${callbackOrigin()}/api/auth/callback?next=${encodeURIComponent(safeNext)}`
  const result = await signInWithExistingPlayerMagicLink(email.data, redirectTo)
  if (!result.ok) {
    return { status: 'error', message: 'No pudimos enviar el email. Probá de nuevo.' }
  }
  return { status: 'sent', email: email.data }
}
```

- [ ] **Step 2: Escribir el test del page (falla primero)** — `tests/unit/ingresar-page.test.tsx`

```tsx
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
    useFormState: (_action: unknown, initial: unknown) => [initial, vi.fn()],
  }
})

const searchStr = vi.fn(() => '')
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchStr()),
}))

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, never>)} />
  },
}))

vi.mock('@/app/(auth)/ingresar/actions', () => ({
  playerLoginAction: vi.fn(),
}))

import IngresarPage from '@/app/(auth)/ingresar/page'

beforeEach(() => searchStr.mockReturnValue(''))
afterEach(() => cleanup())

describe('IngresarPage — acceso jugador', () => {
  it('renderiza el form de email con el submit "Enviarme el enlace"', () => {
    render(<IngresarPage />)
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /enviarme el enlace/i })).toBeTruthy()
  })

  it('muestra el aviso de cuenta eliminada con ?deleted=1', () => {
    searchStr.mockReturnValue('deleted=1')
    render(<IngresarPage />)
    expect(screen.getByText(/tu cuenta fue eliminada/i)).toBeTruthy()
  })

  it('ofrece reservar en Explorar para primera vez', () => {
    render(<IngresarPage />)
    const link = screen.getByRole('link', { name: /explorar/i })
    expect(link.getAttribute('href')).toBe('/explorar')
  })
})
```

- [ ] **Step 3: Correr el test — debe FALLAR** (no existe el page)

Run: `pnpm test ingresar-page`
Expected: FAIL — `Cannot find module '@/app/(auth)/ingresar/page'`.

- [ ] **Step 4: Crear `src/app/(auth)/ingresar/page.tsx`**

```tsx
'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Mail } from 'lucide-react'
import { playerLoginAction, type PlayerLoginState } from './actions'
import { Logo } from '@/components/ui/logo'

const HERO_IMG =
  'https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=2000&auto=format&fit=crop'

const initial: PlayerLoginState = { status: 'idle' }

function DeletedNotice() {
  const searchParams = useSearchParams()
  if (searchParams.get('deleted') !== '1') return null
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm shadow-emerald-100">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 ring-2 ring-emerald-50">
        <span className="text-xs font-bold text-emerald-700">✓</span>
      </div>
      <div>
        <p className="font-semibold text-emerald-900">Tu cuenta fue eliminada</p>
        <p className="mt-0.5 text-xs text-emerald-700">
          Lamentamos verte partir. Podés volver cuando quieras.
        </p>
      </div>
    </div>
  )
}

export default function IngresarPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <ImagePane />
      <FormPane />
    </div>
  )
}

function ImagePane() {
  return (
    <div className="relative hidden lg:block">
      <Image
        src={HERO_IMG}
        alt="Jugadores en una cancha de fútbol"
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 0vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/60 to-emerald-900/45"
      />
      <div className="relative flex h-full flex-col justify-between p-12 text-white">
        <Link href="/">
          <Logo variant="horizontal" textClassName="text-white" iconClassName="bg-white/95 shadow-lg shadow-emerald-500/30" />
        </Link>
        <div className="max-w-md">
          <h2 className="text-3xl font-extrabold tracking-tight text-white">
            Tu próxima cancha,
            <br />a un toque.
          </h2>
          <p className="mt-4 text-sm text-slate-300">
            Entrá con tu email y seguí tus reservas. Sin contraseñas.
          </p>
        </div>
      </div>
    </div>
  )
}

function FormPane() {
  return (
    <div className="relative flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 px-4 py-12 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-900 lg:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Volver
      </Link>

      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center lg:hidden">
          <Logo variant="vertical" className="w-32" />
        </div>
        <Suspense fallback={null}>
          <DeletedNotice />
        </Suspense>
        <FormCard />
        <p className="mt-6 text-center text-sm text-slate-600">
          ¿Primera vez?{' '}
          <Link href="/explorar" className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline">
            Reservá tu cancha en Explorar
          </Link>
        </p>
      </div>
    </div>
  )
}

function FormCard() {
  const [state, formAction] = useFormState(playerLoginAction, initial)
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/mis-reservas'

  if (state.status === 'sent') {
    return (
      <div className="rounded-2xl border border-slate-200/60 bg-white/90 p-8 text-center shadow-xl shadow-slate-900/5 backdrop-blur-md">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
          <Mail className="h-6 w-6 text-emerald-700" aria-hidden />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Revisá tu email</h1>
        <p className="mt-3 text-sm text-slate-600">
          Te enviamos un enlace de acceso a <strong className="text-slate-900">{state.email}</strong>.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white/90 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-md">
      <header className="mb-6 space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Ingresá a tu cuenta</h1>
        <p className="text-sm text-slate-600">Sin contraseñas: te mandamos un enlace de acceso por email.</p>
      </header>

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-slate-900">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="vos@email.com"
            aria-invalid={state.status === 'error' ? 'true' : undefined}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 aria-[invalid=true]:border-red-500"
          />
        </div>
        {state.status === 'error' && (
          <p role="alert" className="text-xs text-red-600">
            {state.message}
          </p>
        )}
        <SubmitButton />
      </form>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-xl hover:shadow-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:translate-y-0 disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Enviando…
        </>
      ) : (
        'Enviarme el enlace'
      )}
    </button>
  )
}
```

- [ ] **Step 5: Correr el test — debe PASAR**

Run: `pnpm test ingresar-page`
Expected: PASS (3 tests).

- [ ] **Step 6: Quitar `playerLoginAction` + `PlayerLoginState` de `login/actions.ts`**

Borrar el bloque `export type PlayerLoginState = …` (líneas ~106-109) y la función `export async function playerLoginAction(…) { … }` (líneas ~111-136), incluido el comentario de sección `// ── Acceso secundario passwordless para jugadores …`. Dejar `loginAction` y `resendConfirmationAction` intactas. Si `sanitizeNext` queda sin uso, quitar su import (`import { sanitizeNext } from '@/lib/safe-redirect'`). `headers`, `enforce`, `signInWithExistingPlayerMagicLink` siguen usados por las otras acciones — verificar con typecheck antes de borrar imports.

- [ ] **Step 7: Limpiar `login/page.tsx`** (quitar todo lo de jugador + copy)

1. Import block — quitar `playerLoginAction`, `type PlayerLoginState`; quitar `Mail` si queda sin uso; quitar `useSearchParams` si queda sin uso (lo usaba `DeletedNotice`/`PlayerAccess`). Resultado del import de actions:

```tsx
import {
  loginAction,
  resendConfirmationAction,
  type LoginState,
  type ResendState,
} from './actions'
```

2. Borrar el componente `function PlayerAccess() { … }` completo (líneas ~246-294) y `function PlayerSubmitButton() { … }` y la const `const playerInitial: PlayerLoginState = { status: 'idle' }`.
3. Borrar el componente `function DeletedNotice() { … }` completo (líneas ~26-43).
4. En `FormPane`, borrar el render del `PlayerAccess` (el `<Suspense>` que lo envuelve, líneas ~113-116):

```tsx
        <FormCard state={state} formAction={formAction} />
```

5. En `FormCard`, borrar el render del `DeletedNotice` (líneas ~142-144):

```tsx
      </header>

      <form action={formAction} className="space-y-4" noValidate>
```

6. Copy: en `SubmitButton`, cambiar el texto `'Iniciar sesión'` → `'Ingresar'` (el estado pending "Ingresando…" queda). En el cross-link de `FormCard`, cambiar:

```tsx
      <p className="mt-6 text-center text-sm text-slate-600">
        ¿Sos nuevo?{' '}
        <Link href="/register" className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline">
          Empezar gratis
        </Link>
      </p>
```

- [ ] **Step 8: Copy en `register/page.tsx`** (cross-link)

Cambiar el cross-link de `FormCard` (líneas ~189-194): el texto del `<Link href="/login">` de `Iniciá sesión` → `Ingresar`. Dejar `ExistingState` "Iniciar sesión" como está (es un botón de acción, también válido, pero para consistencia cambiarlo a `Ingresar`). Submit `Crear cuenta` queda.

- [ ] **Step 9: Relocalizar el test de DeletedNotice**

Borrar `tests/unit/login-deleted-notice.test.tsx` (su cobertura de `DeletedNotice` ahora vive en `ingresar-page.test.tsx`, Step 2). Verificar que ningún otro test importe de `@/app/(auth)/login/actions` el símbolo `playerLoginAction`.

- [ ] **Step 10: typecheck + tests + commit**

Run: `pnpm typecheck 2>&1 | grep -v TurnoGol-audit-f02/` → sin errores.
Run: `pnpm test ingresar-page login` → PASS.

```bash
git add src/app/\(auth\)/ingresar src/app/\(auth\)/login src/app/\(auth\)/register tests/unit/ingresar-page.test.tsx
git rm tests/unit/login-deleted-notice.test.tsx
git commit -m "feat(auth): /ingresar como puerta del jugador; /login queda solo staff"
```

---

### Task 2: Repuntear redirects/links de jugador `/login` → `/ingresar`

**Files (editar):**
- `src/app/(player)/layout.tsx:9`
- `src/app/(player)/perfil/page.tsx` (2) · `perfil/actions.ts` (2)
- `src/app/(player)/mis-reservas/page.tsx` · `mis-reservas/actions.ts`
- `src/app/(player)/configuracion/page.tsx` (2)
- `src/app/(player)/eliminar-cuenta/page.tsx` (2) · `eliminar-cuenta/actions.ts` (2 redirect + 1 comentario) · `DeleteAccountForm.tsx` (1)
- `src/app/reserva/[bookingId]/{pendiente,exito,error}/page.tsx`
- `src/app/(public)/[slug]/reservar/actions.ts:185`
- `src/components/public/FavoriteButton.tsx:53` (+ comentario :19)
- `src/modules/auth/auth.service.ts:46-48` (comentario)
- `src/app/robots.ts` (agregar `/ingresar`)

**Interfaces:** ninguna nueva. Es repunteo mecánico, pero **per-file** (los archivos de staff comparten el literal `'/login'` y NO se tocan).

- [ ] **Step 1: Reemplazar en archivos 100% jugador** — en cada uno, cambiar `redirect('/login')` → `redirect('/ingresar')` (todas las ocurrencias del archivo):
  - `src/app/(player)/layout.tsx`
  - `src/app/(player)/perfil/page.tsx`, `src/app/(player)/perfil/actions.ts`
  - `src/app/(player)/mis-reservas/page.tsx`, `src/app/(player)/mis-reservas/actions.ts`
  - `src/app/(player)/configuracion/page.tsx`
  - `src/app/(player)/eliminar-cuenta/page.tsx`
  - `src/app/reserva/[bookingId]/pendiente/page.tsx`, `exito/page.tsx`, `error/page.tsx`

- [ ] **Step 2: `eliminar-cuenta/actions.ts`** — `redirect('/login')` (line ~18) → `redirect('/ingresar')`; `redirect('/login?deleted=1')` (line ~31) → `redirect('/ingresar?deleted=1')`; comentario line ~46 `// redirected to /login. The router.push('/login?deleted=1') in` → `// redirected to /ingresar. The router.push('/ingresar?deleted=1') in`.

- [ ] **Step 3: `DeleteAccountForm.tsx`** — `router.push('/login?deleted=1')` → `router.push('/ingresar?deleted=1')`.

- [ ] **Step 4: `reservar/actions.ts`** — SOLO la ocurrencia line ~185 `if (!user || user.type !== 'player') redirect('/login')` → `redirect('/ingresar')`. NO tocar el redirect a `/${slug}/reservar` (line ~98).

- [ ] **Step 5: `FavoriteButton.tsx`** — `window.location.href = ` + "`/login?next=${back}`" → "`/ingresar?next=${back}`"; comentario line ~19 `lo manda a /login y vuelve` → `lo manda a /ingresar y vuelve`.

- [ ] **Step 6: `auth.service.ts`** — comentario líneas 46-48: `cae\n * en \`/login\` (form secundario passwordless)` → `cae\n * en \`/ingresar\` (form passwordless del jugador)`.

- [ ] **Step 7: `robots.ts`** — agregar `'/ingresar',` al array `disallow` (junto a `/login`, `/register`).

- [ ] **Step 8: Verificación + commit**

Run: `pnpm typecheck 2>&1 | grep -v TurnoGol-audit-f02/` → sin errores.
Verificación de exhaustividad (debe NO devolver refs de jugador):

Run: `git grep -n "'/login'" -- 'src/app/(player)' 'src/app/reserva' 'src/components/public/FavoriteButton.tsx'`
Expected: sin resultados.

Run: `git grep -n "/login" -- src/app src/components src/modules | grep -v "(admin)" | grep -v "(auth)" | grep -v "select-tenant" | grep -v onboarding | grep -v "modules/staff" | grep -v system-admin | grep -v "mp/oauth" | grep -v robots`
Expected: sin resultados (todo lo que queda es staff/internal-auth/seo).

```bash
git add -A && git commit -m "refactor(auth): repuntar redirects de jugador /login -> /ingresar"
```

---

### Task 3: Chrome del jugador → `/ingresar` (PortalHeader + SiteFooter)

**Files:**
- Modify: `src/components/site/PortalHeader.tsx` (overlay + solid, por contenido)
- Modify: `src/components/site/SiteFooter.tsx`

**Interfaces:** sin cambios de API. `PortalHeader` mantiene su firma `{ variant?: 'overlay' | 'solid' }`.

- [ ] **Step 1: PortalHeader — bloque overlay logged-out** (reemplazar los dos `<Link>` por uno solo "Ingresar" → `/ingresar`). Buscar este bloque exacto y reemplazarlo:

```tsx
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden rounded-full px-3 py-1.5 text-xs font-semibold text-slate-200 transition-all duration-200 hover:bg-white/10 hover:text-white md:text-sm sm:inline-flex"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-9 items-center rounded-full bg-white px-4 text-xs font-semibold text-slate-900 shadow-md transition-all duration-200 hover:bg-slate-100 active:scale-95 md:text-sm"
                >
                  Comenzar
                </Link>
              </>
```

por:

```tsx
            ) : (
              <Link
                href="/ingresar"
                className="inline-flex h-9 items-center rounded-full bg-white px-4 text-xs font-semibold text-slate-900 shadow-md transition-all duration-200 hover:bg-slate-100 active:scale-95 md:text-sm"
              >
                Ingresar
              </Link>
```

(El link "Para complejos" del nav overlay queda como puerta B2B — no se toca.)

- [ ] **Step 2: PortalHeader — bloque solid logged-out** — cambiar solo el `href` del `<Link>` "Ingresar" de `/login` → `/ingresar`:

```tsx
              <Link
                href="/ingresar"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-emerald-700 hover:shadow-md hover:shadow-emerald-500/20 active:scale-95 md:text-sm"
              >
                <LogIn className="h-4 w-4" />
                <span>Ingresar</span>
              </Link>
```

(El link "Para complejos" → `/para-complejos` del solid queda.)

- [ ] **Step 3: SiteFooter** — cambiar el link:

```tsx
          <Link href="/ingresar" className="hover:text-white transition-colors">Iniciar sesión</Link>
```

- [ ] **Step 4: typecheck + lint + commit**

Run: `pnpm typecheck 2>&1 | grep -v TurnoGol-audit-f02/` → sin errores.
Verificar que el header del jugador no apunte más a `/register` ni a `/login`:

Run: `git grep -n "/login\|/register" -- src/components/site/PortalHeader.tsx src/components/site/SiteFooter.tsx`
Expected: sin resultados.

```bash
git add src/components/site/PortalHeader.tsx src/components/site/SiteFooter.tsx
git commit -m "feat(portal): header/footer del jugador apuntan a /ingresar; drop CTA /register"
```

---

### Task 4: Grupo `(business)` + mover `para-complejos` + chrome B2B (atómico)

**Files:**
- Create: `src/components/site/BusinessHeader.tsx`
- Create: `src/components/site/BusinessFooter.tsx`
- Create: `src/app/(business)/layout.tsx`
- Move: `src/app/(public)/para-complejos/page.tsx` → `src/app/(business)/para-complejos/page.tsx` (+ copy CTAs)
- Test: `tests/unit/business-header.test.tsx`

**Interfaces:**
- Produces: `<BusinessHeader />`, `<BusinessFooter />` (sin props), `(business)/layout.tsx`.

- [ ] **Step 1: Test de BusinessHeader (falla primero)** — `tests/unit/business-header.test.tsx`

```tsx
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import BusinessHeader from '@/components/site/BusinessHeader'

afterEach(() => cleanup())

describe('BusinessHeader', () => {
  it('linkea Ingresar -> /login y Empezar gratis -> /register', () => {
    render(<BusinessHeader />)
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: /empezar gratis/i }).getAttribute('href')).toBe('/register')
  })

  it('no muestra navegación de jugador (Explorar)', () => {
    render(<BusinessHeader />)
    expect(screen.queryByRole('link', { name: /explorar/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Correr — debe FALLAR** (`Cannot find module BusinessHeader`).

Run: `pnpm test business-header` → FAIL.

- [ ] **Step 3: Crear `src/components/site/BusinessHeader.tsx`**

```tsx
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

/**
 * Cabecera de la superficie B2B (para-complejos). Dark, propia del producto:
 * sin navegación de jugador ni bottom-nav. Logo → home; anclas a secciones de
 * la landing; CTAs unificados Ingresar (/login) + Empezar gratis (/register).
 */
export default function BusinessHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="TurnoGol — inicio">
          <Logo variant="horizontal" textClassName="text-white" iconClassName="bg-white/95 border-emerald-500 shadow-emerald-500/30" />
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-slate-300 transition-colors hover:text-white">
            Funciones
          </a>
          <a href="#testimonios" className="text-sm text-slate-300 transition-colors hover:text-white">
            Testimonios
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-slate-200 transition-colors hover:text-white sm:inline"
          >
            Ingresar
          </Link>
          <Link
            href="/register"
            className="inline-flex h-9 items-center rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-colors hover:bg-emerald-400"
          >
            Empezar gratis
          </Link>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Correr — debe PASAR.**

Run: `pnpm test business-header` → PASS.

- [ ] **Step 5: Crear `src/components/site/BusinessFooter.tsx`**

```tsx
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

export default function BusinessFooter() {
  return (
    <footer className="border-t border-white/5 bg-slate-950 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Logo variant="horizontal" textClassName="text-white text-sm" iconClassName="h-7 w-7 bg-white/95" />
          <span className="text-xs text-slate-500">© {new Date().getFullYear()} · Argentina</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <Link href="/login" className="transition-colors hover:text-white">Ingresar</Link>
          <Link href="/register" className="transition-colors hover:text-white">Empezar gratis</Link>
          <a href="mailto:hola@turnogol.app" className="transition-colors hover:text-white">Contacto</a>
          <Link href="/privacy" className="transition-colors hover:text-white">Privacidad</Link>
          <Link href="/terms" className="transition-colors hover:text-white">Términos</Link>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 6: Crear `src/app/(business)/layout.tsx`**

```tsx
import type { ReactNode } from 'react'
import BusinessHeader from '@/components/site/BusinessHeader'
import BusinessFooter from '@/components/site/BusinessFooter'

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <BusinessHeader />
      <main id="main-content">{children}</main>
      <BusinessFooter />
    </div>
  )
}
```

- [ ] **Step 7: Mover el page** — `git mv src/app/(public)/para-complejos/page.tsx src/app/(business)/para-complejos/page.tsx`. La URL `/para-complejos` no cambia (route groups no afectan el path). El page ya NO debe envolver con header propio (lo da el layout). Quitar del JSX del page el wrapper `<div className="bg-slate-950 text-slate-100">` raíz si duplica el del layout — dejar que el layout aporte fondo/altura; el page devuelve solo las `<section>`s.

- [ ] **Step 8: Copy de CTAs en el page movido** — reemplazar textos (por contenido):
  - Hero: `Comenzá gratis 30 días` → `Empezar gratis`; `Iniciar sesión` → `Ingresar`.
  - FinalCta: `Crear mi cuenta` → `Empezar gratis`; `Ya tengo cuenta` → `Ingresar`.
  - (Los `href` `/register` y `/login` quedan: son la puerta del complejo.)

- [ ] **Step 9: typecheck + tests + commit**

Run: `pnpm typecheck 2>&1 | grep -v TurnoGol-audit-f02/` → sin errores.
Run: `pnpm test business-header` → PASS.
Confirmar que `/para-complejos` ya no está bajo `(public)`:

Run: `test ! -f "src/app/(public)/para-complejos/page.tsx" && test -f "src/app/(business)/para-complejos/page.tsx" && echo OK`
Expected: `OK`.

```bash
git add -A
git commit -m "feat(business): para-complejos en grupo (business) con chrome B2B propio"
```

---

### Task 5: Tests e2e + landing + verificación final

**Files:**
- Modify: `tests/e2e/critical-flows/player-magic-link.spec.ts`
- Modify: `tests/e2e/player-delete-account.spec.ts`
- Modify: `tests/e2e/landing.spec.ts`

**Interfaces:** ninguna. Solo tests.

- [ ] **Step 1: `player-magic-link.spec.ts`** — el jugador ya entra por `/ingresar` con form directo (sin toggle). Reemplazar el cuerpo de los dos tests:
  - `await page.goto('/login')` → `await page.goto('/ingresar')`.
  - Borrar `await page.getByRole('button', { name: /sos jugador/i }).click()`.
  - `getByLabel(/email de jugador/i)` → `getByLabel(/email/i)`.
  - El botón de envío: `getByRole('button', { name: /enviarme un enlace de acceso/i })` → `getByRole('button', { name: /enviarme el enlace/i })`.
  - Éxito: el texto pasa a `/revisá tu email/i` (el page nuevo usa "Revisá tu email" + "Te enviamos un enlace de acceso a …"). Usar `getByText(/te enviamos un enlace de acceso/i)` que sigue presente.
  - El test de error ("sigue en /login") → assert `toHaveURL(/\/ingresar/)`.
  - Actualizar el comentario del header del archivo (ya no hay toggle).

- [ ] **Step 2: `player-delete-account.spec.ts`** — la URL post-borrado pasa a `/ingresar?deleted=1`. Cambiar:

```ts
      await page.waitForURL(/\/ingresar(\?.*)?$/, { timeout: 10_000 })
```

y el comentario `// Should redirect to /login (with ?deleted=1)` → `/ingresar`.

- [ ] **Step 3: `landing.spec.ts`** — leer primero `src/app/page.tsx` y el archivo de test. La home usa `PortalHeader` overlay, cuyo CTA logged-out ahora es `Ingresar` → `/ingresar` (ya no hay CTA a `/register` en la home). Ajustar las aserciones de header: si el test asume un CTA `/comenzá gratis/ → /register` en `/`, reemplazarlo por aserción del CTA real: un link accesible `Ingresar` con `href` `/ingresar`, y el link `Para complejos` → `/para-complejos`. Si el `Comenzá gratis` que el test buscaba era de la vieja landing B2B en `/`, documentar que esa CTA ahora vive en `/para-complejos` (Empezar gratis) y mover/duplicar esa cobertura a un test que visite `/para-complejos`.

- [ ] **Step 4: Verificación final + commit**

Run: `pnpm typecheck 2>&1 | grep -v TurnoGol-audit-f02/` → sin errores.
Run: `pnpm test` → todo verde (unit). Confirmar que `ingresar-page` y `business-header` pasan y que no quedó test importando `login-deleted-notice`.
Lint de los archivos tocados:

Run: `npx eslint --no-eslintrc --config .eslintrc.json --resolve-plugins-relative-to . "src/app/(auth)/ingresar" "src/components/site/BusinessHeader.tsx" "src/components/site/BusinessFooter.tsx"`
Expected: sin errores nuevos (ignorar pre-existentes en PricingGrid/BookingCard, ajenos).

Grep final de aislamiento (debe NO devolver refs de jugador a `/login`):

Run: `git grep -n "/login" -- 'src/app/(player)' 'src/app/reserva' src/components/public src/components/site`
Expected: sin resultados.

> **e2e con stack:** los specs de Playwright (`player-magic-link`, `player-delete-account`, `landing`, más `public.spec`/`portal-search` que no cambian) requieren Supabase local + seed + dev server; correrlos en local/CI (no en este bg job). Ver memoria `e2e-isolated-port-bg-worktree`.

```bash
git add tests/e2e
git commit -m "test(e2e): jugador entra por /ingresar; landing header actualizado"
```

---

## Self-Review

**1. Spec coverage:**
- §3 rutas → Tasks 1 (/ingresar), 4 ((business)/para-complejos). ✓
- §4.1 /ingresar → Task 1. ✓ §4.2 /login limpio → Task 1. ✓ §4.3 (business)+move → Task 4. ✓ §4.4 chrome (BusinessHeader/Footer, PortalHeader, SiteFooter) → Tasks 3,4. ✓
- §5.1 repunteo → Task 2 (con los 3 comentarios extra del workflow). ✓ §5.2 staff intacto → no-op verificado por grep. ✓ §5.3 robots → Task 2 Step 7. ✓
- §6 vocabulario → Tasks 1 (login/register), 3 (header), 4 (para-complejos). Decisión home header (drop /register) documentada en Global Constraints + Task 3. ✓
- §7 refinar visual → /ingresar (Task 1), BusinessHeader/Footer (Task 4) dentro de dark+emerald. ✓
- §9 criterios → cubiertos por grep/typecheck/tests de Tasks 2,4,5. ✓ §10 testing → Tasks 1,4,5. ✓

**2. Placeholder scan:** sin TBD/TODO; todos los steps con código o comando concreto. Único punto con lectura previa obligatoria: Task 5 Step 3 (landing.spec.ts) — justificado porque su estado actual es incierto (asierta copy que no está en `/`); el step da el criterio exacto de qué asertar.

**3. Type consistency:** `PlayerLoginState`/`playerLoginAction` se mueven juntas y se re-importan desde `@/app/(auth)/ingresar/actions` (Task 1). `BusinessHeader`/`BusinessFooter` sin props, usadas por `(business)/layout.tsx`. `PortalHeader` mantiene firma. ✓

**Ordering:** Task 1 → 2 → (3,4 independientes) → 5. Hazards del workflow respetados (route antes de repunteo; move+layout atómico; mover acción atómico).
