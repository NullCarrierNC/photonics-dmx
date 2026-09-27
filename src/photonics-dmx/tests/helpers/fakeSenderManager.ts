import { jest } from '@jest/globals'
import type { PublisherSenders } from '../../controllers/SenderManager'

/** The senders a publisher sends through, each member a jest mock typed from SenderManager. */
export type FakeSenderManager = {
  [K in keyof PublisherSenders]: jest.Mock<PublisherSenders[K]>
}

/**
 * Senders for suites that drive a DmxPublisher without real transports. By default one sACN wire
 * sender is enabled, IPC is off, and a send reports whether its slot is among the enabled wire
 * senders, as SenderManager's does. A suite passes its own implementation for any member.
 */
export function fakeSenderManager(overrides: Partial<PublisherSenders> = {}): FakeSenderManager {
  const fake: FakeSenderManager = {
    send: jest.fn<PublisherSenders['send']>(
      overrides.send ?? ((slot) => Promise.resolve(fake.getEnabledWireSenders().includes(slot))),
    ),
    sendIpc: jest.fn<PublisherSenders['sendIpc']>(overrides.sendIpc ?? (() => {})),
    getEnabledWireSenders: jest.fn<PublisherSenders['getEnabledWireSenders']>(
      overrides.getEnabledWireSenders ?? (() => ['sacn']),
    ),
    isIpcEnabled: jest.fn<PublisherSenders['isIpcEnabled']>(
      overrides.isIpcEnabled ?? (() => false),
    ),
  }
  return fake
}
