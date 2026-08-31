import { LINE } from '../lib/palette'
/**
 * I quattro comandi «di scena», uno per mondo.
 *
 * Regola di disegno, imparata a nostre spese: la **silhouette** dice cosa fa il
 * comando, la **materia** dentro dice in che mondo siamo. Prima ogni mondo aveva
 * un oggetto-personaggio (un masso, un omino che fa la capriola, una
 * ghigliottina): belli, memorabili, ma illeggibili a colpo d'occhio — e la
 * ghigliottina diceva perfino la cosa sbagliata, «distruggi» al posto di
 * «approva e chiudi».
 *
 * Quindi ora: occhio per l'anteprima, freccia circolare per il ripristino,
 * freccia indietro per l'annulla, timbro che imprime una spunta per la chiusura.
 * Il carattere resta nel gesto (il colpo, lo scatto, il timbro che scende) e nei
 * dettagli interni, che cambiano col mondo.
 */


interface PreviewProps {
  /** aperto = si vede l'interfaccia */
  open: boolean
  speed: number
}

interface ResetProps {
  /** colpi già ricevuti (0-2) */
  hits: number
  broken: boolean
  speed: number
}

interface UndoProps {
  /** vero durante l'animazione del ritorno */
  active: boolean
}

interface FinishProps {
  done: boolean
  speed: number
}

type World = 'mare' | 'notte' | 'brace' | 'camera'

function worldOf(presetId: string): World {
  if (presetId === 'notte' || presetId === 'brace' || presetId === 'camera') return presetId
  return 'mare'
}

// =====================================================================
// ANTEPRIMA — un occhio (convenzione universale), con l'iride del mondo
// =====================================================================

const LID_OPEN = 'M2.5 17 C8.5 5.5 25.5 5.5 31.5 17 C25.5 28.5 8.5 28.5 2.5 17 Z'
const LID_CLOSED = 'M2.5 17 C8.5 15.3 25.5 15.3 31.5 17 C25.5 18.7 8.5 18.7 2.5 17 Z'

/** il cuore dell'iride: qui vive il mondo */
function IrisCore({ world }: { world: World }) {
  switch (world) {
    case 'notte':
      // luna crescente dentro la pupilla
      return (
        <>
          <circle cx="17" cy="17" r="4" fill="rgba(255,250,225,0.95)" />
          <circle cx="19.4" cy="15.8" r="3.2" fill="#0b1020" />
        </>
      )
    case 'brace':
      // fiammella
      return (
        <path
          d="M17 12.6 C19.4 15 20.2 16.3 20.2 17.5 C20.2 19.3 18.8 20.6 17 20.6 C15.2 20.6 13.8 19.3 13.8 17.5 C13.8 16.3 14.6 15 17 12.6 Z"
          fill="rgb(255, 186, 90)"
        />
      )
    case 'camera':
      // pupilla rossa da luce di sicurezza
      return (
        <>
          <circle cx="17" cy="17" r="4.1" fill="rgb(220, 60, 60)" />
          <circle cx="17" cy="17" r="1.8" fill="#160607" />
        </>
      )
    default:
      return (
        <>
          <circle cx="17" cy="17" r="3.4" fill="#0c0a09" />
          <circle cx="15.2" cy="15.2" r="1.15" fill={LINE} />
        </>
      )
  }
}

