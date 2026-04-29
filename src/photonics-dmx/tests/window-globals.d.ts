import type { PhotonicsAPI } from '../../preload'

declare global {
  interface Window {
    api: PhotonicsAPI
  }
}

export {}
