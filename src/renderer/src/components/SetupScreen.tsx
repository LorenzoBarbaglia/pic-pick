import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getDetailRenderer } from '../lib/developGl'
import { BACKGROUNDS, FORMATS } from '../lib/formats'
import { PRESETS } from '../lib/themes'
import { usePreset } from '../lib/preset'
import type { SeaVisibility, ToolSize, UiMode } from '../lib/preset'
import {
  grainImageUrl,
  grainPixelSize,
  GRAIN_TILE_PX,
  grainStrength,
  LOOKS,
  lookById,
  lookIdFromLegacyTone,
  mixLabel,
  mixLooks,
  NEUTRAL_DEVELOP,
  vignetteGradient,
  vignetteStrength
} from '../lib/develop'
import type { Develop, LookDose } from '../lib/develop'
import { removeUserLook, useUserLooks } from '../lib/userLooks'
import { baseName, readRecents } from '../lib/recents'
import { CAPTION_FONTS, CROP_SHAPES, DATE_STAMPS, MAT_BOTTOM_FACTOR } from '../lib/print'
import { ChevronMark, CloseMark } from './Icons'
import type { CaptionFontId, CropShape, DateStampId } from '../lib/print'
import type { EntryMode, SessionConfig, SessionFileData, SortBubble } from '../types'

interface SetupScreenProps {
  /** Restituisce un messaggio di errore da mostrare, o null se la sessione parte */
  onStart: (config: SessionConfig, resume?: SessionFileData) => Promise<string | null>
  /** cartelle da cui ripartire (si torna qui da una sessione aperta) */
  initialDirs?: { sourceDir: string; destDir: string } | null
}

const BUBBLE_TINTS = [
  '16, 185, 129', // smeraldo
  '56, 189, 248', // cielo
  '167, 139, 250', // viola
  '251, 191, 36', // ambra
  '45, 212, 191' // acquamarina
]

const OUTPUT_SIZES = [1620, 2160, 3240]

/** sessioni vecchie: un solo look (o un «tono» ancora più vecchio) → una dose piena */
function legacyDoses(lookId: string | undefined, toneId: string | undefined): LookDose[] {
  const id = lookId ?? lookIdFromLegacyTone(toneId)
  return id === 'natural' ? [] : [{ id, weight: 100 }]
}

/**
 * Due bolle che si sanificano nella stessa cartella («Sì!» e «Sì?» → «Sì»)
 * si distinguono con un numero: mai copie di bolle diverse mescolate.
 */
function dedupeBubbleLabels(list: SortBubble[]): SortBubble[] {
  const seen = new Map<string, number>()
  return list.map((bubble) => {
    const key =
      bubble.label
        .replace(/[^\p{L}\p{N} _-]/gu, '')
        .trim()
        .toLowerCase() || 'bolla'
    const count = seen.get(key) ?? 0
    seen.set(key, count + 1)
    return count === 0 ? bubble : { ...bubble, label: `${bubble.label} ${count + 1}` }
  })
}

function isSessionFileData(value: unknown): value is SessionFileData {
  if (typeof value !== 'object' || value === null) return false
  const data = value as SessionFileData
  return (
    data.version === 1 &&
    typeof data.sourceDir === 'string' &&
    typeof data.decided === 'object' &&
    data.decided !== null
  )
}

