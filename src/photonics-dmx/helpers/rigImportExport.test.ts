import { describe, expect, it } from '@jest/globals'
import { ConfigStrobeType, FixtureTypes } from '../types'
import type { DmxFixture, DmxLight, DmxRig } from '../types'
import {
  RIG_EXPORT_FORMAT_VERSION,
  RIG_EXPORT_TYPE,
  buildRigExportFile,
  collectReferencedTemplates,
  countOrphanLights,
  duplicateRig,
  mapLightsToNewIdsForSave,
  prepareImportedRig,
  reconcileImportedTemplates,
  suggestUniqueName,
  validateRigExportFile,
} from './rigImportExport'

// Deterministic id factory for assertions.
function counterMakeId(): () => string {
  let n = 0
  return () => `gen-${++n}`
}

const rgbTemplate: DmxFixture = {
  id: 'tpl-rgb',
  position: 0,
  fixture: FixtureTypes.RGB,
  label: 'RGB PAR',
  name: 'RGB PAR',
  isStrobeEnabled: false,
  group: '',
  universe: 1,
  channels: { masterDimmer: 0, red: 1, green: 2, blue: 3 },
}

const rgbwTemplate: DmxFixture = {
  id: 'tpl-rgbw',
  position: 0,
  fixture: FixtureTypes.RGBW,
  label: 'RGBW',
  name: 'RGBW',
  isStrobeEnabled: false,
  group: '',
  universe: 1,
  channels: { masterDimmer: 0, red: 1, green: 2, blue: 3, white: 4 },
}

const strobeTemplate: DmxFixture = {
  id: 'tpl-strobe',
  position: 0,
  fixture: FixtureTypes.STROBE,
  label: 'Strobe',
  name: 'Strobe',
  isStrobeEnabled: false,
  group: '',
  universe: 1,
  channels: { masterDimmer: 0, strobeChannel: 1 },
}

function lightFrom(
  tpl: DmxFixture,
  id: string,
  position: number,
  group: 'front' | 'back' | 'strobe',
): DmxLight {
  return {
    ...tpl,
    id,
    fixtureId: tpl.id as string,
    position,
    group,
    mount: 'floor',
  }
}

function makeRig(overrides: Partial<DmxRig> = {}): DmxRig {
  return {
    id: 'rig-1',
    name: 'Main Stage',
    active: true,
    config: {
      numLights: 2,
      lightLayout: { id: 'front', label: 'Front only' },
      strobeType: ConfigStrobeType.None,
      frontLights: [
        lightFrom(rgbTemplate, 'l1', 1, 'front'),
        lightFrom(rgbwTemplate, 'l2', 2, 'front'),
      ],
      backLights: [],
      strobeLights: [],
    },
    ...overrides,
  }
}

describe('collectReferencedTemplates', () => {
  it('returns only the templates the rig references, deduped', () => {
    const rig = makeRig()
    const { templates, missingFixtureIds } = collectReferencedTemplates(rig, [
      rgbTemplate,
      rgbwTemplate,
      strobeTemplate, // unreferenced
    ])
    expect(templates.map((t) => t.id)).toEqual(['tpl-rgb', 'tpl-rgbw'])
    expect(missingFixtureIds).toEqual([])
  })

  it('reports referenced ids with no matching template as missing', () => {
    const rig = makeRig()
    const { templates, missingFixtureIds } = collectReferencedTemplates(rig, [rgbTemplate])
    expect(templates.map((t) => t.id)).toEqual(['tpl-rgb'])
    expect(missingFixtureIds).toEqual(['tpl-rgbw'])
  })
})

describe('buildRigExportFile', () => {
  it('bundles referenced templates, strips outputs, normalizes active', () => {
    const rig = makeRig({ active: false, outputs: ['sacn'] })
    const file = buildRigExportFile(rig, [rgbTemplate, rgbwTemplate, strobeTemplate])

    expect(file.type).toBe(RIG_EXPORT_TYPE)
    expect(file.formatVersion).toBe(RIG_EXPORT_FORMAT_VERSION)
    expect(file.rig.active).toBe(true)
    expect(file.rig.outputs).toBeUndefined()
    expect(file.templates.map((t) => t.id)).toEqual(['tpl-rgb', 'tpl-rgbw'])
  })

  it('produces a file that passes envelope validation (round-trip)', () => {
    const file = buildRigExportFile(makeRig(), [rgbTemplate, rgbwTemplate])
    const parsed = JSON.parse(JSON.stringify(file))
    const result = validateRigExportFile(parsed)
    expect(result.ok).toBe(true)
  })
})

