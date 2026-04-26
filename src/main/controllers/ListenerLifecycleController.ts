import { ListenerCoordinator, type ListenerCoordinatorDeps } from './ListenerCoordinator'
import { AudioController, type AudioControllerDeps } from './AudioController'

/**
 * Owns YARG / RB3 network listener coordination and the audio cue pipeline,
 * matching the "sender owns SenderManager" split used by {@link SenderLifecycleController}.
 */
export class ListenerLifecycleController {
  public readonly yargRb3: ListenerCoordinator
  public readonly audio: AudioController

  constructor(lcb: ListenerCoordinatorDeps, acb: AudioControllerDeps) {
    this.yargRb3 = new ListenerCoordinator(lcb)
    this.audio = new AudioController(acb)
  }
}
