'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { MapPin, Search } from 'lucide-react'
import { usePointerGlow } from '@/components/world/use-pointer-glow'
import { useHydrated } from '@/hooks/use-client-value'
import { useIpZona } from '@/hooks/use-ip-zona'
import { useNearestCity } from '@/hooks/use-nearest-city'
import { useSavedZona } from '@/hooks/use-saved-zona'
import { markZonaApplied, roundCoord } from '@/lib/zona-storage'
import { cn } from '@/lib/utils'
import type { GeoLocality } from '@/modules/geo/geo.types'
import type { CityCount } from '@/modules/tenants/search.service'
import { formatsLabel } from '@/lib/formats-label'
import {
  CanchaIcon,
  CanchaSheet,
  LocalidadSheet,
  SearchField,
  cityValue,
  geoStatusMessage,
  resolvePlace,
} from './SearchSheets'

export type SearchZona = { city: string; province: string }

type Props = {
  cities: CityCount[]
  /** La localidad que muestra el campo (la ventana de complejos de la home la usa). */
  onZonaChange?: (zona: SearchZona | null) => void
  /** El reflejo que cruza la tarjeta una vez por sesión (dirección §4.5, home). */
  reflejo?: boolean
  className?: string
}

/** Una vez por sesión: el reflejo no se repite al volver a la home. */
const REFLEJO_KEY = 'turnogol:home-reflejo'

/**
 * Buscador del hero de la home, en vidrio (portal de vidrio, F2: `home.html` y las hojas de
 * `buscador.html`). Pide Localidad y Cancha y lleva a /explorar con los filtros en la URL
 * (`city`, `province`, `formats`). Solo fútbol; buscar un club por nombre vive en /explorar.
 *
 * Cada campo abre su hoja (`SearchSheets`, las mismas que usa /explorar).
 *
 * La localidad sale, en este orden, de lo elegido en esta visita, la zona guardada en el
 * dispositivo (`useSavedZona`), la zona de la conexión (`useIpZona`, que nunca se guarda) y, si no
 * hay nada, queda vacía. La zona se guarda al elegir una localidad a mano o con "Usar mi ubicación
 * actual" (la localidad real del jugador, con precisión de localidad); de ahí en más no se vuelve a
 * pedir nada. Vale cualquier localidad del país, tenga o no complejos: /explorar muestra los más
 * cercanos cuando no hay.
 */
