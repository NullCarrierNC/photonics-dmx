/**
 * DmxPublisher tests: publish calls sender, updateActiveRigs, empty light map.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { createMockRGBIP, createMockLightingConfig } from '../helpers/testFixtures'
import type { DmxRig } from '../../types'

describe('DmxPublisher', () => {
  let mockSenderManager: { send: ReturnType<typeof jest.fn> }
  let mockLightStateManager: LightStateManager
  let publisher: DmxPublisher

  beforeEach(() => {
    mockSenderManager = { send: jest.fn().mockImplementation(() => Promise.resolve()) }
    mockLightStateManager = new LightStateManager()
    publisher = new DmxPublisher(
      mockSenderManager as unknown as SenderManager,
      mockLightStateManager,
    )
  })

  it('publish calls sender send with universe when rigs are active', () => {
    const config = createMockLightingConfig()
    const rig: DmxRig = { id: 'rig1', name: 'Rig 1', active: true, universe: 1, config }
    publisher.updateActiveRigs([rig])

    const lights = new Map<string, import('../../types').RGBIO>()
    lights.set('test-fixture-1', createMockRGBIP({ red: 255, green: 0, blue: 0 }))
    publisher.publish(lights)

    expect(mockSenderManager.send).toHaveBeenCalled()
    const [buffer, universe] = jest.mocked(mockSenderManager.send).mock.calls[0]
    expect(universe).toBe(1)
    expect(typeof buffer).toBe('object')
  })

  it('updateActiveRigs changes rig configuration', () => {
    const config = createMockLightingConfig()
    publisher.updateActiveRigs([{ id: 'r1', name: 'R1', active: true, universe: 2, config }])
    const lights = new Map<string, import('../../types').RGBIO>()
    lights.set('test-fixture-1', createMockRGBIP())
    publisher.publish(lights)
    expect(mockSenderManager.send).toHaveBeenCalled()
  })

  it('handles empty light map gracefully', () => {
    const config = createMockLightingConfig()
    publisher.updateActiveRigs([{ id: 'r1', name: 'R1', active: true, universe: 1, config }])
    publisher.publish(new Map())
    expect(() => publisher.publish(new Map())).not.toThrow()
  })
})
