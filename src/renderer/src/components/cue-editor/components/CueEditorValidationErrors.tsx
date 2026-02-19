import React from 'react';

type CueEditorValidationErrorsProps = {
  errors: string[];
};

const CueEditorValidationErrors: React.FC<CueEditorValidationErrorsProps> = ({ errors }) => {
  if (errors.length === 0) return null;
  return (
    <div className="p-3 text-xs text-red-600 dark:text-red-300 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40">
      <p className="font-semibold mb-1">Validation errors</p>
      <ul className="list-disc list-inside space-y-1">
        {errors.map(error => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
};

export default CueEditorValidationErrors;
