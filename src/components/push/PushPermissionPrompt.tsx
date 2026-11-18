'use client'

import { Bell, BellOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Modal y cartel propios para pedir el permiso de notificaciones (decisión
 * 2026-11-16). El diálogo del dispositivo se abre SOLO desde el botón
 * "Habilitar notificaciones": los navegadores exigen un gesto del usuario
 * (WebKit, web.dev "Permissions best practices"), y pedirlo al entrar sin
 * contexto termina en un rechazo que el sitio ya no puede revertir.
 *
 * Estados que no se pueden resolver con el botón tienen su propio contenido:
 * - `install_required`: iPhone fuera de la pantalla de inicio. En una pestaña
 *   (Safari o Chrome) no hay permiso de notificaciones: WebKit solo da push a
 *   las web apps del inicio (iOS 16.4+).
 * - `denied`: el navegador ya no deja volver a pedir el permiso; solo se puede
 *   explicar cómo desbloquearlo.
 * - `unsupported`: navegador sin Push API.
 */
export type PushPromptStatus =
  'install_required' | 'denied' | 'unsupported' | 'unsubscribed' | 'pending'

export type PushAudience = 'staff' | 'player'

const ENABLE_BODY: Record<PushAudience, string> = {
  staff:
    'Te avisamos al instante cuando te reservan o te cancelan un turno, y a qué hora es la primera reserva del día.',
  player: 'Te recordamos tus turnos antes de jugar, para que no te los olvides.',
}

const BANNER_TEXT: Record<PushAudience, string> = {
  staff: 'No tenés las notificaciones activadas en este dispositivo.',
  player: 'Activá las notificaciones para que te recordemos tus turnos.',
}

/** Pasos para instalar TurnoGol en el inicio del iPhone (modal y /notificaciones). */
const IPHONE_INSTALL_STEPS = [
  'Tocá Compartir (el cuadrado con la flecha). En Safari puede estar adentro del menú ···.',
  'Elegí Agregar a inicio.',
  'Abrí TurnoGol desde el ícono nuevo y tocá Activar.',
]

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  )
}

/** Pasos de instalación en iPhone como componente: el modal y /notificaciones los comparten. */
export function IphoneInstallSteps() {
  return <Steps items={IPHONE_INSTALL_STEPS} />
}

export function PushPermissionDialog({
  open,
  onOpenChange,
  status,
  audience,
  onEnable,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: PushPromptStatus
  audience: PushAudience
  onEnable: () => void
}) {
  const close = () => onOpenChange(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {status === 'install_required' ? (
          <>
            <DialogHeader>
              <DialogTitle>Instalá TurnoGol en tu iPhone</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              En iPhone los avisos llegan solo a TurnoGol instalado. Sirve desde Safari o Chrome.
            </p>
            <Steps items={IPHONE_INSTALL_STEPS} />
            <Button className="w-full" onClick={close}>
              Entendido
            </Button>
          </>
        ) : status === 'denied' ? (
          <>
            <DialogHeader>
              <DialogTitle>Las notificaciones están bloqueadas</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Este dispositivo bloqueó los avisos de TurnoGol. Así los volvés a activar.
            </p>
            <Steps
              items={[
                'En la computadora, tocá el candado al lado de la dirección y permití las notificaciones.',
                'En Android, abrí los ajustes del navegador, entrá a Configuración de sitios y permití las notificaciones de TurnoGol.',
                'En iPhone, entrá a Ajustes, Notificaciones, TurnoGol.',
              ]}
            />
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button className="w-full sm:w-auto" onClick={() => window.location.reload()}>
                Ya las permití
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" onClick={close}>
                Ahora no
              </Button>
            </div>
          </>
        ) : status === 'unsupported' ? (
          <>
            <DialogHeader>
              <DialogTitle>Este navegador no recibe avisos</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Abrí TurnoGol en Chrome, Edge o Samsung Internet. En iPhone, instalalo en tu inicio
              desde Safari o Chrome.
            </p>
            <Button className="w-full" onClick={close}>
              Entendido
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bell className="h-5 w-5" aria-hidden="true" />
              </span>
              <DialogTitle>Activá las notificaciones</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{ENABLE_BODY[audience]}</p>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                className="w-full sm:w-auto"
                onClick={onEnable}
                disabled={status === 'pending'}
              >
                {status === 'pending' ? 'Habilitando…' : 'Habilitar notificaciones'}
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" onClick={close}>
                Ahora no
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Cartel en flujo (no flotante: un elemento fijo tapaba botones del panel, QA
 * 2026-08-13). Con `onDismiss` se puede cerrar (el manager lo oculta 7 días).
 * Si el dispositivo ya recibe avisos, no se renderiza.
 */
export function PushPermissionBanner({
  status,
  audience,
  onOpen,
  onDismiss,
  className,
}: {
  status: PushPromptStatus
  audience: PushAudience
  onOpen: () => void
  onDismiss?: () => void
  className?: string
}) {
  const text =
    status === 'denied'
      ? 'Las notificaciones están bloqueadas en este dispositivo.'
      : status === 'install_required'
        ? 'Instalá TurnoGol en tu iPhone para recibir los avisos de reservas.'
        : status === 'unsupported'
          ? 'Este navegador no recibe avisos.'
          : BANNER_TEXT[audience]
  const action = status === 'unsubscribed' || status === 'pending' ? 'Activar' : 'Ver cómo'
  const Icon = status === 'denied' || status === 'unsupported' ? BellOff : Bell
  return (
    <div
      role="status"
      data-push-banner=""
      className={cn('card-premium mb-4 flex w-full items-center gap-2 p-2.5 sm:p-3', className)}
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs font-medium text-foreground sm:text-sm">{text}</p>
      <Button size="sm" className="shrink-0" onClick={onOpen}>
        {action}
      </Button>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          className="-my-1.5 -mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
