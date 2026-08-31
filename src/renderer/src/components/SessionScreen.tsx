import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CropRect, Decision, ImageFile, SessionConfig, SessionFileData, SortBubble } from '../types'
import { EditorStage } from './EditorStage'
import type { StageController } from './EditorStage'
import { Bubbles } from './Bubbles'
import { ResetRock } from './ResetRock'
import { EyeToggle } from './EyeToggle'
import { AlbumWall } from './AlbumWall'
import { UndoFlip } from './UndoFlip'
import { GuillotineExit } from './GuillotineExit'
import { SortBar } from './SortBar'
import {
  BurstTool,
  DetailsTool,
  DevelopTool,
  FilmTool,
  CropTool,
  FrameTool,
  ReframeTool,
  LockTool,
  LoupeTool
} from './StageTools'
import { Filmstrip } from './Filmstrip'
import { BurstPanel } from './BurstPanel'
import { CloseUps } from './CloseUps'
import { DevelopPanel } from './DevelopPanel'
import { renderExport } from '../lib/exportImage'
import { mixLabel, mixLooks, NEUTRAL_DEVELOP, touchedCount } from '../lib/develop'
import type { Develop, LookDose } from '../lib/develop'
import { renderFull, useDevelopedCanvas } from '../lib/useDeveloped'
import { LAYER, matchShortcut, shortcutLegend } from '../lib/interactions'
import { sound } from '../lib/sound'
import { usePreset } from '../lib/preset'
import { getThumb, peekInfo, primeThumb } from '../lib/thumbs'
import { ensureLut, refreshLutList, useLuts } from '../lib/lut'
import { chapterKey, chapterLabel, groupScenes } from '../lib/scenes'
import { autoDetail, computeAuto, measureCropSharpness, solveWhiteBalance } from '../lib/autoTools'
import { printSize } from '../lib/print'
import { CheckMark } from './Icons'

interface SessionScreenProps {
  config: SessionConfig
  /** foto ancora da smistare (le già decise sono filtrate a monte) */
  files: ImageFile[]
  /** decisioni delle sessioni precedenti (fileName → bubbleId|'skip') */
  initialDecided: Record<string, string>
  /** sviluppo e didascalie già fatti a mano: si riprende da lì */
  initialWork: {
    devByFile: Record<string, { develop: Develop; doses: LookDose[] }>
    captions: Record<string, string>
  }
  onExit: () => void
}

const SKIP_ID = 'skip'
/** quanti comandi ci sono nella colonna: serve al calcolo della misura */
const TOOL_COUNT = 14

