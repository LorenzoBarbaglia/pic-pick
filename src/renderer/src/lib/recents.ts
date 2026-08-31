/**
 * Le ultime sessioni: coppie sorgente/destinazione con la data. Servono al
 * setup per ripartire con un clic invece di rifare due giri di cartelle.
 */

export interface RecentSession {
  sourceDir: string
  destDir: string
  when: number
}

const KEY = 'picpick-recents'
const LIMIT = 5

export function readRecents(): RecentSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is RecentSession =>
        typeof item?.sourceDir === 'string' &&
        typeof item?.destDir === 'string' &&
        typeof item?.when === 'number'
    )
  } catch {
    return []
  }
}

export function pushRecent(entry: { sourceDir: string; destDir: string }): void {
  const list = readRecents().filter(
    (item) => item.sourceDir !== entry.sourceDir || item.destDir !== entry.destDir
  )
  list.unshift({ ...entry, when: Date.now() })
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)))
  } catch {
    // pazienza
  }
}

/** l'ultimo pezzo del percorso: è il nome che si riconosce */
export function baseName(dir: string): string {
  return dir.split(/[\\/]/).filter(Boolean).pop() ?? dir
}
