import {useState} from 'react';
import type {Categories} from '../categories';
import {money, parseAmount} from '../format';
import {daysBetween, type Grain, today} from '../periods';
import type {Report} from '../report';
import type {Budgets as BudgetList, CategoryKey} from '../types';

interface Props {
  report: Report;
  grain: Grain;
  categories: Categories;
  budgets: BudgetList;
  currency: string;
  /** Sets a budget, or takes it off (null). Without it the card only shows them (the overview). */
  onSave?: (category: CategoryKey, amount: number | null) => void;
  /** The overview's link to where budgets are set. */
  onEdit?: () => void;
}

/**
 * Monthly budgets per category: what the period spent against each (twelve months' worth for a year), and while the
 * period runs, whether it is on pace: the share of the budget spent against the share of the period gone, marked on
 * the bar. A month or a year only.
 */
export function BudgetCard({report, grain, categories, budgets, currency, onSave, onEdit}: Props) {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  if (grain !== 'month' && grain !== 'year') return null;
  const months = grain === 'year' ? 12 : 1;
  const pace = report.ongoing ? daysBetween(report.from, today()) / daysBetween(report.from, report.to) : 1;
  const items = Object.entries(budgets)
    .filter(([key]) => categories.byKey[key])
    .map(([key, monthly]) => {
      const budget = monthly * months;
      const spent = Math.max(0, report.current.categories.get(key) ?? 0);
      // Spending a tenth faster than the period goes is spending fast.
      const status = spent > budget ? 'over' : report.ongoing && spent > budget * pace * 1.1 ? 'fast' : 'ok';
      return {key, budget, spent, status};
    })
    .sort((first, second) => second.spent / second.budget - first.spent / first.budget);
  if (items.length === 0 && !onSave) return null;
  const spending = categories.alphabetical.filter(item => item.spending);

  function set() {
    const value = parseAmount(amount);
    if (!category || value === null || value <= 0 || !onSave) return;
    onSave(category, value);
    setCategory('');
    setAmount('');
  }

  return (
    <section className="card budgets">
      <header className="card-head">
        <h2>Budgets</h2>
        {items.length > 0 && (
          <>
            <span className="view-total">
              {money(
                items.reduce((sum, item) => sum + item.spent, 0),
                currency,
              )}
            </span>
            <span className="hint">
              of{' '}
              {money(
                items.reduce((sum, item) => sum + item.budget, 0),
                currency,
              )}
              {grain === 'year' ? ' this year (12 months of each budget)' : ' this month'}
            </span>
          </>
        )}
        {onEdit && (
          <button type="button" className="link-button" onClick={onEdit}>
            Edit budgets
          </button>
        )}
      </header>
      {items.length === 0 ? (
        <p className="empty">
          No budget yet: give a category a monthly amount below, and see how each month keeps to it.
        </p>
      ) : (
        <ul>
          {items.map(({key, budget, spent, status}) => {
            const details = categories.byKey[key];
            return (
              <li key={key}>
                <span className="budget-name">
                  <span aria-hidden="true">{details.icon}</span> {details.label}
                </span>
                <span className="budget-figures">
                  {money(spent, currency)} <small>of {money(budget, currency)}</small>
                </span>
                {onSave && (
                  <button
                    type="button"
                    className="link-button budget-remove"
                    aria-label={`Take off the budget of ${details.label}`}
                    onClick={() => onSave(key, null)}
                  >
                    ×
                  </button>
                )}
                <span className="budget-track" aria-hidden="true">
                  <span
                    className={`budget-fill is-${status}`}
                    style={{width: `${Math.min(1, spent / budget) * 100}%`}}
                  />
                  {report.ongoing && <span className="budget-pace" style={{left: `${pace * 100}%`}} />}
                </span>
                <span className={`budget-status is-${status}`}>
                  {status === 'over'
                    ? `${money(spent - budget, currency)} over`
                    : status === 'fast'
                      ? `Spending fast: ${money(budget * pace, currency)} would be on pace by today`
                      : report.ongoing
                        ? `On pace, ${money(budget - spent, currency)} left`
                        : `${money(budget - spent, currency)} under`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {onSave && (
        <form
          className="budget-form"
          onSubmit={event => {
            event.preventDefault();
            set();
          }}
        >
          <select
            className="select"
            aria-label="Category of the budget"
            value={category}
            onChange={event => setCategory(event.target.value)}
          >
            <option value="">Category…</option>
            {spending.map(item => (
              <option key={item.key} value={item.key}>
                {item.icon} {item.label}
                {budgets[item.key] ? ` (${money(budgets[item.key], currency)})` : ''}
              </option>
            ))}
          </select>
          <input
            className="text-input"
            inputMode="decimal"
            aria-label="Monthly budget"
            placeholder={`A month, ${currency}`}
            value={amount}
            onChange={event => setAmount(event.target.value)}
          />
          <button type="submit" className="button" disabled={!category || !amount.trim()}>
            Set
          </button>
        </form>
      )}
    </section>
  );
}
