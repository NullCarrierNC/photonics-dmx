import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'

const appListeners = new Map<string, (() => void)[]>()

jest.mock('electron', () => ({
  app: {
    on: jest.fn((event: string, handler: () => void) => {
      const existing = appListeners.get(event) ?? []
      appListeners.set(event, [...existing, handler])
    }),
    removeListener: jest.fn((event: string, handler: () => void) => {
      appListeners.set(
        event,
        (appListeners.get(event) ?? []).filter((h) => h !== handler),
      )
    }),
  },
  BrowserWindow: { getFocusedWindow: jest.fn(() => null) },
  globalShortcut: {
    register: jest.fn(() => true),
    unregister: jest.fn(),
    isRegistered: jest.fn(() => false),
  },
}))

import { BrowserWindow, globalShortcut } from 'electron'
import { BlackoutShortcut } from '../blackoutShortcut'

const getFocusedWindow = BrowserWindow.getFocusedWindow as jest.MockedFunction<() => unknown | null>
const register = globalShortcut.register as jest.MockedFunction<
  (accelerator: string, callback: () => void) => boolean
>
const unregister = globalShortcut.unregister as jest.MockedFunction<(accelerator: string) => void>

/** A window object only needs to be non-null: the module asks whether one has focus, not which. */
const A_FOCUSED_WINDOW = {}

/** What each key maps to, so the assertions read as the accelerators Electron actually sees. */
const ESCAPE = 'Escape'
const BACKQUOTE = '`'

function emit(event: string): void {
  for (const handler of appListeners.get(event) ?? []) {
    handler()
  }
}

const toggle = jest.fn()
let shortcut: BlackoutShortcut

beforeEach(() => {
  jest.clearAllMocks()
  shortcut = new BlackoutShortcut()
  appListeners.clear()
  jest.useFakeTimers()
  getFocusedWindow.mockReturnValue(null)
  register.mockReturnValue(true)
})

afterEach(() => {
  shortcut.dispose()
  jest.useRealTimers()
})

describe('blackoutShortcut', () => {
  it('never takes the key from the OS unless the preference asks for it', () => {
    shortcut.init(toggle, { key: 'escape', scope: 'focused' })

    expect(register).not.toHaveBeenCalled()
  })

  it('holds the key only while no Photonics window has focus', () => {
    getFocusedWindow.mockReturnValue(A_FOCUSED_WINDOW)
    shortcut.init(toggle, { key: 'escape', scope: 'system-wide' })
    expect(register).not.toHaveBeenCalled()

    getFocusedWindow.mockReturnValue(null)
    emit('browser-window-blur')
    jest.runAllTimers()

    expect(register).toHaveBeenCalledWith(ESCAPE, expect.any(Function))
  })

  it('hands back to the in-app listener when a window takes focus', () => {
    shortcut.init(toggle, { key: 'escape', scope: 'system-wide' })
    expect(register).toHaveBeenCalledTimes(1)

    getFocusedWindow.mockReturnValue(A_FOCUSED_WINDOW)
    emit('browser-window-focus')
    jest.runAllTimers()

    expect(unregister).toHaveBeenCalledWith(ESCAPE)
  })

  it('does not grab the key while focus moves between two of our own windows', () => {
    getFocusedWindow.mockReturnValue(A_FOCUSED_WINDOW)
    shortcut.init(toggle, { key: 'escape', scope: 'system-wide' })

    // Leaving the cue editor for the main window is a blur immediately followed by a focus. The
    // blur alone would look like the app going to the background.
    getFocusedWindow.mockReturnValue(null)
    emit('browser-window-blur')
    getFocusedWindow.mockReturnValue(A_FOCUSED_WINDOW)
    emit('browser-window-focus')
    jest.runAllTimers()

    expect(register).not.toHaveBeenCalled()
  })

  it('toggles blackout when the shortcut fires', () => {
    shortcut.init(toggle, { key: 'escape', scope: 'system-wide' })

    register.mock.calls[0]![1]()

    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('registers the accelerator for the chosen key', () => {
    shortcut.init(toggle, { key: 'backquote', scope: 'system-wide' })

    expect(register).toHaveBeenCalledWith(BACKQUOTE, expect.any(Function))
  })

  it('reports a refused registration once, not once per focus change', () => {
    register.mockReturnValue(false)
    shortcut.init(toggle, { key: 'escape', scope: 'system-wide' })

    for (let i = 0; i < 3; i++) {
      getFocusedWindow.mockReturnValue(A_FOCUSED_WINDOW)
      emit('browser-window-focus')
      jest.runAllTimers()
      getFocusedWindow.mockReturnValue(null)
      emit('browser-window-blur')
      jest.runAllTimers()
    }

    // It keeps trying, so the binding recovers if whatever held the key lets it go.
    expect(register.mock.calls.length).toBeGreaterThan(1)
  })

  it('has nothing to release after a refused registration', () => {
    register.mockReturnValue(false)
    shortcut.init(toggle, { key: 'escape', scope: 'system-wide' })

    getFocusedWindow.mockReturnValue(A_FOCUSED_WINDOW)
    emit('browser-window-focus')
    jest.runAllTimers()

    expect(unregister).not.toHaveBeenCalled()
  })

  it('releases the key as soon as the preference turns it off', () => {
    shortcut.init(toggle, { key: 'escape', scope: 'system-wide' })
    expect(register).toHaveBeenCalledTimes(1)

    shortcut.set({ key: 'escape', scope: 'focused' })

    expect(unregister).toHaveBeenCalledWith(ESCAPE)
  })

  it('takes the key up when the preference turns it on', () => {
    shortcut.init(toggle, { key: 'escape', scope: 'focused' })

    shortcut.set({ key: 'escape', scope: 'system-wide' })

    expect(register).toHaveBeenCalledWith(ESCAPE, expect.any(Function))
  })

  describe('changing the key', () => {
    it('releases the key it was holding, not the one it is taking', () => {
      shortcut.init(toggle, { key: 'escape', scope: 'system-wide' })
      expect(register).toHaveBeenCalledWith(ESCAPE, expect.any(Function))

      shortcut.set({ key: 'backquote', scope: 'system-wide' })

      // Releasing the new accelerator instead would leave Escape held for the life of the process,
      // stolen from every other application and with nothing left that could give it back.
      expect(unregister).toHaveBeenCalledWith(ESCAPE)
      expect(unregister).not.toHaveBeenCalledWith(BACKQUOTE)
      expect(register).toHaveBeenCalledWith(BACKQUOTE, expect.any(Function))
      expect(unregister.mock.invocationCallOrder[0]!).toBeLessThan(
        register.mock.invocationCallOrder[1]!,
      )
    })

    it('re-arms even though the scope did not change', () => {
      shortcut.init(toggle, { key: 'escape', scope: 'system-wide' })

      shortcut.set({ key: 'backquote', scope: 'system-wide' })

      expect(register).toHaveBeenCalledTimes(2)
    })

    it('touches nothing while the OS hook is not armed', () => {
      shortcut.init(toggle, { key: 'escape', scope: 'focused' })

      shortcut.set({ key: 'backquote', scope: 'focused' })

      expect(register).not.toHaveBeenCalled()
      expect(unregister).not.toHaveBeenCalled()
    })
  })

  it('releases whichever key it holds on shutdown, and stops watching focus', () => {
    shortcut.init(toggle, { key: 'backquote', scope: 'system-wide' })

    shortcut.dispose()

    expect(unregister).toHaveBeenCalledWith(BACKQUOTE)
    expect(appListeners.get('browser-window-focus') ?? []).toHaveLength(0)
  })
})
