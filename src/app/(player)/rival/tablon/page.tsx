import { permanentRedirect } from 'next/navigation'

/**
 * El tablón vive en `/rival`. Esta ruta queda solo porque hay links compartidos (`?complejo=`,
 * `?despues=`): redirige conservando la query.
 */
export default async function RivalTablonRedirect(props: {
  searchParams: Promise<{ complejo?: string; despues?: string }>
}) {
  const { complejo, despues } = await props.searchParams
  const params = new URLSearchParams()
  if (complejo !== undefined) params.set('complejo', complejo)
  if (despues !== undefined) params.set('despues', despues)
  const query = params.toString()
  permanentRedirect(query ? `/rival?${query}` : '/rival')
}
