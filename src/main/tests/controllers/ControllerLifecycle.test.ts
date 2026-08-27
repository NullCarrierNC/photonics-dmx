import { describe, expect, it, jest } from '@jest/globals'
import type { LifecyclePhase } from '../../../shared/ipcTypes'
import { ControllerLifecycle } from '../../controllers/ControllerLifecycle'
import { setLogSink } from '../../../shared/logger'

describe('ControllerLifecycle', () => {
  describe('setPhase', () => {
    it('broadcasts only real transitions', () => {
      const broadcasts: LifecyclePhase[] = []
      const lifecycle = new ControllerLifecycle((phase) => broadcasts.push(phase))

      lifecycle.setPhase('running')
      lifecycle.setPhase('running')
      lifecycle.setPhase('shuttingDown')

      expect(broadcasts).toEqual(['running', 'shuttingDown'])
      expect(lifecycle.phase).toBe('shuttingDown')
    })

    it('performs but warns on a transition outside the table', () => {
      const lifecycle = new ControllerLifecycle(() => {})
      const warnings: string[] = []
      setLogSink((e) => {
        if (e.level === 'warn') warnings.push(e.message)
      })
      try {
        lifecycle.setPhase('stopped')
      } finally {
        setLogSink(undefined)
      }

      expect(lifecycle.phase).toBe('stopped')
      expect(warnings.some((m) => m.includes('initializing -> stopped'))).toBe(true)
    })

    it('does not warn on a transition the table allows', () => {
      const lifecycle = new ControllerLifecycle(() => {})
      const warnings: string[] = []
      setLogSink((e) => {
        if (e.level === 'warn') warnings.push(e.message)
      })
      try {
        lifecycle.setPhase('running')
        lifecycle.setPhase('restarting')
        lifecycle.setPhase('failed')
        lifecycle.setPhase('shuttingDown')
        lifecycle.setPhase('stopped')
      } finally {
        setLogSink(undefined)
      }

      expect(warnings).toEqual([])
    })
  })

  describe('assertPhase', () => {
    it('throws with the context and allowed phases when the phase is not allowed', () => {
      const lifecycle = new ControllerLifecycle(() => {})
      expect(() => lifecycle.assertPhase(['running', 'failed'], 'restartControllers')).toThrow(
        'invalid lifecycle for restartControllers (phase=initializing, allowed=[running, failed])',
      )
      lifecycle.setPhase('running')
      expect(() => lifecycle.assertPhase(['running'], 'restartControllers')).not.toThrow()
    })
  })

  describe('runOp', () => {
    it('runs ops in order, each waiting for the previous to settle', async () => {
      const lifecycle = new ControllerLifecycle(() => {})
      const order: string[] = []
      let releaseFirst!: () => void
      const firstBarrier = new Promise<void>((r) => {
        releaseFirst = r
      })

      const first = lifecycle.runOp(async () => {
        await firstBarrier
        order.push('first')
      })
      const second = lifecycle.runOp(async () => {
        order.push('second')
      })

      await Promise.resolve()
      expect(order).toEqual([])
      releaseFirst()
      await Promise.all([first, second])
      expect(order).toEqual(['first', 'second'])
    })

    it('propagates an op failure to its caller and still runs the next op', async () => {
      const lifecycle = new ControllerLifecycle(() => {})
      const failing = lifecycle.runOp(() => Promise.reject(new Error('boom')))
      const next = lifecycle.runOp(async () => 'ok')

      await expect(failing).rejects.toThrow('boom')
      await expect(next).resolves.toBe('ok')
    })
  })

  describe('runExclusiveShutdown', () => {
    it('runs the work once and shares the in-flight attempt', async () => {
      const lifecycle = new ControllerLifecycle(() => {})
      lifecycle.setPhase('running')
      let releaseWork!: () => void
      const barrier = new Promise<void>((r) => {
        releaseWork = r
      })
      const work = jest.fn().mockImplementation(() => barrier)

      const p1 = lifecycle.runExclusiveShutdown(work as () => Promise<void>)
      const p2 = lifecycle.runExclusiveShutdown(work as () => Promise<void>)
      expect(lifecycle.isShutdownInFlight()).toBe(true)

      releaseWork()
      await Promise.all([p1, p2])

      expect(work).toHaveBeenCalledTimes(1)
      expect(lifecycle.isShutdownComplete()).toBe(true)
      expect(lifecycle.isShutdownInFlight()).toBe(false)
      expect(lifecycle.phase).toBe('stopped')
    })

    it('resolves immediately once completed, without re-running the work', async () => {
      const lifecycle = new ControllerLifecycle(() => {})
      lifecycle.setPhase('running')
      const work = jest.fn().mockImplementation(() => Promise.resolve())

      await lifecycle.runExclusiveShutdown(work as () => Promise<void>)
      await lifecycle.runExclusiveShutdown(work as () => Promise<void>)

      expect(work).toHaveBeenCalledTimes(1)
    })

    it('a failing stopped-phase broadcast still marks completion so the retry short-circuits', async () => {
      // In-process state is consistent (work done) even though the trailing notification failed,
      // so a retry must not re-run the teardown.
      const lifecycle = new ControllerLifecycle((phase) => {
        if (phase === 'stopped') {
          throw new Error('phase emit failed')
        }
      })
      lifecycle.setPhase('running')
      const work = jest.fn().mockImplementation(() => Promise.resolve())

      await expect(lifecycle.runExclusiveShutdown(work as () => Promise<void>)).rejects.toThrow(
        /phase emit failed/,
      )

      expect(lifecycle.isShutdownComplete()).toBe(true)
      expect(lifecycle.isShutdownInFlight()).toBe(false)

      await lifecycle.runExclusiveShutdown(work as () => Promise<void>)
      expect(work).toHaveBeenCalledTimes(1)
    })

    it('a failed teardown clears the memo, stays incomplete, and can be retried', async () => {
      const lifecycle = new ControllerLifecycle(() => {})
      lifecycle.setPhase('running')

      await expect(
        lifecycle.runExclusiveShutdown(() => Promise.reject(new Error('teardown failed'))),
      ).rejects.toThrow('teardown failed')

      expect(lifecycle.isShutdownComplete()).toBe(false)
      expect(lifecycle.isShutdownInFlight()).toBe(false)
      expect(lifecycle.phase).not.toBe('stopped')

      await lifecycle.runExclusiveShutdown(() => Promise.resolve())
      expect(lifecycle.isShutdownComplete()).toBe(true)
      expect(lifecycle.phase).toBe('stopped')
    })
  })

  describe('runSharedRestart', () => {
    it('memoizes overlapping calls onto one attempt and clears on resolve', async () => {
      const lifecycle = new ControllerLifecycle(() => {})
      let releaseWork!: () => void
      const barrier = new Promise<void>((r) => {
        releaseWork = r
      })
      const work = jest.fn().mockImplementation(() => barrier)

      const p1 = lifecycle.runSharedRestart(work as () => Promise<void>)
      const p2 = lifecycle.runSharedRestart(work as () => Promise<void>)
      expect(p2).toBe(p1)
      expect(lifecycle.isRestartInFlight()).toBe(true)

      releaseWork()
      await Promise.all([p1, p2])

      expect(work).toHaveBeenCalledTimes(1)
      expect(lifecycle.isRestartInFlight()).toBe(false)
    })

    it('clears the memo on rejection so a later restart runs fresh', async () => {
      const lifecycle = new ControllerLifecycle(() => {})

      await expect(
        lifecycle.runSharedRestart(() => Promise.reject(new Error('restart failed'))),
      ).rejects.toThrow('restart failed')
      expect(lifecycle.isRestartInFlight()).toBe(false)

      const work = jest.fn().mockImplementation(() => Promise.resolve())
      await lifecycle.runSharedRestart(work as () => Promise<void>)
      expect(work).toHaveBeenCalledTimes(1)
    })

    it('queues the restart behind an op already holding the queue', async () => {
      const lifecycle = new ControllerLifecycle(() => {})
      const order: string[] = []
      let releaseOp!: () => void
      const opBarrier = new Promise<void>((r) => {
        releaseOp = r
      })

      const op = lifecycle.runOp(async () => {
        await opBarrier
        order.push('op')
      })
      const restart = lifecycle.runSharedRestart(async () => {
        order.push('restart')
      })

      await Promise.resolve()
      expect(order).toEqual([])
      releaseOp()
      await Promise.all([op, restart])
      expect(order).toEqual(['op', 'restart'])
    })
  })

  describe('await helpers', () => {
    it('awaitInFlightWork waits on a restart and swallows its failure', async () => {
      const lifecycle = new ControllerLifecycle(() => {})
      let rejectWork!: (err: Error) => void
      const barrier = new Promise<void>((_, reject) => {
        rejectWork = reject
      })
      const restart = lifecycle.runSharedRestart(() => barrier)
      restart.catch(() => {})

      let waited = false
      const waiter = lifecycle.awaitInFlightWork().then(() => {
        waited = true
      })
      await Promise.resolve()
      expect(waited).toBe(false)

      rejectWork(new Error('boom'))
      await waiter
      expect(waited).toBe(true)
    })

    it('awaitShutdownWork waits only on a shutdown, not a restart', async () => {
      const lifecycle = new ControllerLifecycle(() => {})
      lifecycle.setPhase('running')
      let releaseRestart!: () => void
      const restartBarrier = new Promise<void>((r) => {
        releaseRestart = r
      })
      void lifecycle.runSharedRestart(() => restartBarrier)

      await expect(lifecycle.awaitShutdownWork()).resolves.toBeUndefined()

      let releaseShutdown!: () => void
      const shutdownBarrier = new Promise<void>((r) => {
        releaseShutdown = r
      })
      void lifecycle.runExclusiveShutdown(() => shutdownBarrier)

      let waited = false
      const waiter = lifecycle.awaitShutdownWork().then(() => {
        waited = true
      })
      await Promise.resolve()
      expect(waited).toBe(false)

      releaseShutdown()
      await waiter
      expect(waited).toBe(true)
      releaseRestart()
    })
  })
})
