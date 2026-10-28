import {useEffect, useRef} from 'react';
import type {Categories} from '../categories';
import type {CategoryKey} from '../types';

interface Props {
  categories: Categories;
  /** Each category's payments: the ones with none are left out, unless picked. */
  counts: Map<CategoryKey, number>;
  /** The categories shown; none shows every one. */
  picked: CategoryKey[];
  onChange: (keys: CategoryKey[]) => void;
}

/**
 * The payment list's category filter, several at once: a button like a select ("All categories", "↔️ Transfers",
 * "↔️ Transfers + 2") that opens the categories with a tick each and their payments. A click outside or Escape
 * closes it.
 */
export function CategoryFilter({categories, counts, picked, onChange}: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const first = categories.byKey[picked[0]];
  const label =
    picked.length === 0 || !first
      ? 'All categories'
      : `${first.icon} ${first.label}${picked.length > 1 ? ` + ${picked.length - 1}` : ''}`;
  const shown = categories.alphabetical.filter(category => counts.has(category.key) || picked.includes(category.key));
  return (
    <details
      ref={ref}
      className="category-filter"
      onKeyDown={event => {
        if (event.key === 'Escape' && ref.current?.open) {
          ref.current.open = false;
          ref.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary className="select" aria-label={`Categories: ${label}`}>
        <span className="category-filter-label">{label}</span>
      </summary>
      <div className="category-filter-menu">
        <button type="button" className="link-button" disabled={picked.length === 0} onClick={() => onChange([])}>
          All categories
        </button>
        {shown.map(category => (
          <label key={category.key} className="category-filter-option">
            <input
              type="checkbox"
              checked={picked.includes(category.key)}
              onChange={event =>
                onChange(event.target.checked ? [...picked, category.key] : picked.filter(key => key !== category.key))
              }
            />
            <span aria-hidden="true">{category.icon}</span>
            <span className="category-filter-name">{category.label}</span>
            <span className="muted">{counts.get(category.key) ?? 0}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
