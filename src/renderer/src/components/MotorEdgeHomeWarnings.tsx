import React from 'react'

/** Warning when pan or tilt home is captured within 5% of a mechanical limit (0% or 100%). */
export function MotorEdgeHomeWarnings(props: { panHome: number; tiltHome: number }) {
  const { panHome, tiltHome } = props
  const panEdge = panHome <= 5 || panHome >= 95
  const tiltEdge = tiltHome <= 5 || tiltHome >= 95
  if (!panEdge && !tiltEdge) {
    return null
  }
  return (
    <div
      className="rounded border border-amber-400/80 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-950 dark:text-amber-100 space-y-2"
      data-testid="mh-cal-edge-home-warning"
      role="status">
      {panEdge && (
        <p>
          Home is set near the pan motor&apos;s mechanical limit. Motion cues will be asymmetric
          (oscillating only one direction from home). For full symmetric motion, point the fixture
          at a mid-range position before capturing home.
        </p>
      )}
      {tiltEdge && (
        <p>
          Home is set near the tilt motor&apos;s mechanical limit. Motion cues will be asymmetric
          (oscillating only one direction from home). For full symmetric motion, point the fixture
          at a mid-range position before capturing home.
        </p>
      )}
    </div>
  )
}
