'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import { IdentityFields, ProfileFields } from './welcome-card/WelcomeFields'
import { RulesBlock, WelcomeFooter } from './welcome-card/WelcomeFooter'
import {
  INTRO,
  type WelcomeAction,
  type WelcomeNeeds,
  type WelcomePhoto,
} from './welcome-card/welcome-copy'
import { useWelcomeForm } from './welcome-card/use-welcome-form'

export type { WelcomeNeeds, WelcomePhoto }

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
  const heading = useRef<HTMLHeadingElement>(null)
  const form = useWelcomeForm({
    action,
    needs,
    defaultName,
    defaultPosition,
    defaultZone,
    focusOnMount,
    heading,
  })

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

      <form onSubmit={form.handleSubmit} noValidate className="space-y-4">
        {Object.entries(hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <IdentityFields
          needs={needs}
          name={form.name}
          onNameChange={form.setName}
          photo={photo}
          fe={form.fe}
        />

        {needs.profile && (
          <ProfileFields
            needs={needs}
            // Con las dos cosas en pantalla el organizador tiene su grupo; lo tuyo no lleva título (la bajada ya lo dice).
            grouped={needs.identity && needs.profile}
            position={form.position}
            onPositionChange={form.setPosition}
            zone={form.zone}
            onZoneChange={form.setZone}
            fe={form.fe}
          />
        )}

        {needs.identity && <RulesBlock needs={needs} />}

        <WelcomeFooter
          needs={needs}
          error={form.error}
          hasFieldErrors={form.hasFieldErrors}
          pending={form.pending}
          submitLabel={submitLabel}
          pinSubmit={pinSubmit}
          onDismiss={onDismiss}
          dismissHref={dismissHref}
        />
      </form>
    </section>
  )
}
