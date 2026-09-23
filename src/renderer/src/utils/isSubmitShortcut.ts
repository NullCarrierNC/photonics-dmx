/** Cmd+Enter on macOS and Ctrl+Enter elsewhere, which submit a dialog from any of its fields. */
export function isSubmitShortcut(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
}): boolean {
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey)
}
