/**
 * La lingua della pellicola: telai, bordi e timbri che un fotoamatore
 * riconosce al primo sguardo perché li ha avuti in mano.
 *
 * - la **diapositiva**: cartoncino chiaro, finestra con gli angoli smussati
 *   (23×34 in un telaietto 50×50: i bordi contano), data timbrata sul cartone
 * - il **bordo pellicola**: nero, con la scritta dell'emulsione e il numero di
 *   fotogramma — e leggermente storto, perché il portanegativi si limava a mano
 * - il **fotogramma**: le bande coi fori di trascinamento
 * - il **datario '90**: cifre a 7 segmenti arancio #ff7e1a, in basso a destra
 *
 * Un'unica funzione di disegno (`drawPrintOverlay`) serve sia l'anteprima sia
 * l'export: stessa mano, impossibile che divergano.
 */

// ---------------------------------------------------------------------------
// Stili di stampa
// ---------------------------------------------------------------------------

export type CropShape = 'none' | 'round' | 'slide' | 'rebate' | 'sprocket'

/** il fondo della cornice è più alto: la proporzione classica del passe-partout */
export const MAT_BOTTOM_FACTOR = 1.9

/**
 * Le misure della stampa finita. Il formato scelto descrive l'ESTERNO (come
 * sullo stage): l'area della foto è ciò che resta tolto il passe-partout.
 * La usano sia l'export sia l'anteprima: una geometria sola, mai due.
 */
export function printSize(
  formatRatio: number,
  longEdge: number,
  matFraction: number
): {
  outerWidth: number
  outerHeight: number
  matPx: number
  matBottomPx: number
  width: number
  height: number
} {
  const outerWidth = formatRatio >= 1 ? longEdge : Math.round(longEdge * formatRatio)
  const outerHeight = formatRatio >= 1 ? Math.round(longEdge / formatRatio) : longEdge
  const matPx = matFraction > 0 ? Math.round(Math.min(outerWidth, outerHeight) * matFraction) : 0
  const matBottomPx = Math.round(matPx * MAT_BOTTOM_FACTOR)
  return {
    outerWidth,
    outerHeight,
    matPx,
    matBottomPx,
    width: outerWidth - matPx * 2,
    height: outerHeight - matPx - matBottomPx
  }
}

export const CROP_SHAPES: { id: CropShape; label: string; hint: string }[] = [
  { id: 'none', label: 'Piena', hint: 'La stampa nuda, senza telaio' },
  { id: 'round', label: 'Smussata', hint: 'Angoli dolcemente arrotondati, come la finestra di una dia' },
  { id: 'slide', label: 'Diapositiva', hint: 'Il telaietto di cartoncino, con la finestra smussata' },
  {
    id: 'rebate',
    label: 'Pellicola',
    hint: 'Il bordo nero del negativo stampato intero — leggermente storto, come dal portanegativi limato a mano'
  },
  { id: 'sprocket', label: 'Fotogramma', hint: 'Le bande coi fori di trascinamento della 35mm' }
]

