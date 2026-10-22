'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Copy } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { SubmitButton } from '@/components/ui/submit-button'
import { PROVINCES } from '@/modules/tenants/tenant.geo'
import type { AssistedSignupField, AssistedSignupState } from '../../actions'

/**
 * Firma de `createAssistedTenantAction` (../../actions). Entra por PROP: el
 * módulo es `'use server'` y arrastraría drizzle al bundle del browser.
 */
export type AssistedSignupAction = (
  prev: AssistedSignupState,
  formData: FormData,
) => Promise<AssistedSignupState>

const PROVINCE_OPTIONS: ComboboxOption[] = PROVINCES.map((p) => ({ value: p, label: p }))
const INITIAL: AssistedSignupState = { status: 'idle' }

type Props = {
  action: AssistedSignupAction
  /** URL absoluta de `/login`, para el mensaje que se le pasa al dueño. */
  loginUrl: string
}

/**
 * Alta asistida de un complejo. "Dar de alta otro" remonta el form con otra
 * `key`, que es lo único que limpia el estado de `useActionState`.
 */
export function AssistedSignupForm({ action, loginUrl }: Props) {
  const [round, setRound] = useState(0)
  return (
    <AssistedSignupFlow
      key={round}
      action={action}
      loginUrl={loginUrl}
      onAnother={() => setRound((r) => r + 1)}
    />
  )
}

function AssistedSignupFlow({ action, loginUrl, onAnother }: Props & { onAnother: () => void }) {
  const [state, formAction] = useActionState(action, INITIAL)

  if (state.status === 'success') {
    return <SignupDone state={state} loginUrl={loginUrl} onAnother={onAnother} />
  }

  const errs = state.status === 'error' ? state.fieldErrors : {}
  const vals = state.status === 'error' ? state.values : {}

  return (
    <form action={formAction} noValidate className="max-w-3xl space-y-6">
      <fieldset className="space-y-4 rounded-xl border border-border bg-card p-5">
        <legend className="px-1 text-sm font-semibold text-foreground">El complejo</legend>
        <Field name="name" label="Nombre" error={errs.name} defaultValue={vals.name} />
        <Field
          name="address"
          label="Dirección"
          placeholder="Calle y número"
          error={errs.address}
          defaultValue={vals.address}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field name="city" label="Ciudad" error={errs.city} defaultValue={vals.city} />
          <ProvinceField error={errs.province} defaultValue={vals.province} />
        </div>
        <PhoneInput
          id="assisted-phone"
          name="phone"
          label="Teléfono"
          placeholder="11 1234-5678"
          error={errs.phone}
          defaultValue={vals.phone}
        />
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-border bg-card p-5">
        <legend className="px-1 text-sm font-semibold text-foreground">El dueño</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            name="firstName"
            label="Nombre"
            autoComplete="off"
            error={errs.firstName}
            defaultValue={vals.firstName}
          />
          <Field
            name="lastName"
            label="Apellido"
            autoComplete="off"
            error={errs.lastName}
            defaultValue={vals.lastName}
          />
        </div>
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="off"
          helper="Revisalo letra por letra: la cuenta queda confirmada con este email, y ahí le llega la bienvenida."
          error={errs.email}
          defaultValue={vals.email}
        />
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-border bg-card p-5">
        <legend className="px-1 text-sm font-semibold text-foreground">Referido (opcional)</legend>
        <Field
          name="referral"
          label="Código o link del complejo que lo recomendó"
          placeholder="ABCD2345 o …/r/ABCD2345"
          required={false}
          error={errs.referral}
          defaultValue={vals.referral}
        />
      </fieldset>

      {state.status === 'error' && state.message && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      )}

      <SubmitButton pendingLabel="Dando de alta…">Dar de alta</SubmitButton>
    </form>
  )
}

/**
 * Combobox no participa de FormData por sí solo: el hidden input es lo que lee
 * el server, igual que en el paso 1 del wizard.
 */
