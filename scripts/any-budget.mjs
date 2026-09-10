/**
 * Counts `@typescript-eslint/no-explicit-any` reports under `src/` against
 * metrics/explicit-any-budget.txt, so the count cannot grow without a deliberate budget update.
 */
import { runRuleBudget } from './ruleBudgetCore.mjs'

runRuleBudget({
  ruleId: '@typescript-eslint/no-explicit-any',
  budgetFile: 'metrics/explicit-any-budget.txt',
  label: 'Explicit any',
  note: 'Lower this when reducing explicit any; do not increase without a deliberate pass.',
})
