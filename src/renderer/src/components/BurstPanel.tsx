import { useEffect, useState } from 'react'
import { CheckMark, CompareMark } from './Icons'
import type { ImageFile } from '../types'
import { getThumb, peekInfo, peekThumb } from '../lib/thumbs'
import { shortTime } from '../lib/scenes'
import { LAYER } from '../lib/interactions'

interface BurstPanelProps {
  queue: ImageFile[]
  /** posizioni in coda che appartengono alla raffica corrente */
  sceneIndices: number[]
  index: number
  onJump: (index: number) => void
  onClose: () => void
}

/**
 * Una foto del confronto, caricata a piena risoluzione: qui si sceglie tra
 * scatti quasi identici, e le miniature non bastano.
 */
function CompareCell({ file }: { file: ImageFile }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let created: string | null = null
    void window.picpick.readImage(file.path).then((bytes) => {
      if (cancelled) return
      created = URL.createObjectURL(new Blob([bytes]))
      setUrl(created)
    })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [file.path])

  const info = peekInfo(file.path)
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
      <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--pp-radius)] bg-[var(--pp-scrim)] ring-1 ring-[var(--pp-line)]">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="grid h-full w-full place-items-center text-xs text-[var(--pp-ink-dim)]">…</span>
        )}
      </div>
      <p className="flex items-center justify-between px-1 text-[11px] text-[var(--pp-ink-dim)]">
        <span className="truncate">{file.name}</span>
        {info && info.sharpness > 0 && (
          <span className="ml-2 shrink-0 tabular-nums">nitidezza {info.sharpness}</span>
        )}
      </p>
    </div>
  )
}

/**
 * La raffica: gli scatti nati nello stesso momento, messi uno accanto all'altro.
 * Serve a scegliere la migliore di una serie quasi identica — e con la spunta
 * su due, tre o quattro scatti si aprono affiancati a piena risoluzione.
 */
