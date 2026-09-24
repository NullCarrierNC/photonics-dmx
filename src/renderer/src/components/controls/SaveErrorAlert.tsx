import React from 'react'

/** The line a settings panel shows under its controls when a save did not land. */
export const SaveErrorAlert: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
      {message}
    </p>
  ) : null
