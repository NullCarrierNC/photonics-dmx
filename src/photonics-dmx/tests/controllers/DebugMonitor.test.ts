import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DebugMonitor } from '../../controllers/sequencer/DebugMonitor'
import type { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import type { ILayerManager } from '../../controllers/sequencer/interfaces'

describe('DebugMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('stops its refresh timer when disposed', () => {
    const monitor = new DebugMonitor(
      {} as LightTransitionController,
      { getAllLayers: () => [] } as unknown as ILayerManager,
    )
    monitor.enableDebug(true, 50)
    expect(jest.getTimerCount()).toBe(1)

    monitor.dispose()

    expect(jest.getTimerCount()).toBe(0)
  })
})
