'use client'

import React, { useState, useRef, useEffect, useId } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

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

export const DEFAULT_COUNTRY = COUNTRIES[0] // Argentina

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
    const sortedCountries = [...COUNTRIES].sort(
      (a, b) => b.dialCode.length - a.dialCode.length,
    )
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

export interface PhoneInputProps {
  id?: string
  name?: string
  label?: string
  defaultValue?: string
  value?: string
  onChange?: (fullValue: string) => void
  error?: string
  helper?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
  autoComplete?: string
}

export function PhoneInput({
  id: explicitId,
  name = 'phone',
  label,
  defaultValue = '',
  value: controlledValue,
  onChange,
  error,
  helper,
  required = false,
  disabled = false,
  placeholder = '11 1234-5678',
  className,
  inputClassName,
  autoComplete = 'tel-national',
}: PhoneInputProps) {
  const generatedId = useId()
  const inputId = explicitId || `phone-input-${generatedId}`

  // Initial value parsing
  const initial = parsePhoneNumber(controlledValue ?? defaultValue)
  const [country, setCountry] = useState<CountryOption>(initial.country)
  const [nationalNumber, setNationalNumber] = useState<string>(initial.nationalNumber)
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const numberInputRef = useRef<HTMLInputElement>(null)

  // Update when controlled value changes
  useEffect(() => {
    if (controlledValue !== undefined) {
      const parsed = parsePhoneNumber(controlledValue)
      setCountry(parsed.country)
      setNationalNumber(parsed.nationalNumber)
    }
  }, [controlledValue])

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const fullValue = formatFullPhone(country, nationalNumber)

  const handleCountrySelect = (c: CountryOption) => {
    setCountry(c)
    setIsOpen(false)
    const newFull = formatFullPhone(c, nationalNumber)
    onChange?.(newFull)
    numberInputRef.current?.focus()
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    // If user pastes +54..., parse it intelligently
    if (val.startsWith('+')) {
      const parsed = parsePhoneNumber(val)
      setCountry(parsed.country)
      val = parsed.nationalNumber
    }
    setNationalNumber(val)
    const newFull = formatFullPhone(country, val)
    onChange?.(newFull)
  }

  const filteredCountries = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.dialCode.includes(searchQuery) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className={cn('space-y-1.5', className)} ref={containerRef}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
          {label} {required && <span className="text-red-500 dark:text-red-400">*</span>}
        </label>
      )}

      {/* Hidden input to ensure standard HTML forms / Server Actions receive full international string */}
      {name && <input type="hidden" name={name} value={fullValue} />}

      <div className="relative flex rounded-lg shadow-sm">
        {/* Country Selector Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={`Seleccionar código de país. Actual: ${country.name} (${country.dialCode})`}
          className={cn(
            'flex items-center gap-1.5 rounded-l-lg border border-r-0 border-border bg-muted/40 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-10 disabled:cursor-not-allowed disabled:opacity-50 h-11 md:h-10 select-none',
            error && 'border-red-500 dark:border-red-400',
          )}
        >
          <span className="text-base leading-none" role="img" aria-label={country.name}>
            {country.flag}
          </span>
          <span className="font-semibold text-xs text-muted-foreground">{country.dialCode}</span>
          <ChevronDown
            className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}
          />
        </button>

        {/* National Number Input */}
        <input
          ref={numberInputRef}
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          disabled={disabled}
          placeholder={placeholder}
          value={nationalNumber}
          onChange={handleNumberChange}
          className={cn(
            'flex h-11 md:h-10 w-full rounded-r-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground ring-offset-background transition-colors placeholder:text-muted-foreground hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary focus-visible:z-10 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-500 dark:border-red-400 focus-visible:ring-red-500 dark:focus-visible:ring-red-400',
            inputClassName,
          )}
        />

        {/* Country Picker Dropdown Panel */}
        {isOpen && (
          <div className="absolute left-0 top-full z-50 mt-1.5 max-h-72 w-72 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95">
            <div className="p-2 border-b border-border bg-muted/20">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Buscar país o código..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8.5 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <ul role="listbox" className="max-h-56 overflow-y-auto p-1 scrollbar-thin">
              {filteredCountries.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No se encontraron países
                </li>
              ) : (
                filteredCountries.map((c) => {
                  const isSelected = c.code === country.code
                  return (
                    <li
                      key={c.code}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleCountrySelect(c)}
                      className={cn(
                        'flex items-center justify-between rounded-lg px-2.5 py-2 text-xs cursor-pointer transition-colors select-none',
                        isSelected
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'hover:bg-muted/80 text-foreground',
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base leading-none">{c.flag}</span>
                        <span>{c.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-muted-foreground font-normal">
                          {c.dialCode}
                        </span>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        )}
                      </div>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!error && helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  )
}
