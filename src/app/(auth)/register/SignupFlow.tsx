'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { SegmentedProgress } from '@/components/ui/progress'
import type { GeocodeAddressAction } from '@/components/maps/LocationPickerField'
import { readStoredReferralCode, storeReferralCode } from '@/lib/referral-storage'
import {
  WIZARD_FORMATS,
  wizardCourtCountsSchema,
  type WizardPricesInput,
} from '@/modules/onboarding/onboarding.schema'
import { signupDraftSchema } from '@/modules/onboarding/signup-draft.schema'
import type { WizardActionResult } from '@/modules/onboarding/onboarding.types'
import { StepCanchas } from '@/app/onboarding/components/StepCanchas'
import { StepComplejo } from '@/app/onboarding/components/StepComplejo'
import { StepHorarios } from '@/app/onboarding/components/StepHorarios'
import { StepPrecios } from '@/app/onboarding/components/StepPrecios'
import { StepTuComplejo } from '@/app/onboarding/components/StepTuComplejo'
import { WizardMotionProvider } from '@/app/onboarding/motion-provider'
import { ComplexBuildCard } from '@/app/onboarding/components/ComplexBuildCard'
import { STEP_TRANSITION, STEP_VARIANTS } from '@/app/onboarding/components/step-transition'
import type { SignupResult } from './actions'
import { StepCuenta } from './StepCuenta'
import {
  SIGNUP_SCREENS,
  SIGNUP_SEGMENTS,
  firstIncompleteScreen,
  patchSignupDraft,
  useSignupDraft,
  type SignupDraftData,
  type SignupScreen,
} from './signup-draft'

type Props = {
  /** Las Server Actions llegan por prop desde `page.tsx` (ver `StepCuenta`). */
  signUpAction: (input: unknown) => Promise<SignupResult>
  googleAction: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>
  geocodeAction: GeocodeAddressAction
  /** `?ref=` de esta visita, ya validado. Gana sobre el código guardado por una visita previa. */
  refCode?: string | null
  inAppBrowser?: boolean
  /** Error que se muestra en la pantalla de cuenta (ej. el mail de Google era de un jugador). */
  accountError?: string | null
}

const OK = { success: true } as const satisfies WizardActionResult

const numberOrNull = (value: FormDataEntryValue | null): number | null =>
  typeof value === 'string' && value !== '' ? Number(value) : null

/**
 * El alta pública completa en una sola pantalla de /register, sin sesión: el complejo
 * primero y la cuenta al final. Cada respuesta se guarda en el borrador del celular
 * (`localStorage`); recién la última pantalla crea cuenta y complejo, de una vez.
 *
 * Reusa los pasos del wizard por rutas (`src/app/onboarding/components`): acá su
 * `action` no habla con el servidor, guarda en el borrador y pasa a la pantalla siguiente.
 */
export function SignupFlow(props: Props) {
  const { ready, draft } = useSignupDraft()
  if (!ready) return <div className="skeleton mx-auto mt-24 h-96 w-full max-w-lg rounded-2xl" />
  return <Flow {...props} draft={draft} />
}

