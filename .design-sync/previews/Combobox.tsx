import { useState } from 'react'
import { Combobox } from 'turnogol'

const inputCls =
  'flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500'

const provincias = [
  { value: 'caba', label: 'Ciudad de Buenos Aires' },
  { value: 'ba', label: 'Buenos Aires' },
  { value: 'cba', label: 'Córdoba' },
  { value: 'sf', label: 'Santa Fe' },
  { value: 'mza', label: 'Mendoza' },
]

export function Seleccionada() {
  const [value, setValue] = useState('cba')
  return (
    <div className="w-80">
      <Combobox
        id="provincia"
        options={provincias}
        value={value}
        onChange={setValue}
        placeholder="Elegí una provincia"
        inputClassName={inputCls}
        listboxLabel="Provincias"
      />
    </div>
  )
}
