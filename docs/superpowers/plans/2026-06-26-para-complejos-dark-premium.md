# Landing `/para-complejos` dark-premium — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar la landing B2B `/para-complejos` al mismo lenguaje visual dark-premium que la landing del jugador (`src/app/page.tsx`), conservando contenido, semántica B2B de auth y los contratos de test.

**Architecture:** Restyle in-place de 4 archivos (layout business, BusinessHeader, BusinessFooter, page de para-complejos). Se reutiliza el componente `Reveal` y las clases/animaciones globales ya definidas (`tg-float`, `tg-drift`, `font-display`, `font-logo`). El "wow" del hero es un mockup flotante local nuevo (análogo a `BookingCardMockup` del jugador). DRY: un kit de snippets premium reusables (glow blob, partículas, eyebrow, chrome de card) evita duplicar markup.

**Tech Stack:** Next.js 14 (App Router, RSC), TypeScript strict, Tailwind CSS, lucide-react, `Reveal` (IntersectionObserver client component existente).

**Spec:** `docs/superpowers/specs/2026-06-26-para-complejos-dark-premium-design.md`

**Fuente de verdad visual a copiar:** `src/app/page.tsx` (landing del jugador). Cuando el plan dice "patrón jugador L<n>", referencia esas líneas — copiar el snippet real de ahí, no reinventarlo.

## Global Constraints

- **Auth B2B (NUNCA cambiar):** `Ingresar` → `/login`; `Empezar gratis` → `/register`. Jamás `/ingresar` (es ruta de jugador / magic link).
- **TypeScript strict, nunca `any`.** Correr `pnpm typecheck` después de cada cambio (regla CLAUDE.md).
- **Lint verde:** `pnpm lint` después de cada cambio.
- **Contrato unit `tests/unit/business-header.test.tsx`:** `BusinessHeader` debe exponer link accesible `Ingresar`→`/login`, `Empezar gratis`→`/register`, y **NO** un link `Explorar`.
- **Contrato e2e `tests/e2e/landing.spec.ts`:** en `/para-complejos` debe existir un link con accessible name `/empezar gratis/i` cuyo `href` matchee `/register`.
- **a11y / motion:** todo blob/partícula/float decorativo lleva `aria-hidden` y respeta `motion-reduce:` (paridad con el jugador). Un solo `<h1>` por página.
- **No tocar:** rutas, otras superficies, auth, componentes del jugador (`PortalHeader`, `SiteFooter`) — no se reusan ni modifican.
- **Commits:** frecuentes, uno por tarea. Mensaje en español, prefijo conventional. Footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Verificación visual:** "tests" tradicionales no cubren lo visual; la verificación final es typecheck+lint+unit+e2e verdes y comparación de pantalla `/para-complejos` vs `/`.

---

## Style Kit (referencia — copiar de `src/app/page.tsx`)

Snippets premium reusables. Cada tarea referencia estos por nombre. Copiar el snippet REAL desde las líneas indicadas del jugador para mantener paridad exacta de blur/opacidades/timing.

- **KIT-BG:** fondo wrapper `#020617` + `text-slate-300`. Jugador L84-87.
- **KIT-GLOW-R / KIT-GLOW-L:** glow blobs radiales (derecha con `animate-tg-drift`, izquierda estático). Jugador L118-129.
- **KIT-PARTICLE:** partículas flotantes `animate-tg-float` con `boxShadow` esmeralda, `motion-reduce:hidden`. Jugador L130-143.
- **KIT-HEROBG:** bg image con `maskImage` linear-gradient + `opacity-30`. Jugador L106-117.
- **KIT-PILL-LIVE:** pill "en vivo" con punto `animate-ping`. Jugador L148-158.
- **KIT-EYEBROW:** eyebrow `font-logo uppercase tracking` con barritas esmeralda. Jugador L478-481 (lado) / L540-544 (centrado).
- **KIT-H2:** `h2 font-display font-black italic` con `clamp(34px,4vw,50px)`. Jugador L482-491.
- **KIT-CARD:** chrome de card premium (`rounded-[20px]`, `border-white/[.09]`, `background: linear-gradient(180deg, rgba(15,23,42,.6), rgba(2,6,23,.7))`, hover `-translate-y-1` + ring esmeralda). Jugador L563-569.
- **KIT-ICONCHIP:** chip de icono `52px` glow esmeralda. Jugador L577-587.
- **KIT-CTA-PRIMARY:** botón esmeralda con `boxShadow: 0 8px 30px rgba(16,185,129,.35)`, hover `-translate-y-0.5`. Jugador L740-750.
- **KIT-CTA-GHOST:** botón ghost `border-white/15 bg-white/5`. Jugador L497-500.

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/app/(business)/layout.tsx` | Wrapper B2B: fondo + header/main/footer | Modificar (bg `#020617`) |
| `src/components/site/BusinessHeader.tsx` | Header B2B premium (pill overlay), links B2B | Reescribir markup, mismos links |
| `src/components/site/BusinessFooter.tsx` | Footer B2B premium, links B2B | Reescribir markup, mismos links |
| `src/app/(business)/para-complejos/page.tsx` | 6 secciones + mockup hero | Reescribir cada sección al kit |
| `tests/unit/business-header.test.tsx` | Contrato links header | NO cambiar (debe seguir verde) |
| `tests/e2e/landing.spec.ts` | Contrato CTA register | NO cambiar (debe seguir verde) |

