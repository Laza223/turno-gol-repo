'use client'

import { useState, useTransition } from 'react'
import { createTenantAction } from '../actions'
import { generateSlug } from '@/modules/tenants/tenant.utils'

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

export function StepIdentity() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')

  const slugPreview = generateSlug(name)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createTenantAction(formData)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Tu Complejo</h2>
        <p className="text-sm text-muted-foreground mt-1">Datos básicos del complejo</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="identity-name" className="block text-sm font-medium text-foreground mb-1.5">
            Nombre del complejo <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="identity-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Complejo San Martín"
            required
            className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus:border-emerald-500 hover:border-border"
          />
          {name.length >= 2 && (
            <p className="text-xs text-muted-foreground mt-1.5">
              URL:{' '}
              <span className="font-mono text-foreground">
                turnogol.app/<strong className="text-emerald-700 dark:text-emerald-400">{slugPreview}</strong>
              </span>
            </p>
          )}
        </div>

        <div>
          <label htmlFor="identity-address" className="block text-sm font-medium text-foreground mb-1.5">
            Dirección <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="identity-address"
            name="address"
            placeholder="Ej: Av. Corrientes 1234"
            required
            className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus:border-emerald-500 hover:border-border"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="identity-city" className="block text-sm font-medium text-foreground mb-1.5">
              Ciudad <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              id="identity-city"
              name="city"
              placeholder="Ej: Luján"
              required
              className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus:border-emerald-500 hover:border-border"
            />
          </div>
          <div>
            <label htmlFor="identity-province" className="block text-sm font-medium text-foreground mb-1.5">
              Provincia <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <select
              id="identity-province"
              name="province"
              required
              defaultValue=""
              className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus:border-emerald-500 hover:border-border"
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="identity-phone" className="block text-sm font-medium text-foreground mb-1.5">
              Teléfono <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              id="identity-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+54 9 11 1234-5678"
              required
              className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus:border-emerald-500 hover:border-border"
            />
          </div>
          <div>
            <label htmlFor="identity-email" className="block text-sm font-medium text-foreground mb-1.5">
              Email de contacto <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              id="identity-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="marcelo@tucomplejo.com"
              required
              className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus:border-emerald-500 hover:border-border"
            />
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full h-11 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none transition-all duration-200"
        >
          {isPending ? 'Creando...' : 'Continuar →'}
        </button>
      </form>
    </div>
  )
}
