import { ArtNetSender } from '../../senders/ArtNetSender';
import { DmxChannel } from '../../types';

// Mock the dmx-ts library
jest.mock('dmx-ts', () => ({
  DMX: jest.fn().mockImplementation(() => ({
    addUniverse: jest.fn().mockResolvedValue({
      update: jest.fn(),
      close: jest.fn()
    }),
    close: jest.fn().mockResolvedValue(undefined)
  })),
  ArtnetDriver: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  })),
  IUniverseDriver: jest.fn()
}));

describe('ArtNetSender', () => {
  let artNetSender: ArtNetSender;

  beforeEach(() => {
    artNetSender = new ArtNetSender('127.0.0.1', {
      universe: 1,
      net: 0,
      subnet: 0,
      subuni: 0,
      port: 6454
    });
  });

  afterEach(async () => {
    try {
      await artNetSender.stop();
    } catch (error) {
      // Ignore errors during cleanup
    }
  });

  describe('constructor', () => {
    it('should create an ArtNetSender with default values', () => {
      const sender = new ArtNetSender();
      expect(sender).toBeInstanceOf(ArtNetSender);
    });

    it('should create an ArtNetSender with custom values', () => {
      const sender = new ArtNetSender('192.168.1.100', {
        universe: 2,
        net: 1,
        subnet: 1,
        subuni: 1,
        port: 6455
      });
      expect(sender).toBeInstanceOf(ArtNetSender);
    });
  });

  describe('send', () => {
    it('should handle error when not started', async () => {
      const channels: DmxChannel[] = [
        { universe: 1, channel: 1, value: 255 }
      ];

      // The send method catches errors and emits them, so we expect it to not throw
      await expect(artNetSender.send(channels)).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should emit error events', (done) => {
      artNetSender.onSendError((error) => {
        expect(error).toBeDefined();
        done();
      });

      // Trigger an error by trying to send without starting
      artNetSender.send([{ universe: 1, channel: 1, value: 255 }]).catch(() => {
        // Expected error - this is caught by the send method
      });
    });
  });
}); 