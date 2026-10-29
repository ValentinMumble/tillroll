import {useMemo, useState} from 'react';
import {type Categories, colourStyle} from '../categories';
import {money} from '../format';
import {withLabel} from '../labels';
import {dayLabel} from '../periods';
import type {Row} from '../rows';
import {paymentCount} from '../text';
import {dayCount, tripCandidates, tripDays} from '../trips';
import type {Labels, Trip} from '../types';
import {useDialog} from '../useDialog';

interface Props {
  label: string;
  trip: Trip;
  /** The payments of one currency, all time. */
  rows: Row[];
  currency: string;
  categories: Categories;
  /** The trip's days as set here (none set: the days of its payments); null makes the label a plain one again. */
  onSave: (trip: Trip | null) => void;
  onLabels: (changes: Labels) => void;
  onClose: () => void;
}

/**
 * A trip, opened from its label: its first and last days (its payments' own unless set here) and the payments on
 * those days that do not have its label yet, by day, to tick and label in one go. Nothing is ticked by itself: the
 * unlikely ones (a place also paid in the two months around the trip) are dimmed, and one link ticks the likely ones.
 * "Not a trip" makes it a plain label again.
 */
export function TripDialog({label, trip, rows, currency, categories, onSave, onLabels, onClose}: Props) {
  const {ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog} = useDialog();
  const auto = useMemo(() => tripDays(rows, label), [rows, label]);
  const [from, setFrom] = useState(trip.from ?? auto.from);
  const [to, setTo] = useState(trip.to ?? auto.to);
  const valid = Boolean(from && to && from <= to);
  const candidates = useMemo(
    () => (valid ? tripCandidates(rows, label, from, to) : []),
    [rows, label, from, to, valid],
  );
  // The payments ticked, by id: none at first, whatever the days.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const chosen = candidates.filter(item => ticked.has(item.row.id));
  const likely = candidates.filter(item => item.likely);
  const labelled = rows.filter(row => row.labels.some(item => item.toLowerCase() === label.toLowerCase()));
  const total = labelled.reduce((sum, row) => sum + row.spend, 0);

  function toggle(id: string) {
    const set = new Set(ticked);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setTicked(set);
  }

  function save() {
    if (!valid) return;
    // Days that are the payments' own are not kept: they follow the payments.
    onSave({...(from !== auto.from ? {from} : {}), ...(to !== auto.to ? {to} : {})});
    if (chosen.length) onLabels(Object.fromEntries(chosen.map(({row}) => [row.id, withLabel(row.labels, label)])));
    closeDialog();
  }

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={onDialogKeyDown}
      className="dialog trip-dialog"
      aria-labelledby="trip-dialog-title"
      onClose={onClose}
    >
      <form
        className="trip-dialog-form"
        onSubmit={event => {
          event.preventDefault();
          save();
        }}
      >
        <header className="dialog-head">
          <h2 id="trip-dialog-title">{label}</h2>
          <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
            ✕
          </button>
          <p className="hint">
            A trip · {paymentCount(labelled.length)} · {money(total, currency)}
            {valid && ` · ${dayCount(from, to)} days`}
          </p>
        </header>
        <div className="trip-days">
          <label className="field">
            First day
            <input
              className="text-input"
              type="date"
              value={from}
              max={to || undefined}
              onChange={event => setFrom(event.target.value)}
            />
          </label>
          <label className="field">
            Last day
            <input
              className="text-input"
              type="date"
              value={to}
              min={from || undefined}
              onChange={event => setTo(event.target.value)}
            />
          </label>
          {(from !== auto.from || to !== auto.to) && auto.from && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setFrom(auto.from);
                setTo(auto.to);
              }}
            >
              Back to its payments' days
            </button>
          )}
        </div>
        <section className="trip-candidates" aria-labelledby="trip-candidates-title">
          <h3 id="trip-candidates-title">On those days, without the label</h3>
          {candidates.length === 0 ? (
            <p className="empty">{valid ? 'Every payment of those days has it.' : 'Pick the first and last days.'}</p>
          ) : (
            <>
              <p className="hint trip-candidates-hint">
                Dimmed: places you also paid in the two months around the trip, likely not the trip's.{' '}
                {chosen.length > 0 ? (
                  <button type="button" className="link-button" onClick={() => setTicked(new Set())}>
                    Untick all
                  </button>
                ) : (
                  likely.length > 0 && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setTicked(new Set(likely.map(item => item.row.id)))}
                    >
                      Tick the {likely.length} likely ones
                    </button>
                  )
                )}
              </p>
              <ul className="trip-candidate-list">
                {candidates.map(item => {
                  const category = categories.byKey[item.row.category];
                  return (
                    <li key={item.row.id} className={item.likely ? undefined : 'is-regular'}>
                      <label>
                        <input type="checkbox" checked={ticked.has(item.row.id)} onChange={() => toggle(item.row.id)} />
                        <span className="muted">{dayLabel(item.row.date)}</span>
                        <span className="trip-candidate-store">{item.row.store}</span>
                        <span
                          className="cat-dot"
                          style={colourStyle(categories.colours[item.row.category])}
                          role="img"
                          aria-label={category?.label}
                          title={category?.label}
                        />
                        <span className="payment-amount">{money(item.row.amount, item.row.currency, true)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
        <footer className="dialog-foot">
          <button
            type="button"
            className="link-button trip-unmark"
            onClick={() => {
              onSave(null);
              closeDialog();
            }}
          >
            Not a trip
          </button>
          <button type="submit" className="button is-primary" disabled={!valid}>
            {chosen.length ? `Save and label ${paymentCount(chosen.length)}` : 'Save'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
