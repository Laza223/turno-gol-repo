import { ErrorState } from 'turnogol'

export function Contenido() {
  return (
    <ErrorState
      variant="contained"
      title="No pudimos cargar tus turnos"
      description="Hubo un problema al traer la información. Revisá tu conexión e intentá de nuevo."
      digest="TG-4F2A91"
      onRetry={() => {}}
      secondaryHref="/"
      secondaryLabel="Volver al inicio"
    />
  )
}

export function Inline() {
  return (
    <div className="w-96">
      <ErrorState
        variant="inline"
        title="No se pudo procesar el pago"
        description="Intentá nuevamente en unos minutos."
        onRetry={() => {}}
      />
    </div>
  )
}
