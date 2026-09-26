/** @jest-environment jsdom */
/**
 * Behaviour of the cue consistency panel, which loads twelve preferences in parallel and writes
 * each back through its own path.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'

/** Answers shaped like main's: a success carrying the value, or a refusal carrying an error. */
const ok = <const T extends object>(v: T) => Promise.resolve({ success: true as const, ...v })
const fail = <const T extends object>(v: T) =>
  Promise.resolve({ success: false as const, error: 'refused', ...v })

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const mocks = jest.mocked(ipcApi)

/** What each channel answers before a case reaches for it. */
function armDefaults(): void {
  mocks.getCueConsistencyWindow.mockImplementation(() => ok({ windowMs: 10000 }))
  mocks.setCueConsistencyWindow.mockImplementation((windowMs: number) => ok({ windowMs }))
  mocks.getCueGroupSelectionMode.mockImplementation(() => ok({ mode: 'withinSong' }))
  mocks.setCueGroupSelectionMode.mockImplementation((mode) => ok({ mode }))
  mocks.getRb3CueGroupSelectionMode.mockImplementation(() => ok({ mode: 'withinSong' }))
  mocks.setRb3CueGroupSelectionMode.mockImplementation((mode) => ok({ mode }))
  mocks.getYargMotionGroupSelectionMode.mockImplementation(() => ok({ mode: 'perCueChange' }))
  mocks.setYargMotionGroupSelectionMode.mockImplementation((mode) => ok({ mode }))
  mocks.getAudioMotionGroupSelectionMode.mockImplementation(() => ok({ mode: 'perCueChange' }))
  mocks.setAudioMotionGroupSelectionMode.mockImplementation((mode) => ok({ mode }))
  mocks.getRb3MotionGroupSelectionMode.mockImplementation(() => ok({ mode: 'perCueChange' }))
  mocks.setRb3MotionGroupSelectionMode.mockImplementation((mode) => ok({ mode }))
  mocks.getMotionCueMinHoldMs.mockImplementation(() => ok({ minHoldMs: 5000 }))
  mocks.setMotionCueMinHoldMs.mockImplementation((minHoldMs: number) => ok({ minHoldMs }))
  mocks.getRb3MotionCueMinHoldMs.mockImplementation(() => ok({ minHoldMs: 5000 }))
  mocks.setRb3MotionCueMinHoldMs.mockImplementation((minHoldMs: number) => ok({ minHoldMs }))
  mocks.getMotionCueProbabilityPercent.mockImplementation(() => ok({ percent: 50 }))
  mocks.setMotionCueProbabilityPercent.mockImplementation((percent: number) => ok({ percent }))
  mocks.getAudioMotionCueProbabilityPercent.mockImplementation(() => ok({ percent: 50 }))
  mocks.setAudioMotionCueProbabilityPercent.mockImplementation((percent: number) => ok({ percent }))
  mocks.getRb3MotionCueProbabilityPercent.mockImplementation(() => ok({ percent: 50 }))
  mocks.setRb3MotionCueProbabilityPercent.mockImplementation((percent: number) => ok({ percent }))
  mocks.getRb3MotionCueDuration.mockImplementation(() => ok({ min: 5, max: 20 }))
  mocks.setRb3MotionCueDuration.mockImplementation((range: { min: number; max: number }) =>
    ok(range),
  )
}

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
  resetIpcApiMock()
  armDefaults()
})

afterEach(() => {
  cleanup()
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
})

