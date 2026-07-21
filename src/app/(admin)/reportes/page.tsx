import { redirect } from 'next/navigation'

/** /reportes fue absorbido por /analiticas — redirect permanente. */
export default function ReportesRedirect() {
  redirect('/analiticas')
}
