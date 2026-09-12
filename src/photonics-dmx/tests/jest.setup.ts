import { jest, afterEach } from '@jest/globals'

// Cleanup after each test. Timers are put back to real ones here as well as in the suites that
// fake them, so a suite that forgets cannot change how the next one behaves.
afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
})
