# Pantalla de éxito post magic-link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tras verificar el magic link, mostrar una pantalla de éxito con copy según la intención, botón Continuar y auto-redirect a los 5s, en vez del redirect directo actual.

**Architecture:** El callback (`/api/auth/callback`) ya verifica la sesión server-side; sus ramas de éxito pasan a redirigir a `/verify?status=success&next=&intent=` en lugar de al destino directo. Se reusa la página `/verify` (layout `(auth)` passthrough, renderiza autenticada) agregando un estado de éxito. La lógica de intent/URL se extrae a helpers puros testeables; el auto-redirect vive en un client island chico.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vitest + @testing-library/react (happy-dom), Tailwind.

## Global Constraints

- TypeScript strict, nunca `any`.
- `sanitizeNext` (`src/lib/safe-redirect.ts`) es el único guard de open-redirect; fallback `/mis-reservas`.
- Intents válidos: exactamente `booking | login | signup`; cualquier otro → `login`.
- El flujo **recovery** (`type=recovery`) NO se toca: sigue redirigiendo directo a `/reset-password`.
- Tests de render: archivo arranca con `// @vitest-environment happy-dom`, usa `render`/`screen` de `@testing-library/react`.
- Correr `pnpm typecheck` después de cada cambio.
- Spec de referencia: `docs/superpowers/specs/2026-06-24-magic-link-success-screen-design.md`.

## File Structure

- **Create** `src/lib/auth-success.ts` — helpers puros: tipo `SuccessIntent`, `parseIntent`, `playerSuccessIntent`, `successVerifyPath`. Una sola responsabilidad: derivar intent + armar la URL de éxito. Importado por el callback y la página.
- **Create** `src/app/(auth)/verify/SuccessRedirect.tsx` — client island: countdown visible + auto-redirect a los 5s. Aísla el `'use client'` para que `page.tsx` siga server.
- **Modify** `src/app/(auth)/verify/page.tsx` — agregar `SuccessState` y ruteo por `searchParams.status`.
- **Modify** `src/app/api/auth/callback/route.ts` — ramas de éxito (jugador + staff signup) redirigen a `successVerifyPath(...)`.
- **Create** tests: `tests/unit/auth-success.test.ts`, `tests/unit/verify-success-redirect.test.tsx`, `tests/unit/verify-page-success.test.tsx`.

---

### Task 1: Helpers puros de intent + URL de éxito

**Files:**
- Create: `src/lib/auth-success.ts`
- Test: `tests/unit/auth-success.test.ts`

**Interfaces:**
- Consumes: nada (módulo base).
- Produces:
  - `type SuccessIntent = 'booking' | 'login' | 'signup'`
  - `parseIntent(raw: string | null | undefined): SuccessIntent`
  - `playerSuccessIntent(next: string): 'booking' | 'login'`
  - `successVerifyPath(next: string, intent: SuccessIntent): string`

- [ ] **Step 1: Write the failing test**

`tests/unit/auth-success.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  parseIntent,
  playerSuccessIntent,
  successVerifyPath,
} from '@/lib/auth-success'

describe('parseIntent', () => {
  it('acepta los 3 intents válidos', () => {
    expect(parseIntent('booking')).toBe('booking')
    expect(parseIntent('login')).toBe('login')
    expect(parseIntent('signup')).toBe('signup')
  })
  it('cae a login ante valor desconocido, vacío o null', () => {
    expect(parseIntent('hacker')).toBe('login')
    expect(parseIntent('')).toBe('login')
    expect(parseIntent(null)).toBe('login')
    expect(parseIntent(undefined)).toBe('login')
  })
})

describe('playerSuccessIntent', () => {
  it('booking cuando next es una ruta de reserva', () => {
    expect(playerSuccessIntent('/club-norte/reservar')).toBe('booking')
    expect(playerSuccessIntent('/club-norte/reservar?court=1&date=2026-06-25&time=20:00')).toBe('booking')
  })
  it('login para cualquier otro destino', () => {
    expect(playerSuccessIntent('/mis-reservas')).toBe('login')
    expect(playerSuccessIntent('/club-norte')).toBe('login')
    expect(playerSuccessIntent('/club-norte/reservartrampa')).toBe('login')
  })
})

describe('successVerifyPath', () => {
  it('arma /verify con status, next encodeado e intent', () => {
    expect(successVerifyPath('/mis-reservas', 'login')).toBe(
      '/verify?status=success&next=%2Fmis-reservas&intent=login',
    )
  })
  it('encodea query params del next', () => {
    const out = successVerifyPath('/club-norte/reservar?court=1&time=20:00', 'booking')
    expect(out).toBe(
      '/verify?status=success&next=%2Fclub-norte%2Freservar%3Fcourt%3D1%26time%3D20%3A00&intent=booking',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/auth-success.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth-success'`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/auth-success.ts`:

```ts
/**
 * Helpers para la pantalla de éxito post magic-link. El callback verifica la
 * sesión y redirige a `/verify?status=success&next=&intent=`; estos helpers
 * derivan el intent y arman esa URL. Puros y testeables (sin I/O).
 */

