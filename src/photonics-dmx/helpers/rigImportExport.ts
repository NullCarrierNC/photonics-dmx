import equal from 'fast-deep-equal'
import type { DmxFixture, DmxLight, DmxRig } from '../types'

/**
 * Pure, process-agnostic core for exporting, importing, and duplicating rigs. No Electron / IO so
 * it can run in the main process (export build + file validation), the renderer (import dedup +
 * rig preparation), and unit tests alike.
 *
 * A rig's lights are snapshots that reference MyLights templates by `fixtureId` (see
 * {@link rigTemplateSync}). To make a rig portable, an export bundles the templates its lights
 * reference; an import re-links those `fixtureId`s against the importing machine's MyLights,
 * reusing templates the user already has instead of duplicating them.
 */

export const RIG_EXPORT_FORMAT_VERSION = 1
export const RIG_EXPORT_TYPE = 'photonics-rig'

/** Self-contained, portable representation of a rig plus the templates its lights reference. */
export interface RigExportFile {
  formatVersion: number
  type: typeof RIG_EXPORT_TYPE
  /** `outputs` (machine-specific wire senders) stripped; `active` normalized to true. */
  rig: DmxRig
  /** Only the templates referenced by the rig's lights, deduped by id. */
  templates: DmxFixture[]
}

const defaultMakeId = (): string => globalThis.crypto.randomUUID()

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Compare two templates ignoring instance-only fields (`id`, `position`); JSON-normalized so an
 * explicit `undefined` and an absent key compare equal. */
function sameTemplateContent(a: DmxFixture, b: DmxFixture): boolean {
  const strip = (t: DmxFixture): Omit<DmxFixture, 'id' | 'position'> => {
    const { id: _id, position: _position, ...rest } = clone(t)
    return rest
  }
  return equal(strip(a), strip(b))
}

/**
 * If the same source light is saved in more than one role (e.g. front + strobe), reuses a single
 * new id. (Relocated here from `lightsLayoutHelpers`; still re-exported there for existing callers.)
 */
export function mapLightsToNewIdsForSave(
  lights: DmxLight[],
  idMap: Record<string, string>,
  makeId: () => string = defaultMakeId,
): DmxLight[] {
  return lights.map((light) => {
    const originalId = light.id ?? makeId()
    if (!idMap[originalId]) {
      idMap[originalId] = makeId()
    }
    return {
      ...light,
      id: idMap[originalId],
    }
  })
}

/** Append `" (2)"`, `" (3)"`, … to `base` until the (case-insensitive) name is free. */
export function suggestUniqueName(base: string, takenLowercase: ReadonlySet<string>): string {
  const trimmed = base.trim() || 'Rig'
  if (!takenLowercase.has(trimmed.toLowerCase())) {
    return trimmed
  }
  let n = 2
  while (takenLowercase.has(`${trimmed} (${n})`.toLowerCase())) {
    n += 1
  }
  return `${trimmed} (${n})`
}

function allRigLights(rig: DmxRig): DmxLight[] {
  return [...rig.config.frontLights, ...rig.config.backLights, ...rig.config.strobeLights]
}

/**
 * Resolve the templates a rig's lights reference. `templates` holds the matched {@link DmxFixture}s
 * (deduped, in first-seen order); `missingFixtureIds` holds referenced ids with no matching template
 * (orphans — at export they won't be bundled, at import their lights stay unlinked).
 */
export function collectReferencedTemplates(
  rig: DmxRig,
  allTemplates: DmxFixture[],
): { templates: DmxFixture[]; missingFixtureIds: string[] } {
  const byId = new Map(
    allTemplates.filter((t) => t.id != null).map((t) => [t.id as string, t] as const),
  )
  const seen = new Set<string>()
  const missing = new Set<string>()
  const templates: DmxFixture[] = []

  for (const light of allRigLights(rig)) {
    const fixtureId = light.fixtureId
    if (!fixtureId || seen.has(fixtureId) || missing.has(fixtureId)) {
      continue
    }
    const template = byId.get(fixtureId)
    if (template) {
      templates.push(template)
      seen.add(fixtureId)
    } else {
      missing.add(fixtureId)
    }
  }

  return { templates, missingFixtureIds: [...missing] }
}

/**
 * Build the portable export file for `rig`, bundling only the templates its lights reference. Strips
 * the machine-specific `outputs` and normalizes `active` to true so the imported rig is usable.
 */
export function buildRigExportFile(rig: DmxRig, allTemplates: DmxFixture[]): RigExportFile {
  const { templates } = collectReferencedTemplates(rig, allTemplates)
  const rigClone = clone(rig)
  delete rigClone.outputs
  rigClone.active = true
  return {
    formatVersion: RIG_EXPORT_FORMAT_VERSION,
    type: RIG_EXPORT_TYPE,
    rig: rigClone,
    templates: clone(templates),
  }
}

/**
 * Structural / envelope validation of a parsed rig-export file. Authoritative field validation of
 * `rig` and `templates` runs in the main-process handler via the shared input validators; this only
 * guards the envelope so the file is safe to hand to those validators and the dedup core.
 */
