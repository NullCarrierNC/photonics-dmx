import { jest } from '@jest/globals'
import type { PublisherSenders } from '../../controllers/SenderManager'

/** The senders a publisher sends through, each member a jest mock typed from SenderManager. */
export type FakeSenderManager = {
  [K in keyof PublisherSenders]: jest.Mock<PublisherSenders[K]>
}

/**
 * Senders for suites that drive a DmxPublisher without real transports. By default one sACN wire
 * sender is enabled, IPC is off, and every send reports that its frame reached the wire. A suite
 * passes its own implementation for any member.
 */
export function fakeSenderManager(overrides: Partial<PublisherSenders> = {}): FakeSenderManager {
  const members: PublisherSenders = {
    send: () => Promise.resolve(true),
    sendIpc: () => {},
    getEnabledWireSenders: () => ['sacn'],
    isIpcEnabled: () => false,
    ...overrides,
  }
  return {
    send: jest.fn(members.send),
    sendIpc: jest.fn(members.sendIpc),
    getEnabledWireSenders: jest.fn(members.getEnabledWireSenders),
    isIpcEnabled: jest.fn(members.isIpcEnabled),
  }
}
