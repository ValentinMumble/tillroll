import { useState } from 'react'
import { tidyLabel, withLabel, withoutLabel } from '../labels'
import type { Row } from '../report'
import type { Labels } from '../types'

/** The list of labels in use that a label field offers while typing. */
const LABEL_OPTIONS = 'tillroll-labels'

/** The labels in use, offered by every label field of the view. Render it once per view. */
export function LabelOptions({ names }: { names: string[] }) {
  return (
    <datalist id={LABEL_OPTIONS}>
      {names.map((label) => (
        <option key={label} value={label} />
      ))}
    </datalist>
  )
}

interface Props {
  row: Row
  onLabels: (changes: Labels) => void
  onFocusLabel: (label: string) => void
}

/**
 * A payment's labels: a chip each (a click shows every payment with it, × takes it off), then a # that opens a
 * field to add one, offering the labels in use.
 */
export function PaymentLabels({ row, onLabels, onFocusLabel }: Props) {
  // The label being typed, while the field is open.
  const [text, setText] = useState<string | null>(null)

  function add() {
    const label = tidyLabel(text ?? '')
    if (label) onLabels({ [row.id]: withLabel(row.labels, label) })
    setText(null)
  }

  return (
    <>
      {row.labels.map((label) => (
        <span key={label} className="label-chip">
          <button type="button" title="Show every payment with this label" onClick={() => onFocusLabel(label)}>
            # {label}
          </button>
          <button
            type="button"
            aria-label={`Take the label ${label} off`}
            onClick={() => onLabels({ [row.id]: withoutLabel(row.labels, label) })}
          >
            ×
          </button>
        </span>
      ))}
      {text !== null ? (
        <form
          className="label-form"
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}
        >
          <input
            className="text-input"
            list={LABEL_OPTIONS}
            aria-label={`Label for this payment at ${row.store}`}
            placeholder="Label"
            value={text}
            maxLength={40}
            autoFocus
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setText(null)
              }
            }}
          />
          <button type="submit" className="label-ok" aria-label="Add the label" disabled={!tidyLabel(text)}>
            ✓
          </button>
          <button type="button" className="label-ok" aria-label="Cancel" onClick={() => setText(null)}>
            ✕
          </button>
        </form>
      ) : (
        // A pending payment gets a new id once the bank books it: its label would be lost.
        !row.pending && (
          <button
            type="button"
            className="label-add"
            aria-label={`Add a label to this payment at ${row.store}`}
            title="Add a label"
            onClick={() => setText('')}
          >
            #
          </button>
        )
      )}
    </>
  )
}
