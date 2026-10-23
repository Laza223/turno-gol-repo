'use client'

import { ChipGroup } from '@/app/(public)/[slug]/components/ChipGroups'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type BoardSeeking = 'off' | 'players' | 'rival'
export type BoardPosition = 'any' | 'goalkeeper'

const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'
const HELP = 'text-[13px] leading-5 text-muted-foreground'

const SEEKING_OPTIONS = [
  { value: 'off', label: 'Apagado' },
  { value: 'players', label: 'Buscamos jugadores' },
  { value: 'rival', label: 'Buscamos rival' },
]
const POSITION_OPTIONS = [
  { value: 'any', label: 'Donde me pongan' },
  { value: 'goalkeeper', label: 'Arquero' },
]

const SEEKING_HELP: Record<BoardSeeking, string> = {
  off: 'Armás el partido y le pasás el link a tu grupo.',
  players: 'Aparece en el tablón y cualquiera puede pedir sumarse.',
  rival: 'Aparece en el tablón como "Busca rival".',
}

/**
 * Los campos del tablón, compartidos por "Armar un partido" y "Publicar en el tablón": qué buscás,
 * la posición, el WhatsApp y el consentimiento. Controlado por quien lo monta; emite los nombres de
 * campo de las actions (`seeking`, `seekingPosition`, `whatsapp`, `whatsappConsent`).
 */
export function BoardFields({
  idPrefix,
  allowOff,
  allowRival = true,
  seeking,
  onSeekingChange,
  position,
  onPositionChange,
  whatsapp,
  onWhatsappChange,
  consent,
  onConsentChange,
  fieldError,
}: {
  idPrefix: string
  /** `true` en "Armar" (puede quedar apagado); `false` al publicar después. */
  allowOff: boolean
  /** `false` al publicar un partido que no puede buscar rival (cupo distinto del formato o capitán rival). */
  allowRival?: boolean
  seeking: BoardSeeking
  onSeekingChange: (v: BoardSeeking) => void
  position: BoardPosition
  onPositionChange: (v: BoardPosition) => void
  whatsapp: string
  onWhatsappChange: (v: string) => void
  consent: boolean
  onConsentChange: (v: boolean) => void
  fieldError: (field: string) => string | undefined
}) {
  const on = seeking !== 'off'
  const seekingOptions = SEEKING_OPTIONS.filter(
    (o) => (allowOff || o.value !== 'off') && (allowRival || o.value !== 'rival'),
  )
  const err = (f: string) =>
    fieldError(f) ? (
      <p role="alert" className={FIELD_ERROR}>
        {fieldError(f)}
      </p>
    ) : null
  return (
    <div className="space-y-4">
      <input type="hidden" name="seeking" value={seeking} />
      {seeking === 'players' && <input type="hidden" name="seekingPosition" value={position} />}

      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground">
          {allowOff ? 'Tablón' : '¿Qué buscás?'}
        </p>
        <ChipGroup
          label={allowOff ? 'Tablón' : 'Qué buscás'}
          options={seekingOptions}
          value={seeking}
          onChange={(v) => onSeekingChange(v === 'players' || v === 'rival' ? v : 'off')}
          alwaysWrap
        />
        <p className={HELP}>{SEEKING_HELP[seeking]}</p>
        {err('seeking')}
      </div>

      {seeking === 'players' && (
        <div className="space-y-1.5">
          <p className="text-base font-medium text-foreground">Posición que buscás</p>
          <ChipGroup
            label="Posición que buscás"
            options={POSITION_OPTIONS}
            value={position}
            onChange={(v) => onPositionChange(v === 'goalkeeper' ? 'goalkeeper' : 'any')}
            alwaysWrap
          />
          {err('seekingPosition')}
        </div>
      )}

      {on && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-whatsapp`} className="text-base">
              Tu WhatsApp
            </Label>
            <Input
              id={`${idPrefix}-whatsapp`}
              name="whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={whatsapp}
              onChange={(e) => onWhatsappChange(e.target.value)}
              placeholder="11 2345 6789"
              className="text-base md:h-11 md:text-base"
              aria-invalid={fieldError('whatsapp') ? true : undefined}
              aria-describedby={`${idPrefix}-whatsapp-ayuda`}
            />
            <p id={`${idPrefix}-whatsapp-ayuda`} className={HELP}>
              Para que te escriban los que aceptes.
            </p>
            {err('whatsapp')}
          </div>

          <div className="space-y-1.5">
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="whatsappConsent"
                checked={consent}
                onChange={(e) => onConsentChange(e.target.checked)}
                aria-invalid={fieldError('whatsappConsent') ? true : undefined}
                className="mt-0.5 size-6 shrink-0 cursor-pointer"
              />
              <span className="text-base text-foreground">
                Lo ve solo a quien aceptes en este partido
              </span>
            </label>
            {err('whatsappConsent')}
          </div>
        </>
      )}
    </div>
  )
}
