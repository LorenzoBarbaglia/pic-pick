import { useEffect, useRef, useState } from 'react'
import { usePreset } from '../lib/preset'
import { ToolChip } from './StageTools'
import { PreviewArt, worldWords } from './WorldIcons'

interface EyeToggleProps {
  /** occhio aperto = interfaccia visibile */
  open: boolean
  onToggle: () => void
}

/**
 * Il comando «guarda solo l'immagine». L'oggetto cambia col mondo — occhio,
 * luna, candela, lampada da camera oscura — ma il gesto è sempre lo stesso, e
 * ogni tanto l'oggetto si muove da solo (l'occhio sbatte, la fiamma vibra).
 */
export function EyeToggle({ open, onToggle }: EyeToggleProps) {
  const { preset, animated } = usePreset()
  const speed = preset.motion.speed
  const [blink, setBlink] = useState(false)
  const [look, setLook] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  // blink spontaneo: nei mondi lenti le palpebre si muovono di rado
  useEffect(() => {
    if (!open || !animated) return
    let cancelled = false
    let closeTimer = 0
    let openTimer = 0
    const schedule = (): void => {
      closeTimer = window.setTimeout(
        () => {
          if (cancelled) return
          setBlink(true)
          openTimer = window.setTimeout(() => {
            if (cancelled) return
            setBlink(false)
            schedule()
          }, 130 / speed)
        },
        (3200 + Math.random() * 3200) / speed
      )
    }
    schedule()
    return () => {
      cancelled = true
      clearTimeout(closeTimer)
      clearTimeout(openTimer)
      setBlink(false)
    }
  }, [open, animated, speed])

  // l'iride segue il puntatore
  useEffect(() => {
    if (!open || !animated) {
      setLook({ x: 0, y: 0 })
      return
    }
    let raf = 0
    const onMove = (e: PointerEvent): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rect = svgRef.current?.getBoundingClientRect()
        if (!rect) return
        const dx = e.clientX - (rect.left + rect.width / 2)
        const dy = e.clientY - (rect.top + rect.height / 2)
        const length = Math.hypot(dx, dy) || 1
        const reach = Math.min(1, length / 140) * 3.2
        setLook({ x: (dx / length) * reach, y: (dy / length) * reach })
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [open, animated])

  const eyeOpen = open && !blink
  const words = worldWords(preset.id)

  // in ufficio l'oggetto diventa un normale interruttore di anteprima
  if (!animated) {
    return (
      <ToolChip
        label={open ? 'Anteprima' : 'Torna a modificare'}
        active={!open}
        onClick={onToggle}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            {open ? (
              <>
                <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.6" />
              </>
            ) : (
              <>
                <path d="M3 12s3.6-6 9-6c1.5 0 2.9.4 4.1 1M21 12s-3.6 6-9 6c-1.5 0-2.9-.4-4.1-1" />
                <path d="M4 4l16 16" />
              </>
            )}
          </svg>
        }
      />
    )
  }

  return (
    <ToolChip
      label={open ? words.previewOn : words.previewOff}
      title={
        open
          ? "Nascondi l'interfaccia e giudica solo l'immagine"
          : 'Torna a comporre e ritagliare'
      }
      active={!open}
      onClick={onToggle}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      }
      art={
        <svg ref={svgRef} width="30" height="30" viewBox="0 0 34 34" fill="none">
          <PreviewArt presetId={preset.id} open={eyeOpen} speed={speed} look={look} />
        </svg>
      }
    />
  )
}