export function PreviewArt({
  presetId,
  open,
  speed,
  look
}: PreviewProps & { presetId: string; look: { x: number; y: number } }) {
  const world = worldOf(presetId)
  const lidD = open ? LID_OPEN : LID_CLOSED
  const transition = `d ${((open ? 0.24 : 0.11) / speed).toFixed(3)}s cubic-bezier(0.4, 0, 0.2, 1)`
  return (
    <>
      <defs>
        <clipPath id="picpick-aperture">
          <path d={lidD} style={{ transition }} />
        </clipPath>
      </defs>
      <g clipPath="url(#picpick-aperture)">
        <rect x="0" y="0" width="34" height="34" fill="rgba(255,255,255,0.14)" />
        <g
          style={{
            transform: `translate(${look.x.toFixed(2)}px, ${look.y.toFixed(2)}px)`,
            transition: 'transform 120ms ease-out'
          }}
        >
          <circle cx="17" cy="17" r="7.4" fill="rgba(255,255,255,0.10)" stroke={LINE} strokeWidth="1.5" />
          <IrisCore world={world} />
        </g>
        {/* ombra della palpebra: dà volume all'occhio */}
        <path d="M2.5 17 C8.5 5.5 25.5 5.5 31.5 17 C25.5 10 8.5 10 2.5 17 Z" fill="rgba(0,0,0,0.3)" />
      </g>
      <path d={lidD} fill="none" stroke={LINE} strokeWidth="2.1" strokeLinecap="round" style={{ transition }} />
      {/* barra sull'occhio chiuso: si capisce che l'interfaccia è nascosta */}
      <path
        d="M6 26 L28 8"
        stroke={LINE}
        strokeWidth="2"
        strokeLinecap="round"
        style={{
          opacity: open ? 0 : 0.85,
          transition: `opacity ${(0.2 / speed).toFixed(2)}s ease`
        }}
      />
    </>
  )
}

// =====================================================================
// RIPRISTINO — freccia circolare che si carica a ogni colpo
// =====================================================================

/** materia del mondo dentro il cerchio */
function ResetCore({ world, hits, broken }: { world: World; hits: number; broken: boolean }) {
  const alive = !broken
  switch (world) {
    case 'notte':
      // granelli di sabbia che scendono
      return (
        <g fill={LINE} opacity={alive ? 0.85 : 0.3}>
          <circle cx="17" cy={13 + hits} r="1.3" />
          <circle cx="14.6" cy={17 + hits} r="1.1" />
          <circle cx="19.4" cy={18 + hits} r="1" />
        </g>
      )
    case 'brace':
      return (
        <path
          d="M17 12.5 C19.3 14.8 20 16 20 17.2 C20 18.9 18.7 20.2 17 20.2 C15.3 20.2 14 18.9 14 17.2 C14 16 14.7 14.8 17 12.5 Z"
          fill={broken ? 'rgba(120,60,20,0.5)' : 'rgb(255, 178, 80)'}
          style={{ transition: 'fill 0.4s ease' }}
        />
      )
    case 'camera':
      // provino che torna bianco quando cede
      return (
        <rect
          x="12.5"
          y="13.5"
          width="9"
          height="7"
          rx="0.8"
          fill={broken ? 'rgba(250,250,249,0.9)' : 'rgba(0,0,0,0.45)'}
          stroke={LINE}
          strokeWidth="1.1"
          style={{ transition: 'fill 0.45s ease' }}
        />
      )
    default:
      // un'onda che si appiattisce
      return (
        <path
          d={broken ? 'M11 17 H23' : 'M11 18.5 Q14 15 17 18.5 Q20 22 23 18.5'}
          fill="none"
          stroke={LINE}
          strokeWidth="1.6"
          strokeLinecap="round"
          style={{ transition: 'd 0.35s ease' }}
        />
      )
  }
}

export function ResetArt({ presetId, hits, broken, speed }: ResetProps & { presetId: string }) {
  const world = worldOf(presetId)
  // tre archi: uno per colpo. Il progresso si vede, non si indovina.
  const segments = [0, 1, 2]
  return (
    <g
      style={{
        transformOrigin: '17px 17px',
        transform: broken ? 'rotate(-360deg)' : 'rotate(0deg)',
        transition: `transform ${(0.6 / speed).toFixed(2)}s cubic-bezier(0.45, 0, 0.25, 1)`
      }}
    >
      {/* anello di fondo */}
      <circle cx="17" cy="17" r="12.5" fill="none" stroke={LINE} strokeWidth="2" opacity="0.22" />
      {/* i tre archi che si accendono */}
      {segments.map((index) => {
        const from = -70 + index * 100
        const to = from + 86
        const rad = (deg: number): number => (deg * Math.PI) / 180
        const x1 = 17 + Math.cos(rad(from)) * 12.5
        const y1 = 17 + Math.sin(rad(from)) * 12.5
        const x2 = 17 + Math.cos(rad(to)) * 12.5
        const y2 = 17 + Math.sin(rad(to)) * 12.5
        const on = broken || hits > index
        return (
          <path
            key={index}
            d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A 12.5 12.5 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
            fill="none"
            stroke={LINE}
            strokeWidth="2.4"
            strokeLinecap="round"
            opacity={on ? 1 : 0.12}
            style={{ transition: 'opacity 0.25s ease' }}
          />
        )
      })}
      {/* punta della freccia: dice «ripristina» a colpo d'occhio */}
      <path
        d="M13.6 5.1 L21.2 4.4 L17.4 10.9 Z"
        fill={LINE}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      />
      <ResetCore world={world} hits={hits} broken={broken} />
    </g>
  )
}