describe('CueConsistencySettings number fields', () => {
  it('saves a hold time when the user leaves the field, not per keystroke', async () => {
    await renderPanel({ motionGloballyEnabled: true })
    const box = control<HTMLInputElement>('motion-min-hold-ms')

    fireEvent.change(box, { target: { value: '8' } })
    fireEvent.change(box, { target: { value: '8000' } })
    expect(mocks.setMotionCueMinHoldMs).not.toHaveBeenCalled()

    fireEvent.blur(box)
    await waitFor(() => expect(mocks.setMotionCueMinHoldMs).toHaveBeenCalledWith(8000))
  })

  it('leaves a saved hold time alone when the field is cleared', async () => {
    await renderPanel({ motionGloballyEnabled: true })
    const box = control<HTMLInputElement>('motion-min-hold-ms')

    fireEvent.change(box, { target: { value: '' } })
    fireEvent.blur(box)

    expect(mocks.setMotionCueMinHoldMs).not.toHaveBeenCalled()
    expect(box.value).toBe('5000')
  })

  it('saves the switch timer range when the user leaves a bound', async () => {
    await renderPanel({ motionGloballyEnabled: true })
    const lower = control<HTMLInputElement>('rb3-motion-duration')

    fireEvent.change(lower, { target: { value: '9' } })
    expect(mocks.setRb3MotionCueDuration).not.toHaveBeenCalled()

    fireEvent.blur(lower)
    await waitFor(() =>
      expect(mocks.setRb3MotionCueDuration).toHaveBeenCalledWith({ min: 9, max: 20 }),
    )
  })
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

  it('keeps the saved window when the field is cleared', async () => {
    await renderPanel()

    fireEvent.change(control('consistency-window'), { target: { value: '' } })
    await act(async () => {
      fireEvent.blur(control('consistency-window'))
    })

    expect(mocks.setCueConsistencyWindow).not.toHaveBeenCalled()
    expect(control<HTMLInputElement>('consistency-window').value).toBe('10000')
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
      mocks[saver].mockRejectedValueOnce(new Error('offline'))
      await renderPanel()

      await act(async () => {
        fireEvent.change(control(id), { target: { value: next } })
      })

      expect(control<HTMLSelectElement>(id).value).toBe(was)
    },
  )

  it('shows the chosen mode while the write is in flight', async () => {
    let release: (
      value: Awaited<ReturnType<typeof ipcApi.setYargMotionGroupSelectionMode>>,
    ) => void = () => {}
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

  it('saves a mode chosen while a write is in flight once that write lands', async () => {
    let release: (
      value: Awaited<ReturnType<typeof ipcApi.setYargMotionGroupSelectionMode>>,
    ) => void = () => {}
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
    await act(async () => {
      fireEvent.change(control('yarg-motion-group-selection-mode'), {
        target: { value: 'oncePerSong' },
      })
    })

    expect(control<HTMLSelectElement>('yarg-motion-group-selection-mode').value).toBe('oncePerSong')
    expect(mocks.setYargMotionGroupSelectionMode).toHaveBeenCalledTimes(1)

    await act(async () => {
      release({ success: true, mode: 'none' })
    })

    expect(mocks.setYargMotionGroupSelectionMode).toHaveBeenCalledTimes(2)
    expect(mocks.setYargMotionGroupSelectionMode).toHaveBeenLastCalledWith('oncePerSong')
    expect(control<HTMLSelectElement>('yarg-motion-group-selection-mode').value).toBe('oncePerSong')
  })

  it('saves a switch timer bound left while another field is saving', async () => {
    let release: (
      value: Awaited<ReturnType<typeof ipcApi.setCueGroupSelectionMode>>,
    ) => void = () => {}
    mocks.setCueGroupSelectionMode.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    await renderPanel({ motionGloballyEnabled: true })

    await act(async () => {
      fireEvent.change(control('cue-group-selection-mode'), { target: { value: 'oncePerSong' } })
    })
    const lower = control<HTMLInputElement>('rb3-motion-duration')
    await act(async () => {
      fireEvent.change(lower, { target: { value: '9' } })
      fireEvent.blur(lower)
    })
    await act(async () => {
      release({ success: true, mode: 'oncePerSong' })
    })

    expect(mocks.setRb3MotionCueDuration).toHaveBeenCalledWith({ min: 9, max: 20 })
    expect(lower.value).toBe('9')
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
