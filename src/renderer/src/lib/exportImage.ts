import type { ExportState } from '../components/EditorStage'
import { renderFull } from './useDeveloped'
import {
  grainCanvas,
  grainPixelSize,
  grainStrength,
  NEUTRAL_DEVELOP,
  vignetteInner,
  vignetteStrength
} from './develop'
import type { Develop } from './develop'
import {
  captionFontById,
  drawInkStamp,
  drawPrintOverlay,
  printSize,
  shapePathD,
  stampDateText
} from './print'
import type { CaptionFontId, CropShape, DateStampId } from './print'

export interface ExportOptions {
  backgroundColor: string | null
  formatRatio: number
  longEdge?: number
  develop?: Develop
  /** passe-partout: frazione del lato corto (0 = nessuna cornice) */
  matFraction?: number
  /** colore della cornice; null/assente = lo stesso dello sfondo */
  matColor?: string | null
  /** didascalia scritta sulla cornice, sotto la foto */
  caption?: string
  /** qualità JPEG (ignorata per i PNG) */
  quality?: number
  /** sagoma di ritaglio della stampa */
  shape?: CropShape
  /** font della didascalia */
  captionFont?: CaptionFontId
  /** timbro della data di scatto */
  dateStamp?: DateStampId
  /** momento dello scatto, per i timbri */
  takenAt?: number
  /** numero di fotogramma: la posizione nella sessione */
  frameNumber?: number
}

/**
 * Nitidezza da ridimensionamento: quando una foto scende da 6000px a 2000 i
 * dettagli si ammorbidiscono, e ogni editor serio riaffila dopo il resize.
 * Unsharp mask 3×3 sulla luminanza apparente, applicata in silenzio — è
 * manutenzione, non una scelta creativa da esporre all'utente.
 */