export type SuccessIntent = 'booking' | 'login' | 'signup'

const VALID_INTENTS = new Set<SuccessIntent>(['booking', 'login', 'signup'])

/** Valida el `intent` de la URL; cualquier valor fuera del set → `login`. */
export function parseIntent(raw: string | null | undefined): SuccessIntent {
  return raw && VALID_INTENTS.has(raw as SuccessIntent) ? (raw as SuccessIntent) : 'login'
}

// `/<slug>/reservar` seguido de fin, `/` o `?` — evita falsos positivos tipo
// `/x/reservartrampa`.
const BOOKING_PATH_RE = /^\/[^/]+\/reservar(?:[/?]|$)/

/** Distingue si el jugador volvía de reservar (booking) o de un login común. */
export function playerSuccessIntent(next: string): 'booking' | 'login' {
  return BOOKING_PATH_RE.test(next) ? 'booking' : 'login'
}

/** Arma el path de éxito de `/verify` con `next` encodeado e `intent`. */
export function successVerifyPath(next: string, intent: SuccessIntent): string {
  return `/verify?status=success&next=${encodeURIComponent(next)}&intent=${intent}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/auth-success.test.ts`
Expected: PASS (3 describes, todos verdes).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: sin errores nuevos. (Filtrar ruido conocido: `... | grep -v TurnoGol-audit-f02/`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth-success.ts tests/unit/auth-success.test.ts
git commit -m "feat(auth): helpers de intent + URL para pantalla de éxito magic-link"
```

---

### Task 2: Client island SuccessRedirect (countdown + auto-redirect 5s)

**Files:**
- Create: `src/app/(auth)/verify/SuccessRedirect.tsx`
- Test: `tests/unit/verify-success-redirect.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `export default function SuccessRedirect({ next }: { next: string }): JSX.Element`. Recibe el `next` **ya sanitizado** por el caller. A los 5s llama `window.location.assign(next)`.

- [ ] **Step 1: Write the failing test**

`tests/unit/verify-success-redirect.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import SuccessRedirect from '@/app/(auth)/verify/SuccessRedirect'

const origLocation = Object.getOwnPropertyDescriptor(window, 'location')
let assign: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  assign = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { assign, href: 'http://localhost/verify' },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  if (origLocation) Object.defineProperty(window, 'location', origLocation)
  cleanup()
})

describe('SuccessRedirect', () => {
  it('redirige a next a los 5 segundos', () => {
    render(<SuccessRedirect next="/mis-reservas" />)
    expect(assign).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(5000))
    expect(assign).toHaveBeenCalledWith('/mis-reservas')
  })

  it('muestra una cuenta regresiva que decrementa', () => {
    render(<SuccessRedirect next="/mis-reservas" />)
    expect(screen.getByText(/5\s*s/)).toBeTruthy()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText(/4\s*s/)).toBeTruthy()
  })

  it('no redirige tras desmontar (cleanup de timers)', () => {
    const { unmount } = render(<SuccessRedirect next="/mis-reservas" />)
    unmount()
    act(() => vi.advanceTimersByTime(5000))
    expect(assign).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/verify-success-redirect.test.tsx`
Expected: FAIL — `Cannot find module '@/app/(auth)/verify/SuccessRedirect'`.

- [ ] **Step 3: Write minimal implementation**

`src/app/(auth)/verify/SuccessRedirect.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

const SECONDS = 5

/**
 * Auto-redirect a `next` a los 5s con cuenta regresiva visible. El botón
 * Continuar de la página es el fallback inmediato y no-JS; este island solo
 * agrega la conveniencia del redirect automático. `next` ya viene sanitizado.
 */
export default function SuccessRedirect({ next }: { next: string }) {
  const [remaining, setRemaining] = useState(SECONDS)

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    const timeout = setTimeout(() => {
      window.location.assign(next)
    }, SECONDS * 1000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [next])

  return (
    <p className="mt-4 text-xs text-slate-500" aria-live="polite">
      Te llevamos automáticamente en {remaining}s…
    </p>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/verify-success-redirect.test.tsx`
Expected: PASS (3 tests verdes).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/verify/SuccessRedirect.tsx" tests/unit/verify-success-redirect.test.tsx
git commit -m "feat(auth): client island con auto-redirect 5s + countdown"
```

---

### Task 3: Estado de éxito en la página /verify

**Files:**
- Modify: `src/app/(auth)/verify/page.tsx`
- Test: `tests/unit/verify-page-success.test.tsx`

**Interfaces:**
- Consumes: `parseIntent` de `@/lib/auth-success`, `sanitizeNext` de `@/lib/safe-redirect`, `SuccessRedirect` (default) de `./SuccessRedirect`.
- Produces: `VerifyPage` ahora acepta `searchParams: { error?: string; status?: string; next?: string; intent?: string }` y renderiza `SuccessState` cuando `status === 'success'`.

- [ ] **Step 1: Write the failing test**

`tests/unit/verify-page-success.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Mockear el client island para evitar timers/redirect en el test del server
// component; solo verificamos que recibe el next sanitizado.
vi.mock('@/app/(auth)/verify/SuccessRedirect', () => ({
  default: ({ next }: { next: string }) => <div data-testid="redirect" data-next={next} />,
}))

import VerifyPage from '@/app/(auth)/verify/page'

afterEach(() => cleanup())

function renderPage(searchParams: Record<string, string>) {
  // VerifyPage es un server component sync; se puede invocar y renderizar.
  return render(VerifyPage({ searchParams }))
}

describe('VerifyPage — estado de éxito', () => {
  it('intent booking: copy de reserva + botón al next', () => {
    renderPage({ status: 'success', next: '/club-norte/reservar?court=1', intent: 'booking' })
    expect(screen.getByText(/cuenta confirmada/i)).toBeTruthy()
    expect(screen.getByText(/terminar tu reserva/i)).toBeTruthy()
    const link = screen.getByRole('link', { name: /continuar con mi reserva/i })
    expect(link.getAttribute('href')).toBe('/club-norte/reservar?court=1')
  })

  it('intent login: copy genérico + botón a mis reservas', () => {
    renderPage({ status: 'success', next: '/mis-reservas', intent: 'login' })
    expect(screen.getByText(/iniciaste sesión/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /ir a mis reservas/i }).getAttribute('href')).toBe('/mis-reservas')
  })

  it('intent signup: bienvenida + botón al panel', () => {
    renderPage({ status: 'success', next: '/dashboard', intent: 'signup' })
    expect(screen.getByText(/bienvenido a turnogol/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /ir al panel/i }).getAttribute('href')).toBe('/dashboard')
  })

  it('next malicioso cae al fallback /mis-reservas', () => {
    renderPage({ status: 'success', next: '//evil.com', intent: 'login' })
    expect(screen.getByRole('link', { name: /ir a mis reservas/i }).getAttribute('href')).toBe('/mis-reservas')
    expect(screen.getByTestId('redirect').getAttribute('data-next')).toBe('/mis-reservas')
  })

  it('intent inválido cae a login', () => {
    renderPage({ status: 'success', next: '/mis-reservas', intent: 'hacker' })
    expect(screen.getByText(/iniciaste sesión/i)).toBeTruthy()
  })

  it('muestra la pista cross-device', () => {
    renderPage({ status: 'success', next: '/mis-reservas', intent: 'login' })
    expect(screen.getByText(/otro dispositivo/i)).toBeTruthy()
  })

  it('con ?error sigue mostrando el estado de error', () => {
    renderPage({ error: 'expired' })
    expect(screen.getByText(/no pudimos verificar tu enlace/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/verify-page-success.test.tsx`
Expected: FAIL — no existe el `SuccessState`; `getByText(/cuenta confirmada/i)` no matchea.

- [ ] **Step 3: Write the implementation**

Reemplazar `src/app/(auth)/verify/page.tsx` por:

```tsx
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { parseIntent, type SuccessIntent } from '@/lib/auth-success'
import { sanitizeNext } from '@/lib/safe-redirect'
import SuccessRedirect from './SuccessRedirect'

const ERROR_COPY: Record<string, string> = {
  expired: 'Este enlace expiró. Generá uno nuevo desde Iniciar sesión.',
  used: 'Este enlace ya fue utilizado. Iniciá sesión nuevamente.',
  invalid: 'No pudimos verificar el enlace. Probá de nuevo.',
  exchange_failed: 'No pudimos completar el inicio de sesión. Probá de nuevo.',
}

const SUCCESS_COPY: Record<SuccessIntent, { title: string; subtitle: string; cta: string }> = {
  booking: {
    title: '¡Cuenta confirmada!',
    subtitle: 'Volvé para terminar tu reserva.',
    cta: 'Continuar con mi reserva',
  },
  login: {
    title: '¡Listo!',
    subtitle: 'Iniciaste sesión correctamente.',
    cta: 'Ir a mis reservas',
  },
  signup: {
    title: '¡Bienvenido a TurnoGol!',
    subtitle: 'Tu cuenta quedó activada.',
    cta: 'Ir al panel',
  },
}

export default function VerifyPage({
  searchParams,
}: {
  searchParams: { error?: string; status?: string; next?: string; intent?: string }
}) {
  const isSuccess = searchParams.status === 'success'
  const errCode = searchParams.error
  const isError = Boolean(errCode)

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 px-4 py-12">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.12),_transparent_60%)]"
      />
      <div className="relative w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">
            TG
          </span>
          <span className="text-base font-semibold text-slate-900">TurnoGol</span>
        </Link>

        <div className="rounded-2xl border border-slate-200/60 bg-white/90 p-8 text-center shadow-xl shadow-slate-900/5 backdrop-blur-md">
          {isSuccess ? (
            <SuccessState next={searchParams.next} intent={parseIntent(searchParams.intent)} />
          ) : isError ? (
            <ErrorState code={errCode!} />
          ) : (
            <LoadingState />
          )}
        </div>
      </div>
    </div>
  )
}

function SuccessState({ next, intent }: { next: string | undefined; intent: SuccessIntent }) {
  const safeNext = sanitizeNext(next)
  const copy = SUCCESS_COPY[intent]
  return (
    <>
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <CheckCircle2 className="h-6 w-6 text-emerald-700" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{copy.title}</h1>
      <p className="mt-3 text-sm text-slate-600">{copy.subtitle}</p>
      <Link
        href={safeNext}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30"
      >
        {copy.cta}
      </Link>
      <p className="mt-4 text-xs text-slate-500">
        ¿Abriste el enlace en otro dispositivo? Volvé a la pantalla donde empezaste para seguir.
      </p>
      <SuccessRedirect next={safeNext} />
    </>
  )
}

function LoadingState() {
  return (
    <>
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-700" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
        Verificando tu enlace…
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        Esto tarda un instante. No cierres esta pestaña.
      </p>
    </>
  )
}

function ErrorState({ code }: { code: string }) {
  const message = ERROR_COPY[code] ?? ERROR_COPY.invalid
  return (
    <>
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 ring-8 ring-red-50">
        <AlertCircle className="h-6 w-6 text-red-600" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
        No pudimos verificar tu enlace
      </h1>
      <p className="mt-3 text-sm text-slate-600">{message}</p>
      <Link
        href="/login"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30"
      >
        Volver a intentar
      </Link>
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/verify-page-success.test.tsx`
Expected: PASS (7 tests verdes).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/verify/page.tsx" tests/unit/verify-page-success.test.tsx
git commit -m "feat(auth): estado de éxito en /verify (copy por intent + cross-device)"
```

---

### Task 4: Cablear el callback a la pantalla de éxito

**Files:**
- Modify: `src/app/api/auth/callback/route.ts`

**Interfaces:**
- Consumes: `playerSuccessIntent`, `successVerifyPath` de `@/lib/auth-success`.
- Produces: ramas de éxito jugador + staff signup redirigen a `/verify?status=success&...`. Recovery sin cambios.

- [ ] **Step 1: Agregar el import**

En `src/app/api/auth/callback/route.ts`, junto a los imports existentes:

```ts
import { playerSuccessIntent, successVerifyPath } from '@/lib/auth-success'
```

- [ ] **Step 2: Rama jugador → pantalla de éxito**

Reemplazar (rama `if (isPlayer)`, al final):

```ts
    track.auth('player.login', { playerId: player.id })
    const next = sanitizeNext(new URL(req.url).searchParams.get('next'))
    return NextResponse.redirect(new URL(next, req.url))
```

por:

```ts
    track.auth('player.login', { playerId: player.id })
    const next = sanitizeNext(new URL(req.url).searchParams.get('next'))
    const intent = playerSuccessIntent(next)
    return NextResponse.redirect(new URL(successVerifyPath(next, intent), req.url))
```

- [ ] **Step 3: Rama staff signup → pantalla de éxito**

Reemplazar (final del handler):

```ts
  const { path } = await provisionAndRouteStaff(user)
  return NextResponse.redirect(new URL(path, req.url))
```

por:

```ts
  const { path } = await provisionAndRouteStaff(user)
  return NextResponse.redirect(new URL(successVerifyPath(path, 'signup'), req.url))
```

(La rama `recovery` que devuelve `/reset-password` NO se toca.)

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: sin errores nuevos.

- [ ] **Step 5: Verificación end-to-end real (Inbucket)**

Pre-requisito: dev server en `:3000` y Supabase local arriba con templates cargados (subject "Tu acceso a TurnoGol"). Si el subject sale "Your Magic Link", correr `npx supabase stop && npx supabase start` desde la raíz (ver memoria `magic-link-pkce-token-hash`).

```bash
ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
API='http://127.0.0.1:54331'; IB='http://127.0.0.1:54324'
RT='http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback%3Fnext%3D%252Fmis-reservas'
curl -s -X POST "$API/auth/v1/otp?redirect_to=$RT" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"e2e-player@turnogol.test","create_user":true,"data":{"is_player":true}}' >/dev/null
sleep 1
ID=$(curl -s "$IB/api/v1/mailbox/e2e-player" | python -c "import sys,json;d=json.load(sys.stdin);print(d[-1]['id'])")
LINK=$(curl -s "$IB/api/v1/mailbox/e2e-player/$ID" | python -c "import sys,json,re;d=json.load(sys.stdin);b=d.get('body',{}).get('html') or d.get('body',{}).get('text','');print([h.replace('&amp;','&') for h in re.findall(r'href=\"([^\"]+)\"',b) if 'token_hash' in h][0])")
JAR=$(mktemp)
curl -s -c "$JAR" -b "$JAR" -D - -o /dev/null -L --max-redirs 10 "$LINK" 2>&1 | grep -iE '^location:'
rm -f "$JAR"
```

Expected: la cadena incluye una redirección a `…/verify?status=success&next=%2Fmis-reservas&intent=login` (en vez de directo a `/mis-reservas`).

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/auth/callback/route.ts"
git commit -m "feat(auth): redirigir el callback a la pantalla de éxito (jugador + staff)"
```

---

### Task 5: Suite completa + verificación final

**Files:** ninguno (verificación).

- [ ] **Step 1: Correr la suite unit completa**

Run: `pnpm test`
Expected: verde. En particular, ningún test viejo asume el redirect directo del callback. (Si algún test del callback assertaba `/dashboard` o `/mis-reservas` como Location directo, actualizarlo al nuevo `/verify?status=success&...&intent=...` — buscar con `grep -rn "auth/callback" tests/`.)

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: sin errores nuevos.

- [ ] **Step 3: Typecheck final**

Run: `pnpm typecheck`
Expected: limpio.

- [ ] **Step 4: Commit (si hubo ajustes de tests viejos)**

```bash
git add -A
git commit -m "test(auth): actualizar asserts del callback al flujo de pantalla de éxito"
```

---

## Notas / fuera de scope

- **Recovery** (`/reset-password`) intencionalmente sin pantalla de éxito.
- **Auto-resume de la pestaña original** (polling cross-device): no-objetivo (ver spec).
- **LoadingState** de `/verify` sin params: queda como está (estado prácticamente inalcanzable en éxito porque el callback ahora siempre manda `status=success`). No se limpia en este plan para no ampliar scope; candidato a follow-up.
- **Prod (R6):** los templates de email deben cargarse a mano en el dashboard de Supabase. Independiente de este plan; documentado en la memoria `magic-link-pkce-token-hash`.