---

## Task 1: Layout bg + BusinessHeader pill overlay premium

**Files:**
- Modify: `src/app/(business)/layout.tsx`
- Modify (rewrite markup): `src/components/site/BusinessHeader.tsx`
- Test (no editar, mantener verde): `tests/unit/business-header.test.tsx`

**Interfaces:**
- Produces: `BusinessHeader` (default export, sin props) con header overlay. `BusinessLayout` con fondo `#020617`.
- Consumes: `Logo` de `@/components/ui/logo`; iconos `Building2`, `Star` de `lucide-react` (opcionales para anclas).

- [ ] **Step 1: Confirmar el contrato unit actual falla-safe (correr antes de tocar)**

Run: `pnpm test -- business-header`
Expected: PASS (2 tests) — baseline verde antes del restyle.

- [ ] **Step 2: Cambiar el fondo del layout business**

En `src/app/(business)/layout.tsx`, reemplazar el `div` raíz:

```tsx
import type { ReactNode } from 'react'
import BusinessHeader from '@/components/site/BusinessHeader'
import BusinessFooter from '@/components/site/BusinessFooter'

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh text-slate-300" style={{ background: '#020617' }}>
      <BusinessHeader />
      <main id="main-content">{children}</main>
      <BusinessFooter />
    </div>
  )
}
```

- [ ] **Step 3: Reescribir BusinessHeader al pill overlay premium (mismos links)**

Reemplazar `src/components/site/BusinessHeader.tsx` completo:

```tsx
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

/**
 * Cabecera B2B (para-complejos) — pill flotante dark-premium, mismo lenguaje
 * visual que el header overlay del jugador, pero con links de staff:
 * Ingresar → /login (password), Empezar gratis → /register. Sin nav de jugador.
 */
export default function BusinessHeader() {
  return (
    <header className="sticky top-0 z-50 w-full px-6 pt-[18px]">
      <div className="mx-auto max-w-[1240px]">
        <div
          className="flex items-center justify-between gap-6"
          style={{
            padding: '12px 14px 12px 24px',
            borderRadius: '9999px',
            background: 'rgba(8,15,32,.62)',
            backdropFilter: 'blur(18px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
            border: '1px solid rgba(255,255,255,.09)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06), 0 18px 50px -28px rgba(0,0,0,.9)',
          }}
        >
          <Link
            href="/"
            aria-label="TurnoGol — inicio"
            className="flex-shrink-0 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-full"
          >
            <Logo variant="horizontal" textClassName="text-white" />
          </Link>
          <div className="flex items-center gap-1.5">
            <a
              href="#features"
              className="hidden items-center rounded-full px-4 py-[9px] text-sm font-semibold text-slate-300 transition-all duration-150 hover:bg-white/[.06] hover:text-white sm:inline-flex"
            >
              Funciones
            </a>
            <a
              href="#testimonios"
              className="hidden items-center rounded-full px-4 py-[9px] text-sm font-semibold text-slate-300 transition-all duration-150 hover:bg-white/[.06] hover:text-white sm:inline-flex"
            >
              Testimonios
            </a>
            <span aria-hidden className="mx-1.5 h-[22px] w-px bg-white/10" />
            <Link
              href="/login"
              className="hidden h-11 items-center rounded-full px-5 text-sm font-semibold text-slate-200 transition-colors hover:text-white sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Ingresar
            </Link>
            <Link
              href="/register"
              className="inline-flex h-11 items-center rounded-full bg-emerald-600 px-6 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              style={{ boxShadow: '0 8px 30px rgba(16,185,129,.35)' }}
            >
              Empezar gratis
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
```