function sharpenCanvas(canvas: HTMLCanvasElement, amount: number, radius = 1): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  const image = ctx.getImageData(0, 0, width, height)
  const src = new Uint8ClampedArray(image.data)
  const dst = image.data
  const stride = width * 4
  // il raggio segue lo stiramento: su una foto ingrandita i bordi molli sono
  // larghi più di un pixel, e un raggio di 1 non li vedrebbe nemmeno
  const r = Math.max(1, Math.round(radius))
  const center = 1 + 4 * amount
  for (let y = 0; y < height; y++) {
    const row = y * stride
    const up = (y - r < 0 ? 0 : y - r) * stride
    const down = (y + r >= height ? height - 1 : y + r) * stride
    for (let x = 0; x < width; x++) {
      const i = row + x * 4
      const left = row + (x - r < 0 ? 0 : x - r) * 4
      const right = row + (x + r >= width ? width - 1 : x + r) * 4
      const above = up + x * 4
      const below = down + x * 4
      for (let c = 0; c < 3; c++) {
        dst[i + c] =
          src[i + c] * center -
          amount * (src[left + c] + src[right + c] + src[above + c] + src[below + c])
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** colore della didascalia: si legge sia su cornici chiare sia scure */
function captionColor(backgroundColor: string | null): string {
  if (!backgroundColor) return 'rgba(232, 226, 216, 0.9)'
  const hex = backgroundColor.replace('#', '')
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luma > 140 ? 'rgba(58, 51, 43, 0.85)' : 'rgba(232, 226, 216, 0.9)'
}

/**
 * Esporta esattamente ciò che giace nel frame sullo stage: sfondo album +
 * immagine con la sua trasformazione (pan/zoom/rotazione), limitata al
 * ritaglio, con lo stesso sviluppo dell'anteprima. Poi, attorno, l'eventuale
 * passe-partout col colore dell'album e la didascalia.
 * Sfondo trasparente → PNG, altrimenti JPEG.
 */
export async function renderExport(
  image: HTMLImageElement,
  state: ExportState,
  options: ExportOptions
): Promise<{ data: Uint8Array; extension: string }> {
  const {
    backgroundColor,
    formatRatio,
    longEdge = 2160,
    develop = NEUTRAL_DEVELOP,
    matFraction = 0,
    matColor = null,
    caption = '',
    quality = 0.92,
    shape = 'none',
    captionFont = 'classica',
    dateStamp = 'nessuno',
    takenAt = 0,
    frameNumber = 1
  } = options
  /** il colore effettivo della cornice: il suo, o quello dello sfondo */
  const matFill = matColor ?? backgroundColor

  // il formato scelto descrive la STAMPA FINITA: con la cornice attiva è
  // l'esterno ad avere quel formato — la stessa convenzione dello stage, dove
  // frameRaw ha il formato e l'area foto è la sottrazione del passe-partout.
  const {
    outerWidth,
    outerHeight,
    matPx,
    matBottomPx,
    width: outWidth,
    height: outHeight
  } = printSize(formatRatio, longEdge, matFraction)
  const scaleToOutput = outWidth / state.frame.width

  // --- la foto composta, come sempre: questo blocco non cambia mai ---
  const inner = document.createElement('canvas')
  inner.width = outWidth
  inner.height = outHeight
  const ctx = inner.getContext('2d')
  if (!ctx) throw new Error('Canvas non disponibile')

  if (backgroundColor) {
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, outWidth, outHeight)
  }

  // ai 90° si arrotonda il residuo della molla; un angolo davvero libero
  // (rotella sganciata con Alt) si esporta com'è: WYSIWYG anche qui
  const nearest = Math.round(state.rotation / 90) * 90
  const snappedRotation = Math.abs(state.rotation - nearest) < 0.05 ? nearest : state.rotation

  ctx.imageSmoothingQuality = 'high'
  const drawScale = state.scale * scaleToOutput
  const halfWidth = image.naturalWidth / 2
  const halfHeight = image.naturalHeight / 2
  const cropX = state.crop.x - halfWidth
  const cropY = state.crop.y - halfHeight
  // vista + clip del ritaglio: servono due volte (la foto, poi gli strati di
  // stampa dopo la nitidezza). Il clip resta valido anche cambiando la
  // trasformazione: lo sviluppo colora solo la foto, mai lo sfondo dell'album.
  const applyCropClip = (): void => {
    ctx.save()
    ctx.translate(
      (state.cx - state.frame.x) * scaleToOutput,
      (state.cy - state.frame.y) * scaleToOutput
    )
    ctx.rotate((snappedRotation * Math.PI) / 180)
    ctx.scale(drawScale, drawScale)
    ctx.beginPath()
    ctx.rect(cropX, cropY, state.crop.w, state.crop.h)
    ctx.clip()
  }

  // la foto sviluppata dalla GPU, a piena risoluzione: gli stessi pixel
  // dell'anteprima, solo più grandi
  const developed = renderFull(image, develop)
  let source: CanvasImageSource = developed ?? image

  /**
   * INGRANDIMENTO — si affila PRIMA di ingrandire.
   *
   * Affilare dopo era l'errore: l'interpolazione trasforma ogni bordo in una
   * rampa di pixel, e un unsharp a raggio largo su quella rampa non ne esalta
   * il dettaglio, ne esalta i GRADINI — è la scalettatura che si vede zoomando.
   * Affilando i pixel veri e ingrandendo dopo, l'interpolazione lavora su bordi
   * già netti e li tiene morbidi. È l'ordine delle tre passate dei manuali:
   * nitidezza di ripresa alla risoluzione nativa, poi la scala.
   */
  if (drawScale > 1.15 && developed) {
    const pixels = developed.width * developed.height
    if (pixels <= 6_000_000) {
      const pre = document.createElement('canvas')
      pre.width = developed.width
      pre.height = developed.height
      const pctx = pre.getContext('2d')
      if (pctx) {
        pctx.drawImage(developed, 0, 0)
        sharpenCanvas(pre, Math.min(0.3, 0.12 * drawScale), 1)
        source = pre
      }
    }
  }

  applyCropClip()
  if (developed || source !== image) {
    ctx.drawImage(source, -halfWidth, -halfHeight, image.naturalWidth, image.naturalHeight)
  } else {
    ctx.drawImage(image, -halfWidth, -halfHeight)
  }
  ctx.restore()

  // Riduzione: qui invece si affila DOPO, perché è il ridimensionamento stesso
  // ad aver ammorbidito i bordi. Sempre prima di vignetta e grana: si riaffila
  // la foto, mai la grana della stampa.
  if (drawScale < 0.9) sharpenCanvas(inner, 0.28)

  applyCropClip()
  const vignette = vignetteStrength(develop)
  if (vignette > 0) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.save()
    // ellisse proporzionale al ritaglio, come il radial-gradient dell'anteprima
    ctx.translate(cropX + state.crop.w / 2, cropY + state.crop.h / 2)
    ctx.scale(1, state.crop.h / state.crop.w)
    const reach = (state.crop.w / 2) * Math.SQRT2
    const innerStop = vignetteInner(develop)
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, reach)
    gradient.addColorStop(innerStop, 'rgba(0, 0, 0, 0)')
    gradient.addColorStop(innerStop + (1 - innerStop) * 0.55, `rgba(0, 0, 0, ${vignette * 0.45})`)
    gradient.addColorStop(1, `rgba(0, 0, 0, ${vignette})`)
    ctx.fillStyle = gradient
    ctx.fillRect(-reach, -reach, reach * 2, reach * 2)
    ctx.restore()
  }

  const grain = grainStrength(develop)
  if (grain > 0) {
    // la grana appartiene alla stampa, non ai pixel: si disegna in coordinate
    // di output (il clip del ritaglio è già attivo) alla stessa dimensione
    // relativa che si vedeva sullo stage
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const pattern = ctx.createPattern(grainCanvas(grainPixelSize(develop)), 'repeat')
    if (pattern) {
      const tileScale = Math.max(0.35, scaleToOutput)
      pattern.setTransform(new DOMMatrix([tileScale, 0, 0, tileScale, 0, 0]))
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = grain
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, outWidth, outHeight)
    }
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.restore()

  // --- la Smussata: una maschera; gli altri stili sono disegnati dopo ---
  const shapeD = shapePathD(shape, outWidth, outHeight)
  if (shapeD) {
    const outsideFill = (matFraction > 0 ? matFill : backgroundColor) ?? null
    if (outsideFill) {
      const outside = new Path2D(`M 0 0 H ${outWidth} V ${outHeight} H 0 Z ${shapeD}`)
      ctx.fillStyle = outsideFill
      ctx.fill(outside, 'evenodd')
    } else {
      // tutto trasparente: la sagoma ritaglia l'alfa, il PNG esce fustellato
      ctx.globalCompositeOperation = 'destination-in'
      ctx.fill(new Path2D(shapeD))
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  // --- telaietto, bordo pellicola, fotogramma e datario: una mano sola ---
  drawPrintOverlay(ctx, outWidth, outHeight, {
    style: shape,
    outsideFill: (matFraction > 0 ? matFill : backgroundColor) ?? null,
    holes: 'punch',
    // se c'è la cornice il timbro va sulla sua fascia, non sulla foto
    dateStamp:
      dateStamp === 'cornice' && matFraction > 0 && shape !== 'slide' ? 'nessuno' : dateStamp,
    takenAt,
    frameNumber
  })

  // --- il passe-partout: attorno alla foto, mai dentro la sua geometria ---
  let final: HTMLCanvasElement = inner
  if (matFraction > 0) {
    const outer = document.createElement('canvas')
    outer.width = outerWidth
    outer.height = outerHeight
    const octx = outer.getContext('2d')
    if (octx) {
      if (matFill) {
        octx.fillStyle = matFill
        octx.fillRect(0, 0, outer.width, outer.height)
      }
      octx.drawImage(inner, matPx, matPx)
      // un filo d'ombra tra foto e cornice: dà lo spessore della stampa vera
      if (matFill) {
        octx.strokeStyle = 'rgba(0, 0, 0, 0.18)'
        octx.lineWidth = Math.max(1, Math.round(outWidth / 1600))
        octx.strokeRect(matPx + 0.5, matPx + 0.5, outWidth - 1, outHeight - 1)
      }
      const text = caption.trim()
      const bandCenterY = matPx + outHeight + matBottomPx / 2
      if (text) {
        const font = captionFontById(captionFont)
        const fontPx = Math.max(16, Math.round(matPx * 0.5 * font.scale))
        octx.font = `${font.italic ? 'italic ' : ''}500 ${fontPx}px ${font.family}`
        octx.fillStyle = captionColor(matFill)
        octx.textAlign = 'center'
        octx.textBaseline = 'middle'
        // troppo lunga → ellissi, come in anteprima: mai glifi schiacciati
        const maxWidth = outer.width * 0.86
        let shown = text
        while (shown.length > 1 && octx.measureText(`${shown}…`).width > maxWidth) {
          shown = shown.slice(0, -1)
        }
        if (shown !== text) shown = `${shown}…`
        octx.fillText(shown, outer.width / 2, bandCenterY)
      }
      // il timbro del laboratorio, sulla fascia destra della cornice
      if (dateStamp === 'cornice' && takenAt > 0 && shape !== 'slide') {
        const isLightMat = (() => {
          if (!matFill) return false
          const hex = matFill.replace('#', '')
          const r = Number.parseInt(hex.slice(0, 2), 16)
          const g = Number.parseInt(hex.slice(2, 4), 16)
          const b = Number.parseInt(hex.slice(4, 6), 16)
          return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140
        })()
        drawInkStamp(
          octx,
          stampDateText(takenAt),
          outer.width - matPx,
          bandCenterY,
          Math.max(11, matPx * 0.3),
          isLightMat
        )
      }
      final = outer
    }
  }

  const mime = backgroundColor ? 'image/jpeg' : 'image/png'
  const blob = await new Promise<Blob>((resolve, reject) =>
    final.toBlob((b) => (b ? resolve(b) : reject(new Error('Export fallito'))), mime, quality)
  )
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    extension: backgroundColor ? 'jpg' : 'png'
  }
}
