import {type KeyboardEvent, useEffect, useRef, useState} from 'react';
import {type Categories, REASON} from '../categories';
import {money} from '../format';
import {dayLabel} from '../periods';
import {isUnsure, type Row} from '../rows';
import type {CategoryKey} from '../types';
import {useDialog} from '../useDialog';
import {BankBadge} from './BankBadge';

type Scope = 'store' | 'payment';

interface Props {
  /** The payments to go through, by id, as they were when the deck opened, biggest first. */
  ids: string[];
  /** The payments as they are now: one filed meanwhile with its whole store leaves the deck. */
  rows: Row[];
  categories: Categories;
  showBanks: boolean;
  onPick: (row: Row, category: CategoryKey, scope: Scope) => void;
  /** The same payments in the payment list instead. */
  onShowList: () => void;
  onClose: () => void;
}

/**
 * The payments to check, one at a time: what the bank says, the guess to keep, or another category for the whole
 * store or this payment only (a transfer to someone starts on this payment: each one can be for something else).
 * On a keyboard, 1 to 9 pick the first nine categories, Enter keeps, the arrows go back and on.
 */
export function CheckDeck({ids, rows, categories, showBanks, onPick, onShowList, onClose}: Props) {
  const {ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog} = useDialog();
  const [position, setPosition] = useState(0);
  // The category picked here for each payment: those stay in the deck (Back shows them), the others leave it once
  // they are not to check any more.
  const [filed, setFiled] = useState<Map<string, CategoryKey>>(new Map());
  const [scopes, setScopes] = useState<Record<string, Scope>>({});
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({top: 0});
  }, [position]);

  const byId = new Map(rows.map(row => [row.id, row]));
  const queue = ids
    .map(id => byId.get(id))
    .filter((row): row is Row => row !== undefined && (filed.has(row.id) || isUnsure(row)));
  const row = queue[position];
  const scope: Scope = row ? (scopes[row.id] ?? (row.basis === 'transfer' ? 'payment' : 'store')) : 'store';
  const guess = row ? categories.byKey[row.category] : undefined;
  const picked = row ? filed.get(row.id) : undefined;
  const next = () => setPosition(position + 1);

  function pick(category: CategoryKey) {
    if (!row) return;
    onPick(row, category, scope);
    setFiled(new Map(filed).set(row.id, category));
    next();
  }

  /** The keyboard shortcuts, unless a field has the focus. */
  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    onDialogKeyDown(event);
    const target = event.target as HTMLElement;
    if (!row || event.defaultPrevented || target.tagName === 'INPUT') return;
    const digit = Number(event.key);
    if (digit >= 1 && digit <= 9 && categories.alphabetical[digit - 1]) {
      event.preventDefault();
      pick(categories.alphabetical[digit - 1].key);
    } else if (event.key === 'Enter' && target.tagName !== 'BUTTON' && guess) {
      event.preventDefault();
      pick(picked ?? row.category);
    } else if (event.key === 'ArrowRight') next();
    else if (event.key === 'ArrowLeft' && position > 0) setPosition(position - 1);
  }

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={onKeyDown}
      className="dialog sorter check-deck"
      aria-labelledby="check-deck-title"
      onClose={onClose}
    >
      <header className="dialog-head">
        <h2 id="check-deck-title">Payments to check</h2>
        <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
          ✕
        </button>
        <p className="hint">
          {queue.length === 0
            ? 'Nothing left to check.'
            : `Their category is a guess with little to go on, biggest first. ${Math.min(position + 1, queue.length)} of ${queue.length}. `}
          <button type="button" className="link-button" onClick={onShowList}>
            See them in the list
          </button>
        </p>
        {queue.length > 0 && (
          <div className="sorter-progress" aria-hidden="true">
            <span style={{width: `${(Math.min(position, queue.length) / queue.length) * 100}%`}} />
          </div>
        )}
      </header>

      {row ? (
        <div className="sorter-body" ref={bodyRef}>
          <div className="sorter-store">
            <div className="sorter-name">
              <h3>
                {showBanks && <BankBadge bank={row.bank} />}
                {row.store}
              </h3>
            </div>
            <p className="muted">
              {dayLabel(row.date, true)} · {money(row.amount, row.currency, true)}
            </p>
            <ul className="sorter-examples" aria-label="What the bank says">
              <li>{row.description}</li>
            </ul>
            <div className="sheet-scope">
              <div className="scope-switch" role="group" aria-label="For">
                <button
                  type="button"
                  aria-pressed={scope === 'store'}
                  onClick={() => setScopes({...scopes, [row.id]: 'store'})}
                >
                  Whole store
                </button>
                <button
                  type="button"
                  aria-pressed={scope === 'payment'}
                  onClick={() => setScopes({...scopes, [row.id]: 'payment'})}
                >
                  This payment
                </button>
              </div>
              <p className="hint">
                {scope === 'store'
                  ? `Every payment at ${row.store}, past and future`
                  : `This payment only: the others at ${row.store} keep theirs`}
              </p>
            </div>
            {picked && categories.byKey[picked] ? (
              <p className="sorter-guess">
                Filed in {categories.byKey[picked].icon} {categories.byKey[picked].label}
              </p>
            ) : (
              guess && (
                <button type="button" className="button is-primary sorter-keep" onClick={() => pick(row.category)}>
                  Keep in {guess.icon} {guess.label}
                  <span className="sorter-reason"> ({REASON[row.basis] ?? 'a guess'})</span>
                </button>
              )
            )}
          </div>
          <div className="chip-grid" role="group" aria-label="Or another category">
            {categories.alphabetical.map((category, index) => {
              const current = (picked ?? row.category) === category.key;
              return (
                <button
                  key={category.key}
                  type="button"
                  className={`category-chip${current ? ' is-current' : ''}`}
                  aria-pressed={current}
                  aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
                  onClick={() => pick(category.key)}
                >
                  <span aria-hidden="true">{category.icon}</span>
                  {category.label}
                  {index < 9 && (
                    <kbd className="chip-key" aria-hidden="true">
                      {index + 1}
                    </kbd>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="sorter-done">
          <p className="hero">🎉</p>
          <p>
            {filed.size > 0
              ? `You went through them and filed ${filed.size}. The totals already use your choices.`
              : 'Nothing left to check here.'}
          </p>
        </div>
      )}

      {row && (
        <footer className="dialog-foot">
          <button
            type="button"
            className="button is-quiet"
            disabled={position === 0}
            onClick={() => setPosition(position - 1)}
          >
            Back
          </button>
          <button type="button" className="button" onClick={next}>
            Later
          </button>
        </footer>
      )}
    </dialog>
  );
}
