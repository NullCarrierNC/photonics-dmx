import { describe, expect, it, jest } from '@jest/globals'
import { SenderManager, type PublisherSenders } from '../../controllers/SenderManager'
import { WIRE_SENDER_IDS } from '../../types'
import { fakeSenderManager } from './fakeSenderManager'

jest.mock('../../senders/EnttecProSender', () => ({
  EnttecProSender: class {
    start = async (): Promise<void> => {}
    stop = async (): Promise<void> => {}
    send = async (): Promise<boolean> => true
    onSendError = (): void => {}
    removeSendError = (): void => {}
    getConfiguredPort = (): null => null
    getUniverse = (): number => 0
  },
}))

async function realManager(): Promise<PublisherSenders> {
  const manager = new SenderManager({ broadcaster: { emit: () => {} }, hasReceivers: () => false })
  await manager.enableSender('enttecpro', 'enttecpro', {
    sender: 'enttecpro',
    devicePath: 'COM3',
  })
  return manager
}

async function fake(): Promise<PublisherSenders> {
  return fakeSenderManager({ getEnabledWireSenders: () => ['enttecpro'] })
}

describe.each([
  ['the real sender manager', realManager],
  ['the shared fake', fake],
])('%s', (_name, subject) => {
  it('lists the one enabled wire sender', async () => {
    const senders = await subject()

    expect(senders.getEnabledWireSenders()).toEqual(['enttecpro'])
  })

  it.each(WIRE_SENDER_IDS)('answers a send to %s by whether that slot is enabled', async (slot) => {
    const senders = await subject()

    await expect(senders.send(slot, { 1: 255 })).resolves.toBe(slot === 'enttecpro')
  })
})
