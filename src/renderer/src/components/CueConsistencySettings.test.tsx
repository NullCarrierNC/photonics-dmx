/** @jest-environment jsdom */
/**
 * Behaviour of the cue consistency panel, which loads twelve preferences in parallel and writes
 * each back through its own path.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react'

/** Both outcomes carry the same fields, so one mock can return either without re-typing it. */
type Res<T> = Promise<{ success: boolean } & T>
const ok = <T extends object>(v: T): Res<T> => Promise.resolve({ success: true, ...v })
const fail = <T extends object>(v: T): Res<T> => Promise.resolve({ success: false, ...v })

const mocks = {
  getCueConsistencyWindow: jest.fn(() => ok({ windowMs: 10000 })),
  setCueConsistencyWindow: jest.fn((windowMs: number) => ok({ windowMs })),
  getCueGroupSelectionMode: jest.fn(() => ok({ mode: 'withinSong' as string })),
  setCueGroupSelectionMode: jest.fn((mode: string) => ok({ mode })),
  getRb3CueGroupSelectionMode: jest.fn(() => ok({ mode: 'withinSong' as string })),
  setRb3CueGroupSelectionMode: jest.fn((mode: string) => ok({ mode })),
  getYargMotionGroupSelectionMode: jest.fn(() => ok({ mode: 'perCueChange' as string })),
  setYargMotionGroupSelectionMode: jest.fn((mode: string) => ok({ mode })),
  getAudioMotionGroupSelectionMode: jest.fn(() => ok({ mode: 'perCueChange' as string })),
  setAudioMotionGroupSelectionMode: jest.fn((mode: string) => ok({ mode })),
  getRb3MotionGroupSelectionMode: jest.fn(() => ok({ mode: 'perCueChange' as string })),
  setRb3MotionGroupSelectionMode: jest.fn((mode: string) => ok({ mode })),
  getMotionCueMinHoldMs: jest.fn(() => ok({ minHoldMs: 5000 })),
  setMotionCueMinHoldMs: jest.fn((minHoldMs: number) => ok({ minHoldMs })),
  getRb3MotionCueMinHoldMs: jest.fn(() => ok({ minHoldMs: 5000 })),
  setRb3MotionCueMinHoldMs: jest.fn((minHoldMs: number) => ok({ minHoldMs })),
  getMotionCueProbabilityPercent: jest.fn(() => ok({ percent: 50 })),
  setMotionCueProbabilityPercent: jest.fn((percent: number) => ok({ percent })),
  getAudioMotionCueProbabilityPercent: jest.fn(() => ok({ percent: 50 })),
  setAudioMotionCueProbabilityPercent: jest.fn((percent: number) => ok({ percent })),
  getRb3MotionCueProbabilityPercent: jest.fn(() => ok({ percent: 50 })),
  setRb3MotionCueProbabilityPercent: jest.fn((percent: number) => ok({ percent })),
  getRb3MotionCueDuration: jest.fn(() => ok({ min: 5, max: 20 })),
  setRb3MotionCueDuration: jest.fn((range: { min: number; max: number }) => ok(range)),
}

jest.mock('../ipcApi', () => mocks)

/** What each mock does before a case reaches for it, so a persistent override cannot outlive its test. */
const mockDefaults = new Map(
  Object.entries(mocks).map(([name, fn]) => [name, fn.getMockImplementation()]),
)

import CueConsistencySettings from './CueConsistencySettings'

/** The debounce the three probability sliders share. */
const DEBOUNCE_MS = 300

function control<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`no control with id ${id}`)
  return el as T
}

/**
 * Renders and waits for the parallel load to settle.
 *
 * Readiness is the controls becoming enabled, not a value appearing: every field starts at its
 * default, so checking a value would pass before the load had applied anything. The cue-group
 * select is the signal because it is gated on the loading flag alone, which makes it usable
 * whether or not motion is globally enabled.
 */
