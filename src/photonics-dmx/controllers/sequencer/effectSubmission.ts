/**
 * The submission policy behind EffectManager's public add/set/replace variants. Every variant
 * runs the same pipeline (validate, blackout gate, duplicate-name gate, optional clear, group,
 * apply); the policy states where each variant differs.
 */
export interface SubmissionPolicy {
  /**
   * How existing effects are handled: 'add' runs beside other layers (queueing behind the same
   * name), 'set' clears everything first, 'replace' cancels the targeted (layer, light) slots and
   * starts immediately.
   */
  mode: 'add' | 'set' | 'replace'
  /** Refuse the submission when an effect with the same name is already running anywhere. */
  blockDuplicateName: boolean
  /** What an active blackout does to the submission. */
  blackout: 'cancel' | 'refuse'
  /** Restrict the blackout interaction to effects below the system layer (255). */
  blackoutBaseLayerOnly: boolean
  /** Run the blackout gate before transition validation (setEffect's historical order). */
  blackoutFirst: boolean
  /**
   * For 'set' mode: a repeated layer-0 submission of the same name retires that effect's previous
   * run and queues the new one instead of clearing every layer.
   */
  layer0RepeatQueues: boolean
  /** Verb pair for the blackout and duplicate-name log lines. */
  verb: { imperative: 'add' | 'set' | 'replace'; progressive: 'adding' | 'setting' | 'replacing' }
  /** Log line used when this variant cancels an active blackout. */
  blackoutCancelLog: string
}

export const ADD_EFFECT: SubmissionPolicy = {
  mode: 'add',
  blockDuplicateName: false,
  blackout: 'cancel',
  blackoutBaseLayerOnly: true,
  blackoutFirst: false,
  layer0RepeatQueues: false,
  verb: { imperative: 'add', progressive: 'adding' },
  blackoutCancelLog: 'Add cancelling blackout',
}

export const REPLACE_EFFECT: SubmissionPolicy = {
  mode: 'replace',
  blockDuplicateName: false,
  blackout: 'cancel',
  blackoutBaseLayerOnly: true,
  blackoutFirst: false,
  layer0RepeatQueues: false,
  verb: { imperative: 'replace', progressive: 'replacing' },
  blackoutCancelLog: 'Replace cancelling blackout',
}

export const SET_EFFECT: SubmissionPolicy = {
  mode: 'set',
  blockDuplicateName: false,
  blackout: 'cancel',
  blackoutBaseLayerOnly: false,
  blackoutFirst: true,
  layer0RepeatQueues: true,
  verb: { imperative: 'set', progressive: 'setting' },
  blackoutCancelLog: 'Cancelling blackout for setEffect',
}

export const ADD_EFFECT_UNBLOCKED_NAME: SubmissionPolicy = {
  mode: 'add',
  blockDuplicateName: true,
  blackout: 'refuse',
  blackoutBaseLayerOnly: true,
  blackoutFirst: false,
  layer0RepeatQueues: false,
  verb: { imperative: 'add', progressive: 'adding' },
  blackoutCancelLog: 'Add cancelling blackout',
}

export const SET_EFFECT_UNBLOCKED_NAME: SubmissionPolicy = {
  mode: 'set',
  blockDuplicateName: true,
  blackout: 'refuse',
  blackoutBaseLayerOnly: true,
  blackoutFirst: false,
  layer0RepeatQueues: false,
  verb: { imperative: 'set', progressive: 'setting' },
  blackoutCancelLog: 'Cancelling blackout for setEffect',
}