/** solo la Smussata è una maschera geometrica: il path del profilo */
export function shapePathD(shape: CropShape, w: number, h: number): string | null {
  if (shape !== 'round') return null
  const r = Math.min(w, h) * 0.05
  return [
    `M ${r} 0`,
    `L ${w - r} 0`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `L ${w} ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `L ${r} ${h}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `L 0 ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z'
  ].join(' ')
}

// ---------------------------------------------------------------------------
// Font delle didascalie
// ---------------------------------------------------------------------------

export type CaptionFontId = 'classica' | 'corsiva' | 'macchina'

export const CAPTION_FONTS: {
  id: CaptionFontId
  label: string
  /** family CSS, con fallback che esistono su Windows */
  family: string
  italic: boolean
  /** Gabriola ha l'occhio piccolo: si compensa con la scala */
  scale: number
}[] = [
  {
    id: 'classica',
    label: 'Classica',
    family: "Georgia, 'Times New Roman', serif",
    italic: true,
    scale: 1
  },
  {
    id: 'corsiva',
    label: 'Corsiva',
    family: "Gabriola, 'Segoe Script', cursive",
    italic: false,
    scale: 1.35
  },
  {
    id: 'macchina',
    label: 'Macchina',
    family: "'Courier New', monospace",
    italic: false,
    scale: 0.92
  }
]

export function captionFontById(id: CaptionFontId | undefined) {
  return CAPTION_FONTS.find((f) => f.id === id) ?? CAPTION_FONTS[0]
}

// ---------------------------------------------------------------------------
// Timbri data
// ---------------------------------------------------------------------------

export type DateStampId = 'nessuno' | 'cornice' | 'datario'

export const DATE_STAMPS: { id: DateStampId; label: string; hint: string }[] = [
  { id: 'nessuno', label: 'Nessuna', hint: 'La foto resta pulita' },
  {
    id: 'cornice',
    label: 'Timbro',
    hint: "Il timbro d'inchiostro del laboratorio: sulla cornice, sul cartoncino della diapositiva o nell'angolo della foto"
  },
  {
    id: 'datario',
    label: "Datario '90",
    hint: 'Le cifre arancioni a 7 segmenti delle compatte anni ’90, in basso a destra'
  }
]

const MONTHS_ABBR = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC']

/** «28 AGO ’26»: com'era timbrato dal laboratorio */
export function stampDateText(takenAt: number): string {
  if (takenAt <= 0) return ''
  const date = new Date(takenAt)
  return `${date.getDate()} ${MONTHS_ABBR[date.getMonth()]} ’${String(date.getFullYear()).slice(2)}`
}

/** «28 8 '26», come sul dorso quartz delle compatte */
export function filmDateText(takenAt: number): string {
  if (takenAt <= 0) return ''
  const date = new Date(takenAt)
  return `${date.getDate()} ${date.getMonth() + 1} '${String(date.getFullYear()).slice(2)}`
}

/** l'arancio canonico del datario */
export const FILM_DATE_COLOR = '#ff7e1a'
/** l'arancio delle marcature sul bordo del negativo */
export const REBATE_TEXT_COLOR = '#e0993a'
/** il font «da marcatura»: condensato, come inciso sulla pellicola */
export const EDGE_FONT = "'Bahnschrift SemiCondensed', 'Arial Narrow', Arial, sans-serif"
/** il timbro d'inchiostro: rosso mattone su carta chiara */
export const STAMP_INK_LIGHT = '#7d2f28'
/** e avorio spento su carta scura */
export const STAMP_INK_DARK = '#d9c9a8'
/** la riga piccola del timbro, come sulle buste dei laboratori veri */
const STAMP_HEADER = 'SVILUPPO E STAMPA'

// --- cifre a 7 segmenti ---

/** quali segmenti accende ogni cifra: [alto, altoDx, bassoDx, basso, bassoSx, altoSx, centro] */
const SEGMENTS: Record<string, [number, number, number, number, number, number, number]> = {
  '0': [1, 1, 1, 1, 1, 1, 0],
  '1': [0, 1, 1, 0, 0, 0, 0],
  '2': [1, 1, 0, 1, 1, 0, 1],
  '3': [1, 1, 1, 1, 0, 0, 1],
  '4': [0, 1, 1, 0, 0, 1, 1],
  '5': [1, 0, 1, 1, 0, 1, 1],
  '6': [1, 0, 1, 1, 1, 1, 1],
  '7': [1, 1, 1, 0, 0, 0, 0],
  '8': [1, 1, 1, 1, 1, 1, 1],
  '9': [1, 1, 1, 1, 0, 1, 1]
}

interface SegRect {
  x: number
  y: number
  w: number
  h: number
}

function sevenSegmentRects(text: string, digitH: number): { rects: SegRect[]; width: number } {
  const t = digitH * 0.14
  const w = digitH * 0.56
  const gap = digitH * 0.3
  const rects: SegRect[] = []
  let x = 0
  for (const ch of text) {
    if (ch === ' ') {
      x += digitH * 0.44
      continue
    }
    if (ch === "'") {
      rects.push({ x, y: 0, w: t, h: t * 1.9 })
      x += t + gap
      continue
    }
    const seg = SEGMENTS[ch]
    if (!seg) continue
    const half = digitH / 2
    if (seg[0]) rects.push({ x: x + t, y: 0, w: w - 2 * t, h: t })
    if (seg[1]) rects.push({ x: x + w - t, y: t * 0.7, w: t, h: half - t })
    if (seg[2]) rects.push({ x: x + w - t, y: half + t * 0.3, w: t, h: half - t })
    if (seg[3]) rects.push({ x: x + t, y: digitH - t, w: w - 2 * t, h: t })
    if (seg[4]) rects.push({ x, y: half + t * 0.3, w: t, h: half - t })
    if (seg[5]) rects.push({ x, y: t * 0.7, w: t, h: half - t })
    if (seg[6]) rects.push({ x: x + t, y: half - t / 2, w: w - 2 * t, h: t })
    x += w + gap
  }
  return { rects, width: Math.max(0, x - gap) }
}

// ---------------------------------------------------------------------------
// Il disegno: una mano sola per anteprima ed export
// ---------------------------------------------------------------------------

export interface PrintOverlayOptions {
  style: CropShape
  /** colore che circonda la stampa (cornice o sfondo); null = trasparente */
  outsideFill: string | null
  /** come rendere i fori del fotogramma quando fuori è trasparente */
  holes: 'punch' | 'checker'
  dateStamp: DateStampId
  takenAt: number
  /** numero di fotogramma: la posizione nella sessione */
  frameNumber: number
}

/** rumore deterministico: il bordo storto è storto SEMPRE allo stesso modo */
function wobble(seed: number, i: number): number {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
  return v - Math.floor(v) - 0.5
}

/** luminanza di un colore hex, per scegliere l'inchiostro del timbro */
function isLight(color: string | null): boolean {
  if (!color) return false
  const hex = color.replace('#', '')
  if (hex.length < 6) return true
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  try {
    ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value
  } catch {
    // vecchi canvas senza letterSpacing: pazienza
  }
}

/**
 * Un vero timbro di gomma: cornicetta, due righe («SVILUPPO E STAMPA» e la
 * data), inchiostro che non copre mai uniforme, battuta storta con l'eco
 * della seconda pressata. `y` è il centro verticale del timbro.
 */
export function drawInkStamp(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  sizePx: number,
  onLight: boolean,
  align: CanvasTextAlign = 'right'
): void {
  const upper = text.toUpperCase()
  const scale = 2
  const smallPx = sizePx * 0.52

  // misura delle due righe, per dimensionare la cornicetta
  const meas = document.createElement('canvas').getContext('2d')
  if (!meas) return
  meas.font = `600 ${sizePx}px ${EDGE_FONT}`
  setLetterSpacing(meas, '0.16em')
  const dateW = meas.measureText(upper).width
  meas.font = `600 ${smallPx}px ${EDGE_FONT}`
  setLetterSpacing(meas, '0.28em')
  const headW = meas.measureText(STAMP_HEADER).width
  const padX = sizePx * 0.55
  const padY = sizePx * 0.4
  const gap = sizePx * 0.26
  const bw = Math.max(dateW, headW) + padX * 2
  const bh = smallPx + gap + sizePx + padY * 2

  // il timbro si prepara in un buffer, poi l'inchiostro si «consuma»
  const buf = document.createElement('canvas')
  buf.width = Math.max(1, Math.ceil(bw * scale))
  buf.height = Math.max(1, Math.ceil(bh * scale))
  const b = buf.getContext('2d')
  if (!b) return
  b.scale(scale, scale)
  const ink = onLight ? STAMP_INK_LIGHT : STAMP_INK_DARK
  b.fillStyle = ink
  b.strokeStyle = ink
  b.lineWidth = Math.max(1, sizePx * 0.11)
  b.beginPath()
  b.roundRect(b.lineWidth / 2, b.lineWidth / 2, bw - b.lineWidth, bh - b.lineWidth, sizePx * 0.35)
  b.stroke()
  b.textAlign = 'center'
  b.textBaseline = 'middle'
  b.font = `600 ${smallPx}px ${EDGE_FONT}`
  setLetterSpacing(b, '0.28em')
  b.fillText(STAMP_HEADER, bw / 2, padY + smallPx / 2 + sizePx * 0.04)
  b.font = `600 ${sizePx}px ${EDGE_FONT}`
  setLetterSpacing(b, '0.16em')
  b.fillText(upper, bw / 2, padY + smallPx + gap + sizePx / 2)

  // i morsi nell'inchiostro: deterministici (stesso timbro in anteprima e
  // in export — le posizioni sono frazioni della cornicetta, non pixel)
  const seed = upper.length * 31 + 7
  b.globalCompositeOperation = 'destination-out'
  const bites = Math.round(((bw * bh) / (sizePx * sizePx)) * 3.2)
  for (let i = 0; i < bites; i++) {
    const px = (wobble(seed, i * 3) + 0.5) * bw
    const py = (wobble(seed, i * 3 + 1) + 0.5) * bh
    const r = (wobble(seed + 5, i) + 0.5) * sizePx * 0.2 + sizePx * 0.04
    b.globalAlpha = 0.25 + (wobble(seed + 9, i) + 0.5) * 0.55
    b.beginPath()
    b.arc(px, py, r, 0, Math.PI * 2)
    b.fill()
  }
  // e un velo diagonale: da un lato la pressione era minore
  b.globalAlpha = 1
  b.globalCompositeOperation = 'destination-in'
  const fade = b.createLinearGradient(0, 0, bw, bh)
  fade.addColorStop(0, 'rgba(0, 0, 0, 1)')
  fade.addColorStop(1, 'rgba(0, 0, 0, 0.66)')
  b.fillStyle = fade
  b.fillRect(0, 0, bw, bh)

  // la battuta sul foglio
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.05)
  const dx = align === 'right' ? -bw : align === 'center' ? -bw / 2 : 0
  ctx.globalAlpha = onLight ? 0.8 : 0.74
  ctx.drawImage(buf, dx, -bh / 2, bw, bh)
  ctx.globalAlpha = onLight ? 0.16 : 0.13
  ctx.drawImage(buf, dx + sizePx * 0.08, -bh / 2 + sizePx * 0.07, bw, bh)
  ctx.restore()
}