async function renderPanel(props: { motionGloballyEnabled?: boolean } = {}) {
  const view = render(<CueConsistencySettings {...props} />)
  await waitFor(() =>
    expect(control<HTMLSelectElement>('cue-group-selection-mode').disabled).toBe(false),
  )
  return view
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] })
  for (const [name, fn] of Object.entries(mocks)) {
    fn.mockReset()
    const impl = mockDefaults.get(name)
    if (impl) {
      fn.mockImplementation(impl as never)
    }
  }
})

afterEach(() => {
  cleanup()
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
})

describe('CueConsistencySettings load', () => {
  it('reads every preference it renders, in one pass', async () => {
    await renderPanel()

    for (const name of Object.keys(mocks).filter((k) => k.startsWith('get'))) {
      expect(mocks[name as keyof typeof mocks]).toHaveBeenCalledTimes(1)
    }
  })

  it('shows the values the main process returned', async () => {
    mocks.getCueConsistencyWindow.mockReturnValueOnce(ok({ windowMs: 42000 }))
    mocks.getCueGroupSelectionMode.mockReturnValueOnce(ok({ mode: 'oncePerSong' }))
    mocks.getMotionCueProbabilityPercent.mockReturnValueOnce(ok({ percent: 75 }))

    await renderPanel()

    expect(control<HTMLInputElement>('consistency-window').value).toBe('42000')
    expect(control<HTMLSelectElement>('cue-group-selection-mode').value).toBe('oncePerSong')
    expect(control<HTMLInputElement>('yarg-motion-probability').value).toBe('75')
  })

  it('keeps its default when a preference fails to load', async () => {
    mocks.getCueConsistencyWindow.mockReturnValueOnce(fail({ windowMs: 0 }))

    await renderPanel()

    expect(control<HTMLInputElement>('consistency-window').value).toBe('10000')
  })
})

describe('CueConsistencySettings consistency window', () => {
  it('does not write while the value is being typed', async () => {
    await renderPanel()

    fireEvent.change(control('consistency-window'), { target: { value: '25000' } })

    expect(control<HTMLInputElement>('consistency-window').value).toBe('25000')
    expect(mocks.setCueConsistencyWindow).not.toHaveBeenCalled()
  })

  it('writes once the field loses focus', async () => {
    await renderPanel()

    fireEvent.change(control('consistency-window'), { target: { value: '25000' } })
    await act(async () => {
      fireEvent.blur(control('consistency-window'))
    })

    expect(mocks.setCueConsistencyWindow).toHaveBeenCalledWith(25000)
  })

  it.each([
    ['above the ceiling', '999999', 300000],
    ['below the floor', '-5', 0],
  ])('clamps a value %s', async (_label, typed, expected) => {
    await renderPanel()

    fireEvent.change(control('consistency-window'), { target: { value: typed } })
    await act(async () => {
      fireEvent.blur(control('consistency-window'))
    })

    expect(mocks.setCueConsistencyWindow).toHaveBeenCalledWith(expected)
  })

  it('puts the loaded window back when the write is refused', async () => {
    mocks.setCueConsistencyWindow.mockReturnValueOnce(fail({ windowMs: 0 }))
    await renderPanel()

    fireEvent.change(control('consistency-window'), { target: { value: '25000' } })
    await act(async () => {
      fireEvent.blur(control('consistency-window'))
    })

    expect(mocks.setCueConsistencyWindow).toHaveBeenCalledWith(25000)
    expect(control<HTMLInputElement>('consistency-window').value).toBe('10000')
  })

  it('falls back to the window the load returned, not the starting default', async () => {
    mocks.getCueConsistencyWindow.mockReturnValueOnce(ok({ windowMs: 42000 }))
    mocks.setCueConsistencyWindow.mockReturnValueOnce(fail({ windowMs: 0 }))
    await renderPanel()

    fireEvent.change(control('consistency-window'), { target: { value: '25000' } })
    await act(async () => {
      fireEvent.blur(control('consistency-window'))
    })

    expect(control<HTMLInputElement>('consistency-window').value).toBe('42000')
  })

  it('puts the loaded window back when the write throws', async () => {
    mocks.setCueConsistencyWindow.mockImplementationOnce(() => Promise.reject(new Error('offline')))
    await renderPanel()

    fireEvent.change(control('consistency-window'), { target: { value: '25000' } })
    await act(async () => {
      fireEvent.blur(control('consistency-window'))
    })

    expect(control<HTMLInputElement>('consistency-window').value).toBe('10000')
  })

  it('falls back to the last accepted window, not the loaded one', async () => {
    mocks.setCueConsistencyWindow
      .mockReturnValueOnce(ok({ windowMs: 30000 }))
      .mockReturnValueOnce(fail({ windowMs: 0 }))
    await renderPanel()

    fireEvent.change(control('consistency-window'), { target: { value: '30000' } })
    await act(async () => {
      fireEvent.blur(control('consistency-window'))
    })
    fireEvent.change(control('consistency-window'), { target: { value: '99000' } })
    await act(async () => {
      fireEvent.blur(control('consistency-window'))
    })

    expect(control<HTMLInputElement>('consistency-window').value).toBe('30000')
  })

  it('takes the value the main process returns, not the one it was sent', async () => {
    mocks.setCueConsistencyWindow.mockReturnValueOnce(ok({ windowMs: 30000 }))
    await renderPanel()

    fireEvent.change(control('consistency-window'), { target: { value: '25000' } })
    await act(async () => {
      fireEvent.blur(control('consistency-window'))
    })

    await waitFor(() => expect(control<HTMLInputElement>('consistency-window').value).toBe('30000'))
  })
})

