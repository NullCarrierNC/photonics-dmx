/**
 * Counts casts through `unknown` or `any` and the comment directives that switch type checking
 * off, in every source under `src/` with the tests included, against
 * metrics/type-escape-budget.txt.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runCountBudget } from './ruleBudgetCore.mjs'

const require = createRequire(import.meta.url)
const { countTypeEscapes } = require('./typeEscapesCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
/** Script and TypeScript sources, in every module flavour. */
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/

let count = 0
for (const entry of readdirSync(join(root, 'src'), { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !SOURCE.test(entry.name)) {
    continue
  }
  const path = join(entry.parentPath ?? entry.path, entry.name)
  const { casts, directives } = countTypeEscapes(readFileSync(path, 'utf8'), path)
  count += casts + directives
}

runCountBudget({
  count,
  budgetFile: 'metrics/type-escape-budget.txt',
  label: 'Type escapes',
  counted:
    'casts through unknown or any, and @ts-expect-error, @ts-ignore and @ts-nocheck directives, under src/ with the tests included.',
  note: 'Lower this when removing type escapes. Do not raise it without a deliberate pass.',
})