export default function HeroSearch({ cities, onZonaChange, reflejo = false, className }: Props) {
  const router = useRouter()
  // `null` = el usuario no eligió nada en esta visita: manda la zona. Un string (aun vacío,
  // "Todas las ciudades") es una elección explícita y gana siempre. Derivado en el render y no
  // sincronizado con un efecto: no hay parpadeo ni setState encadenado.
  const [pickedCity, setPickedCity] = useState<string | null>(null)
  // Las coordenadas (a ~1 km) de la localidad elegida a mano, si la lista las trae.
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [formats, setFormats] = useState<number[]>([])
  const [sheet, setSheet] = useState<'localidad' | 'cancha' | null>(null)
  const [shine, setShine] = useState(false)

  const [zona, saveZona] = useSavedZona()
  const { state: geo, locate, cancel } = useNearestCity()
  const hydrated = useHydrated()
  const zonaCity = resolvePlace(cities, zona)
  // La zona de la conexión se pide solo sin una guardada (un pedido por carga de página).
  const ipZona = useIpZona(hydrated && !zona?.city)
  const ipCity = zonaCity ? undefined : resolvePlace(cities, ipZona)

  const city = pickedCity ?? (zonaCity ? cityValue(zonaCity) : ipCity ? cityValue(ipCity) : '')
  const [cityName = '', provinceName = ''] = city.split('||')
  const usingZona = zonaCity !== undefined && city === cityValue(zonaCity)
  const usingIp = !usingZona && ipCity !== undefined && city === cityValue(ipCity)

  useEffect(() => {
    onZonaChange?.(cityName ? { city: cityName, province: provinceName } : null)
  }, [cityName, provinceName, onZonaChange])

  useEffect(() => {
    if (!reflejo) return
    try {
      if (sessionStorage.getItem(REFLEJO_KEY)) return
      sessionStorage.setItem(REFLEJO_KEY, '1')
    } catch {
      // Storage bloqueado: el reflejo sale igual, una vez por carga.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dato del navegador, una vez al montar
    setShine(true)
  }, [reflejo])

  // Abrir la hoja congela lo que se ve: si la zona (o una ubicación detectada) llega cuando el
  // jugador ya está eligiendo, no le cambia el valor debajo de los dedos.
  function openLocalidad() {
    if (pickedCity === null) setPickedCity(city)
    setSheet('localidad')
  }

  // Tocar el botón es pedir la ubicación de nuevo: vuelve a mandar lo que se detecte.
  function onLocate() {
    setPickedCity(null)
    setPickedCoords(null)
    locate()
  }

  function onCityChange(value: string, locality?: GeoLocality) {
    setPickedCity(value)
    const coords =
      locality?.lat != null && locality.lng != null
        ? { lat: roundCoord(locality.lat), lng: roundCoord(locality.lng) }
        : null
    setPickedCoords(coords)
    // Elegir a mano gana sobre una ubicación que todavía esté en camino.
    cancel()
    // Elegir una localidad a mano también fija la zona. "Todas las ciudades" NO la borra: solo
    // vale para esta búsqueda.
    if (value) {
      const [cityPart, provincePart] = value.split('||')
      if (cityPart) saveZona({ city: cityPart, province: provincePart, ...coords })
    }
    setSheet(null)
  }

  function search() {
    // Buscar sin localidad es pedir "todas": que /explorar no se la reemplace por la zona guardada.
    if (!city) markZonaApplied()
    const params = new URLSearchParams()
    if (city) {
      const [cityPart, provincePart] = city.split('||')
      if (cityPart) params.set('city', cityPart)
      if (provincePart) params.set('province', provincePart)
      // Sin complejos en la localidad, /explorar ordena los más cercanos desde estas coordenadas.
      const coords = pickedCoords ?? (usingZona && zona?.lat != null ? zona : null)
      if (coords?.lat != null && coords.lng != null) {
        params.set('lat', String(coords.lat))
        params.set('lng', String(coords.lng))
      }
    }
    if (formats.length) params.set('formats', formats.join(','))
    const qs = params.toString()
    setSheet(null)
    router.push(qs ? `/explorar?${qs}` : '/explorar')
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    search()
  }

  const ipMessage = usingIp
    ? `Te mostramos ${cityName} por la zona desde donde te conectás. La que elijas queda guardada para la próxima.`
    : ''
  const geoMessage = geoStatusMessage(geo.status, usingZona) || ipMessage
  // Con la zona ya guardada, o con la ubicación bloqueada/no soportada, el botón no tiene qué hacer.
  const canLocate = !usingZona && geo.status !== 'denied' && geo.status !== 'unsupported'
  const locating = geo.status === 'locating'

  // El campo cerrado tiene lugar para una palabra en el celu (~80 px): "Todas las ciudades" y
  // "Cualquier tamaño" se cortaban. Las opciones de las hojas conservan el nombre largo.
  const localidadValue = cityName || (pickedCity === '' ? 'Todas' : null)
  const canchaValue = formatsLabel(formats) ?? 'Todas'
  const glow = usePointerGlow<HTMLFormElement>()

  return (
    <>
      <form
        ref={glow}
        onSubmit={onSubmit}
        aria-label="Buscar canchas de fútbol"
        data-shine={shine ? '' : undefined}
        className={cn(
          'hero-search glass glow-follow relative grid w-full grid-cols-2 gap-2 rounded-[32px] p-2 text-left font-display md:grid-cols-[1fr_1fr_auto] md:rounded-full',
          className,
        )}
      >
        <span aria-hidden className="hero-search__shine" />
        <SearchField
          label="Zona"
          value={localidadValue}
          placeholder="¿Dónde?"
          icon={<MapPin aria-hidden />}
          onClick={openLocalidad}
        />
        <SearchField
          label="Cancha"
          value={canchaValue}
          icon={<CanchaIcon />}
          onClick={() => setSheet('cancha')}
          divided
        />
        <button
          type="submit"
          className="relative col-span-2 inline-flex h-14 items-center justify-center rounded-full bg-linear-to-b from-(--portal-btn-a) to-(--portal-btn-b) px-14 text-[17px] font-semibold whitespace-nowrap text-portal-on-green shadow-[inset_0_1px_0_rgb(255_255_255/.45),0_14px_30px_-12px_var(--portal-btn-glow)] transition-[scale,filter] duration-480 ease-(--ease-toque) hover:brightness-106 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-portal-green active:scale-[.985] active:duration-(--dur-1) motion-reduce:active:scale-100 md:col-span-1 md:h-15 md:pr-[62px] md:pl-7"
        >
          Ver horarios libres
          <span
            aria-hidden
            className="absolute top-2 right-2 grid size-10 place-items-center rounded-full bg-[rgb(2_44_34/.18)] shadow-[inset_0_1px_0_rgb(255_255_255/.28)] md:top-2.5 md:right-2.5"
          >
            <Search className="size-5" strokeWidth={2.4} />
          </span>
        </button>
      </form>

      <LocalidadSheet
        open={sheet === 'localidad'}
        onClose={() => setSheet(null)}
        cities={cities}
        city={city}
        onCityChange={onCityChange}
        message={geoMessage}
        canLocate={canLocate}
        locating={locating}
        onLocate={onLocate}
      />
      <CanchaSheet
        open={sheet === 'cancha'}
        onClose={() => setSheet(null)}
        formats={formats}
        onFormatsChange={setFormats}
        onSubmit={search}
      />
    </>
  )
}
