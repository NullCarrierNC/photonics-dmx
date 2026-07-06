import { describe, expect, it } from '@jest/globals'
import { reconcileEnabledGroups } from '../../controllers/cueGroupReconcile'

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
