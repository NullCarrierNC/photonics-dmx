/**
 * Per-rig sender-routing + per-sender governor-isolation tests for DmxPublisher.
 *
 * Covers the rig-output-routing feature: each `DmxRig` may declare `outputs: WireSenderId[]` to
 * restrict which wire senders carry it. The publisher builds one buffer per enabled sender slot
 * and runs each slot's governor independently. IPC is always populated for every active rig.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher, type PublisherTiming } from '../../controllers/DmxPublisher'
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

type Handle = ReturnType<typeof setTimeout>

class FakeTiming implements PublisherTiming {
  public t = 0
  private timers: Array<{ id: number; fireAt: number; cb: () => void }> = []
  private nextId = 1
  now(): number {
    return this.t
  }
  setTimer(cb: () => void, ms: number): Handle {
    const id = this.nextId++
    this.timers.push({ id, fireAt: this.t + ms, cb })
    return id as unknown as Handle
  }
  clearTimer(handle: Handle): void {
    const id = handle as unknown as number
    this.timers = this.timers.filter((x) => x.id !== id)
  }
  advance(ms: number): void {
    this.t += ms
    const due = this.timers.filter((x) => x.fireAt <= this.t).sort((a, b) => a.fireAt - b.fireAt)
    this.timers = this.timers.filter((x) => x.fireAt > this.t)
    for (const d of due) {
      d.cb()
    }
  }
}

interface SendCall {
  slotId: WireSenderId
  buffer: Record<number, number>
}

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

function callsFor(sender: MockSender, slotId: WireSenderId): SendCall[] {
  return sender.send.mock.calls
    .filter((c) => (c[0] as WireSenderId) === slotId)
    .map((c) => ({ slotId: c[0] as WireSenderId, buffer: c[1] as Record<number, number> }))
}

function lastBufferFor(sender: MockSender, slotId: WireSenderId): Record<number, number> | null {
  const list = callsFor(sender, slotId)
  return list.length === 0 ? null : list[list.length - 1]!.buffer
}

/** Most-recent `kind: 'rigs'` payload's rigBuffers (or null when none has been sent). */
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

/** Builds an RGB rig with one light at channels 1..4. */
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

