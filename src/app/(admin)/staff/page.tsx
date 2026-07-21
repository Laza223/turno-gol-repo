import { redirect } from 'next/navigation'

/** /staff fue reubicado a /settings/equipo — redirect permanente. */
export default function StaffRedirect() {
  redirect('/settings/equipo')
}
