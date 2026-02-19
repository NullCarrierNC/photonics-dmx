import React from 'react';
import VariableRegistry from './variable-registry/VariableRegistry';
import EventRegistry from './EventRegistry';
import EffectRegistry from './EffectRegistry';
import type { EditorDocument } from '../lib/types';
import type { VariableDefinition, EventDefinition, EffectReference } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { YargEffectDefinition, AudioEffectDefinition } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';

type RegistryTab = 'variables' | 'events' | 'effects';

type CueEditorRegistryPanelProps = {
  registryTab: RegistryTab;
  setRegistryTab: (tab: RegistryTab) => void;
  hasFile: boolean;
  editorDoc: EditorDocument | null;
  selectedCueId: string | null;
  currentEffectDefinition: YargEffectDefinition | AudioEffectDefinition | null;
  onVariablesChange: (groupVars: VariableDefinition[], cueVars: VariableDefinition[]) => void;
  getVariableReferences: (varName: string, scope: 'cue' | 'cue-group') => string[];
  onEventsChange: (events: EventDefinition[]) => void;
  getEventReferences: (eventName: string) => string[];
  onEffectsChange: (effects: EffectReference[]) => void;
};

const CueEditorRegistryPanel: React.FC<CueEditorRegistryPanelProps> = ({
  registryTab,
  setRegistryTab,
  hasFile,
  editorDoc,
  selectedCueId,
  currentEffectDefinition,
  onVariablesChange,
  getVariableReferences,
  onEventsChange,
  getEventReferences,
  onEffectsChange
}) => (
  <div
    className={`bg-white dark:bg-gray-900 rounded-lg shadow-inner overflow-hidden flex flex-col ${!hasFile ? 'opacity-50 pointer-events-none' : ''}`}
  >
    <div className="flex border-b border-gray-200 dark:border-gray-700">
      <button
        className={`flex-1 px-3 py-2 text-xs font-medium ${
          registryTab === 'variables'
            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border-b-2 border-blue-600'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
        onClick={() => setRegistryTab('variables')}
      >
        {editorDoc?.mode === 'effect' ? 'Effect Variables' : 'Variables'}
      </button>
      <button
        className={`flex-1 px-3 py-2 text-xs font-medium ${
          registryTab === 'events'
            ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 border-b-2 border-purple-600'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
        onClick={() => setRegistryTab('events')}
      >
        {editorDoc?.mode === 'effect' ? 'Effect Events' : 'Events'}
      </button>
      {editorDoc?.mode === 'cue' && (
        <button
          className={`flex-1 px-3 py-2 text-xs font-medium ${
            registryTab === 'effects'
              ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-300 border-b-2 border-cyan-600'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
          onClick={() => setRegistryTab('effects')}
        >
          Effects
        </button>
      )}
    </div>
    <div className="flex-1 overflow-y-auto">
      {registryTab === 'variables' ? (
        <VariableRegistry
          editorDoc={editorDoc}
          selectedCueId={selectedCueId}
          currentEffect={currentEffectDefinition}
          onVariablesChange={onVariablesChange}
          getVariableReferences={getVariableReferences}
        />
      ) : registryTab === 'events' ? (
        <EventRegistry
          editorDoc={editorDoc}
          selectedCueId={selectedCueId}
          onEventsChange={onEventsChange}
          getEventReferences={getEventReferences}
        />
      ) : (
        <EffectRegistry
          editorDoc={editorDoc}
          selectedCueId={selectedCueId}
          onEffectsChange={onEffectsChange}
        />
      )}
    </div>
  </div>
);

export default CueEditorRegistryPanel;
