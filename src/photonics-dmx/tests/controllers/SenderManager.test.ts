import { SenderManager } from '../../controllers/SenderManager'
import type { BaseSender } from '../../senders/BaseSender'
import { EnttecProSender } from '../../senders/EnttecProSender'

jest.mock('../../senders/EnttecProSender', () => ({ EnttecProSender: jest.fn() }))

/**
 * Stands in for the Enttec Pro driver with a start() the test settles by hand, recording the rate
 * each sender was built with.
 */
function controllableEnttec(): {
  speeds: number[]
  settleStart: (index: number, outcome?: Error) => void
  startsBegun: () => number
} {
  const speeds: number[] = []
  const settles: Array<(outcome?: Error) => void> = []
  jest.mocked(EnttecProSender).mockImplementation(((
    _port: string,
    options: { dmxSpeed: number },
  ) => {
    speeds.push(options.dmxSpeed)
    return {
      start: jest.fn(
        () =>
          new Promise<void>((resolve, reject) => {
            settles.push((outcome) => (outcome ? reject(outcome) : resolve()))
          }),
      ),
      stop: jest.fn(async () => {}),
      send: jest.fn(),
      removeSendError: jest.fn(),
      onSendError: jest.fn(),
      getConfiguredPort: jest.fn(() => null),
      getUniverse: jest.fn(() => 0),
    }
  }) as never)
  return {
    speeds,
    settleStart: (index, outcome) => settles[index](outcome),
    startsBegun: () => settles.length,
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

function makeManager(): SenderManager {
  return new SenderManager({
    broadcaster: { emit: () => {} },
    hasReceivers: () => false,
  })
}

function injectSender(mgr: SenderManager, id: string, sender: BaseSender): void {
  ;(mgr as unknown as { enabledSenders: Map<string, BaseSender> }).enabledSenders.set(id, sender)
}

describe('SenderManager.disableAllSenders ordering', () => {
  it('detaches every sender before any stop() runs, so no frame routes during the bulk disable', async () => {
    const mgr = makeManager()
    const routedDuringStop: string[] = []

    const makeFake = (id: string): BaseSender => {
      const fake = {
        start: jest.fn(),
        stop: jest.fn(async () => {
          // From the moment the bulk disable starts, a concurrently published frame must be
          // dropped for EVERY sender — including ones whose stop() has not begun yet.
          await mgr.send('artnet', { 1: 255 })
          await mgr.send('sacn', { 1: 255 })
          for (const [otherId, other] of Object.entries(fakes)) {
            if ((other.send as jest.Mock).mock.calls.length > 0) routedDuringStop.push(otherId)
          }
        }),
        send: jest.fn(),
        removeSendError: jest.fn(),
        onSendError: jest.fn(),
        getUniverse: jest.fn(() => 1),
      } as unknown as BaseSender
      injectSender(mgr, id, fake)
      return fake
    }
    const fakes: Record<string, BaseSender> = {
      artnet: makeFake('artnet'),
      sacn: makeFake('sacn'),
    }

    await mgr.disableAllSenders()

    expect(routedDuringStop).toEqual([])
    expect(fakes.artnet.stop).toHaveBeenCalledTimes(1)
    expect(fakes.sacn.stop).toHaveBeenCalledTimes(1)
    expect(fakes.artnet.removeSendError).toHaveBeenCalledTimes(1)
    expect(mgr.isSenderEnabled('artnet')).toBe(false)
    expect(mgr.isSenderEnabled('sacn')).toBe(false)
  })

  it('a rejecting stop() does not abort the others', async () => {
    const mgr = makeManager()
    const bad = {
      start: jest.fn(),
      stop: jest.fn(async () => {
        throw new Error('stop failed')
      }),
      send: jest.fn(),
      removeSendError: jest.fn(),
      onSendError: jest.fn(),
      getUniverse: jest.fn(() => 1),
    } as unknown as BaseSender
    const good = {
      start: jest.fn(),
      stop: jest.fn(async () => {}),
      send: jest.fn(),
      removeSendError: jest.fn(),
      onSendError: jest.fn(),
      getUniverse: jest.fn(() => 1),
    } as unknown as BaseSender
    injectSender(mgr, 'artnet', bad)
    injectSender(mgr, 'sacn', good)

    await expect(mgr.disableAllSenders()).resolves.toBeUndefined()
    expect(good.stop).toHaveBeenCalledTimes(1)
    expect(mgr.isSenderEnabled('artnet')).toBe(false)
    expect(mgr.isSenderEnabled('sacn')).toBe(false)
  })
})

describe('SenderManager.disableSender ordering', () => {
  it('detaches the sender before stop() runs, so the publisher cannot route a frame over the blackout', async () => {
    const mgr = makeManager()
    let enabledDuringStop: boolean | null = null
    let routedDuringStop = false

    const sender = {
      start: jest.fn(),
      stop: jest.fn(async () => {
        // stop() blacks out then waits before closing; during this window the publisher must no
        // longer be able to reach this sender.
        enabledDuringStop = mgr.isSenderEnabled('artnet')
        await mgr.send('artnet', { 1: 255 }) // a live frame published mid-stop must be dropped
        if ((sender.send as jest.Mock).mock.calls.length > 0) routedDuringStop = true
      }),
      send: jest.fn(),
      removeSendError: jest.fn(),
      onSendError: jest.fn(),
      getUniverse: jest.fn(() => 1),
    } as unknown as BaseSender
    injectSender(mgr, 'artnet', sender)

    expect(mgr.isSenderEnabled('artnet')).toBe(true)
    await mgr.disableSender('artnet')

    expect(enabledDuringStop).toBe(false)
    expect(routedDuringStop).toBe(false)
    expect(sender.stop).toHaveBeenCalledTimes(1)
    expect(mgr.isSenderEnabled('artnet')).toBe(false)
  })
})

describe('SenderManager.restartSender on a sender still starting', () => {
  const config = (dmxSpeed: number) => ({
    sender: 'enttecpro' as const,
    devicePath: 'COM3',
    dmxSpeed,
  })

  it('waits for the start to finish, then restarts with the new config', async () => {
    const enttec = controllableEnttec()
    const mgr = makeManager()

    const enabling = mgr.enableSender('enttecpro', 'enttecpro', config(40))
    const restarting = mgr.restartSender('enttecpro', config(20))
    await flush()
    expect(enttec.speeds).toEqual([40])

    enttec.settleStart(0)
    await enabling
    for (let i = 0; i < 10 && enttec.startsBegun() < 2; i += 1) {
      await flush()
    }
    enttec.settleStart(1)
    await restarting

    expect(enttec.speeds).toEqual([40, 20])
    expect(mgr.getEnabledSenders()).toEqual(['enttecpro'])
  })

  it('leaves a sender whose start failed off', async () => {
    const enttec = controllableEnttec()
    const mgr = makeManager()

    const enabling = mgr.enableSender('enttecpro', 'enttecpro', config(40))
    const restarting = mgr.restartSender('enttecpro', config(20))
    await flush()

    enttec.settleStart(0, new Error('no device'))
    await expect(enabling).rejects.toThrow('no device')
    await restarting

    expect(enttec.speeds).toEqual([40])
    expect(mgr.isSenderEnabled('enttecpro')).toBe(false)
  })
})
