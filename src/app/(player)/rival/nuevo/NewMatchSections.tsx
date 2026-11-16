'use client'

import type { CSSProperties, ReactNode, RefObject } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import { ChipGroup, DayChips } from '@/app/(public)/[slug]/components/ChipGroups'
import { FixedCta } from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'
import { dayLabel } from '@/modules/rival/rival-display'
import { FormError } from '../FormError'
import { RIVAL_PICK, RIVAL_PICK_MENU } from '../rival-classes'
import { BoardFields } from '../BoardFields'
import { RivalCheckbox } from '../RivalCheckbox'
import { StampBadge } from '../MatchBits'
import {
  FIELD_ERROR,
  FIELD_IDS,
  FORMAT_CHIPS,
  HELP,
  LEVEL_CHIPS,
  LEVEL_HELP,
  BOARD_ID_PREFIX,
  MAX_CAPACITY,
  MIN_CAPACITY,
  INTENT_OPTIONS,
  type Field,
} from './new-match-form'
import type { NewMatchFormState } from './use-new-match-form'

type Props = { form: NewMatchFormState }

function Block({
  id,
  title,
  index,
  children,
}: {
  id: string
  title: string
  index: number
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="rv-panel glass-painted rv-rise"
      style={{ '--i': index } as CSSProperties}
    >
      <h2 id={id} className="rv-h2">
        {title}
      </h2>
      {children}
    </section>
  )
}

function FieldError({ form, field }: Props & { field: Field }) {
  const message = form.fe.message(field)
  if (!message) return null
  return (
    <p {...form.messageProps(field)} className={FIELD_ERROR}>
      {message}
    </p>
  )
}

/** Un paso del form de un solo número ("Uno menos" / "Uno más"), con el valor al medio. */
function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  id,
  describedBy,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  id?: string
  describedBy?: string
}) {
  return (
    <div className="ri-stepper" role="group" aria-label={label} aria-describedby={describedBy}>
      <button
        type="button"
        aria-label="Uno menos"
        // aria-disabled y no disabled: al llegar al tope el foco no se cae al body.
        aria-disabled={value <= min}
        onClick={() => value > min && onChange(value - 1)}
      >
        <Minus aria-hidden />
      </button>
      <output aria-live="polite">
        {/* El número se reemplaza adentro: la región live sigue siendo el mismo nodo y se anuncia. */}
        <span key={value} className="rv-swap">
          {value}
        </span>
      </output>
      <button
        type="button"
        id={id}
        aria-label="Uno más"
        aria-disabled={value >= max}
        onClick={() => value < max && onChange(value + 1)}
      >
        <Plus aria-hidden />
      </button>
    </div>
  )
}

/** "¿Cuántos te faltan?": solo con "Me faltan jugadores". Un número, sin nombres. */
function MissingControl({ form }: Props) {
  const { fe } = form
  return (
    <div className="grid gap-3 rounded-[20px] border border-portal-inner-line bg-portal-inner p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-48 flex-1">
          <p id="rival-faltan-titulo" className="ri-q">
            ¿Cuántos te faltan?
          </p>
          <p className={HELP}>Para completar los {form.effectiveCapacity}.</p>
        </div>
        <Stepper
          label="Cuántos te faltan"
          value={form.missing}
          min={1}
          max={form.maxMissing}
          id={FIELD_IDS.missing}
          describedBy={fe.message('missing') ? `${FIELD_IDS.missing}-error` : undefined}
          onChange={(v) => {
            form.setMissing(v)
            fe.clear('missing')
          }}
        />
      </div>
      <RivalCheckbox
        checked={form.goalkeeper}
        onChange={form.setGoalkeeper}
        name="seekingGoalkeeper"
      >
        Se busca arquero
      </RivalCheckbox>
      <FieldError form={form} field="missing" />
    </div>
  )
}

