import { jest } from '@jest/globals'

/**
 * A stand-in for an Electron `BrowserWindow`, enough for `WindowManager` to build, save, front
 * and close one. `emit` fires the handlers the manager registered, so a test can move, resize or
 * close the window the way the OS would.
 */
export interface FakeBrowserWindow {
  destroyed: boolean
  minimized: boolean
  bounds: { width: number; height: number; x: number; y: number }
  /** The options the manager built the window with. */
  options: Record<string, unknown>
  on: jest.Mock<(event: string, handler: (...args: unknown[]) => void) => void>
  emit: (event: string, ...args: unknown[]) => void
  isDestroyed: () => boolean
  isMinimized: () => boolean
  getBounds: () => { width: number; height: number; x: number; y: number }
  close: jest.Mock<() => void>
  show: jest.Mock<() => void>
  focus: jest.Mock<() => void>
  restore: jest.Mock<() => void>
  loadFile: jest.Mock<(...args: unknown[]) => Promise<void>>
  loadURL: jest.Mock<(...args: unknown[]) => Promise<void>>
  webContents: {
    send: jest.Mock<(...args: unknown[]) => void>
    setWindowOpenHandler: jest.Mock<(...args: unknown[]) => void>
  }
}

export function createFakeBrowserWindow(options: Record<string, unknown> = {}): FakeBrowserWindow {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  const window: FakeBrowserWindow = {
    destroyed: false,
    minimized: false,
    bounds: { width: 1280, height: 800, x: 10, y: 20 },
    options,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
    }),
    emit: (event, ...args) => {
      for (const handler of handlers.get(event) ?? []) handler(...args)
    },
    isDestroyed: () => window.destroyed,
    isMinimized: () => window.minimized,
    getBounds: () => window.bounds,
    close: jest.fn(),
    show: jest.fn(),
    focus: jest.fn(),
    restore: jest.fn(),
    loadFile: jest.fn(() => Promise.resolve()),
    loadURL: jest.fn(() => Promise.resolve()),
    webContents: { send: jest.fn(), setWindowOpenHandler: jest.fn() },
  }
  return window
}
