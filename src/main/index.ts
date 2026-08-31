import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.avif'])

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate)
    return true
  } catch {
    return false
  }
}

/**
 * Data di scatto dal blocco EXIF di un JPEG (tag DateTimeOriginal), letta a mano
 * per non aggiungere dipendenze. Serve a raggruppare le foto in raffiche e
 * capitoli: se manca (PNG, EXIF assente, file strano) si torna al mtime.
 */
async function readExifTakenAt(filePath: string): Promise<number | null> {
  let handle: import('node:fs/promises').FileHandle | null = null
  try {
    handle = await fs.open(filePath, 'r')
    const head = Buffer.alloc(131072)
    const { bytesRead } = await handle.read(head, 0, head.length, 0)
    const buffer = head.subarray(0, bytesRead)
    if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return null

    // scorre i segmenti JPEG fino ad APP1/Exif
    let offset = 2
    let tiff = -1
    while (offset + 4 <= buffer.length) {
      if (buffer[offset] !== 0xff) break
      // byte di riempimento: un marker può essere preceduto da 0xFF ripetuti
      while (offset + 2 <= buffer.length && buffer[offset + 1] === 0xff) offset += 1
      if (offset + 4 > buffer.length) break
      const marker = buffer.readUInt16BE(offset)
      if (marker === 0xffda) break // inizio dei dati immagine: oltre non serve
      // marker senza lunghezza (restart, TEM): due byte e via
      if ((marker >= 0xffd0 && marker <= 0xffd9) || marker === 0xff01) {
        offset += 2
        continue
      }
      const size = buffer.readUInt16BE(offset + 2)
      if (size < 2) break // segmento malformato: meglio il fallback su mtime
      if (marker === 0xffe1 && buffer.toString('ascii', offset + 4, offset + 10) === 'Exif\0\0') {
        tiff = offset + 10
        break
      }
      offset += 2 + size
    }
    if (tiff < 0 || tiff + 8 > buffer.length) return null

    const littleEndian = buffer.toString('ascii', tiff, tiff + 2) === 'II'
    const u16 = (at: number): number =>
      littleEndian ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at)
    const u32 = (at: number): number =>
      littleEndian ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at)

    // cerca un tag dentro una IFD; restituisce l'offset del valore
    const findTag = (ifd: number, tag: number): number | null => {
      if (ifd + 2 > buffer.length) return null
      const count = u16(ifd)
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12
        if (entry + 12 > buffer.length) return null
        if (u16(entry) === tag) return entry
      }
      return null
    }

    const ifd0 = tiff + u32(tiff + 4)
    const exifPointer = findTag(ifd0, 0x8769)
    const dateEntry = exifPointer
      ? findTag(tiff + u32(exifPointer + 8), 0x9003)
      : findTag(ifd0, 0x0132) // ultima spiaggia: DateTime della IFD0
    if (!dateEntry) return null

    // il valore è ASCII (type 2) di ~20 byte: se il tag dichiara altro, o il
    // puntatore esce dal buffer, meglio nessuna data che una data spazzatura
    const valueType = u16(dateEntry + 2)
    const valueCount = u32(dateEntry + 4)
    if (valueType !== 2 || valueCount < 11 || valueCount > 64) return null
    const valueAt = valueCount <= 4 ? dateEntry + 8 : tiff + u32(dateEntry + 8)
    if (valueAt < 0 || valueAt + 19 > buffer.length) return null
    const raw = buffer.toString('ascii', valueAt, valueAt + 19)
    // formato EXIF: "2026:08:27 14:03:11" (orario locale della macchina)
    const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw)
    if (!match) return null
    const [, year, month, day, hour, minute, second] = match.map(Number)
    const time = new Date(year, month - 1, day, hour, minute, second).getTime()
    return Number.isFinite(time) ? time : null
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('pick-folder', async (_event, title: string) => {
    const result = await dialog.showOpenDialog({
      title,
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('list-images', async (_event, dir: string, recursive = false) => {
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive })
    const images = entries
      .filter(
        (entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      )
      .map((entry) => {
        const full = path.join(entry.parentPath ?? dir, entry.name)
        // in modalità ricorsiva il nome è il percorso relativo: resta unico
        // anche quando due sottocartelle hanno file con lo stesso nome
        const name = recursive ? path.relative(dir, full).split(path.sep).join('/') : entry.name
        return { name, path: full }
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

    // ogni foto porta con sé il momento dello scatto: raffiche e capitoli
    // si costruiscono su questo (EXIF quando c'è, altrimenti mtime)
    return Promise.all(
      images.map(async (image) => {
        let takenAt = 0
        try {
          const extension = path.extname(image.name).toLowerCase()
          if (extension === '.jpg' || extension === '.jpeg') {
            takenAt = (await readExifTakenAt(image.path)) ?? 0
          }
          if (!takenAt) takenAt = (await fs.stat(image.path)).mtimeMs
        } catch {
          takenAt = 0
        }
        return { ...image, takenAt }
      })
    )
  })

  ipcMain.handle('read-image', async (_event, filePath: string) => {
    return fs.readFile(filePath)
  })

  ipcMain.handle(
    'save-image',
    async (_event, destDir: string, subDir: string, fileName: string, data: Uint8Array) => {
      // ogni bolla salva in una sottocartella; mai sovrascrivere: suffisso numerico
      const dir = path.join(destDir, sanitizeSubDir(subDir))
      // il nome arriva dal renderer: mai fidarsi — solo il basename, e la
      // scrittura resta comunque confinata nella destinazione
      const safeName = path.basename(fileName)
      if (!isInside(destDir, path.join(dir, safeName))) throw new Error('Percorso non valido')
      await fs.mkdir(dir, { recursive: true })
      const extension = path.extname(safeName)
      const base = path.basename(safeName, extension)
      let candidate = path.join(dir, safeName)
      let counter = 1
      while (await fileExists(candidate)) {
        candidate = path.join(dir, `${base} (${counter})${extension}`)
        counter += 1
      }
      await fs.writeFile(candidate, data)
      return path.basename(candidate)
    }
  )

  ipcMain.handle(
    'delete-file',
    async (_event, destDir: string, subDir: string, fileName: string) => {
      // usato dall'annulla: può toccare solo file dentro la destinazione
      const target = path.join(destDir, sanitizeSubDir(subDir), path.basename(fileName))
      if (!isInside(destDir, target)) return
      try {
        await fs.unlink(target)
      } catch {
        // già assente: va bene così
      }
    }
  )

  // apre la cartella dell'album nel gestore file del sistema
  ipcMain.handle('open-folder', async (_event, dir: string) => {
    try {
      const stats = await fs.stat(dir)
      if (!stats.isDirectory()) return false
      const failure = await shell.openPath(dir)
      return failure === ''
    } catch {
      return false
    }
  })

  ipcMain.handle('load-session', async (_event, destDir: string) => {
    try {
      const raw = await fs.readFile(path.join(destDir, SESSION_FILE), 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('save-session', async (_event, destDir: string, json: string) => {
    await fs.writeFile(path.join(destDir, SESSION_FILE), json, 'utf8')
  })

  ipcMain.handle('list-album', async (_event, destDir: string, subDir: string) => {
    const dir = path.join(destDir, sanitizeSubDir(subDir))
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      return entries
        .filter(
          (entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        )
        .map((entry) => ({ name: entry.name, path: path.join(dir, entry.name) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    } catch {
      return []
    }
  })

  // --- LUT .cube: import, elenco, lettura, rimozione, esportazione ---

  ipcMain.handle('is-directory', async (_event, candidate: string) => {
    try {
      return (await fs.stat(candidate)).isDirectory()
    } catch {
      return false
    }
  })

  ipcMain.handle('pick-luts', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Scegli i file LUT (.cube) da importare',
      filters: [{ name: 'LUT', extensions: ['cube'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return []
    const dir = lutDir()
    await fs.mkdir(dir, { recursive: true })
    const imported: string[] = []
    for (const source of result.filePaths) {
      const name = path.basename(source)
      try {
        await fs.copyFile(source, path.join(dir, name))
        imported.push(name)
      } catch {
        // file illeggibile: si salta, gli altri proseguono
      }
    }
    return imported
  })

  ipcMain.handle('list-luts', async () => {
    try {
      const entries = await fs.readdir(lutDir(), { withFileTypes: true })
      return entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.cube'))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    } catch {
      return []
    }
  })

  ipcMain.handle('read-lut', async (_event, name: string) => {
    try {
      return await fs.readFile(path.join(lutDir(), path.basename(name)), 'utf8')
    } catch {
      return null
    }
  })

  ipcMain.handle('remove-lut', async (_event, name: string) => {
    try {
      await fs.unlink(path.join(lutDir(), path.basename(name)))
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('export-lut', async (_event, suggested: string, text: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Esporta il look come LUT',
      defaultPath: suggested,
      filters: [{ name: 'LUT', extensions: ['cube'] }]
    })
    if (result.canceled || !result.filePath) return null
    await fs.writeFile(result.filePath, text, 'utf8')
    return result.filePath
  })

  ipcMain.handle(
    'rename-file',
    async (_event, destDir: string, subDir: string, oldName: string, newName: string) => {
      const dir = path.join(destDir, sanitizeSubDir(subDir))
      const from = path.join(dir, path.basename(oldName))
      const to = path.join(dir, path.basename(newName))
      if (!isInside(destDir, from) || !isInside(destDir, to)) return false
      if (await fileExists(to)) return false
      try {
        await fs.rename(from, to)
        return true
      } catch {
        return false
      }
    }
  )
}

const SESSION_FILE = 'picpick-session.json'

/** vero se target sta DENTRO root: confronto col separatore, non col prefisso */
function isInside(root: string, target: string): boolean {
  const base = path.resolve(root)
  const resolved = path.resolve(target)
  return resolved === base || resolved.startsWith(base + path.sep)
}

/** cartella dei LUT importati: stanno nei dati dell'app, non nel progetto */
function lutDir(): string {
  return path.join(app.getPath('userData'), 'luts')
}

function sanitizeSubDir(name: string): string {
  // ogni segmento viene ripulito da solo: «Bolla/social» resta una
  // sottocartella dentro la bolla, mai un modo per uscire dalla destinazione
  const parts = name
    .split(/[\/]/)
    .map((part) => part.replace(/[^\p{L}\p{N} _-]/gu, '').trim())
    .filter(Boolean)
  return parts.length > 0 ? parts.join(path.sep) : 'Bolla'
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'pic&pick',
    backgroundColor: '#0c0a09',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    window.loadURL(devServerUrl)
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
