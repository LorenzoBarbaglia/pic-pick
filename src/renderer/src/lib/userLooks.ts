import { useEffect, useState } from 'react'
import { registerUserLooks } from './develop'
import type { Develop, DevelopLook } from './develop'

/**
 * I look salvati dall'utente, in locale.
 *
 * Uno sviluppo trovato a mano su una foto vale per tutte le altre: qui si
 * conserva con un nome e torna nella lista accanto ai look di fabbrica, dove si
 * può anche dosare e sommare come gli altri. Tutto in localStorage: nessun file
 * da gestire, nessun account.
 */

const STORAGE_KEY = 'picpick-looks'

let cache: DevelopLook[] = []
const listeners = new Set<() => void>()

function read(): DevelopLook[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is DevelopLook =>
        typeof item?.id === 'string' &&
        typeof item?.label === 'string' &&
        typeof item?.develop === 'object'
    )
  } catch {
    return []
  }
}

function write(looks: DevelopLook[]): void {
  cache = looks
  // develop.ts deve poterli risolvere per id: le miscele salvate li citano
  registerUserLooks(looks)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(looks))
  } catch {
    // spazio esaurito o storage negato: restano validi per questa sessione
  }
  for (const listener of listeners) listener()
}

// all'avvio si caricano subito, così `lookById` li conosce da sempre
cache = read()
registerUserLooks(cache)

export function userLooks(): DevelopLook[] {
  return cache
}

/** salva lo sviluppo corrente come look personale (o aggiorna quello omonimo) */
export function saveUserLook(label: string, develop: Develop): DevelopLook {
  const clean = label.trim() || 'Mio look'
  const existing = cache.find((look) => look.label.toLowerCase() === clean.toLowerCase())
  const id = existing?.id ?? `mio-${Date.now().toString(36)}`
  const look: DevelopLook = {
    id,
    label: clean,
    hint: 'Look salvato da te',
    source: 'tuo',
    develop: { ...develop }
  }
  write([...cache.filter((item) => item.id !== id), look])
  return look
}

export function removeUserLook(id: string): void {
  write(cache.filter((look) => look.id !== id))
}

/** i look personali, aggiornati quando se ne salva o cancella uno */
export function useUserLooks(): DevelopLook[] {
  const [looks, setLooks] = useState<DevelopLook[]>(cache)
  useEffect(() => {
    const listener = (): void => setLooks([...cache])
    listeners.add(listener)
    listener()
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return looks
}
