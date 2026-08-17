'use client'

import { useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { Logo } from '@/components/ui/logo'
import { Stepper } from '@/components/ui/stepper'
import { SegmentedProgress } from '@/components/ui/progress'
import { WIZARD_STEPS, stepFromPathname } from '@/modules/onboarding/onboarding.steps'
import { LAST_WIZARD_STEP } from '@/modules/onboarding/onboarding.types'

type Props = { children: React.ReactNode }

const VARIANTS = {
  // `direction` > 0 = avanzando (entra desde la derecha, se lee "← "); < 0 =
  // volviendo (entra desde la izquierda, se lee "→ ") — plan de refactor §F.
  enter: (direction: number) => ({ x: direction > 0 ? 24 : -24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -24 : 24, opacity: 0 }),
}

/**
 * Chrome persistente del wizard: rail de marca (desktop) + header de progreso
 * (mobile) + la transición animada entre pasos (§F del plan de refactor,
 * Fase 6).
 *
 * Vive en `layout.tsx`, NO en `WizardShell` (que cada Step sigue armando por
 * su cuenta, Fase 3): `layout.tsx` es lo único que Next.js mantiene MONTADO
 * al navegar entre `/onboarding/[paso]` — si el rail siguiera adentro de
 * WizardShell, cada paso lo remontaría de cero y la barra de progreso nunca
 * podría animar ENTRE pasos, solo aparecer ya en su valor final. Por el mismo
 * motivo `currentStep` salió de `WizardShell` (ya no lo necesita: quien
 * decide el paso ahora es este componente, leyendo la URL).
 */
export function WizardChrome({ children }: Props) {
  const pathname = usePathname()
  const currentStep = stepFromPathname(pathname)
  const pct = Math.round((Math.min(currentStep, LAST_WIZARD_STEP) / LAST_WIZARD_STEP) * 100)
  const isDone = currentStep > LAST_WIZARD_STEP
  const progressLabel = isDone ? '¡Listo!' : `Paso ${currentStep} de ${LAST_WIZARD_STEP} · ${pct}%`

  // Dirección de la transición: "ajustar estado durante el render" (patrón de
  // react.dev, no un efecto — leer `ref.current` en render está prohibido por
  // el compilador de React, `react-hooks/refs`). Comparar contra el paso
  // guardado y, si cambió, corregir ahí mismo: React reintenta el render antes
  // de pintar, así que no hay parpadeo ni un commit de más.
  const [prevStep, setPrevStep] = useState(currentStep)
  const [direction, setDirection] = useState(1)
  if (currentStep !== prevStep) {
    setDirection(currentStep > prevStep ? 1 : -1)
    setPrevStep(currentStep)
  }

  // Riesgo #1 del plan (§J): AnimatePresence rompe el foco del teclado si nadie
  // lo mueve a mano. `mainRef` es estable entre pasos (vive en este componente,
  // que Next.js no remonta) — `AnimatePresence mode="wait"` garantiza que
  // cuando el enter termina, el paso viejo ya salió del DOM, así que el primer
  // `h2` adentro es siempre el del paso nuevo.
  const mainRef = useRef<HTMLElement>(null)
  // Sembrado con el pathname de ESTE montaje (no en un efecto ni en el primer
  // llamado del callback): así el guard de abajo no depende de si `motion`
  // dispara `onAnimationComplete` en una carga dura (sin animación real, por
  // `initial={false}`) o no lo dispara — funciona igual en los dos casos,
  // porque compara pathnames, no cuenta llamadas.
  const focusedPathRef = useRef(pathname)
  // `onAnimationComplete` dispara para las DOS fases (exit del paso viejo Y
  // enter del nuevo); en modo "wait" ambas nunca coexisten, así que en la fase
  // de exit todavía encontraría el <h2> VIEJO (a punto de desmontarse). Se
  // ignora esa llamada: solo la variante "center" (fin del enter) es la señal
  // real de "ya está el paso nuevo".
  function focusStepTitle(definition: unknown) {
    if (definition !== 'center') return
    // Ya se movió el foco para este pathname (incluido el montaje inicial,
    // sembrado arriba): en una carga dura (login, F5) el foco es del
    // navegador, no nuestro para robarlo.
    if (focusedPathRef.current === pathname) return
    focusedPathRef.current = pathname
    const heading = mainRef.current?.querySelector('h2')
    if (!heading) return
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
    ;(heading as HTMLElement).focus()
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[240px_1fr]">
      {/* Rail de marca: superficie always-dark (como el pane de register), no
          vista de tarea — por eso colores literales y no tokens theme-adaptive.
          aria-label: PreviewPane agrega OTRO <aside> en los pasos con preview
          (axe: landmark-unique exige nombres distintos entre landmarks del
          mismo tipo implícito). */}
      <aside
        aria-label="Progreso del wizard"
        className="sticky top-0 self-start h-dvh relative hidden overflow-hidden bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 lg:flex lg:flex-col lg:justify-between lg:p-6"
      >
        <div
          aria-hidden
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-emerald-400/5 blur-3xl"
        />

        <div className="relative">
          <Logo variant="horizontal" textClassName="text-white" className="[&>span]:text-xl" />
        </div>

        <div className="relative">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 tabular-nums">
            {progressLabel}
          </p>
          <Stepper steps={WIZARD_STEPS} current={currentStep} tone="on-dark" className="mt-5" />
        </div>

        {/* Anti-ansiedad (doc10 §4): cuánto falta y que nada es irreversible. */}
        <p className="relative text-xs leading-relaxed text-slate-400">
          Menos de 5 minutos. Todo se puede cambiar después desde Configuración.
        </p>
      </aside>

      {/* Anuncio de progreso (plan §J): el texto "Paso 2 de 4 · 50%" ya está en
          pantalla (rail desktop + header mobile), pero ninguna de las dos
          copias es una región viva — al cambiar de paso por client-side
          navigation no hay reload que un lector de pantalla anuncie solo. Una
          sola copia oculta basta (no depende del viewport, a diferencia de las
          visibles); `polite` para que se encole después del anuncio de foco
          del `h2` en vez de interrumpirlo. */}
      <div aria-live="polite" className="sr-only">
        {progressLabel}
      </div>

      <main ref={mainRef} className="content-area-gradient">
        {/* Header mobile: el ÚNICO indicador en pantallas chicas. */}
        <header className="border-b border-border px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <Logo
              variant="horizontal"
              textClassName="text-foreground"
              className="[&>span]:text-xl"
            />
            <p className="text-xs font-medium text-muted-foreground tabular-nums">
              {progressLabel}
            </p>
          </div>
          <SegmentedProgress
            total={LAST_WIZARD_STEP}
            completed={Math.min(currentStep, LAST_WIZARD_STEP)}
            className="mt-2.5"
          />
        </header>

        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <m.div
            key={pathname}
            custom={direction}
            variants={VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            onAnimationComplete={focusStepTitle}
          >
            {children}
          </m.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