describe('DmxPublisher per-rig sender routing', () => {
  it('routes Rig A to sACN-only and Rig B to OpenDMX-only without cross-talk', () => {
    const sender = makeMockSender({ wireSenders: ['sacn', 'opendmx'] })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
    )
    const rigA = makeRig('A', 'la', 1, ['sacn'])
    const rigB = makeRig('B', 'lb', 10, ['opendmx'])
    publisher.updateActiveRigs([rigA, rigB])

    publisher.publish(
      new Map<string, RGBIO>([
        ['la', rgbio({ red: 200, intensity: 255 })],
        ['lb', rgbio({ blue: 150, intensity: 128 })],
      ]),
    )

    const sacnBuf = lastBufferFor(sender, 'sacn')!
    const opendmxBuf = lastBufferFor(sender, 'opendmx')!
    expect(sacnBuf).toEqual({ 1: 255, 2: 200, 3: 0, 4: 0 })
    expect(opendmxBuf).toEqual({ 10: 128, 11: 0, 12: 0, 13: 150 })
  })

  it('rig with outputs: undefined publishes to every enabled wire sender (legacy default)', () => {
    const sender = makeMockSender({ wireSenders: ['sacn', 'artnet', 'opendmx'] })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
    )
    publisher.updateActiveRigs([makeRig('default', 'l', 1)]) // no outputs
    publisher.publish(new Map<string, RGBIO>([['l', rgbio({ red: 50, intensity: 100 })]]))

    for (const slot of ['sacn', 'artnet', 'opendmx'] as const) {
      const buf = lastBufferFor(sender, slot)
      expect(buf).toEqual({ 1: 100, 2: 50, 3: 0, 4: 0 })
    }
  })

  it('rig outputs referencing a disabled sender are silently dropped (no error)', () => {
    // OpenDMX is not enabled — a rig that only targets opendmx publishes nothing on the wire.
    const sender = makeMockSender({ wireSenders: ['sacn'] })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
    )
    publisher.updateActiveRigs([makeRig('B', 'lb', 1, ['opendmx'])])
    publisher.publish(new Map<string, RGBIO>([['lb', rgbio({ red: 100, intensity: 200 })]]))

    expect(callsFor(sender, 'sacn')).toHaveLength(0)
    expect(callsFor(sender, 'opendmx')).toHaveLength(0)
  })

  it('empty outputs array publishes nowhere on the wire (but still IPC when enabled)', () => {
    const sender = makeMockSender({ wireSenders: ['sacn'], ipcEnabled: true })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
    )
    publisher.updateActiveRigs([makeRig('quiet', 'l', 1, [])])
    publisher.publish(new Map<string, RGBIO>([['l', rgbio({ red: 80, intensity: 200 })]]))

    expect(callsFor(sender, 'sacn')).toHaveLength(0)
    const rigBuffers = lastIpcRigBuffers(sender)!
    expect(rigBuffers).toHaveProperty('quiet')
    expect(rigBuffers['quiet']).toEqual({ 1: 200, 2: 80, 3: 0, 4: 0 })
  })

  it('IPC sees a separate buffer for every active rig (no merging, no collisions)', () => {
    // This is the regression test for the channel-collision bug: when Rig A and Rig B both
    // write to the same channel number (because they target different physical universes),
    // the IPC payload must keep each rig's buffer independent so the renderer can pick one
    // without the other's values leaking in.
    const sender = makeMockSender({ wireSenders: ['sacn', 'opendmx'], ipcEnabled: true })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
    )
    const rigA = makeRig('A', 'la', 1, ['sacn']) // channels 1-4
    const rigB = makeRig('B', 'lb', 1, ['opendmx']) // channels 1-4 — would collide if merged
    publisher.updateActiveRigs([rigA, rigB])

    publisher.publish(
      new Map<string, RGBIO>([
        ['la', rgbio({ red: 200, intensity: 255 })],
        ['lb', rgbio({ blue: 150, intensity: 128 })],
      ]),
    )

    const rigBuffers = lastIpcRigBuffers(sender)!
    expect(rigBuffers['A']).toEqual({ 1: 255, 2: 200, 3: 0, 4: 0 })
    expect(rigBuffers['B']).toEqual({ 1: 128, 2: 0, 3: 0, 4: 150 })
  })

  it('two rigs routed to the same sender: last-writer-wins on overlapping channels', () => {
    // Channel overlap on the same sender is a documented user error — we don't try to fix it
    // here. The contract is "last write wins by iteration order"; this test pins that behaviour
    // so it can't regress silently.
    const sender = makeMockSender({ wireSenders: ['sacn'] })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
    )
    const rigA = makeRig('A', 'la', 1, ['sacn']) // channels 1-4
    const rigB = makeRig('B', 'lb', 1, ['sacn']) // channels 1-4 (collide!)
    publisher.updateActiveRigs([rigA, rigB])

    publisher.publish(
      new Map<string, RGBIO>([
        ['la', rgbio({ red: 200, intensity: 255 })],
        ['lb', rgbio({ blue: 150, intensity: 128 })],
      ]),
    )

    // B was processed second → its writes win.
    const sacnBuf = lastBufferFor(sender, 'sacn')!
    expect(sacnBuf).toEqual({ 1: 128, 2: 0, 3: 0, 4: 150 })
  })

  it('disables a sender mid-stream: governor slot is cleaned up, no stale traffic', () => {
    const sender = makeMockSender({ wireSenders: ['sacn', 'opendmx'] })
    const timing = new FakeTiming()
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
      { outputRateHz: 40, timing }, // 25 ms interval, governor active
    )
    publisher.updateActiveRigs([makeRig('A', 'la', 1)]) // outputs undefined → both

    publisher.publish(new Map<string, RGBIO>([['la', rgbio({ red: 10, intensity: 10 })]]))
    expect(callsFor(sender, 'sacn')).toHaveLength(1)
    expect(callsFor(sender, 'opendmx')).toHaveLength(1)

    // Simulate user disabling OpenDMX between frames.
    sender.getEnabledWireSenders.mockReturnValue(['sacn'])

    timing.advance(30) // past the gate
    publisher.publish(new Map<string, RGBIO>([['la', rgbio({ red: 20, intensity: 20 })]]))

    // sACN got the new frame; OpenDMX got nothing more.
    expect(callsFor(sender, 'sacn')).toHaveLength(2)
    expect(callsFor(sender, 'opendmx')).toHaveLength(1)
  })

  it('rig with active: false is excluded from both wire and IPC', () => {
    const sender = makeMockSender({ wireSenders: ['sacn'], ipcEnabled: true })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
    )
    const rig = makeRig('A', 'la', 1)
    rig.active = false
    publisher.updateActiveRigs([rig])
    publisher.publish(new Map<string, RGBIO>([['la', rgbio({ red: 99, intensity: 99 })]]))
    expect(callsFor(sender, 'sacn')).toHaveLength(0)
    // IPC still receives a payload each frame, but the inactive rig must not appear in it.
    const rigBuffers = lastIpcRigBuffers(sender)
    expect(rigBuffers).not.toBeNull()
    expect(rigBuffers!['A']).toBeUndefined()
  })
})

