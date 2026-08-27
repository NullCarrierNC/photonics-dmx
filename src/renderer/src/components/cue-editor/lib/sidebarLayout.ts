import type { Layout } from 'react-resizable-panels'

const SIDEBAR_LAYOUT_KEY = 'photonics.nodeCueEditor.sidebarLayout'
// Original grid was minmax(260px,300px) | 2fr | minmax(260px,400px), approximated as percentages.
export const DEFAULT_SIDEBAR_LAYOUT: Layout = { left: 25, center: 42, right: 33 }

/**
 * The stored three-pane split, or null when nothing usable is stored. Rejects a layout whose panes
 * are too narrow to use or whose widths do not add up, so a corrupted entry falls back to the
 * default rather than rendering an unusable editor.
 */
export function getStoredSidebarLayout(): Layout | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem(SIDEBAR_LAYOUT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Layout
    if (!parsed || typeof parsed !== 'object') return null
    const left = Number(parsed.left)
    const center = Number(parsed.center)
    const right = Number(parsed.right)
    const sum = left + center + right
    if (
      Number.isNaN(left) ||
      Number.isNaN(center) ||
      Number.isNaN(right) ||
      left < 15 ||
      right < 15 ||
      center < 25 ||
      sum < 99 ||
      sum > 101
    ) {
      return null
    }
    return { left, center, right }
  } catch {
    return null
  }
}

export function setStoredSidebarLayout(layout: Layout): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    // Storage might be unavailable
  }
}
