import React, { useState } from 'react';
import type { EventDefinition } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { EditorDocument } from '../lib/types';

type Props = {
  editorDoc: EditorDocument | null;
  selectedCueId: string | null;
  onEventsChange: (events: EventDefinition[]) => void;
  getEventReferences: (eventName: string) => string[];
};

const EventRegistry: React.FC<Props> = ({
  editorDoc,
  selectedCueId,
  onEventsChange,
  getEventReferences
}) => {
  const [showDialog, setShowDialog] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<EventDefinition | null>(null);
  const [formData, setFormData] = useState<Partial<EventDefinition>>({
    name: '',
    description: ''
  });

  const currentCue = editorDoc?.file.cues.find(c => c.id === selectedCueId);
  const cueEvents = currentCue?.events ?? [];

  const openDialog = (existing?: EventDefinition) => {
    if (existing) {
      setFormData({ ...existing });
      setEditingEvent(existing);
    } else {
      setFormData({
        name: '',
        description: ''
      });
      setEditingEvent(null);
    }
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditingEvent(null);
    setFormData({
      name: '',
      description: ''
    });
  };

  const handleSave = () => {
    if (!formData.name) {
      alert('Please enter an event name');
      return;
    }

    const newEvent: EventDefinition = {
      name: formData.name,
      description: formData.description
    };

    let updatedEvents = [...cueEvents];
    if (editingEvent) {
      const index = updatedEvents.findIndex(e => e.name === editingEvent.name);
      if (index >= 0) updatedEvents[index] = newEvent;
    } else {
      // Check for duplicate names
      if (updatedEvents.some(e => e.name === newEvent.name)) {
        alert(`An event named "${newEvent.name}" already exists`);
        return;
      }
      updatedEvents.push(newEvent);
    }
    onEventsChange(updatedEvents);
    closeDialog();
  };

  const handleDelete = (eventName: string) => {
    const references = getEventReferences(eventName);
    if (references.length > 0) {
      alert(`Cannot delete "${eventName}". It is referenced by: ${references.join(', ')}`);
      return;
    }

    if (!confirm(`Delete event "${eventName}"?`)) {
      return;
    }

    const updatedEvents = cueEvents.filter(e => e.name !== eventName);
    onEventsChange(updatedEvents);
  };

  if (!editorDoc) {
    return (
      <div className="p-3">
        <p className="text-xs text-gray-500">No file selected</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-3 overflow-y-auto">
        {/* Cue Events */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium text-xs text-gray-700 dark:text-gray-300">Cue Events</h4>
            <button
              className="text-purple-500 text-[10px] hover:underline disabled:text-gray-400"
              onClick={() => openDialog()}
              disabled={!selectedCueId}
            >
              + Add
            </button>
          </div>
          <div className="space-y-1">
            {!selectedCueId ? (
              <p className="text-[10px] text-gray-500 italic">Select a cue</p>
            ) : cueEvents.length === 0 ? (
              <p className="text-[10px] text-gray-500 italic">No events defined</p>
            ) : (
              cueEvents.map(event => (
                <div
                  key={event.name}
                  className="flex items-center gap-2 text-[11px] p-1.5 rounded border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-semibold truncate">{event.name}</div>
                    {event.description && (
                      <div className="text-[10px] text-gray-500">
                        {event.description}
                      </div>
                    )}
                  </div>
                  <button
                    className="text-purple-500 hover:underline text-[10px]"
                    onClick={() => openDialog(event)}
                  >
                    Edit
                  </button>
                  <button
                    className="text-red-500 hover:underline text-[10px]"
                    onClick={() => handleDelete(event.name)}
                  >
                    Del
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-96 max-w-full">
            <h3 className="font-semibold text-lg mb-4">
              {editingEvent ? 'Edit' : 'Add'} Event
            </h3>
            <div className="space-y-3">
              <label className="flex flex-col font-medium text-sm">
                Name
                <input
                  type="text"
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={formData.name ?? ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="eventName"
                  pattern="[a-zA-Z_][a-zA-Z0-9_]*"
                  disabled={!!editingEvent}
                />
                <span className="text-[10px] text-gray-500 mt-1">
                  Must start with letter or underscore
                </span>
              </label>

              <label className="flex flex-col font-medium text-sm">
                Description (optional)
                <input
                  type="text"
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={formData.description ?? ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What this event is for"
                />
              </label>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                className="flex-1 px-3 py-2 rounded bg-purple-600 text-white hover:bg-purple-500"
                onClick={handleSave}
              >
                Save
              </button>
              <button
                className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                onClick={closeDialog}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EventRegistry;
