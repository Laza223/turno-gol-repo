'use client'

import { useEffect, useState } from 'react'
import { formatRemaining } from './format-remaining'

export default function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = new Date(expiresAt).getTime() - now

  return <span>{formatRemaining(remaining)}</span>
}
