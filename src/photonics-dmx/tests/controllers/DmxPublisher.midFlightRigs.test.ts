/**
 * Mid-flight rig add/remove via `setRigChains` + `updateActiveRigs`. Asserts the lifecycle
 * properties the per-rig pipeline depends on:
 *  - A new chain's emissions reach the wire once its subscription is installed.
 *  - A removed chain's emissions go nowhere (subscription unwired, aggregated state cleared).
 *  - `updateActiveRigs` removing a rig stops its channels from being published, even if
 *    its chain subscription is still attached (e.g. transient state during a config update).
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

function makeRig(id: string, lightId: string, channelBase: number): DmxRig {
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
  return { id, name: id, active: true, config }
}

function rgbio(overrides: Partial<RGBIO> = {}): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...overrides }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('DmxPublisher mid-flight rig add/remove', () => {
  it('adding a rig: new chain subscription drives publish after setRigChains', async () => {
    const sender = makeMockSender({ wireSenders: ['sacn'] })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      null,
      new StrobeStateManager(),
    )
    const rigA = makeRig('A', 'la', 1)
    const lsmA = new LightStateManager()
    publisher.updateActiveRigs([rigA])
    publisher.setRigChains([{ rigId: 'A', lightStateManager: lsmA }])

    lsmA.setLightState('la', rgbio({ red: 200, intensity: 255 }))
    lsmA.publishLightStates()
    await flushMicrotasks()
    expect(lastBufferFor(sender, 'sacn')!).toMatchObject({ 1: 255, 2: 200 })

    // Add Rig B mid-flight: update the active-rig list, then resubscribe with both chains.
    const rigB = makeRig('B', 'lb', 10)
    const lsmB = new LightStateManager()
    publisher.updateActiveRigs([rigA, rigB])
    publisher.setRigChains([
      { rigId: 'A', lightStateManager: lsmA },
      { rigId: 'B', lightStateManager: lsmB },
    ])

    // Rig B now drives sACN — its lights show up in the next published frame.
    sender.send.mockClear()
    lsmA.setLightState('la', rgbio({ red: 200, intensity: 255 }))
    lsmA.publishLightStates()
    lsmB.setLightState('lb', rgbio({ blue: 150, intensity: 128 }))
    lsmB.publishLightStates()
    await flushMicrotasks()
    const buf = lastBufferFor(sender, 'sacn')!
    expect(buf).toMatchObject({ 1: 255, 2: 200, 10: 128, 13: 150 })
  })

  it('removing a rig: chain unsubscribed, aggregated state cleared, no further publishes from old LSM', async () => {
    const sender = makeMockSender({ wireSenders: ['sacn'] })
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
      { rigId: 'A', lightStateManager: lsmA },
      { rigId: 'B', lightStateManager: lsmB },
    ])

    // Prime both rigs.
    lsmA.setLightState('la', rgbio({ red: 200, intensity: 255 }))
    lsmA.publishLightStates()
    lsmB.setLightState('lb', rgbio({ blue: 150, intensity: 128 }))
    lsmB.publishLightStates()
    await flushMicrotasks()

    // Remove Rig B. The next emission from B's LSM should NOT trigger a publish (subscription
    // torn down) and the aggregated map should have been cleared so B's stale lights don't
    // bleed into A's frame.
    publisher.updateActiveRigs([rigA])
    publisher.setRigChains([{ rigId: 'A', lightStateManager: lsmA }])

    sender.send.mockClear()
    lsmB.setLightState('lb', rgbio({ blue: 99, intensity: 99 }))
    lsmB.publishLightStates()
    await flushMicrotasks()
    expect(sender.send).not.toHaveBeenCalled()

    // Rig A's next emission carries only Rig A's channels — Rig B's stale aggregated state
    // was cleared by setRigChains.
    lsmA.setLightState('la', rgbio({ red: 250, intensity: 200 }))
    lsmA.publishLightStates()
    await flushMicrotasks()
    const buf = lastBufferFor(sender, 'sacn')!
    expect(Object.keys(buf).sort()).toEqual(['1', '2', '3', '4'])
    expect(buf).toMatchObject({ 1: 200, 2: 250 })
  })

  it('updateActiveRigs alone (without setRigChains) stops a removed rig from reaching the wire', async () => {
    // This mirrors a transient state during config refresh: publisher knows the new active
    // rig set but the chain subscription list hasn't been refreshed yet. The removed rig's
    // chain may still emit (e.g. mid-tick), but its channels must not land on the wire
    // because its DmxLightManager is no longer in `_rigManagers`.
    const sender = makeMockSender({ wireSenders: ['sacn'] })
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
      { rigId: 'A', lightStateManager: lsmA },
      { rigId: 'B', lightStateManager: lsmB },
    ])

    publisher.updateActiveRigs([rigA])

    sender.send.mockClear()
    lsmB.setLightState('lb', rgbio({ blue: 99, intensity: 99 }))
    lsmB.publishLightStates()
    await flushMicrotasks()

    // A publish happened (B's chain is still subscribed), but B's channels (10..13) are
    // absent because `_rigManagers` no longer has Rig B.
    const buf = lastBufferFor(sender, 'sacn')
    if (buf !== null) {
      for (const ch of [10, 11, 12, 13]) {
        expect(buf[ch]).toBeUndefined()
      }
    }
  })

  it('shutdown drops all chain subscriptions and clears aggregated state', async () => {
    const sender = makeMockSender({ wireSenders: ['sacn'] })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      null,
      new StrobeStateManager(),
    )
    const lsmA = new LightStateManager()
    publisher.updateActiveRigs([makeRig('A', 'la', 1)])
    publisher.setRigChains([{ rigId: 'A', lightStateManager: lsmA }])

    await publisher.shutdown()

    sender.send.mockClear()
    lsmA.setLightState('la', rgbio({ red: 99, intensity: 99 }))
    lsmA.publishLightStates()
    await flushMicrotasks()
    expect(sender.send).not.toHaveBeenCalled()
  })
})
