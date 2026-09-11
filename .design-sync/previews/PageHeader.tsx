import { PageHeader, Button } from 'turnogol'

const Grilla = (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M9 9v12M15 9v12M8 2v4M16 2v4" />
  </svg>
)

/** La banda que encabeza TODAS las pantallas del panel. El subtítulo lleva la
 *  fecha en formato medio ("mié 2 de julio"), nunca ISO. */
export function ConAcciones() {
  return (
    <PageHeader
      title="Grilla"
      subtitle="mié 2 de julio"
      icon={Grilla}
      actions={<Button variant="outline">Hoy</Button>}
    />
  )
}

export function SoloTitulo() {
  return <PageHeader title="Hoy" subtitle="mié 2 de julio" icon={Grilla} />
}
