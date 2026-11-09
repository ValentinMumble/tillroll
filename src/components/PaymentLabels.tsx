import {useContext, useState} from 'react';
import {tidyLabel, withLabel, withoutLabel} from '../labels';
import type {Row} from '../rows';
import {plain} from '../text';
import {TripLabels} from '../tripLabels';
import type {Labels} from '../types';

/** How many labels in use the field offers at once. */
const SUGGESTIONS = 6;

interface Props {
  row: Row;
  /** Every label in use, most used first: the field offers them. */
  names: string[];
  onLabels: (changes: Labels) => void;
  onFocusLabel: (label: string) => void;
}

/**
 * A payment's labels: a chip each (a click shows every payment with it, × takes it off), then a # that opens a
 * field to add one. Under the field, the labels in use that match what is typed (the most used ones while it is
 * empty) wait to be tapped.
 */
export function PaymentLabels({row, names, onLabels, onFocusLabel}: Props) {
  // The label being typed, while the field is open.
  const [text, setText] = useState<string | null>(null);
  const trips = useContext(TripLabels);

  function add(typed = text ?? '') {
    const label = tidyLabel(typed);
    if (label) onLabels({[row.id]: withLabel(row.labels, label)});
    setText(null);
  }

  // The labels in use this payment has not got, matching what is typed: the ones starting with it first.
  const typed = plain(tidyLabel(text ?? ''));
  const suggestions =
    text === null
      ? []
      : names
          .filter(label => !row.labels.some(item => item.toLowerCase() === label.toLowerCase()))
          .filter(label => plain(label).includes(typed) && plain(label) !== typed)
          .sort((first, second) => Number(!plain(first).startsWith(typed)) - Number(!plain(second).startsWith(typed)))
          .slice(0, SUGGESTIONS);

  return (
    <>
      {row.labels.map(label => (
        <span key={label} className={`label-chip${trips.has(label.toLowerCase()) ? ' is-trip' : ''}`}>
          <button
            type="button"
            title={trips.has(label.toLowerCase()) ? 'A trip: show its payments' : 'Show every payment with this label'}
            onClick={() => onFocusLabel(label)}
          >
            {/* A trip is told by its colour: no #. */}
            {trips.has(label.toLowerCase()) ? label : `# ${label}`}
          </button>
          <button
            type="button"
            aria-label={`Take the label ${label} off`}
            onClick={() => onLabels({[row.id]: withoutLabel(row.labels, label)})}
          >
            ×
          </button>
        </span>
      ))}
      {text !== null ? (
        <form
          className="label-form"
          onSubmit={event => {
            event.preventDefault();
            add();
          }}
        >
          <input
            className="text-input"
            aria-label={`Label for this payment at ${row.store}`}
            placeholder="Label"
            value={text}
            maxLength={40}
            autoFocus
            onChange={event => setText(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setText(null);
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
        // A pending payment's label moves to the booked payment at the next sync (see api/_lib/sync.ts).
        <button
          type="button"
          className="label-add"
          aria-label={`Add a label to this payment at ${row.store}`}
          title="Add a label"
          onClick={() => setText('')}
        >
          #
        </button>
      )}
      {suggestions.length > 0 && (
        <span className="label-suggestions" role="group" aria-label="Labels in use">
          {suggestions.map(label => (
            <button key={label} type="button" className="label-suggestion" onClick={() => add(label)}>
              {trips.has(label.toLowerCase()) ? label : `# ${label}`}
            </button>
          ))}
        </span>
      )}
    </>
  );
}
