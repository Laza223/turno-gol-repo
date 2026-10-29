'use client'

import Link from 'next/link'
import { BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { PORTAL_BUTTON_OUTLINE } from '@/components/world/PortalAuthFrame'
import { type AlertAction, type AlertSubscription, useAlertOptIn } from './alert-opt-in-state'
import { FormError } from './FormError'
import { RivalCheckbox } from './RivalCheckbox'

const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'
const TENANT_ERROR_ID = 'rival-alerta-complejo-error'

function SignedOutPrompt() {
  return (
    <p className="text-base text-muted-foreground">
      ¿Querés que te avisemos cuando haya partido?{' '}
      <Link
        href={`/ingresar?next=${encodeURIComponent('/rival')}`}
        className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
      >
        Ingresá y activá el aviso
      </Link>
      .
    </p>
  )
}

function TenantField({
  tenants,
  tenantId,
  onChange,
  tenantErrorMessage,
  alreadyOn,
}: {
  tenants: { id: string; name: string }[]
  tenantId: string
  onChange: (id: string) => void
  tenantErrorMessage: string | null
  alreadyOn: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="rival-alerta-complejo" className="text-base">
        Avisame de partidos en
      </Label>
      <SelectMenu
        id="rival-alerta-complejo"
        name="tenantId"
        value={tenantId}
        onChange={onChange}
        options={tenants.map((t) => ({ value: t.id, label: t.name }))}
        placeholder="Elegí un complejo"
        className="rounded-lg bg-card md:text-base"
        aria-invalid={tenantErrorMessage ? true : undefined}
        aria-describedby={tenantErrorMessage ? TENANT_ERROR_ID : undefined}
      />
      {tenantErrorMessage && (
        <p id={TENANT_ERROR_ID} role="alert" className={FIELD_ERROR}>
          {tenantErrorMessage}
        </p>
      )}
      {alreadyOn && (
        <p role="status" className="text-[13px] leading-5 text-muted-foreground">
          Ya tenés el aviso activado en ese complejo. Podés cambiar la preferencia o desactivarlo.
        </p>
      )}
    </div>
  )
}

function SubmitLabel({ subPending, alreadyOn }: { subPending: boolean; alreadyOn: boolean }) {
  if (subPending) return 'Guardando…'
  return alreadyOn ? 'Actualizar aviso' : 'Avisarme por mail'
}

function AlertButtons({
  pending,
  subPending,
  unsubPending,
  alreadyOn,
  onUnsubscribe,
}: {
  pending: boolean
  subPending: boolean
  unsubPending: boolean
  alreadyOn: boolean
  onUnsubscribe: () => void
}) {
  return (
    <div className="space-y-2">
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        aria-busy={pending}
        className={`${PORTAL_BUTTON_OUTLINE} gap-2 rounded-full font-semibold`}
      >
        <BellRing className="size-4" aria-hidden />
        <SubmitLabel subPending={subPending} alreadyOn={alreadyOn} />
      </Button>
      {alreadyOn && (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onUnsubscribe}
          className={`${PORTAL_BUTTON_OUTLINE} rounded-full`}
        >
          {unsubPending ? 'Guardando…' : 'Dejar de avisarme'}
        </Button>
      )}
    </div>
  )
}

/**
 * "Avisame cuando haya" del tablón vacío (y del complejo filtrado sin partidos): un mail por día
 * como mucho, con baja de un toque.
 * Acción secundaria (outline): el único verde de la vista es "Armar un partido". Si ya hay alerta
 * en el complejo, el mismo botón la actualiza (upsert) y aparece "Dejar de avisarme".
 */
export function AlertOptIn({
  tenants,
  signedIn,
  subscribed,
  defaultTenantId,
  action,
  unsubscribeAction,
}: {
  tenants: { id: string; name: string }[]
  signedIn: boolean
  /** Alertas que el jugador ya tiene (complejo y preferencia guardada). */
  subscribed: AlertSubscription[]
  /** Complejo que ya eligió el jugador (el filtro del tablón): llega elegido. */
  defaultTenantId?: string
  action: AlertAction
  unsubscribeAction: AlertAction
}) {
  const s = useAlertOptIn({ tenants, subscribed, defaultTenantId, action, unsubscribeAction })

  if (!signedIn) return <SignedOutPrompt />

  return (
    <form
      onSubmit={s.handleSubmit}
      noValidate
      aria-label="Avisame cuando haya partido"
      className="w-full space-y-4 text-left"
    >
      <TenantField
        tenants={tenants}
        tenantId={s.tenantId}
        onChange={s.handleTenantChange}
        tenantErrorMessage={s.tenantError ? s.tenantError.error : null}
        alreadyOn={s.alreadyOn}
      />

      <RivalCheckbox
        name="onlyGoalkeeper"
        checked={s.onlyGoalkeeper}
        onChange={s.setOnlyGoalkeeper}
      >
        Solo si buscan arquero
      </RivalCheckbox>

      <AlertButtons
        pending={s.pending}
        subPending={s.subPending}
        unsubPending={s.unsubPending}
        alreadyOn={s.alreadyOn}
        onUnsubscribe={s.handleUnsubscribe}
      />
      {s.error && !s.tenantError && <FormError error={s.error.error} code={s.error.code} />}
      {s.okMessage && (
        <p role="status" className="text-base text-foreground">
          {s.okMessage}
        </p>
      )}
    </form>
  )
}
