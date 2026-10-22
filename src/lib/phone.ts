// Lo puro del teléfono, sin React: lo usa el input del navegador
// (`components/ui/phone-input.tsx`) y también el servidor, que no puede llamar
// funciones de un módulo 'use client' (el importador de turnos fijos).

export type CountryOption = {
  code: string
  name: string
  dialCode: string
  flag: string
}

export const COUNTRIES: CountryOption[] = [
  { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { code: 'UY', name: 'Uruguay', dialCode: '+598', flag: '🇺🇾' },
  { code: 'BR', name: 'Brasil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { code: 'PY', name: 'Paraguay', dialCode: '+595', flag: '🇵🇾' },
  { code: 'BO', name: 'Bolivia', dialCode: '+591', flag: '🇧🇴' },
  { code: 'PE', name: 'Perú', dialCode: '+51', flag: '🇵🇪' },
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { code: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
  { code: 'EC', name: 'Ecuador', dialCode: '+593', flag: '🇪🇨' },
  { code: 'MX', name: 'México', dialCode: '+52', flag: '🇲🇽' },
  { code: 'ES', name: 'España', dialCode: '+34', flag: '🇪🇸' },
  { code: 'US', name: 'Estados Unidos', dialCode: '+1', flag: '🇺🇸' },
  { code: 'IT', name: 'Italia', dialCode: '+39', flag: '🇮🇹' },
  { code: 'FR', name: 'Francia', dialCode: '+33', flag: '🇫🇷' },
  { code: 'DE', name: 'Alemania', dialCode: '+49', flag: '🇩🇪' },
  { code: 'GB', name: 'Reino Unido', dialCode: '+44', flag: '🇬🇧' },
  { code: 'CA', name: 'Canadá', dialCode: '+1', flag: '🇨🇦' },
]

const DEFAULT_COUNTRY = COUNTRIES[0] // Argentina

export function parsePhoneNumber(rawPhone?: string | null): {
  country: CountryOption
  nationalNumber: string
} {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { country: DEFAULT_COUNTRY, nationalNumber: '' }
  }

  const trimmed = rawPhone.trim()
  if (!trimmed) {
    return { country: DEFAULT_COUNTRY, nationalNumber: '' }
  }

  if (trimmed.startsWith('+')) {
    // Sort dial codes by length descending so +598 is tested before +5
    const sortedCountries = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length)
    for (const c of sortedCountries) {
      if (trimmed.startsWith(c.dialCode)) {
        let national = trimmed.slice(c.dialCode.length).trim()
        // If Argentina (+54), strip legacy leading 9 if followed by spaces/digits
        if (c.code === 'AR' && /^9\s?\d/.test(national)) {
          national = national.replace(/^9\s?/, '')
        }
        return { country: c, nationalNumber: national }
      }
    }
  }

  // Fallback: assume AR and input is already national
  let national = trimmed
  if (/^\+?54/.test(national)) {
    national = national.replace(/^\+?54\s?/, '')
  }
  if (/^9\s?\d/.test(national)) {
    national = national.replace(/^9\s?/, '')
  }
  return { country: DEFAULT_COUNTRY, nationalNumber: national }
}

export function formatFullPhone(country: CountryOption, nationalNumber: string): string {
  const cleaned = nationalNumber.trim()
  if (!cleaned) return ''
  return `${country.dialCode} ${cleaned}`
}
