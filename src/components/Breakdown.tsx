import {useState} from 'react';
import {type Categories, colourStyle} from '../categories';
import {money} from '../format';
import type {Report} from '../report';
import {type CategoryView, loadCategoryView, saveCategoryView} from '../storage';
import type {CategoryKey} from '../types';
import {CategoryTrends} from './CategoryTrends';
import {Delta} from './Delta';

/** What the payment list is narrowed to: a category, a store, a label (over all time), or the payments to check. */
export type Focus =
  | {type: 'category'; key: CategoryKey}
  | {type: 'store'; key: string; name: string}
  | {type: 'label'; key: string}
  | {type: 'check'};

interface Props {
  report: Report;
  categories: Categories;
  currency: string;
  focus: Focus | null;
  onFocus: (focus: Focus | null) => void;
  /** The overview shows the top few only, with a link to the full view. */
  preview?: {limit: number; onSeeAll: () => void};
}

const plain = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function share(part: number, whole: number) {
  if (whole <= 0) return '';
  const percent = (part / whole) * 100;
  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`;
}

/** A category's spending over the chart's periods, the chosen one marked. */
function Trend({values, marked}: {values: number[]; marked: number}) {
  const width = 72;
  const height = 22;
  const top = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((value, index) => [index * step, height - 3 - (Math.max(0, value) / top) * (height - 6)]);
  return (
    <svg className="trend" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
      {points[marked] && <circle cx={points[marked][0]} cy={points[marked][1]} r="2.5" />}
    </svg>
  );
}

function SeeAll({count, noun, onClick}: {count: number; noun: string; onClick: () => void}) {
  return (
    <button type="button" className="link-button" onClick={onClick}>
      All {count} {noun} →
    </button>
  );
}

/** Spending by category, with the change against the baseline. One color for every bar: the length is the value. */
export function CategoryBreakdown({
  report,
  categories,
  currency,
  focus,
  onFocus,
  preview,
  onEdit,
  onOpenCategory,
}: Props & {onEdit: () => void; onOpenCategory?: (category: CategoryKey) => void}) {
  const {current, baseline, series} = report;
  // The categories that are not spending (transfers, money in, left out), shown on request.
  const [everyCategory, setEveryCategory] = useState(false);
  // A list, or a small chart per category (the full view only).
  const [view, setView] = useState<CategoryView>(loadCategoryView);
  const trends = !preview && onOpenCategory && view === 'trends';
  const items = [...current.categories]
    .filter(([, value]) => value >= 0.5)
    .sort((first, second) => second[1] - first[1]);
  const others = [...current.others]
    .filter(([, value]) => value.out + value.in >= 0.5)
    .sort((first, second) => second[1].out + second[1].in - (first[1].out + first[1].in));
  const shown = preview ? items.slice(0, preview.limit) : items;
  const max = Math.max(1, ...items.map(([, value]) => value));
  // The chosen period's place in the chart's series (all time marks nothing).
  const marked = series.findIndex(item => item.period === report.period);
  return (
    <section className={`card${preview ? ' is-preview' : ''}`}>
      <header className="card-head">
        <h2>{preview ? 'Top categories' : 'Categories'}</h2>
        {!preview && <span className="view-total">{money(current.total, currency)}</span>}
        {baseline && !preview && <span className="hint">change vs {baseline.label}</span>}
        {preview ? (
          items.length > preview.limit && <SeeAll count={items.length} noun="categories" onClick={preview.onSeeAll} />
        ) : (
          <>
            {onOpenCategory && (
              <div className="segmented is-small" role="group" aria-label="Show the categories as">
                {(['list', 'trends'] as const).map(item => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={view === item}
                    onClick={() => {
                      setView(item);
                      saveCategoryView(item);
                    }}
                  >
                    {item === 'list' ? 'List' : 'Trends'}
                  </button>
                ))}
              </div>
            )}
            {!trends && (
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={everyCategory}
                  onChange={event => setEveryCategory(event.target.checked)}
                />
                Show every category
              </label>
            )}
            <button type="button" className="link-button" onClick={onEdit}>
              Edit categories
            </button>
          </>
        )}
      </header>
      {trends ? (
        <CategoryTrends report={report} categories={categories} currency={currency} onOpen={onOpenCategory} />
      ) : items.length === 0 ? (
        <p className="empty">No spending in this period.</p>
      ) : (
        <ul className="bars">
          {shown.map(([key, value]) => {
            const category = categories.byKey[key];
            const active = focus?.type === 'category' && focus.key === key;
            return (
              <li key={key} style={colourStyle(categories.colours[key])}>
                <button
                  type="button"
                  className={`bar-row${active ? ' is-active' : ''}${preview ? '' : ' has-trend'}`}
                  aria-pressed={active}
                  onClick={() => onFocus(active ? null : {type: 'category', key})}
                >
                  <span className="bar-label">
                    <span className="bar-icon" aria-hidden="true">
                      {category.icon}
                    </span>
                    {category.label}
                  </span>
                  {!preview && <Trend values={series.map(item => item.categories.get(key) ?? 0)} marked={marked} />}
                  <span className="bar-value">
                    {money(value, currency)} <small>{share(value, current.total)}</small>
                  </span>
                  <span className="bar-change">
                    {baseline && (
                      <Delta value={value - (baseline.categories.get(key) ?? 0)} currency={currency} compact />
                    )}
                  </span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{width: `${(value / max) * 100}%`}} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!preview && !trends && everyCategory && others.length > 0 && (
        <>
          <h3 className="bars-heading">Not counted as spending</h3>
          <ul className="bars">
            {others.map(([key, value]) => {
              const category = categories.byKey[key];
              const active = focus?.type === 'category' && focus.key === key;
              return (
                <li key={key} style={colourStyle(categories.colours[key])}>
                  <button
                    type="button"
                    className={`bar-row is-other${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => onFocus(active ? null : {type: 'category', key})}
                  >
                    <span className="bar-label">
                      <span className="bar-icon" aria-hidden="true">
                        {category?.icon}
                      </span>
                      {category?.label ?? key}
                    </span>
                    <span className="bar-value">
                      {value.out >= 0.5 && `${money(value.out, currency)} out`}
                      {value.out >= 0.5 && value.in >= 0.5 && <small> · </small>}
                      {value.in >= 0.5 && <span className="is-in">{money(value.in, currency)} in</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/** The stores where the money went, biggest first. */
export function StoreBreakdown({
  report,
  categories,
  currency,
  focus,
  onFocus,
  preview,
  onEdit,
  onOpenStore,
  duplicates,
  onDuplicates,
  merges,
  onMerges,
}: Props & {
  onEdit: () => void;
  onOpenStore: (store: {key: string; name: string}) => void;
  /** Look-alike stores waiting in the duplicates deck. */
  duplicates?: number;
  onDuplicates?: () => void;
  /** How many stores are merged into others or renamed. */
  merges?: number;
  onMerges?: () => void;
}) {
  const [query, setQuery] = useState('');
  const stores = [...report.current.stores.values()]
    .filter(store => store.total >= 0.5)
    .sort((first, second) => second.total - first.total);
  const words = plain(query).split(/\s+/).filter(Boolean);
  const shown = preview
    ? stores.slice(0, preview.limit)
    : stores.filter(store => words.every(word => plain(store.name).includes(word)));
  const max = Math.max(1, ...stores.map(store => store.total));
  return (
    <section className={`card${preview ? ' is-preview' : ''}`}>
      <header className="card-head">
        <h2>{preview ? 'Top stores' : 'Stores'}</h2>
        {!preview && <span className="hint">{stores.length} this period</span>}
        {preview ? (
          stores.length > preview.limit && <SeeAll count={stores.length} noun="stores" onClick={preview.onSeeAll} />
        ) : (
          <span className="card-actions">
            {Boolean(duplicates) && onDuplicates && (
              <button type="button" className="link-button" onClick={onDuplicates}>
                {duplicates === 1 ? '1 possible duplicate' : `${duplicates} possible duplicates`}
              </button>
            )}
            {Boolean(merges) && onMerges && (
              <button type="button" className="link-button" onClick={onMerges}>
                Merged stores ({merges})
              </button>
            )}
            <button type="button" className="link-button" onClick={onEdit}>
              Edit stores
            </button>
          </span>
        )}
      </header>
      {!preview && stores.length > 8 && (
        <input
          className="text-input card-search"
          type="search"
          aria-label="Find a store"
          placeholder="Find a store"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      )}
      {stores.length === 0 ? (
        <p className="empty">No spending in this period.</p>
      ) : shown.length === 0 ? (
        <p className="empty">No store matches.</p>
      ) : (
        <ul className="bars">
          {shown.map(store => {
            const active = focus?.type === 'store' && focus.key === store.key;
            return (
              <li key={store.key} className="bar-item" style={colourStyle(categories.colours[store.category])}>
                <button
                  type="button"
                  className={`bar-row${active ? ' is-active' : ''}${preview ? '' : ' has-trend'}`}
                  aria-pressed={active}
                  onClick={() => onFocus(active ? null : {type: 'store', key: store.key, name: store.name})}
                >
                  <span className="bar-label">
                    <span
                      className="cat-dot"
                      role="img"
                      aria-label={categories.byKey[store.category]?.label}
                      title={categories.byKey[store.category]?.label}
                    />
                    <span className="bar-name">{store.name}</span>
                  </span>
                  {!preview && (
                    <Trend
                      values={report.series.map(item => item.stores.get(store.key)?.total ?? 0)}
                      marked={report.series.findIndex(item => item.period === report.period)}
                    />
                  )}
                  <span className="bar-value">{money(store.total, currency)}</span>
                  <span className="bar-change bar-visits muted">
                    {store.visits === 1 ? '1 payment' : `${store.visits} payments`}
                  </span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{width: `${(store.total / max) * 100}%`}} />
                  </span>
                </button>
                <EditButton
                  label={`Edit ${store.name}: name and category`}
                  onClick={() => onOpenStore({key: store.key, name: store.name})}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The pencil beside a store: opens its name and category. */
export function EditButton({label, onClick}: {label: string; onClick: () => void}) {
  return (
    <button type="button" className="row-edit" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
      </svg>
    </button>
  );
}
