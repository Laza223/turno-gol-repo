'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { fetchWithTimeout, withTimeout } from '@/shared/utils/async'

type Status = 'idle' | 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed' | 'pending'

const SW_PATH = '/sw.js'
const SW_SCOPE = '/admin/'
const SOUND_ENABLED_KEY = 'turnogol:notif-sound'
// Safety deadline for the non-abortable service worker activation step so the
// "Habilitando…" button can never hang forever.
const SW_READY_TIMEOUT_MS = 10_000

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary')
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

async function subscribeOnServer(sub: PushSubscription): Promise<boolean> {
  try {
    const json = sub.toJSON()
    const res = await fetchWithTimeout('/api/admin/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export function PushNotificationManager() {
  const [status, setStatus] = useState<Status>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const bcRef = useRef<BroadcastChannel | null>(null)

  // Initial: detect support + permission state.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }
    // Check current subscription. Fire-and-forget: the IIFE swallows all errors
    // internally (catch → 'unsubscribed'), so it can never reject.
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE)
        if (!reg) {
          setStatus('unsubscribed')
          return
        }
        const sub = await reg.pushManager.getSubscription()
        setStatus(sub ? 'subscribed' : 'unsubscribed')
      } catch {
        setStatus('unsubscribed')
      }
    })()
  }, [])

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
        courtName?: string
        dateLabel?: string
        timeLabel?: string
        url?: string
        type?: string
      }
      if (!data.id || data.ack) return
      if (seen.has(data.id)) return
      seen.add(data.id)
      // Claim the show: ack first, then render.
      bc.postMessage({ id: data.id, ack: true })
      // Render payload-specific toast: title=courtName, description=date+time.
      // SW broadcasts include courtName/dateLabel/timeLabel from the push payload.
      const title = data.courtName
        ? `Nueva reserva — ${data.courtName}`
        : 'Nueva reserva'
      const description = [data.dateLabel, data.timeLabel].filter(Boolean).join(' · ')
        || 'Tenés una nueva reserva confirmada en la grilla.'
      toast({
        title,
        description,
        variant: 'success',
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
      try { localStorage.setItem(SOUND_ENABLED_KEY, '1') } catch { /* noop */ }
      // Preload audio so play() works without further gestures.
      if (audioRef.current) {
        try { await audioRef.current.play(); audioRef.current.pause() } catch { /* noop */ }
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
        toast({ title: 'No pudimos habilitar notificaciones', description: 'Falta la clave del servidor.', variant: 'destructive' })
        return
      }
      const sub = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })
      const ok = await subscribeOnServer(sub)
      if (!ok) {
        setStatus('unsubscribed')
        toast({ title: 'No pudimos guardar tu suscripción', description: 'Intentá de nuevo.', variant: 'destructive' })
        return
      }
      setStatus('subscribed')
      toast({ title: 'Notificaciones habilitadas', description: 'Vas a recibir un aviso cuando llegue una reserva.', variant: 'success' })
    } catch (e) {
      setStatus('unsubscribed')
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      toast({ title: 'No pudimos habilitar notificaciones', description: msg, variant: 'destructive' })
    }
  }

  if (status === 'unsupported' || status === 'denied' || status === 'subscribed' || status === 'idle') {
    // Render audio always (for autoplay-ready when subscribed). Hide button if
    // already subscribed / not supported / denied. Idle hides until detection.
    return (
      <>
        <audio ref={audioRef} src="/sounds/notification.mp3" preload="auto" aria-hidden="true" />
      </>
    )
  }

  return (
    <div className="card-premium fixed bottom-[max(env(safe-area-inset-bottom),1rem)] left-4 z-40 max-w-[calc(100vw-2rem)] sm:max-w-sm p-4">
      <p className="text-sm font-semibold text-foreground">¿Habilitar notificaciones?</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Recibí un aviso cuando se confirma una reserva online, incluso si no tenés la grilla abierta.
      </p>
      <button
        type="button"
        onClick={enable}
        disabled={status === 'pending'}
        className="mt-3 inline-flex h-11 md:h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white shadow-xs transition-all hover:bg-emerald-700 hover:shadow-md active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-50"
      >
        {status === 'pending' ? 'Habilitando…' : 'Habilitar notificaciones'}
      </button>
      <audio ref={audioRef} src="/sounds/notification.mp3" preload="auto" aria-hidden="true" />
    </div>
  )
}
