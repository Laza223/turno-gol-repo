import { Logo } from 'turnogol'

export function Horizontal() {
  return (
    <div className="flex items-center p-4">
      <Logo variant="horizontal" />
    </div>
  )
}

export function Vertical() {
  return (
    <div className="flex items-center justify-center p-4">
      <Logo variant="vertical" />
    </div>
  )
}

export function Monograma() {
  return (
    <div className="flex items-center gap-6 p-4">
      <Logo variant="icon" />
      <Logo variant="horizontal" textClassName="text-white" className="rounded-lg bg-slate-900 px-3 py-2" />
    </div>
  )
}
