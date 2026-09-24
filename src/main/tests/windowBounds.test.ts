import { describe, expect, it } from '@jest/globals'
import { fitWindowBounds } from '../windowBounds'

/** A primary display with a menu bar above its work area, and a second display to its right. */
const PRIMARY = { x: 0, y: 25, width: 1920, height: 1055 }
const SECOND = { x: 1920, y: 0, width: 2560, height: 1440 }
const AREAS = [PRIMARY, SECOND]

describe('fitWindowBounds', () => {
  it('keeps a window that sits inside one display', () => {
    const bounds = { x: 100, y: 100, width: 800, height: 600 }

    expect(fitWindowBounds(bounds, AREAS, PRIMARY)).toBe(bounds)
  })

  it('keeps a window straddling two displays', () => {
    const bounds = { x: 1500, y: 200, width: 1000, height: 700 }

    expect(fitWindowBounds(bounds, AREAS, PRIMARY)).toBe(bounds)
  })

  it('keeps a maximised Windows window whose frame hangs off the edges', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    const bounds = { x: -8, y: -8, width: 1936, height: 1056 }

    expect(fitWindowBounds(bounds, [area], area)).toBe(bounds)
  })

  it('centres a window left on a display that is gone inside the primary work area', () => {
    const bounds = { x: 5000, y: 300, width: 800, height: 600 }

    expect(fitWindowBounds(bounds, AREAS, PRIMARY)).toEqual({
      x: 560,
      y: 25 + 227,
      width: 800,
      height: 600,
    })
  })

  it('centres inside a work area that does not start at the origin', () => {
    const area = { x: 1920, y: 40, width: 1280, height: 984 }

    expect(fitWindowBounds({ x: -3000, y: 0, width: 400, height: 300 }, [area], area)).toEqual({
      x: 1920 + 440,
      y: 40 + 342,
      width: 400,
      height: 300,
    })
  })

  it('shrinks a window larger than the primary work area to fit it', () => {
    const fitted = fitWindowBounds({ x: 9000, y: 0, width: 3000, height: 2000 }, AREAS, PRIMARY)

    expect(fitted).toEqual({ x: 0, y: 25, width: 1920, height: 1055 })
  })

  it('moves a window with only a sliver left on screen', () => {
    const bounds = { x: 1900, y: -700, width: 800, height: 720 }

    expect(fitWindowBounds(bounds, [PRIMARY], PRIMARY)).not.toBe(bounds)
  })
})
