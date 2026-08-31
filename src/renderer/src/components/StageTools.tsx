import type { ReactNode } from 'react'
import { LAYER } from '../lib/interactions'
import { LINE } from '../lib/palette'
import { usePreset } from '../lib/preset'

interface ToolChipProps {
  label: string
  shortcut?: string
  title?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  /** disegno animato, per la modalità animata */
  art?: ReactNode
  /** icona compatta, per la modalità ufficio */
  icon: ReactNode
}

/**
 * Un comando dello stage in due vesti: nel mondo animato è un oggetto tondo che
 * reagisce al tocco secondo il preset, in ufficio è un bottone etichettato che
 * non recita. Stessa funzione, due personalità.
 */
export function ToolChip({
  label,
  shortcut,
  title,
  active = false,
  disabled = false,
  onClick,
  art,
  icon
}: ToolChipProps) {
  const { animated, toolMotionClass } = usePreset()
  const fullTitle = `${title ?? label}${shortcut ? ` (${shortcut})` : ''}`

  if (!animated) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        title={fullTitle}
        className={`${toolMotionClass} flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--pp-radius)] border px-2.5 text-xs disabled:pointer-events-none disabled:opacity-40 ${
          active
            ? 'border-[var(--pp-accent)] bg-[var(--pp-accent)]/10 text-[var(--pp-accent)]'
            : 'border-[var(--pp-line)] text-[var(--pp-ink)] hover:border-white/40 hover:text-white'
        }`}
      >
        {icon}
        <span>{label}</span>
        {shortcut && <span className="text-[var(--pp-ink-dim)]">{shortcut}</span>}
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={fullTitle}
      className={`${toolMotionClass} group relative flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/55 ring-1 disabled:pointer-events-none disabled:opacity-35 ${
        active ? 'ring-2 ring-[var(--pp-accent)]' : 'ring-white/25'
      }`}
      style={{
        width: 'var(--pp-tool-size, 48px)',
        height: 'var(--pp-tool-size, 48px)'
      }}
    >
      {/* il disegno scala con la colonna: un solo punto da regolare */}
      <span
        className="flex items-center justify-center"
        style={{ transform: 'scale(var(--pp-tool-scale, 1))' }}
      >
        {art ?? icon}
      </span>
      {/* etichetta immediata: il «title» del sistema arriva dopo un secondo,
          troppo tardi per capire cos'e un'icona mentre la si sta guardando */}
      <span
        className="pointer-events-none absolute top-1/2 right-full mr-3 -translate-y-1/2 translate-x-1.5 rounded-[var(--pp-radius)] bg-black/90 px-2.5 py-1 text-xs whitespace-nowrap text-[var(--pp-ink)] opacity-0 shadow-lg shadow-black/50 ring-1 ring-white/15 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100"
        style={{ zIndex: LAYER.tooltip }}
      >
        {label}
        {shortcut && <span className="ml-1.5 text-[var(--pp-ink-dim)]">{shortcut}</span>}
      </span>
    </button>
  )
}

// --- icone compatte per la modalità ufficio ---

const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

/**
 * Sviluppo: un becher col liquido che oscilla e manda su una bollicina quando
 * il pannello è aperto. Il colore del liquido segue il look scelto.
 */
export function DevelopTool({
  active,
  onClick,
  liquid
}: {
  active: boolean
  onClick: () => void
  liquid: string
}) {
  const { preset, animated } = usePreset()
  const sloshSeconds = (2.6 / preset.motion.speed).toFixed(2)
  return (
    <ToolChip
      label="Sviluppo"
      shortcut="D"
      title="Regolazioni della foto"
      active={active}
      onClick={onClick}
      icon={
        <svg {...iconProps}>
          <path d="M9 3h6M10 3v6l-4 8a3 3 0 0 0 2.7 4.3h6.6A3 3 0 0 0 18 17l-4-8V3" />
          <path d="M7.5 15h9" />
        </svg>
      }
      art={
        <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
          {/* vetro del becher */}
          <g stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path d="M11 4h10" />
            <path d="M12.5 4v8L8 22.5A3.5 3.5 0 0 0 11.2 28h9.6a3.5 3.5 0 0 0 3.2-5.5L19.5 12V4" />
          </g>
          {/* liquido: oscilla come in un bagno di sviluppo */}
          <g
            style={{
              transformOrigin: '16px 24px',
              animation: animated ? `beaker-slosh ${sloshSeconds}s ease-in-out infinite` : undefined
            }}
          >
            <path
              d="M9.6 19.5h12.8l1.6 3A3.5 3.5 0 0 1 20.8 28h-9.6A3.5 3.5 0 0 1 8 22.5Z"
              fill={liquid}
              opacity="0.85"
            />
            <path d="M9.6 19.5h12.8" stroke={LINE} strokeWidth="1" opacity="0.7" />
          </g>
          {/* bollicina: sale solo quando lo sviluppo è aperto */}
          {animated && active && (
            <circle
              cx="16"
              cy="25"
              r="1.5"
              fill={LINE}
              opacity="0.8"
              style={{ animation: 'beaker-bubble 1.6s ease-in-out infinite' }}
            />
          )}
        </svg>
      }
    />
  )
}

