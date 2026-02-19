import React from 'react'

type Props = {
  isOpen: boolean
  variableName: string
  references: string[]
  onClose: () => void
}

const VariableReferenceModal: React.FC<Props> = ({ isOpen, variableName, references, onClose }) => {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[520px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-2">Variable In Use</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          The variable <span className="font-semibold">{variableName}</span> is referenced by the
          following nodes. Remove those references before deleting it.
        </p>
        <div className="max-h-[240px] overflow-y-auto rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
            {references.map((ref) => (
              <li key={ref}>{ref}</li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default VariableReferenceModal
