/**
 * DmxPublisher tests: publish calls sender, updateActiveRigs, empty light map,
 * and home fallback mirroring for inverted moving-head fixtures.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { createMockRGBIP, createMockLightingConfig } from '../helpers/testFixtures'
import type { DmxRig, FixtureConfig, LightingConfiguration, RGBIO } from '../../types'
import { FixtureTypes } from '../../types'
import { mirrorDmxForMovingHeadInvert, percentToDmx } from '../../helpers/dmxHelpers'

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

  it('publish calls sender send with merged buffer when rigs are active', () => {
    const config = createMockLightingConfig()
    const rig: DmxRig = { id: 'rig1', name: 'Rig 1', active: true, config }
    publisher.updateActiveRigs([rig])

    const lights = new Map<string, import('../../types').RGBIO>()
    lights.set('test-fixture-1', createMockRGBIP({ red: 255, green: 0, blue: 0 }))
    publisher.publish(lights)

    expect(mockSenderManager.send).toHaveBeenCalled()
    const [buffer] = jest.mocked(mockSenderManager.send).mock.calls[0]
    expect(typeof buffer).toBe('object')
  })

  it('updateActiveRigs changes rig configuration', () => {
    const config = createMockLightingConfig()
    publisher.updateActiveRigs([{ id: 'r1', name: 'R1', active: true, config }])
    const lights = new Map<string, import('../../types').RGBIO>()
    lights.set('test-fixture-1', createMockRGBIP())
    publisher.publish(lights)
    expect(mockSenderManager.send).toHaveBeenCalled()
  })

  it('handles empty light map gracefully', () => {
    const config = createMockLightingConfig()
    publisher.updateActiveRigs([{ id: 'r1', name: 'R1', active: true, config }])
    publisher.publish(new Map())
    expect(() => publisher.publish(new Map())).not.toThrow()
  })

  describe('moving head home fallback mirroring', () => {
    function makeMhRig(fixtureConfig: Partial<FixtureConfig>): DmxRig {
      const cfg: FixtureConfig = {
        panHome: 50,
        panMin: 0,
        panMax: 255,
        panRangeDeg: 540,
        panDirectionCW: true,
        panStageDeg: 270,
        tiltHome: 50,
        tiltMin: 0,
        tiltMax: 255,
        tiltRangeDeg: 180,
        tiltStageDeg: 90,
        invertPan: false,
        invertTilt: false,
        ...fixtureConfig,
      }
      const lightingConfig: LightingConfiguration = {
        numLights: 1,
        lightLayout: { id: 'front-back', label: 'Front and Back' },
        strobeType: 'none' as import('../../types').ConfigStrobeType,
        frontLights: [
          {
            id: 'mh-1',
            fixtureId: 'mh-fixture-1',
            name: 'MH 1',
            label: 'MH 1',
            isStrobeEnabled: false,
            universe: 1,
            fixture: FixtureTypes.RGBMH,
            group: 'front',
            position: 1,
            channels: { red: 1, green: 2, blue: 3, masterDimmer: 4, pan: 5, tilt: 6 },
            config: cfg,
          },
        ],
        backLights: [],
        strobeLights: [],
      }
      return { id: 'test-rig', name: 'Test', active: true, config: lightingConfig }
    }

    function publishWithNoPanTilt(rig: DmxRig): Record<number, number> {
      const pub = new DmxPublisher(
        mockSenderManager as unknown as SenderManager,
        mockLightStateManager,
      )
      pub.updateActiveRigs([rig])
      const lights = new Map<string, RGBIO>()
      lights.set('mh-1', {
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 1,
        blendMode: 'replace',
      })
      pub.publish(lights)
      const [sentBuffer] = jest.mocked(mockSenderManager.send).mock.calls[0]
      return sentBuffer as Record<number, number>
    }

    it('non-inverted fixture: home fallback sends percentToDmx(panHome) directly', () => {
      const rig = makeMhRig({ invertPan: false, invertTilt: false, panHome: 50, tiltHome: 50 })
      const buf = publishWithNoPanTilt(rig)
      const expectedPan = percentToDmx(50, 0, 255)
      const expectedTilt = percentToDmx(50, 0, 255)
      expect(buf[5]).toBe(expectedPan)
      expect(buf[6]).toBe(expectedTilt)
    })

    it('inverted fixture: home fallback mirrors the logical home DMX', () => {
      const rig = makeMhRig({ invertPan: true, invertTilt: true, panHome: 50, tiltHome: 50 })
      const buf = publishWithNoPanTilt(rig)
      const logicalPan = percentToDmx(50, 0, 255)
      const logicalTilt = percentToDmx(50, 0, 255)
      const expectedPan = mirrorDmxForMovingHeadInvert(logicalPan, 0, 255)
      const expectedTilt = mirrorDmxForMovingHeadInvert(logicalTilt, 0, 255)
      expect(buf[5]).toBe(expectedPan)
      expect(buf[6]).toBe(expectedTilt)
    })

    it('inverted fixture: home fallback sends same wire DMX as a live pan/tilt equal to panHome', () => {
      const panHome = 35
      const tiltHome = 60
      const rig = makeMhRig({ invertPan: true, invertTilt: true, panHome, tiltHome })
      const bufFallback = publishWithNoPanTilt(rig)

      const pubLive = new DmxPublisher(
        { send: jest.fn().mockImplementation(() => Promise.resolve()) } as unknown as SenderManager,
        new LightStateManager(),
      )
      pubLive.updateActiveRigs([rig])
      const lightsLive = new Map<string, RGBIO>()
      lightsLive.set('mh-1', {
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 1,
        blendMode: 'replace',
        pan: panHome,
        tilt: tiltHome,
      })
      pubLive.publish(lightsLive)
      const [liveBuf] = jest.mocked(
        (pubLive as unknown as { _sender: { send: jest.Mock } })._sender.send,
      ).mock.calls[0]

      expect(bufFallback[5]).toBe((liveBuf as Record<number, number>)[5])
      expect(bufFallback[6]).toBe((liveBuf as Record<number, number>)[6])
    })

    it('only invertPan=true: pan is mirrored, tilt is not', () => {
      const panHome = 40
      const tiltHome = 60
      const rig = makeMhRig({ invertPan: true, invertTilt: false, panHome, tiltHome })
      const buf = publishWithNoPanTilt(rig)
      const expectedPan = mirrorDmxForMovingHeadInvert(percentToDmx(panHome, 0, 255), 0, 255)
      const expectedTilt = percentToDmx(tiltHome, 0, 255)
      expect(buf[5]).toBe(expectedPan)
      expect(buf[6]).toBe(expectedTilt)
    })

    it('only invertTilt=true: tilt is mirrored, pan is not', () => {
      const panHome = 40
      const tiltHome = 60
      const rig = makeMhRig({ invertPan: false, invertTilt: true, panHome, tiltHome })
      const buf = publishWithNoPanTilt(rig)
      const expectedPan = percentToDmx(panHome, 0, 255)
      const expectedTilt = mirrorDmxForMovingHeadInvert(percentToDmx(tiltHome, 0, 255), 0, 255)
      expect(buf[5]).toBe(expectedPan)
      expect(buf[6]).toBe(expectedTilt)
    })

    it('non-standard panMin/panMax range: inversion still produces correct wire DMX', () => {
      const panMin = 10
      const panMax = 200
      const panHome = 50
      const rig = makeMhRig({ invertPan: true, invertTilt: false, panMin, panMax, panHome })
      const buf = publishWithNoPanTilt(rig)
      const logicalDmx = percentToDmx(panHome, panMin, panMax)
      const expectedPan = mirrorDmxForMovingHeadInvert(logicalDmx, panMin, panMax)
      expect(buf[5]).toBe(expectedPan)
      expect(buf[5]).toBeGreaterThanOrEqual(panMin)
      expect(buf[5]).toBeLessThanOrEqual(panMax)
    })

    it('only-pan-inverted: home fallback sends same wire DMX as live pan=panHome, tilt=tiltHome', () => {
      const panHome = 30
      const tiltHome = 70
      const rig = makeMhRig({ invertPan: true, invertTilt: false, panHome, tiltHome })
      const bufFallback = publishWithNoPanTilt(rig)

      const pubLive = new DmxPublisher(
        { send: jest.fn().mockImplementation(() => Promise.resolve()) } as unknown as SenderManager,
        new LightStateManager(),
      )
      pubLive.updateActiveRigs([rig])
      const lightsLive = new Map<string, RGBIO>()
      lightsLive.set('mh-1', {
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 1,
        blendMode: 'replace',
        pan: panHome,
        tilt: tiltHome,
      })
      pubLive.publish(lightsLive)
      const [liveBuf] = jest.mocked(
        (pubLive as unknown as { _sender: { send: jest.Mock } })._sender.send,
      ).mock.calls[0]

      expect(bufFallback[5]).toBe((liveBuf as Record<number, number>)[5])
      expect(bufFallback[6]).toBe((liveBuf as Record<number, number>)[6])
    })
  })

  it('setManualBuffer sends raw buffer and publish is ignored until clearManualBuffer', () => {
    const config = createMockLightingConfig()
    publisher.updateActiveRigs([{ id: 'r1', name: 'R1', active: true, config }])
    mockSenderManager.send.mockClear()

    publisher.setManualBuffer({ 1: 128, 2: 64 })
    expect(mockSenderManager.send).toHaveBeenCalledWith(expect.objectContaining({ 1: 128, 2: 64 }))

    mockSenderManager.send.mockClear()
    const lights = new Map<string, import('../../types').RGBIO>()
    lights.set('test-fixture-1', createMockRGBIP({ red: 255, green: 0, blue: 0 }))
    publisher.publish(lights)
    expect(mockSenderManager.send).not.toHaveBeenCalled()

    publisher.clearManualBuffer()
    mockSenderManager.send.mockClear()
    publisher.publish(lights)
    expect(mockSenderManager.send).toHaveBeenCalled()
  })
})
