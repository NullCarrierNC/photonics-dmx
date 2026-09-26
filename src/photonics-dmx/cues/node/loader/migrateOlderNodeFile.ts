/**
 * Brings a parsed cue or effect file that an older build wrote onto what this build accepts, before
 * validation: a retired blend mode reads as replace, an unknown easing as the default, and a variable
 * name the editor once accepted is renamed with every use of it. Each change becomes a note.
 */
import { isVariableName } from '../../types/nodeCueTypes'
import { DEFAULT_EASING, literalIssue } from '../cueValueRules'

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Blend modes the editor offered up to v0.5.5. Both blend as replace. */
const RETIRED_BLEND_MODES: ReadonlySet<unknown> = new Set(['multiply', 'overlay'])

/** Logic node fields that hold one variable name. */
const NAME_FIELDS = [
  'varName',
  'assignTo',
  'anchorVar',
  'assignPhase',
  'assignBeatMs',
  'assignBarMs',
  'assignPhraseMs',
  'assignCycles',
  'assignGroupSize',
  'assignIndex',
  'assignColor',
  'assignEdge',
  'sourceVariable',
  'currentLightVariable',
  'currentIndexVariable',
] as const

/** Logic node fields that hold a list of variable names. */
const NAME_LIST_FIELDS = ['sourceVariables', 'variablesToLog'] as const

/** A cue file's cues, or an effect file's effects. */
function graphsOf(file: JsonObject): JsonObject[] {
  const list = Array.isArray(file.cues)
    ? file.cues
    : Array.isArray(file.effects)
      ? file.effects
      : []
  return list.filter(isObject)
}

const labelOf = (graph: JsonObject): string =>
  `'${typeof graph.name === 'string' ? graph.name : String(graph.id)}'`

/** The actions of every graph, each with the label of the graph it sits in. */
function actionsOf(graphs: readonly JsonObject[]): { action: JsonObject; graph: string }[] {
  return graphs.flatMap((graph) => {
    const actions = isObject(graph.nodes) ? graph.nodes.actions : undefined
    return Array.isArray(actions)
      ? actions.filter(isObject).map((action) => ({ action, graph: labelOf(graph) }))
      : []
  })
}

function retireBlendModes(graphs: readonly JsonObject[]): string | null {
  const changed = new Set<string>()
  for (const { action, graph } of actionsOf(graphs)) {
    const blendMode = isObject(action.color) ? action.color.blendMode : null
    if (
      isObject(blendMode) &&
      blendMode.source === 'literal' &&
      RETIRED_BLEND_MODES.has(blendMode.value)
    ) {
      blendMode.value = 'replace'
      changed.add(graph)
    }
  }
  return changed.size > 0
    ? `Retired blend mode multiply or overlay in ${[...changed].join(', ')} now reads replace.`
    : null
}

/**
 * An easing literal the runtime does not know plays as the default easing, so it is stored as that.
 * The oldest files hold the easing as a bare string, which validation later wraps.
 */
function replaceUnknownEasings(graphs: readonly JsonObject[]): string | null {
  const values = new Set<string>()
  const changed = new Set<string>()
  for (const { action, graph } of actionsOf(graphs)) {
    const timing = isObject(action.timing) ? action.timing : null
    if (!timing) continue
    const easing = timing.easing
    if (isObject(easing) && easing.source === 'literal') {
      if (literalIssue('easing', easing.value) === null) continue
      values.add(`'${String(easing.value)}'`)
      easing.value = DEFAULT_EASING
    } else if (typeof easing === 'string') {
      if (literalIssue('easing', easing) === null) continue
      values.add(`'${easing}'`)
      timing.easing = DEFAULT_EASING
    } else {
      continue
    }
    changed.add(graph)
  }
  return changed.size > 0
    ? `Unknown easing ${[...values].join(', ')} in ${[...changed].join(', ')} now reads ${DEFAULT_EASING}.`
    : null
}

/**
 * A name that passes {@link isVariableName}: each other character becomes an underscore, a leading
 * digit gets an underscore before it, and a numbered suffix keeps it clear of names in `taken`.
 */
