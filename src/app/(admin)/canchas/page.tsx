import { redirect } from 'next/navigation'

/** /canchas fue reubicado a /settings/canchas — redirect permanente. */
export default function CanchasRedirect() {
  redirect('/settings/canchas')
}
