/** The rule that holds a switch which starts and stops a listener or sender. */

/**
 * Holds the switch while it is locked, and while it is off and not ready to start. A reason to
 * hold off starting leaves a running listener or sender free to be switched off.
 */
export function isRunSwitchHeld(running: boolean, notReady: boolean, locked: boolean): boolean {
  return locked || (notReady && !running)
}
