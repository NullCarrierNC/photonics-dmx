import { jest, afterEach } from '@jest/globals'

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})
