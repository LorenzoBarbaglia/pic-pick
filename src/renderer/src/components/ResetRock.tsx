import { useEffect, useRef, useState } from 'react'
import { sound } from '../lib/sound'
import { usePreset } from '../lib/preset'
import { ToolChip } from './StageTools'
import { ResetArt, worldFlavour, worldWords } from './WorldIcons'

interface ResetRockProps {
  onReset: () => void
}

const HEAL_MS = 3000
const REGROW_MS = 3000

/**
 * Il comando «ricomponi». Va colpito tre volte: l'oggetto del mondo accumula i
 * colpi (crepe, sabbia, scintille, onde) e al terzo cede, riportando la foto
 * alla composizione di partenza. Poi si rigenera e i colpi si dimenticano.
 */
export function ResetRock({ onReset }: ResetRockProps) {
  const { preset, animated } = usePreset()
  const speed = preset.motion.speed
  const [cracks, setCracks] = useState(0)
  const [broken, setBroken] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [burst, setBurst] = useState(0)
  const rockRef = useRef<SVGSVGElement>(null)
  const healTimerRef = useRef<number | null>(null)
  const regrowTimerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (healTimerRef.current) clearTimeout(healTimerRef.current)
      if (regrowTimerRef.current) clearTimeout(regrowTimerRef.current)
    },
    []
  )

  const handleClick = (): void => {
    if (broken) return
    if (healTimerRef.current) clearTimeout(healTimerRef.current)

    setBurst((b) => b + 1)
    rockRef.current?.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: 'translate(-2px, 1px) rotate(-5deg)' },
        { transform: 'translate(2px, -1px) rotate(4deg)' },
        { transform: 'translate(-1px, 1px) rotate(-2deg)' },
        { transform: 'translate(0, 0) rotate(0deg)' }
      ],
      { duration: 280 / speed, easing: 'ease-out' }
    )

    const next = cracks + 1
    if (next >= 3) {
      sound.shatter()
      setCracks(3)
      setBroken(true)
      onReset()
      regrowTimerRef.current = window.setTimeout(() => {
        setBroken(false)
        setCracks(0)
        setGeneration((g) => g + 1)
      }, REGROW_MS / speed)
    } else {
      sound.crack()
      setCracks(next)
      healTimerRef.current = window.setTimeout(() => setCracks(0), HEAL_MS / speed)
    }
  }

  const words = worldWords(preset.id)
  const flavour = worldFlavour(preset.id)

  return (
    <ToolChip
      label={animated ? `${words.reset} · ${3 - cracks} colpi` : words.reset}
      title={
        animated
          ? `Tre colpi per riportare la foto alla composizione di partenza (${flavour.reset})`
          : 'Riporta la foto alla composizione di partenza'
      }
      onClick={animated ? handleClick : onReset}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M20 12a8 8 0 1 1-2.4-5.7" />
          <path d="M20 4v4.5h-4.5" />
        </svg>
      }
      art={
        <svg
          ref={rockRef}
          key={generation}
          width="30"
          height="30"
          viewBox="0 0 34 34"
          style={{
            transformOrigin: '50% 90%',
            animation: `rock-regrow ${(0.55 / speed).toFixed(2)}s cubic-bezier(0.34, 1.2, 0.64, 1)`
          }}
        >
          <ResetArt presetId={preset.id} hits={cracks} broken={broken} speed={speed} />
        </svg>
      }
    />
  )
}