describe('DmxPublisher per-sender governor isolation', () => {
  it('dirty-skip on one sender does not suppress sends to other senders', () => {
    // Identical frames on sACN should dirty-skip, but a separately-routed rig changing on
    // OpenDMX must still propagate.
    const sender = makeMockSender({ wireSenders: ['sacn', 'opendmx'] })
    const timing = new FakeTiming()
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
      { outputRateHz: 40, timing },
    )
    const rigA = makeRig('A', 'la', 1, ['sacn'])
    const rigB = makeRig('B', 'lb', 10, ['opendmx'])
    publisher.updateActiveRigs([rigA, rigB])

    // Initial leading-edge sends to both slots.
    publisher.publish(
      new Map<string, RGBIO>([
        ['la', rgbio({ red: 100, intensity: 200 })],
        ['lb', rgbio({ blue: 50, intensity: 100 })],
      ]),
    )
    expect(callsFor(sender, 'sacn')).toHaveLength(1)
    expect(callsFor(sender, 'opendmx')).toHaveLength(1)

    // Advance past the gate; keep Rig A identical, change Rig B.
    timing.advance(30)
    publisher.publish(
      new Map<string, RGBIO>([
        ['la', rgbio({ red: 100, intensity: 200 })], // same
        ['lb', rgbio({ blue: 75, intensity: 100 })], // changed
      ]),
    )
    // sACN dirty-skips (identical); OpenDMX sends.
    expect(callsFor(sender, 'sacn')).toHaveLength(1)
    expect(callsFor(sender, 'opendmx')).toHaveLength(2)
    expect(lastBufferFor(sender, 'opendmx')![13]).toBe(75)
  })

  it('setManualBuffer emits a `kind: manual` IPC payload alongside the wire broadcast', () => {
    const sender = makeMockSender({ wireSenders: ['sacn'], ipcEnabled: true })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
    )
    publisher.setManualBuffer({ 1: 200, 2: 64 })

    // Wire send went out (clamped & normalised).
    expect(sender.send).toHaveBeenCalledWith('sacn', expect.objectContaining({ 1: 200, 2: 64 }))

    // IPC saw the same buffer tagged as manual — DmxConsole's loopback contract.
    const ipcCalls = sender.sendIpc.mock.calls
    expect(ipcCalls.length).toBeGreaterThan(0)
    const payload = ipcCalls[ipcCalls.length - 1]![0]
    expect(payload.kind).toBe('manual')
    if (payload.kind === 'manual') {
      expect(payload.buffer[1]).toBe(200)
      expect(payload.buffer[2]).toBe(64)
    }
  })

  it('shutdown sends a `kind: manual` blackout payload to IPC', async () => {
    const sender = makeMockSender({ wireSenders: ['sacn'], ipcEnabled: true })
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
    )

    await publisher.shutdown()

    // The publisher emits a manual blackout to every enabled wire sender AND to IPC.
    const lastIpcCall = sender.sendIpc.mock.calls[sender.sendIpc.mock.calls.length - 1]!
    const payload = lastIpcCall[0]
    expect(payload.kind).toBe('manual')
    if (payload.kind === 'manual') {
      // All 512 channels at 0.
      expect(Object.keys(payload.buffer).length).toBe(512)
      expect(payload.buffer[1]).toBe(0)
      expect(payload.buffer[512]).toBe(0)
    }
  })

  it('per-slot trailing timer fires only for the slot that scheduled it', () => {
    const sender = makeMockSender({ wireSenders: ['sacn', 'opendmx'] })
    const timing = new FakeTiming()
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
      { outputRateHz: 40, timing }, // 25 ms gate
    )
    const rigA = makeRig('A', 'la', 1, ['sacn'])
    const rigB = makeRig('B', 'lb', 10, ['opendmx'])
    publisher.updateActiveRigs([rigA, rigB])

    publisher.publish(
      new Map<string, RGBIO>([
        ['la', rgbio({ red: 1, intensity: 1 })],
        ['lb', rgbio({ blue: 1, intensity: 1 })],
      ]),
    )
    // 1 leading send to each.
    expect(callsFor(sender, 'sacn')).toHaveLength(1)
    expect(callsFor(sender, 'opendmx')).toHaveLength(1)

    timing.advance(5) // inside gate
    publisher.publish(
      new Map<string, RGBIO>([
        ['la', rgbio({ red: 10, intensity: 10 })], // change on sACN — defers
        ['lb', rgbio({ blue: 1, intensity: 1 })], // identical on OpenDMX — dirty-skipped
      ]),
    )
    // No new sends yet (sACN deferred; OpenDMX dirty-skipped).
    expect(callsFor(sender, 'sacn')).toHaveLength(1)
    expect(callsFor(sender, 'opendmx')).toHaveLength(1)

    timing.advance(25) // trigger sACN's trailing timer
    expect(callsFor(sender, 'sacn')).toHaveLength(2)
    expect(lastBufferFor(sender, 'sacn')![2]).toBe(10)
    // OpenDMX trailing was never armed.
    expect(callsFor(sender, 'opendmx')).toHaveLength(1)
  })
})
