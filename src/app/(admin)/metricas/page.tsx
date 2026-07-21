import { redirect } from 'next/navigation'

/** /metricas fue reubicado a /analiticas — redirect permanente. */
export default function MetricasPage() {
  redirect('/analiticas')
}
