'use client'

import { useEffect, useRef, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Bell, X } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { fetchWithTimeout, withTimeout } from '@/shared/utils/async'
import {
  disableCurrentPush,
  PUSH_IDENTITY_KEY,
  syncPushSubscription,
  type PushDeviceActions,
} from './push-browser'

type Status =
  'idle' | 'unsupported' | 'install_required' | 'denied' | 'unsubscribed' | 'subscribed' | 'pending'

const SW_PATH = '/sw.js'
// Scope '/' y no '/admin/': `(admin)` es un route GROUP de Next, así que las URLs
// reales son `/grilla`, `/caja`, `/dashboard` — ninguna empieza con `/admin/`.
// Con el scope viejo el worker no controlaba NINGUNA página: la suscripción push
// funcionaba igual (vive en la registration), pero `clients.matchAll()` en el
// handler `notificationclick` de `public/sw.js` operaba sobre un conjunto vacío,
// así que tocar una notificación abría siempre una ventana nueva en vez de
// enfocar la pestaña abierta, y el BroadcastChannel de dedupe nunca llegaba a
// ninguna página (el toast in-app caía siempre al fallback nativo).
// Ampliar el scope es seguro: `sw.js` NO tiene handler de `fetch` a propósito
// (el realtime de la grilla depende de fetch directo), así que no intercepta red.
const SW_SCOPE = '/'
const SOUND_ENABLED_KEY = 'turnogol:notif-sound'
// ENS-11: descartar el banner lo desmonta (no lo oculta) por esta ventana,
// para que un click real en un botón debajo no lo vuelva a interceptar.
const DISMISS_KEY = 'turnogol:notif-banner-dismissed-at'
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000
// Safety deadline for the non-abortable service worker activation step so the
// "Habilitando…" button can never hang forever.
const SW_READY_TIMEOUT_MS = 10_000

function isDismissedRecently(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const dismissedAt = Number(raw)
    if (!Number.isFinite(dismissedAt)) return false
    const now = Date.now()
    // R3-3: un timestamp en el futuro (reloj del cliente corrido, o el valor
    // de localStorage manipulado a mano) da `now - dismissedAt` negativo, que
    // siempre es < DISMISS_DURATION_MS — el banner quedaría descartado para
    // SIEMPRE en vez de por la ventana de 7 días. Se trata como inválido.
    if (dismissedAt > now) return false
    return now - dismissedAt < DISMISS_DURATION_MS
  } catch {
    return false
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData =
    typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary')
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr
}

