import { useEffect, useRef, useState } from 'react'
import { SKIP_TINT } from '../lib/palette'
import { CheckMark } from './Icons'
import type { ImageFile, SortBubble } from '../types'
import { getThumb, peekInfo, peekThumb } from '../lib/thumbs'
import { fullStamp, shortTime } from '../lib/scenes'

interface FilmstripProps {
  queue: ImageFile[]
  /** posizione corrente: tutto ciò che sta prima è già stato deciso */
  index: number
  /** fileName → id bolla oppure 'skip' */
  decided: Record<string, string>
  bubbles: SortBubble[]
  /** indice di scena per ogni posizione della coda: cambia = nuova raffica */
  sceneOf: number[]
  /** foto rimandate con «Forse»: alimentano il filtro */
  laterNames: Set<string>
  onJump: (index: number) => void
}

/** cosa mostra la striscia */
type StripFilter = 'tutte' | 'dafare' | 'forse'

/** quante foto attorno alla corrente vale la pena preparare */
const WINDOW = 24
/** quante ne restano nel DOM: oltre, due spaziatori tengono la scrollbar onesta */
const RENDER_BEFORE = 40
const RENDER_AFTER = 80
/** larghezza di una casella + gap, per dimensionare gli spaziatori */
const CELL_PX = 60

/**
 * La striscia della coda: dove sono, cosa arriva, cosa ho già deciso e con
 * quale bolla. È la mappa della sessione, e permette di tornare su una foto
 * senza annullare nulla.
 */
export function Filmstrip({
  queue,
  index,
  decided,
  bubbles,
  sceneOf,
  laterNames,
  onJump
}: FilmstripProps) {
  const [, setTick] = useState(0)
  const [filter, setFilter] = useState<StripFilter>('tutte')
  const activeRef = useRef<HTMLButtonElement>(null)

  // prepara solo la finestra attorno alla foto corrente
  useEffect(() => {
    let cancelled = false
    const from = Math.max(0, index - WINDOW / 2)
    const to = Math.min(queue.length, index + WINDOW)
    const load = async (): Promise<void> => {
      for (let i = from; i < to; i++) {
        if (cancelled) return
        const file = queue[i]
        if (!file || peekThumb(file.path)) continue
        const thumb = await getThumb(file.path, 120)
        if (thumb && !cancelled) setTick((t) => t + 1)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [index, queue])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [index])

  const tintOf = (fileName: string): string | null => {
    const outcome = decided[fileName]
    if (!outcome) return null
    if (outcome === 'skip') return SKIP_TINT
    return bubbles.find((b) => b.id === outcome)?.tint ?? '168, 162, 158'
  }

  // il filtro riduce la striscia a ciò che conta in quel momento
  const entries = queue
    .map((file, i) => ({ file, i }))
    .filter(({ file }) => {
      if (filter === 'tutte') return true
      const done = decided[file.name] !== undefined
      if (filter === 'dafare') return !done
      return laterNames.has(file.name) && !done
    })
  const activePos = entries.findIndex((entry) => entry.i === index)
  const forseCount = queue.filter(
    (file) => laterNames.has(file.name) && decided[file.name] === undefined
  ).length

  // finestra di rendering: con cartelle da migliaia di foto il DOM resta leggero
  const anchor = activePos >= 0 ? activePos : 0
  const from = Math.max(0, anchor - RENDER_BEFORE)
  const to = Math.min(entries.length, anchor + RENDER_AFTER)

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-t border-[var(--pp-line)] bg-[var(--pp-scrim)] px-3 py-2">
      {/* il filtro: tre parole, non un pannello */}
      <div className="sticky left-0 z-10 flex shrink-0 flex-col gap-1 rounded-[var(--pp-radius)] bg-[var(--pp-scrim)] p-1 backdrop-blur-sm">
        {(
          [
            { id: 'tutte' as StripFilter, label: 'Tutte' },
            { id: 'dafare' as StripFilter, label: 'Da fare' },
            { id: 'forse' as StripFilter, label: `Forse${forseCount > 0 ? ` ${forseCount}` : ''}` }
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            onClick={() => setFilter(option.id)}
            disabled={option.id === 'forse' && forseCount === 0}
            className={`rounded px-1.5 py-0.5 text-left text-[10px] whitespace-nowrap disabled:opacity-30 ${
              filter === option.id
                ? 'bg-[var(--pp-accent)] font-semibold text-[var(--pp-on-accent)]'
                : 'text-[var(--pp-ink-dim)] hover:text-[var(--pp-ink-strong)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {entries.length === 0 && (
        <span className="flex items-center gap-1.5 px-3 text-xs text-[var(--pp-ink-dim)]">
          {filter === 'dafare' && <CheckMark size={12} className="text-emerald-400" />}
          {filter === 'dafare' ? 'Tutte decise.' : 'Nessuna foto qui.'}
        </span>
      )}
      {from > 0 && <span className="shrink-0" style={{ width: from * CELL_PX }} />}
      {entries.slice(from, to).map(({ file, i }, offset) => {
        const position = from + offset
        const info = peekInfo(file.path)
        const thumb = info?.dataUrl ?? peekThumb(file.path)
        // il punteggio arriva insieme alla miniatura: 0 vuol dire «non misurata»
        const soft = info !== null && info.sharpness > 0 && info.sharpness < 32
        const tint = tintOf(file.name)
        const isActive = i === index
        // i separatori di scena hanno senso solo sulla coda intera
        const previous = position > 0 ? entries[position - 1] : null
        const newScene =
          filter === 'tutte' && previous !== null && sceneOf[i] !== sceneOf[previous.i]
        return (
          <div key={file.path} className="flex shrink-0 items-center gap-1">
            {newScene && (
              <div className="flex h-12 flex-col items-center justify-center px-1">
                <span className="h-8 w-px bg-[var(--pp-accent)]/40" />
                <span className="mt-0.5 text-[9px] text-[var(--pp-ink-dim)] tabular-nums">
                  {shortTime(file.takenAt)}
                </span>
              </div>
            )}
            <button
              ref={isActive ? activeRef : undefined}
              onClick={() => onJump(i)}
              title={`${file.name} · ${fullStamp(file.takenAt)}`}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--pp-radius)] transition-transform ${
                isActive
                  ? 'scale-110 ring-2 ring-[var(--pp-accent)]'
                  : 'ring-1 ring-[var(--pp-line)] hover:ring-[var(--pp-line-strong)]'
              }`}
            >
              {thumb ? (
                <img
                  src={thumb}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ opacity: tint ? 0.45 : 1 }}
                />
              ) : (
                <span className="block h-full w-full bg-[var(--pp-panel)]" />
              )}
              {tint && (
                <span
                  className="absolute right-0 bottom-0 left-0 h-1.5"
                  style={{ backgroundColor: `rgb(${tint})` }}
                />
              )}
              {i === index && (
                <span className="absolute inset-x-0 top-0 h-1 bg-[var(--pp-accent)]" />
              )}
              {/* sospetto mosso: un segno discreto, non un verdetto */}
              {soft && !tint && (
                <span
                  title={`Nitidezza bassa (${info?.sharpness}/100): controlla il fuoco con V`}
                  className="absolute top-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400/90 text-[9px] font-bold text-stone-900"
                >
                  !
                </span>
              )}
            </button>
          </div>
        )
      })}
      {to < entries.length && (
        <span className="shrink-0" style={{ width: (entries.length - to) * CELL_PX }} />
      )}
    </div>
  )
}
