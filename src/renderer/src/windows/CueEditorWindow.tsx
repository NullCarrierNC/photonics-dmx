import * as React from 'react';
import CueEditor from '../pages/CueEditor';

const CueEditorWindow: React.FC = () => {
  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-200">
      <CueEditor />
    </div>
  );
};

export default CueEditorWindow;