async function fetchVapidKey(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout('/api/admin/push/vapid', { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { publicKey?: unknown }
    return typeof data.publicKey === 'string' ? data.publicKey : null
  } catch {
    return null
  }
}

type Props = { settings?: boolean; identityKey?: string; actions?: PushDeviceActions }

export function PushNotificationManager({ settings = false, identityKey, actions }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissedRecently())
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const bcRef = useRef<BroadcastChannel | null>(null)
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [testing, setTesting] = useState(false)
  const stopped = useRef(false)

  // Revalidar también al volver a la PWA: permiso local y fila del servidor son cosas distintas.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const iphone =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const installed =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone
    if (iphone && !installed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('install_required')
      return
    }
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      // Detección de capacidades del browser: corre una vez al montar y no
      // encadena renders (el efecto tiene deps vacías y no lee `status`). No es
      // candidato a useClientValue porque `status` es una máquina de estados
      // que después escriben el alta/baja de suscripción y el listener del SW —
      // derivarlo dejaría dos fuentes de verdad para el mismo valor.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('unsupported')
      return
    }
    stopped.current = false
    let syncing = false
    const sync = async () => {
      if (syncing || stopped.current) return
      syncing = true
      try {
        const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE)
        // update() actualiza también instalaciones de antes del arreglo de userVisibleOnly.
        if (reg?.update) void reg.update().catch(() => {})
        if (Notification.permission === 'denied') {
          await disableCurrentPush(actions).catch(() => {})
          if (!stopped.current) setStatus('denied')
        } else if (Notification.permission !== 'granted') {
          if (!stopped.current) setStatus('unsubscribed')
        } else {
          const sub = await reg?.pushManager.getSubscription()
          let previous: string | null = null
          try {
            previous = localStorage.getItem(PUSH_IDENTITY_KEY)
          } catch {
            /* Storage bloqueado. */
          }
          if (sub && identityKey && previous && previous !== identityKey) {
            await disableCurrentPush(actions)
            if (!stopped.current) setStatus('unsubscribed')
          } else {
            const id = sub ? await syncPushSubscription(sub, actions) : null
            if (stopped.current) return
            setSubscriptionId(id)
            setStatus(id ? 'subscribed' : 'unsubscribed')
            if (id && identityKey) {
              try {
                localStorage.setItem(PUSH_IDENTITY_KEY, identityKey)
              } catch {
                /* Storage bloqueado. */
              }
            }
          }
        }
      } catch {
        if (!stopped.current) setStatus('unsubscribed')
      } finally {
        syncing = false
      }
    }
    const visible = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    const signout = () => {
      stopped.current = true
    }
    void sync()
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('turnogol:push-signout', signout)
    return () => {
      stopped.current = true
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('turnogol:push-signout', signout)
    }
  }, [identityKey, actions])

  // Multi-tab dedupe listener: when SW receives push, it broadcasts {id} on
  // the channel. The first tab to ack {id, ack:true} wins and shows the toast
  // + plays sound. Other tabs hear our ack and stay quiet. If no tabs ack,
  // the SW falls back to native showNotification.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel('notif-dedupe')
    bcRef.current = bc
    const seen = new Set<string>()
    bc.onmessage = async (msg) => {
      const data = (msg.data || {}) as {
        id?: string
        ack?: boolean
        nativeDisplayed?: boolean
        title?: string
        body?: string
        courtName?: string
        dateLabel?: string
        timeLabel?: string
        summaryLabel?: string
        url?: string
        type?: string
      }
      if (!data.id || data.ack || data.nativeDisplayed) return
      if (seen.has(data.id)) return
      seen.add(data.id)
      // Claim the show: ack first, then render.
      bc.postMessage({ id: data.id, ack: true })
      // Render payload-specific toast: title=courtName, description=date+time.
      // SW broadcasts include courtName/dateLabel/timeLabel from the push payload.
      // daily_summary (D8, Fase 2): resumen diario, no una reserva nueva.
      // Los tipos nuevos traen `title`/`body` del servidor y mandan; el resto de
      // la cadena es para payloads viejos (mismo criterio que public/sw.js).
      const isDailySummary = data.type === 'daily_summary'
      const isMpDisconnected = data.type === 'mp_disconnected'
      const title =
        data.title ||
        (isMpDisconnected
          ? 'MercadoPago se desconectó'
          : isDailySummary
            ? 'Resumen de ayer'
            : data.courtName
              ? `Nueva reserva — ${data.courtName}`
              : 'Nueva reserva')
      const description =
        typeof data.body === 'string'
          ? data.body
          : isMpDisconnected
            ? 'Las reservas online entran sin seña hasta que se reconecte.'
            : isDailySummary
              ? data.summaryLabel || ''
              : [data.dateLabel, data.timeLabel].filter(Boolean).join(' · ') ||
                'Tenés una nueva reserva confirmada en la grilla.'
      // Verde = buena noticia (reserva nueva, resumen). Una cancelación o un aviso
      // de plan no lo son: van con el estilo neutro.
      const isNeutral =
        data.type === 'booking.canceled_by_player' || data.type?.startsWith('plan.') === true
      toast({
        title,
        description,
        variant: isNeutral ? 'default' : 'success',
      })
      try {
        if (localStorage.getItem(SOUND_ENABLED_KEY) === '1' && audioRef.current) {
          audioRef.current.currentTime = 0
          await audioRef.current.play()
        }
      } catch {
        /* user-gesture restriction or audio not loaded */
      }
    }
    return () => {
      bc.close()
      bcRef.current = null
    }
  }, [])

  async function enable() {
    if (typeof window === 'undefined') return
    setStatus('pending')
    try {
      // requestPermission() is NOT abortable and can stay pending forever if the
      // user ignores or dismisses the prompt. Bound it so the button can recover.
      const permission = await withTimeout(
        Notification.requestPermission(),
        SW_READY_TIMEOUT_MS,
        'No respondiste al pedido de permiso',
      )
      if (permission !== 'granted') {
        // 'denied' (blocked) and 'default' (dismissed/timed out) both land here;
        // only a true block should hide the button permanently.
        setStatus(permission === 'denied' ? 'denied' : 'unsubscribed')
        return
      }
      // User gesture present: enable sound playback for future broadcasts.
      try {
        localStorage.setItem(SOUND_ENABLED_KEY, '1')
      } catch {
        /* noop */
      }
      // Preload audio so play() works without further gestures.
      if (audioRef.current) {
        try {
          await audioRef.current.play()
          audioRef.current.pause()
        } catch {
          /* noop */
        }
      }
      const reg = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE })
      // Esperar a que el service worker se active.
      // Primero intentamos esperar usando la registración retornada por register (más robusto ante páginas
      // fuera del scope como /onboarding). Si reg no está definido (ej. en mocks de tests), caemos
      // en navigator.serviceWorker.ready.
      const ready = await withTimeout(
        (async () => {
          if (reg) {
            if (reg.active) return reg
            const worker = reg.installing || reg.waiting
            if (worker) {
              await new Promise<void>((resolve) => {
                const listener = () => {
                  if (worker.state === 'activated' || reg.active) {
                    worker.removeEventListener('statechange', listener)
                    resolve()
                  }
                }
                worker.addEventListener('statechange', listener)
              })
              return reg
            }
          }
          return navigator.serviceWorker.ready
        })(),
        SW_READY_TIMEOUT_MS,
        'El service worker no se activó',
      )
      const vapidKey = await fetchVapidKey()
      if (!vapidKey) {
        setStatus('unsubscribed')
        toast({
          title: 'No pudimos habilitar notificaciones',
          description: 'Falta la clave del servidor.',
          variant: 'destructive',
        })
        return
      }
      const sub = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })
      const id = await syncPushSubscription(sub, actions)
      if (!id) {
        // La suscripción puede pertenecer a una sesión anterior: no apropiársela.
        await sub.unsubscribe()
        setStatus('unsubscribed')
        toast({
          title: 'No pudimos guardar tu suscripción',
          description: 'Intentá de nuevo.',
          variant: 'destructive',
        })
        return
      }
      setSubscriptionId(id)
      if (identityKey) {
        try {
          localStorage.setItem(PUSH_IDENTITY_KEY, identityKey)
        } catch {
          /* Storage bloqueado. */
        }
      }
      setStatus('subscribed')
      toast({
        title: 'Notificaciones habilitadas',
        description: 'Vas a recibir un aviso cuando llegue una reserva.',
        variant: 'success',
      })
    } catch (e) {
      setStatus('unsubscribed')
      Sentry.captureException(e)
      toast({
        title: 'No pudimos habilitar notificaciones',
        description:
          'No pudimos activar las notificaciones en este dispositivo. Probá de nuevo o revisá los permisos del navegador.',
        variant: 'destructive',
      })
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* noop */
    }
    setDismissed(true)
  }

  async function disable() {
    setStatus('pending')
    try {
      await disableCurrentPush(actions)
      setSubscriptionId(null)
      setStatus('unsubscribed')
      setMessage('Desactivadas en este dispositivo.')
    } catch {
      setStatus('unsubscribed')
      setMessage('Revisá los permisos del dispositivo y volvé a comprobar.')
    }
  }

  async function testDevice() {
    if (!actions || !subscriptionId) return
    setTesting(true)
    setMessage('Enviando la prueba a este dispositivo…')
    try {
      const since = Date.now()
      const result = await actions.test(subscriptionId)
      if (!result.success) {
        setMessage(result.error)
        return
      }
      setMessage('Prueba encolada. Bloqueá la pantalla y esperá la notificación.')
      // El outbox recuperable barre cada minuto; dar tiempo a un tick completo.
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        if (stopped.current) return
        const state = await actions.status(subscriptionId, result.notificationId)
        if (!state.success) {
          setMessage(state.error)
          return
        }
        if (state.openedAt && new Date(state.openedAt).getTime() >= since) {
          setMessage(
            result.notificationId
              ? 'Abriste la notificación de prueba en este dispositivo.'
              : 'Abriste una notificación en este dispositivo. Comprobá que sea la prueba.',
          )
          return
        }
        if (state.processedAt && new Date(state.processedAt).getTime() >= since) {
          setMessage(
            result.notificationId
              ? 'El dispositivo procesó la prueba. Revisá el centro de notificaciones.'
              : 'El dispositivo procesó un aviso. Revisá la prueba en el centro de notificaciones.',
          )
          return
        }
        if (state.acceptedAt && new Date(state.acceptedAt).getTime() >= since)
          setMessage(
            result.notificationId
              ? 'El proveedor aceptó la prueba; falta confirmación del dispositivo.'
              : 'El proveedor aceptó un aviso; falta comprobar la prueba en este dispositivo.',
          )
      }
    } catch {
      setMessage('No pudimos comprobar la prueba. Revisá tu conexión y volvé a intentar.')
    } finally {
      setTesting(false)
    }
  }

  if (settings) {
    const instructions =
      status === 'install_required'
        ? 'En iPhone o iPad necesitás iOS 16.4 o posterior. En Safari tocá Compartir → Agregar a inicio y abrí TurnoGol desde ese ícono. Después habilitá las notificaciones acá.'
        : status === 'denied'
          ? 'Las notificaciones están bloqueadas. Permitilas en Ajustes → Notificaciones → TurnoGol (iPhone) o en los permisos del sitio y del navegador (Android), y volvé a abrir la app.'
          : status === 'unsupported'
            ? 'Este navegador no permite notificaciones. Probá con Safari en una PWA de iPhone, o Chrome en Android.'
            : status === 'subscribed'
              ? 'Este dispositivo tiene permiso y su suscripción está guardada en TurnoGol. Probá que aparezca el aviso con la pantalla bloqueada.'
              : status === 'idle'
                ? 'Comprobando permiso y conexión con TurnoGol…'
                : 'Habilitá las notificaciones para enterarte de las reservas aunque TurnoGol esté cerrada.'
    return (
      <section
        className="card-premium max-w-2xl space-y-4 p-5 sm:p-6"
        aria-label="Notificaciones de este dispositivo"
      >
        <h2 className="text-lg font-semibold">Este dispositivo</h2>
        <p className="text-sm text-muted-foreground">{instructions}</p>
        <div className="flex flex-wrap gap-3">
          {(status === 'unsubscribed' || status === 'pending') && (
            <Button onClick={enable} disabled={status === 'pending'}>
              {status === 'pending' ? 'Habilitando…' : 'Habilitar notificaciones'}
            </Button>
          )}
          {status === 'subscribed' && (
            <>
              <Button onClick={testDevice} disabled={testing}>
                {testing ? 'Comprobando prueba…' : 'Probar en este teléfono'}
              </Button>
              <Button variant="outline" onClick={disable}>
                Desactivar en este dispositivo
              </Button>
            </>
          )}
        </div>
        {message && (
          <p className="text-sm" role="status">
            {message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          No molestar o Enfoque pueden silenciar los avisos. Cada teléfono o computadora necesita su
          propia activación.
        </p>
      </section>
    )
  }

  if (
    dismissed ||
    status === 'unsupported' ||
    status === 'install_required' ||
    status === 'denied' ||
    status === 'subscribed' ||
    status === 'idle'
  ) {
    // Render audio always (for autoplay-ready when subscribed). Hide button if
    // already subscribed / not supported / denied / dismissed. Idle hides until
    // detection. `dismissed` unmounts the whole card (not just hides it), so it
    // can never intercept a click on whatever real button sits underneath it
    // (ENS-11).
    return (
      <>
        <audio ref={audioRef} src="/sounds/notification.mp3" preload="auto" aria-hidden="true" />
      </>
    )
  }

  return (
    // EN FLUJO, no `fixed` (🔴 QA 2026-08-13). Flotando abajo-izquierda tapaba —
    // e INTERCEPTABA el click de— los links del sidebar en desktop (la caja
    // llegaba a 400px de ancho sobre un sidebar de 240px, y el aside no tiene
    // z-index), los tabs de AdminBottomNav en mobile (mismo z-40, ganaba por
    // orden de DOM) y el botón "Guardar" de /settings/avisos en viewports bajos,
    // donde el click se perdía sin ningún feedback porque `useFormStatus` nunca
    // llegaba a marcar `pending`. Ya se había intentado achicarlo (ENS-11: la
    // versión completa tapaba 4 de 9 botones "Reservar turno" en la grilla
    // mobile) y desmontarlo al descartar; un elemento en flujo cierra la clase
    // entera: no puede tapar nada, y no depende de mantener sincronizados
    // offsets con el alto de barras que hoy están hardcodeados en 3 lugares.
    //
    // F-005 (QA prod 2026-08-17, punto 2): la versión apilada (título + descripción
    // + botón, cada uno en su fila) medía 142px en 1366×768 — casi todo lo que le
    // quedaba de alto a la grilla en una sesión nueva. Una sola fila (ícono + texto
    // corto + botón + cerrar) baja eso a una línea real, sin volver a `fixed`/flotar
    // (mismo motivo del comentario de arriba) y sin sacrificar el texto que los
    // tests de abajo esperan ("¿Habilitar notificaciones?", "Habilitar
    // notificaciones", "Habilitando…", botón "Cerrar") — se saca la descripción
    // larga, que ya estaba oculta en mobile y era lo único que sobraba.
    <div className="card-premium relative mb-4 flex w-full flex-wrap items-center gap-2 p-2.5 sm:flex-nowrap sm:p-3">
      <Bell className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs font-semibold text-foreground sm:text-sm">
        ¿Habilitar notificaciones?
      </p>
      <Link href="/notificaciones" className="text-xs underline">
        Ver estado
      </Link>
      <button
        type="button"
        onClick={enable}
        disabled={status === 'pending'}
        className="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 hover:shadow-md active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-50 sm:h-9 sm:px-4 sm:text-sm"
      >
        {status === 'pending' ? 'Habilitando…' : 'Habilitar notificaciones'}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar"
        className="shrink-0 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <audio ref={audioRef} src="/sounds/notification.mp3" preload="auto" aria-hidden="true" />
    </div>
  )
}