function ProvinceField({ error, defaultValue }: { error?: string; defaultValue?: string }) {
  const [province, setProvince] = useState(defaultValue ?? '')
  return (
    <div className="space-y-1.5">
      <label htmlFor="assisted-province" className="text-sm font-medium text-foreground">
        Provincia
      </label>
      <Combobox
        id="assisted-province"
        options={PROVINCE_OPTIONS}
        value={province}
        onChange={setProvince}
        placeholder="Buscá la provincia…"
        listboxLabel="Provincias"
        aria-describedby={error ? 'assisted-province-hint' : undefined}
      />
      <input type="hidden" name="province" value={province} />
      {error && (
        <p
          id="assisted-province-hint"
          role="alert"
          className="text-xs text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  )
}

function Field(props: {
  name: AssistedSignupField
  label: string
  type?: string
  autoComplete?: string
  placeholder?: string
  helper?: string
  required?: boolean
  error?: string
  /** Repone lo tipeado cuando el server devuelve error (input NO controlado). */
  defaultValue?: string
}) {
  const id = `assisted-${props.name}`
  const hintId = `${id}-hint`
  const hint = props.error ?? props.helper
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {props.label}
      </label>
      <Input
        id={id}
        name={props.name}
        type={props.type ?? 'text'}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        defaultValue={props.defaultValue}
        required={props.required ?? true}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={hint ? hintId : undefined}
        className="aria-invalid:border-red-500"
      />
      {hint && (
        <p
          id={hintId}
          role={props.error ? 'alert' : undefined}
          className={
            props.error ? 'text-xs text-red-700 dark:text-red-400' : 'text-xs text-muted-foreground'
          }
        >
          {hint}
        </p>
      )}
    </div>
  )
}

function SignupDone({
  state,
  loginUrl,
  onAnother,
}: {
  state: Extract<AssistedSignupState, { status: 'success' }>
  loginUrl: string
  onAnother: () => void
}) {
  const [copied, setCopied] = useState(false)
  // El form desaparece de abajo del foco: el lector de pantalla tiene que caer acá.
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])
  const message = [
    `Ya podés entrar a TurnoGol: ${loginUrl}`,
    `Email: ${state.email}`,
    `Contraseña temporal: ${state.tempPassword}`,
    'Al entrar te pedimos que crees tu contraseña.',
  ].join('\n')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
    } catch {
      // Sin permiso de portapapeles: los datos siguen a la vista para copiarlos a mano.
    }
  }

  return (
    <div className="max-w-3xl space-y-5 rounded-xl border border-emerald-600/30 bg-card p-5">
      <div className="space-y-1">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-foreground outline-none"
        >
          {state.tenantName} quedó dado de alta
        </h2>
        <p className="text-sm text-muted-foreground">
          Pasale estos datos al dueño por WhatsApp. Cuando entre, el sistema le pide crear su
          contraseña y lo lleva a cargar horarios y canchas.
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="break-all font-medium text-foreground">{state.email}</dd>
        <dt className="text-muted-foreground">Contraseña temporal</dt>
        <dd className="font-mono font-semibold text-foreground">{state.tempPassword}</dd>
      </dl>

      <p className="text-sm text-amber-800 dark:text-amber-300">
        La contraseña se muestra una sola vez. Si se pierde, usá “Resetear contraseña” en el detalle
        del complejo.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleCopy} className={buttonVariants()}>
          {copied ? (
            <Check className="mr-2 h-4 w-4" aria-hidden />
          ) : (
            <Copy className="mr-2 h-4 w-4" aria-hidden />
          )}
          {copied ? 'Mensaje copiado' : 'Copiar mensaje para WhatsApp'}
        </button>
        <Link
          href={`/super-admin/tenants/${state.tenantId}`}
          className={buttonVariants({ variant: 'outline' })}
        >
          Ver el complejo
        </Link>
        <button type="button" onClick={onAnother} className={buttonVariants({ variant: 'ghost' })}>
          Dar de alta otro
        </button>
      </div>
    </div>
  )
}
