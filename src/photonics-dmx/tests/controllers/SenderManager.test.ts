import { SenderManager } from '../../controllers/SenderManager'
import type { BaseSender } from '../../senders/BaseSender'

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
          mgr.send('artnet', { 1: 255 })
          mgr.send('sacn', { 1: 255 })
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
        mgr.send('artnet', { 1: 255 }) // a live frame published mid-stop must be dropped
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
