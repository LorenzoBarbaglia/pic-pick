import type { Develop } from './develop'

/**
 * I due strumenti "pratici" della camera di sviluppo: il punto di partenza
 * automatico e il contagocce del bilanciamento del bianco. Nessuna AI: solo
 * l'istogramma e un po' di algebra sul nostro stesso modello di colore.
 */

/** luminanza percettiva di un pixel sRGB 0-255 */
function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Punto di partenza automatico: legge i percentili di luminanza della foto
 * originale e propone esposizione, bianchi, neri e contrasto. È il classico
 * «Auto» da istogramma — volutamente prudente: deve mettere la palla sul
 * dischetto, non tirare il rigore al posto tuo.
 */
export function computeAuto(image: HTMLImageElement): Partial<Develop> {
  const side = 96
  const scale = side / Math.max(image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(8, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(8, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return {}
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data

  const values: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    values.push(luma(data[i], data[i + 1], data[i + 2]) / 255)
  }
  values.sort((a, b) => a - b)
  const percentile = (p: number): number => values[Math.floor((values.length - 1) * p)] ?? 0.5

  const p01 = percentile(0.01)
  const p50 = percentile(0.5)
  const p99 = percentile(0.99)

  const patch: Partial<Develop> = {}

  // la mediana verso un grigio medio da stampa (0.45): 100 di slider ≈ 1.35 stop
  const stops = Math.log2(0.45 / Math.max(0.02, p50))
  patch.exposure = clamp(Math.round((stops / 1.35) * 100 * 0.8), -55, 55)

  // il punto di bianco si allunga se la foto non arriva mai al bianco
  if (p99 < 0.9) patch.whites = clamp(Math.round((0.95 - p99) * 160), 0, 45)
  else if (p99 > 0.995) patch.whites = -12

  // e il punto di nero si àncora se i neri galleggiano
  if (p01 > 0.05) patch.blacks = clamp(-Math.round((p01 - 0.03) * 260), -40, 0)
  else if (p01 < 0.004) patch.blacks = 8

  // foto piatta → un filo di contrasto
  const spread = p99 - p01
  if (spread < 0.75) patch.contrast = clamp(Math.round((0.8 - spread) * 60), 0, 22)

  return patch
}

/**
 * Contagocce del bianco: dato un punto che DOVREBBE essere grigio, trova
 * temperatura e tinta che lo neutralizzano. Risolve numericamente l'inverso
 * del modello di bilanciamento dello shader (guadagni per canale in funzione
 * di temp/tint): una ricerca a griglia con raffinamento — 15k valutazioni di
 * un polinomio, meno di un millisecondo.
 */
export function solveWhiteBalance(sample: { r: number; g: number; b: number }): {
  temperature: number
  tint: number
} {
  const toLinear = (v: number): number => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const R = Math.max(1e-4, toLinear(sample.r))
  const G = Math.max(1e-4, toLinear(sample.g))
  const B = Math.max(1e-4, toLinear(sample.b))

  // gli stessi guadagni dello shader, in funzione di t (temp) e n (tint) in -1..1
  const errorAt = (t: number, n: number): number => {
    const gr = 1 + t * 0.22 + n * 0.05
    const gg = 1 - Math.abs(t) * 0.03 - n * 0.14
    const gb = 1 - t * 0.24 + n * 0.05
    const target = G * gg
    const er = R * gr - target
    const eb = B * gb - target
    return er * er + eb * eb
  }

  let bestT = 0
  let bestN = 0
  let bestError = errorAt(0, 0)
  const search = (centerT: number, centerN: number, reach: number, step: number): void => {
    for (let t = centerT - reach; t <= centerT + reach; t += step) {
      for (let n = centerN - reach; n <= centerN + reach; n += step) {
        const ct = clamp(t, -1, 1)
        const cn = clamp(n, -1, 1)
        const err = errorAt(ct, cn)
        if (err < bestError) {
          bestError = err
          bestT = ct
          bestN = cn
        }
      }
    }
  }
  search(0, 0, 1, 0.04) // grossolana su tutto il piano
  search(bestT, bestN, 0.05, 0.005) // fine attorno al minimo

  return { temperature: Math.round(bestT * 100), tint: Math.round(bestN * 100) }
}

/**
 * Quanto è nitido DAVVERO il ritaglio che si sta per stampare.
 *
 * Si misura la varianza del laplaciano — il modo classico di stimare il fuoco:
 * dove ci sono bordi netti la derivata seconda è grande, su un'immagine mossa
 * resta piatta — ma su TRE finestre a pixel reali invece che sull'immagine
 * intera, e si tiene la migliore. Il motivo è fotografico: in un ritratto con
 * lo sfondo sfocato la media direbbe «molle», mentre quello che conta è se il
 * soggetto è a fuoco. Misurare l'immagine ridotta, invece, cancellerebbe
 * proprio il dettaglio fine che stiamo cercando.
 */
export function measureCropSharpness(
  image: HTMLImageElement,
  crop: { x: number; y: number; w: number; h: number }
): number {
  const WINDOW = 256
  const canvas = document.createElement('canvas')
  canvas.width = WINDOW
  canvas.height = WINDOW
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0

  const spots: { x: number; y: number }[] = [
    { x: crop.x + crop.w / 2 - WINDOW / 2, y: crop.y + crop.h / 2 - WINDOW / 2 },
    { x: crop.x + crop.w / 3 - WINDOW / 2, y: crop.y + crop.h / 3 - WINDOW / 2 },
    { x: crop.x + (crop.w * 2) / 3 - WINDOW / 2, y: crop.y + (crop.h * 2) / 3 - WINDOW / 2 }
  ]
  let best = 0
  for (const spot of spots) {
    const sx = Math.max(crop.x, Math.min(spot.x, crop.x + crop.w - WINDOW))
    const sy = Math.max(crop.y, Math.min(spot.y, crop.y + crop.h - WINDOW))
    const w = Math.min(WINDOW, crop.w)
    const h = Math.min(WINDOW, crop.h)
    if (w < 16 || h < 16) continue
    ctx.clearRect(0, 0, WINDOW, WINDOW)
    ctx.drawImage(image, Math.max(0, sx), Math.max(0, sy), w, h, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    const gray = new Float32Array(w * h)
    for (let i = 0, g = 0; i < data.length; i += 4, g++) {
      gray[g] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    }
    let sum = 0
    let sumSquares = 0
    let count = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        const lap = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i]
        sum += lap
        sumSquares += lap * lap
        count += 1
      }
    }
    if (count === 0) continue
    const mean = sum / count
    const variance = sumSquares / count - mean * mean
    // stessa curva della striscia: 8 → mosso, 2000 → molto nitido
    const score = (Math.log10(Math.max(1, variance)) - 0.9) * 42
    best = Math.max(best, Math.max(0, Math.min(100, score)))
  }
  return Math.round(best)
}