/** finto paesaggio su cui provare i look: cielo, orizzonte, terra, pelle */
function sampleImage(): HTMLCanvasElement {
  if (sampleCache) return sampleCache
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 160)
    sky.addColorStop(0, '#2f6ba8')
    sky.addColorStop(0.34, '#87b3d6')
    sky.addColorStop(0.46, '#dfe9ef')
    sky.addColorStop(0.54, '#c9a06a')
    sky.addColorStop(0.78, '#7d6238')
    sky.addColorStop(1, '#33291a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, 320, 160)
    // una macchia di verde e una di incarnato: si vedono le fasce di colore
    ctx.fillStyle = '#4a7a3c'
    ctx.beginPath()
    ctx.ellipse(70, 120, 60, 26, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#d9a583'
    ctx.beginPath()
    ctx.ellipse(240, 104, 34, 30, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  sampleCache = canvas
  return canvas
}

let sampleCache: HTMLCanvasElement | null = null

/**
 * Anteprima di un look: il campione viene sviluppato dallo stesso motore delle
 * foto, quindi mostra davvero dove porta — non un'approssimazione in CSS.
 */
function LookSwatch({ develop }: { develop: Develop }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const vignette = vignetteStrength(develop)
  const grain = grainStrength(develop)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const sample = sampleImage()
    const renderer = getDetailRenderer()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (renderer.available) {
      renderer.invalidate()
      const developed = renderer.render(sample, develop, {
        width: canvas.width,
        height: canvas.height,
        sourceWidth: sample.width,
        sourceHeight: sample.height
      })
      if (developed) ctx.drawImage(developed, 0, 0)
      renderer.invalidate()
    } else {
      ctx.drawImage(sample, 0, 0, canvas.width, canvas.height)
    }
  }, [develop])

  return (
    <span className="relative block h-16 w-full overflow-hidden">
      <canvas ref={ref} width={240} height={72} className="h-full w-full" />
      {vignette > 0 && (
        <span className="absolute inset-0" style={{ backgroundImage: vignetteGradient(develop) }} />
      )}
      {grain > 0 && (
        <span
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${grainImageUrl(grainPixelSize(develop))})`,
            backgroundSize: `${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px`,
            opacity: grain,
            mixBlendMode: 'overlay'
          }}
        />
      )}
    </span>
  )
}

/** le miniature degli stili di stampa: si capiscono prima di leggerle */
function StyleMini({ id }: { id: CropShape }) {
  switch (id) {
    case 'round':
      return (
        <svg width="26" height="18" viewBox="0 0 36 26">
          <rect x="1" y="1" width="34" height="24" rx="5" fill="currentColor" opacity="0.55" />
        </svg>
      )
    case 'slide':
      return (
        <svg width="26" height="18" viewBox="0 0 36 26">
          <rect width="36" height="26" rx="1.5" fill="#e9e4d6" />
          <rect x="6" y="5" width="24" height="16" rx="2.5" fill="currentColor" opacity="0.6" />
        </svg>
      )
    case 'rebate':
      return (
        <svg width="26" height="18" viewBox="0 0 36 26">
          <rect width="36" height="26" fill="#0b0b0b" />
          <rect x="4" y="4" width="28" height="18" fill="currentColor" opacity="0.55" />
          <rect x="5" y="23" width="7" height="1.6" fill="#e0993a" />
          <rect x="26" y="23" width="5" height="1.6" fill="#e0993a" />
        </svg>
      )
    case 'sprocket':
      return (
        <svg width="26" height="18" viewBox="0 0 36 26">
          <rect width="36" height="26" fill="#0b0b0b" />
          <rect x="0" y="6" width="36" height="14" fill="currentColor" opacity="0.55" />
          {[3, 11, 19, 27].map((x) => (
            <g key={x}>
              <rect x={x} y="1.5" width="4.5" height="3" rx="1" fill="#57534e" />
              <rect x={x} y="21.5" width="4.5" height="3" rx="1" fill="#57534e" />
            </g>
          ))}
        </svg>
      )
    default:
      return (
        <svg width="26" height="18" viewBox="0 0 36 26">
          <rect width="36" height="26" fill="currentColor" opacity="0.55" />
        </svg>
      )
  }
}

/**
 * Sezione richiudibile del setup: l'essenziale sta aperto, le rifiniture in
 * cassetti chiusi — la filosofia è scegliere in fretta, non configurare.
 */
function SetupSection({
  id,
  title,
  defaultOpen = false,
  children
}: {
  id: string
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('picpick-setup-open')
      const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
      return typeof map[id] === 'boolean' ? map[id] : defaultOpen
    } catch {
      return defaultOpen
    }
  })
  const toggle = (): void => {
    const next = !open
    setOpen(next)
    try {
      const raw = localStorage.getItem('picpick-setup-open')
      const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
      map[id] = next
      localStorage.setItem('picpick-setup-open', JSON.stringify(map))
    } catch {
      // preferenza non persistita: pazienza
    }
  }
  return (
    <div className="space-y-3">
      <button
        onClick={toggle}
        className="flex w-full cursor-pointer items-center gap-2 text-left text-sm font-semibold tracking-wide text-[var(--pp-ink)] uppercase hover:text-[var(--pp-ink-strong)]"
      >
        <ChevronMark
          className="text-[var(--pp-ink-dim)] transition-transform duration-150"
          style={{ transform: open ? 'rotate(90deg)' : undefined }}
        />
        {title}
      </button>
      {open && children}
    </div>
  )
}

function FolderPicker({
  label,
  value,
  onPick
}: {
  label: string
  value: string | null
  onPick: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--pp-radius-lg)] border border-[var(--pp-line)] bg-[var(--pp-panel)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-[var(--pp-ink-dim)]">{value ?? 'Nessuna cartella selezionata'}</p>
      </div>
      <button
        onClick={onPick}
        className="shrink-0 rounded-[var(--pp-radius)] bg-[var(--pp-accent)] px-3 py-1.5 text-sm font-semibold text-[var(--pp-on-accent)] hover:bg-[var(--pp-accent-hover)]"
      >
        Scegli…
      </button>
    </div>
  )
}

export function SetupScreen({ onStart, initialDirs = null }: SetupScreenProps) {
  const {
    preset,
    setPresetId,
    uiMode,
    setUiMode,
    seaVisibility,
    setSeaVisibility,
    toolSize,
    setToolSize
  } = usePreset()
  const [sourceDir, setSourceDir] = useState<string | null>(initialDirs?.sourceDir ?? null)
  const [destDir, setDestDir] = useState<string | null>(initialDirs?.destDir ?? null)
  const [formatId, setFormatId] = useState(FORMATS[0].id)
  const [backgroundId, setBackgroundId] = useState(BACKGROUNDS[0].id)
  const [bubbles, setBubbles] = useState<SortBubble[]>([
    { id: 'b1', label: 'Passa', tint: BUBBLE_TINTS[0] }
  ])
  const [numberCopies, setNumberCopies] = useState(true)
  const [outputLongEdge, setOutputLongEdge] = useState(2160)
  const [doses, setDoses] = useState<LookDose[]>([])
  const [entryMode, setEntryMode] = useState<EntryMode>('fill')
  const [lockAspect, setLockAspect] = useState(true)
  const [autoOrient, setAutoOrient] = useState(true)
  const [chapters, setChapters] = useState(false)
  const [matPercent, setMatPercent] = useState(0)
  /** null = come lo sfondo; il default è il bianco delle cornici vere */
  const [matColor, setMatColor] = useState<string | null>('#ffffff')
  const [cropShape, setCropShape] = useState<CropShape>('none')
  const [captionFont, setCaptionFont] = useState<CaptionFontId>('classica')
  const [dateStamp, setDateStamp] = useState<DateStampId>('nessuno')
  const [outputQuality, setOutputQuality] = useState(0.92)
  const [exportSmall, setExportSmall] = useState(false)
  const [recursive, setRecursive] = useState(false)
  /** vero mentre una cartella è sospesa sopra la finestra */
  const [dragging, setDragging] = useState(false)
  const [resumeData, setResumeData] = useState<SessionFileData | null>(null)
  /** la destinazione a cui appartiene resumeData: mai riprendere quella sbagliata */
  const [resumeDataDir, setResumeDataDir] = useState<string | null>(null)
  /** le ultime sessioni: un clic e si riparte da dove si era */
  const [recents] = useState(readRecents)
  /** vero dopo il clic su una recente: appena la sessione si carica, si riprende */
  const [pendingResume, setPendingResume] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const bubbleCounterRef = useRef(1)

  const myLooks = useUserLooks()
  const selectedBackground = BACKGROUNDS.find((b) => b.id === backgroundId)!

  // cerca una sessione precedente nella cartella di destinazione. Al cambio
  // di destinazione la sessione vecchia si scarta SUBITO: il banner non deve
  // mostrare (né l'auto-resume riprendere) la sessione di un'altra cartella.
  useEffect(() => {
    setResumeData(null)
    setResumeDataDir(null)
    if (!destDir) return
    let cancelled = false
    window.picpick.loadSession(destDir).then((data) => {
      if (cancelled) return
      setResumeData(isSessionFileData(data) ? data : null)
      setResumeDataDir(destDir)
    })
    return () => {
      cancelled = true
    }
  }, [destDir])

  /**
   * La sessione trovata riempie il modulo: le impostazioni si vedono, si
   * toccano, e «Riprendi» riparte con QUELLE del modulo — è così che si
   * cambiano le scelte a metà lavoro senza perdere le foto già decise.
   */
  useEffect(() => {
    if (!resumeData) return
    setSourceDir((prev) => prev ?? resumeData.sourceDir)
    if (FORMATS.some((f) => f.id === resumeData.formatId)) setFormatId(resumeData.formatId)
    if (BACKGROUNDS.some((b) => b.id === resumeData.backgroundId))
      setBackgroundId(resumeData.backgroundId)
    if (resumeData.bubbles?.length) setBubbles(resumeData.bubbles)
    setNumberCopies(resumeData.numberCopies ?? true)
    setOutputLongEdge(resumeData.outputLongEdge ?? 2160)
    setDoses(resumeData.lookDoses ?? legacyDoses(resumeData.lookId, resumeData.toneId))
    setEntryMode(resumeData.entryMode ?? 'fill')
    setLockAspect(resumeData.lockAspect ?? true)
    setAutoOrient(resumeData.autoOrient ?? true)
    setChapters(resumeData.chapters ?? false)
    setMatPercent(resumeData.matPercent ?? 0)
    setMatColor(resumeData.matColor !== undefined ? resumeData.matColor : '#ffffff')
    setCropShape(
      resumeData.cropShape && CROP_SHAPES.some((shape) => shape.id === resumeData.cropShape)
        ? resumeData.cropShape
        : 'none'
    )
    setCaptionFont(resumeData.captionFont ?? 'classica')
    setDateStamp(resumeData.dateStamp ?? 'nessuno')
    setOutputQuality(resumeData.outputQuality ?? 0.92)
    setExportSmall(resumeData.exportSmall ?? false)
    setRecursive(resumeData.recursive ?? false)
  }, [resumeData])

  const decidedCount = resumeData ? Object.keys(resumeData.decided).length : 0

  // clic su una recente → cartelle impostate; quando il file di sessione
  // arriva, si riprende da soli (se non c'è, restano le cartelle pronte).
  // ATTENZIONE: qui il modulo non è ancora stato riempito (il prefill gira
  // nello stesso commit), quindi la config viene dal file di sessione, mai
  // dallo stato del modulo — altrimenti si riparte coi default.
  useEffect(() => {
    // la guardia sul destDir è la chiave: al clic su una recente questo effect
    // gira ancora con la resumeData della destinazione PRECEDENTE in chiusura
    // (il load è asincrono) — senza il confronto si riprendeva quella sbagliata
    if (!pendingResume || !resumeData || resumeDataDir !== destDir) return
    setPendingResume(false)
    void resumeFromSaved()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResume, resumeData, resumeDataDir, destDir])

  const buildConfig = (): SessionConfig | null => {
    if (!sourceDir || !destDir) return null
    return {
      sourceDir,
      destDir,
      format: FORMATS.find((f) => f.id === formatId)!,
      background: selectedBackground,
      bubbles: dedupeBubbleLabels(bubbles),
      numberCopies,
      outputLongEdge,
      develop: mixLooks(doses),
      lookDoses: doses,
      entryMode,
      lockAspect,
      autoOrient,
      chapters,
      matPercent,
      matColor,
      cropShape,
      captionFont,
      dateStamp,
      outputQuality,
      exportSmall,
      recursive
    }
  }

  const handleStart = async (): Promise<void> => {
    const config = buildConfig()
    if (!config || starting) return
    setStarting(true)
    setError(null)
    const failure = await onStart(config)
    if (failure) {
      setError(failure)
      setStarting(false)
    }
  }

  /** riprende la sessione con le impostazioni del file, ignorando il modulo */
  const resumeFromSaved = async (): Promise<void> => {
    if (!destDir || !resumeData || starting) return
    const data = resumeData
    const source = data.sourceDir ?? sourceDir
    if (!source) return
    setStarting(true)
    setError(null)
    const savedDoses = data.lookDoses ?? legacyDoses(data.lookId, data.toneId)
    const config: SessionConfig = {
      sourceDir: source,
      destDir,
      format: FORMATS.find((f) => f.id === data.formatId) ?? FORMATS[0],
      background: BACKGROUNDS.find((b) => b.id === data.backgroundId) ?? BACKGROUNDS[0],
      bubbles: dedupeBubbleLabels(data.bubbles?.length ? data.bubbles : bubbles),
      numberCopies: data.numberCopies ?? true,
      outputLongEdge: data.outputLongEdge ?? 2160,
      develop: { ...NEUTRAL_DEVELOP, ...(data.develop ?? mixLooks(savedDoses)) },
      lookDoses: savedDoses,
      entryMode: data.entryMode ?? 'fill',
      lockAspect: data.lockAspect ?? true,
      autoOrient: data.autoOrient ?? true,
      chapters: data.chapters ?? false,
      matPercent: data.matPercent ?? 0,
      matColor: data.matColor !== undefined ? data.matColor : '#ffffff',
      cropShape:
        data.cropShape && CROP_SHAPES.some((shape) => shape.id === data.cropShape)
          ? data.cropShape
          : 'none',
      captionFont: data.captionFont ?? 'classica',
      dateStamp: data.dateStamp ?? 'nessuno',
      outputQuality: data.outputQuality ?? 0.92,
      exportSmall: data.exportSmall ?? false,
      recursive: data.recursive ?? false
    }
    if (data.presetId) setPresetId(data.presetId)
    const failure = await onStart(config, data)
    if (failure) {
      setError(failure)
      setStarting(false)
    }
  }

  const handleResume = async (): Promise<void> => {
    if (!destDir || !resumeData || starting) return
    setStarting(true)
    setError(null)
    // il modulo è stato riempito dalla sessione e poi (magari) ritoccato:
    // si riprende con ciò che si vede, foto già decise comprese
    const config: SessionConfig = {
      sourceDir: sourceDir ?? resumeData.sourceDir,
      destDir,
      format: FORMATS.find((f) => f.id === formatId) ?? FORMATS[0],
      background: selectedBackground,
      bubbles: dedupeBubbleLabels(bubbles),
      numberCopies,
      outputLongEdge,
      // se le dosi nel modulo sono ancora quelle salvate vince il develop
      // della sessione (che può includere ritocchi); se l'utente le ha
      // cambiate, si riparte dalla nuova miscela — «ciò che si vede»
      develop: {
        ...NEUTRAL_DEVELOP,
        ...(JSON.stringify(doses) ===
          JSON.stringify(
            resumeData.lookDoses ?? legacyDoses(resumeData.lookId, resumeData.toneId)
          ) && resumeData.develop
          ? resumeData.develop
          : mixLooks(doses))
      },
      lookDoses: doses,
      entryMode,
      lockAspect,
      autoOrient,
      chapters,
      matPercent,
      matColor,
      cropShape,
      captionFont,
      dateStamp,
      outputQuality,
      exportSmall,
      recursive
    }
    // la sessione ricorda anche il mondo visivo in cui era stata smistata
    if (resumeData.presetId) setPresetId(resumeData.presetId)
    const failure = await onStart(config, resumeData)
    if (failure) {
      setError(failure)
      setStarting(false)
    }
  }

  const toggleDose = (id: string): void => {
    setDoses((prev) => {
      if (prev.some((d) => d.id === id)) return prev.filter((d) => d.id !== id)
      // il primo look entra pieno, i successivi a metà: poi si dosano
      return [...prev, { id, weight: prev.length === 0 ? 100 : 50 }]
    })
  }

  const updateBubble = (id: string, patch: Partial<SortBubble>): void => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  const onDropFolder = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (!dropped) return
    const droppedPath = window.picpick.pathForFile(dropped)
    if (!droppedPath) return
    const isDir = await window.picpick.isDirectory(droppedPath)
    // se è un file, si usa la sua cartella: l'intenzione è chiara comunque
    const dir = isDir ? droppedPath : droppedPath.replace(/[\/][^\/]*$/, '')
    if (!dir) return
    setSourceDir(dir)
    setPendingResume(false)
  }

  return (
    <div
      className="relative grid h-full place-items-center overflow-y-auto p-8"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => void onDropFolder(e)}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-50 grid place-items-center rounded-[var(--pp-radius-lg)] border-2 border-dashed border-[var(--pp-accent)] bg-[var(--pp-scrim)]">
          <p className="text-lg font-semibold text-[var(--pp-accent)]">
            Lascia qui: diventa la cartella delle foto
          </p>
        </div>
      )}
      <div className="w-full max-w-2xl space-y-7">
        <div>
          <h1 className="text-4xl font-black tracking-tight">
            pic<span className="text-[var(--pp-accent)]">&</span>pick
          </h1>
          <p className="mt-2 text-[var(--pp-ink-dim)]">
            Scegli le cartelle, il formato dell'album e le bolle, poi smista le foto.
          </p>
        </div>

        {recents.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold tracking-wide text-[var(--pp-ink)] uppercase">
              Riprendi da dove eri
            </h2>
            <div className="space-y-1.5">
              {recents.map((recent) => (
                <button
                  key={`${recent.sourceDir}→${recent.destDir}`}
                  onClick={() => {
                    setSourceDir(recent.sourceDir)
                    setDestDir(recent.destDir)
                    setPendingResume(true)
                  }}
                  className="pp-tool-flat flex w-full items-center gap-3 rounded-[var(--pp-radius-lg)] border border-[var(--pp-line)] px-4 py-2.5 text-left hover:border-[var(--pp-accent)]/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {baseName(recent.sourceDir)}
                      <span className="mx-1.5 text-[var(--pp-ink-dim)]">→</span>
                      {baseName(recent.destDir)}
                    </span>
                    <span className="block truncate text-xs text-[var(--pp-ink-dim)]">
                      {new Date(recent.when).toLocaleDateString('it-IT', {
                        day: 'numeric',
                        month: 'long'
                      })}
                      {' · '}
                      {recent.sourceDir}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--pp-accent)]">Riprendi →</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-[var(--pp-ink)] uppercase">Cartelle</h2>
          <FolderPicker
            label="Cartella sorgente"
            value={sourceDir}
            onPick={async () => {
              const dir = await window.picpick.pickFolder('Scegli la cartella con le foto')
              if (dir) {
                setSourceDir(dir)
                setPendingResume(false)
              }
            }}
          />
          <label className="flex items-center gap-2 pl-1 text-xs text-[var(--pp-ink-dim)]">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
              className="accent-[var(--pp-accent)]"
            />
            Includi anche le sottocartelle
          </label>
          <FolderPicker
            label="Cartella di destinazione"
            value={destDir}
            onPick={async () => {
              const dir = await window.picpick.pickFolder('Scegli dove salvare le foto smistate')
              if (dir) {
                setDestDir(dir)
                setPendingResume(false)
              }
            }}
          />
          {resumeData && (
            <div className="flex items-center gap-3 rounded-[var(--pp-radius-lg)] border border-[var(--pp-accent)]/40 bg-[var(--pp-accent)]/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--pp-accent)]">
                  Sessione trovata: {decidedCount} foto già smistate
                </p>
                <p className="truncate text-xs text-[var(--pp-ink-dim)]">
                  le impostazioni qui sotto sono le sue — cambiale pure, poi «Riprendi»
                </p>
              </div>
              <button
                onClick={handleResume}
                disabled={starting}
                className="shrink-0 rounded-[var(--pp-radius)] bg-[var(--pp-accent)] px-3 py-1.5 text-sm font-semibold text-[var(--pp-on-accent)] hover:bg-[var(--pp-accent-hover)] disabled:opacity-50"
              >
                Riprendi
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-[var(--pp-ink)] uppercase">
            Bolle di smistamento
          </h2>
          <p className="text-xs text-[var(--pp-ink-dim)]">
            Ogni bolla salva le copie in una sottocartella con il suo nome. «Non passa» c'è sempre
            e non salva nulla.
          </p>
          <div className="space-y-2">
            {bubbles.map((bubble) => (
              <div
                key={bubble.id}
                className="flex items-center gap-3 rounded-[var(--pp-radius-lg)] border border-[var(--pp-line)] bg-[var(--pp-panel)] px-3 py-2"
              >
                <button
                  title="Cambia colore"
                  onClick={() => {
                    const currentIndex = BUBBLE_TINTS.indexOf(bubble.tint)
                    updateBubble(bubble.id, {
                      tint: BUBBLE_TINTS[(currentIndex + 1) % BUBBLE_TINTS.length]
                    })
                  }}
                  className="h-7 w-7 shrink-0 rounded-full ring-1 ring-[var(--pp-line-strong)]"
                  style={{ backgroundColor: `rgb(${bubble.tint})` }}
                />
                <input
                  value={bubble.label}
                  maxLength={18}
                  onChange={(e) => updateBubble(bubble.id, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded border border-[var(--pp-line)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--pp-accent)]/60"
                />
                {bubbles.length > 1 && (
                  <button
                    title="Rimuovi bolla"
                    onClick={() => setBubbles((prev) => prev.filter((b) => b.id !== bubble.id))}
                    className="shrink-0 rounded px-2 py-1 text-sm text-[var(--pp-ink-dim)] hover:text-rose-400"
                  >
                    <CloseMark size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {bubbles.length < 4 && (
            <button
              onClick={() => {
                bubbleCounterRef.current += 1
                setBubbles((prev) => [
                  ...prev,
                  {
                    id: `b${bubbleCounterRef.current}`,
                    label: `Bolla ${prev.length + 1}`,
                    tint: BUBBLE_TINTS[prev.length % BUBBLE_TINTS.length]
                  }
                ])
              }}
              className="rounded-[var(--pp-radius)] border border-[var(--pp-line)] px-3 py-1.5 text-sm text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]"
            >
              + Aggiungi bolla
            </button>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-[var(--pp-ink)] uppercase">
            Formato album
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {FORMATS.map((format) => (
              <button
                key={format.id}
                onClick={() => setFormatId(format.id)}
                className={`rounded-[var(--pp-radius-lg)] border p-3 transition-colors ${
                  formatId === format.id
                    ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10'
                    : 'border-[var(--pp-line)] hover:border-[var(--pp-line)]'
                }`}
              >
                <div className="mx-auto flex h-16 items-center justify-center">
                  <div
                    className="border border-stone-400 bg-[var(--pp-panel)]"
                    style={{
                      aspectRatio: `${format.ratio}`,
                      ...(format.ratio >= 1 ? { width: '56px' } : { height: '56px' })
                    }}
                  />
                </div>
                <p className="mt-2 text-sm font-medium">{format.label}</p>
                <p className="text-xs text-[var(--pp-ink-dim)]">{format.id}</p>
              </button>
            ))}
          </div>

          {/* come la foto entra nel formato: è la scelta che cambia tutto il ritmo */}
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                {
                  id: 'fill' as EntryMode,
                  label: 'Riempi il formato',
                  hint: 'La foto arriva già pre-tagliata: basta spostarla'
                },
                {
                  id: 'fit' as EntryMode,
                  label: 'Foto intera',
                  hint: 'La foto entra tutta nel frame e il ritaglio si fa a mano'
                }
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                onClick={() => setEntryMode(option.id)}
                className={`rounded-[var(--pp-radius-lg)] border px-3 py-2 text-left transition-colors ${
                  entryMode === option.id
                    ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10'
                    : 'border-[var(--pp-line)] hover:border-[var(--pp-line)]'
                }`}
              >
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-[var(--pp-ink-dim)]">{option.hint}</p>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-[var(--pp-ink)]">
              <input
                type="checkbox"
                checked={lockAspect}
                onChange={(e) => setLockAspect(e.target.checked)}
                className="accent-[var(--pp-accent)]"
              />
              Ritaglio bloccato sulle proporzioni dell'album
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--pp-ink)]">
              <input
                type="checkbox"
                checked={autoOrient}
                onChange={(e) => setAutoOrient(e.target.checked)}
                className="accent-[var(--pp-accent)]"
              />
              I verticali usano il formato ruotato
            </label>
          </div>

          {/* lo stile di stampa: la lingua della pellicola */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--pp-ink-dim)]">Stile</span>
            {CROP_SHAPES.map((option) => (
              <button
                key={option.id}
                title={option.hint}
                onClick={() => setCropShape(option.id)}
                className={`pp-tool-flat flex items-center gap-1.5 rounded-[var(--pp-radius)] border px-2 py-1 text-xs ${
                  cropShape === option.id
                    ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10 text-[var(--pp-accent)]'
                    : 'border-[var(--pp-line)] text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]'
                }`}
              >
                <StyleMini id={option.id} />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <SetupSection id="mondo" title="Mondo" defaultOpen>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PRESETS.map((option) => (
              <button
                key={option.id}
                onClick={() => setPresetId(option.id)}
                title={option.hint}
                className={`overflow-hidden rounded-[var(--pp-radius-lg)] border text-left transition-colors ${
                  preset.id === option.id
                    ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10'
                    : 'border-[var(--pp-line)] hover:border-[var(--pp-line)]'
                }`}
              >
                {/* anteprima: il mare di punti del preset, con un segno d'accento */}
                <span
                  className="relative block h-16 w-full"
                  style={{
                    backgroundColor: option.swatch.bg,
                    backgroundImage: `radial-gradient(circle, ${option.swatch.sea} 1.4px, transparent 1.5px)`,
                    backgroundSize: `${Math.max(8, option.sea.spacing / 1.6)}px ${Math.max(8, option.sea.spacing / 1.6)}px`
                  }}
                >
                  <span
                    className="absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: option.swatch.accent, opacity: 0.85 }}
                  />
                </span>
                <span className="block px-2.5 py-1.5 text-sm font-medium">{option.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--pp-ink-dim)]">{preset.hint}</p>
        </SetupSection>

        <SetupSection id="sfondo" title="Sfondo">
          <div className="flex flex-wrap items-center gap-3">
            {BACKGROUNDS.map((bg) => (
              <button
                key={bg.id}
                title={bg.label}
                onClick={() => setBackgroundId(bg.id)}
                className={`h-12 w-12 rounded-full border-2 transition-shadow ${
                  backgroundId === bg.id
                    ? 'border-[var(--pp-accent)] ring-2 ring-[var(--pp-accent)]/40'
                    : 'border-[var(--pp-line)] hover:border-[var(--pp-line-strong)]'
                } ${bg.color === null ? 'checkerboard' : ''}`}
                style={bg.color ? { backgroundColor: bg.color } : undefined}
              />
            ))}
            <span className="ml-1 text-sm text-[var(--pp-ink-dim)]">{selectedBackground.label}</span>
          </div>
        </SetupSection>

        <SetupSection id="cornice" title="Cornice (passe-partout)">
          <p className="text-xs text-[var(--pp-ink-dim)]">
            Un margine attorno a ogni copia esportata, come una stampa incorniciata: il fondo è
            più alto come nei passe-partout veri, e in sessione compare un campo per scrivere una
            didascalia sotto la foto.
          </p>
          <div className="grid grid-cols-4 gap-3">
            {(
              [
                { label: 'Nessuna', value: 0 },
                { label: 'Sottile', value: 0.035 },
                { label: 'Classica', value: 0.07 },
                { label: 'Ampia', value: 0.11 }
              ] as const
            ).map((option) => {
              const pad = option.value * 90
              return (
                <button
                  key={option.label}
                  onClick={() => {
                    setMatPercent(option.value)
                  }}
                  className={`rounded-[var(--pp-radius-lg)] border p-3 transition-colors ${
                    matPercent === option.value
                      ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10'
                      : 'border-[var(--pp-line)] hover:border-[var(--pp-line)]'
                  }`}
                >
                  {/* anteprima: la cornice col colore dello sfondo attorno alla foto */}
                  <div className="mx-auto flex h-16 items-center justify-center">
                    <div
                      className={`flex h-14 w-14 items-center justify-center ${
                        (matColor ?? selectedBackground.color) === null ? 'checkerboard' : ''
                      }`}
                      style={{
                        backgroundColor: (matColor ?? selectedBackground.color) ?? undefined,
                        paddingTop: pad,
                        paddingLeft: pad,
                        paddingRight: pad,
                        paddingBottom: pad * MAT_BOTTOM_FACTOR
                      }}
                    >
                      <div className="h-full w-full bg-gradient-to-br from-stone-500 to-stone-700" />
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-medium">{option.label}</p>
                </button>
              )
            })}
          </div>
          {matPercent > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--pp-ink-dim)]">Colore della cornice</span>
              {(
                [
                  { label: 'Bianco', value: '#ffffff' },
                  { label: 'Avorio', value: '#f4eee1' },
                  { label: 'Grigio', value: '#d8d4cd' },
                  { label: 'Nero', value: '#111111' }
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  title={option.label}
                  onClick={() => setMatColor(option.value)}
                  className={`h-8 w-8 rounded-full border-2 ${
                    matColor === option.value
                      ? 'border-[var(--pp-accent)] ring-2 ring-[var(--pp-accent)]/40'
                      : 'border-[var(--pp-line)] hover:border-[var(--pp-line-strong)]'
                  }`}
                  style={{ backgroundColor: option.value }}
                />
              ))}
              <button
                onClick={() => setMatColor(null)}
                title="La cornice prende il colore dello sfondo dell'album"
                className={`pp-tool-flat rounded-[var(--pp-radius)] border px-2.5 py-1 text-xs ${
                  matColor === null
                    ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10 text-[var(--pp-accent)]'
                    : 'border-[var(--pp-line)] text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]'
                }`}
              >
                Come lo sfondo
              </button>
            </div>
          )}
          {matPercent > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--pp-ink-dim)]">Font della didascalia</span>
              {CAPTION_FONTS.map((font) => (
                <button
                  key={font.id}
                  onClick={() => setCaptionFont(font.id)}
                  className={`pp-tool-flat rounded-[var(--pp-radius)] border px-2.5 py-1 text-sm ${
                    captionFont === font.id
                      ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10 text-[var(--pp-accent)]'
                      : 'border-[var(--pp-line)] text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]'
                  }`}
                  style={{
                    fontFamily: font.family,
                    fontStyle: font.italic ? 'italic' : 'normal'
                  }}
                >
                  {font.label}
                </button>
              ))}
            </div>
          )}
          {/* la data di scatto: sulla cornice o come datario anni '90 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--pp-ink-dim)]">Data di scatto</span>
            {DATE_STAMPS.map((option) => (
              <button
                key={option.id}
                title={option.hint}
                onClick={() => setDateStamp(option.id)}
                className={`pp-tool-flat rounded-[var(--pp-radius)] border px-2.5 py-1 text-xs ${
                  dateStamp === option.id
                    ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10 text-[var(--pp-accent)]'
                    : 'border-[var(--pp-line)] text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]'
                }`}
                style={
                  option.id === 'datario'
                    ? { fontFamily: "'Courier New', monospace", color: dateStamp === 'datario' ? undefined : '#ff9d4f' }
                    : undefined
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </SetupSection>

        <SetupSection id="sviluppo" title="Sviluppo dell'album">
          <p className="text-xs text-[var(--pp-ink-dim)]">
            Il punto di partenza di ogni foto. I look si <strong>sommano</strong>: scegline due o
            tre e dosane l'intensità — «Matte vintage + Nordico» è una miscela legittima. Durante
            lo smistamento si aggiusta foto per foto con D.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {LOOKS.filter((option) => option.id !== 'natural').map((option) => {
              const weight = doses.find((d) => d.id === option.id)?.weight ?? 0
              return (
                <button
                  key={option.id}
                  onClick={() => toggleDose(option.id)}
                  title={`${option.hint} · ${option.source}`}
                  className={`overflow-hidden rounded-[var(--pp-radius-lg)] border text-left transition-colors ${
                    weight > 0
                      ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10'
                      : 'border-[var(--pp-line)] hover:border-[var(--pp-line)]'
                  }`}
                >
                  <LookSwatch develop={option.develop} />
                  <span className="flex items-baseline justify-between px-2.5 py-1.5">
                    <span className="text-sm font-medium">{option.label}</span>
                    {weight > 0 && (
                      <span className="text-xs text-[var(--pp-accent)] tabular-nums">{weight}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          {/* i look salvati durante lo smistamento tornano qui */}
          {myLooks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] tracking-wide text-[var(--pp-ink-dim)] uppercase">I miei look</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {myLooks.map((option) => {
                  const weight = doses.find((d) => d.id === option.id)?.weight ?? 0
                  return (
                    <div
                      key={option.id}
                      className={`relative overflow-hidden rounded-[var(--pp-radius-lg)] border transition-colors ${
                        weight > 0
                          ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10'
                          : 'border-[var(--pp-line)] hover:border-[var(--pp-line)]'
                      }`}
                    >
                      <button onClick={() => toggleDose(option.id)} className="block w-full text-left">
                        <LookSwatch develop={option.develop} />
                        <span className="flex items-baseline justify-between px-2.5 py-1.5">
                          <span className="truncate text-sm font-medium">{option.label}</span>
                          {weight > 0 && (
                            <span className="text-xs text-[var(--pp-accent)] tabular-nums">
                              {weight}
                            </span>
                          )}
                        </span>
                      </button>
                      <button
                        onClick={() => removeUserLook(option.id)}
                        title="Elimina questo look"
                        className="absolute top-1 right-1 rounded bg-[var(--pp-scrim)] px-1.5 text-xs text-[var(--pp-ink)] hover:text-[var(--pp-ink-strong)]"
                      >
                        <CloseMark size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {doses.length > 0 ? (
            <div className="space-y-2 rounded-[var(--pp-radius-lg)] border border-[var(--pp-line)] p-3">
              <div className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <LookSwatch develop={mixLooks(doses)} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm">{mixLabel(doses)}</p>
                  <p className="text-xs text-[var(--pp-ink-dim)]">
                    la miscela che parte su ogni foto · la dose è l&apos;intensità: 0 niente, 100
                    pieno
                  </p>
                </div>
                <button
                  onClick={() => setDoses([])}
                  className="ml-auto shrink-0 text-xs text-[var(--pp-ink-dim)] hover:text-[var(--pp-ink-strong)]"
                >
                  Azzera
                </button>
              </div>
              {doses.map((dose) => (
                <div key={dose.id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs text-[var(--pp-ink-dim)]">
                    {lookById(dose.id).label}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={dose.weight}
                    onChange={(e) =>
                      setDoses((prev) =>
                        prev.map((d) =>
                          d.id === dose.id ? { ...d, weight: Number(e.target.value) } : d
                        )
                      )
                    }
                    className="min-w-0 flex-1 accent-[var(--pp-accent)]"
                  />
                  <span className="w-8 text-right text-xs text-[var(--pp-ink-dim)] tabular-nums">
                    {dose.weight}
                  </span>
                </div>
              ))}
              <p className="text-[11px] text-[var(--pp-ink-dim)]">{lookById(doses[0].id).source}</p>
            </div>
          ) : (
            <p className="text-xs text-[var(--pp-ink-dim)]">
              Nessun look: le foto partono come sono state scattate.
            </p>
          )}
        </SetupSection>

        <SetupSection id="interfaccia" title="Interfaccia">
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                {
                  id: 'animato' as UiMode,
                  label: 'Animata',
                  hint: 'Il rituale: mare, bolle che fluttuano, personaggi, suoni musicali'
                },
                {
                  id: 'ufficio' as UiMode,
                  label: 'Lavoro',
                  hint: 'Lo strumento: barre di comandi etichettati, fondo fermo, suoni brevi'
                }
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                onClick={() => setUiMode(option.id)}
                className={`rounded-[var(--pp-radius-lg)] border px-3 py-2 text-left transition-colors ${
                  uiMode === option.id
                    ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10'
                    : 'border-[var(--pp-line)] hover:border-[var(--pp-line)]'
                }`}
              >
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-[var(--pp-ink-dim)]">{option.hint}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--pp-ink-dim)]">
            Durante lo smistamento si cambia con M. Il Mondo scelto più su vale in entrambe:
            cambia il movimento, non i colori.
          </p>
          {/* con la luce ambientale i punti tenui sparivano: qui si alza il volume */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--pp-ink-dim)]">Visibilità dello sfondo</span>
            {(['tenue', 'normale', 'marcato'] as SeaVisibility[]).map((level) => (
              <button
                key={level}
                onClick={() => setSeaVisibility(level)}
                className={`pp-tool-flat rounded-[var(--pp-radius)] border px-2.5 py-1 text-xs capitalize ${
                  seaVisibility === level
                    ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10 text-[var(--pp-accent)]'
                    : 'border-[var(--pp-line)] text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          {/* su schermi piccoli i comandi vanno rimpiccioliti, non impilati */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--pp-ink-dim)]">Comandi</span>
            {(['auto', 'grande', 'media', 'piccola'] as ToolSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setToolSize(size)}
                title={
                  size === 'auto'
                    ? "La misura si adatta all'altezza della finestra"
                    : `Comandi sempre di misura ${size}`
                }
                className={`pp-tool-flat rounded-[var(--pp-radius)] border px-2.5 py-1 text-xs capitalize ${
                  toolSize === size
                    ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10 text-[var(--pp-accent)]'
                    : 'border-[var(--pp-line)] text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </SetupSection>

        <SetupSection id="export" title="Export">
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-[var(--pp-ink)]">
              <input
                type="checkbox"
                checked={numberCopies}
                onChange={(e) => setNumberCopies(e.target.checked)}
                className="accent-[var(--pp-accent)]"
              />
              Numera le copie nell'ordine di scelta (001_, 002_…)
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--pp-ink)]">
              <input
                type="checkbox"
                checked={chapters}
                onChange={(e) => setChapters(e.target.checked)}
                className="accent-[var(--pp-accent)]"
              />
              Dividi in capitoli mensili (ordina per data di scatto)
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--pp-ink)]">
              <input
                type="checkbox"
                checked={exportSmall}
                onChange={(e) => setExportSmall(e.target.checked)}
                className="accent-[var(--pp-accent)]"
              />
              Salva anche una copia piccola per i social (1080)
            </label>
            <div className="flex items-center gap-2 text-sm text-[var(--pp-ink)]">
              Qualità
              {(
                [
                  { label: 'Buona', value: 0.82 },
                  { label: 'Alta', value: 0.92 },
                  { label: 'Massima', value: 0.97 }
                ] as const
              ).map((option) => (
                <button
                  key={option.label}
                  onClick={() => setOutputQuality(option.value)}
                  className={`pp-tool-flat rounded-[var(--pp-radius)] border px-2 py-0.5 text-xs ${
                    outputQuality === option.value
                      ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10 text-[var(--pp-accent)]'
                      : 'border-[var(--pp-line)] text-[var(--pp-ink-dim)] hover:border-[var(--pp-line-strong)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--pp-ink)]">
              Lato lungo
              <select
                value={outputLongEdge}
                onChange={(e) => setOutputLongEdge(Number(e.target.value))}
                className="rounded border border-[var(--pp-line)] bg-stone-900 px-2 py-1 text-sm"
              >
                {OUTPUT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} px
                  </option>
                ))}
              </select>
            </label>
          </div>
        </SetupSection>

        <div className="space-y-3">
          <button
            disabled={!sourceDir || !destDir || starting}
            onClick={handleStart}
            className="w-full rounded-[var(--pp-radius-lg)] bg-[var(--pp-accent)] py-3 text-base font-bold text-[var(--pp-on-accent)] transition-colors hover:bg-[var(--pp-accent-hover)] disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-[var(--pp-ink-dim)]"
          >
            {starting ? 'Caricamento…' : 'Inizia lo smistamento'}
          </button>
          {resumeData && (
            <p className="text-xs text-[var(--pp-ink-dim)]">
              «Inizia» riparte da zero e sovrascrive la sessione precedente; «Riprendi» continua
              da dove eri.
            </p>
          )}
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      </div>
    </div>
  )
}
