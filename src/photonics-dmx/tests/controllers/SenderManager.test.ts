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
