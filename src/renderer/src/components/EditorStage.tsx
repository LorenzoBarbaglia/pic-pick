import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, MutableRefObject, PointerEvent as ReactPointerEvent } from 'react'
import type { Background, CropRect } from '../types'
import { animateSpring } from '../lib/spring'
import { sound } from '../lib/sound'
import { usePreset } from '../lib/preset'
import {
  grainImageUrl,
  grainPixelSize,
  GRAIN_TILE_PX,
  grainStrength,
  vignetteGradient,
  vignetteStrength
} from '../lib/develop'
import type { Develop } from '../lib/develop'
import { renderDetail } from '../lib/useDeveloped'
import { RotateMark } from './Icons'
import {
  captionFontById,
  drawInkStamp,
  drawPrintOverlay,
  MAT_BOTTOM_FACTOR,
  printSize,
  shapePathD,
  stampDateText
} from '../lib/print'
import type { CaptionFontId, CropShape, DateStampId } from '../lib/print'
import type { DevelopedImage } from '../lib/useDeveloped'
import { LAYER } from '../lib/interactions'
import { DotSea } from './DotSea'
import type { DotSeaController } from './DotSea'

export interface FrameRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ExportState {
  /** centro dell'immagine in coordinate stage */
  cx: number
  cy: number
  /** px immagine → px stage */
  scale: number
  /** gradi, al rilascio sempre multiplo di 90 */
  rotation: number
  frame: FrameRect
  crop: CropRect
}

export interface StageController {
  getExportState: () => ExportState | null
  /** riporta la foto alla composizione di partenza (pre-taglio incluso) */
  reset: () => void
  /** ritaglia al formato album riempiendo il frame */
  fillFrame: () => void
  /** mostra la foto intera dentro il frame, ritaglio pieno */
  fitFrame: () => void
  /** rimette il ritaglio corrente a combaciare col riquadro (annulla lo zoom) */
  frameCrop: () => void
  /** il ritaglio diventa ciò che si vede nel riquadro (lo zoom si fa taglio) */
  cropToFrame: () => boolean
  /** rimette vista, rotazione e ritaglio come erano: l'annulla delle modifiche */
  restoreStage: (state: {
    cx: number
    cy: number
    scale: number
    rotation: number
    crop: CropRect
  }) => void
  /** il mare assorbe il colore dominante di una foto promossa */
  absorb: (color: { r: number; g: number; b: number }) => void
  /** rito di chiusura: un'onda di gocce attraversa il mare */
  wave: () => void
}

interface View {
  cx: number
  cy: number
  scale: number
}

interface EditorStageProps {
  /** ogni nuova foto è un nuovo elemento: al cambio si resetta tutto */
  image: HTMLImageElement | null
  /** larghezza/altezza del formato album */
  ratio: number
  /** sfondo album, riempie il frame dove la foto non copre */
  background: Background
  /** 0 = vedo solo il ritaglio, 100 = vedo anche l'immagine fuori dal ritaglio */
  cropOpacity: number
  /** nasconde tutta la UI di editing per vedere solo il risultato */
  hideUi: boolean
  /** regolazioni della foto: si vedono live esattamente come verranno salvate */
  develop: Develop
  /** la foto già sviluppata dalla GPU: è questa che si vede sullo stage */
  developed: DevelopedImage
  /** 'fill' = pre-taglio al formato che riempie il frame; 'fit' = foto intera */
  entryMode: 'fill' | 'fit'
  /** le maniglie del ritaglio mantengono le proporzioni dell'album */
  lockAspect: boolean
  /** passe-partout: frazione del lato corto (0 = nessuno); anteprima attorno al frame */
  matFraction?: number
  /** colore della cornice; null = lo stesso dello sfondo */
  matColor?: string | null
  /** didascalia mostrata sulla cornice, in anteprima */
  caption?: string
  /** se presente, la didascalia si scrive direttamente sulla cornice */
  onCaptionChange?: (text: string) => void
  /** sagoma di ritaglio della stampa */
  cropShape?: CropShape
  /** font della didascalia sulla cornice */
  captionFont?: CaptionFontId
  /** timbro della data di scatto */
  dateStamp?: DateStampId
  /** momento dello scatto, per i timbri */
  takenAt?: number
  /** numero di fotogramma: la posizione nella sessione */
  frameNumber?: number
  /** lato lungo dell'export: dice quando il ritaglio è stirato oltre i pixel */
  outputLongEdge?: number
  /** quanti pixel schermo occupa un pixel della foto: serve all'anteprima */
  onViewScale?: (scale: number) => void
  /**
   * Sta per iniziare una modifica (pan, ritaglio, rotazione, zoom): chi ci
   * ascolta può fotografare lo stato di ORA, che è quello a cui tornare.
   * `group` serve a non riempire la cronologia di un passo per tacca di rotella.
   */
  onBeforeEdit?: (group: string) => void
  /** lampo del frame nel colore della bolla scelta */
  flash?: { tint: string; key: number } | null
  /** lente agganciata al cursore anche senza tenere Z */
  loupeSticky?: boolean
  /** contagocce del bianco attivo: il prossimo clic sulla foto preleva un colore */
  pickingColor?: boolean
  /** campione prelevato (media 5×5 dall'originale); null = clic fuori dalla foto */
  onPickColor?: (color: { r: number; g: number; b: number } | null) => void
  /** chiamata quando l'utente vuole liberarsi della lente */
  onLoupeExit?: () => void
  controllerRef: MutableRefObject<StageController | null>
}

const MIN_CROP_SCREEN_PX = 24
const ROTATE_HANDLE_OFFSET_PX = 22
const GRAB_STRIP_PX = 14
const SNAP_PX = 8
/** diametro della lente a pixel reali (tasto Z tenuto) */
const LOUPE_PX = 260

// 8 maniglie di ritaglio: dx/dy indicano quali lati muovono (-1 = min, 1 = max)
const CROP_HANDLES = [
  { id: 'nw', dx: -1, dy: -1, cursor: 'nwse-resize' },
  { id: 'n', dx: 0, dy: -1, cursor: 'ns-resize' },
  { id: 'ne', dx: 1, dy: -1, cursor: 'nesw-resize' },
  { id: 'e', dx: 1, dy: 0, cursor: 'ew-resize' },
  { id: 'se', dx: 1, dy: 1, cursor: 'nwse-resize' },
  { id: 's', dx: 0, dy: 1, cursor: 'ns-resize' },
  { id: 'sw', dx: -1, dy: 1, cursor: 'nesw-resize' },
  { id: 'w', dx: -1, dy: 0, cursor: 'ew-resize' }
] as const

/** vero se il colore è chiaro: sceglie l'inchiostro del timbro */
function matStampIsLight(color: string | null): boolean {
  if (!color) return false
  const hex = color.replace('#', '')
  if (hex.length < 6) return true
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140
}

/**
 * L'anteprima degli stili di stampa: un canvas che chiama la STESSA funzione
 * di disegno dell'export. I fori del fotogramma, sul trasparente, mostrano la
 * scacchiera invece di bucare davvero.
 */
function PrintOverlayCanvas({
  left,
  top,
  width,
  height,
  style,
  outsideFill,
  dateStamp,
  takenAt,
  frameNumber
}: {
  left: number
  top: number
  width: number
  height: number
  style: CropShape
  outsideFill: string | null
  dateStamp: DateStampId
  takenAt: number
  frameNumber: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    drawPrintOverlay(ctx, width, height, {
      style,
      outsideFill,
      holes: 'checker',
      dateStamp,
      takenAt,
      frameNumber
    })
  }, [width, height, style, outsideFill, dateStamp, takenAt, frameNumber])
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute"
      style={{ left, top, width, height, zIndex: LAYER.veil }}
    />
  )
}

/** il timbro sulla fascia della cornice: la stessa mano dell'export */
function InkStampCanvas({
  left,
  top,
  width,
  height,
  takenAt,
  onLight
}: {
  left: number
  top: number
  width: number
  height: number
  takenAt: number
  onLight: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    drawInkStamp(ctx, stampDateText(takenAt), width, height / 2, Math.max(8, height * 0.16), onLight)
  }, [width, height, takenAt, onLight])
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute"
      style={{ left, top, width, height, zIndex: LAYER.veil }}
    />
  )
}

