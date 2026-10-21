import {useEffect, useRef, useState} from 'react';
import type {Categories} from '../categories';
import {type Pair, pairKey, type StoreInfo} from '../duplicates';
import {money} from '../format';
import {dayLabel} from '../periods';
import {storeKey} from '../stores';
import type {CategoryKey} from '../types';
import {useDialog} from '../useDialog';
import {WebSearch} from './WebSearch';

interface Props {
  /** The pairs when the deck opened: it keeps them, so the count and Back stay put. */
  pairs: Pair[];
  categories: Categories;
  onMerge: (storeKeys: string[], into: string) => void;
  /** Marks a pair "not the same": it never comes back. */
  onDistinct: (pair: string) => void;
  /** The category of a store, picked by hand; null goes back to the guess. */
  onCategory: (storeKey: string, category: CategoryKey | null) => void;
  onRename: (storeKey: string, name: string, newName: string) => void;
  onClose: () => void;
}

function StoreCard({
  store,
  name,
  categories,
  kept,
  category,
  onCategory,
  onRename,
}: {
  store: StoreInfo;
  name: string;
  categories: Categories;
  kept: boolean;
  /** The category picked by hand, or null for the guess. */
  category: CategoryKey | null;
  onCategory: (category: CategoryKey | null) => void;
  onRename: (newName: string) => void;
}) {
  const guess = categories.byKey[store.category];
  // The name being typed, while renaming.
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <div className={`twin${kept ? ' is-kept' : ''}`}>
      {renaming !== null ? (
        <form
          className="sorter-rename"
          onSubmit={event => {
            event.preventDefault();
            const newName = renaming.trim();
            if (newName && newName !== name) onRename(newName);
            setRenaming(null);
          }}
        >
          <input
            className="text-input"
            aria-label={`New name for ${name}`}
            value={renaming}
            maxLength={80}
            autoFocus
            onFocus={event => event.target.select()}
            onChange={event => setRenaming(event.target.value)}
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
        <div className="twin-name">
          <h3>
            {name} <WebSearch name={name} />
          </h3>
          <button type="button" className="link-button" onClick={() => setRenaming(name)}>
            Rename
          </button>
        </div>
      )}
      <p className="muted">
        {store.payments === 1 ? '1 payment' : `${store.payments} payments`}
        {store.total > 0 && ` · ${money(store.total, store.currency)}`} · last on {dayLabel(store.lastDate, true)}
      </p>
      <select
        className="select twin-category"
        aria-label={`Category of ${name}`}
        value={category ?? ''}
        onChange={event => onCategory(event.target.value || null)}
      >
        {/* The guess, until a category is picked: picking the same one then saves it. */}
        {(category === null || !store.picked) && (
          <option value="">
            {guess?.icon} {guess?.label} (auto)
          </option>
        )}
        {categories.alphabetical.map(item => (
          <option key={item.key} value={item.key}>
            {item.icon} {item.label}
          </option>
        ))}
      </select>
      <ul className="sorter-examples" aria-label={`What the bank says for ${name}`}>
        {store.examples.map(text => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </div>
  );
}

/** Pairs of stores that may be the same place, most payments first: merge them, or say they are not the same. */
export function DuplicatesDeck({pairs, categories, onMerge, onDistinct, onCategory, onRename, onClose}: Props) {
  const {ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog} = useDialog();
  const [position, setPosition] = useState(0);
  // Each new pair starts at the top, both names in view.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({top: 0});
  }, [position]);
  // Categories picked and names given here, by store: the pairs keep the ones they opened with.
  const [picked, setPicked] = useState<Record<string, CategoryKey | null>>({});
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  const nameOf = (store: StoreInfo) => renamed[store.key] ?? store.name;
  // A store renamed here lives under its new name's key: its category and a merge go there.
  const keyOf = (store: StoreInfo) => (renamed[store.key] ? storeKey(renamed[store.key]) : store.key);
  // Which of the two names to keep, by pair; the store with the most payments to start with.
  const [keep, setKeep] = useState<Record<string, 'first' | 'second'>>({});
  const [merged, setMerged] = useState(0);
  const pair = pairs[position];
  const key = pair ? pairKey(pair.first.key, pair.second.key) : '';
  const kept = pair ? (keep[key] ?? 'first') : 'first';
  const card = (store: StoreInfo, side: 'first' | 'second') => (
    <StoreCard
      key={store.key}
      store={store}
      name={nameOf(store)}
      categories={categories}
      kept={kept === side}
      category={store.key in picked ? picked[store.key] : store.picked ? store.category : null}
      onCategory={category => {
        setPicked({...picked, [store.key]: category});
        onCategory(keyOf(store), category);
      }}
      onRename={newName => {
        onRename(keyOf(store), nameOf(store), newName);
        setRenamed({...renamed, [store.key]: newName});
      }}
    />
  );

  function merge() {
    if (!pair) return;
    const target = kept === 'first' ? pair.first : pair.second;
    const source = kept === 'first' ? pair.second : pair.first;
    onMerge([keyOf(source)], nameOf(target));
    setMerged(merged + 1);
    setPosition(position + 1);
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
        <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
          ✕
        </button>
        <p className="hint">
          {pairs.length === 0
            ? 'No look-alike stores found.'
            : `Stores whose names share a word, most payments first. ${Math.min(position + 1, pairs.length)} of ${pairs.length}.`}
        </p>
        {pairs.length > 0 && (
          <div className="sorter-progress" aria-hidden="true">
            <span style={{width: `${(Math.min(position, pairs.length) / pairs.length) * 100}%`}} />
          </div>
        )}
      </header>

      {pair ? (
        <div className="sorter-body" ref={bodyRef}>
          <p className="twin-shared">
            Both have <strong>{pair.shared.join(', ')}</strong>. Are they the same place?
          </p>
          <div className="twins">
            {card(pair.first, 'first')}
            {card(pair.second, 'second')}
          </div>
          <fieldset className="scopes">
            <legend className="hint">If they are, keep the name</legend>
            {(['first', 'second'] as const).map(side => (
              <label key={side} className={`scope${kept === side ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="kept"
                  checked={kept === side}
                  onChange={() => setKeep({...keep, [key]: side})}
                />
                {nameOf(pair[side])}
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
                onDistinct(key);
                setPosition(position + 1);
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
  );
}