/** miniatura già sviluppata: riepilogo e striscia mostrano la foto come sarà */
function makeThumbnail(
  image: HTMLImageElement,
  develop: Develop,
  longEdge = 160
): string {
  const scale = longEdge / Math.max(image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const developed = renderFull(image, develop, Math.max(longEdge * 2, 640))
  ctx.drawImage(developed ?? image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.72)
}

/** separatore tra gruppi di comandi: l'orientamento lo decide il contenitore
    (la colonna .pp-tools lo vuole orizzontale, la barra verticale) */
function ToolDivider() {
  return <span className="pp-divider shrink-0 bg-[var(--pp-line)]" />
}

function readStripPreference(): boolean {
  try {
    return localStorage.getItem('picpick-strip') !== '0'
  } catch {
    return true
  }
}

export function SessionScreen({
  config,
  files,
  initialDecided,
  initialWork,
  onExit
}: SessionScreenProps) {
  const { preset, cyclePreset, animated, toggleUiMode, toolSize } = usePreset()
  const [queue, setQueue] = useState<ImageFile[]>(files)
  const [index, setIndex] = useState(0)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [cropOpacity, setCropOpacity] = useState(100)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [muted, setMuted] = useState(sound.isMuted())
  const [closing, setClosing] = useState(false)
  const [popSignal, setPopSignal] = useState(0)
  const [showWall, setShowWall] = useState(false)
  const [compareHeld, setCompareHeld] = useState(false)
  /** tenendo A si vede la foto senza sviluppo: il prima/dopo */
  const [showOriginal, setShowOriginal] = useState(false)
  const [showStrip, setShowStrip] = useState(readStripPreference)
  const [showBurst, setShowBurst] = useState(false)
  /** ritaglio congelato all'apertura dei dettagli a pixel reali */
  const [closeUpCrop, setCloseUpCrop] = useState<CropRect | null>(null)
  const [chapterBanner, setChapterBanner] = useState<string | null>(null)
  const [showDevelop, setShowDevelop] = useState(false)
  /** lente agganciata al cursore (dal bottone; con Z si tiene premuto) */
  const [loupeSticky, setLoupeSticky] = useState(false)
  /** contagocce del bianco: il prossimo clic sulla foto preleva un grigio */
  const [wbPicking, setWbPicking] = useState(false)
  /** anteprima al passaggio su un look: si vede senza applicare */
  const [previewDevelop, setPreviewDevelop] = useState<Develop | null>(null)
  /** didascalie per foto: si scrivono sul passe-partout in export */
  const [captionByFile, setCaptionByFile] = useState<Record<string, string>>(
    () => initialWork.captions
  )
  /** i nomi rimandati con «Forse»: alimentano il filtro della striscia */
  const [laterNames, setLaterNames] = useState<Set<string>>(new Set())
  /**
   * Cronologia delle modifiche della foto CORRENTE: prima non c'era modo di
   * disfare un ritaglio storto o uno slider tirato troppo — restava solo il
   * masso, che azzera tutto. Si svuota al cambio di foto: è memoria di lavoro,
   * non uno storico da conservare.
   */
  const editHistoryRef = useRef<
    (
      | { kind: 'stage'; state: { cx: number; cy: number; scale: number; rotation: number; crop: CropRect } }
      | { kind: 'develop'; develop: Develop; doses: LookDose[] }
    )[]
  >([])
  const lastUndoRef = useRef<{ tag: string; at: number }>({ tag: '', at: 0 })

  /** avviso volante (es. «copia salvata anche in…») */
  const [note, setNote] = useState<string | null>(null)
  const noteTimerRef = useRef(0)
  const closingTimerRef = useRef(0)
  /** legenda completa a richiesta: di default solo i gesti del core */
  const [showAllKeys, setShowAllKeys] = useState(false)
  /** lo sviluppo dell'ultima foto su cui si è lavorato: per «copia dalla precedente» */
  const lastLeftRef = useRef<{ develop: Develop; doses: LookDose[] } | null>(null)
  /** quando è iniziata questa sessione: alimenta le statistiche del riepilogo */
  const sessionStartRef = useRef(performance.now())
  const [lockAspect, setLockAspect] = useState(config.lockAspect)
  /** altezza dello stage: serve a decidere quanto grandi possono essere i comandi */
  const [stageHeight, setStageHeight] = useState(0)
  /** lampo del frame nel colore della bolla scelta */
  const [flash, setFlash] = useState<{ tint: string; key: number } | null>(null)
  /** sviluppo di partenza per le prossime foto (si può promuovere dal pannello) */
  const [sessionDevelop, setSessionDevelop] = useState<Develop>(config.develop)
  const [sessionDoses, setSessionDoses] = useState<LookDose[]>(config.lookDoses)
  /** regolazioni per singola foto: sopravvivono ai salti nella coda */
  const [devByFile, setDevByFile] = useState<
    Record<string, { develop: Develop; doses: LookDose[] }>
  >(() => initialWork.devByFile)
  const lastSortedRef = useRef<{ dataUrl: string; label: string } | null>(null)
  const controllerRef = useRef<StageController | null>(null)

  // mappa completa fileName → esito (incluse le sessioni precedenti)
  const decidedRef = useRef<Record<string, string>>({ ...initialDecided })
  /**
   * Le decisioni ereditate dalle sessioni precedenti: nel riepilogo si possono
   * ripescare. La copia esportata allora resta sul disco (il suo nome non è
   * nel file di sessione): ridecidendo se ne crea una nuova.
   */
  const [previousDecided, setPreviousDecided] = useState<{ name: string; bubbleId: string }[]>(
    () => Object.entries(initialDecided).map(([name, bubbleId]) => ({ name, bubbleId }))
  )
  const preloadRef = useRef<{ path: string; image: HTMLImageElement } | null>(null)

  const initialSorted = Object.values(initialDecided).filter((v) => v !== SKIP_ID).length
  const initialSkipped = Object.keys(initialDecided).length - initialSorted
  const [counts, setCounts] = useState({ sorted: initialSorted, skipped: initialSkipped })

  const file = index < queue.length ? queue[index] : null
  const summaryMode = file === null && !closing
  /** il rito di chiusura dura quanto serve alla scena; in ufficio è un attimo */
  const closingMs = animated ? 2400 : 400

  // raffiche: le foto nate nello stesso momento restano insieme anche se la coda
  // si rimescola (un «Forse» sposta in fondo, un ripescaggio riaccoda)
  /**
   * Le impronte percettive arrivano poco a poco (si calcolano con le miniature):
   * questo contatore fa ricalcolare le raffiche quando ne arrivano di nuove,
   * così due scatti simili si uniscono anche senza data.
   */
  const [fingerprints, setFingerprints] = useState(0)

  useEffect(() => {
    let cancelled = false
    const from = Math.max(0, index - 6)
    const to = Math.min(queue.length, index + 12)
    const load = async (): Promise<void> => {
      let added = false
      for (let i = from; i < to; i++) {
        const file = queue[i]
        if (!file || peekInfo(file.path)) continue
        const info = await getThumb(file.path, 120)
        if (cancelled) return
        if (info) added = true
      }
      if (added && !cancelled) setFingerprints((n) => n + 1)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [index, queue])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { sceneOf, scenes } = useMemo(() => groupScenes(queue), [queue, fingerprints])
  const sceneIndex = sceneOf[index] ?? -1
  const currentScene = sceneIndex >= 0 ? scenes[sceneIndex] : null
  const positionInScene = currentScene ? currentScene.indexOf(index) + 1 : 0

  // sviluppo della foto che si sta guardando: il suo, o quello dell'album
  const photoDev = file ? devByFile[file.name] : undefined
  const develop = photoDev?.develop ?? sessionDevelop
  const doses = photoDev?.doses ?? sessionDoses
  const developTouched = touchedCount(develop, sessionDevelop) > 0
  const caption = file ? (captionByFile[file.name] ?? '') : ''
  /** tenendo A si guarda la foto senza sviluppo; il passaggio su un look la anticipa */
  const shownDevelop = showOriginal ? NEUTRAL_DEVELOP : (previewDevelop ?? develop)
  // i LUT importati si caricano su richiesta: quando arrivano, la foto si
  // ridisegna da sé (la versione del registro entra nelle dipendenze)
  const lutRegistry = useLuts()
  if (shownDevelop.lutName) ensureLut(shownDevelop.lutName)

  /** la foto sviluppata dalla GPU: è quella che si vede sullo stage */
  /**
   * Densità dell'anteprima. Il rendering avviene a gesto FINITO (220 ms) e a
   * scatti di 256 px: durante la rotella si continua a vedere la copia di
   * prima — fluida — e appena ci si ferma la foto si ridisegna coi pixel che
   * servono davvero. È il «raffina quando ti fermi» degli editor seri.
   */
  const [previewScale, setPreviewScale] = useState(0)
  const previewTimerRef = useRef(0)
  const handleViewScale = useCallback((scale: number): void => {
    clearTimeout(previewTimerRef.current)
    previewTimerRef.current = window.setTimeout(() => setPreviewScale(scale), 220)
  }, [])
  useEffect(() => () => clearTimeout(previewTimerRef.current), [])
  const previewLongEdge = (() => {
    if (!image || previewScale <= 0) return undefined
    const natural = Math.max(image.naturalWidth, image.naturalHeight)
    const dpr = window.devicePixelRatio || 1
    const wanted = natural * previewScale * dpr
    // a scatti, se no ogni micro-zoom farebbe ridisegnare tutto
    return Math.min(natural, Math.max(1280, Math.round(wanted / 256) * 256))
  })()
  const developed = useDevelopedCanvas(
    image,
    shownDevelop,
    lutRegistry.version,
    previewLongEdge
  )

  /**
   * Formato effettivo: con l'auto-orientamento un album 3:2 accoglie i verticali
   * come 2:3 invece di tagliarli a metà. Il frame, il pre-taglio e l'export
   * usano tutti questo valore.
   */
  const effectiveRatio = (() => {
    const base = config.format.ratio
    if (!config.autoOrient || !image || base === 1) return base
    const imageLandscape = image.naturalWidth >= image.naturalHeight
    const frameLandscape = base >= 1
    return imageLandscape === frameLandscape ? base : 1 / base
  })()

  const setDevelopFor = (fileName: string, next: { develop: Develop; doses: LookDose[] }): void => {
    setDevByFile((prev) => ({ ...prev, [fileName]: next }))
  }

  /**
   * Mette un passo nella cronologia. `groupMs` fonde i colpi ravvicinati dello
   * stesso tipo: trascinare uno slider o girare la rotella deve valere UN passo
   * indietro, non cinquanta.
   */
  const pushUndo = (
    make: () => (typeof editHistoryRef.current)[number] | null,
    tag: string,
    groupMs = 0
  ): void => {
    const now = performance.now()
    if (groupMs > 0 && lastUndoRef.current.tag === tag && now - lastUndoRef.current.at < groupMs) {
      lastUndoRef.current.at = now
      return
    }
    const entry = make()
    if (!entry) return
    editHistoryRef.current.push(entry)
    if (editHistoryRef.current.length > 40) editHistoryRef.current.shift()
    lastUndoRef.current = { tag, at: now }
  }

  const snapshotStage = (tag: string, groupMs = 0): void => {
    pushUndo(() => {
      const st = controllerRef.current?.getExportState()
      if (!st) return null
      return {
        kind: 'stage' as const,
        state: { cx: st.cx, cy: st.cy, scale: st.scale, rotation: st.rotation, crop: st.crop }
      }
    }, tag, groupMs)
  }

  const snapshotDevelop = (): void => {
    pushUndo(() => ({ kind: 'develop' as const, develop, doses }), 'develop', 700)
  }

  // la cronologia è della foto che si ha davanti: cambiando foto si azzera
  useEffect(() => {
    editHistoryRef.current = []
    lastUndoRef.current = { tag: '', at: 0 }
  }, [file?.path])

  const patchDevelop = (patch: Partial<Develop>): void => {
    if (!file) return
    snapshotDevelop()
    setDevelopFor(file.name, { develop: { ...develop, ...patch }, doses })
  }

  /** cambiare la miscela ricalcola lo sviluppo: applicare look è un gesto netto */
  const applyDoses = (next: LookDose[]): void => {
    if (!file) return
    snapshotDevelop()
    setDevelopFor(file.name, { develop: mixLooks(next), doses: next })
  }

  const persistSession = (): void => {
    const data: SessionFileData = {
      version: 1,
      sourceDir: config.sourceDir,
      formatId: config.format.id,
      backgroundId: config.background.id,
      bubbles: config.bubbles,
      numberCopies: config.numberCopies,
      outputLongEdge: config.outputLongEdge,
      chapters: config.chapters,
      presetId: preset.id,
      lookDoses: sessionDoses,
      develop: sessionDevelop,
      entryMode: config.entryMode,
      lockAspect,
      autoOrient: config.autoOrient,
      matPercent: config.matPercent,
      matColor: config.matColor,
      cropShape: config.cropShape,
      captionFont: config.captionFont,
      dateStamp: config.dateStamp,
      outputQuality: config.outputQuality,
      exportSmall: config.exportSmall,
      recursive: config.recursive,
      // solo le foto davvero toccate a mano: la mappa nasce dai ritocchi
      devByFile,
      captions: Object.fromEntries(
        Object.entries(captionByFile).filter(([, text]) => text.trim().length > 0)
      ),
      decided: decidedRef.current
    }
    void window.picpick.saveSession(config.destDir, JSON.stringify(data))
  }

  // l'altezza dello stage decide la misura dei comandi quando è «auto»
  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const measure = (): void => setStageHeight(element.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [animated, summaryMode])

  useEffect(() => {
    void refreshLutList()
  }, [])

  // all'avvio, e ogni volta che cambiano le scelte d'album, riallinea il file
  useEffect(() => {
    persistSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDevelop, sessionDoses, lockAspect])

  /**
   * Anche i ritocchi foto per foto e le didascalie vanno sul disco — ma con
   * calma: trascinando uno slider la mappa cambia a ogni tick, e scrivere il
   * file ogni volta sarebbe assurdo. Mezzo secondo di quiete e si salva.
   */
  const workSaveRef = useRef(0)
  useEffect(() => {
    clearTimeout(workSaveRef.current)
    workSaveRef.current = window.setTimeout(() => persistSession(), 500)
    return () => clearTimeout(workSaveRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devByFile, captionByFile])

  // caricamento della foto corrente, con cache di precaricamento
  useEffect(() => {
    if (!file) return
    let cancelled = false
    let objectUrl: string | null = null
    setError(null)

    const preloaded = preloadRef.current
    if (preloaded && preloaded.path === file.path) {
      setImage(preloaded.image)
      preloadRef.current = null
      return
    }

    setImage(null)
    window.picpick
      .readImage(file.path)
      .then((bytes) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(new Blob([bytes]))
        const img = new Image()
        img.onload = () => {
          if (!cancelled) setImage(img)
        }
        img.onerror = () => {
          if (!cancelled) setError(`Impossibile leggere ${file.name}`)
        }
        img.src = objectUrl
      })
      .catch(() => {
        if (!cancelled) setError(`Impossibile leggere ${file.name}`)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.path])

  // precarica la prossima foto per un avanzamento istantaneo
  useEffect(() => {
    const next = index + 1 < queue.length ? queue[index + 1] : null
    if (!next || preloadRef.current?.path === next.path) return
    let cancelled = false
    window.picpick
      .readImage(next.path)
      .then((bytes) => {
        if (cancelled) return
        const url = URL.createObjectURL(new Blob([bytes]))
        const img = new Image()
        img.onload = () => {
          // il blob URL ha finito il suo lavoro: l'immagine decodificata resta
          URL.revokeObjectURL(url)
          if (!cancelled) preloadRef.current = { path: next.path, image: img }
        }
        img.onerror = () => URL.revokeObjectURL(url)
        img.src = url
      })
      .catch(() => {
        // il caricamento normale riproverà
      })
    return () => {
      cancelled = true
    }
  }, [index, queue])

  // capitoli: quando il mese cambia il mare si muove e un cartello annuncia
  // il nuovo capitolo, così le cartelle enormi si smistano a respiri
  const lastChapterRef = useRef<string | null>(null)
  useEffect(() => {
    if (!config.chapters || !file) return
    const key = chapterKey(file.takenAt)
    if (lastChapterRef.current === key) return
    lastChapterRef.current = key
    const total = queue.filter((f) => chapterKey(f.takenAt) === key).length
    setChapterBanner(`${chapterLabel(file.takenAt)} · ${total} foto`)
    controllerRef.current?.wave()
    sound.chapter()
    const timer = window.setTimeout(() => setChapterBanner(null), 2400)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.name, config.chapters])

  const sequenceFor = (bubbleId: string): number => {
    let count = 0
    for (const value of Object.values(decidedRef.current)) {
      if (value === bubbleId) count += 1
    }
    return count + 1
  }

  // toglie una decisione: cancella la copia salvata e riporta i conteggi indietro
  const revokeDecision = (decision: Decision): void => {
    if (decision.savedSubDir && decision.savedName) {
      void window.picpick.deleteFile(config.destDir, decision.savedSubDir, decision.savedName)
    }
    if (decision.savedSubDir && decision.savedSmallName) {
      void window.picpick.deleteFile(
        config.destDir,
        `${decision.savedSubDir}/social`,
        decision.savedSmallName
      )
    }
    delete decidedRef.current[decision.fileName]
    setDecisions((prev) => prev.filter((d) => d !== decision))
    setCounts((prev) =>
      decision.bubbleId === SKIP_ID
        ? { ...prev, skipped: prev.skipped - 1 }
        : { ...prev, sorted: prev.sorted - 1 }
    )
    persistSession()
  }

  /** se la foto era già stata decisa in questa sessione, scioglie quella decisione */
  const clearExistingDecision = (fileName: string): void => {
    const previous = decisions.find((d) => d.fileName === fileName)
    if (previous) revokeDecision(previous)
  }

  const recordDecision = (decision: Decision): void => {
    lastLeftRef.current = { develop, doses }
    decidedRef.current[decision.fileName] = decision.bubbleId
    setDecisions((prev) => [...prev, decision])
    setCounts((prev) =>
      decision.bubbleId === SKIP_ID
        ? { ...prev, skipped: prev.skipped + 1 }
        : { ...prev, sorted: prev.sorted + 1 }
    )
    persistSession()
    setImage(null)
    // ultima foto: rito di chiusura prima del riepilogo
    if (index + 1 >= queue.length) {
      setClosing(true)
      setPopSignal((s) => s + 1)
      controllerRef.current?.wave()
      sound.finish()
      closingTimerRef.current = window.setTimeout(() => setClosing(false), closingMs)
    }
    setIndex((i) => i + 1)
  }

  /** colore medio della foto, per il mare che assorbe l'album */
  const dominantColor = (img: HTMLImageElement): { r: number; g: number; b: number } | null => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return { r, g, b }
  }

  /** rende e salva la foto corrente nella bolla (con l'eventuale copia social) */
  const exportCurrent = async (
    bubble: SortBubble,
    variant = false
  ): Promise<{ savedName: string; savedSmallName: string | null }> => {
    if (!image || !file) throw new Error('Nessuna foto')
    const state = controllerRef.current?.getExportState()
    if (!state) throw new Error('Stage non pronto')
    const options = {
      backgroundColor: config.background.color,
      formatRatio: effectiveRatio,
      develop,
      matFraction: config.matPercent,
      matColor: config.matColor,
      caption,
      quality: config.outputQuality,
      shape: config.cropShape,
      captionFont: config.captionFont,
      dateStamp: config.dateStamp,
      takenAt: file.takenAt,
      frameNumber: index + 1
    }
    const { data, extension } = await renderExport(image, state, {
      ...options,
      longEdge: config.outputLongEdge
    })
    // il nome viene dal percorso relativo: le barre diventano trattini
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[\\/]/g, '-')
    const sequence = String(sequenceFor(bubble.id)).padStart(3, '0')
    // le copie extra (Shift+bolla) portano un suffisso proprio: mai in
    // collisione col prefisso progressivo della decisione vera
    const suffix = variant ? '_picpick_var' : '_picpick'
    const fileName = config.numberCopies
      ? `${sequence}_${baseName}${suffix}.${extension}`
      : `${baseName}${suffix}.${extension}`
    const savedName = await window.picpick.saveImage(config.destDir, bubble.label, fileName, data)

    // la copia piccola per i social: stessa composizione, lato lungo 1080
    let savedSmallName: string | null = null
    if (config.exportSmall) {
      const small = await renderExport(image, state, { ...options, longEdge: 1080 })
      savedSmallName = await window.picpick.saveImage(
        config.destDir,
        `${bubble.label}/social`,
        fileName,
        small.data
      )
    }
    return { savedName, savedSmallName }
  }

  /**
   * Shift+bolla: salva una copia lì SENZA decidere né avanzare. È la versione
   * nascosta delle «copie virtuali»: cambi ritaglio o sviluppo e salvi la
   * stessa foto in più posti, poi la decisione vera resta una.
   */
  const handleSortExtra = async (bubble: SortBubble): Promise<void> => {
    if (busy || !image || !file) return
    setBusy(true)
    try {
      await exportCurrent(bubble, true)
      sound.bubble(Math.max(0, config.bubbles.findIndex((b) => b.id === bubble.id)))
      setFlash((prev) => ({ tint: bubble.tint, key: (prev?.key ?? 0) + 1 }))
      showNote(`Copia salvata in «${bubble.label}» — la foto resta qui`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio fallito')
    } finally {
      setBusy(false)
    }
  }

  /** avviso volante che si dissolve da solo: un posto unico per i messaggi */
  const showNote = (text: string): void => {
    clearTimeout(noteTimerRef.current)
    setNote(text)
    noteTimerRef.current = window.setTimeout(() => setNote(null), 2400)
  }

  // i timer di nota e rito di chiusura non sopravvivono allo smontaggio
  useEffect(
    () => () => {
      clearTimeout(noteTimerRef.current)
      clearTimeout(closingTimerRef.current)
    },
    []
  )

  const handleSort = async (bubble: SortBubble): Promise<void> => {
    if (busy || !image || !file) return
    const state = controllerRef.current?.getExportState()
    if (!state) return
    // ridecidere una foto (dopo un salto nella striscia) scioglie la vecchia
    // decisione prima di salvare: mai due copie della stessa foto
    clearExistingDecision(file.name)
    // la nota della bolla e il lampo del frame: la conferma arriva prima
    // che il file sia scritto, così il gesto resta immediato
    sound.bubble(Math.max(0, config.bubbles.findIndex((b) => b.id === bubble.id)))
    setFlash((prev) => ({ tint: bubble.tint, key: (prev?.key ?? 0) + 1 }))
    setBusy(true)
    setError(null)
    try {
      const { savedName, savedSmallName } = await exportCurrent(bubble)
      // memoria per il confronto (tasto C) e goccia di colore nel mare
      lastSortedRef.current = {
        dataUrl: makeThumbnail(image, develop, 900),
        label: bubble.label
      }
      const color = dominantColor(image)
      if (color) controllerRef.current?.absorb(color)
      const thumbnail = makeThumbnail(image, develop)
      // la miniatura serve anche alla striscia: evitiamo di rileggere il file
      primeThumb(file.path, thumbnail)
      recordDecision({
        fileName: file.name,
        filePath: file.path,
        takenAt: file.takenAt,
        bubbleId: bubble.id,
        savedSubDir: bubble.label,
        savedName,
        savedSmallName,
        thumbnail
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio fallito')
    } finally {
      setBusy(false)
    }
  }

  // ghigliottina: "sono soddisfatto dell'album" → rito di chiusura e riepilogo,
  // anche se restano foto non smistate (la sessione resta riprendibile)
  const finishAlbum = (): void => {
    if (summaryMode || closing) return
    setClosing(true)
    setPopSignal((s) => s + 1)
    controllerRef.current?.wave()
    sound.finish()
    closingTimerRef.current = window.setTimeout(() => setClosing(false), closingMs)
    setImage(null)
    setIndex(queue.length)
  }

  // «Forse»: rimanda la foto in fondo alla coda senza deciderla
  const handleLater = (): void => {
    if (busy || !file) return
    if (index >= queue.length - 1) {
      showNote('È l’ultima della coda: decidila, o lasciala per la prossima volta')
      return
    }
    lastLeftRef.current = { develop, doses }
    setLaterNames((prev) => new Set(prev).add(file.name))
    sound.later()
    setImage(null)
    setQueue((prev) => {
      const next = [...prev]
      const [deferred] = next.splice(index, 1)
      next.push(deferred)
      return next
    })
  }

  const handleSkip = (): void => {
    if (busy || !file) return
    sound.skip()
    clearExistingDecision(file.name)
    const thumbnail = image ? makeThumbnail(image, develop) : ''
    if (thumbnail) primeThumb(file.path, thumbnail)
    recordDecision({
      fileName: file.name,
      filePath: file.path,
      takenAt: file.takenAt,
      bubbleId: SKIP_ID,
      savedSubDir: null,
      savedName: null,
      thumbnail
    })
  }

  // annulla l'ultima decisione: ripesca la foto e cancella l'eventuale copia
  const undo = (): void => {
    if (busy) return
    // Prima le modifiche alla foto che si ha davanti: sono la cosa più recente
    // che si è fatta. Finite quelle, si torna a ripescare le decisioni.
    const history = editHistoryRef.current
    const step = history.pop()
    if (step) {
      sound.undo()
      lastUndoRef.current = { tag: '', at: 0 }
      if (step.kind === 'stage') controllerRef.current?.restoreStage(step.state)
      else if (file) setDevelopFor(file.name, { develop: step.develop, doses: step.doses })
      return
    }
    if (decisions.length === 0) return
    sound.undo()
    const last = decisions[decisions.length - 1]
    revokeDecision(last)
    setImage(null)
    // la foto ripescata va cercata: dopo salti o rito di chiusura l'indice
    // non corrisponde più all'ordine delle decisioni
    const target = queue.findIndex((f) => f.name === last.fileName)
    const wanted = target >= 0 ? target : Math.max(0, index - 1)
    if (wanted !== index) setIndex(wanted)
  }

  // dal riepilogo: rimuove la decisione e rimette la foto in coda
  const repick = (decision: Decision): void => {
    revokeDecision(decision)
    setImage(null)
    const existing = queue.findIndex((f) => f.name === decision.fileName)
    if (existing >= 0) {
      if (existing !== index) {
        setImage(null)
        setIndex(existing)
      }
      return
    }
    // non è in coda (decisione di una sessione precedente): si accoda
    setQueue((prev) => [
      ...prev,
      { name: decision.fileName, path: decision.filePath, takenAt: decision.takenAt }
    ])
    setIndex(queue.length)
  }

  // scorre la coda SENZA decidere: le frecce nude smistano, con Shift si
  // guarda e basta (prima l'unico modo era il mouse sulla striscia)
  const step = (delta: number): void => {
    if (busy || summaryMode) return
    const target = index + delta
    if (target < 0 || target >= queue.length) return
    setImage(null)
    setIndex(target)
  }

  // dal riepilogo: ripesca una foto decisa in una sessione PRECEDENTE.
  // Il percorso si ricostruisce dal nome (relativo alla sorgente); la data di
  // scatto non è nel file di sessione, quindi raffiche e capitoli la ignorano.
  const repickPrevious = (name: string): void => {
    const entry = previousDecided.find((p) => p.name === name)
    if (!entry) return
    delete decidedRef.current[name]
    setPreviousDecided((prev) => prev.filter((p) => p.name !== name))
    setCounts((prev) =>
      entry.bubbleId === SKIP_ID
        ? { ...prev, skipped: Math.max(0, prev.skipped - 1) }
        : { ...prev, sorted: Math.max(0, prev.sorted - 1) }
    )
    setImage(null)
    setQueue((prev) => [...prev, { name, path: `${config.sourceDir}/${name}`, takenAt: 0 }])
    setIndex(queue.length)
    persistSession()
  }

  // dalla striscia o dalla raffica: porta nell'editor una foto della coda.
  // SOLO navigazione: guardare una foto già smistata non ne cancella la copia
  // — la vecchia decisione si scioglie solo ridecidendo (clearExistingDecision
  // in handleSort/handleSkip), mai al semplice sguardo.
  const jumpTo = (target: number): void => {
    if (busy || target < 0 || target >= queue.length) return
    // Già su questa foto: uscire subito NON è un'ottimizzazione, è la
    // correzione di un bug. `setImage(null)` svuota lo stage, ma il caricamento
    // riparte solo quando cambia il percorso della foto: ricliccando la stessa
    // miniatura si restava con lo schermo nero.
    if (target === index) return
    setImage(null)
    setIndex(target)
  }

  const toggleStrip = (): void => {
    const next = !showStrip
    setShowStrip(next)
    try {
      localStorage.setItem('picpick-strip', next ? '1' : '0')
    } catch {
      // preferenza non persistita: pazienza
    }
  }

  // dettagli a pixel reali: congela il ritaglio corrente e apre le tre finestre
  const toggleCloseUps = (): void => {
    if (closeUpCrop) {
      setCloseUpCrop(null)
      return
    }
    const state = controllerRef.current?.getExportState()
    if (state) setCloseUpCrop(state.crop)
  }

  const toggleBurst = (): void => {
    setShowBurst((prev) => !prev && (currentScene?.length ?? 0) > 1)
  }

  const toggleDevelop = (): void => setShowDevelop((prev) => !prev)

  /** lo zoom diventa un ritaglio vero (e lo dice) */
  const doCropToFrame = (): void => {
    snapshotStage('tool')
    const done = controllerRef.current?.cropToFrame()
    showNote(
      done
        ? 'Ritaglio aggiornato: ora è esattamente quello che vedi'
        : 'Il ritaglio è già quello che vedi nel riquadro'
    )
  }

  /** il ritaglio torna a combaciare col riquadro */
  const doReframe = (): void => {
    snapshotStage('tool')
    controllerRef.current?.frameCrop()
  }

  /** punto di partenza dall'istogramma della foto originale */
  const applyAuto = (): void => {
    if (!image) return
    patchDevelop(computeAuto(image))
  }

  /**
   * «Nitidezza»: misura il ritaglio corrente a pixel reali e sceglie la dose.
   * Tiene conto anche di quanto la foto verrà stirata nel file, che è la parte
   * che a occhio non si può indovinare.
   */
  const applyAutoSharpen = (): void => {
    if (!image) return
    const state = controllerRef.current?.getExportState()
    if (!state) return
    const inner = printSize(effectiveRatio, config.outputLongEdge, config.matPercent)
    const stretch = (state.scale * inner.width) / state.frame.width
    const score = measureCropSharpness(image, state.crop)
    const { patch, note } = autoDetail(score, stretch)
    patchDevelop(patch)
    sound.snap()
    showNote(note)
  }

  /** il contagocce ha assaggiato un punto: si neutralizza */
  const onPickedColor = (color: { r: number; g: number; b: number } | null): void => {
    setWbPicking(false)
    if (!color) return
    patchDevelop(solveWhiteBalance(color))
    sound.snap()
  }

  const copyFromPrevious = (): void => {
    const last = lastLeftRef.current
    if (!last || !file) return
    snapshotDevelop()
    setDevelopFor(file.name, { develop: { ...last.develop }, doses: [...last.doses] })
  }

  /** lo sviluppo corrente su tutte le sorelle della raffica */
  const applyToScene = (): void => {
    if (!currentScene || !file) return
    setDevByFile((prev) => {
      const next = { ...prev }
      for (const i of currentScene) {
        const sibling = queue[i]
        if (sibling) next[sibling.name] = { develop: { ...develop }, doses: [...doses] }
      }
      return next
    })
  }
  const toggleLock = (): void => setLockAspect((prev) => !prev)

  // Un solo gestore per tutte le scorciatoie: l'elenco vive in lib/interactions
  // insieme alla legenda del piè di pagina, così non possono divergere.
  const handlersRef = useRef({
    handleSort,
    handleSkip,
    handleLater,
    showNote,
    step,
    doCropToFrame,
    doReframe,
    undo,
    summaryMode,
    toggleStrip,
    toggleCloseUps,
    toggleBurst,
    toggleDevelop,
    toggleLock,
    cyclePreset,
    toggleUiMode
  })
  handlersRef.current = {
    handleSort,
    handleSkip,
    handleLater,
    showNote,
    step,
    doCropToFrame,
    doReframe,
    undo,
    summaryMode,
    toggleStrip,
    toggleCloseUps,
    toggleBurst,
    toggleDevelop,
    toggleLock,
    cyclePreset,
    toggleUiMode
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return
      const shortcut = matchShortcut(e)
      if (!shortcut) return
      const h = handlersRef.current
      if (!shortcut.always && h.summaryMode) return
      switch (shortcut.id) {
        case 'undo':
          e.preventDefault()
          h.undo()
          break
        case 'preset':
          h.cyclePreset()
          break
        case 'uiMode':
          h.toggleUiMode()
          break
        case 'sort': {
          const position = Number(e.key) - 1
          const bubble = config.bubbles[position]
          if (bubble) void h.handleSort(bubble)
          break
        }
        case 'browse':
          // le frecce si muovono e basta: scorrere non è decidere
          e.preventDefault()
          h.step(e.key === 'ArrowRight' ? 1 : -1)
          break
        case 'sortFirst':
          // lo spazio non deve anche premere il bottone che ha il fuoco
          e.preventDefault()
          if (config.bubbles[0]) void h.handleSort(config.bubbles[0])
          break
        case 'skip':
          h.handleSkip()
          break
        case 'later':
          h.handleLater()
          break
        case 'compare':
          if (lastSortedRef.current) setCompareHeld(true)
          else h.showNote('Nessuna foto ancora promossa: il confronto arriva dopo la prima')
          break
        case 'original':
          setShowOriginal(true)
          break
        case 'closeUps':
          h.toggleCloseUps()
          break
        case 'develop':
          h.toggleDevelop()
          break
        case 'burst':
          h.toggleBurst()
          break
        case 'strip':
          h.toggleStrip()
          break
        case 'lock':
          h.toggleLock()
          break
        case 'cropZoom':
          // l'invio non deve anche premere il bottone che ha il fuoco
          e.preventDefault()
          h.doCropToFrame()
          break
        case 'reframe':
          h.doReframe()
          break
        default:
          // 'loupe' lo gestisce l'EditorStage, che sa dov'è il puntatore
          break
      }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      const key = e.key.toLowerCase()
      if (key === 'c') setCompareHeld(false)
      if (key === 'a') setShowOriginal(false)
      if (e.key === 'Escape') setWbPicking(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bubbleById = (id: string): SortBubble | null =>
    config.bubbles.find((b) => b.id === id) ?? null

  /**
   * Misura dei comandi. Con «auto» si guarda l'altezza disponibile: tredici
   * comandi a grandezza piena vogliono circa 700 px, che su un portatile non
   * ci sono. Meglio comandi più piccoli che una colonna da scorrere.
   */
  const toolLayout = (() => {
    if (toolSize !== 'auto') return { size: toolSize, columns: 1 }
    const available = stageHeight - 40
    if (available <= 0) return { size: 'grande' as const, columns: 1 }
    if (available >= TOOL_COUNT * 54) return { size: 'grande' as const, columns: 1 }
    if (available >= TOOL_COUNT * 45) return { size: 'media' as const, columns: 1 }
    if (available >= TOOL_COUNT * 37) return { size: 'piccola' as const, columns: 1 }
    // ultima spiaggia: due colonne strette, mai una colonna che scorre
    return { size: 'piccola' as const, columns: 2 }
  })()

  /** quante foto sono finite in ciascuna bolla: si legge sul galleggiante */
  const bubbleCounts = (() => {
    const tally: Record<string, number> = {}
    for (const outcome of Object.values(decidedRef.current)) {
      if (outcome === SKIP_ID) continue
      tally[outcome] = (tally[outcome] ?? 0) + 1
    }
    return tally
  })()

  const stageRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)

  // Un solo elenco di comandi: la colonna dello stage (modalità animata) e la
  // barra di lavoro (modalità ufficio) mostrano gli stessi strumenti, nello
  // stesso ordine. `stay` segna chi resta visibile in anteprima: l'occhio non
  // si muove MAI di posto — un interruttore deve restare sotto il cursore.
  const toolItems: { key: string; stay?: boolean; node: React.ReactNode }[] = [
    {
      key: 'develop',
      node: (
        <DevelopTool
          active={showDevelop}
          onClick={toggleDevelop}
          liquid={develop.bw ? '#9ca3af' : `rgba(${preset.vars['--pp-accent-rgb']}, 0.85)`}
        />
      )
    },
    {
      key: 'loupe',
      node: <LoupeTool active={loupeSticky} onClick={() => setLoupeSticky((v) => !v)} />
    },
    { key: 'details', node: <DetailsTool active={closeUpCrop !== null} onClick={toggleCloseUps} /> },
    {
      key: 'burst',
      node: (
        <BurstTool
          count={currentScene?.length ?? 0}
          active={showBurst}
          disabled={(currentScene?.length ?? 0) < 2}
          onClick={toggleBurst}
        />
      )
    },
    { key: 'lock', node: <LockTool active={lockAspect} onClick={toggleLock} /> },
    { key: 'film', node: <FilmTool active={showStrip} onClick={toggleStrip} /> },
    { key: 'sep1', node: <ToolDivider /> },
    { key: 'cropzoom', node: <CropTool onClick={doCropToFrame} /> },
    { key: 'reframe', node: <ReframeTool onClick={doReframe} /> },
    { key: 'fill', node: <FrameTool mode="fill" onClick={() => (snapshotStage('tool'), controllerRef.current?.fillFrame())} /> },
    { key: 'fit', node: <FrameTool mode="fit" onClick={() => (snapshotStage('tool'), controllerRef.current?.fitFrame())} /> },
    { key: 'reset', node: <ResetRock onReset={() => controllerRef.current?.reset()} /> },
    {
      key: 'undo',
      node: (
        <UndoFlip
          onUndo={undo}
          disabled={busy || (decisions.length === 0 && editHistoryRef.current.length === 0)}
        />
      )
    },
    { key: 'sep2', node: <ToolDivider /> },
    {
      key: 'eye',
      stay: true,
      node: <EyeToggle open={!previewMode} onToggle={() => setPreviewMode((p) => !p)} />
    },
    { key: 'finish', node: <GuillotineExit onDone={finishAlbum} /> }
  ]

  // la barra della modalità ufficio: gli stessi comandi, in riga
  const tools = (
    <>
      {toolItems.map((item) => (
        <span key={item.key} style={{ display: 'contents' }}>
          {item.node}
        </span>
      ))}
    </>
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--pp-line)] px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onExit}
            title="Torna alle impostazioni — la sessione resta salvata e si riprende da qui"
            className="pp-tool-flat shrink-0 rounded-[var(--pp-radius)] border border-[var(--pp-line)] px-2 py-1 text-sm text-[var(--pp-ink-dim)] hover:border-[var(--pp-line-strong)] hover:text-[var(--pp-ink-strong)]"
          >
            ←
          </button>
          <h1 className="shrink-0 text-lg font-bold">
            pic<span className="text-[var(--pp-accent)]">&</span>pick
          </h1>
          <span className="truncate text-sm text-[var(--pp-ink-dim)]">
            {file
              ? file.name
              : closing
                ? animated
                  ? 'Il mare si calma…'
                  : 'Chiusura album…'
                : 'Riepilogo sessione'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm">
          {file && config.chapters && (
            <span className="rounded-[var(--pp-radius)] bg-[var(--pp-panel)] px-2 py-0.5 text-xs text-[var(--pp-ink)]">
              {chapterLabel(file.takenAt)}
            </span>
          )}
          {file && currentScene && currentScene.length > 1 && (
            <button
              onClick={toggleBurst}
              title="Vedi la raffica intera (S)"
              className="rounded-[var(--pp-radius)] bg-[var(--pp-panel)] px-2 py-0.5 text-xs text-[var(--pp-ink)] hover:text-[var(--pp-ink-strong)]"
            >
              Raffica {positionInScene}/{currentScene.length}
            </button>
          )}
          <span className="text-emerald-400">{counts.sorted} smistate</span>
          <span className="text-rose-400">{counts.skipped} scartate</span>
          <span className="rounded bg-[var(--pp-panel)] px-2 py-0.5 tabular-nums">
            {Math.min(index + 1, queue.length)} / {queue.length}
          </span>
          <button
            title={`Mondo visivo: ${preset.label} — premi P per cambiare`}
            onClick={cyclePreset}
            className="flex items-center gap-1.5 rounded-[var(--pp-radius)] border border-[var(--pp-line)] px-2 py-0.5 text-xs text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: 'var(--pp-accent)' }}
            />
            {preset.label}
          </button>
          {!summaryMode && developTouched && (
            <span
              title={`Questa foto ha uno sviluppo suo (${mixLabel(doses)})`}
              className="rounded-[var(--pp-radius)] bg-[var(--pp-accent)]/15 px-2 py-0.5 text-xs text-[var(--pp-accent)]"
            >
              sviluppata
            </span>
          )}
          <button
            title={
              animated
                ? 'Interfaccia animata: passa alla versione da lavoro (M)'
                : 'Interfaccia da lavoro: torna alla versione animata (M)'
            }
            onClick={toggleUiMode}
            className="flex items-center gap-1.5 rounded-[var(--pp-radius)] border border-[var(--pp-line)] px-2 py-0.5 text-xs text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]"
          >
            {animated ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
                <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
              </svg>
            )}
            {animated ? 'Animata' : 'Lavoro'}
          </button>
          <button
            title={muted ? 'Riattiva i suoni' : 'Silenzia i suoni'}
            onClick={() => {
              const next = !muted
              sound.setMuted(next)
              setMuted(next)
            }}
            className="rounded p-1 text-[var(--pp-ink)] hover:text-[var(--pp-ink-strong)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 L6 9 H3 v6 h3 l5 4 Z" />
              {muted ? (
                <path d="M16 9 l5 6 M21 9 l-5 6" />
              ) : (
                <path d="M15.5 8.5 a5 5 0 0 1 0 7 M18 6 a8.5 8.5 0 0 1 0 12" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* modalità ufficio: una barra di lavoro con tutti i comandi in chiaro */}
      {!animated && !summaryMode && (
        <div
          ref={toolsRef}
          className="flex flex-wrap items-center gap-2 border-b border-[var(--pp-line)] bg-[var(--pp-scrim)] px-4 py-2"
        >
          {tools}
        </div>
      )}

      {summaryMode && showWall ? (
        <AlbumWall config={config} onClose={() => setShowWall(false)} />
      ) : summaryMode ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="space-y-1 text-center">
              <h2 className="flex items-center justify-center gap-2 text-3xl font-black">
                <CheckMark size={26} className="text-emerald-400" />
                Fatto!
              </h2>
              <p className="text-[var(--pp-ink)]">
                <span className="font-semibold text-emerald-400">{counts.sorted}</span> smistate ·{' '}
                <span className="font-semibold text-rose-400">{counts.skipped}</span> scartate
              </p>
            </div>

            {/* dove è finito l'album: la domanda vera di fine sessione */}
            <div className="mx-auto flex w-full max-w-xl items-center gap-3 rounded-[var(--pp-radius-lg)] border border-[var(--pp-line)] bg-[var(--pp-panel)] px-4 py-3 text-left">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-[var(--pp-accent)]"
              >
                <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5Z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] tracking-wide text-[var(--pp-ink-dim)] uppercase">
                  Album salvato in
                </p>
                <p className="truncate text-sm text-[var(--pp-ink)]" title={config.destDir}>
                  {config.destDir}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--pp-ink-dim)]">
                  Una sottocartella per bolla:{' '}
                  {config.bubbles.map((b) => b.label).join(' · ')}
                  {config.exportSmall ? ' · più le copie «social»' : ''}
                </p>
              </div>
              <button
                onClick={() => {
                  void window.picpick.openFolder(config.destDir).then((ok) => {
                    if (!ok) showNote('Non riesco ad aprire la cartella')
                  })
                }}
                className="shrink-0 rounded-[var(--pp-radius)] border border-[var(--pp-line)] px-3 py-1.5 text-xs text-[var(--pp-ink)] hover:border-[var(--pp-accent)] hover:text-[var(--pp-accent)]"
              >
                Apri la cartella
              </button>
            </div>

            <div className="space-y-1 text-center">
              {decisions.length > 0 && (
                <p className="text-xs text-[var(--pp-ink-dim)]">
                  Clicca una foto per ripescarla e deciderla di nuovo.
                </p>
              )}
            </div>
            {decisions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {(() => {
                  const minutes = Math.max(
                    0.1,
                    (performance.now() - sessionStartRef.current) / 60000
                  )
                  const pace = decisions.length / minutes
                  const tally: Record<string, number> = {}
                  for (const d of decisions) {
                    if (d.bubbleId !== SKIP_ID) tally[d.bubbleId] = (tally[d.bubbleId] ?? 0) + 1
                  }
                  const topId = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0]
                  const top = topId ? bubbleById(topId) : null
                  const kept = decisions.filter((d) => d.bubbleId !== SKIP_ID).length
                  const cards: { label: string; value: string; tint?: string }[] = [
                    {
                      label: 'durata',
                      value:
                        minutes < 1
                          ? `${Math.round(minutes * 60)}s`
                          : `${Math.floor(minutes)}m ${Math.round((minutes % 1) * 60)}s`
                    },
                    { label: 'ritmo', value: `${pace.toFixed(1)} foto/min` },
                    {
                      label: 'promosse',
                      value: `${Math.round((kept / decisions.length) * 100)}%`
                    }
                  ]
                  if (top) cards.push({ label: 'bolla del cuore', value: top.label, tint: top.tint })
                  return cards.map((card) => (
                    <span
                      key={card.label}
                      className="rounded-[var(--pp-radius-lg)] border border-[var(--pp-line)] px-3 py-1.5 text-center"
                      style={
                        card.tint ? { borderColor: `rgba(${card.tint}, 0.6)` } : undefined
                      }
                    >
                      <span className="block text-[10px] tracking-wide text-[var(--pp-ink-dim)] uppercase">
                        {card.label}
                      </span>
                      <span
                        className="text-sm font-semibold"
                        style={card.tint ? { color: `rgb(${card.tint})` } : undefined}
                      >
                        {card.value}
                      </span>
                    </span>
                  ))
                })()}
              </div>
            )}
            {decisions.length > 0 && (
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6">
                {decisions.map((decision) => {
                  const bubble = bubbleById(decision.bubbleId)
                  return (
                    <button
                      key={decision.fileName}
                      onClick={() => repick(decision)}
                      title={`${decision.fileName} — ${bubble ? bubble.label : 'Non passa'} (clicca per ripescare)`}
                      className="group relative overflow-hidden rounded-[var(--pp-radius)] ring-2 transition-transform hover:scale-105"
                      style={{
                        // il colore dell'anello racconta l'esito
                        ['--tw-ring-color' as string]: bubble
                          ? `rgb(${bubble.tint})`
                          : 'rgba(168, 162, 158, 0.6)'
                      }}
                    >
                      {decision.thumbnail ? (
                        <img src={decision.thumbnail} alt="" className="aspect-square w-full object-cover" />
                      ) : (
                        <div className="grid aspect-square w-full place-items-center bg-[var(--pp-panel)] text-xs text-[var(--pp-ink-dim)]">
                          {decision.fileName}
                        </div>
                      )}
                      <span
                        className="absolute right-0 bottom-0 left-0 truncate px-1 py-0.5 text-center text-[10px] text-[var(--pp-ink-strong)]"
                        style={{
                          backgroundColor: bubble
                            ? `rgba(${bubble.tint}, 0.75)`
                            : 'rgba(87, 83, 78, 0.75)'
                        }}
                      >
                        {bubble ? bubble.label : 'Non passa'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {previousDecided.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs tracking-wide text-[var(--pp-ink-dim)] uppercase">
                  Sessioni precedenti · {previousDecided.length} foto
                </p>
                <p className="text-[11px] text-[var(--pp-ink-dim)]">
                  Decise le volte scorse: clicca per rimetterle in coda. La copia già esportata
                  resta nella cartella.
                </p>
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {previousDecided.map((entry) => {
                    const bubble = bubbleById(entry.bubbleId)
                    return (
                      <button
                        key={entry.name}
                        onClick={() => repickPrevious(entry.name)}
                        title={`${entry.name} — ${bubble ? bubble.label : entry.bubbleId === SKIP_ID ? 'Non passa' : 'Bolla di allora'} (clicca per ripescare)`}
                        className="max-w-56 truncate rounded-full border border-[var(--pp-line)] px-2.5 py-1 text-[11px] text-[var(--pp-ink)] hover:border-[var(--pp-accent)]/60 hover:text-[var(--pp-ink-strong)]"
                        style={{
                          borderLeftWidth: 3,
                          borderLeftColor: bubble
                            ? `rgb(${bubble.tint})`
                            : 'rgba(168, 162, 158, 0.6)'
                        }}
                      >
                        {entry.name.split('/').pop()}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowWall(true)}
                className="rounded-[var(--pp-radius-lg)] border border-[var(--pp-line)] px-4 py-2 text-sm text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]"
              >
                Muro dell'album
              </button>
              {decisions.length > 0 && (
                <button
                  onClick={undo}
                  className="rounded-[var(--pp-radius-lg)] border border-[var(--pp-line)] px-4 py-2 text-sm text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]"
                >
                  Ripesca l'ultima
                </button>
              )}
              <button
                onClick={onExit}
                className="rounded-[var(--pp-radius-lg)] bg-[var(--pp-accent)] px-6 py-2.5 font-bold text-[var(--pp-on-accent)] hover:bg-[var(--pp-accent-hover)]"
              >
                Nuova sessione
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div ref={stageRef} className="relative min-h-0 flex-1">
          <EditorStage
            image={image}
            ratio={effectiveRatio}
            background={config.background}
            cropOpacity={cropOpacity}
            hideUi={previewMode}
            develop={shownDevelop}
            developed={developed}
            entryMode={config.entryMode}
            lockAspect={lockAspect}
            matFraction={config.matPercent}
            matColor={config.matColor}
            cropShape={config.cropShape}
            captionFont={config.captionFont}
            dateStamp={config.dateStamp}
            takenAt={file?.takenAt ?? 0}
            frameNumber={index + 1}
            outputLongEdge={config.outputLongEdge}
            onViewScale={handleViewScale}
            onBeforeEdit={(group) => snapshotStage(group, group === 'wheel' ? 600 : 0)}
            caption={caption}
            onCaptionChange={
              file
                ? (text) => setCaptionByFile((prev) => ({ ...prev, [file.name]: text }))
                : undefined
            }
            flash={flash}
            loupeSticky={loupeSticky}
            pickingColor={wbPicking}
            onPickColor={onPickedColor}
            onLoupeExit={() => setLoupeSticky(false)}
            controllerRef={controllerRef}
          />
          {/* le bolle: ognuna sta a casa sua e respira sul posto */}
          {animated && !previewMode && (
            <Bubbles
              bubbles={config.bubbles}
              onSort={(bubble) => void handleSort(bubble)}
              onSortExtra={(bubble) => void handleSortExtra(bubble)}
              onLater={handleLater}
              onSkip={handleSkip}
              disabled={busy || closing}
              popAllSignal={popSignal}
              counts={bubbleCounts}
            />
          )}

          {/* cassetta degli attrezzi: nel mondo animato è una colonna di oggetti.
              In anteprima gli altri svaniscono ma TENGONO IL POSTO: l'occhio
              resta esattamente dov'era, pronto a essere ricliccato. */}
          {animated && !closing && (
            <div
              ref={toolsRef}
              data-size={toolLayout.size}
              className={`pp-tools absolute top-4 right-4 items-center gap-2 px-1 ${
                toolLayout.columns === 2 ? 'grid grid-cols-2' : 'flex flex-col'
              }`}
              style={{ zIndex: LAYER.tools }}
            >
              {toolItems.map((item) => (
                <div
                  key={item.key}
                  className={`transition-opacity duration-300 ${
                    previewMode && !item.stay ? 'pointer-events-none opacity-0' : ''
                  }`}
                >
                  {item.node}
                </div>
              ))}
            </div>
          )}
          {!image && !error && (
            <div className="absolute inset-0 grid place-items-center text-[var(--pp-ink-dim)]">
              Caricamento…
            </div>
          )}
          {/* confronto: tieni premuto C per vedere l'ultima foto promossa */}
          {compareHeld && lastSortedRef.current && (
            <div className="absolute inset-y-0 right-0 flex w-1/2 flex-col border-l border-[var(--pp-line)] bg-[var(--pp-surface)] backdrop-blur"
              style={{ zIndex: LAYER.overlay }}>
              <p className="px-4 py-2 text-xs tracking-wide text-[var(--pp-ink)] uppercase">
                Ultima promossa · {lastSortedRef.current.label}
              </p>
              <img
                src={lastSortedRef.current.dataUrl}
                alt=""
                className="min-h-0 flex-1 object-contain p-3"
              />
            </div>
          )}
          {showOriginal && (
            <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-[var(--pp-scrim)] px-3 py-1 text-xs tracking-wide text-[var(--pp-ink-strong)] uppercase ring-1 ring-[var(--pp-line)]"
              style={{ zIndex: LAYER.toast }}>
              Originale, senza sviluppo
            </div>
          )}
          {busy && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-[var(--pp-panel)] px-4 py-1.5 text-sm backdrop-blur"
              style={{ zIndex: LAYER.toast }}>
              Salvataggio…
            </div>
          )}
          {note && !busy && (
            <div
              className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-[var(--pp-scrim)] px-4 py-1.5 text-sm text-[var(--pp-ink)] ring-1 ring-[var(--pp-line)] backdrop-blur"
              style={{ zIndex: LAYER.toast }}
            >
              {note}
            </div>
          )}
          {error && (
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-[var(--pp-radius-lg)] bg-rose-600 px-4 py-2 text-sm shadow-lg"
              style={{ zIndex: LAYER.toast }}>
              <span>{error}</span>
              <button onClick={handleSkip} className="rounded bg-[var(--pp-panel)] px-2 py-0.5 hover:bg-[var(--pp-panel)]">
                Salta
              </button>
            </div>
          )}
          {/* cartello del capitolo: appare al cambio di mese e si dissolve */}
          {chapterBanner && (
            <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ zIndex: LAYER.toast }}>
              <span
                className="block rounded-[var(--pp-radius-lg)] bg-[var(--pp-scrim)] px-6 py-3 text-xl font-black tracking-tight text-[var(--pp-ink-strong)] ring-1 ring-[var(--pp-line)] backdrop-blur"
                style={{ animation: 'chapter-card 700ms var(--pp-ease)' }}
              >
                {chapterBanner}
              </span>
            </div>
          )}
          {/* dettagli a pixel reali sui tre punti del ritaglio */}
          {closeUpCrop && image && (
            <CloseUps
              image={image}
              crop={closeUpCrop}
              develop={shownDevelop}
              sharpness={file ? (peekInfo(file.path)?.sharpness ?? 0) : 0}
              onClose={() => setCloseUpCrop(null)}
            />
          )}
          {/* camera di sviluppo della foto corrente */}
          {showDevelop && !previewMode && (
            <DevelopPanel
              develop={develop}
              baseDevelop={sessionDevelop}
              doses={doses}
              onDoses={applyDoses}
              onChange={patchDevelop}
              developed={developed}
              onAuto={applyAuto}
              wbPicking={wbPicking}
              onWbPick={() => setWbPicking((v) => !v)}
              onAutoSharpen={applyAutoSharpen}
              onHover={setPreviewDevelop}
              onCopyPrevious={lastLeftRef.current ? copyFromPrevious : null}
              sceneCount={Math.max(0, (currentScene?.length ?? 1) - 1)}
              onApplyToScene={applyToScene}
              onResetToAlbum={() => {
                if (file) setDevelopFor(file.name, { develop: sessionDevelop, doses: sessionDoses })
              }}
              onApplyToAll={() => {
                setSessionDevelop(develop)
                setSessionDoses(doses)
                // le regolazioni diventano la partenza: quella della foto non serve più
                if (file) {
                  setDevByFile((prev) => {
                    const next = { ...prev }
                    delete next[file.name]
                    return next
                  })
                }
              }}
              onClose={() => setShowDevelop(false)}
            />
          )}
          {/* la raffica intera, per scegliere tra scatti quasi identici */}
          {showBurst && currentScene && (
            <BurstPanel
              queue={queue}
              sceneIndices={currentScene}
              index={index}
              onJump={jumpTo}
              onClose={() => setShowBurst(false)}
            />
          )}
        </div>
      )}

      {!animated && !summaryMode && (
        <SortBar
          bubbles={config.bubbles}
          onSort={(bubble) => void handleSort(bubble)}
          onSortExtra={(bubble) => void handleSortExtra(bubble)}
          onLater={handleLater}
          onSkip={handleSkip}
          disabled={busy || closing}
        />
      )}

      {!summaryMode && showStrip && (
        <Filmstrip
          queue={queue}
          index={index}
          decided={decidedRef.current}
          bubbles={config.bubbles}
          sceneOf={sceneOf}
          laterNames={laterNames}
          onJump={jumpTo}
        />
      )}

      {!summaryMode && (
        <footer className="flex items-center gap-6 border-t border-[var(--pp-line)] px-5 py-3">
          <label className="flex items-center gap-3 text-sm text-[var(--pp-ink)]">
            Opacità fuori ritaglio
            <input
              type="range"
              min={0}
              max={100}
              value={cropOpacity}
              onChange={(e) => setCropOpacity(Number(e.target.value))}
              className="w-44 accent-[var(--pp-accent)]"
            />
            <span className="w-8 text-right tabular-nums">{cropOpacity}</span>
          </label>

          <span className="ml-auto flex items-center gap-2 text-xs text-[var(--pp-ink-dim)]">
            <span>{shortcutLegend(!showAllKeys)}</span>
            <button
              onClick={() => setShowAllKeys((v) => !v)}
              className="shrink-0 rounded-full border border-[var(--pp-line)] px-2 py-0.5 text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]"
              title={showAllKeys ? 'Torna alla legenda breve' : 'Mostra tutte le scorciatoie'}
            >
              {showAllKeys ? 'meno' : '? tasti'}
            </button>
          </span>
        </footer>
      )}
    </div>
  )
}
