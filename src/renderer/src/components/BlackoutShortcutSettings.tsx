import React, { useCallback, useState } from 'react'
import { useAtom } from 'jotai'
import { lightingPrefsAtom } from '../atoms'
import { persistPrefs } from '../ipc/persistPrefs'
import {
  DEFAULT_BLACKOUT_SHORTCUT_KEY,
  DEFAULT_BLACKOUT_SHORTCUT_SCOPE,
  type BlackoutShortcutKey,
  type BlackoutShortcutScope,
} from '../../../shared/blackoutShortcut'

/**
 * Labelled by position rather than by character. The backquote binding follows the physical key
 * below Escape, and on a non-US layout that key does not print a backtick.
 */
const KEY_OPTIONS: { value: BlackoutShortcutKey; label: string }[] = [
  { value: 'escape', label: 'Escape' },
  { value: 'backquote', label: 'Backtick ` (below Escape)' },
]

const SCOPE_OPTIONS: { value: BlackoutShortcutScope; label: string }[] = [
  { value: 'disabled', label: 'Disabled' },
  { value: 'focused', label: 'Photonics in focus' },
  { value: 'system-wide', label: 'System wide' },
]

function keyLabel(key: BlackoutShortcutKey): string {
  return key === 'escape' ? 'Escape' : 'the ` key'
}

function keyDescription(key: BlackoutShortcutKey): string {
  switch (key) {
    case 'escape':
      return 'If you have a modal open it will close on esc, so second press will toggle the lights.'
    case 'backquote':
      return "CAUTION: Won't toggle the lights if you're typing in a text box."
  }
}

function scopeDescription(scope: BlackoutShortcutScope, key: BlackoutShortcutKey): string {
  switch (scope) {
    case 'disabled':
      return 'No key toggles blackout. The sidebar button is the only way.'
    case 'focused':
      return `${keyLabel(key)} toggles blackout from any Photonics window, including the Cue Editor.`
    case 'system-wide':
      return `${keyLabel(key)} also works while Photonics is in the background.`
  }
}

const BlackoutShortcutSettings: React.FC = () => {
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const key = prefs.blackoutShortcutKey ?? DEFAULT_BLACKOUT_SHORTCUT_KEY
  const scope = prefs.blackoutShortcutScope ?? DEFAULT_BLACKOUT_SHORTCUT_SCOPE

  /** Each select saves only its own preference, so a refused save of one cannot revert the other. */
  const save = useCallback(
    async (
      updates:
        | { blackoutShortcutKey: BlackoutShortcutKey }
        | { blackoutShortcutScope: BlackoutShortcutScope },
      what: string,
    ) => {
      if (saving) return
      setSaving(true)
      setSaveError(null)
      const saved = await persistPrefs(updates, what, setSaveError)
      if (saved) {
        setPrefs((prev) => ({ ...prev, ...updates }))
      }
      setSaving(false)
    },
    [saving, setPrefs],
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Blackout Shortcut Key
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Binds a key to the master blackout, so output can be toggled by a keypress.
      </p>

      <label
        htmlFor="blackout-shortcut-key"
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Key
      </label>
      <select
        id="blackout-shortcut-key"
        value={key}
        disabled={saving}
        aria-describedby="blackout-shortcut-key-description"
        onChange={(e) =>
          void save(
            { blackoutShortcutKey: e.target.value as BlackoutShortcutKey },
            'the blackout shortcut key',
          )
        }
        className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
        {KEY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p
        id="blackout-shortcut-key-description"
        className="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-4">
        {keyDescription(key)}
      </p>

      <label
        htmlFor="blackout-shortcut-scope"
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Binding
      </label>
      <select
        id="blackout-shortcut-scope"
        value={scope}
        disabled={saving}
        aria-describedby="blackout-shortcut-scope-description"
        onChange={(e) =>
          void save(
            { blackoutShortcutScope: e.target.value as BlackoutShortcutScope },
            'the blackout shortcut binding',
          )
        }
        className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
        {SCOPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p
        id="blackout-shortcut-scope-description"
        className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        {scopeDescription(scope, key)}
      </p>

      {scope === 'system-wide' && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          {key === 'backquote'
            ? 'NOTE: this takes the ` key away from every other application while Photonics is running - even when not in focus. No backticks in a terminal, a chat window editor, etc.'
            : 'NOTE: this takes ESC key away from every other application while Photonics is running - even when not in focus.'}
        </p>
      )}

      {saveError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {saveError}
        </p>
      )}
    </div>
  )
}

export default BlackoutShortcutSettings
