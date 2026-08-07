import { redirect } from 'next/navigation'

/**
 * Compat de links viejos. La lista de deuda es UNA sola desde Fase 1:
 * "Plata en la calle" (`/caja/deudas`), que suma los tres orígenes —
 * turnos sin cobrar, fiados de cantina y cuotas de torneo.
 *
 * Esta pantalla mostraba sólo el primero (`getDebts`), que `getStreetMoney`
 * ya llama por dentro: era un subconjunto estricto con su propio total, o sea
 * dos números para el mismo hecho económico (viola P2, "una verdad, muchas
 * vistas"). Fase 4 la cierra. Sancionar a un moroso vive en la ficha del
 * jugador, a la que ahora linkea cada fila de "Plata en la calle".
 */
export default function JugadoresDeudasPage() {
  redirect('/caja/deudas')
}
