'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import type { WizardActionResult } from '../actions'
import { generateSlug } from '@/modules/tenants/tenant.utils'
import { fieldClass, labelClass } from './wizard-styles'
import { PhoneInput } from '@/components/ui/phone-input'

/** Firma de la Server Action que consume el form. */
export type CreateTenantAction = (formData: FormData) => Promise<WizardActionResult>

const PROVINCES = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
]

export function StepIdentity({ action }: { action: CreateTenantAction }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')

  const slugPreview = generateSlug(name)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await action(formData)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Tu complejo</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Con esto armamos tu página pública para recibir reservas.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="identity-name" className={labelClass}>
            Nombre del complejo <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="identity-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Complejo San Martín"
            required
            className={fieldClass}
          />
          {name.length >= 2 && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Tu link público:{' '}
              <span className="text-foreground">
                turnogol.app/<strong className="text-emerald-700 dark:text-emerald-400">{slugPreview}</strong>
              </span>
            </p>
          )}
        </div>

        <div>
          <label htmlFor="identity-address" className={labelClass}>
            Dirección <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="identity-address"
            name="address"
            placeholder="Ej: Av. Corrientes 1234"
            required
            className={fieldClass}
          />
        </div>

        {/* Columnas solo desde sm: en 375px los placeholders deben caber (§6.3). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="identity-city" className={labelClass}>
              Ciudad <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              id="identity-city"
              name="city"
              placeholder="Ej: Luján"
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="identity-province" className={labelClass}>
              Provincia <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <select
              id="identity-province"
              name="province"
              required
              defaultValue=""
              className={fieldClass}
            >
              <option value="" disabled>
                Seleccioná...
              </option>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PhoneInput
            id="identity-phone"
            name="phone"
            label="Teléfono"
            required
          />
          <div>
            <label htmlFor="identity-email" className={labelClass}>
              Email de contacto <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              id="identity-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Ej: hola@complejo.com"
              required
              className={fieldClass}
            />
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <Button type="submit" isLoading={isPending} className="w-full">
          Continuar
        </Button>
      </form>
    </div>
  )
}
