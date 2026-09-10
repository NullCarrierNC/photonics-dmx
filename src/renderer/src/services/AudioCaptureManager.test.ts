/** @jest-environment jsdom */
/**
 * Behaviour of the renderer's audio capture: how it opens a device, what it reports when the
 * browser refuses, what each analysis frame publishes, and what it releases on stop.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { getDefaultStore } from 'jotai'
import { audioDataAtom } from '../atoms'

const sendAudioData = jest.fn((_data: unknown) => undefined)
jest.mock('../ipcApi', () => ({ sendAudioData: (d: unknown) => sendAudioData(d) }))

import { AudioCaptureManager } from './AudioCaptureManager'

class FakeAnalyser {
  fftSize = 2048
  smoothingTimeConstant = 1
  byteLevel = 0
  get frequencyBinCount(): number {
    return this.fftSize / 2
  }
  getByteFrequencyData(target: Uint8Array): void {
    target.fill(this.byteLevel)
  }
  getFloatTimeDomainData(target: Float32Array): void {
    target.fill(this.byteLevel / 255)
  }
}

const track = { stop: jest.fn() }
const stream = { getTracks: () => [track] }
const source = { connect: jest.fn(), disconnect: jest.fn() }
let analyser: FakeAnalyser
let contextClose: jest.Mock
let audioContextCalls: number

const getUserMedia = jest.fn(async (_c: MediaStreamConstraints): Promise<unknown> => stream)
const enumerateDevices = jest.fn(async (): Promise<unknown[]> => [])

/** The analysis loop runs on a fixed interval, so a frame is one tick of that interval. */
const ANALYSIS_INTERVAL_MS = Math.round(1000 / 60)

function stepFrame(): void {
  jest.advanceTimersByTime(ANALYSIS_INTERVAL_MS)
}

/** How many analysis ticks are still scheduled. */
function pendingFrames(): number {
  return jest.getTimerCount()
}

const store = getDefaultStore()

beforeEach(() => {
  jest.clearAllMocks()
  analyser = new FakeAnalyser()
  contextClose = jest.fn()
  audioContextCalls = 0
  jest.useFakeTimers()
  store.set(audioDataAtom, null)

  getUserMedia.mockResolvedValue(stream)
  enumerateDevices.mockResolvedValue([])

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  })
  ;(globalThis as unknown as { AudioContext: unknown }).AudioContext = function AudioContextStub() {
    audioContextCalls += 1
    return {
      sampleRate: 48000,
      close: contextClose,
      createAnalyser: () => analyser,
      createMediaStreamSource: () => source,
    }
  }
})

afterEach(() => {
  store.set(audioDataAtom, null)
  jest.useRealTimers()
})

/** A started manager, with the synchronous first analysis frame already run. */
async function started(deviceId?: string): Promise<AudioCaptureManager> {
  const manager = new AudioCaptureManager()
  await manager.start(deviceId)
  return manager
}

/** Fails `getUserMedia` with a DOMException of the given name. */
function refuseWith(name: string, message = 'refused'): void {
  const error = new DOMException(message, name)
  getUserMedia.mockRejectedValue(error)
}

describe('AudioCaptureManager start', () => {
  it('asks for the default device when none is named', async () => {
    await started()

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
  })

  it('asks for the exact device it is given', async () => {
    await started('mic-2')

    expect(getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: { exact: 'mic-2' } } })
  })

  it('takes the FFT size from config and turns off the built-in smoothing', async () => {
    await started()

    expect(analyser.fftSize).toBe(4096)
    expect(analyser.smoothingTimeConstant).toBe(0)
  })

  it('wires the stream into the analyser', async () => {
    await started()

    expect(source.connect).toHaveBeenCalledWith(analyser)
  })

  it('reports itself active', async () => {
    const manager = await started()

    expect(manager.isActive()).toBe(true)
  })

  it('ignores a second start', async () => {
    const manager = await started()

    await manager.start()

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(audioContextCalls).toBe(1)
  })
})