describe('CueConsistencySettings probability debounce', () => {
  const SLIDERS = [
    ['yarg-motion-probability', 'setMotionCueProbabilityPercent'],
    ['audio-motion-probability', 'setAudioMotionCueProbabilityPercent'],
    ['rb3-motion-probability', 'setRb3MotionCueProbabilityPercent'],
  ] as const

  it.each(SLIDERS)('%s holds its write until the debounce elapses', async (id, saver) => {
    await renderPanel()

    fireEvent.change(control(id), { target: { value: '70' } })
    expect(mocks[saver]).not.toHaveBeenCalled()

    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_MS)
    })

    expect(mocks[saver]).toHaveBeenCalledWith(70)
  })

  it.each(SLIDERS)('%s coalesces a drag into one write', async (id, saver) => {
    await renderPanel()

    for (const value of ['55', '60', '65', '70']) {
      fireEvent.change(control(id), { target: { value } })
      await act(async () => {
        jest.advanceTimersByTime(DEBOUNCE_MS / 3)
      })
    }
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_MS)
    })

    expect(mocks[saver]).toHaveBeenCalledTimes(1)
    expect(mocks[saver]).toHaveBeenCalledWith(70)
  })

  it.each(SLIDERS)('%s skips the write when the value is already stored', async (id, saver) => {
    await renderPanel()

    // 50 is what the load returned, so this lands back on the stored value.
    fireEvent.change(control(id), { target: { value: '70' } })
    fireEvent.change(control(id), { target: { value: '50' } })
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_MS)
    })

    expect(mocks[saver]).not.toHaveBeenCalled()
  })

  it('reloads from the main process when a probability write fails', async () => {
    mocks.setMotionCueProbabilityPercent.mockReturnValueOnce(fail({ percent: 0 }))
    mocks.getMotionCueProbabilityPercent.mockReturnValueOnce(ok({ percent: 50 }))
    await renderPanel()
    mocks.getMotionCueProbabilityPercent.mockReturnValue(ok({ percent: 33 }))

    fireEvent.change(control('yarg-motion-probability'), { target: { value: '70' } })
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_MS)
    })

    await waitFor(() =>
      expect(control<HTMLInputElement>('yarg-motion-probability').value).toBe('33'),
    )
  })
})

