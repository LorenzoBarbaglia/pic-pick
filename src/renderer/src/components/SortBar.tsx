import { useEffect, useRef, useState } from 'react'
import { SKIP_TINT } from '../lib/palette'
import type { SortBubble } from '../types'

interface SortBarProps {
  bubbles: SortBubble[]
  onSort: (bubble: SortBubble) => void
  /** Shift+clic: salva una copia nella bolla senza decidere né avanzare */
  onSortExtra?: (bubble: SortBubble) => void
  onLater: () => void
  onSkip: () => void
  disabled?: boolean
}

/**
 * Lo smistamento in modalità ufficio: le stesse destinazioni delle bolle, ma
 * ferme, etichettate e con la scorciatoia in chiaro. Nessuna fisica, nessun
 * inseguimento del cursore: solo un lampo di conferma al clic.
 */
export function SortBar({
  bubbles,
  onSort,
  onSortExtra,
  onLater,
  onSkip,
  disabled = false
}: SortBarProps) {
  const [pressed, setPressed] = useState<string | null>(null)
  const timerRef = useRef(0)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const flash = (id: string): void => {
    setPressed(id)
    clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setPressed(null), 220)
  }

  const entries = [
    ...bubbles.map((bubble, i) => ({
      id: bubble.id,
      label: bubble.label,
      shortcut: String(i + 1),
      tint: bubble.tint,
      action: (extraCopy: boolean) =>
        extraCopy && onSortExtra ? onSortExtra(bubble) : onSort(bubble)
    })),
    {
      id: '__later',
      label: 'Forse',
      shortcut: 'F',
      tint: 'var(--pp-accent-rgb)',
      action: () => onLater()
    },
    {
      id: '__skip',
      label: 'Non passa',
      shortcut: 'X',
      tint: SKIP_TINT,
      action: () => onSkip()
    }
  ]

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--pp-line)] bg-[var(--pp-scrim)] px-4 py-2">
      <span className="mr-1 text-xs tracking-wide text-[var(--pp-ink-dim)] uppercase">Smista in</span>
      {entries.map((entry) => {
        const isPressed = pressed === entry.id
        return (
          <button
            key={entry.id}
            disabled={disabled}
            onClick={(e) => {
              if (disabled) return
              flash(entry.id)
              entry.action(e.shiftKey)
            }}
            title={`${entry.label} (${entry.shortcut})`}
            className="pp-tool-flat flex h-9 cursor-pointer items-center gap-2 rounded-[var(--pp-radius)] border px-3 text-sm disabled:pointer-events-none disabled:opacity-40"
            style={{
              borderColor: isPressed ? `rgb(${entry.tint})` : 'var(--pp-line)',
              backgroundColor: isPressed ? `rgba(${entry.tint}, 0.2)` : undefined
            }}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: `rgb(${entry.tint})` }}
            />
            <span className="text-[var(--pp-ink)]">{entry.label}</span>
            <span className="rounded bg-[var(--pp-panel)] px-1 text-[10px] text-[var(--pp-ink-dim)]">
              {entry.shortcut}
            </span>
          </button>
        )
      })}
    </div>
  )
}
