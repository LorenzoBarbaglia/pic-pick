import { useEffect, useRef, useState } from 'react'
import type { SessionConfig } from '../types'

interface AlbumWallProps {
  config: SessionConfig
  onClose: () => void
}

interface WallItem {
  name: string
  url: string
}

const stripPrefix = (name: string): string => name.replace(/^\d{3}_/, '').replace(/^~tmp\d+_/, '')
const pad3 = (n: number): string => String(n).padStart(3, '0')

/**
 * Il muro dell'album: la cartella di destinazione vista com'è davvero,
 * una bolla alla volta. Trascina le foto per riordinare l'album: i prefissi
 * numerici vengono riscritti (in due fasi, per evitare collisioni di nomi).
 */
export function AlbumWall({ config, onClose }: AlbumWallProps) {
  const [bubbleId, setBubbleId] = useState(config.bubbles[0]?.id ?? '')
  const [items, setItems] = useState<WallItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const dragIndexRef = useRef<number | null>(null)
  const bubble = config.bubbles.find((b) => b.id === bubbleId) ?? config.bubbles[0]

  useEffect(() => {
    if (!bubble) return
    let cancelled = false
    const urls: string[] = []
    setLoading(true)
    setItems([])
    window.picpick
      .listAlbum(config.destDir, bubble.label)
      .then(async (files) => {
        const loaded: WallItem[] = []
        for (const file of files) {
          if (cancelled) return
          const bytes = await window.picpick.readImage(file.path)
          const url = URL.createObjectURL(new Blob([bytes]))
          urls.push(url)
          loaded.push({ name: file.name, url })
        }
        if (!cancelled) setItems(loaded)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleId, config.destDir])

  // riscrive i prefissi numerici secondo il nuovo ordine, in due fasi
  const renumber = async (ordered: WallItem[]): Promise<void> => {
    if (!bubble) return
    setSaving(true)
    const bases = ordered.map((item) => stripPrefix(item.name))
    for (let i = 0; i < ordered.length; i++) {
      await window.picpick.renameFile(config.destDir, bubble.label, ordered[i].name, `~tmp${i}_${bases[i]}`)
    }
    const renamed: WallItem[] = []
    for (let i = 0; i < ordered.length; i++) {
      const finalName = `${pad3(i + 1)}_${bases[i]}`
      await window.picpick.renameFile(config.destDir, bubble.label, `~tmp${i}_${bases[i]}`, finalName)
      renamed.push({ ...ordered[i], name: finalName })
    }
    setItems(renamed)
    setSaving(false)
  }

  const reorder = (from: number, to: number): void => {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setItems(next)
    void renumber(next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--pp-line)] px-5 py-3">
        <h2 className="text-lg font-bold">Muro dell'album</h2>
        <div className="flex gap-2">
          {config.bubbles.map((b) => (
            <button
              key={b.id}
              onClick={() => setBubbleId(b.id)}
              className={`rounded-full px-3 py-1 text-sm ring-1 transition-colors ${
                b.id === bubbleId ? 'text-[var(--pp-ink-strong)] ring-[var(--pp-line-strong)]' : 'text-[var(--pp-ink-dim)] ring-[var(--pp-line)]'
              }`}
              style={b.id === bubbleId ? { backgroundColor: `rgba(${b.tint}, 0.35)` } : undefined}
            >
              {b.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-[var(--pp-ink-dim)]">
          {saving ? 'Riordino…' : "trascina una foto per riordinare l'album"}
        </span>
        <button
          onClick={onClose}
          className="rounded-[var(--pp-radius)] border border-[var(--pp-line)] px-3 py-1.5 text-sm text-[var(--pp-ink)] hover:border-[var(--pp-line-strong)]"
        >
          Chiudi
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {loading ? (
          <p className="text-[var(--pp-ink-dim)]">Caricamento dell'album…</p>
        ) : items.length === 0 ? (
          <p className="text-[var(--pp-ink-dim)]">Questa bolla non ha ancora foto.</p>
        ) : (
          <div className="grid grid-cols-4 gap-3 md:grid-cols-5 lg:grid-cols-6">
            {items.map((item, i) => (
              <div
                key={item.name}
                draggable={!saving}
                onDragStart={() => {
                  dragIndexRef.current = i
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const from = dragIndexRef.current
                  dragIndexRef.current = null
                  if (from !== null && from !== i && !saving) reorder(from, i)
                }}
                className="group relative cursor-grab overflow-hidden rounded-[var(--pp-radius)] ring-1 ring-[var(--pp-line)] active:cursor-grabbing"
                style={{ aspectRatio: `${config.format.ratio}` }}
                title={item.name}
              >
                <img src={item.url} alt="" className="h-full w-full object-cover" draggable={false} />
                <span className="absolute top-1 left-1 rounded bg-[var(--pp-scrim)] px-1.5 py-0.5 text-[10px] text-[var(--pp-ink-strong)] tabular-nums">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