> NOTA: "Ingresar" tiene `hidden sm:inline-flex` igual que antes. El unit test rendea sin viewport (happy-dom) por lo que el elemento existe en el DOM aunque tenga `hidden` — `getByRole('link', { name: 'Ingresar' })` lo encuentra. No envolver "Ingresar" en condición que lo saque del DOM.

- [ ] **Step 4: Verificar contrato unit verde**

Run: `pnpm test -- business-header`
Expected: PASS (2 tests). Si `Ingresar` no aparece, revisar que no esté removido del DOM (solo `hidden`, no condicional de render).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores nuevos. (Filtrar ruido de `TurnoGol-audit-f02/` si aparece — ver memoria del proyecto.)

- [ ] **Step 6: Commit**

```bash
git add src/app/\(business\)/layout.tsx src/components/site/BusinessHeader.tsx
git commit -m "feat(b2b): header pill overlay + fondo #020617 en para-complejos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: BusinessFooter premium

**Files:**
- Modify (rewrite markup): `src/components/site/BusinessFooter.tsx`

**Interfaces:**
- Produces: `BusinessFooter` (default export, sin props). Links B2B intactos: `/login`, `/register`, `mailto`, `/privacy`, `/terms`.

- [ ] **Step 1: Reescribir BusinessFooter al look premium**

Reemplazar `src/components/site/BusinessFooter.tsx` completo. Mismo set de links que hoy, fondo `#020617` con borde sutil y separador glow:

```tsx
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

const linkCls =
  'transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 rounded'

export default function BusinessFooter() {
  return (
    <footer
      className="relative border-t border-white/[.08] py-12"
      style={{ background: '#020617' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(16,185,129,.4), transparent)' }}
      />
      <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-2">
          <Link href="/" aria-label="TurnoGol — inicio" className={linkCls}>
            <Logo variant="horizontal" textClassName="text-white text-sm" iconClassName="h-7 w-7 bg-white/95" />
          </Link>
          <span className="text-xs text-slate-500">© {new Date().getFullYear()} · Argentina</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <Link href="/login" className={linkCls}>Ingresar</Link>
          <Link href="/register" className={linkCls}>Empezar gratis</Link>
          <a href="mailto:hola@turnogol.app" className={linkCls}>Contacto</a>
          <Link href="/privacy" className={linkCls}>Privacidad</Link>
          <Link href="/terms" className={linkCls}>Términos</Link>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/components/site/BusinessFooter.tsx
git commit -m "feat(b2b): footer premium en para-complejos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Hero + mockup flotante "Panel del complejo en vivo"

**Files:**
- Modify (rewrite `Hero`, add `PanelMockup`): `src/app/(business)/para-complejos/page.tsx`
- Test (mantener verde): `tests/e2e/landing.spec.ts`

**Interfaces:**
- Consumes: `Link` de `next/link`; iconos `ArrowRight`, `CheckCircle2`, `Zap` de `lucide-react`.
- Produces: función local `Hero()` (2 columnas) y `PanelMockup()` (decorativa, `aria-hidden`). El `page.tsx` ya importa `Image`/`Link`/iconos; ajustar imports a lo usado.

- [ ] **Step 1: Reescribir imports y la función `Hero` del page**

En `src/app/(business)/para-complejos/page.tsx`, reemplazar la función `Hero` actual (L113-187). Mantener el CTA `Empezar gratis` → `/register` (contrato e2e). Aplicar KIT-HEROBG, KIT-GLOW-R/L, KIT-PARTICLE, KIT-PILL-LIVE:

```tsx
function Hero() {
  return (
    <section className="relative flex min-h-[84vh] items-center overflow-hidden px-6 py-[60px] pb-[84px]">
      {/* KIT-HEROBG */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-30"
        style={{
          backgroundImage: "url('/hero-bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
          transform: 'scale(1.05)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)',
        }}
      />
      {/* KIT-GLOW-R */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-6%] top-[-10%] z-0 h-[760px] w-[760px] animate-tg-drift rounded-full blur-[8px] motion-reduce:animate-none"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.28), transparent 70%)' }}
      />
      {/* KIT-GLOW-L */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-20%] left-[-10%] z-0 h-[620px] w-[620px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(5,150,105,.12), transparent 72%)' }}
      />
      {/* KIT-PARTICLE x2 */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[8%] top-[24%] z-0 h-[6px] w-[6px] animate-tg-float rounded-full bg-emerald-400 motion-reduce:hidden"
        style={{ boxShadow: '0 0 16px 4px rgba(52,211,153,.6)' }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-[18%] right-[40%] z-0 h-[5px] w-[5px] rounded-full bg-emerald-300 motion-reduce:hidden"
        style={{ boxShadow: '0 0 14px 3px rgba(110,231,183,.55)', animation: 'tg-float 10s ease-in-out infinite 0.8s' }}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1240px] grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.04fr_0.96fr]">
        <div className="min-w-0">
          {/* KIT-PILL-LIVE */}
          <div
            className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[13px] font-semibold text-[#6ee7b7] backdrop-blur-sm"
            style={{ boxShadow: 'inset 0 0 30px rgba(16,185,129,.14)', whiteSpace: 'nowrap' }}
          >
            <Zap className="h-3.5 w-3.5" aria-hidden />
            Para dueños y encargados
          </div>

          <h1
            className="mt-[22px] font-display font-black italic text-[#f8fafc]"
            style={{
              fontSize: 'clamp(44px, 5.2vw, 74px)',
              lineHeight: '0.95',
              letterSpacing: '-0.035em',
              textShadow: '0 12px 60px rgba(0,0,0,.5)',
            }}
          >
            Tu complejo de fútbol,
            <br />
            <span
              style={{
                background: 'linear-gradient(100deg, #6ee7b7, #34d399 45%, #10b981)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              lleno todos los días.
            </span>
          </h1>

          <p className="mt-6 max-w-[540px] text-slate-400" style={{ fontSize: 'clamp(16px, 1.5vw, 20px)', lineHeight: '1.55' }}>
            La plataforma que reemplaza tu cuaderno y tu WhatsApp. Reservas online,
            cobros automáticos con MercadoPago y la grilla en tiempo real.{' '}
            <span className="font-semibold text-slate-200">Hecho 100% para complejos de fútbol argentinos.</span>
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/register"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-600 px-7 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500"
              style={{ boxShadow: '0 8px 30px rgba(16,185,129,.35)' }}
            >
              Empezar gratis
              <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-7 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ingresar
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-slate-400">
            {['Sin tarjeta de crédito', 'Configuración en menos de 2 minutos', 'Soporte por email'].map((t) => (
              <li key={t} className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <PanelMockup />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Agregar el componente `PanelMockup` (mockup flotante B2B)**

Agregar debajo de `Hero` en el mismo archivo. Tarjeta glass con mini-grilla de turnos, fila de caja del día y toast flotante. Análogo a `BookingCardMockup` del jugador pero con lente "panel del complejo":

```tsx
const PANEL_SLOTS = [
  { time: '18', state: 'occupied' },
  { time: '19', state: 'free' },
  { time: '20', state: 'occupied' },
  { time: '21', state: 'new' },
  { time: '22', state: 'occupied' },
  { time: '23', state: 'free' },
] as const

function PanelMockup() {
  return (
    <div className="relative hidden min-w-0 lg:block" aria-hidden>
      {/* Glow detrás */}
      <div
        className="pointer-events-none absolute inset-[6%_8%] rounded-[28px] blur-[30px]"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.3), transparent 75%)' }}
      />
      {/* Card */}
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: '24px',
          background: 'linear-gradient(180deg, rgba(15,23,42,.86), rgba(2,6,23,.92))',
          border: '1px solid rgba(255,255,255,.1)',
          boxShadow: '0 0 70px rgba(16,185,129,.21), 0 50px 90px -40px rgba(0,0,0,.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          animation: 'tg-float 9s ease-in-out infinite',
        }}
      >
        {/* Header del panel */}
        <div className="flex items-center justify-between border-b border-white/[.08] px-[22px] py-[16px]">
          <div>
            <div className="font-logo text-[11px] uppercase tracking-[.06em] text-slate-500">Panel · Hoy</div>
            <div className="font-display font-bold text-[18px] text-[#f8fafc]">Grilla en vivo</div>
          </div>
          <div
            className="inline-flex items-center gap-[7px] rounded-full px-3 py-[6px] text-[11px] font-bold uppercase tracking-[.08em] text-[#6ee7b7]"
            style={{ background: 'rgba(2,6,23,.6)', border: '1px solid rgba(16,185,129,.45)' }}
          >
            <span className="relative flex h-[7px] w-[7px]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-emerald-400" />
            </span>
            En vivo
          </div>
        </div>

        <div className="p-[22px]">
          {/* Slots */}
          <div className="mb-[10px] flex items-center justify-between">
            <span className="font-logo text-[12px] font-bold uppercase tracking-[.06em] text-slate-500">Cancha 1 · Turnos</span>
            <span className="text-[12px] font-semibold text-emerald-400">2 libres</span>
          </div>
          <div className="grid grid-cols-3 gap-[9px]">
            {PANEL_SLOTS.map(({ time, state }) => (
              <div
                key={time}
                className="flex flex-col items-center gap-[2px] rounded-[12px] px-1 py-[11px]"
                style={
                  state === 'new'
                    ? {
                        background: 'linear-gradient(160deg, #10b981, #059669)',
                        border: '1px solid #34d399',
                        boxShadow: '0 0 22px rgba(16,185,129,.55), inset 0 1px 0 rgba(255,255,255,.3)',
                      }
                    : state === 'free'
                      ? { background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.32)' }
                      : { background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', opacity: '0.55' }
                }
              >
                <span
                  className={`font-logo font-bold text-[15px] ${
                    state === 'new' ? 'text-white' : state === 'free' ? 'text-[#6ee7b7]' : 'text-slate-500'
                  }`}
                >
                  {time}:00
                </span>
                <span
                  className={`text-[10px] uppercase tracking-[.04em] ${
                    state === 'new' ? 'text-[#d1fae5]' : state === 'free' ? 'text-emerald-400' : 'text-slate-600'
                  }`}
                >
                  {state === 'new' ? 'Nueva' : state === 'free' ? 'Libre' : 'Ocupado'}
                </span>
              </div>
            ))}
          </div>

          {/* Fila caja del día */}
          <div className="mt-[18px] flex items-center justify-between gap-3 border-t border-white/[.08] pt-[16px]">
            <div>
              <div className="font-logo text-[11px] uppercase tracking-[.05em] text-slate-500">Caja del día</div>
              <div className="font-display font-bold text-[20px] text-[#f8fafc]">$184.500</div>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-xl px-4 py-[10px] text-[13px] font-semibold text-[#6ee7b7]"
              style={{ background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)' }}
            >
              9 reservas hoy
            </div>
          </div>
        </div>
      </div>

      {/* Toast "Nueva reserva online" */}
      <div
        className="absolute -left-[26px] bottom-9 inline-flex items-center gap-[9px] rounded-[14px] p-[10px_14px]"
        style={{
          background: 'rgba(8,15,32,.88)',
          border: '1px solid rgba(255,255,255,.12)',
          boxShadow: '0 18px 40px -18px rgba(0,0,0,.9)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          animation: 'tg-float 7s ease-in-out infinite 1.4s',
        }}
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-emerald-400" style={{ background: 'rgba(16,185,129,.18)' }}>
          <Bell className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <div className="text-[13px] font-bold text-[#f1f5f9]">Nueva reserva online</div>
          <div className="text-[11px] text-slate-500">hace 1 minuto</div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Ajustar imports del archivo**

Asegurar que `lucide-react` importe lo usado por Hero/PanelMockup: `ArrowRight`, `Bell`, `CheckCircle2`, `Zap` (más los de otras secciones). Quitar imports que queden sin uso (ej. `Image` si el hero ya no usa `next/image` — el bg es un `div` con `backgroundImage`). `pnpm lint` lo marca.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores; sin imports sin usar.

- [ ] **Step 5: Verificar contrato e2e (hero conserva CTA register)**

Run: `pnpm test:e2e -- landing`
Expected: PASS — en particular el test `/para-complejos tiene CTA "Empezar gratis" → /register`. (Requiere dev/preview server según config de Playwright.) Si no se puede correr e2e local, validar manualmente que existe `<Link href="/register">Empezar gratis</Link>` en el render.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(business\)/para-complejos/page.tsx
git commit -m "feat(b2b): hero 2-col + mockup panel en vivo en para-complejos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Features premium + fix dato falso (24hs → Avisos al instante)

**Files:**
- Modify (`features` array + `Features` render): `src/app/(business)/para-complejos/page.tsx`

**Interfaces:**
- Consumes: `Reveal` de `@/components/site/Reveal`; iconos `Calendar`, `CreditCard`, `LineChart`, `Bell`, `Wallet`, `Users`.
- Produces: `Features()` restyled; `features` array con card 4 corregida.

- [ ] **Step 1: Importar `Reveal` y corregir el array `features`**

Agregar `import Reveal from '@/components/site/Reveal'` (si no está). En el array `features` (L30-67), reemplazar **solo** la card 4 (la de `Bell` / "Recordatorios automáticos"):

```tsx
  {
    icon: Bell,
    title: 'Avisos al instante',
    description:
      'Push al admin apenas entra una reserva online. En la madrugada se agenda para las 8 AM: no suena de noche.',
  },
```

Las otras 5 cards quedan igual (reservas 24/7, MercadoPago, dashboard, caja unificada, abonados/fijos).

- [ ] **Step 2: Reescribir `Features` al kit premium**

Reemplazar la función `Features` (L189-222) — eyebrow KIT-EYEBROW, KIT-H2, cards KIT-CARD + KIT-ICONCHIP, envueltas en `Reveal`:

```tsx
function Features() {
  return (
    <section id="features" className="relative z-10 py-20 sm:py-28">
      <div className="mx-auto max-w-[1240px] px-6">
        <Reveal>
          <div className="mx-auto mb-12 max-w-[640px] text-center">
            <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400 whitespace-nowrap">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
              Todo lo que necesitás
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(32px, 4vw, 50px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              Pensado para llenar canchas, no planillas.
            </h2>
            <p className="mt-[14px] text-base leading-[1.55] text-slate-400">
              Cada función arranca de un dolor real de tu complejo. Sin features que nunca usás.
            </p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 60} className="h-full">
              <div
                className="group relative h-full overflow-hidden border border-white/[.09] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40"
                style={{ borderRadius: '20px', background: 'linear-gradient(180deg, rgba(15,23,42,.6), rgba(2,6,23,.7))' }}
              >
                <div
                  className="relative inline-flex h-[52px] w-[52px] items-center justify-center text-emerald-400"
                  style={{
                    borderRadius: '14px',
                    background: 'rgba(16,185,129,.12)',
                    border: '1px solid rgba(16,185,129,.3)',
                    boxShadow: 'inset 0 0 20px rgba(16,185,129,.15)',
                  }}
                >
                  <f.icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="relative mt-5 font-display font-bold text-xl text-[#f8fafc]">{f.title}</h3>
                <p className="relative mt-2.5 text-[14.5px] leading-[1.6] text-slate-400">{f.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores.

- [ ] **Step 4: Verificar que el dato falso desapareció**

Run: `grep -rn "24 hs\|Recordatorios automáticos" src/app/\(business\)/para-complejos/page.tsx`
Expected: sin resultados.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(business\)/para-complejos/page.tsx
git commit -m "feat(b2b): features premium; fix card 24hs (eliminado v1) -> Avisos push

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: StatsBar premium

**Files:**
- Modify (`StatsBar`): `src/app/(business)/para-complejos/page.tsx`

**Interfaces:**
- Consumes: array `stats` existente (sin cambios).
- Produces: `StatsBar()` restyled (panel borde esmeralda + glow + números degradé).

- [ ] **Step 1: Reescribir `StatsBar` al patrón del jugador (L603-651)**

Reemplazar la función `StatsBar` (L224-241):

```tsx
function StatsBar() {
  return (
    <section className="relative z-10 py-6">
      <div className="mx-auto max-w-[1240px] px-6">
        <div
          className="relative overflow-hidden rounded-3xl border border-emerald-500/[.22] p-11"
          style={{
            background: 'linear-gradient(120deg, rgba(6,78,59,.55), rgba(2,6,23,.35) 55%, rgba(6,78,59,.4))',
            boxShadow: '0 0 70px rgba(16,185,129,.165), inset 0 1px 0 rgba(255,255,255,.06)',
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-40%] h-[400px] w-[700px] -translate-x-1/2 rounded-full blur-[20px]"
            style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.3), transparent 72%)' }}
          />
          <div className="relative grid grid-cols-2 gap-6 sm:grid-cols-4">
            {stats.map((s, i) => (
              <div key={s.label} className={`text-center ${i > 0 ? 'border-l border-white/10' : ''}`}>
                <div
                  className="font-display font-black italic leading-none"
                  style={{
                    fontSize: 'clamp(36px, 4.6vw, 56px)',
                    background: 'linear-gradient(180deg, #ffffff, #6ee7b7)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}
                >
                  {s.value}
                </div>
                <div className="mt-[10px] font-logo text-[12.5px] font-bold uppercase tracking-[.08em] text-slate-400">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(business\)/para-complejos/page.tsx
git commit -m "feat(b2b): stats bar premium en para-complejos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: ShowcaseStrip premium (onboarding 4 pasos)

**Files:**
- Modify (`ShowcaseStrip`): `src/app/(business)/para-complejos/page.tsx`

**Interfaces:**
- Consumes: `Reveal`; bg image `FEATURE_BG` (constante existente) o `/bg-how-it-works.png` si se prefiere asset local.
- Produces: `ShowcaseStrip()` restyled. Contenido (4 pasos wizard) intacto.

- [ ] **Step 1: Reescribir `ShowcaseStrip`**

Reemplazar la función `ShowcaseStrip` (L243-328). Mantener los 4 pasos. Columna izquierda con eyebrow + KIT-H2 + pasos en chip glow; derecha con la "ventana" premium (grid de turnos + badge "En vivo"). Envolver en `Reveal`:

```tsx
function ShowcaseStrip() {
  const steps = [
    { n: '01', t: 'Creá tu cuenta', d: 'Email, nombre y contraseña. Confirmás el email y listo.' },
    { n: '02', t: 'Cargá tus canchas', d: 'Nombre, superficie, capacidad. En segundos.' },
    { n: '03', t: 'Definí horarios y precios', d: 'Por franja, por día, como quieras.' },
    { n: '04', t: 'Conectá MercadoPago', d: 'OAuth en un click. Empezás a cobrar señas.' },
  ]
  return (
    <section className="relative z-10 overflow-hidden py-20 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[-1] opacity-[0.10] mix-blend-luminosity"
        style={{
          backgroundImage: `url('${FEATURE_BG}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          maskImage: 'linear-gradient(to bottom, transparent, #000 20%, #000 80%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 20%, #000 80%, transparent)',
        }}
      />
      <div className="relative mx-auto grid max-w-[1240px] gap-12 px-6 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <div>
            <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
              Onboarding
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(30px, 3.4vw, 44px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              En 4 pasos estás recibiendo reservas online.
            </h2>
            <ol className="mt-10 space-y-5">
              {steps.map((step) => (
                <li key={step.n} className="flex gap-4">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] font-logo text-sm font-bold text-emerald-400"
                    style={{ background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)', boxShadow: 'inset 0 0 16px rgba(16,185,129,.15)' }}
                  >
                    {step.n}
                  </span>
                  <div>
                    <h3 className="font-display text-base font-bold text-[#f8fafc]">{step.t}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{step.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div
            className="relative overflow-hidden p-6"
            style={{
              borderRadius: '20px',
              background: 'linear-gradient(180deg, rgba(15,23,42,.78), rgba(2,6,23,.9))',
              border: '1px solid rgba(255,255,255,.1)',
              boxShadow: '0 0 60px rgba(16,185,129,.16), 0 40px 80px -40px rgba(0,0,0,.9)',
            }}
          >
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 text-xs text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-auto font-mono text-[11px] text-slate-500">app.turnogol.app/grilla</span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
              {[...Array(20)].map((_, i) => {
                const filled = [1, 2, 5, 7, 8, 11, 14, 17, 18].includes(i)
                const next = [3, 9, 15].includes(i)
                return (
                  <div
                    key={i}
                    className={[
                      'flex h-12 items-center justify-center rounded-md font-logo font-medium tabular-nums',
                      filled
                        ? 'bg-emerald-500/30 text-emerald-100 ring-1 ring-inset ring-emerald-400/40'
                        : next
                          ? 'bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-300/30'
                          : 'bg-white/[0.03] text-slate-500 ring-1 ring-inset ring-white/5',
                    ].join(' ')}
                  >
                    {(18 + Math.floor(i / 4)).toString().padStart(2, '0')}:{((i % 4) * 15).toString().padStart(2, '0')}
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-slate-400">9 reservas confirmadas hoy</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                En vivo
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores. Si `FEATURE_BG` (unsplash remoto) molesta por CSP/perf, cambiar a un asset local (`/bg-how-it-works.png`) — decisión del implementador.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(business\)/para-complejos/page.tsx
git commit -m "feat(b2b): showcase onboarding premium en para-complejos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Testimonials + FinalCta premium

**Files:**
- Modify (`Testimonials`, `FinalCta`): `src/app/(business)/para-complejos/page.tsx`

**Interfaces:**
- Consumes: `Reveal`; `testimonials` array (sin cambios); iconos `Quote`, `Star`, `Shield`, `ArrowRight`.
- Produces: `Testimonials()` y `FinalCta()` restyled.

- [ ] **Step 1: Reescribir `Testimonials`**

Reemplazar la función `Testimonials` (L330-369) — eyebrow centrado + KIT-H2 + cards premium en `Reveal`:

```tsx
function Testimonials() {
  return (
    <section id="testimonios" className="relative z-10 py-20 sm:py-28">
      <div className="mx-auto max-w-[1240px] px-6">
        <Reveal>
          <div className="mx-auto mb-12 max-w-[640px] text-center">
            <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
              Historias reales
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(32px, 4vw, 50px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              Complejos que ya cambiaron el cuaderno.
            </h2>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-[22px] md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 70} className="h-full">
              <figure
                className="group relative flex h-full flex-col overflow-hidden border border-white/[.09] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40"
                style={{ borderRadius: '20px', background: 'linear-gradient(180deg, rgba(15,23,42,.6), rgba(2,6,23,.7))' }}
              >
                <Quote className="absolute right-6 top-6 h-8 w-8 text-emerald-400/20" aria-hidden />
                <div className="flex gap-0.5 text-amber-300">
                  {[...Array(5)].map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-current" aria-hidden />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-200">“{t.quote}”</blockquote>
                <figcaption className="mt-6 border-t border-white/10 pt-4">
                  <div className="text-sm font-semibold text-white">{t.name}</div>
                  <div className="text-xs text-slate-400">{t.role}</div>
                  <div className="text-xs text-slate-500">{t.city}, Argentina</div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Reescribir `FinalCta`**

Reemplazar la función `FinalCta` (L371-404) — glow radial + `Shield` + KIT-H2 + CTAs:

```tsx
function FinalCta() {
  return (
    <section className="relative z-10 overflow-hidden py-20 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[-1]"
        style={{ background: 'radial-gradient(ellipse at top, rgba(16,185,129,.20), transparent 60%)' }}
      />
      <div className="relative mx-auto max-w-[900px] px-6 text-center">
        <Reveal>
          <div
            className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center text-emerald-400"
            style={{ borderRadius: '16px', background: 'rgba(16,185,129,.14)', border: '1px solid rgba(16,185,129,.35)', boxShadow: 'inset 0 0 24px rgba(16,185,129,.2)' }}
          >
            <Shield className="h-7 w-7" aria-hidden />
          </div>
          <h2
            className="font-display font-black italic text-[#f8fafc]"
            style={{ fontSize: 'clamp(32px, 4vw, 52px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
          >
            Tu próxima reserva online empieza hoy.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Probá TurnoGol 30 días gratis. Sin tarjeta. Sin permanencia. Si no te sirve, lo dejás.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-600 px-8 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500"
              style={{ boxShadow: '0 8px 30px rgba(16,185,129,.35)' }}
            >
              Empezar gratis
              <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-8 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ingresar
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores; sin imports sin usar (verificar `Image` ya removido si ninguna sección lo usa).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(business\)/para-complejos/page.tsx
git commit -m "feat(b2b): testimonios + CTA final premium en para-complejos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Verificación integral + paridad visual

**Files:**
- Sin cambios de código salvo cleanup que surja.

- [ ] **Step 1: Suite unit completa**

Run: `pnpm test`
Expected: PASS. En particular `business-header.test.tsx` verde.

- [ ] **Step 2: e2e landing**

Run: `pnpm test:e2e -- landing`
Expected: PASS (5 tests). Confirma CTA register en `/para-complejos` + sin errores de consola.

- [ ] **Step 3: Typecheck + lint finales**

Run: `pnpm typecheck && pnpm lint`
Expected: limpio.

- [ ] **Step 4: Paridad visual (manual / screenshot)**

Levantar dev (`pnpm dev`) y comparar `/para-complejos` contra `/`:
- Mismo fondo `#020617`, mismo header pill, mismas fuentes display italic.
- Hero con mockup flotante visible en desktop (`lg`), oculto en mobile.
- Animaciones float/drift presentes; con `prefers-reduced-motion` quietas.
- Card 4 dice "Avisos al instante", no "Recordatorios 24hs".

Opcional: usar la skill `claude-in-chrome` o `verify` para captura comparativa.

- [ ] **Step 5: Commit final (si hubo cleanup) y cierre**

```bash
git add -A
git commit -m "chore(b2b): cleanup post-restyle para-complejos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" || echo "nada que commitear"
```

---

## Self-Review (cobertura del spec)

- **§5.1 Fondo+layout** → Task 1 ✓
- **§5.2 Header** → Task 1 ✓ (links B2B preservados, unit verde)
- **§5.3 Hero + mockup** → Task 3 ✓ (e2e register preservado)
- **§5.4 Features + fix 24hs** → Task 4 ✓ (grep verifica)
- **§5.5 StatsBar** → Task 5 ✓
- **§5.6 ShowcaseStrip** → Task 6 ✓
- **§5.7 Testimonios** → Task 7 ✓
- **§5.8 FinalCta** → Task 7 ✓
- **§5.9 Footer** → Task 2 ✓
- **§7 Testing (contratos verdes + visual)** → Task 8 ✓

Sin placeholders. Tipos/nombres consistentes (`PanelMockup`, `PANEL_SLOTS`, `features`, `stats`, `testimonials`). Links B2B (`/login`, `/register`) consistentes en header, footer, hero y CTA final.
