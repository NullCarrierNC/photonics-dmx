/**
 * Counts casts through `unknown`, `any` or `never` and the comment directives that switch type
 * checking off, and single casts to `never`, in every source under `src/` with the tests included,
 * against metrics/type-escape-budget.txt. Double casts through other middle types and helpers
 * whose body is a cast are reported beside them and never fail the check.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runCountBudget } from './ruleBudgetCore.mjs'

const require = createRequire(import.meta.url)
const { countTypeEscapes } = require('./typeEscapesCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
/** Script and TypeScript sources, in every module flavour. */
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/

let count = 0
let neverCasts = 0
let otherDoubleCasts = 0
/** @type {string[]} */
const castHelpers = []
for (const entry of readdirSync(join(root, 'src'), { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !SOURCE.test(entry.name)) {
    continue
  }
  const path = join(entry.parentPath ?? entry.path, entry.name)
  const escapes = countTypeEscapes(readFileSync(path, 'utf8'), path)
  count += escapes.casts + escapes.directives
  neverCasts += escapes.neverCasts
  otherDoubleCasts += escapes.otherDoubleCasts
  for (const { name, line } of escapes.castHelpers) {
    castHelpers.push(`${relative(root, path)}:${line} ${name}`)
  }
}

console.log(`Reported only: double casts through another middle type ${otherDoubleCasts}`)
for (const helper of castHelpers) {
  console.warn(`warning: ${helper} only casts its parameter. Type what flows or check it`)
}

runCountBudget({
  counts: new Map([
    ['escapes', count],
    ['never-casts', neverCasts],
  ]),
  budgetFile: 'metrics/type-escape-budget.txt',
  label: 'Type',
  counted:
    'escapes are casts through unknown, any or never, and @ts-expect-error, @ts-ignore and @ts-nocheck directives. never-casts are single casts to never. Both under src/ with the tests included.',
  note: 'Lower these when removing type escapes or casts to never. Do not raise them without a deliberate pass.',
})
