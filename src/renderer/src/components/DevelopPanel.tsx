import { useEffect, useRef, useState } from 'react'
import { ChevronMark, ClipMark, CloseMark } from './Icons'
import {
  BW_FILTER_LABELS,
  BW_FILTERS,
  LOOKS,
  lookById,
  mixLabel,
  mixLooks,
  NEUTRAL_DEVELOP,
  touchedCount
} from '../lib/develop'
import type { BwFilter, Develop, LookDose, NumericKey } from '../lib/develop'
import { removeUserLook, saveUserLook, useUserLooks } from '../lib/userLooks'
import { deleteLut, ensureLut, importLuts, lutLabel, useLuts } from '../lib/lut'
import { exportLookAsCube } from '../lib/useDeveloped'
import type { DevelopedImage } from '../lib/useDeveloped'
import { LAYER } from '../lib/interactions'

interface DevelopPanelProps {
  develop: Develop
  /** sviluppo di partenza dell'album: serve al confronto e al ripristino */
  baseDevelop: Develop
  /** miscela di look attiva, con i rispettivi pesi */
  doses: LookDose[]
  onDoses: (doses: LookDose[]) => void
  onChange: (patch: Partial<Develop>) => void
  onResetToAlbum: () => void
  /** promuove queste regolazioni a partenza per tutte le prossime foto */
  onApplyToAll: () => void
  onClose: () => void
  /** la foto sviluppata: alimenta la montagna di luce */
  developed: DevelopedImage
  /** punto di partenza automatico dall'istogramma */
  onAuto: () => void
  /** contagocce del bianco: clic su un grigio della foto */
  wbPicking: boolean
  onWbPick: () => void
  /** nitidezza misurata sul ritaglio corrente */
  onAutoSharpen: () => void
  /** anteprima al passaggio su un look (null = torna al reale) */
  onHover: (develop: Develop | null) => void
  /** copia lo sviluppo dell'ultima foto lavorata (null = non disponibile) */
  onCopyPrevious: (() => void) | null
  /** quante sorelle ha la raffica corrente (0 = nessuna) */
  sceneCount: number
  onApplyToScene: () => void
}

interface SliderSpec {
  key: NumericKey
  label: string
  min: number
  max: number
  /** sfondo del cursore, per gli slider di colore */
  track?: string
}

const HUE_TRACK =
  'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'

const GROUPS: { id: string; title: string; note?: string; sliders: SliderSpec[] }[] = [
  {
    id: 'luce',
    title: 'Luce',
    note: 'esposizione e contrasto lavorano in luce lineare, come su una pellicola',
    sliders: [
      { key: 'exposure', label: 'Esposizione', min: -100, max: 100 },
      { key: 'contrast', label: 'Contrasto', min: -100, max: 100 },
      { key: 'highlights', label: 'Alte luci', min: -100, max: 100 },
      { key: 'shadows', label: 'Ombre', min: -100, max: 100 },
      { key: 'whites', label: 'Bianchi', min: -100, max: 100 },
      { key: 'blacks', label: 'Neri', min: -100, max: 100 }
    ]
  },
  {
    id: 'dettaglio',
    title: 'Dettaglio',
    note: 'la chiarezza allarga il respiro dei mezzitoni, la nitidezza definisce i bordi fini — guardala con la lente (Z), a schermo intero si vede poco',
    sliders: [
      { key: 'clarity', label: 'Chiarezza · contrasto locale', min: -100, max: 100 },
      { key: 'sharpness', label: 'Nitidezza · bordi', min: 0, max: 100 }
    ]
  },
  {
    id: 'colore',
    title: 'Colore',
    note: 'la vividezza agisce sui colori tenui e risparmia gli incarnati',
    sliders: [
      {
        key: 'temperature',
        label: 'Temperatura',
        min: -100,
        max: 100,
        track: 'linear-gradient(90deg, #4a90ff, #8a8a8a, #ffb04a)'
      },
      {
        key: 'tint',
        label: 'Tinta',
        min: -100,
        max: 100,
        track: 'linear-gradient(90deg, #4ade80, #8a8a8a, #e879f9)'
      },
      { key: 'vibrance', label: 'Vividezza', min: -100, max: 100 },
      { key: 'saturation', label: 'Saturazione', min: -100, max: 100 }
    ]
  },
  {
    id: 'fasce',
    title: 'Fasce di colore',
    note: 'le tre fasce che contano in fotografia: pelle, cielo, verde',
    sliders: [
      { key: 'skinSat', label: 'Incarnati · saturazione', min: -100, max: 100 },
      { key: 'skinLum', label: 'Incarnati · luminosità', min: -100, max: 100 },
      { key: 'skySat', label: 'Cieli · saturazione', min: -100, max: 100 },
      { key: 'skyLum', label: 'Cieli · luminosità', min: -100, max: 100 },
      { key: 'greenSat', label: 'Verdi · saturazione', min: -100, max: 100 },
      { key: 'greenLum', label: 'Verdi · luminosità', min: -100, max: 100 }
    ]
  },
  {
    id: 'viraggio',
    title: 'Viraggio a tre vie',
    note: 'ombre, mezzitoni e luci possono prendere tinte diverse',
    sliders: [
      { key: 'gradeLowHue', label: 'Ombre · tinta', min: 0, max: 360, track: HUE_TRACK },
      { key: 'gradeLowSat', label: 'Ombre · intensità', min: 0, max: 100 },
      { key: 'gradeMidHue', label: 'Mezzitoni · tinta', min: 0, max: 360, track: HUE_TRACK },
      { key: 'gradeMidSat', label: 'Mezzitoni · intensità', min: 0, max: 100 },
      { key: 'gradeHighHue', label: 'Luci · tinta', min: 0, max: 360, track: HUE_TRACK },
      { key: 'gradeHighSat', label: 'Luci · intensità', min: 0, max: 100 }
    ]
  },
  {
    id: 'stampa',
    title: 'Stampa',
    sliders: [
      { key: 'fade', label: 'Neri alzati (matte)', min: 0, max: 100 },
      { key: 'vignette', label: 'Vignettatura', min: 0, max: 100 },
      { key: 'vignetteFeather', label: 'Morbidezza vignetta', min: 0, max: 100 },
      { key: 'grain', label: 'Grana', min: 0, max: 100 },
      { key: 'grainSize', label: 'Grossezza del granulo', min: 0, max: 100 }
    ]
  }
]