/**
 * La dose di nitidezza per QUESTO ritaglio a QUESTO ingrandimento.
 *
 * Segue la logica delle tre passate di Bruce Fraser: qui si fa la parte
 * «di ripresa» (ridare acutanza a ciò che l'obiettivo e il sensore hanno
 * ammorbidito), mentre la passata «di stampa» resta automatica nell'export,
 * dove si conosce la dimensione finale. Due regole guidano i numeri: più il
 * ritaglio è morbido più serve dose (e raggio, che nello shader cresce con la
 * dose), e più lo si ingrandisce più i bordi vanno ridefiniti.
 */
export function autoDetail(
  sharpnessScore: number,
  stretch: number
): { patch: Partial<Develop>; note: string } {
  // molto nitido → poca dose; morbido → tanta, ma con un tetto: affilare una
  // foto mossa non la salva, la rende solo croccante di rumore
  let sharpness = 58 - sharpnessScore * 0.55
  // ingrandita oltre i suoi pixel: i bordi sono stati spalmati, vanno ripresi
  if (stretch > 1) sharpness += Math.min(25, (stretch - 1) * 30)
  // molto rimpicciolita: l'export riaffila già dopo il ridimensionamento
  if (stretch < 0.7) sharpness *= 0.8
  sharpness = Math.max(6, Math.min(60, Math.round(sharpness)))

  // sulle foto povere di dettaglio fine il micro-contrasto fa più della
  // acutanza: è la stessa ragione per cui i manuali allargano il raggio
  const clarity = Math.max(0, Math.min(22, Math.round((45 - sharpnessScore) * 0.45)))

  const stretchNote = stretch > 1.15 ? `, ingrandito ${Math.round(stretch * 100)}%` : ''
  const note =
    sharpnessScore < 18
      ? `Ritaglio molto morbido (${sharpnessScore}/100): nitidezza ${sharpness}, ma se è mossa non torna`
      : `Nitidezza ${sharpness}${clarity > 0 ? ` · chiarezza ${clarity}` : ''} — ritaglio ${sharpnessScore}/100${stretchNote}`
  return { patch: { sharpness, clarity }, note }
}
