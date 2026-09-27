import type { Logger } from '../../shared/logger'

/**
 * Teardown steps that each run whatever an earlier one threw. Each failure is logged, and
 * {@link TeardownSteps.rethrowFirst} throws the first once every step has run.
 */
export class TeardownSteps {
  private readonly failures: unknown[] = []

  constructor(private readonly log: Logger) {}

  /** Runs `step`, logging a throw as `Error <what>:` and keeping it for rethrowFirst. */
  run(what: string, step: () => void): void {
    try {
      step()
    } catch (err) {
      this.log.error(`Error ${what}:`, err)
      this.failures.push(err)
    }
  }

  /** Throws the first failure, when a step threw. */
  rethrowFirst(): void {
    if (this.failures.length > 0) throw this.failures[0]
  }
}
