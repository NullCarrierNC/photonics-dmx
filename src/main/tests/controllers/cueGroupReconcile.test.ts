import { describe, expect, it, jest } from '@jest/globals'
import {
  reconcileEnabledGroups,
  persistReconciledGroups,
} from '../../controllers/cueGroupReconcile'
import type { CueDomain, CueDomainPrefs } from '../../../services/configuration/cueDomainTypes'

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

  it('drops an enabled group that is no longer registered', () => {
    const { enabled, known } = reconcileEnabledGroups(['a', 'stale'], ['a', 'stale'], ['a'])
    expect(enabled).toEqual(['a'])
    expect(known).toEqual(['a'])
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

  it('returns empty when nothing is registered', () => {
    const { enabled, known } = reconcileEnabledGroups(['a'], ['a'], [])
    expect(enabled).toEqual([])
    expect(known).toEqual([])
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

describe('persistReconciledGroups', () => {
  const makeConfig = () => ({
    updateCueDomain: jest.fn<(domain: CueDomain, patch: Partial<CueDomainPrefs>) => Promise<void>>(
      async () => {},
    ),
  })

  it('skips the write when the reconcile matches the stored values', async () => {
    const config = makeConfig()
    const wrote = await persistReconciledGroups(
      config,
      'yarg',
      { enabled: ['a', 'b'], known: ['a', 'b'] },
      ['a', 'b'],
      ['a', 'b'],
    )
    expect(wrote).toBe(false)
    expect(config.updateCueDomain).not.toHaveBeenCalled()
  })

  it('writes enabled and known in a single call when changed', async () => {
    const config = makeConfig()
    const wrote = await persistReconciledGroups(
      config,
      'yarg',
      { enabled: ['a', 'b'], known: ['a', 'b'] },
      ['a'],
      ['a'],
    )
    expect(wrote).toBe(true)
    expect(config.updateCueDomain).toHaveBeenCalledTimes(1)
    expect(config.updateCueDomain).toHaveBeenCalledWith('yarg', {
      enabledGroups: ['a', 'b'],
      knownGroups: ['a', 'b'],
    })
  })

  it('writes when only the known baseline changed', async () => {
    const config = makeConfig()
    const wrote = await persistReconciledGroups(
      config,
      'audio',
      { enabled: ['a'], known: ['a', 'b'] },
      ['a'],
      ['a'],
    )
    expect(wrote).toBe(true)
    expect(config.updateCueDomain).toHaveBeenCalledTimes(1)
  })
})
