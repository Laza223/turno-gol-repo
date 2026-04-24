'use client'

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <button onClick={reset}>Reintentar</button>
    </div>
  )
}
