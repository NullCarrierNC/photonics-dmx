import { describe, expect, it, jest } from '@jest/globals'
import { reconcileEnabledGroups } from '../../controllers/cueGroupReconcile'
import {
  reconcileAndApplyGroups,
  type CueDomainRegistryBinding,
} from '../../controllers/cueDomainBindings'
import type { CueDomainPrefs } from '../../../services/configuration/cueDomainTypes'
import type { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'

describe('reconcileEnabledGroups', () => {
  it('auto-enables registered groups never seen before', () => {
    const { enabled, known } = reconcileEnabledGroups(['a'], ['a'], ['a', 'b'])
    expect(enabled).toEqual(['a', 'b'])
    expect(known).toEqual(['a', 'b'])
  })

  it('does not re-enable a known group the user disabled', () => {
    const { enabled } = reconcileEnabledGroups([], ['a', 'b'], ['a', 'b'])
    expect(enabled).toEqual([])
  })

  it('keeps an enabled group that missed a load, and applies only what is registered', () => {
    const { enabled, active, known } = reconcileEnabledGroups(['a', 'b'], ['a', 'b'], ['a'])
    expect(enabled).toEqual(['a', 'b'])
    expect(active).toEqual(['a'])
    expect(known).toEqual(['a', 'b'])
  })

  it('leaves a disabled group disabled once it loads again after a missed load', () => {
    const missed = reconcileEnabledGroups(['a'], ['a', 'b'], ['a'])
    const back = reconcileEnabledGroups(missed.enabled, missed.known, ['a', 'b'])
    expect(back.enabled).toEqual(['a'])
  })

  it('leaves an enabled group enabled once it loads again after a missed load', () => {
    const missed = reconcileEnabledGroups(['a', 'b'], ['a', 'b'], ['a'])
    const back = reconcileEnabledGroups(missed.enabled, missed.known, ['a', 'b'])
    expect(back.enabled).toEqual(['a', 'b'])
  })

  it('drops an enabled id that was never a known group', () => {
    const { enabled } = reconcileEnabledGroups(['a', 'stray'], ['a'], ['a'])
    expect(enabled).toEqual(['a'])
  })

  it('enables everything on a fresh domain (empty enabled and known)', () => {
    const { enabled } = reconcileEnabledGroups([], [], ['a', 'b', 'c'])
    expect(enabled).toEqual(['a', 'b', 'c'])
  })

  it('treats undefined stored arrays as empty', () => {
    const { enabled, known } = reconcileEnabledGroups(undefined, undefined, ['x'])
    expect(enabled).toEqual(['x'])
    expect(known).toEqual(['x'])
  })

  it('applies nothing when nothing is registered, and remembers the selection', () => {
    const { enabled, active, known } = reconcileEnabledGroups(['a'], ['a'], [])
    expect(enabled).toEqual(['a'])
    expect(active).toEqual([])
    expect(known).toEqual(['a'])
  })

  it('does not duplicate a stored id that is also treated as new (stale knownGroups)', () => {
    // enabled has 'b' but known lacks it, so 'b' is also a "new" group — must appear once.
    const { enabled } = reconcileEnabledGroups(['a', 'b'], ['a'], ['a', 'b'])
    expect(enabled).toEqual(['a', 'b'])
  })

  it('drops duplicate stored ids entirely', () => {
    const { enabled } = reconcileEnabledGroups(['a', 'a', 'b'], ['a', 'b'], ['a', 'b'])
    expect(enabled).toEqual(['a', 'b'])
  })
})

describe('reconcileAndApplyGroups', () => {
  function binding(
    stored: { enabledGroups?: string[]; knownGroups?: string[] },
    registered: string[],
  ) {
    const persist = jest.fn(async (_config: unknown, patch: Partial<CueDomainPrefs>) => {
      Object.assign(stored, patch)
    })
    const setEnabled = jest.fn()
    const fake = {
      domain: 'yarg',
      getRegisteredIds: () => registered,
      setEnabled,
      setDisabled: jest.fn(),
      readStored: () => ({ ...stored, disabledCues: {} }),
      persist,
    } as unknown as CueDomainRegistryBinding
    return { fake, persist, setEnabled }
  }

  const config = {} as ConfigurationManager

  it('skips the write when the reconcile matches the stored values', async () => {
    const { fake, persist } = binding({ enabledGroups: ['a', 'b'], knownGroups: ['a', 'b'] }, [
      'a',
      'b',
    ])

    await reconcileAndApplyGroups(fake, config)

    expect(persist).not.toHaveBeenCalled()
  })

  it('writes enabled and known in a single call when changed', async () => {
    const { fake, persist, setEnabled } = binding({ enabledGroups: ['a'], knownGroups: ['a'] }, [
      'a',
      'b',
    ])

    await reconcileAndApplyGroups(fake, config)

    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith(config, {
      enabledGroups: ['a', 'b'],
      knownGroups: ['a', 'b'],
    })
    expect(setEnabled).toHaveBeenCalledWith(['a', 'b'])
  })

  it('writes when only the known baseline changed', async () => {
    const { fake, persist } = binding({ enabledGroups: ['a'], knownGroups: ['a'] }, ['a', 'c'])

    await reconcileAndApplyGroups(fake, config)

    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('applies only the registered groups of the selection', async () => {
    const { fake, persist, setEnabled } = binding(
      { enabledGroups: ['a', 'b'], knownGroups: ['a', 'b'] },
      ['a'],
    )

    await reconcileAndApplyGroups(fake, config)

    expect(persist).not.toHaveBeenCalled()
    expect(setEnabled).toHaveBeenCalledWith(['a'])
  })
})