/** gli slider della striscia rapida: il 90% del lavoro senza aprire nulla */
const QUICK_KEYS: NumericKey[] = ['exposure', 'contrast', 'temperature', 'vibrance']

const OPEN_KEY = 'picpick-dev-open'

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readOpenGroups(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : ['luce']
  } catch {
    return ['luce']
  }
}

/**
 * Uno slider da editor, non da modulo web: frecce = ±1 (con Shift ±10), doppio
 * clic sulla traccia = azzera, clic sul numero = si digita, e rilasciando col
 * mouse vicino allo zero scatta sullo zero — il valore «nessuna regolazione»
 * merita una calamita.
 */
function DevSlider({
  spec,
  value,
  base,
  compact = false,
  onChange
}: {
  spec: SliderSpec
  value: number
  base: number
  compact?: boolean
  onChange: (value: number) => void
}) {
  const [typing, setTyping] = useState<string | null>(null)
  const changed = value !== base
  const neutral = NEUTRAL_DEVELOP[spec.key]

  const commit = (text: string): void => {
    const parsed = Number.parseInt(text, 10)
    if (Number.isFinite(parsed)) onChange(clampValue(parsed, spec.min, spec.max))
    setTyping(null)
  }

  return (
    <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
      <div className="flex items-baseline justify-between gap-2">
        <button
          onDoubleClick={() => onChange(neutral)}
          title="Doppio clic per azzerare"
          className={`truncate text-xs ${changed ? 'text-[var(--pp-accent)]' : 'text-[var(--pp-ink-dim)]'}`}
        >
          {spec.label}
        </button>
        {typing === null ? (
          <button
            onClick={() => setTyping(String(value))}
            title="Clicca per digitare il valore"
            className="shrink-0 rounded px-1 text-xs text-[var(--pp-ink-dim)] tabular-nums hover:bg-[var(--pp-panel)] hover:text-[var(--pp-ink-strong)]"
          >
            {value}
          </button>
        ) : (
          <input
            autoFocus
            value={typing}
            onChange={(e) => setTyping(e.target.value)}
            onBlur={() => commit(typing)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(typing)
              if (e.key === 'Escape') setTyping(null)
            }}
            className="w-12 shrink-0 rounded border border-[var(--pp-accent)]/60 bg-transparent px-1 text-right text-xs outline-none"
          />
        )}
      </div>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(neutral)}
        onKeyDown={(e) => {
          if (!e.shiftKey) return
          const direction =
            e.key === 'ArrowRight' || e.key === 'ArrowUp'
              ? 1
              : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
                ? -1
                : 0
          if (direction === 0) return
          e.preventDefault()
          onChange(clampValue(value + direction * 10, spec.min, spec.max))
        }}
        onPointerUp={() => {
          // calamita sullo zero: solo col mouse, la tastiera resta chirurgica
          if (spec.min < 0 && value !== 0 && Math.abs(value) <= 2) onChange(0)
        }}
        className="w-full accent-[var(--pp-accent)]"
        style={spec.track ? { background: spec.track, borderRadius: 999, height: 6 } : undefined}
      />
    </div>
  )
}

