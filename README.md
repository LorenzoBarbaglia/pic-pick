<p align="center">
  <img src="build/icon.png" width="96" alt="">
</p>

<h1 align="center">pic&pick</h1>

<p align="center">
  Una foto alla volta. La guardi, la sistemi, la scegli con una bolla.<br>
  Smistatore ed editor di foto <strong>locale</strong> — nessun account, nessuna nuvola, gli originali mai toccati.
</p>

---

Serve a smaltire una cartella di scatti senza perderci la giornata. Ogni foto arriva
inquadrata nel formato dell'album; la componi con pan, zoom, ritaglio e raddrizzamento,
la sviluppi se ne ha bisogno, e la mandi in una **bolla**: ognuna salva una copia
elaborata nella sua sottocartella. «Non passa» non salva nulla. «Forse» la rimanda in
fondo alla coda.

Il file che esce è esattamente quello che vedevi: nessuna sorpresa fra anteprima e
salvataggio.

## Installazione

Scarica l'ultima versione dalla pagina [Releases](../../releases):

- **`pic-pick-x.y.z-setup.exe`** — installer, crea il collegamento sul desktop
- **`pic-pick-x.y.z-portable.exe`** — non installa niente, si avvia e basta

> **Windows dirà che l'app è sconosciuta.** È normale: l'eseguibile non è firmato con
> un certificato commerciale (costa centinaia di euro l'anno, e questo è un progetto
> personale). Clicca *Ulteriori informazioni → Esegui comunque*. Il codice è tutto qui:
> se non ti fidi, compilalo da te — sono tre comandi.

## Cosa sa fare

**Smistare.** Bolle configurabili (fino a quattro, più «Forse» e «Non passa»), coda
riprendibile, annulla, ripescaggio, striscia della coda con filtri, raggruppamento
automatico delle raffiche per orario e somiglianza.

**Comporre.** Ritaglio libero o vincolato al formato, guide magnetiche, griglia dei
terzi, raddrizzamento con scatto ai 90° o libero, lente 100%, controllo del fuoco su
tre punti a pixel reali.

**Sviluppare.** Motore su GPU con pipeline in luce lineare: esposizione, contrasto in
log attorno al grigio medio, alte luci e ombre, bilanciamento del bianco, vividezza,
tre fasce semantiche (incarnati, cieli, verdi), viraggio a tre vie, chiarezza,
nitidezza, grana, vignettatura. Look sommabili e dosabili, look personali, import di
LUT `.cube` (ed export dei propri look come LUT).

**Stampare.** Passe-partout con didascalia, stili da pellicola (telaietto diapositiva,
bordo negativo, fotogramma coi fori), timbro del laboratorio e datario anni '90 con la
data di scatto letta dall'EXIF.

**Automatico dove serve.** Esposizione di partenza dall'istogramma, contagocce del
bilanciamento del bianco, nitidezza dosata misurando quanto è nitido il ritaglio e
quanto verrà ingrandito nel file.

## La filosofia (leggila prima di proporre una feature)

Questo non è un editor generalista, ed è una scelta. Chi contribuisce dovrebbe
condividerla, altrimenti l'app diventa un pannello di preferenze.

1. **Il cuore è guardare una foto e scegliere.** Tutto ciò che allontana da quel gesto
   va nascosto o eliminato. Le funzioni potenti esistono, ma non stanno in vetrina.
2. **Emozionale prima che completo.** Il mare di punti, le bolle, i suoni musicali non
   sono decorazione: sono il motivo per cui si arriva in fondo a mille foto senza
   odiare il lavoro. La modalità «Lavoro» esiste per chi in quel momento non ne ha
   voglia, e ha le stesse funzioni.
3. **Onestà su ciò che si vede.** L'anteprima e il file devono coincidere. Se un
   algoritmo non può inventare dettaglio, non finge di farlo: lo dice.
4. **Gusto da fotografo, non da tendenza.** I riferimenti sono la pellicola, i
   laboratori, i manuali di stampa — non i preset del momento.
5. **Niente numeri sparsi.** Livelli, scorciatoie, colori e geometrie vivono in un
   registro unico (`lib/interactions.ts`, `lib/palette.ts`, `lib/themes.ts`).

## Compilare da sorgente

```bash
npm install
npm run dev        # app in sviluppo, con ricarica a caldo
npm run typecheck  # controllo dei tipi
npm run build      # build di produzione in out/
npm run build:win  # eseguibile Windows in dist/
```

Serve Node 22 o superiore.

> Se lanci `npm run dev` dal terminale interno di uno strumento basato su Electron
> (VS Code e simili), rimuovi prima `ELECTRON_RUN_AS_NODE`, altrimenti Electron parte
> come Node puro e la finestra non si apre:
> `env -u ELECTRON_RUN_AS_NODE npm run dev`

## Com'è fatto

```
src/main/       processo principale: file, cartelle, EXIF, LUT, sessioni
src/preload/    il ponte tipizzato verso la finestra (window.picpick)
src/renderer/
  components/   EditorStage (lo stage e i gesti), SessionScreen (il flusso),
                SetupScreen, i pannelli, le bolle, il mare di punti
  lib/          developGl (lo shader), develop (i parametri e i look),
                exportImage (il file finale), print (la lingua della stampa),
                autoTools, thumbs, scenes, sound, themes, interactions
```

Electron + electron-vite · React 19 + TypeScript · Tailwind CSS v4 · WebGL per lo
sviluppo immagine. Nessuna dipendenza runtime oltre a React.

## Contribuire

Le segnalazioni e le proposte sono benvenute: apri una
[issue](../../issues) o una pull request. Prima di scrivere codice, dai un occhio a
[CONTRIBUTING.md](CONTRIBUTING.md) — è corto.

## Licenza

[MIT](LICENSE) — fai quello che vuoi, anche forkare e portarlo dove ti pare.
