import type { Metadata } from 'next'
import { finalizeGoogleSignupAction } from '../actions'
import { FinalizarSignup } from '../FinalizarSignup'

export const metadata: Metadata = {
  title: 'Creando tu complejo',
  robots: { index: false, follow: false },
}

/** Vuelta de Google: ya hay sesión, falta crear el complejo con el borrador del celular. */
export default function FinalizarPage() {
  return <FinalizarSignup action={finalizeGoogleSignupAction} />
}
