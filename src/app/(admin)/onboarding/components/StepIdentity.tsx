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
        <h2 className="text-xl font-semibold">Tu Complejo</h2>
        <p className="text-sm text-gray-500 mt-1">Paso 1 de 4 — Datos básicos del complejo</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Nombre del complejo <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Complejo San Martín"
            required
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {name.length >= 2 && (
            <p className="text-xs text-gray-500 mt-1">
              URL:{' '}
              <span className="font-mono">
                turnogol.com.ar/<strong>{slugPreview}</strong>
              </span>
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Dirección <span className="text-red-500">*</span>
          </label>
          <input
            name="address"
            placeholder="Ej: Av. Corrientes 1234"
            required
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Ciudad <span className="text-red-500">*</span>
            </label>
            <input
              name="city"
              placeholder="Ej: Luján"
              required
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Provincia <span className="text-red-500">*</span>
            </label>
            <select
              name="province"
              required
              defaultValue=""
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-sm font-medium mb-1">
              Teléfono <span className="text-red-500">*</span>
            </label>
            <input
              name="phone"
              type="tel"
              placeholder="+54 9 11 1234-5678"
              required
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Email de contacto <span className="text-red-500">*</span>
            </label>
            <input
              name="email"
              type="email"
              placeholder="admin@complejo.com"
              required
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Creando...' : 'Continuar →'}
        </button>
      </form>
    </div>
  )
}
