import React, { useCallback, useState } from 'react'
import { setRb3SimLedState } from '../ipcApi'

/**
 * Drives the simulated RB3 StageKit LED state for cue simulation: one toggle row per colour bank
 * (red/green/blue/yellow x 8 LEDs) plus fog and an all-off. Each change pushes the four 8-bit bank
 * masks to the running RB3 test effect, so the always-active RB3 mirror cue (and any led-N-event
 * cue) renders exactly what the live StageKit stream would produce.
 */

type Bank = 'red' | 'green' | 'blue' | 'yellow'

const BANKS: { key: Bank; label: string; on: string; off: string }[] = [
  {
    key: 'red',
    label: 'Red',
    on: 'bg-red-500 border-red-600 text-white',
    off: 'border-red-400 text-red-500',
  },
  {
    key: 'green',
    label: 'Green',
    on: 'bg-green-500 border-green-600 text-white',
    off: 'border-green-400 text-green-600',
  },
  {
    key: 'blue',
    label: 'Blue',
    on: 'bg-blue-500 border-blue-600 text-white',
    off: 'border-blue-400 text-blue-500',
  },
  {
    key: 'yellow',
    label: 'Yellow',
    on: 'bg-yellow-400 border-yellow-500 text-black',
    off: 'border-yellow-500 text-yellow-600',
  },
]

const EMPTY: Record<Bank, number> = { red: 0, green: 0, blue: 0, yellow: 0 }

const StageKitLedPanel: React.FC = () => {
  const [masks, setMasks] = useState<Record<Bank, number>>(EMPTY)
  const [fog, setFog] = useState(false)

  const push = useCallback((next: Record<Bank, number>, nextFog: boolean) => {
    void setRb3SimLedState({ ...next, fog: nextFog })
  }, [])

  const toggleLed = useCallback(
    (bank: Bank, index: number) => {
      setMasks((prev) => {
        const next = { ...prev, [bank]: prev[bank] ^ (1 << index) }
        push(next, fog)
        return next
      })
    },
    [fog, push],
  )

  const toggleFog = useCallback(() => {
    setFog((prev) => {
      const next = !prev
      push(masks, next)
      return next
    })
  }, [masks, push])

  const allOff = useCallback(() => {
    setMasks(EMPTY)
    setFog(false)
    push(EMPTY, false)
  }, [push])

  return (
    <div className="mb-4 p-3 rounded border border-gray-300 dark:border-gray-600">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">StageKit LEDs</span>
        <div className="flex gap-2">
          <button
            className={`text-xs rounded border px-2 py-1 ${fog ? 'bg-gray-500 border-gray-600 text-white' : 'border-gray-400'}`}
            onClick={toggleFog}>
            Fog
          </button>
          <button className="text-xs rounded border border-gray-400 px-2 py-1" onClick={allOff}>
            All off
          </button>
        </div>
      </div>
      <div className="space-y-1">
        {BANKS.map((bank) => (
          <div key={bank.key} className="flex items-center gap-1">
            <span className="w-14 text-xs">{bank.label}</span>
            {Array.from({ length: 8 }, (_, i) => {
              const lit = (masks[bank.key] & (1 << i)) !== 0
              return (
                <button
                  key={i}
                  aria-label={`${bank.label} LED ${i + 1}`}
                  aria-pressed={lit}
                  className={`h-6 w-6 rounded border text-[10px] ${lit ? bank.on : bank.off}`}
                  onClick={() => toggleLed(bank.key, i)}>
                  {i + 1}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default StageKitLedPanel
