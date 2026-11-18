'use client'

import { useEffect, useState, type KeyboardEvent } from 'react'
import { LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Combobox from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { normalizeForSearch } from '@/lib/search'
import { cn } from '@/lib/utils'
import type { GeoLocality } from '@/modules/geo/geo.types'
import { PROVINCES } from '@/shared/geo/argentina'
import { CURRENT_PLACE_MESSAGES, useCurrentPlace } from './use-current-place'
import { useLocalitySearch } from './use-locality-search'

const PROVINCE_OPTIONS = PROVINCES.map((p) => ({ value: p, label: p }))

/** Base del input: 16 px en mobile (abajo de eso iOS hace zoom) y 44 px de alto. */
const INPUT_BASE = 'h-11 text-base md:text-sm'

function localityLabel(l: GeoLocality): string {
  return `${l.city}, ${l.province}`
}

/** El partido/departamento se muestra salvo que repita el nombre de la localidad. */
function optionHint(l: GeoLocality): string {
  const dept = l.department?.trim()
  if (!dept || normalizeForSearch(dept) === normalizeForSearch(l.city)) return l.province
  return `${l.province} · ${dept}`
}

/** Última fila de la lista: la salida cuando la localidad no figura entre los resultados. */
const MANUAL_OPTION: GeoLocality = {
  city: '',
  province: '',
  lat: null,
  lng: null,
  source: 'manual',
}

type Props = {
  id: string
  value: GeoLocality | null
  onChange: (value: GeoLocality | null) => void
  label?: string
  placeholder?: string
  inputClassName?: string
  listClassName?: string
  /** Muestra "Usar mi ubicación actual" (default true). */
  locate?: boolean
  /**
   * `icon`: el botón de ubicación va al lado del campo, sin fila propia (para tarjetas con poco
   * alto, como la de RIVAL). `button` (default): una fila debajo con el texto completo.
   */
  locateStyle?: 'button' | 'icon'
  autoFocus?: boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/**
 * Buscador de localidad de todo el país. Patrón combobox ARIA 1.2 (como
 * `ui/combobox`) pero con opciones asíncronas. Siempre queda una salida:
 * si no la encuentra o no se pudo buscar, se escribe a mano.
 */
export default function LocalityPicker({
  id,
  value,
  onChange,
  label,
  placeholder = 'Escribí tu localidad',
  inputClassName,
  listClassName,
  locate = true,
  locateStyle = 'button',
  autoFocus,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: Props) {
  // null = sin edición en curso: el input muestra la localidad elegida.
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [manual, setManual] = useState(value?.source === 'manual')
  const [manualCity, setManualCity] = useState(value?.source === 'manual' ? value.city : '')
  const [manualProvince, setManualProvince] = useState(
    value?.source === 'manual' ? value.province : '',
  )
  const { results, status } = useLocalitySearch(query ?? '')
  const place = useCurrentPlace('locality')

  const listboxId = `${id}-listbox`
  const typing = query !== null && normalizeForSearch(query).length >= 2
  const showList = open && results.length > 0
  const options = results.length > 0 ? [...results, MANUAL_OPTION] : results
  const active = showList ? options[Math.min(activeIndex, options.length - 1)] : undefined
  const activeId = active ? `${id}-option-${options.indexOf(active)}` : undefined
  const inputText = query ?? (value ? localityLabel(value) : '')

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

  function close() {
    setOpen(false)
  }

  function startManual() {
    setManual(true)
    setManualCity(query?.trim() ?? '')
    setManualProvince('')
    setQuery(null)
    close()
  }

  function select(locality: GeoLocality) {
    if (locality === MANUAL_OPTION) {
      startManual()
      return
    }
    onChange(locality)
    setQuery(null)
    close()
  }

  function revertAndClose() {
    setQuery(null)
    close()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) setOpen(true)
        else if (options.length > 0) setActiveIndex((i) => (i + 1) % options.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!open) setOpen(true)
        else if (options.length > 0) setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1))
        break
      case 'Enter':
        // Con algo escrito, Enter nunca envía el form: elige la opción activa o no hace nada.
        if (open || query !== null) {
          e.preventDefault()
          if (active) select(active)
        }
        break
      case 'Escape':
        if (open) {
          e.preventDefault()
          e.stopPropagation()
          revertAndClose()
        }
        break
      case 'Tab':
        close()
        break
    }
  }

  const noResults = typing && status === 'done' && results.length === 0
  const failed = typing && (status === 'degraded' || status === 'error')
  function onBlur() {
    if (query !== null && normalizeForSearch(query) === '') onChange(null)
    // Sin resultados o sin servicio, el texto queda: el botón "Escribirla a mano" tiene que
    // seguir ahí cuando el foco pasa a él (Tab o toque), si no desaparece antes del click.
    if (noResults || failed) {
      close()
      return
    }
    revertAndClose()
  }

  function changeManual(city: string, province: string) {
    setManualCity(city)
    setManualProvince(province)
    const cleanCity = city.trim()
    if (cleanCity && province) {
      onChange({ city: cleanCity, province, lat: null, lng: null, source: 'manual' })
    } else if (value?.source === 'manual') {
      onChange(null)
    }
  }

  function useMyLocation() {
    place.locate((found) => {
      setQuery(null)
      setManual(false)
      onChange({
        city: found.city,
        province: found.province,
        department: found.department,
        lat: found.lat,
        lng: found.lng,
        source: 'dataset',
      })
    })
  }

  const placeFailure =
    place.state.status !== 'idle' &&
    place.state.status !== 'locating' &&
    place.state.status !== 'found'
      ? CURRENT_PLACE_MESSAGES[place.state.status]
      : null

  return (
    <div>
      {manual ? (
        <div className="space-y-3">
          <div>
            <label htmlFor={`${id}-manual-city`} className="mb-1.5 block text-sm font-medium">
              Ciudad
            </label>
            <Input
              id={`${id}-manual-city`}
              value={manualCity}
              autoComplete="off"
              enterKeyHint="next"
              autoFocus
              aria-invalid={ariaInvalid}
              aria-describedby={ariaDescribedBy}
              className={cn(INPUT_BASE, inputClassName)}
              onChange={(e) => changeManual(e.target.value, manualProvince)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
          </div>
          <div>
            <label htmlFor={`${id}-manual-province`} className="mb-1.5 block text-sm font-medium">
              Provincia
            </label>
            <Combobox
              id={`${id}-manual-province`}
              options={PROVINCE_OPTIONS}
              value={manualProvince}
              onChange={(p) => changeManual(manualCity, p)}
              placeholder="Elegí tu provincia"
              listboxLabel="Provincias"
              inputClassName={cn(INPUT_BASE, 'w-full rounded-lg border px-3.5', inputClassName)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 min-h-11"
            onClick={() => {
              setManual(false)
              if (value?.source === 'manual') onChange(null)
            }}
          >
            Volver a buscar
          </Button>
        </div>
      ) : (
        <>
          {label && (
            <label htmlFor={id} className="mb-2 block text-sm font-medium text-foreground">
              {label}
            </label>
          )}
          <Popover
            open={showList}
            onOpenChange={(next) => {
              if (!next) close()
            }}
          >
            <div className="flex items-start gap-2">
              <PopoverAnchor asChild>
                <div className="relative min-w-0 flex-1">
                  <Input
                    id={id}
                    role="combobox"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus={autoFocus}
                    enterKeyHint="search"
                    aria-expanded={showList}
                    aria-controls={showList ? listboxId : undefined}
                    aria-autocomplete="list"
                    aria-activedescendant={activeId}
                    aria-label={label ? undefined : (placeholder ?? 'Localidad')}
                    aria-invalid={ariaInvalid}
                    aria-describedby={ariaDescribedBy}
                    value={inputText}
                    placeholder={placeholder}
                    className={cn(INPUT_BASE, inputClassName)}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setOpen(true)
                      setActiveIndex(0)
                    }}
                    onKeyDown={onKeyDown}
                    onBlur={onBlur}
                  />
                </div>
              </PopoverAnchor>
              {locate && locateStyle === 'icon' && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-12 shrink-0"
                  aria-label="Usar mi ubicación actual"
                  title="Usar mi ubicación actual"
                  onClick={useMyLocation}
                  isLoading={place.state.status === 'locating'}
                >
                  <LocateFixed className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </div>
            <PopoverContent
              align="start"
              sideOffset={6}
              aria-label="Localidades"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                if ((e.target as HTMLElement | null)?.id === id) e.preventDefault()
              }}
              className={cn(
                'z-50 w-(--radix-popover-trigger-width) max-h-60 overflow-auto rounded-xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-md',
                listClassName,
              )}
            >
              <ul
                id={listboxId}
                role="listbox"
                aria-label="Localidades"
                tabIndex={0}
                onMouseDown={(e) => e.preventDefault()}
              >
                {options.map((r, i) => (
                  <li
                    key={`${r.city}|${r.province}|${r.department ?? ''}|${i}`}
                    id={`${id}-option-${i}`}
                    role="option"
                    aria-selected={r === active}
                    onMouseDown={(e) => {
                      if (e.button === 0) select(r)
                    }}
                    onClick={() => select(r)}
                    onMouseMove={() => {
                      if (activeIndex !== i) setActiveIndex(i)
                    }}
                    className={cn(
                      'flex min-h-11 cursor-pointer select-none flex-col justify-center rounded-lg px-2.5 py-1.5 outline-hidden md:min-h-0',
                      r === active ? 'bg-accent text-accent-foreground' : 'text-foreground/90',
                    )}
                  >
                    {r === MANUAL_OPTION ? (
                      <>
                        <span className="truncate text-base md:text-sm">No está mi localidad</span>
                        <span className="truncate text-xs text-muted-foreground">
                          Escribirla a mano
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="truncate text-base md:text-sm">{r.city}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {optionHint(r)}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>

          {/* El espacio va en cada mensaje (`mt-2`), no en la raíz: una región vacía no ocupa lugar. */}
          <div aria-live="polite" className="text-sm text-muted-foreground">
            <span className="sr-only">
              {showList
                ? `${results.length} ${results.length === 1 ? 'localidad disponible' : 'localidades disponibles'}`
                : ''}
            </span>
            {typing && status === 'loading' && <p className="mt-2">Buscando…</p>}
            {noResults && <p className="mt-2">No encontramos esa localidad.</p>}
            {failed && <p className="mt-2">No pudimos buscar ahora. Podés escribirla a mano.</p>}
          </div>

          {(noResults || failed) && (
            <Button
              type="button"
              variant="outline"
              className="mt-2 min-h-11 w-full"
              onClick={startManual}
            >
              Escribirla a mano
            </Button>
          )}

          {locate && locateStyle === 'button' && (
            <Button
              type="button"
              variant="ghost"
              className="-ml-3 mt-2 min-h-11"
              onClick={useMyLocation}
              isLoading={place.state.status === 'locating'}
            >
              <LocateFixed className="mr-2 h-4 w-4" aria-hidden />
              Usar mi ubicación actual
            </Button>
          )}
          <div aria-live="polite" className="text-sm text-muted-foreground">
            {placeFailure && <p className="mt-2">{placeFailure}</p>}
          </div>
        </>
      )}
    </div>
  )
}
