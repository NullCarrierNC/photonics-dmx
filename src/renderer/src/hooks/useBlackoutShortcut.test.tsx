/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { useBlackoutShortcut } from './useBlackoutShortcut'
import Modal, { type ModalProps } from '../components/Modal'
import { masterOutputAtom } from '../state/masterOutput'
import { claimEscape, resetEscapeClaims } from '../utils/escClaims'
import { CONFIG, LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import * as ipcHelpers from '../utils/ipcHelpers'
import type { BlackoutShortcutBinding, BlackoutShortcutKey } from '../../../shared/blackoutShortcut'
import { installWindowApi } from '@renderer/tests/helpers/windowApiStub'

const invoke = jest.fn() as jest.MockedFunction<
  (channel: string, data: unknown) => Promise<unknown>
>

const FULL = { dimmerPercent: 100, blackout: false, strobeOutputEnabled: true }

function mockInvoke(binding: Partial<BlackoutShortcutBinding>) {
  invoke.mockImplementation((channel: string, data: unknown) => {
    if (channel === CONFIG.GET_PREFS) {
      return Promise.resolve({
        blackoutShortcutKey: binding.key,
        blackoutShortcutScope: binding.scope,
      })
    }
    if (channel === LIGHT.SET_MASTER_OUTPUT) {
      return Promise.resolve({ success: true, state: { ...FULL, ...(data as object) } })
    }
    return Promise.resolve(FULL)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  resetEscapeClaims()
  mockInvoke({ key: 'escape', scope: 'focused' })
  installWindowApi(invoke)
})

afterEach(() => {
  document.body.innerHTML = ''
})

const Harness = () => {
  useBlackoutShortcut()
  return null
}

/** Renders the binding and waits for it to have read its preferences. */
async function mount(binding: Partial<BlackoutShortcutBinding> = {}) {
  mockInvoke({ key: 'escape', scope: 'focused', ...binding })
  const store = createStore()
  const utils = render(
    <Provider store={store}>
      <Harness />
    </Provider>,
  )
  await waitFor(() => expect(invoke).toHaveBeenCalledWith(CONFIG.GET_PREFS, undefined))
  // A macrotask turn settles the whole promise chain the read sets the binding from.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  return { ...utils, store }
}

/** The DOM event each key produces on a US layout, so tests press what a user presses. */
const PRESS: Record<BlackoutShortcutKey, KeyboardEventInit> = {
  escape: { key: 'Escape', code: 'Escape' },
  backquote: { key: '`', code: 'Backquote' },
}

function press(
  key: BlackoutShortcutKey,
  target: EventTarget = document.body,
  init: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...PRESS[key],
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

/** Stands in for every bubble-phase consumer: React Flow, dnd-kit, the modal panel. */
function watchBubblePhase(): jest.Mock {
  const seen = jest.fn()
  document.addEventListener('keydown', seen as (event: Event) => void)
  return seen
}

function Dialog({ children, ...props }: Partial<ModalProps>) {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <Modal onClose={() => setOpen(false)} panelClassName="" {...props}>
      {children ?? <input aria-label="Name" />}
    </Modal>
  )
}

/** A button that takes itself off the page when clicked, as a toast's Dismiss button does. */
function RemovesItself() {
  const [shown, setShown] = useState(true)
  return shown ? (
    <button type="button" onClick={() => setShown(false)}>
      Remove row
    </button>
  ) : null
}

/** Opens a dialog that takes focus as it opens and unmounts when it closes. */
function openDialog(props: Partial<ModalProps> = {}): HTMLElement {
  render(<Dialog {...props} />)
  return screen.getByRole('dialog')
}

function focusedElement<T extends HTMLElement>(el: T): T {
  document.body.appendChild(el)
  el.focus()
  return el
}

describe('useBlackoutShortcut', () => {
  describe('with Escape bound', () => {
    it('toggles blackout', async () => {
      const { store } = await mount()

      press('escape')

      await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
    })

    it('keeps the press away from everything downstream', async () => {
      const seen = watchBubblePhase()
      await mount()

      const event = press('escape')

      expect(seen).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(true)
    })

    it('leaves Escape pressed inside a dialog to the dialog, which closes', async () => {
      const { store } = await mount()
      const dialog = openDialog()

      act(() => {
        press('escape', dialog)
      })
      await Promise.resolve()

      expect(store.get(masterOutputAtom).blackout).toBe(false)
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('closes a dialog on Escape pressed after its focused control is removed', async () => {
      const { store } = await mount()
      render(
        <Dialog>
          <RemovesItself />
        </Dialog>,
      )
      const button = screen.getByRole('button', { name: 'Remove row' })
      button.focus()
      act(() => {
        button.click()
      })
      await act(async () => {
        await Promise.resolve()
      })

      act(() => {
        press('escape', document.activeElement ?? document.body)
      })
      await Promise.resolve()

      expect(store.get(masterOutputAtom).blackout).toBe(false)
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('blacks out on Escape pressed with focus outside an open dialog', async () => {
      const { store } = await mount()
      openDialog()

      press('escape', document.body)

      await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('blacks out on Escape inside a dialog that drives output, which stays open', async () => {
      const { store } = await mount()
      const dialog = openDialog({ drivesOutput: true })

      press('escape', dialog)

      await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('blacks out on Escape inside a dialog that is not dismissible, which stays open', async () => {
      const { store } = await mount()
      const dialog = openDialog({ dismissible: false })

      press('escape', dialog)

      await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('leaves Escape to a drag that has claimed it', async () => {
      const { store } = await mount()
      const release = claimEscape()

      press('escape')
      await Promise.resolve()
      expect(store.get(masterOutputAtom).blackout).toBe(false)

      release()
      press('escape')
      await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
    })

    it('still fires while typing, since no field here uses Escape', async () => {
      const { store } = await mount()
      const input = focusedElement(document.createElement('input'))

      press('escape', input)

      await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
    })

    it('ignores a chord, which belongs to somebody else', async () => {
      const { store } = await mount()

      press('escape', document.body, { metaKey: true })
      await Promise.resolve()

      expect(store.get(masterOutputAtom).blackout).toBe(false)
    })
  })

  describe('with the backquote bound', () => {
    it('toggles blackout', async () => {
      const { store } = await mount({ key: 'backquote' })

      press('backquote')

      await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
    })

    it('does not answer to Escape any more', async () => {
      const { store } = await mount({ key: 'backquote' })

      press('escape')
      await Promise.resolve()

      expect(store.get(masterOutputAtom).blackout).toBe(false)
    })

    it.each([
      ['a text input', () => document.createElement('input')],
      ['a textarea', () => document.createElement('textarea')],
      ['a select', () => document.createElement('select')],
    ])('stands aside in %s, so the character still arrives', async (_label, create) => {
      const seen = watchBubblePhase()
      const { store } = await mount({ key: 'backquote' })
      const field = focusedElement(create())

      press('backquote', field)
      await Promise.resolve()

      expect(store.get(masterOutputAtom).blackout).toBe(false)
      expect(seen).toHaveBeenCalled()
    })

    it('stands aside inside the JSON editor, including on a nested child', async () => {
      const { store } = await mount({ key: 'backquote' })
      // CodeMirror puts contenteditable on .cm-content and dispatches from the line inside it.
      const editor = focusedElement(document.createElement('div'))
      editor.className = 'cm-content'
      editor.setAttribute('contenteditable', 'true')
      const line = document.createElement('span')
      editor.appendChild(line)

      press('backquote', line)
      await Promise.resolve()

      expect(store.get(masterOutputAtom).blackout).toBe(false)
    })

    it('fires over an element that is explicitly not editable', async () => {
      const { store } = await mount({ key: 'backquote' })
      const widget = focusedElement(document.createElement('div'))
      widget.setAttribute('contenteditable', 'false')

      press('backquote', widget)

      await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
    })

    it('fires with a dialog open, which has no use for this key', async () => {
      const { store } = await mount({ key: 'backquote' })
      openDialog()

      press('backquote')

      await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
    })

    it('fires mid-drag, when the rig most needs killing', async () => {
      const { store } = await mount({ key: 'backquote' })
      // Escape stays with the drag so it can still cancel. This key was never the drag's.
      claimEscape()

      press('backquote')

      await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
    })

    it('fires on shift, which is a tilde on the same physical key', async () => {
      const { store } = await mount({ key: 'backquote' })

      press('backquote', document.body, { key: '~', shiftKey: true })

      await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
    })

    it.each([
      ['cmd, which cycles windows on macOS', { metaKey: true }],
      ['ctrl, a terminal-toggle habit', { ctrlKey: true }],
      ['AltGr, which composes characters', { ctrlKey: true, altKey: true }],
      ['a repeat, which would strobe the rig', { repeat: true }],
    ])('ignores %s', async (_label, init) => {
      const { store } = await mount({ key: 'backquote' })

      press('backquote', document.body, init)
      await Promise.resolve()

      expect(store.get(masterOutputAtom).blackout).toBe(false)
    })
  })

  it('binds nothing when the preference is disabled', async () => {
    const seen = watchBubblePhase()
    const { store } = await mount({ scope: 'disabled' })

    press('escape')
    await Promise.resolve()

    expect(store.get(masterOutputAtom).blackout).toBe(false)
    expect(seen).toHaveBeenCalled()
  })

  it('binds for system-wide too, since the OS hook is dropped whenever this window has focus', async () => {
    const { store } = await mount({ scope: 'system-wide' })

    press('escape')

    await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
  })

  it('rebinds when the preference changes under it', async () => {
    const handlers = new Map<string, (payload: never) => void>()
    const spy = jest
      .spyOn(ipcHelpers, 'registerIpcListener')
      .mockImplementation((channel, handler) => {
        handlers.set(channel, handler as (payload: never) => void)
        return jest.fn()
      })
    const { store } = await mount()
    await waitFor(() => expect(handlers.has(RENDERER_RECEIVE.BLACKOUT_SHORTCUT_CHANGED)).toBe(true))

    // Inside act, so the listener has actually been rebound before the presses below.
    act(() => {
      handlers.get(RENDERER_RECEIVE.BLACKOUT_SHORTCUT_CHANGED)!({
        key: 'backquote',
        scope: 'focused',
      } as never)
    })

    press('escape')
    await Promise.resolve()
    expect(store.get(masterOutputAtom).blackout).toBe(false)

    press('backquote')
    await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
    spy.mockRestore()
  })

  it('stops listening once unmounted', async () => {
    const seen = watchBubblePhase()
    const { unmount, store } = await mount()

    unmount()
    press('escape')
    await Promise.resolve()

    expect(store.get(masterOutputAtom).blackout).toBe(false)
    expect(seen).toHaveBeenCalled()
  })
})
