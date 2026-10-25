'use client'

import { startTransition, useActionState, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { PORTAL_BUTTON, PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import { ChipGroup } from '@/app/(public)/[slug]/components/ChipGroups'
import {
  PlayerPhotoField,
  type PhotoRemoveAction,
  type PhotoUploadAction,
} from '@/components/rival/PlayerPhotoField'
import { initials } from '@/lib/format'
import { RIVAL_POSITION_LABELS } from '@/modules/rival/rival-display'
import { RIVAL_ZONES } from '@/modules/rival/rival-zones'
import { RIVAL_POSITIONS } from '@/modules/rival/rival.schema'
import type { RivalFormResult } from './actions'

/** Firma de la Server Action (llega por prop: importarla como valor arrastra drizzle al bundle del browser). */
type WelcomeAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

/** La foto opcional de la bienvenida: la actual del jugador y las dos Server Actions (por prop). */
export type WelcomePhoto = {
  url: string | null
  uploadAction: PhotoUploadAction
  removeAction: PhotoRemoveAction
}

const INITIAL: RivalFormResult = { success: true }
const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'

/** Código de conducta (spec §7). */
const CONDUCT = [
  'Llegá a horario.',
  'Si no podés ir, bajate a tiempo.',
  'Cero violencia e insultos.',
  'Lo demás se arregla entre ustedes por WhatsApp: TurnoGol no organiza ni cobra.',
] as const

const POSITION_OPTIONS = RIVAL_POSITIONS.map((value) => ({
  value,
  label: RIVAL_POSITION_LABELS[value],
}))
const ZONE_OPTIONS = RIVAL_ZONES.map((z) => ({ value: z, label: z }))

/**
 * La bienvenida RIVAL (spec §7): una sola tarjeta, un solo botón que acepta. La primera vez que
 * el jugador organiza, y "Voy" la reusa con otro `submitLabel`. La foto es opcional (`photo`): se
 * sube al elegirla, aparte del botón que acepta.
 */
export function WelcomeCard({
  defaultName,
  defaultPosition,
  defaultZone,
  action,
  submitLabel = 'Aceptar y seguir',
  intro = 'Antes de armar tu primer partido, contanos quién sos.',
  hidden,
  photo,
}: {
  defaultName: string
  /** Lo que el jugador ya había cargado (re-aceptación por cambio de versión de las reglas). */
  defaultPosition?: string | null
  defaultZone?: string | null
  action: WelcomeAction
  submitLabel?: string
  /** Bajada de la tarjeta: cambia según a qué se llegó ("Voy" en vez de "Armar"). */
  intro?: string
  /** Campos ocultos que la action necesita (el código del partido en "Estoy adentro"). */
  hidden?: Record<string, string>
  /** Sin esta prop (o sin storage) la tarjeta no ofrece foto. */
  photo?: WelcomePhoto
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL)
  // Controlados: React 19 resetea los campos no controlados al terminar una action.
  const [name, setName] = useState(defaultName)
  const [position, setPosition] = useState<string>(defaultPosition ?? 'any')
  const [zone, setZone] = useState(defaultZone ?? '')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(() => formAction(new FormData(event.currentTarget)))
  }

  const error = !state.success ? state : null
  const fieldError = (f: string) => (error?.field === f ? error.error : undefined)

  return (
    <section
      aria-labelledby="rival-bienvenida"
      className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-xs"
    >
      <div>
        <h2 id="rival-bienvenida" className={PORTAL_SECTION_TITLE}>
          Bienvenido a RIVAL
        </h2>
        <p className="mt-1 text-base text-muted-foreground">{intro}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {Object.entries(hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
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
            onChange={(e) => setName(e.target.value)}
            className="md:h-11"
            aria-invalid={fieldError('firstName') ? true : undefined}
            aria-describedby="rival-nombre-ayuda"
          />
          <p id="rival-nombre-ayuda" className="text-[13px] leading-5 text-muted-foreground">
            Los demás ven solo tu nombre y la inicial del apellido.
          </p>
          {fieldError('firstName') && (
            <p role="alert" className={FIELD_ERROR}>
              {fieldError('firstName')}
            </p>
          )}
        </div>

        {photo && (
          <div className="space-y-1.5">
            <p className="text-base font-medium text-foreground">Tu foto (opcional)</p>
            <PlayerPhotoField
              url={photo.url}
              initials={initials(name, '')}
              uploadAction={photo.uploadAction}
              removeAction={photo.removeAction}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <p id="rival-posicion" className="text-base font-medium text-foreground">
            Tu posición
          </p>
          <ChipGroup
            label="Tu posición"
            options={POSITION_OPTIONS}
            value={position}
            onChange={setPosition}
            alwaysWrap
          />
          <input type="hidden" name="position" value={position} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rival-zona" className="text-base">
            Tu zona
          </Label>
          <SelectMenu
            id="rival-zona"
            name="zone"
            value={zone}
            onChange={setZone}
            options={ZONE_OPTIONS}
            placeholder="Elegí tu zona"
          />
          {fieldError('zone') && (
            <p role="alert" className={FIELD_ERROR}>
              {fieldError('zone')}
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-2xl bg-muted/50 p-4">
          <h3 className="text-base font-semibold text-foreground">Las reglas de RIVAL</h3>
          <ol className="list-decimal space-y-1 pl-5 text-base text-foreground">
            {CONDUCT.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </div>

        <div className="space-y-3">
          <Button type="submit" disabled={pending} aria-busy={pending} className={PORTAL_BUTTON}>
            {pending ? 'Guardando…' : submitLabel}
          </Button>
          {error && !error.field && (
            <p role="alert" className={FIELD_ERROR}>
              {error.error}
            </p>
          )}
          <p className="text-[13px] leading-5 text-muted-foreground">
            Al tocar, aceptás las reglas de RIVAL y los{' '}
            <Link
              href="/terminos"
              className="font-medium text-emerald-700 underline underline-offset-4 dark:text-emerald-400"
            >
              Términos
            </Link>
            . Quien tenga el link de un partido en el que estés y haya iniciado sesión ve tu nombre
            corto y tu foto. El organizador ve además tu posición y tu zona.
          </p>
        </div>
      </form>
    </section>
  )
}