/**
 * La montagna di luce: l'istogramma della foto sviluppata, disegnato col colore
 * del mondo. Le regolazioni si fanno guardando questa, non fidandosi del
 * monitor. Ai piedi, gli avvisi: neri chiusi a sinistra, luci bruciate a destra.
 */
function Histogram({ developed }: { developed: DevelopedImage }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [clipping, setClipping] = useState({ low: 0, high: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)
    const source = developed.canvas
    if (!source) return

    // campione ridotto: 128 px bastano per un istogramma onesto
    const sample = document.createElement('canvas')
    sample.width = 128
    sample.height = Math.max(1, Math.round((128 * source.height) / source.width))
    const sampleCtx = sample.getContext('2d', { willReadFrequently: true })
    if (!sampleCtx) return
    sampleCtx.drawImage(source, 0, 0, sample.width, sample.height)
    const data = sampleCtx.getImageData(0, 0, sample.width, sample.height).data

    const BINS = 64
    const bins = new Float32Array(BINS)
    let low = 0
    let high = 0
    const total = data.length / 4
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r <= 2 && g <= 2 && b <= 2) low += 1
      if (r >= 253 || g >= 253 || b >= 253) high += 1
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      bins[Math.min(BINS - 1, Math.floor((l / 256) * BINS))] += 1
    }
    setClipping({ low: low / total, high: high / total })

    // scala logaritmica: la montagna si vede anche quando un bin domina
    const max = Math.max(1, ...bins)
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--pp-accent-rgb')
      .trim()

    ctx.beginPath()
    ctx.moveTo(0, height)
    for (let i = 0; i < BINS; i++) {
      const x = (i / (BINS - 1)) * width
      const value = Math.log1p(bins[i]) / Math.log1p(max)
      ctx.lineTo(x, height - value * (height - 3))
    }
    ctx.lineTo(width, height)
    ctx.closePath()
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, `rgba(${accent}, 0.55)`)
    gradient.addColorStop(1, `rgba(${accent}, 0.12)`)
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = `rgba(${accent}, 0.9)`
    ctx.lineWidth = 1.2
    ctx.stroke()
  }, [developed.version, developed.canvas])

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] tracking-wide text-[var(--pp-ink-dim)] uppercase">La luce</p>
        <div className="flex gap-2 text-[10px]">
          {clipping.low > 0.005 && (
            <span className="text-sky-400" title="Una parte dei neri è completamente chiusa">
              <ClipMark side="low" className="mr-0.5 inline-block align-[-1px]" /> neri chiusi {(clipping.low * 100).toFixed(0)}%
            </span>
          )}
          {clipping.high > 0.005 && (
            <span className="text-amber-400" title="Una parte delle luci è completamente bruciata">
              luci bruciate {(clipping.high * 100).toFixed(0)}%{' '}
              <ClipMark side="high" className="ml-0.5 inline-block align-[-1px]" />
            </span>
          )}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={280}
        height={54}
        className="w-full rounded-[var(--pp-radius)] bg-[var(--pp-panel)]"
      />
    </div>
  )
}

/**
 * Camera di sviluppo, seconda vita.
 *
 * In cima la striscia rapida (Auto, contagocce e i quattro slider che coprono
 * il 90% del lavoro) e la montagna di luce; sotto, tutto il resto in cassetti
 * che si aprono solo se servono. Mentre trascini uno slider il pannello si fa
 * da parte, quasi trasparente: in quel momento stai guardando la foto.
 */
