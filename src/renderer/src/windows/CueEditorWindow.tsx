import * as React from 'react';
import { useEffect } from 'react';
import CueEditor from '../pages/CueEditor';
import { ErrorBoundary } from '../components/ErrorBoundary';

const CueEditorWindow: React.FC = () => {
  useEffect(() => {
    document.title = 'Cue Editor - Photonics';
  }, []);

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-200">
      <ErrorBoundary name="CueEditor">
        <CueEditor />
      </ErrorBoundary>
    </div>
  );
};

export default CueEditorWindow;
