/** @jest-environment jsdom */
/**
 * Reading the audio-configuration fields a panel owns, writing them back, and following the
 * config pushed from main when something else changes it.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

const getAudioConfig = jest.fn(async (): Promise<unknown> => ({}))
const saveAudioConfig = jest.fn(async (_p: unknown): Promise<unknown> => ({ success: true }))
const listeners = new Map<string, (payload: unknown) => void>()

jest.mock('../ipcApi', () => ({
  getAudioConfig: () => getAudioConfig(),
  saveAudioConfig: (p: unknown) => saveAudioConfig(p),
}))

jest.mock('../utils/ipcHelpers', () => ({
  registerIpcListener: (channel: string, handler: (payload: unknown) => void) => {
    listeners.set(channel, handler)
    return () => listeners.delete(channel)
  },
}))

import { useAudioConfigFields, type AudioSaveOutcome } from './useAudioConfigFields'

function Panel(): JSX.Element {
  const audio = useAudioConfigFields({ sensitivity: 2.5, noiseFloor: 60 })
  return (
    <div>
      <span data-testid="sensitivity">{audio.values.sensitivity}</span>
      <span data-testid="noiseFloor">{audio.values.noiseFloor}</span>
      <span data-testid="saving">{String(audio.isSaving)}</span>
      <button onClick={() => void audio.save({ sensitivity: 4 })}>save</button>
      <button onClick={() => audio.set({ sensitivity: 3 })}>set</button>
      <button onClick={() => void audio.commit()}>commit</button>
      <button
        onClick={() => {
          audio.saveSoon({ sensitivity: 5 }, 20)
          audio.saveSoon({ sensitivity: 6 }, 20)
          audio.saveSoon({ sensitivity: 7 }, 20)
        }}>
        drag
      </button>
    </div>
  )
}

const sensitivity = (): string => screen.getByTestId('sensitivity').textContent ?? ''

describe('useAudioConfigFields', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    listeners.clear()
    getAudioConfig.mockImplementation(async () => ({}))
    saveAudioConfig.mockImplementation(async () => ({ success: true }))
  })

  afterEach(() => cleanup())

  it('starts from the defaults and takes the stored values', async () => {
    getAudioConfig.mockImplementation(async () => ({ sensitivity: 1.5, noiseFloor: 90 }))

    render(<Panel />)

    await waitFor(() => expect(sensitivity()).toBe('1.5'))
    expect(screen.getByTestId('noiseFloor').textContent).toBe('90')
  })

  it('keeps a default the stored config does not carry', async () => {
    getAudioConfig.mockImplementation(async () => ({ sensitivity: 1.5 }))

    render(<Panel />)

    await waitFor(() => expect(sensitivity()).toBe('1.5'))
    expect(screen.getByTestId('noiseFloor').textContent).toBe('60')
  })

  it('writes only the fields the panel owns', async () => {
    render(<Panel />)
    await waitFor(() => expect(getAudioConfig).toHaveBeenCalled())

    fireEvent.click(screen.getByText('save'))

    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith({ sensitivity: 4, noiseFloor: 60 }),
    )
  })

  it('puts the old value back when the save throws', async () => {
    getAudioConfig.mockImplementation(async () => ({ sensitivity: 1.5, noiseFloor: 60 }))
    saveAudioConfig.mockImplementation(async () => {
      throw new Error('bridge gone')
    })
    render(<Panel />)
    await waitFor(() => expect(sensitivity()).toBe('1.5'))

    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(sensitivity()).toBe('1.5'))
  })

  it('puts the old value back when the save is refused', async () => {
    getAudioConfig.mockImplementation(async () => ({ sensitivity: 1.5, noiseFloor: 60 }))
    saveAudioConfig.mockImplementation(async () => ({ success: false, error: 'nope' }))
    render(<Panel />)
    await waitFor(() => expect(sensitivity()).toBe('1.5'))

    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(sensitivity()).toBe('1.5'))
  })

  it('holds a local change until it is committed', async () => {
    render(<Panel />)
    await waitFor(() => expect(getAudioConfig).toHaveBeenCalled())

    fireEvent.click(screen.getByText('set'))
    expect(sensitivity()).toBe('3')
    expect(saveAudioConfig).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('commit'))
    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith({ sensitivity: 3, noiseFloor: 60 }),
    )
  })

  it('writes once when a burst of changes goes quiet', async () => {
    getAudioConfig.mockImplementation(async () => ({ sensitivity: 1.5, noiseFloor: 60 }))
    render(<Panel />)
    await waitFor(() => expect(sensitivity()).toBe('1.5'))

    fireEvent.click(screen.getByText('drag'))
    expect(sensitivity()).toBe('7')

    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith({ sensitivity: 7, noiseFloor: 60 }),
    )
    expect(saveAudioConfig).toHaveBeenCalledTimes(1)
  })

  it('puts the values from before a burst back when its save is refused', async () => {
    getAudioConfig.mockImplementation(async () => ({ sensitivity: 1.5, noiseFloor: 60 }))
    saveAudioConfig.mockImplementation(async () => ({ success: false, error: 'nope' }))
    render(<Panel />)
    await waitFor(() => expect(sensitivity()).toBe('1.5'))

    fireEvent.click(screen.getByText('drag'))

    await waitFor(() => expect(sensitivity()).toBe('1.5'))
  })

  it('reports a warning main sent back with the save', async () => {
    saveAudioConfig.mockImplementation(async () => ({ success: true, warning: 'capture stopped' }))
    let outcome: AudioSaveOutcome | undefined
    function Probe(): JSX.Element {
      const audio = useAudioConfigFields({ sensitivity: 2.5 })
      return (
        <button
          onClick={() => {
            void audio.save({ sensitivity: 4 }).then((r) => {
              outcome = r
            })
          }}>
          save
        </button>
      )
    }
    render(<Probe />)
    await waitFor(() => expect(getAudioConfig).toHaveBeenCalled())

    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(outcome).toEqual({ ok: true, warning: 'capture stopped' }))
  })

  it('waits for the stored config before writing the fields it was not asked to change', async () => {
    let release: (() => void) | undefined
    getAudioConfig.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { sensitivity: 1.5, noiseFloor: 90 }
    })

    render(<Panel />)
    await waitFor(() => expect(release).toBeDefined())

    fireEvent.click(screen.getByText('save'))
    expect(saveAudioConfig).not.toHaveBeenCalled()

    act(() => release?.())

    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith({ sensitivity: 4, noiseFloor: 90 }),
    )
  })

  it('follows a config push from main', async () => {
    render(<Panel />)
    await waitFor(() => expect(getAudioConfig).toHaveBeenCalled())

    act(() => {
      listeners.get(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE)?.({ sensitivity: 0.9, noiseFloor: 120 })
    })

    expect(sensitivity()).toBe('0.9')
    expect(screen.getByTestId('noiseFloor').textContent).toBe('120')
  })
})
