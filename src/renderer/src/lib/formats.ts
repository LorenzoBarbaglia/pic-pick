import type { AlbumFormat, Background } from '../types'

export const FORMATS: AlbumFormat[] = [
  { id: '1:1', label: 'Quadrato', ratio: 1 },
  { id: '4:5', label: 'Verticale', ratio: 4 / 5 },
  { id: '3:2', label: 'Orizzontale', ratio: 3 / 2 },
  { id: '16:9', label: 'Widescreen', ratio: 16 / 9 }
]

export const BACKGROUNDS: Background[] = [
  { id: 'white', label: 'Bianco', color: '#ffffff' },
  { id: 'black', label: 'Nero', color: '#000000' },
  { id: 'transparent', label: 'Trasparente', color: null },
  { id: 'cream', label: 'Crema', color: '#f8f1e4' },
  { id: 'sand', label: 'Sabbia', color: '#ead9ae' },
  { id: 'peach', label: 'Pesca', color: '#f6c39c' },
  { id: 'terracotta', label: 'Terracotta', color: '#c97c54' }
]
