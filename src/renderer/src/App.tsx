import { useState } from 'react'
import { SetupScreen } from './components/SetupScreen'
import { SessionScreen } from './components/SessionScreen'
import { PresetProvider } from './lib/preset'
import { pushRecent } from './lib/recents'
import type { Develop, ImageFile, LookDose, SessionConfig, SessionFileData } from './types'

type Phase =
  | { name: 'setup' }
  | {
      name: 'session'
      config: SessionConfig
      files: ImageFile[]
      initialDecided: Record<string, string>
      /** sviluppo e didascalie già fatti a mano nelle sessioni precedenti */
      initialWork: {
        devByFile: Record<string, { develop: Develop; doses: LookDose[] }>
        captions: Record<string, string>
      }
    }

export default function App() {
  const [phase, setPhase] = useState<Phase>({ name: 'setup' })
  /** le cartelle dell'ultima sessione: il setup riparte da lì, non da zero */
  const [returnDirs, setReturnDirs] = useState<{ sourceDir: string; destDir: string } | null>(null)

  return (
    <PresetProvider>
      {phase.name === 'setup' ? (
        <SetupScreen
          initialDirs={returnDirs}
          onStart={async (config: SessionConfig, resume?: SessionFileData) => {
            try {
              const allFiles = await window.picpick.listImages(config.sourceDir, config.recursive)
              if (allFiles.length === 0) {
                return 'Nessuna immagine trovata nella cartella sorgente.'
              }
              const initialDecided = resume?.decided ?? {}
              const remaining = allFiles.filter((file) => initialDecided[file.name] === undefined)
              // a capitoli si smista in ordine cronologico: i mesi si susseguono
              const ordered = config.chapters
                ? [...remaining].sort((a, b) => a.takenAt - b.takenAt)
                : remaining
              setPhase({
                name: 'session',
                config,
                files: ordered,
                initialDecided,
                initialWork: {
                  devByFile: resume?.devByFile ?? {},
                  captions: resume?.captions ?? {}
                }
              })
              setReturnDirs({ sourceDir: config.sourceDir, destDir: config.destDir })
              pushRecent({ sourceDir: config.sourceDir, destDir: config.destDir })
              return null
            } catch {
              return 'Impossibile leggere la cartella sorgente.'
            }
          }}
        />
      ) : (
        <SessionScreen
          config={phase.config}
          files={phase.files}
          initialDecided={phase.initialDecided}
          initialWork={phase.initialWork}
          onExit={() => setPhase({ name: 'setup' })}
        />
      )}
    </PresetProvider>
  )
}
