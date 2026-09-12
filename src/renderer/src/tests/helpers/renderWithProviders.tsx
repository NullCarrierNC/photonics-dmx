/**
 * Rendering a renderer component the way the app renders it.
 *
 * Importing this also registers the jest-dom matchers, so a suite that renders gets
 * `toBeInTheDocument`, `toHaveValue` and `toBeDisabled` without repeating the import.
 *
 * Lives under `tests/` because `collectCoverageFrom` excludes that directory. A helper anywhere
 * else would add permanently uncovered lines to thresholds that only ratchet up.
 */
// The jest-globals entry point, because the suites import `expect` from '@jest/globals' rather
// than taking the global one, and only this build extends that expect and declares its types.
import '@testing-library/jest-dom/jest-globals'
import {
  render,
  renderHook,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react'
import { Provider, createStore, getDefaultStore, type WritableAtom } from 'jotai'
import type { ReactElement, ReactNode } from 'react'

type Store = ReturnType<typeof createStore>

/** Writes an atom in every store the render can read from. */
export type SeedFn = <Value, Args extends unknown[], Result>(
  atom: WritableAtom<Value, Args, Result>,
  ...args: Args
) => void

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Set atoms before the first render, so a component sees state it would normally load. */
  seed?: (set: SeedFn) => void
  /** Render into an existing store, for a case that needs to drive it from outside. */
  store?: Store
}

export interface RenderWithProvidersResult extends RenderResult {
  store: Store
}

/**
 * Render `ui` inside a Jotai Provider holding its own store.
 *
 * The seeds are also written to the default store, because a few call sites reach for
 * `getDefaultStore()` rather than the Provider's store, `useConfirm` among them. Without that a
 * confirm opened during the test would read a different store than the one under test.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const { seed, store: given, ...renderOptions } = options
  const { store, wrapper } = providersFor(seed, given)
  return { ...render(ui, { wrapper, ...renderOptions }), store }
}

/** {@link renderWithProviders} for a hook, with the same seeding and store. */
export function renderHookWithProviders<Result>(
  callback: () => Result,
  { seed, store: given }: Pick<RenderWithProvidersOptions, 'seed' | 'store'> = {},
): RenderHookResult<Result, unknown> & { store: Store } {
  const { store, wrapper } = providersFor(seed, given)
  return { ...renderHook(callback, { wrapper }), store }
}

/** The seeded store and the Provider that hands it to whatever renders under it. */
function providersFor(
  seed: RenderWithProvidersOptions['seed'],
  store: Store = createStore(),
): { store: Store; wrapper: (props: { children: ReactNode }) => ReactElement } {
  const shared = getDefaultStore()
  const set: SeedFn = (atom, ...args) => {
    store.set(atom, ...args)
    shared.set(atom, ...args)
  }
  seed?.(set)
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <Provider store={store}>{children}</Provider>
  )
  return { store, wrapper }
}
