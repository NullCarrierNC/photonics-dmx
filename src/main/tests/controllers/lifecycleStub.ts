import { ControllerLifecycle } from '../../controllers/ControllerLifecycle'
import type { LifecyclePhase } from '../../../shared/ipcTypes'

/**
 * A lifecycle already sitting in `phase`, for tests that drive ControllerManager methods against a
 * partial prototype stub. Phase broadcasts go nowhere, so no renderer stub is needed.
 */
export function lifecycleAt(phase: LifecyclePhase): ControllerLifecycle {
  const lifecycle = new ControllerLifecycle(() => {})
  lifecycle.setPhase(phase)
  return lifecycle
}

/**
 * A lifecycle whose operation queue is occupied until `barrier` settles, so a test can observe what
 * a caller does while another lifecycle op holds the queue.
 */
export function lifecycleBlockedOn(
  barrier: Promise<void>,
  phase: LifecyclePhase = 'running',
): ControllerLifecycle {
  const lifecycle = lifecycleAt(phase)
  void lifecycle.runOp(() => barrier)
  return lifecycle
}
