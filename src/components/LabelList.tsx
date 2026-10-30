import {useState} from 'react';
import type {Categories} from '../categories';
import {money} from '../format';
import {tidyLabel} from '../labels';
import type {Row} from '../rows';
import {type LabelSort, loadLabelSort, saveLabelSort} from '../storage';
import {paymentCount, plain} from '../text';
import {dayCount, daysLabel, tripDays, tripKeyOf} from '../trips';
import type {Labels, Trip, Trips} from '../types';
import {TripDialog} from './TripDialog';

interface Props {
  /** The payments of one currency, all time. */
  rows: Row[];
  currency: string;
  onOpen: (label: string) => void;
  onRename: (label: string, newLabel: string) => void;
  onDelete: (label: string) => void;
  categories: Categories;
  /** The labels marked as trips. */
  trips: Trips;
  /** Marks a label as a trip, with its days when set by hand; null makes it a plain label again. */
  onTrip: (label: string, trip: Trip | null) => void;
  onLabels: (changes: Labels) => void;
}

/** The sort buttons, and how each one orders the labels. */
const SORTS: {key: LabelSort; label: string; hint: string}[] = [
  {key: 'latest', label: 'Latest', hint: 'the latest used first'},
  {key: 'biggest', label: 'Biggest', hint: 'the biggest first'},
  {key: 'used', label: 'Most used', hint: 'the most used first'},
  {key: 'name', label: 'A to Z', hint: 'A to Z'},
];

interface LabelLine {
  name: string;
  total: number;
  payments: number;
  from: string;
  to: string;
}

/**
 * Every label with what it adds up to (all time): open its payments, rename it or take it off everywhere. A label can
 * be made a trip: it then shows its days and opens the trip's dialog (its days, place, the payments of those days to
 * label). The trips themselves are in their own view (see TripsView).
 */
export function LabelList({rows, currency, onOpen, onRename, onDelete, categories, trips, onTrip, onLabels}: Props) {
  const [renaming, setRenaming] = useState<{label: string; text: string} | null>(null);
  // The trip whose dialog is open, by its label.
  const [openTrip, setOpenTrip] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LabelSort>(loadLabelSort);
  const lines = new Map<string, LabelLine>();
  for (const row of rows) {
    for (const label of row.labels) {
      const key = label.toLowerCase();
      const line = lines.get(key) ?? {name: label, total: 0, payments: 0, from: row.date, to: row.date};
      line.total += row.spend;
      line.payments += 1;
      if (row.date < line.from) line.from = row.date;
      if (row.date > line.to) line.to = row.date;
      lines.set(key, line);
    }
  }
  const labels = [...lines.values()].sort((first, second) =>
    sort === 'biggest'
      ? second.total - first.total
      : sort === 'used'
        ? second.payments - first.payments
        : sort === 'name'
          ? first.name.localeCompare(second.name, 'en', {sensitivity: 'base'})
          : first.to < second.to
            ? 1
            : -1,
  );
  const words = plain(query).split(/\s+/).filter(Boolean);
  const shown = labels.filter(line => words.every(word => plain(line.name).includes(word)));

  function finishRename() {
    if (!renaming) return;
    const text = tidyLabel(renaming.text);
    if (text && text !== renaming.label) onRename(renaming.label, text);
    setRenaming(null);
  }

  return (
    <section className="card labels">
      <header className="card-head">
        <h2>Labels</h2>
        <span className="hint">all time, {SORTS.find(item => item.key === sort)?.hint}</span>
        {labels.length > 1 && (
          <div className="segmented is-small" role="group" aria-label="Sort labels by">
            {SORTS.map(item => (
              <button
                key={item.key}
                type="button"
                aria-pressed={sort === item.key}
                onClick={() => {
                  setSort(item.key);
                  saveLabelSort(item.key);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </header>
      {labels.length > 8 && (
        <div className="label-filters">
          <input
            className="text-input"
            type="search"
            aria-label="Find a label"
            placeholder="Find a label"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
      )}
      {labels.length === 0 ? (
        <p className="empty">
          No labels yet. Add one with the # beside a payment, tick payments to label them together, or pick a run of
          days in the calendar for a trip.
        </p>
      ) : shown.length === 0 ? (
        <p className="empty">No label matches.</p>
      ) : (
        <ul className="label-lines">
          {shown.map(line => {
            const tripKey = tripKeyOf(trips, line.name);
            const days = tripKey === undefined ? null : tripDays(rows, line.name, trips[tripKey]);
            return (
              <li key={line.name}>
                {renaming?.label === line.name ? (
                  <form
                    className="label-rename"
                    onSubmit={event => {
                      event.preventDefault();
                      finishRename();
                    }}
                  >
                    <input
                      className="text-input"
                      aria-label={`New name for the label ${line.name}`}
                      value={renaming.text}
                      maxLength={40}
                      autoFocus
                      onFocus={event => event.target.select()}
                      onChange={event => setRenaming({label: line.name, text: event.target.value})}
                      onKeyDown={event => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setRenaming(null);
                        }
                      }}
                    />
                    <button type="submit" className="button">
                      Rename
                    </button>
                  </form>
                ) : (
                  <button type="button" className="label-open" onClick={() => onOpen(line.name)}>
                    <span className={`label-name${days ? ' is-trip' : ''}`}>{days ? line.name : `# ${line.name}`}</span>
                    <span className="muted">
                      {paymentCount(line.payments)} ·{' '}
                      {days?.from
                        ? `${daysLabel(days.from, days.to)}, ${dayCount(days.from, days.to)} days`
                        : daysLabel(line.from, line.to)}
                    </span>
                    <strong className="label-total">{money(line.total, currency)}</strong>
                  </button>
                )}
                {renaming?.label !== line.name && (
                  <span className="label-actions">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        if (!days) onTrip(line.name, {});
                        setOpenTrip(line.name);
                      }}
                    >
                      {days ? 'Trip days' : 'Make it a trip'}
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setRenaming({label: line.name, text: line.name})}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        const count = line.payments === 1 ? 'its payment' : `its ${line.payments} payments`;
                        if (window.confirm(`Take the label "${line.name}" off ${count}?`)) onDelete(line.name);
                      }}
                    >
                      Delete
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {openTrip && (
        <TripDialog
          label={openTrip}
          trip={trips[tripKeyOf(trips, openTrip) ?? openTrip] ?? {}}
          rows={rows}
          currency={currency}
          categories={categories}
          onSave={trip => onTrip(openTrip, trip)}
          onLabels={onLabels}
          onClose={() => setOpenTrip(null)}
        />
      )}
    </section>
  );
}
