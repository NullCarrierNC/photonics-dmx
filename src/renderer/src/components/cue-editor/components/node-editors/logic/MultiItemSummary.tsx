import React from 'react'

export interface MultiItemSummaryProps {
  /** Bold heading, e.g. "Multi-roll: 3 rolls". */
  header: string
  /** One monospace line per item. */
  rows: string[]
  /** Name of the single-item fields this batch overrides, e.g. "single-roll". */
  ignoredFieldsLabel: string
}

/** Read-only amber summary shown when a variable/random node carries a multi-set / multi-roll array. The
 *  array drives the node and the single-item fields above are inert, so this makes the active batch visible
 *  without pretending the single fields still apply. */
const MultiItemSummary: React.FC<MultiItemSummaryProps> = ({
  header,
  rows,
  ignoredFieldsLabel,
}) => (
  <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[10px] dark:border-amber-700 dark:bg-amber-900/20">
    <div className="font-semibold">{header}</div>
    {rows.map((row, i) => (
      <div key={i} className="font-mono">
        {row}
      </div>
    ))}
    <div className="mt-1 opacity-80">
      While these are set they drive this node and the {ignoredFieldsLabel} fields above are
      ignored. Edit the list via the cue generator.
    </div>
  </div>
)

export default MultiItemSummary