describe('CueConsistencySettings selection modes', () => {
  it.each([
    ['cue-group-selection-mode', 'setCueGroupSelectionMode', 'oncePerSong'],
    ['rb3-cue-group-selection-mode', 'setRb3CueGroupSelectionMode', 'oncePerSong'],
    ['yarg-motion-group-selection-mode', 'setYargMotionGroupSelectionMode', 'none'],
    ['audio-motion-group-selection-mode', 'setAudioMotionGroupSelectionMode', 'none'],
    ['rb3-motion-group-selection-mode', 'setRb3MotionGroupSelectionMode', 'none'],
  ] as const)('%s writes the chosen mode', async (id, saver, value) => {
    await renderPanel()

    await act(async () => {
      fireEvent.change(control(id), { target: { value } })
    })

    expect(mocks[saver]).toHaveBeenCalledWith(value)
  })

  const REVERTS = [
    ['cue-group-selection-mode', 'setCueGroupSelectionMode', 'withinSong', 'oncePerSong'],
    ['rb3-cue-group-selection-mode', 'setRb3CueGroupSelectionMode', 'withinSong', 'oncePerSong'],
    ['yarg-motion-group-selection-mode', 'setYargMotionGroupSelectionMode', 'perCueChange', 'none'],
    [
      'audio-motion-group-selection-mode',
      'setAudioMotionGroupSelectionMode',
      'perCueChange',
      'none',
    ],
    ['rb3-motion-group-selection-mode', 'setRb3MotionGroupSelectionMode', 'perCueChange', 'none'],
  ] as const

  it.each(REVERTS)(
    '%s puts the old mode back when the write is refused',
    async (id, saver, was, next) => {
      mocks[saver].mockReturnValueOnce(fail({ mode: was }))
      await renderPanel()

      await act(async () => {
        fireEvent.change(control(id), { target: { value: next } })
      })

      expect(control<HTMLSelectElement>(id).value).toBe(was)
    },
  )

  it.each(REVERTS)(
    '%s puts the old mode back when the write throws',
    async (id, saver, was, next) => {
      mocks[saver].mockImplementationOnce(() => Promise.reject(new Error('offline')))
      await renderPanel()

      await act(async () => {
        fireEvent.change(control(id), { target: { value: next } })
      })

      expect(control<HTMLSelectElement>(id).value).toBe(was)
    },
  )

  it('shows the chosen mode while the write is in flight', async () => {
    let release: (value: { success: boolean; mode: string }) => void = () => {}
    mocks.setYargMotionGroupSelectionMode.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    await renderPanel()

    await act(async () => {
      fireEvent.change(control('yarg-motion-group-selection-mode'), { target: { value: 'none' } })
    })
    expect(control<HTMLSelectElement>('yarg-motion-group-selection-mode').value).toBe('none')

    await act(async () => {
      release({ success: true, mode: 'none' })
    })
    expect(control<HTMLSelectElement>('yarg-motion-group-selection-mode').value).toBe('none')
  })

  it('leaves a mode chosen while a write is in flight showing the stored one', async () => {
    let release: (value: { success: boolean; mode: string }) => void = () => {}
    mocks.setYargMotionGroupSelectionMode.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    await renderPanel()

    // The first change starts a write and holds it open.
    await act(async () => {
      fireEvent.change(control('yarg-motion-group-selection-mode'), { target: { value: 'none' } })
    })
    // A second change while that write is open is dropped, so the select must not show it.
    await act(async () => {
      fireEvent.change(control('yarg-motion-group-selection-mode'), {
        target: { value: 'oncePerSong' },
      })
    })

    expect(control<HTMLSelectElement>('yarg-motion-group-selection-mode').value).toBe('none')
    expect(mocks.setYargMotionGroupSelectionMode).toHaveBeenCalledTimes(1)

    await act(async () => {
      release({ success: true, mode: 'none' })
    })
  })

  it('disables the YARG and audio motion modes when motion is globally off', async () => {
    await renderPanel({ motionGloballyEnabled: false })

    expect(control<HTMLSelectElement>('yarg-motion-group-selection-mode').disabled).toBe(true)
    expect(control<HTMLSelectElement>('audio-motion-group-selection-mode').disabled).toBe(true)
  })

  it('leaves them enabled when motion is globally on', async () => {
    await renderPanel({ motionGloballyEnabled: true })

    expect(control<HTMLSelectElement>('yarg-motion-group-selection-mode').disabled).toBe(false)
    expect(control<HTMLSelectElement>('audio-motion-group-selection-mode').disabled).toBe(false)
  })
})
