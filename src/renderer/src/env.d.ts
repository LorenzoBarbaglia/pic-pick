/// <reference types="vite/client" />

import type { PicPickApi } from '../../preload/index'

declare global {
  interface Window {
    picpick: PicPickApi
  }
}

export {}
