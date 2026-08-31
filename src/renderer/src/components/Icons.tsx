import type { CSSProperties } from 'react'

/**
 * I segni piccoli dell'interfaccia, disegnati invece che presi da un font.
 * Un glifo tipografico (✕, ▶, ◧, 🎉) cambia forma da un sistema all'altro,
 * non si allinea mai davvero e stona accanto alle icone dei comandi, che sono
 * tutte disegnate a mano: questi hanno lo stesso tratto e la stessa griglia.
 */

interface MarkProps {
  /** lato in pixel; il tratto resta proporzionato */
  size?: number
  className?: string
  style?: CSSProperties
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
})

/** chiusura di pannelli e finestre */
export function CloseMark({ size = 14, className , style}: MarkProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/** conferma: una spunta netta */
export function CheckMark({ size = 14, className , style}: MarkProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  )
}

/** la freccia dei cassetti: ruota di 90° quando si aprono */
export function ChevronMark({ size = 10, className , style}: MarkProps) {
  return (
    <svg {...base(size)} strokeWidth={2.6} className={className} style={style} aria-hidden>
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

/** confronto affiancato: un riquadro diviso a metà */
export function CompareMark({ size = 14, className , style}: MarkProps) {
  return (
    <svg {...base(size)} strokeWidth={1.8} className={className} style={style} aria-hidden>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M12 5v14" />
      <path d="M6.5 9.5h3M6.5 12.5h3" strokeWidth={1.4} opacity="0.8" />
    </svg>
  )
}

/** rotazione: la ghiera agli angoli del ritaglio */
export function RotateMark({ size = 13, className , style}: MarkProps) {
  return (
    <svg {...base(size)} strokeWidth={2.2} className={className} style={style} aria-hidden>
      <path d="M19 12a7 7 0 1 1-2.4-5.3" />
      <path d="M19.5 4v3.6H16" />
    </svg>
  )
}

/** il cuore delle bolle che promuovono: pieno, non un carattere */
export function HeartMark({ size = 16, className , style}: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
    >
      <path d="M12 20.6s-7.8-4.9-7.8-10.2A4.6 4.6 0 0 1 12 7.6a4.6 4.6 0 0 1 7.8 2.8c0 5.3-7.8 10.2-7.8 10.2Z" />
    </svg>
  )
}

/** la croce piena delle bolle che scartano */
export function CrossMark({ size = 16, className , style}: MarkProps) {
  return (
    <svg {...base(size)} strokeWidth={2.6} className={className} style={style} aria-hidden>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  )
}

/**
 * Gli angoli tagliati dell'istogramma: un triangolo pieno che punta al lato
 * dove la luce si sta perdendo (in basso a sinistra i neri, a destra le luci).
 */
export function ClipMark({ side, size = 9, className, style }: MarkProps & { side: 'low' | 'high' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
    >
      {side === 'low' ? <path d="M11 1v10H1Z" /> : <path d="M1 1v10h10Z" />}
    </svg>
  )
}
