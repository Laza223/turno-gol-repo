import { ArrowRight, Check } from 'lucide-react'
import Reveal from '@/components/site/Reveal'

type Escena = { hora?: string; dolor: string; solucion: string }

const ESCENAS: Escena[] = [
  {
    hora: '23:40',
    dolor: '«¿Tenés cancha mañana a las 9?»',
    solucion: 'Reservan solos desde tu link. Vos dormís.',
  },
  {
    dolor: 'Terminó el de las 21. ¿Alguien lo cobró?',
    solucion: 'Lo que no se cobró queda en rojo hasta que entra.',
  },
  {
    dolor: 'Pagan de a uno: unos en efectivo, otros por transferencia.',
    solucion: 'Cobrás por equipo o de a partes, como venga.',
  },
  {
    dolor: '«¿Cuánto entró hoy?» Y le escribís al encargado.',
    solucion: 'Turnos, cantina y gastos en una caja, en tu celular.',
  },
  {
    dolor: 'Los fijos del martes, en una hoja del cuaderno.',
    solucion: 'Se repiten solos todas las semanas.',
  },
]

function Dolor({ hora, texto }: { hora?: string; texto: string }) {
  return (
    <>
      {hora && <span className="font-semibold tabular-nums">{hora} · </span>}
      {texto}
    </>
  )
}

export function Escenas() {
  return (
    <ul className="mt-10 space-y-4 sm:mt-12">
      {ESCENAS.map((e) => (
        <li key={e.dolor}>
          <Reveal className="card-premium grid grid-cols-1 gap-3 rounded-2xl p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-6">
            <p className="tg-noche-strike text-lg font-medium leading-[1.4] text-slate-400 line-through decoration-slate-500 decoration-2 lg:text-xl">
              <Dolor hora={e.hora} texto={e.dolor} />
            </p>
            <ArrowRight className="hidden h-5 w-5 text-slate-500 lg:block" aria-hidden />
            <p className="tg-noche-solution flex items-start gap-2.5 text-lg font-semibold leading-[1.4] text-white lg:text-xl">
              <Check className="mt-1 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
              {e.solucion}
            </p>
          </Reveal>
        </li>
      ))}
    </ul>
  )
}
