import { atom } from 'jotai'
import { getMasterOutput, setMasterOutput } from '../ipcApi'
import {
  DEFAULT_MASTER_DIMMER_PERCENT,
  type MasterOutputSnapshot,
} from '../../../photonics-dmx/controllers/MasterOutputState'
import { createLogger } from '../../../shared/logger'

const log = createLogger('masterOutput')

/**
 * The global output controls, shared by every driver of them.
 *
 * Main holds the authoritative state and this mirrors it. The write path lives here rather than in
 * the sidebar because several things drive these controls: the sidebar's own buttons, the keyboard
 * shortcut in every window, and the main process itself while `system-wide` is armed. One set of
 * atoms keeps one generation counter and one optimistic value between them, where a hook called
 * from several places would give each caller its own and leave the races the generation counter
 * exists to settle.
 */
export const masterOutputAtom = atom<MasterOutputSnapshot>({
  dimmerPercent: DEFAULT_MASTER_DIMMER_PERCENT,
  blackout: false,
  strobeOutputEnabled: true,
})

/** Monotonic: the newest interaction wins over any read or write already in flight. */
const syncGenerationAtom = atom(0)

/** How many of our own writes are in flight, so a broadcast cannot overwrite a newer local value. */
const pendingWritesAtom = atom(0)

/** Reads master output from main. Stale responses are dropped via the generation. */
export const refreshMasterOutputAtom = atom(null, async (get, set): Promise<void> => {
  const generation = get(syncGenerationAtom) + 1
  set(syncGenerationAtom, generation)
  try {
    const state = await getMasterOutput()
    if (generation !== get(syncGenerationAtom)) return
    set(masterOutputAtom, state)
  } catch (err) {
    log.error('Failed to read master output state', err)
  }
})

/**
 * Applies a live change. Advances the generation before sending, so this interaction wins over any
 * read or write already in flight, whichever settles last. A refused or failed change re-reads main
 * to resync, since the fields already show a value main never held.
 */
export const applyMasterOutputAtom = atom(
  null,
  async (
    get,
    set,
    update: { dimmerPercent?: number; blackout?: boolean; strobeOutputEnabled?: boolean },
  ): Promise<void> => {
    const generation = get(syncGenerationAtom) + 1
    set(syncGenerationAtom, generation)
    set(pendingWritesAtom, get(pendingWritesAtom) + 1)
    try {
      const result = await setMasterOutput(update)
      if (generation !== get(syncGenerationAtom)) return
      if (!result.success) {
        log.error('Failed to apply master output change', result.error)
        void set(refreshMasterOutputAtom)
        return
      }
      set(masterOutputAtom, result.state)
    } catch (err) {
      log.error('Failed to apply master output change', err)
      void set(refreshMasterOutputAtom)
    } finally {
      set(pendingWritesAtom, Math.max(0, get(pendingWritesAtom) - 1))
    }
  },
)

/**
 * Latches or releases blackout.
 *
 * Reading through `get` rather than from a captured value is what lets the shortcut listener register
 * once and still toggle from the freshest state.
 */
export const toggleBlackoutAtom = atom(null, (get, set): void => {
  const next = !get(masterOutputAtom).blackout
  set(masterOutputAtom, (prev) => ({ ...prev, blackout: next }))
  void set(applyMasterOutputAtom, { blackout: next })
})

/**
 * Takes a snapshot main broadcast after someone else changed blackout.
 *
 * Dropped while one of our own writes is in flight: that write's result is strictly newer, and
 * applying the broadcast in between would flicker the optimistic value we are about to confirm.
 */
export const receiveMasterOutputAtom = atom(
  null,
  (get, set, snapshot: MasterOutputSnapshot): void => {
    if (get(pendingWritesAtom) > 0) return
    set(masterOutputAtom, snapshot)
  },
)

/** Drops any response still in flight, so a late resolve cannot write after teardown. */
export const abandonMasterOutputSyncAtom = atom(null, (get, set): void => {
  set(syncGenerationAtom, get(syncGenerationAtom) + 1)
})
