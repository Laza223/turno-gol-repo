// @vitest-environment happy-dom
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { PhoneInput, parsePhoneNumber, formatFullPhone, COUNTRIES } from '@/components/ui/phone-input'

afterEach(() => cleanup())

describe('PhoneInput & Helpers', () => {
  describe('parsePhoneNumber', () => {
    it('defaults to Argentina when input is empty or null', () => {
      const res1 = parsePhoneNumber(null)
      expect(res1.country.code).toBe('AR')
      expect(res1.nationalNumber).toBe('')

      const res2 = parsePhoneNumber('')
      expect(res2.country.code).toBe('AR')
      expect(res2.nationalNumber).toBe('')
    })

    it('parses international number with + prefix correctly', () => {
      const res1 = parsePhoneNumber('+598 99 123 456')
      expect(res1.country.code).toBe('UY')
      expect(res1.nationalNumber).toBe('99 123 456')

      const res2 = parsePhoneNumber('+55 11 98765-4321')
      expect(res2.country.code).toBe('BR')
      expect(res2.nationalNumber).toBe('11 98765-4321')
    })

    it('strips redundant leading 9 in AR numbers', () => {
      const res = parsePhoneNumber('+54 9 11 1234-5678')
      expect(res.country.code).toBe('AR')
      expect(res.nationalNumber).toBe('11 1234-5678')
    })

    it('parses national number without + as AR fallback', () => {
      const res = parsePhoneNumber('11 1234-5678')
      expect(res.country.code).toBe('AR')
      expect(res.nationalNumber).toBe('11 1234-5678')
    })
  })

  describe('formatFullPhone', () => {
    it('returns empty string if national number is empty', () => {
      expect(formatFullPhone(COUNTRIES[0], '')).toBe('')
    })

    it('combines dialCode and national number', () => {
      expect(formatFullPhone(COUNTRIES[0], '11 1234 5678')).toBe('+54 11 1234 5678')
    })
  })

  describe('PhoneInput Component', () => {
    it('renders with label and default Argentina flag', () => {
      render(<PhoneInput label="Teléfono de contacto" defaultValue="+54 11 1234 5678" />)
      expect(screen.getByText('Teléfono de contacto')).toBeTruthy()
      const button = screen.getByRole('button', { name: /Seleccionar código de país/i })
      expect(button.textContent).toContain('🇦🇷')
      expect(button.textContent).toContain('+54')
      expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('11 1234 5678')
    })

    it('opens dropdown and allows selecting a different country', () => {
      const handleChange = vi.fn()
      render(<PhoneInput defaultValue="11 1234 5678" onChange={handleChange} />)

      const countryBtn = screen.getByRole('button', { name: /Seleccionar código de país/i })
      fireEvent.click(countryBtn)

      // Dropdown should be open
      expect(screen.getByPlaceholderText('Buscar país o código...')).toBeTruthy()

      // Click Uruguay
      const uyOption = screen.getByText('Uruguay')
      fireEvent.click(uyOption)

      // Country should now be UY (+598)
      expect(countryBtn.textContent).toContain('🇺🇾')
      expect(countryBtn.textContent).toContain('+598')
      expect(handleChange).toHaveBeenCalledWith('+598 11 1234 5678')
    })

    it('filters countries when searching in dropdown', () => {
      render(<PhoneInput />)
      const countryBtn = screen.getByRole('button', { name: /Seleccionar código de país/i })
      fireEvent.click(countryBtn)

      const searchInput = screen.getByPlaceholderText('Buscar país o código...')
      fireEvent.change(searchInput, { target: { value: 'Brasil' } })

      expect(screen.getByText('Brasil')).toBeTruthy()
      expect(screen.queryByText('Uruguay')).toBeNull()
    })

    it('updates hidden input value for form submission', () => {
      const { container } = render(<PhoneInput name="phone" defaultValue="+54 11 9999 8888" />)
      const hiddenInput = container.querySelector('input[type="hidden"][name="phone"]') as HTMLInputElement
      expect(hiddenInput).toBeTruthy()
      expect(hiddenInput.value).toBe('+54 11 9999 8888')
    })
  })
})
