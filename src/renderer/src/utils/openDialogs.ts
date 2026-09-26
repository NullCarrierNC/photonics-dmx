/** The modal dialogs open in this window, read from the page itself. */

/** Calls `onChange` whenever elements are added to or removed from the page. */
export function subscribeToPage(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}

/**
 * The innermost open dialog, if any, which is the one on top. An `aria-modal` dialog hides
 * everything outside it from assistive technology.
 */
export function innermostOpenDialog(): HTMLElement | null {
  const open = document.querySelectorAll<HTMLElement>('[aria-modal="true"]')
  return open.length > 0 ? open[open.length - 1] : null
}

export function isDialogOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null
}
