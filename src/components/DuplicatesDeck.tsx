import { useState } from 'react'
import type { Categories } from '../categories'
import { type Pair, pairKey, type StoreInfo } from '../duplicates'
import { money } from '../format'
import { dayLabel } from '../periods'
import { useDialog } from '../useDialog'
import { WebSearch } from './WebSearch'

interface Props {
  /** The pairs when the deck opened: it keeps them, so the count and Back stay put. */
  pairs: Pair[]
  categories: Categories
  onMerge: (storeKeys: string[], into: string) => void
  /** Marks a pair "not the same": it never comes back. */
  onDistinct: (pair: string) => void
  onClose: () => void
}

function StoreCard({ store, categories, kept }: { store: StoreInfo; categories: Categories; kept: boolean }) {
  const category = categories.byKey[store.category]
  return (
    <div className={`twin${kept ? ' is-kept' : ''}`}>
      <h3>
        {store.name} <WebSearch name={store.name} />
      </h3>
      <p className="muted">
        {store.payments === 1 ? '1 payment' : `${store.payments} payments`}
        {store.total > 0 && ` · ${money(store.total, store.currency)}`} · last on {dayLabel(store.lastDate, true)}
      </p>
      <p className="twin-category">
        {category?.icon} {category?.label}
      </p>
      <ul className="sorter-examples" aria-label={`What the bank says for ${store.name}`}>
        {store.examples.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </div>
  )
}

/** Pairs of stores that may be the same place, most payments first: merge them, or say they are not the same. */
export function DuplicatesDeck({ pairs, categories, onMerge, onDistinct, onClose }: Props) {
  const { ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog } = useDialog()
  const [position, setPosition] = useState(0)
  // Which of the two names to keep, by pair; the store with the most payments to start with.
  const [keep, setKeep] = useState<Record<string, 'first' | 'second'>>({})
  const [merged, setMerged] = useState(0)
  const pair = pairs[position]
  const key = pair ? pairKey(pair.first.key, pair.second.key) : ''
  const kept = pair ? (keep[key] ?? 'first') : 'first'

  function merge() {
    if (!pair) return
    const target = kept === 'first' ? pair.first : pair.second
    const source = kept === 'first' ? pair.second : pair.first
    onMerge([source.key], target.name)
    setMerged(merged + 1)
    setPosition(position + 1)
  }

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={onDialogKeyDown}
      className="dialog duplicates"
      aria-labelledby="duplicates-title"
      onClose={onClose}
    >
      <header className="dialog-head">
        <h2 id="duplicates-title">Possible duplicates</h2>
        <p className="hint">
          {pairs.length === 0
            ? 'No look-alike stores found.'
            : `Stores whose names share a word, most payments first. ${Math.min(position + 1, pairs.length)} of ${pairs.length}.`}
        </p>
        {pairs.length > 0 && (
          <div className="sorter-progress" aria-hidden="true">
            <span style={{ width: `${(Math.min(position, pairs.length) / pairs.length) * 100}%` }} />
          </div>
        )}
      </header>

      {pair ? (
        <div className="sorter-body">
          <p className="twin-shared">
            Both have <strong>{pair.shared.join(', ')}</strong>. Are they the same place?
          </p>
          <div className="twins">
            <StoreCard store={pair.first} categories={categories} kept={kept === 'first'} />
            <StoreCard store={pair.second} categories={categories} kept={kept === 'second'} />
          </div>
          <fieldset className="scopes">
            <legend className="hint">If they are, keep the name</legend>
            {(['first', 'second'] as const).map((side) => (
              <label key={side} className={`scope${kept === side ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="kept"
                  checked={kept === side}
                  onChange={() => setKeep({ ...keep, [key]: side })}
                />
                {pair[side].name}
              </label>
            ))}
          </fieldset>
        </div>
      ) : (
        pairs.length > 0 && (
          <div className="sorter-done">
            <p className="hero">🎉</p>
            <p>
              You went through all {pairs.length} pairs and merged {merged}.
            </p>
          </div>
        )
      )}

      <footer className="dialog-foot">
        {pair && (
          <>
            <button
              type="button"
              className="button is-quiet"
              disabled={position === 0}
              onClick={() => setPosition(position - 1)}
            >
              Back
            </button>
            <button type="button" className="button is-quiet" onClick={() => setPosition(position + 1)}>
              Later
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                onDistinct(key)
                setPosition(position + 1)
              }}
            >
              Not the same
            </button>
            <button type="button" className="button is-primary" onClick={merge}>
              Merge
            </button>
          </>
        )}
        {!pair && (
          <button type="button" className="button is-primary" onClick={closeDialog}>
            Close
          </button>
        )}
      </footer>
    </dialog>
  )
}