export function BurstPanel({ queue, sceneIndices, index, onJump, onClose }: BurstPanelProps) {
  const [, setTick] = useState(0)
  /** gli scatti spuntati per il confronto affiancato (max 4) */
  const [chosen, setChosen] = useState<number[]>([])
  const [comparing, setComparing] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      for (const i of sceneIndices) {
        if (cancelled) return
        const file = queue[i]
        if (!file || peekThumb(file.path)) continue
        const thumb = await getThumb(file.path, 480)
        if (thumb && !cancelled) setTick((t) => t + 1)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [queue, sceneIndices])

  // Esc chiude prima il confronto, poi il pannello
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (comparing) setComparing(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [comparing, onClose])

  const toggleChosen = (i: number): void => {
    setChosen((prev) => {
      if (prev.includes(i)) return prev.filter((x) => x !== i)
      if (prev.length >= 4) return prev
      return [...prev, i]
    })
  }

  const columns = sceneIndices.length <= 2 ? 2 : sceneIndices.length <= 6 ? 3 : 4

  // la più nitida del gruppo: in una raffica di scatti quasi identici è
  // l'informazione che serve davvero
  const sharpest = (() => {
    let best = -1
    let bestScore = 0
    for (const i of sceneIndices) {
      const info = peekInfo(queue[i]?.path ?? '')
      if (!info || info.sharpness <= bestScore) continue
      bestScore = info.sharpness
      best = i
    }
    return bestScore > 0 ? best : -1
  })()

  return (
    <div
      className="absolute inset-0 flex flex-col bg-[var(--pp-surface)] backdrop-blur"
      style={{ zIndex: LAYER.overlay }}
    >
      <div className="flex items-center gap-3 border-b border-[var(--pp-line)] px-5 py-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Raffica · {sceneIndices.length} scatti
        </h2>
        <span className="text-xs text-[var(--pp-ink-dim)]">
          clicca uno scatto per portarlo nell'editor · spunta per confrontare · S per chiudere
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded-[var(--pp-radius)] border border-[var(--pp-line)] px-3 py-1 text-sm text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]"
        >
          Chiudi
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {sceneIndices.map((i) => {
            const file = queue[i]
            if (!file) return null
            const info = peekInfo(file.path)
            const thumb = info?.dataUrl ?? peekThumb(file.path)
            const isCurrent = i === index
            const picked = chosen.includes(i)
            return (
              <div key={file.path} className="relative">
                <button
                  onClick={() => {
                    onJump(i)
                    onClose()
                  }}
                  title={file.name}
                  className={`w-full overflow-hidden rounded-[var(--pp-radius-lg)] transition-transform hover:scale-[1.02] ${
                    isCurrent ? 'ring-2 ring-[var(--pp-accent)]' : 'ring-1 ring-[var(--pp-line)]'
                  }`}
                >
                  {thumb ? (
                    <img src={thumb} alt="" className="aspect-[4/3] w-full bg-[var(--pp-scrim)] object-contain" />
                  ) : (
                    <span className="grid aspect-[4/3] w-full place-items-center bg-[var(--pp-panel)] text-xs text-[var(--pp-ink-dim)]">
                      …
                    </span>
                  )}
                  <span className="flex items-center justify-between px-2 py-1 text-[11px] text-[var(--pp-ink-dim)]">
                    <span className="truncate">{file.name}</span>
                    <span className="ml-2 flex shrink-0 items-center gap-1.5">
                      {info && info.sharpness > 0 && (
                        <span
                          title={`Nitidezza ${info.sharpness}/100`}
                          className={
                            i === sharpest
                              ? 'rounded bg-emerald-400/90 px-1 font-semibold text-stone-900'
                              : 'tabular-nums'
                          }
                        >
                          {i === sharpest ? 'più nitida' : info.sharpness}
                        </span>
                      )}
                      <span className="tabular-nums">{shortTime(file.takenAt)}</span>
                    </span>
                  </span>
                </button>
                {/* la spunta del confronto: si sceglie chi mettere fianco a fianco */}
                <button
                  onClick={() => toggleChosen(i)}
                  title={picked ? 'Togli dal confronto' : 'Aggiungi al confronto (max 4)'}
                  className={`absolute top-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-[var(--pp-radius)] text-xs ${
                    picked
                      ? 'bg-[var(--pp-accent)] text-[var(--pp-on-accent)]'
                      : 'bg-[var(--pp-scrim)] text-[var(--pp-ink)] ring-1 ring-[var(--pp-line)] hover:text-[var(--pp-ink-strong)]'
                  }`}
                >
                  {picked ? <CheckMark size={13} /> : <CompareMark size={13} />}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* la barra del confronto appare solo quando ha senso */}
      {chosen.length >= 2 && !comparing && (
        <div className="flex items-center justify-center gap-3 border-t border-[var(--pp-line)] px-5 py-3">
          <button
            onClick={() => setComparing(true)}
            className="rounded-[var(--pp-radius)] bg-[var(--pp-accent)] px-5 py-2 text-sm font-semibold text-[var(--pp-on-accent)] hover:bg-[var(--pp-accent-hover)]"
          >
            Confronta {chosen.length} affiancate
          </button>
          <button
            onClick={() => setChosen([])}
            className="text-xs text-[var(--pp-ink-dim)] hover:text-[var(--pp-ink-strong)]"
          >
            Svuota
          </button>
        </div>
      )}

      {/* il confronto: piena risoluzione, fianco a fianco */}
      {comparing && (
        <div
          className="absolute inset-0 flex flex-col gap-3 bg-[var(--pp-surface)] p-4"
          style={{ zIndex: LAYER.toast }}
        >
          <div className="flex items-center gap-3">
            <p className="text-xs tracking-wide text-[var(--pp-ink-dim)] uppercase">
              Confronto · {chosen.length} scatti
            </p>
            <button
              onClick={() => setComparing(false)}
              className="ml-auto rounded-[var(--pp-radius)] border border-[var(--pp-line)] px-3 py-1 text-sm text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]"
            >
              Torna alla raffica
            </button>
          </div>
          <div className="flex min-h-0 flex-1 gap-3">
            {chosen.map((i) => queue[i] && <CompareCell key={queue[i].path} file={queue[i]} />)}
          </div>
        </div>
      )}
    </div>
  )
}
