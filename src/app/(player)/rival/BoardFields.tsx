'use client'

import { ChipGroup } from '@/app/(public)/[slug]/components/ChipGroups'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RivalCheckbox } from './RivalCheckbox'

export type BoardSeeking = 'players' | 'rival'
export type BoardPosition = 'any' | 'goalkeeper'

const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'
const HELP = 'text-[13px] leading-5 text-muted-foreground'

const SEEKING_OPTIONS = [
  { value: 'players', label: 'Buscamos jugadores' },
  { value: 'rival', label: 'Buscamos rival' },
]
const POSITION_OPTIONS = [
  { value: 'any', label: 'Cualquier posición' },
  { value: 'goalkeeper', label: 'Un arquero' },
]

const SEEKING_HELP: Record<BoardSeeking, string> = {
  players: 'Aparece en el tablón y cualquiera puede pedir sumarse.',
  rival: 'Aparece en el tablón como "Busca rival".',
}

/**
 * Los campos de "Publicar en el tablón": qué buscás, la posición, el WhatsApp y sus dos casillas.
 * Controlado por quien lo monta; emite los nombres de campo de la action (`seeking`,
 * `seekingPosition`, `whatsapp`, `whatsappConsent` y, si se ofrece, `savePhone`).
 */
export function BoardFields({
  idPrefix,
  allowRival = true,
  lockSeeking = false,
  seeking,
  onSeekingChange,
  position,
  onPositionChange,
  whatsapp,
  onWhatsappChange,
  consent,
  onConsentChange,
  savePhone,
  fieldError,
}: {
  idPrefix: string
  /** `false` al publicar un partido que no puede buscar rival (cupo distinto del formato o capitán rival). */
  allowRival?: boolean
  /** `true` si lo que se busca ya está decidido (el equipo que armó "busca rival"): no se pregunta. */
  lockSeeking?: boolean
  seeking: BoardSeeking
  onSeekingChange: (v: BoardSeeking) => void
  position: BoardPosition
  onPositionChange: (v: BoardPosition) => void
  whatsapp: string
  onWhatsappChange: (v: string) => void
  consent: boolean
  onConsentChange: (v: boolean) => void
  /** Casilla "Guardar este número en mi cuenta" (opt-in aparte del consentimiento); sin la prop no se ofrece. */
  savePhone?: { checked: boolean; onChange: (v: boolean) => void }
  fieldError: (field: string) => string | undefined
}) {
  const seekingOptions = SEEKING_OPTIONS.filter((o) => allowRival || o.value !== 'rival')
  // Con una sola opción (o ya decidida) no hay nada que elegir: queda la explicación de lo que se publica.
  const choose = seekingOptions.length > 1 && !lockSeeking
  const errorId = (f: string) => `${idPrefix}-${f}-error`
  // Un solo role="alert" a la vez: el primer campo con error, en el orden en que aparecen.
  const first = [
    'seeking',
    ...(seeking === 'players' ? ['seekingPosition'] : []),
    'whatsapp',
    'whatsappConsent',
  ].find((f) => fieldError(f))
  const err = (f: string) =>
    fieldError(f) ? (
      <p
        id={errorId(f)}
        {...(f === first ? { role: 'alert' as const } : {})}
        className={FIELD_ERROR}
      >
        {fieldError(f)}
      </p>
    ) : null
  return (
    <div className="space-y-4">
      <input type="hidden" name="seeking" value={seeking} />
      {seeking === 'players' && <input type="hidden" name="seekingPosition" value={position} />}

      <div className="flex flex-col gap-1.5">
        {choose && (
          <>
            <p className="text-base font-medium text-foreground">¿Qué buscás?</p>
            <ChipGroup
              label="Qué buscás"
              options={seekingOptions}
              value={seeking}
              onChange={(v) => onSeekingChange(v === 'rival' ? 'rival' : 'players')}
              alwaysWrap
            />
          </>
        )}
        <p className={HELP}>{SEEKING_HELP[seeking]}</p>
        {err('seeking')}
      </div>

      {seeking === 'players' && (
        <div className="flex flex-col gap-1.5">
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

      {/* Un mismo tema: qué se hace con tu número. Primero la que obliga, después la opcional. */}
      <div className="space-y-1">
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
            className="h-12 rounded-lg text-base placeholder:text-muted-foreground md:h-12 md:text-base"
            aria-invalid={fieldError('whatsapp') ? true : undefined}
            aria-describedby={
              fieldError('whatsapp') ? errorId('whatsapp') : `${idPrefix}-whatsapp-ayuda`
            }
          />
          <p id={`${idPrefix}-whatsapp-ayuda`} className={HELP}>
            Con código de área, sin 0 ni 15.
          </p>
          {err('whatsapp')}
        </div>

        <RivalCheckbox
          name="whatsappConsent"
          checked={consent}
          onChange={onConsentChange}
          invalid={Boolean(fieldError('whatsappConsent'))}
          describedBy={fieldError('whatsappConsent') ? errorId('whatsappConsent') : undefined}
        >
          Mi WhatsApp lo ve solo quien yo acepte en este partido
        </RivalCheckbox>
        {err('whatsappConsent')}

        {savePhone && (
          <>
            <RivalCheckbox
              name="savePhone"
              checked={savePhone.checked}
              onChange={savePhone.onChange}
              describedBy={`${idPrefix}-guardar-ayuda`}
            >
              Guardar este número en mi cuenta
            </RivalCheckbox>
            <p id={`${idPrefix}-guardar-ayuda`} className={HELP}>
              Lo ven los complejos donde reservás. La próxima vez viene cargado.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
