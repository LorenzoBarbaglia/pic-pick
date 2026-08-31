import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  pickFolder: (title: string): Promise<string | null> => ipcRenderer.invoke('pick-folder', title),
  // takenAt = data di scatto EXIF, con fallback sul mtime del file
  listImages: (
    dir: string,
    recursive = false
  ): Promise<{ name: string; path: string; takenAt: number }[]> =>
    ipcRenderer.invoke('list-images', dir, recursive),
  /** percorso reale di un file trascinato nella finestra */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  isDirectory: (candidate: string): Promise<boolean> =>
    ipcRenderer.invoke('is-directory', candidate),
  /** apre una cartella nel gestore file del sistema */
  openFolder: (dir: string): Promise<boolean> => ipcRenderer.invoke('open-folder', dir),
  // il clone strutturato dell'IPC restituisce sempre un buffer non condiviso
  readImage: (filePath: string): Promise<Uint8Array<ArrayBuffer>> =>
    ipcRenderer.invoke('read-image', filePath),
  saveImage: (
    destDir: string,
    subDir: string,
    fileName: string,
    data: Uint8Array
  ): Promise<string> => ipcRenderer.invoke('save-image', destDir, subDir, fileName, data),
  deleteFile: (destDir: string, subDir: string, fileName: string): Promise<void> =>
    ipcRenderer.invoke('delete-file', destDir, subDir, fileName),
  loadSession: (destDir: string): Promise<unknown> => ipcRenderer.invoke('load-session', destDir),
  saveSession: (destDir: string, json: string): Promise<void> =>
    ipcRenderer.invoke('save-session', destDir, json),
  listAlbum: (destDir: string, subDir: string): Promise<{ name: string; path: string }[]> =>
    ipcRenderer.invoke('list-album', destDir, subDir),
  /** LUT .cube: importati nella cartella dati dell'app */
  pickLuts: (): Promise<string[]> => ipcRenderer.invoke('pick-luts'),
  listLuts: (): Promise<string[]> => ipcRenderer.invoke('list-luts'),
  readLut: (name: string): Promise<string | null> => ipcRenderer.invoke('read-lut', name),
  removeLut: (name: string): Promise<boolean> => ipcRenderer.invoke('remove-lut', name),
  exportLut: (suggested: string, text: string): Promise<string | null> =>
    ipcRenderer.invoke('export-lut', suggested, text),
  renameFile: (
    destDir: string,
    subDir: string,
    oldName: string,
    newName: string
  ): Promise<boolean> => ipcRenderer.invoke('rename-file', destDir, subDir, oldName, newName)
}

contextBridge.exposeInMainWorld('picpick', api)

export type PicPickApi = typeof api
