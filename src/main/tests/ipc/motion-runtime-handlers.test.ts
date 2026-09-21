import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { setupMotionRuntimeHandlers } from '../../ipc/motion-runtime-handlers'
import { LIGHT } from '../../../shared/ipcChannels'
import type { ControllerManager } from '../../controllers/ControllerManager'
import type { MotionCueChangePayload } from '../../../shared/ipc/common'

type Handler = (...args: unknown[]) => Promise<unknown> | unknown

const LIVE: MotionCueChangePayload = {
  ref: { groupId: 'yarg-motion-default', cueId: 'motion-nod-slow' },
  source: 'auto',
  manualFallback: false,
}

describe('GET_RUNNING_MOTION_CUE', () => {
  let handler: Handler
  let activeNetCueRef: jest.Mock
  let activeAudioCueRef: jest.Mock
  let runningMotionCue: jest.Mock
  let audioRunningMotionCue: jest.Mock

  beforeEach(() => {
    const handlers = new Map<string, Handler>()
    const ipcMain = {
      handle: (channel: string, h: Handler) => {
        handlers.set(channel, h)
      },
    }
    activeNetCueRef = jest.fn(() => null)
    activeAudioCueRef = jest.fn(() => null)
    runningMotionCue = jest.fn(() => LIVE)
    audioRunningMotionCue = jest.fn(() => LIVE)
    const manager = {
      getMotionCueSimulator: () => ({ activeNetCueRef, activeAudioCueRef }),
      getChainFanout: () => ({ runningMotionCue, audioRunningMotionCue }),
    } as unknown as ControllerManager
    setupMotionRuntimeHandlers(ipcMain as never, manager)
    handler = handlers.get(LIGHT.GET_RUNNING_MOTION_CUE)!
  })

  it('answers from the live YARG handler when nothing is simulated', async () => {
    await expect(handler({}, { domain: 'yarg' })).resolves.toEqual(LIVE)
    expect(runningMotionCue).toHaveBeenCalledWith('yarg')
  })

  it('answers from the RB3 handler for the rb3 domain', async () => {
    await handler({}, { domain: 'rb3' })
    expect(runningMotionCue).toHaveBeenCalledWith('rb3')
  })

  it('answers from the audio handler for the audio domain', async () => {
    await expect(handler({}, { domain: 'audio' })).resolves.toEqual(LIVE)
    expect(audioRunningMotionCue).toHaveBeenCalledTimes(1)
    expect(runningMotionCue).not.toHaveBeenCalled()
  })

  it('a running simulation wins over the live handler', async () => {
    const simulated = { groupId: 'yarg-motion-default', cueId: 'motion-wave-slow' }
    activeNetCueRef.mockReturnValue(simulated)

    await expect(handler({}, { domain: 'yarg' })).resolves.toEqual({
      ref: simulated,
      source: 'auto',
      manualFallback: false,
    })
    expect(runningMotionCue).not.toHaveBeenCalled()
  })

  it('refuses a domain it does not know', async () => {
    await expect(handler({}, { domain: 'laser' })).resolves.toEqual(
      expect.objectContaining({ success: false }),
    )
    await expect(handler({}, 'yarg')).resolves.toEqual(expect.objectContaining({ success: false }))
  })
})