/** colore della didascalia in anteprima: scuro su cornici chiare, e viceversa */
function matCaptionColor(backgroundColor: string | null): string {
  if (!backgroundColor) return 'rgba(232, 226, 216, 0.9)'
  const hex = backgroundColor.replace('#', '')
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140
    ? 'rgba(58, 51, 43, 0.85)'
    : 'rgba(232, 226, 216, 0.9)'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function computeFrame(stage: { width: number; height: number }, ratio: number): FrameRect {
  const maxWidth = stage.width * 0.82
  const maxHeight = stage.height * 0.75
  let width = maxWidth
  let height = maxWidth / ratio
  if (height > maxHeight) {
    height = maxHeight
    width = maxHeight * ratio
  }
  return {
    x: (stage.width - width) / 2,
    y: (stage.height - height) / 2,
    width,
    height
  }
}

function fitViewInFrame(image: HTMLImageElement, frame: FrameRect): View {
  const scale = Math.min(frame.width / image.naturalWidth, frame.height / image.naturalHeight)
  return { cx: frame.x + frame.width / 2, cy: frame.y + frame.height / 2, scale }
}

function fullCrop(image: HTMLImageElement): CropRect {
  return { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight }
}

/**
 * Pre-taglio: il rettangolo più grande con le proporzioni dell'album che entra
 * nella foto. Sui ritagli verticali si tiene un po' più in alto del centro,
 * dove nelle foto stanno le teste e gli orizzonti.
 */
function coverCrop(image: HTMLImageElement, ratio: number): CropRect {
  const imageRatio = image.naturalWidth / image.naturalHeight
  let w = image.naturalWidth
  let h = image.naturalHeight
  if (imageRatio > ratio) {
    w = image.naturalHeight * ratio
  } else {
    h = image.naturalWidth / ratio
  }
  return {
    x: (image.naturalWidth - w) / 2,
    y: (image.naturalHeight - h) * 0.38,
    w,
    h
  }
}

/** vista che fa combaciare un ritaglio col frame */
function viewForCrop(crop: CropRect, image: HTMLImageElement, frame: FrameRect): View {
  const scale = frame.width / crop.w
  const cropCenterX = crop.x + crop.w / 2 - image.naturalWidth / 2
  const cropCenterY = crop.y + crop.h / 2 - image.naturalHeight / 2
  return {
    scale,
    cx: frame.x + frame.width / 2 - cropCenterX * scale,
    cy: frame.y + frame.height / 2 - cropCenterY * scale
  }
}

// coordinate immagine → coordinate stage per una data vista/rotazione
export function transformPoint(
  view: View,
  rotationDeg: number,
  image: HTMLImageElement,
  ix: number,
  iy: number
): { x: number; y: number } {
  const dx = (ix - image.naturalWidth / 2) * view.scale
  const dy = (iy - image.naturalHeight / 2) * view.scale
  const rad = (rotationDeg * Math.PI) / 180
  return {
    x: view.cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: view.cy + dx * Math.sin(rad) + dy * Math.cos(rad)
  }
}

// bounding box a schermo del ritaglio (vale per qualsiasi rotazione)
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * L'area di composizione: il ritaglio TRATTENUTO dal riquadro.
 *
 * Sopra il riquadro vince il riquadro (zoomando il rettangolo resta immobile),
 * sotto vince il ritaglio (rimpicciolendolo il rettangolo lo seguo). Una
 * regola sola per i due comportamenti. Arrotondata al pixel: su valori
 * frazionari le linee sfarfallano.
 */
export function composeArea(
  bounds: { left: number; right: number; top: number; bottom: number },
  frame: { x: number; y: number; width: number; height: number },
  minSide = 24
): Rect | null {
  const x = Math.round(Math.max(bounds.left, frame.x))
  const y = Math.round(Math.max(bounds.top, frame.y))
  const right = Math.round(Math.min(bounds.right, frame.x + frame.width))
  const bottom = Math.round(Math.min(bounds.bottom, frame.y + frame.height))
  if (right - x < minSide || bottom - y < minSide) return null
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * Le rotelle di rotazione: appena fuori dagli angoli VERI del ritaglio (quindi
 * ruotate con lui e strette su di lui), ma trattenute al bordo del riquadro —
 * così zoomando si fermano lì invece di volare fuori schermo.
 */
export function clampHandles(
  corners: { x: number; y: number }[],
  rotationDeg: number,
  frame: { x: number; y: number; width: number; height: number },
  off: number
): { left: number; top: number }[] {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const signs = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ] as const
  return corners.map((corner, i) => {
    const dx = signs[i][0] * off
    const dy = signs[i][1] * off
    return {
      left: clamp(corner.x + dx * cos - dy * sin, frame.x - off, frame.x + frame.width + off),
      top: clamp(corner.y + dx * sin + dy * cos, frame.y - off, frame.y + frame.height + off)
    }
  })
}

/**
 * L'inverso di `transformPoint`: da un punto sullo schermo al pixel della foto
 * che ci sta sotto. Serve a capire COSA si sta guardando, non solo dove.
 */
export function inverseTransformPoint(
  view: View,
  rotationDeg: number,
  image: HTMLImageElement,
  sx: number,
  sy: number
): { x: number; y: number } {
  const ux = sx - view.cx
  const uy = sy - view.cy
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // rotazione inversa, poi via la scala
  const dx = ux * cos + uy * sin
  const dy = -ux * sin + uy * cos
  return {
    x: dx / view.scale + image.naturalWidth / 2,
    y: dy / view.scale + image.naturalHeight / 2
  }
}

function cropScreenBounds(
  view: View,
  rotationDeg: number,
  image: HTMLImageElement,
  crop: CropRect
): { left: number; right: number; top: number; bottom: number } {
  const corners = [
    transformPoint(view, rotationDeg, image, crop.x, crop.y),
    transformPoint(view, rotationDeg, image, crop.x + crop.w, crop.y),
    transformPoint(view, rotationDeg, image, crop.x + crop.w, crop.y + crop.h),
    transformPoint(view, rotationDeg, image, crop.x, crop.y + crop.h)
  ]
  return {
    left: Math.min(...corners.map((c) => c.x)),
    right: Math.max(...corners.map((c) => c.x)),
    top: Math.min(...corners.map((c) => c.y)),
    bottom: Math.max(...corners.map((c) => c.y))
  }
}

// il più piccolo aggiustamento (entro SNAP_PX) che aggancia un bordo a un target
function bestSnapDelta(edges: number[], targets: number[]): number {
  let best = 0
  let bestAbs = SNAP_PX
  for (const edge of edges) {
    for (const target of targets) {
      const delta = target - edge
      if (Math.abs(delta) < bestAbs) {
        bestAbs = Math.abs(delta)
        best = delta
      }
    }
  }
  return best
}

// tra due candidati di snap vince quello più vicino (0 = nessun aggancio)
function pickSnap(a: number, b: number): number {
  if (a === 0) return b
  if (b === 0) return a
  return Math.abs(a) <= Math.abs(b) ? a : b
}

/** quali agganci sono attivi in questo momento: alimenta le guide magnetiche */
export interface SnapState {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
  centerX: boolean
  centerY: boolean
}

const NO_SNAP: SnapState = {
  left: false,
  right: false,
  top: false,
  bottom: false,
  centerX: false,
  centerY: false
}

/**
 * Rileva gli agganci confrontando la geometria, invece di dedurli da chi ha
 * mosso cosa: così pan, spostamento del ritaglio e ridimensionamento accendono
 * le stesse guide con la stessa regola.
 */
function detectSnap(
  view: View,
  rotationDeg: number,
  image: HTMLImageElement,
  crop: CropRect,
  frame: FrameRect
): SnapState {
  const bounds = cropScreenBounds(view, rotationDeg, image, crop)
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1.2
  return {
    left: near(bounds.left, frame.x),
    right: near(bounds.right, frame.x + frame.width),
    top: near(bounds.top, frame.y),
    bottom: near(bounds.bottom, frame.y + frame.height),
    centerX: near((bounds.left + bounds.right) / 2, frame.x + frame.width / 2),
    centerY: near((bounds.top + bounds.bottom) / 2, frame.y + frame.height / 2)
  }
}

function sameSnap(a: SnapState, b: SnapState): boolean {
  return (
    a.left === b.left &&
    a.right === b.right &&
    a.top === b.top &&
    a.bottom === b.bottom &&
    a.centerX === b.centerX &&
    a.centerY === b.centerY
  )
}

function snapCount(state: SnapState): number {
  return Object.values(state).filter(Boolean).length
}

export function EditorStage({
  image,
  ratio,
  background,
  cropOpacity,
  hideUi,
  develop,
  developed,
  entryMode,
  lockAspect,
  matFraction = 0,
  matColor = null,
  caption = '',
  onCaptionChange,
  cropShape = 'none',
  captionFont = 'classica',
  dateStamp = 'nessuno',
  takenAt = 0,
  frameNumber = 1,
  outputLongEdge = 0,
  onViewScale,
  onBeforeEdit,
  flash,
  loupeSticky = false,
  pickingColor = false,
  onPickColor,
  onLoupeExit,
  controllerRef
}: EditorStageProps) {
  const { preset, animated, seaBoost } = usePreset()
  const containerRef = useRef<HTMLDivElement>(null)
  const dotSeaRef = useRef<DotSeaController | null>(null)
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [rotation, setRotation] = useState(0)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [grabHover, setGrabHover] = useState(false)
  /**
   * Vero mentre si trascina qualcosa. Durante il movimento gli strati costosi
   * (la grana in mix-blend-mode su tutta la foto) vengono sospesi: il risultato
   * si rivede appena si rilascia, e il trascinamento resta fluido.
   */
  const [interacting, setInteracting] = useState(false)
  /** agganci attivi: accendono le guide magnetiche e fanno il «clic» */
  const [snap, setSnap] = useState<SnapState>(NO_SNAP)
  const snapRef = useRef(snap)
  snapRef.current = snap
  /** posizione della lente in coordinate stage: non null = tasto Z tenuto */
  const [loupe, setLoupe] = useState<{ x: number; y: number } | null>(null)
  const pointerStageRef = useRef({ x: 0, y: 0 })
  const loupeStickyRef = useRef(loupeSticky)
  loupeStickyRef.current = loupeSticky
  const onLoupeExitRef = useRef(onLoupeExit)
  onLoupeExitRef.current = onLoupeExit

  // la lente dal bottone resta appesa al cursore finché non la si spegne
  useEffect(() => {
    setLoupe(loupeSticky ? { ...pointerStageRef.current } : null)
  }, [loupeSticky])

  const viewRef = useRef(view)
  viewRef.current = view
  const imageRef = useRef(image)
  imageRef.current = image
  const rotationRef = useRef(rotation)
  rotationRef.current = rotation
  const cropRef = useRef(crop)
  cropRef.current = crop

  /**
   * Ricalcola gli agganci dopo un movimento: se ne è appena nato uno si sente
   * un piccolo clic, come una calamita che si attacca.
   */
  const refreshSnap = (nextView: View, nextCrop: CropRect): void => {
    if (!image || !frame) return
    const next = detectSnap(nextView, rotationRef.current, image, nextCrop, frame)
    if (sameSnap(next, snapRef.current)) return
    const wasCentered = snapRef.current.centerX && snapRef.current.centerY
    const isCentered = next.centerX && next.centerY
    // il centro perfetto ha un suono suo: è il traguardo, non un aggancio qualsiasi
    if (isCentered && !wasCentered) sound.center()
    else if (snapCount(next) > snapCount(snapRef.current)) sound.snap()
    snapRef.current = next
    setSnap(next)
  }

  const refreshSnapRef = useRef<((view: View, crop: CropRect) => void) | null>(null)
  const onBeforeEditRef = useRef<((group: string) => void) | undefined>(undefined)
  onBeforeEditRef.current = onBeforeEdit
  refreshSnapRef.current = refreshSnap

  const cancelSpringRef = useRef<(() => void) | null>(null)
  const initializedForRef = useRef<HTMLImageElement | null>(null)
  const prevFrameRef = useRef<FrameRect | null>(null)

  const panRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startView: View
  } | null>(null)
  const cropMoveRef = useRef<{
    pointerId: number
    startPoint: { x: number; y: number }
    startCrop: CropRect
  } | null>(null)
  const cropResizeRef = useRef<{
    pointerId: number
    dx: number
    dy: number
    startPoint: { x: number; y: number }
    startCrop: CropRect
  } | null>(null)
  const rotateRef = useRef<{
    pointerId: number
    startAngle: number
    startRotation: number
    centerClientX: number
    centerClientY: number
    /** Alt tenuto: la rotella è sganciata dai 90° */
    unlocked: boolean
  } | null>(null)
  /** vero mentre si sta ruotando: mostra l'angolo accanto alla foto */
  const [rotating, setRotating] = useState(false)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = (): void => setStageSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const frameRaw = stageSize ? computeFrame(stageSize, ratio) : null
  // con la cornice attiva il frame si stringe: la cornice si vede attorno,
  // ma tutta la geometria (fit, snap, export) resta quella del solo frame
  const matPx = frameRaw ? Math.min(frameRaw.width, frameRaw.height) * matFraction : 0
  const matBottomPx = matPx * MAT_BOTTOM_FACTOR
  const frame = frameRaw
    ? matFraction > 0
      ? {
          x: frameRaw.x + matPx,
          y: frameRaw.y + matPx,
          width: frameRaw.width - matPx * 2,
          height: frameRaw.height - matPx - matBottomPx
        }
      : frameRaw
    : null
  // il gestore della rotella si registra una volta sola: legge il frame da qui
  const frameRef = useRef(frame)
  frameRef.current = frame

  // reset completo per ogni nuova foto: la guardia è sull'IDENTITÀ dell'elemento
  // immagine (il path non basta: durante il cambio foto arriva prima la chiave
  // nuova con l'immagine vecchia ancora in state, e inizializzerebbe col fit
  // e il ritaglio della foto precedente)
  useLayoutEffect(() => {
    if (!image || !frame) return
    if (initializedForRef.current === image) return
    initializedForRef.current = image
    cancelSpringRef.current?.()
    setRotation(0)
    if (entryMode === 'fill') {
      // pre-taglio: la foto arriva già inquadrata nel formato dell'album,
      // pronta da spostare invece che da ritagliare da zero
      const precut = coverCrop(image, ratio)
      setCrop(precut)
      setView(viewForCrop(precut, image, frame))
    } else {
      setCrop(fullCrop(image))
      setView(fitViewInFrame(image, frame))
    }
    prevFrameRef.current = frame
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, frame?.width, frame?.height, frame?.x, frame?.y])

  // se la finestra viene ridimensionata, la vista segue il frame
  useLayoutEffect(() => {
    const prev = prevFrameRef.current
    if (frame && prev && (prev.x !== frame.x || prev.y !== frame.y || prev.width !== frame.width)) {
      const scaleRatio = frame.width / prev.width
      setView((v) =>
        v
          ? {
              scale: v.scale * scaleRatio,
              cx: frame.x + frame.width / 2 + (v.cx - (prev.x + prev.width / 2)) * scaleRatio,
              cy: frame.y + frame.height / 2 + (v.cy - (prev.y + prev.height / 2)) * scaleRatio
            }
          : v
      )
    }
    prevFrameRef.current = frame
  })

  useEffect(() => {
    controllerRef.current = {
      getExportState: () => {
        const currentView = viewRef.current
        const currentCrop = cropRef.current
        if (!currentView || !currentCrop || !frame) return null
        return {
          cx: currentView.cx,
          cy: currentView.cy,
          scale: currentView.scale,
          rotation: rotationRef.current,
          frame,
          crop: currentCrop
        }
      },
      reset: () => {
        if (!image || !frame) return
        cancelSpringRef.current?.()
        setRotation(0)
        if (entryMode === 'fill') {
          const precut = coverCrop(image, ratio)
          setCrop(precut)
          setView(viewForCrop(precut, image, frame))
        } else {
          setCrop(fullCrop(image))
          setView(fitViewInFrame(image, frame))
        }
      },
      fillFrame: () => {
        if (!image || !frame) return
        cancelSpringRef.current?.()
        // il ritaglio corrente diventa il più grande possibile col formato album,
        // mantenendo il centro di ciò che si stava guardando
        const currentCrop = cropRef.current
        const precut = coverCrop(image, ratio)
        if (currentCrop) {
          const centerX = currentCrop.x + currentCrop.w / 2
          const centerY = currentCrop.y + currentCrop.h / 2
          precut.x = clamp(centerX - precut.w / 2, 0, image.naturalWidth - precut.w)
          precut.y = clamp(centerY - precut.h / 2, 0, image.naturalHeight - precut.h)
        }
        setCrop(precut)
        setView(viewForCrop(precut, image, frame))
      },
      fitFrame: () => {
        if (!image || !frame) return
        cancelSpringRef.current?.()
        setCrop(fullCrop(image))
        setView(fitViewInFrame(image, frame))
      },
      frameCrop: reframeToCrop,
      cropToFrame: cropToView,
      restoreStage: (state) => {
        cancelSpringRef.current?.()
        setRotation(state.rotation)
        setCrop(state.crop)
        setView({ cx: state.cx, cy: state.cy, scale: state.scale })
      },
      absorb: (color) => {
        const el = containerRef.current
        if (!el) return
        dotSeaRef.current?.addTint(color)
        dotSeaRef.current?.drop(Math.random() * el.clientWidth, Math.random() * el.clientHeight)
      },
      wave: () => {
        const el = containerRef.current
        if (!el) return
        const width = el.clientWidth
        const height = el.clientHeight
        for (let i = 0; i < 6; i++) {
          window.setTimeout(() => {
            dotSeaRef.current?.drop((width * (i + 0.5)) / 6, height * (0.35 + Math.random() * 0.3))
          }, i * 180)
        }
      }
    }
  })

  useEffect(() => () => cancelSpringRef.current?.(), [])

  // Zoomando, l'anteprima ridotta viene ingrandita dal CSS e si vedono i suoi
  // pixel: qui si dice al genitore quanto è ingrandita, così può ridisegnarla
  // più fitta quando il gesto è finito.
  useEffect(() => {
    if (view) onViewScale?.(view.scale)
  }, [view?.scale, onViewScale])

  // zoom con la rotella, centrato sul puntatore (listener non-passive per preventDefault)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const prev = viewRef.current
      if (!prev) return
      onBeforeEditRef.current?.('wheel')
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08
      const rect = el.getBoundingClientRect()
      const currentFrame = frameRef.current
      const currentCrop = cropRef.current
      const snapped = snapRef.current
      let px = e.clientX - rect.left
      let py = e.clientY - rect.top

      // Se il ritaglio è agganciato al centro su un asse, lo zoom prende come
      // perno quel centro: zoomare non fa perdere un centramento già trovato.
      // Il perno CONSERVA l'aggancio da solo — non va riapplicato dopo, o ogni
      // scatto di rotella viene strattonato verso un bordo (era il difetto:
      // «non posso zoomare» col ritaglio che riempie il frame).
      if (currentFrame && currentCrop) {
        if (snapped.centerX) px = currentFrame.x + currentFrame.width / 2
        if (snapped.centerY) py = currentFrame.y + currentFrame.height / 2
      }

      const scale = clamp(prev.scale * factor, 0.02, 40)
      const applied = scale / prev.scale
      const next = {
        scale,
        cx: px + (prev.cx - px) * applied,
        cy: py + (prev.cy - py) * applied
      }

      // solo un bordo già agganciato (e non il centro) resta incollato
      const currentImage = imageRef.current
      if (currentFrame && currentCrop && currentImage) {
        const bounds = cropScreenBounds(next, rotationRef.current, currentImage, currentCrop)
        if (!snapped.centerX && (snapped.left || snapped.right)) {
          next.cx += snapped.left
            ? currentFrame.x - bounds.left
            : currentFrame.x + currentFrame.width - bounds.right
        }
        if (!snapped.centerY && (snapped.top || snapped.bottom)) {
          next.cy += snapped.top
            ? currentFrame.y - bounds.top
            : currentFrame.y + currentFrame.height - bounds.bottom
        }
        refreshSnapRef.current?.(next, currentCrop)
      }
      setView(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // lente a pixel reali: tenendo Z si vede il 100% sotto il cursore, senza
  // toccare zoom né composizione (il gesto del culling: verifico il fuoco e torno)
  useEffect(() => {
    const onPointerMove = (e: PointerEvent): void => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      pointerStageRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      setLoupe((prev) => (prev ? { ...pointerStageRef.current } : prev))
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== 'z' && e.key !== 'Z') return
      if (e.target instanceof HTMLInputElement) return
      setLoupe({ ...pointerStageRef.current })
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key !== 'z' && e.key !== 'Z') return
      setLoupe(loupeStickyRef.current ? { ...pointerStageRef.current } : null)
    }
    const onEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && loupeStickyRef.current) onLoupeExitRef.current?.()
    }
    window.addEventListener('keydown', onEscape)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('keydown', onEscape)
    }
  }, [])

  // puntatore schermo → coordinate immagine (inversa di traslazione+rotazione+scala)
  const toImagePoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const currentView = viewRef.current
    const rect = containerRef.current?.getBoundingClientRect()
    if (!currentView || !rect || !image) return null
    const sx = clientX - rect.left - currentView.cx
    const sy = clientY - rect.top - currentView.cy
    const rad = (-rotationRef.current * Math.PI) / 180
    const rx = sx * Math.cos(rad) - sy * Math.sin(rad)
    const ry = sx * Math.sin(rad) + sy * Math.cos(rad)
    return {
      x: rx / currentView.scale + image.naturalWidth / 2,
      y: ry / currentView.scale + image.naturalHeight / 2
    }
  }

  // --- goccia nel mare di punti quando si clicca il fondo ---

  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    // con la lente appesa al cursore, il primo clic la ripone: era scomodo
    // dover tornare fino all'icona per spegnerla
    if (loupeSticky) {
      onLoupeExit?.()
      return
    }
    const target = e.target as HTMLElement
    if (target !== e.currentTarget && target.dataset.sea !== 'true') return
    const rect = e.currentTarget.getBoundingClientRect()
    dotSeaRef.current?.drop(e.clientX - rect.left, e.clientY - rect.top)
    sound.drop()
  }

  // --- pan dell'immagine ---

  const onImagePointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    onBeforeEdit?.('pan')
    const currentView = viewRef.current
    if (!currentView) return
    e.preventDefault()
    e.stopPropagation()
    panRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startView: currentView
    }
    setInteracting(true)
    if (loupeSticky) onLoupeExit?.()
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onImagePointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const pan = panRef.current
    if (!pan || pan.pointerId !== e.pointerId) return
    let cx = pan.startView.cx + e.clientX - pan.startClientX
    let cy = pan.startView.cy + e.clientY - pan.startClientY
    // snap magnetico: i bordi del ritaglio si agganciano ai bordi del frame
    const currentCrop = cropRef.current
    if (frame && image && currentCrop) {
      const bounds = cropScreenBounds(
        { ...pan.startView, cx, cy },
        rotationRef.current,
        image,
        currentCrop
      )
      cx += pickSnap(
        bestSnapDelta([(bounds.left + bounds.right) / 2], [frame.x + frame.width / 2]),
        bestSnapDelta([bounds.left, bounds.right], [frame.x, frame.x + frame.width])
      )
      cy += pickSnap(
        bestSnapDelta([(bounds.top + bounds.bottom) / 2], [frame.y + frame.height / 2]),
        bestSnapDelta([bounds.top, bounds.bottom], [frame.y, frame.y + frame.height])
      )
    }
    const nextView = { ...pan.startView, cx, cy }
    setView(nextView)
    if (currentCrop) refreshSnap(nextView, currentCrop)
  }

  const onImagePointerUp = (): void => {
    panRef.current = null
    setInteracting(false)
  }

  // --- spostamento del ritaglio ---

  const onCropPointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    onBeforeEdit?.('crop')
    const currentCrop = cropRef.current
    const point = toImagePoint(e.clientX, e.clientY)
    if (!currentCrop || !point) return
    e.preventDefault()
    e.stopPropagation()
    setGrabHover(true)
    setInteracting(true)
    cropMoveRef.current = { pointerId: e.pointerId, startPoint: point, startCrop: currentCrop }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onCropPointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const move = cropMoveRef.current
    const point = toImagePoint(e.clientX, e.clientY)
    const currentView = viewRef.current
    if (!move || move.pointerId !== e.pointerId || !point || !image || !currentView) return
    let x = clamp(
      move.startCrop.x + point.x - move.startPoint.x,
      0,
      image.naturalWidth - move.startCrop.w
    )
    let y = clamp(
      move.startCrop.y + point.y - move.startPoint.y,
      0,
      image.naturalHeight - move.startCrop.h
    )
    // snap magnetico ai bordi del frame (delta schermo → delta immagine)
    if (frame) {
      const bounds = cropScreenBounds(currentView, rotationRef.current, image, {
        ...move.startCrop,
        x,
        y
      })
      const deltaScreenX = pickSnap(
        bestSnapDelta([(bounds.left + bounds.right) / 2], [frame.x + frame.width / 2]),
        bestSnapDelta([bounds.left, bounds.right], [frame.x, frame.x + frame.width])
      )
      const deltaScreenY = pickSnap(
        bestSnapDelta([(bounds.top + bounds.bottom) / 2], [frame.y + frame.height / 2]),
        bestSnapDelta([bounds.top, bounds.bottom], [frame.y, frame.y + frame.height])
      )
      if (deltaScreenX || deltaScreenY) {
        const rad = (rotationRef.current * Math.PI) / 180
        const deltaImageX =
          (deltaScreenX * Math.cos(rad) + deltaScreenY * Math.sin(rad)) / currentView.scale
        const deltaImageY =
          (-deltaScreenX * Math.sin(rad) + deltaScreenY * Math.cos(rad)) / currentView.scale
        x = clamp(x + deltaImageX, 0, image.naturalWidth - move.startCrop.w)
        y = clamp(y + deltaImageY, 0, image.naturalHeight - move.startCrop.h)
      }
    }
    const nextCrop = { ...move.startCrop, x, y }
    setCrop(nextCrop)
    refreshSnap(currentView, nextCrop)
  }

  const onCropPointerUp = (): void => {
    cropMoveRef.current = null
    setGrabHover(false)
    setInteracting(false)
  }

  // --- ridimensionamento del ritaglio ---

  const onHandlePointerDown = (dx: number, dy: number) => (e: ReactPointerEvent<HTMLElement>) => {
    const currentCrop = cropRef.current
    const point = toImagePoint(e.clientX, e.clientY)
    if (!currentCrop || !point) return
    e.preventDefault()
    e.stopPropagation()
    setInteracting(true)
    cropResizeRef.current = {
      pointerId: e.pointerId,
      dx,
      dy,
      startPoint: point,
      startCrop: currentCrop
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const resize = cropResizeRef.current
    const point = toImagePoint(e.clientX, e.clientY)
    const currentView = viewRef.current
    if (!resize || resize.pointerId !== e.pointerId || !point || !image || !currentView) return

    const minSize = MIN_CROP_SCREEN_PX / currentView.scale
    const deltaX = point.x - resize.startPoint.x
    const deltaY = point.y - resize.startPoint.y
    const start = resize.startCrop
    let { x, y, w, h } = start

    // aggancia il punto medio di un lato ai bordi del frame (delta schermo → immagine)
    const snapEdge = (edgeMidX: number, edgeMidY: number): { dix: number; diy: number } => {
      if (!frame) return { dix: 0, diy: 0 }
      const screen = transformPoint(currentView, rotationRef.current, image, edgeMidX, edgeMidY)
      const deltaScreenX = bestSnapDelta([screen.x], [frame.x, frame.x + frame.width])
      const deltaScreenY = bestSnapDelta([screen.y], [frame.y, frame.y + frame.height])
      if (!deltaScreenX && !deltaScreenY) return { dix: 0, diy: 0 }
      const rad = (rotationRef.current * Math.PI) / 180
      return {
        dix: (deltaScreenX * Math.cos(rad) + deltaScreenY * Math.sin(rad)) / currentView.scale,
        diy: (-deltaScreenX * Math.sin(rad) + deltaScreenY * Math.cos(rad)) / currentView.scale
      }
    }

    if (resize.dx === -1) {
      let newX = clamp(start.x + deltaX, 0, start.x + start.w - minSize)
      newX = clamp(newX + snapEdge(newX, y + h / 2).dix, 0, start.x + start.w - minSize)
      w = start.x + start.w - newX
      x = newX
    } else if (resize.dx === 1) {
      w = clamp(start.w + deltaX, minSize, image.naturalWidth - start.x)
      w = clamp(w + snapEdge(x + w, y + h / 2).dix, minSize, image.naturalWidth - start.x)
    }
    if (resize.dy === -1) {
      let newY = clamp(start.y + deltaY, 0, start.y + start.h - minSize)
      newY = clamp(newY + snapEdge(x + w / 2, newY).diy, 0, start.y + start.h - minSize)
      h = start.y + start.h - newY
      y = newY
    } else if (resize.dy === 1) {
      h = clamp(start.h + deltaY, minSize, image.naturalHeight - start.y)
      h = clamp(h + snapEdge(x + w / 2, y + h).diy, minSize, image.naturalHeight - start.y)
    }

    // proporzioni bloccate sul formato dell'album: il lato trascinato comanda,
    // l'altro segue, e il bordo opposto resta dove è
    if (lockAspect) {
      if (resize.dx !== 0 && resize.dy !== 0) {
        h = w / ratio
      } else if (resize.dy === 0) {
        h = w / ratio
        y = start.y + start.h / 2 - h / 2
      } else {
        w = h * ratio
        x = start.x + start.w / 2 - w / 2
      }
      if (resize.dx === -1) x = start.x + start.w - w
      if (resize.dy === -1) y = start.y + start.h - h
      // rientra nell'immagine senza deformare
      for (let pass = 0; pass < 2; pass++) {
        if (w > image.naturalWidth) {
          w = image.naturalWidth
          h = w / ratio
        }
        if (h > image.naturalHeight) {
          h = image.naturalHeight
          w = h * ratio
        }
        x = clamp(x, 0, Math.max(0, image.naturalWidth - w))
        y = clamp(y, 0, Math.max(0, image.naturalHeight - h))
      }
    }

    setCrop({ x, y, w, h })
    refreshSnap(currentView, { x, y, w, h })
  }

  const onHandlePointerUp = (): void => {
    cropResizeRef.current = null
    setInteracting(false)
  }

  // --- rotazione: drag libero, al rilascio snap al multiplo di 90 con rimbalzo ---

  const onRotatePointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    onBeforeEdit?.('rotate')
    const currentView = viewRef.current
    const rect = containerRef.current?.getBoundingClientRect()
    if (!currentView || !rect) return
    e.preventDefault()
    e.stopPropagation()
    cancelSpringRef.current?.()
    const centerClientX = rect.left + currentView.cx
    const centerClientY = rect.top + currentView.cy
    rotateRef.current = {
      pointerId: e.pointerId,
      startAngle: Math.atan2(e.clientY - centerClientY, e.clientX - centerClientX),
      startRotation: rotationRef.current,
      centerClientX,
      centerClientY,
      unlocked: e.altKey
    }
    setRotating(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onRotatePointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== e.pointerId) return
    // il vincolo si può sganciare (o riagganciare) anche a metà gesto
    rotate.unlocked = e.altKey
    const angle = Math.atan2(e.clientY - rotate.centerClientY, e.clientX - rotate.centerClientX)
    setRotation(rotate.startRotation + ((angle - rotate.startAngle) * 180) / Math.PI)
  }

  const onRotatePointerUp = (): void => {
    const rotate = rotateRef.current
    if (!rotate) return
    rotateRef.current = null
    setRotating(false)
    const nearest = Math.round(rotationRef.current / 90) * 90

    if (rotate.unlocked) {
      // sganciata: l'angolo resta libero — ma vicinissimo a un multiplo di 90
      // c'è comunque una calamita dolce (1.2°), come per lo zero degli slider
      if (Math.abs(rotationRef.current - nearest) <= 1.2 && rotationRef.current !== nearest) {
        sound.snap()
        cancelSpringRef.current = animateSpring({
          from: rotationRef.current,
          to: nearest,
          onUpdate: (value) => setRotation(value)
        })
      }
      return
    }

    if (rotationRef.current === nearest) return
    // agganciata: lo scatto di 90°, un colpo meccanico come una ghiera
    sound.rotate()
    cancelSpringRef.current = animateSpring({
      from: rotationRef.current,
      to: nearest,
      onUpdate: (value) => setRotation(value)
    })
  }

  // --- geometria per il render ---

  const scale = view?.scale ?? 1
  const halfWidth = image ? (image.naturalWidth * scale) / 2 : 0
  const halfHeight = image ? (image.naturalHeight * scale) / 2 : 0
  // coordinate immagine → posizione dentro il wrapper (origine = centro immagine)
  const toWrapperX = (x: number): number => x * scale - halfWidth
  const toWrapperY = (y: number): number => y * scale - halfHeight

  // --- sviluppo: la GPU ha già cotto i pixel, qui restano i due strati di stampa ---
  const vignette = vignetteStrength(develop)
  const grain = grainStrength(develop)
  const grainPx = grainPixelSize(develop)
  // riquadro del ritaglio nelle coordinate della tela: ci vivono gli strati
  const cropBoxStyle: CSSProperties = crop
    ? {
        left: crop.x * scale,
        top: crop.y * scale,
        width: crop.w * scale,
        height: crop.h * scale
      }
    : {}

  // fuori dal ritaglio l'immagine è un fantasma: lo slider ne controlla l'opacità
  const ghostOpacity = cropOpacity / 100
  const clipPath =
    image && crop
      ? `inset(${crop.y * scale}px ${(image.naturalWidth - crop.x - crop.w) * scale}px ${
          (image.naturalHeight - crop.y - crop.h) * scale
        }px ${crop.x * scale}px)`
      : undefined

  const cropStrips: CSSProperties[] = crop
    ? [
        {
          left: toWrapperX(crop.x),
          top: toWrapperY(crop.y) - GRAB_STRIP_PX / 2,
          width: crop.w * scale,
          height: GRAB_STRIP_PX
        },
        {
          left: toWrapperX(crop.x),
          top: toWrapperY(crop.y + crop.h) - GRAB_STRIP_PX / 2,
          width: crop.w * scale,
          height: GRAB_STRIP_PX
        },
        {
          left: toWrapperX(crop.x) - GRAB_STRIP_PX / 2,
          top: toWrapperY(crop.y),
          width: GRAB_STRIP_PX,
          height: crop.h * scale
        },
        {
          left: toWrapperX(crop.x + crop.w) - GRAB_STRIP_PX / 2,
          top: toWrapperY(crop.y),
          width: GRAB_STRIP_PX,
          height: crop.h * scale
        }
      ]
    : []

  /**
   * Le rotelle stanno agli angoli VERI del ritaglio — ruotano con lui, si
   * stringono quando lo si rimpicciolisce — ma **non escono dal riquadro**:
   * ogni angolo viene trattenuto al bordo. Così zoomando non volano più fuori
   * schermo (si fermano agli angoli del riquadro e lì restano), e in tutti gli
   * altri casi continuano ad abbracciare il ritaglio, che è la cosa che si sta
   * davvero maneggiando.
   *
   * Il gesto non cambia: l'angolo si misura dal centro della vista, non da
   * dove si afferra la rotella.
   */
  const rotateHandles =
    !image || !view || !crop || !frame
      ? []
      : clampHandles(
          (
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1]
            ] as const
          ).map(([fx, fy]) =>
            transformPoint(view, rotation, image, crop.x + fx * crop.w, crop.y + fy * crop.h)
          ),
          rotation,
          frame,
          ROTATE_HANDLE_OFFSET_PX
        )

  /**
   * Quanto la foto verrà STIRATA nel file: sopra 1 il ritaglio ha meno pixel
   * dell'export e la stampa è un ingrandimento. È l'informazione che manca
   * quando si zooma tanto — meglio saperlo prima di salvare che dopo.
   */
  const exportStretch = (() => {
    if (!view || !frame || !outputLongEdge) return 1
    const inner = printSize(ratio, outputLongEdge, matFraction)
    return (view.scale * inner.width) / frame.width
  })()

  /**
   * L'area su cui si giudica la composizione: **il ritaglio, trattenuto dal
   * riquadro**.
   *
   * È la parte di ritaglio che finirà davvero nel file. Due comportamenti in
   * una regola sola, ed è il motivo per cui questa è la forma giusta:
   *
   * - il ritaglio è più grande del riquadro (succede appena si zooma): la
   *   parte stampata È il riquadro, quindi il rettangolo resta immobile
   *   mentre la rotella gira. Niente più righelli che volano via;
   * - il ritaglio sta dentro il riquadro (lo si è rimpicciolito, o la foto non
   *   riempie il formato): allora la stampa è il ritaglio, e il rettangolo lo
   *   segue — perché lì la composizione è quella, non il riquadro vuoto.
   *
   * Arrotondato al pixel intero: su valori frazionari le linee sfarfallavano.
   */
  const printArea =
    !image || !view || !crop || !frame || hideUi
      ? null
      : composeArea(cropScreenBounds(view, rotation, image, crop), frame)

  /**
   * Trasforma lo zoom in un TAGLIO vero.
   *
   * Zoomando, il ritaglio resta quello di prima e a finire nel file è solo la
   * sua parte dentro al riquadro: lo zoom «vale» come un taglio ma non lo è, e
   * infatti il rettangolo del ritaglio racconta un'altra storia. Qui si chiude
   * il cerchio — si prende ciò che si vede nel riquadro, lo si riporta in
   * coordinate della foto e lo si rende il ritaglio. Dopo, ritaglio, riquadro e
   * stampa dicono la stessa cosa, e le maniglie tornano a maneggiare qualcosa
   * di vero.
   *
   * È il gemello di «Ricomponi»: quello butta via lo zoom e tiene il ritaglio,
   * questo tiene lo zoom e riscrive il ritaglio.
   */
  const cropToView = (): boolean => {
    const currentView = viewRef.current
    const currentCrop = cropRef.current
    if (!image || !frame || !currentView || !currentCrop) return false
    const area = composeArea(
      cropScreenBounds(currentView, rotationRef.current, image, currentCrop),
      frame,
      8
    )
    if (!area) return false
    const points = [
      [area.x, area.y],
      [area.x + area.width, area.y],
      [area.x + area.width, area.y + area.height],
      [area.x, area.y + area.height]
    ].map(([x, y]) => inverseTransformPoint(currentView, rotationRef.current, image, x, y))
    const xs = points.map((pt) => pt.x)
    const ys = points.map((pt) => pt.y)
    const left = clamp(Math.min(...xs), 0, image.naturalWidth)
    const top = clamp(Math.min(...ys), 0, image.naturalHeight)
    const right = clamp(Math.max(...xs), 0, image.naturalWidth)
    const bottom = clamp(Math.max(...ys), 0, image.naturalHeight)
    const next = {
      x: Math.round(left),
      y: Math.round(top),
      w: Math.round(right - left),
      h: Math.round(bottom - top)
    }
    if (next.w < 16 || next.h < 16) return false
    // già combacia: non vale la pena rimescolare la vista per nulla
    const unchanged =
      Math.abs(next.x - currentCrop.x) < 2 &&
      Math.abs(next.y - currentCrop.y) < 2 &&
      Math.abs(next.w - currentCrop.w) < 2 &&
      Math.abs(next.h - currentCrop.h) < 2
    if (unchanged) return false
    cancelSpringRef.current?.()
    setCrop(next)
    setView(viewForCrop(next, image, frame))
    sound.snap()
    return true
  }

  /**
   * Rimette il ritaglio a combaciare col riquadro senza toccarlo: è il modo di
   * tornare dalla passeggiata fatta con la rotella, quando si è zoomato per
   * guardare un dettaglio e si vuole rivedere l'inquadratura per intero.
   */
  const reframeToCrop = (): void => {
    const currentCrop = cropRef.current
    if (!image || !frame || !currentCrop) return
    cancelSpringRef.current?.()
    setView(viewForCrop(currentCrop, image, frame))
    sound.center()
  }

  // vero quando il centro del ritaglio coincide col centro del frame (accende il puntino)
  const cropCentered = (() => {
    if (!image || !view || !crop || !frame) return false
    const center = transformPoint(view, rotation, image, crop.x + crop.w / 2, crop.y + crop.h / 2)
    return (
      Math.abs(center.x - (frame.x + frame.width / 2)) < 1 &&
      Math.abs(center.y - (frame.y + frame.height / 2)) < 1
    )
  })()

  // la lente mostra i pixel veri, sviluppati: non l'anteprima ridotta
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null)
  // fantasma e parte ritagliata: due tele con la stessa foto sviluppata
  const ghostCanvasRef = useRef<HTMLCanvasElement>(null)
  const clipCanvasRef = useRef<HTMLCanvasElement>(null)

  // punto immagine sotto la lente: la porzione si mostra a scala 1:1
  const loupePoint = (() => {
    if (!loupe || !image || !view) return null
    const dx = loupe.x - view.cx
    const dy = loupe.y - view.cy
    const rad = (-rotation * Math.PI) / 180
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad)
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad)
    return {
      x: rx / view.scale + image.naturalWidth / 2,
      y: ry / view.scale + image.naturalHeight / 2
    }
  })()

  useEffect(() => {
    const canvas = loupeCanvasRef.current
    if (!canvas || !image || !loupePoint) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const region = {
      x: loupePoint.x - LOUPE_PX / 2,
      y: loupePoint.y - LOUPE_PX / 2,
      w: LOUPE_PX,
      h: LOUPE_PX
    }
    ctx.clearRect(0, 0, LOUPE_PX, LOUPE_PX)
    const developed = renderDetail(image, develop, region, { width: LOUPE_PX, height: LOUPE_PX })
    if (developed) {
      ctx.drawImage(developed, 0, 0)
    } else {
      ctx.drawImage(image, region.x, region.y, LOUPE_PX, LOUPE_PX, 0, 0, LOUPE_PX, LOUPE_PX)
    }
  })

  // ridisegna le due tele quando arriva un nuovo sviluppo
  useEffect(() => {
    const source = developed.canvas
    if (!source) return
    for (const ref of [ghostCanvasRef, clipCanvasRef]) {
      const canvas = ref.current
      if (!canvas) continue
      if (canvas.width !== source.width || canvas.height !== source.height) {
        canvas.width = source.width
        canvas.height = source.height
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(source, 0, 0)
    }
  }, [developed.version, developed.canvas, cropOpacity, hideUi])

  const wrapperStyle: CSSProperties = view
    ? {
        left: view.cx,
        top: view.cy,
        width: 0,
        height: 0,
        transform: `rotate(${rotation}deg)`
      }
    : {}

  const imageStyle: CSSProperties = image
    ? {
        left: -halfWidth,
        top: -halfHeight,
        width: image.naturalWidth * scale,
        height: image.naturalHeight * scale,
        maxWidth: 'none'
      }
    : {}

  // il vivo della stampa nelle coordinate della tela: SOLO questa parte di
  // foto finisce nel file — fuori dal frame la foto è fantasma anche se il
  // ritaglio, zoomando, si proietta più largo del frame
  const frameClipPath = (() => {
    if (!view || !frame) return undefined
    const rad = (-rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const corners = (
      [
        [frame.x, frame.y],
        [frame.x + frame.width, frame.y],
        [frame.x + frame.width, frame.y + frame.height],
        [frame.x, frame.y + frame.height]
      ] as const
    )
      .map(([sx, sy]) => {
        const dx = sx - view.cx
        const dy = sy - view.cy
        return `${(dx * cos - dy * sin + halfWidth).toFixed(1)}px ${(
          dx * sin + dy * cos + halfHeight
        ).toFixed(1)}px`
      })
      .join(', ')
    return `polygon(${corners})`
  })()

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden bg-[var(--pp-stage)] select-none"
      onPointerDown={onStagePointerDown}
    >
      {/* mare di punti in movimento; click sul fondo = goccia.
          In ufficio il fondo è piatto: nessuna scenografia, nessun rAF. */}
      {animated && <DotSea controllerRef={dotSeaRef} sea={preset.sea} boost={seaBoost} />}

      {/* frame finale con lo sfondo album */}
      {frameRaw && frame && (
        <>
          {/* la cornice: il suo colore, o quello dello sfondo */}
          <div
            data-sea="true"
            className={`absolute ${(matColor ?? background.color) === null ? 'checkerboard' : ''}`}
            style={{
              left: frameRaw.x,
              top: frameRaw.y,
              width: frameRaw.width,
              height: frameRaw.height,
              backgroundColor: (matColor ?? background.color) ?? undefined,
              zIndex: LAYER.frame
            }}
          />
          {/* lo sfondo dell'album, dentro il vivo della foto */}
          {matFraction > 0 && (
            <div
              data-sea="true"
              className={`absolute ${background.color === null ? 'checkerboard' : ''}`}
              style={{
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
                backgroundColor: background.color ?? undefined,
                zIndex: LAYER.frame
              }}
            />
          )}
        </>
      )}

      {/* livello immagine: fantasma completo + parte ritagliata sempre visibile.
          L'animazione d'ingresso vive sul contenitore (opacity/filter) così non
          tocca la rotazione. Le due tele contengono la foto già sviluppata. */}
      {image && view && crop && (
        <div
          key={image.src}
          className="absolute"
          style={{
            ...wrapperStyle,
            zIndex: LAYER.photo,
            willChange: 'transform',
            animation: animated
              ? `${preset.photoEnter.animation} ${preset.photoEnter.durationMs}ms var(--pp-ease)`
              : 'photo-office 140ms ease-out'
          }}
        >
          {/* il fantasma si disegna solo se lo si vede: una tela in meno da comporre */}
          {!hideUi && ghostOpacity > 0.02 && (
            <canvas
              ref={ghostCanvasRef}
              onPointerDown={onImagePointerDown}
              onPointerMove={onImagePointerMove}
              onPointerUp={onImagePointerUp}
              className="absolute cursor-grab active:cursor-grabbing"
              style={{ ...imageStyle, opacity: ghostOpacity }}
            />
          )}
          {/* la parte PIENA è solo ciò che va in stampa: ritaglio ∩ frame.
              Il clip esterno taglia al vivo del frame, quello interno al
              ritaglio — a opacità 0 resta visibile esattamente l'export */}
          <div className="absolute" style={{ ...imageStyle, clipPath: frameClipPath }}>
            <canvas
              ref={clipCanvasRef}
              onPointerDown={onImagePointerDown}
              onPointerMove={onImagePointerMove}
              onPointerUp={onImagePointerUp}
              className="absolute cursor-grab active:cursor-grabbing"
              style={{ ...imageStyle, left: 0, top: 0, clipPath }}
            />

            {/* strati di stampa: stanno sul ritaglio, come nell'export */}
            {vignette > 0 && (
              <div
                className="pointer-events-none absolute"
                style={{ ...cropBoxStyle, backgroundImage: vignetteGradient(develop) }}
              />
            )}
            {grain > 0 && !interacting && (
              <div
                className="pointer-events-none absolute"
                style={{
                  ...cropBoxStyle,
                  backgroundImage: `url(${grainImageUrl(grainPx)})`,
                  backgroundSize: `${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px`,
                  opacity: grain,
                  mixBlendMode: 'overlay'
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* velo fuori dal frame + bordo del frame */}
      {frame && (
        <>
          {/* velo fuori dal frame: quattro fasce. Un box-shadow con spread di
              100000px costringe il compositore a un layer enorme, ridisegnato
              a ogni movimento; quattro rettangoli sono gratis. */}
          {(
            [
              { left: 0, top: 0, width: '100%', height: frameRaw!.y },
              { left: 0, top: frameRaw!.y + frameRaw!.height, width: '100%', bottom: 0 },
              { left: 0, top: frameRaw!.y, width: frameRaw!.x, height: frameRaw!.height },
              {
                left: frameRaw!.x + frameRaw!.width,
                top: frameRaw!.y,
                right: 0,
                height: frameRaw!.height
              }
            ] as CSSProperties[]
          ).map((style, i) => (
            <div
              key={i}
              className="pointer-events-none absolute"
              style={{ ...style, backgroundColor: 'var(--pp-veil)', zIndex: LAYER.veil }}
            />
          ))}
          {/* la cornice sta SOPRA la foto, come un passe-partout vero: quattro
              fasce tra il vivo e il bordo esterno, così la foto zoomata o il
              fantasma non la coprono mai */}
          {matFraction > 0 &&
            (
              [
                {
                  left: frameRaw!.x,
                  top: frameRaw!.y,
                  width: frameRaw!.width,
                  height: matPx
                },
                {
                  left: frameRaw!.x,
                  top: frame.y + frame.height,
                  width: frameRaw!.width,
                  height: matBottomPx
                },
                { left: frameRaw!.x, top: frame.y, width: matPx, height: frame.height },
                {
                  left: frameRaw!.x + frameRaw!.width - matPx,
                  top: frame.y,
                  width: matPx,
                  height: frame.height
                }
              ] as CSSProperties[]
            ).map((style, i) => (
              <div
                key={`mat-${i}`}
                className={`pointer-events-none absolute ${
                  (matColor ?? background.color) === null ? 'checkerboard' : ''
                }`}
                style={{
                  ...style,
                  backgroundColor: (matColor ?? background.color) ?? undefined,
                  zIndex: LAYER.veil
                }}
              />
            ))}
          {!hideUi && (
            <div
              className="pointer-events-none absolute border border-white/50"
              style={{
                left: frameRaw!.x,
                top: frameRaw!.y,
                width: frameRaw!.width,
                height: frameRaw!.height,
                zIndex: LAYER.veil
              }}
            />
          )}
          {!hideUi && matFraction > 0 && (
            <div
              className="pointer-events-none absolute border border-black/25"
              style={{
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
                zIndex: LAYER.veil
              }}
            />
          )}
          {/* la didascalia si scrive QUI, sulla cornice: clicchi e scrivi.
              A occhio chiuso resta solo il testo, come sarà nella stampa. */}
          {matFraction > 0 && (
            <div
              className="absolute flex items-center justify-center"
              style={{
                left: frameRaw!.x,
                top: frame.y + frame.height,
                width: frameRaw!.width,
                height: matBottomPx,
                zIndex: LAYER.handles
              }}
            >
              {hideUi || !onCaptionChange ? (
                caption.trim() && (
                  <span
                    className="pointer-events-none max-w-[90%] truncate"
                    style={{
                      fontFamily: captionFontById(captionFont).family,
                      fontStyle: captionFontById(captionFont).italic ? 'italic' : 'normal',
                      fontSize: Math.max(11, matPx * 0.5 * captionFontById(captionFont).scale),
                      color: matCaptionColor(matColor ?? background.color)
                    }}
                  >
                    {caption.trim()}
                  </span>
                )
              ) : (
                <input
                  value={caption}
                  maxLength={80}
                  placeholder="Scrivi una didascalia…"
                  onChange={(e) => onCaptionChange(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-[80%] border-b border-transparent bg-transparent text-center outline-none placeholder:opacity-35 focus:border-current/30"
                  style={{
                    fontFamily: captionFontById(captionFont).family,
                    fontStyle: captionFontById(captionFont).italic ? 'italic' : 'normal',
                    fontSize: Math.max(11, matPx * 0.5 * captionFontById(captionFont).scale),
                    color: matCaptionColor(matColor ?? background.color)
                  }}
                />
              )}
            </div>
          )}

          {/* l'angolo: vivo mentre ruoti, e resta se la foto è fuori squadra.
              Cliccarlo riaggancia al multiplo di 90 più vicino. */}
          {!hideUi &&
            (() => {
              const nearest = Math.round(rotation / 90) * 90
              const deviation = rotation - nearest
              const off = Math.abs(deviation) > 0.05
              if (!rotating && !off) return null
              return (
                <button
                  onClick={() => {
                    if (!off) return
                    sound.rotate()
                    cancelSpringRef.current = animateSpring({
                      from: rotationRef.current,
                      to: nearest,
                      onUpdate: (value) => setRotation(value)
                    })
                  }}
                  title={off ? 'Rotazione libera — clicca per riagganciare ai 90°' : undefined}
                  className={`absolute -translate-x-1/2 rounded-full px-2.5 py-1 text-xs tabular-nums backdrop-blur-sm ${
                    off
                      ? 'cursor-pointer bg-[var(--pp-accent)]/20 text-[var(--pp-accent)] ring-1 ring-[var(--pp-accent)]/60'
                      : 'pointer-events-none bg-black/60 text-[var(--pp-ink)] ring-1 ring-white/20'
                  }`}
                  style={{
                    left: frame.x + frame.width / 2,
                    top: frame.y - 30,
                    zIndex: LAYER.tools
                  }}
                >
                  {off ? `${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}° · sganciata` : `${Math.round(((rotation % 360) + 360) % 360)}°`}
                </button>
              )
            })()}

          {/* La griglia dei terzi sta su CIÒ CHE SI STAMPA (ritaglio ∩ riquadro),
              non sull'immagine: zoomando, la proiezione del ritaglio sborda dal
              riquadro e una griglia agganciata ad essa segnerebbe i terzi di un
              rettangolo che nel file non esiste. Così invece resta il righello
              della composizione vera, e si restringe alla foto quando è la foto
              a stare dentro il riquadro. Sempre negli assi della stampa: il
              risultato esce diritto anche se la foto è ruotata. */}
          {printArea && (
            <>
              {[1, 2].map((i) => (
                <div
                  key={`gv${i}`}
                  className="pointer-events-none absolute w-px bg-white transition-opacity duration-200"
                  style={{
                    opacity: interacting ? 0.42 : 0.22,
                    left: printArea.x + (printArea.width * i) / 3,
                    top: printArea.y,
                    height: printArea.height,
                    zIndex: LAYER.handles
                  }}
                />
              ))}
              {[1, 2].map((i) => (
                <div
                  key={`gh${i}`}
                  className="pointer-events-none absolute h-px bg-white transition-opacity duration-200"
                  style={{
                    opacity: interacting ? 0.42 : 0.22,
                    left: printArea.x,
                    top: printArea.y + (printArea.height * i) / 3,
                    width: printArea.width,
                    zIndex: LAYER.handles
                  }}
                />
              ))}
            </>
          )}

          {/* le rotelle di rotazione: ferme agli angoli del riquadro, come la
              griglia — si afferrano sempre nello stesso posto */}
          {!hideUi &&
            rotateHandles.map((position, i) => (
              <div
                key={`rot${i}`}
                onPointerDown={onRotatePointerDown}
                onPointerMove={onRotatePointerMove}
                onPointerUp={onRotatePointerUp}
                title="Ruota (scatta ai 90°) — con Alt si sgancia e ruota libera"
                className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border border-white/60 bg-[var(--pp-accent)] text-xs text-[var(--pp-on-accent)] shadow-md shadow-black/50 active:cursor-grabbing"
                style={{ ...position, zIndex: LAYER.handles }}
              >
                <RotateMark />
              </div>
            ))}

          {/* oltre i pixel reali: la foto nel file sarà un ingrandimento */}
          {!hideUi && exportStretch > 1.15 && (
            <button
              onClick={reframeToCrop}
              className="absolute -translate-x-full cursor-pointer rounded-full bg-black/70 px-2.5 py-1 text-xs text-amber-300/90 ring-1 ring-amber-300/30 backdrop-blur-sm hover:bg-black/85 hover:text-amber-200"
              title={`Il ritaglio ha meno pixel del file da salvare: verrà ingrandito del ${Math.round((exportStretch - 1) * 100)}%. In export la nitidezza viene ridata da sola, ma il dettaglio che non c'è non torna. Clicca per rimettere il ritaglio nel riquadro.`}
              style={{
                left: frame.x + frame.width,
                top: frame.y - 30,
                zIndex: LAYER.tools
              }}
            >
              <span className="flex items-center gap-1.5">
                Oltre i pixel reali · {Math.round(exportStretch * 100)}%
                {/* due frecce che rientrano: si capisce che il badge riporta
                    il ritaglio dentro al riquadro */}
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-80"
                >
                  <path d="M9 5 4 12l5 7M15 5l5 7-5 7" />
                </svg>
              </span>
            </button>
          )}

          {/* la Smussata: una maschera evenodd, la stessa geometria dell'export */}
          {cropShape === 'round' &&
            (() => {
              const d = shapePathD(cropShape, frame.width, frame.height)
              if (!d) return null
              const outsideFill =
                (matFraction > 0 ? (matColor ?? background.color) : background.color) ?? null
              return (
                <svg
                  className="pointer-events-none absolute"
                  style={{
                    left: frame.x,
                    top: frame.y,
                    width: frame.width,
                    height: frame.height,
                    zIndex: LAYER.veil
                  }}
                  viewBox={`0 0 ${frame.width} ${frame.height}`}
                >
                  {outsideFill === null && (
                    <defs>
                      <pattern id="pp-shape-checker" width="16" height="16" patternUnits="userSpaceOnUse">
                        <rect width="16" height="16" fill="#292524" />
                        <rect width="8" height="8" fill="#57534e" />
                        <rect x="8" y="8" width="8" height="8" fill="#57534e" />
                      </pattern>
                    </defs>
                  )}
                  <path
                    d={`M 0 0 H ${frame.width} V ${frame.height} H 0 Z ${d}`}
                    fillRule="evenodd"
                    fill={outsideFill ?? 'url(#pp-shape-checker)'}
                  />
                </svg>
              )
            })()}

          {/* telaietto, bordo pellicola, fotogramma e datario: la stessa mano
              dell'export, su un canvas sopra la foto */}
          {(cropShape === 'slide' ||
            cropShape === 'rebate' ||
            cropShape === 'sprocket' ||
            dateStamp === 'datario' ||
            (dateStamp === 'cornice' && matFraction === 0)) && (
            <PrintOverlayCanvas
              left={frame.x}
              top={frame.y}
              width={frame.width}
              height={frame.height}
              style={cropShape}
              outsideFill={
                (matFraction > 0 ? (matColor ?? background.color) : background.color) ?? null
              }
              dateStamp={
                dateStamp === 'cornice' && matFraction > 0 && cropShape !== 'slide'
                  ? 'nessuno'
                  : dateStamp
              }
              takenAt={takenAt}
              frameNumber={frameNumber}
            />
          )}

          {/* il timbro del laboratorio sulla fascia della cornice */}
          {matFraction > 0 && dateStamp === 'cornice' && takenAt > 0 && cropShape !== 'slide' && (
            <InkStampCanvas
              left={frameRaw!.x}
              top={frame.y + frame.height}
              width={frameRaw!.width - matPx}
              height={matBottomPx}
              takenAt={takenAt}
              onLight={matStampIsLight(matColor ?? background.color)}
            />
          )}

                    {/* lampo di conferma: il frame si accende del colore della bolla scelta */}
          {flash && (
            <div
              key={flash.key}
              className="pointer-events-none absolute"
              style={{
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
                boxShadow: animated
                  ? `inset 0 0 0 3px rgba(${flash.tint}, 0.95), inset 0 0 70px rgba(${flash.tint}, 0.65), 0 0 60px rgba(${flash.tint}, 0.5)`
                  : `inset 0 0 0 2px rgba(${flash.tint}, 0.9)`,
                animation: `frame-flash ${animated ? '0.55s' : '0.3s'} ease-out forwards`,
                zIndex: LAYER.flash
              }}
            />
          )}

          {/* guide magnetiche: la linea si accende dove il ritaglio si è agganciato */}
          {!hideUi && (
            <>
              {snap.centerX && (
                <div
                  className="pointer-events-none absolute w-px"
                  style={{
                    left: frame.x + frame.width / 2,
                    top: frame.y - 14,
                    height: frame.height + 28,
                    backgroundColor: 'var(--pp-accent)',
                    boxShadow: '0 0 8px rgba(var(--pp-accent-rgb), 0.9)',
                    zIndex: LAYER.veil
                  }}
                />
              )}
              {snap.centerY && (
                <div
                  className="pointer-events-none absolute h-px"
                  style={{
                    left: frame.x - 14,
                    top: frame.y + frame.height / 2,
                    width: frame.width + 28,
                    backgroundColor: 'var(--pp-accent)',
                    boxShadow: '0 0 8px rgba(var(--pp-accent-rgb), 0.9)',
                    zIndex: LAYER.veil
                  }}
                />
              )}
              {(['left', 'right'] as const).map((side) =>
                snap[side] ? (
                  <div
                    key={side}
                    className="pointer-events-none absolute w-[2px]"
                    style={{
                      left: side === 'left' ? frame.x : frame.x + frame.width,
                      top: frame.y - 10,
                      height: frame.height + 20,
                      backgroundColor: 'var(--pp-accent)',
                      boxShadow: '0 0 10px rgba(var(--pp-accent-rgb), 0.85)',
                      zIndex: LAYER.veil
                    }}
                  />
                ) : null
              )}
              {(['top', 'bottom'] as const).map((side) =>
                snap[side] ? (
                  <div
                    key={side}
                    className="pointer-events-none absolute h-[2px]"
                    style={{
                      left: frame.x - 10,
                      top: side === 'top' ? frame.y : frame.y + frame.height,
                      width: frame.width + 20,
                      backgroundColor: 'var(--pp-accent)',
                      boxShadow: '0 0 10px rgba(var(--pp-accent-rgb), 0.85)',
                      zIndex: LAYER.veil
                    }}
                  />
                ) : null
              )}
            </>
          )}

          {/* mirino del centro: si accende quando il ritaglio è centrato */}
          {!hideUi && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: frame.x + frame.width / 2,
                top: frame.y + frame.height / 2,
                zIndex: LAYER.veil
              }}
            >
              <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
                <g
                  stroke={cropCentered ? 'var(--pp-accent)' : 'rgba(255,255,255,0.75)'}
                  strokeWidth={cropCentered ? 1.6 : 1.1}
                  strokeLinecap="round"
                  style={{
                    filter: cropCentered
                      ? 'drop-shadow(0 0 5px rgba(var(--pp-accent-rgb), 0.95))'
                      : 'drop-shadow(0 0 2px rgba(0,0,0,0.7))',
                    transition: 'stroke 140ms ease, stroke-width 140ms ease'
                  }}
                >
                  <path d="M17 3.5v7M17 23.5v7M3.5 17h7M23.5 17h7" />
                  <circle
                    cx="17"
                    cy="17"
                    r={cropCentered ? 5.5 : 4}
                    style={{ transition: 'r 140ms ease' }}
                  />
                </g>
                {cropCentered && <circle cx="17" cy="17" r="2" fill="var(--pp-accent)" />}
              </svg>
            </div>
          )}
        </>
      )}

      {/* livello controlli: stesso sistema di coordinate del livello immagine */}
      {image && view && crop && !hideUi && (
        <div className="absolute" style={{ ...wrapperStyle, zIndex: LAYER.handles }}>
          {/* bordo del ritaglio (l'interno lascia passare il pan dell'immagine) */}
          <div
            className={`pointer-events-none absolute border shadow-[0_0_0_1px_rgba(0,0,0,0.4)] ${
              grabHover ? 'border-2 border-[var(--pp-accent)]' : 'border-white/80'
            }`}
            style={{
              left: toWrapperX(crop.x),
              top: toWrapperY(crop.y),
              width: crop.w * scale,
              height: crop.h * scale
            }}
          />

          {/* strisce di presa sui bordi: trascina per spostare il ritaglio */}
          {cropStrips.map((style, i) => (
            <div
              key={i}
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerEnter={() => setGrabHover(true)}
              onPointerLeave={() => setGrabHover(false)}
              className="absolute cursor-move"
              style={style}
            />
          ))}

          {/* maniglia centrale di spostamento del ritaglio */}
          <div
            onPointerDown={onCropPointerDown}
            onPointerMove={onCropPointerMove}
            onPointerUp={onCropPointerUp}
            onPointerEnter={() => setGrabHover(true)}
            onPointerLeave={() => setGrabHover(false)}
            className={`absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center rounded-full bg-black/55 text-white shadow-md shadow-black/40 ring-1 backdrop-blur-sm transition-all ${
              cropCentered
                ? 'ring-2 ring-[var(--pp-accent)] shadow-[0_0_14px_rgba(var(--pp-accent-rgb),0.8)]'
                : grabHover
                  ? 'ring-[var(--pp-accent)]'
                  : 'ring-white/60'
            }`}
            style={{
              left: toWrapperX(crop.x + crop.w / 2),
              top: toWrapperY(crop.y + crop.h / 2)
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="5 9 2 12 5 15" />
              <polyline points="9 5 12 2 15 5" />
              <polyline points="15 19 12 22 9 19" />
              <polyline points="19 9 22 12 19 15" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="12" y1="2" x2="12" y2="22" />
            </svg>
          </div>

          {/* 8 maniglie di ridimensionamento del ritaglio */}
          {CROP_HANDLES.map((handle) => (
            <div
              key={handle.id}
              onPointerDown={onHandlePointerDown(handle.dx, handle.dy)}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 border border-stone-500 bg-white shadow"
              style={{
                left: toWrapperX(crop.x) + ((handle.dx + 1) / 2) * crop.w * scale,
                top: toWrapperY(crop.y) + ((handle.dy + 1) / 2) * crop.h * scale,
                cursor: handle.cursor
              }}
            />
          ))}

        </div>
      )}

      {/* contagocce del bianco: un velo col mirino, poi si torna a lavorare */}
      {pickingColor && image && view && (
        <div
          className="absolute inset-0 cursor-crosshair"
          style={{ zIndex: LAYER.loupe }}
          onPointerDown={(e) => {
            e.stopPropagation()
            const point = toImagePoint(e.clientX, e.clientY)
            if (
              !point ||
              point.x < 0 ||
              point.y < 0 ||
              point.x >= image.naturalWidth ||
              point.y >= image.naturalHeight
            ) {
              onPickColor?.(null)
              return
            }
            // media 5×5 dall'ORIGINALE: si neutralizza la foto, non lo sviluppo
            const tile = document.createElement('canvas')
            tile.width = 5
            tile.height = 5
            const tctx = tile.getContext('2d', { willReadFrequently: true })
            if (!tctx) {
              onPickColor?.(null)
              return
            }
            // il tile 5×5 resta DENTRO l'immagine: i pixel fuori bordo
            // entrerebbero nella media come nero, falsando il bilanciamento
            tctx.drawImage(
              image,
              Math.min(Math.max(0, Math.round(point.x) - 2), Math.max(0, image.naturalWidth - 5)),
              Math.min(Math.max(0, Math.round(point.y) - 2), Math.max(0, image.naturalHeight - 5)),
              5,
              5,
              0,
              0,
              5,
              5
            )
            const data = tctx.getImageData(0, 0, 5, 5).data
            let r = 0
            let g = 0
            let b = 0
            for (let i = 0; i < data.length; i += 4) {
              r += data[i]
              g += data[i + 1]
              b += data[i + 2]
            }
            const count = data.length / 4
            onPickColor?.({ r: r / count, g: g / count, b: b / count })
          }}
        >
          <span className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-xs whitespace-nowrap text-white ring-1 ring-white/20">
            Clicca un punto che dovrebbe essere grigio o bianco · Esc per annullare
          </span>
        </div>
      )}

      {/* lente a pixel reali: tieni Z premuto */}
      {loupe && loupePoint && image && (
        <div
          className="pointer-events-none absolute overflow-hidden rounded-full ring-2 ring-white/70 shadow-2xl shadow-black/60"
          style={{
            left: loupe.x - LOUPE_PX / 2,
            top: loupe.y - LOUPE_PX / 2,
            width: LOUPE_PX,
            height: LOUPE_PX,
            zIndex: LAYER.loupe
          }}
        >
          <canvas
            ref={loupeCanvasRef}
            width={LOUPE_PX}
            height={LOUPE_PX}
            className="h-full w-full bg-black/60"
            // la porzione segue la rotazione della foto, così è come la si vedrà
            style={{ transform: `rotate(${rotation}deg)` }}
          />
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] tracking-wide whitespace-nowrap text-white">
            100%{loupeSticky ? ' · clic o Esc per riporla' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
