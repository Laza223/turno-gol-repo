'use client'

import type { ReactNode, RefObject } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { PORTAL_BUTTON, PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import { formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import { ChipGroup, DayChips } from '@/app/(public)/[slug]/components/ChipGroups'
import { FixedCta } from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'
import { dayLabel } from '@/modules/rival/rival-display'
import { FormError } from '../FormError'
import { BoardFields } from '../BoardFields'
import { RivalCheckbox } from '../RivalCheckbox'
import { StampBadge } from '../MatchBits'
import {
  CHIP_BUTTON,
  CHIP_BUTTON_ON,
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

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-5">
      <h2 id={id} className={PORTAL_SECTION_TITLE}>
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
    <div
      className="flex shrink-0 items-center gap-3"
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="md:size-11 focus-visible:ring-offset-background"
        aria-label="Uno menos"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-4" aria-hidden />
      </Button>
      <output
        aria-live="polite"
        className="min-w-12 text-center font-display text-3xl font-black italic tabular-nums text-foreground"
      >
        {value}
      </output>
      <Button
        type="button"
        variant="outline"
        size="icon"
        id={id}
        className="md:size-11 focus-visible:ring-offset-background"
        aria-label="Uno más"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="size-4" aria-hidden />
      </Button>
    </div>
  )
}

/** "¿Cuántos te faltan?": solo con "Me faltan jugadores". Un número, sin nombres. */
function MissingControl({ form }: Props) {
  const { fe } = form
  return (
    <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p id="rival-faltan-titulo" className="text-base font-medium text-foreground">
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
    <section aria-labelledby="rival-necesito-titulo" className="space-y-3">
      <h2 id="rival-necesito-titulo" className={PORTAL_SECTION_TITLE}>
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
              className={cn(
                'flex min-h-14 flex-col items-start justify-center rounded-2xl border-2 px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                on ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-input',
              )}
            >
              <span className="text-base font-semibold text-foreground">{o.title}</span>
              <span className={HELP}>{o.help}</span>
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
    <Block id="rival-bloque-whatsapp" title="Contacto">
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
    <div className="space-y-1 rounded-2xl bg-muted/50 p-4">
      <p className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
        Viene de tu reserva
      </p>
      <p className="text-base font-semibold text-foreground">{form.tenant?.name ?? ''}</p>
      <p className="text-base tabular-nums text-foreground">
        {dayLabel(form.date)} · {form.time} · {formatLabel(form.format)}
      </p>
      {form.teamOnly && <p className={HELP}>{form.teamHelp}</p>}
    </div>
  )
}

function TenantField({ form }: Props) {
  const { fe } = form
  return (
    <div className="space-y-1.5">
      <Label htmlFor={FIELD_IDS.tenantId} className="text-base">
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
        className="rounded-lg bg-card md:text-base"
      />
      <FieldError form={form} field="tenantId" />
    </div>
  )
}

function DayField({ form }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-base font-medium text-foreground">Día</p>
      <DayChips
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
            className="contents"
          />
        )}
        <button
          type="button"
          id={hours.quick.length === 0 ? hourControl.id : undefined}
          aria-expanded={otherOpen}
          onClick={() => form.setOtherOpen((open) => !open)}
          className={cn(CHIP_BUTTON, validTime !== '' && !isQuick && CHIP_BUTTON_ON)}
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
          className="rounded-lg bg-card md:text-base"
          contentClassName="max-h-[min(60dvh,22rem)]"
        />
      )}
    </>
  )
}

function HourField({ form }: Props) {
  const { hours } = form
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-base font-medium text-foreground">Hora</p>
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
    <Block id="rival-bloque-donde" title="Dónde y cuándo">
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
    <div className="space-y-1.5">
      {form.capacityOpen || form.capacity !== null || form.reported.capacity ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id="rival-cuantos" className="text-base font-medium text-foreground">
              Cuántos juegan
            </p>
            <p className={HELP}>En total, los dos equipos. Vos incluido.</p>
          </div>
          <div
            className="flex shrink-0 items-center gap-3"
            role="group"
            aria-labelledby="rival-cuantos"
            aria-describedby={fe.message('capacity') ? `${FIELD_IDS.capacity}-error` : undefined}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="md:size-11 focus-visible:ring-offset-background"
              aria-label="Uno menos"
              disabled={effectiveCapacity <= MIN_CAPACITY}
              onClick={() => {
                form.setCapacity(Math.max(MIN_CAPACITY, effectiveCapacity - 1))
                fe.clear('capacity')
              }}
            >
              <Minus className="size-4" aria-hidden />
            </Button>
            <output
              aria-live="polite"
              className="min-w-12 text-center font-display text-3xl font-black italic tabular-nums text-foreground"
            >
              {effectiveCapacity}
            </output>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="md:size-11 focus-visible:ring-offset-background"
              id={FIELD_IDS.capacity}
              aria-label="Uno más"
              disabled={effectiveCapacity >= MAX_CAPACITY}
              onClick={() => {
                form.setCapacity(Math.min(MAX_CAPACITY, effectiveCapacity + 1))
                fe.clear('capacity')
              }}
            >
              <Plus className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex min-h-11 items-center gap-2 text-base text-foreground">
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
            className="min-h-11 font-medium text-emerald-800 underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary dark:text-emerald-400"
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
    <div className="flex flex-col gap-1.5">
      <p className="text-base font-medium text-foreground">Fútbol de</p>
      <ChipGroup
        {...form.fe.controlProps('format')}
        label="Fútbol de"
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
    <div className="flex flex-col gap-1.5">
      <p className="text-base font-medium text-foreground">Nivel</p>
      <ChipGroup
        {...form.fe.controlProps('level')}
        label="Nivel"
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
    <Block id="rival-bloque-partido" title="El partido">
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
    <div className="space-y-1">
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
            className="py-3 font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-400"
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
    <Block id="rival-bloque-cancha" title="La cancha">
      {form.showStamp ? (
        <div className="space-y-1">
          <StampBadge />
          <p className={HELP}>Encontramos tu reserva a esa hora.</p>
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
          disabled={pending}
          aria-busy={pending}
          className={cn(PORTAL_BUTTON, 'min-h-[52px]')}
        >
          {pending ? 'Armando…' : form.publishes ? 'Armar y publicar' : 'Armar el partido'}
        </Button>
      </FixedCta>
    </>
  )
}
