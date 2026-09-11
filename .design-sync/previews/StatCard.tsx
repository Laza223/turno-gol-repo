import { StatCard } from 'turnogol'

const Billete = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
)

/** El semáforo de la plata (§2.5): emerald entra, amber pendiente, red deuda,
 *  slate neutro. En amber y red el acento también tiñe la cifra, que es lo que
 *  el dueño realmente lee. Plata siempre "$ 184.500", con espacio. */
export function ElSemaforo() {
  return (
    <div className="grid w-full max-w-3xl grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Cobrado hoy" value="$ 184.500" icon={Billete} accent="emerald" />
      <StatCard label="Deudas" sub="Pendiente de cobro" value="$ 42.000" icon={Billete} accent="amber" />
      <StatCard label="Devolvés" sub="Señas sin devolver" value="$ 24.000" icon={Billete} accent="red" />
      <StatCard label="Estado de caja" value="Abierta — desde las 09:00 hs" icon={Billete} accent="slate" />
    </div>
  )
}
