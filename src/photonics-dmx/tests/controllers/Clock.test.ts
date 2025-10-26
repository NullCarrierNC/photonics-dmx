import { Clock } from '../../controllers/sequencer/Clock';

describe('Clock', () => {
  let clock: Clock;

  beforeEach(() => {
    clock = new Clock();
  });

  afterEach(() => {
    clock.destroy();
  });

  describe('constructor', () => {
    it('should initialize with correct initial state', () => {
      expect(clock.isActive()).toBe(false);
      expect(clock.getCurrentTimeMs()).toBe(0);
      expect(clock.getTickCount()).toBe(0);
    });
  });

  describe('start and stop', () => {
    it('should start and stop correctly', () => {
      clock.start();
      expect(clock.isActive()).toBe(true);
      
      clock.stop();
      expect(clock.isActive()).toBe(false);
    });

    it('should not start multiple times', () => {
      clock.start();
      clock.start();
      expect(clock.isActive()).toBe(true);
    });

    it('should not stop when not running', () => {
      clock.stop();
      expect(clock.isActive()).toBe(false);
    });
  });

  describe('time tracking', () => {
    it('should track tick count correctly', () => {
      expect(clock.getTickCount()).toBe(0);
      
      // In test environment, tick count should increment even without real timing
      clock.start();
      expect(clock.getTickCount()).toBe(0); // Still 0 until first update
      
      clock.stop();
    });

    it('should provide absolute time', () => {
      const absoluteTime = clock.getAbsoluteTimeMs();
      expect(typeof absoluteTime).toBe('number');
      expect(absoluteTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('destroy', () => {
    it('should clean up resources on destroy', () => {
      clock.start();
      expect(clock.isActive()).toBe(true);
      
      clock.destroy();
      expect(clock.isActive()).toBe(false);
    });
  });
});