function Flow({
  draft,
  signUpAction,
  googleAction,
  geocodeAction,
  refCode = null,
  inAppBrowser = false,
  accountError = null,
}: Props & { draft: SignupDraftData }) {
  const [screen, setScreenState] = useState<SignupScreen>(() => firstIncompleteScreen(draft))
  const [direction, setDirection] = useState(1)
  const rootRef = useRef<HTMLDivElement>(null)
  // Pantalla a la que ya se le movió el foco: la de la carga inicial no se toca (el foco es del navegador).
  const focusedScreen = useRef(screen)

  function setScreen(next: SignupScreen) {
    setDirection(screenIndex(next) >= screenIndex(screen) ? 1 : -1)
    setScreenState(next)
  }

  // Con `mode="wait"` el título nuevo recién existe al terminar la entrada: ahí va el foco.
  function focusTitle(definition: unknown) {
    if (definition !== 'center' || focusedScreen.current === screen) return
    focusedScreen.current = screen
    rootRef.current?.querySelector('h2')?.focus()
  }

  useEffect(() => {
    if (refCode) storeReferralCode(refCode)
  }, [refCode])

  const segment = SIGNUP_SCREENS.find((s) => s.id === screen)?.segment ?? 0

  function advance(patch: SignupDraftData, next: SignupScreen): WizardActionResult {
    patchSignupDraft(patch)
    setScreen(next)
    return OK
  }

  const cheapest = (draft.prices?.formats ?? [])
    .map((row) => row.dayPrice)
    .reduce<number | undefined>((min, p) => (min === undefined || p < min ? p : min), undefined)

  async function saveComplex(_prev: WizardActionResult, formData: FormData) {
    const complex = signupDraftSchema.shape.complex.safeParse({
      name: formData.get('name'),
      address: formData.get('address'),
      city: formData.get('city'),
      province: formData.get('province'),
      latitude: numberOrNull(formData.get('latitude')),
      longitude: numberOrNull(formData.get('longitude')),
    })
    if (!complex.success) {
      return { success: false, error: complex.error.issues[0]?.message ?? 'Revisá los datos.' }
    }
    return advance({ complex: complex.data }, 'canchas')
  }

  const courts = draft.courts ?? {}
  const formatsToPrice = WIZARD_FORMATS.map((format) => ({
    format,
    count: courts[String(format)] ?? 0,
  })).filter((f) => f.count > 0)

  return (
    <WizardMotionProvider>
      <div ref={rootRef}>
        <h1 className="sr-only">Creá tu complejo en TurnoGol</h1>
        <div className="mx-auto w-full max-w-lg px-4 pt-24 md:pt-28">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-300 tabular-nums">
            Paso {segment + 1} de {SIGNUP_SEGMENTS.length} · {SIGNUP_SEGMENTS[segment]}
          </p>
          <SegmentedProgress
            total={SIGNUP_SEGMENTS.length}
            completed={segment + 1}
            className="mt-2.5"
          />
          {screen !== 'complejo' && (
            <div className="mt-4">
              <ComplexBuildCard
                name={draft.complex?.name}
                place={
                  draft.complex ? `${draft.complex.address}, ${draft.complex.city}` : undefined
                }
                courts={draft.courts}
                hours={draft.schedule}
                fromPrice={cheapest}
              />
            </div>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <m.div
            key={screen}
            custom={direction}
            variants={STEP_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={STEP_TRANSITION}
            onAnimationComplete={focusTitle}
          >
            {screen === 'complejo' && (
              <StepComplejo
                action={saveComplex}
                geocodeAction={geocodeAction}
                backHref="/para-complejos"
                defaultValues={draft.complex}
              />
            )}
            {screen === 'canchas' && (
              <StepCanchas
                initialCounts={draft.courts}
                action={async (counts) => {
                  const parsed = wizardCourtCountsSchema.safeParse(counts)
                  if (!parsed.success) {
                    return {
                      success: false,
                      error: parsed.error.issues[0]?.message ?? 'Revisá las canchas.',
                    }
                  }
                  return advance({ courts: parsed.data }, 'horarios')
                }}
                onBack={() => setScreen('complejo')}
              />
            )}
            {screen === 'horarios' && (
              <StepHorarios
                initialOpenHour={draft.schedule?.openHour}
                initialCloseHour={draft.schedule?.closeHour}
                action={async (schedule) => advance({ schedule }, 'precios')}
                onBack={() => setScreen('canchas')}
              />
            )}
            {screen === 'precios' && (
              <StepPrecios
                formats={formatsToPrice}
                initialPrices={pricesByFormat(draft.prices)}
                initialCutHour={draft.prices?.cutHour}
                action={async (prices) => advance({ prices }, 'tu-complejo')}
                onBack={() => setScreen('horarios')}
              />
            )}
            {screen === 'tu-complejo' && (
              <StepTuComplejo
                initial={draft.profile}
                action={async (profile) => advance({ profile }, 'cuenta')}
                onBack={() => setScreen('precios')}
              />
            )}
            {screen === 'cuenta' && (
              <StepCuenta
                draft={draft}
                referralCode={refCode ?? readStoredReferralCode()}
                signUpAction={signUpAction}
                googleAction={googleAction}
                inAppBrowser={inAppBrowser}
                initialError={accountError}
                onBack={() => setScreen('tu-complejo')}
              />
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </WizardMotionProvider>
  )
}

function screenIndex(screen: SignupScreen): number {
  return SIGNUP_SCREENS.findIndex((s) => s.id === screen)
}

function pricesByFormat(prices: WizardPricesInput | undefined) {
  return Object.fromEntries(
    (prices?.formats ?? []).map((row) => [
      String(row.format),
      {
        dayPrice: row.dayPrice,
        ...(row.nightPrice !== undefined ? { nightPrice: row.nightPrice } : {}),
      },
    ]),
  )
}
