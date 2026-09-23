/**
 * Rendering a renderer component the way the app renders it.
 *
 * Lives under `tests/` because `collectCoverageFrom` excludes that directory. A helper anywhere
 * else would add permanently uncovered lines to thresholds that only ratchet up.
 */
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

/** Writes an atom in the store the render reads from. */
export type SeedFn = <Value, Args extends unknown[], Result>(
  atom: WritableAtom<Value, Args, Result>,
  ...args: Args
) => void

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Set atoms before the first render, so a component sees state it would normally load. */
  seed?: (set: SeedFn) => void
  /** Render into an existing store, for a case that needs to drive it from outside. */
  store?: Store
  /**
   * Also write the seeds to the default store, for code under test that reads `getDefaultStore()`
   * rather than the Provider's store. Off by default, so a read from the wrong store fails.
   */
  seedDefaultStore?: boolean
}

export interface RenderWithProvidersResult extends RenderResult {
  store: Store
}

/** Render `ui` inside a Jotai Provider holding its own store. */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const { seed, store: given, seedDefaultStore = false, ...renderOptions } = options
  const { store, wrapper } = providersFor(seed, given, seedDefaultStore)
  return { ...render(ui, { wrapper, ...renderOptions }), store }
}

/** {@link renderWithProviders} for a hook, with the same seeding and store. */
export function renderHookWithProviders<Result>(
  callback: () => Result,
  {
    seed,
    store: given,
    seedDefaultStore = false,
  }: Pick<RenderWithProvidersOptions, 'seed' | 'store' | 'seedDefaultStore'> = {},
): RenderHookResult<Result, unknown> & { store: Store } {
  const { store, wrapper } = providersFor(seed, given, seedDefaultStore)
  return { ...renderHook(callback, { wrapper }), store }
}

/** The seeded store and the Provider that hands it to whatever renders under it. */
function providersFor(
  seed: RenderWithProvidersOptions['seed'],
  store: Store = createStore(),
  seedDefaultStore: boolean,
): { store: Store; wrapper: (props: { children: ReactNode }) => ReactElement } {
  const shared = getDefaultStore()
  const set: SeedFn = (atom, ...args) => {
    store.set(atom, ...args)
    if (seedDefaultStore) shared.set(atom, ...args)
  }
  seed?.(set)
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <Provider store={store}>{children}</Provider>
  )
  return { store, wrapper }
}