describe('AudioCaptureManager start failures', () => {
  const startAndCatch = async (deviceId?: string): Promise<string> => {
    const manager = new AudioCaptureManager()
    try {
      await manager.start(deviceId)
    } catch (error) {
      return (error as Error).message
    }
    throw new Error('start resolved when it should have thrown')
  }

  it('explains a denied permission', async () => {
    refuseWith('NotAllowedError')

    expect(await startAndCatch()).toMatch(/Microphone permission denied/)
  })

  it('explains a missing default microphone', async () => {
    refuseWith('NotFoundError')

    expect(await startAndCatch()).toMatch(/No microphone found/)
  })

  it('points at the saved device when a named one is missing', async () => {
    refuseWith('NotFoundError')

    expect(await startAndCatch('mic-2')).toMatch(/saved device is no longer connected/)
  })

  it('explains a device another application holds', async () => {
    refuseWith('NotReadableError')

    expect(await startAndCatch()).toMatch(/already in use by another application/)
  })

  it('explains constraints the device cannot meet', async () => {
    refuseWith('OverconstrainedError')

    expect(await startAndCatch()).toMatch(/constraints cannot be satisfied/)
  })

  it('names any other browser error', async () => {
    refuseWith('SecurityError', 'blocked by policy')

    expect(await startAndCatch()).toBe('SecurityError: blocked by policy')
  })

  it('rethrows an error the browser did not raise', async () => {
    getUserMedia.mockRejectedValue(new Error('something else'))

    expect(await startAndCatch()).toBe('something else')
  })

  it('stays inactive after a failed start', async () => {
    refuseWith('NotAllowedError')
    const manager = new AudioCaptureManager()
    await manager.start().catch(() => undefined)

    expect(manager.isActive()).toBe(false)
  })

  it('gives the microphone back when the start fails after taking it', async () => {
    // getUserMedia resolves, so the device is live, and everything after it throws. The capturing
    // flag is not set yet and stop() bails on that flag, so nothing else can close it.
    ;(globalThis as unknown as { AudioContext: unknown }).AudioContext =
      function FailingAudioContext() {
        throw new Error('no audio device')
      }
    const manager = new AudioCaptureManager()

    await manager.start().catch(() => undefined)

    expect(track.stop).toHaveBeenCalled()
    expect(manager.isActive()).toBe(false)
  })
})

describe('AudioCaptureManager analysis frames', () => {
  it('publishes a frame to the main process as soon as it starts', async () => {
    await started()

    expect(sendAudioData).toHaveBeenCalledTimes(1)
  })

  it('publishes every frame to the main process', async () => {
    await started()

    stepFrame()
    stepFrame()

    expect(sendAudioData).toHaveBeenCalledTimes(3)
  })

  it('holds the preview atom back on the first frame', async () => {
    await started()

    expect(store.get(audioDataAtom)).toBeNull()
  })

  it('feeds the preview atom on every second frame', async () => {
    await started()

    stepFrame()

    expect(store.get(audioDataAtom)).not.toBeNull()
  })

  it('keeps running after a frame', async () => {
    await started()

    stepFrame()

    expect(pendingFrames()).toBe(1)
  })
})

describe('AudioCaptureManager stop', () => {
  it('clears the preview atom', async () => {
    const manager = await started()
    stepFrame()
    expect(store.get(audioDataAtom)).not.toBeNull()

    manager.stop()

    expect(store.get(audioDataAtom)).toBeNull()
  })

  it('releases the device, the source and the context', async () => {
    const manager = await started()

    manager.stop()

    expect(track.stop).toHaveBeenCalled()
    expect(source.disconnect).toHaveBeenCalled()
    expect(contextClose).toHaveBeenCalled()
  })

  it('stops the analysis loop', async () => {
    const manager = await started()
    expect(pendingFrames()).toBe(1)

    manager.stop()

    expect(pendingFrames()).toBe(0)
  })

  it('reports itself inactive', async () => {
    const manager = await started()

    manager.stop()

    expect(manager.isActive()).toBe(false)
  })

  it('ignores a stop when it never started', () => {
    const manager = new AudioCaptureManager()

    manager.stop()

    expect(contextClose).not.toHaveBeenCalled()
  })

  it('starts again after stopping', async () => {
    const manager = await started()
    manager.stop()

    await manager.start()

    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(manager.isActive()).toBe(true)
  })
})

describe('AudioCaptureManager devices', () => {
  it('offers only the audio inputs', async () => {
    enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'a' },
      { kind: 'videoinput', deviceId: 'b' },
      { kind: 'audiooutput', deviceId: 'c' },
    ])
    const manager = new AudioCaptureManager()

    const devices = await manager.getDevices()

    expect(devices.map((d) => d.deviceId)).toEqual(['a'])
  })

  it('offers none when enumeration fails', async () => {
    enumerateDevices.mockRejectedValue(new Error('no permission'))
    const manager = new AudioCaptureManager()

    expect(await manager.getDevices()).toEqual([])
  })
})

describe('AudioCaptureManager configuration', () => {
  it('resizes a live analyser', async () => {
    const manager = await started()

    manager.updateConfig({ fftSize: 1024 })

    expect(analyser.fftSize).toBe(1024)
  })

  it('leaves the analyser alone when the size is unchanged', async () => {
    const manager = await started()

    manager.updateConfig({ fftSize: 4096, sensitivity: 2 })

    expect(analyser.fftSize).toBe(4096)
  })

  it('takes a new size before it starts', async () => {
    const manager = new AudioCaptureManager()

    manager.updateConfig({ fftSize: 512 })
    await manager.start()

    expect(analyser.fftSize).toBe(512)
  })
})
