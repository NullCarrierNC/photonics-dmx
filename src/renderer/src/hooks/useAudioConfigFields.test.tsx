/** @jest-environment jsdom */
/**
 * Reading the audio-configuration fields a panel owns, writing them back, and following the
 * config pushed from main when something else changes it.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import type { AudioConfig } from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../../photonics-dmx/listeners/Audio/AudioConfig'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const getAudioConfig = jest.mocked(ipcApi.getAudioConfig)
const saveAudioConfig = jest.mocked(ipcApi.saveAudioConfig)

/** The stored config, with `fields` changed from the defaults. */
const storedConfig = (fields: Partial<AudioConfig>): AudioConfig => ({
  ...DEFAULT_AUDIO_CONFIG,
  ...fields,
})

jest.mock(
  '../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

import { useAudioConfigFields, type AudioSaveOutcome } from './useAudioConfigFields'
import { emitIpc, resetIpcListenerStub } from '@renderer/tests/helpers/ipcListenerStub'

function Panel(): JSX.Element {
  const audio = useAudioConfigFields({ sensitivity: 2.5, noiseFloor: 60 })
  return (
    <div>
      <span data-testid="sensitivity">{audio.values.sensitivity}</span>
      <span data-testid="noiseFloor">{audio.values.noiseFloor}</span>
      <span data-testid="saving">{String(audio.isSaving)}</span>
      <span data-testid="error">{audio.saveError ?? ''}</span>
      <button onClick={() => void audio.save({ sensitivity: 4 })}>save</button>
      <button onClick={() => void audio.save({ noiseFloor: 30 })}>save floor</button>
      <button onClick={() => audio.set({ sensitivity: 3 })}>set</button>
      <button onClick={() => audio.set({ sensitivity: 3.5 })}>set more</button>
      <button onClick={() => void audio.commit()}>commit</button>
    </div>
  )
}

const sensitivity = (): string => screen.getByTestId('sensitivity').textContent ?? ''

describe('useAudioConfigFields', () => {
  beforeEach(() => {
    resetIpcApiMock()
    resetIpcListenerStub()
    getAudioConfig.mockImplementation(async () => storedConfig({}))
    saveAudioConfig.mockImplementation(async () => ({ success: true }))
  })

  afterEach(() => cleanup())

  it('starts from the defaults and takes the stored values', async () => {
    getAudioConfig.mockImplementation(async () =>
      storedConfig({ sensitivity: 1.5, noiseFloor: 90 }),
    )

    render(<Panel />)

    await waitFor(() => expect(sensitivity()).toBe('1.5'))
    expect(screen.getByTestId('noiseFloor').textContent).toBe('90')
  })

  it('keeps the defaults while main holds no audio config', async () => {
    getAudioConfig.mockImplementation(async () => undefined)

    render(<Panel />)

    await waitFor(() => expect(getAudioConfig).toHaveBeenCalled())
    expect(sensitivity()).toBe('2.5')
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
    getAudioConfig.mockImplementation(async () =>
      storedConfig({ sensitivity: 1.5, noiseFloor: 60 }),
    )
    saveAudioConfig.mockImplementation(async () => {
      throw new Error('bridge gone')
    })
    render(<Panel />)
    await waitFor(() => expect(sensitivity()).toBe('1.5'))

    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(sensitivity()).toBe('1.5'))
  })

  it('puts the old value back when the save is refused', async () => {
    getAudioConfig.mockImplementation(async () =>
      storedConfig({ sensitivity: 1.5, noiseFloor: 60 }),
    )
    saveAudioConfig.mockImplementation(async () => ({ success: false, error: 'nope' }))
    render(<Panel />)
    await waitFor(() => expect(sensitivity()).toBe('1.5'))

    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(sensitivity()).toBe('1.5'))
  })

  it('puts the value from before a drag back when the save on release is refused', async () => {
    getAudioConfig.mockImplementation(async () =>
      storedConfig({ sensitivity: 1.5, noiseFloor: 60 }),
    )
    saveAudioConfig.mockImplementation(async () => ({ success: false, error: 'nope' }))
    render(<Panel />)
    await waitFor(() => expect(sensitivity()).toBe('1.5'))

    fireEvent.click(screen.getByText('set'))
    fireEvent.click(screen.getByText('set more'))
    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(saveAudioConfig).toHaveBeenCalled())
    await waitFor(() => expect(sensitivity()).toBe('1.5'))
  })

  it('puts the value from before a drag back when its commit is refused', async () => {
    getAudioConfig.mockImplementation(async () =>
      storedConfig({ sensitivity: 1.5, noiseFloor: 60 }),
    )
    saveAudioConfig.mockImplementation(async () => ({ success: false, error: 'nope' }))
    render(<Panel />)
    await waitFor(() => expect(sensitivity()).toBe('1.5'))

    fireEvent.click(screen.getByText('set'))
    fireEvent.click(screen.getByText('set more'))
    fireEvent.click(screen.getByText('commit'))

    await waitFor(() => expect(saveAudioConfig).toHaveBeenCalled())
    await waitFor(() => expect(sensitivity()).toBe('1.5'))
  })

  it('reverts to the value the last commit stored', async () => {
    getAudioConfig.mockImplementation(async () =>
      storedConfig({ sensitivity: 1.5, noiseFloor: 60 }),
    )
    render(<Panel />)
    await waitFor(() => expect(sensitivity()).toBe('1.5'))
    fireEvent.click(screen.getByText('set'))
    fireEvent.click(screen.getByText('commit'))
    await waitFor(() => expect(saveAudioConfig).toHaveBeenCalledTimes(1))

    saveAudioConfig.mockImplementation(async () => ({ success: false, error: 'nope' }))
    fireEvent.click(screen.getByText('set more'))
    fireEvent.click(screen.getByText('commit'))

    await waitFor(() => expect(saveAudioConfig).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(sensitivity()).toBe('3'))
  })

  it('says a save failed until the next one lands', async () => {
    saveAudioConfig.mockImplementationOnce(async () => ({ success: false, error: 'nope' }))
    render(<Panel />)
    await waitFor(() => expect(getAudioConfig).toHaveBeenCalled())

    fireEvent.click(screen.getByText('save'))
    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe('Could not save the audio settings.'),
    )

    fireEvent.click(screen.getByText('save floor'))
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe(''))
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
      return storedConfig({ sensitivity: 1.5, noiseFloor: 90 })
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
      emitIpc(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, { sensitivity: 0.9, noiseFloor: 120 })
    })

    expect(sensitivity()).toBe('0.9')
    expect(screen.getByTestId('noiseFloor').textContent).toBe('120')
  })

  it('keeps a field mid-drag when main pushes a config', async () => {
    render(<Panel />)
    await waitFor(() => expect(getAudioConfig).toHaveBeenCalled())
    fireEvent.click(screen.getByText('set'))

    act(() => {
      emitIpc(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, { sensitivity: 0.9, noiseFloor: 120 })
    })

    expect(sensitivity()).toBe('3')
    expect(screen.getByTestId('noiseFloor').textContent).toBe('120')
  })

  it('puts back the pushed value when the drag it arrived during is refused', async () => {
    saveAudioConfig.mockImplementation(async () => ({ success: false, error: 'nope' }))
    render(<Panel />)
    await waitFor(() => expect(getAudioConfig).toHaveBeenCalled())
    fireEvent.click(screen.getByText('set'))
    act(() => {
      emitIpc(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, { sensitivity: 0.9, noiseFloor: 60 })
    })

    fireEvent.click(screen.getByText('commit'))

    await waitFor(() => expect(saveAudioConfig).toHaveBeenCalled())
    await waitFor(() => expect(sensitivity()).toBe('0.9'))
  })

  it('puts back only the field whose save was refused', async () => {
    // A write covers every field the panel owns, so reverting a whole snapshot would undo a
    // different field that was saved successfully while this one was in flight.
    let releaseFirst:
      | ((value: Awaited<ReturnType<typeof ipcApi.saveAudioConfig>>) => void)
      | undefined
    saveAudioConfig.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = resolve
        }),
    )
    render(<Panel />)
    await waitFor(() => expect(getAudioConfig).toHaveBeenCalled())

    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(releaseFirst).toBeDefined())
    fireEvent.click(screen.getByText('save floor'))
    await waitFor(() => expect(screen.getByTestId('noiseFloor').textContent).toBe('30'))

    await act(async () => {
      releaseFirst?.({ success: false, error: 'refused' })
    })

    expect(sensitivity()).toBe('2.5')
    expect(screen.getByTestId('noiseFloor').textContent).toBe('30')
  })
})
