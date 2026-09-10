/**
 * The `ipcApi` stand-in every renderer suite that touches main needs.
 *
 * `jest.mock` is hoisted and its factory cannot close over an import, so each suite still writes
 * its own one-line registration. The factory may `require`, which is how it reaches this object:
 *
 *   jest.mock('../ipcApi', () => require('@renderer/tests/helpers/ipcApiMock').ipcApiMock)
 *   import { ipcApiMock, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
 *
 * Jest gives each suite its own module registry, so the object is per-suite despite being a
 * module singleton.
 */
import { jest } from '@jest/globals'

/** What main answers when it accepted a write. */
export const accepted = { success: true } as const

/** What main answers when it refused one. */
export function refused(error = 'refused'): { success: false; error: string } {
  return { success: false, error }
}

/**
 * Every `ipcApi` export a suite might reach for, as a jest.fn.
 *
 * Reached through a Proxy so a suite can mock a channel this file has never heard of, and so the
 * list does not have to track all ~180 exports. Each name yields the same fn every time it is
 * read, which is what lets a suite assert on it.
 */
const created = new Map<string, jest.Mock>()

/** Names whose default answer has to be an accepted write rather than undefined. */
const RESOLVES_ACCEPTED = /^(save|set|update|enable|disable|start|stop|simulate|reset|delete)/

function mockFor(name: string): jest.Mock {
  const existing = created.get(name)
  if (existing) {
    return existing
  }
  const fn = jest.fn() as jest.Mock
  applyDefault(name, fn)
  created.set(name, fn)
  return fn
}

function applyDefault(name: string, fn: jest.Mock): void {
  if (RESOLVES_ACCEPTED.test(name)) {
    fn.mockImplementation((() => Promise.resolve(accepted)) as never)
    return
  }
  fn.mockImplementation((() => Promise.resolve(undefined)) as never)
}

export const ipcApiMock = new Proxy({} as Record<string, jest.Mock>, {
  get: (_target, prop: string | symbol) => {
    if (typeof prop !== 'string') {
      return undefined
    }
    return mockFor(prop)
  },
  has: () => true,
  ownKeys: () => [...created.keys()],
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
})

/**
 * Put every mock back to its default answer.
 *
 * The shared setup calls `clearAllMocks` after each test, which drops implementations as well as
 * calls, so a suite that relies on the defaults re-arms them here in `beforeEach`.
 */
export function resetIpcApiMock(): void {
  for (const [name, fn] of created) {
    fn.mockReset()
    applyDefault(name, fn)
  }
}