// =====================================================================
// ANNULLA — freccia curva indietro, con la coda del mondo
// =====================================================================

function UndoTail({ world, active }: { world: World; active: boolean }) {
  const opacity = active ? 0.9 : 0.45
  switch (world) {
    case 'notte':
      // scia di stelline
      return (
        <g fill={LINE} opacity={opacity}>
          <circle cx="27" cy="10" r="1.2" />
          <circle cx="30" cy="13" r="0.9" />
          <circle cx="28.5" cy="17" r="0.7" />
        </g>
      )
    case 'brace':
      return (
        <g fill="rgb(255, 190, 100)" opacity={opacity}>
          <circle cx="27.5" cy="11" r="1.3" />
          <circle cx="30" cy="14.5" r="1" />
        </g>
      )
    case 'camera':
      // perforazioni della pellicola
      return (
        <g fill={LINE} opacity={opacity}>
          <rect x="26" y="9.5" width="2.4" height="1.8" rx="0.4" />
          <rect x="28.4" y="13" width="2.4" height="1.8" rx="0.4" />
          <rect x="27.4" y="16.6" width="2.4" height="1.8" rx="0.4" />
        </g>
      )
    default:
      // una piccola onda che rientra
      return (
        <path
          d="M26 11 Q28.5 8.5 31 11"
          fill="none"
          stroke={LINE}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity={opacity}
        />
      )
  }
}

