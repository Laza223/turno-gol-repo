'use client'

import { useState, useTransition } from 'react'
import { Link2, MapPin, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import type { GeocodeAddressAction } from '@/components/maps/LocationPickerField'
import type { GeocodeCandidate } from '@/modules/tenants/geocode.service'
import { PROVINCES } from '@/modules/tenants/tenant.geo'
import { generateSlug } from '@/modules/tenants/tenant.utils'
import type { WizardActionResult } from '../actions'
import { useWizardNavigation } from './use-wizard-navigation'
import { SIGNUP_INPUT_CLASS } from './signup-style'
import { StepScreen } from './StepScreen'

/** Firma de la Server Action que consume el paso (crear o, en revisita, actualizar). */
type CreateTenantAction = (
  prevState: WizardActionResult,
  formData: FormData,
) => Promise<WizardActionResult>

const PROVINCE_OPTIONS: ComboboxOption[] = PROVINCES.map((p) => ({ value: p, label: p }))

// Sin `next`: el estado inicial no debe disparar la navegación al montar.
const INITIAL: WizardActionResult = { success: true }

/** Datos ya guardados, en la revisita del paso. */
type TenantValues = {
  name: string
  address: string
  city: string
  province: string
  /** Slug YA asignado: en revisita se muestra el real, no el derivado del nombre. Sin slug = alta. */
  slug?: string
  latitude: number | null
  longitude: number | null
}

type Props = {
  action: CreateTenantAction
  geocodeAction: GeocodeAddressAction
  /**
   * Ausente = alta (crea el complejo). Con `slug` = revisita: edita y no toca el slug.
   * Sin `slug` solo precarga las respuestas (el alta pública retoma su borrador).
   */
  defaultValues?: TenantValues
  /** Adónde vuelve "Atrás" desde la primera pantalla. Sin esto no hay botón (es el primer paso). */
  backHref?: string
}

/** Un lugar elegido: lo que el server necesita para guardar la dirección. */
type Place = {
  address: string
  city: string
  province: string
  latitude: number | null
  longitude: number | null
}

/** "AV CORRIENTES 1234" → "Av Corrientes 1234". Georef devuelve la calle en mayúsculas. */
function titleCase(text: string): string {
  return text
    .toLocaleLowerCase('es')
    .replace(
      /(^|\s)(\S)/g,
      (_m, space: string, letter: string) => space + letter.toLocaleUpperCase('es'),
    )
}

function placeFromCandidate(candidate: GeocodeCandidate): Place | null {
  const street = candidate.label.split(',')[0]?.trim()
  if (!street || !candidate.city || !candidate.province) return null
  return {
    address: titleCase(street),
    city: candidate.city,
    province: candidate.province,
    latitude: candidate.lat,
    longitude: candidate.lng,
  }
}

/**
 * Dos pantallas: "¿Cómo se llama tu complejo?" y "¿Dónde queda?". Se guarda al
 * confirmar la segunda.
 *
 * `useTransition` + `await action(...)` manual, NO `useActionState` — a propósito.
 * `createTenantAction` escribe cookies de sesión a mitad de camino
 * (`setStaffTenantClaim` + `refreshSession`), y eso hace que Next revalide los
 * Server Components de la página ANTES de que el cliente procese la respuesta:
 * `<StepComplejo action={createTenantAction}>` pasa a ser `<StepComplejo
 * action={updateWizardTenantAction}>` (el tenant ya existe) a mitad del submit, y
 * `useActionState` pierde la resolución de la primera action: el `next` real se
 * descarta y el paso se queda ahí. Una promesa común no pasa por ningún hook.
 */
export function StepComplejo({ action, geocodeAction, defaultValues, backHref }: Props) {
  const isEdit = defaultValues?.slug !== undefined
  const [screen, setScreen] = useState<'name' | 'place'>('name')
  const [name, setName] = useState(defaultValues?.name ?? '')
  const [nameError, setNameError] = useState<string | null>(null)

  const [place, setPlace] = useState<Place | null>(
    defaultValues && defaultValues.address
      ? {
          address: defaultValues.address,
          city: defaultValues.city,
          province: defaultValues.province,
          latitude: defaultValues.latitude,
          longitude: defaultValues.longitude,
        }
      : null,
  )
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([])
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle')
  const [manual, setManual] = useState(false)
  const [manualAddress, setManualAddress] = useState('')
  const [manualCity, setManualCity] = useState('')
  const [manualProvince, setManualProvince] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()
  const navigate = useWizardNavigation()

  const slug = defaultValues?.slug ?? generateSlug(name)

  function goToPlace() {
    if (name.trim().length < 2) {
      setNameError('Escribí el nombre de tu complejo.')
      return
    }
    setNameError(null)
    setScreen('place')
  }

  async function search() {
    const address = query.trim()
    if (!address) return
    setSearchState('loading')
    setCandidates([])
    const result = await geocodeAction({ address })
    if (!result.success) {
      setSearchState('error')
      return
    }
    // Un candidato sin localidad o provincia no sirve: la búsqueda pública filtra
    // por ciudad exacta, y guardarlo vacío dejaría el complejo infindable.
    // Georef puede repetir la misma dirección (misma etiqueta, otro punto): se
    // muestra una sola vez. También es la clave de la lista.
    const seen = new Set<string>()
    const usable = result.candidates.filter((c) => {
      if (placeFromCandidate(c) === null || seen.has(c.label)) return false
      seen.add(c.label)
      return true
    })
    setCandidates(usable)
    setSearchState(usable.length === 0 ? 'empty' : 'idle')
  }

  function choose(candidate: GeocodeCandidate) {
    const chosen = placeFromCandidate(candidate)
    if (!chosen) return
    setPlace(chosen)
    setCandidates([])
    setSearchState('idle')
    setManual(false)
    setError(null)
  }

  function confirm() {
    setError(null)
    const finalPlace: Place | null = manual
      ? manualAddress.trim() && manualCity.trim() && manualProvince
        ? {
            address: manualAddress.trim(),
            city: manualCity.trim(),
            province: manualProvince,
            latitude: null,
            longitude: null,
          }
        : null
      : place
    if (!finalPlace) {
      setError(
        manual
          ? 'Completá la dirección, la ciudad y la provincia.'
          : 'Buscá tu dirección y elegila de la lista.',
      )
      return
    }

    const formData = new FormData()
    formData.set('name', name.trim())
    formData.set('address', finalPlace.address)
    formData.set('city', finalPlace.city)
    formData.set('province', finalPlace.province)
    formData.set('latitude', finalPlace.latitude === null ? '' : String(finalPlace.latitude))
    formData.set('longitude', finalPlace.longitude === null ? '' : String(finalPlace.longitude))

    startTransition(async () => {
      const result = await action(INITIAL, formData)
      if (!result.success) {
        // Después del await, un set* suelto ya no es parte de la transición.
        startTransition(() => setError(result.error))
        return
      }
      // La navegación la maneja el cliente (ver use-wizard-navigation): acá es donde
      // `hardNavigate` importa, porque la cookie nueva tiene que llegar aplicada.
      if (result.next) navigate(result)
    })
  }

  if (screen === 'name') {
    return (
      <StepScreen
        title="¿Cómo se llama tu complejo?"
        accent="complejo"
        description="Así lo van a ver tus jugadores."
        onNext={goToPlace}
        backHref={backHref}
      >
        <label htmlFor="complejo-name" className="sr-only">
          Nombre del complejo
        </label>
        <Input
          id="complejo-name"
          name="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setNameError(null)
          }}
          placeholder="Ej: Complejo San Martín"
          autoComplete="organization"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={100}
          className={SIGNUP_INPUT_CLASS}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'complejo-name-error' : undefined}
        />
        {nameError && (
          <p
            id="complejo-name-error"
            role="alert"
            className="mt-1.5 text-sm text-red-600 dark:text-red-400"
          >
            {nameError}
          </p>
        )}
        {(isEdit || name.trim().length >= 2) && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              {isEdit ? 'Tu link. No cambia aunque cambies el nombre.' : 'Tu link va a ser:'}
            </p>
            <p className="signup-lit mt-2 flex min-h-11 items-center gap-2 break-all rounded-xl border px-3.5 py-2 text-sm text-slate-200">
              <Link2 className="size-4 shrink-0 text-emerald-300" aria-hidden />
              <span>
                turnogol.app/<strong className="font-semibold text-white">{slug}</strong>
              </span>
            </p>
            {!isEdit && (
              <p className="mt-2 text-xs text-muted-foreground">Después no se puede cambiar.</p>
            )}
          </div>
        )}
      </StepScreen>
    )
  }

  return (
    <StepScreen
      title={name.trim() ? `¿Dónde queda ${name.trim()}?` : '¿Dónde queda?'}
      accent="Dónde queda"
      description={
        manual ? undefined : 'Escribí la calle y la altura, y elegí tu dirección de la lista.'
      }
      nextLabel={isEdit ? 'Guardar' : 'Siguiente'}
      onNext={confirm}
      onBack={() => setScreen('name')}
      isPending={isPending}
      error={error}
      focusHeading
    >
      {manual ? (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="complejo-address"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Dirección
            </label>
            <Input
              id="complejo-address"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              placeholder="Ej: Av. Corrientes 1234"
              autoComplete="address-line1"
            />
          </div>
          <div>
            <label
              htmlFor="complejo-city"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Ciudad
            </label>
            <Input
              id="complejo-city"
              value={manualCity}
              onChange={(e) => setManualCity(e.target.value)}
              placeholder="Ej: Rosario"
              autoComplete="address-level2"
              autoCapitalize="words"
            />
          </div>
          <div>
            <label
              htmlFor="complejo-province"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Provincia
            </label>
            <Combobox
              id="complejo-province"
              options={PROVINCE_OPTIONS}
              value={manualProvince}
              onChange={setManualProvince}
              placeholder="Buscá tu provincia"
              listboxLabel="Provincias"
            />
          </div>
          <Button type="button" variant="ghost" className="-ml-3" onClick={() => setManual(false)}>
            Prefiero buscarla
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {place ? (
            <div className="signup-lit flex items-start gap-3 rounded-xl border p-4">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium text-foreground">{place.address}</p>
                <p className="text-sm text-muted-foreground">
                  {place.city}, {place.province}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPlace(null)}>
                Cambiar
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <label htmlFor="complejo-search" className="sr-only">
                  Buscar dirección
                </label>
                <Input
                  id="complejo-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void search()
                    }
                  }}
                  placeholder="Ej: Av. Corrientes 1234"
                  autoComplete="street-address"
                  enterKeyHint="search"
                  className={`flex-1 ${SIGNUP_INPUT_CLASS}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 md:h-12"
                  onClick={() => void search()}
                  isLoading={searchState === 'loading'}
                  disabled={query.trim().length === 0}
                >
                  <Search className="mr-2 h-4 w-4" aria-hidden />
                  Buscar
                </Button>
              </div>

              <div aria-live="polite">
                {searchState === 'empty' && (
                  <p className="text-sm text-muted-foreground">
                    No la encontramos. Revisá la calle y la altura, o escribila vos.
                  </p>
                )}
                {searchState === 'error' && (
                  <p className="text-sm text-muted-foreground">
                    No pudimos buscar ahora. Podés escribirla vos.
                  </p>
                )}
              </div>

              {candidates.length > 0 && (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {candidates.map((candidate) => (
                    <li key={candidate.label}>
                      <button
                        type="button"
                        onClick={() => choose(candidate)}
                        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-base text-foreground hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                        {candidate.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <Button type="button" variant="ghost" className="-ml-3" onClick={() => setManual(true)}>
            Escribir ciudad y provincia a mano
          </Button>
        </div>
      )}
    </StepScreen>
  )
}
