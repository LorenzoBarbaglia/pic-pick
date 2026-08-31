import type { ImageFile } from '../types'
import { hasHash, hashDistance, peekInfo } from './thumbs'

/** foto scattate a meno di questo intervallo l'una dall'altra sono la stessa raffica */
export const SCENE_GAP_SECONDS = 45
/** sotto questa distanza tra impronte due scatti si somigliano troppo per essere estranei */
export const SIMILAR_BITS = 11

export interface SceneMap {
  /** per ogni posizione della coda, l'indice della sua scena (-1 = nessuna) */
  sceneOf: number[]
  /** per ogni scena, le posizioni della coda che le appartengono, in ordine di scatto */
  scenes: number[][]
}

/**
 * Raggruppa la coda in raffiche usando il momento dello scatto, non la posizione:
 * così le sorelle di una scena restano insieme anche dopo un «Forse» o un
 * ripescaggio, che spostano le foto in fondo. Le foto senza data fanno scena a sé.
 */
export function groupScenes(files: ImageFile[], gapSeconds = SCENE_GAP_SECONDS): SceneMap {
  const sceneOf = new Array<number>(files.length).fill(-1)
  const scenes: number[][] = []

  const dated = files
    .map((file, index) => ({ index, takenAt: file.takenAt }))
    .filter((entry) => entry.takenAt > 0)
    .sort((a, b) => a.takenAt - b.takenAt)

  let current: number[] = []
  let previousTime = 0
  for (const entry of dated) {
    if (current.length > 0 && entry.takenAt - previousTime > gapSeconds * 1000) {
      scenes.push(current)
      current = []
    }
    current.push(entry.index)
    previousTime = entry.takenAt
  }
  if (current.length > 0) scenes.push(current)

  // le foto senza data non si raggruppano: ognuna è una scena di una sola foto
  for (const [index, file] of files.entries()) {
    if (file.takenAt <= 0) scenes.push([index])
  }

  scenes.sort((a, b) => (files[a[0]]?.takenAt ?? 0) - (files[b[0]]?.takenAt ?? 0))

  // Secondo criterio: la somiglianza. Le impronte percettive (calcolate insieme
  // alle miniature) uniscono scene contigue quando gli scatti si somigliano —
  // così una raffica si riconosce anche senza data, e i quasi-duplicati
  // finiscono insieme invece di essere valutati uno alla volta.
  const merged: number[][] = []
  for (const scene of scenes) {
    const previous = merged[merged.length - 1]
    if (previous && looksAlike(files, previous, scene)) {
      previous.push(...scene)
      previous.sort((a, b) => (files[a]?.takenAt ?? 0) - (files[b]?.takenAt ?? 0))
      continue
    }
    merged.push([...scene])
  }

  merged.forEach((scene, sceneIndex) => {
    for (const index of scene) sceneOf[index] = sceneIndex
  })

  return { sceneOf, scenes: merged }
}

/** due gruppi si somigliano se le foto di confine hanno impronte vicine */
function looksAlike(files: ImageFile[], left: number[], right: number[]): boolean {
  const a = peekInfo(files[left[left.length - 1]]?.path ?? '')
  const b = peekInfo(files[right[0]]?.path ?? '')
  if (!a || !b || !hasHash(a.hash) || !hasHash(b.hash)) return false
  return hashDistance(a.hash, b.hash) <= SIMILAR_BITS
}

const MONTHS = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre'
]

/** chiave stabile del capitolo mensile di una foto */
export function chapterKey(takenAt: number): string {
  if (takenAt <= 0) return 'senza-data'
  const date = new Date(takenAt)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** etichetta leggibile del capitolo: «Agosto 2026» */
export function chapterLabel(takenAt: number): string {
  if (takenAt <= 0) return 'Senza data'
  const date = new Date(takenAt)
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** orario breve dello scatto, per le etichette della striscia */
export function shortTime(takenAt: number): string {
  if (takenAt <= 0) return '—'
  const date = new Date(takenAt)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** data e ora complete, per i tooltip */
export function fullStamp(takenAt: number): string {
  if (takenAt <= 0) return 'data sconosciuta'
  const date = new Date(takenAt)
  return `${date.getDate()} ${MONTHS[date.getMonth()].toLowerCase()} ${date.getFullYear()} · ${shortTime(takenAt)}`
}
