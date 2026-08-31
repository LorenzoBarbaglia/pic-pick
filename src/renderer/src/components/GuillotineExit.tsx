import { useEffect, useRef, useState } from 'react'
import { sound } from '../lib/sound'
import { usePreset } from '../lib/preset'
import { ToolChip } from './StageTools'
import { FinishArt, worldFlavour, worldWords } from './WorldIcons'

interface GuillotineExitProps {
  onDone: () => void
}

/**
 * Il comando «ho finito». Ogni mondo lo festeggia a modo suo: la ghigliottina
 * taglia la carota, la costellazione si completa, il braciere si spegne, la
 * stampa va ad asciugare sul filo.
 */
export function GuillotineExit({ onDone }: GuillotineExitProps) {
  const { preset, animated } = usePreset()
  const speed = preset.motion.speed
  const [chopping, setChopping] = useState(false)
  const timersRef = useRef<number[]>([])

  useEffect(
    () => () => {
      for (const timer of timersRef.current) clearTimeout(timer)
    },
    []
  )

  const handleClick = (): void => {
    if (chopping) return
    if (!animated) {
      onDone()
      return
    }
    setChopping(true)
    timersRef.current.push(window.setTimeout(() => sound.crack(), 240 / speed))
    timersRef.current.push(window.setTimeout(onDone, 1100 / speed))
  }

  const words = worldWords(preset.id)
  const flavour = worldFlavour(preset.id)

  return (
    <ToolChip
      label={chopping ? 'Album approvato' : words.finish}
      title={`Sono soddisfatto: chiudi l'album e vai al riepilogo (${flavour.finish})`}
      active={chopping}
      onClick={handleClick}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12.5 9 17.5 20 6.5" />
        </svg>
      }
      art={
        <svg width="30" height="30" viewBox="0 0 34 34" fill="none">
          <FinishArt presetId={preset.id} done={chopping} speed={speed} />
        </svg>
      }
    />
  )
}
