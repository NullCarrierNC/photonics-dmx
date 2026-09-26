/**
 * The `ipcApi` stand-in every renderer suite that touches main needs.
 *
 * `jest.mock` is hoisted and its factory cannot close over an import, so each suite still writes
 * its own registration. The factory reaches this object through `jest.requireActual`:
 *
 *   jest.mock('../ipcApi', () =>
 *     jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
 *       '@renderer/tests/helpers/ipcApiMock',
 *     ).ipcApiMock,
 *   )
 *
 * and reads a channel typed from the real module with `jest.mocked(ipcApi.savePrefs)`.
 *
 * Jest gives each suite its own module registry, so the object is per-suite despite being a
 * module singleton.
 */
import { jest } from '@jest/globals'
import type * as ipcApi from '../../ipcApi'

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

/** Prefixes of the names whose default answer is an accepted write. */
const WRITE_PREFIXES = [
  'save',
  'set',
  'update',
  'enable',
  'disable',
  'start',
  'stop',
  'simulate',
  'reset',
  'delete',
] as const
const RESOLVES_ACCEPTED = new RegExp(`^(${WRITE_PREFIXES.join('|')})`)

type Api = typeof ipcApi

/** The exports whose declared return type is exactly `T`. */
type ExportsReturning<T> = {
  [K in keyof Api]: Api[K] extends (...args: never[]) => infer R
    ? [R] extends [T]
      ? [T] extends [R]
        ? K
        : never
      : never
    : never
}[keyof Api]

/** Exports named like a write whose real answer is a boolean, so they resolve true. */
const RESOLVES_TRUE = [
  'simulateBeat',
  'simulateKeyframe',
  'simulateMeasure',
  'simulatePostProcessing',
  'stopTestEffect',
] as const satisfies ReadonlyArray<ExportsReturning<Promise<boolean>>>

/** Exports named like a write that send and return nothing. */
const RETURNS_NOTHING = [
  'enableYarg',
  'disableYarg',
  'enableRb3',
  'disableRb3',
  'setCueStyle',
  'setListenCueData',
] as const satisfies ReadonlyArray<ExportsReturning<void>>

/**
 * A write-named export answering a boolean or nothing that neither list holds. It has to be
 * `never`, so such an export fails to compile here until it is listed.
 */
type Unlisted = Exclude<
  Extract<
    keyof Api,
    `${(typeof WRITE_PREFIXES)[number]}${string}` &
      (ExportsReturning<Promise<boolean>> | ExportsReturning<void>)
  >,
  (typeof RESOLVES_TRUE)[number] | (typeof RETURNS_NOTHING)[number]
>
const everyShapeListed: [Unlisted] extends [never] ? true : Unlisted = true
void everyShapeListed

const resolvesTrue: ReadonlySet<string> = new Set(RESOLVES_TRUE)
const returnsNothing: ReadonlySet<string> = new Set(RETURNS_NOTHING)

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
  if (returnsNothing.has(name)) {
    fn.mockImplementation(() => undefined)
    return
  }
  if (resolvesTrue.has(name)) {
    fn.mockImplementation(() => Promise.resolve(true))
    return
  }
  if (RESOLVES_ACCEPTED.test(name)) {
    fn.mockImplementation(() => Promise.resolve(accepted))
    return
  }
  fn.mockImplementation(() => Promise.resolve(undefined))
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
 * The shared setup only clears calls after each test, so an answer one test sets, a
 * `mockResolvedValueOnce` it never consumed included, would carry into the next. A suite calls
 * this in `beforeEach`.
 */
export function resetIpcApiMock(): void {
  for (const [name, fn] of created) {
    fn.mockReset()
    applyDefault(name, fn)
  }
}