export function UndoArt({ presetId, active }: UndoProps & { presetId: string }) {
  const world = worldOf(presetId)
  return (
    <>
      <g
        style={{
          transform: active ? 'translateX(-2.5px)' : 'translateX(0)',
          transition: 'transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}
      >
        {/* freccia curva verso sinistra: la convenzione dell'annulla */}
        <path
          d="M11 21 L5 15 L11 9"
          fill="none"
          stroke={LINE}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 15 H19 A8 8 0 0 1 19 31 H13"
          fill="none"
          stroke={LINE}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </g>
      <UndoTail world={world} active={active} />
    </>
  )
}

// =====================================================================
// CHIUSURA — un timbro che imprime la spunta sull'album
//   («approvo e chiudo», non «taglio»: la ghigliottina diceva il contrario)
// =====================================================================

/** impugnatura del timbro: cambia col mondo */
function StampGrip({ world }: { world: World }) {
  switch (world) {
    case 'notte':
      return <path d="M17 2.5 L18.7 6 L22.4 6.4 L19.6 8.9 L20.4 12.5 L17 10.7 L13.6 12.5 L14.4 8.9 L11.6 6.4 L15.3 6 Z" fill="rgba(255,250,225,0.9)" stroke={LINE} strokeWidth="1.2" />
    case 'brace':
      return (
        <path
          d="M17 2.5 C20 6 21 8 21 9.8 C21 12.2 19.2 13.8 17 13.8 C14.8 13.8 13 12.2 13 9.8 C13 8 14 6 17 2.5 Z"
          fill="rgba(255,170,60,0.7)"
          stroke={LINE}
          strokeWidth="1.3"
        />
      )
    case 'camera':
      // pinza da camera oscura
      return (
        <g stroke={LINE} strokeWidth="1.6" strokeLinecap="round" fill="none">
          <path d="M13.5 3 L17 10 L20.5 3" />
          <path d="M14.6 6 H19.4" />
        </g>
      )
    default:
      // conchiglia
      return (
        <g stroke={LINE} strokeWidth="1.4" fill="rgba(255,255,255,0.16)">
          <path d="M17 12 C11.5 12 9 8.5 9 6.2 C9 3.8 12.6 2.5 17 2.5 C21.4 2.5 25 3.8 25 6.2 C25 8.5 22.5 12 17 12 Z" />
          <path d="M13 11 L14.5 4 M17 11.7 V3 M21 11 L19.5 4" strokeWidth="0.9" fill="none" />
        </g>
      )
  }
}

export function FinishArt({ presetId, done, speed }: FinishProps & { presetId: string }) {
  const world = worldOf(presetId)
  return (
    <>
      {/* l'album: il foglio che viene approvato */}
      <rect
        x="6"
        y="17"
        width="22"
        height="14"
        rx="2"
        fill="rgba(255,255,255,0.12)"
        stroke={LINE}
        strokeWidth="2"
      />
      {/* la spunta impressa: appare quando il timbro scende */}
      <path
        d="M10.5 24.5 L15 28.5 L23.5 20.5"
        fill="none"
        stroke={LINE}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={done ? 0 : 1}
        style={{
          transition: `stroke-dashoffset ${(0.35 / speed).toFixed(2)}s ease-out ${(0.18 / speed).toFixed(2)}s`
        }}
      />
      {/* il timbro scende e imprime */}
      <g
        style={{
          transform: done ? 'translateY(9px)' : 'translateY(0)',
          transition: `transform ${(0.22 / speed).toFixed(2)}s cubic-bezier(0.65, 0, 1, 1)`
        }}
      >
        <StampGrip world={world} />
        <rect
          x="9.5"
          y="12.5"
          width="15"
          height="4.5"
          rx="1.2"
          fill="rgba(255,255,255,0.2)"
          stroke={LINE}
          strokeWidth="1.7"
        />
      </g>
    </>
  )
}

// =====================================================================
// le parole di ciascun mondo
// =====================================================================

export const WORLD_WORDS: Record<
  World,
  { previewOn: string; previewOff: string; reset: string; undo: string; finish: string }
> = {
  mare: {
    previewOn: 'Solo immagine',
    previewOff: 'Torna a modificare',
    reset: 'Ricomponi la foto',
    undo: 'Annulla',
    finish: "Approva l'album"
  },
  notte: {
    previewOn: 'Solo immagine',
    previewOff: 'Torna a modificare',
    reset: 'Ricomponi la foto',
    undo: 'Annulla',
    finish: "Approva l'album"
  },
  brace: {
    previewOn: 'Solo immagine',
    previewOff: 'Torna a modificare',
    reset: 'Ricomponi la foto',
    undo: 'Annulla',
    finish: "Approva l'album"
  },
  camera: {
    previewOn: 'Solo immagine',
    previewOff: 'Torna a modificare',
    reset: 'Ricomponi la foto',
    undo: 'Annulla',
    finish: "Approva l'album"
  }
}

/** il gesto raccontato con la materia del mondo: va nel suggerimento, non nell'etichetta */
export const WORLD_FLAVOUR: Record<World, { reset: string; finish: string }> = {
  mare: {
    reset: "tre colpi e l'onda si appiattisce",
    finish: 'il sigillo scende e timbra'
  },
  notte: {
    reset: 'tre colpi e la sabbia finisce',
    finish: 'la stella timbra e chiude'
  },
  brace: {
    reset: 'tre colpi e la brace si spegne',
    finish: 'il ferro rovente imprime'
  },
  camera: {
    reset: 'tre colpi e il provino torna bianco',
    finish: 'la pinza timbra la stampa'
  }
}

export function worldWords(presetId: string) {
  return WORLD_WORDS[worldOf(presetId)]
}

export function worldFlavour(presetId: string) {
  return WORLD_FLAVOUR[worldOf(presetId)]
}
