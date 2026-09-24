/** A window's size and position in screen coordinates. */
export interface WindowBounds {
  width: number
  height: number
  x: number
  y: number
}

/** How much of a window has to lie on a display's work area, each way, to count as reachable. */
const MIN_VISIBLE_PX = 64

function isReachableOn(bounds: WindowBounds, area: WindowBounds): boolean {
  const visibleWidth =
    Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
  const visibleHeight =
    Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
  return (
    visibleWidth >= Math.min(MIN_VISIBLE_PX, bounds.width) &&
    visibleHeight >= Math.min(MIN_VISIBLE_PX, bounds.height)
  )
}

/**
 * Keeps a restored window where the user can reach it. Bounds with a usable part on any display's
 * work area stay as they are, which covers a window straddling two displays and a maximised
 * Windows window whose frame sits a few pixels off screen. Anything else shrinks to fit the
 * primary work area and is centred in it.
 */
export function fitWindowBounds(
  bounds: WindowBounds,
  workAreas: readonly WindowBounds[],
  primaryWorkArea: WindowBounds,
): WindowBounds {
  if (workAreas.some((area) => isReachableOn(bounds, area))) {
    return bounds
  }
  return centredIn(bounds, primaryWorkArea)
}

/** A window of this size centred in a work area, shrunk to fit it. */
export function centredIn(
  size: { width: number; height: number },
  area: WindowBounds,
): WindowBounds {
  const width = Math.min(size.width, area.width)
  const height = Math.min(size.height, area.height)
  return {
    width,
    height,
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.floor((area.height - height) / 2),
  }
}