/**
 * Disegna lo stile di stampa (telaietto, bordo pellicola, fotogramma) e i
 * timbri data sopra la foto già composta. `w`×`h` è l'area della stampa.
 */
export function drawPrintOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  options: PrintOverlayOptions
): void {
  const { style, outsideFill, holes, dateStamp, takenAt, frameNumber } = options
  const minSide = Math.min(w, h)

  // quanto lo stile ruba ai bordi: il datario deve restare nella finestra
  let insetX = 0
  let insetTop = 0
  let insetBottom = 0

  if (style === 'slide') {
    // il telaietto: cartoncino caldo, finestra con gli angoli smussati
    const border = minSide * 0.095
    insetX = border
    insetTop = border
    insetBottom = border
    const windowR = minSide * 0.035

    const windowPath = new Path2D(
      [
        `M ${border + windowR} ${border}`,
        `L ${w - border - windowR} ${border}`,
        `A ${windowR} ${windowR} 0 0 1 ${w - border} ${border + windowR}`,
        `L ${w - border} ${h - border - windowR}`,
        `A ${windowR} ${windowR} 0 0 1 ${w - border - windowR} ${h - border}`,
        `L ${border + windowR} ${h - border}`,
        `A ${windowR} ${windowR} 0 0 1 ${border} ${h - border - windowR}`,
        `L ${border} ${border + windowR}`,
        `A ${windowR} ${windowR} 0 0 1 ${border + windowR} ${border}`,
        'Z'
      ].join(' ')
    )
    const mount = new Path2D(`M 0 0 H ${w} V ${h} H 0 Z`)
    mount.addPath(windowPath)

    // cartoncino con una luce leggera dall'alto
    const paper = ctx.createLinearGradient(0, 0, 0, h)
    paper.addColorStop(0, '#f1ede2')
    paper.addColorStop(1, '#e6e1d3')
    ctx.fillStyle = paper
    ctx.fill(mount, 'evenodd')

    // l'ombra della finestra: il cartone ha spessore
    ctx.save()
    ctx.clip(windowPath)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.lineWidth = Math.max(1.5, minSide * 0.008)
    ctx.stroke(windowPath)
    ctx.restore()
    // il filo di luce sul bordo esterno della finestra
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.lineWidth = Math.max(1, minSide * 0.003)
    ctx.stroke(windowPath)
    // il bordo del telaietto
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)'
    ctx.lineWidth = Math.max(1, minSide * 0.004)
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth)

    // le scritte del cartoncino
    ctx.font = `500 ${Math.round(border * 0.3)}px ${EDGE_FONT}`
    try {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.3em'
    } catch {
      // pazienza
    }
    ctx.fillStyle = 'rgba(70, 70, 85, 0.45)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('COLOR SLIDE', w / 2, h - border / 2)
    try {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0em'
    } catch {
      // pazienza
    }
    // il timbro del laboratorio, sul cartone
    if (dateStamp === 'cornice' && takenAt > 0) {
      drawInkStamp(ctx, stampDateText(takenAt), w - border * 0.55, border / 2, border * 0.3, true)
    }
  }

  if (style === 'rebate') {
    // il bordo del negativo: nero, e volutamente non perfetto
    const border = minSide * 0.05
    insetX = border
    insetTop = border
    insetBottom = border
    const seed = frameNumber * 7 + 3
    const points: string[] = []
    const step = 6
    // il rettangolo interno, con gli spigoli che ondeggiano appena
    const jitter = border * 0.22
    const edges: [number, number, number, number][] = [
      [border, border, w - border, border],
      [w - border, border, w - border, h - border],
      [w - border, h - border, border, h - border],
      [border, h - border, border, border]
    ]
    let index = 0
    for (const [x1, y1, x2, y2] of edges) {
      for (let i = 0; i < step; i++) {
        const t = i / step
        const x = x1 + (x2 - x1) * t + wobble(seed, index) * jitter
        const y = y1 + (y2 - y1) * t + wobble(seed, index + 100) * jitter
        points.push(`${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
        index += 1
      }
    }
    const inner = points.join(' ') + ' Z'
    const framePath = new Path2D(`M 0 0 H ${w} V ${h} H 0 Z ${inner}`)
    ctx.fillStyle = '#0b0b0b'
    ctx.fill(framePath, 'evenodd')

    // le marcature dell'emulsione, in arancio inciso
    ctx.font = `600 ${Math.round(border * 0.52)}px ${EDGE_FONT}`
    try {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.14em'
    } catch {
      // pazienza
    }
    ctx.fillStyle = REBATE_TEXT_COLOR
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('PICPICK 400', border * 1.1, h - border / 2)
    ctx.textAlign = 'right'
    ctx.fillText(`▸ ${frameNumber}A`, w - border * 1.1, h - border / 2)
    ctx.textAlign = 'left'
    ctx.fillText(`${frameNumber}`, border * 1.1, border / 2)
    try {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0em'
    } catch {
      // pazienza
    }
  }

  if (style === 'sprocket') {
    // le bande coi fori di trascinamento
    const band = h * 0.105
    insetTop = band
    insetBottom = band
    ctx.fillStyle = '#0b0b0b'
    ctx.fillRect(0, 0, w, band)
    ctx.fillRect(0, h - band, w, band)

    const holeW = w * 0.034
    const holeH = band * 0.5
    const holeR = holeH * 0.32
    const pitch = w * 0.062
    const rows = [band / 2 - holeH / 2, h - band / 2 - holeH / 2]
    const drawHole = (x: number, y: number): void => {
      ctx.beginPath()
      ctx.roundRect(x, y, holeW, holeH, holeR)
      ctx.fill()
    }
    if (outsideFill === null && holes === 'punch') {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      for (const y of rows) for (let x = pitch / 2; x + holeW < w; x += pitch) drawHole(x, y)
      ctx.restore()
    } else {
      if (outsideFill) {
        ctx.fillStyle = outsideFill
      } else {
        // anteprima del trasparente: la scacchiera
        const checker = document.createElement('canvas')
        checker.width = 12
        checker.height = 12
        const cctx = checker.getContext('2d')
        if (cctx) {
          cctx.fillStyle = '#27272a'
          cctx.fillRect(0, 0, 12, 12)
          cctx.fillStyle = '#52525b'
          cctx.fillRect(0, 0, 6, 6)
          cctx.fillRect(6, 6, 6, 6)
        }
        ctx.fillStyle = ctx.createPattern(checker, 'repeat') ?? '#3a3a3a'
      }
      for (const y of rows) for (let x = pitch / 2; x + holeW < w; x += pitch) drawHole(x, y)
    }

    // la scritta dell'emulsione sulla banda bassa
    ctx.font = `600 ${Math.round(band * 0.26)}px ${EDGE_FONT}`
    ctx.fillStyle = REBATE_TEXT_COLOR
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`PICPICK 400  ▸ ${frameNumber}`, w * 0.02, h - band * 0.78)
  }

  // il timbro senza cornice né telaietto: nell'angolo della foto, avorio,
  // con un velo d'ombra perché resti leggibile su qualunque immagine
  if (dateStamp === 'cornice' && takenAt > 0 && style !== 'slide') {
    const size = Math.max(9, minSide * 0.03)
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = size * 0.5
    drawInkStamp(
      ctx,
      stampDateText(takenAt),
      w - insetX - minSide * 0.045,
      h - insetBottom - minSide * 0.085,
      size,
      false
    )
    ctx.restore()
  }

  // il datario: dentro la finestra visibile, mai sotto il telaio
  if (dateStamp === 'datario' && takenAt > 0) {
    const digitH = Math.round(h * 0.036)
    const { rects, width: stampW } = sevenSegmentRects(filmDateText(takenAt), digitH)
    const originX = w - insetX - w * 0.045 - stampW
    const originY = h - insetBottom - h * 0.045 - digitH
    ctx.save()
    // il leggero corsivo dei quartz veri
    ctx.translate(originX, originY)
    ctx.transform(1, 0, -0.09, 1, 0, 0)
    ctx.shadowColor = FILM_DATE_COLOR
    ctx.shadowBlur = digitH * 0.45
    ctx.fillStyle = FILM_DATE_COLOR
    ctx.globalAlpha = 0.95
    for (const r of rects) {
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.35)
      ctx.fill()
    }
    ctx.restore()
  }
  void insetTop
}
