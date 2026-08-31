import { useEffect, useRef, useState } from 'react'
import { usePreset } from '../lib/preset'
import { ToolChip } from './StageTools'
import { UndoArt, worldWords } from './WorldIcons'

interface UndoFlipProps {
  onUndo: () => void
  disabled?: boolean
}

/**
 * Il comando «annulla». Ogni mondo lo racconta a suo modo: un omino che fa la
 * capriola, una cometa richiamata indietro, una scintilla che rientra nella
 * brace, un rullino che si riavvolge.
 */
export function UndoFlip({ onUndo, disabled = false }: UndoFlipProps) {
  const { preset, animated } = usePreset()
  const speed = preset.motion.speed
  const svgRef = useRef<SVGSVGElement>(null)
  const [tucked, setTucked] = useState(false)
  const timerRef = useRef(0)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleClick = (): void => {
    if (disabled) return
    onUndo()
    if (!animated) return
    svgRef.current?.animate(
      [
        { transform: 'translateY(0) rotate(0deg)' },
        { transform: 'translateY(-11px) rotate(-200deg)', offset: 0.5 },
        { transform: 'translateY(0) rotate(-360deg)' }
      ],
      { duration: 650 / speed, easing: 'ease-in-out' }
    )
    setTucked(true)
    clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setTucked(false), 520 / speed)
  }

  const words = worldWords(preset.id)

  return (
    <ToolChip
      label={words.undo}
      shortcut="Ctrl+Z"
      title="Annulla l'ultima modifica alla foto; quando non ce ne sono più, ripesca l'ultima decisione"
      disabled={disabled}
      onClick={handleClick}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h9a7 7 0 0 1 0 14H8" />
        </svg>
      }
      art={
        <svg
          ref={svgRef}
          width="30"
          height="30"
          viewBox="0 0 34 34"
          fill="none"
          style={{ transformOrigin: '50% 55%' }}
        >
          <UndoArt presetId={preset.id} active={tucked} />
        </svg>
      }
    />
  )
}