/** Lente a pixel reali: al passaggio si avvicina, come se la si alzasse */
export function LoupeTool({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <ToolChip
      label={active ? 'Lente 100% · clic o Esc per riporla' : 'Lente 100%'}
      shortcut="Z"
      title="Guarda i pixel reali sotto il cursore: tieni Z, oppure lasciala appesa e riponila con un clic"
      active={active}
      onClick={onClick}
      icon={
        <svg {...iconProps}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21" />
        </svg>
      }
      art={
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" strokeLinecap="round">
          <g stroke={LINE} strokeWidth="1.8">
            <path d="M20.5 20.5 27 27" />
          </g>
          <g
            className="transition-transform duration-200 group-hover:scale-110"
            style={{ transformOrigin: '14px 14px' }}
          >
            <circle cx="14" cy="14" r="9" fill="rgba(255,255,255,0.10)" stroke={LINE} strokeWidth="1.8" />
            {/* riflesso sul vetro */}
            <path d="M9 11.5a6 6 0 0 1 5-3.5" stroke={LINE} strokeWidth="1.1" opacity="0.7" />
            <text
              x="14"
              y="17.5"
              textAnchor="middle"
              fontSize="7.5"
              fill={LINE}
              opacity="0.85"
              fontFamily="ui-sans-serif, system-ui"
            >
              1:1
            </text>
          </g>
        </svg>
      }
    />
  )
}

/** Dettagli: tre finestrelle che si aprono a ventaglio al passaggio */
export function DetailsTool({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <ToolChip
      label="Fuoco"
      shortcut="V"
      title="Tre finestre a pixel reali: controlla se la foto è a fuoco"
      active={active}
      onClick={onClick}
      icon={
        <svg {...iconProps}>
          <rect x="3" y="7" width="7" height="10" rx="1" />
          <rect x="13" y="7" width="8" height="10" rx="1" />
        </svg>
      }
      art={
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <g stroke={LINE} strokeWidth="1.6" fill="rgba(255,255,255,0.08)">
            <rect
              x="4"
              y="9"
              width="12"
              height="14"
              rx="1.5"
              className="transition-transform duration-200 group-hover:-translate-x-[3px] group-hover:-rotate-6"
              style={{ transformOrigin: '10px 16px' }}
            />
            <rect
              x="10"
              y="7"
              width="12"
              height="14"
              rx="1.5"
              className="transition-transform duration-200 group-hover:-translate-y-[2px]"
            />
            <rect
              x="16"
              y="9"
              width="12"
              height="14"
              rx="1.5"
              className="transition-transform duration-200 group-hover:translate-x-[3px] group-hover:rotate-6"
              style={{ transformOrigin: '22px 16px' }}
            />
          </g>
        </svg>
      }
    />
  )
}

/** Raffica: un mazzo di scatti che si sventaglia */
export function BurstTool({
  count,
  active,
  onClick,
  disabled
}: {
  count: number
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <ToolChip
      label={count > 1 ? `Raffica ${count}` : 'Raffica'}
      shortcut="S"
      title="Confronta gli scatti nati nello stesso momento"
      active={active}
      disabled={disabled}
      onClick={onClick}
      icon={
        <svg {...iconProps}>
          <rect x="7" y="4" width="12" height="15" rx="1.5" />
          <path d="M4.5 7v11a2.5 2.5 0 0 0 2.5 2.5h9" />
        </svg>
      }
      art={
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <g stroke={LINE} strokeWidth="1.5" fill="rgba(255,255,255,0.08)">
            <rect
              x="8"
              y="7"
              width="15"
              height="18"
              rx="2"
              className="transition-transform duration-200 group-hover:-rotate-12"
              style={{ transformOrigin: '15px 25px' }}
            />
            <rect
              x="8"
              y="7"
              width="15"
              height="18"
              rx="2"
              className="transition-transform duration-200 group-hover:rotate-3"
              style={{ transformOrigin: '15px 25px' }}
            />
            <rect
              x="8"
              y="7"
              width="15"
              height="18"
              rx="2"
              className="transition-transform duration-200 group-hover:rotate-[18deg]"
              style={{ transformOrigin: '15px 25px' }}
            />
          </g>
        </svg>
      }
    />
  )
}

