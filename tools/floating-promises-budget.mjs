/**
 * Counts `@typescript-eslint/no-floating-promises` reports under `src/` against
 * metrics/floating-promises-budget.txt.
 *
 * The rule needs the type checker and reports across a backlog too large to settle in one pass, so
 * it warns rather than errors and this holds the line: a promise nobody awaits or catches can only
 * be added by lowering an existing one.
 */
import { runRuleBudget } from './ruleBudgetCore.mjs'

runRuleBudget({
  ruleId: '@typescript-eslint/no-floating-promises',
  budgetFile: 'metrics/floating-promises-budget.txt',
  label: 'Floating promises',
  note: 'Lower this as call sites gain an await, a catch, or an explicit void.',
})