/** Paso 1: tres opciones grandes. Las dos primeras salen al tablón al armar. */
export function IntentBlock({ form }: Props) {
  const { fe } = form
  return (
    <section
      aria-labelledby="rival-necesito-titulo"
      className="rv-panel glass-painted rv-rise"
      style={{ '--i': 0 } as CSSProperties}
    >
      <h2 id="rival-necesito-titulo" className="rv-h2">
        ¿Qué necesitás?
      </h2>
      <div
        {...fe.controlProps('intent')}
        role="radiogroup"
        aria-labelledby="rival-necesito-titulo"
        className="grid gap-2"
      >
        {INTENT_OPTIONS.map((o) => {
          const on = form.intent === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                form.setIntent(o.value)
                fe.clear('intent')
              }}
              className="ri-intent"
            >
              <b>{o.title}</b>
              <span>{o.help}</span>
            </button>
          )
        })}
      </div>
      <FieldError form={form} field="intent" />
      {form.intent === 'players' && <MissingControl form={form} />}
    </section>
  )
}

/** El WhatsApp que viaja con el partido cuando sale al tablón. */
export function BoardBlock({ form }: Props) {
  const { fe } = form
  return (
    <Block id="rival-bloque-whatsapp" title="Contacto" index={4}>
      <BoardFields
        idPrefix={BOARD_ID_PREFIX}
        compact
        lockSeeking
        allowRival={form.intent === 'rival'}
        seeking={form.intent === 'rival' ? 'rival' : 'players'}
        onSeekingChange={() => undefined}
        position={form.goalkeeper ? 'goalkeeper' : 'any'}
        onPositionChange={() => undefined}
        whatsapp={form.whatsapp}
        onWhatsappChange={(v) => {
          form.setWhatsapp(v)
          fe.clear('whatsapp')
        }}
        consent={form.consent}
        onConsentChange={(v) => {
          form.setConsent(v)
          fe.clear('whatsappConsent')
        }}
        savePhone={
          form.offerSave ? { checked: form.savePhone, onChange: form.setSavePhone } : undefined
        }
        fieldError={(f) => fe.message(f as Field)}
      />
    </Block>
  )
}

function LockedSummary({ form }: Props) {
  return (
    <div className="grid gap-1 rounded-[20px] border border-portal-inner-line bg-portal-inner p-4">
      <p className="rv-small font-semibold uppercase tracking-wide">Viene de tu reserva</p>
      <p className="text-base font-semibold text-portal-ink">{form.tenant?.name ?? ''}</p>
      <p className="text-base tabular-nums text-portal-ink">
        {dayLabel(form.date)} · {form.time} · {formatLabel(form.format)}
      </p>
      {form.teamOnly && <p className={HELP}>{form.teamHelp}</p>}
    </div>
  )
}

function TenantField({ form }: Props) {
  const { fe } = form
  return (
    <div className="grid gap-2">
      <Label htmlFor={FIELD_IDS.tenantId} className="text-base font-semibold text-portal-ink">
        Complejo
      </Label>
      <SelectMenu
        {...fe.controlProps('tenantId')}
        value={form.tenantId}
        onChange={(v) => {
          form.setTenantId(v)
          fe.clear('tenantId')
        }}
        options={form.tenants.map((t) => ({ value: t.id, label: `${t.name} · ${t.city}` }))}
        placeholder="Elegí el complejo"
        className={RIVAL_PICK}
        contentClassName={RIVAL_PICK_MENU}
      />
      <FieldError form={form} field="tenantId" />
    </div>
  )
}

function DayField({ form }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="ri-q">Día</p>
      <DayChips
        glass
        days={form.days}
        today={form.today}
        value={form.date}
        isClosed={() => false}
        alwaysWrap
        onChange={(d) => {
          form.setDate(d)
          form.fe.clear('startsAt')
        }}
      />
    </div>
  )
}

