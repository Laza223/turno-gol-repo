'use client'

import { Bell, BellOff } from 'lucide-react'
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
 * - `install_required`: iPhone fuera de la pantalla de inicio. Safari en una
 *   pestaña no tiene permiso de notificaciones (WebKit, iOS 16.4+).
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

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  )
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
              <DialogTitle>Agregá TurnoGol a tu inicio</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              En iPhone los avisos llegan solo si abrís TurnoGol desde la pantalla de inicio.
            </p>
            <Steps
              items={[
                'Tocá el botón Compartir de Safari.',
                'Elegí Agregar a inicio.',
                'Abrí TurnoGol desde el ícono nuevo y activá las notificaciones.',
              ]}
            />
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
              Abrí TurnoGol en Chrome, Edge o Samsung Internet. En iPhone, agregalo a tu inicio
              desde Safari.
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
 * 2026-08-13). Sin botón de cerrar a propósito: mientras este dispositivo no
 * reciba avisos, el cartel queda. Si ya los recibe, no se renderiza.
 */
export function PushPermissionBanner({
  status,
  audience,
  onOpen,
  className,
}: {
  status: PushPromptStatus
  audience: PushAudience
  onOpen: () => void
  className?: string
}) {
  const text =
    status === 'denied'
      ? 'Las notificaciones están bloqueadas en este dispositivo.'
      : status === 'install_required'
        ? 'Para recibir avisos en iPhone, agregá TurnoGol a tu inicio.'
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
    </div>
  )
}