export function DevelopPanel({
  develop,
  baseDevelop,
  doses,
  onDoses,
  onChange,
  onResetToAlbum,
  onApplyToAll,
  onClose,
  developed,
  onAuto,
  wbPicking,
  onWbPick,
  onAutoSharpen,
  onHover,
  onCopyPrevious,
  sceneCount,
  onApplyToScene
}: DevelopPanelProps) {
  const mine = useUserLooks()
  const luts = useLuts()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [exported, setExported] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<string[]>(readOpenGroups)
  /** vero mentre si trascina uno slider: il pannello si fa da parte */
  const [peeking, setPeeking] = useState(false)

  // il LUT scelto va caricato: al termine il rendering si aggiorna da solo
  if (develop.lutName) ensureLut(develop.lutName)

  useEffect(() => {
    const stop = (): void => setPeeking(false)
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  const toggleGroup = (id: string): void => {
    setOpenGroups((prev) => {
      const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next))
      } catch {
        // pazienza
      }
      return next
    })
  }

  const doseOf = (id: string): number => doses.find((d) => d.id === id)?.weight ?? 0
  const activeDoses = doses.filter((d) => d.weight > 0)

  const toggleLook = (id: string): void => {
    onHover(null)
    const current = doseOf(id)
    if (current > 0) {
      onDoses(doses.filter((d) => d.id !== id))
      return
    }
    // il primo look entra pieno, i successivi a metà: si dosano subito dopo
    onDoses([
      ...doses.filter((d) => d.weight > 0),
      { id, weight: activeDoses.length === 0 ? 100 : 50 }
    ])
  }

  /** l'anteprima al passaggio mostra cosa succederebbe cliccando */
  const hoverLook = (id: string): void => {
    const current = doseOf(id)
    const hypothetical =
      current > 0
        ? doses.filter((d) => d.id !== id)
        : [
            ...doses.filter((d) => d.weight > 0),
            { id, weight: activeDoses.length === 0 ? 100 : 50 }
          ]
    onHover(mixLooks(hypothetical))
  }

  const setDose = (id: string, weight: number): void => {
    onDoses(doses.map((d) => (d.id === id ? { ...d, weight } : d)))
  }

  const confirmSave = (): void => {
    const look = saveUserLook(name, develop)
    setNaming(false)
    setName('')
    onDoses([{ id: look.id, weight: 100 }])
  }

  const exportCube = async (): Promise<void> => {
    const title = mixLabel(doses) === 'Nessun look' ? 'pic&pick look' : mixLabel(doses)
    const text = exportLookAsCube(title, develop)
    if (!text) return
    const saved = await window.picpick.exportLut(
      `${title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'look'}.cube`,
      text
    )
    if (saved) {
      setExported(saved.split(/[\\/]/).pop() ?? saved)
      window.setTimeout(() => setExported(null), 3000)
    }
  }

  const manual = touchedCount(develop, baseDevelop) > 0
  const quickSpecs = QUICK_KEYS.map(
    (key) => GROUPS.flatMap((g) => g.sliders).find((s) => s.key === key)!
  )

  const chipClass = (active: boolean): string =>
    `pp-tool-flat rounded-[var(--pp-radius)] px-2 py-1 text-xs ${
      active
        ? 'bg-[var(--pp-accent)] text-[var(--pp-on-accent)]'
        : 'bg-[var(--pp-panel)] text-[var(--pp-ink)] hover:bg-[var(--pp-panel)]'
    }`

  // Esc chiude, come raffica e confronto: il riflesso deve valere ovunque
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="absolute inset-y-0 right-0 flex w-[330px] flex-col border-l border-[var(--pp-line)] bg-[var(--pp-surface)] backdrop-blur-md"
      style={{
        zIndex: LAYER.panel,
        opacity: peeking ? 0.13 : 1,
        transition: 'opacity 180ms ease'
      }}
    >
      <div className="flex items-center gap-2 border-b border-[var(--pp-line)] px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Sviluppo</h2>
        {manual && <span className="text-[10px] text-[var(--pp-accent)]">modificato a mano</span>}
        <button
          onClick={onClose}
          title="Chiudi (D)"
          className="ml-auto rounded p-1 text-[var(--pp-ink-dim)] hover:text-[var(--pp-ink-strong)]"
        >
          <CloseMark />
        </button>
      </div>

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3"
        onPointerDownCapture={(e) => {
          if ((e.target as HTMLElement).matches('input[type="range"]')) setPeeking(true)
        }}
      >
        {/* striscia rapida: Auto, contagocce e i quattro slider del 90% */}
        <div className="space-y-2.5">
          <div className="flex gap-1.5">
            <button
              onClick={onAuto}
              title="Punto di partenza dall'istogramma: esposizione, bianchi, neri, contrasto"
              className="pp-tool-flat flex-1 rounded-[var(--pp-radius)] border border-[var(--pp-line)] py-1.5 text-xs text-[var(--pp-ink)] hover:border-[var(--pp-accent)] hover:text-[var(--pp-accent)]"
            >
              <svg
                className="mr-1 inline-block align-[-1px]"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2Z" />
              </svg>
              Auto
            </button>
            <button
              onClick={onWbPick}
              title="Contagocce del bianco: clicca sulla foto un punto che dovrebbe essere grigio o bianco"
              className={`pp-tool-flat flex-1 rounded-[var(--pp-radius)] border py-1.5 text-xs ${
                wbPicking
                  ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/15 text-[var(--pp-accent)]'
                  : 'border-[var(--pp-line)] text-[var(--pp-ink)] hover:border-[var(--pp-accent)] hover:text-[var(--pp-accent)]'
              }`}
            >
              <svg
                className="mr-1 inline-block align-[-1px]"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />
              </svg>
              Bianco
            </button>
            <button
              onClick={onAutoSharpen}
              title="Misura quanto è nitido il ritaglio (e quanto verrà ingrandito) e dosa nitidezza e chiarezza di conseguenza"
              className="pp-tool-flat flex-1 rounded-[var(--pp-radius)] border border-[var(--pp-line)] py-1.5 text-xs text-[var(--pp-ink)] hover:border-[var(--pp-accent)] hover:text-[var(--pp-accent)]"
            >
              <svg
                className="mr-1 inline-block align-[-1px]"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 20 12 4l9 16" />
                <path d="M8 15h8" />
              </svg>
              Nitidezza
            </button>
          </div>
          {quickSpecs.map((spec) => (
            <DevSlider
              key={spec.key}
              spec={spec}
              value={develop[spec.key]}
              base={baseDevelop[spec.key]}
              compact
              onChange={(value) => onChange({ [spec.key]: value })}
            />
          ))}
        </div>

        <Histogram developed={developed} />

        {/* i cassetti: aperto solo ciò che serve */}
        <div className="space-y-1.5">
          {/* Look, Miei look e LUT vivono in un unico cassetto */}
          <div className="rounded-[var(--pp-radius)] bg-white/[0.03]">
            <button
              onClick={() => toggleGroup('look')}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
            >
              <ChevronMark
                className="text-[var(--pp-ink-dim)] transition-transform"
                style={{
                  transform: openGroups.includes('look') ? 'rotate(90deg)' : 'rotate(0deg)'
                }}
              />
              <span className="text-[11px] tracking-wide text-[var(--pp-ink-dim)] uppercase">Look</span>
              {activeDoses.length > 0 && (
                <span className="ml-auto truncate text-[10px] text-[var(--pp-accent)]">
                  {mixLabel(doses)}
                </span>
              )}
            </button>
            {openGroups.includes('look') && (
              <div
                className="space-y-3 px-2.5 pb-3"
                style={{ animation: 'dev-open 160ms ease-out' }}
              >
                <p className="text-[10px] text-[var(--pp-ink-dim)]">
                  si sommano: passaci sopra per l&apos;anteprima, clicca per applicare
                </p>
                <div className="flex flex-wrap gap-1.5" onMouseLeave={() => onHover(null)}>
                  {LOOKS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => toggleLook(option.id)}
                      onMouseEnter={() => hoverLook(option.id)}
                      title={`${option.hint} · ${option.source}`}
                      className={chipClass(doseOf(option.id) > 0)}
                    >
                      {option.label}
                      {doseOf(option.id) > 0 && doseOf(option.id) !== 100 && (
                        <span className="ml-1 opacity-70">{doseOf(option.id)}</span>
                      )}
                    </button>
                  ))}
                </div>

                {mine.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" onMouseLeave={() => onHover(null)}>
                    {mine.map((look) => (
                      <span
                        key={look.id}
                        className={`group flex items-center gap-1 rounded-[var(--pp-radius)] py-1 pr-1 pl-2 text-xs ${
                          doseOf(look.id) > 0
                            ? 'bg-[var(--pp-accent)] text-[var(--pp-on-accent)]'
                            : 'bg-[var(--pp-panel)] text-[var(--pp-ink)]'
                        }`}
                      >
                        <button
                          onClick={() => toggleLook(look.id)}
                          onMouseEnter={() => hoverLook(look.id)}
                          title="Look salvato da te"
                        >
                          {look.label}
                          {doseOf(look.id) > 0 && doseOf(look.id) !== 100 && (
                            <span className="ml-1 opacity-70">{doseOf(look.id)}</span>
                          )}
                        </button>
                        <button
                          onClick={() => removeUserLook(look.id)}
                          title="Elimina questo look"
                          className="rounded px-1 opacity-40 hover:opacity-100"
                        >
                          <CloseMark size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {activeDoses.length > 0 && (
                  <div className="space-y-2 rounded-[var(--pp-radius)] bg-[var(--pp-panel)] p-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-xs text-[var(--pp-ink)]">{mixLabel(doses)}</p>
                      <p className="shrink-0 text-[10px] text-[var(--pp-ink-dim)]">
                        0 = niente · 100 = pieno
                      </p>
                    </div>
                    {activeDoses.map((dose) => (
                      <div key={dose.id} className="flex items-center gap-2">
                        <span className="w-24 shrink-0 truncate text-[11px] text-[var(--pp-ink-dim)]">
                          {lookById(dose.id).label}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={dose.weight}
                          onChange={(e) => setDose(dose.id, Number(e.target.value))}
                          className="min-w-0 flex-1 accent-[var(--pp-accent)]"
                        />
                        <span className="w-7 text-right text-[11px] text-[var(--pp-ink-dim)] tabular-nums">
                          {dose.weight}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {naming ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={name}
                      maxLength={24}
                      placeholder="Nome del look"
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmSave()
                        if (e.key === 'Escape') setNaming(false)
                      }}
                      className="min-w-0 flex-1 rounded-[var(--pp-radius)] border border-[var(--pp-line)] bg-transparent px-2 py-1 text-xs outline-none focus:border-[var(--pp-accent)]"
                    />
                    <button
                      onClick={confirmSave}
                      className="rounded-[var(--pp-radius)] bg-[var(--pp-accent)] px-2 py-1 text-xs font-semibold text-[var(--pp-on-accent)]"
                    >
                      Salva
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setName(mixLabel(doses) === 'Nessun look' ? '' : mixLabel(doses))
                      setNaming(true)
                    }}
                    className="pp-tool-flat w-full rounded-[var(--pp-radius)] border border-dashed border-[var(--pp-line)] py-1.5 text-xs text-[var(--pp-ink-dim)] hover:border-[var(--pp-line-strong)] hover:text-[var(--pp-ink-strong)]"
                  >
                    + Salva questo sviluppo tra i miei look
                  </button>
                )}

                {/* LUT creativi */}
                <div className="space-y-2 border-t border-[var(--pp-line)] pt-2.5">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[10px] tracking-wide text-[var(--pp-ink-dim)] uppercase">LUT</p>
                    <button
                      onClick={() => void importLuts()}
                      className="text-[11px] text-[var(--pp-ink-dim)] hover:text-[var(--pp-ink-strong)]"
                    >
                      + Importa .cube
                    </button>
                  </div>
                  {luts.names.length === 0 ? (
                    <p className="text-[10px] text-[var(--pp-ink-dim)]">
                      Nessun LUT importato. Ne trovi a migliaia in rete, in formato .cube.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => onChange({ lutName: '' })}
                        className={chipClass(develop.lutName === '')}
                      >
                        Nessuno
                      </button>
                      {luts.names.map((lutName) => (
                        <span
                          key={lutName}
                          className={`flex items-center gap-1 rounded-[var(--pp-radius)] py-1 pr-1 pl-2 text-xs ${
                            develop.lutName === lutName
                              ? 'bg-[var(--pp-accent)] text-[var(--pp-on-accent)]'
                              : 'bg-[var(--pp-panel)] text-[var(--pp-ink)]'
                          }`}
                        >
                          <button onClick={() => onChange({ lutName })}>{lutLabel(lutName)}</button>
                          <button
                            onClick={() => void deleteLut(lutName)}
                            title="Rimuovi questo LUT"
                            className="rounded px-1 opacity-40 hover:opacity-100"
                          >
                            <CloseMark size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {develop.lutName && (
                    <div className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-[11px] text-[var(--pp-ink-dim)]">Quanto pesa</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={develop.lutAmount}
                        onChange={(e) => onChange({ lutAmount: Number(e.target.value) })}
                        className="min-w-0 flex-1 accent-[var(--pp-accent)]"
                      />
                      <span className="w-7 text-right text-[11px] text-[var(--pp-ink-dim)] tabular-nums">
                        {develop.lutAmount}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => void exportCube()}
                    title="Salva questo sviluppo come LUT .cube, da usare anche in altri programmi"
                    className="pp-tool-flat w-full rounded-[var(--pp-radius)] border border-dashed border-[var(--pp-line)] py-1.5 text-xs text-[var(--pp-ink-dim)] hover:border-[var(--pp-line-strong)] hover:text-[var(--pp-ink-strong)]"
                  >
                    {exported ? `Salvato: ${exported}` : 'Esporta questo look come .cube'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {GROUPS.map((group) => {
            const open = openGroups.includes(group.id)
            const touched = group.sliders.filter(
              (s) => develop[s.key] !== baseDevelop[s.key]
            ).length
            return (
              <div key={group.id} className="rounded-[var(--pp-radius)] bg-white/[0.03]">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                >
                  <ChevronMark
                    className="text-[var(--pp-ink-dim)] transition-transform"
                    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  />
                  <span className="text-[11px] tracking-wide text-[var(--pp-ink-dim)] uppercase">
                    {group.title}
                  </span>
                  {touched > 0 && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--pp-accent)]" />
                  )}
                </button>
                {open && (
                  <div
                    className="space-y-3 px-2.5 pb-3"
                    style={{ animation: 'dev-open 160ms ease-out' }}
                  >
                    {group.note && <p className="text-[10px] text-[var(--pp-ink-dim)]">{group.note}</p>}
                    {group.id === 'colore' && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm text-[var(--pp-ink)]">
                          <input
                            type="checkbox"
                            checked={develop.bw}
                            onChange={(e) => onChange({ bw: e.target.checked })}
                            className="accent-[var(--pp-accent)]"
                          />
                          Bianco e nero
                        </label>
                        {develop.bw && (
                          <div className="flex flex-wrap gap-1.5 pl-6">
                            {(Object.keys(BW_FILTERS) as BwFilter[]).map((filter) => (
                              <button
                                key={filter}
                                onClick={() => onChange({ bwFilter: filter })}
                                title="Il filtro colore che si montava sull'obiettivo con la pellicola B/N"
                                className={chipClass(develop.bwFilter === filter)}
                              >
                                {BW_FILTER_LABELS[filter]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {group.sliders.map((spec) => (
                      <DevSlider
                        key={spec.key}
                        spec={spec}
                        value={develop[spec.key]}
                        base={baseDevelop[spec.key]}
                        onChange={(value) => onChange({ [spec.key]: value })}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2 border-t border-[var(--pp-line)] px-4 py-3">
        <div className="flex gap-1.5">
          <button
            onClick={() => onCopyPrevious?.()}
            disabled={!onCopyPrevious}
            title="Riprendi lo sviluppo dell'ultima foto su cui hai lavorato"
            className="pp-tool-flat flex-1 rounded-[var(--pp-radius)] border border-[var(--pp-line)] py-1.5 text-xs text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)] disabled:pointer-events-none disabled:opacity-35"
          >
            Copia dalla precedente
          </button>
          <button
            onClick={onApplyToScene}
            disabled={sceneCount === 0}
            title="Applica questo sviluppo a tutti gli scatti della raffica"
            className="pp-tool-flat flex-1 rounded-[var(--pp-radius)] border border-[var(--pp-line)] py-1.5 text-xs text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)] disabled:pointer-events-none disabled:opacity-35"
          >
            Applica alla raffica{sceneCount > 0 ? ` (${sceneCount})` : ''}
          </button>
        </div>
        <button
          onClick={onApplyToAll}
          className="w-full rounded-[var(--pp-radius)] bg-[var(--pp-accent)] py-2 text-sm font-semibold text-[var(--pp-on-accent)] hover:bg-[var(--pp-accent-hover)]"
        >
          Usa per tutte le prossime
        </button>
        <button
          onClick={onResetToAlbum}
          className="w-full rounded-[var(--pp-radius)] border border-[var(--pp-line)] py-1.5 text-sm text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]"
        >
          Torna allo sviluppo dell&apos;album
        </button>
      </div>
    </div>
  )
}