function HourPicker({ form }: Props) {
  const { fe, hours, validTime, isQuick, otherOpen } = form
  const hourControl = fe.controlProps('startsAt')
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {hours.quick.length > 0 && (
          <ChipGroup
            {...hourControl}
            label="Hora"
            options={hours.quick.map((t) => ({ value: t, label: t }))}
            value={isQuick ? validTime : ''}
            onChange={(t) => {
              form.setTime(t)
              form.setOtherOpen(false)
              fe.clear('startsAt')
            }}
            tabular
            glass
            className="contents"
          />
        )}
        <button
          type="button"
          id={hours.quick.length === 0 ? hourControl.id : undefined}
          aria-expanded={otherOpen}
          onClick={() => form.setOtherOpen((open) => !open)}
          className={cn(
            buttonVariants({ variant: 'pill-chip', size: 'pill-sm' }),
            'shrink-0 tabular-nums',
            // Elegida: el verde de `pill-chip` sin sumar `aria-pressed` (el botón abre la lista).
            validTime !== '' &&
              !isQuick &&
              'border-transparent bg-linear-to-b from-(--portal-btn-a) to-(--portal-btn-b) text-portal-on-green',
          )}
        >
          {validTime !== '' && !isQuick ? (
            <>
              <Check className="size-4" aria-hidden />
              Otra: {validTime}
            </>
          ) : (
            'Otra hora'
          )}
        </button>
      </div>
      {otherOpen && (
        <SelectMenu
          id="rival-hora-lista"
          aria-label="Elegí otra hora"
          value={validTime}
          onChange={(t) => {
            form.setTime(t)
            if (hours.quick.includes(t)) form.setOtherOpen(false)
            fe.clear('startsAt')
          }}
          options={hours.all.map((t) => ({ value: t, label: t }))}
          placeholder="Elegí otra hora"
          className={RIVAL_PICK}
          contentClassName={cn(RIVAL_PICK_MENU, 'max-h-[min(60dvh,22rem)]')}
        />
      )}
    </>
  )
}

function HourField({ form }: Props) {
  const { hours } = form
  return (
    <div className="flex flex-col gap-2">
      <p className="ri-q">Hora</p>
      {hours.all.length === 0 ? (
        <p className={HELP}>Hoy ya no quedan horarios. Elegí otro día.</p>
      ) : (
        <HourPicker form={form} />
      )}
      {hours.reason === 'closed' && (
        <p className={HELP}>
          Ese día el complejo figura cerrado en TurnoGol. Si tenés la cancha igual, elegí tu hora.
        </p>
      )}
      {form.timeStale && <p className={HELP}>Esa hora ya no está disponible. Elegí otra.</p>}
      <FieldError form={form} field="startsAt" />
    </div>
  )
}

export function WhereWhenBlock({ form }: Props) {
  return (
    <Block id="rival-bloque-donde" title="Dónde y cuándo" index={1}>
      {form.locked ? (
        <LockedSummary form={form} />
      ) : (
        <>
          <TenantField form={form} />
          <DayField form={form} />
          <HourField form={form} />
        </>
      )}
    </Block>
  )
}

/** El cupo sale del formato (x 2): se muestra como dato y el stepper solo abre si se toca. */
function CapacityControl({ form }: Props) {
  const { fe, effectiveCapacity } = form
  if (form.intent !== 'group') return null
  return (
    <div className="grid gap-2">
      {form.capacityOpen || form.capacity !== null || form.reported.capacity ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id="rival-cuantos" className="ri-q">
              Cuántos juegan
            </p>
            <p className={HELP}>En total, los dos equipos. Vos incluido.</p>
          </div>
          <div
            className="ri-stepper"
            role="group"
            aria-labelledby="rival-cuantos"
            aria-describedby={fe.message('capacity') ? `${FIELD_IDS.capacity}-error` : undefined}
          >
            <button
              type="button"
              aria-label="Uno menos"
              disabled={effectiveCapacity <= MIN_CAPACITY}
              onClick={() => {
                form.setCapacity(Math.max(MIN_CAPACITY, effectiveCapacity - 1))
                fe.clear('capacity')
              }}
            >
              <Minus aria-hidden />
            </button>
            <output aria-live="polite">
              <span key={effectiveCapacity} className="rv-swap">
                {effectiveCapacity}
              </span>
            </output>
            <button
              type="button"
              id={FIELD_IDS.capacity}
              aria-label="Uno más"
              disabled={effectiveCapacity >= MAX_CAPACITY}
              onClick={() => {
                form.setCapacity(Math.min(MAX_CAPACITY, effectiveCapacity + 1))
                fe.clear('capacity')
              }}
            >
              <Plus aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <p className="flex min-h-11 items-center gap-2 text-base text-portal-ink">
          <span>
            Juegan{' '}
            <output aria-live="polite" className="font-semibold tabular-nums">
              {effectiveCapacity}
            </output>
            , vos incluido
          </span>
          <span aria-hidden>·</span>
          <button
            type="button"
            id={FIELD_IDS.capacity}
            aria-label="Cambiar cuántos juegan"
            onClick={() => form.setCapacityOpen(true)}
            className="rv-link min-h-11"
          >
            Cambiar
          </button>
        </p>
      )}
      <FieldError form={form} field="capacity" />
    </div>
  )
}

