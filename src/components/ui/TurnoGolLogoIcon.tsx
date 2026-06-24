import React from 'react'
import { cn } from '@/lib/utils'

interface TurnoGolLogoIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  primaryColor?: string
  accentColor?: string
}

export function TurnoGolLogoIcon({
  className,
  primaryColor = 'currentColor',
  accentColor = '#10b981', // emerald-500
  ...props
}: TurnoGolLogoIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-full", className)}
      {...props}
    >
      {/* Inner field lines drawn first so outer arcs overlap them cleanly */}
      {/* Midfield Line */}
      <line x1="10" y1="50" x2="90" y2="50" stroke={primaryColor} strokeWidth="6" strokeLinecap="round" />

      {/* Center Circle */}
      <circle cx="50" cy="50" r="10" stroke={primaryColor} strokeWidth="6" />

      {/* Top Penalty Box (Width 40, Height 12) */}
      <path d="M 30 16 L 30 28 L 70 28 L 70 16" stroke={primaryColor} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />

      {/* Bottom Penalty Box (Width 40, Height 12) */}
      <path d="M 30 84 L 30 72 L 70 72 L 70 84" stroke={primaryColor} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />

      {/* Left Outer Arc (Slate/Black/White) */}
      <path d="M 50 10 A 40 40 0 0 0 50 90" stroke={primaryColor} strokeWidth="6" strokeLinecap="round" />

      {/* Right Outer Arc (Green) */}
      <path d="M 50 90 A 40 40 0 0 0 65 13" stroke={accentColor} strokeWidth="6" strokeLinecap="round" />
      
      {/* Arrowhead at the end of the right arc (Tip at 65,13 pointing counter-clockwise up-left) */}
      <path d="M 73 20 L 65 13 L 56 19" stroke={accentColor} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />

      {/* Clock Hands (Green) - Forming an L shape starting from the center */}
      <path d="M 50 25 L 50 50 L 75 50" stroke={accentColor} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
