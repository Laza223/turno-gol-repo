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
    <ul className="pc-scenes">
      {ESCENAS.map((e) => (
        <li key={e.dolor}>
          <Reveal className="pc-scene glass-painted">
            <p className="pc-scene__pain tg-noche-strike">
              <Dolor hora={e.hora} texto={e.dolor} />
            </p>
            <ArrowRight className="pc-scene__arrow" aria-hidden />
            <p className="pc-scene__fix tg-noche-solution">
              <Check aria-hidden />
              {e.solucion}
            </p>
          </Reveal>
        </li>
      ))}
    </ul>
  )
}