function FormatField({ form }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="ri-q">Fútbol de</p>
      <ChipGroup
        {...form.fe.controlProps('format')}
        label="Fútbol de"
        glass
        options={FORMAT_CHIPS}
        value={String(form.format)}
        onChange={(v) => {
          form.setFormat(Number(v))
          form.fe.clear('format')
        }}
        className="grid grid-cols-4 overflow-visible"
      />
      <FieldError form={form} field="format" />
      {form.teamOnly && <p className={HELP}>{form.teamHelp}</p>}
      <CapacityControl form={form} />
    </div>
  )
}

function LevelField({ form }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="ri-q">Nivel</p>
      <ChipGroup
        {...form.fe.controlProps('level')}
        label="Nivel"
        glass
        options={LEVEL_CHIPS}
        value={form.level}
        onChange={(v) => {
          form.setLevel(v)
          form.fe.clear('level')
        }}
      />
      <p className={HELP}>
        Lo elegís vos, según cómo juega tu grupo. {LEVEL_HELP[form.level] ?? ''}
      </p>
      <FieldError form={form} field="level" />
    </div>
  )
}

export function MatchBlock({ form }: Props) {
  return (
    <Block id="rival-bloque-partido" title="El partido" index={2}>
      {!form.locked && <FormatField form={form} />}
      {form.locked && <CapacityControl form={form} />}
      <LevelField form={form} />
    </Block>
  )
}

function CourtCheckbox({ form }: Props) {
  const { fe, tenant } = form
  const court = fe.controlProps('courtDeclared')
  return (
    <div className="grid gap-1">
      <RivalCheckbox
        id={court.id}
        name="courtDeclared"
        checked={form.courtDeclared}
        onChange={(checked) => {
          form.setCourtDeclared(checked)
          fe.clear('courtDeclared')
        }}
        invalid={court['aria-invalid'] === true}
        describedBy={[
          fe.message('courtDeclared') ? undefined : 'rival-cancha-ayuda',
          court['aria-describedby'],
        ]
          .filter(Boolean)
          .join(' ')}
      >
        Ya tengo la cancha
      </RivalCheckbox>
      {/* Con error, el error dice lo mismo: la ayuda se oculta para no repetirlo. */}
      {!fe.message('courtDeclared') && (
        <p id="rival-cancha-ayuda" className={HELP}>
          Hace falta para armar el partido: sin cancha no hay partido.
        </p>
      )}
      {tenant && (
        <p className={HELP}>
          ¿Todavía no tenés cancha?{' '}
          <a
            href={`/${tenant.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rv-link py-3"
          >
            Reservala en {tenant.name}
          </a>
          : después armás el partido desde tu reserva.
        </p>
      )}
    </div>
  )
}

export function CourtBlock({ form }: Props) {
  return (
    <Block id="rival-bloque-cancha" title="La cancha" index={3}>
      {form.showStamp ? (
        <div className="grid justify-items-start gap-1">
          <StampBadge />
          <p className="text-sm font-semibold text-portal-slot-ink">
            Encontramos tu reserva a esa hora.
          </p>
        </div>
      ) : (
        <CourtCheckbox form={form} />
      )}
      <FieldError form={form} field="courtDeclared" />
    </Block>
  )
}

function GeneralError({
  form,
  message,
  errorRef,
}: Props & { message: string; errorRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={errorRef}>
      <FormError error={message} code={form.errorCode} />
    </div>
  )
}

/** El error va en el flujo, no en la barra: el alto de la barra es fijo y uno variable la haría tapar el final. */
export function SubmitBar({
  form,
  errorRef,
}: Props & { errorRef: RefObject<HTMLDivElement | null> }) {
  const { general, pending } = form
  return (
    <>
      {general && <GeneralError form={form} message={general} errorRef={errorRef} />}
      <FixedCta>
        <Button
          type="submit"
          variant="pill"
          size="pill"
          disabled={pending}
          aria-busy={pending}
          className="rv-go w-full"
        >
          {pending ? 'Armando…' : form.publishes ? 'Armar y publicar' : 'Armar el partido'}
        </Button>
      </FixedCta>
    </>
  )
}
