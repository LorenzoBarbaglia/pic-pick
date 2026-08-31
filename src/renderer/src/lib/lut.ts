import { useEffect, useState } from 'react'

/**
 * LUT 3D in formato `.cube`, lo standard che si scambiano fotografi e coloristi
 * (Resolve, Premiere, Lightroom lo leggono).
 *
 * Importarli significa poter usare le migliaia di LUT che girano in rete come
 * look di partenza; esportarli significa che uno sviluppo trovato qui si può
 * portare altrove. In entrambi i casi il calcolo lo fa lo stesso shader: un LUT
 * è solo una tabella di colori campionata su una griglia.
 */

export interface Lut3D {
  name: string
  /** lato della griglia (di solito 17, 32, 33 o 64) */
  size: number
  /** size³ terne rgb in 0-1, con il rosso che varia più velocemente */
  data: Float32Array
}

/**
 * Legge un `.cube`. Il formato è righe di testo: `LUT_3D_SIZE n`, eventuali
 * `DOMAIN_MIN`/`DOMAIN_MAX`, commenti con `#`, poi n³ terne di numeri.
 */
export function parseCube(text: string, name: string): Lut3D | null {
  let size = 0
  const values: number[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    if (line.toUpperCase().startsWith('LUT_3D_SIZE')) {
      size = Number.parseInt(line.split(/\s+/)[1] ?? '', 10)
      continue
    }
    // le altre direttive (TITLE, DOMAIN_*, LUT_1D_SIZE) non servono al nostro uso
    if (/^[A-Z_]/i.test(line) && !/^[-\d.]/.test(line)) continue
    const parts = line.split(/\s+/)
    if (parts.length < 3) continue
    const r = Number.parseFloat(parts[0])
    const g = Number.parseFloat(parts[1])
    const b = Number.parseFloat(parts[2])
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue
    values.push(r, g, b)
  }
  if (!Number.isFinite(size) || size < 2) return null
  if (values.length < size * size * size * 3) return null
  return { name, size, data: new Float32Array(values.slice(0, size * size * size * 3)) }
}

/**
 * Impacchetta il LUT in una texture 2D: le fette di blu affiancate in
 * orizzontale (larghezza size·size, altezza size). WebGL1 non ha texture 3D,
 * e questo è il modo con cui si fa da sempre nei giochi.
 */
export function lutToTexture(lut: Lut3D): { width: number; height: number; pixels: Uint8Array } {
  const { size, data } = lut
  const width = size * size
  const height = size
  const pixels = new Uint8Array(width * height * 4)
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const source = ((b * size + g) * size + r) * 3
        const x = b * size + r
        const target = (g * width + x) * 4
        pixels[target] = Math.round(Math.min(1, Math.max(0, data[source])) * 255)
        pixels[target + 1] = Math.round(Math.min(1, Math.max(0, data[source + 1])) * 255)
        pixels[target + 2] = Math.round(Math.min(1, Math.max(0, data[source + 2])) * 255)
        pixels[target + 3] = 255
      }
    }
  }
  return { width, height, pixels }
}

/**
 * L'immagine «identità»: contiene una volta ogni colore della griglia, nello
 * stesso ordine della texture. Passandola nella pipeline e rileggendo i pixel si
 * ottiene il LUT del look corrente — lo shader diventa la funzione da campionare.
 */
export function identityCanvas(size: number): HTMLCanvasElement {
  const width = size * size
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(width, size)
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const x = b * size + r
        const target = (g * width + x) * 4
        image.data[target] = Math.round((r / (size - 1)) * 255)
        image.data[target + 1] = Math.round((g / (size - 1)) * 255)
        image.data[target + 2] = Math.round((b / (size - 1)) * 255)
        image.data[target + 3] = 255
      }
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** scrive un `.cube` a partire dai pixel letti dall'immagine identità sviluppata */
export function serializeCube(title: string, size: number, pixels: Uint8Array): string {
  const width = size * size
  const lines: string[] = [
    `# ${title} — esportato da pic&pick`,
    `TITLE "${title.replace(/"/g, '')}"`,
    `LUT_3D_SIZE ${size}`,
    'DOMAIN_MIN 0.0 0.0 0.0',
    'DOMAIN_MAX 1.0 1.0 1.0',
    ''
  ]
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const x = b * size + r
        const source = (g * width + x) * 4
        const red = (pixels[source] / 255).toFixed(6)
        const green = (pixels[source + 1] / 255).toFixed(6)
        const blue = (pixels[source + 2] / 255).toFixed(6)
        lines.push(`${red} ${green} ${blue}`)
      }
    }
  }
  return lines.join('\n')
}

// --- registro dei LUT importati ---

const loaded = new Map<string, Lut3D>()
const failed = new Set<string>()
const loading = new Set<string>()
let names: string[] = []
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  version += 1
  for (const listener of listeners) listener()
}

/** elenco dei LUT importati (nomi di file), ricaricato dal disco */
export async function refreshLutList(): Promise<void> {
  names = await window.picpick.listLuts()
  notify()
}

export function lutNames(): string[] {
  return names
}

/** il LUT già caricato in memoria, se c'è */
export function getLut(name: string): Lut3D | null {
  return loaded.get(name) ?? null
}

/** registra un LUT già in memoria (usato dai test e da eventuali LUT interni) */
export function registerLut(lut: Lut3D): void {
  loaded.set(lut.name, lut)
  if (!names.includes(lut.name)) names = [...names, lut.name]
  notify()
}

/** avvia il caricamento di un LUT: al termine i componenti si aggiornano */
export function ensureLut(name: string): void {
  if (!name || loaded.has(name) || loading.has(name) || failed.has(name)) return
  loading.add(name)
  void window.picpick.readLut(name).then((text) => {
    loading.delete(name)
    const lut = text ? parseCube(text, name) : null
    if (lut) loaded.set(name, lut)
    else failed.add(name)
    notify()
  })
}

export async function importLuts(): Promise<string[]> {
  const imported = await window.picpick.pickLuts()
  if (imported.length > 0) await refreshLutList()
  return imported
}

export async function deleteLut(name: string): Promise<void> {
  await window.picpick.removeLut(name)
  loaded.delete(name)
  failed.delete(name)
  await refreshLutList()
}

/** i LUT disponibili, con aggiornamento quando ne arrivano o se ne caricano */
export function useLuts(): { names: string[]; version: number } {
  const [state, setState] = useState({ names, version })
  useEffect(() => {
    const listener = (): void => setState({ names: [...names], version })
    listeners.add(listener)
    void refreshLutList()
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return state
}

/** nome leggibile: via l'estensione e i separatori */
export function lutLabel(name: string): string {
  return name.replace(/\.cube$/i, '').replace(/[_-]+/g, ' ')
}
