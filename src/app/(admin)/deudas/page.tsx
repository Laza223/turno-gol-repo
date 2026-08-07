import { redirect } from 'next/navigation'

/** Compat de links viejos: la deuda vive toda en "Plata en la calle". */
export default function DeudasPage() {
  redirect('/caja/deudas')
}
