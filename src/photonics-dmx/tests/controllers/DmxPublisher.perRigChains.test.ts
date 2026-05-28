/**
 * `DmxPublisher.setRigChains` integration: subscribing the publisher to multiple chains'
 * `LightStateManager`s aggregates their per-rig emissions and produces correct per-rig wire
 * and IPC buffers. Covers the production wiring used by `ControllerManager.initializeRigChains`.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxRig,
  type LightingConfiguration,
  type RGBIO,
  type WireSenderId,
} from '../../types'
import type { DmxValuesPayload } from '../../../shared/ipcTypes'

interface MockSender {
  send: jest.Mock<(slotId: WireSenderId, buffer: Record<number, number>) => Promise<void>>
  sendIpc: jest.Mock<(payload: DmxValuesPayload) => void>
  getEnabledWireSenders: jest.Mock<() => WireSenderId[]>
  isIpcEnabled: jest.Mock<() => boolean>
}

function makeMockSender(opts: { wireSenders: WireSenderId[]; ipcEnabled?: boolean }): MockSender {
  return {
    send: jest.fn<(slotId: WireSenderId, buffer: Record<number, number>) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    sendIpc: jest.fn<(payload: DmxValuesPayload) => void>(),
    getEnabledWireSenders: jest.fn<() => WireSenderId[]>(() => [...opts.wireSenders]),
    isIpcEnabled: jest.fn<() => boolean>(() => opts.ipcEnabled === true),
  }
}

function lastBufferFor(sender: MockSender, slotId: WireSenderId): Record<number, number> | null {
  const calls = sender.send.mock.calls.filter((c) => (c[0] as WireSenderId) === slotId)
  return calls.length === 0 ? null : (calls[calls.length - 1]![1] as Record<number, number>)
}

function lastIpcRigBuffers(sender: MockSender): Record<string, Record<number, number>> | null {
  const calls = sender.sendIpc.mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    const payload = calls[i]![0] as DmxValuesPayload
    if (payload.kind === 'rigs') {
      return payload.rigBuffers
    }
  }
  return null
}

/** RGB rig with one light at channels [base..base+3]. */
function makeRig(
  id: string,
  lightId: string,
  channelBase: number,
  outputs?: WireSenderId[],
): DmxRig {
  const config: LightingConfiguration = {
    numLights: 1,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights: [
      {
        id: lightId,
        fixtureId: `tpl-${id}`,
        position: 1,
        name: lightId,
        label: lightId,
        fixture: FixtureTypes.RGB,
        isStrobeEnabled: false,
        group: 'front',
        universe: 1,
        mount: 'floor',
        channels: {
          masterDimmer: channelBase,
          red: channelBase + 1,
          green: channelBase + 2,
          blue: channelBase + 3,
        } as unknown as DmxRig['config']['frontLights'][number]['channels'],
      },
    ],
    backLights: [],
    strobeLights: [],
  }
  const rig: DmxRig = { id, name: id, active: true, config }
  if (outputs !== undefined) {
    rig.outputs = outputs
  }
  return rig
}

function rgbio(overrides: Partial<RGBIO> = {}): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...overrides }
}

/** Microtask flush — `setRigChains` coalesces synchronous emissions via `queueMicrotask`. */
async function flushMicrotasks(): Promise<void> {
  // Two awaits drain the microtask queue reliably across runtimes.
  await Promise.resolve()
  await Promise.resolve()
}