describe('validateRigExportFile', () => {
  const valid = () => buildRigExportFile(makeRig(), [rgbTemplate, rgbwTemplate])

  it('accepts a well-formed file', () => {
    expect(validateRigExportFile(valid()).ok).toBe(true)
  })

  it('rejects a non-object', () => {
    expect(validateRigExportFile(null)).toMatchObject({ ok: false })
  })

  it('rejects the wrong file type', () => {
    expect(validateRigExportFile({ ...valid(), type: 'something-else' })).toMatchObject({
      ok: false,
    })
  })

  it('rejects a newer format version', () => {
    const result = validateRigExportFile({
      ...valid(),
      formatVersion: RIG_EXPORT_FORMAT_VERSION + 1,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a missing templates array', () => {
    const { templates: _t, ...rest } = valid()
    expect(validateRigExportFile(rest)).toMatchObject({ ok: false })
  })

  it('rejects a template with a null/empty id', () => {
    const file = valid()
    const broken = { ...file, templates: [{ ...rgbTemplate, id: null }] }
    expect(validateRigExportFile(broken)).toMatchObject({ ok: false })
  })
})

describe('reconcileImportedTemplates (de-dup policy)', () => {
  it('reuses an existing template with the same id and does not mutate it', () => {
    const existing = [rgbTemplate]
    const result = reconcileImportedTemplates([rgbTemplate], existing)
    expect(result.templatesToAdd).toEqual([])
    expect(result.fixtureIdMap).toEqual({ 'tpl-rgb': 'tpl-rgb' })
    expect(result.reusedCount).toBe(1)
    expect(existing[0]).toBe(rgbTemplate) // untouched by reference
  })

  it('keeps the existing template on a same-id clash with different settings', () => {
    const existing = [rgbTemplate]
    const importedEdited: DmxFixture = {
      ...rgbTemplate,
      name: 'RGB PAR (edited)',
      channels: { masterDimmer: 0, red: 9, green: 9, blue: 9 },
    }
    const result = reconcileImportedTemplates([importedEdited], existing)
    expect(result.templatesToAdd).toEqual([])
    expect(result.fixtureIdMap).toEqual({ 'tpl-rgb': 'tpl-rgb' })
    expect(existing[0]).toBe(rgbTemplate) // never overwritten
  })

  it('content-dedups a different-id template with identical settings', () => {
    const existing = [rgbTemplate]
    const importedSameContent: DmxFixture = { ...rgbTemplate, id: 'tpl-rgb-other' }
    const result = reconcileImportedTemplates([importedSameContent], existing)
    expect(result.templatesToAdd).toEqual([])
    expect(result.fixtureIdMap).toEqual({ 'tpl-rgb-other': 'tpl-rgb' })
    expect(result.reusedCount).toBe(1)
  })

  it('adds a genuinely new template, keeping its id', () => {
    const result = reconcileImportedTemplates([rgbTemplate], [rgbwTemplate])
    expect(result.templatesToAdd.map((t) => t.id)).toEqual(['tpl-rgb'])
    expect(result.fixtureIdMap).toEqual({ 'tpl-rgb': 'tpl-rgb' })
    expect(result.reusedCount).toBe(0)
  })

  it('collapses two equal imported templates with different ids', () => {
    const a: DmxFixture = { ...rgbTemplate, id: 'a' }
    const b: DmxFixture = { ...rgbTemplate, id: 'b' }
    const result = reconcileImportedTemplates([a, b], [])
    expect(result.templatesToAdd.map((t) => t.id)).toEqual(['a'])
    expect(result.fixtureIdMap).toEqual({ a: 'a', b: 'a' })
  })
})

describe('countOrphanLights', () => {
  it('counts rig lights whose fixtureId is not in the map', () => {
    const rig = makeRig({
      config: {
        ...makeRig().config,
        frontLights: [lightFrom(rgbTemplate, 'l1', 1, 'front')],
        backLights: [lightFrom(strobeTemplate, 'l2', 2, 'back')],
      },
    })
    expect(countOrphanLights(rig, { 'tpl-rgb': 'tpl-rgb' })).toBe(1)
  })
})

describe('prepareImportedRig', () => {
  it('assigns a fresh id, dedups the name, remaps fixtureIds and regenerates light ids', () => {
    const rig = makeRig()
    const prepared = prepareImportedRig(
      rig,
      { 'tpl-rgb': 'existing-rgb', 'tpl-rgbw': 'existing-rgbw' },
      ['Main Stage'],
      { makeId: counterMakeId() },
    )

    expect(prepared.id).toBe('gen-1')
    expect(prepared.name).toBe('Main Stage (2)') // deduped against existing
    expect(prepared.active).toBe(true)
    expect(prepared.config.frontLights[0].fixtureId).toBe('existing-rgb')
    expect(prepared.config.frontLights[1].fixtureId).toBe('existing-rgbw')
    // light ids are fresh (not the originals)
    expect(prepared.config.frontLights.map((l) => l.id)).not.toContain('l1')
    expect(prepared.config.frontLights.map((l) => l.id)).not.toContain('l2')
  })

  it('leaves an orphan fixtureId unchanged and drops outputs', () => {
    const rig = makeRig({
      outputs: ['sacn'],
      config: {
        ...makeRig().config,
        frontLights: [lightFrom({ ...rgbTemplate, id: 'tpl-missing' }, 'l1', 1, 'front')],
      },
    })
    const prepared = prepareImportedRig(rig, {}, [], { makeId: counterMakeId() })
    expect(prepared.config.frontLights[0].fixtureId).toBe('tpl-missing')
    expect(prepared.outputs).toBeUndefined()
  })

  it('reuses a single new id when one source light appears in multiple roles', () => {
    const rig = makeRig({
      config: {
        ...makeRig().config,
        frontLights: [lightFrom(rgbTemplate, 'shared', 1, 'front')],
        strobeLights: [lightFrom(rgbTemplate, 'shared', 1, 'strobe')],
      },
    })
    const prepared = prepareImportedRig(rig, { 'tpl-rgb': 'tpl-rgb' }, [], {
      makeId: counterMakeId(),
    })
    expect(prepared.config.frontLights[0].id).toBe(prepared.config.strobeLights[0].id)
    expect(prepared.config.frontLights[0].id).not.toBe('shared')
  })
})

describe('duplicateRig', () => {
  it('clones with a fresh id, a "(Copy)" name, shared fixtureIds and fresh light ids', () => {
    const rig = makeRig({ outputs: ['sacn'], mirrorHoriz: true })
    const copy = duplicateRig(rig, ['Main Stage'], { makeId: counterMakeId() })

    expect(copy.id).toBe('gen-1')
    expect(copy.name).toBe('Main Stage (Copy)')
    expect(copy.outputs).toEqual(['sacn']) // carried as-is (same machine)
    expect(copy.mirrorHoriz).toBe(true)
    // templates are shared, not duplicated
    expect(copy.config.frontLights[0].fixtureId).toBe('tpl-rgb')
    expect(copy.config.frontLights[1].fixtureId).toBe('tpl-rgbw')
    // light ids are independent of the source
    expect(copy.config.frontLights.map((l) => l.id)).not.toContain('l1')
  })

  it('dedups the copy name when "(Copy)" is already taken', () => {
    const rig = makeRig()
    const copy = duplicateRig(rig, ['Main Stage', 'Main Stage (Copy)'], { makeId: counterMakeId() })
    expect(copy.name).toBe('Main Stage (Copy) (2)')
  })
})

describe('suggestUniqueName', () => {
  it('returns the base when free', () => {
    expect(suggestUniqueName('Rig A', new Set())).toBe('Rig A')
  })

  it('appends an incrementing suffix when taken', () => {
    expect(suggestUniqueName('Rig A', new Set(['rig a']))).toBe('Rig A (2)')
    expect(suggestUniqueName('Rig A', new Set(['rig a', 'rig a (2)']))).toBe('Rig A (3)')
  })
})

describe('mapLightsToNewIdsForSave', () => {
  it('regenerates ids, sharing one new id per original id', () => {
    const idMap: Record<string, string> = {}
    const makeId = counterMakeId()
    const front = mapLightsToNewIdsForSave([lightFrom(rgbTemplate, 'x', 1, 'front')], idMap, makeId)
    const strobe = mapLightsToNewIdsForSave(
      [lightFrom(rgbTemplate, 'x', 1, 'strobe')],
      idMap,
      makeId,
    )
    expect(front[0].id).toBe(strobe[0].id)
    expect(front[0].id).not.toBe('x')
  })
})
