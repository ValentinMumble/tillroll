import {useMemo, useState} from 'react';
import {money} from '../format';
import type {Row} from '../rows';
import type {Merges} from '../types';
import {useDialog} from '../useDialog';
import {paymentCount, plain} from '../text';

interface Props {
  rows: Row[];
  merges: Merges;
  onSeparate: (storeKey: string) => void;
  /** The store's own dialog takes this one's place. */
  onOpenStore: (store: {key: string; name: string}) => void;
  onClose: () => void;
}

/** A store as the bank names it, before any merge. */
interface Part {
  key: string;
  name: string;
  currency: string;
  payments: number;
  spent: number;
  /** The store it ends in, after every merge. */
  groupKey: string;
  groupName: string;
}

interface Group {
  key: string;
  name: string;
  currency: string;
  payments: number;
  spent: number;
  parts: Part[];
}

/**
 * Every merge in one place: each store with the stores merged into it, and the stores only renamed. A store merged in
 * can be separated again, which gives it back its own name and payments.
 */
export function MergesDialog({rows, merges, onSeparate, onOpenStore, onClose}: Props) {
  const {ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog} = useDialog();
  const [query, setQuery] = useState('');

  const {groups, renames} = useMemo(() => {
    const parts = new Map<string, Part>();
    for (const row of rows) {
      const part = parts.get(row.ownStoreKey) ?? {
        key: row.ownStoreKey,
        name: row.ownStore,
        currency: row.currency,
        payments: 0,
        spent: 0,
        groupKey: row.storeKey,
        groupName: row.store,
      };
      part.payments += 1;
      if (row.amount < 0) part.spent -= row.amount;
      parts.set(row.ownStoreKey, part);
    }
    const byKey = new Map<string, Group>();
    const renamed: {part: Part; into: string}[] = [];
    for (const key of Object.keys(merges)) {
      // A store with no payments left (its bank text now reads as another store) has nothing to show.
      const part = parts.get(key);
      if (!part) continue;
      // Only the capitals changed ("Edf" to "EDF"): a rename, the store keeps its key.
      if (part.groupKey === key) {
        renamed.push({part, into: part.groupName});
        continue;
      }
      const own = parts.get(part.groupKey);
      const group = byKey.get(part.groupKey) ?? {
        key: part.groupKey,
        name: part.groupName,
        currency: own?.currency ?? part.currency,
        payments: own?.payments ?? 0,
        spent: own?.spent ?? 0,
        parts: [],
      };
      group.parts.push(part);
      group.payments += part.payments;
      group.spent += part.spent;
      byKey.set(part.groupKey, group);
    }
    // One store under a new name that no other store had: renamed, not merged.
    const merged: Group[] = [];
    for (const group of byKey.values()) {
      if (group.parts.length === 1 && !parts.has(group.key)) renamed.push({part: group.parts[0], into: group.name});
      else merged.push({...group, parts: group.parts.sort((first, second) => second.payments - first.payments)});
    }
    return {
      groups: merged.sort(
        (first, second) => second.parts.length - first.parts.length || second.payments - first.payments,
      ),
      renames: renamed.sort((first, second) => first.into.localeCompare(second.into)),
    };
  }, [rows, merges]);

  const words = plain(query).split(/\s+/).filter(Boolean);
  const matches = (...names: string[]) => words.every(word => names.some(name => plain(name).includes(word)));
  const shownGroups = groups.filter(group => matches(group.name, ...group.parts.map(part => part.name)));
  const shownRenames = renames.filter(item => matches(item.into, item.part.name));
  const partCount = groups.reduce((sum, group) => sum + group.parts.length, 0);
  // "12 stores merged into 5, 3 renamed."
  const summary = [
    groups.length > 0 && `${partCount} ${partCount === 1 ? 'store' : 'stores'} merged into ${groups.length}`,
    renames.length > 0 && `${renames.length} renamed`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={onDialogKeyDown}
      className="dialog merges-dialog"
      aria-labelledby="merges-dialog-title"
      onClose={onClose}
    >
      <header className="dialog-head">
        <h2 id="merges-dialog-title">Merged stores</h2>
        <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
          ✕
        </button>
        <p className="hint">{summary && `${summary}. `}Separate a store to give it back its own name and payments.</p>
      </header>
      {groups.length + renames.length > 8 && (
        <input
          className="text-input"
          type="search"
          aria-label="Find a store"
          placeholder="Find a store"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      )}
      <div className="merges-body">
        {shownGroups.length > 0 && (
          <ul className="merge-groups">
            {shownGroups.map(group => (
              <li key={group.key}>
                <div className="merge-group-head">
                  <button
                    type="button"
                    className="store-line-rename"
                    aria-label={`Open ${group.name}`}
                    onClick={() => onOpenStore({key: group.key, name: group.name})}
                  >
                    {group.name}
                  </button>
                  <span className="muted">
                    {paymentCount(group.payments)}
                    {group.spent > 0 && ` · ${money(group.spent, group.currency)}`}
                  </span>
                </div>
                <ul className="merge-parts">
                  {group.parts.map(part => (
                    <li key={part.key}>
                      <span>
                        {part.name} <span className="muted">{paymentCount(part.payments)}</span>
                      </span>
                      <button type="button" className="link-button" onClick={() => onSeparate(part.key)}>
                        Separate
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {shownRenames.length > 0 && (
          <section className="store-parts">
            <h3>Renamed</h3>
            <ul>
              {shownRenames.map(({part, into}) => (
                <li key={part.key}>
                  <span>
                    {part.name} <span className="muted">→ {into}</span>
                  </span>
                  <button type="button" className="link-button" onClick={() => onSeparate(part.key)}>
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {groups.length + renames.length === 0 && <p className="empty">No store is merged or renamed yet.</p>}
        {groups.length + renames.length > 0 && shownGroups.length + shownRenames.length === 0 && (
          <p className="empty">No store matches.</p>
        )}
      </div>
    </dialog>
  );
}
