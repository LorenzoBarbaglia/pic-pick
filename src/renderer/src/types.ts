import type { Develop, LookDose } from './lib/develop'
import type { CaptionFontId, CropShape, DateStampId } from './lib/print'

export type { Develop, LookDose }

export interface AlbumFormat {
  id: string
  label: string
  /** larghezza / altezza */
  ratio: number
}

export interface Background {
  id: string
  label: string
  /** null = sfondo trasparente (export in PNG) */
  color: string | null
}

/** come la foto si presenta appena aperta */
export type EntryMode = 'fill' | 'fit'

export interface SortBubble {
  id: string
  label: string
  /** colore "r, g, b" */
  tint: string
}

export interface SessionConfig {
  sourceDir: string
  destDir: string
  format: AlbumFormat
  background: Background
  /** bolle di smistamento: ognuna salva in una sottocartella col suo nome */
  bubbles: SortBubble[]
  /** prefisso progressivo 001_, 002_… nell'ordine di scelta */
  numberCopies: boolean
  /** lato lungo dell'export in px */
  outputLongEdge: number
  /** sviluppo di partenza di ogni foto (poi si aggiusta a mano) */
  develop: Develop
  /** miscela di look da cui parte lo sviluppo (si sommano con un peso) */
  lookDoses: LookDose[]
  /** la foto arriva pre-tagliata al formato o intera dentro il frame */
  entryMode: EntryMode
  /** le maniglie del ritaglio mantengono le proporzioni dell'album */
  lockAspect: boolean
  /** i verticali usano il formato album ruotato, invece di essere tagliati */
  autoOrient: boolean
  /** ordina la coda per data e la divide in capitoli mensili */
  chapters: boolean
  /** passe-partout attorno alla foto: frazione del lato corto (0 = nessuno) */
  matPercent: number
  /** colore della cornice; null = lo stesso dello sfondo */
  matColor: string | null
  /** sagoma di ritaglio della stampa (oblò, arco, ovale…) */
  cropShape: CropShape
  /** font della didascalia sulla cornice */
  captionFont: CaptionFontId
  /** timbro della data di scatto */
  dateStamp: DateStampId
  /** qualità JPEG dell'export (0-1) */
  outputQuality: number
  /** salva anche una copia piccola (lato lungo 1080) in una sottocartella */
  exportSmall: boolean
  /** legge anche le sottocartelle della sorgente */
  recursive: boolean
}

export interface Decision {
  fileName: string
  filePath: string
  /** momento dello scatto, per rimettere la foto in coda al ripescaggio */
  takenAt: number
  /** id della bolla oppure 'skip' */
  bubbleId: string
  savedSubDir: string | null
  savedName: string | null
  /** l'eventuale copia piccola per i social, da cancellare insieme */
  savedSmallName?: string | null
  /** dataURL in miniatura per il riepilogo */
  thumbnail: string
}

/** contenuto di picpick-session.json nella cartella di destinazione */
export interface SessionFileData {
  version: 1
  sourceDir: string
  formatId: string
  backgroundId: string
  bubbles: SortBubble[]
  numberCopies: boolean
  outputLongEdge: number
  /** vecchie sessioni: tono dell'album, oggi tradotto in un look di sviluppo */
  toneId?: string
  /** aggiunti dopo: le sessioni vecchie non li hanno */
  chapters?: boolean
  presetId?: string
  lookId?: string
  lookDoses?: LookDose[]
  develop?: Develop
  entryMode?: EntryMode
  lockAspect?: boolean
  autoOrient?: boolean
  matPercent?: number
  matColor?: string | null
  cropShape?: CropShape
  captionFont?: CaptionFontId
  dateStamp?: DateStampId
  outputQuality?: number
  exportSmall?: boolean
  recursive?: boolean
  /**
   * Lo sviluppo ritoccato foto per foto. Prima viveva solo in memoria: bastava
   * tornare al setup per cambiare una impostazione e tutte le regolazioni fatte
   * a mano svanivano in silenzio.
   */
  devByFile?: Record<string, { develop: Develop; doses: LookDose[] }>
  /** le didascalie scritte sulla cornice, foto per foto */
  captions?: Record<string, string>
  decided: Record<string, string>
}

export interface ImageFile {
  name: string
  path: string
  /** momento dello scatto in ms (EXIF, o mtime del file); 0 = sconosciuto */
  takenAt: number
}

export interface CropRect {
  /** coordinate in pixel immagine, asse allineato all'immagine */
  x: number
  y: number
  w: number
  h: number
}
