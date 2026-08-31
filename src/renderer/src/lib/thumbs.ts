/**
 * Miniature su richiesta, e con esse due misure che si ottengono gratis mentre
 * la foto è già decodificata in memoria:
 *
 * - **nitidezza**: varianza del laplaciano sulla luminanza. È il modo classico e
 *   senza intelligenza artificiale di distinguere uno scatto mosso da uno a
 *   fuoco: dove ci sono bordi netti il laplaciano è grande, su un'immagine
 *   impastata è quasi zero.
 * - **impronta**: un dHash a 64 bit. Serve a riconoscere gli scatti *simili*
 *   anche quando i metadati non ci sono, per raggrupparli in raffica.
 *
 * Ogni file si legge una volta sola: la cache tiene miniatura e misure, e scarta
 * le più vecchie quando cresce troppo.
 */

const CACHE_LIMIT = 800

export interface ThumbInfo {
  dataUrl: string
  /** 0-100: sotto 30 la foto è probabilmente mossa o fuori fuoco */
  sharpness: number
  /** impronta percettiva a 64 bit, come coppia di interi a 32 */
  hash: [number, number]
}

const cache = new Map<string, ThumbInfo>()
const pending = new Map<string, Promise<ThumbInfo | null>>()

/** lato dell'immagine su cui si misura: abbastanza grande per i bordi, veloce */
const MEASURE_PX = 192

/**
 * Varianza del laplaciano su una griglia di luminanza, riportata su 0-100 con
 * una curva logaritmica: i valori grezzi vanno da pochi punti (mosso) a
 * migliaia (molto nitido), e in scala lineare sarebbero illeggibili.
 */
function measureSharpness(gray: Float32Array, width: number, height: number): number {
  let sum = 0
  let sumSquares = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const laplacian =
        gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i]
      sum += laplacian
      sumSquares += laplacian * laplacian
      count += 1
    }
  }
  if (count === 0) return 0
  const mean = sum / count
  const variance = sumSquares / count - mean * mean
  // 8 → mosso, 2000 → molto nitido
  const score = (Math.log10(Math.max(1, variance)) - 0.9) * 42
  return Math.max(0, Math.min(100, Math.round(score)))
}

/** dHash: confronto tra pixel adiacenti su una griglia 9×8 */
function measureHash(bitmap: ImageBitmap): [number, number] {
  const canvas = document.createElement('canvas')
  canvas.width = 9
  canvas.height = 8
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return [0, 0]
  ctx.drawImage(bitmap, 0, 0, 9, 8)
  const data = ctx.getImageData(0, 0, 9, 8).data
  let low = 0
  let high = 0
  let bit = 0
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = (y * 9 + x) * 4
      const right = (y * 9 + x + 1) * 4
      const lumLeft = data[left] * 0.299 + data[left + 1] * 0.587 + data[left + 2] * 0.114
      const lumRight = data[right] * 0.299 + data[right + 1] * 0.587 + data[right + 2] * 0.114
      const on = lumLeft > lumRight ? 1 : 0
      if (bit < 32) low |= on << bit
      else high |= on << (bit - 32)
      bit += 1
    }
  }
  return [low >>> 0, high >>> 0]
}

async function build(filePath: string, longEdge: number): Promise<ThumbInfo | null> {
  try {
    const bytes = await window.picpick.readImage(filePath)
    const bitmap = await createImageBitmap(new Blob([bytes]))

    // miniatura per la striscia
    const scale = longEdge / Math.max(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * Math.min(1, scale)))
    canvas.height = Math.max(1, Math.round(bitmap.height * Math.min(1, scale)))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return null
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7)

    // misure sulla stessa immagine già decodificata
    const measureScale = MEASURE_PX / Math.max(bitmap.width, bitmap.height)
    const mw = Math.max(8, Math.round(bitmap.width * Math.min(1, measureScale)))
    const mh = Math.max(8, Math.round(bitmap.height * Math.min(1, measureScale)))
    const measure = document.createElement('canvas')
    measure.width = mw
    measure.height = mh
    const mctx = measure.getContext('2d', { willReadFrequently: true })
    let sharpness = 0
    if (mctx) {
      mctx.drawImage(bitmap, 0, 0, mw, mh)
      const pixels = mctx.getImageData(0, 0, mw, mh).data
      const gray = new Float32Array(mw * mh)
      for (let i = 0; i < gray.length; i++) {
        const p = i * 4
        gray[i] = pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114
      }
      sharpness = measureSharpness(gray, mw, mh)
    }
    const hash = measureHash(bitmap)
    bitmap.close()

    const info: ThumbInfo = { dataUrl, sharpness, hash }
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next()
      if (!oldest.done) cache.delete(oldest.value)
    }
    cache.set(filePath, info)
    return info
  } catch {
    return null
  } finally {
    pending.delete(filePath)
  }
}

/** informazioni già in cache, se ci sono: permette di disegnare senza attendere */
export function peekInfo(filePath: string): ThumbInfo | null {
  return cache.get(filePath) ?? null
}

/** miniatura già in cache, se c'è */
export function peekThumb(filePath: string): string | null {
  return cache.get(filePath)?.dataUrl ?? null
}

export function getThumb(filePath: string, longEdge = 160): Promise<ThumbInfo | null> {
  const cached = cache.get(filePath)
  if (cached) return Promise.resolve(cached)
  const inFlight = pending.get(filePath)
  if (inFlight) return inFlight
  const promise = build(filePath, longEdge)
  pending.set(filePath, promise)
  return promise
}

/** memorizza una miniatura già calcolata altrove (es. alla decisione) */
export function primeThumb(filePath: string, dataUrl: string): void {
  if (!dataUrl) return
  const existing = cache.get(filePath)
  cache.set(filePath, {
    dataUrl,
    sharpness: existing?.sharpness ?? 0,
    hash: existing?.hash ?? [0, 0]
  })
}

/** quanti bit differiscono tra due impronte: sotto 12 gli scatti sono simili */
export function hashDistance(a: [number, number], b: [number, number]): number {
  const count = (value: number): number => {
    let v = value
    v = v - ((v >> 1) & 0x55555555)
    v = (v & 0x33333333) + ((v >> 2) & 0x33333333)
    return (((v + (v >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24
  }
  return count((a[0] ^ b[0]) >>> 0) + count((a[1] ^ b[1]) >>> 0)
}

/** vero se l'impronta è stata calcolata (una foto mai letta ha impronta nulla) */
export function hasHash(hash: [number, number]): boolean {
  return hash[0] !== 0 || hash[1] !== 0
}