function conformingVariableName(name: string, taken: ReadonlySet<string>): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_')
  const base = /^[a-zA-Z_]/.test(cleaned) ? cleaned : `_${cleaned}`
  let candidate = base
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}_${n}`
  return candidate
}

/** Every variable declaration in the file: a cue file's group variables and each graph's own. */
function declarationsOf(file: JsonObject, graphs: readonly JsonObject[]): JsonObject[] {
  const lists = [isObject(file.group) ? file.group.variables : undefined]
  for (const graph of graphs) lists.push(graph.variables)
  return lists.flatMap((list) => (Array.isArray(list) ? list.filter(isObject) : []))
}

/** Renames every variable use under `node`: variable value sources and logic node name fields. */
function renameUses(node: unknown, renames: ReadonlyMap<string, string>): void {
  if (Array.isArray(node)) {
    for (const item of node) renameUses(item, renames)
    return
  }
  if (!isObject(node)) return
  if (node.source === 'variable' && typeof node.name === 'string') {
    node.name = renames.get(node.name) ?? node.name
  }
  for (const field of NAME_FIELDS) {
    const value = node[field]
    if (typeof value === 'string') node[field] = renames.get(value) ?? value
  }
  for (const field of NAME_LIST_FIELDS) {
    const value = node[field]
    if (Array.isArray(value)) {
      node[field] = value.map(
        (name) => (typeof name === 'string' ? renames.get(name) : name) ?? name,
      )
    }
  }
  for (const child of Object.values(node)) renameUses(child, renames)
}

/**
 * An effect raiser passes its parameters by the effect's variable names. The effect file renames a
 * non-conforming one on its own load, so the raiser's key follows the same rule.
 */
function renameRaiserParameters(graph: JsonObject, renamed: Map<string, string>): void {
  const raisers = isObject(graph.nodes) ? graph.nodes.effectRaisers : undefined
  if (!Array.isArray(raisers)) return
  for (const raiser of raisers) {
    if (!isObject(raiser) || !isObject(raiser.parameterValues)) continue
    const keys = Object.keys(raiser.parameterValues)
    if (keys.every(isVariableName)) continue
    const taken = new Set(keys.filter(isVariableName))
    const next: JsonObject = {}
    for (const [key, value] of Object.entries(raiser.parameterValues)) {
      const name = isVariableName(key) ? key : conformingVariableName(key, taken)
      taken.add(name)
      if (name !== key) renamed.set(key, name)
      next[name] = value
    }
    raiser.parameterValues = next
  }
}

function renameVariables(file: JsonObject, graphs: readonly JsonObject[]): string | null {
  const declarations = declarationsOf(file, graphs)
  const names = declarations.flatMap((d) => (typeof d.name === 'string' ? [d.name] : []))
  const taken = new Set(names)
  const renames = new Map<string, string>()
  for (const name of names) {
    if (name === '' || isVariableName(name) || renames.has(name)) continue
    const next = conformingVariableName(name, taken)
    taken.add(next)
    renames.set(name, next)
  }

  if (renames.size > 0) {
    for (const declaration of declarations) {
      if (typeof declaration.name === 'string') {
        declaration.name = renames.get(declaration.name) ?? declaration.name
      }
    }
    for (const graph of graphs) renameUses(graph.nodes, renames)
  }

  const renamed = new Map(renames)
  for (const graph of graphs) renameRaiserParameters(graph, renamed)
  if (renamed.size === 0) return null
  const pairs = [...renamed].map(([from, to]) => `'${from}' is now '${to}'`)
  return `Variable names must use letters, digits and underscores: ${pairs.join(', ')}.`
}

/**
 * Rewrites what an older build wrote in a parsed cue or effect file, in place. Returns one note per
 * kind of change, and none for a file already on the current rules.
 */
export function migrateOlderNodeFile(file: unknown): string[] {
  if (!isObject(file)) return []
  const graphs = graphsOf(file)
  return [
    retireBlendModes(graphs),
    replaceUnknownEasings(graphs),
    renameVariables(file, graphs),
  ].filter((note): note is string => note !== null)
}