export function validateRigExportFile(
  parsed: unknown,
): { ok: true; value: RigExportFile } | { ok: false; error: string } {
  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'File is not a valid rig export (expected a JSON object).' }
  }
  if (parsed.type !== RIG_EXPORT_TYPE) {
    return { ok: false, error: 'This file is not a Photonics rig export.' }
  }
  if (typeof parsed.formatVersion !== 'number' || !Number.isFinite(parsed.formatVersion)) {
    return { ok: false, error: 'Rig export is missing a valid formatVersion.' }
  }
  if (parsed.formatVersion > RIG_EXPORT_FORMAT_VERSION) {
    return { ok: false, error: 'This rig file was created by a newer version of the app.' }
  }
  if (!isPlainObject(parsed.rig)) {
    return { ok: false, error: 'Rig export is missing its rig data.' }
  }
  if (!Array.isArray(parsed.templates)) {
    return { ok: false, error: 'Rig export is missing its templates list.' }
  }
  for (let i = 0; i < parsed.templates.length; i++) {
    const t = parsed.templates[i]
    if (!isPlainObject(t) || typeof t.id !== 'string' || t.id.trim().length === 0) {
      return { ok: false, error: `templates[${i}] must have a non-empty string id.` }
    }
  }
  return { ok: true, value: parsed as unknown as RigExportFile }
}

/**
 * Reconcile imported templates against the user's existing MyLights, per the confirmed de-dup policy:
 *  - **Same id exists** → reuse the user's existing template as-is (NEVER mutate/overwrite it). This
 *    wins before any content check, so a template the user edited since exporting is preserved.
 *  - **Identical content under a different id** → remap to the existing template (no duplicate added).
 *  - **Otherwise** → add it, keeping its imported id (globally unique, so re-importing the same file
 *    is idempotent).
 *
 * Returns `templatesToAdd` (new templates to persist), `fixtureIdMap` (old template id → final
 * template id, for re-linking rig lights), and `reusedCount` (templates matched to existing).
 */
export function reconcileImportedTemplates(
  imported: DmxFixture[],
  existing: DmxFixture[],
  opts: { makeId?: () => string } = {},
): { templatesToAdd: DmxFixture[]; fixtureIdMap: Record<string, string>; reusedCount: number } {
  const makeId = opts.makeId ?? defaultMakeId
  const existingById = new Map(
    existing.filter((t) => t.id != null).map((t) => [t.id as string, t] as const),
  )
  // Content-match pool grows with templates we add, so two equal imported templates collapse to one.
  const matchPool: DmxFixture[] = [...existing]

  const templatesToAdd: DmxFixture[] = []
  const fixtureIdMap: Record<string, string> = {}
  let reusedCount = 0

  for (const imp of imported) {
    // Defensive: post-validation every template has a non-empty id, but guard anyway.
    if (imp.id == null) {
      templatesToAdd.push({ ...clone(imp), id: makeId() })
      continue
    }

    if (existingById.has(imp.id)) {
      fixtureIdMap[imp.id] = imp.id
      reusedCount += 1
      continue
    }

    const contentMatch = matchPool.find((t) => t.id != null && sameTemplateContent(t, imp))
    if (contentMatch && contentMatch.id != null) {
      fixtureIdMap[imp.id] = contentMatch.id
      reusedCount += 1
      continue
    }

    const added = clone(imp)
    templatesToAdd.push(added)
    matchPool.push(added)
    fixtureIdMap[imp.id] = imp.id
  }

  return { templatesToAdd, fixtureIdMap, reusedCount }
}

/** Count rig lights whose `fixtureId` has no entry in `fixtureIdMap` (orphans — template not in the file). */
export function countOrphanLights(rig: DmxRig, fixtureIdMap: Record<string, string>): number {
  return allRigLights(rig).filter((l) => !(l.fixtureId in fixtureIdMap)).length
}

/**
 * Turn a validated imported rig into one ready to save on this machine: a fresh rig id, a name made
 * unique against `existingRigNames`, every light's `fixtureId` re-linked through `fixtureIdMap`
 * (orphans left unchanged), fresh light ids (shared idMap so a light reused across roles keeps one
 * id), `active: true`, and the machine-specific `outputs` dropped.
 */
export function prepareImportedRig(
  rig: DmxRig,
  fixtureIdMap: Record<string, string>,
  existingRigNames: string[],
  opts: { makeId?: () => string } = {},
): DmxRig {
  const makeId = opts.makeId ?? defaultMakeId
  const source = clone(rig)
  const idMap: Record<string, string> = {}
  const relink = (lights: DmxLight[]): DmxLight[] =>
    mapLightsToNewIdsForSave(
      lights.map((l) => ({ ...l, fixtureId: fixtureIdMap[l.fixtureId] ?? l.fixtureId })),
      idMap,
      makeId,
    )

  const taken = new Set(existingRigNames.map((n) => n.trim().toLowerCase()))
  const prepared: DmxRig = {
    ...source,
    id: makeId(),
    name: suggestUniqueName(source.name, taken),
    active: true,
    config: {
      ...source.config,
      frontLights: relink(source.config.frontLights),
      backLights: relink(source.config.backLights),
      strobeLights: relink(source.config.strobeLights),
    },
  }
  delete prepared.outputs
  return prepared
}

/**
 * Clone a rig into an independent copy: fresh rig id, a `"<name> (Copy)"` name made unique against
 * `existingRigNames`, and fresh light ids (shared idMap). `fixtureId`s are kept — templates are
 * shared between rigs, never duplicated. `outputs`/`active`/mirror flags are carried as-is.
 */
export function duplicateRig(
  rig: DmxRig,
  existingRigNames: string[],
  opts: { makeId?: () => string } = {},
): DmxRig {
  const makeId = opts.makeId ?? defaultMakeId
  const source = clone(rig)
  const idMap: Record<string, string> = {}
  const remap = (lights: DmxLight[]): DmxLight[] => mapLightsToNewIdsForSave(lights, idMap, makeId)

  const taken = new Set(existingRigNames.map((n) => n.trim().toLowerCase()))
  return {
    ...source,
    id: makeId(),
    name: suggestUniqueName(`${source.name} (Copy)`, taken),
    config: {
      ...source.config,
      frontLights: remap(source.config.frontLights),
      backLights: remap(source.config.backLights),
      strobeLights: remap(source.config.strobeLights),
    },
  }
}
