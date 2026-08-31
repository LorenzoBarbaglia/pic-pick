/**
 * Un unico posto per le interazioni: l'ordine dei livelli e il registro delle
 * scorciatoie. Prima erano numeri di z-index sparsi tra i componenti e un
 * elenco di tasti scritto due volte (nel gestore e nel piè di pagina): bastava
 * aggiungere un pannello per coprire un comando o dimenticare un tasto nella
 * legenda.
 */

/** ordine di sovrapposizione: chi sta sopra chi, deciso una volta sola */
export const LAYER = {
  /** mare di punti sullo sfondo dello stage */
  sea: 0,
  /** frame dell'album con lo sfondo scelto */
  frame: 1,
  /** foto (fantasma + ritaglio) e strati di sviluppo */
  photo: 2,
  /** velo fuori dal frame, bordo, puntino del centro */
  veil: 3,
  /** maniglie di ritaglio e rotazione */
  handles: 4,
  /** lampo di conferma della bolla scelta */
  flash: 6,
  /** bolle che fluttuano */
  bubbles: 30,
  /** comandi dello stage: sopra le bolle (i pannelli a lato possono coprirli) */
  tools: 40,
  /** lente a pixel reali, agganciata al cursore */
  loupe: 50,
  /** pannelli laterali (sviluppo) */
  panel: 60,
  /** finestre a tutto stage (dettagli, raffica, confronto) */
  overlay: 70,
  /** messaggi volanti (salvataggio, errori, capitolo) */
  toast: 80,
  /** etichette immediate dei comandi: sopra tutto, sono effimere */
  tooltip: 90
} as const

export interface Shortcut {
  id: string
  /** tasti che la attivano (case-insensitive per le lettere) */
  keys: string[]
  /** come si chiama nella legenda */
  label: string
  /** vale anche nel riepilogo, quando non c'è una foto sotto le mani */
  always?: boolean
  /** si tiene premuto invece di premere una volta */
  held?: boolean
  /** fa parte del gesto quotidiano: compare nella legenda breve */
  core?: boolean
}

/**
 * Registro unico delle scorciatoie: da qui nascono sia il gestore dei tasti sia
 * la legenda del piè di pagina, così non possono più andare in disaccordo.
 */
export const SHORTCUTS: Shortcut[] = [
  { id: 'sort', keys: ['1', '2', '3', '4'], label: '1-4 bolle', core: true },
  // Le frecce SCORRONO. Prima decidevano (← scarta, → approva: la metafora
  // dello swipe), ma l'istinto universale delle frecce è «mi sposto», e
  // sbagliare voleva dire smistare una foto senza volerlo. L'approvazione con
  // un tasto solo resta, ed è passata alla barra spaziatrice: la stessa che
  // usano gli altri strumenti di selezione.
  { id: 'browse', keys: ['ArrowLeft', 'ArrowRight'], label: '← → scorri', core: true },
  { id: 'sortFirst', keys: [' '], label: 'Spazio approva', core: true },
  { id: 'later', keys: ['f'], label: 'F forse', core: true },
  { id: 'skip', keys: ['x'], label: 'X scarta', core: true },
  { id: 'compare', keys: ['c'], label: 'C confronta', held: true },
  { id: 'original', keys: ['a'], label: 'A originale', held: true },
  { id: 'loupe', keys: ['z'], label: 'Z lente 100%', held: true },
  { id: 'closeUps', keys: ['v'], label: 'V fuoco' },
  { id: 'develop', keys: ['d'], label: 'D sviluppo' },
  { id: 'burst', keys: ['s'], label: 'S raffica' },
  { id: 'strip', keys: ['t'], label: 'T striscia' },
  { id: 'lock', keys: ['l'], label: 'L proporzioni' },
  { id: 'cropZoom', keys: ['Enter'], label: 'Invio taglia allo zoom' },
  { id: 'reframe', keys: ['r'], label: 'R ricomponi' },
  { id: 'preset', keys: ['p'], label: 'P mondo', always: true },
  { id: 'uiMode', keys: ['m'], label: 'M modalità', always: true },
  { id: 'undo', keys: ['ctrl+z'], label: 'Ctrl+Z annulla', always: true, core: true },
  // solo legenda: questi gesti vivono sul mouse, non su un tasto
  { id: 'extraCopy', keys: [], label: 'Shift+bolla copia senza decidere' },
  { id: 'freeRotate', keys: [], label: 'Alt+trascina la ghiera: rotazione libera' }
]

/** legenda per il piè di pagina, generata dal registro; breve = solo il core */
export function shortcutLegend(coreOnly = false): string {
  return SHORTCUTS.filter((s) => !coreOnly || s.core)
    .map((s) => s.label)
    .join(' · ')
}

/** id della scorciatoia corrispondente a un evento tastiera, se c'è */
export function matchShortcut(event: KeyboardEvent): Shortcut | null {
  const key = event.key
  const lower = key.length === 1 ? key.toLowerCase() : key
  if (event.ctrlKey || event.metaKey) {
    return SHORTCUTS.find((s) => s.keys.includes(`ctrl+${lower}`)) ?? null
  }
  if (event.altKey) return null
  return SHORTCUTS.find((s) => s.keys.includes(lower)) ?? null
}