/** Striscia della coda: una pellicola i cui fori scorrono quando è accesa */
export function FilmTool({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { preset, animated } = usePreset()
  const scrollSeconds = (1.1 / preset.motion.speed).toFixed(2)
  return (
    <ToolChip
      label="Striscia"
      shortcut="T"
      title="Mostra o nascondi la striscia della coda"
      active={active}
      onClick={onClick}
      icon={
        <svg {...iconProps}>
          <rect x="2.5" y="7" width="19" height="10" rx="1.5" />
          <path d="M7 7v10M12 7v10M17 7v10" />
        </svg>
      }
      art={
        <svg width="34" height="30" viewBox="0 0 34 30" fill="none">
          <rect
            x="2"
            y="7"
            width="30"
            height="16"
            rx="2"
            fill="rgba(255,255,255,0.08)"
            stroke={LINE}
            strokeWidth="1.6"
          />
          {/* fori di trascinamento: scorrono se la striscia è visibile */}
          <g
            style={{
              animation: animated && active ? `film-scroll ${scrollSeconds}s linear infinite` : undefined
            }}
          >
            {Array.from({ length: 6 }, (_, i) => (
              <g key={i} fill={LINE} opacity="0.85">
                <rect x={3 + i * 8} y="8.6" width="3.4" height="2.6" rx="0.6" />
                <rect x={3 + i * 8} y="18.8" width="3.4" height="2.6" rx="0.6" />
              </g>
            ))}
          </g>
          <g stroke={LINE} strokeWidth="1.1" opacity="0.8">
            <path d="M12.5 12.5h4v5h-4zM20 12.5h4v5h-4z" />
          </g>
        </svg>
      }
    />
  )
}

/** Proporzioni: un lucchetto che scatta */
export function LockTool({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <ToolChip
      label="Proporzioni"
      shortcut="L"
      title="Il ritaglio mantiene le proporzioni dell'album"
      active={active}
      onClick={onClick}
      icon={
        <svg {...iconProps}>
          <rect x="5" y="10.5" width="14" height="10" rx="2" />
          {active ? <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /> : <path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.6-1.6" />}
        </svg>
      }
      art={
        <svg width="30" height="32" viewBox="0 0 30 32" fill="none">
          {/* archetto: si solleva e ruota quando le proporzioni sono libere */}
          <path
            d={active ? 'M9.5 14V10a5.5 5.5 0 0 1 11 0v4' : 'M9.5 14V10a5.5 5.5 0 0 1 10.4-2.6'}
            stroke={LINE}
            strokeWidth="1.8"
            strokeLinecap="round"
            className="transition-all duration-200"
            style={{ transformOrigin: '20px 14px' }}
          />
          <rect
            x="5.5"
            y="14"
            width="19"
            height="13"
            rx="2.5"
            fill="rgba(255,255,255,0.10)"
            stroke={LINE}
            strokeWidth="1.8"
          />
          {/* dentro: il rapporto del formato */}
          <rect x="10" y="18" width="10" height="5.5" rx="1" stroke={LINE} strokeWidth="1.2" opacity="0.8" />
        </svg>
      }
    />
  )
}

/** Inquadratura: riempi il formato, oppure mostra la foto intera */
/**
 * Taglia: lo zoom diventa un ritaglio vero. Il gemello di «Ricomponi» — quello
 * butta via lo zoom e tiene il ritaglio, questo tiene lo zoom e riscrive il
 * ritaglio.
 */
export function CropTool({ onClick }: { onClick: () => void }) {
  return (
    <ToolChip
      label="Taglia"
      shortcut="Invio"
      title="Il ritaglio diventa quello che vedi nel riquadro: lo zoom si trasforma in un taglio vero"
      onClick={onClick}
      icon={
        <svg {...iconProps}>
          <path d="M7 2v15h15" />
          <path d="M2 7h15v15" />
        </svg>
      }
      art={
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          {/* la foto sotto, e le due squadre che si chiudono su di lei */}
          <rect x="7" y="9" width="18" height="14" rx="1" fill="rgba(255,255,255,0.12)" />
          <g
            stroke={LINE}
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-300 group-hover:translate-x-[2px] group-hover:translate-y-[2px]"
          >
            <path d="M10 3v19h19" />
          </g>
          <g
            stroke={LINE}
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-300 group-hover:-translate-x-[2px] group-hover:-translate-y-[2px]"
          >
            <path d="M3 10h19v19" />
          </g>
        </svg>
      }
    />
  )
}

/**
 * Ricompone: il ritaglio resta quello, torna solo a combaciare col riquadro.
 * È l'antidoto alla rotella — si zooma per controllare un dettaglio e con un
 * clic si rivede l'inquadratura intera.
 */
export function ReframeTool({ onClick }: { onClick: () => void }) {
  return (
    <ToolChip
      label="Ricomponi"
      shortcut="R"
      title="Rimette il ritaglio dentro il riquadro, senza cambiarlo: annulla lo zoom della rotella"
      onClick={onClick}
      icon={
        <svg {...iconProps}>
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <path d="M9 9.5 6.5 12l2.5 2.5M15 9.5l2.5 2.5-2.5 2.5" />
        </svg>
      }
      art={
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect
            x="4"
            y="7"
            width="24"
            height="18"
            rx="2"
            stroke={LINE}
            strokeWidth="1.7"
            fill="rgba(255,255,255,0.06)"
          />
          {/* la foto rientra nel riquadro: al passaggio si riallinea */}
          <rect
            x="9"
            y="11"
            width="14"
            height="10"
            rx="1"
            stroke={LINE}
            strokeWidth="1.5"
            fill="rgba(255,255,255,0.16)"
            className="transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0"
            style={{ transformOrigin: '16px 16px', transform: 'translate(2.5px, 1.5px)' }}
          />
          <g stroke={LINE} strokeWidth="1.4" strokeLinecap="round" opacity="0.9">
            <path d="M12 16h-3.2M8.8 16l1.6-1.6M8.8 16l1.6 1.6" />
            <path d="M20 16h3.2M23.2 16l-1.6-1.6M23.2 16l-1.6 1.6" />
          </g>
        </svg>
      }
    />
  )
}

export function FrameTool({ mode, onClick }: { mode: 'fill' | 'fit'; onClick: () => void }) {
  const fill = mode === 'fill'
  return (
    <ToolChip
      label={fill ? 'Riempi' : 'Intera'}
      title={fill ? 'Ritaglia al formato riempiendo il frame' : 'Mostra la foto intera nel frame'}
      onClick={onClick}
      icon={
        <svg {...iconProps}>
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          {fill ? (
            <path d="M8 10 5.5 7.5M16 10l2.5-2.5M8 14l-2.5 2.5M16 14l2.5 2.5" />
          ) : (
            <path d="M5.5 7.5 8 10M18.5 7.5 16 10M5.5 16.5 8 14M18.5 16.5 16 14" />
          )}
        </svg>
      }
      art={
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect
            x="4"
            y="7"
            width="24"
            height="18"
            rx="2"
            stroke={LINE}
            strokeWidth="1.7"
            fill="rgba(255,255,255,0.06)"
          />
          {/* la foto dentro il frame: si gonfia fino a riempire, o rientra */}
          <rect
            x={fill ? 9 : 7}
            y={fill ? 11 : 10}
            width={fill ? 14 : 18}
            height={fill ? 10 : 12}
            rx="1"
            stroke={LINE}
            strokeWidth="1.4"
            fill="rgba(255,255,255,0.14)"
            className={
              fill
                ? 'transition-transform duration-300 group-hover:scale-[1.28]'
                : 'transition-transform duration-300 group-hover:scale-[0.78]'
            }
            style={{ transformOrigin: '16px 16px' }}
          />
          <g stroke={LINE} strokeWidth="1.3" strokeLinecap="round" opacity="0.85">
            {fill ? (
              <path d="M13 14 9.5 10.5M19 14l3.5-3.5M13 18l-3.5 3.5M19 18l3.5 3.5" />
            ) : (
              <path d="M9.5 10.5 13 14M22.5 10.5 19 14M9.5 21.5 13 18M22.5 21.5 19 18" />
            )}
          </g>
        </svg>
      }
    />
  )
}
