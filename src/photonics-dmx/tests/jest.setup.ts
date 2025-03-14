import { jest, afterEach } from '@jest/globals';

// Mock timers
jest.useFakeTimers();

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
}); 