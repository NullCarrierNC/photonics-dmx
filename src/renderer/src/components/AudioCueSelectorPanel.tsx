import React, { useCallback, useEffect, useState } from 'react';

interface AudioCueOption {
  id: string;
  label: string;
  description: string;
  groupId: string;
  groupName: string;
}

interface CueStateResponse {
  success: boolean;
  activeCueType?: string | null;
  cues?: AudioCueOption[];
  error?: string;
}

interface AudioCueSelectorPanelProps {
  className?: string;
}

const AudioCueSelectorPanel: React.FC<AudioCueSelectorPanelProps> = ({ className = '' }) => {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [availableCues, setAvailableCues] = useState<AudioCueOption[]>([]);
  const [activeCue, setActiveCue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCueState = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
        }
        const enabled = await window.electron.ipcRenderer.invoke('get-audio-enabled');
        setAudioEnabled(enabled);

        if (!enabled) {
          setAvailableCues([]);
          setActiveCue(null);
          setError(null);
          return;
        }

        const response: CueStateResponse = await window.electron.ipcRenderer.invoke('get-audio-reactive-cues');
        if (response?.success) {
          setAvailableCues(response.cues ?? []);
          setActiveCue(response.activeCueType ?? null);
          setError(null);
        } else {
          setAvailableCues([]);
          setActiveCue(null);
          setError(response?.error || 'Unable to load audio cue state');
        }
      } catch (err) {
        console.error('Failed to load audio reactive cues', err);
        setError('Failed to load audio cue state');
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    loadCueState();

    const handleAudioEvent = () => loadCueState(true);
    const ipc = window.electron.ipcRenderer;

    ipc.on('audio:config-update', handleAudioEvent);
    ipc.on('audio:enable', handleAudioEvent);
    ipc.on('audio:disable', handleAudioEvent);

    return () => {
      ipc.removeListener('audio:config-update', handleAudioEvent);
      ipc.removeListener('audio:enable', handleAudioEvent);
      ipc.removeListener('audio:disable', handleAudioEvent);
    };
  }, [loadCueState]);

  const handleCueChange = async (cueId: string) => {
    if (saving || cueId === activeCue) {
      return;
    }

    setSaving(true);
    try {
      const result: { success: boolean; error?: string } = await window.electron.ipcRenderer.invoke(
        'set-active-audio-cue',
        cueId
      );
      if (result?.success) {
        setActiveCue(cueId);
        setError(null);
      } else {
        setError(result?.error || 'Unable to update cue selection');
      }
    } catch (err) {
      console.error('Failed to set active audio cue', err);
      setError('Failed to set active cue');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md  ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Audio Reactive Cue</h2>
        <span
          className={`text-xs font-semibold px-2 py-1 rounded ${
            audioEnabled
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
              : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          {audioEnabled ? 'Audio Reactive Enabled' : 'Audio Reactive Disabled'}
        </span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Choose which audio-reactive cue drives the DMX output while Audio Reactive mode is active.
      </p>

      {error && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900 dark:text-red-100">
          {error}
        </div>
      )}

      {!audioEnabled && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Enable Audio Reactive mode in Audio Settings to pick a cue.
        </p>
      )}

      {audioEnabled && loading && (
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading available cues…</p>
      )}

      {audioEnabled && !loading && availableCues.length === 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-400">No audio cues are available in the enabled groups.</p>
      )}

      {audioEnabled && !loading && availableCues.length > 0 && (
        <div className="space-y-3">
          {availableCues.map((cue) => (
            <label
              key={cue.id}
              className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                activeCue === cue.id
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <input
                type="radio"
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                name="audio-cue"
                value={cue.id}
                checked={activeCue === cue.id}
                disabled={saving}
                onChange={() => handleCueChange(cue.id)}
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{cue.label || cue.id}</span>
                  <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {cue.groupName}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">{cue.description}</p>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default AudioCueSelectorPanel;

