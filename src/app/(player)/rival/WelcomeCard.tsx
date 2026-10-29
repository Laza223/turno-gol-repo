'use client'

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { PORTAL_BUTTON, PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import { FixedCta } from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'
import {
  PlayerPhotoField,
  type PhotoRemoveAction,
  type PhotoUploadAction,
} from '@/components/rival/PlayerPhotoField'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { RIVAL_OFFLINE_MESSAGE } from '@/modules/rival/rival-copy'
import { RIVAL_POSITION_LABELS } from '@/modules/rival/rival-display'
import { RIVAL_ZONES } from '@/modules/rival/rival-zones'
import { RIVAL_POSITIONS } from '@/modules/rival/rival.schema'
import type { RivalFormResult } from './actions'
import { FormError } from './FormError'
import { RIVAL_GHOST } from './MatchBits'
import { useFieldErrors } from './use-field-errors'

/** Firma de la Server Action (llega por prop: importarla como valor arrastra drizzle al bundle del browser). */
type WelcomeAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

/** La foto opcional de la bienvenida: la actual del jugador y las dos Server Actions (por prop). */
export type WelcomePhoto = {
  url: string | null
  uploadAction: PhotoUploadAction
  removeAction: PhotoRemoveAction
}

/**
 * Qué pide la tarjeta ahora (lo decide `welcomeNeeds`): nombre y reglas (`identity`), la zona
 * (`profile`) y, además, la posición (`position`: el capitán de un equipo rival no la da).
 */
export type WelcomeNeeds = { identity: boolean; profile: boolean; position: boolean }

type WelcomeField = 'firstName' | 'zone'
const FIELD_ORDER: readonly WelcomeField[] = ['firstName', 'zone']
const FIELD_IDS: Record<WelcomeField, string> = { firstName: 'rival-nombre', zone: 'rival-zona' }

const INITIAL: RivalFormResult = { success: true }
const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'

const INTRO = {
  identity: 'Para armar tu partido necesitamos tu nombre y que aceptes las reglas.',
  both: 'Para sumarte, contanos quién sos.',
  profile:
    'Elegí tu posición y tu zona. El organizador las usa para armar los equipos. Lo pedimos una sola vez.',
  /** Capitán de un equipo que pide jugar contra el partido: solo la zona; el organizador coordina, no arma equipos. */
  profileRival:
    'Elegí tu zona. El organizador la ve para coordinar el partido. Lo pedimos una sola vez.',
} as const

/** Código de conducta (spec §7). */
const CONDUCT = [
  'Llegá a horario.',
  'Si no podés ir, bajate a tiempo.',
  'Cero violencia e insultos.',
  'Lo demás se arregla entre ustedes por WhatsApp: TurnoGol no organiza ni cobra.',
] as const

/** Un grupo de campos con título propio (solo cuando la tarjeta pide los dos). */
function FieldGroup({ id, title, children }: { id: string; title?: string; children: ReactNode }) {
  return (
    <div
      role={title ? 'group' : undefined}
      aria-labelledby={title ? id : undefined}
      className="space-y-3"
    >
      {title && (
        <h3 id={id} className="font-display text-lg font-extrabold leading-6 text-foreground">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

const POSITION_OPTIONS = RIVAL_POSITIONS.map((value) => ({
  value,
  label: RIVAL_POSITION_LABELS[value],
}))
const ZONE_OPTIONS = RIVAL_ZONES.map((z) => ({ value: z, label: z }))

/**
 * La bienvenida RIVAL (spec §7) en dos momentos (decisión 2026-10-28): `identity` pide el nombre y
 * las reglas (alcanza para armar); `profile` pide la posición y la zona (al sumarse o pedir
 * sumarse). Solo se pinta y se manda lo que falta; el servidor decide qué falta de verdad. Una sola
 * tarjeta y un solo botón que acepta: "Voy" y "Pedir sumarme" la reusan con otro `submitLabel`. La
 * foto es opcional (`photo`, solo al armar): se sube al elegirla, aparte del botón que acepta.
 *
 * `pinSubmit` (al sumarse): el botón que acepta va en la barra fija de abajo, como el "Voy" que abrió
 * la tarjeta, con una línea de consentimiento encima si la tarjeta lo estampa. Las reglas y el
 * consentimiento completo siguen en el flujo.
 *
 * "Ahora no" (`onDismiss` si la tarjeta se abrió en el lugar, `dismissHref` si es la página) es la
 * salida: sin ella la tarjeta es un callejón. `focusOnMount` lleva el foco al título cuando la
 * tarjeta aparece (por un toque o al volver del login); el campo del nombre NO se
 * enfoca para no abrir el teclado del celular de golpe.
 */
export function WelcomeCard({
  needs,
  defaultName,
  defaultPosition,
  defaultZone,
  action,
  submitLabel = needs.identity && !needs.profile
    ? 'Aceptar y armar mi partido'
    : 'Aceptar y seguir',
  intro = needs.identity
    ? needs.profile
      ? INTRO.both
      : INTRO.identity
    : needs.position
      ? INTRO.profile
      : INTRO.profileRival,
  hidden,
  photo,
  pinSubmit = false,
  onDismiss,
  dismissHref,
  focusOnMount = false,
}: {
  needs: WelcomeNeeds
  defaultName: string
  /** Lo que el jugador ya había cargado. */
  defaultPosition?: string | null
  defaultZone?: string | null
  action: WelcomeAction
  submitLabel?: string
  /** Bajada de la tarjeta: cambia según a qué se llegó ("Pedir sumarme" en vez de "Voy"). */
  intro?: string
  /** Campos ocultos que la action necesita (el código del partido en "Estoy adentro"). */
  hidden?: Record<string, string>
  /** Sin esta prop (o sin storage) la tarjeta no ofrece foto. */
  photo?: WelcomePhoto
  /** El botón que acepta va en la barra fija de abajo (al sumarse). */
  pinSubmit?: boolean
  onDismiss?: () => void
  dismissHref?: string
  focusOnMount?: boolean
}) {
  // Un corte de red no puede mandar al error boundary y perder lo tipeado. Los dos momentos son
  // idempotentes (reintentar es seguro); un redirect o un notFound viajan como excepción y pasan.
  const guarded = useCallback<WelcomeAction>(
    async (prev, formData) => {
      try {
        return await action(prev, formData)
      } catch (err) {
        unstable_rethrow(err)
        return { success: false, error: RIVAL_OFFLINE_MESSAGE }
      }
    },
    [action],
  )
  const [state, formAction, pending] = useActionState(guarded, INITIAL)
  // Controlados: React 19 resetea los campos no controlados al terminar una action.
  const [name, setName] = useState(defaultName)
  const [position, setPosition] = useState<string>(defaultPosition ?? 'any')
  const [zone, setZone] = useState(defaultZone ?? '')
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!focusOnMount || !heading.current) return
    // Sin scroll propio del foco: la tarjeta queda con su título arriba, así nombre y zona entran
    // en la primera pantalla y la barra fija no los tapa.
    heading.current.focus({ preventScroll: true })
    heading.current.scrollIntoView({ block: 'start' })
  }, [focusOnMount])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(() => formAction(new FormData(event.currentTarget)))
  }

  const error = !state.success ? state : null
  const rendered = [
    ...(needs.identity ? (['firstName'] as const) : []),
    ...(needs.profile ? (['zone'] as const) : []),
  ]
  const reported: Partial<Record<WelcomeField, string>> = {}
  for (const f of rendered) {
    const message = error?.fieldErrors?.[f] ?? (error?.field === f ? error.error : undefined)
    if (message) reported[f] = message
  }
  // Solo lo que la tarjeta dibuja muestra su error; el primero es el único alert y recibe el foco.
  const fe = useFieldErrors<WelcomeField>({
    errors: reported,
    order: FIELD_ORDER,
    ids: FIELD_IDS,
    resetKey: state,
  })
  const fieldError = (f: WelcomeField) => fe.message(f)
  const alertIfFirst = fe.messageProps
  const dismissClass = cn(RIVAL_GHOST, 'w-full')
  // Con las dos cosas en pantalla el organizador tiene su grupo; lo tuyo no lleva título (la bajada ya lo dice).
  const grouped = needs.identity && needs.profile

  // Un solo bloque, arriba del botón: lo que se acepta se lee antes de tocar.
  const consentNote = (
    <p className="text-sm leading-5 text-muted-foreground">
      {needs.identity ? (
        <>
          Al tocar, aceptás las reglas de RIVAL y los{' '}
          <Link
            href="/terminos"
            className="font-medium text-emerald-700 underline underline-offset-4 dark:text-emerald-400"
          >
            Términos
          </Link>
          . Quien tenga el link de un partido en el que estés y haya iniciado sesión ve tu nombre
          corto y tu foto.
          {needs.profile && ' El organizador ve además tu posición y tu zona.'}
        </>
      ) : (
        'Los demás ven tu nombre corto y tu foto. El organizador ve además tu posición y tu zona.'
      )}
    </p>
  )

  const submit = (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(PORTAL_BUTTON, pinSubmit && 'min-h-[52px]')}
    >
      {pending ? 'Guardando…' : submitLabel}
    </Button>
  )

  return (
    <section
      aria-labelledby="rival-bienvenida"
      className={cn(
        'scroll-mt-20 space-y-4 rounded-3xl border border-border bg-card p-4 shadow-xs',
        // La barra fija con su línea de consentimiento es más alta que la reserva del marco.
        pinSubmit && needs.identity && 'mb-8 md:mb-0',
      )}
    >
      <div>
        <h2
          ref={heading}
          id="rival-bienvenida"
          tabIndex={focusOnMount ? -1 : undefined}
          className={cn(PORTAL_SECTION_TITLE, 'scroll-mt-24', focusOnMount && 'outline-hidden')}
        >
          {needs.identity ? 'Bienvenido a RIVAL' : 'Un dato más para sumarte'}
        </h2>
        <p className="mt-1 text-base text-muted-foreground">{intro}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {Object.entries(hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <FieldGroup id="rival-grupo-vos">
          {needs.identity && (
            <div className="space-y-1.5">
              <Label htmlFor="rival-nombre" className="text-base">
                Tu nombre
              </Label>
              <Input
                id="rival-nombre"
                name="firstName"
                autoComplete="given-name"
                maxLength={40}
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  fe.clear('firstName')
                }}
                className="h-12 rounded-lg text-base md:h-12 md:text-base aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive"
                aria-invalid={fieldError('firstName') ? true : undefined}
                aria-describedby={
                  fieldError('firstName')
                    ? 'rival-nombre-ayuda rival-nombre-error'
                    : 'rival-nombre-ayuda'
                }
              />
              <p id="rival-nombre-ayuda" className="text-sm leading-5 text-muted-foreground">
                Los demás ven solo tu nombre y la inicial del apellido.
              </p>
              {fieldError('firstName') && (
                <p {...alertIfFirst('firstName')} className={FIELD_ERROR}>
                  {fieldError('firstName')}
                </p>
              )}
            </div>
          )}

          {needs.identity && photo && (
            <PlayerPhotoField
              compact
              url={photo.url}
              initials={initials(name, '')}
              uploadAction={photo.uploadAction}
              removeAction={photo.removeAction}
            />
          )}
        </FieldGroup>

        {needs.profile && (
          <FieldGroup
            id="rival-grupo-organizador"
            title={grouped ? 'Para el organizador' : undefined}
          >
            {needs.position && (
              <div className="space-y-1.5">
                <Label htmlFor="rival-posicion-select" className="text-base">
                  Tu posición
                </Label>
                <SelectMenu
                  id="rival-posicion-select"
                  name="position"
                  value={position}
                  onChange={setPosition}
                  options={POSITION_OPTIONS}
                  placeholder="Elegí tu posición"
                  className="rounded-lg bg-card md:text-base"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="rival-zona" className="text-base">
                Tu zona
              </Label>
              <SelectMenu
                id="rival-zona"
                name="zone"
                value={zone}
                onChange={(v) => {
                  setZone(v)
                  fe.clear('zone')
                }}
                options={ZONE_OPTIONS}
                placeholder="Elegí tu zona"
                className="rounded-lg bg-card md:text-base"
                aria-invalid={fieldError('zone') ? true : undefined}
                aria-describedby={fieldError('zone') ? 'rival-zona-error' : undefined}
              />
              {fieldError('zone') && (
                <p {...alertIfFirst('zone')} className={FIELD_ERROR}>
                  {fieldError('zone')}
                </p>
              )}
            </div>
          </FieldGroup>
        )}

        {needs.identity && (
          <div className="space-y-1.5">
            <h3 className="font-display text-lg font-extrabold leading-6 text-foreground">
              Las reglas de RIVAL
            </h3>
            <ol className="list-decimal space-y-0.5 pl-5 text-sm leading-5 text-foreground">
              {CONDUCT.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ol>
            {consentNote}
          </div>
        )}

        <div className="space-y-3">
          {!needs.identity && consentNote}
          {error && Object.keys(reported).length === 0 && (
            <FormError error={error.error} code={error.code} />
          )}
          {pinSubmit ? (
            <FixedCta>
              {needs.identity && (
                <p className="mb-2 text-center text-sm leading-5 text-muted-foreground">
                  Al tocar, aceptás las reglas de RIVAL.
                </p>
              )}
              {submit}
            </FixedCta>
          ) : (
            submit
          )}
          {onDismiss ? (
            <Button type="button" variant="ghost" className={dismissClass} onClick={onDismiss}>
              Ahora no
            </Button>
          ) : (
            dismissHref && (
              <Link
                href={dismissHref}
                className={cn(buttonVariants({ variant: 'ghost' }), dismissClass)}
              >
                Ahora no
              </Link>
            )
          )}
        </div>
      </form>
    </section>
  )
}
