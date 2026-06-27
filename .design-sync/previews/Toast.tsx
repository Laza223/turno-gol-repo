import { Toast, ToastProvider, ToastViewport, ToastTitle, ToastDescription, ToastClose } from 'turnogol'

export function Variantes() {
  return (
    <ToastProvider duration={1000000}>
      <Toast open>
        <div className="grid gap-1">
          <ToastTitle>Reserva confirmada</ToastTitle>
          <ToastDescription>Tu turno del sábado 20:00 está confirmado.</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <Toast open variant="success">
        <div className="grid gap-1">
          <ToastTitle>Pago acreditado</ToastTitle>
          <ToastDescription>Recibimos tu seña de $8.000.</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <Toast open variant="destructive">
        <div className="grid gap-1">
          <ToastTitle>No se pudo procesar el pago</ToastTitle>
          <ToastDescription>Intentá nuevamente en unos minutos.</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <ToastViewport className="!static !m-0 !flex !w-96 !max-w-full !flex-col !gap-2 !p-0" />
    </ToastProvider>
  )
}
