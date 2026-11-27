'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import {
  CanchaIcon,
  CanchaSheet,
  LocalidadSheet,
  SearchField,
  cityValue,
  geoStatusMessage,
  resolvePlace,
} from '@/components/site/SearchSheets'
import { useNearestCity } from '@/hooks/use-nearest-city'
import { useSavedZona } from '@/hooks/use-saved-zona'
import { formatsLabel } from '@/lib/formats-label'
import { markZonaApplied, roundCoord, wasZonaApplied } from '@/lib/zona-storage'
import type { GeoLocality } from '@/modules/geo/geo.types'
import type { CityCount } from '@/modules/tenants/search.service'
import { buildExplorarUrl } from './url'

type Props = {
  cities: CityCount[]
  /** Los tamaños de cada complejo de la localidad elegida (`listPublicFormatSets`). */
  formatSets: number[][]
  /** La localidad de la URL no tiene complejos y se muestran los más cercanos: los tamaños no son de ella. */
  nearby?: boolean
}

function formatsFrom(raw: string | null): number[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b)
}

/**
 * La barra de /explorar (portal de vidrio, F3: `buscador.html`): Localidad y Cancha, con las
 * mismas hojas que el buscador de la home. Todo vive en la URL (`city`, `province`, `formats`,
 * `q`): elegir una localidad navega en el acto, y la hoja de Cancha navega con "Ver N complejos".
 * Buscar un complejo por nombre vive en la hoja de Localidad (decisión de Lazar, 2026-11-14).
 */
export default function ExplorarSearch({ cities, formatSets, nearby = false }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const paramsKey = params.toString()
  const urlCity = params.get('city') ?? ''
  const urlProvince = params.get('province') ?? ''
  const urlFormats = formatsFrom(params.get('formats'))

  const [sheet, setSheet] = useState<'localidad' | 'cancha' | null>(null)
  // Lo que se va marcando en la hoja de Cancha; se copia de la URL al abrirla.
  const [formats, setFormats] = useState<number[]>(urlFormats)
  const [wantsLocation, setWantsLocation] = useState(false)

  const [zona] = useSavedZona()
  const { state: geo, locate, cancel } = useNearestCity()

  const current = resolvePlace(cities, { city: urlCity, province: urlProvince })
  const city = current ? cityValue(current) : ''
  const zonaCity = resolvePlace(cities, zona)
  const usingZona = zonaCity !== undefined && city === cityValue(zonaCity)

  // Entrar a /explorar sin ningún filtro arranca en la zona guardada del jugador (la que dejó la
  // home o "Usar mi ubicación"): no vuelve a pedirle nada. Una sola vez por pestaña: entrar CON
  // filtros ya cuenta como "aplicada", así que después quitar la ciudad deja la URL pelada y NO se
  // le vuelve a imponer la zona. Es un efecto (y no un redirect del server) porque la zona vive en
  // el dispositivo.
  const zonaName = zona?.city
  const zonaProvince = zona?.province
  const zonaLat = zona?.lat
  const zonaLng = zona?.lng
  useEffect(() => {
    if (paramsKey !== '') {
      markZonaApplied()
      return
    }
    if (!zonaName || wasZonaApplied()) return
    markZonaApplied()
    router.replace(
      buildExplorarUrl(new URLSearchParams(), {
        city: zonaName,
        province: zonaProvince,
        lat: zonaLat === undefined ? undefined : String(zonaLat),
        lng: zonaLng === undefined ? undefined : String(zonaLng),
      }),
    )
  }, [zonaName, zonaProvince, zonaLat, zonaLng, paramsKey, router])

  function go(updates: Record<string, string | undefined>) {
    setSheet(null)
    router.push(buildExplorarUrl(params, updates))
  }

  function onCityChange(value: string, locality?: GeoLocality) {
    cancel()
    setWantsLocation(false)
    const [cityPart, provincePart] = value.split('||')
    // "Todas las ciudades" no borra la zona guardada: solo vale para esta búsqueda.
    if (!value) markZonaApplied()
    // Elegir una localidad suelta el nombre buscado (si no, la lista queda filtrada sin que se vea)
    // y las coordenadas de un link viejo, que eran de otro lugar. Una localidad sin complejos trae
    // las suyas: con ellas la página muestra los complejos más cercanos.
    go({
      city: cityPart || undefined,
      province: provincePart || undefined,
      q: undefined,
      lat: locality?.lat != null ? String(roundCoord(locality.lat)) : undefined,
      lng: locality?.lng != null ? String(roundCoord(locality.lng)) : undefined,
    })
  }

  // "Usar mi ubicación actual": cuando llega la localidad, la búsqueda se va para allá.
  const found = wantsLocation && geo.status === 'found' ? geo : null
  useEffect(() => {
    if (!found) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se consume una sola vez
    setWantsLocation(false)
    setSheet(null)
    router.push(
      buildExplorarUrl(params, {
        city: found.city,
        province: found.province,
        q: undefined,
        lat: String(found.lat),
        lng: String(found.lng),
      }),
    )
  }, [found, params, router])

  const message = geoStatusMessage(geo.status, usingZona)
  const canLocate = !usingZona && geo.status !== 'denied' && geo.status !== 'unsupported'

  return (
    <>
      <div
        role="search"
        aria-label="Filtrar canchas"
        className="glass grid w-full grid-cols-2 gap-2 rounded-[32px] p-2 font-display md:w-[min(100%,560px)] md:rounded-full"
      >
        <SearchField
          label="Zona"
          value={urlCity || 'Todas'}
          icon={<MapPin aria-hidden />}
          onClick={() => setSheet('localidad')}
        />
        <SearchField
          label="Cancha"
          value={formatsLabel(urlFormats) ?? 'Todas'}
          icon={<CanchaIcon />}
          onClick={() => {
            setFormats(urlFormats)
            setSheet('cancha')
          }}
          divided
        />
      </div>

      <LocalidadSheet
        open={sheet === 'localidad'}
        onClose={() => {
          // Cerrar la hoja descarta la ubicación en camino: no navega sola después.
          cancel()
          setWantsLocation(false)
          setSheet(null)
        }}
        cities={cities}
        city={city}
        onCityChange={onCityChange}
        message={message}
        canLocate={canLocate}
        locating={geo.status === 'locating'}
        onLocate={() => {
          setWantsLocation(true)
          locate()
        }}
        // Un complejo se busca por nombre en todas las localidades: si no, uno de otra ciudad da 0.
        onNameSearch={(name) => go({ q: name, city: undefined, province: undefined })}
      />
      <CanchaSheet
        open={sheet === 'cancha'}
        onClose={() => setSheet(null)}
        formats={formats}
        onFormatsChange={setFormats}
        onSubmit={() => go({ formats: formats.length ? formats.join(',') : undefined })}
        formatSets={formatSets}
        place={nearby ? undefined : urlCity || undefined}
      />
    </>
  )
}
