# Contribuire a pic&pick

Grazie per l'interesse. Questo file è corto di proposito: le regole che contano sono
poche.

## Partire

```bash
npm install
npm run dev
```

Se la finestra non si apre e nel terminale vedi un errore su `whenReady`, il tuo
ambiente definisce `ELECTRON_RUN_AS_NODE`: lancia `env -u ELECTRON_RUN_AS_NODE npm run dev`.

Prima di aprire una pull request:

```bash
npm run typecheck   # deve passare senza errori
npm run build       # deve completare
```

Gli stessi due controlli girano in automatico sulla PR.

## Cosa viene accolto volentieri

- Correzioni di bug, con la descrizione di **come riprodurli**
- Miglioramenti di prestazioni misurati (prima/dopo, non «sembra più veloce»)
- Rifiniture di gusto: un'icona più chiara, un testo più onesto, un gesto più naturale
- Supporto per formati di file in più (i RAW leggendo l'anteprima JPEG incorporata sono
  una strada già mappata)
- Traduzioni dell'interfaccia (oggi è solo in italiano)

## Cosa probabilmente non viene accolto

Non per antipatia, ma perché l'app ha una direzione precisa — la trovi nella sezione
*filosofia* del [README](README.md):

- Nuove opzioni che aggiungono un pannello di preferenze invece di una decisione
- Punteggi automatici che dicono quale foto è «bella» (il punteggio di fuoco misura un
  fatto tecnico: è diverso)
- Qualunque cosa che richieda un account, una nuvola o una connessione
- Dipendenze runtime nuove, se la stessa cosa si può fare con quello che c'è

Se hai un dubbio, apri prima una issue: si discute in due righe e si evita lavoro buttato.

## Come è scritto il codice

- **TypeScript** ovunque, `strict`. Niente `any` di comodo.
- **Nomi in italiano** nei testi rivolti all'utente, in inglese nei simboli del codice.
- **I commenti spiegano il perché**, non il cosa. Se un numero è stato scelto dopo una
  prova o una lettura, il commento dice quale: serve a chi verrà dopo.
- **Niente numeri sparsi.** Gli z-index stanno in `LAYER`, le scorciatoie in
  `SHORTCUTS` (`lib/interactions.ts`), i colori condivisi in `lib/palette.ts`, i temi in
  `lib/themes.ts`. Se ti serve un valore nuovo, aggiungilo al registro giusto.
- **La geometria dello stage ha una regola**: ciò che serve a comporre (griglia,
  rotelle) si ancora al ritaglio ma è trattenuto dal riquadro; le maniglie del ritaglio
  stanno sul ritaglio; la foto si muove con la foto.
- **Anteprima ed export non possono divergere.** Dove è possibile, la stessa funzione
  disegna entrambi (vedi `drawPrintOverlay` in `lib/print.ts`). Se aggiungi un elemento
  visibile che finisce nel file, fallo così.

## Verificare le cose difficili

Shader, geometria e matematica dell'export non si giudicano a occhio. Il modo usato in
questo progetto è uno script Electron che carica il dev server, importa i moduli veri ed
esegue asserzioni numeriche sui pixel — per esempio: «a regolazioni neutre lo sviluppo
deve essere l'identità esatta». Se tocchi quelle parti, un controllo del genere vale
più di dieci righe di descrizione.