describe('DmxPublisher.setRigChains (per-rig chain subscriptions)', () => {
  it('aggregates per-chain emissions into one publish per tick', async () => {
    const sender = makeMockSender({ wireSenders: ['sacn'], ipcEnabled: true })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      null,
      new StrobeStateManager(),
    )
    const rigA = makeRig('A', 'la', 1)
    const rigB = makeRig('B', 'lb', 10)
    const lsmA = new LightStateManager()
    const lsmB = new LightStateManager()
    publisher.updateActiveRigs([rigA, rigB])
    publisher.setRigChains([
      { rigId: rigA.id, lightStateManager: lsmA },
      { rigId: rigB.id, lightStateManager: lsmB },
    ])

    // Both chains emit synchronously on the same tick — coalesced into one publish.
    lsmA.setLightState('la', rgbio({ red: 200, intensity: 255 }))
    lsmA.publishLightStates()
    lsmB.setLightState('lb', rgbio({ blue: 150, intensity: 128 }))
    lsmB.publishLightStates()

    expect(sender.send).not.toHaveBeenCalled()
    await flushMicrotasks()

    // One sACN send carrying both rigs' channels.
    expect(sender.send).toHaveBeenCalledTimes(1)
    const sacnBuf = lastBufferFor(sender, 'sacn')!
    expect(sacnBuf).toMatchObject({ 1: 255, 2: 200, 10: 128, 13: 150 })

    // IPC payload has one entry per rig with that rig's channels only.
    const rigBuffers = lastIpcRigBuffers(sender)!
    expect(rigBuffers['A']).toEqual({ 1: 255, 2: 200, 3: 0, 4: 0 })
    expect(rigBuffers['B']).toEqual({ 10: 128, 11: 0, 12: 0, 13: 150 })
  })

  it('per-rig outputs routing still applies under chain subscriptions', async () => {
    const sender = makeMockSender({ wireSenders: ['sacn', 'opendmx'], ipcEnabled: true })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      null,
      new StrobeStateManager(),
    )
    const rigA = makeRig('A', 'la', 1, ['sacn'])
    const rigB = makeRig('B', 'lb', 10, ['opendmx'])
    const lsmA = new LightStateManager()
    const lsmB = new LightStateManager()
    publisher.updateActiveRigs([rigA, rigB])
    publisher.setRigChains([
      { rigId: rigA.id, lightStateManager: lsmA },
      { rigId: rigB.id, lightStateManager: lsmB },
    ])

    lsmA.setLightState('la', rgbio({ red: 200, intensity: 255 }))
    lsmA.publishLightStates()
    lsmB.setLightState('lb', rgbio({ blue: 150, intensity: 128 }))
    lsmB.publishLightStates()
    await flushMicrotasks()

    // Rig A → sACN-only; Rig B → OpenDMX-only.
    expect(lastBufferFor(sender, 'sacn')!).toEqual({ 1: 255, 2: 200, 3: 0, 4: 0 })
    expect(lastBufferFor(sender, 'opendmx')!).toEqual({ 10: 128, 11: 0, 12: 0, 13: 150 })
  })

  it('tearing down chain subscriptions on second setRigChains stops the prior chains', async () => {
    const sender = makeMockSender({ wireSenders: ['sacn'] })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      null,
      new StrobeStateManager(),
    )
    const rigA = makeRig('A', 'la', 1)
    const lsmA1 = new LightStateManager()
    publisher.updateActiveRigs([rigA])
    publisher.setRigChains([{ rigId: rigA.id, lightStateManager: lsmA1 }])

    // After a second setRigChains with a different LSM, the original LSM should no longer
    // drive publishes (subscription torn down).
    const lsmA2 = new LightStateManager()
    publisher.setRigChains([{ rigId: rigA.id, lightStateManager: lsmA2 }])

    sender.send.mockClear()
    lsmA1.setLightState('la', rgbio({ red: 50, intensity: 50 }))
    lsmA1.publishLightStates()
    await flushMicrotasks()
    expect(sender.send).not.toHaveBeenCalled()

    // The new LSM still drives publishes.
    lsmA2.setLightState('la', rgbio({ red: 100, intensity: 200 }))
    lsmA2.publishLightStates()
    await flushMicrotasks()
    expect(sender.send).toHaveBeenCalledTimes(1)
  })

  it('legacy single-source LightStateManager works as before when setRigChains is never called', () => {
    const sender = makeMockSender({ wireSenders: ['sacn'] })
    const lsm = new LightStateManager()
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      lsm,
      new StrobeStateManager(),
    )
    publisher.updateActiveRigs([makeRig('A', 'la', 1)])
    lsm.setLightState('la', rgbio({ red: 200, intensity: 255 }))
    lsm.publishLightStates()
    // Single-source path is synchronous; no microtask flush required.
    expect(lastBufferFor(sender, 'sacn')!).toEqual({ 1: 255, 2: 200, 3: 0, 4: 0 })
  })

  it('calling setRigChains tears down a prior single-source subscription', async () => {
    const sender = makeMockSender({ wireSenders: ['sacn'] })
    const legacyLsm = new LightStateManager()
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      legacyLsm,
      new StrobeStateManager(),
    )
    publisher.updateActiveRigs([makeRig('A', 'la', 1)])

    const chainLsm = new LightStateManager()
    publisher.setRigChains([{ rigId: 'A', lightStateManager: chainLsm }])

    // The legacy LSM should no longer trigger a publish.
    sender.send.mockClear()
    legacyLsm.setLightState('la', rgbio({ red: 99, intensity: 99 }))
    legacyLsm.publishLightStates()
    await flushMicrotasks()
    expect(sender.send).not.toHaveBeenCalled()
  })
})
